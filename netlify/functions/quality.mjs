const FIELDS = [
  ["Cliente", "clients", "qv_id", true], ["Cliente", "clients", "name", true],
  ["Cliente", "clients", "email", true], ["Cliente", "clients", "phone", true],
  ["Cliente", "clients", "created_at", false], ["Cliente", "clients", "status", true],
  ["Cliente", "clients", "segmentacao", true], ["Cliente", "clients", "engenheiro_patrimonial", true],
  ["Cliente", "clients", "objetivo_principal", true], ["Cancelamento", "clients", "data_churn", false],
  ["Cancelamento", "clients", "motivo_churn", true], ["Financeiro", "client_financial_data", "ultima_renda_mensal", false],
  ["Financeiro", "client_financial_data", "ultimo_aporte", false], ["Financeiro", "client_financial_data", "reserva_liquidez", false],
  ["Jornada", "client_journeys", "started_at", false], ["Jornada", "client_journeys", "current_stage_id", false],
  ["Reuniões", "client_meetings", "start_time", false], ["Reuniões", "client_meetings", "event_name", true],
  ["Mecanismos", "client_mecanismos", "status", true], ["Mecanismos", "client_mecanismos", "implemented_at", false],
  ["Satisfação", "nps_responses", "score", false], ["Satisfação", "nps_responses", "submitted_at", false],
  ["Satisfação", "csat_responses", "score", false], ["Satisfação", "csat_responses", "submitted_at", false],
  ["Cancelamento", "cancellations", "motivo", true], ["Cancelamento", "cancellations", "motivo_categoria", false],
  ["Cancelamento", "cancellations", "churn_efetivado_at", false],
];

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
    return { domain, table, column, totalRows, missingRows };
  }));
  const data = settled.filter((item) => item.status === "fulfilled").map((item) => item.value)
    .sort((a, b) => `${a.domain}.${a.table}.${a.column}`.localeCompare(`${b.domain}.${b.table}.${b.column}`));
  const errors = settled.filter((item) => item.status === "rejected")
    .map((item) => item.reason instanceof Error ? item.reason.message : "Falha desconhecida");
  return Response.json({ data, errors, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
};
