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
  const url = (process.env.DATA_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRoleKey = (process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, serviceRoleKey };
}

export function dataConfigurationError() {
  const { url, serviceRoleKey } = getDataEnv();
  if (!url || !serviceRoleKey) {
    return "Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY.";
  }
  try {
    if (new URL(url).protocol !== "https:") return "DATA_SUPABASE_URL deve usar HTTPS";
  } catch {
    return "DATA_SUPABASE_URL inválida";
  }
  return null;
}
