/**
 * Autenticação no projeto Business Data (mesmo host do Auth Google).
 * Tokens JWT da sessão validam neste projeto; não misturar com BASE QV (dados operacionais).
 */
import { getAuthEnv } from "./env.mjs";

export const CORPORATE_EMAIL_DOMAIN = "quartavia.com.br";
const AUTH_CACHE_TTL_MS = 30_000;
const validatedTokens = new Map();
const validationsInFlight = new Map();

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

async function requestAuthUser(authUrl, anonKey, token) {
  const cached = validatedTokens.get(token);
  if (cached?.expiresAt > Date.now()) return { user: cached.user };
  if (cached) validatedTokens.delete(token);

  let pending = validationsInFlight.get(token);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(`${authUrl}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
        });
        if (!response.ok) {
          return {
            status: response.status,
            details: (await response.text().catch(() => "")).slice(0, 240),
          };
        }
        const user = await response.json().catch(() => null);
        if (!user?.email) return { status: 401, details: "Auth API não retornou usuário." };
        validatedTokens.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
        return { user };
      } catch (error) {
        return {
          status: 0,
          details: error instanceof Error ? error.message : String(error),
        };
      }
    })();
    validationsInFlight.set(token, pending);
  }

  try {
    return await pending;
  } finally {
    validationsInFlight.delete(token);
  }
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

  const authResult = await requestAuthUser(authUrl, anonKey, token);
  if (!authResult.user) {
    console.error("[Auth] Auth API rejeitou token:", {
      status: authResult.status,
      project: (() => {
        try { return new URL(authUrl).hostname.split(".")[0]; } catch { return "invalid"; }
      })(),
      details: authResult.details,
    });
    if (
      !authResult.status ||
      authResult.status === 408 ||
      authResult.status === 425 ||
      authResult.status === 429 ||
      authResult.status >= 500
    ) {
      return {
        error: jsonError(
          503,
          "Não foi possível validar a sessão agora. Tente novamente.",
          "auth_unavailable",
        ),
      };
    }
    return { error: jsonError(401, "Sessão inválida ou expirada.", "unauthenticated") };
  }

  const user = authResult.user;
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
