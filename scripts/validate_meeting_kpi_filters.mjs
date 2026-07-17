/**
 * Simula recálculo de KPIs após filtros (mesma regra do frontend).
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

const payload = await (await handler()).json();
const clients = payload.clients || [];
const baseline = payload.summary;

function isAnalytic(m) {
  return m && m.meetingDateStatus !== "before_client_entry" && m.meetingDateStatus !== "invalid";
}

function inLastDays(m, days) {
  const start = m.startTime ? new Date(m.startTime) : null;
  if (!start || Number.isNaN(start.getTime())) return false;
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  return start >= from;
}

function summarize(rows) {
  const meetings = rows.flatMap((c) => (c.meetings || []).filter(isAnalytic));
  const totalMeetings = meetings.length;
  const noShows = rows.reduce((a, c) => a + (c.absences || 0), 0);
  const reschedules = rows.reduce((a, c) => a + (c.reschedules || 0), 0);
  const withFirst = rows.filter((c) => c.firstMeetingCompleted === true).length;
  return {
    clients: rows.length,
    totalMeetings,
    noShows,
    reschedules,
    withFirst,
    firstRate: rows.length ? Math.round((withFirst / rows.length) * 1000) / 10 : 0,
  };
}

function filterPeriod(days) {
  return clients
    .map((c) => {
      const meetings = (c.meetings || []).filter(isAnalytic).filter((m) => inLastDays(m, days));
      return {
        ...c,
        meetings,
        totalMeetings: meetings.length,
        absences: meetings.filter((m) => m.attendanceStatus === "nao_compareceu").length,
        reschedules: meetings.filter((m) => m.rescheduled).length,
      };
    })
    .filter((c) => c.meetings.length > 0);
}

const engineers = [...new Set(clients.map((c) => c.engineer))].filter((e) => e && e !== "Não informado");
const engineer = engineers[0];
const byEngineer = clients.filter((c) => c.engineer === engineer);
const onlyNoShow = clients.filter((c) => c.absences > 0);
const onlyReschedule = clients.filter((c) => c.reschedules > 0);
const firstYes = clients.filter((c) => c.firstMeetingCompleted === true);
const last30 = filterPeriod(30);
const last90 = filterPeriod(90);

const scenarios = {
  baseline: {
    clients: clients.length,
    totalMeetings: baseline.totalMeetings,
    noShows: baseline.totalNoShows,
    reschedules: baseline.totalReschedules,
    withFirst: baseline.clientsWithFirstMeeting,
  },
  last30: summarize(last30),
  last90: summarize(last90),
  engineer: summarize(byEngineer),
  onlyNoShow: summarize(onlyNoShow),
  onlyReschedule: summarize(onlyReschedule),
  firstYes: summarize(firstYes),
  combo: summarize(
    last30.filter((c) => c.absences > 0 || c.firstMeetingCompleted === true).slice(0),
  ),
};

const changes = Object.fromEntries(
  Object.entries(scenarios)
    .filter(([k]) => k !== "baseline")
    .map(([k, v]) => [
      k,
      {
        clientsChanged: v.clients !== scenarios.baseline.clients,
        meetingsChanged: v.totalMeetings !== scenarios.baseline.totalMeetings,
        kpisDiffer:
          v.totalMeetings !== scenarios.baseline.totalMeetings ||
          v.noShows !== scenarios.baseline.noShows ||
          v.clients !== scenarios.baseline.clients,
      },
    ]),
);

const pass = Object.values(changes).every((c) => c.kpisDiffer || c.clientsChanged);
console.log(JSON.stringify({ engineerSample: engineer, scenarios, changes, pass }, null, 2));
if (!pass) process.exit(1);
