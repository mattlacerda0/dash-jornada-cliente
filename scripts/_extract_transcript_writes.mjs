import fs from "fs";
import path from "path";

const transcript = process.argv[2];
const outDir = process.argv[3];
const wanted = [
  "ep-performance.mjs",
  "statistical-crosses.mjs",
  "stats-tests.mjs",
  "run_ep_performance_api.mjs",
  "run_statistical_crosses_api.mjs",
  "ep-performance.js",
  "statistical-crosses.js",
  "pharus-ep-meetings.mjs",
];

const found = new Map();
const lines = fs.readFileSync(transcript, "utf8").split(/\n/);
for (const line of lines) {
  if (!line.includes('"Write"')) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const part of content) {
    if (part?.type !== "tool_use" || part?.name !== "Write") continue;
    const p = String(part.input?.path || "").replace(/\\/g, "/");
    const c = part.input?.contents;
    if (!c || typeof c !== "string") continue;
    for (const w of wanted) {
      if (p.endsWith(w) || p.includes(`/${w}`)) {
        // keep latest version
        found.set(w, { path: p, contents: c });
      }
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
for (const [name, data] of found) {
  const out = path.join(outDir, name);
  fs.writeFileSync(out, data.contents, "utf8");
  console.log("wrote", name, data.contents.length, "from", data.path);
}
console.log("total", found.size);
