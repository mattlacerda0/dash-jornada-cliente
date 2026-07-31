/**
 * Deep probe: status dimension + airtable on DATA and AUTH
 */
import { getDataEnv } from "../netlify/functions/_shared/env.mjs";
import fs from "node:fs";

async function rest({ url, key, schema, table, select = "*", limit = 5 }) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": schema,
      "Content-Profile": schema,
      Prefer: "count=exact",
    },
  });
  const cr = res.headers.get("content-range") || "";
  const m = cr.match(/\/(\d+|\*)\s*$/);
  const total = m && m[1] !== "*" ? Number(m[1]) : null;
  const data = await res.json().catch(() => null);
  const arr = Array.isArray(data) ? data : [];
  return {
    ok: res.ok,
    status: res.status,
    total,
    cols: arr[0] ? Object.keys(arr[0]) : [],
    sample: arr.slice(0, 2),
    error: res.ok ? null : JSON.stringify(data).slice(0, 220),
  };
}

const data = getDataEnv();
const authUrl = (process.env.AUTH_SUPABASE_URL || "").replace(/\/$/, "");
const authAnon = process.env.AUTH_SUPABASE_ANON_KEY || "";
const authService = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY || process.env.BUSINESS_DATA_SUPABASE_SERVICE_ROLE_KEY || "";

const out = { statusTables: {}, airtable: {}, cancelStatusIds: null };

// status dimension candidates on DATA public
for (const t of [
  "cancellations_statuses",
  "cancellation_statuses",
  "cancel_statuses",
  "status_cancellations",
  "statuses",
  "cancellation_status",
]) {
  out.statusTables[`data_public_${t}`] = await rest({
    url: data.url,
    key: data.serviceRoleKey,
    schema: "public",
    table: t,
    limit: 20,
  });
}

// sample status_ids from cancellations
const canc = await rest({
  url: data.url,
  key: data.serviceRoleKey,
  schema: "public",
  table: "cancellations",
  select: "status_id,status,desfecho,estagio_cliente",
  limit: 20,
});
out.cancelSample = canc;

// unique status_ids via larger fetch
const allIds = await rest({
  url: data.url,
  key: data.serviceRoleKey,
  schema: "public",
  table: "cancellations",
  select: "status_id",
  limit: 1000,
});
const freq = {};
for (const r of allIds.sample || []) {
  // only 20 - need full
}
// fetch properly
{
  const endpoint = `${data.url}/rest/v1/cancellations?select=status_id&limit=1000`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: data.serviceRoleKey,
      Authorization: `Bearer ${data.serviceRoleKey}`,
      "Accept-Profile": "public",
    },
  });
  const rows = await res.json();
  const f = {};
  for (const r of rows || []) {
    const k = r.status_id || "(null)";
    f[k] = (f[k] || 0) + 1;
  }
  out.statusIdFreq = f;
}

// Airtable on DATA
for (const schema of ["bkp_airtable", "public", "airtable", "backup"]) {
  for (const table of ["bkp_clientes_id", "bkp_reunioes", "clientes_id", "reunioes"]) {
    out.airtable[`data_${schema}_${table}`] = await rest({
      url: data.url,
      key: data.serviceRoleKey,
      schema,
      table,
      limit: 2,
    });
  }
}

// Airtable on AUTH with anon and service if present
for (const [label, key] of [
  ["anon", authAnon],
  ["service", authService],
]) {
  if (!key) {
    out.airtable[`auth_${label}_missing_key`] = true;
    continue;
  }
  for (const schema of ["bkp_airtable", "public", "dw_bitrix", "bl_test", "contracts_app"]) {
    for (const table of ["bkp_clientes_id", "bkp_reunioes"]) {
      out.airtable[`auth_${label}_${schema}_${table}`] = await rest({
        url: authUrl,
        key,
        schema,
        table,
        limit: 2,
      });
    }
  }
}

// Also search clients_airtable on DATA
out.airtable.data_public_clientes_airtable = await rest({
  url: data.url,
  key: data.serviceRoleKey,
  schema: "public",
  table: "clientes_airtable",
  limit: 2,
});

fs.writeFileSync("scripts/_audit_cancel_airtable_deep.json", JSON.stringify(out, null, 2));

function brief(v) {
  if (v === true) return v;
  if (!v || typeof v !== "object") return v;
  return { ok: v.ok, status: v.status, total: v.total, cols: v.cols, err: v.error, sample: v.sample };
}

console.log(JSON.stringify({
  statusTables: Object.fromEntries(Object.entries(out.statusTables).map(([k, v]) => [k, brief(v)])),
  statusIdFreq: out.statusIdFreq,
  cancelSample: brief(out.cancelSample),
  airtableHits: Object.fromEntries(
    Object.entries(out.airtable)
      .filter(([, v]) => v && v.ok)
      .map(([k, v]) => [k, brief(v)]),
  ),
  airtableErrors: Object.fromEntries(
    Object.entries(out.airtable)
      .filter(([, v]) => v && v.ok === false)
      .slice(0, 12)
      .map(([k, v]) => [k, { status: v.status, err: v.error }]),
  ),
}, null, 2));
