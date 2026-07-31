import { readFileSync, existsSync, writeFileSync } from "fs";
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
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const { computeMeetingsPayload } = await import("../netlify/functions/meetings.mjs");

try {
  const p = await computeMeetingsPayload();
  const nsf = p.noShowFrequency || [];
  const sum = nsf.reduce((a, b) => a + (b.clients || 0), 0);
  const statusCounts = {};
  let naoInformado = 0;
  for (const c of p.clients || []) {
    const k = c.analyticalStatus || "?";
    statusCounts[k] = (statusCounts[k] || 0) + 1;
    if (k === "Não informado") naoInformado += 1;
  }
  const out = {
    clients: p.clients?.length,
    summary: {
      totalMeetings: p.summary?.totalMeetings,
      futureMeetings: p.summary?.futureMeetings,
      cancelledMeetings: p.summary?.cancelledMeetings,
      eligibleMeetings: p.summary?.eligibleMeetings,
      noShowsEligible: p.summary?.noShowsEligible,
      attendedMeetings: p.summary?.attendedMeetings ?? p.summary?.attendedEligible,
      noShowRate: p.summary?.noShowRate,
      attendanceRate: p.summary?.attendanceRate,
      attendanceInsufficientData: p.summary?.attendanceInsufficientData,
      clientsWithMeeting: p.summary?.clientsWithMeeting,
      totalNoShows: p.summary?.totalNoShows,
    },
    metadata: {
      eventTypeSource: p.metadata?.eventTypeSource,
      noShowSource: p.metadata?.noShowSource,
      csvNoShowCoverage: p.metadata?.csvNoShowCoverage,
      attendanceRateFormula: p.metadata?.attendanceRateFormula,
    },
    typesByFamilyTop: (p.distributions?.meetingTypesByFamily || []).slice(0, 10),
    typesByRawCount: (p.distributions?.meetingTypesByRaw || []).length,
    statusCounts,
    naoInformado,
    sampleActive: (p.clients || []).filter((c) => c.analyticalStatus === "Ativo").slice(0, 3).map((c) => ({
      clientId: c.clientId, name: c.clientName, analyticalStatus: c.analyticalStatus, rawStatus: c.rawStatus,
    })),
    noShowFrequency: nsf,
    bandSum: sum,
  };
  writeFileSync(resolve(root, "scripts/_meetings_smoke_summary.json"), JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error("FAIL", e?.message || e);
  console.error(e?.stack);
  process.exit(1);
}
