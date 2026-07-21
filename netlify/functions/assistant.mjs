import { authenticateRequest } from "./_shared/auth.mjs";

/**
 * Proxy autenticado do chatbot "Assistente da Jornada".
 *
 * Fluxo: Frontend -> POST /api/assistant -> valida usuário corporativo
 * -> chama webhook do n8n (analytics-jornada-chat) -> devolve resposta padronizada.
 *
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

function normalizeN8nPayload(raw, sessionId) {
  const answer = typeof raw?.answer === "string" ? raw.answer : "";
  const intent = typeof raw?.intent === "string" && raw.intent.trim() ? raw.intent : "general";

  let sources = [];
  if (Array.isArray(raw?.sources)) {
    sources = raw.sources;
  } else if (raw?.source && typeof raw.source === "string") {
    // Formato atual do catálogo estático: expõe apenas a string "source".
    sources = [];
  }

  const warnings = Array.isArray(raw?.warnings) ? raw.warnings : [];
  const realtime = raw?.realtime_database === true;
  const resolvedSession =
    (typeof raw?.session_id === "string" && raw.session_id.trim()) || sessionId;

  return {
    success: true,
    session_id: resolvedSession,
    answer,
    intent,
    sources,
    warnings,
    realtime_database: realtime,
    generated_at:
      typeof raw?.generated_at === "string" && raw.generated_at.trim()
        ? raw.generated_at
        : nowIso(),
  };
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

  const normalized = normalizeN8nPayload(raw, sessionId);
  return Response.json(normalized, { headers: { "Cache-Control": "no-store" } });
};
