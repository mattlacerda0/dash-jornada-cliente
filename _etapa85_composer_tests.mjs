/**
 * Etapa 8.5 — Composer determinístico, fallback Gemini, cache.
 * Sem Git. Sem n8n. Live Gemini no máximo via mock.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
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

import { composeDeterministicAnalysis, analysisHasForbiddenCausality } from "./netlify/functions/_shared/executive-composer.mjs";
import { extractCandidatesFromSnapshot } from "./netlify/functions/_shared/executive-candidates.mjs";
import { deliverExecutiveAnalysis } from "./netlify/functions/_shared/executive-delivery.mjs";
import { applyRefinedWording } from "./netlify/functions/_shared/executive-ai.mjs";
import { resetExecutiveCache } from "./netlify/functions/_shared/executive-cache.mjs";
import { buildExecutiveAnalysis } from "./netlify/functions/_shared/executive-analysis.mjs";

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

function loadSnapshot(page) {
  const file = resolve(root, `docs/debug-executive-snapshot-${page}.json`);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return raw.executive_snapshot || raw;
}

function engineFromSnapshot(page, snapshot) {
  return {
    success: true,
    page,
    title: snapshot.page_profile?.title || page,
    analysis_context: {
      page,
      executive_snapshot: snapshot,
      kpis: [],
      signals: [],
      limitations: [],
      metadata: {
        page,
        scope: snapshot.scope,
        timing_ms: { compute_payload: 0, snapshot: 1, engine: 0 },
      },
    },
  };
}

function hasSchema(analysis) {
  assert(typeof analysis.headline === "string" && analysis.headline.length > 8, "headline");
  assert(typeof analysis.executive_summary === "string" && analysis.executive_summary.length > 8, "summary");
  assert(Array.isArray(analysis.highlight_numbers));
  assert(analysis.highlight_numbers.length <= 4);
  assert(Array.isArray(analysis.attention_points) && analysis.attention_points.length <= 5);
  assert(Array.isArray(analysis.positive_signals) && analysis.positive_signals.length <= 2);
  assert(Array.isArray(analysis.recommended_actions) && analysis.recommended_actions.length <= 3);
  assert(Array.isArray(analysis.limitations));
  assert(analysis.scope);
}

function mockFetchStatus(status) {
  return async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status });
}

function mockFetchOk(payload) {
  return async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchTimeout() {
  return async (_url, init) => {
    await new Promise((_, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
        return;
      }
      signal.addEventListener("abort", () => {
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };
}

resetExecutiveCache();

await tryCase("composer general: schema, highlights oficiais, sem PII", () => {
  const snap = loadSnapshot("general");
  const cands = extractCandidatesFromSnapshot(snap);
  const out = composeDeterministicAnalysis(snap, cands);
  const a = out.executive_analysis;
  hasSchema(a);
  assert(a.highlight_numbers[0].metric === "active_clients");
  assert(a.highlight_numbers[0].value === snap.highlight_numbers[0].value);
  assert(/clientes ativos/i.test(a.headline));
  assert(!JSON.stringify(a).includes("@"));
  assert(out.metadata.generation_mode === "deterministic");
  return a.headline;
});

await tryCase("composer meetings: cobertura e ativos sem reunião", () => {
  const snap = loadSnapshot("meetings");
  const a = composeDeterministicAnalysis(snap).executive_analysis;
  hasSchema(a);
  assert(/reunião/i.test(a.headline));
  assert(a.highlight_numbers.some((h) => h.metric === "meeting_coverage_rate"));
  assert(a.attention_points.length >= 1);
  return a.headline;
});

await tryCase("composer statistics: associação sem causalidade", () => {
  const snap = loadSnapshot("statistical-crosses");
  const a = composeDeterministicAnalysis(snap).executive_analysis;
  hasSchema(a);
  assert(!analysisHasForbiddenCausality(a), a.headline);
  assert(!/causam|causa |taxa de acerto/i.test(`${a.headline} ${a.executive_summary}`));
  assert(a.highlight_numbers.length >= 1);
  return a.headline;
});

await tryCase("429 do Gemini não quebra a análise", async () => {
  resetExecutiveCache();
  const snap = loadSnapshot("general");
  const prev = process.env.AI_ANALYSIS_GEMINI_ENABLED;
  process.env.AI_ANALYSIS_GEMINI_ENABLED = "true";
  try {
    const result = await deliverExecutiveAnalysis(
      { page: "general", filters: {}, generate: true },
      { engineResult: engineFromSnapshot("general", snap), fetchImpl: mockFetchStatus(429) },
    );
    assert(result.success === true, JSON.stringify({ success: result.success, code: result.code }));
    assert(result.executive_analysis?.headline);
    assert(result.metadata.generation_mode === "deterministic");
    assert(result.metadata.gemini_fallback_reason === "rate_limited" || result.metadata.gemini_fallback_reason);
  } finally {
    process.env.AI_ANALYSIS_GEMINI_ENABLED = prev;
  }
});

await tryCase("timeout do Gemini não quebra a análise", async () => {
  resetExecutiveCache();
  const snap = loadSnapshot("meetings");
  const prev = process.env.AI_ANALYSIS_GEMINI_ENABLED;
  process.env.AI_ANALYSIS_GEMINI_ENABLED = "true";
  try {
    const result = await deliverExecutiveAnalysis(
      { page: "meetings", filters: {}, generate: true },
      {
        engineResult: engineFromSnapshot("meetings", snap),
        fetchImpl: mockFetchTimeout(),
        geminiTimeoutMs: 30,
      },
    );
    assert(result.success === true, result.error || result.code);
    assert(result.executive_analysis?.headline);
    assert(result.metadata.generation_mode === "deterministic");
  } finally {
    process.env.AI_ANALYSIS_GEMINI_ENABLED = prev;
  }
});

await tryCase("Gemini success refina texto e preserva fatos", async () => {
  resetExecutiveCache();
  const snap = loadSnapshot("general");
  const base = composeDeterministicAnalysis(snap).executive_analysis;
  const prev = process.env.AI_ANALYSIS_GEMINI_ENABLED;
  process.env.AI_ANALYSIS_GEMINI_ENABLED = "true";
  const refinedPayload = {
    headline: "A carteira ativa permanece como o recorte central desta leitura.",
    executive_summary: base.executive_summary,
    attention_points: base.attention_points,
    positive_signals: base.positive_signals,
    recommended_actions: base.recommended_actions,
    limitations: base.limitations,
    highlight_numbers: [{ metric: "invented", value: 9999 }],
  };
  try {
    const result = await deliverExecutiveAnalysis(
      { page: "general", filters: { _t: "refine" }, generate: true },
      { engineResult: engineFromSnapshot("general", snap), fetchImpl: mockFetchOk(refinedPayload) },
    );
    assert(result.success, result.error);
    assert(result.metadata.generation_mode === "gemini_refined");
    assert(result.executive_analysis.headline === refinedPayload.headline);
    assert(JSON.stringify(result.executive_analysis.highlight_numbers) === JSON.stringify(base.highlight_numbers));
    assert(JSON.stringify(result.executive_analysis.scope) === JSON.stringify(base.scope));
    assert(result.executive_analysis.attention_points.length === base.attention_points.length);
    for (let i = 0; i < base.attention_points.length; i += 1) {
      assert(JSON.stringify(result.executive_analysis.attention_points[i].evidence)
        === JSON.stringify(base.attention_points[i].evidence));
    }
  } finally {
    process.env.AI_ANALYSIS_GEMINI_ENABLED = prev;
  }
});

await tryCase("applyRefinedWording ignora highlight inventado", () => {
  const snap = loadSnapshot("general");
  const base = composeDeterministicAnalysis(snap).executive_analysis;
  const merged = applyRefinedWording(base, {
    headline: "Texto novo.",
    highlight_numbers: [{ metric: "fake", value: 1 }],
  });
  assert(merged.headline === "Texto novo.");
  assert(merged.highlight_numbers[0].metric === base.highlight_numbers[0].metric);
});

await tryCase("Gemini desligado usa só o composer", async () => {
  resetExecutiveCache();
  const snap = loadSnapshot("statistical-crosses");
  const result = await deliverExecutiveAnalysis(
    { page: "statistical-crosses", filters: { _t: "off" }, generate: true },
    { engineResult: engineFromSnapshot("statistical-crosses", snap), skipGemini: true },
  );
  assert(result.success);
  assert(result.metadata.generation_mode === "deterministic");
  assert(result.metadata.ai_generated === false);
  assert(!analysisHasForbiddenCausality(result.executive_analysis));
});

await tryCase("cache hit na segunda abertura", async () => {
  resetExecutiveCache();
  const snap = loadSnapshot("general");
  const engine = engineFromSnapshot("general", snap);
  const first = await deliverExecutiveAnalysis(
    { page: "general", filters: { _t: "cache" }, generate: true },
    { engineResult: engine, skipGemini: true },
  );
  const second = await deliverExecutiveAnalysis(
    { page: "general", filters: { _t: "cache" }, generate: true },
    { engineResult: engine, skipGemini: true },
  );
  assert(first.success && second.success);
  assert(second.metadata.cache_hit === true);
  assert(second.executive_analysis.headline === first.executive_analysis.headline);
});

resetExecutiveCache();
const perf = {};
for (const page of ["general", "meetings", "statistical-crosses"]) {
  await tryCase(`performance determinística: ${page}`, async () => {
    const prev = process.env.AI_ANALYSIS_GEMINI_ENABLED;
    process.env.AI_ANALYSIS_GEMINI_ENABLED = "false";
    try {
      const t0 = Date.now();
      const result = await deliverExecutiveAnalysis({ page, filters: {}, generate: true });
      const wall = Date.now() - t0;
      assert(result.success, result.error || result.code);
      assert(result.executive_analysis?.headline);
      const t = result.timing_ms || {};
      perf[page] = {
        compute: t.compute_payload,
        snapshot: t.snapshot,
        composer: t.composer,
        gemini: t.gemini,
        total: t.total,
        wall_ms: wall,
        generation_mode: result.metadata.generation_mode,
        headline: result.executive_analysis.headline,
        highlights: result.executive_analysis.highlight_numbers,
        attention: result.executive_analysis.attention_points.length,
        positive: result.executive_analysis.positive_signals.length,
        actions: result.executive_analysis.recommended_actions.length,
        limitations: result.executive_analysis.limitations.length,
      };
      return `compute=${t.compute_payload} snapshot=${t.snapshot} composer=${t.composer} total=${t.total} wall=${wall}`;
    } finally {
      process.env.AI_ANALYSIS_GEMINI_ENABLED = prev;
    }
  });
}

await tryCase("cache hit após compute real", async () => {
  const t0 = Date.now();
  const result = await deliverExecutiveAnalysis({ page: "general", filters: {}, generate: true });
  const wall = Date.now() - t0;
  assert(result.success);
  assert(result.metadata.cache_hit === true);
  perf.general_cache_hit_ms = wall;
  return `${wall}ms`;
});

writeFileSync(resolve(root, "docs/_etapa85_timing.json"), JSON.stringify(perf, null, 2));

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.5 ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
