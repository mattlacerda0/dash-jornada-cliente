import fs from "fs";

const transcript = process.argv[2];
const lines = fs.readFileSync(transcript, "utf8").split(/\n/);
let bestEp = null;
let bestSc = null;
let bestNav = null;

for (const line of lines) {
  if (!line.includes("StrReplace") && !line.includes("Write")) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const part of content) {
    if (part?.type !== "tool_use") continue;
    const ns = part.input?.new_string || part.input?.contents || "";
    if (typeof ns !== "string") continue;
    if (ns.includes('id="view-ep"') || ns.includes("id='view-ep'") || ns.includes("view-ep-performance") || ns.includes('id="view-ep-performance"')) {
      if (!bestEp || ns.length > bestEp.length) bestEp = ns;
    }
    if (ns.includes('id="view-sc"') || ns.includes("view-statistical") || ns.includes('id="view-statistical"')) {
      if (!bestSc || ns.length > bestSc.length) bestSc = ns;
    }
    if (ns.includes('data-nav="ep"') || ns.includes("Performance do EP") || ns.includes("Performance dos EPs")) {
      if (ns.includes("data-nav") && (!bestNav || ns.length > bestNav.length)) bestNav = ns.slice(0, 2000);
    }
  }
}

fs.mkdirSync("scripts/_recovered/ui", { recursive: true });
if (bestEp) {
  fs.writeFileSync("scripts/_recovered/ui/view-ep.html", bestEp, "utf8");
  console.log("ep html", bestEp.length);
}
if (bestSc) {
  fs.writeFileSync("scripts/_recovered/ui/view-sc.html", bestSc, "utf8");
  console.log("sc html", bestSc.length);
}
if (bestNav) {
  fs.writeFileSync("scripts/_recovered/ui/nav-snippet.txt", bestNav, "utf8");
  console.log("nav", bestNav.length);
}
console.log("done");
