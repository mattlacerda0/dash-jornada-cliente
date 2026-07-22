import { authenticateRequest } from "./_shared/auth.mjs";
import { resolvePortalContext } from "./_shared/portal-query.mjs";

/**
 * Proxy autenticado do chatbot "Assistente da Jornada".
 *
 * Fluxo: Frontend -> POST /api/assistant -> valida usuário corporativo
 * -> identifica a intenção e, para perguntas de valor conhecidas, calcula a
 *    métrica localmente reutilizando os cálculos dos dashboards
 * -> envia pergunta + intent + dados_contexto ao webhook do n8n (analytics-jornada-chat)
 * -> devolve resposta padronizada (metadados autoritativos vêm do backend).
 *
 * O n8n NÃO acessa o localhost: recebe apenas o contexto já calculado.
 * Nunca encaminha o access token do usuário ao n8n e nunca expõe segredos ao navegador.
 */

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_QUESTION_LENGTH = 2000;
const ORIGIN_TAG = "portal-analytics-jornada";

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
  // Ponte local (server.py): a autenticação HTTP já foi validada em Python.
  // Na Netlify, NETLIFY=true, portanto esta ponte nunca se aplica.
  return process.env.PORTAL_INTERNAL_DATA_RUN === "1" && !process.env.NETLIFY;
}

/**
 * Retorna { email } quando autenticado ou { error: Response } caso contrário.
 */
async function resolveUserEmail(request) {
  if (isLocalBridge()) {
    const email = (request.headers.get("x-portal-user-email") || "").trim();
    if (!email) {
      return { error: errorJson(401, "Não autenticado.", "unauthenticated") };
    }
    return { email };
  }

  const result = await authenticateRequest(request);
  if (result.error) {
    const status = result.error.status;
    let body = {};
    try {
      body = await result.error.json();
    } catch {
      body = {};
    }
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
  try {
    body = await request.json();
  } catch {
    return errorJson(400, "JSON inválido.", "invalid_json");
  }

  const rawQuestion = body?.pergunta;
  if (typeof rawQuestion !== "string") {
    return errorJson(400, "A pergunta é obrigatória.", "invalid_question");
  }
  const pergunta = rawQuestion.trim();
  if (!pergunta) {
    return errorJson(400, "A pergunta é obrigatória.", "invalid_question");
  }
  if (pergunta.length > MAX_QUESTION_LENGTH) {
    return errorJson(
      400,
      `A pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`,
      "question_too_long",
    );
  }

  const sessionId =
    typeof body?.session_id === "string" && body.session_id.trim()
      ? body.session_id.trim()
      : (globalThis.crypto?.randomUUID?.() ?? `sess-${Date.now()}`);

  const webhookUrl = (process.env.N8N_CHAT_WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    return errorJson(500, "N8N_CHAT_WEBHOOK_URL não configurada.", "config_missing");
  }

  // Motor central: identifica domínio/métrica/intenção, aplica filtros e calcula
  // o contexto confiável localmente (fonte de verdade). O Gemini apenas verbaliza.
  let intent = "general";
  let dadosContexto = null;
  try {
    const resolved = await resolvePortalContext(pergunta);
    intent = resolved.intent;
    dadosContexto = resolved.dados_contexto;
  } catch (err) {
    console.error("[assistant] falha ao resolver contexto:", err?.message || err);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let n8nResponse;
  try {
    n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        pergunta,
        session_id: sessionId,
        user_email: userEmail,
        origem: ORIGIN_TAG,
        intent,
        dados_contexto: dadosContexto,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      console.error("[assistant] timeout ao chamar o n8n");
      return errorJson(
        504,
        "O assistente demorou mais que o esperado. Tente novamente.",
        "N8N_TIMEOUT",
      );
    }
    console.error("[assistant] falha de conexão com o n8n:", err?.message || err);
    return errorJson(502, "Não foi possível conectar ao assistente.", "N8N_UNREACHABLE");
  }
  clearTimeout(timeout);

  if (!n8nResponse.ok) {
    console.error("[assistant] n8n respondeu com status", n8nResponse.status);
    return errorJson(502, "O assistente respondeu com erro. Tente novamente.", "N8N_ERROR");
  }

  let raw;
  try {
    raw = await n8nResponse.json();
  } catch {
    console.error("[assistant] resposta do n8n não é JSON válido");
    return errorJson(502, "O assistente retornou uma resposta inválida.", "N8N_INVALID_RESPONSE");
  }

  if (raw?.success === false) {
    console.error("[assistant] n8n sinalizou success=false");
    return errorJson(502, "O assistente não conseguiu responder. Tente novamente.", "N8N_ERROR");
  }

  if (typeof raw?.answer !== "string" || !raw.answer.trim()) {
    console.error("[assistant] resposta do n8n sem campo answer");
    return errorJson(502, "O assistente retornou uma resposta inválida.", "N8N_INVALID_RESPONSE");
  }

  // Metadados autoritativos: derivados do backend (dados_contexto), não do eco do n8n.
  const resolvedSession =
    (typeof raw?.session_id === "string" && raw.session_id.trim()) || sessionId;
  const normalized = {
    success: true,
    session_id: resolvedSession,
    answer: raw.answer,
    intent,
    domain: dadosContexto?.domain ?? null,
    metric: dadosContexto?.metric ?? null,
    metric_definition: dadosContexto?.metric_definition ?? null,
    metadata: dadosContexto?.metadata ?? null,
    filters: dadosContexto?.filters ?? null,
    filter_labels: Array.isArray(dadosContexto?.filter_labels) ? dadosContexto.filter_labels : [],
    sources: Array.isArray(dadosContexto?.sources) ? dadosContexto.sources : [],
    warnings: Array.isArray(dadosContexto?.warnings) ? dadosContexto.warnings : [],
    ambiguities: Array.isArray(dadosContexto?.ambiguities) ? dadosContexto.ambiguities : [],
    realtime_database: dadosContexto?.realtime_database === true,
    generated_at: nowIso(),
  };
  return Response.json(normalized, { headers: { "Cache-Control": "no-store" } });
};
