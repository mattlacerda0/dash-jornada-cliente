/** Probe cycle-related tables/columns. node --env-file=.env scripts/_probe_cycle_tables.mjs */
import { getDataEnv } from "../netlify/functions/_shared/env.mjs";
const { url, serviceRoleKey: key } = getDataEnv();

async function probe(table, select = "*") {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": "public",
      Prefer: "count=exact",
    },
  });
  const data = await res.json().catch(() => null);
  const arr = Array.isArray(data) ? data : [];
  return {
    table,
    ok: res.ok,
    status: res.status,
    range: res.headers.get("content-range"),
    cols: arr[0] ? Object.keys(arr[0]) : null,
    err: res.ok ? null : JSON.stringify(data).slice(0, 180),
  };
}

const names = [
  "client_cycles", "client_ciclo", "client_ciclos", "ciclos_clientes", "ciclo_clientes",
  "client_contract_cycles", "contract_cycles", "client_contracts", "contracts",
  "client_enrollments", "enrollments", "client_program_history", "client_history",
  "client_status_history", "client_lifecycle", "lifecycle_events",
  "clients_cycles", "qv_ciclos", "ciclos", "cycles", "renovacoes", "renewals",
  "client_renewals", "subscription_cycles", "subscriptions",
];
const hits = [];
for (const t of names) {
  const p = await probe(t);
  if (p.ok || (p.status !== 404 && !String(p.err || "").includes("PGRST205"))) hits.push(p);
  else if (p.status === 404 && p.err?.includes("Perhaps you meant")) hits.push(p);
}

// Also check clients columns for cycle-like fields
const clients = await probe("clients", "id,data_inicio_ciclo,created_at,status,programa,engenheiro_patrimonial");
console.log(JSON.stringify({ hits, clients }, null, 2));

// Compare fl_churn vs analytical cancel
const cancelCount = await fetch(`${url}/rest/v1/cancellations?select=client_id&archived_at=is.null&or=(churn_efetivado_at.not.is.null,distrato_assinado_at.not.is.null)`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "public", Prefer: "count=exact", Range: "0-0" },
});
const viewChurn = await fetch(`${url}/rest/v1/vw_clients_ciclo_churn?select=client_id&fl_churn=eq.true`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "public", Prefer: "count=exact", Range: "0-0" },
});
console.log("cancel_confirmed_rows", cancelCount.headers.get("content-range"));
console.log("view_fl_churn_true", viewChurn.headers.get("content-range"));
