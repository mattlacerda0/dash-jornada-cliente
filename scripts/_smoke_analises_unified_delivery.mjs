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

const { computeStatisticalCrossesPayload } = await import("../netlify/functions/statistical-crosses.mjs");
const t0 = Date.now();
const p = await computeStatisticalCrossesPayload({ filters: { status: "active_cancelled" } });
const ms = Date.now() - t0;

const cells = (p.correlationMatrix?.cells || []).filter((c) => c.idA !== c.idB && c.value != null);
const sorted = [...cells].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
const pos = sorted.filter((c) => c.value > 0).slice(0, 5);
const neg = sorted.filter((c) => c.value < 0).slice(0, 5);
const avg = new Map((p.cohort?.averages || []).map((a) => [a.age, a]));
const deltas = (p.cohort?.averages || []).filter((a) => a.deltaPp != null).sort((a, b) => a.deltaPp - b.deltaPp);

const out = {
  ms,
  menuNote: "Análises Estatísticas (única)",
  summary: p.summary,
  discoveries: (p.discoveries || []).slice(0, 6).map((d) => d.title || d.text),
  discoveriesCount: (p.discoveries || []).length,
  matrix: {
    method: p.correlationMatrix?.method,
    vars: (p.correlationMatrix?.variables || []).map((v) => v.id),
    cells: (p.correlationMatrix?.cells || []).length,
    topPositive: pos.map((c) => ({ a: c.labelA, b: c.labelB, v: c.value })),
    topNegative: neg.map((c) => ({ a: c.labelA, b: c.labelB, v: c.value })),
  },
  survival: {
    nStart: p.survival?.overall?.nStart,
    events: p.survival?.overall?.events,
    censored: p.survival?.overall?.censored,
    median: p.survival?.overall?.medianSurvival,
  },
  cohort: {
    n: (p.cohort?.cohorts || []).length,
    ret3: avg.get(3)?.meanRetentionPct ?? null,
    ret6: avg.get(6)?.meanRetentionPct ?? null,
    ret12: avg.get(12)?.meanRetentionPct ?? null,
    biggestDrop: deltas[0] ? { age: deltas[0].age, deltaPp: deltas[0].deltaPp } : null,
  },
  reportSections: Object.keys(p.report || {}),
  narratives: (p.report?.generatedNarratives || []).length,
  limitations: (p.report?.limitations || []).length,
};
writeFileSync(resolve(root, "scripts/_smoke_analises_unified_delivery.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
