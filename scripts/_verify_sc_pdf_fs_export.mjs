import fs from "fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const hosts = [...html.matchAll(/id="(sc\w*ExportHost)"/g)].map((m) => m[1]);
const counts = {};
hosts.forEach((h) => { counts[h] = (counts[h] || 0) + 1; });
const dups = Object.entries(counts).filter(([, c]) => c > 1);
const fsTitles = [...html.matchAll(/data-sc-fs-title="([^"]+)"/g)].map((m) => m[1]);
const matrixSels = [
  "#scCancelMatrixHost",
  "#scNpsMatrixHost",
  "#scNpsCompHost",
  "#scRenewalMatrixHost",
  "#scTenureMatrixHost",
  "#scMatrixHost",
  "#scGroupMatrixHost",
];
const stillInPdf = matrixSels.filter((sel) => html.includes(`sel: '${sel}'`));
const pdfSection = html.slice(html.indexOf("async function scExportReport"), html.indexOf("function renderStatisticalCrosses"));
const stillInPdfSection = matrixSels.filter((sel) => pdfSection.includes(sel));

console.log(JSON.stringify({
  hostCount: hosts.length,
  uniqueHosts: Object.keys(counts).length,
  dups,
  fsTitles,
  matrixInAddChartCalls: stillInPdf,
  matrixMentionedInPdfFn: stillInPdfSection,
  writeText: html.includes("const writeText = (text, opts"),
  addTextAnalysis: html.includes("addTextAnalysis"),
  skipScAutoExport: html.includes("table.closest('#view-statistical-crosses')"),
  exportMenu: html.includes("Exportar Excel") && html.includes("Exportar CSV"),
  fsOpenUsesAttr: html.includes("bar.getAttribute('data-sc-fs-title')"),
}, null, 2));
