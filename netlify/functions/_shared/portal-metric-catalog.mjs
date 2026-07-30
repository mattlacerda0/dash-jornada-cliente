/**
 * Catálogo central de métricas do Assistente da Jornada.
 * Regras auditadas nos compute*Payload dos dashboards — não inventar.
 */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export { normalize };

const SUPABASE = "public";

/** Intenções semânticas suportadas. */
export const SEMANTIC_INTENTS = [
  "value",
  "definition",
  "formula",
  "average",
  "median",
  "comparison",
  "location",
  "quality",
  "mixed",
  "clarification",
  "general",
];

export const portalMetricCatalog = {
  /* -------------------- DADOS GERAIS -------------------- */
  total_clients: {
    id: "total_clients",
    domain: "general",
    label: "Total de clientes",
    aliases: [
      "total de clientes",
      "quantos clientes temos",
      "quantidade de clientes",
      "total da carteira",
      "tamanho da carteira",
      "quantos clientes",
      "numero de clientes",
      "qual o total de clientes",
    ],
    description: "Contagem de clientes distintos na carteira do payload de Dados Gerais.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count(distinct clients.id) no recorte do dashboard",
    supportedFilters: ["search", "client_status", "segment", "engineer", "hiring_period", "cancellation_period", "stay_range"],
    sources: [{ schema: SUPABASE, table: "clients", column: "id" }],
    executor: "general",
    summaryField: "totalClients",
  },
  active_clients: {
    id: "active_clients",
    domain: "general",
    label: "Clientes ativos",
    aliases: [
      "clientes ativos",
      "quantos clientes ativos",
      "ativos",
      "clientes com status ativo",
    ],
    description:
      "Cliente com status bruto ativo e sem churn efetivado ou distrato assinado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "analyticalStatus === Ativo (sem churn_efetivado_at e sem distrato_assinado_at)",
    supportedFilters: ["search", "segment", "engineer"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "status" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "general",
    summaryField: "activeClients",
  },
  active_or_frozen_clients: {
    id: "active_or_frozen_clients",
    domain: "general",
    label: "Clientes ativos e congelados",
    aliases: [
      "clientes ativos e congelados",
      "ativos e congelados",
      "ativos ou congelados",
      "ativos mais congelados",
      "carteira ativa e congelada",
      "quantos clientes ativos e congelados",
    ],
    description:
      "Clientes com status analítico Ativo ou Congelado (sem churn_efetivado_at nem distrato_assinado_at em registro não arquivado).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "analyticalStatus in (Ativo, Congelado)",
    supportedFilters: ["search", "segment", "engineer", "client_status"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "status" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "general",
    summaryField: null,
    impliedFilters: { client_status: "active_or_frozen" },
  },

  cancelled_clients: {
    id: "cancelled_clients",
    domain: "general",
    label: "Clientes cancelados",
    aliases: [
      "clientes cancelados",
      "quantos clientes cancelados",
      "cancelados",
      "clientes com status cancelado",
    ],
    description:
      "Cliente cancelado é aquele que possui churn efetivado ou distrato assinado em registro não arquivado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "analyticalStatus === Cancelado (churn_efetivado_at ?? distrato_assinado_at)",
    sources: [
      { schema: SUPABASE, table: "clients", column: "status" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "general",
    summaryField: "cancelledClients",
  },
  frozen_clients: {
    id: "frozen_clients",
    domain: "general",
    label: "Clientes congelados",
    aliases: [
      "clientes congelados",
      "quantos clientes congelados",
      "congelados",
      "clientes pausados",
    ],
    description:
      "Cliente com status bruto congelado e sem churn efetivado ou distrato assinado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    sources: [
      { schema: SUPABASE, table: "clients", column: "status" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "general",
    summaryField: "frozenClients",
  },
  cancelled_without_confirmed_date: {
    id: "cancelled_without_confirmed_date",
    domain: "general",
    label: "Cancelados sem data confirmada",
    aliases: [
      "cancelados sem data confirmada",
      "cancelados sem data",
      "churn sem data",
      "cancelado sem churn efetivado",
    ],
    description:
      "Status bruto Cancelado/Churn sem churn_efetivado_at nem distrato_assinado_at. Não conta como cancelamento confirmado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    executor: "general",
    summaryField: "cancelledWithoutConfirmedDate",
  },
  non_active_clients: {
    id: "non_active_clients",
    domain: "general",
    label: "Clientes não ativos",
    aliases: [
      "clientes nao ativos",
      "quantos clientes nao ativos",
      "fora da carteira ativa",
    ],
    description:
      "Congelados + cancelados sem data confirmada (+ outros não ativos reconhecidos). Não inclui ativos nem cancelados confirmados.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    executor: "general",
    summaryField: "nonActiveClients",
  },
  median_stay_days: {
    id: "median_stay_days",
    domain: "general",
    label: "Permanência típica",
    aliases: [
      "permanencia tipica",
      "permanencia mediana",
      "tempo de permanencia",
      "tempo de casa tipico",
      "mediana de permanencia",
    ],
    description: "Mediana dos dias de permanência calculáveis (typicalStayDays).",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "days",
    formula: "Mediana de stayDays válidos; média disponível em averageStayDays.",
    sources: [{ schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" }],
    executor: "general",
    summaryField: "typicalStayDays",
    averageSummaryField: "averageStayDays",
  },
  median_liquidity_reserve: {
    id: "median_liquidity_reserve",
    domain: "general",
    label: "Reserva de liquidez típica",
    aliases: [
      "reserva de liquidez tipica",
      "reserva tipica",
      "liquidez tipica",
      "mediana da reserva de liquidez",
      "reserva de liquidez mediana",
      "qual a reserva de liquidez tipica",
    ],
    description: "Mediana da reserva de liquidez válida (typicalLiquidityReserve).",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "currency",
    sources: [{ schema: SUPABASE, table: "client_financial_data", column: "reserva_liquidez" }],
    executor: "general",
    summaryField: "typicalLiquidityReserve",
    averageSummaryField: "averageLiquidityReserve",
  },
  median_last_contribution: {
    id: "median_last_contribution",
    domain: "general",
    label: "Último aporte típico",
    aliases: [
      "ultimo aporte tipico",
      "aporte tipico",
      "mediana do ultimo aporte",
      "ultimo aporte mediano",
      "qual o ultimo aporte tipico",
    ],
    description: "Mediana do último aporte válido (typicalLastContribution).",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "currency",
    sources: [{ schema: SUPABASE, table: "client_financial_data", column: "ultimo_aporte" }],
    executor: "general",
    summaryField: "typicalLastContribution",
    averageSummaryField: "averageLastContribution",
  },
  median_monthly_income: {
    id: "median_monthly_income",
    domain: "general",
    label: "Renda mensal típica",
    aliases: [
      "renda mensal tipica",
      "renda tipica",
      "renda mensal",
      "mediana da renda",
      "mediana da renda mensal",
      "renda mensal mediana",
      "renda mediana",
      "qual a renda mensal",
      "qual a renda mensal tipica",
      "qual e a renda mensal tipica",
      "onde fica a renda mensal",
      "onde esta a renda mensal",
      "fonte da renda mensal",
    ],
    description: "Mediana da última renda mensal válida (typicalMonthlyIncome). A mediana reduz o efeito de valores extremos.",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "currency",
    formula: "Mediana de ultima_renda_mensal válida dos clientes com diagnóstico financeiro.",
    inclusionRules: ["renda mensal numérica válida"],
    exclusionRules: ["renda ausente ou inválida"],
    sources: [{ schema: SUPABASE, table: "client_financial_data", column: "ultima_renda_mensal" }],
    executor: "general",
    summaryField: "typicalMonthlyIncome",
    averageSummaryField: "averageMonthlyIncome",
  },
  clients_with_financial_data: {
    id: "clients_with_financial_data",
    domain: "general",
    label: "Clientes com diagnóstico financeiro",
    aliases: [
      "clientes com diagnostico financeiro",
      "clientes com dados financeiros",
      "clientes com cadastro financeiro",
      "quantos possuem diagnostico financeiro",
      "quantos clientes com diagnostico financeiro",
      "diagnostico financeiro",
      "com diagnostico financeiro",
    ],
    description: "Clientes distintos com registro em public.client_financial_data (clientsWithFinancialProfile).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count distinct client_id com registro financeiro",
    sources: [{ schema: SUPABASE, table: "client_financial_data", column: "client_id" }],
    executor: "general",
    summaryField: "clientsWithFinancialProfile",
  },
  apex_clients: {
    id: "apex_clients",
    domain: "general",
    label: "Clientes APEX",
    aliases: ["clientes apex", "quantos apex", "segmento apex", "apex"],
    description: "Clientes classificados no segmento APEX.",
    aggregation: "count",
    unit: "clients",
    sources: [{ schema: SUPABASE, table: "client_financial_data", column: "ultima_renda_mensal" }],
    executor: "general",
    distributionLookup: { path: "distributions.segments", label: "APEX" },
  },
  private_clients: {
    id: "private_clients",
    domain: "general",
    label: "Clientes PRIVATE",
    aliases: ["clientes private", "quantos private", "segmento private", "private"],
    description: "Clientes classificados no segmento PRIVATE.",
    aggregation: "count",
    unit: "clients",
    executor: "general",
    distributionLookup: { path: "distributions.segments", label: "PRIVATE" },
  },
  principal_clients: {
    id: "principal_clients",
    domain: "general",
    label: "Clientes PRINCIPAL",
    aliases: ["clientes principal", "quantos principal", "segmento principal", "principal"],
    description: "Clientes classificados no segmento PRINCIPAL.",
    aggregation: "count",
    unit: "clients",
    executor: "general",
    distributionLookup: { path: "distributions.segments", label: "PRINCIPAL" },
  },
  debts_clients: {
    id: "debts_clients",
    domain: "general",
    label: "Clientes DEBTS",
    aliases: ["clientes debts", "quantos debts", "segmento debts", "debts", "endividados"],
    description: "Clientes classificados no segmento DEBTS.",
    aggregation: "count",
    unit: "clients",
    executor: "general",
    distributionLookup: { path: "distributions.segments", label: "DEBTS" },
  },
  over_clients: {
    id: "over_clients",
    domain: "general",
    label: "Clientes OVER",
    aliases: ["clientes over", "quantos over", "segmento over", "over"],
    description: "Clientes classificados no segmento OVER.",
    aggregation: "count",
    unit: "clients",
    executor: "general",
    distributionLookup: { path: "distributions.segments", label: "OVER" },
  },
  insufficient_segment_data: {
    id: "insufficient_segment_data",
    domain: "general",
    label: "Dados insuficientes (segmento)",
    aliases: [
      "dados insuficientes",
      "clientes com dados insuficientes",
      "sem dados suficientes para segmento",
      "segmento dados insuficientes",
    ],
    description: "Clientes sem renda nem critério suficiente para segmentar.",
    aggregation: "count",
    unit: "clients",
    executor: "general",
    distributionLookup: { path: "distributions.segments", label: "Dados insuficientes" },
  },

  clients_with_first_meeting: {
    id: "clients_with_first_meeting",
    domain: "meetings",
    label: "Clientes com primeira reunião",
    aliases: [
      "cobertura da primeira reuniao",
      "quantos tem primeira reuniao",
      "clientes com primeira reuniao",
    ],
    description: "Clientes com primeira reunião realizada (fonte principal BASE QV, com fallback Airtable quando disponível).",
    aggregation: "count",
    unit: "clients",
    executor: "meetings",
    summaryField: "clientsWithFirstMeeting",
  },
  first_meeting_airtable_fallback: {
    id: "first_meeting_airtable_fallback",
    domain: "meetings",
    label: "Primeiras reuniões via fallback Airtable",
    aliases: [
      "quantas primeiras reunioes vieram do fallback do airtable",
      "fallback airtable primeira reuniao",
      "primeiras reunioes airtable",
    ],
    description: "Clientes cuja primeira reunião veio do backup Airtable (somente quando a fonte principal não tinha data válida).",
    aggregation: "count",
    unit: "clients",
    executor: "meetings",
    summaryField: "firstMeetingSources.airtable",
  },

  /* -------------------- JOURNEY / ONBOARDING -------------------- */
  average_days_to_first_meeting: {
    id: "average_days_to_first_meeting",
    domain: "journey",
    label: "Média de dias até a primeira reunião",
    aliases: [
      "media ate a primeira reuniao",
      "dias ate a primeira reuniao",
      "tempo medio ate a primeira reuniao",
    ],
    description:
      "Média aritmética dos dias entre a data de contratação e a primeira reunião do cliente.",
    aggregation: "average",
    allowedAggregations: ["average", "median", "comparison"],
    unit: "days",
    formula:
      "Para cada cliente com as duas datas: dias = primeira client_meetings.start_time − (clients.data_inicio_ciclo ou created_at). Depois: média aritmética desses dias.",
    numerator: "soma dos dias válidos",
    denominator: "clientes com contratação e primeira reunião datadas",
    dateStart: "clients.data_inicio_ciclo (fallback created_at)",
    dateEnd: "primeira client_meetings.start_time",
    inclusionRules: ["cliente com data de contratação", "pelo menos uma reunião com start_time"],
    exclusionRules: ["sem data de contratação", "sem reunião datada"],
    supportedFilters: ["engineer", "status", "onboardingStatus"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "client_meetings", column: "start_time" },
    ],
    executor: "journey",
    summaryField: "averageFirstMeetingDays",
    rowField: "daysToFirstMeeting",
  },

  average_days_to_plan_delivery: {
    id: "average_days_to_plan_delivery",
    domain: "journey",
    label: "Média de dias até a entrega do plano",
    aliases: [
      "media ate a entrega do plano",
      "dias ate a entrega do plano",
      "entrega do plano patrimonial",
    ],
    description:
      "Média aritmética dos dias entre a contratação e a primeira data de entrega do plano patrimonial.",
    aggregation: "average",
    allowedAggregations: ["average", "median", "comparison"],
    unit: "days",
    formula:
      "dias = primeira client_implementation_meeting_date.meeting_date − data de contratação. Média aritmética. Intervalos negativos (plano antes da contratação) entram no cálculo e podem gerar média negativa.",
    numerator: "soma dos dias válidos",
    denominator: "clientes com contratação e meeting_date",
    dateStart: "clients.data_inicio_ciclo (fallback created_at)",
    dateEnd: "client_implementation_meeting_date.meeting_date",
    inclusionRules: ["datas presentes"],
    exclusionRules: ["sem contratação", "sem meeting_date"],
    supportedFilters: ["engineer", "status", "onboardingStatus"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "client_implementation_meeting_date", column: "meeting_date" },
    ],
    executor: "journey",
    summaryField: "averagePlanDeliveryDays",
    rowField: "daysToPlanDelivery",
    warningsKnown: ["Pode resultar negativo quando a entrega é anterior à contratação."],
  },

  average_days_to_first_mechanism: {
    id: "average_days_to_first_mechanism",
    domain: "journey",
    label: "Média de dias até o primeiro mecanismo (Jornada)",
    aliases: [
      "media ate o primeiro mecanismo na jornada",
      "media de onboarding ate o primeiro mecanismo",
      "media ate o primeiro mecanismo da jornada",
      "average first implementation days jornada",
    ],
    description:
      "Média aritmética da página Jornada/onboarding (summary.averageFirstImplementationDays). Diferente do tempo típico/média da página Mecanismos.",
    aggregation: "average",
    allowedAggregations: ["average", "median", "comparison"],
    unit: "days",
    formula:
      "Para cada cliente: dias = primeira client_mecanismos.implemented_at (status implementado/concluído ou com data) − data de contratação. Depois: média aritmética dos dias calculados.",
    numerator: "soma dos dias válidos",
    denominator: "clientes com as duas datas",
    dateStart: "clients.data_inicio_ciclo (fallback created_at)",
    dateEnd: "primeira client_mecanismos.implemented_at",
    inclusionRules: ["mecanismo com implemented_at ou status implementado/concluído", "data de contratação"],
    exclusionRules: ["sem contratação", "sem implementação datada"],
    supportedFilters: ["engineer", "status", "onboardingStatus"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "client_mecanismos", column: "implemented_at" },
    ],
    executor: "journey",
    summaryField: "averageFirstImplementationDays",
    rowField: "daysToFirstImplementation",
  },

  average_onboarding_days: {
    id: "average_onboarding_days",
    domain: "journey",
    label: "Média de dias de onboarding",
    aliases: ["media de onboarding", "tempo total de onboarding", "onboarding total"],
    description:
      "Média das durações de transição de jornada a partir dos estágios iniciais de onboarding.",
    aggregation: "average",
    allowedAggregations: ["average"],
    unit: "days",
    formula:
      "Diferença entre client_journeys.started_at dos estágios iniciais de onboarding e a próxima mudança de current_stage_id do mesmo client_id. Depois: média aritmética.",
    numerator: "soma das durações de transição",
    denominator: "transições a partir dos estágios iniciais",
    dateStart: "client_journeys.started_at (estágios iniciais)",
    dateEnd: "próxima mudança de current_stage_id",
    inclusionRules: ["jornadas com estágio inicial conhecido"],
    exclusionRules: ["sem transição subsequente"],
    supportedFilters: ["engineer", "status", "onboardingStatus"],
    sources: [
      { schema: SUPABASE, table: "client_journeys", column: "started_at" },
      { schema: SUPABASE, table: "journey_stages", column: "id" },
    ],
    executor: "journey",
    summaryField: "averageTotalOnboardingDays",
    rowField: "totalOnboardingDays",
    warningsKnown: ["Cobertura pode ser baixa; valor próximo de zero indica base limitada."],
  },

  completed_onboarding_clients: {
    id: "completed_onboarding_clients",
    domain: "journey",
    label: "Clientes que concluíram onboarding",
    aliases: [
      "concluiram onboarding",
      "concluiu onboarding",
      "onboarding concluido",
      "clientes com onboarding concluido",
      "contabilizados os clientes que concluiram onboarding",
    ],
    description:
      "Contagem de clientes cujo estágio atual da jornada não está entre os estágios abertos de onboarding.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula:
      "Para cada client_id com registro em client_journeys: obter o estágio atual (current_stage_id mais recente). Se esse estágio NÃO estiver no conjunto de estágios abertos de onboarding (7c43c981..., ae3a6015..., 33bb253e...), conta como concluído. Sem jornada: não entra no numerador.",
    numerator: "clientes com completedOnboarding === true",
    denominator: null,
    dateStart: null,
    dateEnd: null,
    inclusionRules: [
      "existe client_journeys para o cliente",
      "current_stage_id diferente dos estágios abertos de onboarding",
    ],
    exclusionRules: [
      "sem registro de jornada",
      "estágio atual ainda é um dos três estágios abertos de onboarding",
    ],
    supportedFilters: ["engineer", "status", "onboardingStatus"],
    sources: [
      { schema: SUPABASE, table: "client_journeys", column: "current_stage_id" },
      { schema: SUPABASE, table: "journey_stages", column: "id" },
    ],
    executor: "journey",
    summaryField: "completedOnboarding",
    rowPredicate: (r) => r.completedOnboarding === true,
  },

  /* -------------------- MECHANISMS -------------------- */
  clients_with_mechanisms: {
    id: "clients_with_mechanisms",
    domain: "mechanisms",
    label: "Clientes com mecanismos",
    aliases: [
      "clientes com mecanismos",
      "clientes que possuem mecanismos",
      "clientes com ao menos 1 mecanismo",
      "quantos clientes tem mecanismos",
      "quantos clientes têm mecanismos",
    ],
    description: "Clientes distintos com pelo menos um mecanismo vinculado (count distinct client_id).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count(distinct client_id) em client_mecanismos após deduplicação e filtros.",
    inclusionRules: ["cliente com ao menos um vínculo cliente+mecanismo"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer", "mechanismStatus", "hasImplementation", "segment"],
    sources: [
      { schema: SUPABASE, table: "client_mecanismos", column: "client_id" },
    ],
    executor: "mechanisms",
    summaryField: "clientsWithMechanisms",
    rowPredicate: () => true,
  },

  types_used: {
    id: "types_used",
    domain: "mechanisms",
    label: "Tipos utilizados",
    aliases: [
      "tipos utilizados",
      "tipos de mecanismos usados",
      "quantos tipos de mecanismos estao sendo usados",
      "quantos tipos de mecanismos estão sendo usados",
      "tipos vinculados a clientes",
    ],
    description: "Quantidade de tipos do catálogo que já aparecem em pelo menos um cliente (count distinct mecanismo_id com correspondência em public.mecanismos).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "mechanisms",
    formula: "count(distinct mecanismo_id) em client_mecanismos ∩ mecanismos.id",
    inclusionRules: ["mecanismo_id presente no catálogo"],
    exclusionRules: ["tipos do catálogo sem nenhum vínculo"],
    supportedFilters: ["status", "engineer"],
    sources: [
      { schema: SUPABASE, table: "client_mecanismos", column: "mecanismo_id" },
      { schema: SUPABASE, table: "mecanismos", column: "id" },
    ],
    executor: "mechanisms",
    summaryField: "typesUsed",
  },

  catalog_mechanisms: {
    id: "catalog_mechanisms",
    domain: "mechanisms",
    label: "Tipos no catálogo",
    aliases: [
      "tipos no catalogo",
      "tipos no catálogo",
      "quantos tipos existem no catalogo",
      "quantos tipos existem no catálogo",
      "mecanismos cadastrados",
      "catalogo de mecanismos",
    ],
    description: "Quantidade de mecanismos distintos cadastrados em public.mecanismos. Não confundir com vínculos.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "mechanisms",
    formula: "count(*) / count(distinct id) em public.mecanismos",
    inclusionRules: ["registro em public.mecanismos"],
    exclusionRules: [],
    supportedFilters: [],
    sources: [{ schema: SUPABASE, table: "mecanismos", column: "id" }],
    executor: "mechanisms",
    summaryField: "catalogMechanisms",
  },

  most_used_mechanism: {
    id: "most_used_mechanism",
    domain: "mechanisms",
    label: "Mecanismo mais utilizado",
    aliases: [
      "mecanismo mais utilizado",
      "mecanismo mais usado",
      "qual mecanismo aparece em mais clientes",
      "mecanismo com mais clientes",
      "tipo de mecanismo mais frequente",
    ],
    description:
      "Mecanismo vinculado ao maior número de clientes distintos após deduplicação client_id+mecanismo_id (BASE QV). Não confundir com mais implementado nem com sugestões do App Pharus.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "mechanism",
    formula: "count(distinct client_id) group by mecanismo_id; maior contagem; empates retornados em ties",
    inclusionRules: ["vínculos da coleção deduplicada client_id+mecanismo_id"],
    exclusionRules: ["sugestões do App Pharus", "linhas brutas duplicadas"],
    supportedFilters: ["status", "engineer", "mechanismStatus", "mechanism", "hasImplementation", "segment"],
    sources: [
      { schema: SUPABASE, table: "client_mecanismos", column: "mecanismo_id" },
      { schema: SUPABASE, table: "mecanismos", column: "name" },
    ],
    executor: "mechanisms",
    summaryField: "topMechanism",
    answerTemplate:
      "O mecanismo mais utilizado é {name}, presente em {clientCount} clientes.",
  },

  types_unused: {
    id: "types_unused",
    domain: "mechanisms",
    label: "Tipos sem utilização",
    aliases: [
      "tipos sem utilizacao",
      "tipos sem utilização",
      "tipos nao utilizados",
      "tipos não utilizados",
      "tipos ainda nao vinculados",
    ],
    description: "Tipos do catálogo sem correspondência em client_mecanismos. Não é erro técnico.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "mechanisms",
    formula: "catálogo − tipos utilizados",
    inclusionRules: ["id em mecanismos sem ocorrência em client_mecanismos"],
    exclusionRules: [],
    supportedFilters: [],
    sources: [
      { schema: SUPABASE, table: "mecanismos", column: "id" },
      { schema: SUPABASE, table: "client_mecanismos", column: "mecanismo_id" },
    ],
    executor: "mechanisms",
    summaryField: "typesUnused",
  },

  available_mechanisms: {
    id: "available_mechanisms",
    domain: "mechanisms",
    label: "Vínculos cliente + mecanismo",
    aliases: [
      "vinculos cliente mecanismo",
      "vínculos cliente + mecanismo",
      "mecanismos previstos para os clientes",
      "recomendacoes de mecanismos",
      "mecanismos disponiveis",
      "quantos mecanismos foram previstos",
      "associacoes cliente mecanismo",
    ],
    description: "Combinações únicas de cliente e mecanismo após deduplicação. Não é a quantidade de tipos do catálogo.",
    aggregation: "sum",
    allowedAggregations: ["sum", "count"],
    unit: "mechanisms",
    formula: "count(distinct client_id, mecanismo_id) — soma de available por cliente.",
    inclusionRules: ["par client_id+mecanismo_id deduplicado"],
    exclusionRules: ["duplicatas client_id+mecanismo_id"],
    supportedFilters: ["status", "engineer", "mechanismStatus"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "mecanismo_id" }],
    executor: "mechanisms",
    summaryField: "availableMechanisms",
    clientSumField: "available",
  },

  implemented_mechanisms: {
    id: "implemented_mechanisms",
    domain: "mechanisms",
    label: "Mecanismos implementados",
    aliases: [
      "mecanismos implementados",
      "recomendacoes implementadas",
      "quantos foram implementados",
      "vinculos implementados",
      "mecanismos concluidos",
      "implementados",
    ],
    description: "Vínculos cliente × mecanismo com status normalizado como Implementado (concluído).",
    aggregation: "sum",
    allowedAggregations: ["sum"],
    unit: "mechanisms",
    formula: "Status concluido/implementado → Implementado. Soma de implemented por cliente.",
    inclusionRules: ["status Implementado"],
    exclusionRules: ["status apto ou em andamento"],
    supportedFilters: ["status", "engineer", "client_status"],
    sources: [
      { schema: SUPABASE, table: "client_mecanismos", column: "status" },
      { schema: SUPABASE, table: "client_mecanismos", column: "implemented_at" },
    ],
    executor: "mechanisms",
    summaryField: "implementedMechanisms",
    clientSumField: "implemented",
  },

  in_progress_mechanisms: {
    id: "in_progress_mechanisms",
    domain: "mechanisms",
    label: "Em andamento",
    aliases: ["em andamento", "mecanismos em andamento", "mecanismos iniciados", "implementacoes em andamento"],
    description: "Vínculos com status Iniciado / Em andamento.",
    aggregation: "sum",
    allowedAggregations: ["sum"],
    unit: "mechanisms",
    formula: "Status iniciado → Em andamento. Soma de inProgress por cliente.",
    inclusionRules: ["status Em andamento"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "status" }],
    executor: "mechanisms",
    summaryField: "inProgressMechanisms",
    clientSumField: "inProgress",
  },

  eligible_mechanisms: {
    id: "eligible_mechanisms",
    domain: "mechanisms",
    label: "Aptos para iniciar",
    aliases: ["aptos para iniciar", "mecanismos aptos", "aptos", "recomendacoes ainda nao iniciadas"],
    description: "Vínculos com status Apto (ainda não iniciados).",
    aggregation: "sum",
    allowedAggregations: ["sum"],
    unit: "mechanisms",
    formula: "Status apto → Apto. Soma de eligible por cliente.",
    inclusionRules: ["status Apto"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "status" }],
    executor: "mechanisms",
    summaryField: "eligibleMechanisms",
    clientSumField: "eligible",
  },

  implementation_rate: {
    id: "implementation_rate",
    domain: "mechanisms",
    label: "Percentual implementado",
    aliases: [
      "percentual implementado",
      "taxa de implementacao",
      "qual o percentual implementado",
    ],
    description: "Vínculos implementados ÷ total de vínculos cliente+mecanismo × 100. Denominador nunca é a contagem de tipos (15 ou 19).",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "implementedMechanisms / availableMechanisms × 100",
    numerator: "vínculos implementados",
    denominator: "vínculos cliente × mecanismo",
    inclusionRules: ["vínculos > 0"],
    exclusionRules: ["sem vínculos"],
    supportedFilters: ["status", "engineer", "segment"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "status" }],
    executor: "mechanisms",
    summaryField: "implementationPercent",
  },

  median_days_to_first_implementation: {
    id: "median_days_to_first_implementation",
    domain: "mechanisms",
    label: "Tempo típico até a primeira implementação",
    aliases: [
      "tempo tipico ate a primeira implementacao",
      "mediana ate a primeira implementacao",
      "mediana ate o primeiro mecanismo",
      "dias tipicos ate a primeira implementacao",
      "tempo tipico ate o primeiro mecanismo",
    ],
    description:
      "Mediana dos dias entre a contratação e a primeira implementação concluída (página Mecanismos). A média também é calculada e exibida como complementar.",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "days",
    formula:
      "Por cliente: dias = primeira implemented_at de mecanismo Implementado − data de contratação. Mediana desses dias (valor típico). Média aritmética também disponível.",
    numerator: null,
    denominator: "clientes com daysToFirstImplementation calculável",
    dateStart: "data de contratação",
    dateEnd: "implemented_at da primeira implementação",
    inclusionRules: ["mecanismo concluído com implemented_at", "datas válidas"],
    exclusionRules: ["data ausente", "intervalo não calculável"],
    supportedFilters: ["status", "engineer"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "client_mecanismos", column: "implemented_at" },
    ],
    executor: "mechanisms",
    summaryField: "typicalDaysToFirstImplementation",
    averageSummaryField: "averageDaysToFirstImplementation",
    rowField: "daysToFirstImplementation",
  },

  average_days_to_first_implementation: {
    id: "average_days_to_first_implementation",
    domain: "mechanisms",
    label: "Média de dias até a primeira implementação",
    aliases: [
      "media ate a primeira implementacao",
      "media de dias ate a primeira implementacao",
      "media ate o primeiro mecanismo",
      "dias ate o primeiro mecanismo",
      "tempo medio ate o primeiro mecanismo",
      "qual e a media ate a primeira implementacao",
      "qual e a media ate o primeiro mecanismo",
    ],
    description: "Média aritmética dos dias até a primeira implementação (página Mecanismos — summary.averageDaysToFirstImplementation).",
    aggregation: "average",
    allowedAggregations: ["average", "median", "comparison"],
    unit: "days",
    formula: "Média aritmética de daysToFirstImplementation dos clientes com valor calculável.",
    dateStart: "data de contratação",
    dateEnd: "implemented_at",
    inclusionRules: ["datas válidas", "implementação concluída"],
    exclusionRules: ["data ausente"],
    supportedFilters: ["status", "engineer"],
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "client_mecanismos", column: "implemented_at" },
    ],
    executor: "mechanisms",
    summaryField: "averageDaysToFirstImplementation",
    medianSummaryField: "typicalDaysToFirstImplementation",
    rowField: "daysToFirstImplementation",
  },

  clients_with_recent_implementation: {
    id: "clients_with_recent_implementation",
    domain: "mechanisms",
    label: "Clientes com implementação recente",
    aliases: ["implementacao recente", "implementaram nos ultimos 30 dias"],
    description: "Clientes com pelo menos um mecanismo implementado nos últimos 30 dias.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "hasImplementationLast30Days === true",
    inclusionRules: ["implemented_at nos últimos 30 dias"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "implemented_at" }],
    executor: "mechanisms",
    summaryField: "clientsWithRecentImplementation",
    rowPredicate: (r) => r.hasImplementationLast30Days === true,
  },

  clients_with_exactly_one_available_mechanism: {
    id: "clients_with_exactly_one_available_mechanism",
    domain: "mechanisms",
    label: "Clientes com exatamente 1 mecanismo disponível",
    aliases: [
      "clientes com exatamente 1 mecanismo disponivel",
      "clientes com um mecanismo disponivel",
      "usam 1 mecanismo disponivel",
    ],
    description: "Clientes cujo total de mecanismos disponíveis (deduplicados) é exatamente 1.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "available === 1",
    inclusionRules: ["available == 1"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "mecanismo_id" }],
    executor: "mechanisms",
    rowPredicate: (r) => Number(r.available) === 1,
  },

  clients_with_exactly_one_implemented_mechanism: {
    id: "clients_with_exactly_one_implemented_mechanism",
    domain: "mechanisms",
    label: "Clientes com exatamente 1 mecanismo implementado",
    aliases: [
      "clientes com exatamente 1 mecanismo implementado",
      "clientes com um mecanismo implementado",
      "usam 1 mecanismo implementado",
      "possuem exatamente um mecanismo implementado",
    ],
    description: "Clientes com exatamente um mecanismo no status Implementado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "implemented === 1",
    inclusionRules: ["implemented == 1"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "status" }],
    executor: "mechanisms",
    rowPredicate: (r) => Number(r.implemented) === 1,
  },

  clients_with_exactly_one_in_progress_mechanism: {
    id: "clients_with_exactly_one_in_progress_mechanism",
    domain: "mechanisms",
    label: "Clientes com exatamente 1 mecanismo em andamento",
    aliases: ["clientes com exatamente 1 mecanismo iniciado", "um mecanismo em andamento"],
    description: "Clientes com exatamente um mecanismo Em andamento.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "inProgress === 1",
    inclusionRules: ["inProgress == 1"],
    exclusionRules: [],
    supportedFilters: ["status", "engineer"],
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "status" }],
    executor: "mechanisms",
    rowPredicate: (r) => Number(r.inProgress) === 1,
  },

  /* -------------------- APP PHARUS (sugestões) -------------------- */
  pharus_users_with_suggestions: {
    id: "pharus_users_with_suggestions",
    domain: "pharus_mechanisms",
    label: "Usuários com mecanismos sugeridos (App Pharus)",
    aliases: [
      "usuarios com mecanismos sugeridos no app pharus",
      "usuários com mecanismos sugeridos no app pharus",
      "quantos usuarios tem mecanismos sugeridos no app pharus",
      "quantos usuários têm mecanismos sugeridos no app pharus",
      "mecanismos sugeridos no app pharus",
    ],
    description: "Usuários distintos com ao menos uma sugestão em user_mechanisms no App Pharus. Não é implementação.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "users",
    formula: "count(distinct user_id) em user_mechanisms",
    sources: [
      { schema: "app_pharus", table: "user_mechanisms", column: "user_id" },
    ],
    executor: "pharus_mechanisms",
    summaryField: "usersWithSuggestions",
    sourceLabel: "App Pharus",
  },
  pharus_total_suggestions: {
    id: "pharus_total_suggestions",
    domain: "pharus_mechanisms",
    label: "Total de sugestões (App Pharus)",
    aliases: [
      "total de sugestoes no app pharus",
      "total de sugestões no app pharus",
      "quantas sugestoes de mecanismos no app pharus",
      "quantas sugestões de mecanismos no app pharus",
      "quantos mecanismos estao sugeridos no app pharus",
      "quantos mecanismos estão sugeridos no app pharus",
    ],
    description: "Contagem de registros em user_mechanisms no App Pharus (sugestões, não implementações).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "suggestions",
    formula: "count(*) em user_mechanisms",
    sources: [{ schema: "app_pharus", table: "user_mechanisms", column: "id" }],
    executor: "pharus_mechanisms",
    summaryField: "totalSuggestions",
    sourceLabel: "App Pharus",
  },
  pharus_top_suggested_mechanism: {
    id: "pharus_top_suggested_mechanism",
    domain: "pharus_mechanisms",
    label: "Mecanismo mais sugerido (App Pharus)",
    aliases: [
      "mecanismo mais sugerido no app pharus",
      "qual mecanismo e mais sugerido no app pharus",
      "qual mecanismo é mais sugerido no app pharus",
      "mecanismo mais recomendado no app pharus",
    ],
    description: "Mecanismo com mais ocorrências em user_mechanisms ⋉ mechanisms.data no App Pharus.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "mechanism",
    formula: "mode(mechanism name) em sugestões App Pharus",
    sources: [
      { schema: "app_pharus", table: "user_mechanisms", column: "mechanism_id" },
      { schema: "app_pharus", table: "mechanisms", column: "data" },
    ],
    executor: "pharus_mechanisms",
    summaryField: "topSuggestedMechanism",
    sourceLabel: "App Pharus",
  },

  /* -------------------- ATENDIMENTO (research.acionamentos) -------------------- */
  total_support_tickets: {
    id: "total_support_tickets",
    domain: "support",
    label: "Total de acionamentos",
    aliases: [
      "quantos acionamentos temos",
      "quantos chamados",
      "quantas solicitacoes",
      "quantas solicitações",
      "total de acionamentos",
      "quantidade de acionamentos",
      "quantos acionamentos",
      "total de chamados",
    ],
    description: "Contagem distinta de acionamentos em research.acionamentos (mesmo payload do dashboard Atendimento).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "count(distinct id)",
    supportedFilters: ["area_setor", "area", "priority", "status", "tipo_solicitacao", "type", "requester", "solicitante"],
    sources: [{ schema: "research", table: "acionamentos", column: "id" }],
    executor: "support",
    summaryField: "totalTickets",
  },
  open_support_tickets: {
    id: "open_support_tickets",
    domain: "support",
    label: "Acionamentos abertos",
    aliases: [
      "quantos estao abertos",
      "quantos estão abertos",
      "acionamentos abertos",
      "chamados abertos",
      "quantos acionamentos abertos",
    ],
    description: "Acionamentos ainda sem resolução (status novo/aberto/pendente/em andamento).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "isOpen === true",
    supportedFilters: ["area_setor", "area", "priority"],
    sources: [{ schema: "research", table: "acionamentos", column: "status" }],
    executor: "support",
    summaryField: "openTickets",
  },
  urgent_support_tickets: {
    id: "urgent_support_tickets",
    domain: "support",
    label: "Acionamentos urgentes",
    aliases: [
      "quantos acionamentos urgentes",
      "acionamentos urgentes",
      "chamados urgentes",
      "quantos sao urgentes",
      "quantos são urgentes",
    ],
    description: "Acionamentos com prioridade normalizada Urgente.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "prioridade normalizada = Urgente",
    supportedFilters: ["area_setor", "area"],
    sources: [{ schema: "research", table: "acionamentos", column: "prioridade" }],
    executor: "support",
    summaryField: "urgentTickets",
  },
  resolved_support_tickets: {
    id: "resolved_support_tickets",
    domain: "support",
    label: "Acionamentos resolvidos",
    aliases: ["acionamentos resolvidos", "chamados resolvidos", "quantos foram resolvidos"],
    description: "Acionamentos com resolved_at ou status resolvido/concluído/fechado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "resolved_at not null OR status resolvido",
    sources: [{ schema: "research", table: "acionamentos", column: "resolved_at" }],
    executor: "support",
    summaryField: "resolvedTickets",
  },
  resolution_rate: {
    id: "resolution_rate",
    domain: "support",
    label: "Taxa de resolução",
    aliases: ["taxa de resolucao", "taxa de resolução", "percentual resolvido"],
    description: "Percentual de acionamentos já finalizados.",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "resolvedTickets / totalTickets",
    sources: [{ schema: "research", table: "acionamentos", column: "resolved_at" }],
    executor: "support",
    summaryField: "resolutionRate",
  },
  median_resolution_time: {
    id: "median_resolution_time",
    domain: "support",
    label: "Tempo típico de resolução",
    aliases: [
      "tempo tipico de resolucao",
      "tempo típico de resolução",
      "mediana de resolucao",
      "por que o tempo de resolucao nao e calculavel",
      "por que o tempo de resolução não é calculável",
    ],
    description: "Mediana em horas entre abertura e resolução (não calculável sem resolvidos válidos).",
    aggregation: "median",
    allowedAggregations: ["median"],
    unit: "hours",
    formula: "median(resolutionHours) com datas válidas",
    sources: [
      { schema: "research", table: "acionamentos", column: "data_abertura" },
      { schema: "research", table: "acionamentos", column: "resolved_at" },
    ],
    executor: "support",
    summaryField: "medianResolutionHours",
  },
  identified_support_clients: {
    id: "identified_support_clients",
    domain: "support",
    label: "Clientes identificados",
    aliases: [
      "quantos clientes distintos tiveram acionamentos",
      "quantos clientes foram identificados",
      "clientes identificados",
      "clientes distintos com acionamentos",
    ],
    description: "Quantidade de clientes distintos (baseqv_client_id) identificados na BASE QV via research.v_acionamentos_tratados.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count(distinct baseqv_client_id)",
    sources: [
      { schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" },
    ],
    executor: "support",
    summaryField: "identifiedClients",
  },
  tickets_with_identified_client: {
    id: "tickets_with_identified_client",
    domain: "support",
    label: "Acionamentos com cliente identificado",
    aliases: [
      "quantos acionamentos possuem clientes identificados",
      "acionamentos com cliente identificado",
      "acionamentos com cliente",
    ],
    description: "Acionamentos distintos com pelo menos um baseqv_client_id válido.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "count(distinct id) com baseqv_client_id",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    executor: "support",
    summaryField: "ticketsWithClient",
  },
  support_identification_coverage: {
    id: "support_identification_coverage",
    domain: "support",
    label: "Cobertura de identificação",
    aliases: [
      "qual e a cobertura de identificacao",
      "qual é a cobertura de identificação",
      "cobertura de identificacao",
      "cobertura de identificação",
    ],
    description: "Percentual de acionamentos com pelo menos um cliente identificado.",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "ticketsWithClient / totalTickets",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    executor: "support",
    summaryField: "identificationCoverage",
  },
  unidentified_support_clients: {
    id: "unidentified_support_clients",
    domain: "support",
    label: "Acionamentos sem cliente identificado",
    aliases: [
      "quantos acionamentos sem cliente",
      "acionamentos sem cliente identificado",
      "quantos clientes nao foram identificados",
      "quantos clientes não foram identificados",
      "clientes nao identificados",
      "clientes não identificados",
    ],
    description: "Acionamentos sem nenhum baseqv_client_id válido após o tratamento.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "count(distinct id) sem baseqv_client_id",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    executor: "support",
    summaryField: "ticketsWithoutClient",
  },
  support_identified_from_description: {
    id: "support_identified_from_description",
    domain: "support",
    label: "Clientes identificados pela descrição",
    aliases: [
      "quantos clientes foram encontrados pela descricao",
      "quantos clientes foram encontrados pela descrição",
      "identificados pela descricao",
      "identificados pela descrição",
    ],
    description: "Acionamentos em que o cliente foi identificado a partir de e-mail na descrição.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "email_identificado_origem / qualidade.clientes_identificados_pela_descricao",
    sources: [
      { schema: "research", table: "v_acionamentos_tratados", column: "email_identificado_origem" },
      { schema: "research", table: "v_acionamentos_qualidade_email", column: "clientes_identificados_pela_descricao" },
    ],
    executor: "support",
    summaryField: "identifiedFromDescription",
  },
  support_corporate_email_tickets: {
    id: "support_corporate_email_tickets",
    domain: "support",
    label: "Acionamentos com e-mail corporativo",
    aliases: [
      "quantos acionamentos tinham e-mail corporativo",
      "email corporativo",
      "e-mail corporativo",
      "quartavia no campo",
    ],
    description: "Acionamentos com @quartavia.com.br no campo de e-mail (contato interno).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "email_campo_corporativo = true",
    sources: [
      { schema: "research", table: "v_acionamentos_tratados", column: "email_campo_corporativo" },
      { schema: "research", table: "v_acionamentos_qualidade_email", column: "email_quartavia_no_campo_cliente" },
    ],
    executor: "support",
    summaryField: "corporateEmailTickets",
  },
  support_multiple_clients_tickets: {
    id: "support_multiple_clients_tickets",
    domain: "support",
    label: "Acionamentos com múltiplos clientes",
    aliases: [
      "quantos possuem multiplos clientes",
      "quantos possuem múltiplos clientes",
      "acionamentos com multiplos clientes",
      "acionamentos com múltiplos clientes",
    ],
    description: "Acionamentos relacionados a mais de um cliente distinto na BASE QV.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "baseqv_quantidade_matches > 1",
    sources: [
      { schema: "research", table: "v_acionamentos_tratados", column: "baseqv_quantidade_matches" },
      { schema: "research", table: "v_acionamentos_qualidade_email", column: "com_multiplos_clientes_encontrados" },
    ],
    executor: "support",
    summaryField: "ticketsWithMultipleClients",
  },
  support_unmatched_emails: {
    id: "support_unmatched_emails",
    domain: "support",
    label: "E-mails sem correspondência",
    aliases: [
      "quantos e-mails nao tiveram correspondencia",
      "quantos e-mails não tiveram correspondência",
      "email sem match",
      "e-mail sem match",
    ],
    description: "Acionamentos com e-mail externo sem match na BASE QV.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "classificacao / qualidade.email_cliente_sem_match_baseqv",
    sources: [
      { schema: "research", table: "v_acionamentos_qualidade_email", column: "email_cliente_sem_match_baseqv" },
    ],
    executor: "support",
    summaryField: "unmatchedEmailTickets",
  },
  support_needs_reprocessing: {
    id: "support_needs_reprocessing",
    domain: "support",
    label: "Pendentes de reprocessamento",
    aliases: [
      "quantos precisam de reprocessamento",
      "precisa reprocessar",
      "pendentes de reprocessamento",
    ],
    description: "Acionamentos marcados para reprocessamento do tratamento de e-mail.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "precisa_reprocessar / aguardando_processamento",
    sources: [
      { schema: "research", table: "v_acionamentos_tratados", column: "precisa_reprocessar" },
      { schema: "research", table: "v_acionamentos_qualidade_email", column: "aguardando_processamento" },
    ],
    executor: "support",
    summaryField: "needsReprocessing",
  },
  top_support_clients: {
    id: "top_support_clients",
    domain: "support",
    label: "Clientes com mais acionamentos",
    aliases: [
      "quais clientes tem mais acionamentos",
      "quais clientes têm mais acionamentos",
      "clientes com maior volume de acionamentos",
      "top clientes atendimento",
    ],
    description: "Top clientes distintos por quantidade de acionamentos (baseqv_client_id).",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    formula: "top 10 count(distinct id) by baseqv_client_id",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    executor: "support",
    summaryField: "clientsWithMostTickets",
  },
  top_support_area: {
    id: "top_support_area",
    domain: "support",
    label: "Área com mais acionamentos",
    aliases: [
      "qual area tem mais acionamentos",
      "qual área tem mais acionamentos",
      "qual area recebeu mais acionamentos",
      "qual área recebeu mais acionamentos",
      "area com mais acionamentos",
      "área com mais acionamentos",
    ],
    description: "Área/setor com maior volume de acionamentos no período (research.acionamentos.area_setor).",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    formula: "argmax(count by area_setor)",
    sources: [{ schema: "research", table: "acionamentos", column: "area_setor" }],
    executor: "support",
    summaryField: "topArea",
  },
  top_support_type: {
    id: "top_support_type",
    domain: "support",
    label: "Tipo de solicitação mais frequente",
    aliases: [
      "qual o tipo de solicitacao mais frequente",
      "qual o tipo de solicitação mais frequente",
      "tipo mais frequente",
      "tipo de solicitacao mais comum",
      "tipo de solicitação mais comum",
    ],
    description: "Tipo de solicitação com maior volume no período.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    formula: "argmax(count by tipo_solicitacao)",
    sources: [{ schema: "research", table: "acionamentos", column: "tipo_solicitacao" }],
    executor: "support",
    summaryField: "topType",
  },
  top_support_requesters: {
    id: "top_support_requesters",
    domain: "support",
    label: "Solicitantes com maior volume",
    aliases: [
      "quais solicitantes abriram mais acionamentos",
      "solicitantes com mais acionamentos",
      "quem abriu mais acionamentos",
      "top solicitantes atendimento",
    ],
    description: "Top 10 solicitantes por volume de acionamentos (research.acionamentos.nome_solicitante).",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    formula: "top(nome_solicitante)",
    sources: [{ schema: "research", table: "acionamentos", column: "nome_solicitante" }],
    executor: "support",
    summaryField: null,
  },
  support_without_area: {
    id: "support_without_area",
    domain: "support",
    label: "Acionamentos sem área",
    aliases: [
      "quantos registros nao tem area",
      "quantos registros não têm área",
      "acionamentos sem area",
      "acionamentos sem área",
      "quantos nao tem area ou tipo",
      "quantos não têm área ou tipo",
    ],
    description: "Acionamentos sem area_setor informado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "area_setor vazia",
    sources: [{ schema: "research", table: "acionamentos", column: "area_setor" }],
    executor: "support",
    summaryField: "withoutArea",
  },
  support_without_type: {
    id: "support_without_type",
    domain: "support",
    label: "Acionamentos sem tipo",
    aliases: [
      "quantos registros nao tem tipo",
      "quantos registros não têm tipo",
      "acionamentos sem tipo",
    ],
    description: "Acionamentos sem tipo_solicitacao informado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "tickets",
    formula: "tipo_solicitacao vazia",
    sources: [{ schema: "research", table: "acionamentos", column: "tipo_solicitacao" }],
    executor: "support",
    summaryField: "withoutType",
  },
  support_monthly_evolution: {
    id: "support_monthly_evolution",
    domain: "support",
    label: "Evolução dos acionamentos",
    aliases: [
      "como os acionamentos evoluíram por mês",
      "como os acionamentos evoluíram",
      "evolucao dos acionamentos",
      "evolução dos acionamentos",
      "acionamentos por mes",
      "acionamentos por mês",
    ],
    description: "Série temporal de acionamentos por data_abertura (diária ≤45 dias; mensal acima).",
    aggregation: "trend",
    allowedAggregations: ["trend"],
    unit: "tickets",
    formula: "count(distinct id) by data_abertura",
    sources: [{ schema: "research", table: "acionamentos", column: "data_abertura" }],
    executor: "support",
    summaryField: null,
  },

  /* -------------------- PERFORMANCE DO EP -------------------- */
  ep_clients_by_advisor: {
    id: "ep_clients_by_advisor",
    domain: "ep_performance",
    label: "Clientes por EP",
    aliases: [
      "quantos clientes cada ep possui",
      "clientes por ep",
      "carteira por engenheiro",
      "clientes por engenheiro patrimonial",
    ],
    description: "Clientes distintos sob o EP atual (payload Performance do EP).",
    aggregation: "top",
    allowedAggregations: ["top", "count"],
    unit: "clients",
    formula: "count(distinct client_id) por engenheiro_patrimonial",
    sources: [{ schema: SUPABASE, table: "clients", column: "engenheiro_patrimonial" }],
    executor: "ep_performance",
    summaryField: null,
  },
  ep_meeting_coverage: {
    id: "ep_meeting_coverage",
    domain: "ep_performance",
    label: "Cobertura de reuniões por EP",
    aliases: [
      "qual e a cobertura de reunioes por ep",
      "qual é a cobertura de reuniões por ep",
      "cobertura de reunioes por ep",
      "cobertura de reuniões por ep",
    ],
    description: "Clientes com ≥1 reunião válida ÷ carteira do EP.",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "clientes com reunião / carteira",
    sources: [{ schema: SUPABASE, table: "clients", column: "id" }],
    executor: "ep_performance",
    summaryField: "meetingCoverage",
  },
  ep_clients_without_meeting: {
    id: "ep_clients_without_meeting",
    domain: "ep_performance",
    label: "Clientes sem reunião",
    aliases: [
      "quantos clientes estao sem reuniao",
      "quantos clientes estão sem reunião",
      "clientes sem reuniao",
      "clientes sem reunião",
    ],
    description: "Clientes da carteira sem nenhuma reunião válida.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "carteira − clientes com reunião",
    executor: "ep_performance",
    summaryField: "clientsWithoutMeeting",
  },
  ep_cancelled_share: {
    id: "ep_cancelled_share",
    domain: "ep_performance",
    label: "Percentual cancelado da carteira por EP",
    aliases: [
      "qual o percentual cancelado da carteira por ep",
      "percentual cancelado da carteira",
      "percentual cancelado por ep",
    ],
    description:
      "Cancelados confirmados ÷ carteira do EP atualmente vinculado (não é taxa temporal). Ressalva: pode não ser o EP histórico no cancelamento.",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "cancelados confirmados / carteira",
    executor: "ep_performance",
    summaryField: "cancelledShareOfPortfolio",
  },
  ep_nps: {
    id: "ep_nps",
    domain: "ep_performance",
    label: "NPS por EP",
    aliases: [
      "qual o nps por ep",
      "nps medio por ep",
      "nps médio por ep",
      "nps do engenheiro",
    ],
    description:
      "Índice NPS oficial (% Promotores − % Detratores) por EP atual; média da nota é secundária. Cobertura da carteira pode ser baixa.",
    aggregation: "value",
    allowedAggregations: ["value"],
    unit: "index",
    formula: "% promotores (9–10) − % detratores (0–6)",
    sources: [{ schema: SUPABASE, table: "nps_responses", column: "score" }],
    executor: "ep_performance",
    summaryField: "npsRaw",
  },
  ep_pharus_meetings: {
    id: "ep_pharus_meetings",
    domain: "ep_performance",
    label: "Reuniões no App Pharus",
    aliases: [
      "quantas reunioes foram registradas no app pharus",
      "quantas reuniões foram registradas no app pharus",
      "reunioes app pharus",
      "reuniões app pharus",
    ],
    description: "Reuniões do App Pharus (seção isolada do dashboard Performance EP).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "meetings",
    executor: "ep_performance",
    summaryField: null,
  },
  ep_small_samples: {
    id: "ep_small_samples",
    domain: "ep_performance",
    label: "EPs com amostra pequena",
    aliases: [
      "quais eps possuem amostra pequena",
      "eps com amostra pequena",
      "engenheiros com amostra pequena",
    ],
    description: "EPs com menos de 10 clientes na carteira.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "label",
    executor: "ep_performance",
    summaryField: null,
  },

  /* -------------------- CRUZAMENTOS ESTATÍSTICOS -------------------- */
  sc_top_association: {
    id: "sc_top_association",
    domain: "statistical_crosses",
    label: "Variáveis mais associadas ao cancelamento",
    aliases: [
      "quais variaveis tem maior associacao com cancelamento",
      "quais variáveis têm maior associação com cancelamento",
      "associacao com cancelamento",
      "associação com cancelamento",
    ],
    description: "Maior magnitude de associação observada (não causalidade).",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "association",
    executor: "statistical_crosses",
    summaryField: "topAssociationLabel",
  },
  sc_meetings_vs_cancel: {
    id: "sc_meetings_vs_cancel",
    domain: "statistical_crosses",
    label: "Reuniões e cancelamento",
    aliases: [
      "clientes com reunioes cancelam menos",
      "clientes com reuniões cancelam menos",
      "reunioes e cancelamento",
      "reuniões e cancelamento",
    ],
    description: "Diferença observada entre clientes com e sem reuniões.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "association",
    executor: "statistical_crosses",
    summaryField: null,
  },
  sc_segment_cancel: {
    id: "sc_segment_cancel",
    domain: "statistical_crosses",
    label: "Cancelamento por segmento",
    aliases: [
      "qual segmento possui maior percentual cancelado",
      "cancelamento por segmento",
      "percentual cancelado por segmento",
    ],
    description: "Percentual cancelado confirmado por segmento do portal.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "percent",
    executor: "statistical_crosses",
    summaryField: null,
  },
  sc_income_diff: {
    id: "sc_income_diff",
    domain: "statistical_crosses",
    label: "Diferença de renda ativos vs cancelados",
    aliases: [
      "qual a diferenca de renda entre ativos e cancelados",
      "qual a diferença de renda entre ativos e cancelados",
      "renda ativos e cancelados",
    ],
    description: "Diferença de medianas de renda entre grupos.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "association",
    executor: "statistical_crosses",
    summaryField: null,
  },
  sc_survival: {
    id: "sc_survival",
    domain: "statistical_crosses",
    label: "Curva de permanência",
    aliases: [
      "como esta a curva de permanencia",
      "como está a curva de permanência",
      "sobrevivencia",
      "sobrevivência",
      "kaplan meier",
    ],
    description: "Kaplan–Meier com evento = cancelamento confirmado.",
    aggregation: "trend",
    allowedAggregations: ["trend"],
    unit: "label",
    executor: "statistical_crosses",
    summaryField: null,
  },
  sc_nps: {
    id: "sc_nps",
    domain: "statistical_crosses",
    label: "NPS nos cruzamentos",
    aliases: [
      "nps versus cancelamento",
      "associacao nps churn",
      "associação nps churn",
      "promotores e detratores",
    ],
    description:
      "Índice NPS e associação com cancelamento (respostas após churn excluídas). Não é média da nota.",
    aggregation: "value",
    allowedAggregations: ["value"],
    unit: "index",
    formula: "% promotores − % detratores",
    sources: [{ schema: SUPABASE, table: "nps_responses", column: "score" }],
    executor: "statistical_crosses",
    summaryField: "npsIndex",
  },
  sc_excluded_variables: {
    id: "sc_excluded_variables",
    domain: "statistical_crosses",
    label: "Variáveis excluídas",
    aliases: [
      "quais variaveis foram excluidas por baixa cobertura",
      "quais variáveis foram excluídas por baixa cobertura",
      "variaveis excluidas",
      "variáveis excluídas",
    ],
    description: "Variáveis não analisadas e motivo.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    executor: "statistical_crosses",
    summaryField: null,
  },
  sc_confirmed_cancellations: {
    id: "sc_confirmed_cancellations",
    domain: "statistical_crosses",
    label: "Cancelamentos confirmados na análise",
    aliases: [
      "quantos cancelamentos confirmados entraram na analise",
      "quantos cancelamentos confirmados entraram na análise",
      "cancelamentos confirmados na amostra",
    ],
    description: "Eventos analíticos (churn/distrato) na população dos cruzamentos.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    executor: "statistical_crosses",
    summaryField: "confirmedCancellations",
  },

  /* -------------------- CANCELAMENTO (BASE QV) -------------------- */
  total_cancellations: {
    id: "total_cancellations",
    domain: "cancellations",
    label: "Cancelamentos efetivados",
    aliases: [
      "quantos clientes cancelaram",
      "quantos cancelamentos",
      "total de cancelamentos",
      "quantidade de cancelamentos",
      "clientes cancelados",
      "cancelamentos efetivados",
      "quantos foram efetivamente cancelados",
      "efetivamente cancelados",
    ],
    description:
      "Clientes com cancelamento efetivado (churn_efetivado_at ou distrato_assinado_at em registro não arquivado). Intenção e pedido não contam.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count(distinct client_id) com churn_efetivado_at ou distrato_assinado_at",
    supportedFilters: ["engineer", "segment", "reason", "category"],
    sources: [
      { schema: SUPABASE, table: "cancellations", column: "client_id" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "effectiveCancellations",
  },
  clients_in_cancellation_process: {
    id: "clients_in_cancellation_process",
    domain: "cancellations",
    label: "Clientes em processo de cancelamento",
    aliases: [
      "clientes em processo de cancelamento",
      "quantos clientes estao em processo de cancelamento",
      "em processo de cancelamento",
      "intencao ou pedido sem efetivacao",
      "quantos tem intencao ou pedido mas ainda nao foram cancelados",
    ],
    description:
      "Clientes distintos com data_pedido ou intencao_registrada_at, não arquivados e sem churn/distrato efetivado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula:
      "count(distinct client_id) com (data_pedido OU intencao_registrada_at) E sem churn_efetivado_at E sem distrato_assinado_at E archived_at null",
    sources: [
      { schema: SUPABASE, table: "cancellations", column: "data_pedido" },
      { schema: SUPABASE, table: "cancellations", column: "intencao_registrada_at" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "clientsInCancellationProcess",
  },
  typical_days_in_cancellation_process: {
    id: "typical_days_in_cancellation_process",
    domain: "cancellations",
    label: "Tempo típico em processo de cancelamento",
    aliases: [
      "tempo tipico no processo de cancelamento",
      "mediana de dias em processo de cancelamento",
      "quanto tempo tipico no processo de cancelamento",
    ],
    description:
      "Mediana de dias em processo para clientes ainda não efetivados (hoje − data de entrada = coalesce(data_pedido, intencao_registrada_at)).",
    aggregation: "median",
    allowedAggregations: ["median"],
    unit: "days",
    executor: "cancellations",
    summaryField: "timing.medianDaysInProcess.median",
  },
  cancellation_intentions: {
    id: "cancellation_intentions",
    domain: "cancellations",
    label: "Intenções de cancelamento",
    aliases: [
      "quantos clientes registraram intenção de cancelamento",
      "intenções de cancelamento",
      "intencoes de cancelamento",
      "intenções registradas",
      "sinalizações de cancelamento",
    ],
    description:
      "Clientes distintos com intencao_registrada_at preenchido (não arquivados). Não retira da carteira ativa.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count(distinct client_id) com intencao_registrada_at",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "intencao_registrada_at" }],
    executor: "cancellations",
    summaryField: "intentionsRegistered",
  },
  cancellation_orders: {
    id: "cancellation_orders",
    domain: "cancellations",
    label: "Pedidos de cancelamento",
    aliases: [
      "quantos formalizaram pedido de cancelamento",
      "pedidos de cancelamento",
      "pedidos registrados",
      "quantos pedidos de cancelamento",
    ],
    description:
      "Clientes distintos com data_pedido preenchido (não arquivados). Não retira da carteira ativa.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count(distinct client_id) com data_pedido",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "data_pedido" }],
    executor: "cancellations",
    summaryField: "ordersRegistered",
  },
  cancellation_intention_to_order_rate: {
    id: "cancellation_intention_to_order_rate",
    domain: "cancellations",
    label: "Conversão intenção → pedido",
    aliases: [
      "qual a conversao de intencao para pedido",
      "conversão intenção para pedido",
      "taxa intenção pedido",
    ],
    description: "Pedidos / intenções (clientes distintos, não arquivados).",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "ordersRegistered / intentionsRegistered",
    sources: [
      { schema: SUPABASE, table: "cancellations", column: "intencao_registrada_at" },
      { schema: SUPABASE, table: "cancellations", column: "data_pedido" },
    ],
    executor: "cancellations",
    summaryField: "funnel.rateIntentionToOrder.rate",
  },
  cancellation_intention_to_effective_rate: {
    id: "cancellation_intention_to_effective_rate",
    domain: "cancellations",
    label: "Conversão intenção → efetivado",
    aliases: [
      "qual a conversao de intencao para cancelamento",
      "conversão intenção para cancelamento",
      "taxa intenção efetivado",
    ],
    description: "Efetivados que tiveram intenção / intenções.",
    aggregation: "rate",
    allowedAggregations: ["rate"],
    unit: "percent",
    formula: "efetivados_com_intencao / intentionsRegistered",
    sources: [
      { schema: SUPABASE, table: "cancellations", column: "intencao_registrada_at" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "funnel.rateIntentionToEffective.rate",
  },
  cancellation_passed_retention: {
    id: "cancellation_passed_retention",
    domain: "cancellations",
    label: "Passaram por retenção",
    aliases: [
      "quantos passaram por retencao",
      "quantos passaram por retenção",
      "passou por retenção",
      "casos em retenção",
    ],
    description: "Clientes com passou_retencao=true (etapa do processo; não implica retido).",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "count distinct com passou_retencao",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "passou_retencao" }],
    executor: "cancellations",
    summaryField: "retention.passedRetentionCount",
  },
  cancellation_distrato_signed_without_date: {
    id: "cancellation_distrato_signed_without_date",
    domain: "cancellations",
    label: "Distrato textual assinado sem data",
    aliases: [
      "quantos distratos aparecem como assinados sem data",
      "distrato assinado sem data",
      "distrato textual sem data",
    ],
    description:
      "Registros com distrato textual 'Assinado' e distrato_assinado_at vazio. Não contam como cancelamento efetivado.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "records",
    formula: "distrato='Assinado' e distrato_assinado_at null",
    sources: [
      { schema: SUPABASE, table: "cancellations", column: "distrato" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "distratoTextSignedWithoutDate",
  },
  median_order_to_effective_days: {
    id: "median_order_to_effective_days",
    domain: "cancellations",
    label: "Mediana entre pedido e cancelamento efetivado",
    aliases: [
      "qual a mediana entre pedido e cancelamento efetivado",
      "mediana pedido efetivado",
      "tempo entre pedido e churn",
    ],
    description: "Mediana de dias entre data_pedido e data analítica (churn/distrato), pares válidos.",
    aggregation: "median",
    allowedAggregations: ["median"],
    unit: "days",
    formula: "median(efetivado - pedido)",
    sources: [
      { schema: SUPABASE, table: "cancellations", column: "data_pedido" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "timing.medianOrderToEffective.median",
  },
  cancellations_with_reason: {
    id: "cancellations_with_reason",
    domain: "cancellations",
    label: "Cancelamentos com motivo informado",
    aliases: [
      "cancelamentos com motivo",
      "quantos cancelamentos tem motivo",
      "quantos cancelamentos têm motivo",
      "motivo informado",
    ],
    description: "Clientes cancelados com cancellations.motivo (ou fallback motivo_churn) preenchido.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "motivo preenchido",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    summaryField: "efetivadoReasonCoverage.withReason",
  },
  cancellations_without_reason: {
    id: "cancellations_without_reason",
    domain: "cancellations",
    label: "Cancelamentos sem motivo",
    aliases: [
      "cancelamentos sem motivo",
      "quantos cancelamentos sem motivo",
      "motivo ausente",
    ],
    description: "Cancelamentos efetivados sem motivo preenchido.",
    aggregation: "count",
    allowedAggregations: ["count"],
    unit: "clients",
    formula: "efetivado sem motivo",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    summaryField: "efetivadoReasonCoverage.withoutReason",
  },
  median_days_to_cancellation: {
    id: "median_days_to_cancellation",
    domain: "cancellations",
    label: "Tempo típico até o cancelamento",
    aliases: [
      "quanto tempo tipico os clientes ficam antes de cancelar",
      "quanto tempo típico os clientes ficam antes de cancelar",
      "tempo tipico ate o cancelamento",
      "tempo típico até o cancelamento",
      "permanencia ate cancelamento",
      "permanência até cancelamento",
      "mediana dias ate cancelamento",
    ],
    description: "Mediana de dias entre contratação (data_inicio_ciclo|created_at) e data consolidada de cancelamento.",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "days",
    formula: "median(cancelamento - contratacao)",
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "medianDaysToCancellation",
  },
  average_days_to_cancellation: {
    id: "average_days_to_cancellation",
    domain: "cancellations",
    label: "Tempo médio até o cancelamento",
    aliases: [
      "tempo medio ate o cancelamento",
      "tempo médio até o cancelamento",
      "media de dias ate cancelamento",
      "média de dias até cancelamento",
    ],
    description:
      "Média de dias entre contratação e data analítica de cancelamento (churn_efetivado_at ?? distrato_assinado_at).",
    aggregation: "average",
    allowedAggregations: ["average"],
    unit: "days",
    formula: "avg(cancelamento - contratacao)",
    sources: [
      { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
      { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
      { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
    ],
    executor: "cancellations",
    summaryField: "averageDaysToCancellation",
  },
  median_meetings_before_cancellation: {
    id: "median_meetings_before_cancellation",
    domain: "cancellations",
    label: "Reuniões típicas antes do cancelamento",
    aliases: [
      "quantas reunioes os clientes tiveram antes de cancelar",
      "quantas reuniões os clientes tiveram antes de cancelar",
      "reunioes antes do cancelamento",
      "reuniões antes do cancelamento",
      "mediana de reunioes antes do cancelamento",
    ],
    description: "Mediana da quantidade de reuniões com presença confirmada (compareceu) com data ≤ cancelamento.",
    aggregation: "median",
    allowedAggregations: ["median", "average", "comparison"],
    unit: "meetings",
    formula: "median(count reunioes compareceu <= cancelamento)",
    sources: [
      { schema: SUPABASE, table: "client_meetings", column: "start_time" },
      { schema: SUPABASE, table: "meeting_attendance", column: "status" },
    ],
    executor: "cancellations",
    summaryField: "medianMeetingsBeforeCancellation",
  },
  median_days_since_financial_update_before_cancellation: {
    id: "median_days_since_financial_update_before_cancellation",
    domain: "cancellations",
    label: "Dias desde a última atualização financeira antes do cancelamento",
    aliases: [
      "quanto tempo ficaram sem atualizacao financeira antes de cancelar",
      "quanto tempo ficaram sem atualização financeira antes de cancelar",
      "dias sem atualizacao financeira antes do cancelamento",
      "dias sem atualização financeira antes do cancelamento",
    ],
    description: "Mediana de dias entre a última atualização financeira (≤ cancelamento) e a data de cancelamento.",
    aggregation: "median",
    allowedAggregations: ["median", "average"],
    unit: "days",
    formula: "median(cancelamento - updated_at|created_at financeiro)",
    sources: [
      { schema: SUPABASE, table: "client_financial_data", column: "updated_at" },
      { schema: SUPABASE, table: "client_financial_data", column: "created_at" },
    ],
    executor: "cancellations",
    summaryField: "medianDaysSinceFinancialUpdate",
  },
  median_days_without_interaction_before_cancellation: {
    id: "median_days_without_interaction_before_cancellation",
    domain: "cancellations",
    label: "Dias desde a última reunião antes do cancelamento",
    aliases: [
      "dias sem interacao antes do cancelamento",
      "dias sem interação antes do cancelamento",
      "dias desde a ultima reuniao antes do cancelamento",
      "dias desde a última reunião antes do cancelamento",
      "quanto tempo sem reuniao antes de cancelar",
    ],
    description: "Interação v1: mediana de dias desde a última reunião com presença confirmada até o cancelamento.",
    aggregation: "median",
    allowedAggregations: ["median", "average"],
    unit: "days",
    formula: "median(cancelamento - ultima reuniao compareceu)",
    sources: [
      { schema: SUPABASE, table: "client_meetings", column: "start_time" },
      { schema: SUPABASE, table: "meeting_attendance", column: "status" },
    ],
    executor: "cancellations",
    summaryField: "medianDaysWithoutInteraction",
  },
  top_cancellation_reason: {
    id: "top_cancellation_reason",
    domain: "cancellations",
    label: "Motivo original mais comum de cancelamento",
    aliases: [
      "qual o motivo mais comum de cancelamento",
      "motivo mais comum",
      "motivo mais frequente de cancelamento",
      "principal motivo de cancelamento",
    ],
    description: "Texto original de motivo com maior quantidade entre cancelamentos com motivo informado.",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    formula: "argmax(count by cancellations.motivo)",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    summaryField: "topReason",
  },
  top_cancellation_reason_category: {
    id: "top_cancellation_reason_category",
    domain: "cancellations",
    label: "Principal categoria de cancelamento",
    aliases: [
      "qual a principal categoria de cancelamento",
      "categoria mais comum de cancelamento",
      "principal categoria de motivo",
      "categoria mais frequente de cancelamento",
    ],
    description: "Categoria analítica com maior volume (mesmo gráfico Cancelamentos por motivo).",
    aggregation: "top",
    allowedAggregations: ["top"],
    unit: "label",
    formula: "argmax(count by reasonCategory)",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    summaryField: "topReasonCategory",
  },
  cancellations_by_inactivity: {
    id: "cancellations_by_inactivity",
    domain: "cancellations",
    label: "Cancelamentos por inatividade",
    aliases: [
      "quantos cancelamentos foram por inatividade",
      "cancelamentos por inatividade",
      "cancelamentos por falta de engajamento",
      "inatividade e falta de engajamento",
    ],
    description: "Cancelamentos classificados como Inatividade e falta de engajamento.",
    aggregation: "count",
    unit: "clients",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    distributionLookup: {
      path: "distributions.byReasonCategory",
      label: "Inatividade e falta de engajamento",
    },
  },
  cancellations_by_financial: {
    id: "cancellations_by_financial",
    domain: "cancellations",
    label: "Cancelamentos por questões financeiras",
    aliases: [
      "quantos cancelaram por questoes financeiras",
      "quantos cancelaram por questões financeiras",
      "cancelamentos por questoes financeiras",
      "cancelamentos por questões financeiras",
      "cancelamentos financeiros",
    ],
    description: "Cancelamentos classificados como Questões financeiras.",
    aggregation: "count",
    unit: "clients",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    distributionLookup: { path: "distributions.byReasonCategory", label: "Questões financeiras" },
  },
  cancellations_by_non_renewal: {
    id: "cancellations_by_non_renewal",
    domain: "cancellations",
    label: "Cancelamentos por não renovação",
    aliases: [
      "cancelamentos por nao renovacao",
      "cancelamentos por não renovação",
      "quantos cancelamentos por nao renovacao",
      "quantos cancelamentos por não renovação",
    ],
    description: "Cancelamentos classificados como Não renovação.",
    aggregation: "count",
    unit: "clients",
    sources: [{ schema: SUPABASE, table: "cancellations", column: "motivo" }],
    executor: "cancellations",
    distributionLookup: { path: "distributions.byReasonCategory", label: "Não renovação" },
  },
};

export function getMetricDef(id) {
  return portalMetricCatalog[id] || null;
}

export function listMetricsForPlanner() {
  return Object.values(portalMetricCatalog).map((m) => ({
    id: m.id,
    domain: m.domain,
    label: m.label,
    aliases: m.aliases,
    aggregation: m.aggregation,
    allowedAggregations: m.allowedAggregations,
    unit: m.unit,
    description: m.description,
    formula: m.formula,
    supportedFilters: m.supportedFilters,
  }));
}

export function buildMetricDefinitionText(metricId) {
  const m = getMetricDef(metricId);
  if (!m) return null;
  const parts = [
    m.description,
    m.formula ? `Cálculo: ${m.formula}` : null,
    m.dateStart || m.dateEnd
      ? `Datas: início = ${m.dateStart || "—"}; fim = ${m.dateEnd || "—"}.`
      : null,
    m.inclusionRules?.length ? `Entram: ${m.inclusionRules.join("; ")}.` : null,
    m.exclusionRules?.length ? `Não entram: ${m.exclusionRules.join("; ")}.` : null,
    m.aggregation === "median"
      ? "O valor típico usa a mediana porque sofre menos influência de casos extremos."
      : m.aggregation === "average"
        ? (m.domain === "journey"
          ? "A página Jornada exibe a média aritmética deste indicador."
          : "A média aritmética é o valor complementar exibido junto à mediana na página.")
        : null,
  ].filter(Boolean);
  return parts.join(" ");
}

export function buildMetricLocationText(metricId) {
  const m = getMetricDef(metricId);
  if (!m?.sources?.length) return null;
  const locs = m.sources.map((s) => `${s.schema}.${s.table}.${s.column}`).join("; ");
  return `Os dados vêm de ${locs}.`;
}

/**
 * Detecta intenção semântica (prioridade: location > definition/formula > comparison > avg/median > value).
 */
export function detectSemanticIntent(question, conversationContext = {}) {
  const n = normalize(question);

  if (/^(qual a regra|e a regra|a regra\??|qual e a regra|qual a formula|e a formula)\??$/.test(n)
    || (/^(qual a regra|qual e a regra|qual a formula)\b/.test(n) && n.length < 40)) {
    return conversationContext.last_metric ? "formula" : "clarification";
  }
  if (/^(onde (esta|fica|fica esse|esta esse)|e a fonte|qual a fonte|onde est[aã] esse dado)/.test(n)
    || (/^onde\b/.test(n) && n.length < 50 && conversationContext.last_metric)) {
    return conversationContext.last_metric ? "location" : "location";
  }
  if (/^(quantos concluiram|quantos clientes concluiram|e quantos|quantos\??)$/.test(n)
    || (/^quantos (concluiram|sao)\??$/.test(n))) {
    return conversationContext.last_metric ? "value" : "value";
  }

  if (/\bonde\b|qual (schema|tabela|coluna)|em qual tabela|onde fica|onde esta|de onde vem|qual a fonte/.test(n)) {
    return "location";
  }
  if (/como (sao|e|estão|estão) contabiliz|como (sao|e) contad|o que significa|o que (e|é) considerad|como funciona a contagem|como se conta|definicao|definição|como (sao|e) classificados/.test(n)) {
    return "definition";
  }
  if (/como e calcul|como calcul|qual (e )?a regra|qual (e )?a formula|quais registros (entram|sao excluidos)|por que (usa|usa-se) (media|mediana)/.test(n)) {
    return "formula";
  }
  if (/media e (a )?mediana|mediana e (a )?media|ambas|compar(ar|e) media/.test(n)) {
    return "comparison";
  }
  if (/\bmediana\b|\btipic/.test(n) && !/\bmedia\b/.test(n)) return "median";
  if (/\bmedia\b/.test(n) && !/\bmediana\b/.test(n) && !/como e calcul/.test(n)) return "average";
  if (/\b(quant|qtd|numero|total|taxa|percentu|quanto|quantos|quantas)\b/.test(n)) return "value";
  if (/qualidade|preenchid|ausente|faltando/.test(n)) return "quality";
  if (/\be qual (e )?a regra\b/.test(n) || (/\bregra\b/.test(n) && /\bquant/.test(n))) return "mixed";
  return "general";
}

/**
 * Resolve métrica por aliases + contexto. Nunca usa total_clients como fallback.
 */
export function resolveMetricFromQuestion(question, conversationContext = {}, preferredDomain = null) {
  const n = normalize(question);
  const clarifications = [];
  let confidence = 0.5;

  // Follow-ups curtos usam última métrica
  const followUpOnly = /^(qual a regra|e a regra|a regra\??|qual e a regra|qual a formula|onde (esta|fica)( esse dado)?|e a fonte|quantos concluiram|quantos\??|qual a mediana|e a mediana|qual a media|e a media|media e mediana|qual o valor tipico)$/.test(n)
    || (n.length < 35 && /^(qual|e a|onde|quantos)/.test(n) && !/mecanismo|cliente|reuniao|onboarding|apex|private|renda|aporte|reserva|diagnostico|carteira/.test(n));

  if (followUpOnly && conversationContext.last_metric) {
    return {
      metricId: conversationContext.last_metric,
      domain: conversationContext.last_domain,
      confidence: 0.95,
      clarifications: [],
      fromContext: true,
    };
  }

  // Ambiguidade: "usam 1 mecanismo" / "com 1 mecanismo"
  if (/usam? 1 mecanismo|com 1 mecanismo|com um mecanismo|possuem? 1 mecanismo|possuem? um mecanismo/.test(n)
    && !/implementad|disponivel|iniciad|andamento|apto|conclu|pelo menos/.test(n)) {
    return {
      metricId: null,
      domain: "mechanisms",
      confidence: 0.4,
      clarifications: [
        "Você quer saber quantos clientes possuem pelo menos um mecanismo, exatamente um mecanismo disponível, ou exatamente um mecanismo implementado?",
      ],
      fromContext: false,
    };
  }

  const scored = [];
  for (const m of Object.values(portalMetricCatalog)) {
    let score = 0;
    for (const alias of m.aliases || []) {
      const a = normalize(alias);
      if (!a) continue;
      if (n === a || n.includes(a)) {
        const leftover = n.replace(a, " ").replace(/\s+/g, " ").trim();
        const leftoverWords = leftover.split(" ").filter((w) => w.length > 2);
        score = Math.max(score, a.length * 2 - leftoverWords.length * 8);
      }
    }
    const idBits = m.id.split("_").filter((b) => b.length > 3);
    let bitHits = 0;
    for (const b of idBits) if (n.includes(b)) bitHits += 1;
    if (bitHits >= 2) score = Math.max(score, 10 + bitHits);
    if (preferredDomain && m.domain === preferredDomain) score += 8;
    if (score > 0) scored.push({ m, score });
  }
  scored.sort((a, b) => b.score - a.score);

  if (!scored.length) {
    // Contexto: "média e mediana" / "a mediana" após métrica de dias
    if (conversationContext.last_metric && (/\bmedia\b|\bmediana\b|\btipic/.test(n))) {
      return {
        metricId: conversationContext.last_metric,
        domain: conversationContext.last_domain,
        confidence: 0.9,
        clarifications: [],
        fromContext: true,
      };
    }
    return { metricId: null, domain: null, confidence: 0.2, clarifications, fromContext: false };
  }

  const top = scored[0];
  confidence = Math.min(0.99, 0.55 + top.score / 40);

  // Tempo típico / mediana de implementação → sempre página Mecanismos
  if (/\bmediana\b|\btipic/.test(n) && /implement|mecanismo/.test(n)) {
    const med = portalMetricCatalog.median_days_to_first_implementation;
    if (med) {
      return { metricId: med.id, domain: med.domain, confidence: 0.95, clarifications: [], fromContext: false };
    }
  }

  // Média até 1ª implementação / 1º mecanismo → Mecanismos (exceto se pedir Jornada)
  if (/\bmedia\b/.test(n) && /(primeiro mecanismo|primeira implementacao)/.test(n)) {
    if (/jornada|onboarding/.test(n) || preferredDomain === "journey") {
      return {
        metricId: "average_days_to_first_mechanism",
        domain: "journey",
        confidence: 0.93,
        clarifications: [],
        fromContext: false,
      };
    }
    return {
      metricId: "average_days_to_first_implementation",
      domain: "mechanisms",
      confidence: 0.95,
      clarifications: [],
      fromContext: false,
    };
  }

  // Página atual resolve ambiguidade de domínio
  if (preferredDomain && scored.length > 1) {
    const sameDomain = scored.find((s) => s.m.domain === preferredDomain);
    if (sameDomain && sameDomain.score >= top.score - 4) {
      return {
        metricId: sameDomain.m.id,
        domain: sameDomain.m.domain,
        confidence: Math.min(0.99, 0.6 + sameDomain.score / 40),
        clarifications,
        fromContext: false,
      };
    }
  }

  return {
    metricId: top.m.id,
    domain: top.m.domain,
    confidence,
    clarifications,
    fromContext: false,
  };
}

/**
 * Planejador semântico local (fonte confiável; Gemini só sugere).
 */
export function normalizePortalPage(page) {
  const p = String(page || "").trim().toLowerCase();
  const map = {
    general: "general",
    journey: "journey",
    onboarding: "journey",
    plan: "patrimonial_plan",
    patrimonial_plan: "patrimonial_plan",
    meetings: "meetings",
    mechanisms: "mechanisms",
    financial: "financial_updates",
    financial_updates: "financial_updates",
    platform: "platform_usage",
    platform_usage: "platform_usage",
    support: "support",
    cancellations: "cancellations",
    ep: "ep_performance",
    "performance-ep": "ep_performance",
    ep_performance: "ep_performance",
    "statistical-crosses": "statistical_crosses",
    statistical_crosses: "statistical_crosses",
    quality: "quality",
  };
  return map[p] || p || null;
}

export function pageToCatalogDomain(page) {
  return normalizePortalPage(page);
}

function stripQuestionPrefix(n) {
  return n
    .replace(/^(me diga |informe |quero saber |pode me dizer )/, "")
    .replace(/^(qual( e| eh)? (a|o|as|os)? |quais (sao |as |os )?)/, "")
    .replace(/^(quantos? |quantas? |quanto e |quanto )/, "")
    .replace(/^(o |a |os |as )/, "")
    .trim();
}

/**
 * Correspondência determinística por aliases — confidence 1 quando única.
 */
export function matchMetricDeterministically(question, currentPage = null) {
  const n = normalize(question).replace(/[?¿!.,;:"'`´]+/g, " ").replace(/\s+/g, " ").trim();
  const stripped = stripQuestionPrefix(n);
  const pageDomain = pageToCatalogDomain(currentPage);
  const hits = [];

  for (const m of Object.values(portalMetricCatalog)) {
    for (const alias of m.aliases || []) {
      const a = normalize(alias);
      if (!a || a.length < 4) continue;

      let matchType = null;
      let score = 0;

      if (n === a || stripped === a) {
        matchType = "exact";
        score = 1000 + a.length;
      } else if (
        n === `qual ${a}`
        || n === `qual a ${a}`
        || n === `qual o ${a}`
        || n === `quais ${a}`
        || n === `quantos ${a}`
        || n === `quantas ${a}`
        || n === `quanto e ${a}`
      ) {
        matchType = "exact";
        score = 980 + a.length;
      } else if (a.length >= 8 && n.includes(a)) {
        matchType = "contains";
        const leftover = n.replace(a, " ").replace(/\s+/g, " ").trim();
        const leftoverWords = leftover.split(" ").filter((w) =>
          w.length > 2
          && !["qual", "quais", "quanto", "quantos", "quantas", "com", "sem", "dos", "das", "pelo", "pela", "uma", "uns", "sao", "tem", "temos"].includes(w));
        // Alias curto/genérico não pode ganhar com sobra semântica (ex.: "quantos clientes" ⊂ "usam 1 mecanismo")
        if (leftoverWords.length > 0 && a.length <= 20) {
          continue;
        }
        score = 100 + a.length - leftoverWords.length * 25;
      } else if (a.length >= 8 && stripped.includes(a)) {
        matchType = "contains";
        const leftover = stripped.replace(a, " ").replace(/\s+/g, " ").trim();
        const leftoverWords = leftover.split(" ").filter((w) => w.length > 2);
        if (leftoverWords.length > 0 && a.length <= 20) continue;
        score = 90 + a.length;
      }

      if (!matchType) continue;
      if (pageDomain && m.domain === pageDomain) score += 15;

      hits.push({
        metricId: m.id,
        domain: m.domain,
        label: m.label,
        alias: a,
        matchType,
        score,
      });
    }
  }

  if (!hits.length) return null;

  const byMetric = new Map();
  for (const h of hits) {
    const prev = byMetric.get(h.metricId);
    if (!prev || h.score > prev.score) byMetric.set(h.metricId, h);
  }

  const ranked = [...byMetric.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];

  if (ranked.length === 1 || top.score >= (ranked[1]?.score ?? 0) + 20) {
    return {
      domain: top.domain,
      metric: top.metricId,
      label: top.label,
      confidence: 1,
      source: "deterministic_alias",
    };
  }

  if (pageDomain) {
    const onPage = ranked.filter((r) => r.domain === pageDomain && r.score >= top.score - 15);
    if (onPage.length === 1) {
      return {
        domain: onPage[0].domain,
        metric: onPage[0].metricId,
        label: onPage[0].label,
        confidence: 1,
        source: "deterministic_alias_page",
      };
    }
  }

  const options = ranked.slice(0, 4).map((r) => ({
    domain: r.domain,
    metric: r.metricId,
    label: r.label,
  }));
  const labels = options.map((o) => o.label);
  let clarification;
  if (options.length === 2) {
    clarification = `Você quer saber sobre ${labels[0]} ou ${labels[1]}?`;
  } else {
    const last = labels.pop();
    clarification = `Você quer saber sobre ${labels.join(", ")} ou ${last}?`;
  }

  return {
    domain: null,
    metric: null,
    confidence: 0.45,
    source: "ambiguous",
    options,
    clarification,
  };
}

/**
 * Planejador semântico local (fonte confiável; Gemini só sugere).
 */
export function planSemanticQuery(question, conversationContext = {}, portalContext = {}, now = new Date()) {
  const n = normalize(question);
  let intent = detectSemanticIntent(question, conversationContext);
  const preferredDomain = pageToCatalogDomain(
    portalContext?.current_page
    || conversationContext?.current_page
    || conversationContext?.last_domain
    || null,
  );

  // 0) Follow-ups curtos de regra/fonte usam last_metric antes do matching
  const shortRuleFollowUp = /^(como e calculad[oa]\??|como calculad[oa]\??|qual a regra\??|qual e a regra\??|e a regra\??|a regra\??|qual a formula\??|e a formula\??|onde (esta|fica)( esse dado)?\??|e a fonte\??|qual a fonte\??)$/.test(n);
  if (shortRuleFollowUp && conversationContext.last_metric) {
    const lastDef = getMetricDef(conversationContext.last_metric);
    return {
      intent: /onde|fonte/.test(n) ? "location" : (intent === "location" ? "location" : "formula"),
      domain: conversationContext.last_domain || lastDef?.domain || null,
      metric: conversationContext.last_metric,
      aggregation: conversationContext.last_aggregation || lastDef?.aggregation || null,
      filters: conversationContext.last_filters || {},
      use_realtime_query: false,
      use_metric_definition: true,
      clarification: null,
      confidence: 1,
      match_source: "conversation_context",
      resolved_metric: {
        domain: conversationContext.last_domain || lastDef?.domain || null,
        metric: conversationContext.last_metric,
        label: lastDef?.label || null,
      },
      conversation_context: {
        ...conversationContext,
        last_intent: /onde|fonte/.test(n) ? "location" : "formula",
        current_page: portalContext?.current_page || conversationContext.current_page || null,
      },
    };
  }

  // Ambiguidade real de mecanismos antes do match genérico
  if (/usam? 1 mecanismo|com 1 mecanismo|com um mecanismo|possuem? 1 mecanismo|possuem? um mecanismo/.test(n)
    && !/implementad|disponivel|iniciad|andamento|apto|conclu|pelo menos/.test(n)) {
    return {
      intent: "clarification",
      domain: "mechanisms",
      metric: null,
      aggregation: null,
      filters: {},
      use_realtime_query: false,
      use_metric_definition: false,
      clarification:
        "Você quer saber quantos clientes possuem pelo menos um mecanismo, exatamente um mecanismo disponível, ou exatamente um mecanismo implementado?",
      confidence: 0.4,
      match_source: "ambiguity",
      conversation_context: conversationContext,
    };
  }

  // 1) Correspondência determinística (aliases) — sem esclarecimento
  const det = matchMetricDeterministically(question, preferredDomain);
  if (det?.clarification && !det.metric) {
    return {
      intent: "clarification",
      domain: det.domain,
      metric: null,
      aggregation: null,
      filters: {},
      use_realtime_query: false,
      use_metric_definition: false,
      clarification: det.clarification,
      confidence: det.confidence,
      match_source: det.source,
      options: det.options || [],
      conversation_context: conversationContext,
    };
  }

  let resolved;
  if (det?.metric && det.confidence >= 1) {
    resolved = {
      metricId: det.metric,
      domain: det.domain,
      confidence: 1,
      clarifications: [],
      fromContext: false,
      source: det.source,
    };
  } else {
    resolved = resolveMetricFromQuestion(question, conversationContext, preferredDomain);
  }

  if (resolved.clarifications?.length) {
    return {
      intent: "clarification",
      domain: resolved.domain,
      metric: null,
      aggregation: null,
      filters: {},
      use_realtime_query: false,
      use_metric_definition: false,
      clarification: resolved.clarifications.join(" "),
      confidence: resolved.confidence,
      conversation_context: conversationContext,
    };
  }

  let metricId = resolved.metricId;
  let domain = resolved.domain;
  let confidence = resolved.confidence;

  // Follow-up "qual a regra?" sem métrica
  if ((intent === "formula" || intent === "definition" || intent === "location") && !metricId) {
    if (conversationContext.last_metric) {
      metricId = conversationContext.last_metric;
      domain = conversationContext.last_domain;
      confidence = 0.9;
    } else {
      return {
        intent: "clarification",
        domain: null,
        metric: null,
        aggregation: null,
        filters: {},
        use_realtime_query: false,
        use_metric_definition: false,
        clarification: "Sobre qual indicador você quer a regra ou a fonte?",
        confidence: 0.5,
        conversation_context: conversationContext,
      };
    }
  }

  const def = metricId ? getMetricDef(metricId) : null;
  if (metricId && !def) {
    return {
      intent: "clarification",
      domain,
      metric: metricId,
      aggregation: null,
      filters: {},
      use_realtime_query: false,
      use_metric_definition: false,
      clarification: `A métrica "${metricId}" não está no catálogo.`,
      confidence: 0.3,
      conversation_context: conversationContext,
    };
  }

  // Aggregation preference
  let aggregation = def?.aggregation || null;
  if (intent === "average") aggregation = "average";
  if (intent === "median") aggregation = "median";
  if (intent === "comparison") aggregation = "comparison";
  if (intent === "value" && def) aggregation = def.aggregation;
  if (/\btipic/.test(n)) {
    aggregation = "median";
    if (intent === "value" || intent === "average") intent = "median";
  }

  // Mediana/típico sobre métrica de média (Jornada ou Mecanismos) → mediana da página Mecanismos
  if (intent === "median" && (
    metricId === "average_days_to_first_mechanism"
    || metricId === "average_days_to_first_implementation"
  )) {
    metricId = "median_days_to_first_implementation";
    domain = "mechanisms";
    aggregation = "median";
  }
  // Pediu média sobre o card de tempo típico → média complementar do mesmo payload
  if (intent === "average" && metricId === "median_days_to_first_implementation") {
    metricId = "average_days_to_first_implementation";
    aggregation = "average";
  }
  // Comparison sobre qualquer métrica de 1ª implementação → card Mecanismos (mediana+média)
  if (intent === "comparison" && (
    metricId === "average_days_to_first_mechanism"
    || metricId === "average_days_to_first_implementation"
    || metricId === "median_days_to_first_implementation"
  )) {
    metricId = "median_days_to_first_implementation";
    domain = "mechanisms";
    aggregation = "comparison";
  }

  const needsValue = ["value", "average", "median", "comparison", "mixed"].includes(intent);
  const needsDefinition = ["definition", "formula", "location"].includes(intent);

  // Never execute realtime for pure definition/formula/location
  const useRealtime = needsValue && confidence >= 0.8;
  const useDefinition = needsDefinition || intent === "mixed";

  if (confidence < 0.8 && !resolved.fromContext && needsValue && !metricId) {
    return {
      intent: "clarification",
      domain,
      metric: null,
      aggregation: null,
      filters: {},
      use_realtime_query: false,
      use_metric_definition: false,
      clarification: det?.clarification
        || "Não identifiquei o indicador. Pode citar o nome do card (ex.: renda mensal típica, total de clientes)?",
      confidence,
      conversation_context: conversationContext,
    };
  }

  // Determinístico ou alta confiança → sempre executar valor
  const finalConfidence = resolved.source?.startsWith("deterministic") ? 1 : confidence;
  const useRealtimeFinal = needsValue && (finalConfidence >= 0.8 || Boolean(metricId && def));

  const filters = {};
  if (domain === "support" || def?.domain === "support" || /acionamento|chamado|solicitac/.test(n)) {
    if (/app\s*pharus/.test(n)) filters.area_setor = "App Pharus";
    else if (/qv360\s*web/.test(n) || (/qv360/.test(n) && !/app/.test(n))) filters.area_setor = "QV360 Web";
    else if (/qv360\s*app/.test(n)) filters.area_setor = "QV360 App";
    if (/\bhoje\b/.test(n)) filters.opened = "today";
    if (/ultimo mes|último mês|ultimos? 30|últimos? 30/.test(n)) filters.opened = "last_month";
  }

  return {
    intent,
    domain: domain || def?.domain || null,
    metric: metricId,
    aggregation,
    filters,
    use_realtime_query: useRealtimeFinal,
    use_metric_definition: useDefinition,
    clarification: null,
    confidence: finalConfidence,
    match_source: resolved.source || "semantic",
    resolved_metric: metricId
      ? { domain: domain || def?.domain || null, metric: metricId, label: def?.label || null }
      : null,
    conversation_context: {
      last_domain: domain || def?.domain || conversationContext.last_domain || null,
      last_metric: metricId || conversationContext.last_metric || null,
      last_filters: conversationContext.last_filters || {},
      last_intent: intent,
      last_aggregation: aggregation || conversationContext.last_aggregation || null,
      current_page: portalContext?.current_page || conversationContext.current_page || null,
    },
  };
}

export function emptyConversationContext() {
  return {
    last_domain: null,
    last_metric: null,
    last_filters: {},
    last_intent: null,
    last_aggregation: null,
    current_page: null,
  };
}

export function mergeConversationContext(prev, nextPartial) {
  const base = { ...emptyConversationContext(), ...(prev || {}) };
  if (!nextPartial) return base;
  return {
    last_domain: nextPartial.last_domain ?? base.last_domain,
    last_metric: nextPartial.last_metric ?? base.last_metric,
    last_filters: nextPartial.last_filters ?? base.last_filters,
    last_intent: nextPartial.last_intent ?? base.last_intent,
    last_aggregation: nextPartial.last_aggregation ?? base.last_aggregation,
    current_page: nextPartial.current_page ?? base.current_page,
  };
}

/**
 * Valida plano semântico antes de executar.
 * confidence < 0.80 → não executar consulta de valor.
 */
export function validateSemanticQueryPlan(queryPlan, options = {}) {
  const minConfidence = options.minConfidence ?? 0.8;
  const errors = [];
  const warnings = [];

  if (!queryPlan || typeof queryPlan !== "object") {
    return { ok: false, errors: ["Plano ausente."], warnings, plan: null };
  }

  const plan = { ...queryPlan };
  const intent = plan.intent || "general";

  if (intent === "clarification" || plan.clarification) {
    return {
      ok: false,
      needsClarification: true,
      errors: [],
      warnings,
      clarification: plan.clarification || "Pode esclarecer a pergunta?",
      plan,
    };
  }

  if (plan.metric) {
    const def = getMetricDef(plan.metric);
    if (!def) {
      errors.push(`Métrica "${plan.metric}" não existe no catálogo.`);
    } else {
      if (plan.domain && plan.domain !== def.domain) {
        errors.push(`Métrica "${plan.metric}" pertence ao domínio "${def.domain}", não a "${plan.domain}".`);
      }
      plan.domain = plan.domain || def.domain;
      if (plan.aggregation && def.allowedAggregations?.length
        && !def.allowedAggregations.includes(plan.aggregation)
        && plan.aggregation !== "count"
        && plan.aggregation !== "comparison") {
        errors.push(`Agregação "${plan.aggregation}" não permitida para ${plan.metric}.`);
      }
      if (!def.executor) errors.push(`Executor indisponível para ${plan.metric}.`);
      const filters = plan.filters || {};
      for (const key of Object.keys(filters)) {
        if (def.supportedFilters?.length && !def.supportedFilters.includes(key)) {
          warnings.push(`Filtro "${key}" pode não ser suportado por ${plan.metric}.`);
        }
      }
    }
  } else if (["value", "average", "median", "comparison", "definition", "formula", "location"].includes(intent)) {
    errors.push("Métrica obrigatória para esta intenção.");
  }

  const confidence = Number(plan.confidence ?? 1);
  const needsValue = ["value", "average", "median", "comparison"].includes(intent);
  if (needsValue && confidence < minConfidence) {
    return {
      ok: false,
      needsClarification: true,
      errors,
      warnings,
      clarification: plan.clarification || "Não identifiquei o indicador com segurança. Pode reformular?",
      plan,
    };
  }

  if (errors.length) {
    return { ok: false, errors, warnings, plan };
  }

  return { ok: true, errors: [], warnings, plan };
}
