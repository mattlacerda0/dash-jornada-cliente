/**
 * Etapa 8.9 — active-first + comparativo nominal de Performance do EP.
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
import { visibleAnalysisHasTechnicalLeak } from "./netlify/functions/_shared/executive-labels.mjs";
import { snapshotHasDisallowedPayload } from "./netlify/functions/_shared/executive-snapshot.mjs";
import { getExecutivePageProfile } from "./netlify/functions/_shared/executive-page-profiles.mjs";
import {
  buildEpActiveComparison,
  resolveEpMinActiveClients,
  EP_COMPARISON_HEURISTICS,
} from "./netlify/functions/_shared/executive-ep-comparison.mjs";
import { applyRefinedWording, buildUserPrompt } from "./netlify/functions/_shared/executive-ai.mjs";

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

function clients(n, { status = "Ativo", meetings = 1, nps = null, npsEvery = 1, mech = 0, prefix = "c" } = {}) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      clientId: `${prefix}-${i}`,
      clientName: `Cliente ${prefix} ${i}`,
      clientEmail: `${prefix}${i}@exemplo.com`,
      analyticalStatus: status,
      totalMeetings: meetings,
      npsScore: i % npsEvery === 0 ? nps : null,
      implementedMechanisms: mech,
      hasImplementedMechanism: mech > 0,
    });
  }
  return rows;
}

function bucket(engineer, activeSpec, cancelled = 0) {
  return {
    engineer,
    clients: [
      ...clients(activeSpec.n, { ...activeSpec, prefix: engineer.replace(/\s+/g, "").toLowerCase() }),
      ...clients(cancelled, {
        status: "Cancelado",
        meetings: 0,
        prefix: `${engineer.replace(/\s+/g, "").toLowerCase()}x`,
      }),
    ],
  };
}

const payload = {
  generatedAt: "2026-07-01T00:00:00.000Z",
  summary: { totalClients: 3416, activeClients: 1807, meetingCoverage: 46.9, advisorsWithPortfolio: 31 },
  engineers: [
    bucket("Ana Silva", { n: 40, meetings: 1, nps: 9, npsEvery: 2, mech: 1 }, 90),
    bucket("Bruno Costa", { n: 8, meetings: 0, nps: 10, npsEvery: 1, mech: 0 }, 40),
    bucket("Carla Dias", { n: 30, meetings: 0, nps: 6, npsEvery: 3, mech: 0 }, 50),
    bucket("Diego Alves", { n: 25, meetings: 1, nps: 9, npsEvery: 2, mech: 1 }, 10),
    bucket("Elena Rocha", { n: 22, meetings: 0, nps: 7, npsEvery: 4, mech: 0 }, 8),
    bucket("Felipe Nunes", { n: 28, meetings: 1, nps: 8, npsEvery: 2, mech: 1 }, 12),
    bucket("Gabriela Pinto", { n: 21, meetings: 0, nps: 5, npsEvery: 3, mech: 0 }, 15),
    bucket("Helena Lopes", { n: 26, meetings: 1, nps: 8, npsEvery: 2, mech: 1 }, 7),
    bucket("Igor Mendes", { n: 24, meetings: 1, nps: 9, npsEvery: 2, mech: 1 }, 9),
    bucket("Nps Star", { n: 20, meetings: 0, nps: 10, npsEvery: 10, mech: 0 }, 5),
  ],
};

const html = readFileSync(resolve(root, "index.html"), "utf8");

await tryCase("heurística 20 cai para 10 se poucos EPs", () => {
  assert(resolveEpMinActiveClients([40, 35, 30, 28, 25, 24, 22, 21]) === 20);
  assert(resolveEpMinActiveClients([40, 12, 8, 7]) === 10);
  assert(EP_COMPARISON_HEURISTICS.npsMinResponses === 5);
  assert(EP_COMPARISON_HEURISTICS.npsMinCoveragePct === 20);
  return `preferred=${EP_COMPARISON_HEURISTICS.preferredMinActiveClients}`;
});

await tryCase("scope ativo e soma das carteiras", () => {
  const cmp = buildEpActiveComparison(payload);
  const engine = composeExecutiveAnalysis({ pageId: "ep", payload, filtersApplied: {}, computeMs: 1 });
  const snap = engine.analysis_context.executive_snapshot;
  assert(snap.scope.type === "active_clients", snap.scope.type);
  assert(snap.scope.label === "Clientes ativos");
  const summed = cmp.ep_performance.reduce((a, r) => a + r.active_clients, 0);
  assert(summed === cmp.active_clients, `sum=${summed} active=${cmp.active_clients}`);
  assert(snap.highlights.active_clients === summed);
  assert(summed !== 3416 && summed < 3416, `ainda usa ${summed} gerais`);
  assert(getExecutivePageProfile("ep").allowActiveDefault === true);
  assert(getExecutivePageProfile("general").defaultScope === "active_clients");
  assert(getExecutivePageProfile("meetings").defaultScope === "active_clients");
  assert(getExecutivePageProfile("renewal").defaultScope === "renewal_eligible");
  assert(getExecutivePageProfile("statistical-crosses").defaultScope === "methodological");
  return `ativos=${summed} eps=${cmp.advisors_with_active} min=${cmp.eligibility.min_active_clients}`;
});

await tryCase("inativos não entram na população analisada", () => {
  const cmp = buildEpActiveComparison(payload);
  const ana = cmp.ep_performance.find((r) => r.ep_name === "Ana Silva");
  assert(ana.active_clients === 40, `ana=${ana.active_clients}`);
  assert(!JSON.stringify(cmp).includes("Cancelado"));
  assert(!JSON.stringify(cmp).includes("Cliente "));
  assert(!JSON.stringify(cmp).includes("@exemplo.com"));
});

await tryCase("nomes de EP sim, nomes de cliente não", () => {
  const engine = composeExecutiveAnalysis({ pageId: "ep", payload, filtersApplied: {}, computeMs: 1 });
  const snap = engine.analysis_context.executive_snapshot;
  assert(!snapshotHasDisallowedPayload(snap), "PII");
  const json = JSON.stringify(snap);
  assert(json.includes("Ana Silva") && json.includes("Carla Dias"));
  assert(!json.includes("Cliente "));
  assert(!json.includes("clientName"));
  assert(!json.includes("@exemplo.com"));
  const a = composeDeterministicAnalysis(snap).executive_analysis;
  const blob = `${a.headline} ${a.executive_summary} ${JSON.stringify(a.ep_highlights)} ${JSON.stringify(a.ep_attention)}`;
  assert(/Ana Silva|Diego Alves|Felipe Nunes|Helena Lopes|Igor Mendes/.test(blob));
  assert(!blob.includes("Cliente "));
});

await tryCase("top/bottom determinístico sem score e sem NPS pequeno no topo", () => {
  const cmp = buildEpActiveComparison(payload);
  assert(cmp.ep_highlights.length <= 3);
  assert(cmp.ep_attention.length <= 3);
  const namesH = cmp.ep_highlights.map((c) => c.ep_name);
  const namesA = cmp.ep_attention.map((c) => c.ep_name);
  assert(namesH.includes("Ana Silva"), namesH.join(","));
  assert(!namesH.includes("Nps Star"), `NPS 100/2 respostas no topo: ${namesH.join(",")}`);
  assert(!namesH.includes("Bruno Costa"), "carteira pequena no topo");
  assert(namesA.includes("Carla Dias") || namesA.includes("Gabriela Pinto"), namesA.join(","));
  assert(!namesH.some((n) => namesA.includes(n)), "overlap");
  const npsStar = cmp.ep_performance.find((r) => r.ep_name === "Nps Star");
  assert(npsStar.nps_sample_limited === true, "amostra NPS");
  assert(npsStar.nps_eligible === false);
  const blob = JSON.stringify(cmp);
  assert(!blob.includes("score") && !blob.includes("40%") && !/0\.4 \+ 0\.3/.test(blob));
  return `top=${namesH.join(" | ")} attn=${namesA.join(" | ")}`;
});

await tryCase("composer + modal structure + gemini não troca nomes", () => {
  const engine = composeExecutiveAnalysis({ pageId: "ep", payload, filtersApplied: {}, computeMs: 1 });
  const snap = engine.analysis_context.executive_snapshot;
  const composed = composeDeterministicAnalysis(snap, extractCandidatesFromSnapshot(snap));
  const a = composed.executive_analysis;
  assert(!analysisHasForbiddenCausality(a));
  assert(!visibleAnalysisHasTechnicalLeak(a).hit, visibleAnalysisHasTechnicalLeak(a).snippet);
  assert(!/\bpior EP\b|\bEP fraco\b|\bbenchmark\b/i.test(`${a.headline} ${a.executive_summary}`));
  assert(a.ep_highlights.length >= 1 && a.ep_attention.length >= 1);
  assert(a.scope.label === "Clientes ativos");
  assert((a.highlight_numbers || []).some((h) => /mediana de cobertura/i.test(h.label || "")), "highlight mediana");
  const refined = applyRefinedWording(a, {
    headline: "Fulano de Tal lidera um ranking inventado.",
    executive_summary: "Inventei um score 40/30/30.",
    ep_highlights: [{ ep_name: "Nome Inventado", summary: "x" }],
    ep_attention: [],
  });
  assert(refined.ep_highlights[0].ep_name === a.ep_highlights[0].ep_name, "gemini trocou EP");
  assert(refined.ep_attention.length === a.ep_attention.length);
  assert(html.includes("Destaques entre engenheiros"));
  assert(html.includes("Carteiras que pedem atenção"));
  assert(html.includes("renderEpPersonCard"));
  assert(html.includes("amostra limitada") || html.includes("ai-analysis-ep-badge"));
  const prompt = buildUserPrompt({ executive_snapshot: snap }, extractCandidatesFromSnapshot(snap));
  assert(!prompt.includes("Bruno Costa"), "Gemini recebeu EP fora dos cards");
  assert(!/"ep_performance"\s*:/.test(prompt), "lista completa de EPs no prompt");
  return a.headline;
});

await tryCase("temporais: active-first documentado", () => {
  const p = getExecutivePageProfile("temporal");
  assert(p.allowActiveDefault === true);
  assert(p.defaultScope === "active_clients");
  const engine = composeExecutiveAnalysis({
    pageId: "temporal",
    payload: {
      summary: { activeClientsWithSignals: 10, months: 2 },
      monthly: [
        { month: "2026-06", meetings: 50, logins: 80, financialUpdates: 20, implementations: 5 },
        { month: "2026-07", meetings: 30, logins: 40, financialUpdates: 28, implementations: 8 },
      ],
      clients: [
        { month: "2026-06", status: "Ativo", meetings: 40, logins: 10, financialUpdates: 15, implementations: 4, subjectId: "a" },
        { month: "2026-07", status: "Ativo", meetings: 20, logins: 8, financialUpdates: 22, implementations: 7, subjectId: "a" },
        { month: "2026-06", status: "Cancelado", meetings: 10, logins: 70, financialUpdates: 5, implementations: 1, subjectId: "b" },
        { month: "2026-07", status: "Cancelado", meetings: 10, logins: 32, financialUpdates: 6, implementations: 1, subjectId: "b" },
      ],
    },
    filtersApplied: {},
    computeMs: 1,
  });
  const snap = engine.analysis_context.executive_snapshot;
  assert(snap.scope.type === "active_clients");
  assert(snap.metric_origin.temporal_meetings === "active_clients_rows");
  assert(snap.metric_origin.pre_cancellation_signals === "cancelled_clients");
  const last = snap.recent_months[snap.recent_months.length - 1];
  assert(last.meetings === 20, `meetings=${last.meetings}`);
});

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.9 EP active-first + comparativo ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
