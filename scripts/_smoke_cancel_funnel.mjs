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

const { computeCancellationsPayload } = await import("../netlify/functions/cancellations.mjs");
const p = await computeCancellationsPayload();
const out = {
  effective: p.summary?.effectiveCancellations,
  orders: p.summary?.ordersRegistered,
  intentions: p.summary?.intentionsRegistered,
  evidenceFunnel: p.summary?.evidenceFunnel || p.summary?.statusEvidenceFunnel?.evidenceFunnel,
  statusFunnelExclusive: (p.summary?.statusFunnelExclusive || []).map((s) => ({
    stage: s.stage,
    n: s.totalDistinctClients,
    order: s.displayOrder,
  })),
  statusAudit: p.summary?.statusEvidenceFunnel?.statusAudit?.slice?.(0, 12)
    || p.quality?.processStatusDimension?.statuses?.slice?.(0, 12),
};
writeFileSync(resolve(root, "scripts/_smoke_cancel_funnel.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
