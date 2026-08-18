import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
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

import handler from "./netlify/functions/portal-snapshot.mjs";

const refresh = process.argv.includes("--refresh");
const request = new Request(
  refresh ? "http://127.0.0.1/api/portal-snapshot/refresh" : "http://127.0.0.1/api/portal-snapshot",
  { method: refresh ? "POST" : "GET" },
);

const response = await handler(request);
const body = await response.text();
process.stdout.write(body);
if (!response.ok) process.exit(1);
