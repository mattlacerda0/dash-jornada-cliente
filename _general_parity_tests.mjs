/**
 * Fase 1 — paridade Dados Gerais (diferença 0) + perguntas obrigatórias.
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

const { computeGeneralDataPayload } = await import("./netlify/functions/general-data.mjs");
const {
  planSemanticQuery,
  emptyConversationContext,
  mergeConversationContext,
  matchMetricDeterministically,
} = await import("./netlify/functions/_shared/portal-metric-catalog.mjs");
const { executeMetricQuery, verbalizeMetricResult } = await import("./netlify/functions/_shared/metric-executor.mjs");
const { resolveMetricFromDashboard } = await import("./netlify/functions/_shared/portal-metric-registry.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b) {
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

const dash = await computeGeneralDataPayload();
const s = dash.summary;
const seg = (label) => dash.distributions.segments.find((x) => x.label === label)?.count ?? 0;

const metricMap = [
  ["total_clients", s.totalClients],
  ["active_clients", s.activeClients],
  ["cancelled_clients", s.cancelledClients],
  ["frozen_clients", s.frozenClients],
  ["median_stay_days", s.typicalStayDays],
  ["median_liquidity_reserve", s.typicalLiquidityReserve],
  ["median_last_contribution", s.typicalLastContribution],
  ["median_monthly_income", s.typicalMonthlyIncome],
  ["clients_with_financial_data", s.clientsWithFinancialProfile],
  ["apex_clients", seg("APEX")],
  ["private_clients", seg("PRIVATE")],
  ["principal_clients", seg("PRINCIPAL")],
  ["debts_clients", seg("DEBTS")],
  ["over_clients", seg("OVER")],
  ["insufficient_segment_data", seg("Dados insuficientes")],
];

console.log("\n| Métrica | Dashboard | Bot | Diferença |");
console.log("|---|---:|---:|---:|");
let allOk = true;
for (const [metricId, dashboardValue] of metricMap) {
  const resolved = await resolveMetricFromDashboard("general", metricId, {}, { payload: dash });
  const bot = resolved.value;
  const diff = typeof dashboardValue === "number" && typeof bot === "number"
    ? Math.abs(dashboardValue - bot)
    : (dashboardValue === bot ? 0 : "≠");
  const ok = eq(dashboardValue, bot);
  if (!ok) allOk = false;
  console.log(`| ${metricId} | ${dashboardValue} | ${bot} | ${diff} | ${ok ? "OK" : "XX"}`);
}
assert(allOk, "Paridade Dados Gerais falhou");

const page = { current_page: "general" };
let ctx = emptyConversationContext();

async function ask(q, context = ctx) {
  const plan = planSemanticQuery(q, context, page);
  assert(plan.intent !== "clarification", `clarification for "${q}": ${plan.clarification}`);
  assert(plan.metric, `no metric for "${q}"`);
  const exec = await executeMetricQuery({ ...plan, _questionNorm: q }, { payload: dash });
  const text = verbalizeMetricResult({ ...plan, _questionNorm: q }, exec);
  ctx = mergeConversationContext(context, plan.conversation_context);
  return { plan, exec, text };
}

console.log("\n=== Perguntas obrigatórias ===");

{
  const { plan, exec, text } = await ask("qual a renda mensal típica?");
  assert(plan.metric === "median_monthly_income", plan.metric);
  assert(eq(exec.value, s.typicalMonthlyIncome), exec.value);
  assert(/40\.?000|40000/.test(String(exec.value)) || /R\$\s*40/.test(text), text);
  console.log("PASS 1 renda típica →", text);
}

{
  const { plan, exec, text } = await ask("quantos clientes com diagnóstico financeiro?", emptyConversationContext());
  assert(plan.metric === "clients_with_financial_data", plan.metric);
  assert(eq(exec.value, s.clientsWithFinancialProfile), exec.value);
  console.log("PASS 2 diagnóstico →", text);
}

{
  const { plan, exec, text } = await ask("qual o total de clientes?", emptyConversationContext());
  assert(plan.metric === "total_clients", plan.metric);
  assert(eq(exec.value, s.totalClients), exec.value);
  console.log("PASS 3 total →", text);
}

{
  const { plan, exec, text } = await ask("quantos clientes ativos?", emptyConversationContext());
  assert(plan.metric === "active_clients", plan.metric);
  assert(eq(exec.value, s.activeClients), exec.value);
  console.log("PASS 4 ativos →", text);
}

{
  const { plan, exec, text } = await ask("quantos clientes cancelados?", emptyConversationContext());
  assert(plan.metric === "cancelled_clients", plan.metric);
  assert(eq(exec.value, s.cancelledClients), exec.value);
  console.log("PASS 5 cancelados →", text);
}

{
  const { plan, exec, text } = await ask("qual a reserva de liquidez típica?", emptyConversationContext());
  assert(plan.metric === "median_liquidity_reserve", plan.metric);
  assert(eq(exec.value, s.typicalLiquidityReserve), exec.value);
  console.log("PASS 6 reserva →", text);
}

{
  const { plan, exec, text } = await ask("qual o último aporte típico?", emptyConversationContext());
  assert(plan.metric === "median_last_contribution", plan.metric);
  assert(eq(exec.value, s.typicalLastContribution), exec.value);
  console.log("PASS 7 aporte →", text);
}

{
  ctx = emptyConversationContext();
  const { plan, exec, text } = await ask("como é calculada a renda mensal típica?");
  assert(["formula", "definition"].includes(plan.intent), plan.intent);
  assert(exec.value == null, exec.value);
  assert(/mediana|renda/i.test(text), text);
  console.log("PASS 8 regra →", text.slice(0, 100));
}

{
  const { plan, exec, text } = await ask("onde fica a renda mensal?", ctx);
  assert(plan.intent === "location", plan.intent);
  assert(/client_financial_data|ultima_renda_mensal/i.test(text), text);
  console.log("PASS 9 fonte →", text);
}

{
  // contexto após renda típica
  ctx = emptyConversationContext();
  await ask("qual a renda mensal típica?");
  const { plan, exec, text } = await ask("qual a média?");
  assert(plan.metric === "median_monthly_income", plan.metric);
  assert(plan.intent === "average" || plan.aggregation === "average", plan.intent);
  assert(eq(exec.value, s.averageMonthlyIncome), `avg=${exec.value} expected=${s.averageMonthlyIncome}`);
  console.log("PASS 10 média no contexto →", text);
}

// Determinístico sem página
for (const q of [
  "qual a renda mensal típica?",
  "quantos clientes com diagnóstico financeiro?",
  "qual o total de clientes?",
]) {
  const det = matchMetricDeterministically(q, "general");
  assert(det?.confidence === 1 && det.metric, `det fail: ${q} → ${JSON.stringify(det)}`);
}

console.log("\nDiferença permitida: 0 — CONFIRMADO");
console.log("Nenhum comando Git foi executado.");
