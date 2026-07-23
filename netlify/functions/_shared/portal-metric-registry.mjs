/**
 * Registry executável: cada métrica aponta para o payload real do dashboard.
 * O assistente NÃO recalcula — só lê o path.
 */
import { computeMechanismsPayload } from "../mechanisms.mjs";
import { computeOnboardingPayload } from "../onboarding.mjs";
import { computeMeetingsPayload } from "../meetings.mjs";
import { computeGeneralDataPayload } from "../general-data.mjs";
import { computeSupportPayload } from "../support.mjs";
import { computeCancellationsPayload } from "../cancellations.mjs";
import { computePharusMechanismsPayload } from "../pharus-mechanisms.mjs";

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
  pharus_mechanisms: {
    id: "pharus_mechanisms",
    label: "App Pharus · Mecanismos sugeridos",
    compute: computePharusMechanismsPayload,
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
  cancellations: {
    id: "cancellations",
    label: "Cancelamento",
    compute: computeCancellationsPayload,
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
  active_or_frozen_clients: {
    domain: "general",
    label: "Clientes ativos e congelados",
    payloadPath: null,
    countFromClients: (c) => {
      const st = String(c.analyticalStatus || c.clientStatus || c.status || "");
      return st === "Ativo" || st === "Congelado";
    },
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com status analítico Ativo ou Congelado.",
    aliases: [
      "clientes ativos e congelados",
      "ativos e congelados",
      "ativos ou congelados",
      "ativos mais congelados",
      "carteira ativa e congelada",
    ],
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
  most_used_mechanism: {
    domain: "mechanisms",
    label: "Mecanismo mais utilizado",
    payloadPath: "summary.topMechanism",
    sampleSizePath: "summary.clientsWithMechanisms",
    unit: "mechanism",
    aggregation: "top",
    definition:
      "Mecanismo com mais clientes distintos após deduplicação client_id+mecanismo_id (BASE QV). Não confundir com mais implementado nem com sugestões do App Pharus.",
    aliases: [
      "mecanismo mais utilizado",
      "mecanismo mais usado",
      "qual mecanismo aparece em mais clientes",
      "mecanismo com mais clientes",
      "tipo de mecanismo mais frequente",
    ],
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

  /* ---------- APP PHARUS (sugestões — não implementação) ---------- */
  pharus_users_with_suggestions: {
    domain: "pharus_mechanisms",
    label: "Usuários com mecanismos sugeridos (App Pharus)",
    payloadPath: "summary.usersWithSuggestions",
    sampleSizePath: "summary.usersWithSuggestions",
    unit: "users",
    aggregation: "count",
    definition: "Usuários distintos com sugestão em user_mechanisms no App Pharus. Não misturar com BASE QV.",
  },
  pharus_total_suggestions: {
    domain: "pharus_mechanisms",
    label: "Total de sugestões (App Pharus)",
    payloadPath: "summary.totalSuggestions",
    sampleSizePath: "summary.totalSuggestions",
    unit: "suggestions",
    aggregation: "count",
    definition: "Registros em user_mechanisms (App Pharus). Não são implementações.",
  },
  pharus_top_suggested_mechanism: {
    domain: "pharus_mechanisms",
    label: "Mecanismo mais sugerido (App Pharus)",
    payloadPath: "summary.topSuggestedMechanism",
    unit: "mechanism",
    aggregation: "top",
    definition: "Nome do mecanismo com mais sugestões no App Pharus.",
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

  /* ---------- ATENDIMENTO (research.acionamentos) ---------- */
  total_support_tickets: {
    domain: "support",
    label: "Total de acionamentos",
    payloadPath: "summary.totalTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Contagem de acionamentos em research.acionamentos no payload de Atendimento.",
  },
  open_support_tickets: {
    domain: "support",
    label: "Acionamentos abertos",
    payloadPath: "summary.openTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos com status normalizado aberto (novo, aberto, pendente, em andamento) e sem resolução.",
  },
  urgent_support_tickets: {
    domain: "support",
    label: "Acionamentos urgentes",
    payloadPath: "summary.urgentTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos com prioridade normalizada Urgente.",
  },
  resolved_support_tickets: {
    domain: "support",
    label: "Acionamentos resolvidos",
    payloadPath: "summary.resolvedTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos com resolved_at ou status resolvido/concluído/fechado.",
  },
  resolution_rate: {
    domain: "support",
    label: "Taxa de resolução",
    payloadPath: "summary.resolutionRate",
    sampleSizePath: "summary.totalTickets",
    unit: "percent",
    aggregation: "rate",
    definition: "Percentual de acionamentos resolvidos sobre o total.",
  },
  median_resolution_time: {
    domain: "support",
    label: "Tempo típico de resolução",
    payloadPath: "summary.medianResolutionHours",
    sampleSizePath: "summary.resolvedTickets",
    unit: "hours",
    aggregation: "median",
    definition: "Mediana em horas entre abertura e resolução, somente com datas válidas.",
  },
  identified_support_clients: {
    domain: "support",
    label: "Clientes identificados",
    payloadPath: "summary.identifiedClients",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos com client_found=true ou client_id preenchido.",
  },
  unidentified_support_clients: {
    domain: "support",
    label: "Clientes não identificados",
    payloadPath: "summary.unidentifiedClients",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos sem vínculo confirmado (client_found=false e client_id nulo).",
  },
  top_support_area: {
    domain: "support",
    label: "Área com mais acionamentos",
    payloadPath: "summary.topArea",
    sampleSizePath: "summary.totalTickets",
    unit: "label",
    aggregation: "top",
    definition: "Área/setor com maior volume de acionamentos no período.",
  },

  /* ---------- CANCELAMENTO (BASE QV) ---------- */
  total_cancellations: {
    domain: "cancellations",
    label: "Total de cancelamentos",
    payloadPath: "summary.totalCancellations",
    sampleSizePath: "summary.totalCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com data consolidada de cancelamento válida na BASE QV.",
  },
  cancellations_with_reason: {
    domain: "cancellations",
    label: "Cancelamentos com motivo informado",
    payloadPath: "summary.withReason",
    sampleSizePath: "summary.totalCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes cancelados com motivo preenchido.",
  },
  cancellations_without_reason: {
    domain: "cancellations",
    label: "Cancelamentos sem motivo",
    payloadPath: "summary.withoutReason",
    sampleSizePath: "summary.totalCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes cancelados sem motivo preenchido.",
  },
  median_days_to_cancellation: {
    domain: "cancellations",
    label: "Tempo típico até o cancelamento",
    payloadPath: "summary.medianDaysToCancellation",
    averagePath: "summary.averageDaysToCancellation",
    sampleSizePath: "summary.staySampleSize",
    unit: "days",
    aggregation: "median",
    definition: "Mediana de dias entre contratação e data consolidada de cancelamento.",
  },
  average_days_to_cancellation: {
    domain: "cancellations",
    label: "Tempo médio até o cancelamento",
    payloadPath: "summary.averageDaysToCancellation",
    sampleSizePath: "summary.staySampleSize",
    unit: "days",
    aggregation: "average",
    definition: "Média de dias entre contratação e cancelamento.",
  },
  median_meetings_before_cancellation: {
    domain: "cancellations",
    label: "Reuniões típicas antes do cancelamento",
    payloadPath: "summary.medianMeetingsBeforeCancellation",
    averagePath: "summary.averageMeetingsBeforeCancellation",
    sampleSizePath: "summary.meetingsSampleSize",
    unit: "meetings",
    aggregation: "median",
    definition: "Mediana de reuniões com presença confirmada antes do cancelamento.",
  },
  median_days_since_financial_update_before_cancellation: {
    domain: "cancellations",
    label: "Dias desde a última atualização financeira antes do cancelamento",
    payloadPath: "summary.medianDaysSinceFinancialUpdate",
    averagePath: "summary.averageDaysSinceFinancialUpdate",
    sampleSizePath: "summary.financialSampleSize",
    unit: "days",
    aggregation: "median",
    definition: "Mediana de dias sem atualização financeira anterior ao cancelamento.",
  },
  median_days_without_interaction_before_cancellation: {
    domain: "cancellations",
    label: "Dias desde a última reunião antes do cancelamento",
    payloadPath: "summary.medianDaysWithoutInteraction",
    averagePath: "summary.averageDaysWithoutInteraction",
    sampleSizePath: "summary.interactionSampleSize",
    unit: "days",
    aggregation: "median",
    definition: "Interação v1: mediana de dias desde a última reunião realizada até o cancelamento.",
  },
  top_cancellation_reason: {
    domain: "cancellations",
    label: "Motivo mais comum de cancelamento",
    payloadPath: "summary.topReason",
    sampleSizePath: "summary.withReason",
    unit: "label",
    aggregation: "top",
    definition: "Motivo com maior volume entre cancelamentos com motivo informado.",
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

  let ticketRows = Array.isArray(payload.tickets) ? payload.tickets : [];
  if (hasFilters && entry.domain === "support" && ticketRows.length) {
    ticketRows = applySupportTicketFilters(ticketRows, filters);
  }

  let cancellationRows = Array.isArray(payload.clients) ? payload.clients : [];
  if (hasFilters && entry.domain === "cancellations" && cancellationRows.length) {
    cancellationRows = applyCancellationClientFilters(cancellationRows, filters);
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
  } else if (hasFilters && entry.domain === "support" && Array.isArray(payload.tickets)) {
    const recomputed = recomputeSupportSummaryLikeDashboard(ticketRows);
    value = pickFromRecomputed(recomputed, entry.payloadPath);
    if (entry.sampleSizePath) sampleSize = pickFromRecomputed(recomputed, entry.sampleSizePath) ?? sampleSize;
  } else if (hasFilters && entry.domain === "cancellations" && Array.isArray(payload.clients)) {
    const recomputed = recomputeCancellationsSummaryLikeDashboard(cancellationRows);
    value = pickFromRecomputed(recomputed, entry.payloadPath);
    if (entry.averagePath) average = pickFromRecomputed(recomputed, entry.averagePath) ?? average;
    if (entry.sampleSizePath) sampleSize = pickFromRecomputed(recomputed, entry.sampleSizePath) ?? sampleSize;
  } else if (hasFilters && entry.domain === "mechanisms" && Array.isArray(payload.clients)) {
    const recomputed = recomputeMechanismsSummaryLikeDashboard(clientsRows, payload);
    value = pickFromRecomputed(recomputed, entry.payloadPath);
    if (entry.averagePath) average = pickFromRecomputed(recomputed, entry.averagePath) ?? average;
    if (entry.medianPath) median = pickFromRecomputed(recomputed, entry.medianPath) ?? median;
    if (entry.sampleSizePath) sampleSize = pickFromRecomputed(recomputed, entry.sampleSizePath) ?? sampleSize;
  } else {
    value = getByPath(payload, entry.payloadPath);
  }

  if (entry.aggregation === "top" && value && typeof value === "object" && !Array.isArray(value)) {
    if (metricId === "most_used_mechanism") {
      // Mantém objeto { name, clientCount, ties } — formatAnswer monta a frase.
    } else if (value.name != null) {
      const n = value.clientCount ?? value.count ?? value.clients;
      value = n != null ? `${value.name} (${n})` : String(value.name);
    } else if (value.label != null) {
      value = String(value.label);
    }
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
      const want = String(filters.client_status || filters.status).toLowerCase().replace(/\s+/g, "_");
      const st = String(c.clientStatus || c.analyticalStatus || "").toLowerCase();
      const isActive = st.includes("ativ") && !st.includes("inativ");
      const isFrozen = st.includes("congel") || st.includes("paus");
      const isCancelled = st.includes("cancel") || st.includes("churn") || st.includes("encerr");
      if (want === "active" || want === "ativo") {
        if (!isActive) return false;
      } else if (want === "cancelled" || want === "cancelado") {
        if (!isCancelled) return false;
      } else if (want === "frozen" || want === "congelado") {
        if (!isFrozen) return false;
      } else if (
        want === "active_or_frozen" ||
        want === "active_and_frozen" ||
        want === "ativos_e_congelados" ||
        want === "ativos_ou_congelados"
      ) {
        if (!(isActive || isFrozen)) return false;
      } else if (want === "unknown" || want === "nao_informado" || want === "não_informado") {
        if (isActive || isFrozen || isCancelled) return false;
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
  const byMechanism = new Map();
  for (const c of rows) {
    for (const m of c.mechanisms || []) {
      if (m.mechanismId && catalogIds.has(String(m.mechanismId))) usedIds.add(String(m.mechanismId));
      const key = m.mechanismId != null ? String(m.mechanismId) : null;
      if (!key) continue;
      const cur = byMechanism.get(key) || {
        id: key,
        name: m.name || "Não informado",
        clientCount: 0,
      };
      cur.clientCount += 1;
      byMechanism.set(key, cur);
    }
  }
  const ranked = [...byMechanism.values()].sort(
    (a, b) => b.clientCount - a.clientCount || a.name.localeCompare(b.name, "pt-BR"),
  );
  const maxClients = ranked[0]?.clientCount || 0;
  const ties = maxClients > 0
    ? ranked.filter((item) => item.clientCount === maxClients)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : [];
  const lead = ties[0] || null;
  const topMechanism = lead
    ? {
      id: lead.id,
      name: lead.name,
      clientCount: lead.clientCount,
      count: lead.clientCount,
      ties: ties.slice(1).map((item) => ({
        id: item.id,
        name: item.name,
        clientCount: item.clientCount,
      })),
    }
    : null;
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
    topMechanism,
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

function foldSupportToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Filtra tickets[] do payload de Atendimento (mesmos campos já normalizados). */
function applySupportTicketFilters(tickets, filters = {}) {
  return tickets.filter((t) => {
    const areaWant = filters.area_setor || filters.area;
    if (areaWant && areaWant !== "all") {
      if (foldSupportToken(t.area) !== foldSupportToken(areaWant)) return false;
    }
    if (filters.priority && filters.priority !== "all") {
      if (foldSupportToken(t.priority) !== foldSupportToken(filters.priority)) return false;
    }
    if (filters.status && filters.status !== "all") {
      if (foldSupportToken(t.status) !== foldSupportToken(filters.status)) return false;
    }
    const typeWant = filters.tipo_solicitacao || filters.type;
    if (typeWant && typeWant !== "all") {
      if (foldSupportToken(t.type) !== foldSupportToken(typeWant)) return false;
    }
    if (filters.opened === "today") {
      const d = t.openedAt ? new Date(t.openedAt) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const now = new Date();
      if (
        d.getUTCFullYear() !== now.getUTCFullYear()
        || d.getUTCMonth() !== now.getUTCMonth()
        || d.getUTCDate() !== now.getUTCDate()
      ) return false;
    }
    if (filters.opened === "last_month") {
      const d = t.openedAt ? new Date(t.openedAt) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 86400000);
      if (d < from || d > now) return false;
    }
    return true;
  });
}

/** Reagrega summary a partir dos tickets já calculados pelo dashboard (sem fórmula paralela). */
function recomputeSupportSummaryLikeDashboard(rows) {
  const totalTickets = rows.length;
  const openTickets = rows.filter((t) => t.isOpen).length;
  const urgentTickets = rows.filter((t) => t.priority === "Urgente").length;
  const identifiedClients = rows.filter((t) => t.clientIdentified).length;
  const unidentifiedClients = rows.filter((t) => !t.clientIdentified).length;
  const resolvedTickets = rows.filter((t) => t.isResolved).length;
  const resolutionRate = totalTickets
    ? Math.round((resolvedTickets / totalTickets) * 1000) / 10
    : 0;
  const resValues = rows
    .map((t) => t.resolutionHours)
    .filter((h) => h != null && Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const medianResolutionHours = resValues.length
    ? Math.round(percentile(resValues, 50) * 10) / 10
    : null;
  const areaMap = new Map();
  for (const t of rows) {
    if (!t.area || t.area === "Não informado") continue;
    areaMap.set(t.area, (areaMap.get(t.area) || 0) + 1);
  }
  const topArea = [...areaMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || null;
  return {
    totalTickets,
    openTickets,
    urgentTickets,
    identifiedClients,
    unidentifiedClients,
    resolvedTickets,
    resolutionRate,
    medianResolutionHours,
    topArea,
  };
}

/** Filtra clients[] do payload de Cancelamento (mesmos campos já normalizados). */
function applyCancellationClientFilters(clients, filters = {}) {
  return clients.filter((c) => {
    if (filters.engineer && filters.engineer !== "all" && c.engineer !== filters.engineer) return false;
    if (filters.segment && filters.segment !== "all" && c.segment !== filters.segment) return false;
    if (filters.reason && filters.reason !== "all" && c.reason !== filters.reason) return false;
    if (filters.category && filters.category !== "all" && c.category !== filters.category) return false;
    if (filters.hasReason === "yes" && !c.hasReason) return false;
    if (filters.hasReason === "no" && c.hasReason) return false;
    return true;
  });
}

function cancelRobustStats(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { median: null, mean: null, validCount: 0 };
  const mean = Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10;
  const median = Math.round(percentile(sorted, 50) * 10) / 10;
  return { median, mean, validCount: sorted.length };
}

/** Reagrega summary a partir dos clients já calculados pelo dashboard Cancelamento. */
function recomputeCancellationsSummaryLikeDashboard(rows) {
  const totalCancellations = rows.length;
  const withReason = rows.filter((r) => r.hasReason).length;
  const withoutReason = totalCancellations - withReason;
  const stayStats = cancelRobustStats(rows.map((r) => r.daysToCancellation));
  const meetingStats = cancelRobustStats(rows.map((r) => r.meetingsBeforeCancellation));
  const financialStats = cancelRobustStats(rows.map((r) => r.daysSinceFinancialUpdate).filter((d) => d != null));
  const interactionStats = cancelRobustStats(rows.map((r) => r.daysWithoutInteraction).filter((d) => d != null));
  const reasonMap = new Map();
  for (const r of rows) {
    if (!r.hasReason || !r.reason) continue;
    reasonMap.set(r.reason, (reasonMap.get(r.reason) || 0) + 1);
  }
  const topReason = [...reasonMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || null;
  return {
    totalCancellations,
    withReason,
    withoutReason,
    medianDaysToCancellation: stayStats.median,
    averageDaysToCancellation: stayStats.mean,
    staySampleSize: stayStats.validCount,
    medianMeetingsBeforeCancellation: meetingStats.median,
    averageMeetingsBeforeCancellation: meetingStats.mean,
    meetingsSampleSize: meetingStats.validCount,
    medianDaysSinceFinancialUpdate: financialStats.median,
    averageDaysSinceFinancialUpdate: financialStats.mean,
    financialSampleSize: financialStats.validCount,
    medianDaysWithoutInteraction: interactionStats.median,
    averageDaysWithoutInteraction: interactionStats.mean,
    interactionSampleSize: interactionStats.validCount,
    insufficientDataClients: rows.filter((r) => r.insufficientData).length,
    topReason,
  };
}
