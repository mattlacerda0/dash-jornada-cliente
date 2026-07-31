import { readFileSync, existsSync } from "fs";
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

const { getPharusSupabaseClient, pharusConfigurationError } = await import("../netlify/functions/_shared/env.mjs");
const err = pharusConfigurationError();
if (err) {
  console.log(JSON.stringify({ configError: err }));
  process.exit(1);
}

const schemas = ["core", "public"];
const tables = [
  "accounts",
  "personal_info",
  "pre_registrations",
  "profiles",
  "users",
  "user_profiles",
  "user_metadata",
];

const out = [];
for (const schema of schemas) {
  const client = getPharusSupabaseClient({ schema });
  for (const table of tables) {
    try {
      const r = await client.rest(table, { select: "*", limit: 1 });
      const cols = r.ok && r.data?.[0] ? Object.keys(r.data[0]) : [];
      out.push({
        schema,
        table,
        ok: r.ok,
        status: r.status,
        cols,
      });
    } catch (e) {
      out.push({ schema, table, error: String(e.message || e) });
    }
  }
}

// also check CSV presence
for (const f of ["pre_registrations_rows.csv", "personal_info_rows.csv"]) {
  out.push({ csv: f, exists: existsSync(resolve(root, f)) });
}

console.log(JSON.stringify(out, null, 2));
