import { readFileSync, writeFileSync } from "fs";

const path = "index.html";
let h = readFileSync(path, "utf8");
const marker = "setOrHtml('#scChartTenure', scAssocBars(scAssocBarItems(tenureCorr.map((t) => ({";
const start = h.indexOf(marker);
if (start < 0) {
  console.error("start not found");
  process.exit(1);
}
const end = h.indexOf("const buckets = p.tenureBuckets", start);
if (end < 0) {
  console.error("end not found");
  process.exit(1);
}
const neu = `setOrHtml('#scChartTenure', scAssocBars(scAssocBarItems(tenureCorr.map((t) => ({
        ...t,
        association: t.rho ?? t.association,
        associationAbs: Math.abs(t.rho ?? t.association ?? 0),
        reason: t.auditNote || t.reason || t.note
      })))) + (tenureCorr.some((t) => t.auditNote)
        ? '<p class="note-muted" style="margin-top:8px">Atenção: correlações muito altas (|ρ| ≥ 0,95) foram sinalizadas para auditoria — podem indicar variável derivada da permanência.</p>'
        : '<p class="note-muted" style="margin-top:8px">Correlação positiva: indicadores tendem a crescer juntos. Negativa: um sobe e o outro desce.</p>'));
      `;
h = h.slice(0, start) + neu + h.slice(end);
writeFileSync(path, h);
console.log("TENURE_UI_OK");
