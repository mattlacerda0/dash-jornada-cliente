/**
 * Registry executável: cada métrica aponta para o payload real do dashboard.
 * O assistente NÃO recalcula — só lê o path.
 */
import { computeMechanismsPayload } from "../mechanisms.mjs";
import { computeOnboardingPayload } from "../onboarding.mjs";
import { computeMeetingsPayload } from "../meetings.mjs";
import { computeGeneralDataPayload } from "../general-data.mjs";
import { computeSupportPayload } from "../support.mjs";

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Domínios com compute*Payload compartilhado com a página. */
export const portalDomainExecutors = {
  mechanisms: {
    id: "mechanisms",
    label: "Implementação de Mecanismos",
    compute: computeMechanismsPayload,
  },
  journey: {
    id: "journey",
    label: "Jornada / Onboarding",
    compute: computeOnboardingPayload,
  },
  meetings: {
    id: "meetings",
    label: "Reuniões",
    compute: computeMeetingsPayload,
  },
  general: {
    id: "general",
    label: "Dados Gerais",
    compute: computeGeneralDataPayload,
  },
  support: {
    id: "support",
    label: "Atendimento",
    compute: computeSupportPayload,
  },
};

/**
 * Catálogo executável — paths auditados nos compute*Payload.
 * Mecanismos: validado contra summary da página.
 */
export const portalMetricRegistry = {
  /* ---------- DADOS GERAIS (paths auditados em computeGeneralDataPayload) ---------- */
  total_clients: {
    domain: "general",
    label: "Total de clientes",
    payloadPath: "summary.totalClients",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Contagem de clientes distintos na carteira do dashboard Dados Gerais.",
  },
  active_clients: {
    domain: "general",
    label: "Clientes ativos",
    payloadPath: "summary.activeClients",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com status analítico Ativo após consolidação com cancelamentos.",
  },
  cancelled_clients: {
    domain: "general",
    label: "Clientes cancelados",
    payloadPath: "summary.cancelledClients",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com status analítico Cancelado.",
  },
  frozen_clients: {
    domain: "general",
    label: "Clientes congelados",
    payloadPath: "summary.frozenClients",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com status analítico Congelado.",
  },
  median_stay_days: {
    domain: "general",
    label: "Permanência típica",
    payloadPath: "summary.typicalStayDays",
    averagePath: "summary.averageStayDays",
    sampleSizePath: "summary.stayCalculatedClients",
    unit: "days",
    aggregation: "median",
    definition: "Mediana dos dias de permanência calculáveis. A média está em averageStayDays.",
  },
  median_liquidity_reserve: {
    domain: "general",
    label: "Reserva de liquidez típica",
    payloadPath: "summary.typicalLiquidityReserve",
    averagePath: "summary.averageLiquidityReserve",
    sampleSizePath: "summary.liquidityReserveFilledCount",
    unit: "currency",
    aggregation: "median",
    definition: "Mediana da reserva de liquidez válida dos clientes considerados.",
  },
  median_last_contribution: {
    domain: "general",
    label: "Último aporte típico",
    payloadPath: "summary.typicalLastContribution",
    averagePath: "summary.averageLastContribution",
    sampleSizePath: "summary.lastContributionFilledCount",
    unit: "currency",
    aggregation: "median",
    definition: "Mediana do último aporte válido dos clientes considerados.",
  },
  median_monthly_income: {
    domain: "general",
    label: "Renda mensal típica",
    payloadPath: "summary.typicalMonthlyIncome",
    averagePath: "summary.averageMonthlyIncome",
    sampleSizePath: "summary.monthlyIncomeFilledCount",
    unit: "currency",
    aggregation: "median",
    definition:
      "Mediana da última renda mensal válida dos clientes considerados. A mediana é usada para reduzir o efeito de valores extremos.",
  },
  clients_with_financial_data: {
    domain: "general",
    label: "Clientes com diagnóstico financeiro",
    payloadPath: "summary.clientsWithFinancialProfile",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes distintos que possuem registro em public.client_financial_data.",
  },
  apex_clients: {
    domain: "general",
    label: "Clientes APEX",
    distributionLookup: { path: "distributions.segments", label: "APEX" },
    unit: "clients",
    aggregation: "count",
    definition: "Clientes classificados no segmento APEX.",
  },
  private_clients: {
    domain: "general",
    label: "Clientes PRIVATE",
    distributionLookup: { path: "distributions.segments", label: "PRIVATE" },
    unit: "clients",
    aggregation: "count",
    definition: "Clientes classificados no segmento PRIVATE.",
  },
  principal_clients: {
    domain: "general",
    label: "Clientes PRINCIPAL",
    distributionLookup: { path: "distributions.segments", label: "PRINCIPAL" },
    unit: "clients",
    aggregation: "count",
    definition: "Clientes classificados no segmento PRINCIPAL.",
  },
  debts_clients: {
    domain: "general",
    label: "Clientes DEBTS",
    distributionLookup: { path: "distributions.segments", label: "DEBTS" },
    unit: "clients",
    aggregation: "count",
    definition: "Clientes classificados no segmento DEBTS.",
  },
  over_clients: {
    domain: "general",
    label: "Clientes OVER",
    distributionLookup: { path: "distributions.segments", label: "OVER" },
    unit: "clients",
    aggregation: "count",
    definition: "Clientes classificados no segmento OVER.",
  },
  insufficient_segment_data: {
    domain: "general",
    label: "Dados insuficientes (segmento)",
    distributionLookup: { path: "distributions.segments", label: "Dados insuficientes" },
    unit: "clients",
    aggregation: "count",
    definition: "Clientes sem renda nem critério suficiente para segmentar.",
  },

  /* ---------- MECHANISMS (fonte de verdade da página) ---------- */
  clients_with_mechanisms: {
    domain: "mechanisms",
    label: "Clientes com mecanismos",
    payloadPath: "summary.clientsWithMechanisms",
    sampleSizePath: "summary.clientsWithMechanisms",
    unit: "clients",
    aggregation: "count",
    definition:
      "Clientes distintos com pelo menos um mecanismo vinculado após deduplicação client_id+mecanismo_id.",
    aliases: ["clientes com mecanismos", "quantos clientes tem mecanismos", "quantos clientes têm mecanismos"],
  },
  types_used: {
    domain: "mechanisms",
    label: "Tipos utilizados",
    payloadPath: "summary.typesUsed",
    sampleSizePath: "summary.catalogMechanisms",
    unit: "mechanisms",
    aggregation: "count",
    definition:
      "Tipos do catálogo (public.mecanismos) que já aparecem em pelo menos um vínculo em client_mecanismos.",
    aliases: ["tipos utilizados", "tipos de mecanismos estão sendo usados", "tipos vinculados"],
  },
  catalog_mechanisms: {
    domain: "mechanisms",
    label: "Tipos no catálogo",
    payloadPath: "summary.catalogMechanisms",
    sampleSizePath: "summary.catalogMechanisms",
    unit: "mechanisms",
    aggregation: "count",
    definition: "Quantidade de mecanismos cadastrados em public.mecanismos.",
    aliases: ["tipos no catalogo", "tipos no catálogo", "quantos tipos existem no catalogo"],
  },
  types_unused: {
    domain: "mechanisms",
    label: "Tipos sem utilização",
    payloadPath: "summary.typesUnused",
    sampleSizePath: "summary.catalogMechanisms",
    unit: "mechanisms",
    aggregation: "count",
    definition: "Tipos do catálogo ainda não vinculados a nenhum cliente. Não é erro técnico.",
    aliases: ["tipos sem utilizacao", "tipos sem utilização", "tipos nao utilizados"],
  },
  available_mechanisms: {
    domain: "mechanisms",
    label: "Vínculos cliente + mecanismo",
    payloadPath: "summary.availableMechanisms",
    sampleSizePath: "summary.clientsWithMechanisms",
    unit: "mechanisms",
    aggregation: "sum",
    definition:
      "Combinações únicas cliente+mecanismo após deduplicação. Denominador do percentual implementado.",
    aliases: [
      "vinculos cliente mecanismo",
      "vínculos cliente + mecanismo",
      "mecanismos previstos",
      "recomendacoes de mecanismos",
    ],
  },
  implemented_mechanisms: {
    domain: "mechanisms",
    label: "Mecanismos implementados",
    payloadPath: "summary.implementedMechanisms",
    sampleSizePath: "summary.availableMechanisms",
    unit: "mechanisms",
    aggregation: "sum",
    definition: "Vínculos com status normalizado Implementado (concluído).",
    aliases: ["mecanismos implementados", "quantos foram implementados", "implementados"],
  },
  in_progress_mechanisms: {
    domain: "mechanisms",
    label: "Em andamento",
    payloadPath: "summary.inProgressMechanisms",
    sampleSizePath: "summary.availableMechanisms",
    unit: "mechanisms",
    aggregation: "sum",
    definition: "Vínculos com status Iniciado / Em andamento.",
    aliases: ["em andamento", "mecanismos em andamento", "iniciados"],
  },
  eligible_mechanisms: {
    domain: "mechanisms",
    label: "Aptos para iniciar",
    payloadPath: "summary.eligibleMechanisms",
    sampleSizePath: "summary.availableMechanisms",
    unit: "mechanisms",
    aggregation: "sum",
    definition: "Vínculos com status Apto.",
    aliases: ["aptos para iniciar", "aptos", "mecanismos aptos"],
  },
  implementation_rate: {
    domain: "mechanisms",
    label: "Percentual implementado",
    payloadPath: "summary.implementationPercent",
    sampleSizePath: "summary.availableMechanisms",
    unit: "percent",
    aggregation: "rate",
    definition:
      "implementedMechanisms / availableMechanisms × 100. Denominador = vínculos, nunca tipos (15/19).",
    aliases: ["percentual implementado", "taxa de implementacao", "qual o percentual implementado"],
  },
  median_days_to_first_implementation: {
    domain: "mechanisms",
    label: "Tempo típico até a primeira implementação",
    payloadPath: "summary.typicalDaysToFirstImplementation",
    averagePath: "summary.averageDaysToFirstImplementation",
    sampleSizePath: "summary.daysToFirstStats.validCount",
    unit: "days",
    aggregation: "median",
    definition:
      "Mediana dos dias entre a contratação (data_inicio_ciclo ou created_at) e a primeira implementação concluída do cliente. Intervalos negativos e datas inválidas são excluídos. A mediana é o valor típico da página Mecanismos.",
    inclusionRules: ["cliente com daysToFirstImplementation calculável (≥ 0)"],
    exclusionRules: ["sem implementação", "intervalo negativo", "datas ausentes"],
    aliases: [
      "tempo tipico ate a primeira implementacao",
      "mediana ate a primeira implementacao",
      "mediana ate o primeiro mecanismo",
      "tempo tipico ate o primeiro mecanismo",
      "dias tipicos ate a primeira implementacao",
    ],
  },
  average_days_to_first_implementation: {
    domain: "mechanisms",
    label: "Média de dias até a primeira implementação",
    payloadPath: "summary.averageDaysToFirstImplementation",
    medianPath: "summary.typicalDaysToFirstImplementation",
    sampleSizePath: "summary.daysToFirstStats.validCount",
    unit: "days",
    aggregation: "average",
    definition:
      "Média aritmética dos dias até a primeira implementação (mesma amostra da mediana na página Mecanismos).",
    aliases: [
      "media ate a primeira implementacao",
      "media de dias ate a primeira implementacao",
      "media ate o primeiro mecanismo",
      "qual e a media ate a primeira implementacao",
    ],
  },
  clients_with_recent_implementation: {
    domain: "mechanisms",
    label: "Clientes com implementação recente",
    payloadPath: "summary.clientsWithRecentImplementation",
    sampleSizePath: "summary.clientsWithMechanisms",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes únicos com pelo menos uma conclusão nos últimos 30 dias.",
    aliases: ["implementacao recente", "clientes com implementacao recente"],
  },
  clients_with_exactly_one_implemented_mechanism: {
    domain: "mechanisms",
    label: "Clientes com exatamente 1 mecanismo implementado",
    payloadPath: null,
    countFromClients: (c) => Number(c.implemented) === 1,
    unit: "clients",
    aggregation: "count",
    definition: "Contagem sobre clients[] do payload de Mecanismos: implemented === 1.",
    aliases: ["possuem exatamente um mecanismo implementado"],
  },
  clients_with_exactly_one_available_mechanism: {
    domain: "mechanisms",
    label: "Clientes com exatamente 1 mecanismo disponível",
    payloadPath: null,
    countFromClients: (c) => Number(c.available) === 1,
    unit: "clients",
    aggregation: "count",
    definition: "Contagem sobre clients[] do payload de Mecanismos: available === 1.",
  },
  clients_with_exactly_one_in_progress_mechanism: {
    domain: "mechanisms",
    label: "Clientes com exatamente 1 mecanismo em andamento",
    payloadPath: null,
    countFromClients: (c) => Number(c.inProgress) === 1,
    unit: "clients",
    aggregation: "count",
    definition: "Contagem sobre clients[] do payload de Mecanismos: inProgress === 1.",
  },

  /* ---------- JOURNEY (página Jornada — distinto de Mecanismos) ---------- */
  average_days_to_first_mechanism: {
    domain: "journey",
    label: "Média de dias até o primeiro mecanismo (Jornada)",
    payloadPath: "summary.averageFirstImplementationDays",
    sampleSizePath: null,
    unit: "days",
    aggregation: "average",
    definition:
      "Média da página Jornada/onboarding (averageFirstImplementationDays). Diferente do tempo típico da página Mecanismos.",
    aliases: [
      "media ate o primeiro mecanismo na jornada",
      "media de onboarding ate o primeiro mecanismo",
    ],
  },
  completed_onboarding_clients: {
    domain: "journey",
    label: "Clientes que concluíram onboarding",
    payloadPath: "summary.completedOnboarding",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes cujo estágio atual não está entre os estágios abertos de onboarding.",
    aliases: ["concluiram onboarding", "onboarding concluido"],
  },
};

export function getRegistryMetric(metricId) {
  return portalMetricRegistry[metricId] || null;
}

export function listRegistryMetrics() {
  return Object.entries(portalMetricRegistry).map(([id, m]) => ({ id, ...m }));
}

/**
 * resolveMetricFromDashboard(domain, metricId, filters)
 * Chama a mesma compute*Payload da página e lê o path — sem recalcular.
 */
export async function resolveMetricFromDashboard(domain, metricId, filters = {}, options = {}) {
  const entry = getRegistryMetric(metricId);
  if (!entry) {
    return {
      success: false,
      error: "metric_unmapped",
      answerHint:
        "Ainda não tenho esse indicador mapeado com segurança. Pode especificar qual card ou página você está consultando?",
    };
  }

  const domainId = domain || entry.domain;
  if (entry.domain !== domainId) {
    return {
      success: false,
      error: "domain_mismatch",
      message: `A métrica ${metricId} pertence ao domínio ${entry.domain}, não a ${domainId}.`,
    };
  }

  const executor = portalDomainExecutors[entry.domain];
  if (!executor?.compute) {
    return {
      success: false,
      error: "executor_unavailable",
      message: `Executor do domínio ${entry.domain} indisponível.`,
    };
  }

  // Filtros: na página Mecanismos o summary é recalculado no frontend sobre clients.
  // Sem filtros efetivos → usar summary do payload (fonte de verdade da API).
  // Com filtros → reaplicar a mesma agregação do summary sobre clients filtrados
  // via paths conhecidos (sem fórmulas paralelas para dias: usar rows + mesma robustStats da página).
  const payload = options.payload || (await executor.compute());
  const hasFilters = filters && Object.keys(filters).some((k) => {
    const v = filters[k];
    return v != null && v !== "" && v !== "all" && v !== "all_time";
  });

  let clientsRows = Array.isArray(payload.clients) ? payload.clients : [];
  if (hasFilters && entry.domain === "mechanisms" && clientsRows.length) {
    clientsRows = applyDashboardClientFilters(clientsRows, filters);
  }

  let value;
  let average = entry.averagePath ? getByPath(payload, entry.averagePath) : null;
  let median = entry.medianPath ? getByPath(payload, entry.medianPath) : null;
  let sampleSize = entry.sampleSizePath ? getByPath(payload, entry.sampleSizePath) : null;

  if (entry.distributionLookup) {
    const list = getByPath(payload, entry.distributionLookup.path) || [];
    const item = Array.isArray(list)
      ? list.find((row) => String(row.label) === String(entry.distributionLookup.label))
      : null;
    value = item?.count ?? 0;
  } else if (typeof entry.countFromClients === "function") {
    value = clientsRows.filter(entry.countFromClients).length;
    sampleSize = clientsRows.length;
  } else if (hasFilters && entry.domain === "mechanisms" && Array.isArray(payload.clients)) {
    const recomputed = recomputeMechanismsSummaryLikeDashboard(clientsRows, payload);
    value = pickFromRecomputed(recomputed, entry.payloadPath);
    if (entry.averagePath) average = pickFromRecomputed(recomputed, entry.averagePath) ?? average;
    if (entry.medianPath) median = pickFromRecomputed(recomputed, entry.medianPath) ?? median;
    if (entry.sampleSizePath) sampleSize = pickFromRecomputed(recomputed, entry.sampleSizePath) ?? sampleSize;
  } else {
    value = getByPath(payload, entry.payloadPath);
  }

  const aggregation = options.aggregation || entry.aggregation;

  // Pediu média sem averagePath no payload
  if (aggregation === "average" && entry.aggregation === "median" && average == null && entry.averagePath == null) {
    return {
      success: false,
      error: "average_unavailable",
      answerHint:
        "A página utiliza a mediana como valor principal. A média não está exposta com segurança nesse indicador.",
      metric: metricId,
      domain: entry.domain,
      label: entry.label,
      definition: entry.definition,
    };
  }
  let resolvedValue = value;
  let valueDetail = null;

  if (aggregation === "average" && entry.aggregation === "median" && average != null) {
    // Pediu média sobre métrica cujo principal é mediana
    resolvedValue = average;
    valueDetail = { average, median: value };
  } else if (aggregation === "median" && entry.aggregation === "average" && median != null) {
    resolvedValue = median;
    valueDetail = { median, average: value };
  } else if (aggregation === "comparison") {
    const med = entry.aggregation === "median" ? value : median;
    const avg = entry.aggregation === "average" ? value : average;
    resolvedValue = { median: med ?? median ?? value, average: avg ?? average ?? value };
    valueDetail = resolvedValue;
  } else if (entry.aggregation === "median") {
    valueDetail = { median: value, average };
  } else if (entry.aggregation === "average") {
    valueDetail = { average: value, median };
  }

  return {
    success: true,
    metric: metricId,
    domain: entry.domain,
    label: entry.label,
    aggregation,
    value: resolvedValue,
    average: average ?? valueDetail?.average ?? null,
    median: (entry.aggregation === "median" ? value : median) ?? valueDetail?.median ?? null,
    value_detail: valueDetail,
    sample_size: sampleSize ?? null,
    unit: entry.unit,
    definition: entry.definition,
    filters,
    sources: entry.sources || [],
    warnings: [],
    realtime_database: true,
    payload_path: entry.payloadPath,
  };
}

function pickFromRecomputed(summary, path) {
  if (!path?.startsWith("summary.")) return undefined;
  return getByPath({ summary }, path);
}

/** Mesmos critérios de status analítico usados na página (rótulos Ativo/Cancelado/…). */
function applyDashboardClientFilters(clients, filters = {}) {
  return clients.filter((c) => {
    if (filters.engineer && c.engineer !== filters.engineer) return false;
    if (filters.client_status || filters.status) {
      const want = String(filters.client_status || filters.status).toLowerCase();
      const st = String(c.clientStatus || c.analyticalStatus || "").toLowerCase();
      if (want === "active" || want === "ativo") {
        if (!(st.includes("ativ") && !st.includes("inativ"))) return false;
      } else if (want === "cancelled" || want === "cancelado") {
        if (!(st.includes("cancel") || st.includes("churn") || st.includes("encerr"))) return false;
      } else if (want === "frozen" || want === "congelado") {
        if (!(st.includes("congel") || st.includes("paus"))) return false;
      } else if (st !== want) return false;
    }
    if (filters.mechanism_status || filters.mechStatus) {
      const want = filters.mechanism_status || filters.mechStatus;
      const label = mapMechStatusFilter(want);
      if (!label) return false;
      if (!(c.mechanisms || []).some((m) => m.status === label)) return false;
    }
    if (filters.has_implementation === "yes" || filters.hasImpl === "yes") {
      if (!(c.implemented > 0)) return false;
    }
    if (filters.has_implementation === "no" || filters.hasImpl === "no") {
      if (c.implemented > 0) return false;
    }
    if (filters.recent === "yes" && !c.hasImplementationLast30Days) return false;
    if (filters.recent === "no" && c.hasImplementationLast30Days) return false;
    return true;
  });
}

function mapMechStatusFilter(raw) {
  const t = String(raw || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (t.includes("apto") || t === "eligible") return "Apto";
  if (t.includes("andamento") || t.includes("iniciad") || t === "started") return "Em andamento";
  if (t.includes("conclu") || t.includes("implement") || t === "completed") return "Implementado";
  if (raw === "Apto" || raw === "Em andamento" || raw === "Implementado") return raw;
  return null;
}

/**
 * Replica a agregação do summarizeMechanisms / summary do backend
 * para o recorte filtrado — mesmas fórmulas, sem paths inventados.
 */
function recomputeMechanismsSummaryLikeDashboard(rows, fullPayload) {
  const available = rows.reduce((a, c) => a + (c.available || 0), 0);
  const implemented = rows.reduce((a, c) => a + (c.implemented || 0), 0);
  const inProgress = rows.reduce((a, c) => a + (c.inProgress || 0), 0);
  const eligible = rows.reduce((a, c) => a + (c.eligible || 0), 0);
  const firstValues = rows
    .map((c) => c.daysToFirstImplementation)
    .filter((v) => v != null && Number.isFinite(v) && v >= 0);
  const firstStats = robustStatsLikeDashboard(firstValues);
  const catalog = fullPayload.catalog?.mechanisms || [];
  const catalogIds = new Set(catalog.map((m) => String(m.id)));
  const usedIds = new Set();
  for (const c of rows) {
    for (const m of c.mechanisms || []) {
      if (m.mechanismId && catalogIds.has(String(m.mechanismId))) usedIds.add(String(m.mechanismId));
    }
  }
  return {
    clientsWithMechanisms: rows.length,
    availableMechanisms: available,
    implementedMechanisms: implemented,
    inProgressMechanisms: inProgress,
    eligibleMechanisms: eligible,
    implementationPercent: available
      ? Math.min(100, Math.round((implemented / available) * 1000) / 10)
      : null,
    averageDaysToFirstImplementation: firstStats.mean,
    typicalDaysToFirstImplementation: firstStats.median,
    daysToFirstStats: firstStats,
    clientsWithRecentImplementation: rows.filter((c) => c.hasImplementationLast30Days).length,
    typesUsed: usedIds.size,
    catalogMechanisms: catalog.length,
    typesUnused: catalog.length - usedIds.size,
  };
}

/** Igual a robustStats de mechanisms.mjs (mediana + média da página). */
function robustStatsLikeDashboard(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) {
    return { mean: null, median: null, validCount: 0 };
  }
  const mean = Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100) / 100;
  const median = Math.round(percentile(sorted, 50) * 10) / 10;
  return { mean, median, validCount: sorted.length };
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
