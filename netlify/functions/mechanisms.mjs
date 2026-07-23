import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";
import { calculateClientSegment } from "./general-data.mjs";

const CLIENT_SELECT =
  "id,codigo,name,status,engenheiro_patrimonial,data_inicio_ciclo,created_at";
const CANCEL_SELECT =
  "id,client_id,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at";
const CM_SELECT =
  "id,client_id,mecanismo_id,status,implemented_at,created_at,no_plano,sequence,valor_aplicado,source";
const MEC_SELECT = "id,name,categoria,mercado,programa,tipo_renda,motores,status,codigo";
const FINANCIAL_SELECT =
  "id,client_id,reserva_liquidez,ultimo_aporte,ultima_renda_mensal,valor_imoveis_quitados,cheque_especial,parcelamento_cartao,credito_pessoal,credito_consignado,updated_at";

const SEGMENT_ORDER = ["APEX", "PRIVATE", "PRINCIPAL", "DEBTS", "OVER", "Dados insuficientes"];

const USED_FIELDS = [
  { table: "clients", column: "id", role: "clientId" },
  { table: "clients", column: "codigo", role: "clientCode" },
  { table: "clients", column: "name", role: "clientName" },
  { table: "clients", column: "status", role: "clientStatus" },
  { table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { table: "clients", column: "data_inicio_ciclo", role: "entryDate" },
  { table: "clients", column: "created_at", role: "entryFallback" },
  { table: "cancellations", column: "client_id", role: "cancellationJoin" },
  { table: "cancellations", column: "distrato_assinado_at", role: "cancellationDatePriority1" },
  { table: "cancellations", column: "data_pedido", role: "cancellationDatePriority2" },
  { table: "cancellations", column: "intencao_registrada_at", role: "cancellationDatePriority3" },
  { table: "cancellations", column: "archived_at", role: "cancellationSoftDelete" },
  { table: "client_mecanismos", column: "id", role: "recordId" },
  { table: "client_mecanismos", column: "client_id", role: "mechanismClient" },
  { table: "client_mecanismos", column: "mecanismo_id", role: "mechanismId" },
  { table: "client_mecanismos", column: "status", role: "mechanismStatus" },
  { table: "client_mecanismos", column: "implemented_at", role: "implementedAt" },
  { table: "client_mecanismos", column: "created_at", role: "recordCreated" },
  { table: "client_mecanismos", column: "no_plano", role: "inPlan" },
  { table: "client_mecanismos", column: "sequence", role: "sequence" },
  { table: "client_mecanismos", column: "valor_aplicado", role: "appliedValue" },
  { table: "client_mecanismos", column: "source", role: "source" },
  { table: "mecanismos", column: "id", role: "catalogId" },
  { table: "mecanismos", column: "name", role: "mechanismName" },
  { table: "mecanismos", column: "categoria", role: "categorySparse" },
  { table: "mecanismos", column: "mercado", role: "marketDimension" },
  { table: "mecanismos", column: "programa", role: "program" },
  { table: "mecanismos", column: "status", role: "catalogStatus" },
];

const MECH_STATUS_ORDER = ["Apto", "Em andamento", "Implementado", "Não informado"];
const PCT_RANGES = ["0%", "De 1% a 25%", "De 26% a 50%", "De 51% a 75%", "De 76% a 99%", "100%", "Sem recomendações"];
const DAYS_TO_FIRST = [
  "Até 7 dias",
  "De 8 a 15 dias",
  "De 16 a 30 dias",
  "De 31 a 60 dias",
  "De 61 a 90 dias",
  "Mais de 90 dias",
  "Sem implementação",
];
const DAYS_SINCE_LAST = [
  "Até 30 dias",
  "De 31 a 60 dias",
  "De 61 a 90 dias",
  "De 91 a 180 dias",
  "Mais de 180 dias",
  "Nunca implementou",
];

function configurationError() {
  return dataConfigurationError();
}

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

function toNumber(value) {
  const raw = blankToNull(value);
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
  if (
    ["churn", "cancelado", "cancelada", "canceled", "cancelled", "encerrado", "encerrada", "inativo", "inativa", "inactive"].includes(token) ||
    token.includes("cancel") || token.includes("churn") || token.includes("encerr")
  ) return "Cancelado";
  if (
    ["congelado", "congelada", "freeze", "frozen", "pausado", "pausada"].includes(token) ||
    token.includes("congel") || token.includes("pausad")
  ) return "Congelado";
  return "Não informado";
}

/** Normaliza status do mecanismo: apto | iniciado | concluido → labels amigáveis. */
function normalizeMechanismStatus(rawStatus) {
  const token = foldToken(rawStatus);
  if (!token) return { label: "Não informado", recognized: false };
  if (token === "apto" || token === "eligible") return { label: "Apto", recognized: true };
  if (token === "iniciado" || token === "em andamento" || token === "andamento" || token === "started") {
    return { label: "Em andamento", recognized: true };
  }
  if (token === "concluido" || token === "concluida" || token === "implementado" || token === "completed") {
    return { label: "Implementado", recognized: true };
  }
  return { label: "Não informado", recognized: false, raw: String(rawStatus) };
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

function robustStats(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) {
    return { mean: null, median: null, trimmedMean: null, p5: null, p95: null, trimmedExcludedCount: 0, extremeImpact: false, validCount: 0 };
  }
  const mean = average(sorted);
  const median = Math.round(percentile(sorted, 50) * 10) / 10;
  const p5 = Math.round(percentile(sorted, 5) * 10) / 10;
  const p95 = Math.round(percentile(sorted, 95) * 10) / 10;
  let trimmed = sorted;
  let trimmedExcludedCount = 0;
  if (sorted.length >= 20) {
    const low = percentile(sorted, 5);
    const high = percentile(sorted, 95);
    trimmed = sorted.filter((v) => v >= low && v <= high);
    trimmedExcludedCount = sorted.length - trimmed.length;
  }
  const trimmedMean = average(trimmed);
  const extremeImpact =
    median != null && median !== 0 && mean != null && Math.abs(mean - median) / Math.abs(median) >= 0.3;
  return { mean, median, trimmedMean, p5, p95, trimmedExcludedCount, extremeImpact, validCount: sorted.length };
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
    const stage = distrato ? "Distrato assinado" : pedido ? "Pedido de cancelamento" : "Intenção registrada";
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

function resolveAnalyticalStatus(rawStatus, cancellationDate) {
  if (cancellationDate) return "Cancelado";
  return normalizeClientStatus(rawStatus);
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
    : [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "pt-BR"));
  return entries
    .filter(([, count]) => !orderedLabels || count > 0 || orderedLabels.includes(entries[0]?.[0]))
    .map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / total) * 1000) / 10,
    }))
    .filter((item) => !orderedLabels || item.count > 0 || orderedLabels.length <= 8);
}

function distributionOrdered(items, keyFn, orderedLabels) {
  const counts = new Map(orderedLabels.map((label) => [label, 0]));
  for (const item of items) {
    const key = keyFn(item);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    else counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = items.length || 1;
  return orderedLabels.map((label) => ({
    label,
    count: counts.get(label) || 0,
    percent: Math.round(((counts.get(label) || 0) / total) * 1000) / 10,
  }));
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
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

/**
 * Deduplicação final:
 * - chave: client_id + mecanismo_id
 * - preferência: created_at mais recente → implemented_at mais recente → id técnico
 * (client_mecanismos não possui updated_at nesta base)
 */
function dedupeClientMechanisms(rows) {
  const best = new Map();
  let duplicatePairs = 0;
  let missingClientId = 0;
  let missingMechanismId = 0;
  for (const row of rows) {
    const clientId = blankToNull(row.client_id);
    const mechanismId = blankToNull(row.mecanismo_id);
    if (!clientId) missingClientId += 1;
    if (!mechanismId) missingMechanismId += 1;
    if (!clientId || !mechanismId) continue;
    const key = `${clientId}|${mechanismId}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }
    duplicatePairs += 1;
    const aCreated = parseDate(row.created_at)?.getTime() || 0;
    const bCreated = parseDate(current.created_at)?.getTime() || 0;
    if (aCreated > bCreated) {
      best.set(key, row);
      continue;
    }
    if (aCreated < bCreated) continue;
    const aImpl = parseDate(row.implemented_at)?.getTime() || 0;
    const bImpl = parseDate(current.implemented_at)?.getTime() || 0;
    if (aImpl > bImpl) {
      best.set(key, row);
      continue;
    }
    if (aImpl < bImpl) continue;
    if (String(row.id || "") > String(current.id || "")) best.set(key, row);
  }
  return { rows: [...best.values()], duplicatePairs, missingClientId, missingMechanismId };
}

function buildFinancialLookup(financialRows) {
  const map = new Map();
  for (const row of financialRows || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const updated = parseDate(row.updated_at) || new Date(0);
    const current = map.get(String(clientId));
    if (current && current.updated >= updated) continue;
    map.set(String(clientId), {
      updated,
      monthlyIncome: toNumber(row.ultima_renda_mensal),
      lastContribution: toNumber(row.ultimo_aporte),
      liquidityReserve: toNumber(row.reserva_liquidez),
      paidPropertiesValue: toNumber(row.valor_imoveis_quitados),
      debt: {
        cheque_especial: row.cheque_especial,
        parcelamento_cartao: row.parcelamento_cartao,
        credito_pessoal: row.credito_pessoal,
        credito_consignado: row.credito_consignado,
      },
    });
  }
  return map;
}

function pctBand(value, available) {
  if (!available) return "Sem recomendações";
  if (value == null) return "Sem recomendações";
  if (value <= 0) return "0%";
  if (value < 26) return "De 1% a 25%";
  if (value < 51) return "De 26% a 50%";
  if (value < 76) return "De 51% a 75%";
  if (value < 100) return "De 76% a 99%";
  return "100%";
}

function recommendationsPerClientBand(count) {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count === 2) return "2";
  if (count === 3) return "3";
  if (count === 4) return "4";
  return "5 ou mais";
}

function daysToFirstBand(days) {
  if (days == null) return "Sem implementação";
  if (days <= 7) return "Até 7 dias";
  if (days <= 15) return "De 8 a 15 dias";
  if (days <= 30) return "De 16 a 30 dias";
  if (days <= 60) return "De 31 a 60 dias";
  if (days <= 90) return "De 61 a 90 dias";
  return "Mais de 90 dias";
}

function daysSinceLastBand(days, never) {
  if (never) return "Nunca implementou";
  if (days == null) return "Nunca implementou";
  if (days <= 30) return "Até 30 dias";
  if (days <= 60) return "De 31 a 60 dias";
  if (days <= 90) return "De 61 a 90 dias";
  if (days <= 180) return "De 91 a 180 dias";
  return "Mais de 180 dias";
}

function buildPayload(clients, cmRows, mechanisms, cancellations = [], financialRows = []) {
  const cancelMap = buildCancellationDateMap(cancellations);
  const financialMap = buildFinancialLookup(financialRows);
  const now = new Date();
  const currentMonth = currentMonthKey();
  const qualityWarnings = [];
  const qualityNotes = [];
  const mechMap = new Map(mechanisms.map((m) => [String(m.id), m]));
  const clientMap = new Map(clients.map((c) => [String(c.id), c]));

  const categoriaFilled = [...mechMap.values()].filter((m) => blankToNull(m.categoria)).length;
  const mercadoFilled = [...mechMap.values()].filter((m) => blankToNull(m.mercado)).length;
  const useMarketDimension = categoriaFilled < mechMap.size * 0.5 && mercadoFilled > categoriaFilled;
  if (useMarketDimension) {
    qualityWarnings.push(
      `Categoria pouco preenchida (${categoriaFilled}/${mechMap.size}). Gráfico de dimensão usa mercado (${mercadoFilled}/${mechMap.size}).`,
    );
  }

  const { rows: deduped, duplicatePairs, missingClientId, missingMechanismId } = dedupeClientMechanisms(cmRows);
  if (duplicatePairs > 0) {
    qualityWarnings.push(`${duplicatePairs} combinações client_id+mecanismo_id tinham duplicidade; mantido o registro mais recente.`);
  }
  if (missingClientId) qualityWarnings.push(`${missingClientId} registros sem client_id.`);
  if (missingMechanismId) qualityWarnings.push(`${missingMechanismId} registros sem mecanismo_id.`);

  let orphanMechanismIds = 0;
  for (const row of deduped) {
    if (!mechMap.has(String(row.mecanismo_id))) orphanMechanismIds += 1;
  }
  if (orphanMechanismIds) {
    qualityWarnings.push(`${orphanMechanismIds} vínculos com mecanismo_id sem correspondência em public.mecanismos.`);
  }

  const usedCatalogIds = new Set(
    deduped.map((r) => String(r.mecanismo_id)).filter((id) => mechMap.has(id)),
  );
  const unusedCatalogTypes = mechanisms
    .filter((m) => !usedCatalogIds.has(String(m.id)))
    .map((m) => ({
      id: String(m.id),
      name: blankToNull(m.name) || "Não informado",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  if (unusedCatalogTypes.length) {
    qualityNotes.push(
      `${unusedCatalogTypes.length} tipos do catálogo ainda não vinculados a clientes: ${unusedCatalogTypes.map((t) => t.name).join(", ")}.`,
    );
  }

  const byClient = new Map();
  for (const row of deduped) {
    const clientId = String(row.client_id);
    if (!byClient.has(clientId)) byClient.set(clientId, []);
    byClient.get(clientId).push(row);
  }

  const clientRows = [];
  let unknownStatusCount = 0;
  let futureImplCount = 0;
  let concludedWithoutDate = 0;

  for (const [clientId, rows] of byClient.entries()) {
    const warnings = [];
    const client = clientMap.get(clientId);
    if (!client) warnings.push("client_id sem cliente correspondente");

    const contractDate = parseDate(client?.data_inicio_ciclo);
    const createdAt = parseDate(client?.created_at);
    const entryDate = contractDate || createdAt;
    const usedCreatedFallback = !contractDate && Boolean(createdAt);
    if (usedCreatedFallback) {
      warnings.push("Permanência/entrada calculada com created_at por ausência de data_inicio_ciclo.");
    }

    const mechanismsOut = [];
    let eligible = 0;
    let inProgress = 0;
    let implemented = 0;
    const concludedDates = [];

    for (const row of rows) {
      const mech = mechMap.get(String(row.mecanismo_id));
      const statusInfo = normalizeMechanismStatus(row.status);
      if (!statusInfo.recognized) {
        unknownStatusCount += 1;
        warnings.push(`Status não reconhecido: ${row.status || "(vazio)"}`);
      }
      if (!mech) warnings.push(`Mecanismo sem cadastro: ${row.mecanismo_id}`);
      if (!blankToNull(row.mecanismo_id)) warnings.push("mecanismo_id vazio");

      const implementedAt = parseDate(row.implemented_at);
      if (statusInfo.label === "Implementado" && !implementedAt) {
        concludedWithoutDate += 1;
        warnings.push("Concluído sem implemented_at");
      }
      if (statusInfo.label !== "Implementado" && implementedAt) {
        warnings.push("Apto/em andamento com implemented_at preenchido");
      }
      if (implementedAt && implementedAt > now) {
        futureImplCount += 1;
        warnings.push("implemented_at futuro");
      }
      if (statusInfo.label === "Apto") eligible += 1;
      if (statusInfo.label === "Em andamento") inProgress += 1;
      if (statusInfo.label === "Implementado") {
        implemented += 1;
        if (implementedAt && implementedAt <= now) concludedDates.push(implementedAt);
      }

      const dimension = useMarketDimension
        ? (blankToNull(mech?.mercado) || "Não informado")
        : (blankToNull(mech?.categoria) || "Não informado");

      mechanismsOut.push({
        recordId: String(row.id || ""),
        mechanismId: String(row.mecanismo_id || ""),
        name: blankToNull(mech?.name) || "Mecanismo sem nome",
        category: blankToNull(mech?.categoria),
        market: blankToNull(mech?.mercado),
        dimension,
        program: blankToNull(mech?.programa),
        status: statusInfo.label,
        rawStatus: blankToNull(row.status),
        implementedAt: implementedAt ? implementedAt.toISOString() : null,
        createdAt: parseDate(row.created_at)?.toISOString() || null,
        appliedValue: toNumber(row.valor_aplicado),
        source: blankToNull(row.source),
        inPlan: row.no_plano === true,
        sequence: toNumber(row.sequence),
      });
    }

    const available = mechanismsOut.length;
    let implementationPercent = available > 0
      ? Math.round((implemented / available) * 1000) / 10
      : null;
    if (implementationPercent != null && implementationPercent > 100) {
      warnings.push("Percentual implementado acima de 100%");
      qualityWarnings.push(`Cliente ${clientId}: percentual > 100%`);
      implementationPercent = 100;
    }
    if (implemented > available) warnings.push("Mais implementados do que disponíveis");

    const statusRank = { "Em andamento": 0, Apto: 1, Implementado: 2, "Não informado": 3 };
    mechanismsOut.sort((a, b) => {
      const ra = statusRank[a.status] ?? 9;
      const rb = statusRank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      if (a.status === "Implementado") {
        return String(b.implementedAt || "").localeCompare(String(a.implementedAt || ""));
      }
      return String(a.name).localeCompare(String(b.name), "pt-BR");
    });

    const concludedSorted = [...concludedDates].sort((a, b) => a - b);
    const firstDate = concludedSorted[0] || null;
    const lastDate = concludedSorted[concludedSorted.length - 1] || null;

    let firstMechanism = null;
    if (firstDate) {
      const firstCandidates = mechanismsOut
        .filter((m) => m.status === "Implementado" && m.implementedAt)
        .map((m) => ({ ...m, _d: parseDate(m.implementedAt) }))
        .filter((m) => m._d)
        .sort((a, b) => a._d - b._d || a.name.localeCompare(b.name, "pt-BR"));
      firstMechanism = firstCandidates[0] || null;
    }

    let daysToFirst = null;
    if (firstDate && entryDate) {
      const days = daysBetween(entryDate, firstDate);
      if (days < 0) warnings.push("Primeira implementação anterior à entrada do cliente");
      else daysToFirst = days;
    }

    let daysSinceLast = null;
    if (lastDate) {
      const days = daysBetween(lastDate, now);
      if (days >= 0) daysSinceLast = days;
    }

    const recentCutoff = new Date(now.getTime() - 30 * 86400000);
    const recentImpls = mechanismsOut.filter((m) => {
      if (m.status !== "Implementado" || !m.implementedAt) return false;
      const d = parseDate(m.implementedAt);
      return d && d >= recentCutoff && d <= now;
    }).length;

    const cancelInfo = cancelMap.get(clientId) || null;
    const analyticalStatus = resolveAnalyticalStatus(client?.status, cancelInfo?.date || null);
    const fin = financialMap.get(clientId) || null;
    const segmentInfo = calculateClientSegment(
      fin
        ? {
          monthlyIncome: fin.monthlyIncome,
          liquidityReserve: fin.liquidityReserve,
          lastContribution: fin.lastContribution,
          paidPropertiesValue: fin.paidPropertiesValue,
        }
        : null,
      fin?.debt || null,
    );

    clientRows.push({
      clientId,
      clientCode: blankToNull(client?.codigo),
      clientName: blankToNull(client?.name) || "Não informado",
      clientStatus: analyticalStatus,
      analyticalStatus,
      rawClientStatus: blankToNull(client?.status),
      cancellationDate: cancelInfo?.date ? cancelInfo.date.toISOString() : null,
      cancellationStage: cancelInfo?.stage || null,
      engineer: blankToNull(client?.engenheiro_patrimonial) || "Não informado",
      segment: segmentInfo.segment || "Dados insuficientes",
      entryDate: entryDate ? entryDate.toISOString() : null,
      stayUsedCreatedAtFallback: usedCreatedFallback,
      available,
      eligible,
      inProgress,
      implemented,
      implementationPercent,
      firstMechanismId: firstMechanism?.mechanismId || null,
      firstMechanismName: firstMechanism?.name || null,
      firstImplementationDate: firstDate ? firstDate.toISOString() : null,
      daysToFirstImplementation: daysToFirst,
      lastImplementationDate: lastDate ? lastDate.toISOString() : null,
      daysSinceLastImplementation: daysSinceLast,
      hasImplementationLast30Days: recentImpls > 0,
      recentImplementationsCount: recentImpls,
      percentRange: pctBand(implementationPercent, available),
      daysToFirstRange: daysToFirstBand(daysToFirst),
      daysSinceLastRange: daysSinceLastBand(daysSinceLast, !lastDate),
      mechanismsCountBand: recommendationsPerClientBand(available),
      mechanisms: mechanismsOut,
      dataWarnings: warnings,
    });
  }

  if (unknownStatusCount) qualityWarnings.push(`${unknownStatusCount} registros com status de mecanismo não reconhecido.`);
  if (futureImplCount) qualityWarnings.push(`${futureImplCount} implementações com data futura.`);
  if (concludedWithoutDate) qualityWarnings.push(`${concludedWithoutDate} mecanismos concluídos sem implemented_at.`);

  const totalAvailable = clientRows.reduce((a, c) => a + c.available, 0);
  const totalImplemented = clientRows.reduce((a, c) => a + c.implemented, 0);
  const totalInProgress = clientRows.reduce((a, c) => a + c.inProgress, 0);
  const totalEligible = clientRows.reduce((a, c) => a + c.eligible, 0);
  const totalUnrecognized = clientRows.reduce(
    (a, c) => a + (c.mechanisms || []).filter((m) => m.status === "Não informado").length,
    0,
  );
  const implementationPercent = totalAvailable > 0
    ? Math.min(100, Math.round((totalImplemented / totalAvailable) * 1000) / 10)
    : null;

  // Carteira completa (já carregada) — denominador de cobertura; não altera KPIs de recomendações.
  const portfolioByStatus = { Ativo: 0, Cancelado: 0, Congelado: 0, "Não informado": 0 };
  for (const client of clients) {
    const cancelInfo = cancelMap.get(String(client.id)) || null;
    const st = resolveAnalyticalStatus(client?.status, cancelInfo?.date || null);
    portfolioByStatus[st] = (portfolioByStatus[st] || 0) + 1;
  }
  const portfolioClients = clients.length;
  const clientsWithoutMechanisms = Math.max(0, portfolioClients - clientRows.length);
  const mechanismCoveragePercent = portfolioClients
    ? Math.round((clientRows.length / portfolioClients) * 1000) / 10
    : null;
  const avgRecs = clientRows.length
    ? Math.round((totalAvailable / clientRows.length) * 100) / 100
    : null;
  const medianRecs = robustStats(clientRows.map((c) => c.available)).median;
  const clientsWithNoImplementation = clientRows.filter((c) => c.implemented === 0).length;
  const partitionSum = totalImplemented + totalInProgress + totalEligible + totalUnrecognized;
  const partitionComplete = partitionSum === totalAvailable;

  const withFirst = clientRows.filter((c) => c.daysToFirstImplementation != null);
  const withLast = clientRows.filter((c) => c.daysSinceLastImplementation != null);
  const withRecent = clientRows.filter((c) => c.hasImplementationLast30Days);
  const firstMechCounts = new Map();
  for (const c of clientRows) {
    if (!c.firstMechanismName) continue;
    firstMechCounts.set(c.firstMechanismName, (firstMechCounts.get(c.firstMechanismName) || 0) + 1);
  }
  const topFirst = [...firstMechCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const clientsWithImpl = clientRows.filter((c) => c.implemented > 0).length;

  const monthMap = new Map();
  for (const c of clientRows) {
    for (const m of c.mechanisms) {
      if (m.status !== "Implementado" || !m.implementedAt) continue;
      const d = parseDate(m.implementedAt);
      if (!d || d > now) continue;
      const key = monthKey(d);
      if (key > currentMonth) continue;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }
  }
  const monthKeys = [...monthMap.keys()].sort((a, b) => b.localeCompare(a));
  const historicalMonths = Math.max(1, monthKeys.length);
  const avgPerMonth = Math.round((totalImplemented / historicalMonths) * 100) / 100;

  const recentImplRecords = clientRows.reduce((a, c) => a + c.recentImplementationsCount, 0);

  const statusDist = distributionOrdered(
    clientRows.flatMap((c) => c.mechanisms),
    (m) => m.status,
    MECH_STATUS_ORDER,
  ).filter((i) => i.count > 0 || MECH_STATUS_ORDER.includes(i.label));

  const categoryMap = new Map();
  for (const c of clientRows) {
    for (const m of c.mechanisms) {
      if (m.status !== "Implementado") continue;
      const label = useMarketDimension ? (m.market || "Não informado") : (m.category || "Não informado");
      categoryMap.set(label, (categoryMap.get(label) || 0) + 1);
    }
  }
  const categoryTotal = [...categoryMap.values()].reduce((a, b) => a + b, 0) || 1;
  const categories = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / categoryTotal) * 1000) / 10,
    }));

  const topMechMap = new Map();
  for (const c of clientRows) {
    for (const m of c.mechanisms) {
      if (m.status !== "Implementado") continue;
      const key = m.mechanismId || m.name;
      const cur = topMechMap.get(key) || { mechanismId: m.mechanismId, name: m.name, count: 0 };
      cur.count += 1;
      topMechMap.set(key, cur);
    }
  }
  const topMechanisms = [...topMechMap.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
    .map((item) => ({
      ...item,
      percent: clientsWithImpl
        ? Math.round((item.count / clientsWithImpl) * 1000) / 10
        : 0,
      unit: "clients",
    }));

  // Clientes únicos por mecanismo (qualquer status) — recomendações do catálogo aplicadas
  const topRecommendedMap = new Map();
  for (const c of clientRows) {
    for (const m of c.mechanisms) {
      const key = m.mechanismId || m.name;
      const cur = topRecommendedMap.get(key) || { mechanismId: m.mechanismId, name: m.name, clients: 0 };
      cur.clients += 1;
      topRecommendedMap.set(key, cur);
    }
  }
  const topRecommended = [...topRecommendedMap.values()]
    .sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name, "pt-BR"))
    .map((item) => ({
      ...item,
      count: item.clients,
      percent: clientRows.length ? Math.round((item.clients / clientRows.length) * 1000) / 10 : 0,
      unit: "clients",
    }));

  const recCountOrder = ["1", "2", "3", "4", "5 ou mais"];
  const recommendationsPerClient = distributionOrdered(
    clientRows,
    (c) => recommendationsPerClientBand(c.available),
    recCountOrder,
  );

  // Estatísticas por tipo do catálogo (clientes únicos vinculados / implementados)
  const typeStatsMap = new Map();
  for (const m of mechanisms) {
    typeStatsMap.set(String(m.id), {
      mechanismId: String(m.id),
      name: blankToNull(m.name) || "Não informado",
      clientsLinked: 0,
      implemented: 0,
      used: usedCatalogIds.has(String(m.id)),
    });
  }
  for (const c of clientRows) {
    const seen = new Set();
    const seenImpl = new Set();
    for (const m of c.mechanisms || []) {
      if (!m.mechanismId || !typeStatsMap.has(m.mechanismId)) continue;
      if (!seen.has(m.mechanismId)) {
        seen.add(m.mechanismId);
        typeStatsMap.get(m.mechanismId).clientsLinked += 1;
      }
      if (m.status === "Implementado" && !seenImpl.has(m.mechanismId)) {
        seenImpl.add(m.mechanismId);
        typeStatsMap.get(m.mechanismId).implemented += 1;
      }
    }
  }
  const typeStats = [...typeStatsMap.values()]
    .map((item) => ({
      ...item,
      implementationPercent: item.clientsLinked
        ? Math.round((item.implemented / item.clientsLinked) * 1000) / 10
        : null,
    }))
    .sort((a, b) => b.clientsLinked - a.clientsLinked || a.name.localeCompare(b.name, "pt-BR"));

  // Análise por EP
  const epMap = new Map();
  for (const c of clientRows) {
    const key = c.engineer || "Não informado";
    const cur = epMap.get(key) || {
      engineer: key,
      clients: 0,
      links: 0,
      implemented: 0,
      firstDays: [],
    };
    cur.clients += 1;
    cur.links += c.available;
    cur.implemented += c.implemented;
    if (c.daysToFirstImplementation != null && c.daysToFirstImplementation >= 0) {
      cur.firstDays.push(c.daysToFirstImplementation);
    }
    epMap.set(key, cur);
  }
  const byEngineer = [...epMap.values()]
    .map((row) => ({
      engineer: row.engineer,
      clients: row.clients,
      links: row.links,
      implemented: row.implemented,
      implementationPercent: row.links
        ? Math.round((row.implemented / row.links) * 1000) / 10
        : null,
      typicalDaysToFirstImplementation: robustStats(row.firstDays).median,
      sampleSmall: row.clients < 5,
    }))
    .sort((a, b) => b.links - a.links || a.engineer.localeCompare(b.engineer, "pt-BR"));

  // Análise por segmento
  const segMap = new Map(SEGMENT_ORDER.map((s) => [s, {
    segment: s,
    clients: 0,
    links: 0,
    implemented: 0,
  }]));
  for (const c of clientRows) {
    const seg = SEGMENT_ORDER.includes(c.segment) ? c.segment : "Dados insuficientes";
    const cur = segMap.get(seg);
    cur.clients += 1;
    cur.links += c.available;
    cur.implemented += c.implemented;
  }
  const bySegment = SEGMENT_ORDER.map((seg) => {
    const row = segMap.get(seg);
    return {
      ...row,
      implementationPercent: row.links
        ? Math.round((row.implemented / row.links) * 1000) / 10
        : null,
    };
  });

  const typesUsed = usedCatalogIds.size;
  const catalogTotal = mechanisms.length;
  const catalogCoveragePercent = catalogTotal
    ? Math.round((typesUsed / catalogTotal) * 1000) / 10
    : null;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      clientsWithMechanisms: clientRows.length,
      availableMechanisms: totalAvailable,
      clientMechanismLinks: totalAvailable,
      implementedMechanisms: totalImplemented,
      inProgressMechanisms: totalInProgress,
      eligibleMechanisms: totalEligible,
      unrecognizedRecommendations: totalUnrecognized,
      implementationPercent,
      averageDaysToFirstImplementation: average(withFirst.map((c) => c.daysToFirstImplementation)),
      typicalDaysToFirstImplementation: robustStats(withFirst.map((c) => c.daysToFirstImplementation)).median,
      daysToFirstStats: robustStats(withFirst.map((c) => c.daysToFirstImplementation)),
      averageDaysSinceLastImplementation: average(withLast.map((c) => c.daysSinceLastImplementation)),
      typicalDaysSinceLastImplementation: robustStats(withLast.map((c) => c.daysSinceLastImplementation)).median,
      daysSinceLastStats: robustStats(withLast.map((c) => c.daysSinceLastImplementation)),
      clientsWithRecentImplementation: withRecent.length,
      recentImplementationPercent: clientRows.length
        ? Math.round((withRecent.length / clientRows.length) * 1000) / 10
        : null,
      recentImplementationsCount: recentImplRecords,
      averageImplementationsPerMonth: avgPerMonth,
      distinctMechanismTypes: typesUsed,
      typesUsed,
      catalogMechanisms: catalogTotal,
      typesUnused: unusedCatalogTypes.length,
      catalogCoveragePercent,
      unusedCatalogTypes,
      portfolioClients,
      portfolioByStatus,
      clientsWithoutMechanisms,
      mechanismCoveragePercent,
      averageRecommendationsPerClient: avgRecs,
      medianRecommendationsPerClient: medianRecs,
      clientsWithNoImplementation,
      recommendationsPartition: {
        implemented: totalImplemented,
        inProgress: totalInProgress,
        eligible: totalEligible,
        unrecognized: totalUnrecognized,
        total: totalAvailable,
        sum: partitionSum,
        complete: partitionComplete,
      },
      topFirstMechanism: topFirst
        ? {
          name: topFirst[0],
          clients: topFirst[1],
          percent: clientsWithImpl ? Math.round((topFirst[1] / clientsWithImpl) * 1000) / 10 : null,
        }
        : null,
      latestImplementationDate: (() => {
        const dates = clientRows.map((c) => c.lastImplementationDate).filter(Boolean).sort();
        return dates.length ? dates[dates.length - 1] : null;
      })(),
      dimensionUsed: useMarketDimension ? "mercado" : "categoria",
      dimensionLabel: useMarketDimension ? "mercado" : "categoria",
      units: {
        clientsWithMechanisms: "clientes únicos",
        typesUsed: "tipos do catálogo",
        catalogMechanisms: "tipos do catálogo",
        availableMechanisms: "vínculos cliente × mecanismo",
        clientMechanismLinks: "vínculos cliente × mecanismo",
        implementedMechanisms: "vínculos",
        inProgressMechanisms: "vínculos",
        eligibleMechanisms: "vínculos",
        portfolioClients: "clientes únicos",
      },
    },
    distributions: {
      status: statusDist.filter((i) => i.count > 0),
      implementationsByMonth: monthKeys.map((month) => ({
        month,
        count: monthMap.get(month) || 0,
        label: month,
      })),
      implementationPercentRanges: distributionOrdered(clientRows, (c) => c.percentRange, PCT_RANGES),
      daysToFirstRanges: distributionOrdered(clientRows, (c) => c.daysToFirstRange, DAYS_TO_FIRST),
      daysSinceLastRanges: distributionOrdered(clientRows, (c) => c.daysSinceLastRange, DAYS_SINCE_LAST),
      recommendationsPerClient,
      categories,
      topMechanisms,
      topRecommended,
      typeStats,
      byEngineer,
      bySegment,
      engineers: distributionFrom(clientRows, (c) => c.engineer),
    },
    catalog: {
      mechanisms: mechanisms.map((m) => ({
        id: String(m.id),
        name: blankToNull(m.name) || "Não informado",
        category: blankToNull(m.categoria),
        market: blankToNull(m.mercado),
        program: blankToNull(m.programa),
        status: blankToNull(m.status),
        code: blankToNull(m.codigo),
        used: usedCatalogIds.has(String(m.id)),
      })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      unusedTypes: unusedCatalogTypes,
    },
    clients: clientRows.sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR")),
    quality: {
      usedFields: USED_FIELDS,
      warnings: qualityWarnings,
      notes: qualityNotes,
      dedupeRule: "client_id+mecanismo_id; preferência created_at desc → implemented_at desc → id (sem updated_at na tabela)",
      meta: {
        categoriaFilled,
        mercadoFilled,
        dimensionUsed: useMarketDimension ? "mercado" : "categoria",
        unitGlossary: {
          clienteUnico: "count(distinct client_id)",
          tipoCatalogo: "count(distinct id) em public.mecanismos",
          tipoUtilizado: "count(distinct mecanismo_id) em client_mecanismos com correspondência no catálogo",
          vinculo: "count(distinct client_id, mecanismo_id) em public.client_mecanismos após deduplicação",
        },
      },
    },
  };
}

/** Fonte única (config + fetch + regras) reutilizada pelo handler e por /api/assistant-data. */
export async function computeMechanismsPayload() {
  const configError = configurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }
  const [clients, cmRows, mechanisms, cancellations, financialRows] = await Promise.all([
    fetchAll("clients", CLIENT_SELECT),
    fetchAll("client_mecanismos", CM_SELECT, "client_id.asc"),
    fetchAll("mecanismos", MEC_SELECT),
    fetchAll("cancellations", CANCEL_SELECT),
    fetchAll("client_financial_data", FINANCIAL_SELECT),
  ]);
  return buildPayload(clients, cmRows, mechanisms, cancellations, financialRows);
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;
  const configError = configurationError();
  if (configError) {
    return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return Response.json(await computeMechanismsPayload(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consolidar mecanismos" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
