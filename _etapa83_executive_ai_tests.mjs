/**
 * Testes da Etapa 8.3 — Executive AI (Gemini).
 * Mocks para validação. Chamada real só se GEMINI_API_KEY existir.
 * Sem Git. Sem n8n. Backup Base QV somente leitura quando o teste live roda.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const LIVE_GEMINI_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GEMINI_API_KEY = "test-mock-key";
}

import { buildExecutiveAnalysis } from "./netlify/functions/_shared/executive-analysis.mjs";
import {
  generateExecutiveAnalysis,
  validateAndNormalizeExecutiveAnalysis,
  prepareGeminiContext,
  contextHasDisallowedPayload,
  EXECUTIVE_SYSTEM_PROMPT,
  GEMINI_TEMPERATURE,
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

const GENERAL_CTX = {
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
  metadata: { engine_version: "1", page: "general", filters_applied: {}, ai_generated: false },
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

function validGeneralAnalysis(overrides = {}) {
  return {
    headline: "A carteira permanece majoritariamente ativa, mas há volume relevante de cancelamentos sem data confirmada.",
    executive_summary: "Há 3416 clientes, dos quais 1816 estão ativos. O principal ponto de atenção são 811 cancelados sem data confirmada. A permanência típica é de 292 dias, com cobertura de 75,9%.",
    attention_points: [
      {
        severity: "attention",
        title: "Cancelamentos sem data confirmada",
        description: "Há 811 clientes nessa situação e o número precisa ser investigado operacionalmente.",
        evidence: [{ metric: "cancelled_without_confirmed_date", value: 811, unit: "clients" }],
      },
    ],
    positive_signals: [
      {
        title: "Maioria ativa",
        description: "1816 clientes ativos formam a maior parte da carteira neste recorte.",
        evidence: [{ metric: "active_clients", value: 1816, unit: "clients" }],
      },
    ],
    recommended_actions: [
      {
        title: "Investigar cancelamentos sem data",
        description: "Avaliar a qualidade do registro de data nos 811 casos sem confirmação.",
      },
    ],
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

function mockFetchStatus(status) {
  return async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status });
}

async function run() {
  await tryCase("prompt exige JSON, sem causalidade e sem inventar números", () => {
    assert(/Retorne SOMENTE JSON válido/.test(EXECUTIVE_SYSTEM_PROMPT));
    assert(/Nunca invente valores/.test(EXECUTIVE_SYSTEM_PROMPT));
    assert(/causalidade/.test(EXECUTIVE_SYSTEM_PROMPT));
    assert(GEMINI_TEMPERATURE === 0.2);
  });

  await tryCase("contexto enviado ao Gemini é agregado e sem PII", async () => {
    const slim = prepareGeminiContext({
      ...GENERAL_CTX,
      metadata: { ...GENERAL_CTX.metadata, timing_ms: { engine: 2 }, heuristics: { topN: 5 }, payload_bytes: 999 },
    });
    assert(!slim.metadata.timing_ms, "timing vazou");
    assert(!slim.metadata.heuristics, "heuristics vazou");
    assert(slim.metadata.ai_generated === false);
    const withPii = { note: "ana@quartavia.com.br", kpis: [] };
    assert(contextHasDisallowedPayload(withPii) === true);
    const fetchImpl = mockFetchOk(validGeneralAnalysis());
    const result = await generateExecutiveAnalysis(GENERAL_CTX, { fetchImpl });
    assert(result.success, result.error);
    const userText = mockFetchOk.last.body.contents[0].parts[0].text;
    assert(!/"clients"\s*:\s*\[/.test(userText), "array clients enviado");
    assert(!userText.includes("@"), "email no prompt");
    assert(userText.includes("3416"));
  });

  await tryCase("JSON válido é normalizado (severity allowlist e máximos)", () => {
    const raw = validGeneralAnalysis({
      attention_points: [
        { severity: "high", title: "A", description: "Há 811 casos." },
        { severity: "urgent", title: "B", description: "Há 811 casos." },
        { severity: "critical", title: "C", description: "Há 811 casos." },
        { severity: "attention", title: "D", description: "Há 811 casos." },
        { severity: "attention", title: "E", description: "Há 811 casos." },
        { severity: "attention", title: "F", description: "Há 811 casos." },
        { severity: "attention", title: "G", description: "Há 811 casos." },
      ],
    });
    const v = validateAndNormalizeExecutiveAnalysis(raw, GENERAL_CTX);
    assert(v.ok, v.error);
    assert(v.analysis.attention_points.length === 3, String(v.analysis.attention_points.length));
    assert(v.analysis.attention_points.every((p) => p.severity === "critical" || p.severity === "attention"));
    assert(!v.analysis.attention_points.some((p) => p.title === "B"), "urgent não deveria passar como ponto");
    assert(v.analysis.attention_points[0].severity === "attention");
  });

  await tryCase("número inventado (20% vs 9%/12%) é rejeitado", () => {
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

  await tryCase("baixa cobertura exige reconhecimento da limitação", () => {
    const raw = {
      headline: "NPS de 64,8 indica satisfação elevada.",
      executive_summary: "Os clientes da QuartaVia estão altamente satisfeitos segundo o NPS de 64,8.",
      attention_points: [],
      positive_signals: [{ title: "NPS", description: "Índice 64,8 é positivo.", evidence: [{ metric: "sc_nps", value: 64.8, unit: "index" }] }],
      recommended_actions: [],
      limitations: [],
    };
    const v = validateAndNormalizeExecutiveAnalysis(raw, NPS_CTX);
    assert(v.ok === false && v.code === "limitation_ignored", JSON.stringify(v));
  });

  await tryCase("needs_business_validation vira limitação obrigatória", () => {
    const ctx = {
      ...GENERAL_CTX,
      signals: [{ code: "NEEDS_BUSINESS_VALIDATION", metric: "median_stay_days", message: "Precisa validação." }],
    };
    const raw = validGeneralAnalysis({ limitations: [] });
    raw.executive_summary = "Há 3416 clientes e 1816 ativos, com permanência de 292 dias.";
    const v = validateAndNormalizeExecutiveAnalysis(raw, ctx);
    assert(v.ok === false && v.code === "limitation_ignored", JSON.stringify(v));
  });

  await tryCase("correlação não pode ser causalidade (Análises Estatísticas)", () => {
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

  await tryCase("evidence ancora no contexto; evidência inventada é descartada", () => {
    const raw = validGeneralAnalysis({
      attention_points: [{
        severity: "attention",
        title: "Cancelamentos sem data",
        description: "Há 811 clientes nessa situação.",
        evidence: [
          { metric: "cancelled_without_confirmed_date", value: 811, unit: "clients" },
          { metric: "cancelled_without_confirmed_date", value: 99999, unit: "clients" },
        ],
      }],
    });
    const v = validateAndNormalizeExecutiveAnalysis(raw, GENERAL_CTX);
    assert(v.ok, v.error);
    assert(v.analysis.attention_points[0].evidence.length === 1);
    assert(v.analysis.attention_points[0].evidence[0].value === 811);
  });

  await tryCase("erro do Gemini devolve ai_generation_failed", async () => {
    const result = await generateExecutiveAnalysis(GENERAL_CTX, { fetchImpl: mockFetchStatus(500) });
    assert(result.success === false && result.code === "ai_generation_failed", JSON.stringify(result));
  });

  await tryCase("JSON inválido do modelo é rejeitado (extração segura)", async () => {
    const result = await generateExecutiveAnalysis(GENERAL_CTX, { fetchImpl: mockFetchOk("não é json") });
    assert(result.success === false && result.code === "ai_generation_failed", result.error);
  });

  await tryCase("sem credencial → ai_not_configured", async () => {
    const prev = process.env.GEMINI_API_KEY;
    const prev2 = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    try {
      const result = await generateExecutiveAnalysis(GENERAL_CTX, { fetchImpl: mockFetchOk(validGeneralAnalysis()) });
      assert(result.success === false && result.code === "ai_not_configured", JSON.stringify(result));
    } finally {
      if (prev) process.env.GEMINI_API_KEY = prev;
      if (prev2) process.env.GOOGLE_GENERATIVE_AI_API_KEY = prev2;
      if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = "test-mock-key";
    }
  });

  await tryCase("página fora do piloto permanece page_not_supported com generate", async () => {
    const r = await buildExecutiveAnalysis({ page: "cancellations" });
    assert(r.success === false && r.code === "page_not_supported");
  });

  await tryCase("análise mockada de Dados Gerais passa na validação", async () => {
    const result = await generateExecutiveAnalysis(GENERAL_CTX, { fetchImpl: mockFetchOk(validGeneralAnalysis()) });
    assert(result.success && result.metadata.ai_generated === true, result.error);
    assert(result.executive_analysis.attention_points.length >= 1);
    assert(result.metadata.temperature === 0.2);
  });

  const live = {};
  if (LIVE_GEMINI_KEY && process.env.EXECUTIVE_AI_LIVE === "1") {
    process.env.GEMINI_API_KEY = LIVE_GEMINI_KEY;
    const pages = ["general", "meetings", "statistical-crosses"];
    for (const page of pages) {
      await tryCase(`LIVE Gemini: ${page}`, async () => {
        const engine = await buildExecutiveAnalysis({ page, filters: {} });
        assert(engine.success, engine.error || engine.code);
        const t0 = Date.now();
        const ai = await generateExecutiveAnalysis(engine.analysis_context);
        const total = (engine.analysis_context?.metadata?.timing_ms?.compute_payload || 0)
          + (engine.analysis_context?.metadata?.timing_ms?.engine || 0)
          + (ai.timing_ms?.gemini || Date.now() - t0);
        live[page] = {
          ok: ai.success,
          headline: ai.executive_analysis?.headline || null,
          attention: ai.executive_analysis?.attention_points?.length ?? 0,
          positive: ai.executive_analysis?.positive_signals?.length ?? 0,
          actions: ai.executive_analysis?.recommended_actions?.length ?? 0,
          limitations: ai.executive_analysis?.limitations?.length ?? 0,
          engineMs: engine.analysis_context?.metadata?.timing_ms?.engine,
          computeMs: engine.analysis_context?.metadata?.timing_ms?.compute_payload,
          geminiMs: ai.timing_ms?.gemini,
          totalMs: total,
          error: ai.success ? null : ai.error,
        };
        assert(ai.success, ai.error || ai.code);
        const blob = JSON.stringify(ai.executive_analysis).toLowerCase();
        if (page === "statistical-crosses") {
          assert(!/\bcausam\b|\bcausa\b|taxa de acerto/.test(blob), "causalidade/AUC como acerto");
        }
        return `${live[page].headline} | att=${live[page].attention} pos=${live[page].positive} act=${live[page].actions} lim=${live[page].limitations} gemini=${live[page].geminiMs}ms total=${live[page].totalMs}ms`;
      });
    }
    console.log("LIVE_SUMMARY", JSON.stringify(live));
  } else if (LIVE_GEMINI_KEY) {
    await tryCase("LIVE Gemini: skip (suíte mock; use EXECUTIVE_AI_LIVE=1)", () => "live separado para evitar 429");
  } else {
    await tryCase("LIVE Gemini: chave ausente (skip controlado)", () => "GEMINI_API_KEY não configurada — integração implementada; endpoint devolve ai_not_configured");
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Etapa 8.3 ---");
  console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
  if (failed.length) {
    process.exitCode = 1;
    for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
  }
}

await run();
