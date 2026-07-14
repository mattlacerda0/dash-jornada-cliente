const CLIENT_SELECT = "id,codigo,name,engenheiro_patrimonial";
const CALENDLY_SELECT =
  "id,client_id,calendly_event_uri,event_name,start_time,end_time,host_email,manually_linked";
const MANUAL_SELECT =
  "id,client_id,title,start_time,end_time,google_event_id,recurrence_group_id";
const ATTENDANCE_SELECT =
  "calendly_event_uri,status,remarcado,link_gravacao,created_at,updated_at";
const IMPL_SELECT = "client_id,meeting_date,source";

const USED_FIELDS = [
  { table: "clients", column: "id", role: "clientId" },
  { table: "clients", column: "codigo", role: "clientCode" },
  { table: "clients", column: "name", role: "clientName" },
  { table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { table: "client_meetings", column: "id", role: "meetingId" },
  { table: "client_meetings", column: "client_id", role: "meetingClient" },
  { table: "client_meetings", column: "calendly_event_uri", role: "externalUri" },
  { table: "client_meetings", column: "event_name", role: "title" },
  { table: "client_meetings", column: "start_time", role: "startTime" },
  { table: "client_meetings", column: "end_time", role: "endTime" },
  { table: "client_meetings", column: "host_email", role: "hostEmail" },
  { table: "client_meetings", column: "manually_linked", role: "manualLinkFlag" },
  { table: "manual_meetings", column: "id", role: "manualMeetingId" },
  { table: "manual_meetings", column: "client_id", role: "manualClient" },
  { table: "manual_meetings", column: "title", role: "manualTitle" },
  { table: "manual_meetings", column: "start_time", role: "manualStart" },
  { table: "manual_meetings", column: "end_time", role: "manualEnd" },
  { table: "manual_meetings", column: "google_event_id", role: "googleEventId" },
  { table: "manual_meetings", column: "recurrence_group_id", role: "recurrenceGroup" },
  { table: "meeting_attendance", column: "calendly_event_uri", role: "attendanceJoin" },
  { table: "meeting_attendance", column: "status", role: "attendanceStatus" },
  { table: "meeting_attendance", column: "remarcado", role: "rescheduled" },
  { table: "meeting_attendance", column: "created_at", role: "attendanceCreated" },
  { table: "client_implementation_meeting_date", column: "client_id", role: "implClient" },
  { table: "client_implementation_meeting_date", column: "meeting_date", role: "implDate" },
  { table: "client_implementation_meeting_date", column: "source", role: "implSource" },
];

const FREQ_BANDS = ["Nenhuma", "1 reunião", "2 a 3", "4 a 6", "7 a 12", "Mais de 12"];
const DAYS_SINCE_BANDS = [
  "Até 30 dias",
  "31 a 60 dias",
  "61 a 90 dias",
  "91 a 180 dias",
  "Mais de 180 dias",
  "Nunca realizou reunião",
];
const INTERVAL_BANDS = [
  "Até 30 dias",
  "31 a 60 dias",
  "61 a 90 dias",
  "Mais de 90 dias",
  "Sem intervalo calculável",
];

function configurationError() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Configuração do Supabase ausente no Netlify";
  }
  try {
    if (new URL(process.env.SUPABASE_URL).protocol !== "https:") return "SUPABASE_URL deve usar HTTPS";
  } catch {
    return "SUPABASE_URL inválida";
  }
  return null;
}

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

function normalizeTitle(value) {
  return String(blankToNull(value) || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function startBucket(date) {
  if (!date) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function compositeKey(clientId, start, title) {
  return `${clientId || ""}|${startBucket(start)}|${normalizeTitle(title)}`;
}

function normalizeStatus(status) {
  const s = String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!s) return "desconhecido";
  if (["compareceu", "realizado", "realizada", "concluido", "concluida", "presente"].includes(s)) {
    return "compareceu";
  }
  // no-show / falta — não inclui cancelamento
  if (
    [
      "nao compareceu",
      "faltou",
      "no show",
      "noshow",
      "ausente",
    ].includes(s)
  ) {
    return "nao_compareceu";
  }
  if (["cancelada", "cancelado", "canceled", "cancelled"].includes(s)) return "cancelada";
  // pendente e remarcado (como status textual) não são presença final classificável
  if (s === "pendente" || s === "remarcado") return "desconhecido";
  return "desconhecido";
}

function labelOrUnknown(value) {
  return blankToNull(value) ?? "Não informado";
}

function daysBetween(a, b) {
  const ms = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) -
    Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  return Math.floor(ms / 86400000);
}

function monthsBetween(a, b) {
  if (!a || !b) return 1;
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, months);
}

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function distributionFrom(items, keyFn, orderedLabels) {
  const counts = new Map();
  if (orderedLabels) orderedLabels.forEach((label) => counts.set(label, 0));
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = items.length || 1;
  const entries = orderedLabels
    ? orderedLabels.map((label) => [label, counts.get(label) || 0])
    : [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "pt-BR"));
  return entries.map(([label, count]) => ({
    label,
    count,
    percent: Math.round((count / total) * 1000) / 10,
  }));
}

function freqBand(total) {
  if (!total) return "Nenhuma";
  if (total === 1) return "1 reunião";
  if (total <= 3) return "2 a 3";
  if (total <= 6) return "4 a 6";
  if (total <= 12) return "7 a 12";
  return "Mais de 12";
}

function daysSinceBand(days) {
  if (days == null) return "Nunca realizou reunião";
  if (days <= 30) return "Até 30 dias";
  if (days <= 60) return "31 a 60 dias";
  if (days <= 90) return "61 a 90 dias";
  if (days <= 180) return "91 a 180 dias";
  return "Mais de 180 dias";
}

function intervalBand(days) {
  if (days == null) return "Sem intervalo calculável";
  if (days <= 30) return "Até 30 dias";
  if (days <= 60) return "31 a 60 dias";
  if (days <= 90) return "61 a 90 dias";
  return "Mais de 90 dias";
}

async function fetchAll(table, select, order = "id.asc") {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, process.env.SUPABASE_URL);
    url.searchParams.set("select", select);
    if (order) url.searchParams.set("order", order);
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

function buildAttendanceMap(rows) {
  const map = new Map();
  const orphanWarnings = [];
  for (const row of rows) {
    const uri = blankToNull(row.calendly_event_uri);
    if (!uri) continue;
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || new Date(0);
    const current = map.get(uri);
    if (!current || updated > current.updated) {
      map.set(uri, {
        updated,
        status: normalizeStatus(row.status),
        rawStatus: blankToNull(row.status),
        rescheduled: toBool(row.remarcado) === true,
        recordingUrl: blankToNull(row.link_gravacao),
      });
    }
  }
  return { map, orphanWarnings };
}

function consolidateMeetings(calendlyRows, manualRows, attendanceMap) {
  const meetings = [];
  const seenUris = new Set();
  const seenGoogle = new Set();
  const seenComposite = new Set();
  const warnings = [];
  let duplicateSkips = 0;

  for (const row of calendlyRows) {
    const start = parseDate(row.start_time);
    const end = parseDate(row.end_time);
    const clientId = blankToNull(row.client_id);
    const uri = blankToNull(row.calendly_event_uri);
    const title = blankToNull(row.event_name) || "Reunião";
    if (!clientId) warnings.push("Reunião Calendly sem client_id");
    if (!start) warnings.push("Reunião Calendly sem start_time");
    const dedupeUri = uri || `cm:${row.id}`;
    if (seenUris.has(dedupeUri)) {
      duplicateSkips += 1;
      continue;
    }
    seenUris.add(dedupeUri);
    if (uri) seenUris.add(uri);
    const comp = compositeKey(clientId, start, title);
    if (comp) seenComposite.add(comp);
    const attendance = uri ? attendanceMap.get(uri) : null;
    let attendanceStatus = attendance?.status || "desconhecido";
    if (attendance?.status === "compareceu" && start && start > new Date()) {
      warnings.push("Reunião futura marcada como realizada");
    }
    meetings.push({
      meetingId: String(row.id),
      clientId: clientId ? String(clientId) : null,
      source: "calendly",
      title,
      startTime: start ? start.toISOString() : null,
      endTime: end ? end.toISOString() : null,
      attendanceStatus,
      rescheduled: attendance?.rescheduled === true,
      hostEmail: blankToNull(row.host_email),
      recordingUrl: attendance?.recordingUrl || null,
      externalUri: uri,
      manuallyLinked: Boolean(row.manually_linked),
    });
  }

  for (const row of manualRows) {
    const start = parseDate(row.start_time);
    const end = parseDate(row.end_time);
    const clientId = blankToNull(row.client_id);
    const title = blankToNull(row.title) || "Reunião manual";
    const manualUri = `manual:${row.id}`;
    const googleId = blankToNull(row.google_event_id);
    const comp = compositeKey(clientId, start, title);

    if (seenUris.has(manualUri) || (googleId && seenGoogle.has(googleId)) || (comp && seenComposite.has(comp))) {
      duplicateSkips += 1;
      continue;
    }

    seenUris.add(manualUri);
    if (googleId) seenGoogle.add(googleId);
    if (comp) seenComposite.add(comp);

    const attendance = attendanceMap.get(manualUri) || null;
    meetings.push({
      meetingId: `manual:${row.id}`,
      clientId: clientId ? String(clientId) : null,
      source: "manual",
      title,
      startTime: start ? start.toISOString() : null,
      endTime: end ? end.toISOString() : null,
      attendanceStatus: attendance?.status || "desconhecido",
      rescheduled: attendance?.rescheduled === true,
      hostEmail: null,
      recordingUrl: attendance?.recordingUrl || null,
      externalUri: manualUri,
      manuallyLinked: false,
    });
  }

  return { meetings, duplicateSkips, warnings };
}

function isCompletedPast(meeting, now) {
  const start = parseDate(meeting.startTime);
  if (!start || start > now) return false;
  return meeting.attendanceStatus === "compareceu";
}

function isPastMeeting(meeting, now) {
  const start = parseDate(meeting.startTime);
  return Boolean(start && start <= now);
}

function buildPayload(clients, calendlyRows, manualRows, attendanceRows, implRows) {
  const qualityWarnings = [
    "crm_meetings excluído da consolidação (somente lead_id, sem vínculo confiável com clients.id).",
    "Status observados em meeting_attendance.status: compareceu, nao_compareceu, pendente, remarcado. Nenhuma categoria de cancelamento encontrada; cancelamentos não entram na taxa de comparecimento.",
  ];
  const { map: attendanceMap } = buildAttendanceMap(attendanceRows);
  const { meetings, duplicateSkips } = consolidateMeetings(calendlyRows, manualRows, attendanceMap);
  if (duplicateSkips) qualityWarnings.push(`${duplicateSkips} reuniões potencialmente duplicadas foram deduplicadas.`);

  const meetingUris = new Set(meetings.map((m) => m.externalUri).filter(Boolean));
  let orphanAttendance = 0;
  for (const row of attendanceRows) {
    const uri = blankToNull(row.calendly_event_uri);
    if (uri && !meetingUris.has(uri)) orphanAttendance += 1;
  }
  if (orphanAttendance) {
    qualityWarnings.push(`${orphanAttendance} registros de presença sem reunião correspondente.`);
  }

  const implByClient = new Map();
  for (const row of implRows) {
    const clientId = blankToNull(row.client_id);
    const meetingDate = parseDate(row.meeting_date);
    if (!clientId || !meetingDate) continue;
    const current = implByClient.get(String(clientId));
    if (!current || meetingDate < current) implByClient.set(String(clientId), meetingDate);
  }

  const now = new Date();
  const byClient = new Map();
  for (const meeting of meetings) {
    if (!meeting.clientId) continue;
    if (!byClient.has(meeting.clientId)) byClient.set(meeting.clientId, []);
    byClient.get(meeting.clientId).push(meeting);
  }

  const clientRows = [];
  for (const client of clients) {
    const clientId = String(client.id);
    const clientMeetings = (byClient.get(clientId) || [])
      .slice()
      .sort((a, b) => (parseDate(a.startTime)?.getTime() || 0) - (parseDate(b.startTime)?.getTime() || 0));
    const dataWarnings = [];
    const completedPast = clientMeetings.filter((m) => isCompletedPast(m, now));
    const pastAny = clientMeetings.filter((m) => isPastMeeting(m, now) && m.attendanceStatus !== "cancelada");
    const absences = clientMeetings.filter((m) => m.attendanceStatus === "nao_compareceu").length;
    const reschedules = clientMeetings.filter((m) => m.rescheduled).length;
    const cancelledCount = null; // fonte não confiável

    let firstMeetingCompleted = null;
    let firstMeetingDate = null;
    if (completedPast.length) {
      firstMeetingCompleted = true;
      firstMeetingDate = completedPast[0].startTime;
    } else if (implByClient.has(clientId)) {
      firstMeetingCompleted = true;
      firstMeetingDate = implByClient.get(clientId).toISOString();
      dataWarnings.push("Primeira reunião inferida via client_implementation_meeting_date sem presença confirmada em meeting_attendance.");
    } else if (clientMeetings.length) {
      firstMeetingCompleted = false;
      dataWarnings.push("Cliente com reuniões, mas sem presença confirmada (compareceu).");
    } else {
      firstMeetingCompleted = false;
    }

    let lastMeetingDate = null;
    let daysSinceLastMeeting = null;
    let lastMeetingStatusConfirmed = true;
    if (completedPast.length) {
      lastMeetingDate = completedPast[completedPast.length - 1].startTime;
      daysSinceLastMeeting = daysBetween(parseDate(lastMeetingDate), now);
    } else if (pastAny.length) {
      lastMeetingDate = pastAny[pastAny.length - 1].startTime;
      daysSinceLastMeeting = daysBetween(parseDate(lastMeetingDate), now);
      lastMeetingStatusConfirmed = false;
      dataWarnings.push("Última reunião considerada com status não confirmado.");
    }

    const intervals = [];
    for (let i = 1; i < completedPast.length; i += 1) {
      const prev = parseDate(completedPast[i - 1].startTime);
      const curr = parseDate(completedPast[i].startTime);
      if (!prev || !curr) continue;
      const diff = daysBetween(prev, curr);
      if (diff >= 0) intervals.push(diff);
      else dataWarnings.push("Intervalo negativo detectado e ignorado.");
    }
    const averageIntervalDays = intervals.length ? average(intervals) : null;

    let meetingsPerMonth = null;
    if (clientMeetings.length) {
      const dated = clientMeetings.map((m) => parseDate(m.startTime)).filter(Boolean).sort((a, b) => a - b);
      if (dated.length) {
        meetingsPerMonth = Math.round((clientMeetings.length / monthsBetween(dated[0], dated[dated.length - 1])) * 10) / 10;
      }
    }

    if (clientMeetings.some((m) => m.attendanceStatus === "desconhecido")) {
      dataWarnings.push("Há reunião sem status de presença confirmado.");
    }
    if (firstMeetingCompleted === false) dataWarnings.push("Cliente ainda não realizou a primeira reunião.");
    if (absences) dataWarnings.push("Cliente possui falta(s) registrada(s).");

    clientRows.push({
      clientId,
      clientCode: blankToNull(client.codigo),
      clientName: blankToNull(client.name) || "Não informado",
      engineer: labelOrUnknown(client.engenheiro_patrimonial),
      totalMeetings: clientMeetings.length,
      meetingsPerMonth,
      lastMeetingDate,
      daysSinceLastMeeting,
      lastMeetingStatusConfirmed,
      averageIntervalDays,
      absences,
      reschedules,
      cancelledMeetings: cancelledCount,
      firstMeetingCompleted,
      firstMeetingDate,
      frequencyBand: freqBand(clientMeetings.length),
      daysSinceBand: daysSinceBand(daysSinceLastMeeting),
      intervalBand: intervalBand(averageIntervalDays),
      dataWarnings,
      meetings: clientMeetings.map((m) => ({
        meetingId: m.meetingId,
        source: m.source,
        title: m.title,
        startTime: m.startTime,
        endTime: m.endTime,
        attendanceStatus: m.attendanceStatus,
        rescheduled: m.rescheduled,
        recordingUrl: m.recordingUrl,
      })),
    });
  }

  const datedMeetings = meetings
    .map((m) => parseDate(m.startTime))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const averageMeetingsPerMonth = datedMeetings.length
    ? Math.round((meetings.length / monthsBetween(datedMeetings[0], datedMeetings[datedMeetings.length - 1])) * 10) / 10
    : null;

  const withFirst = clientRows.filter((c) => c.firstMeetingCompleted === true).length;
  const withoutFirst = clientRows.filter((c) => c.firstMeetingCompleted === false).length;
  const portfolio = clientRows.length || 1;

  const monthMap = new Map();
  let monthInconsistencies = 0;
  for (const meeting of meetings) {
    const start = parseDate(meeting.startTime);
    if (!start) continue;
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, { month: key, scheduled: 0, completed: 0, noShows: 0 });
    const item = monthMap.get(key);
    item.scheduled += 1;
    if (meeting.attendanceStatus === "compareceu") item.completed += 1;
    if (meeting.attendanceStatus === "nao_compareceu") item.noShows += 1;
  }
  const meetingsByMonth = [...monthMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => {
      if (item.completed > item.scheduled) monthInconsistencies += 1;
      return {
        month: item.month,
        scheduled: item.scheduled,
        completed: item.completed,
        noShows: item.noShows,
        completionRate:
          item.scheduled > 0
            ? Math.round((item.completed / item.scheduled) * 1000) / 10
            : null,
        // compatibilidade com clientes que ainda leem label/count
        label: item.month,
        count: item.scheduled,
        percent:
          item.scheduled > 0
            ? Math.round((item.completed / item.scheduled) * 1000) / 10
            : 0,
      };
    });
  if (monthInconsistencies) {
    qualityWarnings.push(
      `${monthInconsistencies} mês(es) com realizadas > agendadas; barras limitadas a 100% e números reais mantidos.`,
    );
  }

  const classifiablePast = meetings.filter((m) => {
    const start = parseDate(m.startTime);
    if (!start || start > now) return false;
    return m.attendanceStatus === "compareceu" || m.attendanceStatus === "nao_compareceu";
  });
  const attendedClassifiable = classifiablePast.filter((m) => m.attendanceStatus === "compareceu").length;
  const attendanceRate =
    classifiablePast.length > 0
      ? Math.round((attendedClassifiable / classifiablePast.length) * 1000) / 10
      : null;

  const summary = {
    totalMeetings: meetings.length,
    averageMeetingsPerMonth,
    averageDaysSinceLastMeeting: average(
      clientRows.map((c) => c.daysSinceLastMeeting).filter((v) => v != null),
    ),
    averageIntervalDays: average(
      clientRows.map((c) => c.averageIntervalDays).filter((v) => v != null),
    ),
    totalAbsences: clientRows.reduce((a, c) => a + c.absences, 0),
    totalNoShows: clientRows.reduce((a, c) => a + c.absences, 0),
    totalReschedules: clientRows.reduce((a, c) => a + c.reschedules, 0),
    attendanceRate,
    clientsWithFirstMeeting: withFirst,
    clientsWithoutFirstMeeting: withoutFirst,
    firstMeetingCompletionRate: Math.round((withFirst / portfolio) * 1000) / 10,
  };

  const distributions = {
    meetingsByMonth,
    attendanceStatus: distributionFrom(
      meetings,
      (m) => {
        if (m.attendanceStatus === "compareceu") return "Compareceu";
        if (m.attendanceStatus === "nao_compareceu") return "No-show";
        if (m.attendanceStatus === "cancelada") return "Cancelada";
        return "Sem confirmação";
      },
      ["Compareceu", "No-show", "Cancelada", "Sem confirmação"],
    ),
    meetingFrequency: distributionFrom(clientRows, (c) => c.frequencyBand, FREQ_BANDS),
    daysSinceLastMeeting: distributionFrom(clientRows, (c) => c.daysSinceBand, DAYS_SINCE_BANDS),
    intervalRanges: distributionFrom(clientRows, (c) => c.intervalBand, INTERVAL_BANDS),
    meetingsByEngineer: (() => {
      const counts = new Map();
      for (const client of clientRows) {
        if (!client.totalMeetings) continue;
        counts.set(client.engineer, (counts.get(client.engineer) || 0) + client.totalMeetings);
      }
      const engTotal = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
      return [...counts.entries()]
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / engTotal) * 1000) / 10,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
    })(),
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    distributions,
    clients: clientRows,
    quality: { usedFields: USED_FIELDS, warnings: qualityWarnings },
  };
}

export default async () => {
  const configError = configurationError();
  if (configError) {
    return Response.json(
      { error: configError },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const [clients, calendlyRows, manualRows, attendanceRows, implRows] = await Promise.all([
      fetchAll("clients", CLIENT_SELECT),
      fetchAll("client_meetings", CALENDLY_SELECT),
      fetchAll("manual_meetings", MANUAL_SELECT),
      fetchAll("meeting_attendance", ATTENDANCE_SELECT),
      fetchAll("client_implementation_meeting_date", IMPL_SELECT, "client_id.asc"),
    ]);
    const payload = buildPayload(clients, calendlyRows, manualRows, attendanceRows, implRows);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Não foi possível consolidar os dados de reuniões" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
