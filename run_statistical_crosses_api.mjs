import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
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

import handler from "./netlify/functions/statistical-crosses.mjs";

const qs = String(process.env.PORTAL_REQUEST_QUERY || "").replace(/^\?/, "");
const url = qs
  ? `http://127.0.0.1/api/statistical-crosses?${qs}`
  : "http://127.0.0.1/api/statistical-crosses";

const started = Date.now();
const response = await handler(new Request(url));
const body = await response.text();
const ms = Date.now() - started;
if (!response.ok) {
  console.error(`[statistical-crosses] status=${response.status} ms=${ms} body=${body.slice(0, 240)}`);
}
process.stdout.write(body);
if (!response.ok) process.exit(1);
