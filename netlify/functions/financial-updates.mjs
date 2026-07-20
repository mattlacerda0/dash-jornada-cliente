import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";

const CLIENT_SELECT =
  "id,codigo,name,status,engenheiro_patrimonial";
const FINANCIAL_SELECT =
  "id,client_id,reserva_liquidez,ultima_renda_mensal,ultimo_aporte,possui_imovel,possui_carro,possui_consorcio,created_at,updated_at";
const CANCEL_SELECT =
  "id,client_id,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at";

const USED_FIELDS = [
  { table: "clients", column: "id", role: "clientId" },
  { table: "clients", column: "codigo", role: "clientCode" },
  { table: "clients", column: "name", role: "clientName" },
  { table: "clients", column: "status", role: "rawStatus" },
  { table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { table: "client_financial_data", column: "client_id", role: "financialJoin" },
  { table: "client_financial_data", column: "created_at", role: "financialCreated" },
  { table: "client_financial_data", column: "updated_at", role: "financialUpdated" },
  { table: "client_financial_data", column: "reserva_liquidez", role: "liquidityReserve" },
  { table: "client_financial_data", column: "ultima_renda_mensal", role: "monthlyIncome" },
  { table: "client_financial_data", column: "ultimo_aporte", role: "lastContribution" },
  { table: "client_financial_data", column: "possui_imovel", role: "hasProperty" },
  { table: "client_financial_data", column: "possui_carro", role: "hasCar" },
  { table: "client_financial_data", column: "possui_consorcio", role: "hasConsortium" },
  { table: "cancellations", column: "client_id", role: "cancellationJoin" },
  { table: "cancellations", column: "distrato_assinado_at", role: "cancellationDatePriority1" },
  { table: "cancellations", column: "data_pedido", role: "cancellationDatePriority2" },
  { table: "cancellations", column: "intencao_registrada_at", role: "cancellationDatePriority3" },
  { table: "cancellations", column: "archived_at", role: "cancellationSoftDelete" },
];

const RECENCY_BANDS = [
  "Atualizado nos últimos 30 dias",
  "De 31 a 60 dias",
  "De 61 a 90 dias",
  "De 91 a 180 dias",
  "Mais de 180 dias",
  "Sem data de atualização",
  "Sem dados financeiros",
];

const FIELD_COVERAGE_DEFS = [
  { key: "liquidityReserve", label: "Reserva de liquidez", kind: "number" },
  { key: "monthlyIncome", label: "Última renda mensal", kind: "number" },
  { key: "lastContribution", label: "Último aporte", kind: "number" },
  { key: "hasProperty", label: "Possui imóvel", kind: "bool" },
  { key: "hasCar", label: "Possui carro", kind: "bool" },
  { key: "hasConsortium", label: "Possui consórcio", kind: "bool" },
];

const TOTAL_FINANCIAL_FIELDS = FIELD_COVERAGE_DEFS.length;

function configurationError() {
  return dataConfigurationError();
}

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function toNumber(value) {
  const raw = blankToNull(value);
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

function emptyPayload(extraWarnings = []) {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalClients: 0,
      clientsWithFinancialData: 0,
      financialDataCoveragePercent: 0,
      updatedLast30Days: 0,
      updatedLast30DaysPercent: 0,
      updatedLast30DaysPercentOfFinancial: 0,
      updatedLast30DaysPercentOfPortfolio: 0,
      medianDaysSinceUpdate: null,
      averageDaysSinceUpdate: null,
      outdatedOver90Days: 0,
      outdatedOver90DaysPercent: 0,
      hasUpdateHistory: false,
      totalFinancialUpdates: null,
      note: "Resposta mínima: consolidação incompleta.",
    },
    distributions: {
      updateRecency: [],
      updatesByMonth: [],
      updatesByMonthRanges: { months6: [], months12: [], months24: [] },
      fieldCoverage: [],
      updatesByEngineer: [],
    },
    clients: [],
    warnings: extraWarnings,
    quality: { usedFields: USED_FIELDS, warnings: extraWarnings },
  };
}

async function probeFinancialTable() {
  const url = new URL("/rest/v1/client_financial_data", process.env.DATA_SUPABASE_URL);
  url.searchParams.set("select", "id,client_id,created_at,updated_at");
  url.searchParams.set("limit", "1");
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "public",
    },
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
    console.error("[Financial Updates] probe failed", {
      table: "client_financial_data",
      httpStatus: response.status,
      code: code || null,
      message: message.slice(0, 160),
    });
    const err = new Error(`Probe client_financial_data: HTTP ${response.status}${code ? ` [${code}]` : ""}`);
    err.meta = { httpStatus: response.status, code, message };
    throw err;
  }
  return true;
}

async function fetchFinancialRowsResilient() {
  const warnings = [];
  try {
    const rows = await fetchAll("client_financial_data", FINANCIAL_SELECT);
    return { rows, warnings };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Financial Updates] full select failed, retrying core columns", msg.slice(0, 160));
    warnings.push("Consulta completa de client_financial_data falhou; tentando colunas essenciais.");
    const coreSelect = "id,client_id,created_at,updated_at,reserva_liquidez,ultima_renda_mensal,ultimo_aporte,possui_imovel,possui_carro,possui_consorcio";
    try {
      const rows = await fetchAll("client_financial_data", coreSelect);
      return { rows, warnings };
    } catch (inner) {
      const innerMsg = inner instanceof Error ? inner.message : String(inner);
      warnings.push(`Falha ao carregar client_financial_data: ${innerMsg.slice(0, 120)}`);
      throw inner;
    }
  }
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(ms / 86400000);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(now = new Date()) {
  return monthKey(now);
}

function foldStatusToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeClientStatus(rawStatus) {
  const token = foldStatusToken(rawStatus);
  if (!token || token === "null" || token === "undefined" || token === "vazio") {
    return "Não informado";
  }
  if (["ativo", "active", "ativa"].includes(token)) return "Ativo";
  if (
    [
      "churn",
      "cancelado",
      "cancelada",
      "canceled",
      "cancelled",
      "encerrado",
      "encerrada",
      "inativo",
      "inativa",
      "inactive",
    ].includes(token) ||
    token.includes("cancel") ||
    token.includes("churn") ||
    token.includes("encerr")
  ) {
    return "Cancelado";
  }
  if (
    ["congelado", "congelada", "freeze", "frozen", "pausado", "pausada"].includes(token) ||
    token.includes("congel") ||
    token.includes("pausad")
  ) {
    return "Congelado";
  }
  return "Não informado";
}

function resolveAnalyticalStatus(rawStatus, cancellationDate) {
  if (cancellationDate) return "Cancelado";
  return normalizeClientStatus(rawStatus);
}

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
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

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function isFieldFilled(value, kind) {
  if (kind === "bool") return value === true || value === false;
  return value != null;
}

function resolveFinancialUpdateDate(row) {
  const updated = parseDate(row.updated_at);
  const created = parseDate(row.created_at);
  if (updated) return { date: updated, source: "updated_at" };
  if (created) return { date: created, source: "created_at" };
  return { date: null, source: "unavailable" };
}

function recencyBand(days, hasFinancial, hasDate) {
  if (!hasFinancial) return "Sem dados financeiros";
  if (!hasDate || days == null) return "Sem data de atualização";
  if (days <= 30) return "Atualizado nos últimos 30 dias";
  if (days <= 60) return "De 31 a 60 dias";
  if (days <= 90) return "De 61 a 90 dias";
  if (days <= 180) return "De 91 a 180 dias";
  return "Mais de 180 dias";
}

function buildCancellationDateMap(cancellations) {
  const STAGE_RANK = { "Distrato assinado": 3, "Pedido de cancelamento": 2, "Intenção registrada": 1 };
  const map = new Map();
  for (const row of cancellations || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId || parseDate(row.archived_at)) continue;
    const distrato = parseDate(row.distrato_assinado_at);
    const pedido = parseDate(row.data_pedido);
    const intencao = parseDate(row.intencao_registrada_at);
    const date = distrato || pedido || intencao;
    if (!date) continue;
    const stage = distrato
      ? "Distrato assinado"
      : pedido
        ? "Pedido de cancelamento"
        : "Intenção registrada";
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || date;
    const rank = STAGE_RANK[stage] || 0;
    const current = map.get(clientId);
    if (
      !current ||
      rank > current.rank ||
      (rank === current.rank &&
        (date > current.date || (date.getTime() === current.date.getTime() && updated > current.updated)))
    ) {
      map.set(clientId, { date, stage, rank, updated });
    }
  }
  return map;
}

/**
 * Um registro analítico por client_id.
 * Preferência: updated_at mais recente → created_at → id.
 */
function buildFinancialMap(financialRows) {
  const byClient = new Map();
  const counts = new Map();
  let rowsWithoutClientId = 0;
  const orphanClientIds = [];

  for (const row of financialRows || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) {
      rowsWithoutClientId += 1;
      continue;
    }
    counts.set(clientId, (counts.get(clientId) || 0) + 1);

    const updated = parseDate(row.updated_at);
    const created = parseDate(row.created_at);
    const recency = (updated || created || new Date(0)).getTime();
    const current = byClient.get(clientId);
    if (
      !current ||
      recency > current._recency ||
      (recency === current._recency && String(row.id || "") > String(current.id || ""))
    ) {
      byClient.set(clientId, { ...row, _recency: recency });
    }
  }

  const multiples = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ clientId: id, count: n }));
  return { byClient, counts, multiples, rowsWithoutClientId, orphanClientIds };
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

function buildMonthSeries(rows, now, monthsBack) {
  const nowKey = currentMonthKey(now);
  const buckets = new Map();
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    if (key > nowKey) continue;
    buckets.set(key, new Set());
  }
  for (const row of rows) {
    if (!row.hasFinancialData || !row.financialUpdateDate) continue;
    const d = parseDate(row.financialUpdateDate);
    if (!d) continue;
    if (d > now) continue;
    const key = monthKey(d);
    if (!buckets.has(key)) continue;
    buckets.get(key).add(row.clientId);
  }
  return [...buckets.entries()].map(([month, set]) => ({
    month,
    count: set.size,
    label: month,
  }));
}

function buildPayload(clients, financialRows, cancellations) {
  const now = new Date();
  const today = startOfDay(now);
  const cancelMap = buildCancellationDateMap(cancellations);
  const { byClient, counts, multiples, rowsWithoutClientId } = buildFinancialMap(financialRows);
  const clientIds = new Set(clients.map((c) => String(c.id)));

  const qualityWarnings = [];
  if (rowsWithoutClientId > 0) {
    qualityWarnings.push(`${rowsWithoutClientId} registro(s) financeiro(s) sem client_id.`);
  }
  if (multiples.length > 0) {
    qualityWarnings.push(
      `${multiples.length} cliente(s) com mais de um registro em client_financial_data; usado o mais recente por updated_at/created_at.`,
    );
  }
  qualityWarnings.push(
    "Histórico de atualizações não disponível: a base mantém apenas o estado financeiro mais recente por cliente. activity_logs cobre apenas parte das edições e não é usado nos KPIs.",
  );

  let orphanFinancial = 0;
  for (const clientId of byClient.keys()) {
    if (!clientIds.has(String(clientId))) {
      orphanFinancial += 1;
    }
  }
  if (orphanFinancial > 0) {
    qualityWarnings.push(`${orphanFinancial} registro(s) financeiro(s) sem cliente correspondente.`);
  }

  const rows = [];
  for (const client of clients) {
    const clientId = String(client.id);
    const cancelInfo = cancelMap.get(clientId) || null;
    const analyticalStatus = resolveAnalyticalStatus(client.status, cancelInfo?.date || null);
    const financial = byClient.get(clientId) || null;
    const dataWarnings = [];

    let financialCreatedAt = null;
    let financialUpdatedAt = null;
    let financialUpdateDate = null;
    let financialUpdateSource = "unavailable";
    let daysSinceFinancialUpdate = null;
    let updatedLast30Days = false;
    let outdatedOver90Days = false;
    let liquidityReserve = null;
    let monthlyIncome = null;
    let lastContribution = null;
    let hasProperty = null;
    let hasCar = null;
    let hasConsortium = null;
    let filledFinancialFields = 0;
    const hasFinancialData = Boolean(financial);

    if (financial) {
      financialCreatedAt = parseDate(financial.created_at);
      financialUpdatedAt = parseDate(financial.updated_at);
      const resolved = resolveFinancialUpdateDate(financial);
      financialUpdateDate = resolved.date;
      financialUpdateSource = resolved.source;

      if (financialUpdatedAt && financialCreatedAt && financialUpdatedAt < financialCreatedAt) {
        dataWarnings.push("updated_at anterior a created_at");
      }
      if (financialUpdatedAt && financialUpdatedAt > now) {
        dataWarnings.push("updated_at futuro");
      }
      if (financialCreatedAt && financialCreatedAt > now) {
        dataWarnings.push("created_at futuro");
      }

      liquidityReserve = toNumber(financial.reserva_liquidez);
      monthlyIncome = toNumber(financial.ultima_renda_mensal);
      lastContribution = toNumber(financial.ultimo_aporte);
      hasProperty = toBool(financial.possui_imovel);
      hasCar = toBool(financial.possui_carro);
      hasConsortium = toBool(financial.possui_consorcio);

      const values = {
        liquidityReserve,
        monthlyIncome,
        lastContribution,
        hasProperty,
        hasCar,
        hasConsortium,
      };
      filledFinancialFields = FIELD_COVERAGE_DEFS.filter((f) => isFieldFilled(values[f.key], f.kind)).length;
      if (filledFinancialFields === 0) {
        dataWarnings.push("Registro financeiro sem campos preenchidos");
      }

      if ((counts.get(clientId) || 0) > 1) {
        dataWarnings.push(`Mais de um registro financeiro (${counts.get(clientId)}); usado o mais recente`);
      }

      if (financialUpdateDate && financialUpdateDate <= now) {
        daysSinceFinancialUpdate = daysBetween(financialUpdateDate, today);
        if (daysSinceFinancialUpdate != null && daysSinceFinancialUpdate >= 0) {
          updatedLast30Days = daysSinceFinancialUpdate <= 30;
          outdatedOver90Days = daysSinceFinancialUpdate > 90;
          if (outdatedOver90Days) dataWarnings.push("Mais de 90 dias sem atualização financeira");
        }
      } else if (financialUpdateDate && financialUpdateDate > now) {
        dataWarnings.push("Data de atualização financeira futura; excluída dos indicadores de recência");
        daysSinceFinancialUpdate = null;
      }
    } else if (analyticalStatus === "Ativo") {
      dataWarnings.push("Cliente ativo sem dados financeiros");
    }

    rows.push({
      clientId,
      clientCode: blankToNull(client.codigo),
      clientName: blankToNull(client.name) || "Não informado",
      analyticalStatus,
      engineer: blankToNull(client.engenheiro_patrimonial) || "Não informado",
      hasFinancialData,
      financialRecordId: financial ? blankToNull(financial.id) : null,
      financialCreatedAt: financialCreatedAt ? financialCreatedAt.toISOString() : null,
      financialUpdatedAt: financialUpdatedAt ? financialUpdatedAt.toISOString() : null,
      financialUpdateDate: financialUpdateDate ? financialUpdateDate.toISOString() : null,
      financialUpdateSource,
      daysSinceFinancialUpdate,
      updatedLast30Days,
      outdatedOver90Days,
      liquidityReserve,
      monthlyIncome,
      lastContribution,
      hasProperty,
      hasCar,
      hasConsortium,
      filledFinancialFields,
      totalFinancialFields: TOTAL_FINANCIAL_FIELDS,
      recencyBand: recencyBand(daysSinceFinancialUpdate, hasFinancialData, Boolean(financialUpdateDate)),
      dataWarnings,
    });
  }

  const totalClients = rows.length;
  const withFinancial = rows.filter((r) => r.hasFinancialData);
  const clientsWithFinancialData = withFinancial.length;
  const updatedLast30Days = withFinancial.filter((r) => r.updatedLast30Days).length;
  const outdatedOver90Days = withFinancial.filter((r) => r.outdatedOver90Days).length;
  const daysValues = withFinancial
    .map((r) => r.daysSinceFinancialUpdate)
    .filter((d) => d != null && Number.isFinite(d) && d >= 0);
  const sortedDays = [...daysValues].sort((a, b) => a - b);
  const medianDaysSinceUpdate = sortedDays.length ? round1(percentile(sortedDays, 50)) : null;
  const averageDaysSinceUpdate = average(sortedDays);

  const updateRecency = RECENCY_BANDS.map((label) => {
    const count = rows.filter((r) => r.recencyBand === label).length;
    return { label, count, percent: pct(count, totalClients) };
  });

  const fieldCoverage = FIELD_COVERAGE_DEFS.map((field) => {
    const count = rows.filter((r) => isFieldFilled(r[field.key], field.kind)).length;
    return {
      label: field.label,
      key: field.key,
      count,
      percent: pct(count, totalClients),
    };
  });

  const byEngineer = new Map();
  for (const row of rows) {
    const eng = row.engineer || "Não informado";
    if (!byEngineer.has(eng)) {
      byEngineer.set(eng, { engineer: eng, totalClients: 0, withFinancial: 0, updatedLast30Days: 0 });
    }
    const bucket = byEngineer.get(eng);
    bucket.totalClients += 1;
    if (row.hasFinancialData) bucket.withFinancial += 1;
    if (row.updatedLast30Days) bucket.updatedLast30Days += 1;
  }
  const updatesByEngineer = [...byEngineer.values()]
    .map((b) => ({
      label: b.engineer,
      engineer: b.engineer,
      totalClients: b.totalClients,
      withFinancial: b.withFinancial,
      updatedLast30Days: b.updatedLast30Days,
      recentUpdatePercent: pct(b.updatedLast30Days, b.withFinancial || 0),
      coveragePercent: pct(b.withFinancial, b.totalClients || 0),
      count: b.updatedLast30Days,
      percent: pct(b.updatedLast30Days, clientsWithFinancialData || 1),
    }))
    .sort(
      (a, b) =>
        b.recentUpdatePercent - a.recentUpdatePercent ||
        b.updatedLast30Days - a.updatedLast30Days ||
        a.label.localeCompare(b.label, "pt-BR"),
    );

  const hasUpdateHistory = false;

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalClients,
      clientsWithFinancialData,
      financialDataCoveragePercent: pct(clientsWithFinancialData, totalClients),
      updatedLast30Days,
      updatedLast30DaysPercentOfFinancial: pct(updatedLast30Days, clientsWithFinancialData),
      updatedLast30DaysPercentOfPortfolio: pct(updatedLast30Days, totalClients),
      medianDaysSinceUpdate,
      averageDaysSinceUpdate,
      outdatedOver90Days,
      outdatedOver90DaysPercent: pct(outdatedOver90Days, clientsWithFinancialData),
      updatedLast30DaysPercent: pct(updatedLast30Days, clientsWithFinancialData),
      hasUpdateHistory,
      totalFinancialUpdates: null,
      averageUpdatesPerClient: null,
      clientsUpdatedMoreThanOnce: null,
      latestFinancialUpdateInBase: (() => {
        const dates = withFinancial.map((r) => r.financialUpdateDate).filter(Boolean).sort();
        return dates.length ? dates[dates.length - 1] : null;
      })(),
      note:
        "A base atual armazena apenas o estado financeiro mais recente por cliente. Não há contagem confiável de eventos de atualização.",
    },
    distributions: {
      updateRecency,
      updatesByMonth: buildMonthSeries(rows, now, 12),
      updatesByMonthRanges: {
        months6: buildMonthSeries(rows, now, 6),
        months12: buildMonthSeries(rows, now, 12),
        months24: buildMonthSeries(rows, now, 24),
      },
      fieldCoverage,
      updatesByEngineer,
    },
    clients: rows,
    warnings: qualityWarnings,
    quality: {
      usedFields: USED_FIELDS,
      warnings: qualityWarnings,
      financialDedup: {
        totalRows: (financialRows || []).length,
        distinctClients: byClient.size,
        clientsWithMultipleRows: multiples.length,
        maxRowsPerClient: multiples.length ? Math.max(...multiples.map((m) => m.count)) : 1,
        rule: "updated_at → created_at → id; uma linha analítica por client_id",
      },
      historyAudit: {
        hasUpdateHistory: false,
        activityLogsFinancialEvents: "partial_not_used",
        note:
          "activity_logs contém eventos de client_financial_data, porém a cobertura é parcial frente ao total de registros; não usada para KPIs de quantidade de atualizações.",
      },
      futureFields: {
        valor_imoveis_quitados:
          "Coluna existe em client_financial_data, mas não representa patrimônio total/atual; não usada neste dashboard.",
        patrimonio:
          "Nenhuma coluna confirmada de patrimônio inicial/atual/total/evolução patrimonial.",
      },
    },
  };
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;
  const configError = configurationError();
  console.error("[Financial Updates Config]", {
    "AUTH URL configurada": Boolean(String(process.env.AUTH_SUPABASE_URL || "").trim()),
    "DATA URL configurada": Boolean(String(process.env.DATA_SUPABASE_URL || "").trim()),
    "AUTH key configurada": Boolean(String(process.env.AUTH_SUPABASE_ANON_KEY || "").trim()),
    "DATA service role configurada": Boolean(String(process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || "").trim()),
  });
  if (configError) {
    return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    await probeFinancialTable();
    const [{ rows: financialRows, warnings: fetchWarnings }, clients, cancellations] = await Promise.all([
      fetchFinancialRowsResilient(),
      fetchAll("clients", CLIENT_SELECT),
      fetchAll("cancellations", CANCEL_SELECT),
    ]);
    const payload = buildPayload(clients, financialRows, cancellations);
    if (fetchWarnings.length) {
      payload.warnings = [...(payload.warnings || []), ...fetchWarnings];
      payload.quality = payload.quality || {};
      payload.quality.warnings = [...(payload.quality.warnings || []), ...fetchWarnings];
    }
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consolidar atualização financeira";
    console.error("[Financial Updates] fatal", message.slice(0, 200));
    return Response.json(
      { error: message, ...emptyPayload([message]) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
