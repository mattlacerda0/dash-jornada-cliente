/**
 * Etapa 8.3.1 — ping Gemini + análises reais. Não imprime segredos.
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

import { getGeminiEnv, geminiConfigurationError } from "./netlify/functions/_shared/env.mjs";
import {
  findUnanchoredNumbers,
  collectAllowedNumbers,
  GEMINI_TEMPERATURE,
} from "./netlify/functions/_shared/executive-ai.mjs";
import handler from "./netlify/functions/ai-analysis.mjs";

const CAUSAL = /\b(causa|causam|causou|causaram|causado por|é causado|e causado|é a causa|e a causa|causalidade|taxa de acerto)\b/i;
const PII = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function blob(analysis) {
  return JSON.stringify(analysis || {});
}

async function pingGemini() {
  const cfg = geminiConfigurationError();
  const env = getGeminiEnv();
  if (cfg) {
    return { ok: false, stage: "config", error: cfg, model: env.model, key_present: Boolean(env.apiKey) };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.model)}:generateContent?key=${encodeURIComponent(env.apiKey)}`;
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: 'Retorne somente JSON: {"ok":true,"echo":1}' }] }],
      generationConfig: { temperature: GEMINI_TEMPERATURE, responseMimeType: "application/json" },
    }),
  });
  const ms = Date.now() - started;
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  const errMsg = String(parsed?.error?.message || parsed?.error?.status || "").slice(0, 180);
  const candidate = parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  let jsonOk = false;
  try {
    const inner = JSON.parse(candidate.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim() || "{}");
    jsonOk = inner && typeof inner === "object";
  } catch { jsonOk = false; }
  return {
    ok: response.ok && jsonOk && response.status !== 401 && response.status !== 403 && !/API_KEY_INVALID/i.test(errMsg),
    http_status: response.status,
    model: env.model,
    temperature: GEMINI_TEMPERATURE,
    json_ok: jsonOk,
    api_key_invalid: /API_KEY_INVALID/i.test(errMsg),
    error_status: parsed?.error?.status || null,
    error_message: errMsg.replace(/key=[\w-]+/gi, "key=REDACTED").slice(0, 160),
    ms,
    key_present: true,
  };
}

async function analyzePage(page) {
  const t0 = Date.now();
  const request = new Request("http://127.0.0.1/api/ai-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portal-user-email": "etapa831@quartavia.com.br",
    },
    body: JSON.stringify({ page, filters: {}, generate: true }),
  });
  const response = await handler(request);
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { body = { parse_error: true }; }
  const totalMs = Date.now() - t0;
  const ea = body.executive_analysis || {};
  const ctx = body.analysis_context || {};
  const text = blob(ea);
  const unanchored = ea.headline ? findUnanchoredNumbers(ea, collectAllowedNumbers(ctx)) : [{ skip: true }];
  return {
    page,
    http_status: response.status,
    success: body.success === true,
    code: body.code || null,
    error: body.error || null,
    ai_generated: body.metadata?.ai_generated === true,
    model: body.metadata?.model || null,
    headline: ea.headline || null,
    executive_summary: ea.executive_summary || null,
    attention_points: (ea.attention_points || []).map((p) => ({ severity: p.severity, title: p.title })),
    positive_signals: (ea.positive_signals || []).map((p) => p.title),
    recommended_actions: (ea.recommended_actions || []).map((p) => ({ title: p.title, description: p.description })),
    limitations: (ea.limitations || []).map((p) => p.title),
    counts: {
      attention: (ea.attention_points || []).length,
      positive: (ea.positive_signals || []).length,
      actions: (ea.recommended_actions || []).length,
      limitations: (ea.limitations || []).length,
    },
    invented_numbers: Array.isArray(unanchored) ? unanchored.filter((x) => !x.skip).length : 0,
    invented_samples: Array.isArray(unanchored) ? unanchored.filter((x) => !x.skip).slice(0, 4) : [],
    validation_reason: body.reason || null,
    validation_details: body.details || null,
    pii: PII.test(text) ? 1 : 0,
    causality: CAUSAL.test(text) ? 1 : 0,
    timing_ms: body.timing_ms || {
      total: totalMs,
    },
    wall_ms: totalMs,
    has_context: Boolean(ctx.kpis),
  };
}

const ping = process.env.SKIP_PING === "1"
  ? { ok: true, skipped: true, model: "gemini-3.5-flash", temperature: GEMINI_TEMPERATURE, key_present: true }
  : await pingGemini();
if (process.env.SKIP_PING === "1") console.log("PING skipped (already validated this session)");
else console.log("PING", JSON.stringify(ping));
if (!ping.ok) {
  writeFileSync(resolve(root, "docs/_etapa831_live.json"), JSON.stringify({ ping, pages: null }, null, 2));
  process.exitCode = 1;
  throw new Error("Gemini ping failed; analytical tests skipped.");
}

const pages = [];
const pageList = (process.env.PAGES || "general,meetings,statistical-crosses").split(",").map((s) => s.trim()).filter(Boolean);
for (const page of pageList) {
  if (pages.length) await new Promise((r) => setTimeout(r, 3000));
  const row = await analyzePage(page);
  pages.push(row);
  console.log("PAGE", JSON.stringify(row));
}

writeFileSync(resolve(root, "docs/_etapa831_live.json"), JSON.stringify({ ping, pages }, null, 2));
const failed = pages.filter((p) => !p.success);
process.exitCode = failed.length ? 1 : 0;
