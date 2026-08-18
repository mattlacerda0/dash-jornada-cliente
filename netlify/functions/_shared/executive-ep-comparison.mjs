/**
 * Comparação executiva entre EPs (Etapa 8.9).
 *
 * Recorta a população para CLIENTES ATIVOS e só então aplica as fórmulas
 * oficiais já usadas na tela (cobertura = com reunião ÷ carteira do recorte).
 * Não cria score composto. Não é regra de negócio do dashboard.
 */

import {
  NPS_MIN_COVERAGE_PCT,
  NPS_MIN_RESPONSES_PER_EP,
  computeNpsBreakdown,
} from "./nps-metrics.mjs";

/**
 * Heurística executiva de comparação — não é meta nem regra aprovada de ranking.
 *
 * - preferredMinActiveClients (20): evita comparar carteira minúscula com carteira grande.
 * - fallbackMinActiveClients (10): alinha ao bucket oficial "amostra muito pequena" da tela.
 *   Usado só se 20 deixar poucos EPs elegíveis (< 8).
 * - NPS: reusa os mínimos oficiais do helper (5 respostas / 20% de cobertura).
 */
export const EP_COMPARISON_HEURISTICS = Object.freeze({
  preferredMinActiveClients: 20,
  fallbackMinActiveClients: 10,
  minEligibleEpsForPreferred: 8,
  maxHighlights: 3,
  maxAttention: 3,
  npsMinResponses: NPS_MIN_RESPONSES_PER_EP,
  npsMinCoveragePct: NPS_MIN_COVERAGE_PCT,
  note: "executive comparison heuristic — not a business rule",
});

function round1(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n) * 10) / 10;
}

function pct(n, d) {
  const a = Number(n);
  const b = Number(d);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((a / b) * 1000) / 10;
}

function median(values) {
  const nums = (values || [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2) return round1(nums[mid]);
  return round1((nums[mid - 1] + nums[mid]) / 2);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return round1(sorted[lo]);
  return round1(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

export function isExecutiveActiveClient(row) {
  const status = String(row?.analyticalStatus || row?.clientStatus || row?.status || "").trim();
  return status === "Ativo";
}

function engineerIsBlank(name) {
  const n = String(name || "").trim();
  return !n || n === "Não informado" || n === "Nao informado";
}

function looksLikeEmail(value) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(value || ""));
}

function collectEngineerBuckets(payload) {
  const list = Array.isArray(payload?.engineers) && payload.engineers.length
    ? payload.engineers
    : (Array.isArray(payload?.byAdvisor) ? payload.byAdvisor : []);
  return list.filter((bucket) => bucket && !engineerIsBlank(bucket.engineer) && !looksLikeEmail(bucket.engineer));
}

function metricsForActiveClients(clients) {
  const active = (clients || []).filter(isExecutiveActiveClient);
  const n = active.length;
  const withMeeting = active.filter((c) => Number(c.totalMeetings) > 0).length;
  const withoutMeeting = n - withMeeting;
  const withMech = active.filter((c) => c.hasImplementedMechanism === true || Number(c.implementedMechanisms) > 0).length;
  const implemented = active.reduce((a, c) => a + (Number(c.implementedMechanisms) || 0), 0);
  const scores = active.map((c) => c.npsScore).filter((v) => v != null && Number.isFinite(Number(v)));
  const nps = computeNpsBreakdown(scores);
  const npsCoverage = pct(nps.responses, n);
  const npsEligible = nps.responses >= EP_COMPARISON_HEURISTICS.npsMinResponses
    && (npsCoverage == null || npsCoverage >= EP_COMPARISON_HEURISTICS.npsMinCoveragePct);
  return {
    active_clients: n,
    clients_with_meeting: withMeeting,
    clients_without_meeting: withoutMeeting,
    meeting_coverage: pct(withMeeting, n),
    mechanisms_coverage: pct(withMech, n),
    clients_with_implemented_mechanisms: withMech,
    implemented_mechanisms: implemented,
    nps: nps.responses > 0 ? nps.nps : null,
    nps_responses: nps.responses,
    nps_coverage: npsCoverage,
    nps_eligible: npsEligible,
    nps_sample_limited: nps.responses > 0 && !npsEligible,
  };
}

export function resolveEpMinActiveClients(activeSizes) {
  const sizes = (activeSizes || []).filter((n) => Number(n) > 0);
  const preferred = EP_COMPARISON_HEURISTICS.preferredMinActiveClients;
  const fallback = EP_COMPARISON_HEURISTICS.fallbackMinActiveClients;
  const keepPreferred = sizes.filter((n) => n >= preferred).length;
  if (keepPreferred >= EP_COMPARISON_HEURISTICS.minEligibleEpsForPreferred) return preferred;
  return fallback;
}

function cardMetrics(row, { includeNps = true } = {}) {
  const metrics = [
    { label: "Clientes ativos", value: row.active_clients, unit: "clients" },
    { label: "Cobertura de reuniões", value: row.meeting_coverage, unit: "percent" },
    { label: "Clientes sem reunião", value: row.clients_without_meeting, unit: "clients" },
  ];
  if (row.mechanisms_coverage != null && Number(row.mechanisms_coverage) > 0) {
    metrics.push({ label: "Cobertura de mecanismos", value: row.mechanisms_coverage, unit: "percent" });
  }
  if (includeNps && row.nps != null) {
    metrics.push({
      label: "NPS",
      value: row.nps,
      unit: "index",
      badge: row.nps_sample_limited ? "amostra limitada" : null,
    });
  }
  return metrics.filter((m) => m.value != null);
}

function toHighlightCard(row, medianCoverage) {
  const delta = row.meeting_coverage != null && medianCoverage != null
    ? round1(row.meeting_coverage - medianCoverage)
    : null;
  const bits = [];
  if (row.meeting_coverage != null) {
    bits.push(`cobertura de reuniões de ${row.meeting_coverage}% na carteira ativa`);
  }
  if (delta != null && delta > 0) bits.push(`${delta} p.p. acima da mediana`);
  if (row.mechanisms_coverage != null) bits.push(`mecanismos em ${row.mechanisms_coverage}%`);
  return {
    ep_name: row.ep_name,
    role: "positive",
    summary: bits.length
      ? `${row.ep_name} apresenta ${bits.join(", ")}.`
      : `${row.ep_name} aparece entre as carteiras com melhor acompanhamento da carteira ativa.`,
    metrics: cardMetrics(row),
    vs_median_pp: delta,
    nps_eligible: row.nps_eligible === true,
  };
}

function toAttentionCard(row, medianCoverage) {
  const delta = row.meeting_coverage != null && medianCoverage != null
    ? round1(row.meeting_coverage - medianCoverage)
    : null;
  const parts = [];
  if (row.meeting_coverage != null) {
    parts.push(`cobertura de reuniões de ${row.meeting_coverage}%`);
  }
  if (Number(row.clients_without_meeting) > 0) {
    parts.push(`${row.clients_without_meeting} clientes ativos sem reunião`);
  }
  const vs = delta != null && delta < 0
    ? ` É uma das menores coberturas observadas entre as carteiras elegíveis para comparação (${Math.abs(delta)} p.p. abaixo da mediana).`
    : " É uma das menores coberturas observadas entre as carteiras elegíveis para comparação.";
  return {
    ep_name: row.ep_name,
    role: "attention",
    summary: `${row.ep_name} aparece com ${parts.join(" e ")}.${vs}`,
    metrics: cardMetrics(row),
    vs_median_pp: delta,
    nps_eligible: row.nps_eligible === true,
  };
}

/**
 * Constrói agregados por EP na população ativa e escolhe destaques/atenção.
 */
export function buildEpActiveComparison(payload) {
  const buckets = collectEngineerBuckets(payload);
  let activeWithoutEngineer = 0;
  if (Array.isArray(payload?.engineers)) {
    for (const bucket of payload.engineers) {
      if (!engineerIsBlank(bucket?.engineer) && !looksLikeEmail(bucket?.engineer)) continue;
      activeWithoutEngineer += (bucket?.clients || []).filter(isExecutiveActiveClient).length;
    }
  }

  const rows = [];
  for (const bucket of buckets) {
    const clients = Array.isArray(bucket.clients) ? bucket.clients : [];
    const metrics = metricsForActiveClients(clients);
    if (metrics.active_clients <= 0) continue;
    rows.push({
      ep_name: String(bucket.engineer).trim(),
      ...metrics,
    });
  }

  const activeLinked = rows.reduce((a, r) => a + r.active_clients, 0);
  const withMeeting = rows.reduce((a, r) => a + r.clients_with_meeting, 0);
  const withoutMeeting = rows.reduce((a, r) => a + r.clients_without_meeting, 0);
  const withMech = rows.reduce((a, r) => a + r.clients_with_implemented_mechanisms, 0);
  const allScores = buckets.flatMap((b) => (b.clients || [])
    .filter(isExecutiveActiveClient)
    .map((c) => c.npsScore)
    .filter((v) => v != null && Number.isFinite(Number(v))));
  const overallNps = computeNpsBreakdown(allScores);
  const overallNpsCoverage = pct(overallNps.responses, activeLinked);
  const overallNpsEligible = overallNps.responses >= EP_COMPARISON_HEURISTICS.npsMinResponses
    && (overallNpsCoverage == null || overallNpsCoverage >= EP_COMPARISON_HEURISTICS.npsMinCoveragePct);

  const sizes = rows.map((r) => r.active_clients);
  const minActive = resolveEpMinActiveClients(sizes);
  const eligible = rows.filter((r) => r.active_clients >= minActive);
  const excludedSmall = rows.filter((r) => r.active_clients > 0 && r.active_clients < minActive);
  const coverages = eligible.map((r) => r.meeting_coverage).filter((n) => n != null);
  const sortedCov = [...coverages].sort((a, b) => a - b);
  const medianCoverage = median(coverages);
  const p25 = percentile(sortedCov, 0.25);
  const p75 = percentile(sortedCov, 0.75);
  const minCov = coverages.length ? round1(Math.min(...coverages)) : null;
  const maxCov = coverages.length ? round1(Math.max(...coverages)) : null;
  const spread = minCov != null && maxCov != null ? round1(maxCov - minCov) : null;

  const comparable = eligible
    .filter((r) => r.meeting_coverage != null)
    .sort((a, b) => b.meeting_coverage - a.meeting_coverage
      || (b.mechanisms_coverage || 0) - (a.mechanisms_coverage || 0)
      || b.active_clients - a.active_clients
      || a.ep_name.localeCompare(b.ep_name, "pt-BR"));

  const highlights = [];
  for (const row of comparable) {
    if (highlights.length >= EP_COMPARISON_HEURISTICS.maxHighlights) break;
    if (medianCoverage != null && row.meeting_coverage < medianCoverage) continue;
    highlights.push(toHighlightCard(row, medianCoverage));
  }

  const highlightNames = new Set(highlights.map((c) => c.ep_name));
  const attentionSource = [...comparable].reverse();
  const attention = [];
  for (const row of attentionSource) {
    if (attention.length >= EP_COMPARISON_HEURISTICS.maxAttention) break;
    if (highlightNames.has(row.ep_name)) continue;
    if (medianCoverage != null && row.meeting_coverage > medianCoverage) continue;
    attention.push(toAttentionCard(row, medianCoverage));
  }

  return {
    can_compare: comparable.length >= 2,
    source: buckets.length ? "active_clients_rows" : "unavailable",
    active_clients: activeLinked,
    active_clients_unlinked: activeWithoutEngineer,
    advisors_with_active: rows.length,
    meeting_coverage: pct(withMeeting, activeLinked),
    clients_with_meeting: withMeeting,
    clients_without_meeting: withoutMeeting,
    mechanisms_coverage: pct(withMech, activeLinked),
    nps: overallNps.responses > 0 ? overallNps.nps : null,
    nps_responses: overallNps.responses,
    nps_coverage: overallNpsCoverage,
    nps_eligible: overallNpsEligible,
    nps_sample_limited: overallNps.responses > 0 && !overallNpsEligible,
    eligibility: {
      min_active_clients: minActive,
      preferred_min: EP_COMPARISON_HEURISTICS.preferredMinActiveClients,
      fallback_min: EP_COMPARISON_HEURISTICS.fallbackMinActiveClients,
      eligible_eps: eligible.length,
      excluded_small_eps: excludedSmall.length,
      rule: EP_COMPARISON_HEURISTICS.note,
    },
    distribution: {
      median_meeting_coverage: medianCoverage,
      p25_meeting_coverage: p25,
      p75_meeting_coverage: p75,
      min_meeting_coverage: minCov,
      max_meeting_coverage: maxCov,
      spread_pp: spread,
      eligible_eps: eligible.length,
    },
    ep_performance: rows.map((r) => ({
      ep_name: r.ep_name,
      active_clients: r.active_clients,
      clients_with_meeting: r.clients_with_meeting,
      meeting_coverage: r.meeting_coverage,
      clients_without_meeting: r.clients_without_meeting,
      nps: r.nps,
      nps_responses: r.nps_responses,
      nps_coverage: r.nps_coverage,
      nps_eligible: r.nps_eligible,
      nps_sample_limited: r.nps_sample_limited,
      mechanisms_coverage: r.mechanisms_coverage,
      comparison_eligible: r.active_clients >= minActive,
    })),
    ep_highlights: highlights,
    ep_attention: attention,
  };
}

export { median as medianNumber, pct as pctNumber };
