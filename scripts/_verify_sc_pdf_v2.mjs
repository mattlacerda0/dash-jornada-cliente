import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const h = readFileSync(path, "utf8");
const s = h.indexOf("<script>");
const e = h.indexOf("</script>", s);
try {
  // eslint-disable-next-line no-new-func
  new Function(h.slice(s + 8, e));
  console.log("PARSE_OK");
} catch (err) {
  console.error("PARSE_FAIL", err.message);
  process.exit(1);
}

const checks = {
  fit: h.includes("scFitImageMm"),
  scale25: h.includes("scSvgToPngDataUrl(svg, 2.5)") || h.includes("scale = 2.5"),
  landscape: h.includes("landscape: true"),
  printRemap: h.includes("'#ccc': '#333333'"),
  sticky: h.includes("#view-statistical-crosses .page-header{position:sticky"),
  btnPdf: h.includes("Exportar relatório em PDF"),
  loading: h.includes("is-loading"),
  story: h.includes("O que estamos vendo"),
  appendix: h.includes("Apêndice técnico"),
  noForce62: !/imgH\s*=\s*62/.test(h),
  clone: h.includes("scCloneSvgForExport"),
  setBtn: h.includes("scSetExportBtn"),
  primary: h.includes("sc-export-primary"),
};
console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((v) => !v)) {
  console.error("SOME_CHECKS_FAILED");
  process.exit(1);
}
console.log("ALL_CHECKS_OK");
