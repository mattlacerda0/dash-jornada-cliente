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

const { computeGeneralDataPayload } = await import("../netlify/functions/general-data.mjs");
const { buildAnalyticalPopulation } = await import("../netlify/functions/statistical-crosses.mjs");
const { computeMeetingsPayload } = await import("../netlify/functions/meetings.mjs");
const { computeMechanismsPayload } = await import("../netlify/functions/mechanisms.mjs");

const general = await computeGeneralDataPayload();
const meetings = await computeMeetingsPayload();
const mechanisms = await computeMechanismsPayload();
const built = buildAnalyticalPopulation(general, meetings, mechanisms, new Date());

function cycleOf(c) {
  const raw = c.currentCycle ?? c.ciclo ?? c.cycle;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const allGeneral = general.clients || [];
const renewalDash = allGeneral.filter((c) => {
  const cy = cycleOf(c);
  return cy != null && cy > 1;
});

const scFiltered = built.clients.filter((c) => c.isActive || c.isCancelled);
const scRenewed = scFiltered.filter((c) => c.hasRenewed);

const scIds = new Set(scRenewed.map((c) => String(c.clientId)));
const missing = renewalDash.filter((c) => !scIds.has(String(c.clientId || c.id)));

const byStatus = {};
for (const c of missing) {
  const st = c.analyticalStatus || c.status || "unknown";
  byStatus[st] = (byStatus[st] || 0) + 1;
}

const builtById = new Map(built.clients.map((c) => [String(c.clientId), c]));
const audit = missing.map((c) => {
  const id = String(c.clientId || c.id);
  const row = builtById.get(id);
  return {
    clientId: id,
    clientCode: c.clientCode || c.codigo,
    clientName: c.clientName || c.name,
    cycle: cycleOf(c),
    analyticalStatus: c.analyticalStatus || c.status,
    inBuilt: Boolean(row),
    builtStatus: row?.analyticalStatus || row?.status,
    isActive: row?.isActive,
    isCancelled: row?.isCancelled,
    isFrozen: row?.isFrozen,
    hasRenewed: row?.hasRenewed,
    contractDate: row?.contractDate || c.contractDate,
  };
});

const out = {
  renewalDashRenewed: renewalDash.length,
  scActiveCancelledRenewed: scRenewed.length,
  diff: renewalDash.length - scRenewed.length,
  missingByStatus: byStatus,
  missing: audit,
  allBuiltRenewed: built.clients.filter((c) => c.hasRenewed).length,
  frozenRenewed: built.clients.filter((c) => c.isFrozen && c.hasRenewed).length,
  unknownRenewed: built.clients.filter((c) => !c.isActive && !c.isCancelled && !c.isFrozen && c.hasRenewed).length,
};

writeFileSync(resolve(root, "scripts/_audit_renewal_183_191.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
