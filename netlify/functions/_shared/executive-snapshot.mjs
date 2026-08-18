/**
 * Executive Snapshot (Etapa 8.4.2)
 *
 * Resume o payload oficial da página em JSON compacto, agregado e sem PII.
 * Não consulta banco. Não recalcula regras de negócio novas: só recorta/agrega
 * valores já presentes no payload.
 */

import {
  EXECUTIVE_PROFILE_VERSION,
  compactPageProfile,
  getExecutivePageProfile,
  profileMetricAllowlist,
  resolveExecutiveScope,
} from "./executive-page-profiles.mjs";
import { buildEpActiveComparison, isExecutiveActiveClient } from "./executive-ep-comparison.mjs";

export const SNAPSHOT_VERSION = "1.3";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function nowIso() {
  return new Date().toISOString();
}

export function estimateJsonBytes(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj ?? {}), "utf8");
  } catch {
    return 0;
  }
}

export function approximateTokens(obj) {
  return Math.ceil(estimateJsonBytes(obj) / 4);
}

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

function isActiveRow(row) {
  return row?.analyticalStatus === "Ativo" || row?.clientStatus === "Ativo" || row?.status === "Ativo";
}

function filterRowsByScope(rows, scopeType) {
  const list = Array.isArray(rows) ? rows : [];
  if (scopeType === "active_clients") return list.filter(isActiveRow);
  if (scopeType === "cancelled_clients") {
    return list.filter((r) => String(r?.analyticalStatus || r?.clientStatus || "").toLowerCase().includes("cancel"));
  }
  return list;
}

function monthComparison(metric, current, previous, unit, period) {
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
    period: period || null,
  };
}

function highlight(metric, label, value, unit) {
  if (value == null || value === "") return null;
  return { metric, label, value, unit };
}

const HIGHLIGHT_DEFS = {
  active_clients: { label: "Clientes ativos", unit: "clients" },
  median_stay_days: { label: "Permanência típica", unit: "days" },
  financial_coverage: { label: "Cobertura financeira", unit: "percent" },
  latest_month_acquisitions: { label: "Aquisições no mês", unit: "clients" },
  clients_with_meeting: { label: "Clientes com reunião", unit: "clients" },
  meeting_coverage_rate: { label: "Cobertura de reuniões", unit: "percent" },
  attendance_rate: { label: "Comparecimento", unit: "percent" },
  no_show_rate: { label: "No-show", unit: "percent" },
  sc_active_clients: { label: "Clientes ativos (recorte)", unit: "clients" },
  sc_top_association: { label: "Associação principal", unit: "association" },
  sc_nps: { label: "NPS (respondentes)", unit: "index" },
  renewal_eligible: { label: "Elegíveis à renovação", unit: "clients" },
  renewed_clients: { label: "Clientes que renovaram", unit: "clients" },
  non_renewed_clients: { label: "Clientes que não renovaram", unit: "clients" },
  renewal_rate: { label: "Taxa de renovação", unit: "percent" },
  max_current_cycle: { label: "Maior ciclo atual", unit: "cycles" },
  total_renewals: { label: "Quantidade de renovações", unit: "renewals" },
  ep_meeting_coverage: { label: "Mediana de cobertura de reuniões", unit: "percent" },
  ep_clients_without_meeting: { label: "Clientes ativos sem reunião", unit: "clients" },
  ep_nps: { label: "NPS dos respondentes ativos", unit: "index" },
  ep_clients_by_advisor: { label: "EPs com carteira ativa", unit: "advisors" },
  ep_active_clients: { label: "Clientes ativos analisados", unit: "clients" },
  temporal_meetings: { label: "Reuniões no período recente", unit: "meetings" },
  temporal_financial_updates: { label: "Atualizações financeiras", unit: "events" },
  temporal_active_with_signals: { label: "Clientes ativos com sinais", unit: "clients" },
  temporal_logins: { label: "Acessos", unit: "events" },
};

/**
 * Escolhe highlight_numbers a partir do perfil da página.
 * Gemini não cria esses números.
 */
export function selectHighlightNumbers(pageId, catalog = {}) {
  const profile = getExecutivePageProfile(pageId);
  const ids = (profile?.highlightMetrics?.length ? profile.highlightMetrics : profile?.priorityMetrics) || [];
  const max = profile?.maxHighlightNumbers || 4;
  const allowed = profileMetricAllowlist(pageId);
  const out = [];
  for (const id of ids) {
    if (out.length >= max) break;
    if (allowed.size && !allowed.has(id)) continue;
    const item = catalog[id];
    if (item == null) continue;
    const value = typeof item === "object" && item !== null && "value" in item ? item.value : item;
    if (value == null || value === "") continue;
    const def = HIGHLIGHT_DEFS[id] || {};
    out.push({
      metric: id,
      label: (typeof item === "object" && item.label) || def.label || id,
      value,
      unit: (typeof item === "object" && item.unit) || def.unit || null,
    });
  }
  return out;
}

function pushLim(list, item) {
  if (!item?.code) return;
  if (list.some((x) => x.code === item.code && x.metric === item.metric)) return;
  list.push(item);
}

function classifyLimitation(code, message = "") {
  const c = String(code || "").toUpperCase();
  const blob = `${c} ${message}`.toLowerCase();
  if (/timeout|view|infra|processamento|assinatura de contrato|fetch|http/.test(blob) || c === "TECHNICAL") {
    return "technical";
  }
  if (c === "LOW_COVERAGE" || c === "MODERATE_COVERAGE" || c === "COVERAGE_SPREAD" || /cobertura/.test(blob)) return "coverage";
  if (c === "SMALL_SAMPLE" || /amostra/.test(blob)) return "sample";
  if (c === "NEEDS_BUSINESS_VALIDATION") return "business_validation";
  return "data_quality";
}

function stripPiiString(value) {
  if (typeof value !== "string") return value;
  return value.replace(EMAIL_RE, "[redacted-email]");
}

export function snapshotHasDisallowedPayload(snapshot) {
  const json = JSON.stringify(snapshot || {});
  if (EMAIL_RE.test(json) && !json.includes("[redacted-email]")) return true;
  if (/\bcpf\b|\bcnpj\b|telefone|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i.test(json)) return true;
  if (/"clientName"|"client_name"|"clientEmail"|"clientId"|"client_id"/.test(json)) return true;
  return false;
}

function baseSnapshot(pageId, scope, filtersApplied, extra) {
  return {
    page: pageId,
    scope: {
      type: scope.type,
      label: scope.label,
      source: scope.source,
      count: scope.count,
    },
    generated_at: nowIso(),
    filters_applied: filtersApplied && typeof filtersApplied === "object" ? filtersApplied : {},
    profile_version: EXECUTIVE_PROFILE_VERSION,
    snapshot_version: SNAPSHOT_VERSION,
    highlights: {},
    growth: null,
    coverage: null,
    data_quality: null,
    comparisons: [],
    limitations: [],
    highlight_numbers: [],
    ...extra,
  };
}

function buildGeneralSnapshot(payload, scope, filtersApplied) {
  const s = payload?.summary || {};
  const rows = Array.isArray(payload?.clients) ? payload.clients : [];
  const scoped = filterRowsByScope(rows, scope.type);
  const useActive = scope.type === "active_clients" && scoped.length > 0;
  const universe = useActive ? scoped : rows;
  const count = useActive
    ? (s.activeClients ?? scoped.length)
    : (s.totalClients ?? rows.length);
  scope.count = count;

  const stay = median(universe.map((r) => r.stayDays ?? r.typicalStayDays));
  const income = median(universe.map((r) => r.monthlyIncome));
  const liquidity = median(universe.map((r) => r.liquidityReserve));
  const contribution = median(universe.map((r) => r.lastContribution));
  const financialFilled = universe.filter((r) => r.monthlyIncome != null || r.liquidityReserve != null || r.lastContribution != null).length;
  const financialCoverage = universe.length ? pct(financialFilled, universe.length) : (s.financialProfilePercent ?? null);

  const months = payload?.distributions?.acquisitionsByMonth || [];
  const growth = months.length >= 2
    ? {
        latest_month_acquisitions: months[0]?.acquiredClients ?? s.latestMonthAcquisitions ?? null,
        previous_month_acquisitions: months[1]?.acquiredClients ?? null,
        relative_change: s.latestMonthChangePercent ?? null,
        current_month: months[0]?.month || months[0]?.label || null,
        previous_month: months[1]?.month || months[1]?.label || null,
      }
    : {
        latest_month_acquisitions: s.latestMonthAcquisitions ?? null,
        previous_month_acquisitions: null,
        relative_change: s.latestMonthChangePercent ?? null,
        current_month: null,
        previous_month: null,
      };

  const cmp = monthComparison(
    "latest_month_acquisitions",
    growth.latest_month_acquisitions,
    growth.previous_month_acquisitions,
    "clients",
    { current: growth.current_month, previous: growth.previous_month },
  );

  const limitations = [];
  const unconfirmed = s.cancelledWithoutConfirmedDate;
  if (unconfirmed != null && Number(unconfirmed) > 0) {
    pushLim(limitations, {
      code: "CANCELLED_WITHOUT_CONFIRMED_DATE",
      category: "data_quality",
      metric: "cancelled_without_confirmed_date",
      message: `${unconfirmed} registros marcados como cancelados sem data confirmada. Não descreve a carteira ativa.`,
      value: unconfirmed,
    });
  }
  if (financialCoverage != null && financialCoverage < 50) {
    pushLim(limitations, {
      code: "LOW_COVERAGE",
      category: "coverage",
      metric: "clients_with_financial_data",
      message: `Cobertura financeira de ${financialCoverage}% neste recorte.`,
      value: financialCoverage,
    });
  }
  if (payload?.quality?.acquisitionAudit?.signatureFetch?.skippedDueToViewTimeout) {
    pushLim(limitations, {
      code: "TECHNICAL",
      category: "technical",
      metric: "latest_month_acquisitions",
      message: payload.quality.acquisitionAudit.signatureFetch.note
        || "Timeout na leitura de assinatura de contrato; aquisição pode usar fallback de data de ciclo.",
    });
  }
  if (!useActive && scope.type === "active_clients") {
    pushLim(limitations, {
      code: "SCOPE_FALLBACK",
      category: "coverage",
      metric: "active_clients",
      message: "O recorte ativo usou os totais oficiais da página porque as linhas individuais não estavam disponíveis.",
    });
  }

  const highlights = {
    active_clients: s.activeClients ?? null,
    total_clients: s.totalClients ?? null,
    active_share: pct(s.activeClients, s.totalClients),
    median_tenure_days: stay ?? s.typicalStayDays ?? null,
    median_income: income ?? s.typicalMonthlyIncome ?? null,
    median_liquid_reserve: liquidity ?? s.typicalLiquidityReserve ?? null,
    median_last_contribution: contribution ?? s.typicalLastContribution ?? null,
    financial_coverage: financialCoverage,
  };

  const highlightCatalog = {
    active_clients: { value: highlights.active_clients, label: "Clientes ativos", unit: "clients" },
    median_stay_days: { value: highlights.median_tenure_days, label: "Permanência típica", unit: "days" },
    financial_coverage: { value: highlights.financial_coverage, label: "Cobertura financeira", unit: "percent" },
    latest_month_acquisitions: { value: growth.latest_month_acquisitions, label: "Aquisições no mês", unit: "clients" },
    median_monthly_income: { value: highlights.median_income, label: "Renda típica", unit: "currency" },
  };
  const highlight_numbers = selectHighlightNumbers("general", highlightCatalog);

  return baseSnapshot("general", scope, filtersApplied, {
    highlights,
    growth,
    coverage: { financial_coverage: financialCoverage },
    data_quality: {
      cancelled_without_confirmed_date: unconfirmed ?? null,
      financial_coverage: financialCoverage,
    },
    comparisons: cmp ? [cmp] : [],
    limitations,
    highlight_numbers,
  });
}

function countMeetingsByMonth(clientRows) {
  const map = new Map();
  for (const client of clientRows || []) {
    for (const m of client.meetings || []) {
      if (!m?.startTime) continue;
      if (m.attendanceStatus === "cancelada") continue;
      if (m.meetingDateStatus === "before_client_entry" || m.meetingDateStatus === "invalid") continue;
      const month = String(m.startTime).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const rec = map.get(month) || { month, completed: 0, no_show: 0, attended: 0 };
      rec.completed += 1;
      if (m.attendanceStatus === "nao_compareceu") rec.no_show += 1;
      if (m.attendanceStatus === "compareceu") rec.attended += 1;
      map.set(month, rec);
    }
  }
  const todayKey = new Date().toISOString().slice(0, 7);
  return [...map.values()]
    .filter((row) => row.month <= todayKey)
    .sort((a, b) => b.month.localeCompare(a.month));
}

function buildMeetingsSnapshot(payload, scope, filtersApplied) {
  const s = payload?.summary || {};
  const rows = Array.isArray(payload?.clients) ? payload.clients : [];
  const canScope = rows.length > 0 && rows.some((r) => r.analyticalStatus || r.clientStatus);
  const useActive = scope.type === "active_clients" && canScope;
  const universe = useActive ? filterRowsByScope(rows, "active_clients") : rows;
  const count = universe.length || (useActive ? null : (payload?.metadata?.noShowFrequencyUniverse ?? rows.length));
  scope.count = count;

  const withMeeting = universe.filter((c) => c.hasValidMeeting === true).length;
  const neverMet = universe.filter((c) => c.daysSinceBand === "Nunca realizou reunião" || c.hasValidMeeting === false).length;
  const longGap = universe.filter((c) => c.daysSinceBand === "91 a 180 dias" || c.daysSinceBand === "Mais de 180 dias").length;
  const coverage = count ? pct(withMeeting, count) : (s.meetingCoverageRate ?? null);
  const daysSince = median(universe.map((c) => c.daysSinceLastMeeting).filter((v) => v != null));
  const interval = median(universe.map((c) => c.averageIntervalDays).filter((v) => v != null));

  let attendanceRate = s.attendanceRate ?? null;
  let noShowRate = s.noShowRate ?? null;
  let attendanceSource = "page_official";
  if (useActive) {
    const meetings = universe.flatMap((c) => c.meetings || []).filter((m) => (
      m && m.attendanceStatus !== "cancelada"
      && m.meetingDateStatus !== "before_client_entry"
      && m.meetingDateStatus !== "invalid"
    ));
    const classifiable = meetings.filter((m) => m.attendanceStatus === "compareceu" || m.attendanceStatus === "nao_compareceu");
    if (classifiable.length >= 10) {
      const attended = classifiable.filter((m) => m.attendanceStatus === "compareceu").length;
      const noShow = classifiable.filter((m) => m.attendanceStatus === "nao_compareceu").length;
      attendanceRate = pct(attended, classifiable.length);
      noShowRate = pct(noShow, classifiable.length);
      attendanceSource = "active_clients_subset";
    }
  }

  const scopedMonths = useActive ? countMeetingsByMonth(universe) : [];
  const officialMonths = [...(payload?.distributions?.meetingsByMonth || [])]
    .filter((row) => String(row.month || row.label || "") <= new Date().toISOString().slice(0, 7))
    .sort((a, b) => String(b.month || b.label).localeCompare(String(a.month || a.label)));
  const months = scopedMonths.length >= 2 ? scopedMonths : officialMonths;
  const cmp = months.length >= 2
    ? monthComparison(
      "meetings_completed_by_month",
      months[0]?.completed ?? months[0]?.count,
      months[1]?.completed ?? months[1]?.count,
      "meetings",
      { current: months[0]?.month || months[0]?.label, previous: months[1]?.month || months[1]?.label },
    )
    : null;

  const limitations = [];
  if (scope.type === "active_clients" && !canScope) {
    pushLim(limitations, {
      code: "SCOPE_FALLBACK",
      category: "coverage",
      metric: "meeting_coverage_rate",
      message: "Não foi possível recortar reuniões só de clientes ativos sem distorcer a regra; usou-se o universo oficial da página.",
    });
  }
  if (attendanceSource === "page_official" && scope.type === "active_clients" && canScope) {
    pushLim(limitations, {
      code: "ATTENDANCE_NOT_RESCOPED",
      category: "coverage",
      metric: "attendance_rate",
      message: "Comparecimento/no-show permanece no recorte oficial da página por amostra classificada insuficiente no subconjunto ativo.",
    });
  }
  if (payload?.metadata?.rescheduleCoverageNote) {
    pushLim(limitations, {
      code: "PARTIAL_SOURCE",
      category: "coverage",
      metric: "total_meeting_reschedules",
      message: payload.metadata.rescheduleCoverageNote,
    });
  }

  const highlights = {
    scoped_clients: count,
    clients_with_meeting: withMeeting,
    meeting_coverage_rate: coverage,
    attendance_rate: attendanceRate,
    no_show_rate: noShowRate,
    typical_days_since_last_meeting: daysSince ?? s.typicalDaysSinceLastMeeting ?? null,
    typical_interval_days: interval ?? s.typicalIntervalDays ?? null,
    never_met: neverMet,
    long_gap: longGap,
    official_recency_bands_days: [30, 31, 60, 61, 90, 91, 180],
  };

  const highlightCatalog = {
    clients_with_meeting: {
      value: withMeeting,
      label: useActive ? "Ativos com reunião" : "Clientes com reunião",
      unit: "clients",
    },
    meeting_coverage_rate: { value: coverage, label: "Cobertura de reuniões", unit: "percent" },
    attendance_rate: { value: attendanceRate, label: "Comparecimento", unit: "percent" },
    no_show_rate: { value: noShowRate, label: "No-show", unit: "percent" },
  };
  const highlight_numbers = selectHighlightNumbers("meetings", highlightCatalog);

  return baseSnapshot("meetings", scope, filtersApplied, {
    highlights,
    growth: cmp ? {
      latest_month_completed: cmp.current,
      previous_month_completed: cmp.previous,
      relative_change: cmp.relative_change,
    } : null,
    coverage: { meeting_coverage_rate: coverage, attendance_source: attendanceSource },
    metric_origin: {
      meeting_coverage_rate: useActive ? "active_clients_rows" : "page_official",
      attendance_rate: attendanceSource,
      meetings_completed_by_month: scopedMonths.length >= 2 ? "active_clients_meetings" : "page_official",
    },
    data_quality: { never_met: neverMet, long_gap: longGap },
    comparisons: cmp ? [cmp] : [],
    limitations,
    highlight_numbers,
  });
}

function compactStatRow(row, kind) {
  if (!row) return null;
  if (kind === "association") {
    return {
      id: row.id || null,
      label: row.label || null,
      value: row.association ?? row.value ?? row.measure ?? null,
      abs: row.absMeasure ?? row.associationAbs ?? row.abs ?? null,
      coverage: row.coveragePercent ?? row.coverage ?? null,
      sample: row.sample ?? row.n ?? row.sampleSize ?? null,
    };
  }
  if (kind === "auc") {
    return {
      id: row.id || null,
      label: row.label || null,
      auc: row.auc ?? row.aucAdjusted ?? null,
      coverage: row.coveragePercent ?? row.coverage ?? null,
      sample: row.sample ?? null,
    };
  }
  return {
    id: row.id || null,
    label: row.label || null,
    stdDiff: row.stdDiff ?? row.standardizedDifference ?? null,
    coverage: row.coveragePercent ?? row.coverage ?? null,
    sample: row.sampleSize ?? row.n ?? null,
  };
}

function pickTopN(list, scoreFn, n) {
  return [...(list || [])]
    .filter((row) => row && scoreFn(row) != null && Number.isFinite(Number(scoreFn(row))))
    .sort((a, b) => Math.abs(Number(scoreFn(b))) - Math.abs(Number(scoreFn(a))))
    .slice(0, n);
}

function pickTop(list, scoreFn) {
  return pickTopN(list, scoreFn, 1)[0] || null;
}

function compactCohort(cohort) {
  const averages = cohort?.averages;
  if (!Array.isArray(averages) || !averages.length) return null;
  const a3 = averages.find((a) => a.age === 3 && a.meanRetentionPct != null);
  const a6 = averages.find((a) => a.age === 6 && a.meanRetentionPct != null);
  const a12 = averages.find((a) => a.age === 12 && a.meanRetentionPct != null);
  const pick = a12 || a6 || a3;
  if (!pick) return null;
  return {
    age: pick.age,
    mean_retention_pct: pick.meanRetentionPct ?? null,
    delta_pp: pick.deltaPp ?? null,
    cohort_count: cohort.cohorts?.length ?? null,
    granularity: cohort.granularity || null,
  };
}

function buildStatisticalSnapshot(payload, scope, filtersApplied) {
  const s = payload?.summary || {};
  scope.count = s.analyzedClients ?? s.activeClients ?? null;
  const associations = payload?.associations || [
    ...(payload?.churnAssociations?.numeric || []),
    ...(payload?.churnAssociations?.categorical || []),
  ];
  const aucRows = payload?.univariateAuc || payload?.predictivePower || [];
  const diffs = payload?.activeVsCancelled || payload?.groupDifferences || [];
  const topAssocs = pickTopN(associations, (r) => r.absMeasure ?? r.associationAbs ?? r.abs ?? r.association ?? r.value, 3)
    .map((row) => compactStatRow(row, "association"));
  const topAucs = pickTopN(aucRows, (r) => r.auc ?? r.aucAdjusted, 3)
    .map((row) => compactStatRow(row, "auc"));
  const topDiffs = pickTopN(diffs, (r) => r.stdDiff ?? r.standardizedDifference ?? r.diffAbs ?? r.diff, 3)
    .map((row) => compactStatRow(row, "diff"));
  const topAssoc = topAssocs[0] || null;
  const topAuc = topAucs[0] || null;
  const topDiff = topDiffs[0] || null;
  const survival = payload?.survival?.overall || {};
  const npsCoverage = s.npsPortfolioCoverage ?? null;
  const cohort = compactCohort(payload?.cohort);

  const limitations = [];
  if (npsCoverage != null && Number(npsCoverage) < 20) {
    pushLim(limitations, {
      code: "LOW_COVERAGE",
      category: "coverage",
      metric: "sc_nps",
      message: `Cobertura NPS ${npsCoverage}% — vale para respondentes, não para toda a carteira.`,
      value: npsCoverage,
    });
  }
  for (const row of [topAssoc, topAuc, topDiff]) {
    if (row?.sample != null && Number(row.sample) < 30) {
      pushLim(limitations, {
        code: "SMALL_SAMPLE",
        category: "sample",
        metric: row.id,
        message: `Amostra pequena (${row.sample}) em ${row.label || row.id}.`,
        value: row.sample,
      });
    }
  }

  const highlights = {
    analyzed_clients: s.analyzedClients ?? null,
    active_clients: s.activeClients ?? null,
    confirmed_cancellations: s.confirmedCancellations ?? null,
    top_association: topAssoc,
    top_associations: topAssocs,
    top_auc: topAuc,
    top_aucs: topAucs,
    top_group_difference: topDiff,
    top_group_differences: topDiffs,
    survival: {
      median_survival: survival.medianSurvival ?? null,
      log_rank_p: payload?.survival?.logRank?.p ?? payload?.survival?.logRank?.pValue ?? null,
    },
    cohort,
    nps: { index: s.npsIndex ?? null, responses: s.validNpsResponses ?? s.npsResponses ?? null, coverage: npsCoverage },
  };

  const highlightCatalog = {
    sc_active_clients: { value: highlights.active_clients, label: "Clientes ativos (recorte)", unit: "clients" },
    sc_top_association: {
      value: topAssoc?.abs ?? topAssoc?.value,
      label: topAssoc?.label
        ? (/dias até primeira reunião/i.test(topAssoc.label)
          ? "Associação · tempo até a 1ª reunião"
          : `Associação · ${topAssoc.label}`)
        : "Força da associação",
      unit: "association",
    },
    sc_nps: { value: highlights.nps.index, label: "NPS (respondentes)", unit: "index" },
  };
  const highlight_numbers = selectHighlightNumbers("statistical-crosses", highlightCatalog);

  return baseSnapshot("statistical-crosses", scope, filtersApplied, {
    highlights,
    discoveries: [
      topAssoc && { kind: "association", ...topAssoc },
      topAuc && { kind: "predictive_discrimination", ...topAuc },
      topDiff && { kind: "group_difference", ...topDiff },
      (highlights.survival.median_survival != null || highlights.survival.log_rank_p != null)
        && { kind: "survival", ...highlights.survival },
      cohort && { kind: "cohort", ...cohort },
    ].filter(Boolean).slice(0, 5),
    coverage: { nps: npsCoverage },
    data_quality: { nps_coverage: npsCoverage },
    comparisons: [],
    limitations,
    highlight_numbers,
  });
}

function buildRenewalSnapshot(payload, scope, filtersApplied) {
  const s = payload?.summary || {};
  const rows = Array.isArray(payload?.clients) ? payload.clients : [];
  let eligible = 0;
  let renewed = 0;
  let notRenewed = 0;
  let invalid = 0;
  let maxCycle = 0;
  let totalRenewals = 0;
  const byCycle = new Map();

  if (rows.length) {
    for (const row of rows) {
      const cycle = Number(row?.currentCycle);
      if (!Number.isFinite(cycle) || cycle < 1) {
        invalid += 1;
        continue;
      }
      eligible += 1;
      if (cycle > 1) renewed += 1;
      else notRenewed += 1;
      maxCycle = Math.max(maxCycle, cycle);
      totalRenewals += Math.max(cycle - 1, 0);
      byCycle.set(cycle, (byCycle.get(cycle) || 0) + 1);
    }
  } else {
    renewed = Number(s.renewedClients) || 0;
    maxCycle = Number(s.maxCycle) || 0;
    totalRenewals = Number(s.totalRenewals) || 0;
    eligible = null;
    notRenewed = null;
  }

  const rate = eligible > 0 ? round1((renewed / eligible) * 100) : null;
  scope.count = eligible;
  const cycleDistribution = [...byCycle.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cycle, clients]) => ({ cycle, clients }));
  const cycle1Share = eligible > 0 && byCycle.has(1)
    ? round1((byCycle.get(1) / eligible) * 100)
    : null;

  const limitations = [];
  if (invalid > 0) {
    pushLim(limitations, {
      code: "INVALID_CYCLE",
      category: "data_quality",
      metric: "renewal_eligible",
      value: invalid,
      message: "Alguns clientes ficaram de fora da taxa porque o ciclo atual não está preenchido de forma válida.",
    });
  }
  if (!rows.length) {
    pushLim(limitations, {
      code: "RENEWAL_RATE_UNAVAILABLE",
      category: "coverage",
      metric: "renewal_rate",
      message: "A taxa oficial de renovação depende dos clientes com ciclo válido; o resumo da página não substitui esse recorte.",
    });
  }

  const highlights = {
    eligible,
    renewed,
    not_renewed: notRenewed,
    renewal_rate: rate,
    max_current_cycle: maxCycle || null,
    total_renewals: totalRenewals,
    cycle_1_share: cycle1Share,
  };
  const highlightCatalog = {
    renewal_eligible: { value: eligible, label: "Elegíveis à renovação", unit: "clients" },
    renewed_clients: { value: renewed, label: "Clientes que renovaram", unit: "clients" },
    non_renewed_clients: { value: notRenewed, label: "Clientes que não renovaram", unit: "clients" },
    renewal_rate: { value: rate, label: "Taxa de renovação", unit: "percent" },
    max_current_cycle: { value: maxCycle || null, label: "Maior ciclo atual", unit: "cycles" },
  };

  return baseSnapshot("renewal", scope, filtersApplied, {
    highlights,
    cycle_distribution: cycleDistribution,
    coverage: { eligible, invalid_cycle: invalid },
    data_quality: { invalid_cycle: invalid },
    comparisons: [],
    limitations,
    highlight_numbers: selectHighlightNumbers("renewal", highlightCatalog),
  });
}

function buildEpSnapshot(payload, scope, filtersApplied) {
  const comparison = buildEpActiveComparison(payload);
  const s = payload?.summary || {};
  const activeCount = comparison.active_clients;
  scope.type = "active_clients";
  scope.label = "Clientes ativos";
  scope.count = activeCount || 0;

  const dist = comparison.distribution || {};
  const elig = comparison.eligibility || {};
  const limitations = [];

  if (comparison.source !== "active_clients_rows" || !comparison.ep_performance.length) {
    pushLim(limitations, {
      code: "SCOPE_FALLBACK",
      category: "coverage",
      metric: "ep_active_clients",
      message: "Não foi possível recortar a carteira ativa por engenheiro a partir dos dados da página.",
    });
  }
  if (comparison.nps_sample_limited || (comparison.nps != null && Number(comparison.nps_coverage) < 20)) {
    pushLim(limitations, {
      code: "LOW_COVERAGE",
      category: "coverage",
      metric: "ep_nps",
      value: comparison.nps_coverage,
      message: "O NPS vale para quem respondeu na carteira ativa e não deve ser generalizado para todos os clientes ativos.",
    });
  }
  if (elig.excluded_small_eps > 0) {
    pushLim(limitations, {
      code: "SMALL_SAMPLE",
      category: "sample",
      metric: "ep_small_samples",
      value: elig.excluded_small_eps,
      message: `${elig.excluded_small_eps} engenheiros ficaram de fora da comparação porque a carteira ativa é menor que ${elig.min_active_clients} clientes.`,
    });
  }
  if (dist.spread_pp != null && dist.spread_pp >= 25) {
    pushLim(limitations, {
      code: "COVERAGE_SPREAD",
      category: "coverage",
      metric: "ep_meeting_coverage",
      value: dist.spread_pp,
      message: "A cobertura de reuniões varia entre as carteiras ativas. A comparação cita só engenheiros elegíveis e não trata as carteiras como equivalentes.",
    });
  }
  if (comparison.active_clients_unlinked > 0) {
    pushLim(limitations, {
      code: "WITHOUT_ENGINEER",
      category: "coverage",
      metric: "ep_clients_by_advisor",
      value: comparison.active_clients_unlinked,
      message: "Há clientes ativos sem engenheiro patrimonial vinculado.",
    });
  }
  if (Number(s.cancelledWithoutConfirmedDate) > 0) {
    pushLim(limitations, {
      code: "CANCELLED_WITHOUT_CONFIRMED_DATE",
      category: "data_quality",
      metric: "cancelled_without_confirmed_date",
      value: Number(s.cancelledWithoutConfirmedDate),
      message: "Há clientes marcados como cancelados sem uma data de confirmação. Eles não entram nesta leitura da carteira ativa.",
    });
  }

  const highlights = {
    active_clients: activeCount,
    advisors: comparison.advisors_with_active,
    meeting_coverage: comparison.meeting_coverage,
    clients_with_meeting: comparison.clients_with_meeting,
    clients_without_meeting: comparison.clients_without_meeting,
    mechanisms_coverage: comparison.mechanisms_coverage,
    nps: comparison.nps,
    nps_coverage: comparison.nps_coverage,
    nps_responses: comparison.nps_responses,
    nps_sample_limited: comparison.nps_sample_limited,
    median_meeting_coverage: dist.median_meeting_coverage,
    coverage_spread: {
      advisors: dist.eligible_eps,
      min: dist.min_meeting_coverage,
      max: dist.max_meeting_coverage,
      median: dist.median_meeting_coverage,
      p25: dist.p25_meeting_coverage,
      p75: dist.p75_meeting_coverage,
      spread: dist.spread_pp,
      small_portfolios: elig.excluded_small_eps,
    },
  };

  const highlightCatalog = {
    ep_active_clients: { value: activeCount, label: "Clientes ativos analisados", unit: "clients" },
    ep_clients_by_advisor: { value: comparison.advisors_with_active, label: "EPs com carteira ativa", unit: "advisors" },
    ep_meeting_coverage: { value: dist.median_meeting_coverage ?? comparison.meeting_coverage, label: "Mediana de cobertura de reuniões", unit: "percent" },
    ep_nps: { value: comparison.nps, label: "NPS dos respondentes ativos", unit: "index" },
    ep_clients_without_meeting: { value: comparison.clients_without_meeting, label: "Clientes ativos sem reunião", unit: "clients" },
  };

  return baseSnapshot("ep", scope, filtersApplied, {
    highlights,
    ep_performance: comparison.ep_performance,
    ep_highlights: comparison.ep_highlights,
    ep_attention: comparison.ep_attention,
    comparison_eligibility: elig,
    coverage: {
      meeting_coverage: comparison.meeting_coverage,
      nps: comparison.nps_coverage,
      small_portfolios: elig.excluded_small_eps,
    },
    data_quality: {
      clients_without_engineer: comparison.active_clients_unlinked,
      cancelled_without_confirmed_date: Number(s.cancelledWithoutConfirmedDate) || 0,
    },
    comparisons: [],
    limitations,
    highlight_numbers: selectHighlightNumbers("ep", highlightCatalog),
  });
}

function aggregateTemporalMonthly(rows) {
  const byMonth = new Map();
  for (const row of rows || []) {
    const key = row?.month;
    if (!key) continue;
    const cur = byMonth.get(key) || {
      month: key,
      logins: 0,
      meetings: 0,
      implementations: 0,
      financialUpdates: 0,
      npsResponses: 0,
    };
    cur.logins += Number(row.logins) || 0;
    cur.meetings += Number(row.meetings) || 0;
    cur.implementations += Number(row.implementations) || 0;
    cur.financialUpdates += Number(row.financialUpdates) || 0;
    cur.npsResponses += Number(row.npsResponses) || 0;
    byMonth.set(key, cur);
  }
  return [...byMonth.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function buildTemporalSnapshot(payload, scope, filtersApplied) {
  const s = payload?.summary || {};
  const officialMonthly = Array.isArray(payload?.monthly) ? payload.monthly : [];
  const rows = Array.isArray(payload?.clients) ? payload.clients : [];
  const activeRows = rows.filter((row) => isExecutiveActiveClient(row) || isActiveRow(row));
  const activeMonthly = aggregateTemporalMonthly(activeRows);
  const activeLogins = activeMonthly.reduce((a, r) => a + (r.logins || 0), 0);
  const useActiveSeries = activeMonthly.length >= 2;
  const useActiveLogins = useActiveSeries && activeLogins > 0;
  const monthly = useActiveSeries
    ? activeMonthly.map((row) => {
        const official = officialMonthly.find((m) => m.month === row.month) || {};
        return {
          month: row.month,
          label: official.label || row.month,
          meetings: row.meetings,
          implementations: row.implementations,
          financialUpdates: row.financialUpdates,
          logins: useActiveLogins ? row.logins : (official.logins ?? row.logins),
        };
      })
    : officialMonthly;
  const last = monthly[monthly.length - 1] || null;
  const prev = monthly[monthly.length - 2] || null;
  const currentKey = new Date().toISOString().slice(0, 7);
  const activeSubjects = new Set(activeRows.map((r) => r.subjectId || r.clientId).filter(Boolean));
  scope.type = "active_clients";
  scope.label = "Clientes ativos";
  scope.count = activeSubjects.size || Number(s.activeClientsWithSignals) || null;

  const series = [
    { metric: "temporal_meetings", key: "meetings", unit: "meetings", label: "Reuniões" },
    { metric: "temporal_logins", key: "logins", unit: "events", label: "Acessos" },
    { metric: "temporal_financial_updates", key: "financialUpdates", unit: "events", label: "Atualizações financeiras" },
    { metric: "temporal_implementations", key: "implementations", unit: "events", label: "Implementações" },
  ];
  const comparisons = [];
  if (last && prev) {
    for (const item of series) {
      const cmp = monthComparison(
        item.metric,
        last[item.key],
        prev[item.key],
        item.unit,
        { current: last.month || last.label, previous: prev.month || prev.label },
      );
      if (cmp) comparisons.push(cmp);
    }
  }
  const relevant = comparisons
    .filter((cmp) => cmp.relative_change != null && Math.abs(Number(cmp.relative_change)) >= 10)
    .sort((a, b) => Math.abs(Number(b.relative_change)) - Math.abs(Number(a.relative_change)))
    .slice(0, 3);

  const limitations = [];
  if (monthly.length < 2) {
    pushLim(limitations, {
      code: "INSUFFICIENT_HISTORY",
      category: "sample",
      metric: "temporal_meetings",
      message: "Ainda não há períodos suficientes para comparar a variação recente.",
    });
  }
  if (last?.month && String(last.month) === currentKey) {
    pushLim(limitations, {
      code: "PERIOD_IN_PROGRESS",
      category: "coverage",
      metric: "temporal_meetings",
      message: "O período mais recente ainda está em andamento.",
    });
  }
  if (useActiveSeries && !useActiveLogins) {
    pushLim(limitations, {
      code: "LOGIN_SCOPE",
      category: "coverage",
      metric: "temporal_logins",
      message: "Os acessos da série oficial incluem usuários da plataforma; o recorte ativo não sustentou essa série.",
    });
  }

  const highlights = {
    last_month: last?.month || null,
    previous_month: prev?.month || null,
    last_meetings: last?.meetings ?? null,
    last_logins: last?.logins ?? null,
    last_financial_updates: last?.financialUpdates ?? null,
    last_implementations: last?.implementations ?? null,
    active_with_signals: s.activeClientsWithSignals ?? null,
    relevant_changes: relevant.length,
  };
  const highlightCatalog = {
    temporal_meetings: { value: last?.meetings ?? null, label: "Reuniões no período recente", unit: "meetings" },
    temporal_financial_updates: { value: last?.financialUpdates ?? null, label: "Atualizações financeiras", unit: "events" },
    temporal_active_with_signals: { value: s.activeClientsWithSignals ?? null, label: "Clientes ativos com sinais", unit: "clients" },
    temporal_logins: { value: last?.logins ?? null, label: "Acessos", unit: "events" },
  };

  return baseSnapshot("temporal", scope, filtersApplied, {
    highlights,
    recent_months: monthly.slice(-6).map((row) => ({
      month: row.month,
      meetings: row.meetings,
      logins: row.logins,
      financialUpdates: row.financialUpdates,
      implementations: row.implementations,
    })),
    metric_origin: {
      temporal_meetings: useActiveSeries ? "active_clients_rows" : "page_official",
      temporal_implementations: useActiveSeries ? "active_clients_rows" : "page_official",
      temporal_financial_updates: useActiveSeries ? "active_clients_rows" : "page_official",
      temporal_logins: useActiveLogins ? "active_clients_rows" : "page_official",
      temporal_active_with_signals: "active_clients",
      pre_cancellation_signals: "cancelled_clients",
    },
    growth: relevant[0]
      ? { metric: relevant[0].metric, relative_change: relevant[0].relative_change, direction: relevant[0].direction }
      : null,
    comparisons: relevant,
    limitations,
    highlight_numbers: selectHighlightNumbers("temporal", highlightCatalog),
  });
}

function buildStubSnapshot(pageId, payload, scope, filtersApplied) {
  const s = payload?.summary || {};
  scope.count = s.activeClients ?? s.totalClients ?? s.analyzedClients ?? null;
  return baseSnapshot(pageId, scope, filtersApplied, {
    highlights: { note: "Página com perfil executivo; snapshot detalhado ainda não está no piloto Gemini." },
    highlight_numbers: [],
  });
}

/**
 * @param {string} page
 * @param {object} payload payload oficial já calculado
 * @param {{ filters?: object }} [options]
 */
export function buildExecutiveSnapshot(page, payload, options = {}) {
  const started = Date.now();
  const pageId = String(page || "").trim();
  const filters = options.filters && typeof options.filters === "object" ? options.filters : {};
  const profile = getExecutivePageProfile(pageId);
  const scope = resolveExecutiveScope(pageId, filters);

  let snapshot;
  if (pageId === "general") snapshot = buildGeneralSnapshot(payload, scope, filters);
  else if (pageId === "meetings") snapshot = buildMeetingsSnapshot(payload, scope, filters);
  else if (pageId === "statistical-crosses") snapshot = buildStatisticalSnapshot(payload, scope, filters);
  else if (pageId === "renewal") snapshot = buildRenewalSnapshot(payload, scope, filters);
  else if (pageId === "ep") snapshot = buildEpSnapshot(payload, scope, filters);
  else if (pageId === "temporal") snapshot = buildTemporalSnapshot(payload, scope, filters);
  else snapshot = buildStubSnapshot(pageId, payload, scope, filters);

  snapshot.page_profile = compactPageProfile(pageId) || { id: pageId, title: profile?.title || pageId };
  snapshot.timing_ms = { snapshot: Date.now() - started };

  const json = JSON.parse(JSON.stringify(snapshot, (key, value) => {
    const stripIfArray = new Set([
      "clients",
      "meetings",
      "topClients",
      "engineers",
      "byAdvisor",
      "renewalClients",
      "npsByAdvisor",
      "mechanismsByAdvisor",
      "meetingCoverageByAdvisor",
    ]);
    if (stripIfArray.has(key) && Array.isArray(value)) return undefined;
    if (typeof value === "string") return stripPiiString(value);
    return value;
  }));
  json.metadata_size = {
    bytes: estimateJsonBytes(json),
    approx_tokens: approximateTokens(json),
  };
  return json;
}

export function buildHighlightNumbers(snapshot) {
  return Array.isArray(snapshot?.highlight_numbers) ? snapshot.highlight_numbers.slice(0, 4) : [];
}

export { classifyLimitation };
