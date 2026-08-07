import { getPharusSupabaseClient } from "./_shared/env.mjs";
import { fetchPharusDemoIdentities, filterPharusDemoRows } from "./_shared/pharus-demo-filter.mjs";
import {
  applyFirstMeetingFallbackToClientRows,
  loadAirtableFirstMeetingIndex,
} from "./_shared/first-meeting-fallback.mjs";

const CLIENT_SELECT =
  "id,codigo,name,data_inicio_ciclo,created_at,status,engenheiro_patrimonial,cpf,cpf_digits,email,phone,phone_digits";
const PHARUS_EVENTS_SELECT = "*";

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

function objectValue(row, ...names) {
  for (const name of names) {
    const value = row?.[name];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim().startsWith("{")) {
      try {
        return JSON.parse(value);
      } catch {
        // ignore malformed event metadata
      }
    }
  }
  return {};
}

function eventClientId(row) {
  const metadata = objectValue(row, "metadata", "properties", "event_properties", "payload", "data");
  return firstValue(row, "client_id", "cliente_id", "user_id", "userId", "distinct_id", "profile_id", "person_id")
    || firstValue(metadata, "client_id", "cliente_id", "user_id", "userId", "distinct_id", "profile_id", "person_id");
}

function eventName(row) {
  return String(firstValue(row, "event_name", "name", "event") || "").trim();
}

function eventDate(row) {
  return parseDate(firstValue(row, "created_at", "timestamp", "event_time", "occurred_at", "inserted_at", "sent_at"));
}

function minDate(values) {
  const dates = values.map(parseDate).filter(Boolean).sort((a, b) => a - b);
  return dates[0] || null;
}

function positiveStatus(value, tokens) {
  const text = String(value || "").toLowerCase();
  return tokens.some((token) => text.includes(token));
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isCentralIntelligenceMeeting(row) {
  return fold(firstValue(row, "event_name", "title", "name", "meeting_type"))
    .includes("central de inteligencia");
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

const PHARUS_STAGE_ALIASES = [
  { label: "Resposta do quiz", tokens: ["quiz", "answer", "answered", "response"] },
  { label: "Status financeiro", tokens: ["financial", "finance", "status"] },
  { label: "Onboarding", tokens: ["onboarding"] },
  { label: "Open Finance", tokens: ["open_finance", "open finance", "openfinance"] },
];

function pharusStageLabel(name) {
  const folded = String(name || "").toLowerCase().replace(/[-.]/g, "_");
  const spaced = folded.replace(/_/g, " ");
  for (const item of PHARUS_STAGE_ALIASES) {
    if (item.tokens.some((token) => folded.includes(token) || spaced.includes(token))) return item.label;
  }
  return null;
}

async function fetchPharusMetricEvents(warnings) {
  try {
    const client = getPharusSupabaseClient({ schema: "metrics" });
    const rows = [];
    const pageSize = 1000;
    const eventNames = [
      "onboarding_step_completed",
      "onboarding_step_started",
      "onboarding_step_updated",
      "form_submission_saved",
      "financial_engines_saved",
      "open_finance_accounts_synced",
      "open_finance_investments_synced",
      "open_finance_connect_token_issued",
    ].join(",");
    for (let offset = 0; offset < 200000; offset += pageSize) {
      const page = await client.rest("events", {
        select: PHARUS_EVENTS_SELECT,
        filters: { event_name: `in.(${eventNames})`, order: "id.asc" },
        limit: pageSize,
        offset,
      });
      if (!page.ok) {
        const err = new Error(`metrics.events: HTTP ${page.status}`);
        err.status = page.status;
        err.raw = (page.raw || "").slice(0, 240);
        throw err;
      }
      rows.push(...page.data);
      if (page.data.length < pageSize) break;
    }
    return rows;
  } catch (error) {
    warnings.push({
      code: "PHARUS_METRICS_AUTH",
      label: "App Pharus metrics.events sem permissão",
      severity: "warning",
      message: error?.status === 401
        ? "O schema metrics exige chave service role ou política de leitura para o backend."
        : `Não foi possível consultar metrics.events: ${error instanceof Error ? error.message : String(error)}`,
    });
    return [];
  }
}

function summarizePharusOnboardingEvents(events) {
  const byClient = new Map();
  const completedByClient = new Map();
  const stepGroups = new Map();

  for (const row of events) {
    const clientId = eventClientId(row);
    const name = eventName(row);
    const date = eventDate(row);
    if (!clientId || !name || !date) continue;
    const key = String(clientId);
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push({ name, date, stageLabel: pharusStageLabel(name) });
    if (name === "onboarding_step_completed") {
      const current = completedByClient.get(key);
      if (!current || date < current.date) completedByClient.set(key, { row, date });
    }
  }

  for (const list of byClient.values()) {
    const ordered = list.sort((a, b) => a.date - b.date);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];
      if (!current.stageLabel) continue;
      const days = nonNegativeDaysBetween(current.date, next.date);
      if (days == null) continue;
      if (!stepGroups.has(current.stageLabel)) stepGroups.set(current.stageLabel, []);
      stepGroups.get(current.stageLabel).push(days);
    }
  }

  const stageDurations = PHARUS_STAGE_ALIASES.map(({ label }) => {
    const values = stepGroups.get(label) || [];
    return { label, count: values.length, value: median(values), percent: 0 };
  }).filter((item) => item.count > 0);

  return { byClient, completedByClient, stageDurations };
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
  const [clients, airtableIndex, ...sourceEntries] = await Promise.all([
    fetchAll("clients", CLIENT_SELECT),
    loadAirtableFirstMeetingIndex().catch((err) => ({
      available: false,
      reason: err?.message || "Falha ao carregar índice Airtable.",
      warnings: [],
    })),
    fetchAllSafe("client_meetings"),
    fetchAllSafe("client_journeys"),
    fetchAllSafe("client_financial_data", "client_id,created_at"),
    fetchAllSafe("client_mecanismos"),
    fetchAllSafe("journey_stages"),
  ]);
  const sourceResults = {
    client_meetings: sourceEntries[0],
    client_journeys: sourceEntries[1],
    client_financial_data: sourceEntries[2],
    client_mecanismos: sourceEntries[3],
    journey_stages: sourceEntries[4],
  };
  for (const [table, result] of Object.entries(sourceResults)) {
    if (!Array.isArray(result)) warnings.push(`${table}: ${result.error}`);
  }
  if (airtableIndex?.reason && !airtableIndex.available) {
    warnings.push(`airtable_fallback: ${airtableIndex.reason}`);
  }
  const pharusEventsRaw = await fetchPharusMetricEvents(warnings);
  const pharusDemoIdentities = await fetchPharusDemoIdentities(warnings);
  const pharusEvents = filterPharusDemoRows(pharusEventsRaw, pharusDemoIdentities, ["user_id", "userId", "client_id", "distinct_id", "profile_id", "person_id"]);
  const pharusOnboarding = summarizePharusOnboardingEvents(pharusEvents);

  const meetingsByClient = byClient(Array.isArray(sourceResults.client_meetings) ? sourceResults.client_meetings : []);
  const journeysByClient = byClient(Array.isArray(sourceResults.client_journeys) ? sourceResults.client_journeys : []);
  const financialDataByClient = byClient(Array.isArray(sourceResults.client_financial_data) ? sourceResults.client_financial_data : []);
  const mechanismsByClient = byClient(Array.isArray(sourceResults.client_mecanismos) ? sourceResults.client_mecanismos : []);
  const stagesById = stageMap(Array.isArray(sourceResults.journey_stages) ? sourceResults.journey_stages : []);
  const allTransitionDurations = transitionDurations(journeysByClient, stagesById);

  const rows = clients.map((client) => {
    const clientId = String(client.id);
    const contractDate = parseDate(client.data_inicio_ciclo) || parseDate(client.created_at);
    const meetings = meetingsByClient.get(clientId) || [];
    const journeys = journeysByClient.get(clientId) || [];
    const financialRecords = financialDataByClient.get(clientId) || [];
    const mechanisms = mechanismsByClient.get(clientId) || [];

    const firstMeeting = minDate(meetings.map((row) => firstValue(row, "start_time", "started_at", "scheduled_at", "created_at")));
    const firstFinancialData = minDate(financialRecords.map((row) => firstValue(row, "created_at")));
    const centralIntelligenceMeetings = meetings.filter(isCentralIntelligenceMeeting);
    const planDelivered = minDate(centralIntelligenceMeetings.map((row) => firstValue(row, "start_time", "meeting_date", "scheduled_at", "created_at")));
    const firstImplementation = minDate(mechanisms
      .filter((row) => positiveStatus(firstValue(row, "status", "state"), ["implement", "implant", "conclu", "feito"])
        || firstValue(row, "implemented_at", "implantado_at", "data_implementacao"))
      .map((row) => firstValue(row, "implemented_at", "implantado_at", "data_implementacao", "updated_at", "created_at")));

    const latestJourney = latestByDate(journeys);
    const latestStageId = latestJourney ? String(firstValue(latestJourney, "current_stage_id", "stage_id") || "") : null;
    const completedByJourney = latestStageId ? !OPEN_ONBOARDING_STAGE_IDS.has(latestStageId) : null;
    const hasFinancialData = financialRecords.length > 0;
    const hasFirstMeeting = Boolean(firstMeeting);
    const completedOnboarding = completedByJourney === true || hasFirstMeeting || hasFinancialData
      ? true
      : completedByJourney === false
        ? false
        : null;
    const pharusCompleted = pharusOnboarding.completedByClient.get(clientId);

    const daysUntil = (date) => nonNegativeDaysBetween(contractDate, date);
    const daysToFirstFinancialData = daysUntil(firstFinancialData);
    const onboardingMilestones = [
      { source: "base_qv_client_meetings", days: daysUntil(firstMeeting) },
      { source: "base_qv_client_financial_data", days: daysToFirstFinancialData },
    ].filter((item) => item.days != null).sort((a, b) => a.days - b.days);
    const totalOnboardingDays = onboardingMilestones[0]?.days ?? null;

    return {
      clientId,
      clientCode: blankToNull(client.codigo),
      clientName: blankToNull(client.name) || "Não informado",
      status: blankToNull(client.status) || "Não informado",
      engineer: blankToNull(client.engenheiro_patrimonial) || "Não informado",
      contractDate: contractDate?.toISOString() || null,
      firstMeetingDate: firstMeeting?.toISOString() || null,
      firstFinancialDataDate: firstFinancialData?.toISOString() || null,
      planDeliveredDate: planDelivered?.toISOString() || null,
      firstImplementationDate: firstImplementation?.toISOString() || null,
      daysToFirstMeeting: daysUntil(firstMeeting),
      daysToFirstFinancialData,
      daysToPlanDelivery: daysUntil(planDelivered),
      daysToFirstImplementation: daysUntil(firstImplementation),
      totalOnboardingDays,
      totalOnboardingDaysSource: onboardingMilestones[0]?.source || null,
      pharusOnboardingCompletedAt: pharusCompleted?.date ? pharusCompleted.date.toISOString() : null,
      pharusCompletedOnboarding: Boolean(pharusCompleted),
      completedOnboarding,
      completedByJourney,
      hasFinancialData,
      completedOnboardingSource: null,
      currentStageId: latestStageId,
      currentStageName: latestStageId ? (stagesById.get(latestStageId) || latestStageId) : "Sem base",
      journeyRecords: journeys.length,
      meetingRecords: meetings.length,
      planRecords: centralIntelligenceMeetings.length,
      financialRecords: financialRecords.length,
      mechanismRecords: mechanisms.length,
    };
  });

  const beforeFallbackWithMeeting = rows.filter((row) => row.firstMeetingDate).length;
  const { coverage: firstMeetingFallbackCoverage } = applyFirstMeetingFallbackToClientRows(
    rows,
    clients,
    airtableIndex,
  );
  for (const row of rows) {
    if (row.firstMeetingSource === "airtable" && row.firstMeetingDate) {
      const contractDate = parseDate(row.contractDate);
      const meetingDate = parseDate(row.firstMeetingDate);
      row.daysToFirstMeeting =
        contractDate && meetingDate ? nonNegativeDaysBetween(contractDate, meetingDate) : row.daysToFirstMeeting;
    }
    const milestones = [
      { source: "base_qv_client_meetings", days: row.daysToFirstMeeting },
      { source: "base_qv_client_financial_data", days: row.daysToFirstFinancialData },
    ].filter((item) => item.days != null).sort((a, b) => a.days - b.days);
    row.totalOnboardingDays = milestones[0]?.days ?? null;
    row.totalOnboardingDaysSource = milestones[0]?.source || null;
    const completedByMeeting = row.daysToFirstMeeting != null;
    row.completedByFirstMeeting = completedByMeeting;
    row.completedOnboarding = row.completedByJourney === true || completedByMeeting || row.hasFinancialData
      ? true
      : row.completedByJourney === false
        ? false
        : null;
    const completionSources = [];
    if (row.completedByJourney === true) completionSources.push("journey");
    if (completedByMeeting) completionSources.push("first_meeting");
    if (row.hasFinancialData) completionSources.push("financial_data");
    row.completedOnboardingSource = completionSources.join("_and_") || (row.completedByJourney === false ? "open_journey" : null);
  }
  const afterFallbackWithMeeting = rows.filter((row) => row.firstMeetingDate).length;

  const total = rows.length || 1;
  const withFirstMeeting = rows.filter((row) => row.daysToFirstMeeting != null).length;
  const withPlanDelivery = rows.filter((row) => row.daysToPlanDelivery != null).length;
  const withImplementation = rows.filter((row) => row.daysToFirstImplementation != null).length;
  const firstImplementationRows = rows.filter((row) => row.daysToFirstImplementation != null);
  const completeCount = rows.filter((row) => row.completedOnboarding === true).length;
  const openCount = rows.filter((row) => row.completedOnboarding === false).length;
  const completedByJourneyCount = rows.filter((row) => row.completedByJourney === true).length;
  const completedByFirstMeetingCount = rows.filter((row) => row.completedByFirstMeeting).length;
  const completedByFinancialCount = rows.filter((row) => row.hasFinancialData).length;
  const completedByFinancialOnlyCount = rows.filter((row) => row.hasFinancialData && row.completedByJourney !== true && !row.completedByFirstMeeting).length;
  const withCompletionBase = completeCount + openCount;
  const hasJourney = Array.isArray(sourceResults.client_journeys) && sourceResults.client_journeys.length > 0;
  const totalOnboardingRows = rows.filter((row) => row.totalOnboardingDays != null);
  const journeyKpiCandidates = rows.filter((row) =>
    row.totalOnboardingDays != null
    && row.daysToFirstMeeting != null
    && row.daysToPlanDelivery != null
  );
  const journeyKpiOrderingIssues = journeyKpiCandidates.filter((row) =>
    row.totalOnboardingDays > row.daysToFirstMeeting
    || row.totalOnboardingDays > row.daysToPlanDelivery
    || row.daysToFirstMeeting > row.daysToPlanDelivery
  ).length;
  const journeyKpiComparableRows = journeyKpiCandidates.filter((row) =>
    row.totalOnboardingDays <= row.daysToFirstMeeting
    && row.totalOnboardingDays <= row.daysToPlanDelivery
    && row.daysToFirstMeeting <= row.daysToPlanDelivery
  );
  const totalOnboardingCount = journeyKpiComparableRows.length;
  const pharusCompletedCount = pharusOnboarding.completedByClient.size;

  const stageGroups = new Map();
  for (const item of allTransitionDurations) {
    if (!stageGroups.has(item.stageName)) stageGroups.set(item.stageName, []);
    stageGroups.get(item.stageName).push(item.days);
  }
  const stageDurations = [...stageGroups.entries()]
    .map(([label, values]) => ({ label, count: values.length, value: median(values), percent: 0 }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  const pharusStageDurations = pharusOnboarding.stageDurations.sort((a, b) => (b.value || 0) - (a.value || 0));
  const stageDurationCount = pharusStageDurations.length
    ? pharusStageDurations.reduce((sum, item) => sum + item.count, 0)
    : allTransitionDurations.length;

  const indicators = [
    ["Tempo total de onboarding", totalOnboardingCount ? "Sim" : "Sem base", "Mediana, na coorte cronológica dos três marcos, entre a data inicial e o primeiro marco disponível: primeira reunião ou primeira inclusão financeira.", median(journeyKpiComparableRows.map((row) => row.totalOnboardingDays)), "dias", totalOnboardingCount],
    ["Dias entre contratação e primeira reunião", totalOnboardingCount ? "Sim" : "Sem base", "Mediana, na mesma coorte, entre a data inicial e a primeira client_meetings.start_time.", median(journeyKpiComparableRows.map((row) => row.daysToFirstMeeting)), "dias", totalOnboardingCount],
    ["Dias entre contratação e entrega do plano patrimonial", totalOnboardingCount ? "Sim" : "Sem base", "Mediana, na mesma coorte, entre a data inicial e a primeira reunião Central de Inteligência.", median(journeyKpiComparableRows.map((row) => row.daysToPlanDelivery)), "dias", totalOnboardingCount],
    ["Dias entre contratação e primeiro mecanismo implementado", withImplementation ? "Sim" : "Sem base", "Mediana da diferença não negativa entre clients.data_inicio_ciclo (fallback created_at) e a primeira implementação válida em public.client_mecanismos.", median(firstImplementationRows.map((row) => row.daysToFirstImplementation)), "dias", withImplementation],
    ["Concluiu onboarding (Sim/Não)", (hasJourney || withFirstMeeting || completedByFinancialCount) ? "Sim" : "Sem base", "Sim quando o estágio atual está fora dos estágios abertos OU existe primeira reunião OU existe registro em public.client_financial_data.", completeCount, "clientes", withCompletionBase],
    ["Concluíram Onboarding App Pharus", pharusCompletedCount ? "Sim" : "Sem base", "count(distinct client_id/user_id) em metrics.events com event_name = onboarding_step_completed.", pharusCompletedCount, "clientes", pharusCompletedCount],
    ["Tempo médio para cada etapa da jornada", (pharusStageDurations.length || stageDurations.length) ? "Sim" : "Sem base", "Mediana entre eventos consecutivos do mesmo cliente em metrics.events, agrupando event_name por resposta do quiz, status financeiro, onboarding e open finance; fallback journey_stages.name.", median((pharusStageDurations.length ? pharusStageDurations : stageDurations).map((item) => item.value)), "dias", stageDurationCount],
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
      completedByJourney: completedByJourneyCount,
      completedByFirstMeeting: completedByFirstMeetingCount,
      completedByFinancialData: completedByFinancialCount,
      completedByFinancialDataOnly: completedByFinancialOnlyCount,
      completionBaseClients: withCompletionBase,
      completedPercent: Math.round((completeCount / (withCompletionBase || 1)) * 1000) / 10,
      averageTotalOnboardingDays: indicators[0].value,
      averageFirstMeetingDays: indicators[1].value,
      averagePlanDeliveryDays: indicators[2].value,
      averageFirstImplementationDays: indicators[3].value,
      firstMeetingCount: journeyKpiComparableRows.length,
      firstMeetingCoveragePercent: indicators[1].coverage,
      planDeliveryCount: journeyKpiComparableRows.length,
      planDeliveryCoveragePercent: indicators[2].coverage,
      overallPlanDeliveryCount: withPlanDelivery,
      overallPlanDeliveryMedianDays: median(rows.map((row) => row.daysToPlanDelivery)),
      planApprovalCount: withPlanDelivery,
      planApprovalCoveragePercent: Math.round((withPlanDelivery / total) * 1000) / 10,
      firstImplementationCount: withImplementation,
      firstImplementationCoveragePercent: indicators[3].coverage,
      totalOnboardingCount,
      totalOnboardingCoveragePercent: indicators[0].coverage,
      overallTotalOnboardingCount: totalOnboardingRows.length,
      overallTotalOnboardingMedianDays: median(totalOnboardingRows.map((row) => row.totalOnboardingDays)),
      comparablePlanOnboardingClients: journeyKpiComparableRows.length,
      comparablePlanDeliveryMedianDays: indicators[2].value,
      comparableTotalOnboardingMedianDays: indicators[0].value,
      journeyKpiComparableClients: journeyKpiComparableRows.length,
      journeyKpiOrderingIssues,
      overallFirstMeetingCount: withFirstMeeting,
      overallFirstMeetingMedianDays: median(rows.map((row) => row.daysToFirstMeeting)),
      overallFirstImplementationCount: withImplementation,
      overallFirstImplementationMedianDays: median(rows.map((row) => row.daysToFirstImplementation)),
      planOnboardingOrderingIssues: journeyKpiOrderingIssues,
      appPharusCompletedOnboarding: pharusCompletedCount,
      averageStageDays: indicators[6].value,
      stageDurationCount,
      stageDurationCoveragePercent: indicators[6].coverage,
      firstMeetingCoverageBeforeFallback: Math.round((beforeFallbackWithMeeting / total) * 1000) / 10,
      firstMeetingCoverageAfterFallback: Math.round((afterFallbackWithMeeting / total) * 1000) / 10,
      firstMeetingSources: {
        base_qv: firstMeetingFallbackCoverage?.primary || beforeFallbackWithMeeting,
        airtable: firstMeetingFallbackCoverage?.airtable || 0,
        unavailable: firstMeetingFallbackCoverage?.unavailable || 0,
      },
      airtableFallback: {
        available: Boolean(airtableIndex?.available),
        reason: airtableIndex?.reason || null,
        coverage: firstMeetingFallbackCoverage || null,
      },
    },
    indicators,
    distributions: {
      firstMeetingRanges: distributionFrom(journeyKpiComparableRows, (row) => dayRange(row.daysToFirstMeeting), DAY_RANGE_LABELS),
      planDeliveryRanges: distributionFrom(journeyKpiComparableRows, (row) => dayRange(row.daysToPlanDelivery), DAY_RANGE_LABELS),
      firstImplementationRanges: distributionFrom(firstImplementationRows, (row) => dayRange(row.daysToFirstImplementation), DAY_RANGE_LABELS),
      totalOnboardingRanges: distributionFrom(journeyKpiComparableRows, (row) => dayRange(row.totalOnboardingDays), DAY_RANGE_LABELS),
      completion: distributionFrom(rows.filter((row) => row.completedOnboarding != null), (row) => row.completedOnboarding ? "Sim" : "Não", ["Sim", "Não"]),
      stageDurations,
      pharusStageDurations,
      pharusCompletion: distributionFrom([
        ...Array.from({ length: pharusCompletedCount }, () => ({ completed: true })),
        ...Array.from({ length: Math.max(0, rows.length - pharusCompletedCount) }, () => ({ completed: false })),
      ], (row) => row.completed ? "Sim" : "Não", ["Sim", "Não"]),
    },
    clients: rows,
    sources: {
      primary: "BASE QV",
      schema: "public",
      tables: ["clients", "client_journeys", "journey_stages", "client_meetings", "client_financial_data", "client_mecanismos"],
      appPharus: {
        schema: "metrics",
        table: "events",
        eventName: "onboarding_step_completed",
        rows: pharusEvents.length,
      },
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
