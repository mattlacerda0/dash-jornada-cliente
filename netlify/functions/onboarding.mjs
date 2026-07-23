const CLIENT_SELECT = "id,codigo,name,data_inicio_ciclo,created_at,status,engenheiro_patrimonial";

function configurationError() {
  if (!process.env.DATA_SUPABASE_URL || !process.env.DATA_SUPABASE_SERVICE_ROLE_KEY) {
    return "Configuração do Supabase ausente";
  }
  try {
    if (new URL(process.env.DATA_SUPABASE_URL).protocol !== "https:") return "DATA_SUPABASE_URL deve usar HTTPS";
  } catch {
    return "DATA_SUPABASE_URL inválida";
  }
  return null;
}

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function toNumber(value) {
  const raw = blankToNull(value);
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function nonNegativeDaysBetween(start, end) {
  if (!start || !end) return null;
  const days = daysBetween(start, end);
  return days >= 0 ? days : null;
}

function firstValue(row, ...names) {
  for (const name of names) {
    const value = blankToNull(row?.[name]);
    if (value != null) return value;
  }
  return null;
}

function minDate(values) {
  const dates = values.map(parseDate).filter(Boolean).sort((a, b) => a - b);
  return dates[0] || null;
}

function positiveStatus(value, tokens) {
  const text = String(value || "").toLowerCase();
  return tokens.some((token) => text.includes(token));
}

function average(nums) {
  const clean = nums.filter((num) => num != null && Number.isFinite(num));
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function median(nums) {
  const clean = nums.filter((num) => num != null && Number.isFinite(num)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : Math.round(((clean[mid - 1] + clean[mid]) / 2) * 100) / 100;
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
    : [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  return entries.map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 1000) / 10 }));
}

async function fetchAll(table, select = "*") {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, process.env.DATA_SUPABASE_URL);
    url.searchParams.set("select", select);
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

async function fetchAllSafe(table, select = "*") {
  try {
    return await fetchAll(table, select);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), rows: [] };
  }
}

function byClient(rows) {
  const map = new Map();
  for (const row of rows) {
    const clientId = firstValue(row, "client_id", "cliente_id", "clientId", "qv_id");
    if (!clientId) continue;
    const key = String(clientId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

const OPEN_ONBOARDING_STAGE_IDS = new Set([
  "7c43c981-5cc8-4ed3-b6ad-3bad26856b79",
  "ae3a6015-cc67-4e20-8c9b-f7d7b5605b48",
  "33bb253e-6c80-4611-a1dd-abc6515530e7",
]);

const TOTAL_ONBOARDING_START_STAGE_IDS = new Set([
  "33bb253e-6c80-4611-a1dd-abc6515530e7",
  "7c43c981-5cc8-4ed3-b6ad-3bad26856b79",
]);

const DAY_RANGE_LABELS = ["0-7 dias", "8-15 dias", "16-30 dias", "31-60 dias", "61-90 dias", "Mais de 90 dias", "Sem base"];

function dayRange(value) {
  if (value == null || !Number.isFinite(value)) return "Sem base";
  if (value <= 7) return "0-7 dias";
  if (value <= 15) return "8-15 dias";
  if (value <= 30) return "16-30 dias";
  if (value <= 60) return "31-60 dias";
  if (value <= 90) return "61-90 dias";
  return "Mais de 90 dias";
}

function latestByDate(rows, dateField = "started_at") {
  return [...rows]
    .map((row) => ({ row, date: parseDate(firstValue(row, dateField, "created_at", "updated_at")) }))
    .filter((item) => item.date)
    .sort((a, b) => b.date - a.date)[0]?.row || null;
}

function stageMap(stages) {
  const map = new Map();
  for (const stage of stages) {
    const id = firstValue(stage, "id", "stage_id", "current_stage_id");
    if (!id) continue;
    map.set(String(id), firstValue(stage, "name", "nome", "title", "label") || String(id));
  }
  return map;
}

function transitionDurations(journeysByClient, stagesById) {
  const durations = [];
  for (const [clientId, journeys] of journeysByClient.entries()) {
    const ordered = journeys
      .map((row) => ({
        row,
        date: parseDate(firstValue(row, "started_at", "created_at")),
        stageId: firstValue(row, "current_stage_id", "stage_id"),
      }))
      .filter((item) => item.date && item.stageId)
      .sort((a, b) => a.date - b.date);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];
      const days = daysBetween(current.date, next.date);
      if (days < 0) continue;
      durations.push({
        clientId,
        stageId: String(current.stageId),
        stageName: stagesById.get(String(current.stageId)) || String(current.stageId),
        days,
      });
    }
  }
  return durations;
}

async function buildPayload() {
  const warnings = [];
  const clients = await fetchAll("clients", CLIENT_SELECT);
  const sourceResults = {
    client_meetings: await fetchAllSafe("client_meetings"),
    client_journeys: await fetchAllSafe("client_journeys"),
    client_mecanismos: await fetchAllSafe("client_mecanismos"),
    client_implementation_meeting_date: await fetchAllSafe("client_implementation_meeting_date"),
    journey_stages: await fetchAllSafe("journey_stages"),
  };
  for (const [table, result] of Object.entries(sourceResults)) {
    if (!Array.isArray(result)) warnings.push(`${table}: ${result.error}`);
  }

  const meetingsByClient = byClient(Array.isArray(sourceResults.client_meetings) ? sourceResults.client_meetings : []);
  const journeysByClient = byClient(Array.isArray(sourceResults.client_journeys) ? sourceResults.client_journeys : []);
  const mechanismsByClient = byClient(Array.isArray(sourceResults.client_mecanismos) ? sourceResults.client_mecanismos : []);
  const implementationMeetingsByClient = byClient(Array.isArray(sourceResults.client_implementation_meeting_date) ? sourceResults.client_implementation_meeting_date : []);
  const stagesById = stageMap(Array.isArray(sourceResults.journey_stages) ? sourceResults.journey_stages : []);
  const allTransitionDurations = transitionDurations(journeysByClient, stagesById);
  const transitionDurationsByClient = new Map();
  for (const item of allTransitionDurations) {
    if (!transitionDurationsByClient.has(item.clientId)) transitionDurationsByClient.set(item.clientId, []);
    transitionDurationsByClient.get(item.clientId).push(item);
  }

  const rows = clients.map((client) => {
    const clientId = String(client.id);
    const contractDate = parseDate(client.data_inicio_ciclo) || parseDate(client.created_at);
    const meetings = meetingsByClient.get(clientId) || [];
    const journeys = journeysByClient.get(clientId) || [];
    const mechanisms = mechanismsByClient.get(clientId) || [];
    const implementationMeetings = implementationMeetingsByClient.get(clientId) || [];

    const firstMeeting = minDate(meetings.map((row) => firstValue(row, "start_time", "started_at", "scheduled_at", "created_at")));
    const planDelivered = minDate(implementationMeetings.map((row) => firstValue(row, "meeting_date", "data_reuniao", "created_at")));
    const firstImplementation = minDate(mechanisms
      .filter((row) => positiveStatus(firstValue(row, "status", "state"), ["implement", "implant", "conclu", "feito"]) || firstValue(row, "implemented_at", "implantado_at", "data_implementacao"))
      .map((row) => firstValue(row, "implemented_at", "implantado_at", "data_implementacao", "updated_at", "created_at")));

    const latestJourney = latestByDate(journeys);
    const latestStageId = latestJourney ? String(firstValue(latestJourney, "current_stage_id", "stage_id") || "") : null;
    const completedOnboarding = latestStageId ? !OPEN_ONBOARDING_STAGE_IDS.has(latestStageId) : null;
    const clientTransitions = transitionDurationsByClient.get(clientId) || [];
    const totalOnboardingDurations = clientTransitions
      .filter((item) => TOTAL_ONBOARDING_START_STAGE_IDS.has(item.stageId))
      .map((item) => item.days);
    const totalOnboardingDays = median(totalOnboardingDurations);

    const daysUntil = (date) => nonNegativeDaysBetween(contractDate, date);

    return {
      clientId,
      clientCode: blankToNull(client.codigo),
      clientName: blankToNull(client.name) || "Não informado",
      status: blankToNull(client.status) || "Não informado",
      engineer: blankToNull(client.engenheiro_patrimonial) || "Não informado",
      contractDate: contractDate?.toISOString() || null,
      firstMeetingDate: firstMeeting?.toISOString() || null,
      planDeliveredDate: planDelivered?.toISOString() || null,
      firstImplementationDate: firstImplementation?.toISOString() || null,
      daysToFirstMeeting: daysUntil(firstMeeting),
      daysToPlanDelivery: daysUntil(planDelivered),
      daysToFirstImplementation: daysUntil(firstImplementation),
      totalOnboardingDays,
      completedOnboarding,
      currentStageId: latestStageId,
      currentStageName: latestStageId ? (stagesById.get(latestStageId) || latestStageId) : "Sem base",
      journeyRecords: journeys.length,
      meetingRecords: meetings.length,
      planRecords: implementationMeetings.length,
      mechanismRecords: mechanisms.length,
    };
  });

  const total = rows.length || 1;
  const withFirstMeeting = rows.filter((row) => row.daysToFirstMeeting != null).length;
  const withPlanDelivery = rows.filter((row) => row.daysToPlanDelivery != null).length;
  const withImplementation = rows.filter((row) => row.daysToFirstImplementation != null).length;
  const completeCount = rows.filter((row) => row.completedOnboarding === true).length;
  const openCount = rows.filter((row) => row.completedOnboarding === false).length;
  const withCompletionBase = completeCount + openCount;
  const hasJourney = Array.isArray(sourceResults.client_journeys) && sourceResults.client_journeys.length > 0;
  const totalOnboardingCount = rows.filter((row) => row.totalOnboardingDays != null).length;

  const stageGroups = new Map();
  for (const item of allTransitionDurations) {
    if (!stageGroups.has(item.stageName)) stageGroups.set(item.stageName, []);
    stageGroups.get(item.stageName).push(item.days);
  }
  const stageDurations = [...stageGroups.entries()]
    .map(([label, values]) => ({ label, count: values.length, value: median(values), percent: 0 }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const indicators = [
    ["Dias entre contratação e primeira reunião", withFirstMeeting ? "Sim" : "Sem base", "Mediana da diferença não negativa entre clients.data_inicio_ciclo e a primeira client_meetings.start_time.", median(rows.map((row) => row.daysToFirstMeeting)), "dias", withFirstMeeting],
    ["Dias entre contratação e entrega do plano patrimonial", withPlanDelivery ? "Sim" : "Sem base", "Mediana da diferença não negativa entre clients.data_inicio_ciclo e a primeira client_implementation_meeting_date.meeting_date.", median(rows.map((row) => row.daysToPlanDelivery)), "dias", withPlanDelivery],
    ["Dias entre contratação e primeiro mecanismo implementado", withImplementation ? "Sim" : "Não identificado", "Mediana da diferença não negativa entre clients.data_inicio_ciclo e a primeira client_mecanismos.implemented_at.", median(rows.map((row) => row.daysToFirstImplementation)), "dias", withImplementation],
    ["Tempo total de onboarding", totalOnboardingCount ? "Sim" : "Sem base", "Mediana da diferença não negativa entre client_journeys.started_at dos estágios 33bb253e... ou 7c43c981... e a próxima data do mesmo client_id.", median(rows.map((row) => row.totalOnboardingDays)), "dias", totalOnboardingCount],
    ["Concluiu onboarding (Sim/Não)", hasJourney ? "Sim" : "Sem base", "Sim quando o estágio atual do client_id é diferente dos estágios 7c43c981..., ae3a6015... e 33bb253e.... Não quando é igual.", completeCount, "clientes", withCompletionBase],
    ["Tempo médio para cada etapa da jornada", stageDurations.length ? "Sim" : "Sem base", "Mediana da diferença não negativa entre client_journeys.started_at e a próxima mudança de current_stage_id; eixo pelo journey_stages.name.", median(stageDurations.map((item) => item.value)), "dias", allTransitionDurations.length],
  ].map(([indicator, viability, metric, value, unit, count]) => ({
    indicator,
    viability,
    metric,
    value,
    unit,
    coverage: Math.round((Number(count) / total) * 1000) / 10,
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalClients: rows.length,
      completedOnboarding: completeCount,
      openOnboarding: openCount,
      completedPercent: Math.round((completeCount / (withCompletionBase || 1)) * 1000) / 10,
      averageFirstMeetingDays: indicators[0].value,
      averagePlanDeliveryDays: indicators[1].value,
      averageFirstImplementationDays: indicators[2].value,
      averageTotalOnboardingDays: indicators[3].value,
      averageStageDays: indicators[5].value,
    },
    indicators,
    distributions: {
      firstMeetingRanges: distributionFrom(rows, (row) => dayRange(row.daysToFirstMeeting), DAY_RANGE_LABELS),
      planDeliveryRanges: distributionFrom(rows, (row) => dayRange(row.daysToPlanDelivery), DAY_RANGE_LABELS),
      firstImplementationRanges: distributionFrom(rows, (row) => dayRange(row.daysToFirstImplementation), DAY_RANGE_LABELS),
      totalOnboardingRanges: distributionFrom(rows, (row) => dayRange(row.totalOnboardingDays), DAY_RANGE_LABELS),
      completion: distributionFrom(rows.filter((row) => row.completedOnboarding != null), (row) => row.completedOnboarding ? "Sim" : "Não", ["Sim", "Não"]),
      stageDurations,
    },
    clients: rows,
    sources: {
      primary: "BASE QV",
      schema: "public",
      tables: ["clients", "client_journeys", "journey_stages", "client_meetings", "client_implementation_meeting_date", "client_mecanismos"],
      warnings,
    },
  };
}

/** Fonte única reutilizada pelo handler HTTP e pelo Assistente da Jornada. */
export async function computeOnboardingPayload() {
  const configError = configurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }
  return buildPayload();
}

export default async () => {
  const configError = configurationError();
  if (configError) return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await computeOnboardingPayload(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("onboarding error", error);
    return Response.json({ error: "Não foi possível consolidar a jornada e onboarding" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
