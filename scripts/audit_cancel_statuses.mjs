/**
 * Audit cancellations_statuses + status_id distribution.
 * Read-only. No Git.
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

const BASE = process.env.DATA_SUPABASE_URL;
const KEY = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;

async function fetchAll(table, select, prefer = "public") {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, BASE);
    url.searchParams.set("select", select);
    const res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Accept-Profile": prefer,
        Prefer: "count=exact",
        Range: `${offset}-${offset + 999}`,
      },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, body: await res.text(), rows: [] };
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return { ok: true, rows };
}

const STATUS_TABLE = "cancellation_statuses";

const probe = await fetch(new URL(`/rest/v1/${STATUS_TABLE}?select=*&limit=20`, BASE), {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "public" },
});
const probeText = await probe.text();
console.log("probe_statuses", probe.status, probeText.slice(0, 3000));

let statuses = [];
if (probe.ok) {
  try {
    statuses = JSON.parse(probeText);
  } catch {
    statuses = [];
  }
  const all = await fetchAll(STATUS_TABLE, "*");
  if (all.ok) statuses = all.rows;
}

const cancelProbe = await fetch(
  new URL("/rest/v1/cancellations?select=id,client_id,status_id,data_pedido,intencao_registrada_at,archived_at&limit=3", BASE),
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "public" } },
);
console.log("probe_cancel", cancelProbe.status, (await cancelProbe.text()).slice(0, 800));

const cancels = await fetchAll(
  "cancellations",
  "id,client_id,status_id,data_pedido,intencao_registrada_at,churn_efetivado_at,distrato_assinado_at,distrato,archived_at",
);

const byStatus = new Map();
for (const row of cancels.rows || []) {
  if (row.archived_at) continue;
  const sid = row.status_id == null ? "__null__" : String(row.status_id);
  if (!byStatus.has(sid)) byStatus.set(sid, { registros: 0, clients: new Set() });
  const b = byStatus.get(sid);
  b.registros += 1;
  if (row.client_id) b.clients.add(String(row.client_id));
}

const statusById = new Map((statuses || []).map((s) => [String(s.id), s]));
const distribution = [...byStatus.entries()].map(([id, v]) => {
  const dim = statusById.get(id) || {};
  return {
    status_id: id === "__null__" ? null : id,
    status_name: dim.name || dim.label || dim.status || null,
    funnel_type: dim.funnel_type || dim.funnelType || null,
    sort:
      dim.position ?? dim.sort_order ?? dim.sequence ?? dim.order_index ?? dim.ordem ?? null,
    registros: v.registros,
    clientes_distintos: v.clients.size,
    raw: dim,
  };
}).sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999) || String(a.status_name || "").localeCompare(String(b.status_name || ""), "pt-BR"));

// Pedido OR analysis
const pedidoStatusIds = new Set(
  distribution
    .filter((d) => {
      const n = String(d.status_name || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
      return n.includes("pedido");
    })
    .map((d) => String(d.status_id)),
);
const A = new Set();
const B = new Set();
for (const row of cancels.rows || []) {
  if (row.archived_at) continue;
  const cid = row.client_id ? String(row.client_id) : null;
  if (!cid) continue;
  if (row.status_id != null && pedidoStatusIds.has(String(row.status_id))) A.add(cid);
  if (row.data_pedido) B.add(cid);
}
const both = [...A].filter((id) => B.has(id)).length;
const union = new Set([...A, ...B]).size;

const out = {
  statusColumns: statuses[0] ? Object.keys(statuses[0]) : [],
  statuses,
  distribution,
  pedidoAudit: {
    pedidoStatusIds: [...pedidoStatusIds],
    byStatusName: A.size,
    byDataPedido: B.size,
    overlap: both,
    unionDistinct: union,
  },
};
writeFileSync(resolve(root, "scripts/_audit_cancel_statuses.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  statusColumns: out.statusColumns,
  distribution: out.distribution.map(({ status_id, status_name, sort, registros, clientes_distintos, funnel_type }) => ({
    status_id, status_name, sort, registros, clientes_distintos, funnel_type,
  })),
  pedidoAudit: out.pedidoAudit,
}, null, 2));
