/**
 * Paridade obrigatória: dashboard Mecanismos vs chatbot (diferença = 0).
 * Não executa Git.
 */
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
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const { computeMechanismsPayload } = await import("./netlify/functions/mechanisms.mjs");
const { computeOnboardingPayload } = await import("./netlify/functions/onboarding.mjs");
const {
  planSemanticQuery,
  emptyConversationContext,
  mergeConversationContext,
} = await import("./netlify/functions/_shared/portal-metric-catalog.mjs");
const { executeMetricQuery, verbalizeMetricResult } = await import("./netlify/functions/_shared/metric-executor.mjs");
const { resolveMetricFromDashboard } = await import("./netlify/functions/_shared/portal-metric-registry.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function nearlyEqual(a, b) {
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

const dash = await computeMechanismsPayload();
const journey = await computeOnboardingPayload();
const s = dash.summary;

console.log("\n=== Dashboard Mecanismos (fonte de verdade) ===");
console.log({
  clientsWithMechanisms: s.clientsWithMechanisms,
  typesUsed: s.typesUsed,
  typesUnused: s.typesUnused,
  availableMechanisms: s.availableMechanisms,
  implementedMechanisms: s.implementedMechanisms,
  inProgressMechanisms: s.inProgressMechanisms,
  eligibleMechanisms: s.eligibleMechanisms,
  implementationPercent: s.implementationPercent,
  typicalDaysToFirstImplementation: s.typicalDaysToFirstImplementation,
  averageDaysToFirstImplementation: s.averageDaysToFirstImplementation,
  sample: s.daysToFirstStats?.validCount,
  recent: s.clientsWithRecentImplementation,
  journeyAverageFirstImplementationDays: journey.summary?.averageFirstImplementationDays,
});

const metricMap = [
  ["clients_with_mechanisms", s.clientsWithMechanisms],
  ["types_used", s.typesUsed],
  ["types_unused", s.typesUnused],
  ["implemented_mechanisms", s.implementedMechanisms],
  ["in_progress_mechanisms", s.inProgressMechanisms],
  ["eligible_mechanisms", s.eligibleMechanisms],
  ["implementation_rate", s.implementationPercent],
  ["median_days_to_first_implementation", s.typicalDaysToFirstImplementation],
  ["average_days_to_first_implementation", s.averageDaysToFirstImplementation],
  ["clients_with_recent_implementation", s.clientsWithRecentImplementation],
];

console.log("\n| Métrica | Dashboard | Chatbot | Diferença |");
console.log("|---|---:|---:|---:|");
let allOk = true;
for (const [metricId, dashboardValue] of metricMap) {
  const resolved = await resolveMetricFromDashboard("mechanisms", metricId, {}, { payload: dash });
  const chatbot = resolved.value;
  const diff = typeof dashboardValue === "number" && typeof chatbot === "number"
    ? Math.abs(dashboardValue - chatbot)
    : (dashboardValue === chatbot ? 0 : "≠");
  const ok = nearlyEqual(dashboardValue, chatbot);
  if (!ok) allOk = false;
  console.log(`| ${metricId} | ${dashboardValue} | ${chatbot} | ${diff} | ${ok ? "OK" : "XX"}`);
}

assert(allOk, "Paridade registry × dashboard falhou");

// Auditoria: 179.6 NÃO pode ser o valor do card Mecanismos
const journeyAvg = journey.summary?.averageFirstImplementationDays;
assert(
  !nearlyEqual(s.typicalDaysToFirstImplementation, journeyAvg),
  "Mediana Mecanismos não deve coincidir com média Jornada (auditoria)",
);
assert(
  !nearlyEqual(s.averageDaysToFirstImplementation, journeyAvg),
  "Média Mecanismos não deve coincidir com média Jornada (causa do bug 179.6)",
);

const portalMech = { current_page: "mechanisms" };
let ctx = emptyConversationContext();

async function ask(q, context = ctx, page = portalMech) {
  const plan = planSemanticQuery(q, context, page);
  const exec = await executeMetricQuery({ ...plan, _questionNorm: q }, { payload: dash });
  ctx = mergeConversationContext(context, plan.conversation_context);
  return { plan, exec, text: verbalizeMetricResult({ ...plan, _questionNorm: q }, exec) };
}

console.log("\n=== Testes específicos do erro atual ===");

{
  const { plan, exec, text } = await ask("Qual o tempo típico até a primeira implementação?");
  assert(plan.metric === "median_days_to_first_implementation", `metric=${plan.metric}`);
  assert(nearlyEqual(exec.value, s.typicalDaysToFirstImplementation), `value=${exec.value}`);
  assert(/159|típico|tipico|dias/i.test(text), text);
  console.log("PASS 1 típico →", exec.value, text);
}

{
  const { plan, exec, text } = await ask("Qual é a média até a primeira implementação?", emptyConversationContext());
  assert(plan.metric === "average_days_to_first_implementation", `metric=${plan.metric}`);
  assert(nearlyEqual(exec.value, s.averageDaysToFirstImplementation), `value=${exec.value}`);
  assert(!nearlyEqual(exec.value, journeyAvg), "não pode ser média da Jornada");
  console.log("PASS 2 média →", exec.value, text);
}

{
  const { plan, exec } = await ask("Qual é a mediana?", ctx);
  assert(plan.metric === "median_days_to_first_implementation" || plan.metric === ctx.last_metric, plan.metric);
  assert(nearlyEqual(
    typeof exec.value === "object" ? exec.value.median : exec.value,
    s.typicalDaysToFirstImplementation,
  ), `value=${JSON.stringify(exec.value)}`);
  console.log("PASS 3 mediana follow-up →", exec.value);
}

{
  const { plan, exec, text } = await ask("Como é calculado?", ctx);
  assert(["formula", "definition"].includes(plan.intent), plan.intent);
  assert(exec.value == null, `value=${exec.value}`);
  assert(/mediana|contrat|implement/i.test(text), text);
  assert(!/179/.test(text), text);
  console.log("PASS 4 regra →", text.slice(0, 120));
}

{
  const { plan, exec, text } = await ask("Qual é a média e a mediana?", ctx);
  assert(plan.intent === "comparison", plan.intent);
  const med = exec.value?.median ?? exec.median;
  const avg = exec.value?.average ?? exec.average;
  assert(nearlyEqual(med, s.typicalDaysToFirstImplementation), `med=${med}`);
  assert(nearlyEqual(avg, s.averageDaysToFirstImplementation), `avg=${avg}`);
  console.log("PASS 5 comparison →", text);
}

{
  const { plan, exec } = await ask(
    "Qual é a média até o primeiro mecanismo?",
    emptyConversationContext(),
    { current_page: "mechanisms" },
  );
  assert(plan.domain === "mechanisms", plan.domain);
  assert(plan.metric === "average_days_to_first_implementation", plan.metric);
  assert(nearlyEqual(exec.value, s.averageDaysToFirstImplementation), exec.value);
  console.log("PASS 6 média 1º mecanismo (página Mecanismos) →", exec.value);
}

console.log("\nDiferença permitida: 0 — CONFIRMADO");
console.log("Nenhum comando Git foi executado.");
