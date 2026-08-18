/**
 * Etapa 8.4.3 — mocks Gemini do refinamento executivo.
 * Sem chamada live. Sem Git. Sem n8n.
 */
process.env.PORTAL_INTERNAL_DATA_RUN = "1";
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GEMINI_API_KEY = "test-mock-key";
}

import {
  generateExecutiveAnalysis,
  validateAndNormalizeExecutiveAnalysis,
  EXECUTIVE_SYSTEM_PROMPT,
} from "./netlify/functions/_shared/executive-ai.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}
function tryCase(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => record(name, true, detail))
    .catch((err) => record(name, false, err.message));
}

const SNAP_CTX = {
  page: "general",
  title: "Dados Gerais",
  generated_at: "2026-08-18T00:00:00.000Z",
  context: { population: 3416, filtered_population: 3416, coverage: 88.9 },
  kpis: [
    { metric: "total_clients", label: "Total de clientes", value: 3416, unit: "clients", status: "confirmed", coverage: null },
    { metric: "active_clients", label: "Clientes ativos", value: 1816, unit: "clients", status: "confirmed", coverage: null },
    { metric: "cancelled_without_confirmed_date", label: "Marcados como cancelados sem confirmação", value: 811, unit: "clients", status: "confirmed", coverage: null },
    { metric: "median_stay_days", label: "Permanência típica", value: 292, unit: "days", status: "confirmed", coverage: 75.9 },
  ],
  signals: [],
  comparisons: [],
  limitations: [],
  metadata: { engine_version: "8.4.3", page: "general", filters_applied: {}, ai_generated: false },
  executive_snapshot: {
    page: "general",
    scope: { type: "active_clients", label: "Clientes ativos", count: 1816, source: "page_default" },
    highlight_numbers: [
      { metric: "active_clients", label: "Clientes ativos", value: 1816, unit: "clients" },
      { metric: "median_stay_days", label: "Permanência típica", value: 292, unit: "days" },
      { metric: "financial_coverage", label: "Cobertura financeira", value: 88.9, unit: "percent" },
    ],
    page_profile: { id: "general", title: "Dados Gerais", objective: "Estado da carteira ativa." },
    limitations: [],
  },
};

const NPS_CTX = {
  page: "statistical-crosses",
  title: "Análises Estatísticas",
  context: { population: 2304, filtered_population: 2304, coverage: 12 },
  kpis: [
    { metric: "sc_nps", label: "NPS nos cruzamentos", value: 64.8, unit: "index", status: "confirmed", coverage: 12 },
    { metric: "sc_nps_responses", label: "Respostas NPS válidas", value: 276, unit: "responses", status: "confirmed", coverage: 12 },
  ],
  signals: [
    {
      type: "warning",
      severity: "high",
      code: "LOW_COVERAGE",
      metric: "sc_nps",
      message: "A cobertura deste indicador é baixa.",
      evidence: { value: 12, unit: "percent" },
    },
  ],
  comparisons: [],
  limitations: [{ code: "LOW_COVERAGE", metric: "sc_nps", message: "Cobertura de NPS em 12%." }],
  highlights: {
    topAssociations: [{ id: "daysToFirstMeeting", label: "Dias até primeira reunião", value: 0.4868, abs: 0.4868 }],
    topAuc: [{ id: "daysToFirstMeeting", label: "Dias até primeira reunião", auc: 0.865 }],
  },
  metadata: { page: "statistical-crosses", filters_applied: {}, ai_generated: false },
};

function validSlimAnalysis(overrides = {}) {
  return {
    headline: "A carteira ativa segue como o recorte principal desta leitura.",
    executive_summary: "Há 1816 clientes ativos neste recorte. A permanência típica é de 292 dias. A cobertura financeira é 88,9%.",
    attention_points: [],
    positive_signals: [],
    recommended_actions: [],
    limitations: [
      {
        title: "Cobertura da permanência",
        description: "A permanência típica usa cobertura de 75,9% e não deve ser generalizada a quem está fora dessa amostra.",
      },
    ],
    ...overrides,
  };
}

function mockFetchOk(payload) {
  return async (url, init) => {
    mockFetchOk.last = { url: String(url).replace(/key=[^&]+/, "key=REDACTED"), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

await tryCase("prompt pede poucos insights e proíbe meta/benchmark", () => {
  assert(/É aceitável retornar poucos insights/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Não invente meta, benchmark ou expectativa/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Não invente contexto empresarial/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Não devolva highlight_numbers/.test(EXECUTIVE_SYSTEM_PROMPT));
});

await tryCase("arrays vazios são válidos", () => {
  const v = validateAndNormalizeExecutiveAnalysis(validSlimAnalysis(), SNAP_CTX);
  assert(v.ok, v.error);
  assert(v.analysis.attention_points.length === 0);
  assert(v.analysis.positive_signals.length === 0);
  assert(v.analysis.recommended_actions.length === 0);
});

await tryCase("poucos insights passam na geração mockada", async () => {
  const result = await generateExecutiveAnalysis(SNAP_CTX, { fetchImpl: mockFetchOk(validSlimAnalysis()) });
  assert(result.success, result.error);
  assert(result.executive_analysis.attention_points.length === 0);
  assert(result.executive_analysis.positive_signals.length === 0);
});

await tryCase("limitação técnica não invade headline", () => {
  const raw = validSlimAnalysis({
    headline: "Timeout na leitura de contratos distorce a carteira ativa.",
  });
  const v = validateAndNormalizeExecutiveAnalysis(raw, SNAP_CTX);
  assert(v.ok === false && v.code === "technical_in_executive_copy", JSON.stringify(v));
});

await tryCase("scope active não pode ser generalizado para cancelados", () => {
  const raw = validSlimAnalysis({
    headline: "A leitura inclui cancelados e não se restringe aos ativos.",
  });
  const v = validateAndNormalizeExecutiveAnalysis(raw, SNAP_CTX);
  assert(v.ok === false && v.code === "scope_mismatch", JSON.stringify(v));
});

await tryCase("Gemini não cria highlight number", async () => {
  const fake = validSlimAnalysis({
    highlight_numbers: [{ metric: "invented_metric", label: "Inventado", value: 9999, unit: "clients" }],
  });
  const result = await generateExecutiveAnalysis(SNAP_CTX, { fetchImpl: mockFetchOk(fake) });
  assert(result.success, result.error);
  const highlights = result.executive_analysis.highlight_numbers || [];
  assert(highlights.every((h) => h.metric !== "invented_metric"), JSON.stringify(highlights));
  assert(highlights.some((h) => h.metric === "active_clients" && h.value === 1816));
});

await tryCase("número não ancorado continua rejeitado", () => {
  const raw = {
    headline: "NPS elevado na carteira.",
    executive_summary: "Os clientes da QuartaVia estão altamente satisfeitos, com cobertura de 20%.",
    attention_points: [],
    positive_signals: [],
    recommended_actions: [],
    limitations: [{ title: "Nada", description: "Sem limitação." }],
  };
  const v = validateAndNormalizeExecutiveAnalysis(raw, NPS_CTX);
  assert(v.ok === false && v.code === "unanchored_number", JSON.stringify(v));
});

await tryCase("causalidade continua rejeitada", () => {
  const raw = {
    headline: "Dias até a primeira reunião causam cancelamento.",
    executive_summary: "A AUC de 0,865 é a taxa de acerto do modelo. Há cobertura de 12%.",
    attention_points: [],
    positive_signals: [],
    recommended_actions: [],
    limitations: [{ title: "Cobertura", description: "Cobertura de 12% limita a generalização." }],
  };
  const v = validateAndNormalizeExecutiveAnalysis(raw, NPS_CTX);
  assert(v.ok === false && v.code === "causality_forbidden", JSON.stringify(v));
});

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.4.3 Gemini mocks ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
