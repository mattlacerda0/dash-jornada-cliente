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
const p = await computeStatisticalCrossesPayload({ filters: { status: "active_cancelled" } });
const ms = Date.now() - t0;

const out = {
  ms,
  clients: p.clients?.length,
  analyzed: p.summary?.analyzedClients,
  axis: {
    cancelRows: p.axisMatrices?.cancellation?.rows?.length,
    npsRows: p.axisMatrices?.nps?.rows?.length,
    renewalRows: p.axisMatrices?.renewal?.rows?.length,
    tenureRows: p.axisMatrices?.tenure?.rows?.length,
  },
  predictive: {
    method: p.predictiveModel?.method,
    status: p.predictiveModel?.status,
    split: p.predictiveModel?.splitType,
    auc: p.predictiveModel?.metrics?.rocAuc,
    top5: (p.predictiveModel?.ranking || []).slice(0, 5).map((r) => ({ id: r.id, imp: r.importance })),
  },
  health: (p.healthScoreCandidates || []).map((c) => ({ id: c.id, dim: c.dimension, cov: c.coveragePercent })),
  highPerf: (p.highPerformance?.groups || []).map((g) => ({ label: g.label, n: g.n, cancelledPct: g.cancelledPct })),
  groupMatrix: { vars: p.groupComparative?.variables?.length, groups: p.groupComparative?.groups?.length },
  rankings: {
    cancel: p.discoveryRankings?.cancellation?.slice(0, 3).map((r) => r.label),
    nps: p.discoveryRankings?.nps?.slice(0, 3).map((r) => r.label),
    renewal: p.discoveryRankings?.renewal?.slice(0, 3).map((r) => r.label),
  },
  renewed: p.summary?.renewedClients,
  discoveries: (p.discoveries || []).length,
};
writeFileSync(resolve(root, "scripts/_smoke_sc_v2_delivery.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
