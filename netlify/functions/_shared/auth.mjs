/**
 * Autenticação no projeto Business Data (mesmo host do Auth Google).
 * Tokens JWT da sessão validam neste projeto; não misturar com BASE QV (dados operacionais).
 */
import { getAuthEnv } from "./env.mjs";

export const CORPORATE_EMAIL_DOMAIN = "quartavia.com.br";

export function isQuartaviaEmail(email) {
  if (typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith("@" + CORPORATE_EMAIL_DOMAIN);
}

export function isCorporateEmail(email) {
  return isQuartaviaEmail(email);
}

function jsonError(status, error, code) {
  return Response.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Valida Bearer token no projeto de autenticação e domínio corporativo.
 * @param {Request} request
 * @returns {Promise<{ user: object } | { error: Response }>}
 */
export async function authenticateRequest(request) {
  const header =
    request?.headers?.get?.("authorization") ||
    request?.headers?.get?.("Authorization") ||
    "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { error: jsonError(401, "Não autenticado.", "unauthenticated") };
  }

  const token = match[1].trim();
  if (!token) {
    return { error: jsonError(401, "Não autenticado.", "unauthenticated") };
  }

  const { url: authUrl, anonKey } = getAuthEnv();
  if (!authUrl || !anonKey) {
    return {
      error: jsonError(
        503,
        "Configure AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY.",
        "config",
      ),
    };
  }

  let userResponse;
  try {
    // Equivalente a authSupabase.auth.getUser(token) via Auth API do projeto Auth.
    userResponse = await fetch(`${authUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });
  } catch {
    return { error: jsonError(401, "Sessão inválida ou expirada.", "unauthenticated") };
  }

  if (!userResponse.ok) {
    return { error: jsonError(401, "Sessão inválida ou expirada.", "unauthenticated") };
  }

  const user = await userResponse.json().catch(() => null);
  if (!user?.email) {
    return { error: jsonError(401, "Sessão inválida ou expirada.", "unauthenticated") };
  }

  if (!isQuartaviaEmail(user.email)) {
    return {
      error: jsonError(
        403,
        "O acesso é permitido somente para contas @quartavia.com.br.",
        "invalid_domain",
      ),
    };
  }

  return { user };
}

/**
 * Compatível com os handlers: retorna Response de erro ou null se OK.
 * @param {Request} request
 * @returns {Promise<Response | null>}
 */
export async function requireCorporateAuth(request) {
  // Bridge local (server.py): auth HTTP já validada; o subprocess Node só consolida dados.
  // Na Netlify, NETLIFY=true — este bypass nunca se aplica.
  if (process.env.PORTAL_INTERNAL_DATA_RUN === "1" && !process.env.NETLIFY) {
    console.error("[Auth] internal data run (server.py já validou o Bearer)");
    return null;
  }

  const headerPresent = Boolean(
    request?.headers?.get?.("authorization") || request?.headers?.get?.("Authorization"),
  );
  console.error("[Auth] header presente:", headerPresent);

  const result = await authenticateRequest(request);
  if (result.error) {
    console.error("[Auth] token validado: false");
    return result.error;
  }
  console.error("[Auth] token validado: true");
  console.error("[Auth] domínio autorizado: true");
  return null;
}
