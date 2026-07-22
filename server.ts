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

if (Bun.env.AUTH_SUPABASE_URL) process.env.AUTH_SUPABASE_URL = Bun.env.AUTH_SUPABASE_URL;
if (Bun.env.AUTH_SUPABASE_ANON_KEY) process.env.AUTH_SUPABASE_ANON_KEY = Bun.env.AUTH_SUPABASE_ANON_KEY;
if (Bun.env.DATA_SUPABASE_URL) process.env.DATA_SUPABASE_URL = Bun.env.DATA_SUPABASE_URL;
if (Bun.env.DATA_SUPABASE_SERVICE_ROLE_KEY) process.env.DATA_SUPABASE_SERVICE_ROLE_KEY = Bun.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
if (Bun.env.N8N_CHAT_WEBHOOK_URL) process.env.N8N_CHAT_WEBHOOK_URL = Bun.env.N8N_CHAT_WEBHOOK_URL;
if (Bun.env.N8N_INTERNAL_API_TOKEN) process.env.N8N_INTERNAL_API_TOKEN = Bun.env.N8N_INTERNAL_API_TOKEN;

const generalDataHandler = (await import("./netlify/functions/general-data.mjs")).default;
const onboardingHandler = (await import("./netlify/functions/onboarding.mjs")).default;
const patrimonialPlanHandler = (await import("./netlify/functions/patrimonial-plan.mjs")).default;
const meetingsHandler = (await import("./netlify/functions/meetings.mjs")).default;
const mechanismsHandler = (await import("./netlify/functions/mechanisms.mjs")).default;
const financialUpdatesHandler = (await import("./netlify/functions/financial-updates.mjs")).default;
const supportHandler = (await import("./netlify/functions/support.mjs")).default;
const assistantHandler = (await import("./netlify/functions/assistant.mjs")).default;
const assistantDataHandler = (await import("./netlify/functions/assistant-data.mjs")).default;
const qualityHandler = (await import("./netlify/functions/quality.mjs")).default;
const authConfigHandler = (await import("./netlify/functions/auth-config.mjs")).default;
const platformUsageHandler = (await import("./netlify/functions/platform-usage.mjs")).default;

const PORT = Number(Bun.env.PORT || 4173);

type Field = [string, string, string, boolean];

const FIELD_DESCRIPTIONS: Record<string, string> = {
  "clients.id": "Identificador tÃ©cnico Ãºnico do cliente",
  "clients.codigo": "CÃ³digo de identificaÃ§Ã£o do cliente na Quarta Via",
  "clients.name": "Nome do cliente",
  "clients.data_inicio_ciclo": "Data de inÃ­cio do vÃ­nculo ou ciclo do cliente",
  "clients.data_churn": "Data de churn registrada no cadastro do cliente",
  "clients.status": "SituaÃ§Ã£o atual do cliente",
  "clients.segmentacao": "Segmento atribuÃ­do ao cliente",
  "clients.engenheiro_patrimonial": "Engenheiro Patrimonial responsÃ¡vel pelo acompanhamento",
  "cancellations.client_id": "VÃ­nculo do cancelamento com o cliente",
  "cancellations.churn_efetivado_at": "Data em que o cancelamento foi efetivamente concluÃ­do",
  "client_financial_data.reserva_liquidez": "Reserva de liquidez informada pelo cliente",
  "client_financial_data.ultimo_aporte": "Valor do Ãºltimo aporte registrado",
  "client_financial_data.ultima_renda_mensal": "Ãšltima renda mensal registrada",
  "client_financial_data.possui_imovel": "Indica se o cliente possui imÃ³vel",
  "client_financial_data.possui_carro": "Indica se o cliente possui carro",
  "client_financial_data.possui_consorcio": "Indica se o cliente possui consÃ³rcio",
  "client_meetings.start_time": "Data e horÃ¡rio de inÃ­cio da reuniÃ£o",
  "client_meetings.end_time": "Data e horÃ¡rio de tÃ©rmino da reuniÃ£o",
  "client_meetings.calendly_event_uri": "Identificador externo do evento no Calendly",
  "client_meetings.event_name": "TÃ­tulo ou nome do evento de reuniÃ£o",
  "client_meetings.host_email": "E-mail do anfitriÃ£o da reuniÃ£o",
  "client_meetings.manually_linked": "Indica vÃ­nculo manual da reuniÃ£o ao cliente",
  "client_meetings.client_id": "Cliente vinculado Ã  reuniÃ£o Calendly",
  "manual_meetings.title": "TÃ­tulo da reuniÃ£o registrada manualmente",
  "manual_meetings.start_time": "Data e horÃ¡rio de inÃ­cio da reuniÃ£o",
  "manual_meetings.client_id": "Cliente vinculado Ã  reuniÃ£o manual",
  "manual_meetings.google_event_id": "Identificador do evento no Google Calendar",
  "meeting_attendance.status": "SituaÃ§Ã£o de presenÃ§a ou realizaÃ§Ã£o da reuniÃ£o",
  "meeting_attendance.remarcado": "Indica se a reuniÃ£o foi remarcada",
  "meeting_attendance.calendly_event_uri": "Identificador externo do evento no Calendly",
  "client_implementation_meeting_date.meeting_date": "Data registrada para a reuniÃ£o de implementaÃ§Ã£o",
  "client_implementation_meeting_date.client_id": "Cliente com data de reuniÃ£o de implementaÃ§Ã£o",
  "client_implementation_meeting_date.source": "Origem do registro da reuniÃ£o de implementaÃ§Ã£o",
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
  ["ReuniÃµes", "client_meetings", "id", false],
  ["ReuniÃµes", "client_meetings", "client_id", false],
  ["ReuniÃµes", "client_meetings", "calendly_event_uri", true],
  ["ReuniÃµes", "client_meetings", "event_name", true],
  ["ReuniÃµes", "client_meetings", "start_time", false],
  ["ReuniÃµes", "client_meetings", "end_time", false],
  ["ReuniÃµes", "client_meetings", "host_email", true],
  ["ReuniÃµes", "client_meetings", "manually_linked", false],
  ["ReuniÃµes", "manual_meetings", "id", false],
  ["ReuniÃµes", "manual_meetings", "client_id", false],
  ["ReuniÃµes", "manual_meetings", "title", true],
  ["ReuniÃµes", "manual_meetings", "start_time", false],
  ["ReuniÃµes", "manual_meetings", "end_time", false],
  ["ReuniÃµes", "manual_meetings", "google_event_id", true],
  ["ReuniÃµes", "manual_meetings", "recurrence_group_id", true],
  ["ReuniÃµes", "meeting_attendance", "calendly_event_uri", true],
  ["ReuniÃµes", "meeting_attendance", "status", true],
  ["ReuniÃµes", "meeting_attendance", "remarcado", false],
  ["ReuniÃµes", "meeting_attendance", "created_at", false],
  ["ReuniÃµes", "client_implementation_meeting_date", "client_id", false],
  ["ReuniÃµes", "client_implementation_meeting_date", "meeting_date", false],
  ["ReuniÃµes", "client_implementation_meeting_date", "source", true],
  ["Mecanismos", "client_mecanismos", "status", true],
  ["Mecanismos", "client_mecanismos", "implemented_at", false],
  ["SatisfaÃ§Ã£o", "nps_responses", "score", false],
  ["SatisfaÃ§Ã£o", "nps_responses", "submitted_at", false],
  ["SatisfaÃ§Ã£o", "csat_responses", "score", false],
  ["SatisfaÃ§Ã£o", "csat_responses", "submitted_at", false],
  ["Cancelamento", "cancellations", "client_id", false],
  ["Cancelamento", "cancellations", "motivo", true],
  ["Cancelamento", "cancellations", "motivo_categoria", false],
  ["Cancelamento", "cancellations", "churn_efetivado_at", false],
];

function configurationError(): string | null {
  if (!Bun.env.DATA_SUPABASE_URL || !Bun.env.DATA_SUPABASE_SERVICE_ROLE_KEY) {
    return "Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY.";
  }
  try {
    const url = new URL(Bun.env.DATA_SUPABASE_URL);
    if (url.protocol !== "https:") return "DATA_SUPABASE_URL deve usar HTTPS";
  } catch {
    return "DATA_SUPABASE_URL invÃ¡lida";
  }
  return null;
}

async function countRows(table: string, column?: string, includeBlank = false) {
  const url = new URL(`/rest/v1/${table}`, Bun.env.DATA_SUPABASE_URL!);
  const selectCol = table === "client_implementation_meeting_date" ? "client_id" : "id";
  url.searchParams.set("select", selectCol);
  url.searchParams.set("limit", "1");
  if (column) {
    if (includeBlank) url.searchParams.set("or", `(${column}.is.null,${column}.eq.)`);
    else url.searchParams.set(column, "is.null");
  }
  const key = Bun.env.DATA_SUPABASE_SERVICE_ROLE_KEY!;
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
    if (url.pathname === "/api/auth-config") return authConfigHandler(request);
    if (url.pathname === "/api/quality") return qualityHandler(request);
    if (url.pathname === "/api/general-data") return generalDataHandler(request);
    if (url.pathname === "/api/onboarding") return onboardingHandler(request);
    if (url.pathname === "/api/patrimonial-plan") return patrimonialPlanHandler(request);
    if (url.pathname === "/api/meetings") return meetingsHandler(request);
    if (url.pathname === "/api/mechanisms") return mechanismsHandler(request);
    if (url.pathname === "/api/financial-updates") return financialUpdatesHandler(request);
    if (url.pathname === "/api/platform-usage") return platformUsageHandler(request);
    if (url.pathname === "/api/support") return supportHandler(request);
    if (url.pathname === "/api/assistant") return assistantHandler(request);
    if (url.pathname === "/api/assistant-data") return assistantDataHandler(request);
    if (url.pathname.startsWith("/js/")) {
      const file = Bun.file(`${ROOT}${url.pathname}`);
      if (await file.exists()) {
        const type = url.pathname.endsWith('.mjs') || url.pathname.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : 'application/octet-stream';
        return new Response(file, { headers: { 'Content-Type': type } });
      }
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") return new Response("NÃ£o encontrado", { status: 404 });
    return new Response(Bun.file(`${ROOT}/index.html`), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});

console.log(`Dashboard disponÃ­vel em ${server.url}`);
const configError = configurationError();
if (configError) console.warn(configError);
