import fs from "fs";
const t = fs.readFileSync(process.argv[2], "utf8").split(/\n/);
const hits = [];
for (const line of t) {
  if (!line.includes("statistical") && !line.includes("Cruzamentos") && !line.includes("view-sc") && !line.includes("scKpis") && !line.includes("loadStatistical")) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const part of content) {
    if (part?.type !== "tool_use") continue;
    const ns = part.input?.new_string || part.input?.contents || "";
    if (typeof ns !== "string" || ns.length < 500) continue;
    if (
      ns.includes("view-sc")
      || ns.includes("scKpis")
      || ns.includes("loadStatisticalCrosses")
      || ns.includes("Cruzamentos Estatísticos")
    ) {
      hits.push({ name: part.name, len: ns.length, keys: Object.keys(part.input || {}), preview: ns.slice(0, 120).replace(/\n/g, " ") });
    }
  }
}
console.log(JSON.stringify(hits.slice(-20), null, 2));
console.log("count", hits.length);
