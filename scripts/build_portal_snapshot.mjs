import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { buildPortalSnapshot } from "../netlify/functions/_shared/portal-snapshot-builder.mjs";
import { writePortalSnapshot } from "../netlify/functions/_shared/portal-snapshot-store.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

console.error("[Portal Snapshot] Gerando snapshot consolidado…");
const snapshot = await buildPortalSnapshot();
const saved = await writePortalSnapshot(snapshot);
console.error(`[Portal Snapshot] Salvo em data/portal-snapshot.json (${saved.meta?.elapsedMs || "?"} ms)`);
process.stdout.write(`${JSON.stringify({ ok: true, generatedAt: saved.meta?.generatedAt, elapsedMs: saved.meta?.elapsedMs })}\n`);
