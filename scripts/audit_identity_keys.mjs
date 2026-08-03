/**
 * Probe identity columns on clients + pharus core tables.
 */
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

const { getPharusEnv, getPharusSupabaseClient, getDataEnv } = await import(
  "../netlify/functions/_shared/env.mjs"
);

async function probeRest(base, key, table, select, profile = "public") {
  const url = new URL(`/rest/v1/${table}`, base);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", "1");
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": profile,
    },
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 1500) };
}

const data = getDataEnv();
const clientsProbe = await probeRest(
  data.url,
  data.serviceRoleKey,
  "clients",
  "id,codigo,name,email,phone,cpf,cpf_digits,phone_digits,documento",
);
console.log("clients", clientsProbe.status, clientsProbe.text);

let pharusOut = { available: false };
try {
  const ph = getPharusEnv();
  const client = getPharusSupabaseClient();
  pharusOut.available = true;
  for (const table of ["personal_info", "pre_registrations", "accounts", "user_metadata", "users"]) {
    const { data: rows, error } = await client.schema("core").from(table).select("*").limit(1);
    pharusOut[table] = error
      ? { error: error.message }
      : { columns: rows?.[0] ? Object.keys(rows[0]) : [], sample: rows?.[0] || null };
  }
} catch (e) {
  pharusOut.error = String(e.message || e);
}

writeFileSync(resolve(root, "scripts/_audit_identity_keys.json"), JSON.stringify({ clientsProbe, pharusOut }, null, 2));
console.log(JSON.stringify(pharusOut, null, 2).slice(0, 4000));
