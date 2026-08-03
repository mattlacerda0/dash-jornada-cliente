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
const { computeGeneralDataPayload } = await import("../netlify/functions/general-data.mjs");

const [p, general] = await Promise.all([
  computeStatisticalCrossesPayload({ filters: { status: "active_cancelled" } }),
  computeGeneralDataPayload(),
]);

function cycleOf(c) {
  const raw = c.currentCycle ?? c.ciclo ?? c.cycle;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
const renewalDash = (general.clients || []).filter((c) => {
  const cy = cycleOf(c);
  return cy != null && cy > 1;
}).length;

const out = {
  renewedCard: p.summary?.renewedClients,
  renewalDash,
  diff: (p.summary?.renewedClients ?? 0) - renewalDash,
  cycle1: p.summary?.cycle1Clients,
  totalRenewals: p.summary?.totalRenewals,
  observationPeriod: p.summary?.observationPeriod,
  cutoffDate: p.summary?.cutoffDate || p.metadata?.cutoffDate,
  timezone: p.summary?.timezone || p.metadata?.timezone,
  audit: {
    excludedCount: p.renewalParityAudit?.excludedCount,
    exclusionReasons: p.renewalParityAudit?.exclusionReasons,
    renewedInStats: p.renewalParityAudit?.renewedInActiveCancelledRecorte,
  },
  renewalAnalysis: {
    eligible: p.renewalAssociations?.eligible,
    renewed: p.renewalAssociations?.renewed,
    notRenewed: p.renewalAssociations?.notRenewed,
  },
};
writeFileSync(resolve(root, "scripts/_smoke_sc_renewal_fix.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
