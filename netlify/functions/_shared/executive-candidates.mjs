/**
 * Candidatos executivos (Etapa 8.3.2).
 * Seleciona fatos já presentes em analysis_context.
 * Não recalcula KPIs. Não inventa regra de negócio.
 */

import { getExecutivePageProfile } from "./executive-page-profiles.mjs";

export const CANDIDATE_HEURISTICS = Object.freeze({
  relativeChangeAbsMin: 10,
  note: "executive display heuristic — not a business rule",
});

/**
 * Semântica de direção só para métricas piloto com interpretação segura.
 * Não é regra empresarial universal.
 */
export const PILOT_DIRECTION_MAP = Object.freeze({
  attendance_rate: "higher_is_better",
  no_show_rate: "lower_is_better",
  meetings_completed_by_month: "higher_is_contextually_positive",
  latest_month_acquisitions: "higher_is_contextually_positive",
  temporal_meetings: "higher_is_contextually_positive",
  temporal_logins: "higher_is_contextually_positive",
  temporal_financial_updates: "higher_is_contextually_positive",
  temporal_implementations: "higher_is_contextually_positive",
});

export const LIMITATION_CODES = Object.freeze([
  "LOW_COVERAGE",
  "MODERATE_COVERAGE",
  "SMALL_SAMPLE",
  "NEEDS_BUSINESS_VALIDATION",
  "METRIC_UNAVAILABLE",
  "PARTIAL_SOURCE",
  "INSUFFICIENT_HISTORY",
  "PENDING_EXECUTOR",
  "CATALOG_LIMITATION",
]);

const STAT_CATEGORY = {
  association: "association",
  predictive_discrimination: "predictive_discrimination",
  group_difference: "group_difference",
  survival_difference: "survival_difference",
  cohort_pattern: "cohort_pattern",
};

function evidenceFromKpi(kpi) {
  if (!kpi) return null;
  return {
    metric: kpi.metric,
    value: kpi.value,
    unit: kpi.unit || null,
    coverage: kpi.coverage ?? null,
  };
}

function kpiById(context, id) {
  return (context?.kpis || []).find((k) => k.metric === id) || null;
}

function comparisonDirectionMeaning(metric, direction) {
  const sem = PILOT_DIRECTION_MAP[metric];
  if (!sem || !direction || direction === "flat") return null;
  const down = direction === "down";
  const up = direction === "up";
  if (sem === "higher_is_better" || sem === "higher_is_contextually_positive") {
    if (down) return "unfavorable";
    if (up) return "favorable";
  }
  if (sem === "lower_is_better") {
    if (up) return "unfavorable";
    if (down) return "favorable";
  }
  return null;
}

function magnitudeRelevant(cmp) {
  const rel = cmp?.relative_change;
  if (rel == null || !Number.isFinite(Number(rel))) return false;
  return Math.abs(Number(rel)) >= CANDIDATE_HEURISTICS.relativeChangeAbsMin;
}

function pushUnique(list, item) {
  if (!item?.id) return;
  if (list.some((x) => x.id === item.id)) return;
  list.push(item);
}

export function categorizeStatisticalFact(kind) {
  return STAT_CATEGORY[kind] || null;
}

export function statisticalLanguageGuide(category) {
  if (category === "association") {
    return 'usar "associado", "relacionado", "apresentou relação" — nunca causa';
  }
  if (category === "predictive_discrimination") {
    return 'usar "capacidade de discriminação" — nunca "taxa de acerto"';
  }
  if (category === "group_difference") {
    return 'usar "o grupo apresentou diferença"';
  }
  if (category === "survival_difference") {
    return 'usar "diferença de permanência/sobrevivência observada"';
  }
  if (category === "cohort_pattern") {
    return 'descrever o padrão de cohort observado, sem causalidade';
  }
  return "não atribuir causalidade";
}

const METHOD_EVIDENCE_LABEL = {
  association: "Força da associação",
  predictive_discrimination: "Capacidade de diferenciar grupos",
  group_difference: "Diferença entre grupos",
};

const VARIABLE_PHRASE = {
  daysToFirstMeeting: "tempo até a primeira reunião",
  hasMeeting: "possuir reunião",
  stayDays: "permanência",
  meetingsPerMonth: "reuniões por mês de permanência",
  meetingCount: "volume de reuniões",
  engineer: "Engenheiro Patrimonial",
  implementationPercent: "percentual implementado",
};

export function normalizeInsightTopic(id, label = "") {
  const raw = String(id || label || "").trim();
  if (!raw) return "";
  return raw;
}

export function executiveVariablePhrase(id, label = "") {
  if (VARIABLE_PHRASE[id]) return VARIABLE_PHRASE[id];
  const text = String(label || "").trim();
  if (/dias até primeira reunião/i.test(text)) return "tempo até a primeira reunião";
  if (text) return text.charAt(0).toLowerCase() + text.slice(1);
  return "esta variável";
}

function methodValue(row, kind) {
  if (kind === "association") return row.abs ?? row.value ?? null;
  if (kind === "predictive_discrimination") return row.auc ?? row.value ?? null;
  if (kind === "group_difference") return row.stdDiff ?? row.value ?? null;
  return row.value ?? null;
}

function methodUnit(kind) {
  if (kind === "association") return "association";
  if (kind === "predictive_discrimination") return "auc";
  if (kind === "group_difference") return "std_diff";
  return null;
}

function coverageOk(row, min = 15) {
  if (row?.coverage == null) return true;
  return Number(row.coverage) >= min;
}

function collectStatisticalMethodRows(snapshot) {
  const h = snapshot?.highlights || {};
  const rows = [];
  for (const row of h.top_associations || []) {
    if (!row?.id && !row?.label) continue;
    rows.push({
      ...row,
      kind: "association",
      topic: normalizeInsightTopic(row.id, row.label),
      score: Math.abs(Number(row.abs ?? row.value ?? 0)),
    });
  }
  for (const row of h.top_aucs || []) {
    if (!row?.id && !row?.label) continue;
    rows.push({
      ...row,
      kind: "predictive_discrimination",
      topic: normalizeInsightTopic(row.id, row.label),
      score: Number(row.auc ?? 0),
    });
  }
  for (const row of h.top_group_differences || []) {
    if (!row?.id && !row?.label) continue;
    rows.push({
      ...row,
      kind: "group_difference",
      topic: normalizeInsightTopic(row.id, row.label),
      score: Math.abs(Number(row.stdDiff ?? 0)),
    });
  }
  return rows;
}

function groupRowsByTopic(rows) {
  const map = new Map();
  for (const row of rows) {
    const topic = row.topic;
    if (!topic) continue;
    if (!map.has(topic)) {
      map.set(topic, {
        topic,
        id: row.id || topic,
        label: row.label || "",
        methods: [],
      });
    }
    const group = map.get(topic);
    if (!group.methods.some((item) => item.kind === row.kind)) {
      group.methods.push(row);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.methods.length !== a.methods.length) return b.methods.length - a.methods.length;
    const aScore = Math.max(...a.methods.map((m) => Number(m.score) || 0));
    const bScore = Math.max(...b.methods.map((m) => Number(m.score) || 0));
    return bScore - aScore;
  });
}

function evidenceFromMethods(group) {
  return group.methods.map((row) => ({
    metric: group.id,
    label: METHOD_EVIDENCE_LABEL[row.kind] || "Indicador",
    value: methodValue(row, row.kind),
    unit: methodUnit(row.kind),
    sample: row.sample ?? null,
    coverage: row.coverage ?? null,
    method: row.kind,
  })).filter((item) => item.value != null);
}

function consolidatedThemeCandidate(group) {
  const phrase = executiveVariablePhrase(group.id, group.label);
  const titlePhrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  const kinds = new Set(group.methods.map((m) => m.kind));
  const bits = [];
  if (kinds.has("association")) bits.push("aparece entre as associações mais relevantes");
  if (kinds.has("predictive_discrimination")) bits.push("também apresenta capacidade de diferenciar os grupos observados");
  if (kinds.has("group_difference")) bits.push("mostra diferença entre clientes com desfechos distintos");
  const message = bits.length
    ? `Essa variável ${bits.join(", ")}.`
    : `${titlePhrase} se destaca nesta leitura.`;
  return {
    id: `sc:theme:${group.topic}`,
    metric: group.id,
    insight_group: group.topic,
    reason: "multi_method_theme",
    category: "association",
    title: `${titlePhrase} se destaca em diferentes análises`,
    message,
    methods: group.methods.map((row) => ({
      kind: row.kind,
      value: methodValue(row, row.kind),
      sample: row.sample ?? null,
      coverage: row.coverage ?? null,
    })),
    evidence: evidenceFromMethods(group),
  };
}

function singleMethodCandidate(row) {
  const phrase = executiveVariablePhrase(row.id, row.label);
  const value = methodValue(row, row.kind);
  if (row.kind === "association") {
    return {
      id: `sc:association:${row.id || row.label}`,
      metric: row.id || "sc_top_association",
      insight_group: row.topic,
      reason: "association",
      category: STAT_CATEGORY.association,
      title: `${phrase.charAt(0).toUpperCase() + phrase.slice(1)} também aparece entre as associações`,
      message: "Essa variável é uma associação relevante nesta leitura e é distinta da principal.",
      evidence: [{
        metric: row.id,
        label: METHOD_EVIDENCE_LABEL.association,
        value,
        unit: "association",
      }],
    };
  }
  if (row.kind === "predictive_discrimination") {
    return {
      id: `sc:auc:${row.id || row.label}`,
      metric: row.id || "sc_top_auc",
      insight_group: row.topic,
      reason: "predictive_discrimination",
      category: STAT_CATEGORY.predictive_discrimination,
      title: `${phrase.charAt(0).toUpperCase() + phrase.slice(1)} ajuda a distinguir os grupos`,
      message: "Essa variável apresenta capacidade de diferenciar os grupos observados nesta leitura.",
      evidence: [{
        metric: row.id,
        label: METHOD_EVIDENCE_LABEL.predictive_discrimination,
        value,
        unit: "auc",
      }],
    };
  }
  return {
    id: `sc:diff:${row.id || row.label}`,
    metric: row.id || "group_difference",
    insight_group: row.topic,
    reason: "group_difference",
    category: STAT_CATEGORY.group_difference,
    title: `Diferença observada em ${phrase}`,
    message: "Os grupos com desfechos distintos apresentaram diferença nessa variável.",
    evidence: [{
      metric: row.id,
      label: METHOD_EVIDENCE_LABEL.group_difference,
      value,
      unit: "std_diff",
    }],
  };
}

export function groupStatisticalInsights(snapshot) {
  const rows = collectStatisticalMethodRows(snapshot);
  const groups = groupRowsByTopic(rows);
  const usedTopics = new Set();
  const attention = [];

  const multi = groups.find((g) => g.methods.length >= 2);
  if (multi) {
    attention.push(consolidatedThemeCandidate(multi));
    usedTopics.add(multi.topic);
  }

  const nextAssoc = (snapshot?.highlights?.top_associations || []).find((row) => {
    const topic = normalizeInsightTopic(row.id, row.label);
    return topic && !usedTopics.has(topic) && coverageOk(row);
  });
  if (nextAssoc) {
    attention.push(singleMethodCandidate({
      ...nextAssoc,
      kind: "association",
      topic: normalizeInsightTopic(nextAssoc.id, nextAssoc.label),
    }));
    usedTopics.add(normalizeInsightTopic(nextAssoc.id, nextAssoc.label));
  }

  const survival = snapshot?.highlights?.survival;
  if (survival && survival.median_survival != null) {
    attention.push({
      id: "sc:survival",
      metric: "survival_observed",
      insight_group: "survival",
      reason: "survival",
      category: STAT_CATEGORY.survival_difference,
      title: "Permanência observada na carteira",
      message: `A permanência mediana observada é de ${Number(survival.median_survival).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} dias.`,
      evidence: [{
        metric: "survival_observed",
        label: "Permanência mediana",
        value: survival.median_survival,
        unit: "days",
      }],
    });
  }

  const cohort = snapshot?.highlights?.cohort;
  if (cohort && cohort.mean_retention_pct != null) {
    const age = cohort.age;
    attention.push({
      id: "sc:cohort",
      metric: "cohort_retention",
      insight_group: "cohort",
      reason: "cohort",
      category: STAT_CATEGORY.cohort_pattern,
      title: age ? `Retenção após ${age} meses de carteira` : "Retenção por grupo de entrada",
      message: `A retenção média observada ${age ? `aos ${age} meses ` : ""}é de ${Number(cohort.mean_retention_pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%.`,
      evidence: [{
        metric: "cohort_retention",
        label: "Retenção média",
        value: cohort.mean_retention_pct,
        unit: "percent",
      }],
    });
  }

  return attention;
}

/**
 * @param {object} analysisContext
 */
function extractLegacyExecutiveCandidates(analysisContext) {
  const ctx = analysisContext || {};
  const page = ctx.page || ctx.metadata?.page || null;
  const attention = [];
  const positive = [];
  const limitation = [];
  const actionContext = [];

  for (const cmp of ctx.comparisons || []) {
    if (!magnitudeRelevant(cmp)) continue;
    const meaning = comparisonDirectionMeaning(cmp.metric, cmp.direction);
    if (!meaning) continue;
    const item = {
      id: `cmp:${cmp.metric}`,
      metric: cmp.metric,
      reason: meaning === "unfavorable" ? "relevant_unfavorable_change" : "relevant_favorable_change",
      semantic: PILOT_DIRECTION_MAP[cmp.metric],
      evidence: {
        metric: cmp.metric,
        current: cmp.current,
        previous: cmp.previous,
        relative_change: cmp.relative_change,
        absolute_change: cmp.absolute_change,
        direction: cmp.direction,
        unit: cmp.unit || null,
        period: cmp.period || null,
      },
      title: meaning === "unfavorable"
        ? `Variação relevante em ${cmp.metric}`
        : `Variação favorável em ${cmp.metric}`,
      message: `${cmp.metric}: ${cmp.previous} → ${cmp.current} (${cmp.direction}, ${cmp.relative_change}%).`,
    };
    if (meaning === "unfavorable") pushUnique(attention, item);
    else pushUnique(positive, item);
  }

  for (const sig of ctx.signals || []) {
    const code = String(sig.code || "").toUpperCase();
    if (LIMITATION_CODES.includes(code) || code === "LOW_COVERAGE" || code === "MODERATE_COVERAGE") {
      const kpi = kpiById(ctx, sig.metric);
      pushUnique(limitation, {
        id: `sig:${code}:${sig.metric || "na"}`,
        metric: sig.metric || null,
        code,
        reason: code.toLowerCase(),
        title: sig.message || code,
        message: sig.message || code,
        evidence: sig.evidence || evidenceFromKpi(kpi),
      });
    }
  }

  for (const lim of ctx.limitations || []) {
    const code = String(lim.code || "").toUpperCase();
    if (!code) continue;
    const isCore = LIMITATION_CODES.includes(code)
      || code === "MISSING_VALUE"
      || code === "SOURCE_UNAVAILABLE"
      || code === "NPS_CAVEAT"
      || code === "PAYLOAD_WARNING"
      || code === "PARTIAL_SOURCE";
    if (!isCore) continue;
    pushUnique(limitation, {
      id: `lim:${code}:${lim.metric || lim.message?.slice(0, 24) || "na"}`,
      metric: lim.metric || null,
      code,
      reason: code.toLowerCase(),
      title: code.replace(/_/g, " "),
      message: lim.message || code,
      evidence: evidenceFromKpi(kpiById(ctx, lim.metric)),
    });
  }

  const unconfirmed = kpiById(ctx, "cancelled_without_confirmed_date");
  if (unconfirmed && Number(unconfirmed.value) > 0) {
    pushUnique(limitation, {
      id: "kpi:cancelled_without_confirmed_date",
      metric: "cancelled_without_confirmed_date",
      code: "CANCELLED_WITHOUT_CONFIRMED_DATE",
      reason: "data_quality",
      category: "data_quality",
      title: unconfirmed.label || "Cancelados sem data confirmada",
      message: `${unconfirmed.label}: ${unconfirmed.value}. Qualidade cadastral — não descreve a carteira ativa.`,
      evidence: evidenceFromKpi(unconfirmed),
    });
  }

  if (page === "statistical-crosses") {
    const topAssoc = (ctx.highlights?.topAssociations || [])[0];
    if (topAssoc) {
      pushUnique(attention, {
        id: `sc:association:${topAssoc.id || topAssoc.label}`,
        metric: topAssoc.id || "sc_top_association",
        reason: "top_observed_association",
        category: STAT_CATEGORY.association,
        language: statisticalLanguageGuide("association"),
        title: topAssoc.label || "Associação observada",
        message: `${topAssoc.label || topAssoc.id} está associado ao cancelamento no recorte (interpretação associativa).`,
        evidence: {
          metric: topAssoc.id || "sc_top_association",
          value: topAssoc.abs ?? topAssoc.value ?? null,
          unit: "association",
        },
      });
    }
    const topAuc = (ctx.highlights?.topAuc || [])[0];
    if (topAuc) {
      pushUnique(attention, {
        id: `sc:auc:${topAuc.id || topAuc.label}`,
        metric: topAuc.id || "sc_top_auc",
        reason: "top_predictive_discrimination",
        category: STAT_CATEGORY.predictive_discrimination,
        language: statisticalLanguageGuide("predictive_discrimination"),
        title: topAuc.label || "Discriminação univariada",
        message: `${topAuc.label || topAuc.id}: capacidade de discriminação (AUC), não taxa de acerto.`,
        evidence: {
          metric: topAuc.id || "sc_top_auc",
          value: topAuc.auc ?? null,
          unit: "auc",
        },
      });
    }
    const topDiff = (ctx.highlights?.topGroupDifferences || [])[0];
    if (topDiff) {
      pushUnique(attention, {
        id: `sc:diff:${topDiff.id || topDiff.label}`,
        metric: topDiff.id || "group_difference",
        reason: "top_group_difference",
        category: STAT_CATEGORY.group_difference,
        language: statisticalLanguageGuide("group_difference"),
        title: topDiff.label || "Diferença entre grupos",
        message: `O grupo apresentou diferença em ${topDiff.label || topDiff.id}.`,
        evidence: {
          metric: topDiff.id || "group_difference",
          value: topDiff.stdDiff ?? null,
          unit: "std_diff",
        },
      });
    }
    const nps = kpiById(ctx, "sc_nps") || ctx.highlights?.nps;
    const npsCoverage = nps?.coverage ?? ctx.highlights?.nps?.coverage ?? null;
    if (npsCoverage != null && Number(npsCoverage) < 20) {
      pushUnique(limitation, {
        id: "sc:nps_coverage",
        metric: "sc_nps",
        code: "LOW_COVERAGE",
        reason: "low_coverage",
        title: "Cobertura baixa do NPS",
        message: `Cobertura NPS ${npsCoverage}% — o resultado vale para respondentes, não para toda a carteira.`,
        evidence: { metric: "sc_nps", value: npsCoverage, unit: "percent" },
      });
    }
    const survival = ctx.highlights?.survival;
    if (survival && (survival.logRankP != null || survival.medianSurvival != null)) {
      pushUnique(attention, {
        id: "sc:survival",
        metric: "survival_observed",
        reason: "survival_difference",
        category: STAT_CATEGORY.survival_difference,
        language: statisticalLanguageGuide("survival_difference"),
        title: "Diferença de permanência observada",
        message: "Há diferença de permanência/sobrevivência observada no recorte (interpretação associativa).",
        evidence: {
          metric: "survival_observed",
          value: survival.logRankP ?? survival.medianSurvival ?? null,
          unit: survival.logRankP != null ? "p" : "days",
        },
      });
    }
  }

  const semanticNotes = [];
  for (const [metric, semantic] of Object.entries(PILOT_DIRECTION_MAP)) {
    const kpi = kpiById(ctx, metric);
    if (!kpi) continue;
    semanticNotes.push({
      metric,
      semantic,
      value: kpi.value,
      unit: kpi.unit || null,
    });
  }

  for (const item of [...attention, ...limitation]) {
    if (!item.metric) continue;
    pushUnique(actionContext, {
      id: `act:${item.metric}`,
      metric: item.metric,
      reason: "investigate_from_attention_or_limitation",
      title: `Investigar ${item.title || item.metric}`,
      message: `Avaliar os fatos oficiais de ${item.metric} neste recorte, sem assumir que um fator produza o outro.`,
    });
  }

  return {
    page,
    attention_candidates: attention,
    positive_candidates: positive,
    limitation_candidates: limitation,
    action_context: actionContext.slice(0, 4),
    heuristics: CANDIDATE_HEURISTICS,
    direction_map: PILOT_DIRECTION_MAP,
    semantic_notes: semanticNotes,
    statistical_fact_categories: page === "statistical-crosses"
      ? {
          topAssociations: STAT_CATEGORY.association,
          topAuc: STAT_CATEGORY.predictive_discrimination,
          topGroupDifferences: STAT_CATEGORY.group_difference,
          survival: STAT_CATEGORY.survival_difference,
          cohort: STAT_CATEGORY.cohort_pattern,
        }
      : null,
  };
}

export function constrainPositives(geminiPositives, candidates) {
  const cands = candidates?.positive_candidates || [];
  if (!cands.length) return [];
  const kept = (geminiPositives || []).filter((card) => cands.some((c) => cardCoversCandidate(card, c)));
  return kept.slice(0, 2);
}

export function cardCoversCandidate(card, candidate) {
  const metric = candidate.metric;
  const blob = `${card?.title || ""} ${card?.description || ""} ${JSON.stringify(card?.evidence || [])}`.toLowerCase();
  if (metric && blob.includes(String(metric).toLowerCase())) return true;
  if (metric && (card?.evidence || []).some((e) => e?.metric === metric)) return true;
  const tokens = String(candidate.title || candidate.message || "").toLowerCase().split(/\s+/).filter((t) => t.length > 5);
  const hits = tokens.filter((t) => blob.includes(t)).length;
  return hits >= 2;
}

export function mergeDeterministicLimitations(geminiLimitations, candidates) {
  const out = [...(geminiLimitations || [])];
  for (const cand of candidates?.limitation_candidates || []) {
    if (out.some((card) => cardCoversCandidate(card, cand))) continue;
    out.push({
      title: cand.title || cand.code || "Limitação",
      description: cand.message || cand.title,
      metric: cand.metric || null,
      category: cand.category || null,
    });
    if (out.length >= 4) break;
  }
  return out;
}

export function fillMissingAttention(geminiAttention, candidates) {
  const max = candidates?.max_attention || 3;
  return (geminiAttention || []).slice(0, max);
}

export function fillMissingPositives(geminiPositives, candidates) {
  const out = [...(geminiPositives || [])];
  if (out.length > 0) return out;
  for (const cand of (candidates?.positive_candidates || []).slice(0, 3)) {
    out.push({
      title: cand.title || cand.metric,
      description: cand.message || cand.title,
      evidence: cand.evidence?.metric
        ? [{ metric: cand.evidence.metric, value: cand.evidence.value ?? cand.evidence.current ?? null, unit: cand.evidence.unit || null }]
        : [],
    });
  }
  return out;
}

export function bindActionsToEvidence(geminiActions, analysis) {
  const metrics = new Set();
  for (const p of analysis.attention_points || []) {
    for (const e of p.evidence || []) if (e?.metric) metrics.add(e.metric);
    if (p.metric) metrics.add(p.metric);
  }
  for (const p of analysis.limitations || []) if (p.metric) metrics.add(p.metric);
  const fallbackMetric = [...metrics][0] || null;
  const out = [];
  for (const act of geminiActions || []) {
    if (!metrics.size) break;
    const based = Array.isArray(act.based_on) ? act.based_on.map(String) : [];
    const blob = `${act.title || ""} ${act.description || ""}`.toLowerCase();
    const linked = based.filter((m) => metrics.has(m));
    const inferred = [...metrics].filter((m) => blob.includes(String(m).toLowerCase()));
    const basedOn = (linked.length ? linked : inferred).slice(0, 3);
    if (!basedOn.length && fallbackMetric) basedOn.push(fallbackMetric);
    if (!basedOn.length) continue;
    out.push({
      title: act.title,
      description: act.description,
      based_on: basedOn,
    });
    if (out.length >= 4) break;
  }
  return out;
}

function snapshotKpiEvidence(metric, value, unit) {
  if (!metric) return null;
  return { metric, value: value ?? null, unit: unit || null };
}

/**
 * Candidatos a partir do executive_snapshot (Etapa 8.4.2).
 * Poucos, específicos da página. Arrays vazios são válidos.
 */
export function extractCandidatesFromSnapshot(snapshot) {
  const page = snapshot?.page || null;
  const attention = [];
  const positive = [];
  const limitation = [];
  const actionContext = [];
  const maxAttention = getExecutivePageProfile(page)?.maxAttention
    || snapshot?.page_profile?.max_attention
    || 3;

  for (const cmp of snapshot?.comparisons || []) {
    if (!magnitudeRelevant(cmp)) continue;
    const meaning = comparisonDirectionMeaning(cmp.metric, cmp.direction);
    if (!meaning) continue;
    const item = {
      id: `cmp:${cmp.metric}`,
      metric: cmp.metric,
      reason: meaning === "unfavorable" ? "relevant_unfavorable_change" : "relevant_favorable_change",
      title: meaning === "unfavorable" ? `Variação relevante em ${cmp.metric}` : `Variação favorável em ${cmp.metric}`,
      message: `${cmp.metric}: ${cmp.previous} → ${cmp.current} (${cmp.relative_change}%).`,
      evidence: {
        metric: cmp.metric,
        current: cmp.current,
        previous: cmp.previous,
        relative_change: cmp.relative_change,
        direction: cmp.direction,
        unit: cmp.unit || null,
        value: cmp.current,
      },
    };
    if (meaning === "unfavorable") pushUnique(attention, item);
    else pushUnique(positive, item);
  }

  for (const lim of snapshot?.limitations || []) {
    const category = lim.category || "data_quality";
    pushUnique(limitation, {
      id: `lim:${lim.code}:${lim.metric || "na"}`,
      metric: lim.metric || null,
      code: lim.code,
      category,
      reason: category,
      title: String(lim.code || "Limitação").replace(/_/g, " "),
      message: lim.message || lim.code,
      evidence: snapshotKpiEvidence(lim.metric, lim.value, null),
    });
  }

  if (page === "meetings") {
    const h = snapshot.highlights || {};
    if (Number(h.never_met) > 0) {
      pushUnique(attention, {
        id: "meet:never_met",
        metric: "clients_with_meeting",
        reason: "active_without_meeting",
        title: "Clientes ativos sem reunião",
        message: `${h.never_met} clientes no recorte nunca realizaram reunião (faixa oficial "Nunca realizou reunião").`,
        evidence: snapshotKpiEvidence("never_met", h.never_met, "clients"),
      });
    }
    if (Number(h.long_gap) > 0) {
      pushUnique(attention, {
        id: "meet:long_gap",
        metric: "days_since_latest_meeting",
        reason: "no_recent_contact",
        title: "Contato antigo na carteira ativa",
        message: `${h.long_gap} clientes no recorte estão nas faixas oficiais 91–180 dias ou mais de 180 dias desde a última reunião.`,
        evidence: snapshotKpiEvidence("long_gap", h.long_gap, "clients"),
      });
    }
  }

  if (page === "statistical-crosses") {
    for (const item of groupStatisticalInsights(snapshot)) {
      pushUnique(attention, item);
    }
  }

  if (page === "renewal") {
    const h = snapshot.highlights || {};
    if (Number(h.not_renewed) > 0) {
      const majority = Number(h.eligible) > 0 && Number(h.not_renewed) > Number(h.renewed);
      pushUnique(attention, {
        id: "ren:not_renewed",
        metric: "non_renewed_clients",
        reason: "non_renewed_volume",
        title: majority ? "Maior parte ainda não renovou" : "Clientes elegíveis que ainda não renovaram",
        message: majority
          ? `Dos ${h.eligible} clientes elegíveis, ${h.not_renewed} ainda não renovaram.`
          : `${h.not_renewed} clientes elegíveis ainda não renovaram.` ,
        evidence: snapshotKpiEvidence("non_renewed_clients", h.not_renewed, "clients"),
      });
    }
    if (Number(h.renewed) > 0) {
      pushUnique(positive, {
        id: "ren:renewed",
        metric: "renewed_clients",
        reason: "renewed_volume",
        title: "Clientes que já renovaram",
        message: h.renewal_rate != null
          ? `${h.renewed} clientes renovaram, o equivalente a ${h.renewal_rate}% dos elegíveis.`
          : `${h.renewed} clientes já renovaram.`,
        evidence: snapshotKpiEvidence("renewed_clients", h.renewed, "clients"),
      });
    }
  }

  if (page === "ep") {
    const h = snapshot.highlights || {};
    if (Number(h.clients_without_meeting) > 0) {
      pushUnique(attention, {
        id: "ep:without_meeting",
        metric: "ep_clients_without_meeting",
        reason: "active_without_meeting",
        title: "Clientes sem reunião na carteira",
        message: `${h.clients_without_meeting} clientes ativos ainda não têm reunião registrada.`,
        evidence: snapshotKpiEvidence("ep_clients_without_meeting", h.clients_without_meeting, "clients"),
      });
    }
    if (Number(h.implemented_mechanisms) > 0 || Number(h.clients_with_implemented_mechanisms) > 0) {
      pushUnique(positive, {
        id: "ep:implemented",
        metric: "ep_meeting_coverage",
        reason: "implementation_progress",
        title: "Implementação observada na carteira",
        message: Number(h.clients_with_implemented_mechanisms) > 0
          ? `${h.clients_with_implemented_mechanisms} clientes já têm mecanismos implementados.`
          : `Há mecanismos implementados na carteira observada.`,
        evidence: snapshotKpiEvidence("implemented_mechanisms", h.implemented_mechanisms, "events"),
      });
    } else if (Number(h.meeting_coverage) > 0 && Number(h.clients_without_meeting) === 0) {
      pushUnique(positive, {
        id: "ep:coverage",
        metric: "ep_meeting_coverage",
        reason: "coverage_complete",
        title: "Cobertura de reuniões observada",
        message: `A cobertura de reuniões alcança ${h.meeting_coverage}% na carteira observada.`,
        evidence: snapshotKpiEvidence("ep_meeting_coverage", h.meeting_coverage, "percent"),
      });
    }
  }

  for (const item of attention.slice(0, maxAttention)) {
    pushUnique(actionContext, {
      id: `act:${item.metric}`,
      metric: item.metric,
      reason: "investigate_from_attention_or_limitation",
      title: `Investigar ${item.title || item.metric}`,
      message: `Investigar o fato oficial de ${item.metric} neste recorte, sem assumir causa.`,
    });
  }

  return {
    page,
    attention_candidates: attention.slice(0, maxAttention),
    positive_candidates: positive.slice(0, 2),
    limitation_candidates: limitation.slice(0, 4),
    action_context: actionContext.slice(0, 3),
    max_attention: maxAttention,
    heuristics: CANDIDATE_HEURISTICS,
    direction_map: PILOT_DIRECTION_MAP,
    semantic_notes: [],
    statistical_fact_categories: page === "statistical-crosses"
      ? {
          topAssociations: STAT_CATEGORY.association,
          topAuc: STAT_CATEGORY.predictive_discrimination,
          topGroupDifferences: STAT_CATEGORY.group_difference,
        }
      : null,
  };
}

export function extractExecutiveCandidates(analysisContext) {
  if (analysisContext?.executive_snapshot) {
    return extractCandidatesFromSnapshot(analysisContext.executive_snapshot);
  }
  return extractLegacyExecutiveCandidates(analysisContext);
}

export function ignoredCandidates(candidates, analysis) {
  const ignored = [];
  for (const cand of candidates?.attention_candidates || []) {
    if (!(analysis.attention_points || []).some((c) => cardCoversCandidate(c, cand))) {
      ignored.push({ kind: "attention", id: cand.id, metric: cand.metric, reason: "not_in_final_cards" });
    }
  }
  for (const cand of candidates?.limitation_candidates || []) {
    if (!(analysis.limitations || []).some((c) => cardCoversCandidate(c, cand))) {
      ignored.push({ kind: "limitation", id: cand.id, metric: cand.metric, reason: "not_in_final_cards" });
    }
  }
  return ignored;
}
