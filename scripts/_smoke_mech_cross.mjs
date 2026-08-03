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

const { computeMechanismsPayload } = await import("../netlify/functions/mechanisms.mjs");
const p = await computeMechanismsPayload();
const out = {
  baseQv: p.summary?.clientsWithMechanisms,
  crossSourceCoverage: p.crossSourceCoverage,
  crossSourceRowsSample: (p.crossSourceRows || []).slice(0, 5),
  warnings: p.quality?.crossSourceWarnings,
};
writeFileSync(resolve(root, "scripts/_smoke_mech_cross.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
