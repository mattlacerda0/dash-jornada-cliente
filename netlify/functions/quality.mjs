const FIELDS = [
  ["Cliente", "clients", "id", false],
  ["Cliente", "clients", "codigo", true],
  ["Cliente", "clients", "qv_id", true], ["Cliente", "clients", "name", true],
  ["Cliente", "clients", "email", true], ["Cliente", "clients", "phone", true],
  ["Cliente", "clients", "created_at", false],
  ["Cliente", "clients", "data_inicio_ciclo", false],
  ["Cliente", "clients", "status", true],
  ["Cliente", "clients", "segmentacao", true], ["Cliente", "clients", "engenheiro_patrimonial", true],
  ["Cliente", "clients", "objetivo_principal", true], ["Cancelamento", "clients", "data_churn", false],
  ["Cancelamento", "clients", "motivo_churn", true],   ["Financeiro", "client_financial_data", "ultima_renda_mensal", false],
  ["Financeiro", "client_financial_data", "ultimo_aporte", false], ["Financeiro", "client_financial_data", "reserva_liquidez", false],
  ["Financeiro", "client_financial_data", "possui_imovel", false],
  ["Financeiro", "client_financial_data", "possui_carro", false],
  ["Financeiro", "client_financial_data", "possui_consorcio", false],
  ["Jornada", "client_journeys", "started_at", false], ["Jornada", "client_journeys", "current_stage_id", false],
  ["Reuniões", "client_meetings", "id", false],
  ["Reuniões", "client_meetings", "client_id", false],
  ["Reuniões", "client_meetings", "calendly_event_uri", true],
  ["Reuniões", "client_meetings", "event_name", true],
  ["Reuniões", "client_meetings", "start_time", false],
  ["Reuniões", "client_meetings", "end_time", false],
  ["Reuniões", "client_meetings", "host_email", true],
  ["Reuniões", "client_meetings", "manually_linked", false],
  ["Reuniões", "manual_meetings", "id", false],
  ["Reuniões", "manual_meetings", "client_id", false],
  ["Reuniões", "manual_meetings", "title", true],
  ["Reuniões", "manual_meetings", "start_time", false],
  ["Reuniões", "manual_meetings", "end_time", false],
  ["Reuniões", "manual_meetings", "google_event_id", true],
  ["Reuniões", "manual_meetings", "recurrence_group_id", true],
  ["Reuniões", "meeting_attendance", "calendly_event_uri", true],
  ["Reuniões", "meeting_attendance", "status", true],
  ["Reuniões", "meeting_attendance", "remarcado", false],
  ["Reuniões", "meeting_attendance", "created_at", false],
  ["Reuniões", "client_implementation_meeting_date", "client_id", false],
  ["Reuniões", "client_implementation_meeting_date", "meeting_date", false],
  ["Reuniões", "client_implementation_meeting_date", "source", true],
  ["Mecanismos", "client_mecanismos", "status", true], ["Mecanismos", "client_mecanismos", "implemented_at", false],
  ["Satisfação", "nps_responses", "score", false], ["Satisfação", "nps_responses", "submitted_at", false],
  ["Satisfação", "csat_responses", "score", false], ["Satisfação", "csat_responses", "submitted_at", false],
  ["Cancelamento", "cancellations", "client_id", false],
  ["Cancelamento", "cancellations", "motivo", true], ["Cancelamento", "cancellations", "motivo_categoria", false],
  ["Cancelamento", "cancellations", "churn_efetivado_at", false],
];

const FIELD_DESCRIPTIONS = {
  "clients.id": "Identificador técnico único do cliente",
  "clients.codigo": "Código de identificação do cliente na Quarta Via",
  "clients.name": "Nome do cliente",
  "clients.data_inicio_ciclo": "Data de início do vínculo ou ciclo do cliente",
  "clients.data_churn": "Data de churn registrada no cadastro do cliente",
  "clients.status": "Situação atual do cliente",
  "clients.segmentacao": "Segmento atribuído ao cliente",
  "clients.engenheiro_patrimonial": "Engenheiro Patrimonial responsável pelo acompanhamento",
  "cancellations.client_id": "Vínculo do cancelamento com o cliente",
  "cancellations.churn_efetivado_at": "Data em que o cancelamento foi efetivamente concluído",
  "client_financial_data.reserva_liquidez": "Reserva de liquidez informada pelo cliente",
  "client_financial_data.ultimo_aporte": "Valor do último aporte registrado",
  "client_financial_data.ultima_renda_mensal": "Última renda mensal registrada",
  "client_financial_data.possui_imovel": "Indica se o cliente possui imóvel",
  "client_financial_data.possui_carro": "Indica se o cliente possui carro",
  "client_financial_data.possui_consorcio": "Indica se o cliente possui consórcio",
  "client_meetings.start_time": "Data e horário de início da reunião",
  "client_meetings.end_time": "Data e horário de término da reunião",
  "client_meetings.calendly_event_uri": "Identificador externo do evento no Calendly",
  "client_meetings.event_name": "Título ou nome do evento de reunião",
  "client_meetings.host_email": "E-mail do anfitrião da reunião",
  "client_meetings.manually_linked": "Indica vínculo manual da reunião ao cliente",
  "client_meetings.client_id": "Cliente vinculado à reunião Calendly",
  "manual_meetings.title": "Título da reunião registrada manualmente",
  "manual_meetings.start_time": "Data e horário de início da reunião",
  "manual_meetings.client_id": "Cliente vinculado à reunião manual",
  "manual_meetings.google_event_id": "Identificador do evento no Google Calendar",
  "meeting_attendance.status": "Situação de presença ou realização da reunião",
  "meeting_attendance.remarcado": "Indica se a reunião foi remarcada",
  "meeting_attendance.calendly_event_uri": "Identificador externo do evento no Calendly",
  "client_implementation_meeting_date.meeting_date": "Data registrada para a reunião de implementação",
  "client_implementation_meeting_date.client_id": "Cliente com data de reunião de implementação",
  "client_implementation_meeting_date.source": "Origem do registro da reunião de implementação",
};

function configurationError() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return "Configuração do Supabase ausente no Netlify";
  try {
    if (new URL(process.env.SUPABASE_URL).protocol !== "https:") return "SUPABASE_URL deve usar HTTPS";
  } catch { return "SUPABASE_URL inválida"; }
  return null;
}

async function countRows(table, column, includeBlank = false) {
  const url = new URL(`/rest/v1/${table}`, process.env.SUPABASE_URL);
  const selectCol = table === "client_implementation_meeting_date" ? "client_id" : "id";
  url.searchParams.set("select", selectCol); url.searchParams.set("limit", "1");
  if (column) includeBlank ? url.searchParams.set("or", `(${column}.is.null,${column}.eq.)`) : url.searchParams.set(column, "is.null");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "public", Prefer: "count=exact", Range: "0-0" } });
  if (!response.ok) throw new Error(`${table}.${column || "*"}: HTTP ${response.status}`);
  const range = response.headers.get("content-range") || "*/0";
  return Number(range.slice(range.lastIndexOf("/") + 1));
}

function foldStatusToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeClientStatus(rawStatus) {
  const token = foldStatusToken(rawStatus);
  if (!token || token === "null" || token === "undefined" || token === "vazio") return "Não informado";
  if (["ativo", "active", "ativa"].includes(token)) return "Ativo";
  if (
    ["churn", "cancelado", "cancelada", "canceled", "cancelled", "encerrado", "encerrada", "inativo", "inativa", "inactive"].includes(token) ||
    token.includes("cancel") || token.includes("churn") || token.includes("encerr")
  ) return "Cancelado";
  if (
    ["congelado", "congelada", "freeze", "frozen", "pausado", "pausada"].includes(token) ||
    token.includes("congel") || token.includes("pausad")
  ) return "Congelado";
  return "Não informado";
}

async function fetchClientStatuses() {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL("/rest/v1/clients", process.env.SUPABASE_URL);
    url.searchParams.set("select", "status");
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) throw new Error(`clients.status consistency: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

function clientsStatusConsistency(rows) {
  const byNormalized = new Map();
  const distinctRaw = new Set();
  for (const row of rows) {
    const raw = row?.status == null || String(row.status).trim() === "" ? null : String(row.status);
    if (raw) distinctRaw.add(raw);
    const label = normalizeClientStatus(raw);
    if (!byNormalized.has(label)) byNormalized.set(label, new Set());
    if (raw) byNormalized.get(label).add(raw);
  }
  const notes = [...byNormalized.entries()]
    .filter(([, set]) => set.size > 1)
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, set]) => `${set.size} variações de escrita encontradas para o status ${label}.`);
  if (distinctRaw.size) {
    notes.unshift(`${distinctRaw.size} valores distintos encontrados na coluna original de status.`);
  }
  return {
    distinctRawValues: [...distinctRaw].sort((a, b) => a.localeCompare(b, "pt-BR")),
    distinctRawCount: distinctRaw.size,
    notes,
  };
}

export default async () => {
  const configError = configurationError();
  if (configError) return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const totals = new Map();
  const totalFor = (table) => { if (!totals.has(table)) totals.set(table, countRows(table)); return totals.get(table); };
  const settled = await Promise.allSettled(FIELDS.map(async ([domain, table, column, includeBlank]) => {
    const [totalRows, missingRows] = await Promise.all([totalFor(table), countRows(table, column, includeBlank)]);
    const item = { domain, table, column, totalRows, missingRows };
    const description = FIELD_DESCRIPTIONS[`${table}.${column}`];
    if (description) item.description = description;
    return item;
  }));
  const data = settled.filter((item) => item.status === "fulfilled").map((item) => item.value)
    .sort((a, b) => `${a.domain}.${a.table}.${a.column}`.localeCompare(`${b.domain}.${b.table}.${b.column}`));
  const errors = settled.filter((item) => item.status === "rejected")
    .map((item) => item.reason instanceof Error ? item.reason.message : "Falha desconhecida");
  try {
    const consistency = clientsStatusConsistency(await fetchClientStatuses());
    const statusField = data.find((item) => item.table === "clients" && item.column === "status");
    if (statusField) {
      statusField.consistencyNotes = consistency.notes;
      statusField.distinctRawValues = consistency.distinctRawValues;
      statusField.distinctRawCount = consistency.distinctRawCount;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Falha na consistência de status");
  }
  return Response.json({ data, errors, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
};
