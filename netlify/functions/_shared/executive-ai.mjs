/**
 * Executive AI (Etapa 8.3.2)
 *
 * Interpreta analysis_context oficial via Gemini, com candidatos executivos
 * extraídos antes da chamada. Não calcula KPIs, não consulta banco, não usa o chatbot/n8n.
 */

import { geminiConfigurationError, getGeminiEnv, isExecutiveGeminiEnabled } from "./env.mjs";
import {
  extractExecutiveCandidates,
  mergeDeterministicLimitations,
  fillMissingAttention,
  constrainPositives,
  bindActionsToEvidence,
  ignoredCandidates,
  statisticalLanguageGuide,
} from "./executive-candidates.mjs";
import { visibleAnalysisHasTechnicalLeak } from "./executive-labels.mjs";

export const EXECUTIVE_AI_VERSION = "8.5";
export const GEMINI_TEMPERATURE = 0.2;
export const GEMINI_REFINEMENT_TIMEOUT_MS = 8000;
export const GEMINI_REFINEMENT_EXTRA_ATTEMPTS = 0;
export const EXECUTIVE_AI_LIMITS = Object.freeze({
  attentionPoints: 3,
  positiveSignals: 2,
  recommendedActions: 3,
  limitations: 4,
  headlineChars: 180,
  summaryChars: 520,
  highlightNumbers: 4,
});

export const GEMINI_RETRY_POLICY = Object.freeze({
  extraAttempts: 2,
  backoffBaseMs: 800,
  backoffCapMs: 5000,
  retryAfterCapMs: 15000,
  jitterMaxMs: 250,
  rateLimitFloorMs: 4000,
});

const ALLOWED_SEVERITY = new Set(["critical", "attention"]);
const CAUSAL_RE =
  /\b(causa|causam|causou|causaram|causado por|é causado|e causado|é a causa|e a causa|causalidade|provoca|provocam|leva ao cancelamento|levam ao cancelamento|faz o cliente cancelar|fazem o cliente cancelar|gera cancelamento|geram cancelamento)\b/i;
const AUC_AS_ACCURACY_RE = /\b(auc|poder preditivo)[^\n.]{0,60}\b(taxa de acerto|precis[aã]o|accuracy|acur[aá]cia)\b/i;
const CERTAIN_CHURN_RE =
  /\b(aumentar reuni[oõ]es? (ir[aá]|vai|reduzir[aá])|reuni[oõ]es? reduzem o cancelamento|reuni[oõ]es? evitam o churn)\b/i;
const TECHNICAL_EXEC_RE =
  /\b(timeout|view estoura|leitura (completa )?de contratos|assinatura do contrato|fallback interno|processamento interno|erro de fetch)\b/i;

export const EXECUTIVE_SYSTEM_PROMPT = `Você é um analista executivo do portal Analytics QuartaVia.

Público: CEO e alta liderança. Leitura em 20–30 segundos.

Você recebe um resumo executivo específico desta página (page_profile + executive_snapshot + candidates).

Seu trabalho não é cobrir todos os dados.
Selecione apenas os fatos mais relevantes para alta liderança.
É aceitável retornar poucos insights.
Prefira importância e precisão a quantidade.
Evite repetir o mesmo fato no headline, resumo e cards.
Priorize a população definida em scope.
Se scope = clientes ativos, não generalize o resultado para cancelados.
Não transforme limitações técnicas internas em headline.
Não invente contexto empresarial.
Não invente meta, benchmark ou expectativa.

Não tente cobrir todos os dados. Não preencha seções por obrigação. Arrays vazios são aceitáveis.

Regras absolutas:
- Use exclusivamente snapshot, perfil e candidatos.
- Nunca invente valores, métricas ou regras de negócio.
- Nunca recalcule percentuais ou deltas. Use só números já presentes.
- Não invente positivo, problema ou ação.
- Prefira precisão e importância a quantidade.
- Evite repetir o mesmo número em headline, resumo, cards e evidência.
- headline: a leitura mais importante da página, na população de scope. 1 frase. Primeiro a pergunta central da página; depois o principal sinal, se houver.
- Dados Gerais: comece pelo estado atual da carteira ativa. Depois a principal mudança.
- Reuniões: comece pelo acompanhamento/cobertura dos ativos. Depois a principal mudança operacional.
- Performance do EP: comece pela carteira ativa. Cite apenas engenheiros já listados em ep_highlights/ep_attention. Não invente nomes. Não use NPS com amostra limitada para declarar melhor desempenho. Não crie score composto. Evite linguagem punitiva.
- Estatísticas: comece pela principal descoberta associativa/preditiva. Nunca causalidade.
- executive_summary: 2 a 4 frases. Não repita a headline. Não repita todos os highlight numbers.
- attention_points: no máximo 3. Só o que muda decisão. Se não houver, [].
- positive_signals: no máximo 2. Se não houver, [].
- recommended_actions: no máximo 3. O que vale investigar/decidir. Nunca "monitorar o indicador".
- limitations: só as relevantes. category: data_quality | coverage | sample | business_validation | technical.
- Limitações técnicas (timeout, view, processamento) NÃO entram na headline nem no resumo, salvo se impedirem materialmente a leitura.
- Priorize data_quality / coverage / sample no resumo; technical só no accordion de limitações.
- Números de destaque (highlight_numbers) já vêm do backend. Não crie valores. Não devolva highlight_numbers.
- Nunca exponha identificadores técnicos, nomes de tabelas, views, colunas, métricas internas, funções, endpoints ou detalhes de infraestrutura.
- Traduza qualquer conceito técnico para linguagem de negócio. Se o detalhe não for necessário para a decisão, omita.
- Se scope for clientes ativos, não generalize para cancelados.
- Ações em hipótese/investigação, nunca certeza causal.
- recommended_actions.based_on aponta metric de attention ou limitation. Sem atenção/limitação, actions = [].
- Português do Brasil, frases curtas, sem Markdown, sem "Analisando os dados...".
- severity apenas: "critical" ou "attention".
- evidence: metric/value/unit copiados do snapshot.
- Análises Estatísticas: association → associado/relacionado; predictive_discrimination → capacidade de discriminação (nunca taxa de acerto); group_difference → o grupo apresentou diferença; survival_difference → diferença de permanência observada. Nunca causalidade.
- Retorne SOMENTE JSON válido no formato:
{"headline":"","executive_summary":"","attention_points":[],"positive_signals":[],"recommended_actions":[],"limitations":[]}`;

function snapshotForGemini(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const { ep_performance, ...rest } = snapshot;
  return rest;
}

export function buildUserPrompt(context, candidates, extraNote = "") {
  const snapshot = context?.executive_snapshot || context;
  const profile = snapshot?.page_profile || context?.page_profile || null;
  const page = snapshot?.page || context?.page || "";
  const sc = page === "statistical-crosses"
    ? `\nCategorias estatísticas: association, predictive_discrimination, group_difference, survival_difference.\nGuia association: ${statisticalLanguageGuide("association")}\nGuia AUC: ${statisticalLanguageGuide("predictive_discrimination")}\nGuia grupo: ${statisticalLanguageGuide("group_difference")}\nGuia sobrevivência: ${statisticalLanguageGuide("survival_difference")}\n`
    : "";
  const compactCandidates = {
    attention_candidates: (candidates?.attention_candidates || []).slice(0, 4),
    positive_candidates: (candidates?.positive_candidates || []).slice(0, 2),
    limitation_candidates: (candidates?.limitation_candidates || []).slice(0, 4),
    action_context: (candidates?.action_context || []).slice(0, 3),
  };
  return `${extraNote}${sc}
PAGE_PROFILE:
${JSON.stringify(profile)}

EXECUTIVE_SNAPSHOT:
${JSON.stringify(snapshotForGemini(snapshot))}

CANDIDATOS (escolha só o relevante; vazio é permitido):
${JSON.stringify(compactCandidates)}
`;
}

export const EXECUTIVE_RESPONSE_SHAPE = {
  headline: "string",
  executive_summary: "string",
  attention_points: [{ severity: "critical|attention", title: "string", description: "string", evidence: [{ metric: "id", value: "number", unit: "string" }] }],
  positive_signals: [{ title: "string", description: "string", evidence: [] }],
  recommended_actions: [{ title: "string", description: "string", based_on: ["metric_id"] }],
  limitations: [{ title: "string", description: "string" }],
};

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function prepareGeminiContext(analysisContext) {
  if (!isPlainObject(analysisContext)) return {};
  const { metadata, ...rest } = analysisContext;
  const safeMeta = metadata && typeof metadata === "object"
    ? {
        engine_version: metadata.engine_version,
        data_generated_at: metadata.data_generated_at,
        page: metadata.page,
        filters_applied: metadata.filters_applied || {},
        ai_generated: false,
      }
    : { ai_generated: false };
  const prepared = {
    ...rest,
    metadata: safeMeta,
  };
  if (prepared.highlights && prepared.page === "statistical-crosses") {
    prepared.highlights = {
      ...prepared.highlights,
      fact_categories: {
        topAssociations: "association",
        topAuc: "predictive_discrimination",
        topGroupDifferences: "group_difference",
        survival: "survival_difference",
        cohort: "cohort_pattern",
      },
    };
  }
  return prepared;
}

const PII_HINT = /@|cpf|cnpj|telefone|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i;

export function contextHasDisallowedPayload(context) {
  const json = JSON.stringify(context || {});
  if (/"clients"\s*:/.test(json) && /"email"\s*:/.test(json)) return true;
  if (PII_HINT.test(json) && !json.includes("[redacted-email]")) {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(json.replace(/\[redacted-email\]/g, ""))) return true;
  }
  return false;
}

function addNumber(set, n) {
  if (n == null || typeof n === "boolean") return;
  const num = typeof n === "number" ? n : Number(String(n).replace(",", "."));
  if (!Number.isFinite(num)) return;
  set.add(num);
}

function collectAllowedNumbers(context) {
  const allowed = new Set();
  function walk(value, key = "") {
    if (value == null) return;
    if (key === "heuristics" || key === "timing_ms" || key === "payload_bytes") return;
    if (typeof value === "number") {
      addNumber(allowed, value);
      return;
    }
    if (typeof value === "string") {
      const month = value.match(/^(\d{4})-(\d{2})$/);
      if (month) {
        addNumber(allowed, Number(month[1]));
        addNumber(allowed, Number(month[2]));
      }
      for (const token of extractNumericTokens(value)) addNumber(allowed, token.number);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  }
  walk(context);
  return allowed;
}

function parseLooseNumber(raw) {
  const s0 = String(raw || "").replace(/%/g, "").trim();
  if (!s0) return null;
  let s = s0;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function extractNumericTokens(text) {
  const src = String(text || "");
  const out = [];
  const seen = new Set();
  const push = (raw, index) => {
    const number = parseLooseNumber(raw);
    if (number == null) return;
    const key = `${index}:${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ raw, number, isPercent: String(raw).includes("%"), index });
  };
  const re = /\d{1,3}(?:\.\d{3})+(?:,\d+)?%?|\d+,\d+%?|\d+\.\d+%?|\d+%/g;
  let m;
  while ((m = re.exec(src))) push(m[0], m.index);
  const intRe = /\b\d{2,}\b/g;
  while ((m = intRe.exec(src))) {
    const already = out.some((t) => m.index >= t.index && m.index < t.index + t.raw.length);
    if (!already) push(m[0], m.index);
  }
  return out;
}

function numbersMatch(extracted, allowed) {
  for (const a of allowed) {
    const tol = Math.abs(a) < 2 ? 0.0008 : Math.max(0.05, Math.abs(a) * 0.002);
    if (Math.abs(a - extracted) <= tol) return true;
    if (Math.abs(Math.abs(a) - extracted) <= tol) return true;
  }
  return false;
}

function isStructuralCount(token, text) {
  if (token.isPercent) return false;
  if (!Number.isInteger(token.number)) return false;
  if (token.number >= 0 && token.number <= 8) return true;
  const around = String(text).slice(Math.max(0, token.index || 0), (token.index || 0) + String(token.raw).length + 18).toLowerCase();
  return token.number <= 60 && /(segundo|frase|ponto|se[cç][aã]o|item)/.test(around);
}

export function findUnanchoredNumbers(analysis, allowed) {
  const texts = [
    analysis.headline,
    analysis.executive_summary,
    ...(analysis.attention_points || []).flatMap((p) => [p.title, p.description]),
    ...(analysis.positive_signals || []).flatMap((p) => [p.title, p.description]),
    ...(analysis.recommended_actions || []).flatMap((p) => [p.title, p.description]),
    ...(analysis.limitations || []).flatMap((p) => [p.title, p.description]),
  ];
  const issues = [];
  for (const text of texts) {
    for (const token of extractNumericTokens(text)) {
      if (isStructuralCount(token, text)) continue;
      if (!numbersMatch(token.number, allowed)) {
        issues.push({ raw: token.raw, number: token.number, text: String(text).slice(0, 120) });
      }
    }
  }
  return issues;
}

function asTrimmedString(v, max) {
  if (v == null) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return max && s.length > max ? s.slice(0, max).trim() : s;
}

function normalizeSeverity(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "critical") return "critical";
  if (s === "attention") return "attention";
  if (s === "high" || s === "warning" || s === "medium" || s === "info") return "attention";
  return null;
}

function sanitizeEvidence(list, allowed, knownMetrics) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const metric = asTrimmedString(item.metric, 80) || null;
    if (metric && knownMetrics.size && !knownMetrics.has(metric)) continue;
    const value = item.value == null || item.value === "" ? null : Number(item.value);
    if (value != null && !Number.isFinite(value)) continue;
    if (value != null && !numbersMatch(value, allowed)) continue;
    out.push({
      metric,
      value,
      unit: item.unit == null ? null : asTrimmedString(item.unit, 40) || null,
    });
    if (out.length >= 4) break;
  }
  return out;
}

function collectKnownMetrics(context, candidates) {
  const ids = new Set();
  for (const kpi of context?.kpis || []) if (kpi?.metric) ids.add(kpi.metric);
  for (const cmp of context?.comparisons || []) if (cmp?.metric) ids.add(cmp.metric);
  for (const sig of context?.signals || []) if (sig?.metric) ids.add(sig.metric);
  for (const lim of context?.limitations || []) if (lim?.metric) ids.add(lim.metric);
  const highlights = context?.highlights || {};
  for (const list of [highlights.topAssociations, highlights.topAuc, highlights.topGroupDifferences, highlights.discoveries, highlights.riskRules]) {
    for (const row of list || []) if (row?.id) ids.add(row.id);
  }
  if (highlights.survival) ids.add("survival_observed");
  for (const group of [
    candidates?.attention_candidates,
    candidates?.positive_candidates,
    candidates?.limitation_candidates,
    candidates?.action_context,
  ]) {
    for (const item of group || []) if (item?.metric) ids.add(item.metric);
  }
  return ids;
}

function combinedText(analysis) {
  return [
    analysis.headline,
    analysis.executive_summary,
    ...(analysis.attention_points || []).map((p) => `${p.title} ${p.description}`),
    ...(analysis.positive_signals || []).map((p) => `${p.title} ${p.description}`),
    ...(analysis.recommended_actions || []).map((p) => `${p.title} ${p.description}`),
    ...(analysis.limitations || []).map((p) => `${p.title} ${p.description}`),
  ].join(" \n ");
}

function coverageMustBeAcknowledged(context, analysis) {
  const signals = context?.signals || [];
  const serious = signals.filter((s) =>
    ["LOW_COVERAGE", "SMALL_SAMPLE", "NEEDS_BUSINESS_VALIDATION", "METRIC_UNAVAILABLE"].includes(s?.code),
  );
  if (!serious.length) return null;
  const blob = `${combinedText(analysis)} ${(analysis.limitations || []).map((l) => l.description).join(" ")}`.toLowerCase();
  const ok = (analysis.limitations || []).length > 0
    || /cobertura|amostra|valida[cç][aã]o de neg[oó]cio|dado ausente|indispon[ií]vel/.test(blob);
  if (ok) return null;
  return "A engine sinalizou cobertura/amostra/validação e a análise não reconheceu a limitação.";
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, error: "Resposta vazia do modelo." };
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(unfenced);
    if (isPlainObject(parsed)) return { ok: true, value: parsed };
  } catch {
    /* try slice */
  }
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(unfenced.slice(start, end + 1));
      if (isPlainObject(parsed)) return { ok: true, value: parsed };
    } catch {
      return { ok: false, error: "JSON inválido após extração." };
    }
  }
  return { ok: false, error: "A resposta do modelo não é JSON." };
}

export function textHasForbiddenCausality(text) {
  const src = String(text || "");
  const aucSrc = src.replace(/\bn[aã]o\s+(taxa de acerto|precis[aã]o|accuracy|acur[aá]cia)\b/gi, " ");
  if (AUC_AS_ACCURACY_RE.test(aucSrc)) {
    return { hit: true, rule: "auc_as_accuracy", snippet: aucSrc.match(AUC_AS_ACCURACY_RE)?.[0] || "auc/accuracy" };
  }
  if (CERTAIN_CHURN_RE.test(src)) {
    return { hit: true, rule: "certain_churn", snippet: src.match(CERTAIN_CHURN_RE)?.[0] || "certain_churn" };
  }
  const stripped = src
    .replace(/\b(n[aã]o|sem|nunca|aus[eê]ncia de)\s+(?:[^\n.]{0,48}?\s)?(?:a\s+)?(?:causa|causam|causou|causaram|causalidade|provoca|provocam)\b/gi, " ")
    .replace(/\bn[aã]o\s+[eé]\s+(?:a\s+)?causa\b/gi, " ");
  const m = stripped.match(CAUSAL_RE);
  if (m) return { hit: true, rule: "causal_language", snippet: m[0] };
  return { hit: false, rule: null, snippet: null };
}

export function applyExecutiveGuarantees(analysis, candidates) {
  const next = {
    ...analysis,
    attention_points: fillMissingAttention(analysis.attention_points, candidates),
    positive_signals: constrainPositives(analysis.positive_signals, candidates),
    limitations: mergeDeterministicLimitations(analysis.limitations, candidates),
  };
  next.recommended_actions = bindActionsToEvidence(analysis.recommended_actions, next);
  return next;
}

export function validateAndNormalizeExecutiveAnalysis(raw, analysisContext, options = {}) {
  const parsed = isPlainObject(raw) ? { ok: true, value: raw } : extractJsonObject(raw);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_json", error: parsed.error };
  }
  const src = parsed.value;
  const page = analysisContext?.page || analysisContext?.metadata?.page;
  const allowed = collectAllowedNumbers(analysisContext);
  const knownMetrics = collectKnownMetrics(analysisContext, options.candidates);

  const analysis = {
    headline: asTrimmedString(src.headline, EXECUTIVE_AI_LIMITS.headlineChars),
    executive_summary: asTrimmedString(src.executive_summary, EXECUTIVE_AI_LIMITS.summaryChars),
    attention_points: [],
    positive_signals: [],
    recommended_actions: [],
    limitations: [],
  };

  if (!analysis.headline || !analysis.executive_summary) {
    return { ok: false, code: "invalid_schema", error: "headline e executive_summary são obrigatórios." };
  }
  if (/^analisando os dados/i.test(analysis.headline) || /^podemos observar/i.test(analysis.headline)) {
    return { ok: false, code: "generic_headline", error: "Headline genérica demais." };
  }
  if (hasTechnicalExecutiveLeak(analysis.headline) || hasTechnicalExecutiveLeak(analysis.executive_summary)) {
    return {
      ok: false,
      code: "technical_in_executive_copy",
      error: "Limitação técnica não pode aparecer na headline ou no resumo.",
    };
  }
  if (executiveCopyViolatesScope(analysis, analysisContext)) {
    return {
      ok: false,
      code: "scope_mismatch",
      error: "A análise generalizou além da população definida em scope.",
    };
  }

  const points = Array.isArray(src.attention_points) ? src.attention_points : [];
  for (const item of points) {
    if (analysis.attention_points.length >= EXECUTIVE_AI_LIMITS.attentionPoints) break;
    if (!isPlainObject(item)) continue;
    const severity = normalizeSeverity(item.severity);
    const title = asTrimmedString(item.title, 120);
    const description = asTrimmedString(item.description, 500);
    if (!severity || !title || !description) continue;
    analysis.attention_points.push({
      severity,
      title,
      description,
      evidence: sanitizeEvidence(item.evidence, allowed, knownMetrics),
    });
  }

  const positives = Array.isArray(src.positive_signals) ? src.positive_signals : [];
  for (const item of positives) {
    if (analysis.positive_signals.length >= EXECUTIVE_AI_LIMITS.positiveSignals) break;
    if (!isPlainObject(item)) continue;
    const title = asTrimmedString(item.title, 120);
    const description = asTrimmedString(item.description, 500);
    if (!title || !description) continue;
    analysis.positive_signals.push({
      title,
      description,
      evidence: sanitizeEvidence(item.evidence, allowed, knownMetrics),
    });
  }

  const actions = Array.isArray(src.recommended_actions) ? src.recommended_actions : [];
  for (const item of actions) {
    if (analysis.recommended_actions.length >= EXECUTIVE_AI_LIMITS.recommendedActions) break;
    if (!isPlainObject(item)) continue;
    const title = asTrimmedString(item.title, 120);
    const description = asTrimmedString(item.description, 500);
    if (!title || !description) continue;
    const basedOn = Array.isArray(item.based_on)
      ? item.based_on.map((m) => asTrimmedString(m, 80)).filter(Boolean).slice(0, 3)
      : [];
    analysis.recommended_actions.push({ title, description, based_on: basedOn });
  }

  const lims = Array.isArray(src.limitations) ? src.limitations : [];
  for (const item of lims) {
    if (analysis.limitations.length >= EXECUTIVE_AI_LIMITS.limitations) break;
    if (!isPlainObject(item)) continue;
    const title = asTrimmedString(item.title, 120);
    const description = asTrimmedString(item.description, 500);
    if (!title || !description) continue;
    analysis.limitations.push({
      title,
      description,
      metric: item.metric ? asTrimmedString(item.metric, 80) : null,
      category: ["data_quality", "coverage", "sample", "business_validation", "technical"].includes(item.category)
        ? item.category
        : null,
    });
  }

  const blob = combinedText(analysis);
  if (page === "statistical-crosses" || options.checkCausality) {
    const causal = textHasForbiddenCausality(blob);
    if (causal.hit && causal.rule !== "certain_churn") {
      return {
        ok: false,
        code: "causality_forbidden",
        error: "A análise atribuiu causalidade ou usou AUC como taxa de acerto.",
        details: { rule: causal.rule, snippet: causal.snippet },
      };
    }
  }
  if (CERTAIN_CHURN_RE.test(blob)) {
    return {
      ok: false,
      code: "causality_forbidden",
      error: "A análise afirmou certeza causal sobre reuniões e cancelamento.",
      details: { rule: "certain_churn" },
    };
  }

  const unanchored = findUnanchoredNumbers(analysis, allowed);
  if (unanchored.length) {
    return {
      ok: false,
      code: "unanchored_number",
      error: "A análise citou número que não existe no contexto oficial.",
      details: unanchored.slice(0, 6),
    };
  }

  if (!options.skipLimitationAck) {
    const coverageErr = coverageMustBeAcknowledged(analysisContext, analysis);
    if (coverageErr) {
      return { ok: false, code: "limitation_ignored", error: coverageErr };
    }
  }

  return { ok: true, analysis };
}

function hasTechnicalExecutiveLeak(text) {
  if (!TECHNICAL_EXEC_RE.test(text || "")) return false;
  if (/impede materialmente|impossibilita (a leitura|a interpreta)/i.test(text || "")) return false;
  return true;
}

function executiveCopyViolatesScope(analysis, analysisContext) {
  const scope = analysisContext?.executive_snapshot?.scope || analysisContext?.metadata?.scope;
  if (!scope?.type) return false;
  const blob = `${analysis.headline || ""} ${analysis.executive_summary || ""}`;
  if (scope.type === "active_clients") {
    return /n[aã]o se restringe aos ativos|inclui cancelados|generaliz\w*.{0,40}cancelad/i.test(blob);
  }
  return false;
}

function geminiEndpoint(model) {
  const name = String(model || "").replace(/^models\//, "");
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`;
}

export function parseRetryAfterMs(response) {
  const header = response?.headers?.get?.("retry-after") || response?.headers?.get?.("Retry-After");
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec >= 0) {
    return Math.min(sec * 1000, GEMINI_RETRY_POLICY.retryAfterCapMs);
  }
  const date = Date.parse(header);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), GEMINI_RETRY_POLICY.retryAfterCapMs);
}

export function computeBackoffMs(attempt, retryAfterMs, jitterFn = Math.random, status = null) {
  const jitter = Math.floor((jitterFn() || 0) * GEMINI_RETRY_POLICY.jitterMaxMs);
  if (status === 429) {
    const fromHeader = retryAfterMs != null && Number.isFinite(retryAfterMs) ? retryAfterMs : 0;
    const progressive = GEMINI_RETRY_POLICY.rateLimitFloorMs * (2 ** Math.max(0, attempt));
    return Math.min(Math.max(fromHeader, progressive) + jitter, GEMINI_RETRY_POLICY.retryAfterCapMs);
  }
  if (retryAfterMs != null && Number.isFinite(retryAfterMs)) {
    return Math.min(retryAfterMs + jitter, GEMINI_RETRY_POLICY.retryAfterCapMs);
  }
  const base = GEMINI_RETRY_POLICY.backoffBaseMs * (2 ** Math.max(0, attempt));
  return Math.min(base + jitter, GEMINI_RETRY_POLICY.backoffCapMs);
}

function logGeminiHttp({ status, attempt, durationMs, geminiStatus, quotaMetric, retryAfter }) {
  const payload = {
    event: "gemini_http",
    status,
    attempt,
    duration_ms: durationMs,
  };
  if (geminiStatus) payload.gemini_status = geminiStatus;
  if (quotaMetric) payload.quota_metric = quotaMetric;
  if (retryAfter) payload.retry_after = retryAfter;
  console.error("[executive-ai]", JSON.stringify(payload));
}

function safeGeminiErrorDetails(response, body) {
  const retryAfter = response?.headers?.get?.("retry-after") || response?.headers?.get?.("Retry-After") || null;
  const geminiStatus = body?.error?.status || null;
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  let quotaMetric = null;
  let quotaId = null;
  for (const item of details) {
    const list = Array.isArray(item?.violations) ? item.violations : [];
    for (const v of list) {
      if (v?.quotaMetric && !quotaMetric) quotaMetric = String(v.quotaMetric);
      if (v?.quotaId && !quotaId) quotaId = String(v.quotaId);
    }
  }
  const message = String(body?.error?.message || "").slice(0, 180);
  const looksLikeQuota = /quota|exceeded|billing|limit: 0|free_tier|daily/i.test(`${geminiStatus} ${quotaMetric} ${quotaId} ${message}`);
  const looksPerMinute = /per minute|rate.?limit|requests per minute|rpm/i.test(`${quotaMetric} ${quotaId} ${message}`);
  return {
    gemini_http: response?.status || null,
    gemini_status: geminiStatus,
    retry_after: retryAfter,
    quota_metric: quotaMetric,
    quota_class: looksLikeQuota && !looksPerMinute ? "quota_exhausted" : (response?.status === 429 ? "rate_limited" : null),
  };
}

async function defaultSleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function callGemini({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  fetchImpl,
  timeoutMs = 60000,
  extraAttempts = GEMINI_RETRY_POLICY.extraAttempts,
  sleepImpl = defaultSleep,
  jitterFn = Math.random,
}) {
  let lastError = null;
  const maxTries = extraAttempts + 1;
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const url = `${geminiEndpoint(model)}?key=${encodeURIComponent(apiKey)}`;
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: GEMINI_TEMPERATURE,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
      const durationMs = Date.now() - started;
      const rawText = await response.text();
      let body = null;
      try { body = rawText ? JSON.parse(rawText) : null; } catch { body = null; }
      if (!response.ok) {
        const geminiDetails = safeGeminiErrorDetails(response, body);
        logGeminiHttp({
          status: response.status,
          attempt: attempt + 1,
          durationMs,
          geminiStatus: geminiDetails.gemini_status,
          quotaMetric: geminiDetails.quota_metric,
          retryAfter: geminiDetails.retry_after,
        });
        const retryable = response.status === 429 || response.status === 503;
        if (retryable && attempt < extraAttempts) {
          const wait = computeBackoffMs(attempt, parseRetryAfterMs(response), jitterFn, response.status);
          await sleepImpl(wait);
          lastError = new Error(`Gemini HTTP ${response.status}`);
          lastError.status = response.status;
          lastError.geminiDetails = geminiDetails;
          continue;
        }
        const err = new Error(`Gemini HTTP ${response.status}`);
        err.code = "ai_generation_failed";
        err.status = response.status;
        err.geminiDetails = geminiDetails;
        throw err;
      }
      if (attempt > 0) {
        logGeminiHttp({ status: response.status, attempt: attempt + 1, durationMs });
      }
      const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") || "";
      return { text, model, attempts: attempt + 1 };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (error?.code === "ai_generation_failed") throw error;
      lastError = error;
      if (attempt >= extraAttempts) throw error;
      await sleepImpl(computeBackoffMs(attempt, null, jitterFn));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Gemini HTTP failed");
}

function causalRetryNote(details) {
  const snippet = details?.snippet ? ` Trecho: "${details.snippet}".` : "";
  const rule = details?.rule ? ` Regra: ${details.rule}.` : "";
  return `CORREÇÃO OBRIGATÓRIA: a resposta anterior violou a restrição de causalidade.${rule}${snippet} Reescreva sem causa/provoca/gera cancelamento/leva ao cancelamento/faz o cliente cancelar. Use associado, relacionado, capacidade de discriminação, o grupo apresentou diferença, diferença de permanência observada. AUC nunca é taxa de acerto.\n\n`;
}

/**
 * @param {object} analysisContext
 * @param {{ fetchImpl?: typeof fetch, includeDebug?: boolean }} [options]
 */
export async function generateExecutiveAnalysis(analysisContext, options = {}) {
  const generatedAt = nowIso();
  const started = Date.now();
  const configError = geminiConfigurationError();
  if (configError) {
    return {
      success: false,
      code: "ai_not_configured",
      error: configError,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const snapshot = options.snapshot || analysisContext?.executive_snapshot || null;
  const promptContext = snapshot
    ? { page: snapshot.page, executive_snapshot: snapshot, page_profile: snapshot.page_profile || null }
    : prepareGeminiContext(analysisContext);
  if (contextHasDisallowedPayload(promptContext) || contextHasDisallowedPayload(analysisContext)) {
    return {
      success: false,
      code: "ai_generation_failed",
      error: "Contexto recusado: contém dados pessoais ou payload bruto.",
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const candidates = extractExecutiveCandidates(snapshot ? { ...analysisContext, executive_snapshot: snapshot } : analysisContext);
  const { apiKey, model } = getGeminiEnv();
  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || defaultSleep;
  const jitterFn = options.jitterFn || Math.random;
  let rawModelText = "";
  let geminiAttempts = 0;
  try {
    const result = await callGemini({
      apiKey,
      model,
      systemPrompt: EXECUTIVE_SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(promptContext, candidates, options.extraNote || ""),
      fetchImpl,
      sleepImpl,
      jitterFn,
    });
    rawModelText = result.text;
    geminiAttempts = result.attempts || 1;
  } catch (error) {
    const aborted = error?.name === "AbortError";
    if (aborted) {
      logGeminiHttp({
        status: "timeout",
        attempt: geminiAttempts + 1,
        durationMs: Date.now() - started,
      });
    }
    return {
      success: false,
      code: "ai_generation_failed",
      error: aborted ? "Tempo esgotado ao gerar a análise." : "Não foi possível gerar a análise executiva.",
      reason: error?.status === 429 ? "rate_limited" : error?.status === 503 ? "unavailable" : null,
      details: error?.geminiDetails || null,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const extracted = extractJsonObject(rawModelText);
  if (!extracted.ok) {
    if (!options._retriedJson) {
      return generateExecutiveAnalysis(analysisContext, { ...options, _retriedJson: true });
    }
    return {
      success: false,
      code: "ai_generation_failed",
      error: extracted.error,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  let validated = validateAndNormalizeExecutiveAnalysis(extracted.value, analysisContext, {
    candidates,
    skipLimitationAck: true,
  });
  if (!validated.ok && validated.code === "causality_forbidden" && !options._retriedCausal) {
    return generateExecutiveAnalysis(analysisContext, {
      ...options,
      _retriedCausal: true,
      extraNote: causalRetryNote(validated.details),
    });
  }
  if (!validated.ok) {
    return {
      success: false,
      code: "ai_generation_failed",
      error: validated.error,
      reason: validated.code,
      details: validated.details || null,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const guaranteed = applyExecutiveGuarantees(validated.analysis, candidates);
  const afterMerge = validateAndNormalizeExecutiveAnalysis(guaranteed, analysisContext, {
    candidates,
    skipLimitationAck: true,
  });
  if (!afterMerge.ok) {
    if (afterMerge.code === "causality_forbidden" && !options._retriedCausal) {
      return generateExecutiveAnalysis(analysisContext, {
        ...options,
        _retriedCausal: true,
        extraNote: causalRetryNote(afterMerge.details),
      });
    }
    return {
      success: false,
      code: "ai_generation_failed",
      error: afterMerge.error,
      reason: afterMerge.code,
      details: afterMerge.details || null,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const coverageErr = coverageMustBeAcknowledged(analysisContext, afterMerge.analysis);
  if (coverageErr) {
    return {
      success: false,
      code: "ai_generation_failed",
      error: coverageErr,
      reason: "limitation_ignored",
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const finalAnalysis = {
    ...afterMerge.analysis,
    highlight_numbers: Array.isArray(snapshot?.highlight_numbers) ? snapshot.highlight_numbers.slice(0, 4) : [],
    scope: snapshot?.scope || analysisContext?.metadata?.scope || null,
  };

  const debug = {
    ignored_candidates: ignoredCandidates(candidates, afterMerge.analysis),
    candidate_counts: {
      attention: candidates.attention_candidates.length,
      positive: candidates.positive_candidates.length,
      limitation: candidates.limitation_candidates.length,
    },
    gemini_attempts: geminiAttempts,
    causal_regenerated: Boolean(options._retriedCausal),
  };

  return {
    success: true,
    executive_analysis: finalAnalysis,
    metadata: {
      ai_generated: true,
      model,
      temperature: GEMINI_TEMPERATURE,
      engine_ai_version: EXECUTIVE_AI_VERSION,
      generated_at: generatedAt,
    },
    timing_ms: { gemini: Date.now() - started },
    ...(options.includeDebug ? { generation_debug: debug } : {}),
  };
}

export { extractJsonObject, collectAllowedNumbers, ALLOWED_SEVERITY };

export const REFINEMENT_SYSTEM_PROMPT = `Você recebe uma análise executiva já validada.

Melhore APENAS a redação de:
- headline
- executive_summary
- title e description dos cards

Não altere fatos, números, métricas, evidências, severity, quantidade de itens, based_on, highlight_numbers, scope, ep_highlights ou ep_attention.
Não invente nomes de engenheiros. Cite apenas os já presentes na análise base.
Não invente fatos, meta, benchmark, expectativa ou contexto empresarial.
Não use causalidade. AUC nunca é taxa de acerto.
Nunca exponha identificadores técnicos, nomes de tabelas, views, colunas, métricas internas, funções, endpoints ou detalhes de infraestrutura.
Traduza qualquer conceito técnico para linguagem de negócio.
Se um detalhe técnico não for necessário para a decisão executiva, omita.
Não devolva highlight_numbers novos.
Retorne SOMENTE JSON no mesmo formato, com os mesmos arrays.`;

function copyCardWording(baseCard, refinedCard) {
  if (!baseCard) return baseCard;
  const title = asTrimmedString(refinedCard?.title, 120) || baseCard.title;
  const description = asTrimmedString(refinedCard?.description, 500) || baseCard.description;
  return { ...baseCard, title, description };
}

export function applyRefinedWording(baseAnalysis, refined) {
  const base = baseAnalysis || {};
  const src = refined && typeof refined === "object" ? refined : {};
  return {
    ...base,
    headline: asTrimmedString(src.headline, EXECUTIVE_AI_LIMITS.headlineChars) || base.headline,
    executive_summary: asTrimmedString(src.executive_summary, EXECUTIVE_AI_LIMITS.summaryChars) || base.executive_summary,
    highlight_numbers: Array.isArray(base.highlight_numbers) ? base.highlight_numbers : [],
    scope: base.scope || null,
    attention_points: (base.attention_points || []).map((card, i) => copyCardWording(card, src.attention_points?.[i])),
    positive_signals: (base.positive_signals || []).map((card, i) => copyCardWording(card, src.positive_signals?.[i])),
    recommended_actions: (base.recommended_actions || []).map((card, i) => {
      const next = copyCardWording(card, src.recommended_actions?.[i]);
      return { ...next, based_on: card.based_on };
    }),
    limitations: (base.limitations || []).map((card, i) => {
      const next = copyCardWording(card, src.limitations?.[i]);
      return { ...next, metric: card.metric, category: card.category };
    }),
    ep_highlights: Array.isArray(base.ep_highlights) ? base.ep_highlights : [],
    ep_attention: Array.isArray(base.ep_attention) ? base.ep_attention : [],
  };
}

/**
 * Refina redação da análise determinística. Falha → caller usa base.
 */
export async function refineExecutiveWording(baseAnalysis, options = {}) {
  const generatedAt = nowIso();
  const started = Date.now();
  if (!isExecutiveGeminiEnabled()) {
    return {
      success: false,
      code: "gemini_disabled",
      generated_at: generatedAt,
      timing_ms: { gemini: 0 },
    };
  }
  const configError = geminiConfigurationError();
  if (configError) {
    return {
      success: false,
      code: "ai_not_configured",
      error: configError,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }
  if (contextHasDisallowedPayload(baseAnalysis)) {
    return {
      success: false,
      code: "ai_generation_failed",
      error: "Análise base recusada: possível PII.",
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const page = options.page || baseAnalysis?.scope?.type || "";
  const userPrompt = `PAGE: ${options.page || page}\n\nBASE_ANALYSIS:\n${JSON.stringify({
    headline: baseAnalysis.headline,
    executive_summary: baseAnalysis.executive_summary,
    attention_points: baseAnalysis.attention_points,
    positive_signals: baseAnalysis.positive_signals,
    recommended_actions: baseAnalysis.recommended_actions,
    limitations: baseAnalysis.limitations,
  })}`;

  const { apiKey, model } = getGeminiEnv();
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? GEMINI_REFINEMENT_TIMEOUT_MS;
  const extraAttempts = options.extraAttempts ?? GEMINI_REFINEMENT_EXTRA_ATTEMPTS;
  let rawText = "";
  try {
    const result = await callGemini({
      apiKey,
      model,
      systemPrompt: REFINEMENT_SYSTEM_PROMPT,
      userPrompt,
      fetchImpl,
      timeoutMs,
      extraAttempts,
      sleepImpl: options.sleepImpl || defaultSleep,
      jitterFn: options.jitterFn || Math.random,
    });
    rawText = result.text;
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      success: false,
      code: aborted ? "timeout" : "ai_generation_failed",
      reason: error?.status === 429 ? "rate_limited" : error?.status === 503 ? "unavailable" : (aborted ? "timeout" : null),
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const extracted = extractJsonObject(rawText);
  if (!extracted.ok) {
    return {
      success: false,
      code: "invalid_json",
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const merged = applyRefinedWording(baseAnalysis, extracted.value);
  const pageId = options.page || "";
  if (pageId === "statistical-crosses" || options.checkCausality) {
    const causal = textHasForbiddenCausality([
      merged.headline,
      merged.executive_summary,
      ...(merged.attention_points || []).map((c) => `${c.title} ${c.description}`),
    ].join(" "));
    if (causal.hit) {
      return {
        success: false,
        code: "causality_forbidden",
        generated_at: generatedAt,
        timing_ms: { gemini: Date.now() - started },
      };
    }
  }

  const allowedContext = options.analysisContext || { ...baseAnalysis, executive_snapshot: options.snapshot || null };
  const validated = validateAndNormalizeExecutiveAnalysis(merged, allowedContext, {
    skipLimitationAck: true,
  });
  if (!validated.ok) {
    return {
      success: false,
      code: validated.code,
      error: validated.error,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }

  const locked = applyRefinedWording(baseAnalysis, validated.analysis);
  const leak = visibleAnalysisHasTechnicalLeak(locked);
  if (leak.hit) {
    return {
      success: false,
      code: "technical_language",
      error: "Refinamento expôs identificador técnico.",
      details: leak,
      generated_at: generatedAt,
      timing_ms: { gemini: Date.now() - started },
    };
  }
  return {
    success: true,
    executive_analysis: locked,
    metadata: {
      ai_generated: true,
      generation_mode: "gemini_refined",
      model,
      temperature: GEMINI_TEMPERATURE,
      engine_ai_version: EXECUTIVE_AI_VERSION,
      generated_at: generatedAt,
    },
    timing_ms: { gemini: Date.now() - started },
  };
}
