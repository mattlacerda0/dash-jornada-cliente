import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";
import { deliverExecutiveAnalysis } from "./_shared/executive-delivery.mjs";

function nowIso() {
  return new Date().toISOString();
}

function json(status, payload) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text || !String(text).trim()) return {};
  return JSON.parse(text);
}

function wantsGenerate(body) {
  const g = body?.generate;
  return g === true || g === "true" || g === 1 || g === "1";
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  if (request.method !== "POST") {
    return json(405, {
      success: false,
      code: "method_not_allowed",
      error: "Use POST /api/ai-analysis.",
      generated_at: nowIso(),
    });
  }

  const configError = dataConfigurationError();
  if (configError) {
    return json(503, { success: false, error: configError, code: "config", generated_at: nowIso() });
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return json(400, {
      success: false,
      code: "invalid_json",
      error: "Corpo JSON inválido.",
      generated_at: nowIso(),
    });
  }

  try {
    const result = await deliverExecutiveAnalysis({
      page: body?.page,
      filters: body?.filters && typeof body.filters === "object" ? body.filters : {},
      generate: wantsGenerate(body),
      refresh: body?.refresh === true || body?.refresh === "true",
    });
    const status = result.success || result.code === "page_not_supported" ? 200 : 400;
    return json(status, result);
  } catch (error) {
    const code = error?.code === "config" ? "config" : "data_query_failed";
    const status = code === "config" ? 503 : 500;
    console.error("[ai-analysis]", error instanceof Error ? error.message : error);
    return json(status, {
      success: false,
      code,
      error: "Não foi possível montar o contexto da análise.",
      generated_at: nowIso(),
    });
  }
};
