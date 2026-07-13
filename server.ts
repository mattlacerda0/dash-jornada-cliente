const ROOT = import.meta.dir;
const ENV_PATH = `${ROOT}/exemplo.env`;

if (await Bun.file(ENV_PATH).exists()) {
  const contents = await Bun.file(ENV_PATH).text();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !Bun.env[key]) Bun.env[key] = value;
  }
}

const PORT = Number(Bun.env.PORT || 4173);

type Field = [string, string, string, boolean];

const FIELDS: Field[] = [
  ["Cliente", "clients", "qv_id", true],
  ["Cliente", "clients", "name", true],
  ["Cliente", "clients", "email", true],
  ["Cliente", "clients", "phone", true],
  ["Cliente", "clients", "created_at", false],
  ["Cliente", "clients", "status", true],
  ["Cliente", "clients", "segmentacao", true],
  ["Cliente", "clients", "engenheiro_patrimonial", true],
  ["Cliente", "clients", "objetivo_principal", true],
  ["Cancelamento", "clients", "data_churn", false],
  ["Cancelamento", "clients", "motivo_churn", true],
  ["Financeiro", "client_financial_data", "ultima_renda_mensal", false],
  ["Financeiro", "client_financial_data", "ultimo_aporte", false],
  ["Financeiro", "client_financial_data", "reserva_liquidez", false],
  ["Jornada", "client_journeys", "started_at", false],
  ["Jornada", "client_journeys", "current_stage_id", false],
  ["Reuniões", "client_meetings", "start_time", false],
  ["Reuniões", "client_meetings", "event_name", true],
  ["Mecanismos", "client_mecanismos", "status", true],
  ["Mecanismos", "client_mecanismos", "implemented_at", false],
  ["Satisfação", "nps_responses", "score", false],
  ["Satisfação", "nps_responses", "submitted_at", false],
  ["Satisfação", "csat_responses", "score", false],
  ["Satisfação", "csat_responses", "submitted_at", false],
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
  url.searchParams.set("select", "id");
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
  return { domain, table, column, totalRows, missingRows };
}

async function qualityResponse() {
  const configError = configurationError();
  if (configError) return Response.json({ error: configError }, { status: 503 });
  const settled = await Promise.allSettled(FIELDS.map(measure));
  const data = settled
    .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof measure>>> => item.status === "fulfilled")
    .map((item) => item.value)
    .sort((a, b) => `${a.domain}.${a.table}.${a.column}`.localeCompare(`${b.domain}.${b.table}.${b.column}`));
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
    if (url.pathname === "/api/quality") return qualityResponse();
    if (url.pathname !== "/" && url.pathname !== "/index.html") return new Response("Não encontrado", { status: 404 });
    return new Response(Bun.file(`${ROOT}/index.html`), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});

console.log(`Dashboard disponível em ${server.url}`);
const configError = configurationError();
if (configError) console.warn(configError);
