import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadMeetingTypesFromCsv } from "../netlify/functions/_shared/meeting-types-csv.mjs";
import { loadMeetingTypesFromCalendly } from "../netlify/functions/_shared/meeting-types-calendly.mjs";

for (const name of [".env"]) {
  const p = resolve(name);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

function top(list, n = 10) {
  return (list || []).slice(0, n).map((r) => ({
    label: r.label || r.name,
    count: r.count,
    percent: r.percent ?? r.percentage,
  }));
}

const csv = loadMeetingTypesFromCsv();
console.log("=== CSV (antiga) ===");
console.log({
  available: csv.available,
  total: csv.metadata?.distinctEventUuids ?? csv.events?.length,
  families: csv.byFamily?.length,
  rawTypes: csv.byRaw?.length,
  top10Family: top(csv.byFamily),
});

const cal = await loadMeetingTypesFromCalendly();
console.log("=== Calendly Business Data (nova) ===");
console.log({
  available: cal.available,
  message: cal.metadata?.message || null,
  transport: cal.metadata?.transport,
  restFallbackReason: cal.metadata?.restFallbackReason || null,
  rowCount: cal.metadata?.rowCount,
  distinctEventUuids: cal.metadata?.distinctEventUuids,
  duplicateExtraRows: cal.metadata?.duplicateExtraRows,
  excludedCommercial: cal.excludedCommercial ?? cal.metadata?.excludedCommercial,
  missingGroup: cal.missingGroup ?? cal.metadata?.missingGroup,
  missingType: cal.metadata?.missingType,
  eligible: cal.totalEvents,
  families: cal.byFamily?.length,
  rawTypes: cal.byRaw?.length,
  groupNames: (cal.metadata?.groupNames || []).slice(0, 15),
  top10Family: top(cal.byFamily),
  top10Raw: top(cal.byRaw),
});

if (csv.available && cal.available) {
  console.log("=== Diff totals ===");
  console.log({
    csvTotal: csv.events.length,
    calEligible: cal.totalEvents,
    delta: cal.totalEvents - csv.events.length,
  });
}
