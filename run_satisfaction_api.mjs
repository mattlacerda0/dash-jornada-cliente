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
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

process.env.PORTAL_INTERNAL_DATA_RUN = "1";

import handler from "./netlify/functions/satisfaction.mjs";

const query = String(process.env.PORTAL_REQUEST_QUERY || "").replace(/^\?/, "");
const url = `http://127.0.0.1/api/satisfaction${query ? `?${query}` : ""}`;
const response = await handler(new Request(url));
const body = await response.text();
process.stdout.write(body);
if (!response.ok) process.exit(1);
