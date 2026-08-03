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
const clients = p.clients || [];
const seg = {};
for (const c of clients) seg[c.segment] = (seg[c.segment] || 0) + 1;
const out = {
  effective: p.summary?.effectiveCancellations,
  intentionsOrOrders: p.summary?.intentionsOrOrdersRegistered,
  activeIntention: p.summary?.activeWithCancellationIntention,
  orders: p.summary?.ordersRegistered,
  intentions: p.summary?.intentionsRegistered,
  inProcess: p.summary?.clientsInCancellationProcess,
  withoutDate: p.summary?.effectiveWithoutConfirmedDate,
  archived: p.summary?.archivedRecords,
  audit: p.quality?.effectiveCancellationAudit,
  stages: p.summary?.exclusiveStages,
  segmentTop: Object.entries(seg).sort((a, b) => b[1] - a[1]).slice(0, 8),
  insuficientes: seg["Dados insuficientes"] || 0,
  situations: Object.entries(
    clients.reduce((m, c) => {
      const k = c.analyticalSituation || "?";
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1]),
  monthSample: (p.distributions?.byMonthIntentionVsEffective || []).slice(-3),
  rule: p.quality?.effectiveCancellationRule,
};
writeFileSync(resolve(root, "scripts/_smoke_cancel_rule.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
