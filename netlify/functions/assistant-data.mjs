import { timingSafeEqual } from "node:crypto";
import { computeGeneralDataPayload } from "./general-data.mjs";
import { computeMeetingsPayload } from "./meetings.mjs";
import { computeMechanismsPayload } from "./mechanisms.mjs";
import { computeSupportPayload } from "./support.mjs";

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
  { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
  { schema: SUPABASE, table: "cancellations", column: "data_pedido" },
  { schema: SUPABASE, table: "cancellations", column: "intencao_registrada_at" },
];
const FINANCIAL_SEGMENT_SOURCES = [
  { schema: SUPABASE, table: "client_financial_data", column: "ultima_renda_mensal" },
  { schema: SUPABASE, table: "client_financial_data", column: "ultimo_aporte" },
  { schema: SUPABASE, table: "client_financial_data", column: "reserva_liquidez" },
];
const MEETING_ATTENDANCE_STATUS = { schema: SUPABASE, table: "meeting_attendance", column: "status" };
const MECHANISM_STATUS = { schema: SUPABASE, table: "client_mecanismos", column: "status" };
const DEMANDS_ID = { schema: SUPABASE, table: "demands", column: "id" };

function segCount(payload, label) {
  const found = (payload?.distributions?.segments || []).find((s) => s.label === label);
  return found ? found.count : 0;
}

/**
 * Allowlist de métricas. Cada entrada declara a fonte de cálculo (compute*),
 * o rótulo, as colunas de origem e como extrair o valor do payload consolidado.
 */
const METRICS = {
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
    sources: [CLIENTS_STATUS],
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
    label: "Total de chamados",
    sources: [DEMANDS_ID],
    value: (p) => p.summary.totalTickets,
  },
  resolved_support_tickets: {
    source: "support",
    label: "Chamados resolvidos",
    sources: [{ schema: SUPABASE, table: "demands", column: "resolved_at" }],
    value: (p) => p.summary.resolvedTickets,
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
  const metric = METRICS[metricKey];
  if (!metric) {
    return errorJson(400, "Métrica desconhecida ou não suportada.", "unknown_metric");
  }

  try {
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
    return Response.json(
      {
        success: true,
        metric: metricKey,
        value,
        label: metric.label,
        sources: metric.sources,
        warnings,
        generated_at: nowIso(),
      },
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
