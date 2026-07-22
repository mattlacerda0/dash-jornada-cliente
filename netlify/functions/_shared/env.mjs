/**
 * Variáveis de ambiente com finalidade explícita.
 * Auth = projeto rckpuebaiswrxzmywllv | Data = BASE QV
 */

export function getAuthEnv() {
  const url = (process.env.AUTH_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = (process.env.AUTH_SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

export function getDataEnv() {
  const url = (process.env.DATA_SUPABASE_URL || process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const serviceRoleKey = (
    process.env.DATA_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  if (!process.env.DATA_SUPABASE_URL && url) process.env.DATA_SUPABASE_URL = url;
  if (!process.env.DATA_SUPABASE_SERVICE_ROLE_KEY && serviceRoleKey) {
    process.env.DATA_SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  }
  return { url, serviceRoleKey };
}

export function dataConfigurationError() {
  const { url, serviceRoleKey } = getDataEnv();
  if (!url || !serviceRoleKey) {
    return "Configure DATA_SUPABASE_URL/DATA_SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.";
  }
  try {
    if (new URL(url).protocol !== "https:") return "DATA_SUPABASE_URL deve usar HTTPS";
  } catch {
    return "DATA_SUPABASE_URL inválida";
  }
  return null;
}
