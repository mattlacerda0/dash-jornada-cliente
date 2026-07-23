import { authenticateRequest } from "./_shared/auth.mjs";
import {
  resolvePortalQuestion,
  localPlanToQueryPlan,
  validateQueryPlan,
  executePortalQuery,
  buildPlanCatalog,
  portalQueryRegistry,
} from "./_shared/portal-query.mjs";
import {
  planSemanticQuery,
  emptyConversationContext,
  mergeConversationContext,
  listMetricsForPlanner,
  buildMetricDefinitionText,
  getMetricDef,
  validateSemanticQueryPlan,
} from "./_shared/portal-metric-catalog.mjs";
import { executeMetricQuery, verbalizeMetricResult } from "./_shared/metric-executor.mjs";

/**
 * Assistente da Jornada — fluxo plan → execute → answer
 * com camada semântica (catálogo + contexto conversacional).
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

function extractQueryPlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.query_plan && typeof raw.query_plan === "object") {
    return {
      success: true,
      mode: "plan",
      query_plan: raw.query_plan,
      clarification: raw.clarification || null,
    };
  }
  const text = raw.answer || raw.output || raw.text || "";
  if (typeof text === "string" && text.includes("{")) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (parsed.query_plan || parsed.domain || parsed.metric || parsed.clarification) {
          return {
            success: true,
            mode: "plan",
            query_plan: parsed.query_plan || (parsed.domain || parsed.metric ? parsed : null),
            clarification: parsed.clarification || null,
          };
        }
      } catch { /* ignore */ }
    }
  }
  return null;
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
    // ---------- Camada semântica local (prioritária) ----------
    const semantic = planSemanticQuery(pergunta, conversationContext, portalContext);

    // Esclarecimento obrigatório
    if (semantic.intent === "clarification" || semantic.clarification) {
      const text = semantic.clarification || "Pode esclarecer qual indicador você quer consultar?";
      let answer = text;
      try {
        const verbal = await callN8n(webhookUrl, {
          mode: "answer",
          pergunta,
          session_id: sessionId,
          user_email: userEmail,
          origem: ORIGIN_TAG,
          conversation_context: conversationContext,
          query_plan: semantic,
          query_result: {
            value: null,
            clarification: text,
            realtime_database: false,
          },
        }, controller.signal);
        if (typeof verbal?.answer === "string" && verbal.answer.trim()) answer = verbal.answer.trim();
      } catch { /* keep text */ }
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

    // Métrica do catálogo (journey/mechanisms) — caminho semântico
    if (semantic.metric && isCatalogMetric(semantic.metric) && semantic.confidence >= CONFIDENCE_MIN) {
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
            intent: validated.needsClarification ? "clarification" : "clarification",
            queryPlan: semantic,
            clarification: text,
            conversationContext,
          }),
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const nextCtx = mergeConversationContext(conversationContext, semantic.conversation_context);

      if (isDefinitionIntent(semantic.intent) || semantic.use_metric_definition && !semantic.use_realtime_query) {
        const result = await executeMetricQuery({
          ...semantic,
          use_realtime_query: false,
        });
        // Nunca devolver número em fórmula/definição
        result.value = null;
        result.realtime_database = false;
        result.definition_text = result.definition_text || buildMetricDefinitionText(semantic.metric);

        let answer = verbalizeMetricResult(semantic, result);
        try {
          const mode = semantic.intent === "location" ? "rule" : "rule";
          const verbal = await callN8n(webhookUrl, {
            mode,
            pergunta,
            session_id: sessionId,
            user_email: userEmail,
            origem: ORIGIN_TAG,
            intent: semantic.intent,
            conversation_context: nextCtx,
            query_plan: semantic,
            metric_rule: result.definition_text,
            query_result: {
              value: null,
              label: result.label,
              definition_text: result.definition_text,
              location_text: result.location_text,
              sources: result.sources,
              warnings: result.warnings,
              realtime_database: false,
            },
          }, controller.signal);
          if (typeof verbal?.answer === "string" && verbal.answer.trim()) {
            // Guardrail: se o modelo devolver só número, substitui
            const onlyNumber = /^\s*[\d.,]+\s*%?\s*$/.test(verbal.answer.trim());
            if (!onlyNumber) answer = verbal.answer.trim();
          }
        } catch { /* keep local verbalization */ }

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
      }

      // Valor / média / mediana / comparação
      const result = await executeMetricQuery(semantic);
      let answer = verbalizeMetricResult(semantic, result);
      try {
        const verbal = await callN8n(webhookUrl, {
          mode: "answer",
          pergunta,
          session_id: sessionId,
          user_email: userEmail,
          origem: ORIGIN_TAG,
          intent: semantic.intent,
          conversation_context: nextCtx,
          portal_context: portalContext,
          current_page: portalContext?.current_page || null,
          resolved_metric: semantic.resolved_metric || {
            domain: semantic.domain,
            metric: semantic.metric,
            label: result.label,
          },
          query_plan: semantic,
          query_result: {
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
        }, controller.signal);
        if (typeof verbal?.answer === "string" && verbal.answer.trim()) answer = verbal.answer.trim();
      } catch { /* keep */ }

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
    }

    // ---------- Fallback: planejador legado (general / meetings) ----------
    // Mas bloqueia se a intenção semântica for claramente definição/fórmula
    if (isDefinitionIntent(semantic.intent) && semantic.metric) {
      const result = await executeMetricQuery(semantic);
      result.value = null;
      result.realtime_database = false;
      const answer = verbalizeMetricResult(semantic, result);
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer,
          intent: semantic.intent,
          queryPlan: semantic,
          queryResult: result,
          conversationContext: mergeConversationContext(conversationContext, semantic.conversation_context),
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let queryPlan = null;
    let clarification = null;
    try {
      const planRaw = await callN8n(webhookUrl, {
        mode: "plan",
        pergunta,
        session_id: sessionId,
        user_email: userEmail,
        origem: ORIGIN_TAG,
        portal_context: portalContext,
        portal_registry: buildPlanCatalog(),
        metric_catalog: listMetricsForPlanner(),
        conversation_context: conversationContext,
      }, controller.signal);
      const extracted = extractQueryPlan(planRaw);
      if (extracted?.clarification) clarification = extracted.clarification;
      if (extracted?.query_plan) queryPlan = extracted.query_plan;
    } catch (err) {
      console.error("[assistant] plan n8n falhou:", err?.message || err);
    }

    if (!queryPlan) {
      const local = resolvePortalQuestion(pergunta);
      // Se local cair em value mas semântica diz formula — respeitar semântica
      if (isDefinitionIntent(semantic.intent) && semantic.metric) {
        queryPlan = semantic;
      } else {
        queryPlan = localPlanToQueryPlan(local);
        if (local.ambiguities?.length) clarification = local.ambiguities;
      }
    }

    // Se Gemini sugeriu total_clients para pergunta de mecanismos, rejeitar
    if (queryPlan?.metric === "total_clients" && /mecanismo/.test(pergunta.toLowerCase())) {
      const text = "Você quer saber quantos clientes possuem exatamente um mecanismo disponível, exatamente um mecanismo implementado, ou exatamente um mecanismo em andamento?";
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer: text,
          intent: "clarification",
          queryPlan: { ...queryPlan, intent: "clarification", metric: null },
          clarification: text,
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Catálogo metric via Gemini plan
    if (queryPlan?.metric && isCatalogMetric(queryPlan.metric)) {
      const intent = queryPlan.intent || semantic.intent || "value";
      const plan = {
        ...queryPlan,
        intent: isDefinitionIntent(semantic.intent) ? semantic.intent : intent,
        aggregation: queryPlan.aggregation || semantic.aggregation,
        use_realtime_query: !isDefinitionIntent(semantic.intent),
        use_metric_definition: isDefinitionIntent(semantic.intent),
        confidence: queryPlan.confidence ?? semantic.confidence,
      };
      if ((plan.confidence ?? 1) < CONFIDENCE_MIN && plan.use_realtime_query) {
        const text = plan.clarification || clarification || "Não identifiquei o indicador com segurança. Pode reformular?";
        clearTimeout(timeout);
        return Response.json(
          frontendResponse({
            sessionId,
            answer: Array.isArray(text) ? text.join(" ") : text,
            intent: "clarification",
            queryPlan: plan,
            clarification: text,
            conversationContext,
          }),
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const result = await executeMetricQuery(plan);
      if (isDefinitionIntent(plan.intent)) {
        result.value = null;
        result.realtime_database = false;
      }
      const nextCtx = mergeConversationContext(conversationContext, {
        last_domain: plan.domain,
        last_metric: plan.metric,
        last_filters: plan.filters || {},
        last_intent: plan.intent,
      });
      let answer = verbalizeMetricResult(plan, result);
      try {
        const verbal = await callN8n(webhookUrl, {
          mode: isDefinitionIntent(plan.intent) ? "rule" : "answer",
          pergunta,
          session_id: sessionId,
          intent: plan.intent,
          conversation_context: nextCtx,
          query_plan: plan,
          metric_rule: result.definition_text,
          query_result: {
            ...result,
            value: isDefinitionIntent(plan.intent) ? null : result.value,
          },
        }, controller.signal);
        if (typeof verbal?.answer === "string" && verbal.answer.trim()) {
          const onlyNumber = /^\s*[\d.,]+\s*%?\s*$/.test(verbal.answer.trim());
          if (!(isDefinitionIntent(plan.intent) && onlyNumber)) answer = verbal.answer.trim();
        }
      } catch { /* keep */ }
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer,
          intent: plan.intent,
          queryPlan: plan,
          queryResult: result,
          conversationContext: nextCtx,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const validated = validateQueryPlan(queryPlan);
    const clarifyMsgs = [
      ...(Array.isArray(clarification) ? clarification : clarification ? [clarification] : []),
      ...(validated.clarification || []),
    ].filter(Boolean);

    if (clarifyMsgs.length && (!validated.ok || !validated.plan?.metric) && !validated.pending) {
      const answer = [...new Set(clarifyMsgs)].join(" ");
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer,
          intent: "clarification",
          queryPlan: validated.plan || queryPlan,
          clarification: answer,
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (validated.pending) {
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer: "Ainda não consigo consultar esse indicador nesta fase do assistente.",
          intent: "value",
          queryPlan: validated.plan,
          queryResult: { warnings: validated.warnings, realtime_database: false },
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const intent = validated.plan?.intent || queryPlan.intent || "value";

    if (intent === "rule" || intent === "location" || (validated.skipExecute && intent !== "mixed" && intent !== "value")) {
      const metricRule = validated.plan?.metric && portalQueryRegistry[validated.plan.domain]?.metrics?.[validated.plan.metric]?.rule;
      const ruleRaw = await callN8n(webhookUrl, {
        mode: "rule",
        pergunta,
        session_id: sessionId,
        user_email: userEmail,
        origem: ORIGIN_TAG,
        intent,
        conversation_context: conversationContext,
        query_plan: validated.plan,
        metric_rule: metricRule || null,
      }, controller.signal);
      clearTimeout(timeout);
      const nextCtx = mergeConversationContext(conversationContext, {
        last_domain: validated.plan?.domain,
        last_metric: validated.plan?.metric,
        last_intent: intent,
      });
      return Response.json(
        frontendResponse({
          sessionId: ruleRaw.session_id || sessionId,
          answer: (ruleRaw.answer || "").trim() || "Não foi possível explicar a regra.",
          intent,
          queryPlan: validated.plan,
          queryResult: { realtime_database: false, warnings: validated.warnings || [] },
          conversationContext: nextCtx,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const queryResult = await executePortalQuery(validated.plan, new Date(), {
      question: pergunta,
      engineerToken: queryPlan._engineerToken,
    });

    if (queryResult.ambiguities?.length) {
      clearTimeout(timeout);
      return Response.json(
        frontendResponse({
          sessionId,
          answer: queryResult.ambiguities.join(" "),
          intent: "clarification",
          queryPlan: validated.plan,
          queryResult,
          clarification: queryResult.ambiguities,
          conversationContext,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const nextCtx = mergeConversationContext(conversationContext, {
      last_domain: validated.plan.domain,
      last_metric: validated.plan.metric,
      last_filters: queryResult.filters || {},
      last_intent: intent,
    });

    const answerRaw = await callN8n(webhookUrl, {
      mode: "answer",
      pergunta,
      session_id: sessionId,
      user_email: userEmail,
      origem: ORIGIN_TAG,
      intent,
      conversation_context: nextCtx,
      query_plan: {
        intent,
        domain: validated.plan.domain,
        metric: validated.plan.metric,
        filters: queryResult.filters,
      },
      query_result: {
        value: queryResult.value,
        label: queryResult.label,
        filters: queryResult.filters,
        filter_labels: queryResult.filter_labels,
        sources: queryResult.sources,
        warnings: queryResult.warnings,
        metric_definition: queryResult.metric_definition,
        realtime_database: queryResult.realtime_database,
        generated_at: queryResult.generated_at,
      },
    }, controller.signal);

    clearTimeout(timeout);
    if (typeof answerRaw?.answer !== "string" || !answerRaw.answer.trim()) {
      return errorJson(502, "O assistente retornou uma resposta inválida.", "N8N_INVALID_RESPONSE");
    }

    return Response.json(
      frontendResponse({
        sessionId: answerRaw.session_id || sessionId,
        answer: answerRaw.answer.trim(),
        intent,
        queryPlan: validated.plan,
        queryResult,
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
