/**
 * Deep audit for cycle fields usable for renewals.
 * node --env-file=.env scripts/_audit_ciclo_fields.mjs
 */
import { getDataEnv } from "../netlify/functions/_shared/env.mjs";
import fs from "node:fs";

const { url, serviceRoleKey: key } = getDataEnv();

async function rest(path, { schema = "public" } = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": schema,
      Prefer: "count=exact",
    },
  });
  const data = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    range: res.headers.get("content-range"),
    data,
    err: res.ok ? null : JSON.stringify(data).slice(0, 240),
  };
}

const out = {};

// Full sample of ciclo view
const view = await rest("/rest/v1/vw_clients_ciclo_churn?select=*&limit=3");
out.viewCols = Array.isArray(view.data) && view.data[0] ? Object.keys(view.data[0]) : [];
out.viewSample = Array.isArray(view.data) ? view.data.slice(0, 2) : view.data;

// Probe alternate views / tables with "ciclo" in name via known candidates
const candidates = [
  "vw_clients_ciclo_churn",
  "vw_clientes_ciclo",
  "vw_ciclos_clientes",
  "vw_client_cycles",
  "vw_renovacoes",
  "vw_clients_renovacao",
  "vw_info_cliente",
  "client_statuses",
  "csat_cycles",
  "nps_cycles",
];
out.probes = {};
for (const t of candidates) {
  const r = await rest(`/rest/v1/${t}?select=*&limit=1`);
  out.probes[t] = {
    ok: r.ok,
    status: r.status,
    range: r.range,
    cols: Array.isArray(r.data) && r.data[0] ? Object.keys(r.data[0]) : null,
    err: r.err,
  };
}

// Clients columns that might encode cycle number
const clientsCols = await rest("/rest/v1/clients?select=*&limit=1");
out.clientsCols = Array.isArray(clientsCols.data) && clientsCols.data[0]
  ? Object.keys(clientsCols.data[0]).filter((c) =>
    /ciclo|cycle|renov|program|contrato|contract/i.test(c)
  )
  : [];
out.clientsAllColsHint = Array.isArray(clientsCols.data) && clientsCols.data[0]
  ? Object.keys(clientsCols.data[0]).length
  : 0;

// vw_info_cliente if exists
if (out.probes.vw_info_cliente?.ok) {
  const info = await rest("/rest/v1/vw_info_cliente?select=*&limit=2");
  out.infoCols = Array.isArray(info.data) && info.data[0] ? Object.keys(info.data[0]) : [];
  out.infoSample = Array.isArray(info.data) ? info.data.slice(0, 1) : null;
  out.infoCycleish = (out.infoCols || []).filter((c) =>
    /ciclo|cycle|renov|ep|engenheiro|inicio|fim/i.test(c)
  );
}

// Look for qtd / numero ciclo in any exposed view by searching OpenAPI if available
const openapi = await rest("/");
out.openapiHasPaths = openapi.ok && openapi.data && typeof openapi.data === "object"
  ? Object.keys(openapi.data.paths || {}).filter((p) => /ciclo|cycle|renov/i.test(p)).slice(0, 40)
  : null;

fs.writeFileSync("scripts/_audit_ciclo_fields.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  viewCols: out.viewCols,
  clientsCycleish: out.clientsCols,
  infoCycleish: out.infoCycleish || null,
  openapiPaths: out.openapiHasPaths,
  probesOk: Object.entries(out.probes).filter(([, v]) => v.ok).map(([k]) => k),
}, null, 2));
