/**
 * Audit vw_clients_ciclo_churn granularity. node --env-file=.env scripts/_audit_ciclo_churn.mjs
 */
import { getDataEnv } from "../netlify/functions/_shared/env.mjs";
import fs from "node:fs";

const { url, serviceRoleKey: key } = getDataEnv();

async function rest(path, { schema = "public", preferCount = false } = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  };
  if (preferCount) {
    headers.Prefer = "count=exact";
    headers.Range = "0-0";
  }
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, { headers });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return {
    ok: res.ok,
    status: res.status,
    contentRange: res.headers.get("content-range"),
    data,
  };
}

const out = {};

// Probe table/view names
for (const name of [
  "vw_clients_ciclo_churn",
  "vw_client_ciclo_churn",
  "clients_ciclo_churn",
  "v_clients_ciclo_churn",
]) {
  out[`probe_${name}`] = await rest(`/rest/v1/${name}?select=*&limit=2`, { preferCount: true });
}

const viewOk = Object.entries(out).find(([k, v]) => k.startsWith("probe_") && v.ok);
const viewName = viewOk ? viewOk[0].replace("probe_", "") : "vw_clients_ciclo_churn";

const sample = await rest(`/rest/v1/${viewName}?select=*&limit=5`);
out.sampleCols = Array.isArray(sample.data) && sample.data[0] ? Object.keys(sample.data[0]) : [];
out.sample = Array.isArray(sample.data) ? sample.data.slice(0, 2) : sample.data;

// Counts
const countRes = await rest(`/rest/v1/${viewName}?select=client_id`, { preferCount: true });
out.lineCountRange = countRes.contentRange;

// Fetch all client_id + data_inicio_ciclo + programa in pages for uniqueness audit
async function fetchAll(select) {
  const rows = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    const r = await rest(`/rest/v1/${viewName}?select=${encodeURIComponent(select)}&order=client_id.asc&limit=${page}&offset=${offset}`);
    if (!r.ok) throw new Error(JSON.stringify(r.data).slice(0, 200));
    const batch = Array.isArray(r.data) ? r.data : [];
    rows.push(...batch);
    if (batch.length < page) break;
    offset += page;
    if (offset > 200000) break;
  }
  return rows;
}

const rows = await fetchAll("client_id,data_inicio_ciclo,programa,status,fl_churn,data_churn_consolidada");
const byClient = new Map();
for (const row of rows) {
  const id = String(row.client_id || "");
  if (!id) continue;
  if (!byClient.has(id)) byClient.set(id, []);
  byClient.get(id).push(row);
}
const multi = [...byClient.entries()].filter(([, arr]) => arr.length > 1);
const multiDates = multi.filter(([, arr]) => new Set(arr.map((r) => r.data_inicio_ciclo).filter(Boolean)).size > 1);
const multiProg = multi.filter(([, arr]) => new Set(arr.map((r) => r.programa).filter(Boolean)).size > 1);

out.stats = {
  viewName,
  lines: rows.length,
  distinctClients: byClient.size,
  excessLines: rows.length - byClient.size,
  clientsWithMultipleRows: multi.length,
  multiWithDistinctStartDates: multiDates.length,
  multiWithDistinctPrograms: multiProg.length,
  sampleMulti: multi.slice(0, 5).map(([id, arr]) => ({
    id,
    n: arr.length,
    dates: [...new Set(arr.map((r) => r.data_inicio_ciclo))],
    programs: [...new Set(arr.map((r) => r.programa))],
    statuses: [...new Set(arr.map((r) => r.status))],
  })),
};

// Try pg_get_viewdef via RPC if exists — usually not. Try information_schema.
out.viewDefProbe = await rest(
  `/rest/v1/rpc/pg_get_viewdef`,
);
// columns from information_schema via rest may not work. Try select from pg_catalog views if exposed.
out.pgViews = await rest(`/rest/v1/pg_views?select=schemaname,viewname,definition&viewname=eq.${viewName}&limit=1`);
out.infoSchema = await rest(
  `/rest/v1/columns?select=column_name,data_type&table_schema=eq.public&table_name=eq.${viewName}`,
  { schema: "information_schema" },
);

// Related cycle tables
for (const t of [
  "client_cycles",
  "client_ciclos",
  "ciclos",
  "cycles",
  "client_contracts",
  "contracts",
  "client_programs",
  "client_enrollment",
  "enrollments",
]) {
  const p = await rest(`/rest/v1/${t}?select=*&limit=1`, { preferCount: true });
  if (p.ok || (p.status !== 404 && p.status !== 406)) {
    out[`table_${t}`] = { ok: p.ok, status: p.status, range: p.contentRange, cols: Array.isArray(p.data) && p.data[0] ? Object.keys(p.data[0]) : p.data };
  }
}

fs.writeFileSync("scripts/_audit_ciclo_churn.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  viewName,
  cols: out.sampleCols,
  stats: out.stats,
  related: Object.keys(out).filter((k) => k.startsWith("table_")),
  viewDefOk: out.pgViews?.ok,
  infoSchemaOk: out.infoSchema?.ok,
}, null, 2));
