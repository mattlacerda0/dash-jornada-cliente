/**
 * Audit cancellations_statuses + bkp_airtable
 * node --env-file=.env scripts/audit_cancel_airtable.mjs
 */
import { getDataEnv } from "../netlify/functions/_shared/env.mjs";
import fs from "node:fs";

async function qv(table, { select = "*", limit = 5, filters = "" } = {}) {
  const { url, serviceRoleKey } = getDataEnv();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("limit", String(limit));
  if (filters) {
    for (const part of filters.split("&")) {
      const i = part.indexOf("=");
      if (i > 0) endpoint.searchParams.set(part.slice(0, i), part.slice(i + 1));
    }
  }
  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  // also get sample without range restriction for cols
  const sampleRes = await fetch(
    `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}${filters ? "&" + filters : ""}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
        "Accept-Profile": "public",
        "Content-Profile": "public",
      },
    },
  );
  const cr = res.headers.get("content-range") || "";
  const m = cr.match(/\/(\d+|\*)\s*$/);
  const total = m && m[1] !== "*" ? Number(m[1]) : null;
  const data = await sampleRes.json().catch(() => []);
  const arr = Array.isArray(data) ? data : [];
  return {
    ok: sampleRes.ok,
    status: sampleRes.status,
    total,
    cols: arr[0] ? Object.keys(arr[0]) : [],
    sample: arr.slice(0, 3),
    error: sampleRes.ok ? null : JSON.stringify(data).slice(0, 240),
  };
}

async function biz(schema, table, { select = "*", limit = 3 } = {}) {
  const url = (process.env.BUSINESS_DATA_SUPABASE_URL || process.env.AUTH_SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const key = (process.env.AUTH_SUPABASE_ANON_KEY || "").trim();
  const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}`;
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
    schema,
    ok: res.ok,
    status: res.status,
    total,
    cols: arr[0] ? Object.keys(arr[0]) : [],
    sample: arr.slice(0, 2),
    error: res.ok ? null : JSON.stringify(data).slice(0, 240),
  };
}

const out = {};
out.statuses = await qv("cancellations_statuses", { select: "*", limit: 100 });
out.cancel_with_status = await qv("cancellations", {
  select: "id,status_id,client_id",
  limit: 5,
  filters: "status_id=not.is.null",
});

// process counts
out.in_process = await qv("cancellations", {
  select: "client_id",
  limit: 1,
  filters: "archived_at=is.null&or=(data_pedido.not.is.null,intencao_registrada_at.not.is.null)&churn_efetivado_at=is.null&distrato_assinado_at=is.null",
});

for (const schema of ["bkp_airtable", "public", "research"]) {
  out[`clientes_${schema}`] = await biz(schema, "bkp_clientes_id");
  out[`reunioes_${schema}`] = await biz(schema, "bkp_reunioes");
}

fs.writeFileSync("scripts/_audit_cancel_airtable.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  statuses: { ok: out.statuses.ok, total: out.statuses.total, cols: out.statuses.cols, sample: out.statuses.sample },
  cancel_status: { ok: out.cancel_with_status.ok, total: out.cancel_with_status.total },
  in_process: out.in_process,
  airtable: Object.fromEntries(
    Object.entries(out)
      .filter(([k]) => k.startsWith("clientes_") || k.startsWith("reunioes_"))
      .map(([k, v]) => [k, { ok: v.ok, status: v.status, total: v.total, cols: v.cols, err: v.error }]),
  ),
}, null, 2));
