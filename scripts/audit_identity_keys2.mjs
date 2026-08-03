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

const BASE = process.env.DATA_SUPABASE_URL;
const KEY = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
const PH_BASE = process.env.PHARUS_SUPABASE_URL;
const PH_KEY = process.env.PHARUS_SUPABASE_SERVICE_ROLE_KEY;

async function ok(base, key, table, select, profile = "public") {
  const url = new URL(`/rest/v1/${table}`, base);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", "1");
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": profile },
  });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

const clientCols = {};
for (const col of ["email", "phone", "cpf", "cpf_digits", "phone_digits", "telefone", "documento", "name", "codigo"]) {
  clientCols[col] = await ok(BASE, KEY, "clients", `id,${col}`);
}

const pharus = {};
if (PH_BASE && PH_KEY) {
  for (const table of ["personal_info", "pre_registrations", "accounts", "user_metadata"]) {
    pharus[table] = await ok(PH_BASE, PH_KEY, table, "*", "core");
  }
}

writeFileSync(resolve(root, "scripts/_audit_identity_keys.json"), JSON.stringify({ clientCols, pharus }, null, 2));
console.log(JSON.stringify({ clientCols: Object.fromEntries(Object.entries(clientCols).map(([k,v]) => [k, v.status])), pharus: Object.fromEntries(Object.entries(pharus).map(([k,v]) => [k, { status: v.status, body: v.body.slice(0,200) }])) }, null, 2));
