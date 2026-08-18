/**
 * Etapa 8.3.2 — 9 gerações live sequenciais (3 por página).
 * Para se 429 se repetir. Não imprime segredos. Não altera frontend.
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

import {
  findUnanchoredNumbers,
  collectAllowedNumbers,
} from "./netlify/functions/_shared/executive-ai.mjs";
import { extractExecutiveCandidates } from "./netlify/functions/_shared/executive-candidates.mjs";
import handler from "./netlify/functions/ai-analysis.mjs";

const CAUSAL = /\b(causa|causam|causou|causaram|causado por|é causado|e causado|é a causa|e a causa|provoca|leva ao cancelamento|faz o cliente cancelar|gera cancelamento|taxa de acerto)\b/i;
const PII = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 6000);
const GENS = Number(process.env.GENS || 3);
const PAGES = (process.env.PAGES || "general,meetings,statistical-crosses").split(",").map((s) => s.trim()).filter(Boolean);

function blob(analysis) {
  return JSON.stringify(analysis || {});
}

function consistencyLabel(rows) {
  if (!rows.length) return "baixa";
  const att = rows.map((r) => r.counts.attention);
  const lim = rows.map((r) => r.counts.limitations);
  const ok = rows.filter((r) => r.success && r.headline_ok && r.summary_ok);
  if (ok.length !== rows.length) return "baixa";
  const attSwing = Math.max(...att) - Math.min(...att);
  const zeroFlip = Math.min(...att) === 0 && Math.max(...att) >= 2;
  const limMissing = rows.some((r) => r.expected_limitations && r.counts.limitations === 0);
  if (limMissing || zeroFlip) return "baixa";
  if (attSwing <= 1 && rows.every((r) => r.invented_numbers === 0 && r.pii === 0 && r.causality === 0)) return "alta";
  if (attSwing <= 2) return "aceitável";
  return "baixa";
}

async function analyzePage(page, gen) {
  const t0 = Date.now();
  const request = new Request("http://127.0.0.1/api/ai-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portal-user-email": "etapa832@quartavia.com.br",
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
  const candidates = ctx.kpis ? extractExecutiveCandidates(ctx) : { attention_candidates: [], limitation_candidates: [] };
  const text = blob(ea);
  const unanchored = ea.headline ? findUnanchoredNumbers(ea, collectAllowedNumbers(ctx)) : [];
  const actions = ea.recommended_actions || [];
  const unbound = actions.filter((a) => !Array.isArray(a.based_on) || !a.based_on.length);
  return {
    page,
    gen,
    http_status: response.status,
    success: body.success === true,
    code: body.code || null,
    error: body.error || null,
    reason: body.reason || null,
    headline: ea.headline || null,
    headline_ok: Boolean(ea.headline && !/^analisando os dados/i.test(ea.headline)),
    summary_ok: Boolean(ea.executive_summary),
    counts: {
      attention: (ea.attention_points || []).length,
      positive: (ea.positive_signals || []).length,
      actions: actions.length,
      limitations: (ea.limitations || []).length,
    },
    candidate_counts: {
      attention: candidates.attention_candidates?.length || 0,
      limitation: candidates.limitation_candidates?.length || 0,
      positive: candidates.positive_candidates?.length || 0,
    },
    expected_attention: (candidates.attention_candidates || []).length > 0,
    expected_limitations: (candidates.limitation_candidates || []).length > 0,
    attention_filled_if_expected: (candidates.attention_candidates || []).length === 0
      || (ea.attention_points || []).length >= 1,
    limitations_filled_if_expected: (candidates.limitation_candidates || []).length === 0
      || (ea.limitations || []).length >= 1,
    actions_unbound: unbound.length,
    invented_numbers: unanchored.length,
    invented_samples: unanchored.slice(0, 4),
    pii: PII.test(text) ? 1 : 0,
    causality: CAUSAL.test(text) ? 1 : 0,
    timing_ms: body.timing_ms || { total: totalMs },
    wall_ms: totalMs,
  };
}

const report = {
  interval_ms: INTERVAL_MS,
  gens_per_page: GENS,
  pages: {},
  aborted: false,
  abort_reason: null,
  rate_limit: { found_429: 0, retries_logged: 0, aborted_calls: 0 },
};

let consecutive429 = 0;
outer: for (const page of PAGES) {
  report.pages[page] = [];
  for (let gen = 1; gen <= GENS; gen += 1) {
    if (Object.values(report.pages).flat().length) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
    const row = await analyzePage(page, gen);
    report.pages[page].push(row);
    console.log("GEN", JSON.stringify({
      page,
      gen,
      success: row.success,
      counts: row.counts,
      reason: row.reason,
      wall_ms: row.wall_ms,
      invented: row.invented_numbers,
      causality: row.causality,
    }));
    const is429 = row.reason === "rate_limited" || row.http_status === 429 || /429/.test(String(row.error || ""));
    if (is429) {
      report.rate_limit.found_429 += 1;
      consecutive429 += 1;
      if (consecutive429 >= 2) {
        report.aborted = true;
        report.abort_reason = "repeated_429";
        report.rate_limit.aborted_calls = 1;
        console.log("ABORT repeated 429");
        break outer;
      }
    } else {
      consecutive429 = 0;
    }
  }
}

const summary = {};
for (const page of Object.keys(report.pages)) {
  const rows = report.pages[page];
  summary[page] = {
    gens: rows.length,
    success: rows.filter((r) => r.success).length,
    consistency: consistencyLabel(rows),
    attention: rows.map((r) => r.counts.attention),
    positive: rows.map((r) => r.counts.positive),
    actions: rows.map((r) => r.counts.actions),
    limitations: rows.map((r) => r.counts.limitations),
    invented: rows.reduce((s, r) => s + r.invented_numbers, 0),
    causality: rows.reduce((s, r) => s + r.causality, 0),
    pii: rows.reduce((s, r) => s + r.pii, 0),
    times_ms: rows.map((r) => r.wall_ms),
  };
}
report.summary = summary;

writeFileSync(resolve(root, "docs/_etapa832_live.json"), JSON.stringify(report, null, 2));
const failed = Object.values(report.pages).flat().filter((p) => !p.success);
process.exitCode = report.aborted || failed.length ? 1 : 0;
