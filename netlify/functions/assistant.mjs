import { authenticateRequest } from "./_shared/auth.mjs";
import {
  planSemanticQuery,
  emptyConversationContext,
  mergeConversationContext,
  buildMetricDefinitionText,
  getMetricDef,
  validateSemanticQueryPlan,
} from "./_shared/portal-metric-catalog.mjs";
import {
  executeMetricQuery,
  verbalizeMetricResult,
  sanitizeVerbalizedAnswer,
} from "./_shared/metric-executor.mjs";

/**
 * Assistente da Jornada — planner local (catálogo) → executor (registry) → n8n/Gemini verbaliza.
 * O n8n não recebe o catálogo completo e não é fonte de regras.
 */

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_QUESTION_LENGTH = 2000;
const ORIGIN_TAG = "portal-analytics-jornada";
const CONFIDENCE_MIN = 0.8;

function nowIso() {
  return new Date().toISOString();
}

function errorJson(status, error, code) {
  return Response.json(
    { success: false, error, code, generated_at: nowIso() },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isLocalBridge() {
  return process.env.PORTAL_INTERNAL_DATA_RUN === "1" && !process.env.NETLIFY;
}

async function resolveUserEmail(request) {
  if (isLocalBridge()) {
    const email = (request.headers.get("x-portal-user-email") || "").trim();
    if (!email) return { error: errorJson(401, "Não autenticado.", "unauthenticated") };
    return { email };
  }
  const result = await authenticateRequest(request);
  if (result.error) {
    const status = result.error.status;
    let body = {};
    try { body = await result.error.json(); } catch { body = {}; }
    return {
      error: errorJson(
        status,
        body.error || "Não autenticado.",
        body.code || (status === 403 ? "invalid_domain" : "unauthenticated"),
      ),
    };
  }
  return { email: result.user.email };
}

async function callN8n(webhookUrl, payload, signal) {
  const n8nResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!n8nResponse.ok) {
    const err = new Error(`n8n status ${n8nResponse.status}`);
    err.code = "N8N_ERROR";
    throw err;
  }
  return n8nResponse.json();
}

function responseKind(intent) {
  if (intent === "definition" || intent === "formula") return "rule";
  if (intent === "location") return "location";
  if (intent === "clarification") return "clarification";
  if (["value", "average", "median", "comparison", "mixed"].includes(intent)) return "realtime";
  return "general";
}

function frontendResponse({
  sessionId,
  answer,
  intent,
  queryPlan,
  queryResult,
  clarification,
  conversationContext,
}) {
  const result = queryResult || {};
  const ambiguities = Array.isArray(result.ambiguities)
    ? result.ambiguities
    : (clarification
      ? (Array.isArray(clarification) ? clarification : [clarification])
      : []);
  const kind = responseKind(intent || queryPlan?.intent);

  return {
    success: true,
    session_id: sessionId,
    answer,
    intent: intent || queryPlan?.intent || "general",
    response_kind: kind,
    domain: queryPlan?.domain ?? result.domain ?? null,
    metric: queryPlan?.metric ?? result.metric ?? null,
    aggregation: queryPlan?.aggregation ?? result.aggregation ?? null,
    value: result.value ?? null,
    value_detail: result.value_detail ?? null,
    sample_size: result.sample_size ?? null,
    unit: result.unit ?? null,
    label: result.label ?? null,
    metric_definition: result.metric_definition ?? null,
    definition_text: result.definition_text ?? null,
    metadata: result.metadata ?? null,
    filters: result.filters ?? queryPlan?.filters ?? null,
    filter_labels: Array.isArray(result.filter_labels) ? result.filter_labels : [],
    sources: Array.isArray(result.sources) ? result.sources : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    ambiguities,
    query_plan: queryPlan || null,
    conversation_context: conversationContext || emptyConversationContext(),
    realtime_database: result.realtime_database === true,
    generated_at: nowIso(),
  };
}

function isCatalogMetric(metricId) {
  return Boolean(getMetricDef(metricId));
}

function isDefinitionIntent(intent) {
  return ["definition", "formula", "location"].includes(intent);
}

function n8nVerbalizePayload({
  mode,
  pergunta,
  sessionId,
  userEmail,
  intent,
  conversationContext,
  portalContext,
  queryPlan,
  queryResult,
  metricRule = null,
}) {
  return {
    mode,
    pergunta,
    session_id: sessionId,
    user_email: userEmail,
    origem: ORIGIN_TAG,
    intent,
    conversation_context: conversationContext,
    portal_context: portalContext,
    current_page: portalContext?.current_page || conversationContext?.current_page || null,
    query_plan: queryPlan,
    metric_rule: metricRule,
    resolved_metric: queryPlan?.resolved_metric || {
      domain: queryPlan?.domain,
      metric: queryPlan?.metric,
      label: queryResult?.label,
    },
    query_result: queryResult,
  };
}

async function verbalizeWithN8n({
  webhookUrl,
  signal,
  mode,
  pergunta,
  sessionId,
  userEmail,
  intent,
  conversationContext,
  portalContext,
  queryPlan,
  queryResult,
  metricRule,
  localAnswer,
}) {
  try {
    const verbal = await callN8n(
      webhookUrl,
      n8nVerbalizePayload({
        mode,
        pergunta,
        sessionId,
        userEmail,
        intent,
        conversationContext,
        portalContext,
        queryPlan,
        queryResult,
        metricRule,
      }),
      signal,
    );
    const raw = typeof verbal?.answer === "string" ? verbal.answer.trim() : "";
    if (!raw) return localAnswer;
    if (isDefinitionIntent(intent) || mode === "rule") {
      if (/^\s*[\d.,]+\s*%?\s*$/.test(raw)) return localAnswer;
      return raw;
    }
    return sanitizeVerbalizedAnswer(raw, queryResult, localAnswer);
  } catch {
    return localAnswer;
  }
}

export default async (request) => {
  if (request.method !== "POST") {
    return errorJson(405, "Método não permitido. Use POST.", "method_not_allowed");
  }
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorJson(400, "O corpo da requisição deve ser JSON.", "invalid_content_type");
  }

  const auth = await resolveUserEmail(request);
  if (auth.error) return auth.error;
  const userEmail = auth.email;

  let body;
  try { body = await request.json(); } catch {
    return errorJson(400, "JSON inválido.", "invalid_json");
  }

  const rawQuestion = body?.pergunta;
  if (typeof rawQuestion !== "string") {
    return errorJson(400, "A pergunta é obrigatória.", "invalid_question");
  }
  const pergunta = rawQuestion.trim();
  if (!pergunta) return errorJson(400, "A pergunta é obrigatória.", "invalid_question");
  if (pergunta.length > MAX_QUESTION_LENGTH) {
    return errorJson(400, `A pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`, "question_too_long");
  }

  const sessionId =
    typeof body?.session_id === "string" && body.session_id.trim()
      ? body.session_id.trim()
      : (globalThis.crypto?.randomUUID?.() ?? `sess-${Date.now()}`);

  const webhookUrl = (process.env.N8N_CHAT_WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    return errorJson(500, "N8N_CHAT_WEBHOOK_URL não configurada.", "config_missing");
  }

  const conversationContext = mergeConversationContext(
    emptyConversationContext(),
    {
      ...(body?.conversation_context || {}),
      current_page: body?.portal_context?.current_page
        ?? body?.conversation_context?.current_page
        ?? null,
    },
  );
  const portalContext = body?.portal_context && typeof body.portal_context === "object"
    ? body.portal_context
    : { current_page: conversationContext.current_page || null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const semantic = planSemanticQuery(pergunta, conversationContext, portalContext);

    if (semantic.intent === "clarification" || semantic.clarification || !semantic.metric) {
      const text = semantic.clarification
        || "Não identifiquei o indicador com segurança. Pode citar o nome do card ou a tela?";
      const answer = await verbalizeWithN8n({
        webhookUrl,
        signal: controller.signal,
        mode: "answer",
        pergunta,
        sessionId,
        userEmail,
        intent: "clarification",
        conversationContext,
        portalContext,
        queryPlan: semantic,
        queryResult: { value: null, clarification: text, realtime_database: false },
        localAnswer: text,
      });
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer,
          intent: "clarification",
          queryPlan: semantic,
          queryResult: { ambiguities: [text], realtime_database: false },
          clarification: text,
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!isCatalogMetric(semantic.metric) || (semantic.confidence ?? 0) < CONFIDENCE_MIN) {
      const text = semantic.clarification
        || "Não identifiquei o indicador com segurança. Pode reformular citando o card?";
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer: text,
          intent: "clarification",
          queryPlan: semantic,
          clarification: text,
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const validated = validateSemanticQueryPlan(semantic, { minConfidence: CONFIDENCE_MIN });
    if (!validated.ok) {
      const text = validated.clarification
        || validated.errors?.join(" ")
        || "Não foi possível validar a consulta.";
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer: text,
          intent: "clarification",
          queryPlan: semantic,
          clarification: text,
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const nextCtx = mergeConversationContext(conversationContext, semantic.conversation_context);
    const wantsDefinition = isDefinitionIntent(semantic.intent)
      || (semantic.use_metric_definition && !semantic.use_realtime_query);

    const result = await executeMetricQuery({
      ...semantic,
      use_realtime_query: wantsDefinition ? false : semantic.use_realtime_query,
    });

    if (wantsDefinition) {
      result.value = null;
      result.realtime_database = false;
      result.definition_text = result.definition_text || buildMetricDefinitionText(semantic.metric);
      result.location_text = result.location_text || result.definition_text;
    }

    const localAnswer = verbalizeMetricResult(semantic, result);
    const answer = await verbalizeWithN8n({
      webhookUrl,
      signal: controller.signal,
      mode: wantsDefinition ? "rule" : "answer",
      pergunta,
      sessionId,
      userEmail,
      intent: semantic.intent,
      conversationContext: nextCtx,
      portalContext,
      queryPlan: semantic,
      metricRule: result.definition_text || result.location_text,
      queryResult: wantsDefinition
        ? {
            value: null,
            label: result.label,
            definition_text: result.definition_text,
            location_text: result.location_text,
            sources: result.sources,
            warnings: result.warnings,
            realtime_database: false,
          }
        : {
            value: result.value,
            average: result.average,
            median: result.median,
            value_detail: result.value_detail,
            sample_size: result.sample_size,
            unit: result.unit,
            label: result.label,
            metric: result.metric,
            aggregation: result.aggregation,
            definition: result.definition_text,
            filters: result.filters,
            sources: result.sources,
            warnings: result.warnings,
            realtime_database: result.realtime_database,
          },
      localAnswer,
    });

    clearTimeout(timeout);
    return Response.json(
      frontendResponse({
        sessionId,
        answer,
        intent: semantic.intent,
        queryPlan: semantic,
        queryResult: result,
        conversationContext: nextCtx,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      return errorJson(504, "O assistente demorou mais que o esperado. Tente novamente.", "N8N_TIMEOUT");
    }
    console.error("[assistant] falha:", err?.message || err);
    return errorJson(502, "Não foi possível conectar ao assistente.", err?.code || "N8N_UNREACHABLE");
  }
};
