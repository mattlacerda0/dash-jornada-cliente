import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";

const CLIENT_SELECT = "id,codigo,name,status,engenheiro_patrimonial";
const DEMANDS_SELECT =
  "id,client_id,title,description,type,priority,status,requested_by_client,assigned_to,requested_by,resolved_at,resolved_by,resolution_notes,due_date,created_at,updated_at";
const DEMANDS_CORE_SELECT =
  "id,client_id,title,type,priority,status,requested_by_client,assigned_to,resolved_at,created_at,updated_at";

const USED_FIELDS = [
  { table: "clients", column: "id", role: "clientId" },
  { table: "clients", column: "codigo", role: "clientCode" },
  { table: "clients", column: "name", role: "clientName" },
  { table: "clients", column: "status", role: "rawStatus" },
  { table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { table: "demands", column: "id", role: "ticketId" },
  { table: "demands", column: "client_id", role: "ticketClientJoin" },
  { table: "demands", column: "title", role: "ticketTitle" },
  { table: "demands", column: "type", role: "ticketType" },
  { table: "demands", column: "priority", role: "ticketPriority" },
  { table: "demands", column: "status", role: "ticketStatus" },
  { table: "demands", column: "requested_by_client", role: "requestedByClient" },
  { table: "demands", column: "assigned_to", role: "assignedTo" },
  { table: "demands", column: "resolved_at", role: "resolvedAt" },
  { table: "demands", column: "resolved_by", role: "resolvedBy" },
  { table: "demands", column: "created_at", role: "createdAt" },
  { table: "demands", column: "updated_at", role: "updatedAt" },
];

const PRIORITY_LABELS = ["Baixa", "Média", "Alta", "Urgente", "Não informado"];

function configurationError() {
  return dataConfigurationError();
}

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function toBool(value) {
  const raw = blankToNull(value);
  if (raw == null) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (["true", "t", "1", "sim", "yes", "y"].includes(s)) return true;
  if (["false", "f", "0", "nao", "não", "no", "n"].includes(s)) return false;
  return null;
}

function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = br;
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function foldToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeClientStatus(rawStatus) {
  const token = foldToken(rawStatus);
  if (!token || token === "null" || token === "undefined" || token === "vazio") return "Não informado";
  if (["ativo", "active", "ativa"].includes(token)) return "Ativo";
  if (token.includes("cancel") || token.includes("churn") || token.includes("encerr") || ["inativo", "inativa", "inactive"].includes(token)) {
    return "Cancelado";
  }
  if (token.includes("congel") || token.includes("pausad") || ["freeze", "frozen"].includes(token)) return "Congelado";
  return "Não informado";
}

/** Status do chamado: rótulo de exibição + flags aberto/resolvido. */
function demandStatusInfo(rawStatus) {
  const token = foldToken(rawStatus);
  if (!token) return { label: "Não informado", isOpen: false, isResolved: false, known: false };
  const openTokens = ["aberta", "aberto", "pendente", "em andamento", "em_andamento", "andamento", "open", "pending"];
  const resolvedTokens = ["resolvido", "resolvida", "concluido", "concluida", "fechado", "fechada", "resolved", "closed", "done", "finalizado", "finalizada"];
  if (resolvedTokens.includes(token) || token.includes("resolv") || token.includes("conclu") || token.includes("fechad")) {
    return { label: "Resolvido", isOpen: false, isResolved: true, known: true };
  }
  if (token === "pendente" || token === "pending") return { label: "Pendente", isOpen: true, isResolved: false, known: true };
  if (token.includes("andamento")) return { label: "Em andamento", isOpen: true, isResolved: false, known: true };
  if (openTokens.includes(token) || token.includes("abert")) return { label: "Aberto", isOpen: true, isResolved: false, known: true };
  return { label: rawStatus ? String(rawStatus) : "Não informado", isOpen: false, isResolved: false, known: true };
}

function normalizePriority(rawPriority) {
  const token = foldToken(rawPriority);
  if (!token) return "Não informado";
  if (["baixa", "low", "baixo"].includes(token)) return "Baixa";
  if (["media", "medium", "medio", "normal"].includes(token)) return "Média";
  if (["alta", "high", "alto"].includes(token)) return "Alta";
  if (["urgente", "urgent", "critica", "critical", "critico"].includes(token)) return "Urgente";
  return "Não informado";
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function average(nums) {
  if (!nums.length) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dataSufficiency(total, resolved) {
  if (total >= 100 && resolved >= 20) return "good";
  if (total >= 30) return "moderate";
  if (total >= 10) return "low";
  return "critical";
}

async function fetchAll(table, select, order = "id.asc") {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, process.env.DATA_SUPABASE_URL);
    url.searchParams.set("select", select);
    url.searchParams.set("order", order);
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${table}: HTTP ${response.status} ${detail.slice(0, 160)}`);
    }
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

async function probeDemandsTable() {
  const url = new URL("/rest/v1/demands", process.env.DATA_SUPABASE_URL);
  url.searchParams.set("select", "id,client_id,status,created_at");
  url.searchParams.set("limit", "1");
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "public" },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let code = "";
    let message = detail.slice(0, 200);
    try {
      const parsed = JSON.parse(detail);
      code = parsed.code || "";
      message = parsed.message || message;
    } catch {
      /* keep */
    }
    console.error("[Support] probe failed", { table: "demands", httpStatus: response.status, code: code || null, message: message.slice(0, 160) });
    const err = new Error(`Probe demands: HTTP ${response.status}${code ? ` [${code}]` : ""}`);
    err.meta = { httpStatus: response.status, code, message };
    throw err;
  }
  return true;
}

async function fetchDemandsResilient() {
  const warnings = [];
  try {
    const rows = await fetchAll("demands", DEMANDS_SELECT);
    return { rows, warnings };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Support] full select failed, retrying core columns", msg.slice(0, 160));
    warnings.push("Consulta completa de demands falhou; tentando colunas essenciais.");
    const rows = await fetchAll("demands", DEMANDS_CORE_SELECT);
    return { rows, warnings };
  }
}

function buildMonthSeries(dates, now, monthsBack) {
  const nowKey = monthKey(now);
  const buckets = new Map();
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    if (key > nowKey) continue;
    buckets.set(key, 0);
  }
  for (const date of dates) {
    if (!date || date > now) continue;
    const key = monthKey(date);
    if (!buckets.has(key)) continue;
    buckets.set(key, buckets.get(key) + 1);
  }
  return [...buckets.entries()].map(([month, count]) => ({ month, count, label: month }));
}

function emptyPayload(extraWarnings = []) {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTickets: 0,
      openTickets: 0,
      resolvedTickets: 0,
      resolutionCoveragePercent: 0,
      medianResolutionHours: null,
      averageResolutionHours: null,
      complaints: null,
      compliments: null,
      escalatedTickets: null,
      clientsWithTickets: 0,
      clientsWithTicketsPercent: 0,
      totalClients: 0,
      dataSufficiency: "critical",
      note: "Resposta mínima: consolidação incompleta.",
    },
    distributions: { byStatus: [], byPriority: [], byMonth: [], byMonthRanges: { months6: [], months12: [] }, resolvedByMonth: [], byEngineer: [] },
    tickets: [],
    warnings: extraWarnings.map((message) => ({ code: "ERROR", message })),
    quality: { usedFields: USED_FIELDS, warnings: [] },
  };
}

function buildPayload(clients, demands) {
  const now = new Date();
  const clientMap = new Map(clients.map((c) => [String(c.id), c]));
  const clientIds = new Set(clients.map((c) => String(c.id)));

  const qualityWarnings = [];
  const structuredWarnings = [];
  let ticketsWithoutClient = 0;
  let orphanTickets = 0;
  let anyTypeClassified = false;

  const tickets = [];
  for (const demand of demands) {
    const dataWarnings = [];
    const clientId = blankToNull(demand.client_id);
    if (!clientId) {
      ticketsWithoutClient += 1;
      dataWarnings.push("Chamado sem client_id");
    } else if (!clientIds.has(String(clientId))) {
      orphanTickets += 1;
      dataWarnings.push("client_id sem cliente correspondente");
    }

    const client = clientId ? clientMap.get(String(clientId)) || null : null;
    const statusInfo = demandStatusInfo(demand.status);
    const priorityLabel = normalizePriority(demand.priority);
    if (!blankToNull(demand.status)) dataWarnings.push("Status vazio");
    if (!blankToNull(demand.priority)) dataWarnings.push("Prioridade vazia");

    const createdAt = parseDate(demand.created_at);
    const resolvedAt = parseDate(demand.resolved_at);
    if (createdAt && createdAt > now) dataWarnings.push("Data de abertura futura");
    if (resolvedAt && resolvedAt > now) dataWarnings.push("Data de resolução futura");
    if (resolvedAt && createdAt && resolvedAt < createdAt) dataWarnings.push("resolved_at anterior a created_at");

    const isResolved = statusInfo.isResolved || Boolean(resolvedAt);
    const isOpen = !isResolved && (statusInfo.isOpen || !resolvedAt);
    if (statusInfo.isResolved && !resolvedAt) dataWarnings.push("Chamado resolvido sem resolved_at");
    if (statusInfo.isOpen && resolvedAt) dataWarnings.push("Chamado aberto com resolved_at");

    let resolutionHours = null;
    if (createdAt && resolvedAt && resolvedAt >= createdAt && resolvedAt <= now) {
      resolutionHours = round1((resolvedAt.getTime() - createdAt.getTime()) / 3600000);
    }

    // type existe, porém não há categoria confirmada de reclamação/elogio.
    const typeRaw = blankToNull(demand.type);
    if (typeRaw) anyTypeClassified = true;
    else dataWarnings.push("Tipo não classificado");

    tickets.push({
      ticketId: String(demand.id),
      title: blankToNull(demand.title) || "Não informado",
      description: blankToNull(demand.description) || "",
      clientId: clientId ? String(clientId) : null,
      clientCode: client ? blankToNull(client.codigo) : null,
      clientName: client ? blankToNull(client.name) || "Não informado" : "Não informado",
      clientStatus: client ? normalizeClientStatus(client.status) : "Não informado",
      engineer: client ? blankToNull(client.engenheiro_patrimonial) || "Não informado" : "Não informado",
      type: typeRaw,
      status: statusInfo.label,
      statusRaw: blankToNull(demand.status),
      isOpen,
      isResolved,
      priority: priorityLabel,
      priorityRaw: blankToNull(demand.priority),
      requestedByClient: toBool(demand.requested_by_client),
      assignedTo: blankToNull(demand.assigned_to),
      createdAt: createdAt ? createdAt.toISOString() : null,
      updatedAt: parseDate(demand.updated_at)?.toISOString() || null,
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
      resolvedBy: blankToNull(demand.resolved_by),
      resolutionNotes: blankToNull(demand.resolution_notes) || "",
      resolutionHours,
      dueDate: parseDate(demand.due_date)?.toISOString() || null,
      // Sem fonte confirmada: mantemos null para não gerar falsa confiança.
      classification: null,
      escalated: null,
      dataWarnings,
    });
  }

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t) => t.isOpen).length;
  const resolvedTickets = tickets.filter((t) => t.isResolved).length;
  const resolutionValues = tickets.map((t) => t.resolutionHours).filter((h) => h != null && Number.isFinite(h) && h >= 0);
  const sortedRes = [...resolutionValues].sort((a, b) => a - b);
  const medianResolutionHours = sortedRes.length ? round1(percentile(sortedRes, 50)) : null;
  const averageResolutionHours = average(sortedRes);
  const distinctClients = new Set(tickets.map((t) => t.clientId).filter(Boolean));
  const clientsWithTickets = distinctClients.size;

  // Distribuições
  const statusOrder = ["Aberto", "Em andamento", "Pendente", "Resolvido", "Não informado"];
  const statusCounts = new Map();
  for (const t of tickets) statusCounts.set(t.status, (statusCounts.get(t.status) || 0) + 1);
  const byStatus = [...statusCounts.keys()]
    .sort((a, b) => (statusOrder.indexOf(a) + 1 || 99) - (statusOrder.indexOf(b) + 1 || 99))
    .map((label) => ({ label, count: statusCounts.get(label), percent: pct(statusCounts.get(label), totalTickets) }));

  const byPriority = PRIORITY_LABELS.map((label) => {
    const count = tickets.filter((t) => t.priority === label).length;
    return { label, count, percent: pct(count, totalTickets) };
  }).filter((item) => item.count > 0);

  const createdDates = tickets.map((t) => parseDate(t.createdAt)).filter(Boolean);
  const resolvedDates = tickets.filter((t) => t.isResolved).map((t) => parseDate(t.resolvedAt)).filter(Boolean);

  const byEngineerMap = new Map();
  for (const t of tickets) {
    const eng = t.engineer || "Não informado";
    byEngineerMap.set(eng, (byEngineerMap.get(eng) || 0) + 1);
  }
  const byEngineer = [...byEngineerMap.entries()]
    .map(([label, count]) => ({ label, count, percent: pct(count, totalTickets) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));

  // Warnings estruturados
  if (totalTickets < 30) {
    structuredWarnings.push({ code: "INSUFFICIENT_SAMPLE", message: `Base possui apenas ${totalTickets} chamado(s).` });
  }
  if (resolvedTickets === 0) {
    structuredWarnings.push({ code: "NO_RESOLVED_TICKETS", message: "Não existem chamados resolvidos para calcular tempo de resolução." });
  }
  structuredWarnings.push({ code: "COMPLAINT_CLASSIFICATION_UNAVAILABLE", message: "Não há categoria confirmada para reclamações." });
  structuredWarnings.push({ code: "COMPLIMENT_CLASSIFICATION_UNAVAILABLE", message: "Não há categoria confirmada para elogios." });
  structuredWarnings.push({ code: "ESCALATION_SOURCE_UNAVAILABLE", message: "Não há fonte confirmada de escalonamento." });

  if (ticketsWithoutClient > 0) qualityWarnings.push(`${ticketsWithoutClient} chamado(s) sem client_id.`);
  if (orphanTickets > 0) qualityWarnings.push(`${orphanTickets} chamado(s) com client_id sem cliente correspondente.`);
  if (!anyTypeClassified) qualityWarnings.push("Nenhum tipo de chamado classificado como reclamação/elogio.");
  qualityWarnings.push("Não há histórico de escalonamento confirmado em demands nem em activity_logs.");
  if (totalTickets < 30) qualityWarnings.push("Baixa amostra de chamados; indicadores provisórios.");

  const sufficiency = dataSufficiency(totalTickets, resolvedTickets);

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalTickets,
      openTickets,
      resolvedTickets,
      resolutionCoveragePercent: pct(resolvedTickets, totalTickets),
      medianResolutionHours,
      averageResolutionHours,
      complaints: null,
      compliments: null,
      escalatedTickets: null,
      clientsWithTickets,
      clientsWithTicketsPercent: pct(clientsWithTickets, clients.length),
      totalClients: clients.length,
      dataSufficiency: sufficiency,
    },
    distributions: {
      byStatus,
      byPriority,
      byMonth: buildMonthSeries(createdDates, now, 12),
      byMonthRanges: { months6: buildMonthSeries(createdDates, now, 6), months12: buildMonthSeries(createdDates, now, 12) },
      resolvedByMonth: resolvedDates.length ? buildMonthSeries(resolvedDates, now, 12) : [],
      byEngineer,
    },
    tickets,
    warnings: structuredWarnings,
    quality: {
      usedFields: USED_FIELDS,
      warnings: qualityWarnings,
      dataSufficiency: sufficiency,
      classificationSources: {
        complaints: "unavailable",
        compliments: "unavailable",
        escalation: "unavailable",
        note: "type/priority não representam reclamação, elogio ou escalonamento sem fonte confirmada.",
      },
    },
  };
}

/** Fonte única (config + fetch + regras) reutilizada pelo handler e por /api/assistant-data. */
export async function computeSupportPayload() {
  const configError = configurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }
  await probeDemandsTable();
  const [{ rows: demands, warnings: fetchWarnings }, clients] = await Promise.all([
    fetchDemandsResilient(),
    fetchAll("clients", CLIENT_SELECT),
  ]);
  const payload = buildPayload(clients, demands);
  if (fetchWarnings.length) {
    payload.quality.warnings = [...(payload.quality.warnings || []), ...fetchWarnings];
  }
  return payload;
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;
  const configError = configurationError();
  console.error("[Support Config]", {
    "AUTH URL configurada": Boolean(String(process.env.AUTH_SUPABASE_URL || "").trim()),
    "DATA URL configurada": Boolean(String(process.env.DATA_SUPABASE_URL || "").trim()),
    "AUTH key configurada": Boolean(String(process.env.AUTH_SUPABASE_ANON_KEY || "").trim()),
    "DATA service role configurada": Boolean(String(process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || "").trim()),
  });
  if (configError) {
    return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const payload = await computeSupportPayload();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consolidar atendimento";
    console.error("[Support] fatal", message.slice(0, 200));
    return Response.json(
      { error: message, ...emptyPayload([message]) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
