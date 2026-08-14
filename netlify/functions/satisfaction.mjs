import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError, getDataEnv } from "./_shared/env.mjs";
import { excludedClientIds, filterExcludedClients, isExcludedClient } from "./_shared/data-exclusions.mjs";

const USED_FIELDS = [
  { table: "nps_responses", column: "id", role: "npsResponseId" },
  { table: "nps_responses", column: "client_id", role: "clientId" },
  { table: "nps_responses", column: "score", role: "npsScore" },
  { table: "nps_responses", column: "created_at", role: "npsDate" },
  { table: "nps_responses", column: "tipo_de_forms", role: "npsFormType" },
  { table: "csat_responses", column: "id", role: "csatResponseId" },
  { table: "csat_responses", column: "client_id", role: "clientId" },
  { table: "csat_responses", column: "score", role: "csatScore" },
  { table: "csat_responses", column: "created_at", role: "csatDate" },
  { table: "csat_responses", column: "tipo_de_forms", role: "csatFormType" },
  { table: "nps_sends", column: "client_id", role: "npsSendClientId" },
  { table: "nps_sends", column: "sent_at", role: "npsSentAt" },
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

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function pct(part, total) {
  return total ? round1((part / total) * 100) : 0;
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return round1(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(date) {
  return `${date.getUTCFullYear()} T${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function npsClassLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  if (Number(score) >= 9) return "Promotor";
  if (Number(score) >= 7) return "Neutro";
  return "Detrator";
}

function latestNpsPerClient(rows) {
  const latest = new Map();
  for (const row of rows) {
    const clientId = blankToNull(row.client_id);
    const date = parseDate(row.created_at);
    if (!clientId || !date) continue;
    const current = latest.get(clientId);
    if (!current || date > parseDate(current.created_at)) latest.set(clientId, row);
  }
  return [...latest.values()];
}

function buildNpsQuarterly(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const date = parseDate(row.created_at);
    if (!date) continue;
    const quarter = quarterKey(date);
    if (!buckets.has(quarter)) buckets.set(quarter, []);
    buckets.get(quarter).push(row);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([quarter, quarterRows]) => {
    const clientRows = latestNpsPerClient(quarterRows);
    const scores = clientRows.map((row) => npsScore(row.score)).filter((score) => score != null);
    return {
      quarter, label: quarter, responses: quarterRows.length, distinctClients: clientRows.length,
      nps: calcNps(scores),
      promoters: scores.filter((score) => score >= 9).length,
      neutrals: scores.filter((score) => score >= 7 && score <= 8).length,
      detractors: scores.filter((score) => score <= 6).length,
    };
  });
}

function buildNpsTransitions(rows, clientMap) {
  const byClientQuarter = new Map();
  for (const row of rows) {
    const clientId = blankToNull(row.client_id);
    const date = parseDate(row.created_at);
    if (!clientId || !date) continue;
    const quarter = quarterKey(date);
    const key = `${clientId}|${quarter}`;
    const current = byClientQuarter.get(key);
    if (!current || date > parseDate(current.created_at)) byClientQuarter.set(key, row);
  }
  const histories = new Map();
  for (const [key, row] of byClientQuarter) {
    const separator = key.lastIndexOf("|");
    const clientId = key.slice(0, separator);
    const quarter = key.slice(separator + 1);
    if (!histories.has(clientId)) histories.set(clientId, []);
    histories.get(clientId).push({ quarter, row });
  }
  const transitions = [];
  for (const [clientId, history] of histories) {
    history.sort((a, b) => a.quarter.localeCompare(b.quarter));
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const current = history[index];
      const fromClass = npsClassLabel(previous.row.score);
      const toClass = npsClassLabel(current.row.score);
      if (!fromClass || !toClass || fromClass === toClass) continue;
      const client = clientMap.get(clientId) || {};
      transitions.push({
        clientId,
        clientName: client.name || current.row.client_name || "Não informado",
        clientEmail: client.email || current.row.client_email || "Não informado",
        engineer: client.engenheiro_patrimonial || "Não informado",
        program: client.programa || "Não identificado",
        fromQuarter: previous.quarter,
        toQuarter: current.quarter,
        fromClass,
        toClass,
        fromScore: npsScore(previous.row.score),
        toScore: npsScore(current.row.score),
      });
    }
  }
  return transitions;
}

function npsScore(score) {
  const value = Number(score);
  return Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
}

function csatScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.min(value, 5);
}

function npsLabel(score) {
  if (score == null) return "Sem nota";
  if (score >= 9) return "Promotor";
  if (score >= 7) return "Neutro";
  return "Detrator";
}

function calcNps(scores) {
  const valid = scores.filter((score) => score != null);
  if (!valid.length) return null;
  const promoters = valid.filter((score) => score >= 9).length;
  const detractors = valid.filter((score) => score <= 6).length;
  return round1(pct(promoters, valid.length) - pct(detractors, valid.length));
}

function isCsat(row) {
  return fold(row?.tipo_de_forms).includes("csat");
}

function programFromFormType(value) {
  const text = fold(value);
  if (text.includes("pharus")) return "Pharus";
  if (text.includes("davos")) return "Davos";
  return null;
}

function payloadProgram(row) {
  const raw = row?.raw_payload;
  let payload = raw;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }
  const hidden = payload?.form_response?.hidden || payload?.hidden || {};
  const definition = payload?.form_response?.definition || payload?.definition || {};
  return programFromFormType([
    row?.tipo_de_forms,
    row?.typeform_form_id,
    hidden.tipo,
    hidden.programa,
    hidden.program,
    hidden.origem,
    hidden.origin,
    definition.title,
  ].filter(Boolean).join(" "));
}

function buildClientProgramMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const clientId = String(row?.id || row?.client_id || "").trim();
    const program = programFromFormType(row?.programa || row?.program);
    if (clientId && program) map.set(clientId, program);
  }
  return map;
}

function resolvedProgram(row, clientPrograms) {
  const clientId = String(row?.client_id || "").trim();
  return (clientId && clientPrograms.get(clientId)) || payloadProgram(row);
}

function dedupeByKey(rows, keyFields) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFields.map((field) => blankToNull(row?.[field])).find(Boolean) || row.id;
    if (!key || seen.has(String(key))) continue;
    seen.add(String(key));
    result.push(row);
  }
  return result;
}

async function fetchAll(table, select, order = "created_at.asc") {
  const { url: baseUrl, serviceRoleKey } = getDataEnv();
  const pageSize = 1000;
  let offset = 0;
  const rows = [];

  while (true) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set("select", select);
    if (order) url.searchParams.set("order", order);
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${table}: HTTP ${response.status} ${detail.slice(0, 160)}`);
    }
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

function buildNpsMonthly(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const date = parseDate(row.created_at);
    const score = npsScore(row.score);
    if (!date || score == null) continue;
    const key = monthKey(date);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(score);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, scores]) => ({
      month,
      label: month,
      count: scores.length,
      nps: calcNps(scores),
      promoters: scores.filter((score) => score >= 9).length,
      neutrals: scores.filter((score) => score >= 7 && score <= 8).length,
      detractors: scores.filter((score) => score <= 6).length,
    }));
}

function buildRows(npsRows, csatRows, clientPrograms = new Map()) {
  const byClient = new Map();
  const ensure = (clientId, seed = {}) => {
    const key = clientId || `sem-cliente-${byClient.size + 1}`;
    if (!byClient.has(key)) {
      byClient.set(key, {
        clientId: clientId || null,
        clientName: seed.client_name || seed.clientName || "Não informado",
        clientEmail: seed.client_email || seed.clientEmail || "Não informado",
        npsResponses: 0,
        latestNps: null,
        latestNpsAt: null,
        csatResponses: 0,
        averageCsat: null,
        latestCsatAt: null,
        programs: [],
      });
    }
    return byClient.get(key);
  };

  for (const row of npsRows) {
    const client = ensure(blankToNull(row.client_id), row);
    const program = resolvedProgram(row, clientPrograms);
    if (program && !client.programs.includes(program)) client.programs.push(program);
    const score = npsScore(row.score);
    const date = parseDate(row.created_at);
    client.npsResponses += score == null ? 0 : 1;
    if (score != null && (!client.latestNpsAt || (date && date > parseDate(client.latestNpsAt)))) {
      client.latestNps = score;
      client.latestNpsAt = date ? date.toISOString() : null;
    }
  }

  const csatByClient = new Map();
  for (const row of csatRows) {
    const score = csatScore(row.score);
    if (score == null) continue;
    const client = ensure(blankToNull(row.client_id), row);
    const program = resolvedProgram(row, clientPrograms);
    if (program && !client.programs.includes(program)) client.programs.push(program);
    const key = client.clientId || client.clientEmail || client.clientName;
    if (!csatByClient.has(key)) csatByClient.set(key, []);
    csatByClient.get(key).push(score);
    client.csatResponses += 1;
    const date = parseDate(row.created_at);
    if (!client.latestCsatAt || (date && date > parseDate(client.latestCsatAt))) {
      client.latestCsatAt = date ? date.toISOString() : null;
    }
  }

  for (const client of byClient.values()) {
    const key = client.clientId || client.clientEmail || client.clientName;
    client.averageCsat = average(csatByClient.get(key) || []);
  }

  return [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR"));
}

function indicator(indicator, viability, value, total, metric) {
  return {
    indicator,
    viability,
    value,
    total,
    coverage: pct(value || 0, total || 0),
    metric,
  };
}

export default async function handler(request) {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  const configError = dataConfigurationError();
  if (configError) {
    return Response.json({ error: configError, code: "config" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const requestUrl = new URL(request.url);
    const programFilter = requestUrl.searchParams.get("program") || "all";
    const quarterFilter = requestUrl.searchParams.get("quarter") || "latest";
    const [rawNpsRows, rawCsatRows, npsSends, clientRows] = await Promise.all([
      fetchAll("nps_responses", "id,typeform_response_id,typeform_form_id,client_id,client_name,client_email,tipo_de_forms,score,comment,raw_payload,created_at", "created_at.asc"),
      fetchAll("csat_responses", "id,typeform_response_id,form_response_id,typeform_form_id,client_id,client_name,client_email,tipo_de_forms,score,comment,raw_payload,created_at,meeting_date", "created_at.asc"),
      fetchAll("nps_sends", "id,client_id,sent_at,created_at", "created_at.asc"),
      fetchAll("clients", "id,name,email,engenheiro_patrimonial,programa", "id.asc"),
    ]);
    const removedIds = excludedClientIds(clientRows);
    const cleanClientRows = filterExcludedClients(clientRows);
    const clientPrograms = buildClientProgramMap(cleanClientRows);
    const clientMap = new Map(cleanClientRows.map((client) => [String(client.id), client]));

    const matchesProgram = (row) => {
      const program = resolvedProgram(row, clientPrograms);
      if (programFilter === "all") return true;
      if (programFilter === "unknown") return !program;
      return program === programFilter;
    };
    const filteredRawNpsRows = rawNpsRows.filter((row) => matchesProgram(row) && !removedIds.has(String(row.client_id || "")) && !isExcludedClient(row));
    const filteredRawCsatRows = rawCsatRows.filter((row) => matchesProgram(row) && !removedIds.has(String(row.client_id || "")) && !isExcludedClient(row));
    const allNpsRows = dedupeByKey(filteredRawNpsRows, ["typeform_response_id", "id"]).filter((row) => npsScore(row.score) != null);
    const npsQuarterly = buildNpsQuarterly(allNpsRows);
    const selectedQuarter = quarterFilter === "latest" ? (npsQuarterly.at(-1)?.quarter || null) : quarterFilter;
    const npsRows = latestNpsPerClient(allNpsRows.filter((row) => {
      const date = parseDate(row.created_at);
      return date && selectedQuarter && quarterKey(date) === selectedQuarter;
    }));
    const allCsatRows = dedupeByKey(filteredRawCsatRows.filter(isCsat), ["typeform_response_id", "form_response_id", "id"]).filter((row) => csatScore(row.score) != null);
    const csatRows = allCsatRows.filter((row) => {
      const date = parseDate(row.created_at);
      return date && selectedQuarter && quarterKey(date) === selectedQuarter;
    });
    const npsScores = npsRows.map((row) => npsScore(row.score)).filter((score) => score != null);
    const csatScores = csatRows.map((row) => csatScore(row.score)).filter((score) => score != null);
    const latestNps = [...npsRows].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at))[0] || null;
    const latestNpsScore = latestNps ? npsScore(latestNps.score) : null;
    const npsMonthly = buildNpsMonthly(allNpsRows);
    const npsTransitions = buildNpsTransitions(allNpsRows, clientMap);
    const totalNpsResponses = npsRows.length;
    const totalCsatResponses = csatRows.length;
    const totalNpsSends = programFilter === "all" ? npsSends.length : 0;

    const promoters = npsScores.filter((score) => score >= 9).length;
    const neutrals = npsScores.filter((score) => score >= 7 && score <= 8).length;
    const detractors = npsScores.filter((score) => score <= 6).length;
    const satisfiedCsat = csatScores.filter((score) => score === 5).length;

    const clients = buildRows(npsRows, csatRows, clientPrograms);

    const summary = {
      nps: calcNps(npsScores),
      latestNps: latestNpsScore,
      latestNpsAt: latestNps?.created_at || null,
      npsResponses: totalNpsResponses,
      npsSends: totalNpsSends,
      npsResponseRate: pct(totalNpsResponses, totalNpsSends),
      promoters,
      neutrals,
      detractors,
      csatAverage: average(csatScores),
      csatResponses: totalCsatResponses,
      csatSatisfied: satisfiedCsat,
      csatSatisfiedPercent: pct(satisfiedCsat, totalCsatResponses),
      ces: null,
      totalClientsWithFeedback: clients.length,
    };

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        filters: {
          program: programFilter,
          quarter: selectedQuarter,
        },
        summary,
        distributions: {
          npsClassification: [
            { label: "Promotores", count: promoters, percent: pct(promoters, totalNpsResponses) },
            { label: "Neutros", count: neutrals, percent: pct(neutrals, totalNpsResponses) },
            { label: "Detratores", count: detractors, percent: pct(detractors, totalNpsResponses) },
          ],
          csatSatisfaction: [
            { label: "Satisfeitos (5)", count: satisfiedCsat, percent: pct(satisfiedCsat, totalCsatResponses) },
            { label: "Não satisfeitos (1-4)", count: Math.max(0, totalCsatResponses - satisfiedCsat), percent: pct(Math.max(0, totalCsatResponses - satisfiedCsat), totalCsatResponses) },
          ],
          npsMonthly,
          npsQuarterly,
        },
        npsTransitions,
        clients,
        indicators: [
          indicator("NPS", "Sim", totalNpsResponses, totalNpsResponses, "Promotores% - Detratores% usando nps_responses.score."),
          indicator("Data do NPS", "Sim", totalNpsResponses, totalNpsResponses, "nps_responses.created_at."),
          indicator("Quantidade de respostas de NPS", "Sim", totalNpsResponses, totalNpsSends || totalNpsResponses, "count(distinct nps_responses.typeform_response_id/id)."),
          indicator("Último NPS", "Sim", latestNps ? 1 : 0, 1, "Última resposta em nps_responses por created_at desc."),
          indicator("CSAT", "Sim", totalCsatResponses, rawCsatRows.length || totalCsatResponses, "Média de csat_responses.score filtrando tipo_de_forms = CSAT; notas acima de 5 são truncadas para 5; satisfeito = 5."),
          indicator("CES", "Sem dado", 0, 0, "Sem tabela/campo estruturado de Customer Effort Score identificado."),
          indicator("Evolução do NPS ao longo do tempo", "Sim", npsMonthly.length, npsMonthly.length, "NPS mensal por date_trunc(created_at) em nps_responses."),
        ],
        quality: {
          usedFields: USED_FIELDS,
          warnings: [
            "csat_responses mistura NPS e CSAT; a tela filtra apenas tipo_de_forms contendo CSAT para calcular CSAT.",
            "CES não foi identificado como campo estruturado no Backup BASE QV.",
          ],
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consolidar Pesquisa de Satisfação" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
