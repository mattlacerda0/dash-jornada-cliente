/**
 * Re-auditoria pós-classificação refinada.
 */
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

const {
  buildAnalyticalCancellationMap,
  normalizeClientStatus,
  resolveAnalyticalStatusFromMaps,
  parseFlexibleDate,
  isDistratoTextSigned,
  isEffectiveCancelledStatus,
  isConfirmedCancelledStatus,
  isEffectiveCancelledWithoutDateStatus,
  isMarkedCancelledNoEvidenceStatus,
} = await import("../netlify/functions/_shared/analytical-cancellation.mjs");

const BASE = process.env.DATA_SUPABASE_URL;
const KEY = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;

async function fetchAll(table, select) {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, BASE);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + 999}`,
      },
    });
    if (!response.ok) throw new Error(`${table} ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

const [clients, cancellations] = await Promise.all([
  fetchAll("clients", "id,status,data_churn"),
  fetchAll(
    "cancellations",
    "id,client_id,churn_efetivado_at,distrato_assinado_at,distrato,archived_at,updated_at,created_at,data_pedido,intencao_registrada_at",
  ),
]);

const { map, audit } = buildAnalyticalCancellationMap(cancellations, clients);

const counts = {
  Ativos: 0,
  Congelados: 0,
  "Cancelados com data": 0,
  "Cancelados efetivados sem data": 0,
  "Marcados sem confirmação": 0,
  "Não informados reais": 0,
  Total: clients.length,
};

const otherReasons = {};
let othersChartOld = 0;
let othersChartNew = 0;
let markedInChart = 0;

for (const client of clients) {
  const info = map.get(String(client.id)) || null;
  const st = resolveAnalyticalStatusFromMaps(client.status, info);
  if (st === "Ativo") counts.Ativos += 1;
  else if (st === "Congelado") counts.Congelados += 1;
  else if (isConfirmedCancelledStatus(st)) counts["Cancelados com data"] += 1;
  else if (isEffectiveCancelledWithoutDateStatus(st)) counts["Cancelados efetivados sem data"] += 1;
  else if (isMarkedCancelledNoEvidenceStatus(st)) counts["Marcados sem confirmação"] += 1;
  else counts["Não informados reais"] += 1;

  // Old chart: other = not active/frozen/Cancelado(all effective lumped)
  const oldCancelled = isEffectiveCancelledStatus(st);
  if (st !== "Ativo" && st !== "Congelado" && !oldCancelled) {
    othersChartOld += 1;
    const rawNorm = normalizeClientStatus(client.status);
    let reason = "Status bruto desconhecido";
    if (isMarkedCancelledNoEvidenceStatus(st)) reason = "Status bruto Cancelado sem data encontrada";
    else if (!client.status || !String(client.status).trim()) reason = "Status vazio";
    else if (rawNorm === "Não informado") reason = "Status bruto desconhecido";
    otherReasons[reason] = (otherReasons[reason] || 0) + 1;
  }

  // New chart segments
  if (isMarkedCancelledNoEvidenceStatus(st)) markedInChart += 1;
  if (st === "Não informado") othersChartNew += 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  counts,
  audit,
  portfolioChart: {
    oldOthersTotal: othersChartOld,
    oldOthersReasons: otherReasons,
    newMarkedWithoutEvidence: markedInChart,
    newOthersTrueUnknown: othersChartNew,
  },
  transitions: {
    dataChurnClients: audit.clientsDataChurn,
    onlyDataChurn: audit.onlyClientDataChurn,
    overlap: audit.overlapCancelAndDataChurn,
    multiSource: audit.multipleSources,
    dateDivergence: audit.dateDivergence,
  },
};

writeFileSync(resolve(root, "scripts/_audit_status_post.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
