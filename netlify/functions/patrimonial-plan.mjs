const SOURCES = [
  {
    id: "qv360",
    label: "QV360",
    schema: process.env.QV360_SUPABASE_SCHEMA || "public",
    clientTables: ["clientes_airtable", "clients", "clientes"],
    planTables: ["documents"],
    revisionTables: ["revision"],
    url:
      process.env.QV360_SUPABASE_URL ||
      process.env.SUPABASE_QV360_URL ||
      "https://sfxbzfaxbbdjzuhzzrjc.supabase.co",
    key: process.env.QV360_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_QV360_SERVICE_ROLE_KEY,
  },
  {
    id: "app_pharus",
    label: "App Pharus",
    schema: process.env.APP_PHARUS_SUPABASE_SCHEMA || "core",
    clientTables: ["personal_info", "vw_clientes_pagamento_total", "accounts", "user_metadata", "clients", "clientes", "clientes_airtable"],
    planTables: ["user_contracts", "documents"],
    revisionTables: ["revision"],
    url:
      process.env.APP_PHARUS_SUPABASE_URL ||
      process.env.PHARUS_SUPABASE_URL ||
      "https://qvtqufdivpbmubooawdm.supabase.co",
    key: process.env.APP_PHARUS_SUPABASE_SERVICE_ROLE_KEY || process.env.PHARUS_SUPABASE_SERVICE_ROLE_KEY,
  },
];

import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError, getDataEnv } from "./_shared/env.mjs";

const PLAN_TABLES = [
  "client_patrimonial_plans",
  "patrimonial_plans",
  "planos_patrimoniais",
  "client_plans",
  "wealth_plans",
  "plans",
];

const REVISION_TABLES = [
  "patrimonial_plan_revisions",
  "client_patrimonial_plan_revisions",
  "plan_revisions",
  "planos_patrimoniais_revisoes",
];

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function average(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function pct(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = blankToNull(row?.[field]);
    if (value != null) return value;
  }
  return null;
}

function statusHas(row, tokens) {
  const raw = String(firstValue(row, ["status", "state", "etapa", "situacao", "fase"]) || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return tokens.some((token) => raw.includes(token));
}

function pickClientId(row) {
  return firstValue(row, ["client_id", "cliente_id", "clientId", "customer_id", "user_id", "owner_id", "model_id"]);
}

async function fetchAll(source, table, select = "*") {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const url = new URL(`/rest/v1/${table}`, source.url);
    url.searchParams.set("select", select);
    const response = await fetch(url, {
      headers: {
        apikey: source.key,
        Authorization: `Bearer ${source.key}`,
        "Accept-Profile": source.schema,
        "Content-Profile": source.schema,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

async function fetchFirstAvailable(source, tables, warnings) {
  for (const table of tables) {
    try {
      const rows = await fetchAll(source, table);
      return { table, rows };
    } catch (error) {
      warnings.push(`${source.label}.${table}: ${error.message}`);
    }
  }
  return { table: null, rows: [] };
}

function buildRevisionCount(revisions) {
  const map = new Map();
  for (const row of revisions) {
    const clientId = pickClientId(row);
    if (!clientId) continue;
    map.set(String(clientId), (map.get(String(clientId)) || 0) + 1);
  }
  return map;
}

function uniqueByClientId(clients) {
  const seen = new Set();
  const unique = [];
  for (const client of clients) {
    const clientId = String(firstValue(client, ["user_id", "id", "client_id", "uuid", "ID"]) || "");
    if (!clientId || seen.has(clientId)) continue;
    seen.add(clientId);
    unique.push(client);
  }
  return unique;
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isCentralIntelligenceMeeting(row) {
  return fold(firstValue(row, ["event_name", "title", "name", "meeting_type"]))
    .includes("central de inteligencia");
}

function buildCentralPlanRows(clients, meetings) {
  const clientsById = new Map();
  for (const client of clients) {
    const id = String(firstValue(client, ["id", "client_id", "uuid"]) || "");
    if (id) clientsById.set(id, client);
  }

  const meetingsByClient = new Map();
  for (const meeting of meetings.filter(isCentralIntelligenceMeeting)) {
    const clientId = String(pickClientId(meeting) || "");
    if (!clientId) continue;
    if (!meetingsByClient.has(clientId)) meetingsByClient.set(clientId, []);
    meetingsByClient.get(clientId).push(meeting);
  }

  return [...meetingsByClient.entries()].map(([clientId, clientMeetings]) => {
    const client = clientsById.get(clientId) || {};
    const contractDate = parseDate(firstValue(client, ["data_inicio_ciclo", "contract_date", "created_at"]));
    const meetingDates = clientMeetings
      .map((meeting) => parseDate(firstValue(meeting, ["start_time", "meeting_date", "scheduled_at", "created_at"])))
      .filter(Boolean)
      .sort((a, b) => a - b);
    const firstCentralMeeting = meetingDates[0] || null;
    const lastCentralMeeting = meetingDates.at(-1) || null;
    const centralMeetingsCount = clientMeetings.length;
    const revisionsCount = Math.max(0, centralMeetingsCount - 1);

    return {
      source: "BASE QV",
      clientId,
      clientCode: firstValue(client, ["codigo", "code", "qv_id", "external_id"]) || "Não informado",
      clientName: firstValue(client, ["name", "nome", "full_name"]) || "Não informado",
      program: firstValue(client, ["programa", "program"]) || null,
      contractDate: contractDate ? contractDate.toISOString() : null,
      planDelivered: true,
      planApproved: true,
      deliveredAt: firstCentralMeeting ? firstCentralMeeting.toISOString() : null,
      approvedAt: lastCentralMeeting ? lastCentralMeeting.toISOString() : null,
      daysToApproval: daysBetween(contractDate, lastCentralMeeting),
      revisedLater: centralMeetingsCount > 1,
      revisionsCount,
      planRecords: centralMeetingsCount,
      centralMeetingsCount,
    };
  });
}

function buildClientRows(source, clients, plans, revisions) {
  const planByClient = new Map();
  for (const plan of plans) {
    const clientId = pickClientId(plan);
    if (!clientId) continue;
    const id = String(clientId);
    if (!planByClient.has(id)) planByClient.set(id, []);
    planByClient.get(id).push(plan);
  }
  const revisionCount = buildRevisionCount(revisions);
  return clients.map((client) => {
    const clientId = String(firstValue(client, ["user_id", "id", "client_id", "uuid", "ID"]) || "");
    const contractDate = parseDate(firstValue(client, ["data_inicio_ciclo", "contract_date", "contrato_assinado", "created_at"]));
    const clientPlans = planByClient.get(clientId) || [];
    const deliveredDates = clientPlans
      .map((plan) => parseDate(firstValue(plan, ["delivered_at", "delivery_date", "data_entrega", "entregue_at", "signed_at", "created_at"])))
      .filter(Boolean);
    const approvedDates = clientPlans
      .map((plan) => parseDate(firstValue(plan, ["approved_at", "approval_date", "data_aprovacao", "aprovado_at", "signed_at", "updated_at"])))
      .filter(Boolean);
    const deliveredByStatus = clientPlans.some((plan) => statusHas(plan, ["entreg", "aprov", "finaliz", "conclu", "sign", "assin"]));
    const approvedByStatus = clientPlans.some((plan) => statusHas(plan, ["aprov", "sign", "assin"]));
    const firstDelivered = deliveredDates.sort((a, b) => a - b)[0] || null;
    const firstApproved = approvedDates.sort((a, b) => a - b)[0] || null;
    const explicitRevisionCount = clientPlans.reduce((sum, plan) => {
      const revision = Number(firstValue(plan, ["revision_count", "revisions_count", "quantidade_revisoes", "versao", "version"]) || 0);
      return sum + (Number.isFinite(revision) ? Math.max(0, revision) : 0);
    }, 0);
    const revisionsCount = Math.max(revisionCount.get(clientId) || 0, explicitRevisionCount);
    return {
      source: source.label,
      clientId,
      clientCode: firstValue(client, ["codigo", "code", "qv_id", "ID", "external_id"]) || "Não informado",
      clientName: firstValue(client, ["name", "nome", "full_name", "Nome do cliente"]) || "Não informado",
      program: firstValue(client, ["programa", "program"]) || (source.label === "App Pharus" ? "Pharus" : null),
      contractDate: contractDate ? contractDate.toISOString() : null,
      planDelivered: Boolean(firstDelivered || deliveredByStatus),
      planApproved: Boolean(firstApproved || approvedByStatus),
      deliveredAt: firstDelivered ? firstDelivered.toISOString() : null,
      approvedAt: firstApproved ? firstApproved.toISOString() : null,
      daysToApproval: daysBetween(contractDate, firstApproved),
      revisedLater: revisionsCount > 0,
      revisionsCount,
      planRecords: clientPlans.length,
    };
  });
}

function indicator(indicator, count, total, metric) {
  return {
    indicator,
    viability: "Sim",
    value: count,
    total,
    coverage: pct(count, total),
    metric,
  };
}

async function sourcePayload(source) {
  const warnings = [];
  if (!source.key) {
    return {
      source: source.label,
      configured: false,
      clientCount: 0,
      clientTable: null,
      planTable: null,
      revisionTable: null,
      rows: [],
      warnings: [`${source.label}: configure a service role key para consultar este Supabase.`],
    };
  }
  const clientResult = await fetchFirstAvailable(source, source.clientTables || ["clients"], warnings);
  const clients = uniqueByClientId(clientResult.rows);
  const planResult = await fetchFirstAvailable(source, source.planTables || PLAN_TABLES, warnings);
  const revisionResult = await fetchFirstAvailable(source, source.revisionTables || REVISION_TABLES, warnings);
  return {
    source: source.label,
    configured: true,
    clientCount: clients.length,
    clientTable: clientResult.table,
    planTable: planResult.table,
    revisionTable: revisionResult.table,
    rows: buildClientRows(source, clients, planResult.rows, revisionResult.rows),
    warnings,
  };
}

export default async function handler(request) {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  const configError = dataConfigurationError();
  if (configError) {
    return Response.json({ error: configError, code: "config" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { url, serviceRoleKey } = getDataEnv();
    const source = { id: "base_qv", label: "BASE QV", schema: "public", url, key: serviceRoleKey };
    const [clients, meetings] = await Promise.all([
      fetchAll(source, "clients"),
      fetchAll(source, "client_meetings"),
    ]);
    const uniqueClients = uniqueByClientId(clients);
    const rows = buildCentralPlanRows(uniqueClients, meetings);
    const total = uniqueClients.length;
    const centralMeetings = rows.reduce((sum, row) => sum + row.centralMeetingsCount, 0);
    const deliveredClients = rows.length;
    const approvalDaysCount = rows.filter((row) => row.daysToApproval != null && row.daysToApproval >= 0).length;
    const revisedCount = rows.filter((row) => row.revisedLater).length;
    const revisionsTotal = rows.reduce((sum, row) => sum + row.revisionsCount, 0);
    const validApprovalDays = rows.map((row) => row.daysToApproval).filter((days) => days != null && days >= 0);

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          totalClients: total,
          qv360Clients: 0,
          appPharusClients: 0,
          baseQvClients: total,
          planDelivered: centralMeetings,
          deliveredClients,
          planApproved: deliveredClients,
          averageDaysToApproval: average(validApprovalDays),
          daysToApprovalCount: approvalDaysCount,
          daysToApprovalCoveragePercent: pct(approvalDaysCount, total),
          revisedLater: revisedCount,
          revisionsTotal,
        },
        indicators: [
          indicator("Plano entregue", centralMeetings, meetings.length, "Contagem de reuniões em public.client_meetings cujo event_name contém Central de Inteligência."),
          indicator("Plano aprovado", deliveredClients, total, "Proxy: clientes distintos com reunião Central de Inteligência; não representa aprovação formal."),
          indicator("Dias até aprovação", approvalDaysCount, total, "Proxy: diferença entre contratação e última reunião Central de Inteligência; diferenças negativas excluídas."),
          indicator("Plano revisado posteriormente", revisedCount, total, "Clientes com mais de uma reunião Central de Inteligência."),
          indicator("Quantidade de revisões", revisionsTotal, total, "Soma por cliente de quantidade de reuniões Central de Inteligência menos um."),
        ],
        sources: {
          databases: [{
            source: "BASE QV",
            configured: true,
            schema: "public",
            clientCount: total,
            clientTable: "clients",
            planTable: "client_meetings",
            revisionTable: "client_meetings",
          }],
          warnings: [],
        },
        clients: rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error.message || "Falha ao consolidar Plano Patrimonial" }, { status: 500 });
  }
}
