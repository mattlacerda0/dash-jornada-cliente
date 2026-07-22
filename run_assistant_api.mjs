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

import handler from "./netlify/functions/assistant.mjs";

// server.py injeta o corpo validado e o e-mail autenticado via variáveis de ambiente.
const email = (process.env.PORTAL_USER_EMAIL || "").trim();
const rawBody = process.env.PORTAL_ASSISTANT_BODY || "{}";

const request = new Request("http://127.0.0.1/api/assistant", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-portal-user-email": email,
  },
  body: rawBody,
});

const response = await handler(request);
const text = await response.text();
// Envelope consumido por server.py: preserva o status HTTP real do proxy.
process.stdout.write(JSON.stringify({ __status: response.status, body: text }));
