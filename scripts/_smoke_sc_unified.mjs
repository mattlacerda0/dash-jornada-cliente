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

const { computeStatisticalCrossesPayload } = await import("../netlify/functions/statistical-crosses.mjs");
const p = await computeStatisticalCrossesPayload({ filters: { status: "active_cancelled" } });

const out = {
  renewed: p.summary?.renewedClients ?? p.renewalAssociations?.renewed ?? null,
  discoveries: p.discoveries?.length ?? 0,
  matrixCells: p.correlationMatrix?.cells?.length ?? 0,
  matrixVars: p.correlationMatrix?.variables?.length ?? 0,
  matrixMethod: p.correlationMatrix?.method ?? null,
  cohortCohorts: p.cohort?.cohorts?.length ?? 0,
  cohortAges: p.cohort?.ages?.length ?? 0,
  survivalNStart: p.survival?.overall?.nStart ?? null,
  reportNarratives: p.report?.generatedNarratives?.length ?? 0,
  population: {
    total: p.population?.total,
    active: p.population?.active,
    cancelled: p.population?.cancelled,
  },
};

console.log(JSON.stringify(out, null, 2));
writeFileSync(resolve(root, "scripts/_smoke_sc_unified.json"), JSON.stringify(out, null, 2));
