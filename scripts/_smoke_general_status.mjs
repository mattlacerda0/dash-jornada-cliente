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

const { computeGeneralDataPayload } = await import("../netlify/functions/general-data.mjs");
const p = await computeGeneralDataPayload();
console.log(JSON.stringify({
  total: p.summary.totalClients,
  active: p.summary.activeClients,
  frozen: p.summary.frozenClients,
  cancelled: p.summary.cancelledClients,
  withDate: p.summary.cancelledWithConfirmedDate,
  effNoDate: p.summary.cancelledEffectiveWithoutDate,
  marked: p.summary.cancelledWithoutConfirmedDate,
  unknown: p.summary.unknownClients,
  auditSum: p.summary.statusAuditSum,
  status: p.distributions.status,
}, null, 2));
