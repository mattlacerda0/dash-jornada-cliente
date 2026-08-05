import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !(String(process.env[key] || "").trim())) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const t0 = Date.now();
const { computeStatisticalCrossesPayload } = await import("../netlify/functions/statistical-crosses.mjs");
const p = await computeStatisticalCrossesPayload({
  filters: { status: "active_cancelled", cohortPeriod: "since_2025_01" },
});
const ms = Date.now() - t0;

const out = {
  ms,
  discoveries: (p.discoveries || []).slice(0, 5).map((d) => ({ title: d.title, cat: d.category, val: d.primaryValue })),
  insights: (p.simpleInsights || []).length,
  signals: {
    active: p.activeRiskSignals?.summary?.activeWithSignals,
    signalTypes: (p.activeRiskSignals?.signalStats || []).map((s) => s.id),
  },
  top: {
    pharusRows: p.topClients?.pharus?.rows?.length,
    davosRows: p.topClients?.davos?.rows?.length,
    pharusUniverse: p.topClients?.pharus?.nUniverse,
    davosUniverse: p.topClients?.davos?.nUniverse,
    pharusTop: p.topClients?.pharus?.rows?.[0]?.clientName,
    davosTop: p.topClients?.davos?.rows?.[0]?.clientName,
  },
  npsCompVars: p.npsComparative?.variables?.length,
  highPerf: (p.highPerformance?.groups || []).map((g) => ({ label: g.label, n: g.n, meetings: g.medianMeetings })),
  challenge: p.challengeCohort,
  cohort: { n: p.cohort?.cohorts?.length, period: p.cohort?.periodLabel, mode: p.cohort?.periodMode },
  programSample: [...new Set((p.clients || []).map((c) => c.program).filter(Boolean))].slice(0, 10),
  davosFlag: (p.clients || []).filter((c) => c.davosContractSigned).length,
  davosSamplePrograms: (p.topClients?.davos?.rows || []).slice(0, 3).map((r) => r.program),
};
writeFileSync(resolve(root, "scripts/_smoke_sc_pdf_delivery.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
