import { requireCorporateAuth } from "./_shared/auth.mjs";
import { getDataEnv, dataConfigurationError } from "./_shared/env.mjs";

const SOURCES = [
  {
    id: "qv360",
    label: "QV360",
    schema: process.env.QV360_SUPABASE_SCHEMA || "public",
    url: process.env.QV360_SUPABASE_URL || process.env.SUPABASE_QV360_URL || "https://sfxbzfaxbbdjzuhzzrjc.supabase.co",
    key: process.env.QV360_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_QV360_SERVICE_ROLE_KEY,
  },
  {
    id: "app_pharus",
    label: "App Pharus",
    schema: process.env.APP_PHARUS_SUPABASE_SCHEMA || "core",
    url: process.env.APP_PHARUS_SUPABASE_URL || process.env.PHARUS_SUPABASE_URL || "https://qvtqufdivpbmubooawdm.supabase.co",
    key: process.env.APP_PHARUS_SUPABASE_SERVICE_ROLE_KEY || process.env.PHARUS_SUPABASE_SERVICE_ROLE_KEY,
  },
];

const APP_TABLES = [
  ["form_submissions", "response"],
  ["scheduled_meeting_evaluation", "response"],
  ["scheduled_meetings", "interaction"],
  ["meeting_outputs", "interaction"],
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

async function fetchAllFrom(source, table, warnings, select = "*") {
  if (!source.url || !source.key) {
    warnings.push(`${source.label}.${table}: credenciais não configuradas`);
    return [];
  }
  const rows = [];
  const pageSize = 1000;
  let offset = 0;
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
    if (!response.ok) {
      warnings.push(`${source.label}.${table}: HTTP ${response.status}`);
      return [];
    }
    const batch = await response.json().catch(() => []);
    rows.push(...(Array.isArray(batch) ? batch : []));
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

async function fetchBase(table, warnings, select = "*") {
  const { url: baseUrl, serviceRoleKey } = getDataEnv();
  if (!baseUrl || !serviceRoleKey) {
    warnings.push(`BASE QV.${table}: credenciais não configuradas`);
    return [];
  }
  return fetchAllFrom({ label: "BASE QV", schema: "public", url: baseUrl, key: serviceRoleKey }, table, warnings, select);
}

function upsertClient(map, source, userId, patch = {}) {
  const id = blankToNull(userId);
  if (!id) return null;
  const key = `${source.id}:${id}`;
  if (!map.has(key)) {
    map.set(key, {
      source: source.label,
      sourceId: source.id,
      clientId: String(id),
      clientName: patch.clientName || "Não informado",
      email: patch.email || "Não informado",
      responses: 0,
      interactions: 0,
      surveyAnswered: false,
      lastInteractionAt: null,
      sourceBreakdown: { responses: 0, interactions: 0 },
    });
  }
  const item = map.get(key);
  Object.assign(item, Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== "")));
  return item;
}

function addEvent(map, source, row, kind, table) {
  const userId = firstValue(row, ["user_id", "client_id", "cliente_id", "customer_id", "owner_id"]);
  const client = upsertClient(map, source, userId);
  if (!client) return false;
  const when = parseDate(firstValue(row, ["submitted_at", "created_at", "start_time", "meeting_date", "updated_at"]));
  if (kind === "response") {
    client.responses += 1;
    client.surveyAnswered = true;
    client.sourceBreakdown.responses += 1;
  }
  client.interactions += 1;
  client.sourceBreakdown.interactions += 1;
  if (when && (!client.lastInteractionAt || when > parseDate(client.lastInteractionAt))) client.lastInteractionAt = when.toISOString();
  client.lastSourceTable = table;
  return true;
}

function sourceClientId(source, row) {
  if (source.id === "app_pharus") return firstValue(row, ["user_id", "id", "client_id"]);
  return firstValue(row, ["user_id", "id", "client_id", "cliente_id"]);
}

async function loadSource(source, warnings) {
  const clients = new Map();
  const people = await fetchAllFrom(source, source.id === "app_pharus" ? "personal_info" : "clients", warnings);
  for (const row of people) {
    const id = sourceClientId(source, row);
    upsertClient(clients, source, id, {
      clientName: firstValue(row, ["name", "nome", "full_name", "first_name"]) || "Não informado",
      email: firstValue(row, ["email", "user_email"]) || "Não informado",
    });
  }
  for (const [table, kind] of APP_TABLES) {
    const rows = await fetchAllFrom(source, table, warnings);
    let linked = 0;
    for (const row of rows) if (addEvent(clients, source, row, kind, table)) linked += 1;
    if (rows.length && !linked) warnings.push(`${source.label}.${table}: registros sem user_id/client_id utilizável`);
  }
  if (source.id === "qv360") {
    const chatRows = await fetchAllFrom(source, "n8n_chat_histories", warnings);
    if (chatRows.length) warnings.push("QV360.n8n_chat_histories existe, mas não entra no cálculo por não ter client_id confiável.");
  }
  return [...clients.values()];
}

function responseDelayDays(row, endFields) {
  const start = parseDate(firstValue(row, ["created_at"]));
  const end = parseDate(firstValue(row, endFields));
  const days = daysBetween(start, end);
  return days != null && days >= 0 ? days : null;
}

async function loadBaseFallback(warnings) {
  const [cycle, freeze, tasks, formResponses, formAnswers] = await Promise.all([
    fetchBase("cycle_change_requests", warnings),
    fetchBase("freeze_change_requests", warnings),
    fetchBase("tasks", warnings),
    fetchBase("form_responses", warnings),
    fetchBase("form_answers", warnings),
  ]);
  const responseTimes = [
    ...cycle.map((r) => responseDelayDays(r, ["reviewed_at"])),
    ...freeze.map((r) => responseDelayDays(r, ["reviewed_at"])),
    ...tasks.map((r) => responseDelayDays(r, ["completed_at"])),
  ].filter((v) => v != null);
  const answeredResponseIds = new Set(formAnswers.map((r) => firstValue(r, ["response_id"])).filter(Boolean).map(String));
  return {
    responseTimes,
    fallbackResponses: Math.max(formResponses.length, answeredResponseIds.size),
    tables: {
      cycleChangeRequests: cycle.length,
      freezeChangeRequests: freeze.length,
      tasks: tasks.length,
      formResponses: formResponses.length,
      formAnswers: formAnswers.length,
    },
  };
}

function buildIndicators(summary) {
  const total = summary.totalClients || 0;
  return [
    {
      indicator: "Tempo médio de resposta às solicitações",
      viability: "Parcial",
      value: summary.responseTimeSample,
      total: summary.baseFallbackRows,
      coverage: pct(summary.responseTimeSample, summary.baseFallbackRows),
      metric: "Fallback BASE QV: média de reviewed_at - created_at ou completed_at - created_at",
    },
    {
      indicator: "Quantidade de respostas",
      viability: "Sim",
      value: summary.totalResponses,
      total,
      coverage: pct(summary.clientsWithResponses, total),
      metric: "App Pharus + QV360: form_submissions e scheduled_meeting_evaluation por user_id; fallback BASE QV form_responses/form_answers",
    },
    {
      indicator: "Quantidade de interações",
      viability: "Sim",
      value: summary.totalInteractions,
      total,
      coverage: pct(summary.clientsWithInteractions, total),
      metric: "App Pharus + QV360: submissões + avaliações + reuniões + outputs de reunião",
    },
    {
      indicator: "Quantidade de mensagens respondidas",
      viability: "Sem dado",
      value: 0,
      total: 0,
      coverage: 0,
      metric: "Não há tabela confiável de mensagens cliente ↔ EP com remetente, destinatário, status e data",
    },
    {
      indicator: "Quantidade de mensagens ignoradas",
      viability: "Sem dado",
      value: 0,
      total: 0,
      coverage: 0,
      metric: "Exigiria client_id, sent_at, responded_at, sender_type e message_status",
    },
    {
      indicator: "Tempo médio entre interação do EP e resposta do cliente",
      viability: "Sem dado",
      value: 0,
      total: 0,
      coverage: 0,
      metric: "Sem pareamento confiável; proxy fraco possível com BASE QV activity_logs + próxima resposta",
    },
    {
      indicator: "Cliente respondeu pesquisas? (Sim/Não)",
      viability: "Sim",
      value: summary.clientsWithSurvey,
      total,
      coverage: pct(summary.clientsWithSurvey, total),
      metric: "App Pharus + QV360: existência de form_submissions ou scheduled_meeting_evaluation por user_id; fallback BASE QV parcial",
    },
  ];
}

export async function computeEngagementPayload() {
  const warnings = [];
  const [sourceRows, baseFallback] = await Promise.all([
    Promise.all(SOURCES.map((source) => loadSource(source, warnings))),
    loadBaseFallback(warnings),
  ]);
  const clients = sourceRows.flat();
  const distinctClientIds = new Set(clients.map((c) => c.clientId).filter(Boolean).map(String));
  const distinctQv360Ids = new Set(clients.filter((c) => c.sourceId === "qv360").map((c) => c.clientId).filter(Boolean).map(String));
  const distinctAppPharusIds = new Set(clients.filter((c) => c.sourceId === "app_pharus").map((c) => c.clientId).filter(Boolean).map(String));
  const responseClientIds = new Set(clients.filter((c) => c.responses > 0).map((c) => c.clientId).filter(Boolean).map(String));
  const interactionClientIds = new Set(clients.filter((c) => c.interactions > 0).map((c) => c.clientId).filter(Boolean).map(String));
  const surveyClientIds = new Set(clients.filter((c) => c.surveyAnswered).map((c) => c.clientId).filter(Boolean).map(String));
  const totalResponsesFromSources = clients.reduce((sum, c) => sum + c.responses, 0);
  const totalResponses = totalResponsesFromSources || baseFallback.fallbackResponses;
  const totalInteractions = clients.reduce((sum, c) => sum + c.interactions, 0);
  const responseTimeSample = baseFallback.responseTimes.length;
  const baseFallbackRows = baseFallback.tables.cycleChangeRequests + baseFallback.tables.freezeChangeRequests + baseFallback.tables.tasks;
  const summary = {
    totalClients: distinctClientIds.size,
    qv360Clients: distinctQv360Ids.size,
    appPharusClients: distinctAppPharusIds.size,
    totalResponses,
    totalInteractions,
    clientsWithResponses: responseClientIds.size,
    clientsWithInteractions: interactionClientIds.size,
    clientsWithSurvey: surveyClientIds.size,
    averageRequestResponseDays: average(baseFallback.responseTimes),
    responseTimeSample,
    baseFallbackRows,
    messagesAnswered: null,
    messagesIgnored: null,
    averageEpToClientResponseDays: null,
    baseFallback: { tables: baseFallback.tables },
  };
  return {
    generatedAt: new Date().toISOString(),
    summary,
    distributions: {
      bySource: [
        { label: "QV360", count: summary.qv360Clients, percent: pct(summary.qv360Clients, summary.totalClients) },
        { label: "App Pharus", count: summary.appPharusClients, percent: pct(summary.appPharusClients, summary.totalClients) },
      ],
      bySurvey: [
        { label: "Sim", count: summary.clientsWithSurvey, percent: pct(summary.clientsWithSurvey, summary.totalClients) },
        { label: "Não", count: Math.max(0, summary.totalClients - summary.clientsWithSurvey), percent: pct(Math.max(0, summary.totalClients - summary.clientsWithSurvey), summary.totalClients) },
      ],
      byResponseVolume: [
        { label: "Sem resposta", count: clients.filter((c) => c.responses === 0).length, percent: pct(clients.filter((c) => c.responses === 0).length, summary.totalClients) },
        { label: "1 resposta", count: clients.filter((c) => c.responses === 1).length, percent: pct(clients.filter((c) => c.responses === 1).length, summary.totalClients) },
        { label: "2-3 respostas", count: clients.filter((c) => c.responses >= 2 && c.responses <= 3).length, percent: pct(clients.filter((c) => c.responses >= 2 && c.responses <= 3).length, summary.totalClients) },
        { label: "4+ respostas", count: clients.filter((c) => c.responses >= 4).length, percent: pct(clients.filter((c) => c.responses >= 4).length, summary.totalClients) },
      ],
    },
    clients,
    indicators: buildIndicators(summary),
    quality: { warnings },
  };
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;
  const configError = dataConfigurationError();
  if (configError) return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = await computeEngagementPayload();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consolidar engajamento";
    return Response.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
