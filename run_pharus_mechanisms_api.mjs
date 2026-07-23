import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
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

console.error(JSON.stringify({
  pharusUrlConfigured: Boolean(String(process.env.PHARUS_SUPABASE_URL || "").trim()),
  pharusKeyConfigured: Boolean(String(process.env.PHARUS_SUPABASE_ANON_KEY || "").trim()),
  pharusKeyLen: String(process.env.PHARUS_SUPABASE_ANON_KEY || "").trim().length,
}));

import handler from "./netlify/functions/pharus-mechanisms.mjs";

const response = await handler(new Request("http://127.0.0.1/api/pharus-mechanisms"));
const body = await response.text();
process.stdout.write(body);
if (!response.ok) process.exit(1);
