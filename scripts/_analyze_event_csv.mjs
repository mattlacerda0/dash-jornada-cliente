import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "filtered-event-data-from-20250731-to-20260730.csv");
const text = readFileSync(path, "utf8");
const lines = text.split(/\r?\n/).filter(Boolean);

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

const header = parseCsvLine(lines[0]);
const typeIdx = header.indexOf("Event Type Name");
const cancelIdx = header.indexOf("Canceled");
const noshowIdx = header.indexOf("Marked as No-Show");
const uuidIdx = header.indexOf("Event UUID");

const types = new Map();
const uuids = new Set();
let canceled = 0;
let noshowYes = 0;
let noshowNo = 0;

for (let n = 1; n < lines.length; n += 1) {
  const cols = parseCsvLine(lines[n]);
  const ty = String(cols[typeIdx] || "").trim();
  types.set(ty, (types.get(ty) || 0) + 1);
  if (String(cols[cancelIdx]).toLowerCase() === "true") canceled += 1;
  const ns = String(cols[noshowIdx] || "").trim().toLowerCase();
  if (ns === "yes" || ns === "true") noshowYes += 1;
  else noshowNo += 1;
  const uuid = String(cols[uuidIdx] || "").trim();
  if (uuid) uuids.add(uuid);
}

const out = {
  rows: lines.length - 1,
  distinctTypes: types.size,
  canceled,
  noshowYes,
  noshowNo,
  distinctEventUuids: uuids.size,
  topTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
};
writeFileSync(resolve(root, "scripts/_csv_event_types_summary.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
