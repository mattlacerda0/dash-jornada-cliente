/**
 * Etapa 8.3.3 — validação live final, baixo consumo de quota.
 * Não altera backend, frontend, Vercel, Git, n8n.
 * Não imprime segredos, PII nem prompt.
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
  textHasForbiddenCausality,
} from "./netlify/functions/_shared/executive-ai.mjs";
import {
  extractExecutiveCandidates,
  cardCoversCandidate,
} from "./netlify/functions/_shared/executive-candidates.mjs";
import handler from "./netlify/functions/ai-analysis.mjs";

const PII = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const MEETINGS_CHURN = /\b(reuni[oõ]es? (causam|provocam|reduzem o cancelamento|evitam o churn)|aumentar reuni[oõ]es? (ir[aá]|vai))\b/i;
const PAGES = ["general", "meetings", "statistical-crosses"];
const INTERVAL_MS = 30000;
const ROUND2_WAIT_MS = 60000;

function blob(analysis) {
  return [
    analysis?.headline,
    analysis?.executive_summary,
    ...(analysis?.attention_points || []).map((p) => `${p.title} ${p.description}`),
    ...(analysis?.positive_signals || []).map((p) => `${p.title} ${p.description}`),
    ...(analysis?.recommended_actions || []).map((p) => `${p.title} ${p.description}`),
    ...(analysis?.limitations || []).map((p) => `${p.title} ${p.description}`),
  ].join(" \n ");
}

function classifyFailure({ success, reason, code, error, checks }) {
  if (reason === "rate_limited" || code === "unavailable" || reason === "unavailable") {
    return "INFRASTRUCTURE_RATE_LIMIT";
  }
  if (/429|503/.test(String(error || "")) || /429|503/.test(String(reason || ""))) {
    return "INFRASTRUCTURE_RATE_LIMIT";
  }
  if (!success && (reason === "invalid_json" || /JSON/i.test(String(error || "")))) {
    return "MODEL_FORMAT_FAILURE";
  }
  if (!success && (reason === "unanchored_number" || reason === "causality_forbidden")) {
    return "SAFETY_VALIDATION_FAILURE";
  }
  if (checks?.safety_failed) return "SAFETY_VALIDATION_FAILURE";
  if (checks?.quality_failed) return "EXECUTIVE_QUALITY_FAILURE";
  if (!success) return "MODEL_FORMAT_FAILURE";
  return null;
}

function pageChecks(page, ea, ctx, candidates) {
  const text = blob(ea);
  const issues = [];
  const unanchored = ea.headline ? findUnanchoredNumbers(ea, collectAllowedNumbers(ctx)) : [];
  const pii = PII.test(text) ? 1 : 0;
  const causal = textHasForbiddenCausality(text);
  const meetingsCausal = page === "meetings" && MEETINGS_CHURN.test(text);
  const actions = ea.recommended_actions || [];
  const unbound = actions.filter((a) => !Array.isArray(a.based_on) || !a.based_on.length);

  const attCovered = (candidates.attention_candidates || []).filter((c) =>
    (ea.attention_points || []).some((card) => cardCoversCandidate(card, c)),
  );
  const limCovered = (candidates.limitation_candidates || []).filter((c) =>
    (ea.limitations || []).some((card) => cardCoversCandidate(card, c)),
  );
  const posCovered = (candidates.positive_candidates || []).filter((c) =>
    (ea.positive_signals || []).some((card) => cardCoversCandidate(card, c)),
  );

  if (!ea.headline) issues.push("headline_missing");
  if (!ea.executive_summary) issues.push("summary_missing");
  if (unanchored.length) issues.push("invented_numbers");
  if (pii) issues.push("pii");
  if ((page === "statistical-crosses" && causal.hit) || meetingsCausal) issues.push("causality");
  if ((candidates.attention_candidates || []).length && attCovered.length === 0 && (ea.attention_points || []).length === 0) {
    issues.push("attention_candidates_ignored");
  }
  if ((candidates.limitation_candidates || []).length && (ea.limitations || []).length === 0) {
    issues.push("deterministic_limitations_missing");
  }
  if (unbound.length) issues.push("actions_without_based_on");
  if ((candidates.positive_candidates || []).length === 0 && (ea.positive_signals || []).length > 0) {
    // backend should strip; if present, still record
    issues.push("positive_without_candidates");
  }

  if (page === "meetings") {
    const drop = (candidates.attention_candidates || []).find((c) => c.metric === "meetings_completed_by_month");
    if (drop && !attCovered.some((c) => c.metric === "meetings_completed_by_month") && !(ea.attention_points || []).length) {
      issues.push("meetings_drop_not_in_attention");
    }
  }

  const safety_failed = issues.some((i) => ["invented_numbers", "pii", "causality"].includes(i));
  const quality_failed = issues.some((i) =>
    ["headline_missing", "summary_missing", "attention_candidates_ignored", "deterministic_limitations_missing", "actions_without_based_on", "meetings_drop_not_in_attention"].includes(i),
  );

  return {
    issues,
    safety_failed,
    quality_failed,
    invented_numbers: unanchored.length,
    invented_samples: unanchored.slice(0, 3).map((x) => ({ raw: x.raw, number: x.number })),
    pii,
    causality: causal.hit || meetingsCausal ? 1 : 0,
    causality_snippet: causal.hit ? String(causal.snippet || "").slice(0, 80) : null,
    attention_candidates_covered: attCovered.map((c) => c.metric || c.id),
    limitation_candidates_covered: limCovered.map((c) => c.metric || c.code || c.id),
    positive_candidates_covered: posCovered.map((c) => c.metric || c.id),
    evidence_metrics: [
      ...(ea.attention_points || []).flatMap((p) => (p.evidence || []).map((e) => e.metric).filter(Boolean)),
      ...(ea.positive_signals || []).flatMap((p) => (p.evidence || []).map((e) => e.metric).filter(Boolean)),
    ],
    based_on: actions.flatMap((a) => a.based_on || []),
    passed: !safety_failed && !quality_failed && Boolean(ea.headline && ea.executive_summary),
  };
}

async function analyzePage(page, round) {
  const t0 = Date.now();
  const request = new Request("http://127.0.0.1/api/ai-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portal-user-email": "etapa833@quartavia.com.br",
    },
    body: JSON.stringify({ page, filters: {}, generate: true }),
  });
  const response = await handler(request);
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { body = { parse_error: true }; }
  const ea = body.executive_analysis || {};
  const ctx = body.analysis_context || {};
  const candidates = ctx.kpis ? extractExecutiveCandidates(ctx) : {
    attention_candidates: [],
    positive_candidates: [],
    limitation_candidates: [],
  };
  const checks = body.success ? pageChecks(page, ea, ctx, candidates) : {
    issues: [],
    safety_failed: false,
    quality_failed: false,
    invented_numbers: 0,
    pii: 0,
    causality: 0,
    passed: false,
  };
  const classification = body.success && checks.passed
    ? "OK"
    : classifyFailure({
      success: body.success,
      reason: body.reason,
      code: body.code,
      error: body.error,
      checks,
    });
  return {
    page,
    round,
    http_status: response.status,
    success: body.success === true && checks.passed === true,
    api_success: body.success === true,
    code: body.code || null,
    error: body.error || null,
    reason: body.reason || null,
    classification,
    headline: ea.headline || null,
    counts: {
      attention: (ea.attention_points || []).length,
      positive: (ea.positive_signals || []).length,
      actions: (ea.recommended_actions || []).length,
      limitations: (ea.limitations || []).length,
    },
    candidate_counts: {
      attention: (candidates.attention_candidates || []).length,
      positive: (candidates.positive_candidates || []).length,
      limitation: (candidates.limitation_candidates || []).length,
    },
    checks,
    timing_ms: body.timing_ms || { total: Date.now() - t0 },
    wall_ms: Date.now() - t0,
  };
}

function consistencyLabel(a, b) {
  if (!a || !b || !a.success || !b.success) return "n/a";
  const keys = ["attention", "positive", "actions", "limitations"];
  const swing = Math.max(...keys.map((k) => Math.abs((a.counts[k] || 0) - (b.counts[k] || 0))));
  const themesA = [...(a.checks?.attention_candidates_covered || []), ...(a.checks?.based_on || [])].sort().join("|");
  const themesB = [...(b.checks?.attention_candidates_covered || []), ...(b.checks?.based_on || [])].sort().join("|");
  const ignoredFlip = (a.candidate_counts.attention > 0 && a.counts.attention === 0)
    || (b.candidate_counts.attention > 0 && b.counts.attention === 0);
  if (ignoredFlip) return "baixa";
  if (swing <= 1 && (themesA === themesB || !themesA || !themesB)) return "alta";
  if (swing <= 2) return "aceitável";
  return "baixa";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const report = {
  etapa: "8.3.3",
  interval_ms: INTERVAL_MS,
  round2_wait_ms: ROUND2_WAIT_MS,
  mocks: {
    etapa832: { total: 14, pass: 14, fail: 0 },
    etapa83: { total: 14, pass: 14, fail: 0 },
  },
  rounds: { 1: [], 2: [] },
  second_round: { performed: false, reason: null },
  aborted: false,
  abort_reason: null,
  rate_limit: { http_429: 0, http_503: 0, consecutive_page_429: 0 },
};

let consecutiveInfra = 0;
let round1AllOk = true;

for (let i = 0; i < PAGES.length; i += 1) {
  const page = PAGES[i];
  if (i > 0) {
    console.log(`WAIT ${INTERVAL_MS}ms before ${page}`);
    await sleep(INTERVAL_MS);
  }
  const row = await analyzePage(page, 1);
  report.rounds[1].push(row);
  console.log("R1", JSON.stringify({
    page,
    http: row.http_status,
    classification: row.classification,
    counts: row.counts,
    wall_ms: row.wall_ms,
    timing_ms: row.timing_ms,
    issues: row.checks?.issues || [],
  }));
  if (row.classification === "INFRASTRUCTURE_RATE_LIMIT") {
    if (row.reason === "unavailable") report.rate_limit.http_503 += 1;
    else report.rate_limit.http_429 += 1;
    consecutiveInfra += 1;
    round1AllOk = false;
    if (consecutiveInfra >= 2) {
      report.aborted = true;
      report.abort_reason = "consecutive_infrastructure_rate_limit";
      report.second_round = { performed: false, reason: "aborted_after_consecutive_429_or_503" };
      console.log("ABORT consecutive INFRASTRUCTURE_RATE_LIMIT");
      break;
    }
  } else {
    consecutiveInfra = 0;
    if (!row.success) round1AllOk = false;
  }
}

if (!report.aborted && round1AllOk && report.rounds[1].length === 3 && report.rounds[1].every((r) => r.success)) {
  console.log(`WAIT ${ROUND2_WAIT_MS}ms before round 2`);
  await sleep(ROUND2_WAIT_MS);
  report.second_round = { performed: true, reason: "round1_all_ok" };
  consecutiveInfra = 0;
  for (let i = 0; i < PAGES.length; i += 1) {
    const page = PAGES[i];
    if (i > 0) {
      console.log(`WAIT ${INTERVAL_MS}ms before ${page} r2`);
      await sleep(INTERVAL_MS);
    }
    const row = await analyzePage(page, 2);
    report.rounds[2].push(row);
    console.log("R2", JSON.stringify({
      page,
      http: row.http_status,
      classification: row.classification,
      counts: row.counts,
      wall_ms: row.wall_ms,
      issues: row.checks?.issues || [],
    }));
    if (row.classification === "INFRASTRUCTURE_RATE_LIMIT") {
      if (row.reason === "unavailable") report.rate_limit.http_503 += 1;
      else report.rate_limit.http_429 += 1;
      consecutiveInfra += 1;
      if (consecutiveInfra >= 2) {
        report.aborted = true;
        report.abort_reason = "consecutive_infrastructure_rate_limit_round2";
        console.log("ABORT consecutive INFRASTRUCTURE_RATE_LIMIT round 2");
        break;
      }
    } else {
      consecutiveInfra = 0;
    }
  }
} else if (!report.aborted) {
  report.second_round = {
    performed: false,
    reason: round1AllOk ? "round1_incomplete" : "round1_not_all_ok",
  };
}

const byPage = {};
for (const page of PAGES) {
  const r1 = report.rounds[1].find((r) => r.page === page) || null;
  const r2 = report.rounds[2].find((r) => r.page === page) || null;
  byPage[page] = {
    round1: r1,
    round2: r2,
    consistency: consistencyLabel(r1, r2),
    live_valid: Boolean(r1?.success || r2?.success),
  };
}
report.by_page = Object.fromEntries(PAGES.map((p) => [p, {
  live_valid: byPage[p].live_valid,
  consistency: byPage[p].consistency,
  classifications: [byPage[p].round1?.classification, byPage[p].round2?.classification].filter(Boolean),
}]));

const allRows = [...report.rounds[1], ...report.rounds[2]];
report.failures = {
  infrastructure: allRows.filter((r) => r.classification === "INFRASTRUCTURE_RATE_LIMIT").length,
  format: allRows.filter((r) => r.classification === "MODEL_FORMAT_FAILURE").length,
  safety: allRows.filter((r) => r.classification === "SAFETY_VALIDATION_FAILURE").length,
  executive_quality: allRows.filter((r) => r.classification === "EXECUTIVE_QUALITY_FAILURE").length,
};

writeFileSync(resolve(root, "docs/_etapa833_live.json"), JSON.stringify(report, null, 2));
const qualityOrSafety = report.failures.safety + report.failures.executive_quality + report.failures.format;
process.exitCode = qualityOrSafety ? 1 : 0;
