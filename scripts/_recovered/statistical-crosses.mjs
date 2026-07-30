/**
 * Cruzamentos Estatísticos — BASE QV somente (Fase 1).
 * Reutiliza compute*Payload de Dados Gerais, Reuniões e Mecanismos.
 * Não usa App Pharus. NPS/Renovação fora da UI até elegibilidade confirmada.
 */
import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";
import { computeGeneralDataPayload } from "./general-data.mjs";
import { computeMeetingsPayload } from "./meetings.mjs";
import { computeMechanismsPayload } from "./mechanisms.mjs";
import {
  associationStrength,
  buildContingencyFromGroups,
  chiSquareIndependence,
  fisherExact2x2,
  kaplanMeier,
  logisticUnivariateAuc,
  logRank,
  mannWhitney,
  mean,
  median,
  pointBiserial,
  round3,
  round4,
} from "./_shared/stats-tests.mjs";

const MIN_GROUP = 30;
const MIN_AUC = 30;
const MIN_KM_GROUP = 20;

const PENDING = {
  nps: {
    status: "pending_audit_ui",
    sourceFound: true,
    tables: ["nps_responses"],
    note:
      "Fonte nps_responses confirmada (score 0–10, client_id). Seção NPS fora desta fase na UI até join/metodologia de cruzamento serem liberados.",
  },
  renewal: {
    status: "unavailable",
    sourceFound: false,
    note:
      "Renovação: sem população elegível / renovados confirmada na BASE QV. Não renderizar seção.",
  },
};

function blankToNull(v) {
  if (v == null) return null;
  if (typeof v === "string" && !v.trim()) return null;
  return v;
}

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / 86400000);
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function pct(n, d) {
  if (d == null || d <= 0 || n == null) return null;
  return Math.round((n / d) * 1000) / 10;
}

function inDateRange(iso, from, to) {
  if (!from && !to) return true;
  const d = parseDate(iso);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function incomeBand(v) {
  if (v == null || !Number.isFinite(v)) return "Não informado";
  if (v < 10000) return "Até 10 mil";
  if (v < 20000) return "10 a 20 mil";
  if (v < 50000) return "20 a 50 mil";
  return "Acima de 50 mil";
}

function liquidityBand(v) {
  if (v == null || !Number.isFinite(v)) return "Não informado";
  if (v < 50000) return "Até 50 mil";
  if (v < 200000) return "50 a 200 mil";
  if (v < 500000) return "200 a 500 mil";
  return "Acima de 500 mil";
}

function stayBand(days) {
  if (days == null || !Number.isFinite(days) || days < 0) return "Dados insuficientes";
  const months = Math.floor(days / 30);
  if (months <= 3) return "Até 3 meses";
  if (months <= 6) return "De 4 a 6 meses";
  if (months <= 12) return "De 7 a 12 meses";
  if (months <= 24) return "De 13 a 24 meses";
  return "Mais de 24 meses";
}

/** Join único por cliente — regras alinhadas às páginas existentes. */
export function buildAnalyticalPopulation(generalPayload, meetingsPayload, mechanismsPayload, now = new Date()) {
  const generalClients = Array.isArray(generalPayload?.clients) ? generalPayload.clients : [];
  const meetingById = new Map(
    (Array.isArray(meetingsPayload?.clients) ? meetingsPayload.clients : []).map((c) => [String(c.clientId), c]),
  );
  const mechById = new Map(
    (Array.isArray(mechanismsPayload?.clients) ? mechanismsPayload.clients : []).map((c) => [String(c.clientId), c]),
  );

  const rows = [];
  const warningsAgg = new Map();
  const bump = (code, message) => {
    if (!warningsAgg.has(code)) warningsAgg.set(code, { code, message, count: 0 });
    warningsAgg.get(code).count += 1;
  };

  for (const g of generalClients) {
    const id = String(g.clientId || g.id || "");
    if (!id) continue;
    const m = meetingById.get(id) || null;
    const k = mechById.get(id) || null;
    const status = g.analyticalStatus || g.status || "Não informado";
    const isCancelled = status === "Cancelado";
    const isActive = status === "Ativo";
    const isFrozen = status === "Congelado";

    const contractDate = parseDate(g.contractDate);
    const createdAt = parseDate(g.createdAt);
    const hireDate = contractDate || createdAt;
    const cancellationDate = parseDate(g.cancellationDate);
    let stayDays = g.stayDays;
    if (stayDays == null && hireDate) {
      const end = isCancelled && cancellationDate ? cancellationDate : now;
      stayDays = daysBetween(hireDate, end);
      if (stayDays != null && stayDays < 0) {
        bump("negative_stay", "Permanência negativa (cancelamento anterior à contratação)");
        stayDays = null;
      }
    }

    const meetingCount = m?.totalMeetings ?? null;
    const journeyCount = m?.journeyMeetingsCount ?? null;
    const noShowCount = m?.absences ?? null;
    const rescheduleCount = m?.reschedules ?? null;
    let attendanceRate = null;
    if (journeyCount != null && journeyCount > 0 && noShowCount != null) {
      const attendedProxy = journeyCount - noShowCount;
      if (attendedProxy >= 0) attendanceRate = round4(attendedProxy / journeyCount);
    }

    const available = k?.available ?? null;
    const implemented = k?.implemented ?? null;
    const implementationRate = k?.implementationPercent != null
      ? round4(Number(k.implementationPercent) / 100)
      : (available > 0 && implemented != null ? round4(implemented / available) : null);

    // Survival record
    let survivalTime = null;
    let survivalEvent = 0;
    let survivalValid = false;
    if (hireDate) {
      if (isCancelled && cancellationDate) {
        const t = daysBetween(hireDate, cancellationDate);
        if (t != null && t >= 0) {
          survivalTime = t;
          survivalEvent = 1;
          survivalValid = true;
        } else if (t != null && t < 0) {
          bump("cancel_before_hire", "Cancelamento anterior à contratação — excluído da sobrevivência");
        }
      } else if (!isCancelled) {
        const t = daysBetween(hireDate, now);
        if (t != null && t >= 0) {
          survivalTime = t;
          survivalEvent = 0;
          survivalValid = true;
        }
      }
    } else {
      bump("missing_hire_date", "Sem data de contratação — excluído da sobrevivência");
    }

    rows.push({
      clientId: id,
      clientCode: blankToNull(g.clientCode) || blankToNull(g.codigo) || null,
      clientName: blankToNull(g.clientName) || blankToNull(g.name) || "Não informado",
      statusAnalytic: status,
      isCancelled,
      isActive,
      isFrozen,
      contractDate: contractDate ? contractDate.toISOString() : null,
      cancellationDate: cancellationDate ? cancellationDate.toISOString() : null,
      observedEndDate: (isCancelled && cancellationDate ? cancellationDate : now).toISOString(),
      stayDays,
      stayBand: stayBand(stayDays),
      segment: blankToNull(g.segment) || blankToNull(g.segmentLabel) || "Dados insuficientes",
      engineer: blankToNull(g.engineer) || "Não informado",
      monthlyIncome: g.monthlyIncome ?? null,
      liquidityReserve: g.liquidityReserve ?? null,
      lastContribution: g.lastContribution ?? null,
      hasFinancialData: Boolean(g.hasFinancialProfile),
      incomeBand: g.incomeBand || incomeBand(g.monthlyIncome),
      liquidityBand: g.liquidityBand || liquidityBand(g.liquidityReserve),
      meetingCount,
      journeyMeetingCount: journeyCount,
      noShowCount,
      rescheduleCount,
      attendanceRate,
      daysSinceLastMeeting: m?.daysSinceLastMeeting ?? null,
      averageIntervalDays: m?.averageIntervalDays ?? null,
      typicalIntervalDays: m?.typicalIntervalDays ?? null,
      daysToFirstMeeting: m?.daysFromEntryToFirstMeeting ?? null,
      hasMeeting: (meetingCount ?? 0) > 0,
      firstMeetingCompleted: m?.firstMeetingCompleted === true,
      mechanismCount: available,
      implementedMechanismCount: implemented,
      inProgressMechanismCount: k?.inProgress ?? null,
      eligibleMechanismCount: k?.eligible ?? null,
      implementationRate,
      implementationPercent: k?.implementationPercent ?? null,
      daysToFirstImplementation: k?.daysToFirstImplementation ?? null,
      hasMechanism: (available ?? 0) > 0,
      hasFirstImplementation: (implemented ?? 0) > 0 || Boolean(k?.firstImplementationDate),
      survivalTime,
      survivalEvent,
      survivalValid,
    });
  }

  return {
    clients: rows,
    warnings: [...warningsAgg.values()].sort((a, b) => b.count - a.count),
  };
}

function applyPopulationFilters(clients, filters = {}, now = new Date()) {
  const hireFrom = filters.hireFrom ? parseDate(filters.hireFrom) : null;
  const hireTo = filters.hireTo ? parseDate(`${filters.hireTo}T23:59:59.999Z`) : null;
  const cancelFrom = filters.cancelFrom ? parseDate(filters.cancelFrom) : null;
  const cancelTo = filters.cancelTo ? parseDate(`${filters.cancelTo}T23:59:59.999Z`) : null;
  const minSample = Number(filters.minSample);
  // minSample applied later to variable results, not population drop

  return clients.filter((c) => {
    if (filters.status && filters.status !== "all") {
      if (filters.status === "active" && !c.isActive) return false;
      if (filters.status === "cancelled" && !c.isCancelled) return false;
      if (filters.status === "frozen" && !c.isFrozen) return false;
      if (filters.status === "active_cancelled" && !(c.isActive || c.isCancelled)) return false;
    }
    if (filters.segment && filters.segment !== "all" && c.segment !== filters.segment) return false;
    if (filters.engineer && filters.engineer !== "all" && c.engineer !== filters.engineer) return false;
    if (filters.hasFinancial === "yes" && !c.hasFinancialData) return false;
    if (filters.hasFinancial === "no" && c.hasFinancialData) return false;
    if (filters.hasMeeting === "yes" && !c.hasMeeting) return false;
    if (filters.hasMeeting === "no" && c.hasMeeting) return false;
    if (filters.hasMechanism === "yes" && !c.hasMechanism) return false;
    if (filters.hasMechanism === "no" && c.hasMechanism) return false;
    if (filters.incomeBand && filters.incomeBand !== "all" && c.incomeBand !== filters.incomeBand) return false;
    if (filters.liquidityBand && filters.liquidityBand !== "all" && c.liquidityBand !== filters.liquidityBand) return false;
    if (filters.stayBand && filters.stayBand !== "all" && c.stayBand !== filters.stayBand) return false;
    if (!inDateRange(c.contractDate, hireFrom, hireTo)) return false;
    if (cancelFrom || cancelTo) {
      if (!c.cancellationDate) return false;
      if (!inDateRange(c.cancellationDate, cancelFrom, cancelTo)) return false;
    }
    return true;
  });
}

const NUMERIC_VARS = [
  { id: "monthlyIncome", label: "Renda mensal", field: "monthlyIncome", predictive: true, source: "client_financial_data.ultima_renda_mensal" },
  { id: "liquidityReserve", label: "Reserva de liquidez", field: "liquidityReserve", predictive: true, source: "client_financial_data.reserva_liquidez" },
  { id: "lastContribution", label: "Último aporte", field: "lastContribution", predictive: true, source: "client_financial_data.ultimo_aporte" },
  { id: "meetingCount", label: "Total de reuniões", field: "meetingCount", predictive: true, source: "client_meetings + manual_meetings (dashboard Reuniões)" },
  { id: "noShowCount", label: "No-shows", field: "noShowCount", predictive: true, source: "meeting_attendance" },
  { id: "rescheduleCount", label: "Remarcações", field: "rescheduleCount", predictive: true, source: "meeting_attendance.remarcado" },
  { id: "attendanceRate", label: "Taxa de presença (proxy)", field: "attendanceRate", predictive: true, source: "journeyMeetings − absences" },
  { id: "daysSinceLastMeeting", label: "Dias desde última reunião", field: "daysSinceLastMeeting", predictive: true, source: "dashboard Reuniões" },
  { id: "averageIntervalDays", label: "Intervalo médio entre reuniões", field: "averageIntervalDays", predictive: true, source: "dashboard Reuniões" },
  { id: "daysToFirstMeeting", label: "Dias até primeira reunião", field: "daysToFirstMeeting", predictive: true, source: "dashboard Reuniões" },
  { id: "mechanismCount", label: "Quantidade de mecanismos", field: "mechanismCount", predictive: true, source: "client_mecanismos" },
  { id: "implementedMechanismCount", label: "Mecanismos implementados", field: "implementedMechanismCount", predictive: true, source: "client_mecanismos status concluído" },
  { id: "implementationPercent", label: "Percentual implementado", field: "implementationPercent", predictive: true, source: "dashboard Mecanismos" },
  { id: "daysToFirstImplementation", label: "Dias até primeira implementação", field: "daysToFirstImplementation", predictive: true, source: "dashboard Mecanismos" },
  { id: "stayDays", label: "Permanência (dias)", field: "stayDays", predictive: false, source: "contratação → cancelamento ou hoje", note: "Para cancelados = tempo até evento; para ativos = censurado. Excluída do AUC (vazamento/censura)." },
];

const CATEGORICAL_VARS = [
  { id: "segment", label: "Segmento", field: "segment", predictive: true, source: "regra Dados Gerais" },
  { id: "engineer", label: "Engenheiro Patrimonial", field: "engineer", predictive: true, source: "clients.engenheiro_patrimonial", caution: "Muitos níveis — amostra por EP pode ser pequena" },
  { id: "hasFinancialData", label: "Possui diagnóstico financeiro", field: "hasFinancialData", predictive: true, source: "existência em client_financial_data", binary: true },
  { id: "hasMeeting", label: "Possui reunião", field: "hasMeeting", predictive: true, source: "dashboard Reuniões", binary: true },
  { id: "hasMechanism", label: "Possui mecanismo", field: "hasMechanism", predictive: true, source: "dashboard Mecanismos", binary: true },
  { id: "hasFirstImplementation", label: "Possui implementação", field: "hasFirstImplementation", predictive: true, source: "dashboard Mecanismos", binary: true },
  { id: "incomeBand", label: "Faixa de renda", field: "incomeBand", predictive: true, source: "derivado de renda" },
  { id: "liquidityBand", label: "Faixa de reserva", field: "liquidityBand", predictive: true, source: "derivado de reserva" },
];

function missingRate(clients, field) {
  if (!clients.length) return 100;
  const miss = clients.filter((c) => {
    const v = c[field];
    return v == null || v === "" || v === "Não informado" || v === "Dados insuficientes";
  }).length;
  return pct(miss, clients.length);
}

function analyzeNumericVariable(def, active, cancelled, minSample) {
  const aVals = active.map((c) => c[def.field]).filter((v) => v != null && Number.isFinite(v));
  const cVals = cancelled.map((c) => c[def.field]).filter((v) => v != null && Number.isFinite(v));
  const allForMissing = [...active, ...cancelled];
  const miss = missingRate(allForMissing, def.field);
  const nA = aVals.length;
  const nC = cVals.length;
  const warnings = [];
  if (nA < minSample || nC < minSample) warnings.push("baixa amostra");
  if (miss >= 40) warnings.push("alta ausência");

  const medA = median(aVals);
  const medC = median(cVals);
  const meanA = mean(aVals);
  const meanC = mean(cVals);
  let diffAbs = null;
  let diffPct = null;
  if (medA != null && medC != null) {
    diffAbs = round3(medC - medA);
    if (medA !== 0) diffPct = pct(medC - medA, Math.abs(medA));
  }

  const mw = mannWhitney(aVals, cVals);
  if (mw.warning) warnings.push(mw.warning);

  // Association with cancel (y=1 cancelled): point-biserial on combined
  const xs = [];
  const ys = [];
  for (const c of active) {
    if (c[def.field] != null && Number.isFinite(c[def.field])) {
      xs.push(c[def.field]);
      ys.push(0);
    }
  }
  for (const c of cancelled) {
    if (c[def.field] != null && Number.isFinite(c[def.field])) {
      xs.push(c[def.field]);
      ys.push(1);
    }
  }
  const pb = pointBiserial(xs, ys);
  if (pb.warning) warnings.push(pb.warning);

  let aucResult = { auc: null, warning: "excluded" };
  if (def.predictive) {
    aucResult = logisticUnivariateAuc(xs, ys);
    if (aucResult.warning) warnings.push(aucResult.warning);
  } else {
    warnings.push("excluída do AUC (vazamento/censura)");
  }

  const effect = pb.r != null ? Math.abs(pb.r) : (mw.rankBiserial != null ? Math.abs(mw.rankBiserial) : null);
  const direction = pb.r == null ? null : (pb.r > 0 ? "maior nos cancelados" : pb.r < 0 ? "maior nos ativos" : "neutra");

  return {
    id: def.id,
    label: def.label,
    type: "numeric",
    source: def.source,
    predictiveEligible: Boolean(def.predictive),
    note: def.note || null,
    activeMedian: round3(medA),
    cancelledMedian: round3(medC),
    activeMean: round3(meanA),
    cancelledMean: round3(meanC),
    differenceAbs: diffAbs,
    differencePct: diffPct,
    activeN: nA,
    cancelledN: nC,
    missingPercent: miss,
    associationMeasure: "point_biserial",
    association: pb.r,
    associationAbs: effect,
    associationStrength: associationStrength(effect, "r"),
    associationLabel: "Associação com cancelamento",
    effectSize: mw.rankBiserial,
    effectSizeMeasure: "rank_biserial",
    pValue: mw.pValue,
    test: "Mann–Whitney U",
    auc: aucResult.auc,
    aucRaw: aucResult.aucRaw ?? null,
    aucInverted: aucResult.aucInverted ?? false,
    aucDirection: aucResult.direction ?? null,
    methodology: {
      comparison: "mediana prioritária; Mann–Whitney U (p bilateral, aprox. normal)",
      association: "point-biserial (numérico × cancelado)",
      auc: def.predictive ? "regressão logística univariada + AUC com CV estratificada" : "não aplicável",
    },
    warnings: [...new Set(warnings)],
  };
}

function analyzeCategoricalVariable(def, active, cancelled, minSample) {
  const toLabel = (c) => {
    const v = c[def.field];
    if (def.binary) return v ? "Sim" : "Não";
    return v == null || v === "" ? "Não informado" : String(v);
  };
  const aLabs = active.map(toLabel);
  const cLabs = cancelled.map(toLabel);
  const miss = missingRate([...active, ...cancelled], def.field);
  const warnings = [];
  if (active.length < minSample || cancelled.length < minSample) warnings.push("baixa amostra");
  if (miss >= 40) warnings.push("alta ausência");
  if (def.caution) warnings.push(def.caution);

  const { table, labels } = buildContingencyFromGroups(aLabs, cLabs);
  let chi = { chi2: null, pValue: null, cramersV: null, warning: "empty" };
  let fisher = null;
  if (table) {
    chi = chiSquareIndependence(table);
    if (chi.warning) warnings.push(chi.warning);
    if (labels.length === 2) {
      fisher = fisherExact2x2(table[0][0], table[0][1], table[1][0], table[1][1]);
    }
  }

  // Distribution diffs (pp)
  const dist = labels.map((lab) => {
    const aN = aLabs.filter((x) => x === lab).length;
    const cN = cLabs.filter((x) => x === lab).length;
    const aP = pct(aN, active.length || 1);
    const cP = pct(cN, cancelled.length || 1);
    return {
      label: lab,
      activeCount: aN,
      cancelledCount: cN,
      activePercent: aP,
      cancelledPercent: cP,
      diffPp: round3((cP ?? 0) - (aP ?? 0)),
    };
  }).sort((a, b) => Math.abs(b.diffPp) - Math.abs(a.diffPp));

  // AUC: for binary use 0/1; for multi use crude one-vs-rest on most different level — skip multi for AUC if many levels
  let aucResult = { auc: null, warning: "not_applicable" };
  if (def.predictive && labels.length === 2) {
    const posLabel = labels[0];
    const xs = [];
    const ys = [];
    for (const c of active) {
      xs.push(toLabel(c) === posLabel ? 1 : 0);
      ys.push(0);
    }
    for (const c of cancelled) {
      xs.push(toLabel(c) === posLabel ? 1 : 0);
      ys.push(1);
    }
    aucResult = logisticUnivariateAuc(xs, ys);
    if (aucResult.warning) warnings.push(aucResult.warning);
  } else if (def.predictive && labels.length > 2) {
    // Encode as proportion risk: use numeric risk score = cancelled rate of category (in-sample leakage for encoding!)
    // Avoid target leakage: use leave-one-out style is heavy; instead skip AUC for high-cardinality and note.
    if (labels.length > 8 || def.id === "engineer") {
      warnings.push("AUC não calculado (muitos níveis / risco de vazamento de encoding)");
      aucResult = { auc: null, warning: "high_cardinality" };
    } else {
      const rate = new Map();
      for (const lab of labels) {
        const n = cLabs.filter((x) => x === lab).length + aLabs.filter((x) => x === lab).length;
        const e = cLabs.filter((x) => x === lab).length;
        rate.set(lab, n ? e / n : 0);
      }
      const xs = [];
      const ys = [];
      for (const c of active) {
        xs.push(rate.get(toLabel(c)) ?? 0);
        ys.push(0);
      }
      for (const c of cancelled) {
        xs.push(rate.get(toLabel(c)) ?? 0);
        ys.push(1);
      }
      // Note: encoding uses full-sample rates — mild leakage; documented.
      aucResult = logisticUnivariateAuc(xs, ys);
      warnings.push("encoding categórico com taxa amostral (vazamento leve) — interpretar com cautela");
      if (aucResult.warning) warnings.push(aucResult.warning);
    }
  }

  const effect = chi.cramersV;
  return {
    id: def.id,
    label: def.label,
    type: "categorical",
    source: def.source,
    predictiveEligible: Boolean(def.predictive),
    activeN: active.length,
    cancelledN: cancelled.length,
    missingPercent: miss,
    distribution: dist,
    associationMeasure: "cramers_v",
    association: chi.cramersV,
    associationAbs: effect,
    associationStrength: associationStrength(effect, "cramers_v"),
    associationLabel: "Associação com cancelamento",
    effectSize: chi.cramersV,
    effectSizeMeasure: "cramers_v",
    pValue: fisher?.pValue ?? chi.pValue,
    test: fisher ? "Fisher exact (2×2) / qui-quadrado" : "Qui-quadrado",
    chi2: chi.chi2,
    auc: aucResult.auc,
    aucRaw: aucResult.aucRaw ?? null,
    aucInverted: aucResult.aucInverted ?? false,
    aucDirection: aucResult.direction ?? null,
    methodology: {
      comparison: "diferença em pontos percentuais por categoria",
      association: "Cramér’s V (+ Fisher se 2×2)",
      auc: def.predictive ? "logística univariada + AUC CV" : "não aplicável",
    },
    warnings: [...new Set(warnings)],
  };
}

function analyzePopulation(clients, { minSample = MIN_GROUP, includeFrozenSeparate = false } = {}) {
  const active = clients.filter((c) => c.isActive);
  const cancelled = clients.filter((c) => c.isCancelled);
  const frozen = clients.filter((c) => c.isFrozen);

  const comparisons = [];
  const associations = [];
  const predictivePower = [];
  const quality = [];
  const excluded = [];

  for (const def of NUMERIC_VARS) {
    const row = analyzeNumericVariable(def, active, cancelled, minSample);
    comparisons.push(row);
    associations.push({
      id: row.id,
      label: row.label,
      type: row.type,
      association: row.association,
      associationAbs: row.associationAbs,
      strength: row.associationStrength,
      direction: row.association != null && row.association > 0 ? "positiva_com_cancelamento" : row.association < 0 ? "negativa_com_cancelamento" : null,
      sample: row.activeN + row.cancelledN,
      missingPercent: row.missingPercent,
      measure: row.associationMeasure,
    });
    if (def.predictive) {
      predictivePower.push({
        id: row.id,
        label: row.label,
        type: row.type,
        auc: row.auc,
        aucInverted: row.aucInverted,
        direction: row.aucDirection,
        sample: (row.activeN || 0) + (row.cancelledN || 0),
        missingPercent: row.missingPercent,
        warnings: row.warnings,
      });
    } else {
      excluded.push({ id: def.id, label: def.label, reason: def.note || "Não elegível a AUC" });
    }
    quality.push({
      id: def.id,
      label: def.label,
      type: "numeric",
      missingPercent: row.missingPercent,
      activeN: row.activeN,
      cancelledN: row.cancelledN,
      sufficient: row.activeN >= minSample && row.cancelledN >= minSample,
    });
  }

  for (const def of CATEGORICAL_VARS) {
    const row = analyzeCategoricalVariable(def, active, cancelled, minSample);
    comparisons.push(row);
    associations.push({
      id: row.id,
      label: row.label,
      type: row.type,
      association: row.association,
      associationAbs: row.associationAbs,
      strength: row.associationStrength,
      direction: null,
      sample: row.activeN + row.cancelledN,
      missingPercent: row.missingPercent,
      measure: row.associationMeasure,
    });
    if (def.predictive) {
      predictivePower.push({
        id: row.id,
        label: row.label,
        type: row.type,
        auc: row.auc,
        aucInverted: row.aucInverted,
        direction: row.aucDirection,
        sample: (row.activeN || 0) + (row.cancelledN || 0),
        missingPercent: row.missingPercent,
        warnings: row.warnings,
      });
    }
    quality.push({
      id: def.id,
      label: def.label,
      type: "categorical",
      missingPercent: row.missingPercent,
      activeN: row.activeN,
      cancelledN: row.cancelledN,
      sufficient: row.activeN >= minSample && row.cancelledN >= minSample,
    });
  }

  associations.sort((a, b) => (b.associationAbs || 0) - (a.associationAbs || 0));
  predictivePower.sort((a, b) => (b.auc || 0) - (a.auc || 0));

  // Survival overall
  const survRecords = clients
    .filter((c) => c.survivalValid)
    .map((c) => ({ time: c.survivalTime, event: c.survivalEvent }));
  const overall = kaplanMeier(survRecords);

  // Survival by segment (top groups with enough sample)
  const groupField = "segment";
  const groupLevels = [...new Set(clients.map((c) => c[groupField]).filter(Boolean))];
  const groups = [];
  for (const level of groupLevels) {
    const subset = clients.filter((c) => c[groupField] === level && c.survivalValid);
    if (subset.length < MIN_KM_GROUP) continue;
    const km = kaplanMeier(subset.map((c) => ({ time: c.survivalTime, event: c.survivalEvent })));
    groups.push({
      field: groupField,
      level,
      n: subset.length,
      events: km.events,
      censored: km.censored,
      medianSurvival: km.medianSurvival,
      curve: downsampleCurve(km.curve, 40),
    });
  }
  groups.sort((a, b) => b.n - a.n);

  let logRankResult = null;
  if (groups.length >= 2) {
    const g0 = clients.filter((c) => c[groupField] === groups[0].level && c.survivalValid);
    const g1 = clients.filter((c) => c[groupField] === groups[1].level && c.survivalValid);
    logRankResult = {
      groupA: groups[0].level,
      groupB: groups[1].level,
      ...logRank(
        g0.map((c) => ({ time: c.survivalTime, event: c.survivalEvent })),
        g1.map((c) => ({ time: c.survivalTime, event: c.survivalEvent })),
      ),
      note: "Comparação log-rank entre os dois maiores segmentos; múltiplas comparações não corrigidas.",
    };
  }

  // Binary survival splits
  for (const field of ["hasFinancialData", "hasMeeting", "hasMechanism"]) {
    for (const level of [true, false]) {
      const subset = clients.filter((c) => c[field] === level && c.survivalValid);
      if (subset.length < MIN_KM_GROUP) continue;
      const km = kaplanMeier(subset.map((c) => ({ time: c.survivalTime, event: c.survivalEvent })));
      groups.push({
        field,
        level: level ? "Sim" : "Não",
        n: subset.length,
        events: km.events,
        censored: km.censored,
        medianSurvival: km.medianSurvival,
        curve: downsampleCurve(km.curve, 40),
      });
    }
  }

  const events = survRecords.filter((r) => r.event === 1).length;
  const censored = survRecords.filter((r) => r.event === 0).length;

  return {
    population: {
      total: clients.length,
      active: active.length,
      cancelled: cancelled.length,
      frozen: frozen.length,
      events,
      censored,
      survivalEligible: survRecords.length,
      includeFrozenSeparate,
    },
    comparisons,
    associations: associations.filter((a) => a.associationAbs != null && (a.sample || 0) >= minSample * 2),
    predictivePower: predictivePower.filter((p) => p.auc != null),
    survival: {
      overall: {
        ...overall,
        curve: downsampleCurve(overall.curve, 60),
        definition: {
          start: "data de contratação (data_inicio_ciclo ou created_at)",
          event: "cancelamento analítico com data consolidada",
          censor: "clientes sem cancelamento — tempo até a data de geração",
        },
      },
      groups,
      logRank: logRankResult,
    },
    quality,
    excludedVariables: excluded,
  };
}

function downsampleCurve(curve, maxPoints) {
  if (!curve?.length || curve.length <= maxPoints) return curve || [];
  const out = [curve[0]];
  const step = (curve.length - 2) / (maxPoints - 2);
  for (let i = 1; i < maxPoints - 1; i += 1) {
    out.push(curve[Math.round(i * step)]);
  }
  out.push(curve[curve.length - 1]);
  return out;
}

function parseFiltersFromRequest(request) {
  try {
    const url = new URL(request.url);
    const get = (k) => url.searchParams.get(k);
    return {
      status: get("status") || "active_cancelled",
      segment: get("segment") || "all",
      engineer: get("engineer") || "all",
      hasFinancial: get("hasFinancial") || "all",
      hasMeeting: get("hasMeeting") || "all",
      hasMechanism: get("hasMechanism") || "all",
      incomeBand: get("incomeBand") || "all",
      liquidityBand: get("liquidityBand") || "all",
      stayBand: get("stayBand") || "all",
      hireFrom: get("hireFrom") || null,
      hireTo: get("hireTo") || null,
      cancelFrom: get("cancelFrom") || null,
      cancelTo: get("cancelTo") || null,
      minSample: Number(get("minSample") || MIN_GROUP) || MIN_GROUP,
      includeFrozenSeparate: get("includeFrozenSeparate") === "1",
    };
  } catch {
    return { status: "active_cancelled", minSample: MIN_GROUP };
  }
}

export async function computeStatisticalCrossesPayload(options = {}) {
  const configError = dataConfigurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }

  const filters = options.filters || {};
  const now = new Date();
  const [general, meetings, mechanisms] = await Promise.all([
    computeGeneralDataPayload(),
    computeMeetingsPayload(),
    computeMechanismsPayload(),
  ]);

  const built = buildAnalyticalPopulation(general, meetings, mechanisms, now);
  let clients = built.clients;

  // Default comparison universe: ativos + cancelados (congelados fora, a menos que filtro peça)
  const includeFrozen = Boolean(filters.includeFrozenSeparate);
  if (!filters.status || filters.status === "active_cancelled") {
    clients = clients.filter((c) => c.isActive || c.isCancelled || (includeFrozen && c.isFrozen));
  }

  clients = applyPopulationFilters(clients, {
    ...filters,
    status: filters.status === "active_cancelled" ? "all" : filters.status,
  }, now);

  // If status was active_cancelled, re-apply after other filters
  if (!filters.status || filters.status === "active_cancelled") {
    clients = clients.filter((c) => c.isActive || c.isCancelled || (includeFrozen && c.isFrozen));
  }

  const analysis = analyzePopulation(clients, {
    minSample: Number(filters.minSample) || MIN_GROUP,
    includeFrozenSeparate: includeFrozen,
  });

  const warnings = [
    {
      code: "methodology",
      severity: "info",
      message:
        "Associações estatísticas não demonstram causalidade. Amostras pequenas e dados ausentes afetam a estabilidade.",
    },
    ...built.warnings.map((w) => ({ ...w, severity: "warning" })),
  ];
  if ((analysis.population.cancelled || 0) < MIN_GROUP || (analysis.population.active || 0) < MIN_GROUP) {
    warnings.push({
      code: "small_comparison_groups",
      severity: "warning",
      message: "Grupos ativos/cancelados abaixo da amostra mínima recomendada — resultados instáveis.",
    });
  }
  if (analysis.associations.some((a) => a.strength === "forte") === false && analysis.associations.length) {
    // noop
  }
  const highMissing = analysis.quality.filter((q) => (q.missingPercent || 0) >= 40);
  if (highMissing.length) {
    warnings.push({
      code: "high_missing_vars",
      severity: "warning",
      message: `${highMissing.length} variável(eis) com ≥40% de ausência.`,
      count: highMissing.length,
    });
  }

  return {
    generatedAt: now.toISOString(),
    source: "BASE QV (general-data + meetings + mechanisms)",
    phase: 1,
    pending: PENDING,
    filters,
    methodology: {
      churn: "analyticalStatus === Cancelado (mesma regra Dados Gerais / Cancelamento: data consolidada força cancelado)",
      comparison: "Ativos vs Cancelados; congelados fora da comparação principal por padrão",
      associationNumeric: "point-biserial",
      associationCategorical: "Cramér’s V (+ Fisher 2×2 quando aplicável)",
      comparisonTestNumeric: "Mann–Whitney U + rank-biserial",
      auc: "logística univariada + AUC com validação cruzada estratificada",
      leakage:
        "Permanência, motivo e data de cancelamento excluídos do AUC. Encoding categórico multi-nível documentado quando usado.",
      survival: "Kaplan–Meier; evento=cancelamento; ativos/congelados censurados na data de geração",
      associationStrengthBands: {
        r: "|r|<0.1 muito fraca; <0.3 fraca; <0.5 moderada; ≥0.5 forte",
        cramers_v: "V<0.1 muito fraca; <0.2 fraca; <0.3 moderada; ≥0.3 forte",
      },
      causality: "Associação ≠ causalidade. Capacidade discriminativa ≠ previsão causal.",
    },
    population: analysis.population,
    variables: [...NUMERIC_VARS, ...CATEGORICAL_VARS].map((v) => ({
      id: v.id,
      label: v.label,
      type: NUMERIC_VARS.includes(v) ? "numeric" : "categorical",
      source: v.source,
      predictiveEligible: Boolean(v.predictive),
    })),
    comparisons: analysis.comparisons,
    associations: analysis.associations,
    predictivePower: analysis.predictivePower,
    survival: analysis.survival,
    quality: analysis.quality,
    excludedVariables: analysis.excludedVariables,
    filterOptions: {
      segments: [...new Set(built.clients.map((c) => c.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
      engineers: [...new Set(built.clients.map((c) => c.engineer).filter((e) => e && e !== "Não informado"))].sort((a, b) => a.localeCompare(b, "pt-BR")),
      incomeBands: [...new Set(built.clients.map((c) => c.incomeBand).filter(Boolean))],
      liquidityBands: [...new Set(built.clients.map((c) => c.liquidityBand).filter(Boolean))],
      stayBands: [...new Set(built.clients.map((c) => c.stayBand).filter(Boolean))],
    },
    // Amostra leve para drawer / auditoria (sem PII excessivo além do já usado no portal)
    clients: clients.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      statusAnalytic: c.statusAnalytic,
      isCancelled: c.isCancelled,
      segment: c.segment,
      engineer: c.engineer,
      stayDays: c.stayDays,
      meetingCount: c.meetingCount,
      mechanismCount: c.mechanismCount,
      implementedMechanismCount: c.implementedMechanismCount,
      monthlyIncome: c.monthlyIncome,
      hasFinancialData: c.hasFinancialData,
      survivalTime: c.survivalTime,
      survivalEvent: c.survivalEvent,
      survivalValid: c.survivalValid,
    })),
    warnings,
  };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }

  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  const configError = dataConfigurationError();
  if (configError) {
    return Response.json({ error: configError, code: "config" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const started = Date.now();
    const filters = parseFiltersFromRequest(request);
    const payload = await computeStatisticalCrossesPayload({ filters });
    console.error(
      `[statistical-crosses] status=200 ms=${Date.now() - started} ` +
        `total=${payload?.population?.total ?? "?"} active=${payload?.population?.active ?? "?"} cancelled=${payload?.population?.cancelled ?? "?"}`,
    );
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[statistical-crosses]", error?.message || error);
    return Response.json(
      { error: "Não foi possível consolidar os cruzamentos estatísticos", code: "data_query_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
