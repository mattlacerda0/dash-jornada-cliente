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
const p = await computeStatisticalCrossesPayload({ filters: { status: "active_cancelled" } });

const tenureRow = (p.activeVsCancelled || p.comparisons || []).find((r) =>
  /perman|tenure/i.test(`${r.id || ""} ${r.label || ""}`)
);

const out = {
  excludedVariables: (p.excludedVariables || []).map((e) => ({
    id: e.id,
    label: e.label,
    status: e.status,
    reason: e.reason || e.note,
  })),
  qualityWarnings: (p.qualityWarnings || []).slice(0, 15),
  tenureMedianFromComparison: tenureRow
    ? {
        label: tenureRow.label,
        medianActive: tenureRow.medianActive ?? tenureRow.activeMedian,
        medianCancelled: tenureRow.medianCancelled ?? tenureRow.cancelledMedian,
      }
    : null,
  tenureCorrelationsTop: (p.tenureCorrelations || []).slice(0, 5).map((x) => ({
    label: x.label,
    rho: x.spearman ?? x.association ?? x.rho,
    status: x.status,
  })),
  renewedVsTop: (p.renewedVsNotRenewed || []).slice(0, 5).map((x) => ({
    label: x.label,
    medRenewed: x.medianRenewed ?? x.renewedMedian,
    medNot: x.medianNotRenewed ?? x.notRenewedMedian,
    association: x.association,
  })),
  npsCorrTop: (p.npsCorrelations || []).slice(0, 5).map((x) => ({
    label: x.label,
    measure: x.measure,
    value: x.association ?? x.spearman ?? x.rho,
  })),
};

writeFileSync(resolve(root, "scripts/_sc_delivery_extras.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
