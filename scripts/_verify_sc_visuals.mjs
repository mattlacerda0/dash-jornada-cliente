import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const h = readFileSync(path, "utf8");
const start = h.indexOf("<script>");
const end = h.indexOf("</script>", start);
try {
  // eslint-disable-next-line no-new-func
  new Function(h.slice(start + 8, end));
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL", e.message);
  process.exit(1);
}

const checks = [
  ["svg matrix class", h.includes("sc-matrix-svg")],
  ["matrix legend", h.includes("scMatrixLegend")],
  ["matrix insights", h.includes("scMatrixInsights")],
  ["matrix table host", h.includes("scMatrixTableHost")],
  ["diff chart", h.includes("scDiffChart")],
  ["auc chart", h.includes("scAucChart")],
  ["nps chart", h.includes("scNpsGroupsChart")],
  ["renewal chart", h.includes("scRenewalDiffChart")],
  ["at risk", h.includes("scAtRiskHost")],
  ["survival compare", h.includes("scSurvivalCompare")],
  ["cohort table", h.includes("scCohortTableHost")],
  ["scCorrColor", h.includes("function scCorrColor")],
  ["hook diff chart", h.includes("scRenderDiffChart(p)")],
  ["hook matrix", h.includes("scRenderCorrelationMatrix(p)")],
  ["hook renewal", h.includes("scRenderRenewalDiffChart(p)")],
  ["listeners export", h.includes("addEventListener('click', scExportReport)")],
  ["hm cells", h.includes("sc-hm-cell")],
  ["details class", h.includes("sc-data-details")],
  ["no HTML table matrix main", !/host\.innerHTML = `<table class="sc-matrix-table"/.test(h)],
];

let fail = 0;
for (const [k, v] of checks) {
  console.log(v ? "OK" : "FAIL", k);
  if (!v) fail += 1;
}
if (fail) process.exit(1);
