import { timingSafeEqual } from "node:crypto";
import { computeGeneralDataPayload } from "./general-data.mjs";
import { computeMeetingsPayload } from "./meetings.mjs";
import { computeMechanismsPayload } from "./mechanisms.mjs";
import { computeSupportPayload } from "./support.mjs";
import { getMetricDef, resolveCanonicalMetricId } from "./_shared/portal-metric-catalog.mjs";
import { getRegistryMetric } from "./_shared/portal-metric-registry.mjs";
import { executeMetricQuery } from "./_shared/metric-executor.mjs";

/**
 * Endpoint interno servidor-servidor para o chatbot (n8n → portal).
 *
 * - Somente POST.
 * - Autenticação por token interno (Authorization: Bearer <N8N_INTERNAL_API_TOKEN>).
 * - Responde apenas métricas de uma allowlist fixa (sem SQL, tabela ou coluna livre).
 * - Reutiliza as MESMAS funções de cálculo dos endpoints existentes (não duplica regra).
 * - Nunca expõe service role, segredos ou stack trace ao chamador.
 */

const SUPABASE = "public";

// Fontes reutilizáveis (schema/table/column) apenas para exibição de proveniência.
const CLIENTS_ID = { schema: SUPABASE, table: "clients", column: "id" };
const CLIENTS_STATUS = { schema: SUPABASE, table: "clients", column: "status" };
const CANCEL_SOURCES = [
  { schema: SUPABASE, table: "cancellations", column: "churn_efetivado_at" },
  { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
  { schema: SUPABASE, table: "cancellations", column: "distrato" },
  { schema: SUPABASE, table: "clients", column: "data_churn" },
];
const FINANCIAL_SEGMENT_SOURCES = [
  { schema: SUPABASE, table: "client_financial_data", column: "ultima_renda_mensal" },
  { schema: SUPABASE, table: "client_financial_data", column: "ultimo_aporte" },
  { schema: SUPABASE, table: "client_financial_data", column: "reserva_liquidez" },
];
const MEETING_ATTENDANCE_STATUS = { schema: SUPABASE, table: "meeting_attendance", column: "status" };
const MECHANISM_STATUS = { schema: SUPABASE, table: "client_mecanismos", column: "status" };
const ACIONAMENTOS_ID = { schema: "research", table: "v_acionamentos_tratados", column: "id" };

function segCount(payload, label) {
  const found = (payload?.distributions?.segments || []).find((s) => s.label === label);
  return found ? found.count : 0;
}

/**
 * Allowlist de métricas. Cada entrada declara a fonte de cálculo (compute*),
 * o rótulo, as colunas de origem e como extrair o valor do payload consolidado.
 */
export const METRICS = {
  total_clients: {
    source: "general",
    label: "Total de clientes",
    sources: [CLIENTS_ID],
    value: (p) => p.summary.totalClients,
  },
  active_clients: {
    source: "general",
    label: "Clientes ativos",
    sources: [CLIENTS_STATUS, ...CANCEL_SOURCES],
    value: (p) => p.summary.activeClients,
  },
  cancelled_clients: {
    source: "general",
    label: "Clientes cancelados",
    sources: [CLIENTS_STATUS, ...CANCEL_SOURCES],
    value: (p) => p.summary.cancelledClients,
  },
  frozen_clients: {
    source: "general",
    label: "Clientes congelados",
    sources: [CLIENTS_STATUS, ...CANCEL_SOURCES],
    value: (p) => p.summary.frozenClients,
  },
  clients_with_financial_data: {
    source: "general",
    label: "Clientes com dados financeiros",
    sources: [{ schema: SUPABASE, table: "client_financial_data", column: "client_id" }],
    value: (p) => p.summary.clientsWithFinancialProfile,
  },
  apex_clients: {
    source: "general",
    label: "Clientes APEX",
    sources: FINANCIAL_SEGMENT_SOURCES,
    value: (p) => segCount(p, "APEX"),
  },
  private_clients: {
    source: "general",
    label: "Clientes PRIVATE",
    sources: FINANCIAL_SEGMENT_SOURCES,
    value: (p) => segCount(p, "PRIVATE"),
  },
  principal_clients: {
    source: "general",
    label: "Clientes PRINCIPAL",
    sources: FINANCIAL_SEGMENT_SOURCES,
    value: (p) => segCount(p, "PRINCIPAL"),
  },
  debts_clients: {
    source: "general",
    label: "Clientes DEBTS",
    sources: FINANCIAL_SEGMENT_SOURCES,
    value: (p) => segCount(p, "DEBTS"),
  },
  over_clients: {
    source: "general",
    label: "Clientes OVER",
    sources: FINANCIAL_SEGMENT_SOURCES,
    value: (p) => segCount(p, "OVER"),
  },
  insufficient_segment_data: {
    source: "general",
    label: "Clientes sem dados suficientes para segmento",
    sources: FINANCIAL_SEGMENT_SOURCES,
    value: (p) => p.summary.segmentation?.insufficientDataClients ?? segCount(p, "Dados insuficientes"),
  },
  total_meetings: {
    source: "meetings",
    label: "Total de reuniões",
    sources: [
      { schema: SUPABASE, table: "client_meetings", column: "id" },
      { schema: SUPABASE, table: "manual_meetings", column: "id" },
    ],
    value: (p) => p.summary.totalMeetings,
  },
  no_show_meetings: {
    source: "meetings",
    label: "Reuniões com no-show",
    sources: [MEETING_ATTENDANCE_STATUS],
    value: (p) => p.summary.totalNoShows,
  },
  attendance_rate: {
    source: "meetings",
    label: "Taxa de comparecimento (%)",
    sources: [MEETING_ATTENDANCE_STATUS],
    value: (p) => p.summary.attendanceRate,
  },
  total_mechanisms: {
    source: "mechanisms",
    label: "Mecanismos disponíveis",
    sources: [{ schema: SUPABASE, table: "client_mecanismos", column: "mecanismo_id" }],
    value: (p) => p.summary.availableMechanisms,
  },
  implemented_mechanisms: {
    source: "mechanisms",
    label: "Mecanismos implementados",
    sources: [MECHANISM_STATUS],
    value: (p) => p.summary.implementedMechanisms,
  },
  implementation_rate: {
    source: "mechanisms",
    label: "Taxa de implementação (%)",
    sources: [MECHANISM_STATUS],
    value: (p) => p.summary.implementationPercent,
  },
  total_support_tickets: {
    source: "support",
    label: "Total de acionamentos",
    sources: [ACIONAMENTOS_ID],
    value: (p) => p.summary.totalTickets,
  },
  open_support_tickets: {
    source: "support",
    label: "Acionamentos abertos",
    sources: [{ schema: "research", table: "acionamentos", column: "status" }],
    value: (p) => p.summary.openTickets,
  },
  urgent_support_tickets: {
    source: "support",
    label: "Acionamentos urgentes",
    sources: [{ schema: "research", table: "acionamentos", column: "prioridade" }],
    value: (p) => p.summary.urgentTickets,
  },
  resolved_support_tickets: {
    source: "support",
    label: "Acionamentos resolvidos",
    sources: [{ schema: "research", table: "acionamentos", column: "resolved_at" }],
    value: (p) => p.summary.resolvedTickets,
  },
  resolution_rate: {
    source: "support",
    label: "Taxa de resolução (%)",
    sources: [{ schema: "research", table: "acionamentos", column: "resolved_at" }],
    value: (p) => p.summary.resolutionRate,
  },
  median_resolution_time: {
    source: "support",
    label: "Tempo típico de resolução (h)",
    sources: [
      { schema: "research", table: "acionamentos", column: "data_abertura" },
      { schema: "research", table: "acionamentos", column: "resolved_at" },
    ],
    value: (p) => p.summary.medianResolutionHours,
  },
  identified_support_clients: {
    source: "support",
    label: "Clientes identificados",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    value: (p) => p.summary.identifiedClients,
  },
  tickets_with_identified_client: {
    source: "support",
    label: "Acionamentos com cliente identificado",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    value: (p) => p.summary.ticketsWithClient,
  },
  support_identification_coverage: {
    source: "support",
    label: "Cobertura de identificação (%)",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    value: (p) => p.summary.identificationCoverage,
  },
  unidentified_support_clients: {
    source: "support",
    label: "Acionamentos sem cliente identificado",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    value: (p) => p.summary.ticketsWithoutClient,
  },
  support_identified_from_description: {
    source: "support",
    label: "Identificados pela descrição",
    sources: [{ schema: "research", table: "v_acionamentos_qualidade_email", column: "clientes_identificados_pela_descricao" }],
    value: (p) => p.summary.identifiedFromDescription,
  },
  support_corporate_email_tickets: {
    source: "support",
    label: "E-mail corporativo no campo",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "email_campo_corporativo" }],
    value: (p) => p.summary.corporateEmailTickets,
  },
  support_multiple_clients_tickets: {
    source: "support",
    label: "Acionamentos com múltiplos clientes",
    sources: [{ schema: "research", table: "v_acionamentos_qualidade_email", column: "com_multiplos_clientes_encontrados" }],
    value: (p) => p.summary.ticketsWithMultipleClients,
  },
  support_unmatched_emails: {
    source: "support",
    label: "E-mails sem correspondência",
    sources: [{ schema: "research", table: "v_acionamentos_qualidade_email", column: "email_cliente_sem_match_baseqv" }],
    value: (p) => p.summary.unmatchedEmailTickets,
  },
  support_needs_reprocessing: {
    source: "support",
    label: "Precisam de reprocessamento",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "precisa_reprocessar" }],
    value: (p) => p.summary.needsReprocessing,
  },
  top_support_clients: {
    source: "support",
    label: "Clientes com mais acionamentos",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "baseqv_client_id" }],
    value: (p) => (p.clientsWithMostTickets || []).slice(0, 5).map((c) => `${c.clientName} (${c.clientCode || "s/ cód."}): ${c.ticketCount}`).join("; ") || null,
  },
  top_support_area: {
    source: "support",
    label: "Área com mais acionamentos",
    sources: [{ schema: "research", table: "v_acionamentos_tratados", column: "area_setor" }],
    value: (p) => p.summary.topArea,
  },
};

const COMPUTE = {
  general: computeGeneralDataPayload,
  meetings: computeMeetingsPayload,
  mechanisms: computeMechanismsPayload,
  support: computeSupportPayload,
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Resolve uma métrica da allowlist reutilizando o mesmo cálculo dos dashboards.
 * Retorna { metric, value, label, sources, warnings, generated_at } ou null se
 * a métrica não existir. Fonte única compartilhada por /api/assistant.
 */
export async function resolveMetric(metricKey) {
  const canonical = resolveCanonicalMetricId(metricKey);
  const catalogDef = getMetricDef(canonical);
  const metric = METRICS[canonical] || METRICS[metricKey];

  const exec = catalogDef
    ? await executeMetricQuery({
      metric: canonical,
      domain: catalogDef.domain,
      intent: "value",
      filters: {},
    })
    : null;

  if (exec && (exec.value != null || exec.success)) {
    const warnings = [...(exec.warnings || [])];
    if (exec.value == null) {
      warnings.push({
        code: "NOT_CALCULABLE",
        message: "Indicador ainda não calculável com os dados disponíveis.",
      });
    }
    return {
      metric: canonical,
      requested_metric: metricKey,
      value: exec.value === undefined ? null : exec.value,
      unit: exec.unit || null,
      label: exec.label || catalogDef?.label || metric?.label || canonical,
      sources: exec.sources?.length ? exec.sources : (catalogDef?.sources || metric?.sources || []),
      definition: catalogDef?.description || exec.definition_text || null,
      aliases: catalogDef?.aliases || [],
      sample_size: exec.sample_size ?? null,
      warnings,
      realtime_database: Boolean(exec.realtime_database),
      generated_at: nowIso(),
    };
  }

  if (!metric) return null;
  const payload = await COMPUTE[metric.source]();
  const rawValue = metric.value(payload);
  const value = rawValue === undefined ? null : rawValue;
  const warnings = [];
  if (value == null) {
    warnings.push({
      code: "NOT_CALCULABLE",
      message: "Indicador ainda não calculável com os dados disponíveis.",
    });
  }
  if (catalogDef?.status === "needs_business_validation") {
    warnings.push({
      code: "NEEDS_BUSINESS_VALIDATION",
      message: "Regra ainda não unificada; não tratar o valor como verdade oficial única.",
    });
  }
  return {
    metric: canonical,
    requested_metric: metricKey,
    value,
    label: catalogDef?.label || metric.label,
    sources: catalogDef?.sources || metric.sources,
    definition: catalogDef?.description || null,
    aliases: catalogDef?.aliases || [],
    warnings,
    generated_at: nowIso(),
  };
}

function errorJson(status, error, code) {
  return Response.json(
    { success: false, error, code, generated_at: nowIso() },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Comparação de tokens resistente a timing. */
function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async (request) => {
  if (request.method !== "POST") {
    return errorJson(405, "Método não permitido. Use POST.", "method_not_allowed");
  }

  const expectedToken = (process.env.N8N_INTERNAL_API_TOKEN || "").trim();
  if (!expectedToken) {
    console.error("[assistant-data] N8N_INTERNAL_API_TOKEN não configurado");
    return errorJson(500, "Endpoint interno não configurado.", "config_missing");
  }

  const header =
    request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    return errorJson(401, "Não autenticado.", "unauthenticated");
  }
  if (!tokensMatch(match[1].trim(), expectedToken)) {
    return errorJson(403, "Token interno inválido.", "forbidden");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson(400, "JSON inválido.", "invalid_json");
  }

  const metricKey = typeof body?.metric === "string" ? body.metric.trim() : "";
  const canonical = resolveCanonicalMetricId(metricKey);
  const metric = METRICS[canonical] || METRICS[metricKey];
  if (!metric && !getRegistryMetric(canonical)) {
    return errorJson(400, "Métrica desconhecida ou não suportada.", "unknown_metric");
  }

  try {
    const resolved = await resolveMetric(metricKey);
    return Response.json(
      { success: true, ...resolved },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[assistant-data] falha ao calcular",
      metricKey,
      error instanceof Error ? error.message : error,
    );
    return errorJson(500, "Não foi possível calcular a métrica no momento.", "metric_failed");
  }
};
