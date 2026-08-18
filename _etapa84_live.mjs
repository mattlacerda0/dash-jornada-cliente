/**
 * Etapa 8.4 — no máximo UMA tentativa live (general).
 * Para se 429. Não imprime segredos.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
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
import { geminiConfigurationError } from "./netlify/functions/_shared/env.mjs";

const request = new Request("http://127.0.0.1/api/ai-analysis", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-portal-user-email": "etapa84@quartavia.com.br",
  },
  body: JSON.stringify({ page: "general", filters: {}, generate: true }),
});
const t0 = Date.now();
const response = await handler(request);
const raw = await response.text();
let body = {};
try { body = JSON.parse(raw); } catch { body = { parse_error: true }; }
const ea = body.executive_analysis || {};
const details = body.details && typeof body.details === "object" ? {
  gemini_http: body.details.gemini_http || null,
  gemini_status: body.details.gemini_status || null,
  retry_after: body.details.retry_after || null,
  quota_metric: body.details.quota_metric || null,
  quota_class: body.details.quota_class || null,
  code: body.details.code || null,
} : null;
const report = {
  page: "general",
  gemini_api_key_loaded: !geminiConfigurationError(),
  http_status: response.status,
  success: body.success === true,
  code: body.code || null,
  reason: body.reason || null,
  error: body.error || null,
  details,
  has_executive_analysis: Boolean(body.executive_analysis),
  headline: ea.headline ? true : false,
  summary: ea.executive_summary ? true : false,
  counts: {
    attention: (ea.attention_points || []).length,
    positive: (ea.positive_signals || []).length,
    actions: (ea.recommended_actions || []).length,
    limitations: (ea.limitations || []).length,
  },
  timing_ms: body.timing_ms || { total: Date.now() - t0 },
  wall_ms: Date.now() - t0,
};
console.log("LIVE", JSON.stringify(report));
writeFileSync(resolve(root, "docs/_etapa84_live.json"), JSON.stringify(report, null, 2));
