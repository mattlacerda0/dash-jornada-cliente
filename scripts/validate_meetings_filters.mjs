/**
 * Valida exclusão de reuniões pré-entrada e ausência de métricas negativas.
 * Uso: node scripts/validate_meetings_filters.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

import handler from "../netlify/functions/meetings.mjs";

const response = await handler();
const payload = await response.json();
if (!response.ok) {
  console.error("API error:", payload);
  process.exit(1);
}

const clients = payload.clients || [];
let negDays = 0;
let negInterval = 0;
let negEntry = 0;
let preEntryMeetings = 0;
const impacted = new Set();

for (const c of clients) {
  if (c.daysSinceLastMeeting != null && c.daysSinceLastMeeting < 0) negDays += 1;
  if (c.averageIntervalDays != null && c.averageIntervalDays < 0) negInterval += 1;
  if (c.typicalIntervalDays != null && c.typicalIntervalDays < 0) negInterval += 1;
  if (c.daysFromEntryToFirstMeeting != null && c.daysFromEntryToFirstMeeting < 0) negEntry += 1;
  for (const m of c.meetings || []) {
    if (m.meetingDateStatus === "before_client_entry") {
      preEntryMeetings += 1;
      impacted.add(c.clientId);
    }
  }
}

const summary = payload.summary || {};
const q = payload.quality?.preEntryMeetings || {};

const report = {
  ok: response.ok,
  totalClients: clients.length,
  totalMeetingsKpi: summary.totalMeetings,
  preEntryMeetingsCounted: preEntryMeetings,
  clientsImpacted: impacted.size,
  qualityBlock: q,
  negativeDaysSince: negDays,
  negativeIntervals: negInterval,
  negativeDaysFromEntry: negEntry,
  typicalDaysSince: summary.typicalDaysSinceLastMeeting,
  typicalInterval: summary.typicalIntervalDays,
  pass:
    negDays === 0 &&
    negInterval === 0 &&
    negEntry === 0 &&
    (q.count == null || q.count === preEntryMeetings),
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
