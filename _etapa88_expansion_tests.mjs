/**
 * Etapa 8.8 — expansão da análise executiva (Renovação, EP, Temporais)
 * e refinamento visual dos big numbers.
 * Sem Git. Sem deploy. Sem n8n.
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

import { composeExecutiveAnalysis } from "./netlify/functions/_shared/executive-analysis.mjs";
import { composeDeterministicAnalysis, analysisHasForbiddenCausality } from "./netlify/functions/_shared/executive-composer.mjs";
import { extractCandidatesFromSnapshot } from "./netlify/functions/_shared/executive-candidates.mjs";
import { deliverExecutiveAnalysis } from "./netlify/functions/_shared/executive-delivery.mjs";
import { visibleAnalysisHasTechnicalLeak } from "./netlify/functions/_shared/executive-labels.mjs";
import { getExecutivePageProfile } from "./netlify/functions/_shared/executive-page-profiles.mjs";
import { snapshotHasDisallowedPayload, estimateJsonBytes } from "./netlify/functions/_shared/executive-snapshot.mjs";

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

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const RANKING_RE = /\b(pior|lanterna|ranking|benchmark)\b/i;

function analysisText(analysis) {
  return [
    analysis?.headline,
    analysis?.executive_summary,
    ...(analysis?.attention_points || []).map((c) => `${c.title} ${c.description}`),
    ...(analysis?.positive_signals || []).map((c) => `${c.title} ${c.description}`),
    ...(analysis?.recommended_actions || []).map((c) => `${c.title} ${c.description}`),
    ...(analysis?.limitations || []).map((c) => `${c.title} ${c.description}`),
    ...(analysis?.highlight_numbers || []).map((h) => h.label),
  ].join(" ");
}

function assertHuman(analysis) {
  assert(!analysisHasForbiddenCausality(analysis), "causalidade");
  const leak = visibleAnalysisHasTechnicalLeak(analysis);
  assert(!leak.hit, leak.snippet || "vazamento técnico");
  const text = analysisText(analysis);
  assert(!EMAIL_RE.test(text), "PII/e-mail no texto visível");
  assert(!/\b(vw_|public\.|payload|schema|metric id)\b/i.test(text), text.slice(0, 180));
}

const renewalPayload = {
  generatedAt: "2026-07-01T00:00:00.000Z",
  clients: [
    { currentCycle: 1, renewed: false, renewalCount: 0 },
    { currentCycle: 1, renewed: false, renewalCount: 0 },
    { currentCycle: 2, renewed: true, renewalCount: 1 },
    { currentCycle: 3, renewed: true, renewalCount: 2 },
    { currentCycle: null, renewed: false, renewalCount: 0 },
  ],
  summary: {
    totalClients: 5,
    renewedClients: 2,
    notRenewedClients: 3,
    maxCycle: 3,
    totalRenewals: 3,
  },
};

function makeEpClients(count, { status = "Ativo", meetings = 1, nps = null, mech = 0, prefix = "c", cancelledCount = 0 } = {}) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      clientId: `${prefix}-${i}`,
      clientName: `Cliente ${prefix} ${i}`,
      analyticalStatus: status,
      totalMeetings: meetings,
      npsScore: nps,
      implementedMechanisms: mech,
      hasImplementedMechanism: mech > 0,
    });
  }
  for (let i = 0; i < cancelledCount; i += 1) {
    rows.push({
      clientId: `${prefix}-x-${i}`,
      clientName: `Cancelado ${prefix} ${i}`,
      analyticalStatus: "Cancelado",
      totalMeetings: 0,
      npsScore: null,
      implementedMechanisms: 0,
      hasImplementedMechanism: false,
    });
  }
  return rows;
}

function epBucket(engineer, active, opts) {
  return { engineer, clients: makeEpClients(active, { ...opts, prefix: engineer.replace(/\s+/g, "").toLowerCase() }) };
}

const epPayload = {
  generatedAt: "2026-07-01T00:00:00.000Z",
  summary: {
    advisorsWithPortfolio: 9,
    totalEngineers: 9,
    totalClients: 3416,
    activeClients: 1807,
    meetingCoverage: 46.9,
    cancelledWithoutConfirmedDate: 2,
  },
  engineers: [
    epBucket("Ana Silva", 40, { meetings: 1, nps: 9, mech: 1, cancelledCount: 80 }),
    epBucket("Bruno Costa", 8, { meetings: 0, nps: 10, mech: 0, cancelledCount: 40 }),
    epBucket("Carla Dias", 30, { meetings: 0, nps: 6, mech: 0, cancelledCount: 20 }),
    epBucket("Diego Alves", 25, { meetings: 1, nps: 9, mech: 1 }),
    epBucket("Elena Rocha", 22, { meetings: 0, nps: 7, mech: 0 }),
    epBucket("Felipe Nunes", 28, { meetings: 1, nps: 8, mech: 1 }),
    epBucket("Gabriela Pinto", 21, { meetings: 0, nps: 5, mech: 0 }),
    epBucket("Helena Lopes", 26, { meetings: 1, nps: 8, mech: 1 }),
    epBucket("Igor Mendes", 24, { meetings: 1, nps: 9, mech: 1 }),
  ],
};

const temporalPayload = {
  generatedAt: "2026-07-01T00:00:00.000Z",
  summary: {
    totalSubjects: 400,
    activeClientsWithSignals: 28,
    totalFinancialUpdates: 137,
    months: 3,
  },
  monthly: [
    { month: "2026-05", label: "mai/26", meetings: 100, logins: 200, financialUpdates: 40, implementations: 10, npsResponses: 5 },
    { month: "2026-06", label: "jun/26", meetings: 110, logins: 210, financialUpdates: 42, implementations: 12, npsResponses: 6 },
    { month: "2026-07", label: "jul/26", meetings: 80, logins: 180, financialUpdates: 55, implementations: 8, npsResponses: 4 },
  ],
};

const html = readFileSync(resolve(root, "index.html"), "utf8");

await tryCase("perfis executivos das 3 páginas novas", () => {
  for (const id of ["renewal", "ep", "temporal"]) {
    const p = getExecutivePageProfile(id);
    assert(p?.geminiPilot === true, `${id} geminiPilot`);
    assert(p.executiveObjective, `${id} objective`);
    assert((p.executiveQuestions || []).length >= 3, `${id} questions`);
    assert((p.highlightMetrics || []).length >= 3, `${id} highlights`);
    assert(p.maxAttention >= 2 && p.maxPositives >= 1 && p.maxActions >= 1, `${id} limits`);
  }
  return "renewal/ep/temporal";
});

await tryCase("Renovação: snapshot oficial, composer e entrega sem Gemini", async () => {
  const engine = composeExecutiveAnalysis({ pageId: "renewal", payload: renewalPayload, filtersApplied: {}, computeMs: 1 });
  assert(engine.success === true, "engine");
  const snap = engine.analysis_context.executive_snapshot;
  assert(!snapshotHasDisallowedPayload(snap), "PII snapshot");
  assert(estimateJsonBytes(snap) < 20_000, `bytes=${estimateJsonBytes(snap)}`);
  assert(snap.highlights.eligible === 4, `eligible=${snap.highlights.eligible}`);
  assert(snap.highlights.renewed === 2, `renewed=${snap.highlights.renewed}`);
  assert(snap.highlights.not_renewed === 2, `not_renewed=${snap.highlights.not_renewed}`);
  assert(snap.highlights.renewal_rate === 50, `rate=${snap.highlights.renewal_rate}`);
  assert(!JSON.stringify(snap).includes("Ana Silva"));
  const composed = composeDeterministicAnalysis(snap, extractCandidatesFromSnapshot(snap));
  const a = composed.executive_analysis;
  assertHuman(a);
  assert(a.headline && a.executive_summary, "copy");
  assert(a.highlight_numbers.length >= 3, "highlights");
  assert(/elegív|renov/i.test(`${a.headline} ${a.executive_summary}`), a.headline);
  assert(!RANKING_RE.test(analysisText(a)), analysisText(a).slice(0, 160));
  const delivered = await deliverExecutiveAnalysis(
    { page: "renewal", generate: true },
    { engineResult: engine, skipGemini: true },
  );
  assert(delivered.success === true, "deliver");
  assert(delivered.metadata.generation_mode === "deterministic", delivered.metadata.generation_mode);
  assert(delivered.executive_analysis.headline, "headline deliver");
  return a.headline;
});

await tryCase("Performance do EP: cobertura, limitações e tom não punitivo", async () => {
  const engine = composeExecutiveAnalysis({ pageId: "ep", payload: epPayload, filtersApplied: {}, computeMs: 1 });
  assert(engine.success === true, "engine");
  const snap = engine.analysis_context.executive_snapshot;
  assert(!snapshotHasDisallowedPayload(snap), "PII snapshot");
  const json = JSON.stringify(snap);
  assert(!json.includes("Cliente "), "nome de cliente no snapshot");
  assert(snap.scope?.type === "active_clients", snap.scope?.type);
  assert(snap.highlights.active_clients < 3416, `active=${snap.highlights.active_clients}`);
  assert(json.includes("Ana Silva"), "nome de EP ausente");
  const a = composeDeterministicAnalysis(snap, extractCandidatesFromSnapshot(snap)).executive_analysis;
  assertHuman(a);
  const text = analysisText(a);
  assert(/cobertura|reunião|carteira|ativos/i.test(text), text.slice(0, 180));
  assert(!/\bpior\b|\blanterna\b|\bbenchmark\b/i.test(text), text.slice(0, 180));
  assert((a.ep_highlights || []).length >= 1, "destaques EP");
  assert((a.ep_attention || []).length >= 1, "atenção EP");
  const delivered = await deliverExecutiveAnalysis(
    { page: "ep", generate: true },
    { engineResult: engine, skipGemini: true },
  );
  assert(delivered.success === true && delivered.executive_analysis.headline, "deliver");
  return a.headline;
});

await tryCase("Indicadores Temporais: aponta mudança recente", async () => {
  const engine = composeExecutiveAnalysis({ pageId: "temporal", payload: temporalPayload, filtersApplied: {}, computeMs: 1 });
  assert(engine.success === true, "engine");
  const snap = engine.analysis_context.executive_snapshot;
  assert(!snapshotHasDisallowedPayload(snap), "PII snapshot");
  assert((snap.comparisons || []).length >= 1, "comparisons");
  const a = composeDeterministicAnalysis(snap, extractCandidatesFromSnapshot(snap)).executive_analysis;
  assertHuman(a);
  const text = `${a.headline} ${a.executive_summary}`;
  assert(/recuaram|avançaram|passaram|recente/i.test(text), text);
  assert(/reuni|atualiz/i.test(text), text);
  const delivered = await deliverExecutiveAnalysis(
    { page: "temporal", generate: true },
    { engineResult: engine, skipGemini: true },
  );
  assert(delivered.success === true && delivered.executive_analysis.headline, "deliver");
  return a.headline;
});

await tryCase("frontend: 6 páginas habilitadas e demais disabled", () => {
  assert(/renewal:\s*\{\s*enabled:\s*true/.test(html));
  assert(/backendPage:\s*'renewal'/.test(html));
  assert(/ep:\s*\{\s*enabled:\s*true/.test(html));
  assert(/backendPage:\s*'ep'/.test(html));
  assert(/temporal:\s*\{\s*enabled:\s*true/.test(html));
  assert(/backendPage:\s*'temporal'/.test(html));
  assert(/plan:\s*\{\s*enabled:\s*false/.test(html));
  assert(/mechanisms:\s*\{\s*enabled:\s*false/.test(html));
  assert(/cancellations:\s*\{\s*enabled:\s*false/.test(html));
  assert(/journey:\s*\{\s*enabled:\s*false/.test(html));
  assert(html.includes("Resumo com IA disponível em breve nesta página."));
  assert(html.includes("btn.disabled || btn.classList.contains('is-disabled')"));
});

await tryCase("visual: highlight elegante sem faixa laranja", () => {
  assert(html.includes(".kpi-card--highlight"));
  assert(html.includes("box-shadow:0 0 0 1px rgba(244,121,32,.08),0 10px 26px rgba(244,121,32,.10),0 0 22px rgba(244,121,32,.12)"));
  assert(!html.includes("border-top:2px solid var(--color-primary)"));
  assert(!html.includes("#view-cancellations .metric.kpi-effective .metric-value{color:#f0d78c"));
});

await tryCase("página não suportada permanece page_not_supported", async () => {
  const { buildExecutiveAnalysis } = await import("./netlify/functions/_shared/executive-analysis.mjs");
  const r = await buildExecutiveAnalysis({ page: "cancellations" });
  assert(r.success === false && r.code === "page_not_supported", JSON.stringify(r));
  assert(Array.isArray(r.supported_pages) && r.supported_pages.includes("renewal"));
  assert(r.supported_pages.includes("ep") && r.supported_pages.includes("temporal"));
});

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.8 expansão IA + visual ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
