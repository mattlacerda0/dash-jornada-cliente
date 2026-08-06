/**
 * Configuração pública de Auth para o navegador.
 * Expõe apenas AUTH_SUPABASE_URL + AUTH_SUPABASE_ANON_KEY.
 * Nunca retorna service role nem chaves do projeto de dados.
 */
import { getAuthEnv } from "./_shared/env.mjs";

export default async () => {
  const { url, anonKey } = getAuthEnv();

  if (!url || !anonKey) {
    return Response.json(
      {
        error: "Configuração de autenticação ausente.",
        code: "AUTH_CONFIG_MISSING",
        detail:
          "Configure AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY no ambiente do Netlify/servidor.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!/^https:\/\//i.test(url)) {
    return Response.json(
      { error: "AUTH_SUPABASE_URL deve usar HTTPS.", code: "AUTH_CONFIG_INVALID" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (/service_role/i.test(anonKey)) {
    return Response.json(
      {
        error: "Chave de serviço não pode ser exposta ao navegador. Use AUTH_SUPABASE_ANON_KEY.",
        code: "AUTH_CONFIG_INVALID",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      authSupabaseUrl: url.replace(/\/$/, ""),
      authSupabaseAnonKey: anonKey,
      corporateDomain: "quartavia.com.br",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
