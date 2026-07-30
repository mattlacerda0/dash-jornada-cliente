/**
 * Smoke dos ajustes: congelados, processo cancelamento, airtable fallback, export helper.
 * node --env-file=.env scripts/smoke_portal_adjustments.mjs
 */
import { computeCancellationsPayload } from "../netlify/functions/cancellations.mjs";
import { computeGeneralDataPayload } from "../netlify/functions/general-data.mjs";
import { computeMeetingsPayload } from "../netlify/functions/meetings.mjs";
import { loadAirtableFirstMeetingIndex } from "../netlify/functions/_shared/first-meeting-fallback.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const out = {};

const general = await computeGeneralDataPayload();
const gSum = general.summary || {};
out.general = {
  total: gSum.totalClients,
  active: gSum.activeClients,
  frozen: gSum.frozenClients,
  cancelled: gSum.cancelledClients,
  unknown: gSum.unknownClients ?? null,
  sumStatus:
    (gSum.activeClients || 0)
    + (gSum.frozenClients || 0)
    + (gSum.cancelledClients || 0)
    + (gSum.unknownClients || 0),
};
assert(typeof gSum.frozenClients === "number", "frozenClients ausente no general-data");

const cancel = await computeCancellationsPayload();
const cSum = cancel.summary || {};
out.cancellations = {
  inProcess: cSum.clientsInCancellationProcess,
  efetivados: cSum.effectiveCancellations,
  entryPedido: cSum.processEntryFromPedido,
  entryIntencao: cSum.processEntryFromIntencao,
  withoutStatus: cSum.processWithoutStatus,
  medianInProcess: cSum.timing?.medianDaysInProcess,
  byStatus: (cancel.distributions?.byProcessStatus || []).slice(0, 8),
  bySegment: (cancel.distributions?.byProcessSegment || []).slice(0, 8),
  statusDim: (cancel.processStatusDimension?.statuses || []).map((s) => s.name),
  sampleRow: (cancel.clients || []).find((c) => c.inProcessCurrently) || null,
};
assert(typeof cSum.clientsInCancellationProcess === "number", "clientsInCancellationProcess ausente");
assert(Array.isArray(cancel.distributions?.byProcessStatus), "byProcessStatus ausente");
assert(
  cancel.processStatusDimension?.join === "cancellations.status_id = cancellation_statuses.id",
  "join status incorreto",
);

const air = await loadAirtableFirstMeetingIndex();
out.airtable = {
  available: air.available,
  reason: air.reason,
  schemasTried: air.meta?.schemasTried || air.meta?.triedSchemas || null,
  statusValues: air.statusValues || [],
  colsClients: air.meta?.clientColumns || null,
  colsMeetings: air.meta?.meetingColumns || null,
};

const meetings = await computeMeetingsPayload();
out.meetings = {
  withFirst: meetings.summary?.clientsWithFirstMeeting,
  withoutFirst: meetings.summary?.clientsWithoutFirstMeeting,
  sources: meetings.summary?.firstMeetingSources,
  airtableFallbackAvailable: meetings.summary?.airtableFallback?.available ?? null,
  airtableReason: meetings.summary?.airtableFallback?.reason ?? air.reason,
};

console.log(JSON.stringify(out, null, 2));
console.log("SMOKE_OK");
