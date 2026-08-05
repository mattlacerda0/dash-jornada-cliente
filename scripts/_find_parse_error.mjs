import { readFileSync, writeFileSync } from "fs";

const h = readFileSync("index.html", "utf8");
const start = h.indexOf("<script>");
const end = h.indexOf("</script>", start);
const code = h.slice(start + 8, end);
writeFileSync("_tmp_sc_script.js", code);

function tryParse(src) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(src);
    return null;
  } catch (e) {
    return e.message;
  }
}

const lines = code.split("\n");
console.log("lines", lines.length, "try whole", tryParse(code));

// binary search first failing line
let lo = 1, hi = lines.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  const err = tryParse(lines.slice(0, mid).join("\n") + "\n/*pad*/");
  // incomplete code always errors — use acorn-like approach: wrap and find with node --check on prefixes is hard
  // Instead scan for mismatched braces / template issues around SC block
  void err;
  break;
}

// Brace / paren / string scanner
let brace = 0, paren = 0, bracket = 0;
let inS = null, inT = false, esc = false;
let line = 1, col = 0;
let lastOpen = [];
for (let i = 0; i < code.length; i++) {
  const ch = code[i];
  if (ch === "\n") { line++; col = 0; continue; }
  col++;
  if (inS) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === inS) inS = null;
    continue;
  }
  if (inT) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === "`") { inT = false; continue; }
    if (ch === "$" && code[i + 1] === "{") {
      // enter expression — simplistic: track nested
      i++; // skip $
      brace++;
      lastOpen.push({ t: "tmplExpr", line, col });
      continue;
    }
    continue;
  }
  if (ch === "'" || ch === '"') { inS = ch; continue; }
  if (ch === "`") { inT = true; continue; }
  if (ch === "/" && code[i + 1] === "/") {
    while (i + 1 < code.length && code[i + 1] !== "\n") i++;
    continue;
  }
  if (ch === "/" && code[i + 1] === "*") {
    i += 2;
    while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
      if (code[i] === "\n") line++;
      i++;
    }
    i++;
    continue;
  }
  if (ch === "{") { brace++; lastOpen.push({ t: "{", line, col }); }
  else if (ch === "}") {
    brace--;
    lastOpen.pop();
    if (brace < 0) { console.log("extra } at", line, col); break; }
  } else if (ch === "(") { paren++; lastOpen.push({ t: "(", line, col }); }
  else if (ch === ")") {
    paren--;
    lastOpen.pop();
    if (paren < 0) { console.log("extra ) at", line, col); console.log(lines[line - 1]); break; }
  } else if (ch === "[") { bracket++; }
  else if (ch === "]") { bracket--; if (bracket < 0) { console.log("extra ] at", line, col); break; } }
}
console.log("final brace/paren/bracket/inS/inT", brace, paren, bracket, inS, inT);
if (lastOpen.length) console.log("unclosed last 5", lastOpen.slice(-5));

// Find SC render region and check specifically
const idx = code.indexOf("function scCorrColor");
console.log("scCorrColor at line", code.slice(0, idx).split("\n").length);
const idx2 = code.indexOf("function scRenderRiskRules");
console.log("scRenderRiskRules at line", code.slice(0, idx2).split("\n").length);
const chunk = code.slice(idx, idx2 + 80);
console.log("chunk parse", tryParse("void 0;" + chunk));
