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

import handler from "./netlify/functions/ai-analysis.mjs";

const email = (process.env.PORTAL_USER_EMAIL || "").trim();
const rawBody = process.env.PORTAL_AI_ANALYSIS_BODY || "{}";

const request = new Request("http://127.0.0.1/api/ai-analysis", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-portal-user-email": email,
  },
  body: rawBody,
});

const response = await handler(request);
const text = await response.text();
process.stdout.write(JSON.stringify({ __status: response.status, body: text }));
