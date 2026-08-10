/**
 * Registry executável: cada métrica aponta para o payload real do dashboard.
 * O assistente NÃO recalcula — só lê o path.
 */
import { computeMechanismsPayload } from "../mechanisms.mjs";
import { computeOnboardingPayload } from "../onboarding.mjs";
import { computeMeetingsPayload } from "../meetings.mjs";
import { computeGeneralDataPayload } from "../general-data.mjs";
import {
  computeEpPerformancePayload,
} from "../ep-performance.mjs";
import { computePharusEpMeetingsPayload } from "../pharus-ep-meetings.mjs";
import { computeSupportPayload } from "../support.mjs";
import { computeCancellationsPayload } from "../cancellations.mjs";
import { computePharusMechanismsPayload } from "../pharus-mechanisms.mjs";

/** Lazy import — Cruzamentos não pode bloquear o carregamento do catálogo/assistente. */
let statisticalCrossesComputePromise = null;
async function computeStatisticalCrossesPayloadLazy(options = {}) {
  if (!statisticalCrossesComputePromise) {
    statisticalCrossesComputePromise = import("../statistical-crosses.mjs").then((m) => m.computeStatisticalCrossesPayload);
  }
  const compute = await statisticalCrossesComputePromise;
  return compute(options);
}

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
    label: "App Pharus · Mecanismos vinculados",
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
  ep_performance: {
    id: "ep_performance",
    label: "Performance do EP",
    compute: computeEpPerformancePayload,
  },
  statistical_crosses: {
    id: "statistical_crosses",
    label: "Cruzamentos Estatísticos",
    compute: computeStatisticalCrossesPayloadLazy,
  },
  pharus_ep_meetings: {
    id: "pharus_ep_meetings",
    label: "Reuniões App Pharus (EP)",
    compute: computePharusEpMeetingsPayload,
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
    definition:
      "Clientes com status analítico Ativo: status bruto ativo e sem a regra consolidada (churn_efetivado_at OU distrato_assinado_at OU distrato='Assinado' OU clients.data_churn (união distinta por client_id; não arquivado)).",
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
    definition:
      "Clientes com status analítico Ativo ou Congelado (sem churn_efetivado_at nem distrato_assinado_at).",
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
    definition:
      "Cliente cancelado é aquele que possui evidência consolidada: churn_efetivado_at OU distrato_assinado_at OU distrato='Assinado' OU clients.data_churn (união distinta por client_id; não arquivado). prioridade: churn_efetivado_at > distrato_assinado_at > clients.data_churn; distrato Assinado sem data = efetivado sem data confirmada.",
  },
  frozen_clients: {
    domain: "general",
    label: "Clientes congelados",
    payloadPath: "summary.frozenClients",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition:
      "Cliente com status bruto congelado e sem a regra consolidada (churn_efetivado_at OU distrato_assinado_at OU distrato='Assinado' OU clients.data_churn (união distinta por client_id; não arquivado)).",
  },
  cancelled_without_confirmed_date: {
    domain: "general",
    label: "Marcados como cancelados sem confirmação",
    payloadPath: "summary.cancelledWithoutConfirmedDate",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition:
      "Status bruto Cancelado/Churn sem a regra consolidada (churn_efetivado_at OU distrato_assinado_at OU distrato='Assinado' OU clients.data_churn (união distinta por client_id; não arquivado)).",
    aliases: ["cancelados sem data", "churn sem data confirmada"],
  },
  non_active_clients: {
    domain: "general",
    label: "Clientes não ativos",
    payloadPath: "summary.nonActiveClients",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition:
      "Congelados + cancelados sem data confirmada. Não inclui ativos nem cancelados confirmados.",
    aliases: ["clientes nao ativos", "fora da carteira ativa"],
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
    definition: "Vínculos com status normalizado Implementado (concluído). Gráfico Implementados por segmento usa somente esses vínculos.",
    aliases: ["mecanismos implementados", "quantos foram implementados", "implementados", "implementados por segmento", "andamento por segmento"],
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

  /* ---------- APP PHARUS (vínculos suggested = mecanismo associado) ---------- */
  pharus_users_with_suggestions: {
    domain: "pharus_mechanisms",
    label: "Usuários com mecanismos (App Pharus)",
    payloadPath: "summary.usersWithMechanisms",
    sampleSizePath: "summary.usersWithMechanisms",
    unit: "users",
    aggregation: "count",
    definition: "Usuários distintos com vínculo em user_mechanisms (inclui suggested). Não misturar com BASE QV.",
    aliases: [
      "usuarios com mecanismos no app pharus",
      "quantos usuarios possuem mecanismos no app pharus",
      "usuarios com mecanismos sugeridos no app pharus",
    ],
  },
  pharus_total_suggestions: {
    domain: "pharus_mechanisms",
    label: "Mecanismos vinculados (App Pharus)",
    payloadPath: "summary.linkedMechanisms",
    sampleSizePath: "summary.linkedMechanisms",
    unit: "links",
    aggregation: "count",
    definition: "Vínculos únicos user_id + mechanism_id no App Pharus (status suggested).",
  },
  pharus_top_suggested_mechanism: {
    domain: "pharus_mechanisms",
    label: "Mecanismo mais vinculado (App Pharus)",
    payloadPath: "summary.topSuggestedMechanism",
    unit: "mechanism",
    aggregation: "top",
    definition: "Nome do mecanismo com mais vínculos no App Pharus.",
  },
  combined_people_with_mechanisms: {
    domain: "mechanisms",
    label: "Clientes com mecanismos (duas fontes)",
    payloadPath: "summary.combinedPeopleWithMechanisms",
    unit: "people",
    aggregation: "count",
    definition:
      "Soma bruta BASE QV + App Pharus quando não há chave confiável de deduplicação. Informar ressalva ao responder.",
    aliases: [
      "quantos clientes possuem mecanismos nas duas fontes",
      "total consolidado de mecanismos",
      "clientes com mecanismos nas duas fontes",
    ],
    caveats: ["Sem deduplicação entre BASE QV e App Pharus; soma bruta."],
  },

  /* ---------- JOURNEY (página Jornada — distinto de Mecanismos) ---------- */
  average_days_to_first_mechanism: {
    domain: "journey",
    label: "Mediana de dias até o primeiro mecanismo (Jornada)",
    payloadPath: "summary.averageFirstImplementationDays",
    sampleSizePath: "summary.firstImplementationCount",
    unit: "days",
    aggregation: "median",
    definition:
      "Mediana entre a data inicial e a primeira implementação válida registrada em public.client_mecanismos; diferenças negativas são excluídas.",
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
    definition:
      "Clientes cujo estágio atual não está entre os estágios abertos de onboarding OU que possuem primeira reunião OU registro em public.client_financial_data.",
    aliases: ["concluiram onboarding", "onboarding concluido"],
  },
  clients_with_first_meeting: {
    domain: "meetings",
    label: "Clientes com primeira reunião",
    payloadPath: "summary.clientsWithFirstMeeting",
    sampleSizePath: "summary.clientsWithFirstMeeting",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com primeira reunião realizada (BASE QV; Airtable só como fallback).",
    aliases: ["cobertura da primeira reuniao", "clientes com primeira reuniao"],
  },
  clients_with_meeting: {
    domain: "meetings",
    label: "Clientes com reunião",
    payloadPath: "summary.clientsWithMeeting",
    sampleSizePath: "summary.clientsWithMeeting",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes distintos com pelo menos uma reunião válida registrada no recorte.",
    aliases: [
      "clientes com reuniao",
      "quantos clientes possuem alguma reuniao",
      "clientes com pelo menos uma reuniao",
    ],
  },
  average_interval_between_meetings: {
    domain: "meetings",
    label: "Intervalo médio entre reuniões",
    payloadPath: "summary.averageIntervalDays",
    averagePath: "summary.averageIntervalDays",
    medianPath: "summary.typicalIntervalDays",
    sampleSizePath: "summary.intervalDaysStats.validCount",
    unit: "days",
    aggregation: "average",
    definition:
      "Média aritmética dos intervalos positivos entre reuniões válidas consecutivas com presença confirmada.",
    aliases: ["intervalo medio entre reunioes", "intervalo medio", "intervalo tipico entre reunioes"],
  },
  total_meeting_reschedules: {
    domain: "meetings",
    label: "Remarcações",
    payloadPath: "summary.totalReschedules",
    sampleSizePath: "summary.totalReschedules",
    unit: "meetings",
    aggregation: "count",
    definition:
      "Total de remarcações estruturadas (meeting_attendance.remarcado). Cobertura parcial: pode não representar o total real.",
    aliases: ["quantas remarcacoes", "total de remarcacoes", "reunioes remarcadas"],
    caveats: ["Cobertura parcial dos dados estruturados de remarcações."],
  },
  attendance_rate: {
    domain: "meetings",
    label: "Taxa de comparecimento",
    payloadPath: "summary.attendanceRate",
    sampleSizePath: "summary.eligibleMeetings",
    unit: "percent",
    aggregation: "rate",
    definition:
      "1 − (no-shows ÷ reuniões elegíveis). Elegíveis = total − futuras − canceladas. Fonte: meeting_attendance.status.",
    aliases: [
      "taxa de comparecimento",
      "qual a taxa de comparecimento",
      "comparecimento",
      "taxa de presenca",
    ],
  },
  no_show_rate: {
    domain: "meetings",
    label: "Taxa de no-show",
    payloadPath: "summary.noShowRate",
    sampleSizePath: "summary.eligibleMeetings",
    unit: "percent",
    aggregation: "rate",
    definition: "no-shows ÷ reuniões elegíveis (total − futuras − canceladas).",
    aliases: ["taxa de no-show", "qual a taxa de no-show", "percentual de no-show"],
  },
  cancelled_meetings_count: {
    domain: "meetings",
    label: "Reuniões canceladas",
    payloadPath: "summary.cancelledMeetings",
    sampleSizePath: "summary.cancelledMeetings",
    unit: "meetings",
    aggregation: "count",
    definition: "Reuniões com attendanceStatus cancelada (não misturar com no-show).",
    aliases: [
      "quantas reunioes foram canceladas",
      "quantas reuniões foram canceladas",
      "reunioes canceladas",
      "reuniões canceladas",
    ],
  },
  top_meeting_types: {
    domain: "meetings",
    label: "Tipos de reunião mais frequentes",
    payloadPath: "meetingTypes.byFamily",
    unit: "meetings",
    aggregation: "top",
    definition:
      "Distribuição por família a partir de Agendamentos.calendly_eventos (Business Data), exclusivo do gráfico Reuniões por tipo. Não usa o dataset operacional de reuniões.",
    aliases: [
      "quais tipos de reuniao sao mais frequentes",
      "quais tipos de reunião são mais frequentes",
      "tipos de reuniao mais frequentes",
      "tipos de reunião mais frequentes",
    ],
    caveats: ["Fonte exclusiva: Business Data · Agendamentos.calendly_eventos (exclui grupo Comercial)."],
  },
  clients_with_zero_noshows: {
    domain: "meetings",
    label: "Clientes sem no-show",
    payloadPath: "noShowFrequency",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes do recorte classificados na faixa 0 no-shows.",
    aliases: ["quantos clientes nao tiveram no-show", "clientes com 0 no-shows"],
    distributionLookup: { path: "noShowFrequency", key: "zero", field: "clients" },
  },
  clients_with_1_2_noshows: {
    domain: "meetings",
    label: "Clientes com 1–2 no-shows",
    payloadPath: "noShowFrequency",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes do recorte com 1 ou 2 faltas.",
    aliases: ["quantos clientes tiveram entre 1 e 2 no-shows"],
    distributionLookup: { path: "noShowFrequency", key: "one_to_two", field: "clients" },
  },
  clients_with_5_plus_noshows: {
    domain: "meetings",
    label: "Clientes com 5 ou mais no-shows",
    payloadPath: "noShowFrequency",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes do recorte com 5 ou mais faltas.",
    aliases: ["quantos tiveram 5 ou mais no-shows", "clientes com 5 ou mais faltas"],
    distributionLookup: { path: "noShowFrequency", key: "five_or_more", field: "clients" },
  },
  first_meeting_airtable_fallback: {
    domain: "meetings",
    label: "Primeiras reuniões via fallback Airtable",
    payloadPath: "summary.firstMeetingSources.airtable",
    sampleSizePath: "summary.clientsWithFirstMeeting",
    unit: "clients",
    aggregation: "count",
    definition: "Quantidade de primeiras reuniões recuperadas pelo backup Airtable.",
    aliases: [
      "quantas primeiras reunioes vieram do fallback do airtable",
      "fallback airtable primeira reuniao",
    ],
  },

  /* ---------- ATENDIMENTO (research.acionamentos) ---------- */
  total_support_tickets: {
    domain: "support",
    label: "Total de acionamentos",
    payloadPath: "summary.totalTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Contagem distinta de acionamentos em research.acionamentos.",
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
    unit: "clients",
    aggregation: "count",
    definition: "Clientes distintos (baseqv_client_id) em research.v_acionamentos_tratados.",
  },
  tickets_with_identified_client: {
    domain: "support",
    label: "Acionamentos com cliente identificado",
    payloadPath: "summary.ticketsWithClient",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos com pelo menos um cliente BASE QV identificado.",
  },
  support_identification_coverage: {
    domain: "support",
    label: "Cobertura de identificação",
    payloadPath: "summary.identificationCoverage",
    sampleSizePath: "summary.totalTickets",
    unit: "percent",
    aggregation: "rate",
    definition: "ticketsWithClient / totalTickets.",
  },
  unidentified_support_clients: {
    domain: "support",
    label: "Acionamentos sem cliente identificado",
    payloadPath: "summary.ticketsWithoutClient",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos sem baseqv_client_id válido.",
  },
  support_identified_from_description: {
    domain: "support",
    label: "Identificados pela descrição",
    payloadPath: "summary.identifiedFromDescription",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Clientes/acionamentos identificados via e-mail na descrição.",
  },
  support_corporate_email_tickets: {
    domain: "support",
    label: "E-mail corporativo no campo",
    payloadPath: "summary.corporateEmailTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Campo com @quartavia.com.br.",
  },
  support_multiple_clients_tickets: {
    domain: "support",
    label: "Acionamentos com múltiplos clientes",
    payloadPath: "summary.ticketsWithMultipleClients",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "baseqv_quantidade_matches > 1.",
  },
  support_unmatched_emails: {
    domain: "support",
    label: "E-mails sem correspondência",
    payloadPath: "summary.unmatchedEmailTickets",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "E-mail externo sem match na BASE QV.",
  },
  support_needs_reprocessing: {
    domain: "support",
    label: "Precisam de reprocessamento",
    payloadPath: "summary.needsReprocessing",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "precisa_reprocessar / aguardando_processamento.",
  },
  top_support_clients: {
    domain: "support",
    label: "Clientes com mais acionamentos",
    payloadPath: "clientsWithMostTickets",
    sampleSizePath: "summary.identifiedClients",
    unit: "label",
    aggregation: "top",
    definition: "Top 10 clientes por acionamentos distintos.",
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
  top_support_type: {
    domain: "support",
    label: "Tipo de solicitação mais frequente",
    payloadPath: "summary.topType",
    sampleSizePath: "summary.totalTickets",
    unit: "label",
    aggregation: "top",
    definition: "Tipo de solicitação com maior volume no período.",
  },
  top_support_requesters: {
    domain: "support",
    label: "Solicitantes com maior volume",
    payloadPath: "byRequester",
    sampleSizePath: "summary.totalTickets",
    unit: "label",
    aggregation: "top",
    definition: "Top 10 solicitantes por volume de acionamentos.",
  },
  support_without_area: {
    domain: "support",
    label: "Acionamentos sem área",
    payloadPath: "summary.withoutArea",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos sem area_setor informado.",
  },
  support_without_type: {
    domain: "support",
    label: "Acionamentos sem tipo",
    payloadPath: "summary.withoutType",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "count",
    definition: "Acionamentos sem tipo_solicitacao informado.",
  },
  support_monthly_evolution: {
    domain: "support",
    label: "Evolução dos acionamentos",
    payloadPath: "monthlyEvolution",
    sampleSizePath: "summary.totalTickets",
    unit: "tickets",
    aggregation: "trend",
    definition: "Série temporal por data_abertura.",
  },

  /* ---------- PERFORMANCE EP ---------- */
  ep_clients_by_advisor: {
    domain: "ep_performance",
    label: "Clientes por EP",
    payloadPath: "byAdvisor",
    sampleSizePath: "summary.totalClients",
    unit: "label",
    aggregation: "top",
    definition: "Carteira por Engenheiro Patrimonial atual.",
  },
  ep_meeting_coverage: {
    domain: "ep_performance",
    label: "Cobertura de reuniões por EP",
    payloadPath: "summary.meetingCoverage",
    sampleSizePath: "summary.totalClients",
    unit: "percent",
    aggregation: "rate",
    definition: "Clientes com ≥1 reunião válida ÷ carteira.",
  },
  ep_clients_without_meeting: {
    domain: "ep_performance",
    label: "Clientes sem reunião",
    payloadPath: "summary.clientsWithoutMeeting",
    sampleSizePath: "summary.totalClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes da carteira sem reunião válida.",
  },
  ep_cancelled_share: {
    domain: "ep_performance",
    label: "Percentual cancelado da carteira",
    payloadPath: "summary.cancelledShareOfPortfolio",
    sampleSizePath: "summary.totalClients",
    unit: "percent",
    aggregation: "rate",
    definition:
      "Cancelados confirmados ÷ carteira do EP atualmente vinculado (não é taxa temporal).",
  },
  ep_nps: {
    domain: "ep_performance",
    label: "NPS por EP",
    payloadPath: "summary.npsRaw",
    sampleSizePath: "summary.npsResponses",
    unit: "index",
    aggregation: "value",
    definition:
      "NPS = % Promotores (9–10) − % Detratores (0–6). Média da nota não é NPS. EP atual no join.",
  },
  ep_pharus_meetings: {
    domain: "ep_performance",
    label: "Reuniões no App Pharus",
    payloadPath: "pharusMeetings.summary.totalMeetings",
    sampleSizePath: "pharusMeetings.summary.totalMeetings",
    unit: "meetings",
    aggregation: "count",
    definition: "Reuniões registradas no App Pharus (seção isolada).",
  },
  ep_small_samples: {
    domain: "ep_performance",
    label: "EPs com amostra pequena",
    payloadPath: "summary.advisorsWithPortfolio",
    sampleSizePath: "summary.advisorsWithPortfolio",
    unit: "label",
    aggregation: "count",
    definition: "EPs com carteira < 10 clientes (badge amostra pequena).",
  },

  /* ---------- CRUZAMENTOS ESTATÍSTICOS ---------- */
  sc_top_association: {
    domain: "statistical_crosses",
    label: "Variáveis mais associadas ao cancelamento",
    payloadPath: "summary.topAssociationLabel",
    sampleSizePath: "summary.analyzedClients",
    unit: "association",
    aggregation: "top",
    definition: "Maior magnitude de associação observada com cancelamento efetivado (não causalidade).",
    aliases: [
      "maior associacao com churn",
      "variaveis associadas ao cancelamento",
      "correlacao com churn",
    ],
  },
  sc_active_clients: {
    domain: "statistical_crosses",
    label: "Clientes ativos na análise",
    payloadPath: "summary.activeClients",
    sampleSizePath: "summary.analyzedClients",
    unit: "clients",
    aggregation: "count",
    definition: "Status analítico Ativo sem cancelamento efetivado.",
  },
  sc_renewed_clients: {
    domain: "statistical_crosses",
    label: "Clientes renovados (ciclo > 1)",
    payloadPath: "summary.renewedClients",
    sampleSizePath: "summary.analyzedClients",
    unit: "clients",
    aggregation: "count",
    definition: "clients.ciclo > 1 — presença de mais de um ciclo, não taxa contratual formal.",
    aliases: ["clientes renovados", "associacao com renovacao", "ciclo maior que 1"],
  },
  sc_cycle1_clients: {
    domain: "statistical_crosses",
    label: "Clientes no ciclo 1",
    payloadPath: "summary.cycle1Clients",
    sampleSizePath: "summary.analyzedClients",
    unit: "clients",
    aggregation: "count",
    definition: "clients.ciclo = 1 (não renovados na métrica de ciclos).",
  },
  sc_nps: {
    domain: "statistical_crosses",
    label: "NPS nos cruzamentos",
    payloadPath: "summary.npsIndex",
    sampleSizePath: "summary.validNpsResponses",
    unit: "index",
    aggregation: "value",
    definition:
      "Índice NPS preditivo (% Promotores − % Detratores). Respostas após cancelamento excluídas. Não é média da nota.",
    aliases: ["nps e cancelamento", "relacao nps churn", "como nps se relaciona"],
  },
  sc_nps_responses: {
    domain: "statistical_crosses",
    label: "Respostas NPS válidas",
    payloadPath: "summary.validNpsResponses",
    sampleSizePath: "summary.analyzedClients",
    unit: "clients",
    aggregation: "count",
    definition: "Última resposta NPS válida por cliente no recorte preditivo.",
  },
  sc_confirmed_cancellations: {
    domain: "statistical_crosses",
    label: "Cancelamentos efetivados na análise",
    payloadPath: "summary.confirmedCancellations",
    sampleSizePath: "summary.analyzedClients",
    unit: "clients",
    aggregation: "count",
    definition:
      "Cancelamento efetivado: churn_efetivado_at OU distrato_assinado_at OU distrato Assinado OU clients.data_churn.",
  },
  sc_top_auc: {
    domain: "statistical_crosses",
    label: "Maior AUC univariada",
    payloadPath: "univariatePredictivePower",
    sampleSizePath: "summary.analyzedClients",
    unit: "label",
    aggregation: "top",
    definition: "Maior AUC ajustada (max(AUC, 1−AUC)) entre variáveis elegíveis — poder discriminativo, não precisão.",
    aliases: ["maior auc", "poder preditivo individual", "auc univariada"],
  },
  sc_excluded_variables: {
    domain: "statistical_crosses",
    label: "Variáveis excluídas",
    payloadPath: "excludedVariables",
    sampleSizePath: "summary.analyzedClients",
    unit: "label",
    aggregation: "top",
    definition: "Variáveis fora da análise por leakage, cobertura, amostra, constante ou inválida.",
    aliases: ["variaveis excluidas", "por que variavel foi excluida"],
  },
  sc_survival: {
    domain: "statistical_crosses",
    label: "Curva de permanência",
    payloadPath: "survival",
    sampleSizePath: "summary.analyzedClients",
    unit: "label",
    aggregation: "trend",
    definition:
      "Kaplan–Meier: evento = cancelamento efetivado com data; censura = data de corte. Probabilidade de permanência ≠ % ativos sem explicação.",
    aliases: [
      "curva de sobrevivencia",
      "probabilidade de permanencia",
      "kaplan meier",
      "quantos clientes na curva",
    ],
  },
  sc_median_survival: {
    domain: "statistical_crosses",
    label: "Mediana de sobrevivência",
    payloadPath: "survival.overall.medianSurvival",
    sampleSizePath: "survival.overall.nStart",
    unit: "days",
    aggregation: "value",
    definition: "Tempo (dias) em que a curva KM atinge 50%, se atingido.",
  },
  sc_discoveries: {
    domain: "statistical_crosses",
    label: "Principais descobertas",
    payloadPath: "discoveries",
    sampleSizePath: "summary.analyzedClients",
    unit: "list",
    aggregation: "list",
    definition: "Narrativas determinísticas a partir de associações/diferenças com cobertura e amostra suficientes. Não afirmam causalidade.",
    aliases: ["principais descobertas", "descobertas estatisticas", "quais descobertas"],
  },
  sc_correlation_matrix: {
    domain: "statistical_crosses",
    label: "Matriz de correlação",
    payloadPath: "correlationMatrix",
    sampleSizePath: "summary.analyzedClients",
    unit: "matrix",
    aggregation: "matrix",
    definition: "Matriz Spearman (padrão) ou Pearson entre variáveis numéricas; pares completos; diagonal = 1.",
    aliases: ["matriz de correlacao", "maior correlacao", "correlacao entre variaveis"],
  },
  sc_cohort: {
    domain: "statistical_crosses",
    label: "Coorte de retenção",
    payloadPath: "cohort",
    sampleSizePath: "summary.analyzedClients",
    unit: "cohort",
    aggregation: "cohort",
    definition: "Retenção por mês/trimestre de contratação e idade em meses. Meses futuros não observáveis ficam vazios.",
    aliases: ["coorte", "retencao por coorte", "retencao apos 6 meses", "retencao apos 12 meses"],
  },

  /* ---------- CANCELAMENTO (BASE QV) ---------- */
  total_cancellations: {
    domain: "cancellations",
    label: "Cancelamentos efetivados",
    payloadPath: "summary.effectiveCancellations",
    sampleSizePath: "summary.totalDistinctClients",
    unit: "clients",
    aggregation: "count",
    definition:
      "Clientes com churn_efetivado_at ou distrato_assinado_at ou distrato Assinado ou clients.data_churn ou distrato Assinado ou clients.data_churn (não arquivados). Intenção/pedido não contam.",
  },
  clients_in_cancellation_process: {
    domain: "cancellations",
    label: "Clientes em processo de cancelamento",
    payloadPath: "summary.clientsInCancellationProcess",
    sampleSizePath: "summary.totalDistinctClients",
    unit: "clients",
    aggregation: "count",
    definition:
      "Clientes com intenção ou pedido e sem churn/distrato efetivado (não arquivados).",
    aliases: [
      "clientes em processo de cancelamento",
      "em processo de cancelamento",
      "intencao ou pedido sem efetivacao",
    ],
  },
  typical_days_in_cancellation_process: {
    domain: "cancellations",
    label: "Tempo típico em processo de cancelamento",
    payloadPath: "summary.timing.medianDaysInProcess.median",
    sampleSizePath: "summary.timing.medianDaysInProcess.sampleSize",
    unit: "days",
    aggregation: "median",
    definition:
      "Mediana de dias em processo para clientes ainda não efetivados (hoje − coalesce(data_pedido, intencao_registrada_at)).",
    aliases: [
      "tempo tipico no processo de cancelamento",
      "mediana de dias em processo",
    ],
  },
  cancellation_process_by_status: {
    domain: "cancellations",
    label: "Clientes por etapa do processo de cancelamento",
    payloadPath: null,
    distributionLookup: { path: "distributions.byProcessStatus" },
    sampleSizePath: "summary.clientsInCancellationProcess",
    unit: "clients",
    aggregation: "distribution",
    definition:
      "Distribuição de clientes em processo por cancellation_statuses.name (join status_id = id).",
    aliases: [
      "quantos estao em cada etapa do processo",
      "distribuicao por status do processo de cancelamento",
      "etapas do processo de cancelamento",
    ],
  },
  cancellation_intentions: {
    domain: "cancellations",
    label: "Intenções de cancelamento",
    payloadPath: "summary.intentionsRegistered",
    sampleSizePath: "summary.totalDistinctClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com intencao_registrada_at; não retira da carteira ativa.",
  },
  cancellation_orders: {
    domain: "cancellations",
    label: "Pedidos de cancelamento",
    payloadPath: "summary.ordersRegistered",
    sampleSizePath: "summary.totalDistinctClients",
    unit: "clients",
    aggregation: "count",
    definition: "Clientes com data_pedido; não retira da carteira ativa.",
  },
  cancellation_intention_to_order_rate: {
    domain: "cancellations",
    label: "Conversão intenção → pedido",
    payloadPath: "summary.funnel.rateIntentionToOrder.rate",
    sampleSizePath: "summary.funnel.rateIntentionToOrder.denominator",
    unit: "percent",
    aggregation: "rate",
    definition: "Pedidos / intenções (clientes distintos).",
  },
  cancellation_intention_to_effective_rate: {
    domain: "cancellations",
    label: "Conversão intenção → efetivado",
    payloadPath: "summary.funnel.rateIntentionToEffective.rate",
    sampleSizePath: "summary.funnel.rateIntentionToEffective.denominator",
    unit: "percent",
    aggregation: "rate",
    definition: "Efetivados com intenção / intenções.",
  },
  cancellation_passed_retention: {
    domain: "cancellations",
    label: "Passaram por retenção",
    payloadPath: "summary.retention.passedRetentionCount",
    sampleSizePath: "summary.totalDistinctClients",
    unit: "clients",
    aggregation: "count",
    definition: "passou_retencao=true (não implica cliente retido).",
  },
  median_order_to_effective_days: {
    domain: "cancellations",
    label: "Mediana entre pedido e cancelamento efetivado",
    payloadPath: "summary.timing.medianOrderToEffective.median",
    sampleSizePath: "summary.timing.medianOrderToEffective.sampleSize",
    unit: "days",
    aggregation: "median",
    definition: "Mediana de dias entre data_pedido e data analítica (churn/distrato).",
  },
  cancellation_distrato_signed_without_date: {
    domain: "cancellations",
    label: "Distrato textual assinado sem data",
    payloadPath: "summary.distratoTextSignedWithoutDate",
    sampleSizePath: "summary.totalRecordsRead",
    unit: "records",
    aggregation: "count",
    definition: "Registros com distrato='Assinado' e distrato_assinado_at vazio.",
  },
  cancellations_with_reason: {
    domain: "cancellations",
    label: "Cancelamentos com motivo informado",
    payloadPath: "summary.efetivadoReasonCoverage.withReason",
    sampleSizePath: "summary.effectiveCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Efetivados com motivo preenchido.",
  },
  cancellations_without_reason: {
    domain: "cancellations",
    label: "Cancelamentos sem motivo",
    payloadPath: "summary.efetivadoReasonCoverage.withoutReason",
    sampleSizePath: "summary.effectiveCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Efetivados sem motivo preenchido.",
  },
  median_days_to_cancellation: {
    domain: "cancellations",
    label: "Tempo típico até o cancelamento",
    payloadPath: "summary.medianDaysToCancellation",
    averagePath: "summary.averageDaysToCancellation",
    sampleSizePath: "summary.staySampleSize",
    unit: "days",
    aggregation: "median",
    definition: "Mediana de dias entre contratação e data analítica de cancelamento (churn/distrato).",
  },
  average_days_to_cancellation: {
    domain: "cancellations",
    label: "Tempo médio até o cancelamento",
    payloadPath: "summary.averageDaysToCancellation",
    sampleSizePath: "summary.staySampleSize",
    unit: "days",
    aggregation: "average",
    definition: "Média de dias entre contratação e cancelamento efetivado.",
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
    definition: "Mediana de dias sem atualização financeira anterior ao cancelamento. Atualização válida somente se updated_at > created_at.",
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
    label: "Motivo original mais comum de cancelamento",
    payloadPath: "summary.topReason",
    sampleSizePath: "summary.withReason",
    unit: "label",
    aggregation: "top",
    definition: "Texto original de motivo com maior volume entre cancelamentos com motivo informado.",
  },
  top_cancellation_reason_category: {
    domain: "cancellations",
    label: "Principal categoria de cancelamento",
    payloadPath: "summary.topReasonCategory",
    sampleSizePath: "summary.totalCancellations",
    unit: "label",
    aggregation: "top",
    definition: "Categoria analítica com maior volume (distributions.byReasonCategory).",
  },
  cancellations_by_inactivity: {
    domain: "cancellations",
    label: "Cancelamentos por inatividade",
    distributionLookup: {
      path: "distributions.byReasonCategory",
      label: "Inatividade e falta de engajamento",
    },
    sampleSizePath: "summary.totalCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Count na categoria Inatividade e falta de engajamento.",
  },
  cancellations_by_financial: {
    domain: "cancellations",
    label: "Cancelamentos por questões financeiras",
    distributionLookup: { path: "distributions.byReasonCategory", label: "Questões financeiras" },
    sampleSizePath: "summary.totalCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Count na categoria Questões financeiras.",
  },
  cancellations_by_non_renewal: {
    domain: "cancellations",
    label: "Cancelamentos por não renovação",
    distributionLookup: { path: "distributions.byReasonCategory", label: "Não renovação" },
    sampleSizePath: "summary.totalCancellations",
    unit: "clients",
    aggregation: "count",
    definition: "Count na categoria Não renovação.",
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

  // Soma bruta BASE QV + App Pharus (sem chave confiável de deduplicação)
  if (metricId === "combined_people_with_mechanisms") {
    const mechExec = portalDomainExecutors.mechanisms;
    const phExec = portalDomainExecutors.pharus_mechanisms;
    const [mechPayload, phPayload] = await Promise.all([
      options.payload || mechExec.compute(),
      phExec.compute(),
    ]);
    const baseQv = Number(mechPayload?.summary?.clientsWithMechanisms) || 0;
    const pharus = Number(
      phPayload?.summary?.usersWithMechanisms
      ?? phPayload?.summary?.usersWithSuggestion
      ?? phPayload?.summary?.usersWithSuggestions
      ?? 0,
    );
    const combined = baseQv + pharus;
    return {
      success: true,
      metric: metricId,
      domain: entry.domain,
      label: entry.label,
      aggregation: "count",
      value: combined,
      sample_size: combined,
      unit: entry.unit,
      definition: entry.definition,
      payload_path: "summary.combinedPeopleWithMechanisms",
      value_detail: {
        combinedMode: "gross_sum",
        baseQvClientsWithMechanisms: baseQv,
        appPharusUsersWithMechanisms: pharus,
      },
      caveats: entry.caveats || [],
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
    const lookup = entry.distributionLookup;
    const item = Array.isArray(list)
      ? list.find((row) => {
        if (lookup.key != null) return String(row.key) === String(lookup.key);
        return String(row.label) === String(lookup.label);
      })
      : null;
    const field = lookup.field || "count";
    value = item?.[field] ?? item?.count ?? 0;
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
  if (metricId === "top_meeting_types" && Array.isArray(value) && value.length) {
    const top = value[0];
    value = `${top.label} (${top.count}${top.percent != null ? ` · ${top.percent}%` : ""})`;
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
  const ticketsWithClient = rows.filter((t) => t.clientIdentified).length;
  const identifiedClientIds = new Set(rows.map((t) => t.primaryClientId).filter(Boolean));
  const identifiedClients = identifiedClientIds.size;
  const ticketsWithoutClient = totalTickets - ticketsWithClient;
  const unidentifiedClients = ticketsWithoutClient;
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
  const typeMap = new Map();
  for (const t of rows) {
    const area = t.areaChart || t.area;
    if (area && area !== "Não informado") areaMap.set(area, (areaMap.get(area) || 0) + 1);
    if (t.type && t.type !== "Não informado") typeMap.set(t.type, (typeMap.get(t.type) || 0) + 1);
  }
  const topAreaEntry = [...areaMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0] || null;
  const topTypeEntry = [...typeMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0] || null;
  return {
    totalTickets,
    openTickets,
    urgentTickets,
    identifiedClients,
    ticketsWithClient,
    identificationCoverage: totalTickets
      ? Math.round((ticketsWithClient / totalTickets) * 1000) / 10
      : 0,
    ticketsWithoutClient,
    unidentifiedClients,
    withoutArea: rows.filter((t) => (t.areaChart || t.area) === "Não informado" || !t.area).length,
    withoutType: rows.filter((t) => !t.type || t.type === "Não informado").length,
    resolvedTickets,
    resolutionRate,
    medianResolutionHours,
    topArea: topAreaEntry?.[0] || null,
    topAreaCount: topAreaEntry?.[1] || 0,
    topType: topTypeEntry?.[0] || null,
    topTypeCount: topTypeEntry?.[1] || 0,
  };
}

/** Filtra clients[] do payload de Cancelamento (mesmos campos já normalizados). */
function applyCancellationClientFilters(clients, filters = {}) {
  return clients.filter((c) => {
    if (filters.engineer && filters.engineer !== "all" && c.engineer !== filters.engineer) return false;
    if (filters.segment && filters.segment !== "all" && c.segment !== filters.segment) return false;
    if (filters.reason && filters.reason !== "all" && c.reason !== filters.reason) return false;
    if (filters.category && filters.category !== "all"
      && (c.reasonCategory || c.category) !== filters.category) return false;
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
  const totalDistinctClients = rows.length;
  const intentionsRegistered = rows.filter((r) => r.hasIntencao).length;
  const ordersRegistered = rows.filter((r) => r.hasPedido).length;
  const effectiveCancellations = rows.filter((r) => r.hasEfetivado).length;
  const efetivados = rows.filter((r) => r.hasEfetivado);
  const withReason = rows.filter((r) => r.hasReason).length;
  const withoutReason = totalDistinctClients - withReason;
  const efetivadoWithReason = efetivados.filter((r) => r.hasReason).length;
  const efetivadoWithoutReason = effectiveCancellations - efetivadoWithReason;
  const stayStats = cancelRobustStats(efetivados.map((r) => r.daysToCancellation));
  const meetingStats = cancelRobustStats(efetivados.map((r) => r.meetingsBeforeCancellation));
  const financialStats = cancelRobustStats(
    efetivados.map((r) => r.daysSinceFinancialUpdate).filter((d) => d != null),
  );
  const interactionStats = cancelRobustStats(
    efetivados.map((r) => r.daysWithoutInteraction).filter((d) => d != null),
  );
  const reasonMap = new Map();
  const categoryMap = new Map();
  for (const r of efetivados) {
    if (r.hasReason && r.reason) {
      reasonMap.set(r.reason, (reasonMap.get(r.reason) || 0) + 1);
    }
    const cat = r.reasonCategory || r.category;
    if (cat) categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  }
  const topReason = [...reasonMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || null;
  const topReasonCategory = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || null;

  const rate = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);
  const efetivadosComPedido = efetivados.filter((r) => r.hasPedido).length;
  const efetivadosComIntencao = efetivados.filter((r) => r.hasIntencao).length;

  return {
    totalDistinctClients,
    intentionsRegistered,
    ordersRegistered,
    effectiveCancellations,
    totalCancellations: effectiveCancellations,
    withReason,
    withoutReason,
    efetivadoReasonCoverage: {
      withReason: efetivadoWithReason,
      withoutReason: efetivadoWithoutReason,
    },
    funnel: {
      intentions: intentionsRegistered,
      orders: ordersRegistered,
      effective: effectiveCancellations,
      rateIntentionToOrder: {
        rate: rate(ordersRegistered, intentionsRegistered),
        numerator: ordersRegistered,
        denominator: intentionsRegistered,
      },
      rateOrderToEffective: {
        rate: rate(efetivadosComPedido, ordersRegistered),
        numerator: efetivadosComPedido,
        denominator: ordersRegistered,
      },
      rateIntentionToEffective: {
        rate: rate(efetivadosComIntencao, intentionsRegistered),
        numerator: efetivadosComIntencao,
        denominator: intentionsRegistered,
      },
    },
    retention: {
      passedRetentionCount: rows.filter((r) => r.passouRetencao === true).length,
    },
    timing: {
      medianOrderToEffective: {
        median: cancelRobustStats(rows.map((r) => r.daysPedidoToEfetivado)).median,
        sampleSize: cancelRobustStats(rows.map((r) => r.daysPedidoToEfetivado)).validCount,
      },
    },
    distratoTextSignedWithoutDate: rows.filter((r) => r.distratoTextSignedWithoutDate).length,
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
    topReasonCategory,
  };
}
