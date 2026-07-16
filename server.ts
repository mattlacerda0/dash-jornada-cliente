const ROOT = import.meta.dir;

async function loadEnvFile(path: string) {
  if (!(await Bun.file(path).exists())) return;
  const contents = await Bun.file(path).text();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !Bun.env[key]) Bun.env[key] = value;
  }
}

await loadEnvFile(`${ROOT}/exemplo.env`);
await loadEnvFile(`${ROOT}/.env`);

if (Bun.env.SUPABASE_URL) process.env.SUPABASE_URL = Bun.env.SUPABASE_URL;
if (Bun.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = Bun.env.SUPABASE_SERVICE_ROLE_KEY;

const generalDataHandler = (await import("./netlify/functions/general-data.mjs")).default;
const onboardingHandler = (await import("./netlify/functions/onboarding.mjs")).default;
const meetingsHandler = (await import("./netlify/functions/meetings.mjs")).default;
const qualityHandler = (await import("./netlify/functions/quality.mjs")).default;
const patrimonialPlanHandler = (await import("./netlify/functions/patrimonial-plan.mjs")).default;

const PORT = Number(Bun.env.PORT || 4173);

type Field = [string, string, string, boolean];

const FIELD_DESCRIPTIONS: Record<string, string> = {
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

const FIELDS: Field[] = [
  ["Cliente", "clients", "id", false],
  ["Cliente", "clients", "codigo", true],
  ["Cliente", "clients", "qv_id", true],
  ["Cliente", "clients", "name", true],
  ["Cliente", "clients", "email", true],
  ["Cliente", "clients", "phone", true],
  ["Cliente", "clients", "created_at", false],
  ["Cliente", "clients", "data_inicio_ciclo", false],
  ["Cliente", "clients", "status", true],
  ["Cliente", "clients", "segmentacao", true],
  ["Cliente", "clients", "engenheiro_patrimonial", true],
  ["Cliente", "clients", "objetivo_principal", true],
  ["Cancelamento", "clients", "data_churn", false],
  ["Cancelamento", "clients", "motivo_churn", true],
  ["Financeiro", "client_financial_data", "ultima_renda_mensal", false],
  ["Financeiro", "client_financial_data", "ultimo_aporte", false],
  ["Financeiro", "client_financial_data", "reserva_liquidez", false],
  ["Financeiro", "client_financial_data", "possui_imovel", false],
  ["Financeiro", "client_financial_data", "possui_carro", false],
  ["Financeiro", "client_financial_data", "possui_consorcio", false],
  ["Jornada", "client_journeys", "started_at", false],
  ["Jornada", "client_journeys", "current_stage_id", false],
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
  ["Mecanismos", "client_mecanismos", "status", true],
  ["Mecanismos", "client_mecanismos", "implemented_at", false],
  ["Satisfação", "nps_responses", "score", false],
  ["Satisfação", "nps_responses", "submitted_at", false],
  ["Satisfação", "csat_responses", "score", false],
  ["Satisfação", "csat_responses", "submitted_at", false],
  ["Cancelamento", "cancellations", "client_id", false],
  ["Cancelamento", "cancellations", "motivo", true],
  ["Cancelamento", "cancellations", "motivo_categoria", false],
  ["Cancelamento", "cancellations", "churn_efetivado_at", false],
];

function configurationError(): string | null {
  if (!Bun.env.SUPABASE_URL || !Bun.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Configuração do Supabase ausente no servidor local";
  }
  try {
    const url = new URL(Bun.env.SUPABASE_URL);
    if (url.protocol !== "https:") return "SUPABASE_URL deve usar HTTPS";
  } catch {
    return "SUPABASE_URL inválida";
  }
  return null;
}

async function countRows(table: string, column?: string, includeBlank = false) {
  const url = new URL(`/rest/v1/${table}`, Bun.env.SUPABASE_URL!);
  const selectCol = table === "client_implementation_meeting_date" ? "client_id" : "id";
  url.searchParams.set("select", selectCol);
  url.searchParams.set("limit", "1");
  if (column) {
    if (includeBlank) url.searchParams.set("or", `(${column}.is.null,${column}.eq.)`);
    else url.searchParams.set(column, "is.null");
  }
  const key = Bun.env.SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "public",
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) throw new Error(`${table}.${column || "*"}: HTTP ${response.status}`);
  const range = response.headers.get("content-range") || "*/0";
  return Number(range.slice(range.lastIndexOf("/") + 1));
}

async function measure([domain, table, column, includeBlank]: Field) {
  const [totalRows, missingRows] = await Promise.all([
    countRows(table),
    countRows(table, column, includeBlank),
  ]);
  const item: Record<string, unknown> = { domain, table, column, totalRows, missingRows };
  const description = FIELD_DESCRIPTIONS[`${table}.${column}`];
  if (description) item.description = description;
  return item;
}

async function qualityResponse() {
  const configError = configurationError();
  if (configError) return Response.json({ error: configError }, { status: 503 });
  const settled = await Promise.allSettled(FIELDS.map(measure));
  const data = settled
    .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof measure>>> => item.status === "fulfilled")
    .map((item) => item.value)
    .sort((a, b) => `${a.domain}.${a.table}.${a.column}`.localeCompare(`${String(b.domain)}.${String(b.table)}.${String(b.column)}`));
  const errors = settled
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => item.reason instanceof Error ? item.reason.message : "Falha desconhecida");
  return Response.json({ data, errors, generatedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/quality") return qualityHandler();
    if (url.pathname === "/api/general-data") return generalDataHandler();
    if (url.pathname === "/api/onboarding") return onboardingHandler();
    if (url.pathname === "/api/meetings") return meetingsHandler();
    if (url.pathname === "/api/patrimonial-plan") return patrimonialPlanHandler();
    if (url.pathname !== "/" && url.pathname !== "/index.html") return new Response("Não encontrado", { status: 404 });
    return new Response(Bun.file(`${ROOT}/index.html`), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});

console.log(`Dashboard disponível em ${server.url}`);
const configError = configurationError();
if (configError) console.warn(configError);
