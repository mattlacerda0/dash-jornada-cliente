import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !(String(process.env[key] || "").trim())) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const { computeMeetingsPayload } = await import("../netlify/functions/meetings.mjs");
const { computeFinancialUpdatesPayload } = await import("../netlify/functions/financial-updates.mjs");
const { computeCancellationsPayload } = await import("../netlify/functions/cancellations.mjs");

const meetings = await computeMeetingsPayload();
const financial = await computeFinancialUpdatesPayload();
const cancellations = await computeCancellationsPayload();

const csv = meetings.meetingTypesFromCsv || {};
const out = {
  meetings: {
    totalMeetings: meetings.summary?.totalMeetings,
    totalNoShows: meetings.summary?.totalNoShows,
    totalReschedules: meetings.summary?.totalReschedules,
    attendanceRate: meetings.summary?.attendanceRate,
    clientsWithMeeting: meetings.summary?.clientsWithMeeting,
    csvAvailable: csv.available,
    csvDistinctUuids: csv.metadata?.distinctEventUuids,
    csvDistinctTypes: csv.metadata?.distinctRawTypes,
    csvTopFamilies: (csv.byFamily || []).slice(0, 8).map((r) => ({
      label: r.label,
      count: r.count,
      percent: r.percent,
    })),
    operationalHasTypes: Boolean(meetings.distributions?.meetingTypesByFamily),
  },
  financial: {
    totalClients: financial.summary?.totalClients,
    withData: financial.summary?.clientsWithFinancialData,
    postCreation: financial.summary?.clientsWithPostCreationUpdate,
    updated30: financial.summary?.updatedLast30Days,
    medianDays: financial.summary?.medianDaysSinceUpdate,
    audit: financial.quality?.timestampAudit,
  },
  cancellations: {
    effective: cancellations.summary?.effectiveCancellations ?? cancellations.summary?.totalCancellations,
    intentions: cancellations.summary?.intentionsRegistered,
    orders: cancellations.summary?.ordersRegistered,
    inProcess: cancellations.summary?.clientsInCancellationProcess,
  },
};

writeFileSync(resolve(root, "scripts/_smoke_dash_adjustments.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
