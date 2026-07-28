/**
 * Breakdown: status bruto Cancelado vs cancelamento analítico.
 * Uso: node scripts/breakdown_cancel_status.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  buildAnalyticalCancellationMap,
  normalizeClientStatus,
} from "../netlify/functions/_shared/analytical-cancellation.mjs";

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
  fetchAll("clients", "id,status"),
  fetchAll(
    "cancellations",
    "id,client_id,churn_efetivado_at,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at",
  ),
]);
const { map } = buildAnalyticalCancellationMap(cancellations);

let rawCancel = 0;
let rawCancelWithAnalytic = 0;
let rawCancelNoAnalytic = 0;
let activeWithAnalytic = 0;
let frozenWithAnalytic = 0;

for (const c of clients) {
  const n = normalizeClientStatus(c.status);
  const info = map.get(String(c.id));
  if (n === "Cancelado") {
    rawCancel += 1;
    if (info?.date) rawCancelWithAnalytic += 1;
    else rawCancelNoAnalytic += 1;
  }
  if (n === "Ativo" && info?.date) activeWithAnalytic += 1;
  if (n === "Congelado" && info?.date) frozenWithAnalytic += 1;
}

console.log(
  JSON.stringify(
    {
      totalClients: clients.length,
      mapAnalyticalCancelled: map.size,
      rawCancel,
      rawCancelWithAnalytic,
      rawCancelNoAnalytic,
      activeWithAnalytic,
      frozenWithAnalytic,
      dadosGeraisCancelledIfStatusIncludesRaw: rawCancelNoAnalytic + map.size,
      cancelamentoDashboard: map.size,
      divergenceDadosGeraisVsCancelamento: rawCancelNoAnalytic,
    },
    null,
    2,
  ),
);
