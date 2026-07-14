const CLIENT_SELECT =
  "id,codigo,name,data_inicio_ciclo,created_at,status,segmentacao,engenheiro_patrimonial,data_churn";
const CANCEL_SELECT = "client_id,churn_efetivado_at,updated_at,created_at";
const FINANCIAL_SELECT =
  "id,client_id,reserva_liquidez,ultimo_aporte,ultima_renda_mensal,possui_imovel,possui_carro,possui_consorcio,updated_at";

const USED_FIELDS = [
  { table: "clients", column: "id", role: "clientId" },
  { table: "clients", column: "codigo", role: "clientCode" },
  { table: "clients", column: "name", role: "clientName" },
  { table: "clients", column: "data_inicio_ciclo", role: "contractDate" },
  { table: "clients", column: "created_at", role: "stayFallbackDate" },
  { table: "clients", column: "status", role: "status" },
  { table: "clients", column: "segmentacao", role: "segment" },
  { table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { table: "clients", column: "data_churn", role: "cancellationDateFallback" },
  { table: "cancellations", column: "client_id", role: "cancellationJoin" },
  { table: "cancellations", column: "churn_efetivado_at", role: "cancellationDatePrimary" },
  { table: "client_financial_data", column: "reserva_liquidez", role: "liquidityReserve" },
  { table: "client_financial_data", column: "ultimo_aporte", role: "lastContribution" },
  { table: "client_financial_data", column: "ultima_renda_mensal", role: "monthlyIncome" },
  { table: "client_financial_data", column: "possui_imovel", role: "hasProperty" },
  { table: "client_financial_data", column: "possui_carro", role: "hasCar" },
  { table: "client_financial_data", column: "possui_consorcio", role: "hasConsortium" },
];

const STAY_RANGES = [
  "Até 3 meses",
  "De 4 a 6 meses",
  "De 7 a 12 meses",
  "De 13 a 24 meses",
  "Mais de 24 meses",
  "Sem data de referência",
];

const INCOME_BANDS = [
  "Até R$ 5 mil",
  "5 a 10 mil",
  "10 a 20 mil",
  "20 a 50 mil",
  "Acima de 50 mil",
  "Não informado",
];

const LIQUIDITY_BANDS = [
  "Até R$ 50 mil",
  "50 a 100 mil",
  "100 a 250 mil",
  "250 a 500 mil",
  "500 mil a 1 milhão",
  "Acima de 1 milhão",
  "Não informado",
];

function configurationError() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Configuração do Supabase ausente no Netlify";
  }
  try {
    if (new URL(process.env.SUPABASE_URL).protocol !== "https:") return "SUPABASE_URL deve usar HTTPS";
  } catch {
    return "SUPABASE_URL inválida";
  }
  return null;
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
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(ms / 86400000);
}

function stayRangeFromMonths(months) {
  if (months == null) return "Sem data de referência";
  if (months <= 3) return "Até 3 meses";
  if (months <= 6) return "De 4 a 6 meses";
  if (months <= 12) return "De 7 a 12 meses";
  if (months <= 24) return "De 13 a 24 meses";
  return "Mais de 24 meses";
}

function incomeBand(value) {
  if (value == null) return "Não informado";
  if (value <= 5000) return "Até R$ 5 mil";
  if (value <= 10000) return "5 a 10 mil";
  if (value <= 20000) return "10 a 20 mil";
  if (value <= 50000) return "20 a 50 mil";
  return "Acima de 50 mil";
}

function liquidityBand(value) {
  if (value == null) return "Não informado";
  if (value <= 50000) return "Até R$ 50 mil";
  if (value <= 100000) return "50 a 100 mil";
  if (value <= 250000) return "100 a 250 mil";
  if (value <= 500000) return "250 a 500 mil";
  if (value <= 1000000) return "500 mil a 1 milhão";
  return "Acima de 1 milhão";
}

function isCancelledStatus(status) {
  const s = String(status || "").toLowerCase();
  return /cancel|churn|inativ|encerr/.test(s);
}

function labelOrUnknown(value) {
  return blankToNull(value) ?? "Não informado";
}

function distributionFrom(items, keyFn, orderedLabels) {
  const counts = new Map();
  if (orderedLabels) orderedLabels.forEach((label) => counts.set(label, 0));
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = items.length || 1;
  const entries = orderedLabels
    ? orderedLabels.map((label) => [label, counts.get(label) || 0])
    : [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  return entries.map(([label, count]) => ({
    label,
    count,
    percent: Math.round((count / total) * 1000) / 10,
  }));
}

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

async function fetchAll(table, select) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, process.env.SUPABASE_URL);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
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

function buildCancellationMap(cancellations) {
  const map = new Map();
  const multiples = new Set();
  for (const row of cancellations) {
    const clientId = blankToNull(row.client_id);
    const churnAt = parseDate(row.churn_efetivado_at);
    if (!clientId || !churnAt) continue;
    const current = map.get(clientId);
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || churnAt;
    if (!current) {
      map.set(clientId, { date: churnAt, count: 1, updated });
      continue;
    }
    current.count += 1;
    if (current.count > 1) multiples.add(clientId);
    if (churnAt > current.date || (churnAt.getTime() === current.date.getTime() && updated > current.updated)) {
      current.date = churnAt;
      current.updated = updated;
    }
  }
  return { map, multiples };
}

function buildFinancialMap(financialRows) {
  const map = new Map();
  for (const row of financialRows) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const updated = parseDate(row.updated_at) || new Date(0);
    const current = map.get(clientId);
    if (!current || updated > current.updated) {
      map.set(clientId, {
        updated,
        monthlyIncome: toNumber(row.ultima_renda_mensal),
        lastContribution: toNumber(row.ultimo_aporte),
        liquidityReserve: toNumber(row.reserva_liquidez),
        hasProperty: toBool(row.possui_imovel),
        hasCar: toBool(row.possui_carro),
        hasConsortium: toBool(row.possui_consorcio),
      });
    }
  }
  return map;
}

function buildPayload(clients, cancellations, financialRows) {
  const { map: cancelMap, multiples } = buildCancellationMap(cancellations);
  const financialMap = buildFinancialMap(financialRows);
  const now = new Date();
  const rows = [];

  for (const client of clients) {
    const dataWarnings = [];
    const contractDate = parseDate(client.data_inicio_ciclo);
    const createdAt = parseDate(client.created_at);
    const stayStartDate = contractDate || createdAt;
    const usedCreatedFallback = !contractDate && Boolean(createdAt);
    const cancelPrimary = cancelMap.get(client.id)?.date || null;
    const cancelFallback = parseDate(client.data_churn);
    const cancellationDate = cancelPrimary || cancelFallback;
    const status = blankToNull(client.status);
    const cancelled = isCancelledStatus(status) || Boolean(cancellationDate);
    const financial = financialMap.get(client.id) || null;

    if (!contractDate) dataWarnings.push("Sem data de contratação");
    if (usedCreatedFallback) {
      dataWarnings.push(
        "Permanência calculada com data de criação do cliente por ausência de data de contratação.",
      );
    }
    if (cancelled && !cancellationDate) dataWarnings.push("Cancelado sem data de cancelamento");
    if (!cancelled && cancellationDate) dataWarnings.push("Ativo com data de cancelamento");
    if (!status) dataWarnings.push("Cliente sem status");
    if (!blankToNull(client.segmentacao)) dataWarnings.push("Cliente sem segmento");
    if (!blankToNull(client.engenheiro_patrimonial)) dataWarnings.push("Cliente sem engenheiro responsável");
    if (!financial) dataWarnings.push("Sem diagnóstico financeiro");
    else {
      if (financial.monthlyIncome == null) dataWarnings.push("Renda mensal ausente");
      if (financial.lastContribution == null) dataWarnings.push("Último aporte ausente");
      if (financial.liquidityReserve == null) dataWarnings.push("Reserva de liquidez ausente");
    }
    if (multiples.has(client.id)) dataWarnings.push("Múltiplos cancelamentos efetivados para o mesmo cliente");

    let stayDays = null;
    let stayMonths = null;
    let stayRange = "Sem data de referência";
    let inconsistentStay = false;

    if (stayStartDate) {
      const endDate = cancellationDate || now;
      const days = daysBetween(stayStartDate, endDate);
      if (days < 0) {
        inconsistentStay = true;
        dataWarnings.push("Cancelamento anterior à contratação");
      } else {
        stayDays = days;
        stayMonths = Math.round((days / 30.4375) * 10) / 10;
        stayRange = stayRangeFromMonths(stayMonths);
      }
    }

    rows.push({
      clientId: String(client.id),
      clientCode: blankToNull(client.codigo),
      clientName: blankToNull(client.name) || "Não informado",
      contractDate: contractDate ? contractDate.toISOString() : null,
      cancellationDate: cancellationDate ? cancellationDate.toISOString() : null,
      stayDays: inconsistentStay ? null : stayDays,
      stayMonths: inconsistentStay ? null : stayMonths,
      stayRange,
      stayUsedCreatedAtFallback: usedCreatedFallback,
      status: status || "Não informado",
      segment: labelOrUnknown(client.segmentacao),
      engineer: labelOrUnknown(client.engenheiro_patrimonial),
      hasFinancialProfile: Boolean(financial),
      monthlyIncome: financial?.monthlyIncome ?? null,
      lastContribution: financial?.lastContribution ?? null,
      liquidityReserve: financial?.liquidityReserve ?? null,
      hasProperty: financial?.hasProperty ?? null,
      hasCar: financial?.hasCar ?? null,
      hasConsortium: financial?.hasConsortium ?? null,
      incomeBand: incomeBand(financial?.monthlyIncome ?? null),
      liquidityBand: liquidityBand(financial?.liquidityReserve ?? null),
      dataWarnings,
      _cancelled: cancelled,
    });
  }

  const liquidityValues = rows.map((r) => r.liquidityReserve).filter((v) => v != null);
  const contributionValues = rows.map((r) => r.lastContribution).filter((v) => v != null);
  const incomeValues = rows.map((r) => r.monthlyIncome).filter((v) => v != null);
  const withFinancial = rows.filter((r) => r.hasFinancialProfile).length;
  const total = rows.length || 1;

  const summary = {
    totalClients: rows.length,
    activeClients: rows.filter((r) => !r._cancelled).length,
    cancelledClients: rows.filter((r) => r._cancelled).length,
    averageStayDays: average(rows.map((r) => r.stayDays).filter((v) => v != null)),
    averageLiquidityReserve: average(liquidityValues),
    liquidityReserveFilledCount: liquidityValues.length,
    averageLastContribution: average(contributionValues),
    lastContributionFilledCount: contributionValues.length,
    averageMonthlyIncome: average(incomeValues),
    monthlyIncomeFilledCount: incomeValues.length,
    clientsWithFinancialProfile: withFinancial,
    financialProfilePercent: Math.round((withFinancial / total) * 1000) / 10,
  };

  const distributions = {
    status: distributionFrom(rows, (r) => r.status),
    segments: distributionFrom(rows, (r) => r.segment),
    engineers: distributionFrom(rows, (r) => r.engineer),
    stayRanges: distributionFrom(rows, (r) => r.stayRange, STAY_RANGES),
    financialProfile: [
      { label: "Imóvel", count: rows.filter((r) => r.hasProperty === true).length },
      { label: "Carro", count: rows.filter((r) => r.hasCar === true).length },
      { label: "Consórcio", count: rows.filter((r) => r.hasConsortium === true).length },
      { label: "Reserva de liquidez", count: rows.filter((r) => r.liquidityReserve != null).length },
    ].map((item) => ({
      ...item,
      percent: Math.round((item.count / total) * 1000) / 10,
    })),
    monthlyIncome: distributionFrom(rows, (r) => r.incomeBand, INCOME_BANDS),
    liquidityReserve: distributionFrom(rows, (r) => r.liquidityBand, LIQUIDITY_BANDS),
  };

  const clientsOut = rows.map(({ _cancelled, ...rest }) => rest);

  return {
    generatedAt: new Date().toISOString(),
    summary,
    distributions,
    clients: clientsOut,
    quality: {
      usedFields: USED_FIELDS,
      warnings: [],
    },
  };
}

export default async () => {
  const configError = configurationError();
  if (configError) {
    return Response.json(
      { error: configError },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const [clients, cancellations, financialRows] = await Promise.all([
      fetchAll("clients", CLIENT_SELECT),
      fetchAll("cancellations", CANCEL_SELECT),
      fetchAll("client_financial_data", FINANCIAL_SELECT),
    ]);
    const payload = buildPayload(clients, cancellations, financialRows);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Não foi possível consolidar os dados gerais" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
