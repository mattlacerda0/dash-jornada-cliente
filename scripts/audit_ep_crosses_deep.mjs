/**
 * Deep probes after schema discovery.
 * node --env-file=.env scripts/audit_ep_crosses_deep.mjs
 */
import { getDataEnv, getPharusSupabaseClient, getPharusEnv } from "../netlify/functions/_shared/env.mjs";
import fs from "node:fs";

async function qvRest(table, { select = "*", limit = 1, filters = {}, countExact = true } = {}) {
  const { url, serviceRoleKey } = getDataEnv();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set("select", select);
  if (limit != null) endpoint.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(filters)) endpoint.searchParams.set(k, String(v));
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
  if (countExact) {
    headers.Prefer = "count=exact";
    headers.Range = "0-0";
  }
  const res = await fetch(endpoint, { headers });
  const text = await res.text();
  let data = [];
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = [];
  }
  if (!Array.isArray(data)) data = data == null ? [] : [data];
  const cr = res.headers.get("content-range") || "";
  const m = cr.match(/\/(\d+|\*)\s*$/);
  const total = m && m[1] !== "*" ? Number(m[1]) : null;
  return { ok: res.ok, status: res.status, total, data, error: res.ok ? null : text.slice(0, 240) };
}

async function main() {
  const out = {};

  out.nps_total = (await qvRest("nps_responses", { select: "id" })).total;
  out.nps_with_client = (await qvRest("nps_responses", { select: "id", filters: { client_id: "not.is.null" } })).total;
  out.nps_with_score = (await qvRest("nps_responses", { select: "id", filters: { score: "not.is.null" } })).total;

  const scores = await qvRest("nps_responses", {
    select: "score,client_id,submitted_at,tipo_de_forms",
    limit: 500,
    countExact: false,
  });
  const sc = (scores.data || []).map((r) => Number(r.score)).filter(Number.isFinite);
  out.nps_score_stats = {
    n: sc.length,
    min: sc.length ? Math.min(...sc) : null,
    max: sc.length ? Math.max(...sc) : null,
    distinct_clients: new Set((scores.data || []).map((r) => r.client_id).filter(Boolean)).size,
  };
  out.tipo_forms = {};
  for (const r of scores.data || []) {
    const t = String(r.tipo_de_forms || "(null)");
    out.tipo_forms[t] = (out.tipo_forms[t] || 0) + 1;
  }

  const clients = await qvRest("clients", {
    select: "id,engenheiro_patrimonial,engenheiros_anteriores,status,data_inicio_ciclo,created_at",
    limit: 5000,
    countExact: false,
  });
  const epById = new Map((clients.data || []).map((c) => [String(c.id), c.engenheiro_patrimonial]));
  let withEp = 0;
  let withoutEp = 0;
  let noClient = 0;
  const byEp = {};
  for (const r of scores.data || []) {
    if (!r.client_id) {
      noClient += 1;
      continue;
    }
    const ep = epById.get(String(r.client_id));
    if (!ep || !String(ep).trim()) {
      withoutEp += 1;
      continue;
    }
    withEp += 1;
    byEp[ep] = (byEp[ep] || 0) + 1;
  }
  out.nps_ep_join = {
    withEp,
    withoutEp,
    noClient,
    eps_with_responses: Object.keys(byEp).length,
    below_5_responses: Object.values(byEp).filter((n) => n < 5).length,
    responses_per_ep_top: Object.entries(byEp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
  };

  // engenheiros_anteriores sample
  const ant = (clients.data || []).filter((c) => c.engenheiros_anteriores != null && String(c.engenheiros_anteriores).trim());
  out.engenheiros_anteriores = {
    filled: ant.length,
    sample: ant.slice(0, 5).map((c) => ({
      id: c.id,
      current: c.engenheiro_patrimonial,
      anteriores: c.engenheiros_anteriores,
      type: typeof c.engenheiros_anteriores,
    })),
  };

  out.cm_impl = (await qvRest("client_mecanismos", { select: "id", filters: { implemented_at: "not.is.null" } })).total;
  out.cm_concluido = (await qvRest("client_mecanismos", { select: "id", filters: { status: "eq.concluido" } })).total;
  const cm = await qvRest("client_mecanismos", {
    select: "status,implemented_at,client_id,mecanismo_id",
    limit: 2000,
    countExact: false,
  });
  out.cm_status_all = {};
  for (const r of cm.data || []) {
    const s = String(r.status || "(null)");
    out.cm_status_all[s] = (out.cm_status_all[s] || 0) + 1;
  }
  out.cm_impl_in_fetch = (cm.data || []).filter((r) => r.implemented_at).length;
  out.cm_cols = Object.keys((await qvRest("client_mecanismos", { select: "*", limit: 1, countExact: false })).data[0] || {});

  // join mechanisms to current EP
  let mechClients = 0;
  let mechWithEp = 0;
  const mechByEp = {};
  const implRows = (cm.data || []).filter((r) => r.implemented_at || String(r.status || "").toLowerCase() === "concluido");
  const distinctImplClients = new Set(implRows.map((r) => r.client_id).filter(Boolean));
  for (const cid of distinctImplClients) {
    mechClients += 1;
    const ep = epById.get(String(cid));
    if (ep && String(ep).trim()) {
      mechWithEp += 1;
      mechByEp[ep] = (mechByEp[ep] || 0) + 1;
    }
  }
  out.mecanismos_ep_attr = {
    note: "Atribuição via EP atual do cliente (client_mecanismos sem coluna EP)",
    distinct_impl_clients: distinctImplClients.size,
    with_current_ep: mechWithEp,
    by_ep_top: Object.entries(mechByEp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  };

  for (const t of ["client_meetings", "manual_meetings", "meeting_attendance", "meetings"]) {
    const probe = await qvRest(t, { select: "*", limit: 2, countExact: true });
    out[`meet_${t}`] = {
      ok: probe.ok,
      total: probe.total,
      cols: probe.data[0] ? Object.keys(probe.data[0]) : [],
      sample: probe.data[0] || null,
      error: probe.error,
    };
  }

  const canc = await qvRest("cancellations", {
    select:
      "client_id,churn_efetivado_at,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,is_archived",
    limit: 2000,
    countExact: false,
  });
  const confirmed = new Set();
  const pedidoOnly = new Set();
  const intencaoOnly = new Set();
  for (const r of canc.data || []) {
    const archived = r.is_archived === true || r.archived_at;
    if (archived) continue;
    if (r.churn_efetivado_at || r.distrato_assinado_at) confirmed.add(r.client_id);
    else if (r.data_pedido) pedidoOnly.add(r.client_id);
    else if (r.intencao_registrada_at) intencaoOnly.add(r.client_id);
  }
  out.cancel_counts = {
    rows: (canc.data || []).length,
    confirmed_clients: confirmed.size,
    pedido_only: pedidoOnly.size,
    intencao_only: intencaoOnly.size,
  };

  // financial coverage full-ish
  const fin = await qvRest("clients", {
    select:
      "id,renda_mensal,patrimonio_liquido,reserva_emergencia,aporte_mensal,segmentacao,data_inicio_ciclo,engenheiro_patrimonial,status",
    limit: 5000,
    countExact: false,
  });
  const finCov = {};
  for (const col of [
    "renda_mensal",
    "patrimonio_liquido",
    "reserva_emergencia",
    "aporte_mensal",
    "segmentacao",
    "data_inicio_ciclo",
    "engenheiro_patrimonial",
  ]) {
    const n = (fin.data || []).filter((r) => r[col] != null && String(r[col]).trim() !== "").length;
    finCov[col] = { n, of: (fin.data || []).length, pct: +((100 * n) / Math.max(1, (fin.data || []).length)).toFixed(1) };
  }
  out.financial_fullish = finCov;

  // Pharus status distribution full
  const phEnv = getPharusEnv();
  const ph = getPharusSupabaseClient({ schema: phEnv.schema || "public" });
  const um = await ph.rest("user_mechanisms", { select: "status", limit: 1000, countExact: true });
  const byStatus = {};
  for (const r of um.data || []) {
    const s = String(r.status ?? "(null)");
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  out.pharus_um = { total: um.total, sample_n: (um.data || []).length, byStatus, cols: (await ph.rest("user_mechanisms", { select: "*", limit: 1 })).data[0] ? Object.keys((await ph.rest("user_mechanisms", { select: "*", limit: 1 })).data[0]) : [] };

  // Pharus advisors alternative tables
  for (const t of ["advisor", "advisor_profile", "profiles", "users", "internal_advisors"]) {
    const page = await ph.rest(t, { select: "*", limit: 2, countExact: true });
    out[`pharus_${t}`] = { ok: page.ok, status: page.status, total: page.total, cols: page.data[0] ? Object.keys(page.data[0]) : [], err: page.ok ? null : (page.raw || "").slice(0, 120) };
  }

  // scheduled_meetings status
  const sm = await ph.rest("scheduled_meetings", { select: "status,advisor_internal_id,user_id,start_time", limit: 700, countExact: true });
  const smStatus = {};
  let withAdvisor = 0;
  for (const r of sm.data || []) {
    smStatus[String(r.status ?? "(null)")] = (smStatus[String(r.status ?? "(null)")] || 0) + 1;
    if (r.advisor_internal_id) withAdvisor += 1;
  }
  out.pharus_sm = { total: sm.total, status: smStatus, withAdvisor, n: (sm.data || []).length };

  // user_payments as renewal? just structure
  const pay = await ph.rest("user_payments", { select: "*", limit: 5, countExact: true });
  out.pharus_payments = { total: pay.total, cols: pay.data[0] ? Object.keys(pay.data[0]) : [], sample: pay.data?.[0] };

  // csat empty confirm
  const csat = await ph.rest("csat_poll", { select: "*", limit: 5, countExact: true });
  out.pharus_csat = { total: csat.total, ok: csat.ok, cols: csat.data[0] ? Object.keys(csat.data[0]) : [] };

  fs.writeFileSync("scripts/_audit_deep.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    nps: out.nps_score_stats,
    tipo: out.tipo_forms,
    join: out.nps_ep_join,
    anteriores: out.engenheiros_anteriores,
    cm_impl: out.cm_impl,
    cm_concluido: out.cm_concluido,
    cm_status: out.cm_status_all,
    cm_cols: out.cm_cols,
    mech_ep: out.mecanismos_ep_attr,
    cancel: out.cancel_counts,
    meet_cm: out.meet_client_meetings,
    meet_man: out.meet_manual_meetings,
    financial: out.financial_fullish,
    pharus_um: out.pharus_um,
    pharus_sm: out.pharus_sm,
    pharus_csat: out.pharus_csat,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
