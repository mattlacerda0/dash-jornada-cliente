import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const { resolvePortalContext } = await import("./netlify/functions/_shared/portal-query.mjs");
const { computeGeneralDataPayload } = await import("./netlify/functions/general-data.mjs");
const { computeMeetingsPayload } = await import("./netlify/functions/meetings.mjs");

const g = await computeGeneralDataPayload();
const m = await computeMeetingsPayload();
const segCount = (label) => (g.distributions.segments.find((s) => s.label === label)?.count ?? 0);

async function val(q) {
  const r = await resolvePortalContext(q);
  return r.dados_contexto?.value ?? null;
}

const rows = [
  ["active_clients", await val("quantos clientes ativos"), g.summary.activeClients],
  ["cancelled_clients", await val("quantos clientes cancelados"), g.summary.cancelledClients],
  ["total_clients", await val("quantos clientes temos"), g.summary.totalClients],
  ["apex_clients (todos)", await val("quantos clientes apex"), segCount("APEX")],
  ["total_meetings", await val("quantas reunioes"), m.summary.totalMeetings],
  ["no_show_meetings", await val("quantos no-shows"), m.summary.totalNoShows],
  ["attendance_rate", await val("qual a taxa de comparecimento"), m.summary.attendanceRate],
];

let ok = true;
console.log("\nParidade chatbot (sem filtro) x payload do dashboard:");
for (const [name, chatbot, dashboard] of rows) {
  const match = chatbot === dashboard;
  if (!match) ok = false;
  console.log(`  ${match ? "OK " : "XX "} ${name}: chatbot=${chatbot} | dashboard=${dashboard}`);
}
console.log(ok ? "\nTodos os indicadores batem com o dashboard." : "\nDIVERGÊNCIA detectada.");
