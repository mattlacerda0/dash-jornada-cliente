import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(projectRoot, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const { computeCancellationsPayload } = await import("../netlify/functions/cancellations.mjs");
const p = await computeCancellationsPayload();
const s = p.summary;

const motivoFilled = (p.clients || []).filter((c) => c.hasReason).length;
const tratativaFilled = (p.clients || []).filter((c) => c.hasTratativa).length;
const valorPagoFilled = s.financial?.coveragePaid ?? 0;
const valorReembFilled = s.financial?.coverageRefund ?? 0;

console.log(JSON.stringify({
  totalRecordsRead: s.totalRecordsRead,
  totalDistinctClients: s.totalDistinctClients,
  intentions: s.intentionsRegistered,
  orders: s.ordersRegistered,
  effective: s.effectiveCancellations,
  exclusive: s.exclusiveStages,
  rateIntToOrder: s.funnel?.rateIntentionToOrder,
  rateOrderToEff: s.funnel?.rateOrderToEffective,
  rateIntToEff: s.funnel?.rateIntentionToEffective,
  passedRetention: s.retention?.passedRetentionCount,
  withDesfecho: s.retention?.desfechoCoverage,
  critical: s.operations?.criticalCount,
  archived: s.archivedRecords,
  distratoTextNoDate: s.distratoTextSignedWithoutDate,
  motivoFilled,
  motivoCoveragePct: Math.round((motivoFilled / (s.totalDistinctClients || 1)) * 1000) / 10,
  tratativaFilled,
  tratativaCoveragePct: s.tratativaCoverage?.percent,
  valorPagoCoverage: valorPagoFilled,
  valorReembolsoCoverage: valorReembFilled,
  chronologicalIssues: s.chronologicalInconsistencyClients,
  effectiveEqualsTotalCancellations: s.effectiveCancellations === s.totalCancellations,
  exclusiveSumOk: (s.exclusiveStages || []).reduce((a, e) => a + e.count, 0) === s.totalDistinctClients,
}, null, 2));
