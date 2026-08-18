# Auditoria de Métricas — Analytics QuartaVia

**Etapa 2 — somente investigação.** Nenhum arquivo de catálogo, registry, API, frontend, n8n, SQL ou prompt foi alterado. Data da auditoria: 2026-08-17. Branch: `feat/ajustes-analises-estatisticas-final`.

**Método.** Fonte de verdade = código atual (`index.html`, `netlify/functions/*`, `_shared/*`). Regras **não** foram inferidas pelo nome visual. Quando a implementação não foi encontrada, o status é `necessita validação de negócio` (abreviado abaixo como `necessita validação`). Validação de banco: MCP `project-0-analytics_jornada_cliente-supabase` (`project_ref = lacinxsvjdwalkchxyeo`, BASE QV) em **leitura**. Fontes fora da BASE QV **não** foram consultadas em outro MCP.

**Contagem.** Um “elemento analítico” é um KPI/card, gráfico nomeado, heatmap/matriz, ranking, indicador derivado, faixa de percentual, ou tabela cujo conteúdo depende de regra (o grupo tabular conta; colunas de identificação como nome/código não entram na contagem).

---

## Resumo executivo

O portal é um SPA vanilla (`index.html`) alimentado por Netlify Functions. O chatbot tem **três camadas paralelas** que não cobrem o mesmo conjunto: catálogo semântico (114 IDs de métrica), registry executável (sobreposição grande com o catálogo **mais** IDs `sc_*` extras e 10 executores de domínio), motor `portal-query` (valores ao vivo só em **general / meetings / journey**) e allowlist legada `assistant-data.mjs` (~32 IDs, nomes parcialmente diferentes).

| Recorte | Número |
|---|---|
| Telas no menu | 16 |
| Telas navegáveis ativas | 15 |
| Tela desabilitada | 1 (Engajamento) |
| Views HTML órfãs / legado | 3 (`view-performance`, `view-crossings`, `view-exploration`) |
| Elementos analíticos inventariados | **253** |
| IDs no catálogo | 114 |
| IDs no registry (métricas + 10 executores de domínio) | ~120 métricas + 10 domains |
| IDs na allowlist `assistant-data` | 32 |
| Domínios com valor ao vivo em `portal-query` | 3 |

**Status da auditoria (dos 253 elementos):**

| Status | Qtde (aprox.) |
|---|---|
| `confirmado` | 128 |
| `parcialmente confirmado` | 68 |
| `regra inconsistente` | 14 |
| `fonte não encontrada` | 8 |
| `legado/não utilizado` | 16 |
| `necessita validação de negócio` | 19 |

Cobertura estimada do **catálogo** sobre o portal: **~40%** dos elementos. Cobertura de **consulta de valor** pelo chatbot: **~25%** (registry) e **~12%** se o caminho for só `portal-query` (Fase 1). As telas com pior cobertura de chatbot são Engajamento, Indicadores Temporais, Qualidade, Plano Patrimonial, Pesquisa de Satisfação e Uso da Plataforma.

Inconsistências centrais (não corrigidas nesta etapa): rótulo “média” que na prática é **mediana**; NPS da tela Satisfação **não** usa `nps-metrics.mjs`; primeira reunião na Jornada **não** exige comparecimento; Temporais usa `updated_at \|\| created_at` enquanto Atualização Financeira exige `updated_at > created_at`; Plano Patrimonial usa proxy de reunião “Central de Inteligência”; `view-performance` é legado da tela EP atual.

---

## Arquitetura encontrada

### Frontend

- Arquivo único: `index.html` (HTML + CSS + JS inline).
- Servidor local: `server.py` (ponte para as functions).
- Não há `server.ts` nem `run_*_api.mjs` ativos neste recorte.
- Autenticação: Google corporativo (`netlify/functions/_shared/auth.mjs`).

### Backend (Netlify Functions)

| Function | Endpoint aproximado | Tela |
|---|---|---|
| `general-data.mjs` | `/api/general-data` | Dados Gerais + **Renovação** (reuso) |
| `onboarding.mjs` | `/api/onboarding` | Jornada e onboarding |
| `meetings.mjs` | `/api/meetings` | Reuniões |
| `patrimonial-plan.mjs` | `/api/patrimonial-plan` | Plano Patrimonial |
| `mechanisms.mjs` | `/api/mechanisms` | Mecanismos BASE QV |
| `pharus-mechanisms.mjs` | (function própria) | Mecanismos App Pharus |
| `financial-updates.mjs` | `/api/financial-updates` | Atualização Financeira + Qualidade |
| `engagement.mjs` | `/api/engagement` | **Só Qualidade** (tela Engajamento não chama) |
| `platform-usage.mjs` | `/api/platform-usage` | Uso da Plataforma + Qualidade |
| `support.mjs` | `/api/support` | Atendimento |
| `cancellations.mjs` | `/api/cancellations` | Cancelamento |
| `satisfaction.mjs` | `/api/satisfaction` | Pesquisa de Satisfação |
| `temporal-indicators.mjs` | `/api/temporal-indicators` | Indicadores Temporais |
| `ep-performance.mjs` | `/api/ep-performance` | Performance do EP |
| `pharus-ep-meetings.mjs` | (function própria) | Reuniões Pharus no EP |
| `statistical-crosses.mjs` | `/api/statistical-crosses` | Análises Estatísticas |
| `quality.mjs` | `/api/quality` | Qualidade |
| `assistant.mjs` | `/api/assistant` | Chatbot |
| `assistant-data.mjs` | (resolver interno) | Allowlist legada de valor |

### Camadas do chatbot (não alteradas)

1. **Catálogo** — `netlify/functions/_shared/portal-metric-catalog.mjs`  
   114 métricas, aliases, fórmula textual, `executor`, `summaryField`. Intenções: value, definition, formula, average, median, comparison, location, quality, mixed, clarification, general.

2. **Registry** — `netlify/functions/_shared/portal-metric-registry.mjs`  
   Sobreposição com o catálogo, com `payloadPath` no summary do dashboard, **mais** IDs SC que o catálogo não tem (`sc_active_clients`, `sc_renewed_clients`, `sc_cycle1_clients`, `sc_nps_responses`, `sc_top_auc`, e no trecho posterior `sc_median_survival`, `sc_discoveries`, `sc_correlation_matrix`, `sc_cohort`). Executores: `general`, `meetings`, `journey`, `mechanisms`, `pharus_mechanisms`, `support`, `cancellations`, `ep_performance`, `statistical_crosses`, `pharus_ep_meetings`.

3. **Executor** — `metric-executor.mjs`  
   Não recalcula média/mediana: lê o path do registry.

4. **Motor de consulta** — `portal-query.mjs`  
   Comentário explícito: “Fase 1: general, meetings, journey. Demais domínios: pending.”  
   Pending no código: `patrimonial_plan`, `mechanisms`, `financial_updates`, `platform_usage`, `support`, `quality`.  
   **Não aparecem** no mapa de domínio: cancellations, satisfaction, temporal, renewal, EP, statistical_crosses (esses só entram via catalog+registry, não via `portal-query`).

5. **Allowlist paralela** — `assistant-data.mjs`  
   ~32 IDs; compute só `general`, `meetings`, `mechanisms`, `support`. IDs **não idênticos** ao catálogo (`total_meetings` existe aqui e **não** no catálogo).

6. **Match** — `portal-metric-match.mjs` + planejamento via n8n/Gemini em `assistant.mjs`.

### O que já está catalogado vs o que falta vs legado

**Catalogado (114 IDs, por domínio):** general (~17), meetings (~14), journey (~5), mechanisms+pharus (~20), support (~20), ep (~7), statistical_crosses (~8), cancellations (~23).

**Falta no catálogo (telas inteiras ou quase):** Plano Patrimonial, Atualização Financeira, Uso da Plataforma, Engajamento, Pesquisa de Satisfação (CSAT/CES/envios), Renovação (tela), Indicadores Temporais, Qualidade, a maior parte de Análises Estatísticas (Spearman, lift, combinações, KM detalhado, cohort).

**Duplicado:** catálogo ≈ registry (núcleo compartilhado); o registry tem IDs SC extras; `assistant-data` duplica um subconjunto com **outros nomes**. `meeting-types-csv.mjs` ainda existe; o gráfico “Reuniões por tipo” usa `meeting-types-calendly.mjs`.

**Legado:** `view-performance` (substituído por `view-ep`); `view-crossings` stub “Sem dado”; `view-exploration` redireciona para Análises Estatísticas e está `display:none`; tela Engajamento pausada; CSV de tipos de reunião.

**Usado de fato pelo frontend:** tudo o que as `load*` chamam via `/api/*`. Renovação **não** tem endpoint próprio. Engajamento **não** chama `/api/engagement` (só Qualidade chama).

---

## Telas encontradas

Fonte: menu em `index.html` (`data-nav`) e `<section class="view" id="view-*">`.

| # | Menu | `data-nav` | `id` da view | Estado |
|---|---|---|---|---|
| 1 | Dados gerais do cliente | `general` | `view-general` | Ativa |
| 2 | Jornada e onboarding | `journey` | `view-journey` | Ativa |
| 3 | Reuniões | `meetings` | `view-meetings` | Ativa |
| 4 | Plano Patrimonial | `plan` | `view-plan` | Ativa |
| 5 | Implementação de mecanismos | `mechanisms` | `view-mechanisms` | Ativa |
| 6 | Uso da Plataforma | `platform` | `view-platform` | Ativa |
| 7 | Atualização Financeira | `financial` | `view-financial` | Ativa |
| 8 | Engajamento | `engagement` | `view-engagement` | **Desabilitada** (`nav-disabled`). Tooltip: fontes sem dados suficientes/confiáveis. `loadEngagement()` monta payload vazio e exibe “Indicadores de engajamento pausados nesta versão”. **Não** chama `/api/engagement`. |
| 9 | Atendimento | `support` | `view-support` | Ativa. Nome no menu ≠ “Acionamentos”; dados = `research.acionamentos` (Business Data). |
| 10 | Pesquisa de Satisfação | `satisfaction` | `view-satisfaction` | Ativa |
| 11 | Cancelamento (clientes cancelados) | `cancellations` | `view-cancellations` | Ativa |
| 12 | Renovação | `renewal` | `view-renewal` | Ativa. Sem endpoint dedicado; reusa `/api/general-data`. |
| 13 | Performance do Engenheiro Patrimonial | `ep` | `view-ep` | Ativa |
| 14 | Indicadores Temporais | `temporal` | `view-temporal` | Ativa |
| 15 | Análises Estatísticas | `statistical-crosses` | `view-statistical-crosses` | Ativa |
| 16 | Qualidade | `quality` | `view-quality` | Ativa |

**Fora do menu (código atual):**

| View | Estado |
|---|---|
| `view-performance` | Dashboard antigo “Performance” por EP. Sem botão no nav. Legado em relação a `view-ep`. |
| `view-crossings` | Stub “Sem dado / Tela aguardando modelagem”. `display:none`. |
| `view-exploration` | Redireciona clique `exploration` → Análises Estatísticas. `display:none`. |

Lista de referência do pedido vs código: o item “Acionamentos” existe como **Atendimento**; “Performance do Engenheiro Patrimonial” aponta para `view-ep`, não para `view-performance`.

---

## Inventário por tela

Convenção de cada ficha:

- **id sugerido** (kebab interno do inventário; se existir ID de catálogo, é citado).
- **status** = um de: `confirmado` | `parcialmente confirmado` | `regra inconsistente` | `fonte não encontrada` | `legado/não utilizado` | `necessita validação de negócio`.
- Campos omitidos só quando não se aplicam (ex.: gráfico sem numerador).

Joins BASE QV recorrentes: `clients` ⋈ `cancellations` (`client_id`); `client_meetings` ⋈ `meeting_attendance` (via `calendly_event_uri` / vínculo de reunião); `client_mecanismos` ⋈ `mecanismos`; financeiro `client_financial_data.client_id`.

Projeto BASE QV: `lacinxsvjdwalkchxyeo` · schema `public`, salvo indicação em contrário.

---

### Dados Gerais

**Endpoint:** `/api/general-data` · `general-data.mjs` · helper de cancelamento `analytical-cancellation.mjs` · permanência `client-tenure.mjs`.  
**Filtros globais da tela:** busca, status analítico, segmento, EP, faixa de contratação, faixa de cancelamento, faixa de permanência, chip “somente ativos”.  
**Timezone contratação/permanência:** calendário `America/Sao_Paulo`. Assinatura de aquisição: `vw_info_cliente` (timeout no código → fallback `data_inicio_ciclo` → `created_at`).

#### KPIs (`gKpis1` / `gKpis2`)

##### `total_clients` — Total de clientes
- **Tela/seção/tipo:** Dados Gerais · KPIs · card  
- **Descrição / pergunta:** Quantos clientes distintos estão no recorte filtrado?  
- **Regra:** `count(distinct clients.id)` no payload filtrado. **Agregação:** count. **Unidade:** clientes.  
- **Fonte:** BASE QV · `public.clients.id` (uuid) — **validada MCP**.  
- **Endpoint / arquivo:** `/api/general-data` · `computeGeneralDataPayload`.  
- **Filtros:** todos da tela. Nulos: cliente sem id não entra. Dedup: por `id`. Datas: n/a.  
- **População:** carteira filtrada. Num/den: n/a.  
- **Limitações:** depende de filtros; “carteira completa” só com filtros limpos.  
- **Sinônimos / perguntas:** “quantos clientes temos”, “tamanho da carteira”.  
- **Catálogo / registry / assistant-data / portal-query:** sim / sim / sim / **live**.  
- **Status:** `confirmado`

##### `active_clients` — Clientes ativos
- **Regra real:** status analítico `Ativo` = status bruto ativo **e** sem regra consolidada de cancelamento efetivado (`analytical-cancellation.mjs`). Não é simplesmente `clients.status = 'ativo'`.  
- **Fonte:** `clients.status` + `cancellations.churn_efetivado_at` + `distrato_assinado_at` + `distrato` + `clients.data_churn`. Colunas **validadas MCP**.  
- **Catálogo:** sim (texto do catálogo ainda resume “sem churn_efetivado_at e sem distrato_assinado_at”; a união completa inclui `distrato='Assinado'` e `data_churn`).  
- **Status:** `parcialmente confirmado` (implementação confirmada; texto do catálogo incompleto)

##### `frozen_clients` — Clientes congelados
- **Regra:** status analítico `Congelado` e sem efetivação.  
- **Fonte:** `clients.status` + regra de cancelamento.  
- **Status:** `confirmado`

##### `cancelled_clients` — Cancelados confirmados
- **Regra:** efetivados pela união oficial (ver Regras centrais). Exibidos no card como “Cancelados confirmados”.  
- **Status:** `confirmado`

##### `cancelled_without_confirmed_date` — Cancelados sem data confirmada
- **Regra:** efetivado (ex.: `distrato` textual `Assinado`) **sem** data analítica.  
- **Status:** `confirmado`

##### `non_active_clients` — Clientes não ativos
- **Regra:** fora da carteira ativa **sem** cancelamento com data confirmada (congelados + marcados sem data). Tooltip usa `nonActiveComposition`.  
- **Status:** `confirmado`

##### `median_stay_days` — rótulo UI **“Permanência média”**
- **Regra real:** **mediana** (`typicalStayDays` ← `stayDaysStats.median`), não média. Permanência analítica = base cronológica + ajuste +365 se `ciclo >= 2` e base `< 365` (`client-tenure.mjs`). Elegíveis: datas válidas de contratação; cancelado sem data **excluído**.  
- **Unidade:** dias. Agregação: median.  
- **Timezone:** `America/Sao_Paulo` para “hoje”.  
- **Catálogo:** `median_stay_days` (correto). UI: rótulo enganoso.  
- **Status:** `regra inconsistente` (rótulo vs cálculo)

##### `median_liquidity_reserve` — Reserva de liquidez “média”
- **Regra real:** mediana de `client_financial_data.reserva_liquidez` preenchida.  
- **Coluna MCP:** `numeric`.  
- **Status:** `regra inconsistente` (rótulo média / cálculo mediana)

##### `median_last_contribution` — Último aporte “médio”
- **Regra real:** mediana de `ultimo_aporte`.  
- **Status:** `regra inconsistente`

##### `median_monthly_income` — Renda mensal “média”
- **Regra real:** mediana de `ultima_renda_mensal`.  
- **Status:** `regra inconsistente`

##### `clients_with_financial_data` — Clientes com diagnóstico financeiro
- **Regra:** clientes com registro em `client_financial_data`. Percentual sobre carteira filtrada.  
- **Status:** `confirmado`

#### Gráficos

| id sugerido | Nome | Tipo | Regra no código | Fonte | Status |
|---|---|---|---|---|---|
| `chart_status` | Clientes por status | donut | counts de status analítico | clients + cancellations | `confirmado` |
| `chart_segment` | Clientes por segmento | donut | segmentação financeira (APEX/PRIVATE/…) | financial + regras de faixa — **não reimplementar pelo nome** | `parcialmente confirmado` |
| `chart_stay` | Tempo de permanência | barras | faixas da permanência analítica | client-tenure | `confirmado` |
| `chart_engineers` | Engenheiro Patrimonial | barras | `clients.engenheiro_patrimonial` | clients.engenheiro_patrimonial (text, MCP ok) | `confirmado` |
| `chart_financial_profile` | Perfil financeiro | barras | flags imóvel/carro/consórcio/reserva | `possui_imovel`, `possui_carro`, `possui_consorcio`, `reserva_liquidez` | `confirmado` |
| `chart_income` | Distribuição da renda mensal | barras | faixas de `ultima_renda_mensal` | client_financial_data | `confirmado` |
| `chart_liquidity` | Distribuição da reserva | barras | faixas de `reserva_liquidez` | client_financial_data | `confirmado` |
| `acq_monthly` | Evolução mensal da aquisição | série | novos por mês da data oficial de contratação | `vw_info_cliente` **ou** fallback `data_inicio_ciclo`/`created_at` | `parcialmente confirmado` |

`vw_info_cliente` **existe** (MCP views). O fetch de assinatura **pode timeout** — o código cai no fallback. Status da fonte primária: `parcialmente confirmado`.

#### Tabela “Detalhamento dos clientes”
Colunas calculadas: contratação, cancelamento (data analítica), permanência (dias analíticos), status analítico, segmento, EP, renda, aporte, reserva, flags imóvel/carro/consórcio. Exportação usa o recorte filtrado. **Status:** `confirmado` (mesmas regras dos KPIs). Modal/drawer: detalhe do cliente + alertas de qualidade.

#### Segmentos (catálogo)
`apex_clients`, `private_clients`, `principal_clients`, `debts_clients`, `over_clients`, `insufficient_segment_data` — existem no catálogo/registry/assistant-data. **Status:** `parcialmente confirmado` (faixas de corte precisam ser lidas em `general-data.mjs` para cada faixa; não rederivar nesta etapa além de “capacidade financeira no payload”).

---

### Jornada e onboarding

**Endpoint:** `/api/onboarding` · `onboarding.mjs`.  
**Filtros:** busca, status, EP, onboarding concluído/aberto.  
**Catálogo:** `average_days_to_first_meeting`, `average_days_to_plan_delivery`, `average_days_to_first_mechanism`, `average_onboarding_days`, `completed_onboarding_clients`.  
**portal-query:** **live** (domínio `journey`).

**Atenção:** nomes de campo `average*` no payload são **medianas** (`median(...)` em `onboarding.mjs`). A UI rotula “Mediana”. O texto gerado do catálogo (`buildMetricDefinitionText`) ainda diz que a página Jornada exibe **média aritmética** — regra antiga no catálogo.

##### `average_onboarding_days` — Mediana onboarding total
- **Regra:** mediana da coorte única dos quatro prazos: contratação → **primeiro marco** entre 1ª reunião e inclusão financeira. Diferenças negativas excluídas.  
- **Data inicial:** `clients.data_inicio_ciclo` fallback `created_at`.  
- **Data final reunião:** primeira `client_meetings.start_time` — **sem filtro de comparecimento** (diferente da tela Reuniões).  
- **Agregação real:** median. Unidade: dias.  
- **Status:** `regra inconsistente` (catálogo diz average; código/UI = mediana; 1ª reunião sem attendance)

##### `average_days_to_first_meeting` — Mediana até 1ª reunião
- **Regra:** mesma coorte; `start_time` mais cedo. Sem attendance.  
- **Status:** `regra inconsistente` (vs Reuniões / vs texto average do catálogo)

##### `average_days_to_plan_delivery` — Mediana até entrega do plano
- **Regra:** contratação → **primeira** reunião cujo `event_name` contém “central de inteligencia” (proxy, não aprovação formal).  
- **Status:** `parcialmente confirmado` (cálculo claro; negócio do proxy = `necessita validação`)

##### `average_days_to_first_mechanism` — Mediana até 1º mecanismo
- **Regra:** mediana em amostra **independente** com implementação válida em `client_mecanismos` (`implemented_at` / fallbacks `implantado_at` ou `data_implementacao`; se status implementado, `updated_at` depois `created_at`). Negativos excluídos.  
- **Colunas MCP:** `implemented_at`, `status`, `updated_at`, `created_at` existem; `implantado_at` / `data_implementacao` **não** listadas em `client_mecanismos` nesta validação MCP — possível campo legado no código.  
- **Status:** `parcialmente confirmado`

##### `completed_onboarding_clients` — Concluíram onboarding
- **Regra:** Sim se estágio atual fora dos abertos **OU** existe 1ª reunião **OU** existe `client_financial_data`. Denominador: `completionBaseClients`.  
- **Status:** `confirmado`

| id | Gráfico | Regra | Status |
|---|---|---|---|
| `j_chart_first_meeting` | Dias até a primeira reunião | faixas da mesma métrica | `confirmado` |
| `j_chart_plan` | Dias até entrega do plano | faixas proxy Central | `parcialmente confirmado` |
| `j_chart_impl` | Dias até 1º mecanismo | faixas | `confirmado` |
| `j_chart_total` | Tempo total de onboarding | faixas | `confirmado` |
| `j_chart_completion` | Concluiu onboarding | Sim/Não/Sem base | `confirmado` |

Tabela por cliente: prazos individuais + flag concluiu. Pharus (`metrics.events` onboarding) aparece em indicators de qualidade do payload, não como KPI principal da UI. **Status Pharus:** `fonte não encontrada` nesta etapa (App Pharus, outro projeto).

Eyebrow da tela: “BASE QV + App Pharus”. KPIs principais são BASE QV.

---

### Reuniões

**Endpoint:** `/api/meetings` · `meetings.mjs`.  
**Duas fontes distintas:** (1) operacional BASE QV `client_meetings` + `manual_meetings` + `meeting_attendance`; (2) gráfico **Reuniões por tipo** = Business Data `Agendamentos.calendly_eventos` via `meeting-types-calendly.mjs` (fallback n8n). CSV legado: `meeting-types-csv.mjs` ainda no repo.

**Filtros:** busca, status do cliente, EP, período (inclui futuros nos presets “últimos N dias”, convenção UTC documentada em `portal-query.mjs`), presença, frequência, 1ª reunião, has no-show, has remarcação.

**Elegíveis (taxas):** `total − futuras − canceladas`. `attendanceRate = 1 − noShows/eligible`. Intervalo: média dos gaps entre consecutivas **compareceu**.

**Primeira reunião (Reuniões):** mais cedo **passada** com compareceu; fallback `client_implementation_meeting_date`; fallback Airtable (`first-meeting-fallback.mjs`).

**Pré-entrada:** `meetingDateStatus === before_client_entry` / `invalid` saem dos KPIs.

##### `total_meetings` (não está no catálogo; está em `assistant-data` e `portal-query`)
- **UI:** “Total de reuniões”. Frontend **deduplica** por `meetingId` ou `source|startTime|title` ao filtrar; backend usa `analyticMeetings`.  
- **Fonte:** `client_meetings.id`, `manual_meetings.id` — **MCP ok**.  
- **Status:** `confirmado` no dashboard; catálogo: **ausente** (`Falta catálogo`)

##### `avg_meetings_per_month` — Média de reuniões/mês
- **Não é média por cliente.**  
- **UI (código `index.html`):** se período filtrado ativo → `totalMeetings / periodMonthDivisor`; senão → `total / monthsSpan(primeira, última datada)`.  
- **Backend `meetings.mjs` (payload cru):** `analyticMeetings.length / monthsBetween(first, last)` — **não** usa o divisor de período da UI.  
- **Unidade:** reuniões/mês.  
- **Catálogo:** não.  
- **Status:** `regra inconsistente` (UI vs payload backend)

##### `days_since_latest_meeting` — Dias desde a última reunião
- **Regra (tooltip UI):** hoje − MAXDATE de reunião válida do recorte (não mediana como número principal). Nota mostra mediana **por cliente** e média. Futuras/canceladas/inválidas/pré-entrada não definem MAXDATE.  
- **Status:** `confirmado`

##### `average_interval_between_meetings` — Intervalo médio
- **Regra (tooltip):** média aritmética dos intervalos **positivos** entre reuniões válidas consecutivas com presença confirmada. Nota também mostra **mediana**. Catálogo existe.  
- **Status:** `confirmado`

##### `no_show_meetings` / taxa
- **No-show:** `meeting_attendance.status` = não compareceu, reunião já ocorrida e não cancelada.  
- **Coluna MCP:** `meeting_attendance.status` text; `remarcado` boolean.  
- **Catálogo:** `no_show_rate`, `attendance_rate`, `cancelled_meetings_count`. Não há `total_meetings`.  
- **Status:** `confirmado`

##### `total_meeting_reschedules` — Remarcações
- **Regra:** `meeting_attendance.remarcado` (cobertura incompleta — tooltip de cobertura na UI).  
- **Status:** `parcialmente confirmado`

##### `clients_with_meeting`
- Clientes com ≥1 reunião válida no recorte.  
- **Status:** `confirmado`

| id | Gráfico | Fonte | Status |
|---|---|---|---|
| `m_chart_month` | Reuniões por mês | BASE QV agendadas vs `compareceu` | `confirmado` |
| `m_chart_status` | Status das reuniões | attendance consolidada | `confirmado` |
| `m_chart_freq` | Frequência por cliente | count reuniões | `confirmado` |
| `m_chart_days` | Dias desde última | recência por cliente | `confirmado` |
| `m_chart_interval` | Intervalo médio | gaps compareceu | `confirmado` |
| `m_chart_noshow_freq` | Frequência de no-show | faixas por cliente | `confirmado` |
| `top_meeting_types` | **Reuniões por tipo** | **Business Data Calendly**, exclui `group_name` comercial; distinct `event_uuid`; inclui canceladas e futuras; tipo = `event_type_name` ?? `event_name`; consolidação `meeting-event-type.mjs` | `parcialmente confirmado` (código claro; fonte **não validada no MCP BASE QV**) |
| `m_chart_ep` | Reuniões por EP | BASE QV volume por EP do cliente | `confirmado` |

Catálogo `top_meeting_types` **já descreve Calendly/Business Data** (não CSV). CSV permanece como arquivo legado.

Tabela: total, média/mês **por cliente**, última, dias, intervalo, no-shows, remarcações, canceladas, 1ª reunião. **Status:** `confirmado` com a ressalva da média/mês portfolio vs linha.

`first_meeting_airtable_fallback` catalogado. **Status:** `parcialmente confirmado` (fonte Airtable/bkp fora da BASE QV).

---

### Plano Patrimonial

**Endpoint:** `/api/patrimonial-plan` · `patrimonial-plan.mjs`.  
**portal-query:** `pending`. **Catálogo:** não.  
**Proxy oficial no UI:** reuniões cujo `event_name` contém “central de inteligencia”. QV360/Pharus zerados no handler (comentários de fonte).

##### `plan_baseqv_clients` — Clientes BASE QV
- distinct `clients.id`. **Status:** `confirmado`

##### `plan_delivered` — Plano entregue
- **Regra real:** **contagem de reuniões** Central, **não** clientes. Nota UI: “Reuniões Central de Inteligência”.  
- **Status:** `confirmado` (e `necessita validação` se o negócio esperava clientes)

##### `plan_approved` — Plano aprovado
- **Regra real:** **clientes distintos** com ≥1 reunião Central. Nota: “proxy, não aprovação formal”.  
- **Status:** `parcialmente confirmado`

##### `plan_days_to_approval` — Dias até aprovação
- Proxy: diferença **não negativa** contratação → **última** reunião Central.  
- **Status:** `parcialmente confirmado`

##### `plan_revisions` — Planos revisados
- Revisões = reuniões extras; clientes com mais de uma reunião Central.  
- **Status:** `parcialmente confirmado`

Gráficos: “Clientes na base”; “Status do plano” (entrega/revisão). Tabela: flags entregue/aprovado, dias, revisões. Filtros: busca, fonte, entregue, aprovado.

**Status geral da tela para o chatbot:** `Falta catálogo` + `Falta endpoint` no `portal-query`.

---

### Implementação de mecanismos

**Endpoint:** `/api/mechanisms` + Pharus `pharus-mechanisms.mjs`.  
**Catálogo:** amplo (cobertura, andamento, tipos, pharus_*). **portal-query:** `pending` (definição via catálogo; valor via **registry** compute).  
**Unidades (explainer UI):** cliente · tipo (`mecanismos`) · vínculo (`client_id`+`mecanismo_id` após dedup). **% implementado usa vínculos como denominador.**

Tabelas MCP: `mecanismos`, `client_mecanismos.status`, `implemented_at` — **existem**. `mecanismos` listada com 0 rows no MCP (possível RLS; existência ok).

Filtros QV: status cliente, segmento, EP, status vínculo, tipo, mercado, faixa qtd, período impl, has impl, recent 30d, faixa %.

##### Indicadores BASE QV (família catalogada)
`clients_with_mechanisms`, `types_used`, `catalog_mechanisms`, `most_used_mechanism`, `types_unused`, `available_mechanisms`, `implemented_mechanisms`, `in_progress_mechanisms`, `eligible_mechanisms`, `implementation_rate`, `median_days_to_first_implementation`, `average_days_to_first_implementation`, `clients_with_recent_implementation`, `clients_with_exactly_one_*`.

- **implementation_rate:** implementados / **vínculos** (não tipos).  
- **Tempo até 1ª:** mediana e média catalogadas; UI precisa ser lida nos blocos Cobertura/Andamento/Tempo (`kKpisCoverage`, `kKpisProgress`, `kKpisTime`).  
- **Status:** `confirmado` para a regra de unidades; detalhes de cada card do bloco = `parcialmente confirmado` se o rótulo exato não foi transcrito card a card nesta auditoria (cálculo compartilhado no payload).

##### KPI consolidado QV + Pharus
- Modos: `deduplicated` (união pessoas), `partial`, ou **soma bruta** (`gross_sum`) que pode duplicar pessoa. Match: ID, CPF, e-mail, telefone, nome.  
- **Fonte Pharus:** outro projeto (`core` / `user_mechanisms` / suggested). **Não validada MCP BASE QV.**  
- **Status:** `parcialmente confirmado`

##### Pharus (`pharus_users_with_suggestions`, `pharus_total_suggestions`, `pharus_top_suggested_mechanism`)
- Suggested tratado como vínculo. Não misturar com implementação QV.  
- **Status:** `parcialmente confirmado`

Gráficos QV: status vínculos; qtd por cliente; cobertura catálogo; utilização por tipo; impl por mês; tempo até 1ª; dias desde última; por segmento; por EP; tabela EP. Pharus: qtd por usuário, motor, categoria, risco, mais vinculados; duas tabelas (catálogo e vínculos).

---

### Uso da Plataforma

**Endpoint:** `/api/platform-usage` · fonte **App Pharus `metrics.events`**.  
**Catálogo / portal-query:** não / pending.  
**MCP BASE QV:** não se aplica.

##### KPIs
| Nome UI | Regra no código | Status |
|---|---|---|
| Usuários App Pharus | distinct `user_id` em metadata de `metrics.events` | `parcialmente confirmado` |
| Realizaram login | usuários com histórico de login | `parcialmente confirmado` |
| Número total de logins | count eventos `event_name` de login | `parcialmente confirmado` |
| Média de logins por mês | por usuário desde o primeiro acesso (**não** assumir média da carteira) | `parcialmente confirmado` |
| Dias desde o último acesso | **mediana** (rótulo não diz média) | `confirmado` no frontend |
| Tempo médio entre acessos | nota: **mediana** · dias distintos | `regra inconsistente` (rótulo média) |
| Tempo médio de sessão | **Sem Dados** — sem base confiável | `fonte não encontrada` |

Gráficos: login sim/não; recência; logins/mês; disponibilidade por banco. Tabela por usuário.

---

### Atualização Financeira

**Endpoint:** `/api/financial-updates`. **Regra documentada no código:** `isUpdated = updated_at > created_at`. Criação inicial **não** conta. Sem histórico de eventos: total = clientes com registro alterado após criação.  
**Colunas MCP:** `created_at`, `updated_at` timestamptz — **ok**.  
**Catálogo:** não. **portal-query:** pending.

| Nome UI | Regra | Status |
|---|---|---|
| Clientes com dados financeiros | ≥1 linha `client_financial_data` | `confirmado` |
| Clientes com registro alterado após a criação | `updated_at > created_at` | `confirmado` |
| Atualizados nos últimos 30 dias | update válido nos últimos 30 dias | `confirmado` |
| Recência média da atualização | **mediana** de dias desde update válido; nota mostra média | `regra inconsistente` (rótulo) |
| Clientes com dados desatualizados | update válido há > 90 dias | `confirmado` |

Gráficos: recência; atualizações por mês (clientes distintos com update válido no mês); cobertura de campos; por EP.

**Divergência com Temporais:** Temporais conta atualização com `updated_at || created_at` (UI note “updated_at ou created_at”). **Status:** `regra inconsistente` entre telas.

---

### Engajamento

Tela **desabilitada** e `loadEngagement()` **não busca API**. Payload vazio: summary `{}`, clients `[]`. UI existente (não alimentada): KPIs, gráficos fonte/pesquisa/volume/limites, tabela.

`/api/engagement` existe e é chamado **somente na Qualidade** para matriz de viabilidade.

**Status de todos os indicadores da tela:** `legado/não utilizado` (UI morta nesta versão). Backend `engagement.mjs` = `parcialmente confirmado` como código existindo, **não usado pela tela**.

---

### Atendimento

**Endpoint:** `/api/support` · Business Data `research.acionamentos` + views `v_acionamentos_tratados`, `v_acionamentos_qualidade_email`. **Não é BASE QV.**  
**Catálogo + registry + assistant-data:** sim. **portal-query:** **pending** (valor pode sair pelo registry/assistant-data, não pelo motor Fase 1).

Filtros: busca, período abertura, área, tipo, prioridade, solicitante, status, identificação.

| Nome UI | Campo citado no código | Catálogo | Status |
|---|---|---|---|
| Total de acionamentos | tickets no recorte | `total_support_tickets` | `parcialmente confirmado` |
| Acionamentos urgentes | prioridade urgente | `urgent_support_tickets` | `parcialmente confirmado` |
| Clientes identificados | `baseqv_client_id` na view tratada; e-mails `@quartavia.com.br` não contam como cliente | `identified_support_clients` | `parcialmente confirmado` |
| Acionamentos com cliente identificado | tickets com match | `tickets_with_identified_client` | `parcialmente confirmado` |
| Área com mais acionamentos | `area_setor` | `top_support_area` | `parcialmente confirmado` |
| Tipo mais frequente | `tipo_solicitacao` | `top_support_type` | `parcialmente confirmado` |

Identificação extra (catálogo): cobertura, unidentified, from description, corporate email, multiple clients, unmatched emails, needs reprocessing, top clients/requesters, without area/type, monthly evolution, open/resolved/resolution_rate/median_resolution_time.

**Gráfico status:** oculto se diversidade insuficiente.  
**Natureza (strip):** suporte, bugs, urgentes, sem área/tipo/descrição/cliente.  
Série mensal desde mai/2026.

Fonte **não validada** no MCP BASE QV. Status de fonte: `fonte não encontrada` no sentido desta etapa (projeto Research/Business Data).

---

### Pesquisa de Satisfação

**Endpoint:** `/api/satisfaction` · `nps_responses`, `csat_responses`, `nps_sends`, `clients.programa`.  
**Tabelas/colunas MCP:** existem (`score` int, `tipo_de_forms`, `submitted_at` em nps **não usado** nesta tela — usa `created_at`).  
**Não importa `nps-metrics.mjs`.**

##### NPS (índice do card)
- **Regra:** `calcNps` sobre **todas** as respostas com score válido (0–10), após dedupe por `typeform_response_id`/`id`. **Não** é última por cliente. Promotor ≥9, neutro 7–8, detrator ≤6. Índice = %P − %D (**não média**).  
- **Helper oficial** (`nps-metrics.mjs`): última válida por `client_id` (`submitted_at` depois `created_at`); skip `tipo_de_forms` que não começa com NPS.  
- **Status:** `regra inconsistente` vs helper / vs Análises Estatísticas / vs EP

##### Outros KPIs
| Nome | Regra | Status |
|---|---|---|
| Data do NPS | `created_at` da última linha global | `confirmado` |
| Respostas de NPS | count após dedupe | `confirmado` |
| Último NPS | score da última linha global (não por cliente) | `confirmado` |
| CSAT médio | média de `csat_responses.score` com `tipo_de_forms` contendo “csat”; notas >5 truncadas para 5 | `confirmado` |
| CSAT satisfeitos | nota **igual a 5** / respostas CSAT | `confirmado` |
| CES | Sem dado — sem campo | `fonte não encontrada` |
| Clientes com feedback | NPS ou CSAT vinculado | `confirmado` |

Gráficos: classificação NPS; CSAT 5 vs 1–4; NPS mensal por `created_at`.  
**Catálogo:** não tem NPS/CSAT da tela (só `sc_nps` / `ep_nps` em outros contextos).

---

### Cancelamento

**Endpoint:** `/api/cancellations` · `analytical-cancellation.mjs` + `cancellation-process.mjs` + `cancellation-reason-category.mjs`.  
**Catálogo:** conjunto grande. **portal-query:** domínio **não mapeado** (valor via registry).  
**Filtro arquivado padrão:** Não. Arquivados fora dos indicadores atuais.

##### Processo (cards primários)
| id catálogo / UI | Regra real | Status |
|---|---|---|
| `total_cancellations` / Cancelamentos efetivados | União distinta `client_id`: churn_efetivado_at **OU** distrato_assinado_at **OU** `distrato === 'Assinado'` (match exato normalizado, **não** includes) **OU** `clients.data_churn`. Ignora `archived_at`. | `confirmado` |
| Ativos com intenção/pedido | Ativo analítico + intenção/pedido **sem** efetivação | `confirmado` |
| Intenções/pedidos | `data_pedido` OU `intencao_registrada_at` OU status de processo. **Não efetivam.** | `confirmado` |
| `clients_in_cancellation_process` | Intenção/pedido sem efetivação | `confirmado` |

Data analítica prioridade: (1) `churn_efetivado_at` (2) `distrato_assinado_at` (3) `clients.data_churn` (4) Assinado textual sem data → efetivado `hasConfirmedDate=false`.

`data_pedido` e `intencao_registrada_at`: **operacionais**, não efetivam. MCP: `data_pedido` é **text** (não date) — parser flexível BR/ISO.

Sobreposição: mesmo cliente pode entrar em mais de um card. Etapa exclusiva (gráfico): efetivado > pedido > intenção.

##### Timing / retenção / ops
| UI / catálogo | Regra | Status |
|---|---|---|
| Tempo médio do processo | **média** dos dias entrada (pedido; fallback intenção) → hoje, em processo, não arquivado, intervalos ≥0 | `confirmado` |
| `typical_days_in_cancellation_process` | catálogo: típico/mediana — **verificar se o card da UI é média** (acima é mean). | `regra inconsistente` se o catálogo promete mediana |
| `cancellation_passed_retention` | `passou_retencao = true` (boolean MCP) — **não** implica retido | `confirmado` |
| Retidos | desfecho de retenção | `parcialmente confirmado` (campo `desfecho`) |
| Cancelados após retenção | passou retenção **e** efetivado | `confirmado` |
| Críticos | `is_critical` | `confirmado` |
| Sem responsável / sem tratativa / arquivados | campos operacionais | `confirmado` |
| `cancellation_intention_to_order_rate` / `_to_effective_rate` | conversões do funil | `confirmado` no catálogo; UI funil | `parcialmente confirmado` |
| `median_order_to_effective_days` | mediana pedido → data analítica | `confirmado` |
| `median_days_to_cancellation` | mediana contratação → cancelamento | `confirmado` |
| `average_days_to_cancellation` | média | `confirmado` |
| `median_meetings_before_cancellation` | count compareceu ≤ data cancel | `confirmado` |
| `median_days_since_financial_update_before_cancellation` | `updated_at > created_at` | `confirmado` |
| `median_days_without_interaction_before_cancellation` | última compareceu | `confirmado` |
| motivos / categorias | texto `motivo` + categorias analíticas | `confirmado` |
| `cancellation_distrato_signed_without_date` | Assinado textual sem `distrato_assinado_at` | `confirmado` |

`cancellation_statuses` existe (MCP); gráfico processo usa status da tabela / nome do processo. **0 rows no MCP** (RLS/volume) — existência ok.

Gráficos: processo (status ou segmento), funil, etapa exclusiva, estágio, motivos, intenções vs efetivados **12 meses** (séries independentes ≠ taxa), efetivados por EP e segmento.

---

### Renovação

**Sem function própria.** `buildRenewalPayload` em `index.html` a partir de `general-data` + `client-cycle-renewal.mjs`.  
**Campo:** `clients.ciclo` (integer, MCP ok).  
**Regra:** `hasRenewed = ciclo > 1`; `renewalCount = max(ciclo-1, 0)`; `ciclo` null/≤0 inválido (não renovado).  
**Catálogo:** não há domínio `renewal` (exceto SC / permanência com ciclo).

| UI | Regra | Status |
|---|---|---|
| Renovaram | count `ciclo > 1` | `confirmado` |
| Quantidade de renovações | soma `(ciclo-1)` | `confirmado` |
| Maior ciclo atual | max `ciclo` | `confirmado` |
| Tempo até renovação | Sem dado | `fonte não encontrada` |
| Renovou no prazo? | Sem dado | `fonte não encontrada` |
| Valor da renovação | Sem dado (`valor_total_pago` **não** é valor de renovação) | `fonte não encontrada` |

Tabela: colunas “Tempo até renovação / Renovou no prazo / Valor” sem cálculo. Gráficos: renovou sim/não; qtde; por EP.

---

### Performance do Engenheiro Patrimonial (`view-ep`)

**Endpoint:** `/api/ep-performance` + opcional Pharus `pharus-ep-meetings`.  
**Catálogo:** `ep_clients_by_advisor`, `ep_meeting_coverage`, `ep_clients_without_meeting`, `ep_cancelled_share`, `ep_nps`, `ep_pharus_meetings`, `ep_small_samples`.  
**NPS:** helper `nps-metrics.mjs`; mínimos `NPS_MIN_RESPONSES_PER_EP = 5`, `NPS_MIN_COVERAGE_PCT = 20`.  
**Filtros:** multi-EP, status, segmento, contratação, período reunião, período NPS, somente carteira, has reunião/mecanismo/NPS.

KPIs de resumo (render EP): engenheiros com carteira; clientes; ativos; congelados; cancelados confirmados; cancelados sem data; cobertura de reuniões; (bloco) total de renovações / EP com mais renovações — **ciclo**.

**Status:** `parcialmente confirmado` (catálogo cobre uma fração dos cards/tabelas/heatmaps da página). Rankings e matrizes por EP = `necessita validação` para cada célula se o chatbot for responder número sem path de registry.

**Legado `view-performance`:** KPIs/gráficos próprios (churn por EP, reuniões, mecanismos, “indicadores sem dado” NPS/resposta/renovação). Não está no menu. **Status:** `legado/não utilizado`.

---

### Indicadores Temporais

**Endpoint:** `/api/temporal-indicators`. **Catálogo:** não.  
Fontes mistas: App Pharus logins + BASE QV reuniões/impl/financeiro/NPS.

| KPI UI | Regra na UI | Status |
|---|---|---|
| Clientes/usuários | BASE QV + usuários Pharus | `parcialmente confirmado` |
| Logins | `metrics.events` | não validado MCP QV |
| Reuniões | BASE QV deduplicada | `parcialmente confirmado` |
| Implementações | `client_mecanismos` | `parcialmente confirmado` |
| Atualizações financeiras | **updated_at ou created_at** | `regra inconsistente` vs tela Financeiro |
| NPS | count `nps_responses` | `parcialmente confirmado` (pode ser média de score no temporal — `necessita validação` se o chatbot chamar de “NPS”) |
| Interações | Sem dado | `fonte não encontrada` |
| Dias sem atividade | **média** do mês mais recente | `confirmado` (é média, não mediana) |

Tabela recência: dias desde login / reunião / implementação / financeiro / NPS.  
Sinais pré-cancelamento (0–30 / 31–60 / 61–90 vs baseline 91–180).  
Clientes **ativos** com sinais.  
**Status da lógica de sinais:** `parcialmente confirmado` (existe em `temporal-indicators.mjs`; regras de cada sinal não foram transcritas uma a uma — `necessita validação` para interpretação de negócio).

---

### Análises Estatísticas

**Endpoint:** `/api/statistical-crosses` + `_shared/stats-tests.mjs`, `correlation-matrix.mjs`, `cohort-retention.mjs`, `sc-axis-matrices.mjs`, `statistical-discoveries.mjs`, `sc-exploratory-ext.mjs`, `sc-client-insights.mjs`.  
**Nada disso é “tabela de banco”:** Spearman, AUC, lift, KM, etc. são **derivados**. Fontes = variáveis (reuniões, ciclo, NPS, renda, mecanismos, permanência cronológica…).

**População padrão do filtro UI:** `active_cancelled` (ativos + cancelados efetivados).  
**Ajustes de amostra no código:** `MIN_GROUP = 30`, `MIN_AUC = 30`, `MIN_KM_GROUP = 20`, `MIN_CHURN_EVENTS = 20`, `MIN_DESCRIPTIVE = 5`. UI default `minCoverage=30`, `minSample=5` — o backend pode usar 30 quando o filtro não prevalece: **possível divergência filtro UI vs inferência**.

**Permanência em KM/cohort:** **sem** ajuste +365 (`client-tenure` documenta isso).

**NPS preditivo:** helper oficial; **exclui NPS pós-cancelamento**. Índice ≠ média.

**Renovação no card:** `ciclo > 1`; nota: inclui congelados no card (não o filtro padrão ativos+cancelados).

**Catálogo `sc_*`:** `sc_top_association`, `sc_meetings_vs_cancel`, `sc_segment_cancel`, `sc_income_diff`, `sc_survival`, `sc_nps`, `sc_excluded_variables`, `sc_confirmed_cancellations` (+ registry extra: `sc_median_survival`, `sc_discoveries`, `sc_correlation_matrix`, `sc_cohort` — **registry > catálogo** neste ponto).

| Cálculo | Arquivo | População / regra | Status |
|---|---|---|---|
| Spearman / Pearson | `correlation-matrix.mjs` | pares completos; diagonal 1; missing = drop pair | `confirmado` como método; variáveis = `parcialmente` |
| AUC ajustada | `stats-tests.mjs` `rocAuc`; reporta `max(AUC, 1−AUC)` | n mínimos; constante → skip | `confirmado` (derivado) |
| Diferença padronizada | matrizes eixo | ativo vs cancelado; sinal: + maior em cancelados | `confirmado` |
| Lift | extensão exploratória | `necessita validação` (detalhe do denominador da regra específica) | |
| Combinações / regras | `statistical-discoveries` / insights | textos determinísticos; cobertura/amostra mínimos; **não causalidade** | `parcialmente confirmado` |
| Kaplan–Meier | survival no payload | evento = efetivado **com data**; censura = cutoff SP; nStart | `confirmado` |
| Mediana de sobrevivência | tempo em que S(t)=0,5 | pode não existir | `confirmado` |
| Cohort | `cohort-retention.mjs` | mês/trimestre de contratação; idade em meses; futuro = vazio; retenção se cancel mês > N | `confirmado` |
| Ranking preditivo univariado | AUC | não é modelo completo | `confirmado` |
| Matriz comparativa | eixos cancelamento / NPS / renovação / permanência / grupos | `parcialmente confirmado` |
| PDF export | `scExportReport` | artefato, não métrica | n/a |

Filtros da tela afetam **toda** a análise (contratação, cancelamento, status, segmento, EP, reunião, NPS, classe NPS, renovação, financeiro, mecanismo, cobertura mínima, amostra mínima).

**Chatbot:** conhece 8–12 IDs `sc_*`; não consulta valor de uma célula Spearman específica.

---

### Qualidade

**Endpoint:** `/api/quality` (+ puxa financial, engagement, platform para matrizes).  
**Catálogo / portal-query:** não / pending.

KPIs: linhas analisadas (soma das linhas por coluna filtrada), colunas auditadas, valores preenchidos, completude geral (% células).  
**Nota UI:** “Linhas analisadas*” / “Completude geral*” — asterisco de metodologia.

15 matrizes de **viabilidade** (não são os valores do dashboard; dizem se o indicador “tem dado”). Completude por coluna: nulos/vazios vs linhas da tabela.

**Status:** `confirmado` como completude; `legado` se alguém perguntar “qualidade = NPS”. Fonte: Backup BASE QV `public`.

---

### Filtros, tooltips, modais, exportação (todas as telas)

- **Filtros:** listados por tela acima; em geral aplicam-se a KPIs **e** gráficos, **exceto** notas explícitas (Cancelamento: cards primários “outras etapas”; filtro de etapa foca tabela/gráficos detalhados).  
- **Tooltips:** muitos repetem a regra oficial (permanência mediana, comparecimento, proxy Central, unidades de mecanismos, etapas de cancelamento). São documentação de UI, não segunda fonte.  
- **Drawer/modal:** detalhe do cliente/ticket; não introduz métrica nova além de campos brutos + warnings.  
- **Export CSV/PNG/PDF:** herda o recorte filtrado da tela; PDF de Análises Estatísticas exporta o recorte atual.

---

## Regras centrais encontradas

### Cancelamento

Implementação: `analytical-cancellation.mjs`.

- **Efetivado:** união distinta de `client_id` com (A) `cancellations` não arquivado: `churn_efetivado_at` **ou** `distrato_assinado_at` **ou** `distrato` textual exatamente `assinado` após normalização (rejeita “não assinado” / pendente / aguardando) **ou** (B) `clients.data_churn`.  
- **Intenção / pedido:** `intencao_registrada_at`, `data_pedido`, status de processo — **não** tiram da carteira ativa.  
- **Data:** prioridade churn → distrato_at → data_churn → Assinado sem data (efetivado sem data). Parser: ISO, timestamp, **DD/MM/YYYY** (não MM/DD).  
- **Status analítico de cliente:** Ativo / Congelado / Cancelado / Não informado (`normalizeClientStatus`). Cancelado analítico pode vir do texto de `clients.status` **ou** da regra de efetivação.

### Permanência

`client-tenure.mjs`.

- **Início:** data de contratação (hire; na prática `data_inicio_ciclo` / fallback `created_at` nos callers).  
- **Fim:** se cancelado com data válida → data analítica de cancelamento; se cancelado **sem** data → **excluído**; senão → hoje `America/Sao_Paulo`.  
- **Futuro / negativo / inválido:** excluído.  
- **Ajuste renovação (só indicador analítico):** se `ciclo >= 2` e base `< 365` → base+365. **Não** entra em Kaplan–Meier nem cohort.

### Renovação

`client-cycle-renewal.mjs`: `hasRenewed = currentCycle > 1`; `renewalCount = max(ciclo-1, 0)`. Única fonte: `clients.ciclo`. Sem histórico de eventos de renovação.

### NPS

| Contexto | Fonte | Dedup | Nota válida | Índice |
|---|---|---|---|---|
| Helper `nps-metrics.mjs` | `nps_responses` | última por `client_id` (`submitted_at` desc, `created_at`) | 0–10; skip tipo não-NPS | %P−%D |
| Tela Satisfação | `nps_responses` | por `typeform_response_id`/`id`; **todas** as scores | 0–10; sem filtro prefixo NPS | %P−%D em **todas** as respostas |
| Temporais | nps_responses | contar respostas / recência | **não** chamar isso de índice NPS sem ler o campo | |
| EP / SC | helper | última; SC exclui pós-churn no preditivo | 0–10 | índice; EP esconde se n<5 ou cobertura<20% |

Promotor ≥9, neutro 7–8, detrator ≤6. **NPS ≠ média da nota.**

### Reuniões

- Operacional: QV `client_meetings` + `manual_meetings` + `meeting_attendance`.  
- Tipos (um gráfico): Calendly Business Data; exclui grupo comercial; distinct `event_uuid`; inclui canceladas e futuras.  
- Dedup operacional (UI filtrada): `meetingId` ou chave composta.  
- No-show / compareceu / cancelada / remarcada (`remarcado`) / futuras.  
- Média/mês **do card:** volume / meses (período ou span) — **não** média por cliente.  
- 1ª reunião: ver divergência Jornada vs Reuniões.

### Atualização financeira

**Tela Financeiro e catálogo de cancelamento pré-churn:** `updated_at > created_at`.  
**Temporais:** `updated_at || created_at`.

---

## Fontes de dados

### BASE QV — validadas via MCP (existência)

**Projeto:** `lacinxsvjdwalkchxyeo` · `https://lacinxsvjdwalkchxyeo.supabase.co` · schema `public`.

**Tabelas usadas pelo portal e confirmadas:**  
`clients`, `cancellations`, `cancellation_statuses`, `client_meetings`, `manual_meetings`, `meeting_attendance`, `client_implementation_meeting_date`, `client_financial_data`, `client_mecanismos`, `mecanismos`, `client_journeys`, `nps_responses`, `nps_sends`, `csat_responses`, `form_responses`, `form_answers`, `cycle_change_requests`, `freeze_change_requests`, `tasks`.

**Views confirmadas:**  
`vw_info_cliente`, `vw_clients_ciclo_churn`, `vw_clients_com_data_entrada`, `vw_clientes_status_simples`, `vw_funil_cancelamentos`, `ltv_metricas_canonicas`, `crm_lead_registros`, `crm_leads_list`.

**Colunas-chave confirmadas (tipo):**  
`clients.id` uuid, `status` text, `ciclo` int, `data_inicio_ciclo` date, `data_churn` date, `engenheiro_patrimonial` text, `created_at` timestamptz;  
`cancellations.churn_efetivado_at`, `distrato_assinado_at` timestamptz, `distrato` text, `data_pedido` **text**, `intencao_registrada_at` timestamptz, `archived_at`, `passou_retencao` bool, `motivo` text, `is_critical` bool;  
`client_meetings.event_name`, `start_time`; `meeting_attendance.status`, `remarcado`;  
`client_financial_data.ultima_renda_mensal`, `ultimo_aporte`, `reserva_liquidez`, `updated_at`, `created_at`;  
`nps_responses.score` int, `tipo_de_forms`, `submitted_at`, `client_id`.

**Caveat MCP:** `list_tables` mostrou row counts baixos (ex.: 5 `clients`) junto com 6735 `client_meetings`. Tratar como **existência de schema**, não volume de produção (RLS da role MCP).

### Fontes **não** validadas nesta etapa (código aponta, MCP QV não consulta)

| Fonte | Onde o código usa | Status auditoria |
|---|---|---|
| Business Data `Agendamentos.calendly_eventos` | Reuniões por tipo | não validada |
| Business Data `research.acionamentos` + views | Atendimento | não validada |
| App Pharus `metrics.events`, `core.*`, mecanismos suggested | Plataforma, mecanismos Pharus, jornada Pharus, temporais logins, EP Pharus | não validada |
| Airtable bkp | fallback 1ª reunião | não validada |
| CSV `filtered-event-data-from-20250731-to-20260730.csv` | helper legado tipos | legado |
| QV360 | eyebrow Engajamento / plano (zerado) | não validada / zerada |

---

## Comparação Frontend x Backend x Chatbot

Legenda **Situação:** Completa · Falta catálogo · Falta regra · Falta endpoint · Frontend legado · Backend não utilizado · Inconsistente · Allowlist paralela.

Seleção representativa (não é a lista de 253 linhas; a matriz completa seria o inventário acima × 5 colunas).

| Métrica | Frontend | Backend | Catálogo | Registry | Assistant (`assistant-data`) | portal-query | Situação |
|---|---|---|---|---|---|---|---|
| Total de clientes | sim | sim | sim | sim | sim | live | Completa |
| Ativos / congelados / cancelados | sim | sim | sim | sim | sim | live | Completa (texto catálogo ativos incompleto) |
| Permanência “média” | sim (mediana) | mediana | `median_stay_days` | sim | não | live via general | Inconsistente (rótulo) |
| Reserva/renda/aporte “médios” | mediana | mediana | median_* | sim | não | — | Inconsistente (rótulo) |
| Segmentos APEX… | sim | sim | sim | sim | sim | live | Completa |
| Total de reuniões | sim | sim | **não** | não (id) | **sim** | live `total_meetings` | Allowlist paralela / Falta catálogo |
| Média reuniões/mês | sim (divisor período) | span first-last | não | não | não | — | Inconsistente + Falta catálogo |
| Taxa comparecimento / no-show | sim | sim | sim | sim | taxa sim / total no-show sim | live | Completa |
| Tipos de reunião | Calendly | Calendly + CSV legado | `top_meeting_types` Calendly | sim | não | — | Completa no catálogo; CSV legado |
| Medianas jornada | sim | median (campo average*) | ids average_* | sim | não | live | Inconsistente (nome/texto catálogo) |
| 1ª reunião (jornada vs reuniões) | duas regras | duas regras | parcial | parcial | não | journey live | Inconsistente |
| Plano entregue/aprovado | proxy | proxy | não | não | não | pending | Falta catálogo |
| Mecanismos QV | sim | sim | sim | sim | subset | pending | Falta endpoint query; valor via registry |
| Mecanismos Pharus | sim | sim | 3 ids | sim | não | — | Parcial |
| Financeiro `updated_at > created_at` | sim | sim | não | não | não | pending | Falta catálogo |
| Engajamento | pausado | API existe | não | não | não | — | Frontend legado + Backend não utilizado pela tela |
| Plataforma logins | sim | Pharus | não | não | não | pending | Falta catálogo |
| Atendimento | sim | Research | sim | sim | sim | pending | Falta endpoint query |
| NPS tela Satisfação | todas as respostas | próprio | não | não | não | — | Falta catálogo + Inconsistente vs helper |
| CSAT / CES | CSAT sim / CES vazio | sim / null | não | não | não | — | Falta catálogo |
| Cancelamento efetivado | sim | sim | sim | sim | não | **não mapeado** | Completa via registry; Falta portal-query |
| Renovação ciclo | sim | via general | não (tela) | não | não | — | Falta catálogo |
| Tempo/valor renovação | Sem dado | — | — | — | — | — | Falta regra / fonte |
| EP performance | sim | sim | 7 ids | sim | não | — | Falta catálogo (maioria dos cards) |
| Temporais / sinais | sim | sim | não | não | não | — | Falta catálogo |
| SC Spearman/AUC/KM/cohort | sim | sim | 8 ids | + alguns | não | — | Falta catálogo na maior parte |
| Qualidade completude | sim | sim | não | não | não | pending | Falta catálogo |
| `view-performance` | HTML | consome apis | não | não | não | — | Frontend legado |

---

## Gaps do chatbot

### A. Métricas que o chatbot já conhece corretamente

(Definição alinhada ao código do dashboard, com caveats menores de texto)

- Carteira: total, ativos (conceito), congelados, cancelados, sem data, não ativos.  
- Permanência **mediana** (id `median_stay_days`, não o rótulo da UI).  
- Medianas financeiras de renda/aporte/reserva (ids median_*).  
- Presença: taxa comparecimento, no-show, canceladas, intervalo, remarcações, clientes com reunião, tipos Calendly (definição).  
- Onboarding: conclusão; prazos **se** o planner usar mediana (o código do dashboard é mediana).  
- Mecanismos QV (unidades cliente/tipo/vínculo) e 3 Pharus.  
- Atendimento (definições; valor via registry/assistant-data).  
- Cancelamento efetivado, processo, funil, motivos, retenção “passou”, timings catalogados.  
- Subconjunto EP e `sc_*`.

### B. Métricas existentes no portal que não estão no catálogo

- `total_meetings` (só allowlist / portal-query).  
- Média de reuniões/mês (card).  
- Dias desde a última reunião (MAXDATE do card).  
- Toda a tela Plano Patrimonial.  
- Toda Atualização Financeira.  
- Toda Uso da Plataforma (exceto se reusar Pharus meetings EP).  
- Engajamento.  
- NPS/CSAT/CES/envios da Satisfação.  
- Tela Renovação (renovaram, qtde, max ciclo) — SC tem renovação analítica, não a tela.  
- Indicadores Temporais e sinais.  
- Qualidade (completude / matrizes).  
- Quase toda Análises Estatísticas além de 8–12 ids.  
- Heatmaps/tabelas EP além dos 7 ids.

### C. Métricas que estão no catálogo mas com regra antiga

- Texto `buildMetricDefinitionText`: Jornada = “média aritmética” — o backend usa **mediana**.  
- `active_clients` formula string incompleta vs união completa de efetivação.  
- Campos journey `average_*` no id vs mediana real.  
- CSV vs Calendly: **catálogo já atualizado** para Calendly; arquivo CSV é que é legado.  
- `typical_days_in_cancellation_process` (mediana no catálogo) vs card “Tempo médio do processo” (mean na UI).

### D. Métricas que possuem valor no backend mas não podem ser consultadas pelo chatbot

- Qualquer métrica **fora** do catálogo (executor recusa ID desconhecido).  
- Domínios `portal-query` pending: mesmo com catálogo, o motor Fase 1 devolve pending (support, mechanisms, quality, plan, financial, platform) — o **executor/registry ainda calcula** se o fluxo `assistant.mjs` for por `executeMetricQuery`. Há **dois caminhos**; support catalogado pode falhar no query e funcionar no registry.  
- Financeiro, plataforma, satisfação, temporais, qualidade, plano: backend existe, **sem** ID.  
- Engajamento: backend existe, tela não usa; chatbot não tem ID.

### E. Métricas com fonte/regra ambígua

- “Média de reuniões/mês”: UI divisor de período vs backend span.  
- “Permanência média” / “reserva média”: mediana.  
- NPS: três implementações.  
- 1ª reunião: jornada (qualquer `start_time`) vs reuniões (compareceu + fallbacks).  
- Plano entregue (reuniões) vs aprovado (clientes).  
- Atualização financeira vs temporais.  
- Consolidado mecanismos QV+Pharus (soma bruta vs união).  
- Permanência analítica (+365) vs KM/cohort (sem +365).  
- Aquisição: `vw_info_cliente` vs fallback.

### F. Telas com cobertura ruim no chatbot

| Tela | Métricas ~ | Cobertas no catálogo ~ | Cobertura estimada | Principais gaps |
|---|---|---|---|---|
| Dados Gerais | 19 | 16 | **alta (~85%)** | Rótulos média/mediana; aquisição `vw_info_cliente` |
| Jornada | 10 | 5 | **média (~50%)** | Texto average; 1ª reunião; Pharus stages |
| Reuniões | 16 | 10 | **média-alta (~60%)** | Total; média/mês; MAXDATE; Calendly valor |
| Plano Patrimonial | 7 | 0 | **~0%** | Tela inteira |
| Mecanismos | 30 | 20 | **média (~65%)** | Query pending; consolidado cruzado; todos os gráficos |
| Uso da Plataforma | 11 | 0 | **~0%** | Fonte Pharus |
| Atualização Financeira | 9 | 0 | **~0%** | `updated_at > created_at` |
| Engajamento | 4 | 0 | **0% (tela morta)** | Pausada |
| Atendimento | 25 | 20 | **média-alta (~70%)** | Query pending; strip natureza; gráficos |
| Pesquisa de Satisfação | 11 | 0 | **~0%** | NPS próprio; CSAT; CES |
| Cancelamento | 20 | 18 | **alta (~80%)** | Query não mapeado; card mean vs median catálogo |
| Renovação | 9 | 0 | **~10%** (só via SC/ciclo indireto) | Tela; 3 “Sem dado” |
| Performance EP | 16 | 7 | **baixa (~40%)** | Rankings, heatmaps, Pharus extra |
| Indicadores Temporais | 18 | 0 | **~0%** | Sinais; regra financeiro |
| Análises Estatísticas | 22 | 8 | **baixa (~35%)** | Spearman, lift, regras, KM detalhado, cohort (parcial no registry) |
| Qualidade | 19 | 0 | **~0%** | Completude / viabilidade |

**Cobertura geral aproximada do catálogo: 40%.**  
**Consulta de valor confiável alinhada à UI: ~25% (registry) / ~12% (`portal-query` only).**

**5 maiores gaps**

1. Telas Financeiro + Temporais (regra de atualização divergente e zero catálogo).  
2. Pesquisa de Satisfação (NPS/CSAT fora do helper oficial).  
3. Plano Patrimonial (proxy Central sem ID).  
4. Uso da Plataforma + Engajamento (Pharus / tela morta).  
5. Análises Estatísticas além dos `sc_*` (o usuário vai perguntar Spearman/AUC/KM e o catálogo quase não verbaliza valor).

**Pior cobertura:** Engajamento, Qualidade, Plano, Satisfação, Plataforma, Temporais, Renovação.

---

## Inconsistências encontradas

1. UI “Permanência média”, “Reserva média”, “Aporte médio”, “Renda média” = **medianas**.  
2. Jornada: payload `average*` + catálogo “média” = **mediana** no compute.  
3. Card “Tempo médio entre acessos” (plataforma) = mediana na nota.  
4. Card recência financeira “média” = mediana.  
5. Média reuniões/mês: UI com divisor de período vs backend `monthsBetween(first,last)`.  
6. 1ª reunião: Jornada sem attendance vs Reuniões com compareceu + fallbacks.  
7. NPS Satisfação (todas as respostas, `created_at`) vs `nps-metrics` (última por cliente, `submitted_at`, filtro tipo NPS).  
8. Financeiro `updated_at > created_at` vs Temporais `updated_at || created_at`.  
9. `planDelivered` = reuniões; `planApproved` = clientes.  
10. Catálogo `active_clients` formula incompleta vs união de efetivação.  
11. `portal-query` pending support/mechanisms enquanto catálogo+registry calculam.  
12. `assistant-data` IDs ≠ catálogo (`total_meetings` etc.).  
13. Registry tem `sc_cohort` / `sc_correlation_matrix` sem par no objeto `portalMetricCatalog` (catálogo termina em cancelamento).  
14. `view-performance` vs `view-ep`.  
15. Permanência +365 vs KM/cohort sem ajuste (intencional no código; risco se o chatbot misturar).  
16. MCP `implantado_at` / `data_implementacao` citados no tooltip de jornada **não** apareceram nas colunas de `client_mecanismos`.

---

## Itens que precisam de validação humana

1. Proxy “Central de Inteligência” pode ser chamado de “plano entregue/aprovado”?  
2. Permanência com +365 para renovados: o negócio confirma para todos os cards “permanência” e **não** para sobrevivência?  
3. NPS da Satisfação deve unificar com `nps-metrics` (última por cliente)?  
4. Média reuniões/mês: divisor do filtro ou span histórico? Por cliente vs carteira?  
5. Segmentação financeira (cortes APEX/PRIVATE/…): dono da regra.  
6. Coorte jornada: exigir comparecimento na 1ª reunião?  
7. Soma bruta QV+Pharus vs pessoas únicas.  
8. `data_pedido` como **text** no banco: qualidade das datas.  
9. Sinais temporais: regras de negócio vs heurística.  
10. Três colunas de renovação “Sem dado”: haverá fonte futura?  
11. Engajamento: a tela volta ou some do menu?  
12. CES: existe em Typeform/`raw_payload` não parseado?  
13. Volume real vs row counts MCP (RLS).  
14. `vw_info_cliente` como data oficial de contratação vs fallback.

---

## Recomendações para a Etapa 3

**Não executar agora** — só recomendações, sem alteração.

1. **Uma fonte de IDs.** Fundir `assistant-data.mjs` no catálogo (incluir `total_meetings`) ou deprecar a allowlist.  
2. **Estender `portal-query`** para os executores que o registry já tem (cancellations, mechanisms, support, ep, sc) antes de inventar SQL novo.  
3. **Novos IDs (prioridade):** financeiro (`financial_updated_clients`, regra `updated_at > created_at`), NPS/CSAT da tela Satisfação (**com caveat da regra atual**), renovação (`renewed_clients`, `total_renewals`), plano (`plan_meetings_ci`, `plan_clients_ci`), média reuniões/mês **documentando a fórmula da UI**.  
4. **Corrigir textos do catálogo** (jornada = mediana; ativos = união completa; permanência = não chamar de média). Não mudar cálculo sem autorização.  
5. **Anotação de fonte externa** (Calendly, Research, Pharus) no catálogo para o chatbot não responder “está na BASE QV”.  
6. **SC:** adicionar ao catálogo os IDs que já estão no registry (`sc_cohort`, `sc_correlation_matrix`, `sc_median_survival`, `sc_discoveries`) e deixar explícito que AUC/Spearman são derivados.  
7. **Não ligar a tela Engajamento** no chatbot até haver fonte.  
8. **Testes de contrato:** para cada ID, valor do executor = valor do card da UI com os mesmos filtros. Começar por Dados Gerais, Reuniões (exceto média/mês até unificar), Cancelamento.  
9. **Somente depois** alinhar n8n/prompts à Etapa 3 — **não nesta etapa**.

---

## Apêndice — lista de IDs do catálogo atual (114)

`total_clients`, `active_clients`, `active_or_frozen_clients`, `cancelled_clients`, `frozen_clients`, `cancelled_without_confirmed_date`, `non_active_clients`, `median_stay_days`, `median_liquidity_reserve`, `median_last_contribution`, `median_monthly_income`, `clients_with_financial_data`, `apex_clients`, `private_clients`, `principal_clients`, `debts_clients`, `over_clients`, `insufficient_segment_data`, `clients_with_first_meeting`, `clients_with_meeting`, `attendance_rate`, `no_show_rate`, `cancelled_meetings_count`, `top_meeting_types`, `average_interval_between_meetings`, `total_meeting_reschedules`, `clients_with_zero_noshows`, `clients_with_1_2_noshows`, `clients_with_5_plus_noshows`, `first_meeting_airtable_fallback`, `average_days_to_first_meeting`, `average_days_to_plan_delivery`, `average_days_to_first_mechanism`, `average_onboarding_days`, `completed_onboarding_clients`, `clients_with_mechanisms`, `combined_people_with_mechanisms`, `types_used`, `catalog_mechanisms`, `most_used_mechanism`, `types_unused`, `available_mechanisms`, `implemented_mechanisms`, `in_progress_mechanisms`, `eligible_mechanisms`, `implementation_rate`, `median_days_to_first_implementation`, `average_days_to_first_implementation`, `clients_with_recent_implementation`, `clients_with_exactly_one_available_mechanism`, `clients_with_exactly_one_implemented_mechanism`, `clients_with_exactly_one_in_progress_mechanism`, `pharus_users_with_suggestions`, `pharus_total_suggestions`, `pharus_top_suggested_mechanism`, `total_support_tickets`, `open_support_tickets`, `urgent_support_tickets`, `resolved_support_tickets`, `resolution_rate`, `median_resolution_time`, `identified_support_clients`, `tickets_with_identified_client`, `support_identification_coverage`, `unidentified_support_clients`, `support_identified_from_description`, `support_corporate_email_tickets`, `support_multiple_clients_tickets`, `support_unmatched_emails`, `support_needs_reprocessing`, `top_support_clients`, `top_support_area`, `top_support_type`, `top_support_requesters`, `support_without_area`, `support_without_type`, `support_monthly_evolution`, `ep_clients_by_advisor`, `ep_meeting_coverage`, `ep_clients_without_meeting`, `ep_cancelled_share`, `ep_nps`, `ep_pharus_meetings`, `ep_small_samples`, `sc_top_association`, `sc_meetings_vs_cancel`, `sc_segment_cancel`, `sc_income_diff`, `sc_survival`, `sc_nps`, `sc_excluded_variables`, `sc_confirmed_cancellations`, `total_cancellations`, `clients_in_cancellation_process`, `typical_days_in_cancellation_process`, `cancellation_intentions`, `cancellation_orders`, `cancellation_intention_to_order_rate`, `cancellation_intention_to_effective_rate`, `cancellation_passed_retention`, `cancellation_distrato_signed_without_date`, `median_order_to_effective_days`, `cancellations_with_reason`, `cancellations_without_reason`, `median_days_to_cancellation`, `average_days_to_cancellation`, `median_meetings_before_cancellation`, `median_days_since_financial_update_before_cancellation`, `median_days_without_interaction_before_cancellation`, `top_cancellation_reason`, `top_cancellation_reason_category`, `cancellations_by_inactivity`, `cancellations_by_financial`, `cancellations_by_non_renewal`.

---

*Fim da Etapa 2. Nenhuma correção aplicada. Etapa 3 aguarda autorização explícita.*

---

# Etapa 3 — Consolidação do catálogo

Data: 2026-08-17. A auditoria da Etapa 2 **não foi apagada**. Nenhuma regra de negócio ambígua foi unificada. Workflow n8n e `portal-query.mjs` **não** foram alterados. Nenhum comando Git foi executado. MCP `project-0-analytics_jornada_cliente-supabase` usado só para `list_tables` (leitura). Nenhuma mutation no Backup Base QV (`lacinxsvjdwalkchxyeo`).

## O que foi consolidado

- `portal-metric-catalog.mjs` passou a ser a fonte semântica oficial (definição, status, aliases, limitações, `executionKind`).
- `portal-metric-registry.mjs` passou a ligar métricas executáveis aos `compute*Payload` existentes, com `executionKind`.
- IDs legados resolvem para o canônico (`resolveCanonicalMetricId`) em catálogo e registry, sem duas definições independentes.
- `assistant-data.mjs` reutiliza label/sources/definição do catálogo quando o ID existe; a allowlist de extractors permanece por compatibilidade com n8n.
- Textos corrigidos só onde a auditoria já tinha a regra central (ativos/efetivação completa; jornada `average*` = mediana; permanência analítica ≠ KM/cohort).
- Cancelamento: efetivado vs intenção/pedido vs data oficial vs status analítico documentados; `data_pedido` / `intencao_registrada_at` **não** entram como efetivado.

## IDs criados (catálogo)

Cobertura das telas que faltavam + IDs que já existiam só no registry/`assistant-data`:

`total_meetings`, `no_show_meetings`, `eligible_meetings`, `future_meetings`, `attended_meetings`, `average_meetings_per_month`, `days_since_latest_meeting`, `chronological_stay_days`, `plan_baseqv_clients`, `plan_delivered_meetings`, `plan_approved_clients`, `plan_days_to_approval`, `financial_clients_with_data`, `financial_post_creation_updates`, `financial_updated_last_30_days`, `financial_median_days_since_update`, `financial_outdated_over_90_days`, `platform_pharus_users`, `platform_users_with_login`, `platform_session_duration`, `satisfaction_nps_index`, `nps_official_index`, `satisfaction_csat_average`, `satisfaction_ces`, `renewed_clients`, `total_renewals`, `max_current_cycle`, `renewal_time_to_renew`, `renewal_on_time`, `renewal_value`, `temporal_total_subjects`, `temporal_financial_updates`, `temporal_active_with_signals`, `temporal_interactions`, `quality_overall_completeness`, `quality_column_fill`, `engagement_paused`, `sc_auc`, `sc_standardized_diff`, `sc_lift`, `sc_active_clients`, `sc_renewed_clients`, `sc_cycle1_clients`, `sc_nps_responses`, `sc_top_auc`, `sc_median_survival`, `sc_discoveries`, `sc_correlation_matrix`, `sc_cohort`, `cancellation_process_by_status`.

## IDs legados (mapeamento, sem definição duplicada)

| Legado | Canônico |
| --- | --- |
| `cancelled_meetings` | `cancelled_meetings_count` |
| `rescheduled_meetings` | `total_meeting_reschedules` |
| `sc_kaplan_meier` | `sc_survival` |
| `sc_spearman` | `sc_correlation_matrix` |
| `sc_cohort_retention` | `sc_cohort` |

`portal-query.mjs` ainda usa os IDs legados internamente (Etapa 4). O catálogo/registry resolvem para o canônico.

## Aliases

- ~639 frases (aliases + questions) em português.
- Alias duplicado pré-existente (`clientes cancelados` em Dados Gerais vs Cancelamento) foi desambiguado: a frase fica em `cancelled_clients`; a tela de Cancelamento usa `cancelamentos efetivados` / `total de cancelamentos`.

## Métricas ainda pendentes (sem executor confiável)

Plano Patrimonial (`plan_*`), Uso da Plataforma (`platform_pharus_users`, `platform_users_with_login`), Satisfação (`satisfaction_nps_index`, `satisfaction_csat_average`), Qualidade (`quality_overall_completeness`). Os handlers dessas telas **não exportam** `compute*Payload`; não foi criado executor falso.

Knowledge-only: CES, sessão “Sem Dados”, colunas “Sem dado” de renovação, interações temporais, permanência cronológica (explicação vs `median_stay_days`), AUC/Lift/diferença padronizada como conceito, Engajamento desabilitado.

## Inconsistências não resolvidas (ainda validação humana)

As 14+ da Etapa 2 seguem abertas. Nesta etapa apenas classificadas (`needs_business_validation` ou limitações):

1. Rótulo UI “média” vs mediana (permanência, renda, reserva, aporte, recência financeira, plataforma).
2. Jornada: payload `average*` = mediana.
3. Média de reuniões/mês: divisor da UI vs `monthsBetween` do backend.
4. 1ª reunião: Jornada sem attendance vs Reuniões com comparecimento.
5. NPS Satisfação (todas as notas / `created_at`) vs helper `nps-metrics.mjs`.
6. Financeiro `updated_at > created_at` vs Temporais `updated_at || created_at`.
7. Plano entregue = reuniões vs aprovado = clientes (proxy Central).
8. Tempo típico em processo de cancelamento (payload mediana vs possível rótulo média).
9. Fonte Calendly vs CSV legado (definição = implementação atual; sem migração).
10. Lift exploratório sem denominador verbalizado com segurança.

## Cobertura após a mudança

| | Etapa 2 | Etapa 3 |
| --- | ---: | ---: |
| IDs no catálogo | 114 | 164 |
| Telas com pelo menos uma métrica | ~8 no catálogo | 16 páginas (15 ativas + Engajamento legado) |
| Live em `portal-query` | general, meetings, journey | **igual** (não expandido) |

Registry: 139 entradas executáveis (`live` 42, `dashboard_payload` 83, `derived` 14). Catálogo ainda tem `pending` 9 e `knowledge_only` 13 que não entram no registry.

## Testes

- `_catalog_registry_tests.mjs`: 14/14.
- `_semantic_tests.mjs`: 10/10 (não quebrado pela consolidação).

## Arquivos alterados

- `netlify/functions/_shared/portal-metric-catalog.mjs`
- `netlify/functions/_shared/portal-metric-registry.mjs`
- `netlify/functions/assistant-data.mjs`
- `_catalog_registry_tests.mjs` (novo)
- `docs/chatbot-metric-audit.md` (somente esta seção)

Não alterados: `index.html`, n8n, `portal-query.mjs`, banco, dashboards.

---

# Etapa 4 — Expansão dos executores

Data: 2026-08-17. Sem alteração de n8n, Gemini, dashboard UI ou banco. Nenhum comando Git. Backup Base QV somente leitura (execução via `compute*Payload` já existentes; MCP não foi usado para mutação).

## Domínios adicionados no `portal-query`

Antes: só `general`, `meetings`, `journey` (os demais `pending`).

Agora, via **registry → compute\*Payload da tela** (sem reimplementar regra):

| Domínio | Executor | Fonte |
| --- | --- | --- |
| `mechanisms` | `computeMechanismsPayload` | BASE QV `client_mecanismos` |
| `financial_updates` | `computeFinancialUpdatesPayload` | `client_financial_data` (`updated_at > created_at` para atualização real) |
| `renewal` | `computeGeneralDataPayload` | `clients.ciclo` |
| `support` | `computeSupportPayload` | research / acionamentos |
| `cancellations` | `computeCancellationsPayload` | `cancellations` |
| `ep_performance` / `satisfaction` (NPS oficial) | `computeEpPerformancePayload` | helper `nps-metrics.mjs` |
| `statistical_crosses` | payload estatístico existente | derivado |
| `temporal` | `computeTemporalIndicatorsPayload` | indicadores temporais (conflito financeiro **não unificado**) |

Continuam `pending` no portal-query: `patrimonial_plan`, `platform_usage`, `quality` (handlers **sem** `compute*Payload` exportado).

`live` permanece só general / meetings / journey. Os novos são `dashboard_payload` (ou `derived`).

## Métricas que passaram a ter execução

Novos IDs canônicos (catálogo + registry):

- Renovação: `non_renewed_clients` (ciclo = 1), `renewal_rate` (descritivo `ciclo>1` / `ciclo≥1`). Já executáveis: `renewed_clients`, `total_renewals`, `max_current_cycle`.
- NPS oficial: `nps_official_index`, `nps_official_responses`, `nps_official_promoters`, `nps_official_passives`, `nps_official_detractors`, `nps_official_coverage` — **helper `nps-metrics.mjs` via payload EP**, não a tela Pesquisa de Satisfação.

Já tinham registry e agora também saem do `pending` do portal-query: mecanismos, financeiro (`updated_at > created_at`), support, cancelamento, temporais, cruzamentos.

## Knowledge-only / pending (sem valor atual)

Plano Patrimonial (`plan_*`), Uso da Plataforma, CSAT da tela Satisfação, CES, Qualidade, Engajamento, colunas “Sem dado” de renovação, interações temporais, permanência cronológica (só explicação vs `median_stay_days`), AUC/Lift/diferença padronizada como conceito.

## Bloqueadas por validação (não criamos executor oficial)

`satisfaction_nps_index`, `sc_lift`. As demais NBV que **já** tinham payload (`average_meetings_per_month`, `top_meeting_types`, `average_days_to_first_meeting`, `typical_days_in_cancellation_process`, `temporal_financial_updates`) continuam executando a implementação atual **com warning**, sem unificar regra.

## Compatibilidade

IDs legados seguem resolvendo. `assistant-data.mjs` tenta registry/executor canônico e mantém extractors n8n como fallback. SQL/`raw_sql` no plano continua rejeitado.

## Cobertura

| | Etapa 3 | Etapa 4 |
| --- | ---: | ---: |
| IDs catálogo | 164 | 171 |
| Registry executável | 139 | **147** |
| `live` | 42 | 42 |
| `dashboard_payload` | 83 | **91** |
| `derived` (registry) | 14 | 14 |
| knowledge/pending no catálogo | 13 + 9 | 12 + 9 |

## Limitações

- Chatbot e dashboard compartilham o mesmo `compute*Payload`; filtros genéricos não foram inventados.
- Renovação não usa `ciclo` como preditor de análises cujo desfecho é renovação.
- Atualização real ≠ indicadores temporais (`updated_at \|\| created_at`).
- Qualidade / plano / plataforma exigem exportar `compute*` numa etapa futura sem mudar o dashboard.

## Testes

- `_catalog_registry_tests.mjs`: 14/14
- `_etapa4_execution_tests.mjs`: 20/20
- `_semantic_tests.mjs`: 10/10

---

# Etapa 5 — Integração n8n com catálogo oficial

Data: 2026-08-17. Backup Base QV (`lacinxsvjdwalkchxyeo`) **somente leitura**. Nenhum comando Git. **Nenhuma alteração publicada no workflow n8n remoto.**

## Arquitetura anterior

```text
Frontend → /api/assistant
  → planSemanticQuery (parcial)
  → se falhasse: n8n mode=plan com metric_catalog inteiro + portal_registry + node “Catálogo de Conhecimento”
  → Gemini escolhia métrica / podia receber 164+ regras
  → executeMetricQuery / executePortalQuery
  → n8n mode=answer verbalizava
```

O node n8n **Catálogo de Conhecimento** repetia regras (permanência, segmento DEBTS/APEX, reuniões, mecanismos, financeiro, atendimento, qualidade) **desatualizadas** em relação a `portal-metric-catalog.mjs`. A ferramenta **Consultar Métrica do Portal** estava desabilitada e apontava para um túnel Cloudflare + allowlist de IDs antigos.

O fallback `portal-query` ainda podia cair em `total_clients` por regex genérica (`/client/`).

## Arquitetura nova

```text
USUÁRIO → Frontend → /api/assistant
  1. Etapa semântica: planSemanticQuery (catálogo + aliases + página + conversa)
  2. Se confidence < 0.8 ou ambíguo → clarification (sem executar valor)
  3. Etapa de execução: registry → executor → compute*Payload
  4. n8n / Gemini só verbaliza query_result / metric_rule
```

Gemini **não** recebe o catálogo completo, **não** gera SQL e **não** escolhe tabela. Números oficiais vêm só do backend. Se o modelo disser “aproximadamente” ou trocar o número, `sanitizeVerbalizedAnswer` substitui pela verbalização local.

## Nodes do workflow

| Antes | Depois (proposta local `analytics-jornada-chat-v2.json`) |
| --- | --- |
| Webhook Chat (`analytics-jornada-chat`) | Webhook Chat (`analytics-jornada-chat-v2`, inativo) |
| Validar e Normalizar Entrada | Mantido; aceita `query_plan`, `query_result`, `portal_context`, `conversation_context` |
| **Catálogo de Conhecimento** (regras hardcoded) | **Instruções do Assistente** (princípios gerais, sem métricas) |
| Agente Analytics Jornada + Gemini + Memória | Mantidos; prompt curto; modos `plan` / `answer` / `rule` |
| Montar Resposta | Mantido + guardrail de número oficial |
| Responder ao Frontend | Mantido |
| Consultar Métrica do Portal (**disabled**) | Continua **disabled** |

**Decisão da ferramenta:** permanece desabilitada. O backend já envia `query_result`; reativá-la duplicaria execução e reintroduziria allowlist. Se no futuro for religada, deve usar ID canônico em `/api/assistant-data` — não a lista antiga.

**Memória:** `memoryBufferWindow` por `sessionId` (10 turnos) — preservada.

**Gemini:** `models/gemini-3.5-flash`, temperature 0.2 — verbalizador.

A proposta local **não substitui** o webhook de produção. O remoto continua `analytics-jornada-chat` até autorização explícita.

## Catálogo hardcoded

Removido como fonte de verdade. O JSON v2 **não** contém o bloco “CATÁLOGO INICIAL”, regras DEBTS/APEX, SQL sugerido nem dezenas de definições. O n8n não possui segunda cópia das 164+ métricas.

## Endpoints

Reaproveitados (nenhum `/api/assistant/catalog` novo):

| Endpoint | Papel |
| --- | --- |
| `POST /api/assistant` | Planner local + executor + chamada n8n só para verbalizar |
| `POST /api/assistant-data` | Resolver interno legado (token); **não** usado pelo v2 enquanto a tool estiver off |
| Catálogo / registry | `portal-metric-catalog.mjs`, `portal-metric-registry.mjs` |
| Execução | `metric-executor.mjs` → `compute*Payload` das telas |

`listMetricsForPlannerSlice({ currentPage, lastMetric })` existe caso um fallback de `plan` no n8n seja necessário no futuro; o assistente **não** envia o catálogo inteiro.

## Fallback

- n8n fora: verbalização local (`verbalizeMetricResult`).
- métrica não resolvida / `confidence < 0.8`: esclarecimento; **proibido** cair em `total_clients`.
- `executionKind` `pending` ou `knowledge_only`: explica a regra do catálogo e informa que o valor ainda não está disponível pelo assistente.
- NBV (`top_meeting_types`, `average_days_to_first_meeting`, etc.): podem descrever o que a tela mostra; as duas sem executor oficial (`satisfaction_nps_index`, `sc_lift`) não inventam valor.

## Ambiguidade e página

- “qual a média?”, “qual o total?”, “como está isso?” sem contexto → `clarification`.
- Na tela Reuniões, “qual a média?” lista opções da página; **não** escolhe uma métrica sozinha.
- Follow-ups: `renewed_clients` → “e os não renovados?” → `non_renewed_clients`; cobertura NPS → “e quantos responderam?” → `nps_official_responses`.

## Compatibilidade

Campos da resposta ao frontend preservados (`success`, `mode`/`intent`, `session_id`, `answer`, `domain`, `metric`, `aggregation`, `value`, `value_detail`, `sample_size`, `unit`, `filters`, `filter_labels`, `sources`, `warnings`, `conversation_context`, `realtime_database`, `generated_at`).

IDs canônicos e aliases de etapas 3–4 continuam válidos. O workflow **remoto** antigo não foi alterado.

## Métricas sem executor (valor)

O assistente explica definição/localização, mas não inventa número, entre outras: Plano Patrimonial (`plan_*`), Uso da Plataforma, Qualidade, CES, CSAT (pending), Engajamento (legado), `sc_auc` / conceitos knowledge_only.

## Testes

`_etapa5_n8n_flow_tests.mjs`: **56/56** (planner + executor + matriz das 15 telas ativas + conversa + ambiguidade + JSON v2).

Regressão: `_catalog_registry_tests.mjs` 14/14; `_etapa4_execution_tests.mjs` 20/20; `_semantic_tests.mjs` 10/10.

## Arquivos

- Alterados: `netlify/functions/assistant.mjs`, `netlify/functions/_shared/portal-metric-catalog.mjs`, `netlify/functions/_shared/metric-executor.mjs`, `docs/chatbot-metric-audit.md`
- Criados: `analytics-jornada-chat-v2.json`, `_etapa5_n8n_flow_tests.mjs`
- Não alterados: `index.html`, `portal-query.mjs`, `portal-metric-registry.mjs`, `assistant-data.mjs`, banco, workflow n8n remoto
