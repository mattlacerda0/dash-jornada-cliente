/**
 * Perfis executivos por página (Etapa 8.4.2).
 * Declaram o que a liderança deve saber — não recalculam KPIs.
 */

export const EXECUTIVE_PROFILE_VERSION = "8.9";

export const LIMITATION_CATEGORIES = Object.freeze([
  "data_quality",
  "coverage",
  "sample",
  "business_validation",
  "technical",
]);

const ACTIVE_SCOPE = {
  type: "active_clients",
  label: "Clientes ativos",
};

function profile(partial) {
  return Object.freeze({
    geminiPilot: false,
    allowActiveDefault: false,
    defaultScope: "page_universe",
    defaultScopeLabel: "Universo da página",
    maxInsights: 4,
    maxAttention: 3,
    maxPositives: 2,
    maxActions: 3,
    maxLimitations: 4,
    maxHighlightNumbers: 4,
    interpretation: [],
    specificLimitations: [],
    priorityMetrics: [],
    secondaryMetrics: [],
    highlightMetrics: [],
    trendMetrics: [],
    relevantSignals: [],
    relevantComparisons: [],
    ...partial,
  });
}

export const EXECUTIVE_PAGE_PROFILES = Object.freeze({
  general: profile({
    id: "general",
    title: "Dados Gerais",
    geminiPilot: true,
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Descrever o estado atual da carteira ativa, sua evolução recente e o perfil financeiro típico.",
    executiveQuestions: [
      "Qual é o tamanho atual da carteira ativa?",
      "Como a carteira está evoluindo?",
      "Qual é o perfil financeiro típico dos clientes ativos?",
      "Há problemas relevantes de qualidade cadastral?",
    ],
    priorityMetrics: ["active_clients", "latest_month_acquisitions", "median_stay_days", "median_monthly_income"],
    secondaryMetrics: ["median_liquidity_reserve", "median_last_contribution", "clients_with_financial_data", "financial_coverage"],
    highlightMetrics: ["active_clients", "median_stay_days", "financial_coverage", "latest_month_acquisitions"],
    trendMetrics: ["latest_month_acquisitions"],
    relevantSignals: ["growth", "financial_coverage", "data_quality"],
    relevantComparisons: ["latest_month_acquisitions"],
    interpretation: [
      "Priorize o estado da carteira ativa na headline.",
      "Cancelamento sem data confirmada é qualidade de dado, não o insight principal da carteira ativa.",
      "Limitações técnicas (timeout de view/contrato) ficam no accordion, não na headline.",
    ],
    specificLimitations: ["financial_coverage", "cancelled_without_confirmed_date", "acquisition_source"],
  }),

  meetings: profile({
    id: "meetings",
    title: "Reuniões",
    geminiPilot: true,
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Entender se os clientes ativos estão sendo acompanhados e se cobertura, cadência e comparecimento mudaram.",
    executiveQuestions: [
      "Os clientes ativos estão sendo acompanhados?",
      "Qual a cobertura de reuniões?",
      "A frequência está adequada ou estável?",
      "Comparecimento ou no-show está mudando?",
      "Existem clientes ativos sem contato recente?",
    ],
    priorityMetrics: ["meeting_coverage_rate", "clients_with_meeting", "attendance_rate", "no_show_rate"],
    secondaryMetrics: ["days_since_latest_meeting", "average_interval_between_meetings", "meetings_completed_by_month", "never_met", "long_gap"],
    highlightMetrics: ["clients_with_meeting", "meeting_coverage_rate", "attendance_rate", "no_show_rate"],
    trendMetrics: ["meetings_completed_by_month"],
    relevantSignals: ["coverage", "cadence", "attendance_change", "no_recent_contact"],
    relevantComparisons: ["meetings_completed_by_month", "attendance_rate"],
    interpretation: [
      "Se o recorte for clientes ativos, não generalize para cancelados.",
      "Não distorça regras oficiais de presença: só recorte o universo de clientes quando o payload permitir.",
    ],
    specificLimitations: ["reschedule_partial", "attendance_classification", "pre_entry_meetings"],
  }),

  "statistical-crosses": profile({
    id: "statistical-crosses",
    title: "Análises Estatísticas",
    geminiPilot: true,
    allowActiveDefault: false,
    defaultScope: "methodological",
    defaultScopeLabel: "População metodológica oficial",
    maxInsights: 5,
    maxAttention: 5,
    executiveObjective: "Destacar as descobertas mais relevantes sobre permanência/cancelamento e o que vale investigar, sem causalidade.",
    executiveQuestions: [
      "Qual associação merece mais atenção?",
      "Qual descoberta é mais relevante?",
      "Qual a força e a limitação da evidência?",
      "O que vale investigar?",
    ],
    priorityMetrics: ["sc_top_association", "sc_active_clients", "sc_confirmed_cancellations"],
    secondaryMetrics: ["sc_nps", "sc_nps_responses"],
    highlightMetrics: ["sc_active_clients", "sc_top_association", "sc_nps"],
    trendMetrics: [],
    relevantSignals: ["association", "predictive_discrimination", "group_difference", "survival", "sample"],
    relevantComparisons: [],
    interpretation: [
      "Não altere a população metodológica oficial.",
      "Nunca atribua causalidade.",
      "AUC é capacidade de discriminação, nunca taxa de acerto.",
      "No máximo 3–5 descobertas; ignore o restante da matriz.",
    ],
    specificLimitations: ["sample", "coverage", "nps_coverage"],
  }),

  journey: profile({
    id: "journey",
    title: "Jornada e onboarding",
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Ver tempo, conclusão e gargalos de onboarding, inclusive ativos com jornada incompleta.",
    executiveQuestions: [
      "Quanto tempo leva o onboarding?",
      "Qual a conclusão?",
      "Onde estão os gargalos?",
      "Há clientes ativos com jornada incompleta?",
    ],
    priorityMetrics: ["average_onboarding_days", "completed_onboarding_clients", "clients_with_first_meeting"],
    secondaryMetrics: ["average_days_to_plan_delivery"],
    highlightMetrics: ["completed_onboarding_clients", "average_onboarding_days"],
    trendMetrics: ["average_onboarding_days"],
  }),

  plan: profile({
    id: "plan",
    title: "Plano Patrimonial",
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Cobertura, conclusão e atualização do plano entre clientes ativos.",
    executiveQuestions: [
      "Qual a cobertura de plano?",
      "Os planos estão concluídos e atualizados?",
      "Há clientes ativos sem plano?",
    ],
    priorityMetrics: ["average_days_to_plan_delivery"],
    highlightMetrics: ["average_days_to_plan_delivery"],
  }),

  mechanisms: profile({
    id: "mechanisms",
    title: "Implementação de Mecanismos",
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Cobertura e implementação de mecanismos na carteira ativa, com lacunas por categoria.",
    executiveQuestions: [
      "Quantos ativos têm mecanismos?",
      "Como está a implementação?",
      "Quais categorias e lacunas importam?",
    ],
    priorityMetrics: ["clients_with_mechanisms", "implemented_mechanisms"],
    secondaryMetrics: ["in_progress_mechanisms", "eligible_mechanisms"],
    highlightMetrics: ["clients_with_mechanisms", "implemented_mechanisms"],
  }),

  financial: profile({
    id: "financial",
    title: "Atualização Financeira",
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Cobertura, recência e desatualização financeira dos clientes ativos.",
    executiveQuestions: [
      "Qual a cobertura ativa?",
      "Quão recente está a atualização?",
      "Há desatualização relevante?",
    ],
    priorityMetrics: ["financial_clients_with_data", "financial_updated_last_30_days", "financial_outdated_over_90_days"],
    secondaryMetrics: ["financial_median_days_since_update"],
    highlightMetrics: ["financial_clients_with_data", "financial_outdated_over_90_days"],
    trendMetrics: ["financial_updated_last_30_days"],
  }),

  platform: profile({
    id: "platform",
    title: "Uso da Plataforma",
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    executiveObjective: "Uso, recência e frequência da plataforma entre clientes ativos.",
    executiveQuestions: [
      "Quantos ativos utilizam a plataforma?",
      "Qual a recência e a frequência?",
      "Há ativos sem uso?",
    ],
    priorityMetrics: ["temporal_active_with_signals"],
    highlightMetrics: ["temporal_active_with_signals"],
  }),

  support: profile({
    id: "support",
    title: "Atendimento",
    allowActiveDefault: false,
    defaultScope: "tickets",
    defaultScopeLabel: "Acionamentos do período",
    executiveObjective: "Volume, reclamações, tempo de resolução e problemas recorrentes.",
    executiveQuestions: [
      "Qual o volume de atendimento?",
      "Há reclamações ou temas recorrentes?",
      "Como está o tempo de resolução?",
    ],
    priorityMetrics: ["support_identification_coverage", "support_monthly_evolution"],
    secondaryMetrics: ["support_without_area", "support_needs_reprocessing"],
    highlightMetrics: ["support_identification_coverage"],
  }),

  satisfaction: profile({
    id: "satisfaction",
    title: "Pesquisa de Satisfação",
    allowActiveDefault: false,
    defaultScope: "respondents",
    defaultScopeLabel: "Respondentes da pesquisa",
    executiveObjective: "NPS/CSAT/CES disponíveis, tendência e cobertura da amostra.",
    interpretation: [
      "Analisar respondentes da pesquisa.",
      "Quando possível, contextualizar quantos respondentes são clientes ativos, sem trocar a população da pesquisa.",
    ],
    executiveQuestions: [
      "Qual o índice disponível?",
      "Há tendência?",
      "A amostra cobre a carteira?",
    ],
    priorityMetrics: ["nps_official_index", "nps_official_coverage", "nps_official_responses"],
    highlightMetrics: ["nps_official_index", "nps_official_coverage"],
    trendMetrics: ["nps_official_index"],
  }),

  cancellations: profile({
    id: "cancellations",
    title: "Cancelamento",
    allowActiveDefault: false,
    defaultScope: "cancellation_process",
    defaultScopeLabel: "Cancelados / processo de cancelamento",
    executiveObjective: "Churn confirmado, evolução, motivo, processo e qualidade do registro.",
    executiveQuestions: [
      "Qual o churn confirmado?",
      "Como está evoluindo?",
      "Quais motivos e gargalos de processo?",
    ],
    priorityMetrics: ["total_cancellations", "top_cancellation_reason", "cancellations_with_reason"],
    secondaryMetrics: ["cancellations_without_reason", "cancellation_distrato_signed_without_date"],
    highlightMetrics: ["total_cancellations", "cancellations_with_reason"],
    trendMetrics: ["total_cancellations"],
  }),

  renewal: profile({
    id: "renewal",
    title: "Renovação",
    geminiPilot: true,
    allowActiveDefault: false,
    defaultScope: "renewal_eligible",
    defaultScopeLabel: "Elegíveis à renovação",
    maxInsights: 4,
    maxAttention: 3,
    maxPositives: 2,
    maxActions: 3,
    executiveObjective: "Descrever quantos clientes eram elegíveis, quantos renovaram, a taxa de renovação e o principal sinal de atenção.",
    executiveQuestions: [
      "Quantos clientes eram elegíveis para renovação?",
      "Quantos renovaram e quantos não renovaram?",
      "Qual é a taxa de renovação?",
      "Qual o principal sinal que merece atenção?",
      "Há algum recorte relevante por ciclo, se a base permitir?",
    ],
    priorityMetrics: ["renewal_eligible", "renewed_clients", "non_renewed_clients", "renewal_rate"],
    secondaryMetrics: ["max_current_cycle", "total_renewals"],
    highlightMetrics: ["renewal_eligible", "renewed_clients", "renewal_rate", "max_current_cycle"],
    trendMetrics: [],
    relevantSignals: ["renewal_rate", "non_renewed_volume", "cycle_mix"],
    relevantComparisons: [],
    interpretation: [
      "Elegível é quem tem ciclo válido de 1 ou mais.",
      "Renovaram = ciclo maior que 1. Não renovaram = ciclo igual a 1.",
      "Não inventar ranking, benchmarking ou taxa contratual formal.",
      "Recorte por ciclo só entra se o payload tiver clientes com ciclo válido.",
    ],
    specificLimitations: ["invalid_cycle", "cycle_coverage"],
  }),

  ep: profile({
    id: "ep",
    title: "Performance do EP",
    geminiPilot: true,
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    maxInsights: 4,
    maxAttention: 3,
    maxPositives: 2,
    maxActions: 3,
    executiveObjective: "Ler a performance dos EPs sobre a carteira ativa: cobertura, diferenças entre carteiras e onde investigar, sem ranking punitivo nem score inventado.",
    executiveQuestions: [
      "Como está a performance geral dos EPs sobre a carteira ativa?",
      "Quais EPs apresentam os melhores sinais de desempenho?",
      "Quais EPs apresentam os sinais mais fracos?",
      "Onde existe maior diferença entre carteiras?",
      "Quais casos merecem investigação?",
      "Onde a cobertura ou a amostra impede uma comparação justa?",
    ],
    priorityMetrics: ["ep_active_clients", "ep_meeting_coverage", "ep_clients_without_meeting", "ep_nps"],
    secondaryMetrics: ["ep_small_samples", "ep_clients_by_advisor"],
    highlightMetrics: ["ep_active_clients", "ep_clients_by_advisor", "ep_meeting_coverage", "ep_nps"],
    trendMetrics: [],
    relevantSignals: ["coverage", "without_meeting", "nps_coverage", "ep_spread"],
    relevantComparisons: [],
    interpretation: [
      "Analisar somente clientes ativos.",
      "Citar no máximo 3 destaques e 3 carteiras que pedem atenção, só entre EPs elegíveis.",
      "Não criar score composto. Comparar sinais (reuniões, mecanismos, NPS) em separado.",
      "NPS com poucas respostas não pode liderar o destaque.",
      "Não usar linguagem punitiva.",
    ],
    specificLimitations: ["nps_coverage", "coverage_spread", "small_sample", "without_engineer", "comparison_eligibility"],
  }),

  temporal: profile({
    id: "temporal",
    title: "Indicadores Temporais",
    geminiPilot: true,
    allowActiveDefault: true,
    defaultScope: ACTIVE_SCOPE.type,
    defaultScopeLabel: ACTIVE_SCOPE.label,
    maxInsights: 4,
    maxAttention: 3,
    maxPositives: 2,
    maxActions: 3,
    executiveObjective: "Destacar o que mudou recentemente entre clientes ativos, quais indicadores aceleraram ou desaceleraram e os sinais que merecem atenção.",
    executiveQuestions: [
      "O que mudou recentemente na carteira ativa?",
      "Quais indicadores aceleraram ou desaceleraram?",
      "Quais são os sinais positivos?",
      "Quais tendências merecem atenção?",
    ],
    priorityMetrics: ["temporal_meetings", "temporal_financial_updates", "temporal_logins", "temporal_active_with_signals"],
    secondaryMetrics: ["temporal_implementations"],
    highlightMetrics: ["temporal_meetings", "temporal_financial_updates", "temporal_active_with_signals"],
    trendMetrics: ["temporal_meetings", "temporal_financial_updates", "temporal_logins", "temporal_implementations"],
    relevantSignals: ["recent_change", "acceleration", "deceleration"],
    relevantComparisons: ["temporal_meetings", "temporal_financial_updates", "temporal_logins"],
    interpretation: [
      "Priorizar direção e mudança recente, não um valor isolado.",
      "Reuniões, implementações e atualizações financeiras usam clientes ativos quando o status analítico permite.",
      "Sinais antes do cancelamento permanecem na população cancelada — não aplicar active nesse recorte.",
      "Acessos podem incluir usuários da plataforma; se o recorte ativo esvaziar a série, usa-se a série oficial com limitação.",
    ],
    specificLimitations: ["insufficient_history", "period_in_progress", "login_scope"],
  }),

  quality: profile({
    id: "quality",
    title: "Qualidade dos Dados",
    allowActiveDefault: false,
    defaultScope: "catalog",
    defaultScopeLabel: "Catálogo de indicadores",
    executiveObjective: "Maiores lacunas, indicadores afetados e impacto analítico.",
    executiveQuestions: [
      "Quais são as maiores lacunas?",
      "Quais indicadores ficam comprometidos?",
    ],
    priorityMetrics: ["cancelled_without_confirmed_date"],
    highlightMetrics: ["cancelled_without_confirmed_date"],
  }),
});

export function getExecutivePageProfile(pageId) {
  return EXECUTIVE_PAGE_PROFILES[pageId] || null;
}

export function compactPageProfile(pageId) {
  const p = getExecutivePageProfile(pageId);
  if (!p) return null;
  return {
    id: p.id,
    title: p.title,
    objective: p.executiveObjective,
    questions: p.executiveQuestions,
    default_scope: p.defaultScope,
    default_scope_label: p.defaultScopeLabel,
    allow_active_default: p.allowActiveDefault,
    max_insights: p.maxInsights,
    max_attention: p.maxAttention,
    max_positives: p.maxPositives,
    max_actions: p.maxActions,
    interpretation: p.interpretation,
    highlight_metrics: p.highlightMetrics,
    priority_metrics: p.priorityMetrics,
    max_highlight_numbers: p.maxHighlightNumbers,
    profile_version: EXECUTIVE_PROFILE_VERSION,
  };
}

export function profileMetricAllowlist(pageId) {
  const p = getExecutivePageProfile(pageId);
  if (!p) return new Set();
  return new Set([
    ...(p.priorityMetrics || []),
    ...(p.secondaryMetrics || []),
    ...(p.highlightMetrics || []),
    ...(p.trendMetrics || []),
    ...(p.specificLimitations || []),
  ]);
}

/**
 * Filtro explícito do usuário > default active da página.
 */
export function resolveExecutiveScope(pageId, filters = {}) {
  const profile = getExecutivePageProfile(pageId);
  if (profile && profile.allowActiveDefault === false && profile.defaultScope === "methodological") {
    return {
      type: profile.defaultScope,
      label: profile.defaultScopeLabel,
      source: "methodological",
      count: null,
    };
  }
  const explicit = firstExplicitScope(filters);
  if (explicit) {
    return { ...explicit, source: "user_filter" };
  }
  if (!profile) {
    return { type: "page_universe", label: "Universo da página", source: "page_default", count: null };
  }
  return {
    type: profile.defaultScope,
    label: profile.defaultScopeLabel,
    source: "page_default",
    count: null,
  };
}

function firstExplicitScope(filters) {
  if (!filters || typeof filters !== "object") return null;
  const raw = filters.scope || filters.population || filters.status || filters.clientStatus || filters.analyticalStatus;
  if (raw == null || raw === "") return null;
  const n = String(raw).trim().toLowerCase();
  if (n === "all" || n === "todos" || n === "all_clients" || n === "todos_os_clientes") {
    return { type: "all_clients", label: "Todos os clientes", count: null };
  }
  if (n === "active" || n === "ativos" || n === "active_clients" || n === "ativo") {
    return { type: "active_clients", label: "Clientes ativos", count: null };
  }
  if (n === "cancelled" || n === "cancelados" || n === "cancelled_clients" || n === "cancelado") {
    return { type: "cancelled_clients", label: "Clientes cancelados", count: null };
  }
  if (Array.isArray(filters.segment) && filters.segment.length) {
    return { type: "filtered", label: "Recorte selecionado", count: null };
  }
  if (filters.ep || filters.engineer || filters.advisor) {
    return { type: "filtered", label: "Recorte selecionado", count: null };
  }
  if (filters.from || filters.to || filters.period) {
    return { type: "filtered", label: "Recorte selecionado", count: null };
  }
  return null;
}
