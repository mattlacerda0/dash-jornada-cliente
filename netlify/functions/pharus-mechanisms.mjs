/**
 * Endpoint independente: mecanismos sugeridos no App Pharus.
 * Fonte: PHARUS_SUPABASE_* (projeto qvtqufdivpbmubooawdm).
 * Não mistura com BASE QV (client_mecanismos / mecanismos).
 * Falha isolada: não derruba demais dashboards.
 */
import { requireCorporateAuth } from "./_shared/auth.mjs";
import {
  getPharusEnv,
  getPharusSupabaseClient,
  pharusConfigurationError,
} from "./_shared/env.mjs";

const PHARUS_PROJECT_ID = "qvtqufdivpbmubooawdm";
const MECHANISM_SELECT = "id,data,created_at,updated_at";
const USER_MECH_SELECT = "id,user_id,mechanism_id,status,notes,created_at";

const USED_FIELDS = [
  { table: "user_mechanisms", column: "id", role: "suggestionId" },
  { table: "user_mechanisms", column: "user_id", role: "pharusUserId" },
  { table: "user_mechanisms", column: "mechanism_id", role: "mechanismId" },
  { table: "user_mechanisms", column: "status", role: "suggestionStatus" },
  { table: "user_mechanisms", column: "created_at", role: "suggestedAt" },
  { table: "mechanisms", column: "id", role: "catalogId" },
  { table: "mechanisms", column: "data", role: "mechanismJson" },
  { table: "mechanisms", column: "created_at", role: "catalogCreated" },
  { table: "mechanisms", column: "updated_at", role: "catalogUpdated" },
];

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function foldToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function monthKey(date) {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Normaliza mechanisms.data (objeto, string JSON ou inválido). */
export function normalizeMechanismData(raw, warnings, mechanismId) {
  if (raw == null) {
    warnings.push({
      code: "mechanism_data_missing",
      message: "mechanisms.data ausente",
      mechanismId: mechanismId || null,
    });
    return null;
  }
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      warnings.push({
        code: "mechanism_data_invalid_json",
        message: "mechanisms.data com JSON inválido",
        mechanismId: mechanismId || null,
      });
      return null;
    }
  }
  if (typeof obj !== "object" || Array.isArray(obj)) {
    warnings.push({
      code: "mechanism_data_invalid_shape",
      message: "mechanisms.data não é um objeto",
      mechanismId: mechanismId || null,
    });
    return null;
  }
  const pick = (...keys) => {
    for (const key of keys) {
      const v = blankToNull(obj[key]);
      if (v != null) return v;
    }
    return null;
  };
  return {
    name: pick("name", "title", "label") || mechanismId || "Não informado",
    risk: pick("risk", "risco"),
    engine: pick("engine", "motor"),
    market: pick("market", "mercado"),
    horizon: pick("horizon", "horizonte"),
    adminFee: pick("adminFee", "admin_fee", "taxaAdmin"),
    category: pick("category", "categoria"),
    strategy: pick("strategy", "estrategia"),
    description: pick("description", "descricao"),
    capitalization: pick("capitalization", "capitalizacao"),
    estimatedReturn: pick("estimatedReturn", "estimated_return", "retornoEstimado"),
    strategicWindows: obj.strategicWindows ?? obj.strategic_windows ?? null,
    secondaryCategory: pick("secondaryCategory", "secondary_category", "categoriaSecundaria"),
  };
}

function distributionFromCounter(counter, total) {
  return [...counter.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percent: total ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), "pt-BR"));
}

function bump(map, key) {
  const label = key || "Não informado";
  map.set(label, (map.get(label) || 0) + 1);
}

async function probeSchema(preferredSchema) {
  const candidates = [...new Set([
    preferredSchema,
    "public",
    "core",
  ].filter(Boolean))];
  const warnings = [];
  for (const schema of candidates) {
    try {
      const client = getPharusSupabaseClient({ schema });
      const mech = await client.rest("mechanisms", { select: "id", limit: 1, countExact: true });
      const um = await client.rest("user_mechanisms", { select: "id", limit: 1, countExact: true });
      if (mech.ok && um.ok) {
        return { schema, client, warnings };
      }
      warnings.push({
        code: "schema_probe_denied",
        message: `Schema ${schema}: mechanisms HTTP ${mech.status}, user_mechanisms HTTP ${um.status}`,
      });
    } catch (err) {
      warnings.push({
        code: "schema_probe_error",
        message: `Schema ${schema}: ${err.message || "falha"}`,
      });
    }
  }
  return { schema: null, client: null, warnings };
}

function emptyPayload({ status, warnings, message, code, missing }) {
  const env = getPharusEnv();
  const urlConfigured = Boolean(env.url);
  const keyConfigured = Boolean(env.anonKey);
  return {
    generatedAt: new Date().toISOString(),
    success: status !== "failed",
    code: code || (status === "failed" ? "pharus_unavailable" : null),
    missing: Array.isArray(missing) ? missing : [],
    config: {
      pharusUrlConfigured: urlConfigured,
      pharusKeyConfigured: keyConfigured,
    },
    source: {
      project: "App Pharus",
      projectId: env.projectId || PHARUS_PROJECT_ID,
      status,
      schema: env.schema || null,
      message: message || null,
    },
    summary: {
      usersWithSuggestions: 0,
      totalSuggestions: 0,
      distinctSuggestedTypes: 0,
      topSuggestedMechanism: null,
      topMarket: null,
      topCategory: null,
      recentSuggestions30d: 0,
      catalogMechanisms: 0,
      orphanMechanismIds: 0,
    },
    distributions: {
      byMechanism: [],
      byStatus: [],
      byMarket: [],
      byCategory: [],
      byRisk: [],
      byMonth: [],
    },
    suggestions: [],
    catalog: [],
    quality: {
      fields: USED_FIELDS,
      fieldCoverage: [],
      limitations: [
        "user_mechanisms não possui implemented_at nesta fonte.",
        "Status observado tipicamente como suggested — não tratar como implementação.",
        "Não cruzar user_id do App Pharus com client_id da BASE QV sem chave confiável.",
      ],
      joinKeyAudit: {
        status: "pending",
        note: "Cruzamento App Pharus ↔ BASE QV ainda não confirmado (não usar nome).",
      },
    },
    warnings: warnings || [],
    usedFields: USED_FIELDS,
  };
}

export async function computePharusMechanismsPayload() {
  const configError = pharusConfigurationError();
  if (configError) {
    const env = getPharusEnv();
    const missing = [];
    if (!env.url) missing.push("PHARUS_SUPABASE_URL");
    if (!env.anonKey) missing.push("PHARUS_SUPABASE_ANON_KEY");
    return emptyPayload({
      status: "failed",
      code: "pharus_env_missing",
      missing,
      message: "Não foi possível consultar o App Pharus",
      warnings: [{ code: "pharus_env_missing", message: configError, missing }],
    });
  }

  const preferred = getPharusEnv().schema;
  const probe = await probeSchema(preferred);
  if (!probe.client) {
    const rlsHint = {
      code: "rls_or_schema",
      message:
        "Leitura bloqueada ou tabelas não encontradas. É necessária política SELECT para o role anon (ou credencial backend com permissão). RLS não foi alterada por este portal.",
    };
    return emptyPayload({
      status: "failed",
      message: "Não foi possível consultar o App Pharus",
      warnings: [...probe.warnings, rlsHint],
    });
  }

  const warnings = [...probe.warnings];
  const schema = probe.schema;
  const client = probe.client;

  let mechanismsRows = [];
  let userMechRows = [];
  try {
    mechanismsRows = await client.fetchAll("mechanisms", MECHANISM_SELECT);
    userMechRows = await client.fetchAll("user_mechanisms", USER_MECH_SELECT);
  } catch (err) {
    const status = err.status || 0;
    warnings.push({
      code: status === 401 || status === 403 ? "rls_denied" : "fetch_failed",
      message:
        status === 401 || status === 403
          ? "Acesso negado pelo App Pharus (anon key / RLS). Configure política SELECT ou use credencial backend adequada — sem desativar RLS."
          : (err.message || "Falha ao ler tabelas do App Pharus"),
    });
    return emptyPayload({
      status: "failed",
      message: "Não foi possível consultar o App Pharus",
      warnings,
    });
  }

  const catalogById = new Map();
  const catalog = [];
  for (const row of mechanismsRows) {
    const id = blankToNull(row.id);
    if (!id) continue;
    const dataWarnings = [];
    const mechanism = normalizeMechanismData(row.data, dataWarnings, id);
    for (const w of dataWarnings) warnings.push(w);
    const item = {
      id: String(id),
      name: mechanism?.name || String(id),
      risk: mechanism?.risk || null,
      market: mechanism?.market || null,
      category: mechanism?.category || null,
      engine: mechanism?.engine || null,
      horizon: mechanism?.horizon || null,
      createdAt: parseDate(row.created_at)?.toISOString() || null,
      updatedAt: parseDate(row.updated_at)?.toISOString() || null,
      source: "app_pharus",
    };
    catalogById.set(String(id), item);
    catalog.push(item);
  }

  const userIds = new Set();
  const statusCounter = new Map();
  const mechanismCounter = new Map();
  const marketCounter = new Map();
  const categoryCounter = new Map();
  const riskCounter = new Map();
  const monthCounter = new Map();
  let orphanMechanismIds = 0;
  let missingUserId = 0;
  let missingStatus = 0;
  let recentSuggestions30d = 0;
  const now = Date.now();
  const day30 = 30 * 86400000;
  const suggestions = [];

  for (const row of userMechRows) {
    const id = blankToNull(row.id);
    const userId = blankToNull(row.user_id);
    const mechanismId = blankToNull(row.mechanism_id);
    const status = blankToNull(row.status);
    const createdAt = parseDate(row.created_at);

    if (!userId) {
      missingUserId += 1;
      warnings.push({ code: "user_id_missing", message: "user_mechanisms.user_id ausente" });
    } else {
      userIds.add(String(userId));
    }
    if (!status) {
      missingStatus += 1;
      warnings.push({ code: "status_missing", message: "user_mechanisms.status ausente" });
    }

    const catalogItem = mechanismId ? catalogById.get(String(mechanismId)) : null;
    if (mechanismId && !catalogItem) {
      orphanMechanismIds += 1;
      warnings.push({
        code: "mechanism_orphan",
        message: "mechanism_id sem correspondência em mechanisms",
        mechanismId: String(mechanismId),
      });
    }

    bump(statusCounter, status ? String(status) : "Não informado");
    const mechLabel = catalogItem?.name || (mechanismId ? String(mechanismId) : "Não informado");
    bump(mechanismCounter, mechLabel);
    bump(marketCounter, catalogItem?.market || "Não informado");
    bump(categoryCounter, catalogItem?.category || "Não informado");
    bump(riskCounter, catalogItem?.risk || "Não informado");
    const mk = monthKey(createdAt);
    if (mk) bump(monthCounter, mk);

    if (createdAt && now - createdAt.getTime() <= day30) recentSuggestions30d += 1;

    suggestions.push({
      id: id != null ? String(id) : null,
      userId: userId != null ? String(userId) : null,
      mechanismId: mechanismId != null ? String(mechanismId) : null,
      status: status != null ? String(status) : null,
      notes: blankToNull(row.notes),
      createdAt: createdAt?.toISOString() || null,
      mechanism: catalogItem
        ? {
          name: catalogItem.name,
          risk: catalogItem.risk,
          market: catalogItem.market,
          category: catalogItem.category,
        }
        : null,
      source: "app_pharus",
    });
  }

  // Deduplicate noisy warnings (keep first N unique codes)
  const seenWarn = new Set();
  const compactWarnings = [];
  for (const w of warnings) {
    const key = `${w.code}|${w.mechanismId || ""}|${w.message || ""}`;
    if (seenWarn.has(key)) continue;
    seenWarn.add(key);
    compactWarnings.push(w);
    if (compactWarnings.length >= 40) break;
  }
  if (orphanMechanismIds) {
    compactWarnings.unshift({
      code: "orphan_mechanism_summary",
      message: `${orphanMechanismIds} mechanism_id(s) sem correspondência no catálogo mechanisms`,
      count: orphanMechanismIds,
    });
  }
  compactWarnings.push({
    code: "no_implementation_evidence",
    message:
      "Fonte localizada parcialmente no App Pharus, mas ainda sem evidência de implementação e data de conclusão (não usar created_at como implemented_at).",
  });

  const totalSuggestions = userMechRows.length;
  const byMechanism = distributionFromCounter(mechanismCounter, totalSuggestions);
  const topSuggestedMechanism = byMechanism[0]
    ? { name: byMechanism[0].label, count: byMechanism[0].count, percent: byMechanism[0].percent }
    : null;
  const byMarket = distributionFromCounter(marketCounter, totalSuggestions);
  const byCategory = distributionFromCounter(categoryCounter, totalSuggestions);
  const topMarket = byMarket[0] ? { name: byMarket[0].label, count: byMarket[0].count } : null;
  const topCategory = byCategory[0] ? { name: byCategory[0].label, count: byCategory[0].count } : null;

  const fieldCoverage = [
    { table: "user_mechanisms", column: "id", totalRows: totalSuggestions, filled: userMechRows.filter((r) => blankToNull(r.id) != null).length },
    { table: "user_mechanisms", column: "user_id", totalRows: totalSuggestions, filled: totalSuggestions - missingUserId },
    { table: "user_mechanisms", column: "mechanism_id", totalRows: totalSuggestions, filled: userMechRows.filter((r) => blankToNull(r.mechanism_id) != null).length },
    { table: "user_mechanisms", column: "status", totalRows: totalSuggestions, filled: totalSuggestions - missingStatus },
    { table: "user_mechanisms", column: "created_at", totalRows: totalSuggestions, filled: userMechRows.filter((r) => parseDate(r.created_at)).length },
    { table: "mechanisms", column: "id", totalRows: mechanismsRows.length, filled: mechanismsRows.filter((r) => blankToNull(r.id) != null).length },
    { table: "mechanisms", column: "data", totalRows: mechanismsRows.length, filled: mechanismsRows.filter((r) => blankToNull(r.data) != null).length },
    { table: "mechanisms", column: "created_at", totalRows: mechanismsRows.length, filled: mechanismsRows.filter((r) => parseDate(r.created_at)).length },
    { table: "mechanisms", column: "updated_at", totalRows: mechanismsRows.length, filled: mechanismsRows.filter((r) => parseDate(r.updated_at)).length },
  ].map((f) => ({
    ...f,
    schema,
    source: "App Pharus",
    percent: f.totalRows ? Math.round((f.filled / f.totalRows) * 1000) / 10 : 0,
  }));

  const statusConnected = compactWarnings.some((w) =>
    ["orphan_mechanism_summary", "mechanism_data_invalid_json", "user_id_missing", "status_missing"].includes(w.code)
  )
    ? "connected_with_warnings"
    : "connected";

  // Cap suggestions sample for payload size (full counts remain in summary/distributions)
  const suggestionSample = suggestions.slice(0, 200);

  return {
    generatedAt: new Date().toISOString(),
    success: true,
    code: null,
    missing: [],
    config: {
      pharusUrlConfigured: true,
      pharusKeyConfigured: true,
    },
    source: {
      project: "App Pharus",
      projectId: client.projectId || PHARUS_PROJECT_ID,
      status: statusConnected,
      schema,
      message:
        statusConnected === "connected"
          ? "App Pharus conectado"
          : "App Pharus conectado com alertas",
    },
    summary: {
      usersWithSuggestions: userIds.size,
      totalSuggestions,
      distinctSuggestedTypes: mechanismCounter.size,
      topSuggestedMechanism,
      topMarket,
      topCategory,
      recentSuggestions30d,
      catalogMechanisms: catalog.length,
      orphanMechanismIds,
    },
    distributions: {
      byMechanism,
      byStatus: distributionFromCounter(statusCounter, totalSuggestions),
      byMarket,
      byCategory,
      byRisk: distributionFromCounter(riskCounter, totalSuggestions),
      byMonth: [...monthCounter.entries()]
        .map(([label, count]) => ({
          label,
          month: label,
          count,
          percent: totalSuggestions ? Math.round((count / totalSuggestions) * 1000) / 10 : 0,
        }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label))),
    },
    suggestions: suggestionSample,
    catalog,
    quality: {
      fields: USED_FIELDS,
      fieldCoverage,
      limitations: [
        "user_mechanisms não possui implemented_at nesta fonte.",
        "Não chamar suggested de implemented.",
        "Não usar created_at da sugestão como data de implementação.",
        "Fonte localizada parcialmente no App Pharus, mas ainda sem evidência de implementação e data de conclusão.",
        "Cruzamento App Pharus ↔ BASE QV exige chave confiável (e-mail, código QV ou ID externo) — não unir por nome.",
      ],
      joinKeyAudit: {
        status: "not_confirmed",
        note: "user_id do App Pharus ≠ client_id da BASE QV. Auditoria de chave de relacionamento pendente.",
        candidatesToAudit: ["email", "qv_id", "codigo", "external_id", "tabela de usuários do App Pharus"],
      },
      cancellationFuture: {
        indicator: "Mecanismos implementados antes do cancelamento",
        status: "blocked",
        requires: [
          "status real de implementação (completed/concluded/implemented)",
          "data real de conclusão (implemented_at / completed_at)",
          "chave confiável App Pharus ↔ BASE QV",
        ],
        ruleWhenReady: "data_implementacao <= data_cancelamento",
      },
    },
    warnings: compactWarnings,
    usedFields: USED_FIELDS,
  };
}

export default async function handler(request) {
  const authError = await requireCorporateAuth(request);
  if (authError) return authError;

  try {
    const payload = await computePharusMechanismsPayload();
    const httpStatus = payload.source?.status === "failed" ? 200 : 200;
    // Always 200 with status in body so Mecanismos BASE QV UI can render Pharus as optional block.
    return Response.json(payload, {
      status: httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[pharus-mechanisms]", err?.message || err);
    return Response.json(
      emptyPayload({
        status: "failed",
        message: "Não foi possível consultar o App Pharus",
        warnings: [{ code: "unexpected", message: "Falha inesperada ao consolidar App Pharus" }],
      }),
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
