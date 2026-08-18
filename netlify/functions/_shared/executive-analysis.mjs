/**
 * Executive Analysis Engine (Etapa 8.2)
 *
 * Transforma payloads oficiais das páginas (compute*Payload) em um contexto
 * compacto e sem PII para análise executiva futura.
 *
 * Não recalcula KPIs. Não chama Gemini. Não interpreta "bom/ruim" de negócio.
 */

import {
  getMetricDef,
  PAGE_LABELS,
  normalizePortalPage,
  METRIC_STATUS,
  ACTIVE_PORTAL_PAGES,
} from "./portal-metric-catalog.mjs";
import { getRegistryMetric } from "./portal-metric-registry.mjs";
import { buildExecutiveSnapshot, estimateJsonBytes } from "./executive-snapshot.mjs";

export const ENGINE_VERSION = "8.9";

/**
 * Heurísticas de exibição executiva — NÃO são regras de negócio do dashboard.
 * Reusam limiares já usados em Análises Estatísticas (MIN_GROUP=30, cobertura 20%).
 */
export const EXECUTIVE_DISPLAY_HEURISTICS = Object.freeze({
  coverageHighAttentionBelow: 20,
  coverageMediumAttentionBelow: 50,
  smallSampleThreshold: 30,
  topN: 5,
  note: "executive display heuristic — not a business rule",
});

const PII_KEY = /^(email|e-?mail|phone|telefone|cpf|cnpj|documento|nome|clientName|client_name|clientId|client_id|codigo|clientCode|client_code|host_email|hostEmail)$/i;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PII_ARRAY_KEYS = new Set([
  "clients",
  "topClients",
  "excludedClients",
  "auditSample",
  "renewalExcludedFromStats",
]);

const PAGE_ALIASES = {
  general: "general",
  meetings: "meetings",
  "statistical-crosses": "statistical-crosses",
  statistical_crosses: "statistical-crosses",
  sc: "statistical-crosses",
  exploration: "statistical-crosses",
  crossings: "statistical-crosses",
  discoveries: "statistical-crosses",
  renewal: "renewal",
  renovacao: "renewal",
  renovação: "renewal",
  ep: "ep",
  "ep-performance": "ep",
  ep_performance: "ep",
  "performance-ep": "ep",
  temporal: "temporal",
  "indicadores-temporais": "temporal",
  "temporal-indicators": "temporal",
  temporal_indicators: "temporal",
};

export const PILOT_PAGE_IDS = Object.freeze(["general", "meetings", "statistical-crosses"]);
export const EXECUTIVE_ANALYSIS_PAGES = Object.freeze([
  "general",
  "meetings",
  "statistical-crosses",
  "renewal",
  "ep",
  "temporal",
]);

const PAGE_METRICS = {
  general: [
    "total_clients",
    "active_clients",
    "frozen_clients",
    "cancelled_clients",
    "cancelled_without_confirmed_date",
    "non_active_clients",
    "median_stay_days",
    "median_monthly_income",
    "median_last_contribution",
    "median_liquidity_reserve",
    "clients_with_financial_data",
  ],
  meetings: [
    "total_meetings",
    "eligible_meetings",
    "attendance_rate",
    "no_show_rate",
    "no_show_meetings",
    "total_meeting_reschedules",
    "clients_with_meeting",
    "clients_with_first_meeting",
    "average_interval_between_meetings",
    "days_since_latest_meeting",
    "cancelled_meetings_count",
  ],
  "statistical-crosses": [
    "sc_top_association",
    "sc_active_clients",
    "sc_confirmed_cancellations",
    "sc_renewed_clients",
    "sc_cycle1_clients",
    "sc_nps",
    "sc_nps_responses",
  ],
  ep: [
    "ep_meeting_coverage",
    "ep_clients_without_meeting",
    "nps_official_index",
    "nps_official_responses",
  ],
  temporal: [
    "temporal_financial_updates",
    "temporal_active_with_signals",
    "temporal_total_subjects",
  ],
};

function nowIso() {
  return new Date().toISOString();
}

function round1(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n) * 10) / 10;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  let cur = obj;
  for (const part of String(path).split(".")) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function fillPercent(filled, total) {
  const n = Number(filled);
  const d = Number(total);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

function formatCatalogSource(source) {
  if (!source) return null;
  if (typeof source === "string") return source;
  const path = [source.schema, source.table, source.column].filter(Boolean).join(".");
  if (source.origin || source.system) {
    return `${source.origin || source.system}${path ? ` · ${path}` : ""}`;
  }
  if (source.schema === "public" || source.schema === "public".toLowerCase()) {
    return path ? `BASE QV · ${path}` : "BASE QV";
  }
  return path || null;
}

export function normalizeAnalysisPage(page) {
  const raw = String(page || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (PAGE_ALIASES[raw]) return PAGE_ALIASES[raw];
  if (PAGE_ALIASES[lower]) return PAGE_ALIASES[lower];
  const catalog = normalizePortalPage(raw);
  if (catalog && PAGE_ALIASES[catalog]) return PAGE_ALIASES[catalog];
  return null;
}

export function isPilotPage(page) {
  return PILOT_PAGE_IDS.includes(normalizeAnalysisPage(page));
}

export function isSupportedAnalysisPage(page) {
  return EXECUTIVE_ANALYSIS_PAGES.includes(normalizeAnalysisPage(page));
}

function isKnownPortalPage(page) {
  const raw = String(page || "").trim();
  if (!raw) return false;
  if (normalizeAnalysisPage(raw)) return true;
  const catalog = normalizePortalPage(raw);
  const lower = raw.toLowerCase();
  return ACTIVE_PORTAL_PAGES.includes(lower)
    || ACTIVE_PORTAL_PAGES.includes(catalog)
    || Boolean(PAGE_LABELS[lower])
    || Boolean(PAGE_LABELS[catalog]);
}

let statisticalComputePromise = null;
async function computeStatisticalCrossesPayloadLazy(options = {}) {
  if (!statisticalComputePromise) {
    statisticalComputePromise = import("../statistical-crosses.mjs").then(
      (m) => m.computeStatisticalCrossesPayload,
    );
  }
  const compute = await statisticalComputePromise;
  return compute(options);
}

async function loadOfficialPayload(pageId, filters) {
  if (pageId === "general") {
    const { computeGeneralDataPayload } = await import("../general-data.mjs");
    return { payload: await computeGeneralDataPayload(), filtersApplied: {} };
  }
  if (pageId === "meetings") {
    const { computeMeetingsPayload } = await import("../meetings.mjs");
    return { payload: await computeMeetingsPayload(), filtersApplied: {} };
  }
  if (pageId === "statistical-crosses") {
    const safeFilters = filters && typeof filters === "object" && !Array.isArray(filters)
      ? filters
      : {};
    const payload = await computeStatisticalCrossesPayloadLazy({ filters: safeFilters });
    return {
      payload,
      filtersApplied: payload?.filters && typeof payload.filters === "object" ? payload.filters : safeFilters,
    };
  }
  if (pageId === "renewal") {
    const { computeGeneralDataPayload } = await import("../general-data.mjs");
    return { payload: await computeGeneralDataPayload(), filtersApplied: {} };
  }
  if (pageId === "ep") {
    const { computeEpPerformancePayload } = await import("../ep-performance.mjs");
    return { payload: await computeEpPerformancePayload(), filtersApplied: {} };
  }
  if (pageId === "temporal") {
    const { computeTemporalIndicatorsPayload } = await import("../temporal-indicators.mjs");
    return { payload: await computeTemporalIndicatorsPayload(), filtersApplied: {} };
  }
  return null;
}

function coverageForMetric(metricId, payload) {
  const s = payload?.summary || {};
  const map = {
    median_stay_days: s.stayCoveragePercent,
    clients_with_financial_data: s.financialProfilePercent,
    median_monthly_income: fillPercent(s.monthlyIncomeFilledCount, s.totalClients),
    median_last_contribution: fillPercent(s.lastContributionFilledCount, s.totalClients),
    median_liquidity_reserve: fillPercent(s.liquidityReserveFilledCount, s.totalClients),
    clients_with_first_meeting: s.firstMeetingCompletionRate,
    clients_with_meeting: s.meetingCoverageRate,
    sc_nps: s.npsPortfolioCoverage,
    sc_nps_responses: s.npsPortfolioCoverage,
  };
  const value = map[metricId];
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function buildKpi(metricId, payload) {
  const def = getMetricDef(metricId);
  const reg = getRegistryMetric(metricId);
  if (!def && !reg) return null;

  const path = reg?.payloadPath;
  let value = path ? getByPath(payload, path) : undefined;
  if (value === undefined && def?.summaryField) {
    value = getByPath(payload, `summary.${def.summaryField}`);
  }
  if (typeof value === "undefined") value = null;

  const sampleSizePath = reg?.sampleSizePath;
  const sampleSize = sampleSizePath ? getByPath(payload, sampleSizePath) : null;
  const sources = (def?.sources || []).map(formatCatalogSource).filter(Boolean);
  const status = def?.status || METRIC_STATUS.confirmed;
  const coverage = coverageForMetric(metricId, payload);

  return {
    metric: metricId,
    label: def?.label || reg?.label || metricId,
    value: value ?? null,
    unit: def?.unit || reg?.unit || null,
    status,
    source: sources,
    coverage,
    sample_size: sampleSize == null || !Number.isFinite(Number(sampleSize)) ? null : Number(sampleSize),
  };
}

function addSignal(list, signal) {
  if (!signal?.code) return;
  if (list.some((s) => s.code === signal.code && s.metric === signal.metric)) return;
  list.push(signal);
}

function buildSignalsAndLimitations(kpis, payload, pageId) {
  const signals = [];
  const limitations = [];
  const H = EXECUTIVE_DISPLAY_HEURISTICS;

  for (const kpi of kpis) {
    const def = getMetricDef(kpi.metric);
    if (kpi.value == null) {
      addSignal(signals, {
        type: "limitation",
        severity: "medium",
        code: "METRIC_UNAVAILABLE",
        metric: kpi.metric,
        message: `O indicador "${kpi.label}" não possui valor neste recorte.`,
        evidence: { value: null },
      });
      limitations.push({
        code: "METRIC_UNAVAILABLE",
        metric: kpi.metric,
        message: `"${kpi.label}" está ausente (value = null).`,
      });
    }

    if (kpi.coverage != null && Number.isFinite(kpi.coverage)) {
      if (kpi.coverage < H.coverageHighAttentionBelow) {
        addSignal(signals, {
          type: "warning",
          severity: "high",
          code: "LOW_COVERAGE",
          metric: kpi.metric,
          message: "A cobertura deste indicador é baixa.",
          evidence: { value: kpi.coverage, unit: "percent", heuristic: H.note },
        });
        limitations.push({
          code: "LOW_COVERAGE",
          metric: kpi.metric,
          message: `Cobertura de "${kpi.label}" em ${kpi.coverage}% (heurística de exibição: < ${H.coverageHighAttentionBelow}%).`,
        });
      } else if (kpi.coverage < H.coverageMediumAttentionBelow) {
        addSignal(signals, {
          type: "warning",
          severity: "medium",
          code: "MODERATE_COVERAGE",
          metric: kpi.metric,
          message: "A cobertura deste indicador é moderada.",
          evidence: { value: kpi.coverage, unit: "percent", heuristic: H.note },
        });
        limitations.push({
          code: "MODERATE_COVERAGE",
          metric: kpi.metric,
          message: `Cobertura de "${kpi.label}" em ${kpi.coverage}%.`,
        });
      }
    }

    const sample = kpi.sample_size;
    const isCountOfUniverse = kpi.metric === "total_clients" || kpi.metric === "total_meetings";
    if (
      !isCountOfUniverse
      && sample != null
      && sample < H.smallSampleThreshold
      && sample > 0
      && (kpi.unit === "clients" || kpi.unit === "meetings" || def?.aggregation === "median" || def?.aggregation === "average" || def?.aggregation === "rate")
    ) {
      addSignal(signals, {
        type: "warning",
        severity: "medium",
        code: "SMALL_SAMPLE",
        metric: kpi.metric,
        message: "A amostra deste indicador é pequena. O resultado não está errado, mas é menos estável.",
        evidence: { value: sample, unit: kpi.unit, heuristic: H.note },
      });
      limitations.push({
        code: "SMALL_SAMPLE",
        metric: kpi.metric,
        message: `Amostra de "${kpi.label}" = ${sample} (limiar de exibição: ${H.smallSampleThreshold}).`,
      });
    }

    if (kpi.status === METRIC_STATUS.needs_business_validation) {
      addSignal(signals, {
        type: "warning",
        severity: "medium",
        code: "NEEDS_BUSINESS_VALIDATION",
        metric: kpi.metric,
        message: "Este indicador ainda precisa de validação de negócio.",
        evidence: { status: kpi.status },
      });
      limitations.push({
        code: "NEEDS_BUSINESS_VALIDATION",
        metric: kpi.metric,
        message: `"${kpi.label}" está marcado como needs_business_validation no catálogo.`,
      });
    }

    if (kpi.status === METRIC_STATUS.partial || def?.executionKind === "pending") {
      limitations.push({
        code: kpi.status === METRIC_STATUS.partial ? "PARTIAL_SOURCE" : "PENDING_EXECUTOR",
        metric: kpi.metric,
        message: kpi.status === METRIC_STATUS.partial
          ? `"${kpi.label}" tem fonte/cobertura parcial.`
          : `"${kpi.label}" ainda não possui executor completo.`,
      });
    }

    for (const note of def?.limitations || []) {
      limitations.push({ code: "CATALOG_LIMITATION", metric: kpi.metric, message: String(note) });
    }
  }

  const rescheduleNote = payload?.metadata?.rescheduleCoverageNote;
  if (pageId === "meetings" && rescheduleNote) {
    limitations.push({
      code: "PARTIAL_SOURCE",
      metric: "total_meeting_reschedules",
      message: rescheduleNote,
    });
  }

  const warnings = payload?.quality?.warnings || payload?.qualityWarnings || [];
  for (const w of warnings) {
    const message = typeof w === "string" ? w : w?.message;
    if (!message) continue;
    limitations.push({
      code: typeof w === "object" && w.code ? String(w.code).toUpperCase() : "PAYLOAD_WARNING",
      metric: null,
      message: String(message),
    });
  }

  const pending = payload?.pending;
  if (pending && typeof pending === "object") {
    for (const [key, item] of Object.entries(pending)) {
      if (item?.available === false || item?.status === "unavailable") {
        limitations.push({
          code: "SOURCE_UNAVAILABLE",
          metric: key,
          message: item.note || `${key} indisponível neste recorte.`,
        });
      }
    }
  }

  const seen = new Set();
  const uniqueLimitations = [];
  for (const item of limitations) {
    const key = `${item.code}|${item.metric || ""}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLimitations.push(item);
  }

  return { signals, limitations: uniqueLimitations };
}

function monthComparison(metric, current, previous, unit) {
  if (current == null || previous == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) {
    return null;
  }
  const cur = Number(current);
  const prev = Number(previous);
  const abs = round1(cur - prev);
  const rel = prev === 0 ? null : round1(((cur - prev) / Math.abs(prev)) * 100);
  return {
    metric,
    current: cur,
    previous: prev,
    absolute_change: abs,
    relative_change: rel,
    direction: abs > 0 ? "up" : abs < 0 ? "down" : "flat",
    unit,
  };
}

function recentMeetingMonths(payload) {
  const todayKey = new Date().toISOString().slice(0, 7);
  return [...(payload?.distributions?.meetingsByMonth || [])]
    .filter((row) => String(row.month || row.label || "") <= todayKey)
    .sort((a, b) => String(b.month || b.label).localeCompare(String(a.month || a.label)));
}

function buildComparisons(pageId, payload) {
  const comparisons = [];
  if (pageId === "general") {
    const months = payload?.distributions?.acquisitionsByMonth || [];
    if (months.length >= 2) {
      const cmp = monthComparison(
        "latest_month_acquisitions",
        months[0]?.acquiredClients,
        months[1]?.acquiredClients,
        "clients",
      );
      if (cmp) {
        cmp.period = { current: months[0]?.month || months[0]?.label, previous: months[1]?.month || months[1]?.label };
        comparisons.push(cmp);
      }
    }
  }
  if (pageId === "meetings") {
    const months = recentMeetingMonths(payload);
    if (months.length >= 2) {
      const cmp = monthComparison(
        "meetings_completed_by_month",
        months[0]?.completed,
        months[1]?.completed,
        "meetings",
      );
      if (cmp) {
        cmp.period = { current: months[0].month || months[0].label, previous: months[1].month || months[1].label };
        comparisons.push(cmp);
      }
    }
  }
  return comparisons;
}

function historyLimitation(pageId, payload, comparisons) {
  if (pageId === "general" && (payload?.distributions?.acquisitionsByMonth || []).length < 2) {
    return {
      code: "INSUFFICIENT_HISTORY",
      metric: "latest_month_acquisitions",
      message: "Série mensal de aquisições com menos de dois pontos — comparação temporal não disponível.",
    };
  }
  if (pageId === "meetings" && recentMeetingMonths(payload).length < 2) {
    return {
      code: "INSUFFICIENT_HISTORY",
      metric: "meetings_completed_by_month",
      message: "Série mensal de reuniões com menos de dois pontos — comparação temporal não disponível.",
    };
  }
  if ((pageId === "general" || pageId === "meetings") && comparisons.length === 0) {
    return {
      code: "INSUFFICIENT_HISTORY",
      metric: null,
      message: "Histórico insuficiente para montar comparações temporais neste recorte.",
    };
  }
  return null;
}

function pickTop(list, n, scoreFn) {
  return [...(list || [])]
    .filter((row) => row && scoreFn(row) != null && Number.isFinite(Number(scoreFn(row))))
    .sort((a, b) => Math.abs(Number(scoreFn(b))) - Math.abs(Number(scoreFn(a))))
    .slice(0, n);
}

function compactAssociation(row) {
  return {
    id: row.id || null,
    label: row.label || null,
    type: row.type || null,
    value: row.association ?? row.value ?? row.measure ?? null,
    abs: row.absMeasure ?? row.associationAbs ?? row.abs ?? null,
    strength: row.strength || row.associationStrength || null,
    coverage: row.coveragePercent ?? row.coverage ?? null,
    sample: row.sample ?? row.n ?? row.sampleSize ?? null,
    status: row.status || null,
  };
}

function compactAuc(row) {
  return {
    id: row.id || null,
    label: row.label || null,
    auc: row.auc ?? row.aucAdjusted ?? null,
    coverage: row.coveragePercent ?? row.coverage ?? null,
    sample: row.sample ?? null,
    direction: row.direction || row.aucDirection || null,
    status: row.status || null,
  };
}

function compactDiff(row) {
  return {
    id: row.id || null,
    label: row.label || null,
    stdDiff: row.stdDiff ?? row.standardizedDifference ?? null,
    activeMedian: row.activeMedian ?? row.medianActive ?? null,
    cancelledMedian: row.cancelledMedian ?? row.medianCancelled ?? null,
    coverage: row.coveragePercent ?? row.coverage ?? null,
    sample: row.sampleSize ?? row.n ?? null,
    status: row.status || null,
  };
}

function compactStatisticalHighlights(payload) {
  const n = EXECUTIVE_DISPLAY_HEURISTICS.topN;
  const associations = payload?.associations || [
    ...(payload?.churnAssociations?.numeric || []),
    ...(payload?.churnAssociations?.categorical || []),
  ];
  const aucRows = payload?.univariateAuc || payload?.predictivePower || [];
  const diffs = payload?.activeVsCancelled || payload?.groupDifferences || [];
  const survival = payload?.survival?.overall || {};
  const cohort = payload?.cohort || {};
  const discoveries = (payload?.discoveries || payload?.simpleInsights || []).slice(0, n).map((d) => ({
    id: d.id || null,
    title: d.title || null,
    text: d.text ? String(d.text).slice(0, 400) : null,
    category: d.category || d.section || null,
    coverage: d.coverage ?? null,
    sample: d.sample ?? null,
    strength: d.strength || null,
    lowConfidence: Boolean(d.lowConfidence),
  }));
  const riskRules = (payload?.riskRules || []).slice(0, n).map((r) => ({
    id: r.id || r.code || null,
    label: r.label || r.title || null,
    coverage: r.coverage ?? null,
    sample: r.sample ?? r.n ?? null,
  }));

  return {
    topAssociations: pickTop(associations, n, (r) => r.absMeasure ?? r.associationAbs ?? r.abs).map(compactAssociation),
    topAuc: pickTop(aucRows, n, (r) => r.auc ?? r.aucAdjusted).map(compactAuc),
    topGroupDifferences: pickTop(diffs, n, (r) => r.stdDiff ?? r.standardizedDifference ?? r.diffAbs).map(compactDiff),
    survival: {
      medianSurvival: survival.medianSurvival ?? null,
      atRisk: payload?.survival?.atRisk ?? null,
      events: survival.events ?? survival.eventCount ?? null,
      logRankP: payload?.survival?.logRank?.p ?? payload?.survival?.logRank?.pValue ?? null,
    },
    cohort: {
      periodLabel: cohort.periodLabel || cohort.periodMode || null,
      cohortCount: cohort.metadata?.cohortCount ?? cohort.cohorts?.length ?? null,
      clientsWithHire: cohort.metadata?.clientsWithHire ?? null,
      averages: (cohort.averages || []).slice(0, n).map((a) => ({
        age: a.age,
        meanRetentionPct: a.meanRetentionPct ?? null,
        deltaPp: a.deltaPp ?? null,
        cohortsObservable: a.cohortsObservable ?? null,
      })),
    },
    nps: {
      index: payload?.summary?.npsIndex ?? null,
      responses: payload?.summary?.validNpsResponses ?? payload?.summary?.npsResponses ?? null,
      coverage: payload?.summary?.npsPortfolioCoverage ?? null,
    },
    discoveries,
    riskRules,
  };
}

function contextForPage(pageId, payload, filtersApplied) {
  const s = payload?.summary || {};
  if (pageId === "general") {
    return {
      population: s.totalClients ?? null,
      filtered_population: s.totalClients ?? null,
      coverage: s.financialProfilePercent ?? s.stayCoveragePercent ?? null,
    };
  }
  if (pageId === "meetings") {
    const population = payload?.metadata?.noShowFrequencyUniverse
      ?? (Array.isArray(payload?.clients) ? payload.clients.length : null);
    return {
      population,
      filtered_population: population,
      coverage: s.meetingCoverageRate ?? s.firstMeetingCompletionRate ?? null,
    };
  }
  return {
    population: s.analyzedClients ?? payload?.population?.total ?? null,
    filtered_population: s.analyzedClients ?? payload?.population?.total ?? null,
    coverage: s.averageCoverage ?? s.npsPortfolioCoverage ?? null,
  };
}

function containsPiiKey(key) {
  return PII_KEY.test(String(key || ""));
}

export function stripPersonalData(value, key = "") {
  if (value == null) return value;
  if (PII_ARRAY_KEYS.has(key)) return undefined;
  if (containsPiiKey(key)) return undefined;
  if (typeof value === "string") {
    return value.replace(EMAIL_IN_TEXT, "[redacted-email]");
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => stripPersonalData(item, key))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_ARRAY_KEYS.has(k) || containsPiiKey(k)) continue;
      const next = stripPersonalData(v, k);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }
  return value;
}

function estimateBytes(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

/**
 * Monta o contexto a partir de um payload oficial já calculado (sem novo fetch).
 * Usado pela engine e pelos testes de paridade.
 */
export function composeExecutiveAnalysis({
  pageId,
  payload,
  filtersApplied = {},
  computeMs = null,
  generatedAt = nowIso(),
} = {}) {
  const engineStarted = Date.now();
  const kpis = (PAGE_METRICS[pageId] || [])
    .map((id) => buildKpi(id, payload))
    .filter(Boolean);
  const { signals, limitations } = buildSignalsAndLimitations(kpis, payload, pageId);
  const comparisons = buildComparisons(pageId, payload);
  const history = historyLimitation(pageId, payload, comparisons);
  if (history) limitations.push(history);
  const highlights = pageId === "statistical-crosses" ? compactStatisticalHighlights(payload) : undefined;
  const snapshotStarted = Date.now();
  const executiveSnapshot = buildExecutiveSnapshot(pageId, payload, { filters: filtersApplied });
  const snapshotMs = Date.now() - snapshotStarted;

  const analysis = stripPersonalData({
    page: pageId,
    title: PAGE_LABELS[pageId] || pageId,
    generated_at: generatedAt,
    context: contextForPage(pageId, payload, filtersApplied),
    kpis,
    signals,
    comparisons,
    limitations,
    highlights,
    executive_snapshot: executiveSnapshot,
    metadata: {
      engine_version: ENGINE_VERSION,
      data_generated_at: payload?.generatedAt || generatedAt,
      page: pageId,
      filters_applied: filtersApplied || {},
      ai_generated: false,
      heuristics: EXECUTIVE_DISPLAY_HEURISTICS,
      scope: executiveSnapshot?.scope || null,
    },
  });

  const engineMs = Date.now() - engineStarted;
  analysis.metadata.timing_ms = {
    compute_payload: computeMs,
    snapshot: snapshotMs,
    engine: Math.max(0, engineMs - snapshotMs),
  };
  analysis.metadata.payload_bytes = estimateBytes(analysis);
  analysis.metadata.snapshot_bytes = estimateJsonBytes(executiveSnapshot);
  analysis.metadata.context_bytes_without_snapshot = estimateBytes({
    ...analysis,
    executive_snapshot: undefined,
  });

  return {
    success: true,
    page: pageId,
    title: analysis.title,
    generated_at: generatedAt,
    analysis_context: analysis,
  };
}

/**
 * @param {{ page: string, filters?: object }} input
 * @returns {Promise<object>}
 */
export async function buildExecutiveAnalysis(input = {}) {
  const generatedAt = nowIso();
  const rawPage = String(input.page || "").trim();
  if (!rawPage) {
    return {
      success: false,
      code: "invalid_page",
      error: "Informe a página da análise.",
      generated_at: generatedAt,
    };
  }

  const pageId = normalizeAnalysisPage(rawPage);
  if (!pageId || !EXECUTIVE_ANALYSIS_PAGES.includes(pageId)) {
    const display = pageId || normalizePortalPage(rawPage) || rawPage;
    return {
      success: false,
      code: "page_not_supported",
      error: "Esta página ainda não faz parte do piloto da Análise com IA.",
      page: display,
      title: PAGE_LABELS[display] || PAGE_LABELS[pageId] || display,
      generated_at: generatedAt,
      supported_pages: [...EXECUTIVE_ANALYSIS_PAGES],
    };
  }

  const computeStarted = Date.now();
  const loaded = await loadOfficialPayload(pageId, input.filters);
  const computeMs = Date.now() - computeStarted;
  if (!loaded?.payload) {
    const err = new Error("Payload oficial indisponível.");
    err.code = "data_query_failed";
    throw err;
  }

  return composeExecutiveAnalysis({
    pageId,
    payload: loaded.payload,
    filtersApplied: loaded.filtersApplied,
    computeMs,
    generatedAt,
  });
}

export { PAGE_METRICS, isKnownPortalPage };
