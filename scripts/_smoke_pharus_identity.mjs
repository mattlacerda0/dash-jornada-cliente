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

const { computePharusMechanismsPayload } = await import("../netlify/functions/pharus-mechanisms.mjs");
const payload = await computePharusMechanismsPayload();

const rows = payload.rows || [];
const identified = rows.filter((r) => r.userName && r.userName !== "Usuário não identificado").length;
const withEmail = rows.filter((r) => r.userEmail).length;
const sample = rows.filter((r) => r.userName !== "Usuário não identificado").slice(0, 3).map((r) => ({
  userName: r.userName,
  hasEmail: Boolean(r.userEmail),
  source: r.userIdentitySource,
  mechanismName: r.mechanismName,
}));

const out = {
  available: payload.available,
  usersWithMechanisms: payload.summary?.usersWithMechanisms,
  linkedMechanisms: payload.summary?.linkedMechanisms,
  identifiedUsers: payload.summary?.identifiedUsers,
  usersWithEmail: payload.summary?.usersWithEmail,
  mechanismsPerUser: payload.mechanismsPerUser,
  implementationTiming: payload.quality?.implementationTiming,
  userDirectory: payload.metadata?.userDirectory,
  userDirectoryCoverage: payload.metadata?.userDirectoryCoverage,
  csvMeta: payload.metadata?.userDirectoryCsv,
  rowsSampleIdentified: sample,
  identityRate: {
    linkRows: rows.length,
    identifiedLinks: identified,
    withEmailLinks: withEmail,
  },
};

writeFileSync(resolve(root, "scripts/_smoke_pharus_identity.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
