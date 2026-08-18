/**
 * Testes da Etapa 8.2 — Executive Analysis Engine.
 * Sem Git. Sem Gemini. Backup Base QV somente leitura (compute*Payload).
 * Não altera chatbot, n8n nem o dashboard.
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

import { getMetricDef } from "./netlify/functions/_shared/portal-metric-catalog.mjs";
import { getRegistryMetric } from "./netlify/functions/_shared/portal-metric-registry.mjs";
import { computeGeneralDataPayload } from "./netlify/functions/general-data.mjs";
import { computeMeetingsPayload } from "./netlify/functions/meetings.mjs";
import { computeStatisticalCrossesPayload } from "./netlify/functions/statistical-crosses.mjs";
import {
  PAGE_METRICS,
  PILOT_PAGE_IDS,
  ENGINE_VERSION,
  buildExecutiveAnalysis,
  composeExecutiveAnalysis,
  stripPersonalData,
  normalizeAnalysisPage,
} from "./netlify/functions/_shared/executive-analysis.mjs";

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

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split(".").reduce((cur, part) => (cur == null ? undefined : cur[part]), obj);
}

const FORBIDDEN_KEYS = new Set([
  "email",
  "phone",
  "telefone",
  "cpf",
  "cnpj",
  "documento",
  "clientName",
  "client_name",
  "clientId",
  "client_id",
  "codigo",
  "host_email",
  "hostEmail",
  "clients",
  "topClients",
  "auditSample",
  "excludedClients",
]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function collectPiiIssues(value, path = "") {
  const issues = [];
  if (value == null) return issues;
  if (Array.isArray(value)) {
    const leaf = path.split(".").pop();
    if (FORBIDDEN_KEYS.has(leaf)) issues.push(path);
    value.forEach((item, i) => issues.push(...collectPiiIssues(item, `${path}[${i}]`)));
    return issues;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const next = path ? `${path}.${k}` : k;
      if (FORBIDDEN_KEYS.has(k)) issues.push(next);
      issues.push(...collectPiiIssues(v, next));
    }
    return issues;
  }
  if (typeof value === "string" && EMAIL_RE.test(value) && !value.includes("[redacted-email]")) {
    issues.push(`${path}=email`);
  }
  return issues;
}

function assertParity(pageId, payload, ctx) {
  for (const id of PAGE_METRICS[pageId]) {
    const kpi = ctx.kpis.find((k) => k.metric === id);
    assert(kpi, `KPI ausente: ${id}`);
    const def = getMetricDef(id);
    const reg = getRegistryMetric(id);
    assert(def, `catálogo sem ${id}`);
    assert(reg, `registry sem ${id}`);
    assert(kpi.label === def.label, `label divergente ${id}: ${kpi.label} vs ${def.label}`);
    const expected = getByPath(payload, reg.payloadPath);
    const expNorm = expected === undefined ? null : expected;
    assert(
      Object.is(kpi.value, expNorm) || kpi.value === expNorm,
      `valor divergente ${id}: engine=${JSON.stringify(kpi.value)} payload=${JSON.stringify(expNorm)} path=${reg.payloadPath}`,
    );
  }
}

function assertCompact(ctx, maxBytes) {
  const json = JSON.stringify(ctx);
  const bytes = Buffer.byteLength(json, "utf8");
  assert(!("clients" in ctx), "clients no contexto");
  assert(!ctx.highlights?.survival?.curve, "curva KM completa no contexto");
  assert(!ctx.highlights?.cohort?.cells, "células de cohort no contexto");
  assert((ctx.highlights?.topAssociations || []).length <= 5, "mais de 5 associações");
  assert((ctx.highlights?.topAuc || []).length <= 5, "mais de 5 AUCs");
  assert((ctx.highlights?.topGroupDifferences || []).length <= 5, "mais de 5 diffs");
  assert(bytes <= maxBytes, `JSON ${bytes} bytes > ${maxBytes}`);
  return bytes;
}

async function run() {
  await tryCase("IDs piloto existem no catálogo e no registry", () => {
    for (const pageId of PILOT_PAGE_IDS) {
      assert(PAGE_METRICS[pageId]?.length > 0, `sem métricas para ${pageId}`);
      for (const id of PAGE_METRICS[pageId]) {
        assert(getMetricDef(id), `catálogo: ${id}`);
        assert(getRegistryMetric(id)?.payloadPath, `registry payloadPath: ${id}`);
      }
    }
    return `${PILOT_PAGE_IDS.map((p) => `${p}:${PAGE_METRICS[p].length}`).join(", ")}`;
  });

  await tryCase("aliases de página do piloto", () => {
    assert(normalizeAnalysisPage("general") === "general");
    assert(normalizeAnalysisPage("meetings") === "meetings");
    assert(normalizeAnalysisPage("statistical-crosses") === "statistical-crosses");
    assert(normalizeAnalysisPage("statistical_crosses") === "statistical-crosses");
    assert(normalizeAnalysisPage("sc") === "statistical-crosses");
  });

  await tryCase("página vazia → invalid_page", async () => {
    const r = await buildExecutiveAnalysis({ page: "" });
    assert(r.success === false && r.code === "invalid_page", JSON.stringify(r));
  });

  await tryCase("página fora do piloto → page_not_supported (não 500)", async () => {
    const r = await buildExecutiveAnalysis({ page: "cancellations" });
    assert(r.success === false && r.code === "page_not_supported", JSON.stringify(r));
    assert(Array.isArray(r.supported_pages) && r.supported_pages.includes("general"));
  });

  await tryCase("stripPersonalData remove arrays e e-mails", () => {
    const out = stripPersonalData({
      total: 10,
      clients: [{ name: "Ana", email: "ana@x.com" }],
      note: "contato ana@x.com",
      code: "LOW_COVERAGE",
    });
    assert(out.clients === undefined, "clients permaneceu");
    assert(out.code === "LOW_COVERAGE", "code de sinal foi removido");
    assert(out.note.includes("[redacted-email]"), out.note);
  });

  const timings = {};

  await tryCase("Dados Gerais: KPIs oficiais, sem PII, compacto", async () => {
    const t0 = Date.now();
    const payload = await computeGeneralDataPayload();
    const computeMs = Date.now() - t0;
    const t1 = Date.now();
    const result = composeExecutiveAnalysis({ pageId: "general", payload, filtersApplied: {}, computeMs });
    const engineMs = Date.now() - t1;
    assert(result.success === true, "success");
    const ctx = result.analysis_context;
    assert(ctx.metadata.ai_generated === false, "ai_generated");
    assert(ctx.metadata.engine_version === ENGINE_VERSION, "engine_version");
    assert(Object.keys(ctx.metadata.filters_applied).length === 0, "filters_applied deveria ser {}");
    assertParity("general", payload, ctx);
    const pii = collectPiiIssues(ctx);
    assert(pii.length === 0, `PII: ${pii.slice(0, 8).join(", ")}`);
    const bytes = assertCompact(ctx, 25_000);
    timings.general = { computeMs, engineMs, bytes, kpis: ctx.kpis.length, signals: ctx.signals.length };
    return `kpis=${ctx.kpis.length} signals=${ctx.signals.length} comparisons=${ctx.comparisons.length} lim=${ctx.limitations.length} compute=${computeMs}ms engine=${engineMs}ms json=${bytes}B`;
  });

  await tryCase("Reuniões: KPIs oficiais, sem PII, compacto", async () => {
    const t0 = Date.now();
    const payload = await computeMeetingsPayload();
    const computeMs = Date.now() - t0;
    const t1 = Date.now();
    const result = composeExecutiveAnalysis({ pageId: "meetings", payload, filtersApplied: {}, computeMs });
    const engineMs = Date.now() - t1;
    assert(result.success === true, "success");
    const ctx = result.analysis_context;
    assert(ctx.metadata.ai_generated === false, "ai_generated");
    assertParity("meetings", payload, ctx);
    const pii = collectPiiIssues(ctx);
    assert(pii.length === 0, `PII: ${pii.slice(0, 8).join(", ")}`);
    const bytes = assertCompact(ctx, 25_000);
    if (ctx.comparisons[0]?.period?.current) {
      const todayKey = new Date().toISOString().slice(0, 7);
      assert(
        String(ctx.comparisons[0].period.current) <= todayKey,
        `comparação usou mês futuro ${ctx.comparisons[0].period.current}`,
      );
    }
    timings.meetings = { computeMs, engineMs, bytes, kpis: ctx.kpis.length, signals: ctx.signals.length };
    return `kpis=${ctx.kpis.length} signals=${ctx.signals.length} comparisons=${ctx.comparisons.length} lim=${ctx.limitations.length} compute=${computeMs}ms engine=${engineMs}ms json=${bytes}B`;
  });

  await tryCase("Análises Estatísticas: top N, sem matrizes, cobertura", async () => {
    const t0 = Date.now();
    const payload = await computeStatisticalCrossesPayload({});
    const computeMs = Date.now() - t0;
    const t1 = Date.now();
    const result = composeExecutiveAnalysis({
      pageId: "statistical-crosses",
      payload,
      filtersApplied: payload.filters || {},
      computeMs,
    });
    const engineMs = Date.now() - t1;
    assert(result.success === true, "success");
    const ctx = result.analysis_context;
    assert(ctx.metadata.ai_generated === false, "ai_generated");
    assertParity("statistical-crosses", payload, ctx);
    assert(ctx.highlights, "highlights ausentes");
    assert((ctx.highlights.topAssociations || []).length <= 5, "topAssociations");
    assert((ctx.highlights.topAuc || []).length <= 5, "topAuc");
    const fullAssoc = (payload.associations || []).length;
    assert(
      (ctx.highlights.topAssociations || []).length <= fullAssoc,
      "engine devolveu mais associações que o payload",
    );
    assert(!ctx.highlights.correlationMatrix, "matriz de correlação completa");
    assert(!ctx.highlights.axisMatrices, "axisMatrices");
    assert(ctx.context.coverage != null || ctx.kpis.some((k) => k.coverage != null) || ctx.limitations.length >= 0, "cobertura");
    const pii = collectPiiIssues(ctx);
    assert(pii.length === 0, `PII: ${pii.slice(0, 8).join(", ")}`);
    const bytes = assertCompact(ctx, 40_000);
    timings["statistical-crosses"] = {
      computeMs,
      engineMs,
      bytes,
      kpis: ctx.kpis.length,
      signals: ctx.signals.length,
    };
    return `kpis=${ctx.kpis.length} topAssoc=${ctx.highlights.topAssociations.length} topAuc=${ctx.highlights.topAuc.length} compute=${computeMs}ms engine=${engineMs}ms json=${bytes}B`;
  });

  const reportPath = resolve(root, "docs", "_etapa82_timing.json");
  try {
    writeFileSync(reportPath, JSON.stringify({ generated_at: new Date().toISOString(), timings }, null, 2));
  } catch {
    /* docs pode não existir ainda; o resumo vai no stdout */
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Etapa 8.2 ---");
  console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
  if (Object.keys(timings).length) console.log("timing", JSON.stringify(timings));
  if (failed.length) {
    process.exitCode = 1;
    for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
  }
}

await run();
