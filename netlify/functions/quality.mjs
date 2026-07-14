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
  ["Reuniões", "client_meetings", "start_time", false], ["Reuniões", "client_meetings", "event_name", true],
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
  url.searchParams.set("select", "id"); url.searchParams.set("limit", "1");
  if (column) includeBlank ? url.searchParams.set("or", `(${column}.is.null,${column}.eq.)`) : url.searchParams.set(column, "is.null");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "public", Prefer: "count=exact", Range: "0-0" } });
  if (!response.ok) throw new Error(`${table}.${column || "*"}: HTTP ${response.status}`);
  const range = response.headers.get("content-range") || "*/0";
  return Number(range.slice(range.lastIndexOf("/") + 1));
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
  return Response.json({ data, errors, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
};
