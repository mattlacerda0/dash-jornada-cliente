# Análise executiva com IA

Camada backend que transforma os payloads oficiais das páginas em fatos estruturados (Etapa 8.2) e, opcionalmente, pede ao Gemini uma leitura executiva em JSON (Etapa 8.3).

O Gemini **não calcula indicadores**, **não consulta banco** e **não inventa valores**. Ele só interpreta `analysis_context`.

```text
Dashboard
   ↓
compute*Payload oficial da página
   ↓
Executive Analysis Engine (analysis_context)
   ↓
executive_candidates (fatos candidatos, sem narrativa)
   ↓
Gemini (prioriza e redige)
   ↓
validação + merge determinístico
   ↓
executive_analysis
   ↓
[FUTURO: modal — não ligado nesta etapa]
```

## Arquitetura

| Camada | Arquivo | Papel |
|---|---|---|
| Catálogo | `netlify/functions/_shared/portal-metric-catalog.mjs` | labels, unidades, status, fontes |
| Registry | `netlify/functions/_shared/portal-metric-registry.mjs` | `payloadPath` auditado no compute oficial |
| Compute | `general-data.mjs`, `meetings.mjs`, `statistical-crosses.mjs` | mesma função da tela |
| Engine | `netlify/functions/_shared/executive-analysis.mjs` | seleciona, normaliza, gera sinais |
| Candidatos | `netlify/functions/_shared/executive-candidates.mjs` | attention/positive/limitation sem narrativa |
| IA | `netlify/functions/_shared/executive-ai.mjs` | prompt + Gemini + validação + merge |
| HTTP | `netlify/functions/ai-analysis.mjs` | POST autenticado |
| Vercel | `api/ai-analysis.js` + rota em `api/quality.js` / `vercel.json` | mesmo padrão das outras APIs |

Funções principais da engine:

- `buildExecutiveAnalysis({ page, filters })` — entrada HTTP.
- `composeExecutiveAnalysis({ pageId, payload, filtersApplied })` — fatia o payload oficial já calculado (sem novo fetch).
- `normalizeAnalysisPage` / `isPilotPage` — IDs do piloto.
- `stripPersonalData` — remove arrays nominais e e-mails.

A engine **não** duplica fórmulas. Cada KPI é `getByPath(payload, registry.payloadPath)` + metadados do catálogo.

## Endpoint

- **Rota:** `POST /api/ai-analysis`
- **Auth:** a mesma corporativa das APIs do portal (`requireCorporateAuth` — sessão Google `@quartavia.com.br`).
- **Local:** `server.py` / `server.ts` / `run_ai_analysis_api.mjs` com `PORTAL_INTERNAL_DATA_RUN=1` (o Python já validou o Bearer).

Request (somente fatos):

```json
{ "page": "meetings", "filters": {} }
```

Request (gerar análise executiva):

```json
{ "page": "meetings", "filters": {}, "generate": true }
```

Sucesso (`generate: true`):

```json
{
  "success": true,
  "page": "meetings",
  "analysis_context": {},
  "executive_analysis": {},
  "metadata": {
    "ai_generated": true,
    "model": "gemini-3.5-flash",
    "generated_at": "..."
  }
}
```

Sem `generate`, a resposta continua só com `analysis_context` e `ai_generated: false` nos fatos.

Página ainda não suportada (HTTP 200, nunca 500):

```json
{
  "success": false,
  "code": "page_not_supported",
  "supported_pages": ["general", "meetings", "statistical-crosses"]
}
```

Página vazia: `code = invalid_page` (HTTP 400).

## Páginas piloto

Somente estas três:

| ID | Tela | Compute oficial | Filtros |
|---|---|---|---|
| `general` | Dados Gerais | `computeGeneralDataPayload()` | não suportados pelo compute → `filters_applied: {}` |
| `meetings` | Reuniões | `computeMeetingsPayload()` | não suportados pelo compute → `filters_applied: {}` |
| `statistical-crosses` | Análises Estatísticas | `computeStatisticalCrossesPayload({ filters })` | reutiliza `options.filters` já existente |

Aliases aceitos para estatísticas: `statistical_crosses`, `sc`, `exploration`, `crossings`, `discoveries`.

## Formato do contexto

```json
{
  "page": "general",
  "title": "Dados Gerais",
  "generated_at": "...",
  "context": { "population": 0, "filtered_population": 0, "coverage": null },
  "kpis": [
    {
      "metric": "active_clients",
      "label": "Clientes ativos",
      "value": 0,
      "unit": "clients",
      "status": "confirmed",
      "source": ["BASE QV · public.clients.status"],
      "coverage": null
    }
  ],
  "signals": [],
  "comparisons": [],
  "limitations": [],
  "metadata": {
    "engine_version": "1",
    "data_generated_at": "...",
    "page": "general",
    "filters_applied": {},
    "ai_generated": false
  }
}
```

Em Análises Estatísticas há `highlights` com no máximo **5** itens por categoria (associações, AUC, diferenças de grupo, descobertas, regras de risco). A curva Kaplan–Meier, a matriz de correlação e as células de cohort **não** entram.

## Sinais determinísticos

Não são IA. Não classificam KPI de negócio como “bom” ou “ruim”.

Limiares em `EXECUTIVE_DISPLAY_HEURISTICS` — **executive display heuristic**, não regra de negócio:

| Código | Condição | Severidade |
|---|---|---|
| `LOW_COVERAGE` | cobertura &lt; 20% | high |
| `MODERATE_COVERAGE` | cobertura 20–50% | medium |
| `SMALL_SAMPLE` | `sample_size` &lt; 30 (e &gt; 0) | medium |
| `METRIC_UNAVAILABLE` | `value = null` | medium |
| `NEEDS_BUSINESS_VALIDATION` | catálogo `needs_business_validation` | medium |

O sinal de amostra pequena **não** afirma que o resultado está errado.

Comparações temporais (`direction = up | down | flat`) usam só séries já presentes no payload (`acquisitionsByMonth`, `meetingsByMonth`). Em Reuniões, meses futuros da série são ignorados (heurística de exibição: mês ISO ≤ mês corrente). A engine **não** interpreta se “up” é positivo.

## Limitações

Incluídas automaticamente quando há cobertura baixa, amostra pequena, fonte parcial (`status = partial` / `executionKind = pending`), `needs_business_validation`, valor ausente, executor pending, aviso do payload oficial, ou histórico insuficiente (&lt; 2 pontos na série).

## Privacidade

O contexto **não** inclui:

- nome, e-mail, telefone, documento, código ou id de cliente;
- arrays `clients`, `topClients`, `auditSample`, `excludedClients`;
- registros brutos.

Somente agregados. E-mails que por acaso apareçam em texto são substituídos por `[redacted-email]`.

## Tamanho

Alvo: **10–20 KB** por página piloto. A engine descarta listas de clientes, curvas KM e matrizes.

## Frontend

`index.html` **não é alterado** nesta etapa. O modal premium da 8.1 permanece com placeholders. PDF e cache não entram.

## Etapa 8.3 — Gemini

Funcionalidade **separada do chatbot**. Não usa o workflow `analytics-jornada-chat-v2`, nem `assistant.mjs`, nem `N8N_CHAT_WEBHOOK_URL`.

### Credencial

- Variável de ambiente no **backend**: `GEMINI_API_KEY` (alias: `GOOGLE_GENERATIVE_AI_API_KEY`).
- Modelo: `GEMINI_MODEL` (padrão `gemini-3.5-flash`, o mesmo do chatbot — só o nome do modelo, não o workflow).
- Temperatura: `0.2`.
- Chamada: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` com `responseMimeType: application/json`.
- A chave **nunca** vai ao navegador, **nunca** é logada, **nunca** é versionada.

Se a chave não existir, `generate: true` devolve `code: "ai_not_configured"` (HTTP 503) e ainda inclui `analysis_context`.

### Papel da IA

Interpretar fatos oficiais para alta liderança: o que mais importa, atenção, sinais positivos, possíveis ações (hipótese), limitações.

### Schema (`executive_analysis`)

```json
{
  "headline": "Uma frase com o principal ponto",
  "executive_summary": "3 a 5 frases curtas.",
  "attention_points": [
    {
      "severity": "critical | attention",
      "title": "...",
      "description": "...",
      "evidence": [{ "metric": "attendance_rate", "value": 85.4, "unit": "percent" }]
    }
  ],
  "positive_signals": [{ "title": "...", "description": "...", "evidence": [] }],
  "recommended_actions": [{ "title": "...", "description": "...", "based_on": ["attendance_rate"] }],
  "limitations": [{ "title": "...", "description": "..." }]
}
```

Limites: 5 pontos de atenção, 3 sinais positivos, 4 ações, 8 limitações. Arrays podem ser vazios quando **não** houver candidato/evidência. Não se força `minItems`.

### Validação (anti-alucinação)

Antes de devolver ao cliente:

1. JSON válido (com extração simples de bloco `{...}` / fence Markdown).
2. Campos conhecidos e `severity` só `critical` | `attention` (outros valores de negócio como `high` viram `attention`; `urgent` é descartado).
3. Máximos das listas.
4. **Números ancorados:** todo número de negócio no texto ou em `evidence.value` precisa existir em `analysis_context`. Ex.: `20%` é rejeitado se o contexto só tem `12%`.
5. Sinais `LOW_COVERAGE` / `SMALL_SAMPLE` / `NEEDS_BUSINESS_VALIDATION` / `METRIC_UNAVAILABLE` exigem limitação reconhecida.
6. Em Análises Estatísticas: proibido causalidade e AUC como “taxa de acerto”.
7. Contexto com PII ou arrays nominais não é enviado ao modelo.

Falha: `code: "ai_generation_failed"` (sem inventar análise fallback).

### Causalidade

Associação, Spearman, AUC, diferença entre grupos, cohort e Kaplan–Meier descrevem coocorrência. Linguagem permitida: “está associado”, “aparece relacionado”, “merece investigação”.

### Erros

| Código | Quando |
|---|---|
| `page_not_supported` | Página fora do piloto |
| `ai_not_configured` | Sem `GEMINI_API_KEY` |
| `ai_generation_failed` | HTTP Gemini, JSON inválido, número inventado, causalidade, limitação ignorada |
| `invalid_page` | `page` vazio |

### Testes

```text
node _etapa82_executive_analysis_tests.mjs
node _etapa83_executive_ai_tests.mjs
node _etapa832_executive_ai_tests.mjs
```

Live Gemini (9 gerações, sequencial) só com intervalo e `EXECUTIVE_AI_LIVE=1`. A suíte mock **não** chama a API.

## Etapa 8.3.2 — Candidatos e estabilidade

Arquitetura interna:

```text
analysis_context → executive_candidates → Gemini → validation → merge → executive_analysis
```

`generation_debug.ignored_candidates` existe só na geração com `includeDebug` (testes/dev). **Não** vai ao HTTP/`index.html`.

### Mapa de direção (piloto, não regra empresarial)

| ID | Semântica |
|---|---|
| `attendance_rate` | higher_is_better |
| `no_show_rate` | lower_is_better |
| `meetings_completed_by_month` | higher_is_contextually_positive |
| `latest_month_acquisitions` | higher_is_contextually_positive |

Só entra métrica com interpretação segura. Queda/alta vira candidato de atenção ou positivo se `|relative_change| ≥ 10` (heurística de exibição).

### Regras de candidato

- **Atenção:** variação temporal desfavorável no mapa; `cancelled_without_confirmed_date > 0`; em estatísticas, topo de associação / AUC / diferença de grupo (e sobrevivência se o fato existir).
- **Positivo:** variação favorável no mapa. Sem candidato → array vazio (não inventar).
- **Limitação (obrigatória no merge):** `LOW_COVERAGE`, `SMALL_SAMPLE`, `NEEDS_BUSINESS_VALIDATION`, `METRIC_UNAVAILABLE`, `MISSING_VALUE`, `INSUFFICIENT_HISTORY`, cobertura NPS &lt; 20% já exposta.
- **Ações:** cada uma com `based_on` ligado a attention/limitation. Sem evidência → `[]`.

### Causalidade (Análises Estatísticas)

O contexto envia `fact_categories`. Regeneração corretiva: **no máximo 1**. Se falhar de novo → `ai_generation_failed` (`causality_forbidden`).

### Retry Gemini

No máximo **2** tentativas extras em 429/503. Backoff progressivo, `Retry-After` se presente (com piso de 4s/8s em 429 para não martelar a API), jitter pequeno. Log: status, tentativa, duração. Sem prompt/chave.

## O que ainda não entra

- Ligar o modal / `index.html`
- PDF
- cache
- demais páginas além do piloto
- alteração de workflows n8n, chatbot v1/v2, `assistant.mjs`

## Testes da engine (8.2)

```text
node _etapa82_executive_analysis_tests.mjs
node _catalog_registry_tests.mjs
```

