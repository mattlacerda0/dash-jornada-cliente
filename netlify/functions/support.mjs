/**
 * Atendimento — fonte principal: research.acionamentos (Business Data).
 * public.demands não é mais a fonte principal.
 *
 * Leitura REST: Bearer da sessão Google (mesmo projeto Auth/Business Data)
 * + apikey = AUTH_SUPABASE_ANON_KEY + Accept-Profile: research.
 * Sem service role no caminho do dashboard.
 */
import { requireCorporateAuth } from "./_shared/auth.mjs";
import { getAuthEnv } from "./_shared/env.mjs";

const ACIONAMENTOS_SELECT = [
  "id",
  "tag",
  "nome_solicitante",
  "prioridade",
  "tipo_solicitacao",
  "area_setor",
  "titulo",
  "descricao",
  "email_cliente",
  "data_abertura",
  "anexos",
  "status",
  "origem",
  "submitted_at",
  "form_mode",
  "bitrix_deal_id",
  "bitrix_category_id",
  "bitrix_stage_id",
  "created_at",
  "updated_at",
  "client_id",
  "client_name",
  "client_found",
  "resolved_at",
  "link_anexos",
].join(",");

const USED_FIELDS = [
  { schema: "research", table: "acionamentos", column: "id", role: "ticketId" },
  { schema: "research", table: "acionamentos", column: "nome_solicitante", role: "requester" },
  { schema: "research", table: "acionamentos", column: "prioridade", role: "priority" },
  { schema: "research", table: "acionamentos", column: "tipo_solicitacao", role: "type" },
  { schema: "research", table: "acionamentos", column: "area_setor", role: "area" },
  { schema: "research", table: "acionamentos", column: "titulo", role: "title" },
  { schema: "research", table: "acionamentos", column: "descricao", role: "description" },
  { schema: "research", table: "acionamentos", column: "email_cliente", role: "clientEmail" },
  { schema: "research", table: "acionamentos", column: "data_abertura", role: "openedAt" },
  { schema: "research", table: "acionamentos", column: "anexos", role: "attachments" },
  { schema: "research", table: "acionamentos", column: "status", role: "status" },
  { schema: "research", table: "acionamentos", column: "origem", role: "origin" },
  { schema: "research", table: "acionamentos", column: "client_id", role: "clientId" },
  { schema: "research", table: "acionamentos", column: "client_name", role: "clientName" },
  { schema: "research", table: "acionamentos", column: "client_found", role: "clientFound" },
  { schema: "research", table: "acionamentos", column: "resolved_at", role: "resolvedAt" },
  { schema: "research", table: "acionamentos", column: "created_at", role: "createdAt" },
  { schema: "research", table: "acionamentos", column: "updated_at", role: "updatedAt" },
  { schema: "research", table: "acionamentos", column: "link_anexos", role: "attachmentLink" },
];

const PRIORITY_ORDER = ["Urgente", "Alta", "Média", "Baixa", "Não informado"];

function getBusinessDataEnv() {
  const auth = getAuthEnv();
  const url = (
    process.env.BUSINESS_DATA_SUPABASE_URL
    || process.env.BUSINESS_SUPABASE_URL
    || auth.url
    || ""
  ).trim().replace(/\/$/, "");
  const anonKey = (
    process.env.BUSINESS_DATA_SUPABASE_ANON_KEY
    || auth.anonKey
    || ""
  ).trim();
  const schema = (process.env.BUSINESS_DATA_SUPABASE_SCHEMA || "research").trim() || "research";
  return { url, anonKey, schema, projectRef: projectRefFromUrl(url) };
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).host.split(".")[0] || null;
  } catch {
    return null;
  }
}

function extractBearerToken(request) {
  const header =
    request?.headers?.get?.("authorization")
    || request?.headers?.get?.("Authorization")
    || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function businessDataConfigurationError() {
  const { url, anonKey } = getBusinessDataEnv();
  if (!url) return "Configure AUTH_SUPABASE_URL / BUSINESS_DATA_SUPABASE_URL.";
  if (!anonKey && !(process.env.N8N_SUPPORT_ACIONAMENTOS_WEBHOOK_URL || "").trim()) {
    return "Configure AUTH_SUPABASE_ANON_KEY (Business Data) para ler research.acionamentos.";
  }
  try {
    if (new URL(url).protocol !== "https:") return "URL do Business Data deve usar HTTPS";
  } catch {
    return "URL do Business Data inválida";
  }
  return null;
}

function parsePostgrestError(status, bodyText) {
  let code = null;
  let message = null;
  let details = null;
  let hint = null;
  try {
    const parsed = JSON.parse(bodyText || "{}");
    code = parsed.code || null;
    message = parsed.message || null;
    details = parsed.details || null;
    hint = parsed.hint || null;
  } catch {
    message = (bodyText || "").slice(0, 240) || null;
  }
  return { status, code, message, details, hint };
}

function logSupportRestFailure(context, meta) {
  console.error("[Support REST]", {
    project: context.projectRef,
    schema: context.schema,
    table: context.table,
    status: meta.status,
    code: meta.code,
    message: meta.message,
    details: meta.details,
    hint: meta.hint,
  });
}

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function toBool(value) {
  const raw = blankToNull(value);
  if (raw == null) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (["true", "t", "1", "sim", "yes", "y"].includes(s)) return true;
  if (["false", "f", "0", "nao", "não", "no", "n"].includes(s)) return false;
  return null;
}

function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
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

/** Preserva label amigável; chave normalizada para agrupar. */
function normalizeLabel(raw, fallback = "Não informado") {
  const trimmed = blankToNull(typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : raw);
  if (trimmed == null) return { key: "", label: fallback, raw: null };
  const key = foldToken(trimmed);
  return { key, label: String(trimmed), raw: String(trimmed) };
}

function statusInfo(rawStatus) {
  const token = foldToken(rawStatus);
  if (!token) return { label: "Não informado", isOpen: false, isResolved: false, known: false };
  const resolvedTokens = ["resolvido", "resolvida", "concluido", "concluida", "fechado", "fechada", "resolved", "closed", "done", "finalizado", "finalizada"];
  const openTokens = ["novo", "nova", "aberta", "aberto", "pendente", "em andamento", "em_andamento", "andamento", "open", "pending"];
  if (resolvedTokens.some((t) => token === t || token.includes(t.replace(" ", ""))) || token.includes("resolv") || token.includes("conclu") || token.includes("fechad")) {
    return { label: "Resolvido", isOpen: false, isResolved: true, known: true };
  }
  if (token === "novo" || token === "nova") return { label: "Novo", isOpen: true, isResolved: false, known: true };
  if (token === "pendente" || token === "pending") return { label: "Pendente", isOpen: true, isResolved: false, known: true };
  if (token.includes("andamento")) return { label: "Em andamento", isOpen: true, isResolved: false, known: true };
  if (openTokens.includes(token) || token.includes("abert")) return { label: "Aberto", isOpen: true, isResolved: false, known: true };
  const display = blankToNull(rawStatus) ? String(rawStatus).trim().replace(/\s+/g, " ") : "Não informado";
  return { label: display, isOpen: false, isResolved: false, known: true };
}

function normalizePriority(rawPriority) {
  const token = foldToken(rawPriority);
  if (!token) return "Não informado";
  if (["baixa", "low", "baixo"].includes(token)) return "Baixa";
  if (["media", "medium", "medio", "normal"].includes(token)) return "Média";
  if (["alta", "high", "alto"].includes(token)) return "Alta";
  if (["urgente", "urgent", "critica", "critical", "critico"].includes(token)) return "Urgente";
  return "Não informado";
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function hasAttachments(anexos, linkAnexos) {
  if (blankToNull(linkAnexos)) return true;
  if (anexos == null) return false;
  if (Array.isArray(anexos)) return anexos.length > 0;
  if (typeof anexos === "object") return Object.keys(anexos).length > 0;
  const text = String(anexos).trim();
  if (!text || text === "null" || text === "[]" || text === "{}") return false;
  return true;
}

function isClientIdentified(row) {
  const found = toBool(row.client_found);
  if (found === true) return true;
  if (blankToNull(row.client_id)) return true;
  return false;
}

function dayKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function distributionFrom(rows, getLabel, preferredOrder = null) {
  const total = rows.length || 1;
  const map = new Map();
  const labels = new Map();
  for (const row of rows) {
    const { key, label } = normalizeLabel(getLabel(row));
    const k = key || "__empty__";
    map.set(k, (map.get(k) || 0) + 1);
    if (!labels.has(k)) labels.set(k, label);
  }
  let entries = [...map.entries()].map(([k, count]) => ({
    key: k,
    label: labels.get(k),
    count,
    percent: pct(count, total),
  }));
  if (preferredOrder?.length) {
    entries.sort((a, b) => {
      const ia = preferredOrder.indexOf(a.label);
      const ib = preferredOrder.indexOf(b.label);
      const ra = ia === -1 ? 999 : ia;
      const rb = ib === -1 ? 999 : ib;
      if (ra !== rb) return ra - rb;
      return b.count - a.count || a.label.localeCompare(b.label, "pt-BR");
    });
  } else {
    entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  }
  return entries;
}

function buildPeriodSeries(dates, now) {
  const valid = dates.filter((d) => d && d <= now);
  if (!valid.length) return [];
  const min = new Date(Math.min(...valid.map((d) => d.getTime())));
  const spanDays = Math.max(1, Math.ceil((now.getTime() - min.getTime()) / 86400000) + 1);
  const byDay = spanDays <= 45;
  const buckets = new Map();
  if (byDay) {
    for (let t = Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), min.getUTCDate()); t <= now.getTime(); t += 86400000) {
      buckets.set(dayKey(new Date(t)), 0);
    }
  } else {
    let cursor = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    while (cursor <= end) {
      buckets.set(monthKey(cursor), 0);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  }
  for (const d of valid) {
    const key = byDay ? dayKey(d) : monthKey(d);
    if (!buckets.has(key)) continue;
    buckets.set(key, buckets.get(key) + 1);
  }
  return [...buckets.entries()].map(([period, count]) => ({
    period,
    label: period,
    count,
    grain: byDay ? "day" : "month",
  }));
}

async function restFetchAcionamentos({ accessToken, select, limit = null, offset = 0, countExact = false }) {
  const { url, anonKey, schema, projectRef } = getBusinessDataEnv();
  if (!url || !anonKey) {
    const err = new Error("AUTH_SUPABASE_URL/ANON_KEY ausentes para Business Data.");
    err.code = "config";
    throw err;
  }
  if (!accessToken) {
    const err = new Error("Token de sessão ausente para consultar research.acionamentos.");
    err.status = 401;
    err.code = "unauthenticated";
    throw err;
  }

  const endpoint = new URL("/rest/v1/acionamentos", url);
  endpoint.searchParams.set("select", select);
  if (limit != null) endpoint.searchParams.set("limit", String(limit));
  if (!limit) endpoint.searchParams.set("order", "created_at.desc");

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Accept-Profile": schema,
    "Content-Profile": schema,
  };
  if (countExact) {
    headers.Prefer = "count=exact";
    headers.Range = "0-0";
  } else if (limit == null) {
    const pageSize = 1000;
    headers.Range = `${offset}-${offset + pageSize - 1}`;
  }

  const response = await fetch(endpoint, { headers });
  const bodyText = await response.text().catch(() => "");
  const meta = parsePostgrestError(response.status, bodyText);
  if (!response.ok) {
    logSupportRestFailure({ projectRef, schema, table: "acionamentos" }, meta);
    const err = new Error(meta.message || `research.acionamentos: HTTP ${response.status}`);
    err.status = response.status;
    err.code = meta.code;
    err.details = meta.details;
    err.hint = meta.hint;
    err.postgrest = meta;
    err.projectRef = projectRef;
    err.schema = schema;
    err.table = "acionamentos";
    throw err;
  }

  let rows = [];
  try {
    rows = bodyText ? JSON.parse(bodyText) : [];
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows)) rows = [];

  let totalCount = null;
  if (countExact) {
    const range = response.headers.get("content-range") || "";
    const slash = range.lastIndexOf("/");
    if (slash >= 0) {
      const n = Number(range.slice(slash + 1));
      totalCount = Number.isFinite(n) ? n : null;
    }
  }
  return { rows, totalCount, projectRef, schema };
}

async function probeAcionamentosMinimal(accessToken) {
  const result = await restFetchAcionamentos({
    accessToken,
    select: "id",
    limit: 1,
    countExact: true,
  });
  console.error("[Support probe]", {
    project: result.projectRef,
    schema: result.schema,
    table: "acionamentos",
    sampleRows: result.rows.length,
    totalCount: result.totalCount,
  });
  return result;
}

async function fetchAllRestWithUserToken(accessToken) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const { schema, projectRef } = getBusinessDataEnv();
  while (true) {
    const { rows: batch } = await restFetchAcionamentos({
      accessToken,
      select: ACIONAMENTOS_SELECT,
      offset,
    });
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return { rows, projectRef, schema };
}

async function fetchViaN8nWebhook() {
  const webhook = (process.env.N8N_SUPPORT_ACIONAMENTOS_WEBHOOK_URL || "").trim();
  if (!webhook) return null;
  const token = (process.env.N8N_INTERNAL_API_TOKEN || "").trim();
  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify({ source: "portal-support" }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Webhook acionamentos: HTTP ${response.status} ${detail.slice(0, 160)}`);
  }
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.rows)) {
    throw new Error("Webhook acionamentos retornou payload inválido.");
  }
  return payload.rows;
}

/**
 * @param {{ accessToken?: string, allowN8nFallback?: boolean }} [options]
 */
async function fetchAcionamentosResilient(options = {}) {
  const warnings = [];
  const { accessToken = "", allowN8nFallback = true } = options;
  const { schema, projectRef } = getBusinessDataEnv();

  if (accessToken) {
    try {
      await probeAcionamentosMinimal(accessToken);
      const { rows } = await fetchAllRestWithUserToken(accessToken);
      return {
        rows,
        warnings,
        source: `rest:${schema}.acionamentos`,
        projectRef,
        schema,
      };
    } catch (error) {
      const meta = error?.postgrest || {
        status: error?.status,
        code: error?.code,
        message: error instanceof Error ? error.message : String(error),
        details: error?.details,
        hint: error?.hint,
      };
      logSupportRestFailure({ projectRef, schema, table: "acionamentos" }, meta);
      warnings.push(
        `REST research.acionamentos falhou (${meta.code || meta.status || "erro"}: ${String(meta.message || "").slice(0, 140)}).`,
      );
      if (!allowN8nFallback) throw error;
      warnings.push("Tentando ponte n8n (Postgres Business Data) como fallback.");
    }
  } else {
    warnings.push("Sem access token de sessão; REST autenticado indisponível.");
  }

  if (allowN8nFallback) {
    const viaWebhook = await fetchViaN8nWebhook();
    if (viaWebhook) {
      warnings.push("Dados carregados via ponte n8n (Postgres Business Data).");
      return {
        rows: viaWebhook,
        warnings,
        source: "n8n:research.acionamentos",
        projectRef,
        schema,
      };
    }
  }

  const err = new Error(
    "Não foi possível ler research.acionamentos via REST autenticado. Verifique Exposed schemas (research), GRANT/RLS para authenticated e o Bearer da sessão.",
  );
  err.code = "data_query_failed";
  throw err;
}

function buildPayload(rawRows, fetchWarnings = [], source = "research.acionamentos") {
  const now = new Date();
  const seenIds = new Set();
  const structuredWarnings = [...fetchWarnings.map((message) => ({ code: "FETCH", message }))];
  const qualityWarningCounts = new Map();

  const tickets = [];
  for (const row of rawRows) {
    const dataWarnings = [];
    const id = blankToNull(row.id);
    if (!id) dataWarnings.push("Registro sem id");
    else {
      const idKey = String(id);
      if (seenIds.has(idKey)) dataWarnings.push("Duplicidade de id");
      seenIds.add(idKey);
    }

    const areaNorm = normalizeLabel(row.area_setor);
    const typeNorm = normalizeLabel(row.tipo_solicitacao);
    const originNorm = normalizeLabel(row.origem);
    const requesterNorm = normalizeLabel(row.nome_solicitante);
    const status = statusInfo(row.status);
    const priority = normalizePriority(row.prioridade);

    if (!blankToNull(row.status)) dataWarnings.push("Status vazio");
    if (!blankToNull(row.prioridade)) dataWarnings.push("Prioridade vazia");
    if (!areaNorm.raw) dataWarnings.push("Área/setor vazia");
    if (!typeNorm.raw) dataWarnings.push("Tipo vazio");
    if (!blankToNull(row.titulo)) dataWarnings.push("Título vazio");
    if (!blankToNull(row.descricao)) dataWarnings.push("Descrição vazia");
    if (areaNorm.raw && String(row.area_setor) !== areaNorm.label) dataWarnings.push("Área com espaços extras");
    if (requesterNorm.raw && String(row.nome_solicitante) !== requesterNorm.label) dataWarnings.push("Solicitante com espaços extras");

    const openedAt = parseDate(row.data_abertura) || parseDate(row.created_at);
    const createdAt = parseDate(row.created_at);
    const resolvedAt = parseDate(row.resolved_at);
    if (!parseDate(row.data_abertura)) dataWarnings.push("data_abertura ausente");
    if (resolvedAt && openedAt && resolvedAt < openedAt) dataWarnings.push("resolved_at anterior à abertura");
    if (status.isResolved && !resolvedAt) dataWarnings.push("Status resolvido sem resolved_at");
    if (status.isOpen && resolvedAt) dataWarnings.push("Status aberto com resolved_at");

    const isResolved = Boolean(resolvedAt) || status.isResolved;
    const isOpen = !isResolved && status.isOpen;

    let resolutionHours = null;
    if (openedAt && resolvedAt && resolvedAt >= openedAt && resolvedAt <= now) {
      resolutionHours = round1((resolvedAt.getTime() - openedAt.getTime()) / 3600000);
    }

    const clientFound = toBool(row.client_found);
    const identified = isClientIdentified(row);
    if (clientFound === false) dataWarnings.push("client_found = false");
    if (!blankToNull(row.client_id)) dataWarnings.push("client_id ausente");
    if (!blankToNull(row.client_name)) dataWarnings.push("client_name ausente");

    tickets.push({
      ticketId: id ? String(id) : null,
      tag: blankToNull(row.tag),
      title: blankToNull(row.titulo) || "Não informado",
      description: blankToNull(row.descricao) || "",
      area: areaNorm.label,
      areaKey: areaNorm.key,
      type: typeNorm.label,
      typeKey: typeNorm.key,
      status: status.label,
      statusRaw: blankToNull(row.status),
      isOpen,
      isResolved,
      priority,
      priorityRaw: blankToNull(row.prioridade),
      origin: originNorm.label,
      requester: requesterNorm.label,
      requesterKey: requesterNorm.key,
      clientId: blankToNull(row.client_id) ? String(row.client_id) : null,
      clientName: blankToNull(row.client_name) || "Não informado",
      clientEmail: blankToNull(row.email_cliente),
      clientFound,
      clientIdentified: identified,
      openedAt: openedAt ? openedAt.toISOString() : null,
      createdAt: createdAt ? createdAt.toISOString() : null,
      updatedAt: parseDate(row.updated_at)?.toISOString() || null,
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
      resolutionHours,
      hasAttachment: hasAttachments(row.anexos, row.link_anexos),
      attachmentLink: blankToNull(row.link_anexos),
      // anexos metadata only — never payload_original
      attachments: Array.isArray(row.anexos) ? row.anexos : (row.anexos && typeof row.anexos === "object" ? row.anexos : null),
      formMode: blankToNull(row.form_mode),
      bitrixDealId: blankToNull(row.bitrix_deal_id),
      dataWarnings,
    });

    for (const w of dataWarnings) {
      const key = String(w);
      const cur = qualityWarningCounts.get(key) || 0;
      qualityWarningCounts.set(key, cur + 1);
    }
  }

  const SUPPORT_QUALITY_LABELS = {
    "client_found = false": {
      code: "client_not_found",
      label: "Acionamentos sem cliente identificado",
      severity: "warning",
    },
    "client_id ausente": {
      code: "missing_client_id",
      label: "Registros sem client_id",
      severity: "warning",
    },
    "client_name ausente": {
      code: "missing_client_name",
      label: "Registros sem client_name",
      severity: "warning",
    },
    "Área com espaços extras": {
      code: "area_extra_spaces",
      label: "Registros com espaços extras em área/setor",
      severity: "info",
    },
    "Área/setor vazia": {
      code: "empty_area",
      label: "Registros com área/setor vazia",
      severity: "warning",
    },
    "Tipo vazio": {
      code: "empty_type",
      label: "Registros com tipo da solicitação vazio",
      severity: "warning",
    },
    "Solicitante com espaços extras": {
      code: "requester_extra_spaces",
      label: "Registros com espaços extras no solicitante",
      severity: "info",
    },
    "Status vazio": {
      code: "empty_status",
      label: "Registros com status vazio",
      severity: "warning",
    },
    "Prioridade vazia": {
      code: "empty_priority",
      label: "Registros com prioridade vazia",
      severity: "warning",
    },
    "Título vazio": {
      code: "empty_title",
      label: "Registros com título vazio",
      severity: "info",
    },
    "Descrição vazia": {
      code: "empty_description",
      label: "Registros com descrição vazia",
      severity: "info",
    },
    "data_abertura ausente": {
      code: "missing_opened_at",
      label: "Registros sem data_abertura",
      severity: "warning",
    },
    "Registro sem id": {
      code: "missing_id",
      label: "Registros sem id",
      severity: "error",
    },
    "Duplicidade de id": {
      code: "duplicate_id",
      label: "Registros com id duplicado",
      severity: "warning",
    },
  };

  const qualityWarnings = [...qualityWarningCounts.entries()]
    .map(([message, count]) => {
      const meta = SUPPORT_QUALITY_LABELS[message] || {
        code: message.toLowerCase().replace(/\s+/g, "_").slice(0, 48),
        label: message,
        severity: "warning",
      };
      return {
        code: meta.code,
        label: meta.label,
        count,
        severity: meta.severity,
        message: `${count} ${meta.label.charAt(0).toLowerCase()}${meta.label.slice(1)}`,
      };
    })
    .sort((a, b) => {
      const rank = (s) => (s === "error" || s === "critical" ? 0 : s === "warning" ? 1 : 2);
      return rank(a.severity) - rank(b.severity) || b.count - a.count || a.label.localeCompare(b.label, "pt-BR");
    });

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t) => t.isOpen).length;
  const urgentTickets = tickets.filter((t) => t.priority === "Urgente").length;
  const identifiedClients = tickets.filter((t) => t.clientIdentified).length;
  const unidentifiedClients = tickets.filter((t) => !t.clientIdentified).length;
  const resolvedTickets = tickets.filter((t) => t.isResolved).length;
  const resolutionRate = pct(resolvedTickets, totalTickets);

  const resolutionValues = tickets
    .map((t) => t.resolutionHours)
    .filter((h) => h != null && Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const medianResolutionHours = resolutionValues.length
    ? round1(percentile(resolutionValues, 50))
    : null;

  const byArea = distributionFrom(tickets, (t) => (t.area === "Não informado" ? null : t.area));
  const topArea = byArea[0]?.label && byArea[0].label !== "Não informado" ? byArea[0].label : null;

  const byType = distributionFrom(tickets, (t) => (t.type === "Não informado" ? null : t.type));
  const byPriority = distributionFrom(tickets, (t) => t.priority, PRIORITY_ORDER);
  const byStatus = distributionFrom(tickets, (t) => t.status);
  const byRequester = distributionFrom(tickets, (t) => (t.requester === "Não informado" ? null : t.requester)).slice(0, 30);
  const byClientMatch = [
    { label: "Identificado", count: identifiedClients, percent: pct(identifiedClients, totalTickets || 1) },
    { label: "Não identificado", count: unidentifiedClients, percent: pct(unidentifiedClients, totalTickets || 1) },
  ];
  const byPeriod = buildPeriodSeries(
    tickets.map((t) => parseDate(t.openedAt)).filter(Boolean),
    now,
  );

  const dataSufficiency = totalTickets < 30 || resolvedTickets < 10
    ? (totalTickets < 10 ? "critical" : "low")
    : (totalTickets >= 100 && resolvedTickets >= 20 ? "good" : "moderate");

  if (totalTickets < 30 || resolvedTickets < 10) {
    structuredWarnings.push({
      code: "BASE_FORMING",
      message: "Base de acionamentos ainda em formação. Indicadores de volume, área, tipo e prioridade já podem ser analisados. Métricas de resolução ainda dependem de mais registros concluídos.",
    });
  }

  return {
    generatedAt: now.toISOString(),
    source,
    summary: {
      totalTickets,
      openTickets,
      urgentTickets,
      identifiedClients,
      unidentifiedClients,
      identifiedPercent: pct(identifiedClients, totalTickets || 1),
      unidentifiedPercent: pct(unidentifiedClients, totalTickets || 1),
      resolvedTickets,
      resolutionRate,
      medianResolutionHours,
      topArea,
      dataSufficiency,
      // Compatibilidade com UI antiga / métricas legadas (não classificáveis)
      complaints: null,
      compliments: null,
      escalatedTickets: null,
      clientsWithTickets: identifiedClients,
      note: "Fonte: research.acionamentos (Business Data).",
    },
    distributions: {
      byArea,
      byType,
      byPriority,
      byStatus,
      byPeriod,
      byRequester,
      byClientMatch,
      // aliases legados
      byMonth: byPeriod.filter((p) => p.grain === "month"),
      byEngineer: [],
    },
    tickets,
    warnings: structuredWarnings,
    quality: {
      usedFields: USED_FIELDS,
      warnings: qualityWarnings,
      legacySourceDeprecated: "public.demands",
    },
  };
}

export async function computeSupportPayload(options = {}) {
  const cfgError = businessDataConfigurationError();
  if (cfgError) {
    const payload = buildPayload([], [cfgError], "unavailable");
    payload.summary.note = cfgError;
    return payload;
  }
  const { rows, warnings, source, projectRef, schema } = await fetchAcionamentosResilient(options);
  const payload = buildPayload(rows, warnings, source);
  payload.meta = {
    projectRef: projectRef || null,
    schema: schema || "research",
    table: "acionamentos",
    rowCount: rows.length,
  };
  return payload;
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }

  // requireCorporateAuth retorna Response de erro ou null se OK (não { ok }).
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  const bizCfg = businessDataConfigurationError();
  if (bizCfg) {
    return Response.json({ error: bizCfg, code: "config" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const accessToken = extractBearerToken(request);
  const { projectRef, schema } = getBusinessDataEnv();
  console.error("[Support] projeto:", projectRef, "schema:", schema, "table: acionamentos", "bearer:", Boolean(accessToken));

  try {
    const payload = await computeSupportPayload({
      accessToken,
      allowN8nFallback: true,
    });
    if (!payload?.tickets && payload?.source === "unavailable") {
      return Response.json(
        { error: payload.summary?.note || "Fonte indisponível.", code: "config" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
    console.error("[Support]", {
      project: error?.projectRef || projectRef,
      schema: error?.schema || schema,
      table: error?.table || "acionamentos",
      status: error?.status || status,
      code: error?.code || null,
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || null,
      hint: error?.hint || null,
    });
    return Response.json(
      {
        error: "Não foi possível consultar a base de dados.",
        code: error?.code || "data_query_failed",
        // diagnóstico seguro (sem stack / segredos)
        diagnostic: {
          project: error?.projectRef || projectRef || null,
          schema: error?.schema || schema,
          table: "acionamentos",
          httpStatus: error?.status || status,
          postgrestCode: error?.code || null,
          message: error instanceof Error ? error.message : String(error),
          hint: error?.hint || null,
        },
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
};
