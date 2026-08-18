/**
 * Etapa 8.4.2 — snapshots e perfis executivos.
 * Sem Gemini. Backup Base QV somente leitura.
 */
import { writeFileSync, existsSync, readFileSync } from "fs";
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

import { computeGeneralDataPayload } from "./netlify/functions/general-data.mjs";
import { computeMeetingsPayload } from "./netlify/functions/meetings.mjs";
import { computeStatisticalCrossesPayload } from "./netlify/functions/statistical-crosses.mjs";
import { composeExecutiveAnalysis } from "./netlify/functions/_shared/executive-analysis.mjs";
import {
  EXECUTIVE_PAGE_PROFILES,
  resolveExecutiveScope,
  compactPageProfile,
  profileMetricAllowlist,
} from "./netlify/functions/_shared/executive-page-profiles.mjs";
import {
  buildExecutiveSnapshot,
  estimateJsonBytes,
  snapshotHasDisallowedPayload,
} from "./netlify/functions/_shared/executive-snapshot.mjs";
import { extractExecutiveCandidates } from "./netlify/functions/_shared/executive-candidates.mjs";
import { EXECUTIVE_SYSTEM_PROMPT, EXECUTIVE_AI_LIMITS } from "./netlify/functions/_shared/executive-ai.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}
function tryCase(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => record(name, true, detail))
    .catch((err) => record(name, false, err.message));
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PII_KEYS = /clientId|client_id|clientName|email|cpf|cnpj/;

function sizeReport(ctx) {
  const full = estimateJsonBytes(ctx);
  const snapshot = estimateJsonBytes(ctx.executive_snapshot);
  const previous = ctx.metadata?.context_bytes_without_snapshot || (full - snapshot);
  const reduction = previous > 0 ? Math.round((1 - snapshot / previous) * 1000) / 10 : null;
  return { previous, snapshot, full, reduction };
}

await tryCase("perfis cobrem páginas ativas e piloto Gemini", () => {
  const ids = Object.keys(EXECUTIVE_PAGE_PROFILES);
  assert(ids.includes("general") && ids.includes("meetings") && ids.includes("statistical-crosses"));
  assert(ids.includes("cancellations") && ids.includes("quality") && ids.includes("ep"));
  assert(EXECUTIVE_PAGE_PROFILES.general.allowActiveDefault === true);
  assert(EXECUTIVE_PAGE_PROFILES.meetings.allowActiveDefault === true);
  assert(EXECUTIVE_PAGE_PROFILES["statistical-crosses"].allowActiveDefault === false);
  assert(EXECUTIVE_PAGE_PROFILES.cancellations.allowActiveDefault === false);
  return ids.join(", ");
});

await tryCase("filtro explícito prevalece sobre default active", () => {
  const def = resolveExecutiveScope("general", {});
  assert(def.type === "active_clients" && def.source === "page_default");
  const all = resolveExecutiveScope("general", { status: "all" });
  assert(all.type === "all_clients" && all.source === "user_filter");
  const sc = resolveExecutiveScope("statistical-crosses", {});
  assert(sc.type === "methodological");
  const scForced = resolveExecutiveScope("statistical-crosses", { status: "active" });
  assert(scForced.type === "methodological", scForced.type);
});

await tryCase("prompt executivo permite poucos insights e bloqueia técnico na headline", () => {
  assert(/Arrays vazios são aceitáveis/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Limitações técnicas/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Nunca invente valores/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Não invente meta, benchmark ou expectativa/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Não invente contexto empresarial/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(/Priorize a população definida em scope/.test(EXECUTIVE_SYSTEM_PROMPT));
  assert(EXECUTIVE_AI_LIMITS.attentionPoints === 3);
  assert(EXECUTIVE_AI_LIMITS.positiveSignals === 2);
});

const sizes = {};

await tryCase("snapshot general: active, compacto, sem PII", async () => {
  const payload = await computeGeneralDataPayload();
  const result = composeExecutiveAnalysis({ pageId: "general", payload, filtersApplied: {} });
  const snap = result.analysis_context.executive_snapshot;
  assert(snap, "snapshot ausente");
  assert(snap.scope.type === "active_clients", snap.scope.type);
  assert(snap.scope.count > 0, "count");
  assert(snap.highlights.active_clients != null);
  assert(Array.isArray(snap.highlight_numbers) && snap.highlight_numbers.length >= 1);
  assert(snap.highlight_numbers.length <= 4);
  assert(!snapshotHasDisallowedPayload(snap));
  assert(!EMAIL_RE.test(JSON.stringify(snap)));
  assert(!PII_KEYS.test(JSON.stringify(snap)));
  const limTech = (snap.limitations || []).filter((l) => l.category === "technical");
  const limQuality = (snap.limitations || []).filter((l) => l.category === "data_quality");
  const cands = extractExecutiveCandidates(result.analysis_context);
  assert(!cands.attention_candidates.some((c) => c.metric === "cancelled_without_confirmed_date"));
  const allowed = profileMetricAllowlist("general");
  for (const h of snap.highlight_numbers) {
    assert(allowed.has(h.metric), `highlight fora do perfil: ${h.metric}`);
    assert(EXECUTIVE_PAGE_PROFILES.general.highlightMetrics.includes(h.metric), h.metric);
  }
  assert(snap.highlights.active_clients === payload.summary.activeClients);
  assert(!snap.highlight_numbers.some((h) => h.metric === "cancelled_without_confirmed_date"));
  assert(snap.data_quality?.cancelled_without_confirmed_date === payload.summary.cancelledWithoutConfirmedDate
    || snap.limitations.some((l) => l.metric === "cancelled_without_confirmed_date"));
  const sz = sizeReport(result.analysis_context);
  sizes.general = { ...sz, scope: snap.scope, highlights: snap.highlights, timing: result.analysis_context.metadata.timing_ms };
  writeFileSync(resolve(root, "docs/debug-executive-snapshot-general.json"), JSON.stringify({
    executive_snapshot: snap,
    candidates: {
      attention: cands.attention_candidates,
      positive: cands.positive_candidates,
      limitation: cands.limitation_candidates,
    },
    metadata: {
      snapshot_bytes: sz.snapshot,
      previous_bytes: sz.previous,
      reduction_pct: sz.reduction,
      timing_ms: result.analysis_context.metadata.timing_ms,
    },
  }, null, 2));
  return `scope=${snap.scope.count} bytes=${sz.snapshot} prev=${sz.previous} red=${sz.reduction}% tech=${limTech.length} quality=${limQuality.length}`;
});

await tryCase("snapshot meetings: active se possível, compacto, sem PII", async () => {
  const payload = await computeMeetingsPayload();
  const result = composeExecutiveAnalysis({ pageId: "meetings", payload, filtersApplied: {} });
  const snap = result.analysis_context.executive_snapshot;
  assert(snap.scope.type === "active_clients", snap.scope.type);
  assert(snap.highlights.meeting_coverage_rate != null || snap.highlights.clients_with_meeting != null);
  assert(snap.highlight_numbers.length <= 4);
  const allowed = profileMetricAllowlist("meetings");
  for (const h of snap.highlight_numbers) {
    assert(allowed.has(h.metric), `highlight fora do perfil: ${h.metric}`);
  }
  assert(snap.metric_origin?.attendance_rate);
  assert(!snapshotHasDisallowedPayload(snap));
  assert(!EMAIL_RE.test(JSON.stringify(snap)));
  const cands = extractExecutiveCandidates(result.analysis_context);
  const sz = sizeReport(result.analysis_context);
  sizes.meetings = { ...sz, scope: snap.scope, highlights: snap.highlights, timing: result.analysis_context.metadata.timing_ms };
  writeFileSync(resolve(root, "docs/debug-executive-snapshot-meetings.json"), JSON.stringify({
    executive_snapshot: snap,
    candidates: {
      attention: cands.attention_candidates,
      positive: cands.positive_candidates,
      limitation: cands.limitation_candidates,
    },
    metadata: {
      snapshot_bytes: sz.snapshot,
      previous_bytes: sz.previous,
      reduction_pct: sz.reduction,
      timing_ms: result.analysis_context.metadata.timing_ms,
    },
  }, null, 2));
  return `scope=${snap.scope.count} coverage=${snap.highlights.meeting_coverage_rate} bytes=${sz.snapshot} red=${sz.reduction}%`;
});

await tryCase("snapshot statistical-crosses: população metodológica, sem active forçado", async () => {
  const payload = await computeStatisticalCrossesPayload({ filters: {} });
  const result = composeExecutiveAnalysis({ pageId: "statistical-crosses", payload, filtersApplied: {} });
  const snap = result.analysis_context.executive_snapshot;
  assert(snap.scope.type === "methodological", snap.scope.type);
  assert(Array.isArray(snap.discoveries));
  assert(snap.discoveries.length <= 5);
  assert((snap.highlights.top_associations || []).length <= 3);
  assert((snap.highlights.top_aucs || []).length <= 3);
  assert((snap.highlights.top_group_differences || []).length <= 3);
  assert(snap.highlight_numbers.length <= 4);
  const allowed = profileMetricAllowlist("statistical-crosses");
  for (const h of snap.highlight_numbers) {
    assert(allowed.has(h.metric), `highlight fora do perfil: ${h.metric}`);
  }
  assert(!snapshotHasDisallowedPayload(snap));
  const cands = extractExecutiveCandidates(result.analysis_context);
  const sz = sizeReport(result.analysis_context);
  sizes["statistical-crosses"] = { ...sz, scope: snap.scope, highlights: snap.highlights, timing: result.analysis_context.metadata.timing_ms };
  writeFileSync(resolve(root, "docs/debug-executive-snapshot-statistical-crosses.json"), JSON.stringify({
    executive_snapshot: snap,
    candidates: {
      attention: cands.attention_candidates,
      positive: cands.positive_candidates,
      limitation: cands.limitation_candidates,
    },
    metadata: {
      snapshot_bytes: sz.snapshot,
      previous_bytes: sz.previous,
      reduction_pct: sz.reduction,
      timing_ms: result.analysis_context.metadata.timing_ms,
    },
  }, null, 2));
  return `discoveries=${snap.discoveries.length} bytes=${sz.snapshot} red=${sz.reduction}%`;
});

await tryCase("snapshot de página não piloto não dispara compute extra", () => {
  const snap = buildExecutiveSnapshot("cancellations", { summary: { confirmedCancellations: 10 } }, { filters: {} });
  assert(snap.page === "cancellations");
  assert(snap.scope.type === "cancellation_process");
  assert(compactPageProfile("cancellations").objective);
});

await tryCase("general com filtro explícito all respeita o recorte", async () => {
  const payload = await computeGeneralDataPayload();
  const result = composeExecutiveAnalysis({ pageId: "general", payload, filtersApplied: { status: "all" } });
  const snap = result.analysis_context.executive_snapshot;
  assert(snap.scope.type === "all_clients", snap.scope.type);
  assert(snap.scope.source === "user_filter");
  assert(snap.scope.count === payload.summary.totalClients, `${snap.scope.count} vs ${payload.summary.totalClients}`);
});

await tryCase("limites executivos do snapshot e candidatos", async () => {
  const payload = await computeGeneralDataPayload();
  const result = composeExecutiveAnalysis({ pageId: "general", payload, filtersApplied: {} });
  const snap = result.analysis_context.executive_snapshot;
  const cands = extractExecutiveCandidates(result.analysis_context);
  assert(snap.highlight_numbers.length <= 4);
  assert((cands.attention_candidates || []).length <= 3);
  assert((cands.positive_candidates || []).length <= 2);
  assert((cands.action_context || []).length <= 3);
});

writeFileSync(resolve(root, "docs/_etapa842_snapshot_sizes.json"), JSON.stringify(sizes, null, 2));

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.4.2 snapshots ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
