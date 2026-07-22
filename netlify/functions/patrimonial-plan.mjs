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

export default async function handler() {
  try {
    const results = await Promise.all(SOURCES.map(sourcePayload));
    const rows = results.flatMap((result) => result.rows);
    const total = rows.length;
    const deliveredCount = rows.filter((row) => row.planDelivered).length;
    const approvedCount = rows.filter((row) => row.planApproved).length;
    const approvalDaysCount = rows.filter((row) => row.daysToApproval != null).length;
    const revisedCount = rows.filter((row) => row.revisedLater).length;
    const revisionsTotal = rows.reduce((sum, row) => sum + (row.revisionsCount || 0), 0);
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          totalClients: total,
          qv360Clients: results.find((result) => result.source === "QV360")?.clientCount || 0,
          appPharusClients: results.find((result) => result.source === "App Pharus")?.clientCount || 0,
          planDelivered: deliveredCount,
          planApproved: approvedCount,
          averageDaysToApproval: average(rows.map((row) => row.daysToApproval)),
          revisedLater: revisedCount,
          revisionsTotal,
        },
        indicators: [
          indicator("Plano entregue", deliveredCount, total, "Cliente com data/status de entrega em tabela de plano patrimonial."),
          indicator("Plano aprovado", approvedCount, total, "Cliente com data/status de aprovação em tabela de plano patrimonial."),
          indicator("Dias até aprovação", approvalDaysCount, total, "Diferença entre data de contratação e primeira data de aprovação."),
          indicator("Plano revisado posteriormente", revisedCount, total, "Cliente com revisão explícita ou contagem de versões/revisões."),
          indicator("Quantidade de revisões", revisionsTotal, total, "Soma de revisões por cliente nas tabelas de revisão/plano."),
        ],
        sources: {
          databases: results.map((result) => ({
            source: result.source,
            configured: result.configured,
            schema: SOURCES.find((source) => source.label === result.source)?.schema,
            clientCount: result.clientCount,
            clientTable: result.clientTable,
            planTable: result.planTable,
            revisionTable: result.revisionTable,
          })),
          warnings: results.flatMap((result) => result.warnings),
        },
        clients: rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error.message || "Falha ao consolidar Plano Patrimonial" }, { status: 500 });
  }
}
