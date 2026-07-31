/**
 * Auditoria de viabilidade — Performance EP + Cruzamentos.
 * Uso: node --env-file=.env scripts/audit_ep_crosses_viability.mjs
 */
import {
  getDataEnv,
  dataConfigurationError,
  getPharusEnv,
  getPharusSupabaseClient,
  pharusConfigurationError,
} from "../netlify/functions/_shared/env.mjs";

function pickCols(cols, patterns) {
  return (cols || []).filter((c) => patterns.some((p) => p.test(c)));
}

async function qvRest(table, { select = "*", limit = 3, filters = "", countExact = false } = {}) {
  const { url, serviceRoleKey } = getDataEnv();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set("select", select);
  if (limit != null) endpoint.searchParams.set("limit", String(limit));
  if (filters) {
    for (const part of filters.split("&")) {
      if (!part) continue;
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      endpoint.searchParams.set(part.slice(0, eq), decodeURIComponent(part.slice(eq + 1)));
    }
  }
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
  const totalMatch = cr.match(/\/(\d+|\*)\s*$/);
  const total = totalMatch && totalMatch[1] !== "*" ? Number(totalMatch[1]) : null;
  return {
    ok: res.ok,
    status: res.status,
    data,
    total,
    cols: data[0] ? Object.keys(data[0]) : [],
    sample: data[0] || null,
    error: res.ok ? null : text.slice(0, 300),
  };
}

async function qvProbe(table) {
  const r = await qvRest(table, { select: "*", limit: 1, countExact: true });
  return {
    ok: r.ok,
    status: r.status,
    total: r.total,
    cols: r.cols,
    sample: r.sample,
    error: r.error,
  };
}

async function qvCount(table, filter = "") {
  const r = await qvRest(table, { select: "*", limit: 1, filters: filter, countExact: true });
  return { ok: r.ok, total: r.total, error: r.error };
}

async function qvCountFilled(table, col) {
  return qvCount(table, `${col}=not.is.null`);
}

async function main() {
  const cfgErr = dataConfigurationError();
  if (cfgErr) throw new Error(cfgErr);

  const out = { qv: {}, pharus: {}, notes: [] };

  // ---- BASE QV ----
  out.qv.clients = await qvProbe("clients");
  const cc = out.qv.clients.cols || [];
  out.qv.ep_fields = {
    all_ep_like: pickCols(cc, [/engenheiro|advisor|ep_|responsável|responsavel|gestor/i]),
    name: pickCols(cc, [/engenheiro_patrimonial$/i]),
    id: pickCols(cc, [/engenheiro.*id|advisor.*id|ep_id/i]),
    email: pickCols(cc, [/engenheiro.*mail|advisor.*mail/i]),
  };

  out.qv.clients_coverage = {
    total: (await qvCount("clients")).total,
    engenheiro_patrimonial: await qvCountFilled("clients", "engenheiro_patrimonial"),
    engenheiro_patrimonial_id: await qvCountFilled("clients", "engenheiro_patrimonial_id"),
    engenheiro_patrimonial_email: await qvCountFilled("clients", "engenheiro_patrimonial_email"),
  };

  for (const t of [
    "client_ep_history",
    "ep_assignments",
    "client_advisor_history",
    "historico_ep",
    "client_responsavel_history",
  ]) {
    out.qv[t] = await qvProbe(t);
  }

  for (const t of ["nps_responses", "nps", "survey_responses", "pesquisas_nps", "client_nps"]) {
    const p = await qvProbe(t);
    out.qv[t] = p;
    if (p.ok && p.cols?.length) {
      out.qv[`${t}_score_cols`] = pickCols(p.cols, [/nps|score|nota|rating|promoter|detractor/i]);
      out.qv[`${t}_date_cols`] = pickCols(p.cols, [/submitted|respond|created|data|at$/i]);
      out.qv[`${t}_client_cols`] = pickCols(p.cols, [/client|user|account|cpf/i]);
      out.qv[`${t}_ep_cols`] = pickCols(p.cols, [/engenheiro|advisor|ep_|responsavel/i]);
      for (const sc of (out.qv[`${t}_score_cols`] || []).slice(0, 2)) {
        out.qv[`${t}_filled_${sc}`] = await qvCountFilled(t, sc);
      }
    }
  }

  for (const t of [
    "contracts",
    "client_contracts",
    "contratos",
    "renewals",
    "renovacoes",
    "subscription_cycles",
    "plan_renewals",
    "payments",
    "client_payments",
  ]) {
    out.qv[t] = await qvProbe(t);
  }

  for (const t of [
    "support_tickets",
    "tickets",
    "messages",
    "message_threads",
    "atendimentos",
    "interacoes",
    "slack_messages",
    "communications",
    "v_acionamentos_tratados",
    "v_acionamentos_qualidade_email",
  ]) {
    out.qv[t] = await qvProbe(t);
  }

  out.qv.client_mecanismos = await qvProbe("client_mecanismos");
  if (out.qv.client_mecanismos.ok) {
    const cm = out.qv.client_mecanismos.cols || [];
    out.qv.mecanismos_cols = {
      status: pickCols(cm, [/status|state/i]),
      dates: pickCols(cm, [/implemented|completed|approved|suggested|created|at$/i]),
      ep: pickCols(cm, [/engenheiro|advisor|ep_|responsavel|created_by/i]),
      client: pickCols(cm, [/client/i]),
    };
    out.qv.mecanismos_impl = await qvCountFilled("client_mecanismos", "implemented_at");
    out.qv.mecanismos_total = await qvCount("client_mecanismos");
    const statusSample = await qvRest("client_mecanismos", {
      select: "status,implemented_at,client_id,mecanismo_id",
      limit: 200,
    });
    const byStatus = {};
    for (const r of statusSample.data || []) {
      const s = String(r.status || "(null)");
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    out.qv.mecanismos_status_sample200 = byStatus;
    out.qv.mecanismos_impl_in_sample = (statusSample.data || []).filter((r) => r.implemented_at).length;
  }

  out.qv.meetings = await qvProbe("meetings");
  out.qv.client_meetings = await qvProbe("client_meetings");
  out.qv.manual_meetings = await qvProbe("manual_meetings");
  out.qv.meeting_attendance = await qvProbe("meeting_attendance");

  out.qv.cancellations = await qvProbe("cancellations");
  out.qv.churn_filled = await qvCountFilled("cancellations", "churn_efetivado_at");
  out.qv.distrato_filled = await qvCountFilled("cancellations", "distrato_assinado_at");
  out.qv.pedido_filled = await qvCountFilled("cancellations", "data_pedido");
  out.qv.intencao_filled = await qvCountFilled("cancellations", "intencao_registrada_at");

  const finSample = await qvRest("clients", {
    select:
      "id,renda_mensal,patrimonio_liquido,reserva_emergencia,aporte_mensal,segmento,segmentacao,data_de_fechamento,data_inicio_ciclo,engenheiro_patrimonial,engenheiro_patrimonial_id,status",
    limit: 500,
  });
  const finCov = {};
  const finCols = [
    "renda_mensal",
    "patrimonio_liquido",
    "reserva_emergencia",
    "aporte_mensal",
    "segmento",
    "segmentacao",
    "data_de_fechamento",
    "data_inicio_ciclo",
    "engenheiro_patrimonial",
    "engenheiro_patrimonial_id",
  ];
  for (const col of finCols) {
    const rows = finSample.data || [];
    const n = rows.filter((r) => r[col] != null && String(r[col]).trim() !== "").length;
    finCov[col] = {
      sample: rows.length,
      filled: n,
      pct: rows.length ? +(100 * (n / rows.length)).toFixed(1) : 0,
    };
  }
  out.qv.financial_coverage_sample500 = finCov;
  out.qv.clients_all_cols = cc;

  if (out.qv.nps_responses?.ok) {
    const npsSample = await qvRest("nps_responses", { select: "*", limit: 50 });
    out.qv.nps_sample_keys = npsSample.data[0] ? Object.keys(npsSample.data[0]) : [];
    out.qv.nps_sample = (npsSample.data || []).slice(0, 3);
    const scoreCol = (out.qv.nps_responses_score_cols || [])[0] || "score";
    const scores = (npsSample.data || [])
      .map((r) => Number(r[scoreCol]))
      .filter((n) => Number.isFinite(n));
    out.qv.nps_score_range = scores.length
      ? { min: Math.min(...scores), max: Math.max(...scores), n: scores.length, col: scoreCol }
      : null;
  }

  // ---- PHARUS ----
  const phErr = pharusConfigurationError();
  if (phErr) {
    out.pharus.error = phErr;
  } else {
    const phEnv = getPharusEnv();
    out.pharus.env_schema = phEnv.schema;
    const client = getPharusSupabaseClient({ schema: phEnv.schema || "core" });
    // also try core explicitly if schema is public
    const schemasToTry = [...new Set([phEnv.schema || "core", "core", "public"])];

    async function phProbe(table, schema) {
      const c = getPharusSupabaseClient({ schema });
      const page = await c.rest(table, { select: "*", limit: 1, countExact: true, head: false });
      return {
        schema,
        ok: page.ok,
        status: page.status,
        total: page.total,
        cols: page.data[0] ? Object.keys(page.data[0]) : [],
        sample: page.data[0] || null,
        error: page.ok ? null : (page.raw || "").slice(0, 300),
      };
    }

    for (const t of [
      "accounts",
      "scheduled_meetings",
      "meetings",
      "advisor_meeting_binding",
      "advisor_calendly_event_type_snapshot",
      "meeting_outputs",
      "meeting_quality_dimension",
      "scheduled_meeting_evaluation",
      "user_mechanisms",
      "mechanisms",
      "user_engines",
      "csat_poll",
      "user_contracts",
      "user_payments",
      "user_metadata",
      "user_progress",
      "advisors",
    ]) {
      let best = null;
      for (const sch of schemasToTry) {
        const p = await phProbe(t, sch);
        if (p.ok) {
          best = p;
          break;
        }
        if (!best || (p.status && p.status !== 404)) best = p;
      }
      out.pharus[t] = best;
    }

    if (out.pharus.user_mechanisms?.ok) {
      const c = getPharusSupabaseClient({ schema: out.pharus.user_mechanisms.schema });
      const page = await c.rest("user_mechanisms", {
        select:
          "status,implemented_at,completed_at,approved_at,suggested_at,created_at,user_id,advisor_id,advisor_internal_id",
        limit: 200,
      });
      // if select fails due to missing cols, fallback *
      let um = page.ok ? page.data : [];
      if (!page.ok) {
        const page2 = await c.rest("user_mechanisms", { select: "*", limit: 200 });
        um = page2.data || [];
        out.pharus.user_mechanisms_select_error = (page.raw || "").slice(0, 200);
      }
      const byStatus = {};
      for (const r of um) {
        const s = String(r.status ?? "(null)");
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      out.pharus.user_mechanisms_status_dist_sample200 = byStatus;
      out.pharus.user_mechanisms_impl_dates = {
        implemented_at: um.filter((r) => r.implemented_at).length,
        completed_at: um.filter((r) => r.completed_at).length,
        approved_at: um.filter((r) => r.approved_at).length,
        advisor_id: um.filter((r) => r.advisor_id != null).length,
        advisor_internal_id: um.filter((r) => r.advisor_internal_id != null).length,
        n: um.length,
        cols_present: um[0] ? Object.keys(um[0]) : out.pharus.user_mechanisms.cols,
      };
    }

    if (out.pharus.csat_poll?.ok) {
      const c = getPharusSupabaseClient({ schema: out.pharus.csat_poll.schema });
      const page = await c.rest("csat_poll", { select: "*", limit: 20 });
      const cs = page.data || [];
      out.pharus.csat_sample = cs.slice(0, 2);
      out.pharus.csat_cols = out.pharus.csat_poll.cols;
      out.pharus.csat_score_cols = pickCols(out.pharus.csat_poll.cols || [], [
        /score|rating|nota|nps|csat|value|answer/i,
      ]);
      const col = out.pharus.csat_score_cols[0];
      if (col) {
        const vals = cs.map((r) => Number(r[col])).filter((n) => Number.isFinite(n));
        out.pharus.csat_range = vals.length
          ? { min: Math.min(...vals), max: Math.max(...vals), col }
          : null;
      }
    }

    if (out.pharus.advisors?.ok) {
      const c = getPharusSupabaseClient({ schema: out.pharus.advisors.schema });
      const page = await c.rest("advisors", { select: "*", limit: 30 });
      out.pharus.advisors_cols = out.pharus.advisors.cols;
      out.pharus.advisors_sample = (page.data || []).slice(0, 3);
    }

    if (out.pharus.accounts?.ok) {
      out.pharus.accounts_link_cols = pickCols(out.pharus.accounts.cols || [], [
        /email|cpf|external|qv|client|user|name/i,
      ]);
    }

    if (out.pharus.scheduled_meetings?.ok) {
      out.pharus.scheduled_meetings_cols = out.pharus.scheduled_meetings.cols;
    }

    if (out.pharus.user_contracts?.ok) {
      const c = getPharusSupabaseClient({ schema: out.pharus.user_contracts.schema });
      const page = await c.rest("user_contracts", { select: "*", limit: 10 });
      out.pharus.user_contracts_cols = out.pharus.user_contracts.cols;
      out.pharus.user_contracts_sample = (page.data || []).slice(0, 2);
      out.pharus.user_contracts_renewal_cols = pickCols(out.pharus.user_contracts.cols || [], [
        /renew|renov|cycle|vencenc|end|start|status|eligib/i,
      ]);
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
