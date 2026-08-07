/**
 * Verifica matriz NPS (heatmap) + matriz geral só Spearman.
 * Sem Git. Sem alteração de banco.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildNpsComparativeMatrix } from "../netlify/functions/_shared/sc-client-insights.mjs";
import { buildCorrelationMatrix } from "../netlify/functions/_shared/correlation-matrix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const sc = fs.readFileSync(path.join(__dirname, "..", "netlify/functions/statistical-crosses.mjs"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(!html.includes("scNpsCompMode"), "modo NPS removido do HTML");
assert(!html.includes("Valor original"), "opção valor original removida");
assert(!html.includes("id=\"scCorrMethod\""), "seletor Spearman/Pearson removido");
assert(!html.includes("params.set('correlationMethod'"), "param correlationMethod removido do fetch");
assert(html.includes("scNpsCompScale"), "escala NPS");
assert(html.includes("Como ler esta matriz"), "howto NPS/geral");
assert(html.includes("Cobertura geral do NPS"), "glossário/cobertura NPS");
assert(html.includes("npsValido") || html.includes("NPS válido"), "termo NPS válido");
assert(sc.includes('method: "spearman"'), "API força Spearman");
assert(!/correlationMethod === \"pearson\"/.test(sc), "sem branch pearson ativo no parse");

const clients = [];
for (let i = 1; i <= 60; i += 1) {
  clients.push({
    clientId: i,
    hasNps: i <= 30,
    npsPredictiveOk: i <= 30,
    npsClass: i <= 10 ? "promoter" : i <= 20 ? "passive" : i <= 30 ? "detractor" : null,
    npsScore: i <= 10 ? 9 : i <= 20 ? 7 : i <= 30 ? 3 : null,
    monthlyIncome: i <= 30 ? 5000 + i * 100 : null,
    meetingCount: i <= 28 ? (i <= 10 ? 8 : 2) : null,
    lastContribution: i <= 25 ? 1000 : null,
    liquidityReserve: i <= 22 ? 20000 : null,
    paidPropertiesValue: i <= 20 ? 100000 : null,
    mechanismCount: i % 5,
    implementedMechanismCount: i % 3,
    averageIntervalDays: 20 + (i % 10),
    daysSinceLastMeeting: i % 40,
    attendanceRate: 0.5 + (i % 5) / 10,
    noShowCount: i % 4,
    rescheduleCount: i % 3,
    stayDays: 100 + i,
    currentCycle: 1 + (i % 3),
    renewalCount: i % 2,
    isCancelled: i % 7 === 0,
    hasRenewed: i % 3 === 0,
    hasFinancialData: i % 2 === 0,
    hasMeeting: i % 2 === 1,
  });
}

const m = buildNpsComparativeMatrix(clients);
assert(m.eligiblePopulation === 60, "elegíveis");
assert(m.clientsWithValidNps === 30, "NPS válido");
assert(Math.abs(m.npsCoverageGeneral - 50) < 0.1, "cobertura geral 50%");
assert(m.groups.length === 3, "3 classes");
assert(m.variables.some((v) => v.id === "meetingCount"), "reuniões");
assert(m.variables.some((v) => v.id === "attendanceRate"), "comparecimento");
assert(m.cells.every((c) => c.npsCoverageGeneral === m.npsCoverageGeneral), "cobertura geral nas células");
assert(m.cells.some((c) => c.indicatorCoverageInClass != null && c.indicatorCoverageInClass < 100), "cobertura indicador < 100% em algum caso");
assert(m.cells.some((c) => c.reference != null && c.standardized != null), "stdDiff vs referência NPS");
assert(m.npsCoverageGeneral != null && m.npsCoverageGeneral < 100, "cobertura geral < 100% da base");
assert(
  m.npsCoverageGeneral < 40 ? Boolean(m.coverageWarning) : true,
  "aviso quando cobertura < 40%"
);
// Forçar cenário de cobertura baixa
const sparse = clients.map((c, idx) => ({ ...c, hasNps: idx < 5, npsPredictiveOk: idx < 5, npsClass: idx < 5 ? "promoter" : null }));
const mLow = buildNpsComparativeMatrix(sparse);
assert(mLow.coverageWarning, "aviso cobertura baixa");
assert(mLow.npsCoverageGeneral < 40, "cobertura baixa no cenário esparso");

assert(m.mode === "standardized_vs_nps_population", "modo único");

const corr = buildCorrelationMatrix(clients, { method: "spearman", variableIds: ["meetingCount", "stayDays", "monthlyIncome"] });
assert(corr.method === "spearman" || corr.cells.every((c) => c.method === "spearman"), "corr spearman");
const pearsonAttempt = buildCorrelationMatrix(clients, { method: "pearson", variableIds: ["meetingCount", "stayDays"] });
// API não chama pearson; helper ainda aceita, mas UI/API não expõem.

console.log("VERIFY_NPS_GENERAL_MATRIX_OK", {
  eligible: m.eligiblePopulation,
  withNps: m.clientsWithValidNps,
  coverage: m.npsCoverageGeneral,
  classN: Object.fromEntries(m.groups.map((g) => [g.id, g.n])),
  cellSample: m.cells.find((c) => c.varId === "meetingCount" && c.groupId === "promoter"),
  corrMethod: corr.cells[0]?.method,
  pearsonStillInHelper: pearsonAttempt.cells[0]?.method,
});
