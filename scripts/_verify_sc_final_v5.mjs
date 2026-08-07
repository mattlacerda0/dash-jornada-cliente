/**
 * Verificação final Análises Estatísticas — cobertura, cohort, tenure, UI markers.
 * Não executa Git. Não altera banco.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildCohortRetention } from "../netlify/functions/_shared/cohort-retention.mjs";
import { analyzeTenureCorrelations } from "../netlify/functions/statistical-crosses.mjs";
import { buildAxisMatricesBundle } from "../netlify/functions/_shared/sc-axis-matrices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sc = fs.readFileSync(path.join(root, "netlify/functions/statistical-crosses.mjs"), "utf8");
const cohortSrc = fs.readFileSync(path.join(root, "netlify/functions/_shared/cohort-retention.mjs"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// UI markers
assert(html.includes("scCoverageHtml"), "coverage helper");
assert(html.includes("sc-glossary-launcher"), "glossary launcher");
assert(html.includes("scFsModal"), "fullscreen modal");
assert(html.includes("backdrop-filter:blur(6px)"), "blur backdrop");
assert(html.includes("Expandir curva"), "survival expand");
assert(html.includes("Expandir cohort"), "cohort expand");
assert(html.includes("scAucExportHost"), "AUC export host");
assert(html.includes("scNpsGroupsExportHost"), "NPS groups export");
assert(!html.includes('id="scExportPharusCsv"'), "no separate Pharus CSV button");
assert(html.includes("Como interpretar os gráficos desta página") || html.includes("SC_GLOSSARY"), "glossary content");
assert(html.includes("O que o gráfico mostra"), "PDF template labels");
assert(html.includes("Amostra e cobertura"), "PDF sample/coverage");
assert(sc.includes("meetingsPerMonth"), "meetingsPerMonth field");
assert(cohortSrc.includes("skippedCancelBeforeHire"), "cancel-before-hire skip");
assert(cohortSrc.includes("cancelMonth > age"), "cohort retention by cancel month");

// Cohort functional
const clients = [];
for (let i = 1; i <= 20; i += 1) {
  clients.push({
    clientId: i,
    contractDate: i <= 10 ? "2026-01-10" : "2026-05-01",
    isCancelled: i <= 5,
    cancellationDate: i <= 5 ? "2026-03-20" : null,
    cancellationDateSource: i <= 5 ? "churn_efetivado_at" : null,
    stayDays: i <= 5 ? 69 : 200,
    meetingCount: i,
    meetingsPerMonth: i / Math.max(200 / 30.4375, 1),
    daysSinceLastMeeting: 30 - i,
    averageIntervalDays: 20 + i,
    daysToFirstMeeting: 5 + i,
  });
}
clients.push({ clientId: 99, contractDate: "2026-01-10", isCancelled: true, cancellationDate: "2025-12-01" });
clients.push({ clientId: 1, contractDate: "2026-01-10", isCancelled: false }); // dup

const cohort = buildCohortRetention(clients, { hireFrom: "2026-01-01", cutoffDate: "2026-07-01" });
assert(cohort.metadata.skippedCancelBeforeHire >= 1, "skip cancel before hire");
assert(cohort.metadata.skippedDuplicate >= 1, "skip dup");
const cellM2 = cohort.cells.find((c) => c.cohortKey === "2026-01" && c.age === 2);
assert(cellM2 && cellM2.observable && cellM2.retainedPct != null && cellM2.retainedPct < 100, "M2 retention drops after cancel");
const cellFuture = cohort.cells.find((c) => c.cohortKey === "2026-05" && c.age === 4);
assert(cellFuture && cellFuture.observable === false && cellFuture.retainedPct == null, "future not zero");

// Tenure + meetingsPerMonth + interpretation
const tenure = analyzeTenureCorrelations(clients.filter((c) => c.stayDays != null));
const mpm = tenure.find((r) => r.id === "meetingsPerMonth");
assert(mpm, "meetingsPerMonth correlation row");
assert(mpm.interpretation, "tenure interpretation");
assert(mpm.stdDiffGroups && /permanência/i.test(mpm.stdDiffGroups), "stdDiff groups alta/baixa");

const axis = buildAxisMatricesBundle({
  clients,
  associations: [],
  univariatePredictivePower: [],
  activeVsCancelled: [],
  renewalAssociations: { numeric: [] },
  renewedVsNotRenewed: [],
});
assert(axis.tenure.metrics.some((m) => m.id === "stdDiff"), "tenure matrix has stdDiff");
assert(axis.tenure.rows.some((r) => r.id === "meetingsPerMonth"), "tenure matrix has meetingsPerMonth");

console.log("VERIFY_SC_FINAL_V5_OK", {
  cohortIncluded: cohort.metadata.clientsWithHire,
  tenureRows: tenure.length,
  mpmRho: mpm.rho,
});
