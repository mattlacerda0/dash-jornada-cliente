/**
 * Etapa 8.6 — linguagem humana no modal executivo.
 * Sem Git. Sem Gemini live.
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
if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = "test-mock-key";

import { composeDeterministicAnalysis } from "./netlify/functions/_shared/executive-composer.mjs";
import { extractCandidatesFromSnapshot } from "./netlify/functions/_shared/executive-candidates.mjs";
import {
  FORBIDDEN_VISIBLE,
  getExecutiveMetricLabel,
  visibleAnalysisHasTechnicalLeak,
  visibleExecutiveText,
} from "./netlify/functions/_shared/executive-labels.mjs";
import { deliverExecutiveAnalysis } from "./netlify/functions/_shared/executive-delivery.mjs";
import { REFINEMENT_SYSTEM_PROMPT, EXECUTIVE_SYSTEM_PROMPT } from "./netlify/functions/_shared/executive-ai.mjs";
import { resetExecutiveCache } from "./netlify/functions/_shared/executive-cache.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert");
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
      metadata: { page, scope: snapshot.scope, timing_ms: {} },
    },
  };
}

function assertClean(analysis) {
  const leak = visibleAnalysisHasTechnicalLeak(analysis);
  assert(!leak.hit, leak.snippet);
  const text = visibleExecutiveText(analysis);
  for (const token of FORBIDDEN_VISIBLE) {
    assert(!text.includes(token), token);
  }
}

await tryCase("labels preferem catálogo/override humano", () => {
  assert(getExecutiveMetricLabel("active_clients") === "Clientes ativos");
  assert(getExecutiveMetricLabel("attendance_rate") === "Taxa de comparecimento");
  assert(getExecutiveMetricLabel("latest_month_acquisitions") === "Novas aquisições");
  assert(getExecutiveMetricLabel("meetings_completed_by_month") === "Reuniões realizadas");
  assert(getExecutiveMetricLabel("no_show_rate") === "Taxa de ausência");
  assert(getExecutiveMetricLabel("never_met") === "Clientes ativos sem reunião");
});

await tryCase("Dados Gerais: card positivo sem metric id", () => {
  const snap = loadSnapshot("general");
  const a = composeDeterministicAnalysis(snap, extractCandidatesFromSnapshot(snap)).executive_analysis;
  assertClean(a);
  const pos = a.positive_signals[0];
  assert(pos, "positive ausente");
  assert(!/latest_month_acquisitions/i.test(`${pos.title} ${pos.description}`));
  assert(/aquisi/i.test(`${pos.title} ${pos.description}`));
  assert(pos.evidence.every((e) => e.label && !e.label.includes("_")));
  const techLim = (a.limitations || []).some((l) => /vw_info_cliente|timeout|fallback/i.test(`${l.title} ${l.description}`));
  assert(!techLim, "limitação técnica visível");
  return pos.title;
});

await tryCase("Reuniões: attention sem meetings_completed_by_month", () => {
  const snap = loadSnapshot("meetings");
  const a = composeDeterministicAnalysis(snap).executive_analysis;
  assertClean(a);
  const blob = a.attention_points.map((c) => `${c.title} ${c.description}`).join(" ");
  assert(!/meetings_completed_by_month/.test(blob));
  assert(/reuni/i.test(blob) || /acompanh/i.test(blob) || /contato/i.test(blob));
  return a.attention_points.map((c) => c.title).join(" | ");
});

await tryCase("Cancelamentos: limitação humana, não campo/tabela", () => {
  const snap = loadSnapshot("general");
  const composed = composeDeterministicAnalysis(snap);
  const a = composed.executive_analysis;
  const lim = (a.limitations || []).find((l) => /cancel/i.test(`${l.title} ${l.description}`));
  assert(lim, "limitação de cancelamento ausente");
  assert(/811/.test(lim.description) || /sem uma data/i.test(lim.description));
  assert(!/null|tabela|coluna|vw_/i.test(lim.description));
  const debug = composed.debug_limitations || [];
  assert(debug.some((d) => d.code === "TECHNICAL" || /vw_info_cliente|timeout/i.test(d.message || "")));
  return lim.description;
});

await tryCase("Estatísticas visíveis sem linguagem técnica", () => {
  const a = composeDeterministicAnalysis(loadSnapshot("statistical-crosses")).executive_analysis;
  assertClean(a);
  assert(!/\bAUC\b/.test(visibleExecutiveText(a)));
  assert(!/n=/.test(visibleExecutiveText(a)));
});

await tryCase("prompt Gemini proíbe identificadores técnicos", () => {
  assert(/Nunca exponha identificadores técnicos/.test(REFINEMENT_SYSTEM_PROMPT));
  assert(/Traduza qualquer conceito técnico/.test(REFINEMENT_SYSTEM_PROMPT));
  assert(/Nunca exponha identificadores técnicos/.test(EXECUTIVE_SYSTEM_PROMPT));
});

await tryCase("Gemini técnico é rejeitado e cai no texto humano", async () => {
  resetExecutiveCache();
  const snap = loadSnapshot("general");
  process.env.AI_ANALYSIS_GEMINI_ENABLED = "true";
  const dirty = {
    headline: "Timeout em vw_info_cliente distorce latest_month_acquisitions.",
    executive_summary: "Há fallback para data_inicio_ciclo e created_at.",
    attention_points: [],
    positive_signals: [],
    recommended_actions: [],
    limitations: [],
  };
  const result = await deliverExecutiveAnalysis(
    { page: "general", filters: { _t: "lang" }, generate: true },
    {
      engineResult: engineFromSnapshot("general", snap),
      fetchImpl: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(dirty) }] } }],
      }), { status: 200 }),
    },
  );
  assert(result.success);
  assert(result.metadata.generation_mode === "deterministic");
  assertClean(result.executive_analysis);
});

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.6 linguagem ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
