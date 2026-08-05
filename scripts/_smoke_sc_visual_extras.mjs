import { readFileSync, existsSync } from "fs";
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
const p = await computeStatisticalCrossesPayload({
  filters: {
    status: "active_cancelled",
    correlationMethod: "spearman",
    matrixVars: "stayDays,meetingCount,daysSinceLastMeeting,daysToFirstMeeting,noShowCount,npsScore,monthlyIncome,liquidityReserve,mechanismCount,currentCycle",
  },
});

const curve = p.survival?.overall?.curve || [];
const at = (d) => {
  let last = curve[0];
  for (const pt of curve) {
    if (Number(pt.time) > d) break;
    last = pt;
  }
  return last;
};
const fmt = (pt) => (pt?.survival != null ? `${(pt.survival * 100).toFixed(1)}%` : null);

console.log(JSON.stringify({
  matrixVars: (p.correlationMatrix?.variables || []).map((v) => v.label || v.id),
  matrixN: (p.correlationMatrix?.variables || []).length,
  method: p.correlationMatrix?.method,
  diagOk: (p.correlationMatrix?.cells || []).filter((c) => c.idA === c.idB).every((c) => Math.abs((c.value ?? 0) - 1) < 1e-9),
  p90: fmt(at(90)),
  p180: fmt(at(180)),
  p365: fmt(at(365)),
  groupFields: [...new Set((p.survival?.groups || []).map((g) => g.field))],
  npsGroups: (p.survival?.groups || []).filter((g) => g.field === "npsClass").map((g) => ({ level: g.level, n: g.n })),
  maxAge: Math.max(...(p.cohort?.ages || [0])),
  cohortN: (p.cohort?.cohorts || []).length,
}, null, 2));
