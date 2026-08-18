/**
 * Etapa 8.4.2 — no máximo UMA chamada Gemini por página piloto.
 * Para tudo se 429. Não imprime segredos.
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

const pages = ["general", "meetings", "statistical-crosses"];
const reports = [];

for (const page of pages) {
  const request = new Request("http://127.0.0.1/api/ai-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-portal-user-email": "etapa842@quartavia.com.br" },
    body: JSON.stringify({ page, filters: {}, generate: true }),
  });
  const t0 = Date.now();
  const response = await handler(request);
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { body = { parse_error: true }; }
  const ea = body.executive_analysis || {};
  const snap = body.executive_snapshot || body.analysis_context?.executive_snapshot || {};
  const report = {
    page,
    http_status: response.status,
    success: body.success === true,
    code: body.code || null,
    reason: body.reason || null,
    error: body.error || null,
    gemini_http: body.details?.gemini_http || null,
    quota_metric: body.details?.quota_metric || null,
    quota_class: body.details?.quota_class || null,
    scope: ea.scope || snap.scope || null,
    has_executive_analysis: Boolean(body.executive_analysis),
    headline: ea.headline ? true : false,
    summary: ea.executive_summary ? true : false,
    highlight_numbers: (ea.highlight_numbers || []).length,
    counts: {
      attention: (ea.attention_points || []).length,
      positive: (ea.positive_signals || []).length,
      actions: (ea.recommended_actions || []).length,
      limitations: (ea.limitations || []).length,
    },
    snapshot_bytes: body.metadata?.snapshot_bytes || snap.metadata_size?.bytes || null,
    context_bytes_without_snapshot: body.metadata?.context_bytes_without_snapshot || null,
    timing_ms: body.timing_ms || { total: Date.now() - t0 },
    wall_ms: Date.now() - t0,
    headline_text: ea.headline || null,
  };
  reports.push(report);
  console.log("LIVE", JSON.stringify(report));
  if (body.reason === "rate_limited" || response.status === 429 || body.details?.gemini_http === 429) {
    console.log("STOP — rate_limited, remaining pages skipped");
    break;
  }
}

writeFileSync(resolve(root, "docs/_etapa842_live.json"), JSON.stringify(reports, null, 2));
