/**
 * Endpoint independente: reuniões do App Pharus por EP.
 * Fonte: PHARUS_SUPABASE_* (projeto qvtqufdivpbmubooawdm, schema core).
 * Não mistura com BASE QV. Falha isolada (HTTP 200 + source.status=failed).
 */
import { requireCorporateAuth } from "./_shared/auth.mjs";
import {
  getPharusEnv,
  getPharusSupabaseClient,
  pharusConfigurationError,
} from "./_shared/env.mjs";

const PHARUS_PROJECT_ID = "qvtqufdivpbmubooawdm";

const USED_FIELDS = [
  { table: "scheduled_meetings", column: "id", role: "instanceId" },
  { table: "scheduled_meetings", column: "user_id", role: "pharusUserId" },
  { table: "scheduled_meetings", column: "meeting_id", role: "catalogMeetingId" },
  { table: "scheduled_meetings", column: "advisor_internal_id", role: "advisorId" },
  { table: "scheduled_meetings", column: "status", role: "rawStatus" },
  { table: "scheduled_meetings", column: "start_time", role: "meetingDate" },
  { table: "scheduled_meetings", column: "updated_at", role: "recency" },
  { table: "meetings", column: "id", role: "catalogId" },
  { table: "meetings", column: "meeting_title", role: "meetingType" },
  { table: "advisor_calendly_event_type_snapshot", column: "advisor_internal_id", role: "advisorId" },
  { table: "advisor_calendly_event_type_snapshot", column: "payload.profile.name", role: "advisorName" },
  { table: "advisor_meeting_binding", column: "advisor_internal_id", role: "advisorBinding" },
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

function round1(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function pct(n, d) {
  if (d == null || d <= 0 || n == null) return null;
  return Math.round((n / d) * 1000) / 10;
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

/**
 * Status reais observados em core.scheduled_meetings: completed | scheduled | canceled.
 * core.meetings é catálogo (sem status de instância).
 */
export function normalizeMeetingStatus(raw) {
  const token = foldToken(raw);
  if (!token) return "unknown";
  if (token === "completed" || token === "complete" || token === "concluido" || token === "concluida") {
    return "completed";
  }
  if (token === "scheduled" || token === "agendado" || token === "agendada") {
    return "scheduled";
  }
  if (token === "canceled" || token === "cancelled" || token === "cancelado" || token === "cancelada") {
    return "cancelled";
  }
  return "unknown";
}

function bumpWarning(counter, code, message) {
  if (!counter.has(code)) counter.set(code, { code, message, count: 0 });
  counter.get(code).count += 1;
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

/**
 * Nome do EP: majority vote de payload.profile.name por advisor_internal_id.
 * E-mail: não disponível nas tabelas acessíveis via anon.
 */
function buildAdvisorDirectory(snapshotRows, warningCounter) {
  const map = new Map();
  for (const row of snapshotRows || []) {
    const advisorId = blankToNull(row.advisor_internal_id);
    if (!advisorId) continue;
    if (!map.has(advisorId)) {
      map.set(advisorId, {
        advisorId,
        nameVotes: new Map(),
        owners: new Set(),
      });
    }
    const entry = map.get(advisorId);
    const profileName = blankToNull(row.payload?.profile?.name);
    const owner = blankToNull(row.payload?.profile?.owner);
    if (profileName) {
      entry.nameVotes.set(profileName, (entry.nameVotes.get(profileName) || 0) + 1);
    }
    if (owner) entry.owners.add(owner);
  }

  const directory = new Map();
  for (const [advisorId, entry] of map.entries()) {
    const ranked = [...entry.nameVotes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    const advisorName = ranked[0]?.[0] || null;
    if (ranked.length > 1) {
      bumpWarning(
        warningCounter,
        "advisor_name_conflict",
        "advisor_internal_id com mais de um profile.name no snapshot — usado o nome majoritário",
      );
    }
    if (!advisorName) {
      bumpWarning(
        warningCounter,
        "advisor_without_name",
        "advisor_internal_id sem payload.profile.name identificado",
      );
    }
    directory.set(advisorId, {
      advisorId,
      advisorName,
      advisorEmail: null,
      calendlyOwnerUri: [...entry.owners][0] || null,
      nameVariants: ranked.map(([name, count]) => ({ name, count })),
      stableId: advisorId,
      identificationSource: "core.advisor_calendly_event_type_snapshot.payload.profile.name",
    });
  }
  return directory;
}

/**
 * Deduplicação: chave estável = scheduled_meetings.id (instância).
 * meeting_id é ID de catálogo (tipo), não da ocorrência.
 * Regra: se houver duplicata de id, prioriza updated_at mais recente, depois created_at.
 */
function dedupeScheduledMeetings(rows, warningCounter) {
  const byId = new Map();
  let missingInstanceId = 0;
  for (const row of rows || []) {
    const id = blankToNull(row.id);
    if (!id) {
      missingInstanceId += 1;
      bumpWarning(warningCounter, "meeting_without_instance_id", "Reunião sem scheduled_meetings.id");
      continue;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, row);
      continue;
    }
    bumpWarning(warningCounter, "duplicate_meeting_instance", "Instância duplicada de scheduled_meetings.id — mantida a mais recente");
    const prevUpdated = parseDate(prev.updated_at) || parseDate(prev.created_at) || new Date(0);
    const nextUpdated = parseDate(row.updated_at) || parseDate(row.created_at) || new Date(0);
    if (nextUpdated >= prevUpdated) byId.set(id, row);
  }
  return {
    rows: [...byId.values()],
    missingInstanceId,
  };
}

function isEligibleForCompletion(meeting, now) {
  const status = meeting.normalizedStatus;
  if (status === "completed" || status === "cancelled") return true;
  if (!meeting.startTimeDate) return false;
  if (meeting.startTimeDate >= now) return false;
  // scheduled/unknown já passados entram no denominador (não concluídos)
  return status === "scheduled" || status === "unknown";
}

function emptyPayload({ status, warnings, message, code, missing, identity }) {
  const env = getPharusEnv();
  return {
    generatedAt: new Date().toISOString(),
    success: status !== "failed",
    code: code || (status === "failed" ? "pharus_unavailable" : null),
    missing: Array.isArray(missing) ? missing : [],
    config: {
      pharusUrlConfigured: Boolean(env.url),
      pharusKeyConfigured: Boolean(env.anonKey),
    },
    source: {
      project: "App Pharus",
      projectId: env.projectId || PHARUS_PROJECT_ID,
      schema: "core",
      status,
      message: message || null,
    },
    identity: identity || {
      advisorNameResolved: false,
      advisorEmailResolved: false,
      advisorNameSource: null,
      missingKey: "advisor_internal_id → nome do EP",
    },
    summary: {
      totalMeetings: null,
      completedMeetings: null,
      cancelledMeetings: null,
      scheduledMeetings: null,
      eligibleMeetings: null,
      completionRate: null,
      distinctUsers: null,
      averageMeetingsPerUser: null,
    },
    advisors: [],
    meetings: [],
    distributions: {
      byStatus: [],
      byType: [],
      byMonth: [],
    },
    quality: {
      fields: USED_FIELDS,
      deduplication: {
        instanceKey: "scheduled_meetings.id",
        note: "meeting_id aponta para o catálogo core.meetings (tipo), não para a ocorrência.",
      },
      statusNormalization: {
        observed: ["completed", "scheduled", "canceled"],
        map: {
          completed: "completed",
          scheduled: "scheduled",
          canceled: "cancelled",
        },
      },
      completionDenominator:
        "concluídas ÷ (concluídas + canceladas + scheduled/unknown com start_time já passado). Futuras excluídas.",
      blocked: [
        "E-mail do EP não disponível via anon nas tabelas auditadas",
        "Mecanismos implementados por EP",
        "Taxa de renovação",
        "Tempo médio de resposta",
        "NPS/CSAT por EP",
        "Cruzamento user_id App Pharus ↔ client_id BASE QV",
      ],
    },
    warnings: warnings || [],
    usedFields: USED_FIELDS,
  };
}

async function probeCoreSchema() {
  const warnings = [];
  for (const schema of ["core", "public"]) {
    try {
      const client = getPharusSupabaseClient({ schema });
      const probe = await client.rest("scheduled_meetings", {
        select: "id",
        limit: 1,
        countExact: true,
      });
      if (probe.ok) {
        if (schema !== "core") {
          warnings.push({
            code: "schema_fallback",
            message: `Usando schema ${schema} (core indisponível para a chave anon).`,
          });
        }
        return { client, schema, warnings };
      }
      warnings.push({
        code: "schema_probe_denied",
        message: `${schema}.scheduled_meetings HTTP ${probe.status}`,
      });
    } catch (err) {
      warnings.push({
        code: "schema_probe_error",
        message: err.message || `falha ao sondar schema ${schema}`,
      });
    }
  }
  return { client: null, schema: null, warnings };
}

function aggregateAdvisorStats(meetings, now) {
  const byAdvisor = new Map();
  for (const m of meetings) {
    const key = m.advisorId || "__missing__";
    if (!byAdvisor.has(key)) {
      byAdvisor.set(key, {
        advisorId: m.advisorId,
        advisorName: m.advisorName,
        advisorEmail: m.advisorEmail,
        meetings: [],
      });
    }
    byAdvisor.get(key).meetings.push(m);
  }

  const advisors = [];
  for (const group of byAdvisor.values()) {
    if (!group.advisorId) continue;
    const list = group.meetings;
    const completed = list.filter((m) => m.normalizedStatus === "completed");
    const cancelled = list.filter((m) => m.normalizedStatus === "cancelled");
    const eligible = list.filter((m) => isEligibleForCompletion(m, now));
    const users = new Set(list.map((m) => m.userId).filter(Boolean));
    const completedUsers = new Set(completed.map((m) => m.userId).filter(Boolean));
    advisors.push({
      advisorId: group.advisorId,
      advisorName: group.advisorName || null,
      advisorEmail: group.advisorEmail || null,
      source: "app_pharus",
      totalMeetings: list.length,
      completedMeetings: completed.length,
      cancelledMeetings: cancelled.length,
      scheduledMeetings: list.filter((m) => m.normalizedStatus === "scheduled").length,
      eligibleMeetings: eligible.length,
      completionRate: pct(completed.length, eligible.length),
      distinctUsers: users.size,
      distinctUsersCompleted: completedUsers.size,
      averageMeetingsPerUser: users.size ? round1(list.length / users.size) : null,
      sampleSizeLabel: `${list.length} reunião(ões) · ${users.size} usuário(s)`,
      byType: (() => {
        const counter = new Map();
        for (const m of list) bump(counter, m.meetingType || "Tipo não informado");
        return distributionFromCounter(counter, list.length);
      })(),
    });
  }

  advisors.sort(
    (a, b) =>
      b.completedMeetings - a.completedMeetings
      || b.totalMeetings - a.totalMeetings
      || String(a.advisorName || "").localeCompare(String(b.advisorName || ""), "pt-BR"),
  );
  return advisors;
}

function bump(map, key) {
  const label = key || "Não informado";
  map.set(label, (map.get(label) || 0) + 1);
}

export async function computePharusEpMeetingsPayload() {
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

  const probe = await probeCoreSchema();
  if (!probe.client) {
    return emptyPayload({
      status: "failed",
      message: "Não foi possível consultar o App Pharus",
      warnings: [
        ...probe.warnings,
        {
          code: "rls_or_schema",
          message:
            "Leitura de core.scheduled_meetings bloqueada ou indisponível para a chave anon configurada.",
        },
      ],
    });
  }

  const warningCounter = new Map();
  const client = probe.client;
  const now = new Date();

  let scheduledRows = [];
  let catalogRows = [];
  let snapshotRows = [];
  let bindingRows = [];

  try {
    scheduledRows = await client.fetchAll(
      "scheduled_meetings",
      "id,user_id,meeting_id,advisor_internal_id,status,start_time,end_time,created_at,updated_at",
    );
  } catch (err) {
    return emptyPayload({
      status: "failed",
      message: "Não foi possível ler core.scheduled_meetings",
      warnings: [
        ...probe.warnings,
        { code: "scheduled_meetings_read", message: err.message || "falha de leitura" },
      ],
    });
  }

  try {
    catalogRows = await client.fetchAll("meetings", "id,meeting_title,meeting_slug,is_active");
  } catch (err) {
    bumpWarning(warningCounter, "meetings_catalog_read", err.message || "Falha ao ler core.meetings");
  }

  try {
    snapshotRows = await client.fetchAll(
      "advisor_calendly_event_type_snapshot",
      "advisor_internal_id,name,payload,synced_at,status",
    );
  } catch (err) {
    bumpWarning(
      warningCounter,
      "advisor_snapshot_read",
      err.message || "Falha ao ler advisor_calendly_event_type_snapshot",
    );
  }

  try {
    bindingRows = await client.fetchAll(
      "advisor_meeting_binding",
      "advisor_internal_id,meeting_id,calendly_event_type_uri,last_matched_at",
    );
  } catch (err) {
    bumpWarning(warningCounter, "advisor_binding_read", err.message || "Falha ao ler advisor_meeting_binding");
  }

  const catalogById = new Map(
    (catalogRows || []).map((row) => [String(row.id), row]),
  );
  const directory = buildAdvisorDirectory(snapshotRows, warningCounter);

  const { rows: deduped } = dedupeScheduledMeetings(scheduledRows, warningCounter);

  const normalized = [];
  const rawStatusCounter = new Map();
  for (const row of deduped) {
    const instanceId = blankToNull(row.id);
    const userId = blankToNull(row.user_id);
    const catalogMeetingId = blankToNull(row.meeting_id);
    const advisorId = blankToNull(row.advisor_internal_id);
    const rawStatus = blankToNull(row.status);
    const startTime = blankToNull(row.start_time);
    const startTimeDate = parseDate(startTime);
    const normalizedStatus = normalizeMeetingStatus(rawStatus);
    const advisor = advisorId ? directory.get(advisorId) : null;

    bump(rawStatusCounter, rawStatus || "(null)");

    if (!userId) bumpWarning(warningCounter, "meeting_without_user_id", "Reunião sem user_id");
    if (!advisorId) {
      bumpWarning(warningCounter, "meeting_without_advisor", "Reunião sem advisor_internal_id");
    }
    if (advisorId && !advisor?.advisorName) {
      bumpWarning(warningCounter, "advisor_without_name", "advisor_internal_id sem nome identificado");
    }
    if (normalizedStatus === "unknown") {
      bumpWarning(warningCounter, "unknown_status", "Status de reunião não mapeado");
    }
    if (!startTime) bumpWarning(warningCounter, "missing_start_time", "Reunião sem start_time");
    else if (!startTimeDate) bumpWarning(warningCounter, "invalid_start_time", "start_time inválido");

    const catalog = catalogMeetingId ? catalogById.get(String(catalogMeetingId)) : null;
    if (catalogMeetingId && !catalog) {
      bumpWarning(
        warningCounter,
        "meeting_id_without_catalog",
        "meeting_id sem correspondência em core.meetings",
      );
    }
    const meetingType = blankToNull(catalog?.meeting_title)
      || blankToNull(catalog?.meeting_slug)
      || null;
    if (!meetingType) {
      bumpWarning(warningCounter, "meeting_type_missing", "Tipo de reunião ausente no catálogo");
    }

    normalized.push({
      meetingId: instanceId,
      catalogMeetingId,
      userId,
      advisorId,
      advisorName: advisor?.advisorName || null,
      advisorEmail: advisor?.advisorEmail || null,
      startTime,
      startTimeDate,
      status: rawStatus,
      normalizedStatus,
      meetingType: meetingType || "Tipo não informado",
      meetingSlug: blankToNull(catalog?.meeting_slug),
      source: "app_pharus",
      updatedAt: blankToNull(row.updated_at),
      createdAt: blankToNull(row.created_at),
      month: monthKey(startTimeDate),
    });
  }

  const namedAdvisors = [...directory.values()].filter((a) => a.advisorName);
  const advisorsInData = new Set(normalized.map((m) => m.advisorId).filter(Boolean));
  const namedCoverage = [...advisorsInData].filter((id) => directory.get(id)?.advisorName).length;
  const advisorNameResolved = advisorsInData.size > 0 && namedCoverage === advisorsInData.size;
  const mappingCoveragePct = advisorsInData.size
    ? Math.round((namedCoverage / advisorsInData.size) * 1000) / 10
    : 0;

  if (!advisorNameResolved) {
    bumpWarning(
      warningCounter,
      "advisor_name_partial",
      "Relação advisor_internal_id → nome incompleta. Totais gerais permanecem disponíveis; comparativo usa ID quando o nome faltar.",
    );
  }

  // Garantir rótulo determinístico — nunca descartar reunião sem nome
  for (const m of normalized) {
    if (!m.advisorName) {
      m.advisorName = m.advisorId
        ? `Advisor não identificado (${String(m.advisorId).slice(0, 8)})`
        : "Advisor não identificado";
    }
  }

  const completed = normalized.filter((m) => m.normalizedStatus === "completed");
  const cancelled = normalized.filter((m) => m.normalizedStatus === "cancelled");
  const scheduled = normalized.filter((m) => m.normalizedStatus === "scheduled");
  const eligible = normalized.filter((m) => isEligibleForCompletion(m, now));
  const futureInEligible = eligible.filter(
    (m) => m.startTimeDate && m.startTimeDate >= now && m.normalizedStatus === "scheduled",
  );
  if (futureInEligible.length) {
    bumpWarning(
      warningCounter,
      "future_in_denominator",
      "Reunião futura incluída indevidamente no denominador (não deveria ocorrer)",
    );
  }

  const users = new Set(normalized.map((m) => m.userId).filter(Boolean));
  const totalMeetings = normalized.length;
  const completedMeetings = completed.length;
  const cancelledMeetings = cancelled.length;
  const eligibleMeetings = eligible.length;
  const distinctUsers = users.size;
  const completionRate = pct(completedMeetings, eligibleMeetings);
  const averageMeetingsPerUser = distinctUsers ? round1(totalMeetings / distinctUsers) : null;

  const advisors = aggregateAdvisorStats(normalized, now).map((a) => ({
    ...a,
    advisorName: a.advisorName
      || (a.advisorId ? `Advisor não identificado (${String(a.advisorId).slice(0, 8)})` : "Advisor não identificado"),
    nameResolved: Boolean(directory.get(a.advisorId)?.advisorName),
  }));
  const statusCounter = new Map();
  const typeCounter = new Map();
  const monthCounter = new Map();
  for (const m of normalized) {
    bump(statusCounter, m.normalizedStatus);
    bump(typeCounter, m.meetingType || "Tipo não informado");
    if (m.month) bump(monthCounter, m.month);
  }

  const typeDistribution = distributionFromCounter(typeCounter, totalMeetings);
  const hasUsableTypes = typeDistribution.some(
    (row) => row.label && row.label !== "Tipo não informado" && row.count > 0,
  );
  const monthlyEvolution = [...monthCounter.entries()]
    .map(([label, count]) => ({
      label,
      month: label,
      count,
      percent: totalMeetings ? Math.round((count / totalMeetings) * 1000) / 10 : 0,
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  return {
    generatedAt: new Date().toISOString(),
    success: true,
    available: true,
    code: null,
    missing: [],
    config: {
      pharusUrlConfigured: true,
      pharusKeyConfigured: true,
    },
    source: {
      project: "App Pharus",
      projectId: client.projectId || PHARUS_PROJECT_ID,
      schema: probe.schema || client.schema || "core",
      status: advisorNameResolved ? "connected" : "partial",
      message: advisorNameResolved
        ? null
        : "Relação advisor_internal_id → nome incompleta. Comparativo por EP usa ID quando o nome faltar; totais gerais disponíveis.",
    },
    identity: {
      advisorNameResolved,
      advisorEmailResolved: false,
      advisorNameSource: "core.advisor_calendly_event_type_snapshot.payload.profile.name",
      advisorStableId: "advisor_internal_id",
      missingKey: advisorNameResolved
        ? null
        : "advisor_internal_id sem profile.name para parte dos advisors em scheduled_meetings",
      emailMissingKey: "e-mail do advisor não exposto nas tabelas acessíveis via anon",
      advisorsInMeetings: advisorsInData.size,
      advisorsNamed: namedCoverage,
      bindingRows: (bindingRows || []).length,
      note:
        "Não cruzar nomes Pharus ↔ BASE QV automaticamente. Totais gerais não dependem do nome do advisor.",
    },
    mappingCoverage: {
      totalAdvisors: advisorsInData.size,
      identifiedAdvisors: namedCoverage,
      unidentifiedAdvisors: Math.max(0, advisorsInData.size - namedCoverage),
      coverage: mappingCoveragePct,
    },
    summary: {
      registeredMeetings: totalMeetings,
      totalMeetings,
      completedMeetings,
      cancelledMeetings,
      scheduledMeetings: scheduled.length,
      eligibleMeetings,
      completionRate,
      distinctUsers,
      averageMeetingsPerUser,
      completionDetail: `${completedMeetings} concluídas de ${eligibleMeetings} reuniões elegíveis`,
    },
    advisors,
    byAdvisor: advisors,
    monthlyEvolution,
    meetings: normalized.map((m) => ({
      meetingId: m.meetingId,
      catalogMeetingId: m.catalogMeetingId,
      userId: m.userId,
      advisorId: m.advisorId,
      advisorName: m.advisorName,
      startTime: m.startTime,
      status: m.status,
      normalizedStatus: m.normalizedStatus,
      meetingType: m.meetingType,
      source: "app_pharus",
    })),
    distributions: {
      byStatus: distributionFromCounter(statusCounter, totalMeetings),
      byRawStatus: distributionFromCounter(rawStatusCounter, totalMeetings),
      byType: hasUsableTypes ? typeDistribution : [],
      byMonth: monthlyEvolution,
    },
    render: {
      showSummary: true,
      showAdvisorComparative: true,
      showCoverageChart: true,
      showTypeChart: hasUsableTypes,
      reason: advisorNameResolved
        ? null
        : "Mapeamento de nomes parcial — totais gerais exibidos; advisors sem nome rotulados como não identificados.",
    },
    metadata: {
      rawRows: (scheduledRows || []).length,
      deduplicatedMeetings: totalMeetings,
      sourceTables: [
        "scheduled_meetings",
        "meetings",
        "advisor_meeting_binding",
        "advisor_calendly_event_type_snapshot",
      ],
      schema: probe.schema || client.schema || "core",
    },
    quality: {
      fields: USED_FIELDS,
      relationshipsConfirmed: [
        "scheduled_meetings.id = instância da reunião",
        "scheduled_meetings.meeting_id → meetings.id (tipo/catálogo)",
        "scheduled_meetings.advisor_internal_id → advisor_calendly_event_type_snapshot.advisor_internal_id",
        "advisor name = payload.profile.name (majority vote) ou 'Advisor não identificado'",
        "advisor_meeting_binding liga advisor ↔ tipo (não à ocorrência)",
      ],
      deduplication: {
        instanceKey: "scheduled_meetings.id",
        catalogKey: "scheduled_meetings.meeting_id",
        rule: "Deduplicar por id da instância; em empate, manter updated_at/created_at mais recente",
        note: "Não somar scheduled_meetings + meetings + binding — só scheduled_meetings contém ocorrências",
      },
      statusNormalization: {
        observed: [...rawStatusCounter.keys()],
        map: {
          completed: "completed",
          scheduled: "scheduled",
          canceled: "cancelled",
        },
        rule: "Conclusão só com status explícito; não inferir por data passada",
      },
      completionDenominator:
        "concluídas ÷ (concluídas + canceladas + scheduled/unknown com start_time < agora)",
      viableMetrics: [
        "reuniões registradas (totais gerais sem depender de nome)",
        "reuniões concluídas",
        "reuniões canceladas",
        "usuários distintos",
        "taxa de conclusão",
        "média de reuniões por usuário",
        "comparativo por advisor_internal_id (nome quando disponível)",
      ],
      blocked: [
        "E-mail do EP (não disponível via anon)",
        "Mecanismos implementados por EP",
        "Taxa de renovação",
        "Tempo médio de resposta",
        "NPS/CSAT por EP",
        "user_id App Pharus como cliente BASE QV",
      ],
      namedAdvisorsSample: namedAdvisors.slice(0, 5).map((a) => ({
        advisorId: a.advisorId,
        advisorName: a.advisorName,
      })),
    },
    qualityWarnings: [...warningCounter.values()].sort((a, b) => b.count - a.count),
    warnings: [...warningCounter.values()].sort((a, b) => b.count - a.count),
    usedFields: USED_FIELDS,
  };
}

export default async function handler(request) {
  const authError = await requireCorporateAuth(request);
  if (authError) return authError;

  try {
    const payload = await computePharusEpMeetingsPayload();
    return Response.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[pharus-ep-meetings]", err?.message || err);
    return Response.json(
      emptyPayload({
        status: "failed",
        message: "Não foi possível consultar as reuniões do App Pharus",
        warnings: [{ code: "unexpected", message: "Falha inesperada ao consolidar reuniões do App Pharus" }],
      }),
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
