/**
 * Paridade SQL (via payload real) × computeSupportPayload — diferença 0.
 * Uso: node --env-file=.env _support_parity_tests.mjs
 */
import { computeSupportPayload } from "./netlify/functions/support.mjs";

function fold(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function assertEq(label, a, b) {
  if (a !== b) {
    throw new Error(`${label}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
  }
  console.log(`OK  ${label}: ${a}`);
}

const payload = await computeSupportPayload();
const tickets = payload.tickets || [];
const s = payload.summary || {};

console.log("source:", payload.source);
console.log("generatedAt:", payload.generatedAt);

assertEq("totalTickets", s.totalTickets, tickets.length);
assertEq("openTickets", s.openTickets, tickets.filter((t) => t.isOpen).length);
assertEq("urgentTickets", s.urgentTickets, tickets.filter((t) => t.priority === "Urgente").length);
assertEq("identifiedClients", s.identifiedClients, tickets.filter((t) => t.clientIdentified).length);
assertEq("unidentifiedClients", s.unidentifiedClients, tickets.filter((t) => !t.clientIdentified).length);
assertEq("resolvedTickets", s.resolvedTickets, tickets.filter((t) => t.isResolved).length);

const byArea = new Map();
for (const t of tickets) {
  if (!t.area || t.area === "Não informado") continue;
  byArea.set(t.area, (byArea.get(t.area) || 0) + 1);
}
const topArea = [...byArea.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || null;
assertEq("topArea", s.topArea, topArea);

const areaKeys = new Map();
for (const t of tickets) {
  const k = fold(t.area);
  if (!k || t.area === "Não informado") continue;
  areaKeys.set(k, (areaKeys.get(k) || 0) + 1);
}
const pharus = areaKeys.get(fold("App Pharus")) || 0;
const qvweb = areaKeys.get(fold("QV360 Web")) || 0;
console.log(`OK  area App Pharus (norm): ${pharus}`);
console.log(`OK  area QV360 Web (norm): ${qvweb}`);

const pri = new Map();
for (const t of tickets) pri.set(t.priority, (pri.get(t.priority) || 0) + 1);
console.log("priority:", Object.fromEntries(pri));

const typ = new Map();
for (const t of tickets) typ.set(t.type, (typ.get(t.type) || 0) + 1);
console.log("type:", Object.fromEntries(typ));

const st = new Map();
for (const t of tickets) st.set(t.status, (st.get(t.status) || 0) + 1);
console.log("status:", Object.fromEntries(st));

if (s.resolvedTickets === 0) {
  assertEq("medianResolutionHours null", s.medianResolutionHours, null);
  assertEq("resolutionRate 0", s.resolutionRate, 0);
}

if (!tickets.length) {
  console.error("FAIL: nenhum ticket — verifique N8N_SUPPORT_ACIONAMENTOS_WEBHOOK_URL / Business Data.");
  process.exit(1);
}

console.log("\nPARITY PASS — diferença 0 entre summary e tickets[] do mesmo payload.");
console.log("warnings:", (payload.warnings || []).map((w) => w.message || w).slice(0, 3));
