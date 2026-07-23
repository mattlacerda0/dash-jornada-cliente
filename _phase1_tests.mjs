/**
 * Testes Fase 1 — planejador local + executor (sem n8n).
 * Compara bot versus payloads dos dashboards.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const {
  resolvePortalQuestion,
  localPlanToQueryPlan,
  validateQueryPlan,
  executePortalQuery,
} = await import("./netlify/functions/_shared/portal-query.mjs");
const { computeGeneralDataPayload } = await import("./netlify/functions/general-data.mjs");
const { computeMeetingsPayload } = await import("./netlify/functions/meetings.mjs");
const { computeOnboardingPayload } = await import("./netlify/functions/onboarding.mjs");

const NOW = new Date();

async function runQuestion(q) {
  const local = resolvePortalQuestion(q, NOW);
  const qp = localPlanToQueryPlan(local);
  const validated = validateQueryPlan(qp);
  if (!validated.ok && !validated.pending) {
    return { intent: local.intent, plan: validated.plan, result: null, clarification: validated.clarification, local };
  }
  if (validated.skipExecute || local.intent === "rule" || local.intent === "location") {
    return { intent: local.intent, plan: validated.plan, result: null, rule: true, local };
  }
  if (validated.pending) {
    return { intent: local.intent, plan: validated.plan, result: null, pending: true, warnings: validated.warnings, local };
  }
  const result = await executePortalQuery(validated.plan, NOW, { question: q, engineerToken: local._engineerToken });
  return { intent: local.intent, plan: validated.plan, result, local };
}

const questions = [
  "Quantos clientes ativos temos?",
  "Quantos clientes cancelados possuem dados financeiros?",
  "Quantos clientes APEX ativos temos?",
  "Qual a renda típica dos clientes PRIVATE?",
  "Qual o total de no-shows do último mês?",
  "Qual a taxa de comparecimento nos últimos 30 dias?",
  "Quantos clientes não fizeram a primeira reunião?",
  "Quantos clientes concluíram onboarding?",
  "Como é calculada a média até o primeiro mecanismo?",
  "Onde fica a renda mensal?",
  "Quantos clientes cancelados possuem dados financeiros e qual é a regra?",
  "Dados do Gabriel",
];

console.log("========== TESTES FASE 1 ==========\n");
for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  const r = await runQuestion(q);
  const v = r.result?.value;
  const amb = r.clarification || r.result?.ambiguities || r.local?.ambiguities;
  console.log(`[${i + 1}] ${q}`);
  console.log(`    intent=${r.intent} domain=${r.plan?.domain || r.local?.domain || "-"} metric=${r.plan?.metric || r.local?.metric || "-"} value=${v ?? (r.rule ? "(regra)" : r.pending ? "(pending)" : "null")}`);
  if (r.result?.filter_labels?.length) console.log(`    filtros: ${r.result.filter_labels.join(" | ")}`);
  if (amb?.length) console.log(`    esclarecimento: ${Array.isArray(amb) ? amb.join(" | ") : amb}`);
  if (r.result?.warnings?.length) console.log(`    warnings: ${r.result.warnings.join(" | ")}`);
  console.log("");
}

// Comparação bot vs dashboard
console.log("========== COMPARAÇÃO BOT vs DASHBOARD ==========\n");
const g = await computeGeneralDataPayload();
const m = await computeMeetingsPayload();
const o = await computeOnboardingPayload();

const cancelledWithFin = g.clients.filter((c) => c.analyticalStatus === "Cancelado" && c.hasFinancialProfile).length;
const apexActive = g.clients.filter((c) => c.segmentLabel === "APEX" && c.analyticalStatus === "Ativo").length;
const privateIncome = (() => {
  const rows = g.clients.filter((c) => c.segmentLabel === "PRIVATE");
  const vals = rows.map((c) => c.monthlyIncome).filter((v) => v != null);
  // use same measureBundle via execute
  return null;
})();

const comparisons = [];

async function cmp(name, question, dashboardValue) {
  const r = await runQuestion(question);
  const bot = r.result?.value ?? null;
  const ok = bot === dashboardValue;
  comparisons.push({ name, dashboardValue, bot, ok });
  console.log(`| ${name} | ${dashboardValue} | ${bot} | ${ok ? "OK" : "XX"} |`);
}

console.log("| Cenário | Dashboard | Bot | Resultado |");
console.log("|---|---:|---:|---|");
await cmp("Clientes ativos", "Quantos clientes ativos temos?", g.summary.activeClients);
await cmp("Cancelados com dados financeiros", "Quantos clientes cancelados possuem dados financeiros?", cancelledWithFin);
await cmp("APEX ativos", "Quantos clientes APEX ativos temos?", apexActive);
const renda = await runQuestion("Qual a renda típica dos clientes PRIVATE?");
const privRows = g.clients.filter((c) => c.segmentLabel === "PRIVATE");
const { measureBundle } = await import("./netlify/functions/general-data.mjs");
const dashRenda = measureBundle("monthlyIncome", privRows.map((c) => c.monthlyIncome).filter((v) => v != null)).displayValue;
comparisons.push({ name: "Renda típica PRIVATE", dashboardValue: dashRenda, bot: renda.result?.value ?? null, ok: (renda.result?.value ?? null) === dashRenda });
console.log(`| Renda típica PRIVATE | ${dashRenda} | ${renda.result?.value ?? null} | ${(renda.result?.value ?? null) === dashRenda ? "OK" : "XX"} |`);

const noShowLast = await runQuestion("Qual o total de no-shows do último mês?");
console.log(`| No-shows último mês | (filtro dashboard) | ${noShowLast.result?.value ?? null} | — |`);

const rate30 = await runQuestion("Qual a taxa de comparecimento nos últimos 30 dias?");
console.log(`| Taxa comparecimento 30d | (filtro dashboard) | ${rate30.result?.value ?? null} | — |`);

const withoutFirst = m.clients.filter((c) => c.firstMeetingCompleted === false).length;
await cmp("Sem primeira reunião", "Quantos clientes não fizeram a primeira reunião?", withoutFirst);
await cmp("Concluíram onboarding", "Quantos clientes concluíram onboarding?", o.summary.completedOnboarding);

const allOk = comparisons.every((c) => c.ok);
console.log(allOk ? "\n>>> Comparações diretas OK." : "\n>>> Há divergências nas comparações diretas.");
