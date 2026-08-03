import fs from "fs";

const path = "index.html";
let html = fs.readFileSync(path, "utf8");
const start = html.indexOf("    /* -------- Cruzamentos Estatísticos -------- */");
const end = html.indexOf("    /* -------- Quality (existing behavior + descriptions) -------- */", start);
if (start < 0 || end < 0) throw new Error(`markers ${start} ${end}`);

let block = html.slice(start, end);
const beforeLen = block.length;

// File currently contains literal backslash-backtick and backslash-${
block = block.split("\\`").join("`");
block = block.split("\\${").join("${");

if (block.includes("\\`") || block.includes("\\${")) {
  console.warn("still has escapes");
}

html = html.slice(0, start) + block + html.slice(end);
fs.writeFileSync(path, html);
console.log(JSON.stringify({ beforeLen, afterLen: block.length, sample: block.slice(220, 380) }));
