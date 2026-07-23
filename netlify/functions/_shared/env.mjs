/**
 * Variáveis de ambiente com finalidade explícita.
 * Auth / Business Data = projeto rckpuebaiswrxzmywllv (login Google + research.*)
 * Data = BASE QV (lacinx…) para demais dashboards (clients, reuniões, mecanismos…).
 * App Pharus = projeto qvtqufdivpbmubooawdm (mecanismos sugeridos; conexão adicional).
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

const PHARUS_DEFAULT_URL = "https://qvtqufdivpbmubooawdm.supabase.co";
const PHARUS_PROJECT_ID = "qvtqufdivpbmubooawdm";

function projectRefFromUrl(url) {
  try {
    return new URL(url).host.split(".")[0] || PHARUS_PROJECT_ID;
  } catch {
    return PHARUS_PROJECT_ID;
  }
}

/**
 * Conexão adicional App Pharus (somente backend).
 * Usa anon key do projeto Pharus — não reutilizar AUTH nem DATA.
 */
export function getPharusEnv() {
  const url = (
    process.env.PHARUS_SUPABASE_URL
    || process.env.APP_PHARUS_SUPABASE_URL
    || PHARUS_DEFAULT_URL
  )
    .trim()
    .replace(/\/$/, "");
  const anonKey = (
    process.env.PHARUS_SUPABASE_ANON_KEY
    || process.env.APP_PHARUS_SUPABASE_ANON_KEY
    || ""
  ).trim();
  const schema = (
    process.env.PHARUS_SUPABASE_SCHEMA
    || process.env.APP_PHARUS_SUPABASE_SCHEMA
    || "public"
  ).trim() || "public";
  return {
    url,
    anonKey,
    schema,
    projectId: projectRefFromUrl(url) || PHARUS_PROJECT_ID,
  };
}

export function pharusConfigurationError() {
  const { url, anonKey } = getPharusEnv();
  if (!url) return "Configure PHARUS_SUPABASE_URL.";
  if (!anonKey) {
    return "Configure PHARUS_SUPABASE_ANON_KEY no ambiente do backend (não no frontend).";
  }
  try {
    if (new URL(url).protocol !== "https:") return "PHARUS_SUPABASE_URL deve usar HTTPS";
  } catch {
    return "PHARUS_SUPABASE_URL inválida";
  }
  return null;
}

/**
 * Cliente REST exclusivo do App Pharus (sem sessão / sem persistência).
 * Equivalente conceitual a createClient(..., { auth: { persistSession: false, ... } }).
 * Não compartilha sessão com Auth nem com a BASE QV.
 */
export function getPharusSupabaseClient(options = {}) {
  const configError = pharusConfigurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "pharus_config";
    throw err;
  }
  const env = getPharusEnv();
  const schema = (options.schema || env.schema || "public").trim() || "public";
  const authOptions = {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  };

  async function rest(table, { select = "*", filters = {}, limit, offset, countExact = false, head = false } = {}) {
    const endpoint = new URL(`/rest/v1/${table}`, env.url);
    endpoint.searchParams.set("select", select);
    for (const [key, value] of Object.entries(filters || {})) {
      if (value == null || value === "") continue;
      endpoint.searchParams.set(key, String(value));
    }
    if (limit != null) endpoint.searchParams.set("limit", String(limit));
    if (offset != null) endpoint.searchParams.set("offset", String(offset));

    const headers = {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      Accept: "application/json",
      "Accept-Profile": schema,
      "Content-Profile": schema,
    };
    if (countExact) headers.Prefer = head ? "count=exact" : "count=exact";
    if (head) {
      // HEAD-like: range 0-0 with Prefer count
      headers.Range = "0-0";
      headers.Prefer = "count=exact";
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
    });
    const text = await response.text();
    let data = null;
    if (!head && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    const contentRange = response.headers.get("content-range") || "";
    const totalMatch = contentRange.match(/\/(\d+|\*)\s*$/);
    const total = totalMatch && totalMatch[1] !== "*" ? Number(totalMatch[1]) : null;
    return {
      ok: response.ok,
      status: response.status,
      data: Array.isArray(data) ? data : (data == null ? [] : [data]),
      raw: text,
      total,
      schema,
      table,
    };
  }

  async function fetchAll(table, select = "*", { pageSize = 1000, maxRows = 200000 } = {}) {
    const rows = [];
    let offset = 0;
    while (offset < maxRows) {
      const page = await rest(table, { select, limit: pageSize, offset, countExact: offset === 0 });
      if (!page.ok) {
        const err = new Error(`${schema}.${table}: HTTP ${page.status}`);
        err.status = page.status;
        err.raw = (page.raw || "").slice(0, 240);
        throw err;
      }
      rows.push(...page.data);
      if (page.data.length < pageSize) break;
      offset += pageSize;
    }
    return rows;
  }

  return {
    url: env.url,
    projectId: env.projectId,
    schema,
    auth: authOptions,
    rest,
    fetchAll,
  };
}
