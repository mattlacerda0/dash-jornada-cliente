import fs from "fs";
const t = fs.readFileSync(process.argv[2], "utf8").split(/\n/);
let jsEp = null;
let jsSc = null;
let htmlSc = null;
for (const line of t) {
  if (
    !line.includes("loadEpPerformance")
    && !line.includes("loadStatisticalCrosses")
    && !line.includes("view-sc")
    && !line.includes("Cruzamentos Estat")
  ) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const part of content) {
    if (part?.type !== "tool_use") continue;
    const ns = part.input?.new_string || part.input?.contents || "";
    if (typeof ns !== "string") continue;
    if (ns.includes("loadEpPerformance") && (!jsEp || ns.length > jsEp.length)) jsEp = ns;
    if (ns.includes("loadStatisticalCrosses") && (!jsSc || ns.length > jsSc.length)) jsSc = ns;
    if ((ns.includes('id="view-sc"') || ns.includes("id='view-sc'")) && (!htmlSc || ns.length > htmlSc.length)) htmlSc = ns;
  }
}
fs.mkdirSync("scripts/_recovered/ui", { recursive: true });
if (jsEp) { fs.writeFileSync("scripts/_recovered/ui/ep.js", jsEp); console.log("ep.js", jsEp.length); }
if (jsSc) { fs.writeFileSync("scripts/_recovered/ui/sc.js", jsSc); console.log("sc.js", jsSc.length); }
if (htmlSc) { fs.writeFileSync("scripts/_recovered/ui/view-sc.html", htmlSc); console.log("sc.html", htmlSc.length); }
console.log("done");
