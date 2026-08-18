/**
 * Testes da Etapa 8.3.2 — candidatos, merge, retry, causalidade.
 * Somente mocks. Sem chamada live. Sem Git. Sem n8n.
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
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GEMINI_API_KEY = "test-mock-key";
}

import {
  extractExecutiveCandidates,
  PILOT_DIRECTION_MAP,
  statisticalLanguageGuide,
  mergeDeterministicLimitations,
  bindActionsToEvidence,
  constrainPositives,
} from "./netlify/functions/_shared/executive-candidates.mjs";
import {
  generateExecutiveAnalysis,
  validateAndNormalizeExecutiveAnalysis,
  textHasForbiddenCausality,
  parseRetryAfterMs,
  computeBackoffMs,
  EXECUTIVE_SYSTEM_PROMPT,
  GEMINI_RETRY_POLICY,
  contextHasDisallowedPayload,
  findUnanchoredNumbers,
  collectAllowedNumbers,
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
  comparisons: [
    {
      metric: "latest_month_acquisitions",
      current: 12,
      previous: 28,
      relative_change: -57.1,
      absolute_change: -16,
      direction: "down",
      unit: "clients",
    },
  ],
  limitations: [],
  metadata: { engine_version: "1", page: "general", filters_applied: {}, ai_generated: false },
};

const MEETINGS_CTX = {
  page: "meetings",
  title: "Reuniões",
  kpis: [
    { metric: "attendance_rate", label: "Taxa de comparecimento", value: 85.4, unit: "percent", coverage: 18 },
    { metric: "no_show_rate", label: "Taxa de no-show", value: 14.6, unit: "percent", coverage: 18 },
    { metric: "meetings_completed_by_month", label: "Reuniões realizadas", value: 40, unit: "meetings" },
  ],
  signals: [{ code: "LOW_COVERAGE", metric: "attendance_rate", message: "A cobertura deste indicador é baixa." }],
  comparisons: [
    {
      metric: "meetings_completed_by_month",
      current: 40,
      previous: 87,
      relative_change: -54.0,
      absolute_change: -47,
      direction: "down",
      unit: "meetings",
    },
    {
      metric: "attendance_rate",
      current: 85.4,
      previous: 91.2,
      relative_change: -6.4,
      absolute_change: -5.8,
      direction: "down",
      unit: "percent",
    },
    {
      metric: "no_show_rate",
      current: 18.2,
      previous: 11.0,
      relative_change: 65.5,
      absolute_change: 7.2,
      direction: "up",
      unit: "percent",
    },
  ],
  limitations: [{ code: "LOW_COVERAGE", metric: "attendance_rate", message: "Cobertura baixa." }],
  metadata: { page: "meetings", ai_generated: false },
};

const NPS_CTX = {
  page: "statistical-crosses",
  title: "Análises Estatísticas",
  context: { population: 2304, filtered_population: 2304, coverage: 12 },
  kpis: [
    { metric: "sc_nps", label: "NPS nos cruzamentos", value: 64.8, unit: "index", status: "confirmed", coverage: 12 },
    { metric: "sc_nps_responses", label: "Respostas NPS válidas", value: 276, unit: "responses", status: "confirmed", coverage: 12 },
  ],
  signals: [{ code: "LOW_COVERAGE", metric: "sc_nps", message: "A cobertura deste indicador é baixa." }],
  comparisons: [],
  limitations: [{ code: "LOW_COVERAGE", metric: "sc_nps", message: "Cobertura de NPS em 12%." }],
  highlights: {
    topAssociations: [{ id: "daysToFirstMeeting", label: "Dias até primeira reunião", value: 0.4868, abs: 0.4868 }],
    topAuc: [{ id: "daysToFirstMeeting", label: "Dias até primeira reunião", auc: 0.865 }],
    topGroupDifferences: [{ id: "npsScore", label: "NPS", stdDiff: 0.42 }],
  },
  metadata: { page: "statistical-crosses", filters_applied: {}, ai_generated: false },
};

function emptyNarrative() {
  return {
    headline: "Leitura executiva do recorte oficial.",
    executive_summary: "Os fatos oficiais descrevem a situação atual da carteira neste recorte.",
    attention_points: [],
    positive_signals: [],
    recommended_actions: [],
    limitations: [],
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

function mockFetchSequence(seq) {
  let i = 0;
  return async (url, init) => {
    const step = seq[Math.min(i, seq.length - 1)];
    i += 1;
    mockFetchSequence.calls = i;
    if (typeof step === "number") {
      const headers = { "Content-Type": "application/json" };
      if (step === 429) headers["Retry-After"] = "1";
      return new Response(JSON.stringify({ error: { message: "busy" } }), { status: step, headers });
    }
    return mockFetchOk(step)(url, init);
  };
}

async function run() {
  await tryCase("candidate extraction: queda segura vira attention", () => {
    const c = extractExecutiveCandidates(MEETINGS_CTX);
    assert(c.attention_candidates.some((x) => x.metric === "meetings_completed_by_month"));
    assert(c.attention_candidates.some((x) => x.metric === "no_show_rate"));
    assert(!c.attention_candidates.some((x) => x.metric === "attendance_rate"), "queda 6.4% não atinge heurística 10");
    assert(c.limitation_candidates.some((x) => x.code === "LOW_COVERAGE"));
  });

  await tryCase("semantic direction map só com IDs piloto seguros", () => {
    assert(PILOT_DIRECTION_MAP.attendance_rate === "higher_is_better");
    assert(PILOT_DIRECTION_MAP.no_show_rate === "lower_is_better");
    assert(PILOT_DIRECTION_MAP.meetings_completed_by_month === "higher_is_contextually_positive");
    assert(PILOT_DIRECTION_MAP.latest_month_acquisitions === "higher_is_contextually_positive");
    assert(!("total_clients" in PILOT_DIRECTION_MAP));
    const gen = extractExecutiveCandidates(GENERAL_CTX);
    assert(gen.attention_candidates.some((x) => x.metric === "latest_month_acquisitions"));
    assert(gen.attention_candidates.some((x) => x.metric === "cancelled_without_confirmed_date"));
    assert(gen.positive_candidates.length === 0);
  });

  await tryCase("limitation obrigatória no merge mesmo se Gemini devolver []", () => {
    const c = extractExecutiveCandidates(NPS_CTX);
    const merged = mergeDeterministicLimitations([], c);
    assert(merged.length >= 1);
    assert(merged.some((x) => /cobertura/i.test(`${x.title} ${x.description}`)));
  });

  await tryCase("action baseada em evidência; sem evidência fica vazia", () => {
    const bound = bindActionsToEvidence(
      [{ title: "Investigar no-show", description: "Avaliar no_show_rate neste recorte.", based_on: [] }],
      {
        attention_points: [{ title: "No-show", description: "Subiu.", evidence: [{ metric: "no_show_rate", value: 18.2 }] }],
        limitations: [],
      },
    );
    assert(bound[0].based_on.includes("no_show_rate"));
    const empty = bindActionsToEvidence([{ title: "Brainstorm", description: "Fazer algo." }], {
      attention_points: [],
      limitations: [],
    });
    assert(empty.length === 0);
  });

  await tryCase("positive vazio não inventa sinal", () => {
    const c = extractExecutiveCandidates(GENERAL_CTX);
    const positives = constrainPositives([{ title: "Tudo ótimo", description: "Carteira perfeita." }], c);
    assert(positives.length === 0);
  });

  await tryCase("statistical category language", () => {
    assert(/associado/.test(statisticalLanguageGuide("association")));
    assert(/discrimina/.test(statisticalLanguageGuide("predictive_discrimination")));
    assert(/nunca "taxa de acerto"/.test(statisticalLanguageGuide("predictive_discrimination")));
    const c = extractExecutiveCandidates(NPS_CTX);
    assert(c.attention_candidates.some((x) => x.category === "association"));
    assert(c.attention_candidates.some((x) => x.category === "predictive_discrimination"));
    assert(c.statistical_fact_categories.topAuc === "predictive_discrimination");
  });

  await tryCase("prompt descreve fatos + candidatos e não força minItems", () => {
    assert(/executive_candidates/.test(EXECUTIVE_SYSTEM_PROMPT));
    assert(/NÃO é decidir sozinho/.test(EXECUTIVE_SYSTEM_PROMPT));
    assert(!/minItems/.test(EXECUTIVE_SYSTEM_PROMPT));
  });

  await tryCase("causalidade: negação permitida; afirmação bloqueada", () => {
    assert(textHasForbiddenCausality("Dias até a reunião causam cancelamento.").hit === true);
    assert(textHasForbiddenCausality("A AUC de 0,865 é a taxa de acerto.").hit === true);
    assert(textHasForbiddenCausality("O indicador está associado ao cancelamento, sem causalidade.").hit === false);
    const raw = {
      headline: "Dias até a primeira reunião causam cancelamento.",
      executive_summary: "A AUC de 0,865 é a taxa de acerto do modelo. Há cobertura de 12%.",
      attention_points: [],
      positive_signals: [],
      recommended_actions: [],
      limitations: [{ title: "Cobertura", description: "Cobertura de 12% limita a generalização." }],
    };
    const v = validateAndNormalizeExecutiveAnalysis(raw, NPS_CTX);
    assert(v.ok === false && v.code === "causality_forbidden");
  });

  await tryCase("causal regeneration: 1 correção e depois erro controlado", async () => {
    const bad = {
      headline: "Atraso na primeira reunião causa cancelamento.",
      executive_summary: "O atraso causa saída. Cobertura de 12%.",
      attention_points: [],
      positive_signals: [],
      recommended_actions: [],
      limitations: [{ title: "Cobertura", description: "Cobertura de 12%." }],
    };
    const good = {
      headline: "Atraso na primeira reunião está associado ao cancelamento.",
      executive_summary: "O indicador apresentou relação no recorte. Cobertura de 12%. AUC descreve capacidade de discriminação, não taxa de acerto.",
      attention_points: [{
        severity: "attention",
        title: "Associação observada",
        description: "daysToFirstMeeting está associado ao cancelamento.",
        evidence: [{ metric: "daysToFirstMeeting", value: 0.4868, unit: "association" }],
      }],
      positive_signals: [],
      recommended_actions: [],
      limitations: [{ title: "Cobertura NPS", description: "Cobertura de 12%." }],
    };
    const seq = mockFetchSequence([bad, good]);
    const ok = await generateExecutiveAnalysis(NPS_CTX, {
      fetchImpl: seq,
      sleepImpl: async () => {},
      jitterFn: () => 0,
      includeDebug: true,
    });
    assert(ok.success, ok.error);
    assert(mockFetchSequence.calls === 2, `calls=${mockFetchSequence.calls}`);
    assert(ok.generation_debug.causal_regenerated === true);

    const twice = mockFetchSequence([bad, bad]);
    const fail = await generateExecutiveAnalysis(NPS_CTX, {
      fetchImpl: twice,
      sleepImpl: async () => {},
      jitterFn: () => 0,
    });
    assert(fail.success === false && fail.reason === "causality_forbidden", JSON.stringify(fail));
    assert(mockFetchSequence.calls === 2, "não pode loopar causalidade");
  });

  await tryCase("retry 429 com Retry-After, máximo 2 extras", async () => {
    assert(GEMINI_RETRY_POLICY.extraAttempts === 2);
    const headers = { get: (k) => (String(k).toLowerCase() === "retry-after" ? "2" : null) };
    assert(parseRetryAfterMs({ headers }) === 2000);
    assert(computeBackoffMs(0, null, () => 0) === 800);
    assert(computeBackoffMs(1, null, () => 0) === 1600);
    assert(computeBackoffMs(0, 1000, () => 0, 429) === 4000);
    assert(computeBackoffMs(1, 1000, () => 0, 429) === 8000);
    const seq = mockFetchSequence([429, 429, emptyNarrative()]);
    const result = await generateExecutiveAnalysis(GENERAL_CTX, {
      fetchImpl: seq,
      sleepImpl: async () => {},
      jitterFn: () => 0,
      includeDebug: true,
    });
    assert(result.success, result.error);
    assert(mockFetchSequence.calls === 3, `calls=${mockFetchSequence.calls}`);
  });

  await tryCase("retry 503 e aborta depois do teto", async () => {
    const seq = mockFetchSequence([503, 503, 503]);
    const result = await generateExecutiveAnalysis(GENERAL_CTX, {
      fetchImpl: seq,
      sleepImpl: async () => {},
      jitterFn: () => 0,
    });
    assert(result.success === false && result.reason === "unavailable", JSON.stringify(result));
    assert(mockFetchSequence.calls === 3, `calls=${mockFetchSequence.calls}`);
  });

  await tryCase("zero PII no contexto enviado", async () => {
    assert(contextHasDisallowedPayload({ note: "ana@quartavia.com.br" }) === true);
    const fetchImpl = mockFetchOk(emptyNarrative());
    const result = await generateExecutiveAnalysis(GENERAL_CTX, { fetchImpl, includeDebug: true });
    assert(result.success, result.error);
    const userText = mockFetchOk.last.body.contents[0].parts[0].text;
    assert(userText.includes("CANDIDATOS EXECUTIVOS"));
    assert(!userText.includes("@"));
  });

  await tryCase("number anchoring rejeita valor inventado", () => {
    const raw = {
      headline: "NPS elevado na carteira.",
      executive_summary: "Os clientes da QuartaVia estão altamente satisfeitos, com cobertura de 20%.",
      attention_points: [],
      positive_signals: [],
      recommended_actions: [],
      limitations: [{ title: "Nada", description: "Sem limitação." }],
    };
    const v = validateAndNormalizeExecutiveAnalysis(raw, NPS_CTX);
    assert(v.ok === false && v.code === "unanchored_number");
    const ok = {
      headline: "Leitura do recorte.",
      executive_summary: "Há cobertura de 12% e NPS de 64,8 entre respondentes.",
      attention_points: [],
      positive_signals: [],
      recommended_actions: [],
      limitations: [{ title: "Cobertura", description: "Cobertura de 12%." }],
    };
    const issues = findUnanchoredNumbers(ok, collectAllowedNumbers(NPS_CTX));
    assert(issues.length === 0, JSON.stringify(issues));
  });

  await tryCase("Gemini vazio ainda preenche attention/limitation/action pelos candidatos", async () => {
    const result = await generateExecutiveAnalysis(MEETINGS_CTX, {
      fetchImpl: mockFetchOk(emptyNarrative()),
      includeDebug: true,
    });
    assert(result.success, result.error);
    assert(result.executive_analysis.attention_points.length >= 1);
    assert(result.executive_analysis.limitations.length >= 1);
    assert(result.executive_analysis.recommended_actions.length >= 1);
    assert(result.executive_analysis.recommended_actions.every((a) => Array.isArray(a.based_on) && a.based_on.length));
    assert(result.metadata.engine_ai_version === "2");
  });

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Etapa 8.3.2 ---");
  console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
  if (failed.length) {
    process.exitCode = 1;
    for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
  }
}

await run();
