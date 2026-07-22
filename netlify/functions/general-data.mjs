import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";

const CLIENT_SELECT =
  "id,codigo,name,data_inicio_ciclo,created_at,status,segmentacao,engenheiro_patrimonial,data_churn";
const CANCEL_SELECT =
  "id,client_id,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at";
const FINANCIAL_SELECT =
  "id,client_id,reserva_liquidez,ultimo_aporte,ultima_renda_mensal,valor_imoveis_quitados,possui_imovel,possui_carro,possui_consorcio,cheque_especial,parcelamento_cartao,credito_pessoal,credito_consignado,updated_at";
const SIGNATURE_SELECT = "id_cliente,data_assinatura_contrato";

/**
 * Regra final da data consolidada de cancelamento (por cliente):
 * 1) Ignora registros com archived_at (exclusão lógica).
 * 2) Por registro: coalesce(distrato_assinado_at::date, data_pedido::date, intencao_registrada_at::date).
 * 3) Entre registros do mesmo cliente: prioriza etapa (distrato > pedido > intenção);
 *    empate pela data consolidada mais recente; depois updated_at/created_at.
 * 4) Uma linha analítica por client_id.
 */
const USED_FIELDS = [
  { table: "clients", column: "id", role: "clientId" },
  { table: "clients", column: "codigo", role: "clientCode" },
  { table: "clients", column: "name", role: "clientName" },
  { table: "clients", column: "data_inicio_ciclo", role: "contractDateCycleStart" },
  { table: "clients", column: "created_at", role: "acquisitionFallbackCreated" },
  { table: "clients", column: "status", role: "rawStatus" },
  { table: "clients", column: "segmentacao", role: "segment" },
  { table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { table: "clients", column: "data_churn", role: "cancellationDateLegacyFallback" },
  { table: "cancellations", column: "client_id", role: "cancellationJoin" },
  { table: "cancellations", column: "distrato_assinado_at", role: "cancellationDatePriority1" },
  { table: "cancellations", column: "data_pedido", role: "cancellationDatePriority2" },
  { table: "cancellations", column: "intencao_registrada_at", role: "cancellationDatePriority3" },
  { table: "cancellations", column: "archived_at", role: "cancellationSoftDelete" },
  { table: "cancellations", column: "updated_at", role: "cancellationRecency" },
  { table: "cancellations", column: "created_at", role: "cancellationCreatedFallback" },
  { table: "vw_info_cliente", column: "id_cliente", role: "acquisitionJoin" },
  { table: "vw_info_cliente", column: "data_assinatura_contrato", role: "acquisitionDatePrimary" },
  { table: "client_financial_data", column: "client_id", role: "financialJoin" },
  { table: "client_financial_data", column: "reserva_liquidez", role: "liquidityReserve" },
  { table: "client_financial_data", column: "ultimo_aporte", role: "lastContribution" },
  { table: "client_financial_data", column: "ultima_renda_mensal", role: "monthlyIncome" },
  { table: "client_financial_data", column: "valor_imoveis_quitados", role: "paidPropertiesValue" },
  { table: "client_financial_data", column: "possui_imovel", role: "hasProperty" },
  { table: "client_financial_data", column: "possui_carro", role: "hasCar" },
  { table: "client_financial_data", column: "possui_consorcio", role: "hasConsortium" },
  { table: "client_financial_data", column: "cheque_especial", role: "debtChequeEspecial" },
  { table: "client_financial_data", column: "parcelamento_cartao", role: "debtParcelamentoCartao" },
  { table: "client_financial_data", column: "credito_pessoal", role: "debtCreditoPessoal" },
  { table: "client_financial_data", column: "credito_consignado", role: "debtCreditoConsignado" },
  { table: "client_financial_data", column: "updated_at", role: "financialRecency" },
];

const STAY_RANGES = [
  "Até 3 meses",
  "De 4 a 6 meses",
  "De 7 a 12 meses",
  "De 13 a 24 meses",
  "Mais de 24 meses",
  "Sem dados suficientes",
];

const INSUFFICIENT_STAY_RANGE = "Sem dados suficientes";

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

const STATUS_LABELS = ["Ativo", "Cancelado", "Congelado", "Não informado"];

/** Ordem obrigatória de exibição/prioridade de segmento por capacidade financeira. */
const SEGMENT_LABELS = ["APEX", "PRIVATE", "PRINCIPAL", "DEBTS", "OVER", "Dados insuficientes"];
const INSUFFICIENT_SEGMENT_LABEL = "Dados insuficientes";

const DEBT_FIELDS = [
  { key: "cheque_especial", label: "cheque especial" },
  { key: "parcelamento_cartao", label: "parcelamento de cartão" },
  { key: "credito_pessoal", label: "crédito pessoal" },
  { key: "credito_consignado", label: "crédito consignado" },
];

/**
 * Valida se um valor financeiro está realmente presente.
 * Distingue número zero informado (válido) de ausência (null/undefined/vazio/inválido).
 */
function hasValidFinancialValue(value) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return false;
    return Number.isFinite(Number(s.replace(",", ".")));
  }
  return false;
}

/**
 * Normaliza um indicador de dívida.
 * Reconhece: true, 1, sim, yes, possui, ativo → dívida.
 * vazio/null/"não" → sem dívida (não infere dívida).
 */
function normalizeDebtFlag(raw) {
  if (raw == null) return { isDebt: false, known: false, unrecognized: false };
  if (typeof raw === "boolean") return { isDebt: raw, known: true, unrecognized: false };
  if (typeof raw === "number") return { isDebt: raw !== 0, known: true, unrecognized: false };
  const s = String(raw).trim().toLowerCase();
  if (!s) return { isDebt: false, known: false, unrecognized: false };
  if (["true", "t", "1", "sim", "yes", "y", "possui", "ativo"].includes(s)) {
    return { isDebt: true, known: true, unrecognized: false };
  }
  if (["false", "f", "0", "nao", "não", "no", "n", "vazio", "nenhum", "nenhuma"].includes(s)) {
    return { isDebt: false, known: true, unrecognized: false };
  }
  return { isDebt: false, known: false, unrecognized: true };
}

/**
 * Classificação determinística e conservadora de segmento por capacidade financeira.
 * Prioridade obrigatória: DEBTS > APEX > PRIVATE > PRINCIPAL > OVER > Dados insuficientes.
 * PRIVATE/PRINCIPAL/OVER só são atribuídos com renda válida (numérica e não negativa).
 * APEX e DEBTS exigem evidência explícita. Não usa IA, não grava no banco.
 */
export function calculateClientSegment(financialData, debtData) {
  const segmentWarnings = [];
  const monthlyIncome = financialData?.monthlyIncome ?? null;
  const liquidityReserve = financialData?.liquidityReserve ?? null;
  const lastContribution = financialData?.lastContribution ?? null;
  const paidPropertiesValue = financialData?.paidPropertiesValue ?? null;

  if (monthlyIncome != null && monthlyIncome < 0) segmentWarnings.push("Renda mensal negativa");
  if (liquidityReserve != null && liquidityReserve < 0) segmentWarnings.push("Reserva de liquidez negativa");
  if (lastContribution != null && lastContribution < 0) segmentWarnings.push("Último aporte negativo");
  if (paidPropertiesValue != null && paidPropertiesValue < 0) segmentWarnings.push("Valor de imóveis quitados negativo");

  // Renda válida = presente, numérica e não negativa.
  const hasValidMonthlyIncome = hasValidFinancialValue(monthlyIncome) && monthlyIncome >= 0;

  // Dívida: exige evidência explícita; ausência não equivale a "não possui".
  const debtReasons = [];
  let anyDebt = false;
  let anyDebtKnown = false;
  for (const field of DEBT_FIELDS) {
    const norm = normalizeDebtFlag(debtData?.[field.key]);
    if (norm.unrecognized) segmentWarnings.push(`Dívida com formato não reconhecido: ${field.key}`);
    if (norm.known) anyDebtKnown = true;
    if (norm.isDebt) {
      anyDebt = true;
      debtReasons.push(`Possui ${field.label} registrado`);
    }
  }
  const debtDataAvailable = anyDebtKnown;

  const missingFinancialData = [];
  if (!hasValidMonthlyIncome) missingFinancialData.push("renda mensal");
  if (!debtDataAvailable) missingFinancialData.push("informação de dívida");
  if (!hasValidFinancialValue(liquidityReserve)) missingFinancialData.push("reserva de liquidez");
  if (!hasValidFinancialValue(paidPropertiesValue)) missingFinancialData.push("valor dos imóveis quitados");
  if (!hasValidFinancialValue(lastContribution)) missingFinancialData.push("último aporte");

  const segmentInputs = {
    monthlyIncome,
    liquidityReserve,
    lastContribution,
    paidPropertiesValue,
    hasDebt: anyDebt,
    debtDataAvailable,
  };

  const build = (segment, reasons, confidence) => {
    // Validações defensivas de consistência (não bloqueiam o dashboard).
    if ((segment === "PRIVATE" || segment === "PRINCIPAL" || segment === "OVER") && !hasValidMonthlyIncome) {
      segmentWarnings.push(`Segmento ${segment} atribuído sem renda válida`);
    }
    if (segment === "APEX" && !reasons.length) segmentWarnings.push("Cliente APEX sem nenhum critério APEX");
    if (segment === "DEBTS" && !reasons.length) segmentWarnings.push("Cliente DEBTS sem evidência de dívida");
    if (confidence === "medium") {
      segmentWarnings.push("Informação de dívida não disponível; classificação feita somente com base financeira.");
    }
    return {
      segment,
      segmentLabel: segment,
      segmentStatus: "classified",
      segmentConfidence: confidence,
      segmentReason: reasons[0] || null,
      segmentReasons: reasons,
      segmentInputs,
      missingFinancialData,
      segmentWarnings,
    };
  };

  // 1. DEBTS — apenas com evidência explícita de dívida.
  if (anyDebt) return build("DEBTS", debtReasons, "high");

  // 2. APEX — regra OR; qualquer critério explícito preenchido e atingido.
  const apexReasons = [];
  if (hasValidFinancialValue(monthlyIncome) && monthlyIncome >= 100000) {
    apexReasons.push("Renda mensal igual ou superior a R$ 100 mil");
  }
  if (hasValidFinancialValue(paidPropertiesValue) && paidPropertiesValue >= 2000000) {
    apexReasons.push("Imóveis quitados iguais ou superiores a R$ 2 milhões");
  }
  if (hasValidFinancialValue(lastContribution) && lastContribution >= 30000) {
    apexReasons.push("Último aporte igual ou superior a R$ 30 mil");
  }
  if (hasValidFinancialValue(liquidityReserve) && liquidityReserve >= 500000) {
    apexReasons.push("Reserva de liquidez igual ou superior a R$ 500 mil");
  }
  if (apexReasons.length) return build("APEX", apexReasons, "high");

  // 3-7 dependem de renda mensal válida.
  if (hasValidMonthlyIncome) {
    const confidence = debtDataAvailable ? "high" : "medium";
    if (monthlyIncome > 50000) return build("PRIVATE", ["Renda mensal superior a R$ 50 mil"], confidence);
    if (monthlyIncome >= 20000) return build("PRINCIPAL", ["Renda mensal entre R$ 20 mil e R$ 50 mil"], confidence);
    return build("OVER", ["Renda mensal inferior a R$ 20 mil"], confidence);
  }

  // 8. Dados insuficientes — sem dívida, sem critério APEX e sem renda válida.
  return {
    segment: null,
    segmentLabel: INSUFFICIENT_SEGMENT_LABEL,
    segmentStatus: "insufficient_data",
    segmentConfidence: "low",
    segmentReason: "Renda mensal não informada e nenhum critério APEX ou dívida confirmada.",
    segmentReasons: ["Renda mensal não informada e nenhum critério APEX ou dívida confirmada."],
    segmentInputs,
    missingFinancialData,
    segmentWarnings,
  };
}

const STAGE_RANK = {
  "Distrato assinado": 3,
  "Pedido de cancelamento": 2,
  "Intenção registrada": 1,
};

/** Configuração de exibição por indicador contínuo. */
const MEASURE_CONFIG = {
  liquidityReserve: {
    displayMeasure: "median",
    trimPercent: 5,
    label: "Reserva de liquidez típica",
    tooltip:
      "A mediana representa o valor central da distribuição e sofre menos influência de valores muito altos ou muito baixos.",
  },
  lastContribution: {
    displayMeasure: "median",
    trimPercent: 5,
    label: "Último aporte típico",
    tooltip:
      "A mediana representa o valor central da distribuição e sofre menos influência de valores muito altos ou muito baixos.",
  },
  monthlyIncome: {
    displayMeasure: "median",
    trimPercent: 5,
    label: "Renda mensal típica",
    tooltip:
      "A mediana representa o valor central da distribuição e sofre menos influência de valores muito altos ou muito baixos.",
  },
  stayDays: {
    displayMeasure: "median",
    trimPercent: 5,
    label: "Permanência típica",
    tooltip:
      "Para clientes ativos e congelados, considera a data atual. Para encerrados, considera apenas registros com data de cancelamento preenchida. A mediana sofre menos influência de valores extremos.",
  },
};

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
    const [y, m, d] = String(raw).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
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
  if (months == null) return INSUFFICIENT_STAY_RANGE;
  if (months <= 3) return "Até 3 meses";
  if (months <= 6) return "De 4 a 6 meses";
  if (months <= 12) return "De 7 a 12 meses";
  if (months <= 24) return "De 13 a 24 meses";
  return "Mais de 24 meses";
}

/**
 * Permanência conservadora:
 * - Ativo/Congelado → fim = hoje
 * - Cancelado com data → fim = data de cancelamento
 * - Cancelado sem data / sem início / inconsistente → não calcula
 */
function resolveStayPeriod({ stayStartDate, analyticalStatus, cancellationDate, now }) {
  if (!stayStartDate) {
    return {
      stayDays: null,
      stayMonths: null,
      stayRange: INSUFFICIENT_STAY_RANGE,
      stayCalculationStatus: "missing_start_date",
      stayUsedCurrentDate: false,
      warning: "Cliente sem data de início; excluído do cálculo de permanência.",
    };
  }

  let endDate = null;
  let stayCalculationStatus = null;
  let stayUsedCurrentDate = false;
  let warning = null;

  if (analyticalStatus === "Ativo" || analyticalStatus === "Congelado") {
    endDate = now;
    stayUsedCurrentDate = true;
    stayCalculationStatus = "calculated_current_date";
  } else if (analyticalStatus === "Cancelado" && cancellationDate) {
    endDate = cancellationDate;
    stayCalculationStatus = "calculated_cancellation_date";
  } else if (analyticalStatus === "Cancelado" && !cancellationDate) {
    return {
      stayDays: null,
      stayMonths: null,
      stayRange: INSUFFICIENT_STAY_RANGE,
      stayCalculationStatus: "missing_cancellation_date",
      stayUsedCurrentDate: false,
      warning: "Cliente encerrado sem data de cancelamento; excluído do cálculo de permanência.",
    };
  } else {
    return {
      stayDays: null,
      stayMonths: null,
      stayRange: INSUFFICIENT_STAY_RANGE,
      stayCalculationStatus: "insufficient_status",
      stayUsedCurrentDate: false,
      warning: "Status insuficiente para calcular permanência; excluído do cálculo.",
    };
  }

  const days = daysBetween(stayStartDate, endDate);
  if (days < 0) {
    return {
      stayDays: null,
      stayMonths: null,
      stayRange: INSUFFICIENT_STAY_RANGE,
      stayCalculationStatus: "inconsistent_dates",
      stayUsedCurrentDate: false,
      warning: "Cancelamento anterior à contratação",
    };
  }

  const stayMonths = Math.round((days / 30.4375) * 10) / 10;
  return {
    stayDays: days,
    stayMonths,
    stayRange: stayRangeFromMonths(stayMonths),
    stayCalculationStatus,
    stayUsedCurrentDate,
    warning,
  };
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

/**
 * Status analítico centralizado.
 * Se houver data consolidada de cancelamento → Cancelado (prevalece sobre status bruto ativo).
 */
function resolveAnalyticalStatus(rawStatus, cancellationDate) {
  if (cancellationDate) return "Cancelado";
  return normalizeClientStatus(rawStatus);
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

function round2(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Estatísticas robustas para indicadores contínuos (não altera dados no banco). */
function robustStats(values, options = {}) {
  const trimPercent = options.trimPercent ?? 5;
  const filled = values.filter((v) => v != null && Number.isFinite(v));
  const valid = filled.filter((v) => options.allowNegative || v >= 0);
  const sorted = [...valid].sort((a, b) => a - b);
  const count = filled.length;
  const validCount = sorted.length;
  if (!validCount) {
    return {
      count,
      filledCount: count,
      validCount: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p5: null,
      p25: null,
      p75: null,
      p95: null,
      trimmedMean: null,
      trimmedExcludedCount: 0,
      extremeImpact: false,
    };
  }
  const mean = average(sorted);
  const median = round2(percentile(sorted, 50));
  const p5 = round2(percentile(sorted, 5));
  const p25 = round2(percentile(sorted, 25));
  const p75 = round2(percentile(sorted, 75));
  const p95 = round2(percentile(sorted, 95));
  let trimmed = sorted;
  let trimmedExcludedCount = 0;
  if (validCount >= 20 && trimPercent > 0) {
    const low = percentile(sorted, trimPercent);
    const high = percentile(sorted, 100 - trimPercent);
    trimmed = sorted.filter((v) => v >= low && v <= high);
    trimmedExcludedCount = validCount - trimmed.length;
  }
  const trimmedMean = average(trimmed);
  const extremeImpact =
    median != null &&
    median !== 0 &&
    mean != null &&
    Math.abs(mean - median) / Math.abs(median) >= 0.3;
  return {
    count,
    filledCount: count,
    validCount,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    p5,
    p25,
    p75,
    p95,
    trimmedMean,
    trimmedExcludedCount,
    extremeImpact,
  };
}

function measureBundle(key, values) {
  const cfg = MEASURE_CONFIG[key] || {
    displayMeasure: "median",
    trimPercent: 5,
    label: key,
    tooltip: "Medida robusta diante de valores extremos.",
  };
  const stats = robustStats(values, { trimPercent: cfg.trimPercent, allowNegative: key === "lastContribution" });
  const displayMap = {
    mean: stats.mean,
    median: stats.median,
    trimmedMean: stats.trimmedMean,
  };
  return {
    ...stats,
    displayMeasure: cfg.displayMeasure,
    displayValue: displayMap[cfg.displayMeasure] ?? stats.median,
    label: cfg.label,
    tooltip: cfg.tooltip,
    trimmedMeanNote: "Média sem extremos considera apenas valores entre os percentis 5 e 95.",
  };
}

function monthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function currentMonthKey(now = new Date()) {
  return monthKey(now);
}

function cancellationStageFromDates(distrato, pedido, intencao) {
  if (distrato) return "Distrato assinado";
  if (pedido) return "Pedido de cancelamento";
  if (intencao) return "Intenção registrada";
  return null;
}

function consolidatedCancelDate(distrato, pedido, intencao) {
  return distrato || pedido || intencao || null;
}

async function fetchAll(table, select, options = {}) {
  const pageSize = options.pageSize || 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  const order = options.order === null ? null : options.order || "id.asc";
  while (true) {
    const url = new URL(`/rest/v1/${table}`, process.env.DATA_SUPABASE_URL);
    url.searchParams.set("select", select);
    if (order) url.searchParams.set("order", order);
    if (options.filters) {
      for (const [k, v] of Object.entries(options.filters)) {
        url.searchParams.set(k, v);
      }
    }
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${table}: HTTP ${response.status} ${detail.slice(0, 200)}`);
    }
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

/**
 * Prioridade oficial de aquisição:
 * 1) vw_info_cliente.data_assinatura_contrato (id_cliente)
 * 2) clients.data_inicio_ciclo
 * 3) clients.created_at
 *
 * A view existe e o campo foi confirmado, porém a varredura completa via PostgREST
 * estoura statement timeout (mesmo paginada). Não usamos amostra parcial (viesaria o gráfico).
 * Enquanto a view não for otimizada/materializada, a aquisição opera pelos fallbacks.
 */
async function fetchSignatureMap() {
  return {
    map: new Map(),
    error: null,
    fetched: 0,
    withSignature: 0,
    skippedDueToViewTimeout: true,
    note:
      "data_assinatura_contrato confirmada em vw_info_cliente, mas a view estoura timeout em leitura completa; aquisição usa data_inicio_ciclo → created_at.",
  };
}

function buildCancellationMap(cancellations) {
  const map = new Map();
  const activeProcessCounts = new Map();
  const orphanClientIds = [];
  const now = startOfDay(new Date());

  for (const row of cancellations) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    if (parseDate(row.archived_at)) continue;

    const distrato = parseDate(row.distrato_assinado_at);
    const pedido = parseDate(row.data_pedido);
    const intencao = parseDate(row.intencao_registrada_at);
    const consolidated = consolidatedCancelDate(distrato, pedido, intencao);
    if (!consolidated) continue;

    const stage = cancellationStageFromDates(distrato, pedido, intencao);
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || consolidated;
    const rank = STAGE_RANK[stage] || 0;

    activeProcessCounts.set(clientId, (activeProcessCounts.get(clientId) || 0) + 1);

    const warnings = [];
    if (distrato && !pedido) warnings.push("Distrato assinado sem data de pedido");
    if (intencao && pedido && intencao > pedido) warnings.push("Intenção posterior ao pedido");
    if (pedido && distrato && pedido > distrato) warnings.push("Pedido posterior ao distrato");
    if (startOfDay(consolidated) > now) warnings.push("Data de cancelamento futura");

    const candidate = {
      date: consolidated,
      stage,
      rank,
      updated,
      warnings,
      hasDistrato: Boolean(distrato),
      hasPedido: Boolean(pedido),
      hasIntencao: Boolean(intencao),
    };

    const current = map.get(clientId);
    if (!current) {
      map.set(clientId, candidate);
      continue;
    }
    const better =
      candidate.rank > current.rank ||
      (candidate.rank === current.rank &&
        (candidate.date > current.date ||
          (candidate.date.getTime() === current.date.getTime() && candidate.updated > current.updated)));
    if (better) map.set(clientId, { ...candidate, warnings: [...new Set([...current.warnings, ...candidate.warnings])] });
    else map.set(clientId, { ...current, warnings: [...new Set([...current.warnings, ...candidate.warnings])] });
  }

  const multiples = new Set(
    [...activeProcessCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  );

  return { map, multiples, orphanClientIds, activeProcessCounts };
}

function buildFinancialMap(financialRows) {
  const map = new Map();
  const counts = new Map();
  for (const row of financialRows) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    counts.set(clientId, (counts.get(clientId) || 0) + 1);
    const updated = parseDate(row.updated_at) || new Date(0);
    const current = map.get(clientId);
    if (!current || updated > current.updated) {
      map.set(clientId, {
        updated,
        monthlyIncome: toNumber(row.ultima_renda_mensal),
        lastContribution: toNumber(row.ultimo_aporte),
        liquidityReserve: toNumber(row.reserva_liquidez),
        paidPropertiesValue: toNumber(row.valor_imoveis_quitados),
        hasProperty: toBool(row.possui_imovel),
        hasCar: toBool(row.possui_carro),
        hasConsortium: toBool(row.possui_consorcio),
        debt: {
          cheque_especial: row.cheque_especial,
          parcelamento_cartao: row.parcelamento_cartao,
          credito_pessoal: row.credito_pessoal,
          credito_consignado: row.credito_consignado,
        },
      });
    }
  }
  const duplicates = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  return { map, duplicates };
}

function resolveAcquisition(client, signatureMap) {
  const signature = signatureMap.get(client.id) || null;
  const cycleStart = parseDate(client.data_inicio_ciclo);
  const createdAt = parseDate(client.created_at);
  if (signature) {
    return { date: signature, source: "contract_signature" };
  }
  if (cycleStart) {
    return { date: cycleStart, source: "cycle_start" };
  }
  if (createdAt) {
    return { date: createdAt, source: "client_created" };
  }
  return { date: null, source: "unavailable" };
}

function buildAcquisitionsByMonth(rows) {
  const nowKey = currentMonthKey();
  const byMonth = new Map();
  for (const row of rows) {
    if (!row.acquisitionDate) continue;
    const d = parseDate(row.acquisitionDate);
    if (!d) continue;
    const key = monthKey(d);
    if (key > nowKey) continue;
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        month: key,
        acquiredClients: 0,
        contractSignatureCount: 0,
        cycleStartFallbackCount: 0,
        createdAtFallbackCount: 0,
      });
    }
    const bucket = byMonth.get(key);
    bucket.acquiredClients += 1;
    if (row.acquisitionDateSource === "contract_signature") bucket.contractSignatureCount += 1;
    else if (row.acquisitionDateSource === "cycle_start") bucket.cycleStartFallbackCount += 1;
    else if (row.acquisitionDateSource === "client_created") bucket.createdAtFallbackCount += 1;
  }

  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  const result = [];
  for (let i = 0; i < months.length; i += 1) {
    const current = byMonth.get(months[i]);
    const prevKey = months[i + 1];
    const prev = prevKey ? byMonth.get(prevKey) : null;
    let change = null;
    if (prev && prev.acquiredClients > 0) {
      change =
        Math.round(
          ((current.acquiredClients - prev.acquiredClients) / prev.acquiredClients) * 1000,
        ) / 10;
    } else if (prev && prev.acquiredClients === 0) {
      change = null;
    }
    const dominant =
      [
        ["contract_signature", current.contractSignatureCount],
        ["cycle_start", current.cycleStartFallbackCount],
        ["client_created", current.createdAtFallbackCount],
      ].sort((a, b) => b[1] - a[1])[0]?.[0] || "unavailable";
    result.push({
      ...current,
      previousMonthChangePercent: change,
      predominantSource: dominant,
      fallbackCount: current.cycleStartFallbackCount + current.createdAtFallbackCount,
    });
  }

  const counts = result.map((r) => r.acquiredClients);
  const latest = result[0] || null;
  return {
    acquisitionsByMonth: result,
    summary: {
      latestMonthAcquisitions: latest?.acquiredClients ?? 0,
      averageMonthlyAcquisitions: average(counts),
      medianMonthlyAcquisitions: counts.length ? round2(percentile([...counts].sort((a, b) => a - b), 50)) : null,
      latestMonthChangePercent: latest?.previousMonthChangePercent ?? null,
    },
  };
}

function buildPayload(clients, cancellations, financialRows, signatureMap, signatureMeta = {}) {
  const { map: cancelMap, multiples } = buildCancellationMap(cancellations);
  const { map: financialMap, duplicates: financialDuplicates } = buildFinancialMap(financialRows);
  const clientIds = new Set(clients.map((c) => String(c.id)));
  const now = new Date();
  const rows = [];
  let rawActiveCount = 0;
  let activeWithCancelDate = 0;
  const stageCounts = {
    "Distrato assinado": 0,
    "Pedido de cancelamento": 0,
    "Intenção registrada": 0,
  };
  const acquisitionSources = {
    contract_signature: 0,
    cycle_start: 0,
    client_created: 0,
    unavailable: 0,
  };

  for (const client of clients) {
    const dataWarnings = [];
    const contractDate = parseDate(client.data_inicio_ciclo);
    const createdAt = parseDate(client.created_at);
    const stayStartDate = contractDate || createdAt;
    const usedCreatedFallback = !contractDate && Boolean(createdAt);

    const cancelInfo = cancelMap.get(client.id) || null;
    const cancelPrimary = cancelInfo?.date || null;
    const cancelFallback = parseDate(client.data_churn);
    const cancellationDate = cancelPrimary || cancelFallback;
    const cancellationStage = cancelInfo?.stage || null;
    const hasCancellationProcess = Boolean(cancelPrimary) || Boolean(cancelFallback);

    const rawStatus = blankToNull(client.status);
    const normalizedRaw = normalizeClientStatus(rawStatus);
    if (normalizedRaw === "Ativo") rawActiveCount += 1;
    const analyticalStatus = resolveAnalyticalStatus(rawStatus, cancellationDate);
    if (normalizedRaw === "Ativo" && cancellationDate) {
      activeWithCancelDate += 1;
      dataWarnings.push("Status bruto ativo com data consolidada de cancelamento");
    }
    if (cancelInfo?.stage) stageCounts[cancelInfo.stage] = (stageCounts[cancelInfo.stage] || 0) + 1;

    const acquisition = resolveAcquisition(client, signatureMap);
    acquisitionSources[acquisition.source] = (acquisitionSources[acquisition.source] || 0) + 1;

    const financial = financialMap.get(client.id) || null;

    if (!contractDate) dataWarnings.push("Sem data de contratação");
    if (usedCreatedFallback) {
      dataWarnings.push(
        "Permanência calculada com data de criação do cliente por ausência de data de contratação.",
      );
    }
    if (acquisition.source === "client_created") {
      dataWarnings.push("Aquisição calculada com created_at por ausência de datas de contratação.");
    }
    if (acquisition.source === "unavailable") dataWarnings.push("Sem data de aquisição");
    if (!rawStatus) dataWarnings.push("Cliente sem status");
    if (!blankToNull(client.segmentacao)) dataWarnings.push("Cliente sem segmento");
    if (!blankToNull(client.engenheiro_patrimonial)) dataWarnings.push("Cliente sem engenheiro responsável");
    if (!financial) dataWarnings.push("Sem diagnóstico financeiro");
    else {
      if (financial.monthlyIncome == null) dataWarnings.push("Renda mensal ausente");
      if (financial.lastContribution == null) dataWarnings.push("Último aporte ausente");
      if (financial.liquidityReserve == null) dataWarnings.push("Reserva de liquidez ausente");
    }
    if (financialDuplicates.has(client.id)) {
      dataWarnings.push("Múltiplos registros financeiros para o mesmo cliente; usado o mais recente");
    }

    const segmentInfo = calculateClientSegment(
      {
        monthlyIncome: financial?.monthlyIncome ?? null,
        liquidityReserve: financial?.liquidityReserve ?? null,
        lastContribution: financial?.lastContribution ?? null,
        paidPropertiesValue: financial?.paidPropertiesValue ?? null,
      },
      financial?.debt || {},
    );
    if (segmentInfo.segmentWarnings.length) dataWarnings.push(...segmentInfo.segmentWarnings);
    if (multiples.has(client.id)) dataWarnings.push("Múltiplos processos ativos de cancelamento para o mesmo cliente");
    if (cancelInfo?.warnings?.length) dataWarnings.push(...cancelInfo.warnings);

    const stay = resolveStayPeriod({
      stayStartDate,
      analyticalStatus,
      cancellationDate,
      now,
    });
    if (stay.warning) dataWarnings.push(stay.warning);
    // Alerta curto complementar pedido para qualidade / auditoria
    if (stay.stayCalculationStatus === "missing_cancellation_date") {
      dataWarnings.push("Cliente encerrado sem data de cancelamento");
    }

    rows.push({
      clientId: String(client.id),
      clientCode: blankToNull(client.codigo),
      clientName: blankToNull(client.name) || "Não informado",
      contractDate: contractDate ? contractDate.toISOString() : null,
      acquisitionDate: acquisition.date ? acquisition.date.toISOString() : null,
      acquisitionDateSource: acquisition.source,
      cancellationDate: cancellationDate ? cancellationDate.toISOString() : null,
      cancellationStage,
      hasCancellationProcess,
      stayDays: stay.stayDays,
      stayMonths: stay.stayMonths,
      stayRange: stay.stayRange,
      stayCalculationStatus: stay.stayCalculationStatus,
      stayUsedCurrentDate: stay.stayUsedCurrentDate,
      stayUsedCreatedAtFallback: usedCreatedFallback,
      /** status = status analítico (compatível com frontend existente) */
      status: analyticalStatus,
      analyticalStatus,
      rawStatus,
      /** segment = código calculado (null quando dados insuficientes). */
      segment: segmentInfo.segment,
      /** segmentLabel = rótulo de exibição/agrupamento ("Dados insuficientes" quando null). */
      segmentLabel: segmentInfo.segmentLabel,
      segmentStatus: segmentInfo.segmentStatus,
      segmentConfidence: segmentInfo.segmentConfidence,
      segmentReason: segmentInfo.segmentReason,
      segmentReasons: segmentInfo.segmentReasons,
      segmentInputs: segmentInfo.segmentInputs,
      missingFinancialData: segmentInfo.missingFinancialData,
      segmentWarnings: segmentInfo.segmentWarnings,
      /** originalSegment = valor bruto de clients.segmentacao (preservado, não alterado). */
      originalSegment: labelOrUnknown(client.segmentacao),
      engineer: labelOrUnknown(client.engenheiro_patrimonial),
      hasFinancialProfile: Boolean(financial),
      monthlyIncome: financial?.monthlyIncome ?? null,
      lastContribution: financial?.lastContribution ?? null,
      liquidityReserve: financial?.liquidityReserve ?? null,
      paidPropertiesValue: financial?.paidPropertiesValue ?? null,
      hasProperty: financial?.hasProperty ?? null,
      hasCar: financial?.hasCar ?? null,
      hasConsortium: financial?.hasConsortium ?? null,
      hasDebt: segmentInfo.segmentInputs.hasDebt,
      incomeBand: incomeBand(financial?.monthlyIncome ?? null),
      liquidityBand: liquidityBand(financial?.liquidityReserve ?? null),
      dataWarnings: [...new Set(dataWarnings)],
    });
  }

  for (const clientId of cancelMap.keys()) {
    if (!clientIds.has(String(clientId))) {
      // orphan tracked in quality notes
    }
  }

  const liquidityValues = rows.map((r) => r.liquidityReserve).filter((v) => v != null);
  const contributionValues = rows.map((r) => r.lastContribution).filter((v) => v != null);
  const incomeValues = rows.map((r) => r.monthlyIncome).filter((v) => v != null);
  const stayValues = rows
    .map((r) => r.stayDays)
    .filter((v) => v != null && Number.isFinite(v) && v >= 0);
  const stayCalculatedClients = stayValues.length;
  const stayExcludedClients = rows.length - stayCalculatedClients;
  const stayCoveragePercent = rows.length
    ? Math.round((stayCalculatedClients / rows.length) * 1000) / 10
    : 0;
  const closedWithoutCancellationDate = rows.filter(
    (r) => r.analyticalStatus === "Cancelado" && !r.cancellationDate,
  ).length;
  const withFinancial = rows.filter((r) => r.hasFinancialProfile).length;
  const total = rows.length || 1;

  // Métricas de suficiência da segmentação por capacidade financeira.
  const classifiableClients = rows.filter((r) => r.segmentStatus === "classified").length;
  const insufficientDataClients = rows.filter((r) => r.segmentStatus === "insufficient_data").length;
  const withValidIncome = rows.filter((r) => r.segmentInputs && hasValidFinancialValue(r.segmentInputs.monthlyIncome) && r.segmentInputs.monthlyIncome >= 0).length;
  const withDebtInfo = rows.filter((r) => r.segmentInputs && r.segmentInputs.debtDataAvailable).length;
  const withApexCriterion = rows.filter((r) => r.segment === "APEX").length;
  const pctOf = (n) => Math.round((n / total) * 1000) / 10;
  const segmentation = {
    classifiableClients,
    insufficientDataClients,
    incomeFilledPercent: pctOf(withValidIncome),
    debtInfoPercent: pctOf(withDebtInfo),
    apexCriterionPercent: pctOf(withApexCriterion),
  };
  const activeClients = rows.filter((r) => r.analyticalStatus === "Ativo").length;
  const cancelledClients = rows.filter((r) => r.analyticalStatus === "Cancelado").length;
  const frozenClients = rows.filter((r) => r.analyticalStatus === "Congelado").length;

  const liquidityStats = measureBundle("liquidityReserve", liquidityValues);
  const contributionStats = measureBundle("lastContribution", contributionValues);
  const incomeStats = measureBundle("monthlyIncome", incomeValues);
  const stayStats = measureBundle("stayDays", stayValues);

  const acquisitionBundle = buildAcquisitionsByMonth(rows);

  const rawByNormalized = new Map();
  for (const row of rows) {
    const key = row.analyticalStatus;
    if (!rawByNormalized.has(key)) rawByNormalized.set(key, new Set());
    if (row.rawStatus) rawByNormalized.get(key).add(String(row.rawStatus));
  }
  const statusConsistencyNotes = [...rawByNormalized.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([label, set]) => `${set.size} variações de escrita encontradas para o status ${label}.`);
  const distinctRawStatuses = [...new Set(rows.map((r) => r.rawStatus).filter(Boolean))];

  const summary = {
    totalClients: rows.length,
    activeClients,
    cancelledClients,
    frozenClients,
    averageStayDays: stayStats.mean,
    typicalStayDays: stayStats.displayValue,
    stayDaysStats: stayStats,
    stayCalculatedClients,
    stayExcludedClients,
    stayCoveragePercent,
    closedWithoutCancellationDate,
    averageLiquidityReserve: liquidityStats.mean,
    typicalLiquidityReserve: liquidityStats.displayValue,
    liquidityReserveStats: liquidityStats,
    liquidityReserveFilledCount: liquidityValues.length,
    averageLastContribution: contributionStats.mean,
    typicalLastContribution: contributionStats.displayValue,
    lastContributionStats: contributionStats,
    lastContributionFilledCount: contributionValues.length,
    averageMonthlyIncome: incomeStats.mean,
    typicalMonthlyIncome: incomeStats.displayValue,
    monthlyIncomeStats: incomeStats,
    monthlyIncomeFilledCount: incomeValues.length,
    clientsWithFinancialProfile: withFinancial,
    financialProfilePercent: Math.round((withFinancial / total) * 1000) / 10,
    latestMonthAcquisitions: acquisitionBundle.summary.latestMonthAcquisitions,
    averageMonthlyAcquisitions: acquisitionBundle.summary.averageMonthlyAcquisitions,
    medianMonthlyAcquisitions: acquisitionBundle.summary.medianMonthlyAcquisitions,
    latestMonthChangePercent: acquisitionBundle.summary.latestMonthChangePercent,
    segmentation,
  };

  const distributions = {
    status: distributionFrom(rows, (r) => r.analyticalStatus, STATUS_LABELS).filter((item) => item.count > 0),
    segments: distributionFrom(rows, (r) => r.segmentLabel, SEGMENT_LABELS).filter((item) => item.count > 0),
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
    acquisitionsByMonth: acquisitionBundle.acquisitionsByMonth,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    distributions,
    clients: rows,
    quality: {
      usedFields: USED_FIELDS,
      statusConsistency: {
        distinctRawValues: distinctRawStatuses.sort((a, b) => a.localeCompare(b, "pt-BR")),
        distinctRawCount: distinctRawStatuses.length,
        notes: statusConsistencyNotes,
      },
      cancellationAudit: {
        rawActiveCount,
        activeWithConsolidatedCancelDate: activeWithCancelDate,
        removedFromActiveByCancelDate: activeWithCancelDate,
        analyticalActive: activeClients,
        analyticalCancelled: cancelledClients,
        stages: stageCounts,
        rule:
          "coalesce(distrato_assinado_at, data_pedido, intencao_registrada_at); archived_at ignorado; prioriza etapa e data mais recente",
      },
      stayAudit: {
        calculatedClients: stayCalculatedClients,
        excludedClients: stayExcludedClients,
        coveragePercent: stayCoveragePercent,
        closedWithoutCancellationDate,
        rule:
          "Ativo/Congelado → data atual; Cancelado com data → data de cancelamento; Cancelado sem data ou sem início → excluído",
      },
      acquisitionAudit: {
        sources: acquisitionSources,
        signatureFetch: signatureMeta,
        primaryField: "vw_info_cliente.data_assinatura_contrato",
        fallbacks: ["clients.data_inicio_ciclo", "clients.created_at"],
      },
      measureConfig: MEASURE_CONFIG,
      warnings: signatureMeta.skippedDueToViewTimeout || signatureMeta.error
        ? [
            signatureMeta.note ||
              `Falha ao carregar assinaturas de contrato: ${signatureMeta.error || "timeout da view"}`,
          ]
        : [],
    },
  };
}

/**
 * Consolida o payload de dados gerais (config + fetch + regras) sem exigir auth.
 * Fonte única reutilizada pelo handler HTTP e pelo endpoint interno /api/assistant-data.
 */
export async function computeGeneralDataPayload() {
  const configError = configurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }
  const [clients, cancellations, financialRows, signatureResult] = await Promise.all([
    fetchAll("clients", CLIENT_SELECT),
    fetchAll("cancellations", CANCEL_SELECT),
    fetchAll("client_financial_data", FINANCIAL_SELECT),
    fetchSignatureMap(),
  ]);
  return buildPayload(
    clients,
    cancellations,
    financialRows,
    signatureResult.map,
    {
      error: signatureResult.error,
      fetched: signatureResult.fetched,
      withSignature: signatureResult.withSignature,
      skippedDueToViewTimeout: signatureResult.skippedDueToViewTimeout,
      note: signatureResult.note,
    },
  );
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;
  const configError = configurationError();
  if (configError) {
    return Response.json(
      { error: configError },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error(
    "[Data] projeto:",
    String(process.env.DATA_SUPABASE_URL || "").replace(/^https:\/\//, "").split(".")[0],
  );
  try {
    const payload = await computeGeneralDataPayload();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Data] general-data failed:", error instanceof Error ? error.message : error);
    return Response.json(
      {
        error: "Não foi possível consultar a base de dados.",
        code: "data_query_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};

export {
  buildPayload,
  buildCancellationMap,
  resolveAnalyticalStatus,
  normalizeClientStatus,
  resolveStayPeriod,
  robustStats,
  measureBundle,
  buildAcquisitionsByMonth,
};
