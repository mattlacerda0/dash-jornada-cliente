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
const exclSum = (s.exclusiveStages || []).reduce((a, e) => a + e.count, 0);
console.log(JSON.stringify({
  totalRecordsRead: s.totalRecordsRead,
  totalDistinctClients: s.totalDistinctClients,
  intentions: s.intentionsRegistered,
  orders: s.ordersRegistered,
  effective: s.effectiveCancellations,
  totalCancellations: s.totalCancellations,
  archived: s.archivedRecords,
  exclusiveSum: exclSum,
  exclusiveMatch: exclSum === s.totalDistinctClients,
  exclusive: s.exclusiveStages,
  funnel: s.funnel,
  retention: s.retention,
  financial: s.financial,
  ops: s.operations,
  timing: s.timing,
  warningsCount: (p.warnings || []).length,
  warnings: (p.warnings || []).map((w) => w.message || w.code || w),
  clients: p.clients?.length,
  sample: p.clients?.[0] ? {
    exclusiveStage: p.clients[0].exclusiveStage,
    hasIntencao: p.clients[0].hasIntencao,
    hasPedido: p.clients[0].hasPedido,
    hasEfetivado: p.clients[0].hasEfetivado,
    cancellationDate: p.clients[0].cancellationDate,
    intencaoAt: p.clients[0].intencaoAt,
    pedidoAt: p.clients[0].pedidoAt,
  } : null,
}, null, 2));
