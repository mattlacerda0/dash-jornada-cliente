/**
 * Matrizes de associação por eixo (cancelamento, NPS, renovação, permanência).
 * Não altera regras oficiais — reutiliza associações/correlações já calculadas.
 */
import { associationStrength, coveragePct, round3, round4, spearman } from "./stats-tests.mjs";

const CANCEL_METRICS = [
  { id: "association", label: "Associação", signed: true },
  { id: "stdDiff", label: "Diferença padronizada", signed: true },
  { id: "aucAdjusted", label: "AUC ajustada", signed: false, sequential: true },
  { id: "coveragePercent", label: "Cobertura %", signed: false, sequential: true, scaleMax: 100 },
];

const RENEWAL_METRICS = [
  { id: "association", label: "Associação", signed: true },
  { id: "aucAdjusted", label: "AUC ajustada", signed: false, sequential: true },
  { id: "coveragePercent", label: "Cobertura %", signed: false, sequential: true, scaleMax: 100 },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stdDiff(medA, medC, pooled) {
  const a = num(medA);
  const c = num(medC);
  if (a == null || c == null) return null;
  const sd = num(pooled) || Math.abs(a - c) || 1;
  return round4((c - a) / (sd || 1));
}

function rowFromAssoc(a, extras = {}) {
  const association = num(a.association ?? a.rho ?? a.measure ?? a.v);
  const coverage = num(a.coveragePercent ?? a.coverage);
  return {
    id: a.id,
    label: a.label || a.id,
    type: a.type || "numeric",
    association,
    absAssociation: association == null ? null : Math.abs(association),
    direction: a.direction || (association == null ? null : association > 0 ? "positive" : association < 0 ? "negative" : "none"),
    strength: a.strength || associationStrength(association == null ? null : Math.abs(association), a.measure || a.type),
    coveragePercent: coverage,
    n: a.n ?? a.sample ?? null,
    pValue: a.pValue ?? a.p ?? null,
    measure: a.measure || a.method || null,
    status: a.status || (association == null ? "unavailable" : "available"),
    ...extras,
  };
}

/**
 * Heatmap variável × métricas para alvo binário (cancelamento).
 */
export function buildCancellationAxisMatrix({ associations = [], predictivePower = [], activeVsCancelled = [] } = {}) {
  const aucById = new Map((predictivePower || []).map((p) => [p.id, p]));
  const diffById = new Map((activeVsCancelled || []).map((d) => [d.id, d]));
  const flat = Array.isArray(associations)
    ? associations
    : [...(associations.numeric || []), ...(associations.categorical || [])];

  const rows = flat
    .filter((a) => a && a.id && a.id !== "isCancelled")
    .map((a) => {
      const auc = aucById.get(a.id);
      const diff = diffById.get(a.id);
      const medA = diff?.medianActive ?? diff?.activeMedian;
      const medC = diff?.medianCancelled ?? diff?.cancelledMedian;
      const sd = diff?.sdPooled ?? diff?.pooledSd;
      const association = num(a.association ?? a.rho ?? a.v ?? a.cramersV);
      return rowFromAssoc(a, {
        association,
        stdDiff: stdDiff(medA, medC, sd),
        aucAdjusted: num(auc?.aucAdjusted ?? auc?.aucInverted ?? auc?.auc),
        aucOriginal: num(auc?.aucOriginal ?? auc?.auc),
        coveragePercent: num(a.coveragePercent ?? a.coverage ?? auc?.coveragePercent ?? auc?.coverage),
        medianActive: medA ?? null,
        medianCancelled: medC ?? null,
      });
    })
    .filter((r) => r.association != null || r.aucAdjusted != null || r.stdDiff != null)
    .sort((a, b) => (b.absAssociation ?? 0) - (a.absAssociation ?? 0) || (b.aucAdjusted ?? 0) - (a.aucAdjusted ?? 0))
    .slice(0, 20);

  return {
    axis: "cancellation",
    title: "Matriz de associação com cancelamento",
    target: "isCancelled",
    note: "Mostra quais variáveis possuem maior relação observada com cancelamento. Valores maiores representam associações mais fortes, não causalidade.",
    metrics: CANCEL_METRICS,
    rows,
    cells: rows.flatMap((r, i) => CANCEL_METRICS.map((m, j) => ({
      i,
      j,
      rowId: r.id,
      colId: m.id,
      labelRow: r.label,
      labelCol: m.label,
      value: r[m.id] ?? null,
      signed: m.signed,
      sequential: !!m.sequential,
      scaleMax: m.scaleMax || 1,
    }))),
  };
}

export function buildRenewalAxisMatrix({ renewalAssociations = {}, predictiveLike = [] } = {}) {
  const flat = [
    ...(renewalAssociations.numeric || []),
    ...(renewalAssociations.categorical || []),
  ].filter((a) => a && !["currentCycle", "renewalCount", "hasRenewed", "renewed"].includes(a.id));

  const aucById = new Map((predictiveLike || []).map((p) => [p.id, p]));
  const rows = flat
    .map((a) => {
      const auc = aucById.get(a.id);
      const association = num(a.association ?? a.rho ?? a.v ?? a.cramersV);
      return rowFromAssoc(a, {
        association,
        aucAdjusted: num(auc?.aucAdjusted ?? auc?.auc),
        coveragePercent: num(a.coveragePercent ?? a.coverage),
      });
    })
    .filter((r) => r.association != null || r.aucAdjusted != null)
    .sort((a, b) => (b.absAssociation ?? 0) - (a.absAssociation ?? 0))
    .slice(0, 20);

  return {
    axis: "renewal",
    title: "Renovação — matriz de associação",
    target: "hasRenewed",
    note: "Associações com renovação (ciclo atual > 1). currentCycle e renewalCount não entram como explicativas.",
    metrics: RENEWAL_METRICS,
    rows,
    cells: rows.flatMap((r, i) => RENEWAL_METRICS.map((m, j) => ({
      i,
      j,
      rowId: r.id,
      colId: m.id,
      labelRow: r.label,
      labelCol: m.label,
      value: r[m.id] ?? null,
      signed: m.signed,
      sequential: !!m.sequential,
      scaleMax: m.scaleMax || 1,
    }))),
  };
}

/**
 * Correlação Spearman de cada preditor com um alvo numérico (NPS ou permanência).
 * Heatmap: variáveis × {Spearman, cobertura} (+ opcional pairwise target column only as N×1 style with 2 cols).
 */
export function buildTargetCorrelationMatrix(clients, {
  targetField,
  targetLabel,
  predictors,
  axis,
  title,
  note,
  minN = 30,
} = {}) {
  const total = clients.length;
  const rows = [];
  for (const pred of predictors || []) {
    if (pred.field === targetField || pred.id === targetField) continue;
    const xs = [];
    const ys = [];
    for (const c of clients) {
      const x = num(c[pred.field || pred.id]);
      const y = num(c[targetField]);
      if (x == null || y == null) continue;
      xs.push(x);
      ys.push(y);
    }
    if (xs.length < minN) {
      rows.push({
        id: pred.id,
        label: pred.label || pred.id,
        association: null,
        coveragePercent: coveragePct(xs.length, total),
        n: xs.length,
        status: "insufficient_sample",
        strength: null,
        direction: null,
        method: "spearman",
      });
      continue;
    }
    const sp = spearman(xs, ys);
    const association = sp?.rho != null ? round4(sp.rho) : null;
    rows.push({
      id: pred.id,
      label: pred.label || pred.id,
      association,
      absAssociation: association == null ? null : Math.abs(association),
      coveragePercent: coveragePct(xs.length, total),
      n: xs.length,
      pValue: sp?.pValue ?? null,
      status: association == null ? "unavailable" : "available",
      strength: associationStrength(association == null ? null : Math.abs(association), "spearman"),
      direction: association == null ? null : association > 0 ? "positive" : association < 0 ? "negative" : "none",
      method: "spearman",
    });
  }
  rows.sort((a, b) => (b.absAssociation ?? -1) - (a.absAssociation ?? -1));
  const metrics = [
    { id: "association", label: `Spearman × ${targetLabel}`, signed: true },
    { id: "coveragePercent", label: "Cobertura %", signed: false, sequential: true, scaleMax: 100 },
  ];
  const visible = rows.filter((r) => r.association != null).slice(0, 20);
  return {
    axis,
    title,
    target: targetField,
    note,
    metrics,
    rows: visible.length ? visible : rows.slice(0, 20),
    cells: (visible.length ? visible : rows.slice(0, 20)).flatMap((r, i) => metrics.map((m, j) => ({
      i,
      j,
      rowId: r.id,
      colId: m.id,
      labelRow: r.label,
      labelCol: m.label,
      value: r[m.id] ?? null,
      signed: m.signed,
      sequential: !!m.sequential,
      scaleMax: m.scaleMax || 1,
    }))),
  };
}

export const NPS_PREDICTORS = [
  { id: "meetingCount", label: "Total de reuniões", field: "meetingCount" },
  { id: "noShowCount", label: "No-shows", field: "noShowCount" },
  { id: "rescheduleCount", label: "Remarcações", field: "rescheduleCount" },
  { id: "attendanceRate", label: "Taxa de comparecimento", field: "attendanceRate" },
  { id: "stayDays", label: "Permanência", field: "stayDays" },
  { id: "monthlyIncome", label: "Renda mensal", field: "monthlyIncome" },
  { id: "paidPropertiesValue", label: "Patrimônio", field: "paidPropertiesValue" },
  { id: "liquidityReserve", label: "Reserva de liquidez", field: "liquidityReserve" },
  { id: "mechanismCount", label: "Mecanismos", field: "mechanismCount" },
  { id: "implementedMechanismCount", label: "Mecanismos implementados", field: "implementedMechanismCount" },
  { id: "currentCycle", label: "Ciclo atual", field: "currentCycle" },
  { id: "renewalCount", label: "Renovações", field: "renewalCount" },
  { id: "daysSinceFinancialUpdate", label: "Dias desde atualização financeira", field: "daysSinceFinancialUpdate" },
  { id: "daysSinceLastMeeting", label: "Dias desde última reunião", field: "daysSinceLastMeeting" },
];

export const TENURE_PREDICTORS = [
  { id: "meetingCount", label: "Total de reuniões", field: "meetingCount" },
  { id: "noShowCount", label: "No-shows", field: "noShowCount" },
  { id: "rescheduleCount", label: "Remarcações", field: "rescheduleCount" },
  { id: "attendanceRate", label: "Taxa de comparecimento", field: "attendanceRate" },
  { id: "npsScore", label: "Nota NPS", field: "npsScore" },
  { id: "mechanismCount", label: "Mecanismos", field: "mechanismCount" },
  { id: "implementedMechanismCount", label: "Mecanismos implementados", field: "implementedMechanismCount" },
  { id: "monthlyIncome", label: "Renda mensal", field: "monthlyIncome" },
  { id: "paidPropertiesValue", label: "Patrimônio", field: "paidPropertiesValue" },
  { id: "liquidityReserve", label: "Reserva", field: "liquidityReserve" },
  { id: "daysSinceFinancialUpdate", label: "Dias desde atualização financeira", field: "daysSinceFinancialUpdate" },
  { id: "currentCycle", label: "Ciclo atual", field: "currentCycle" },
  { id: "renewalCount", label: "Renovações", field: "renewalCount" },
  { id: "daysSinceLastMeeting", label: "Dias desde última reunião", field: "daysSinceLastMeeting" },
];

export function buildAxisMatricesBundle(ctx) {
  const {
    clients,
    churnAssociations,
    associations,
    univariatePredictivePower,
    activeVsCancelled,
    renewalAssociations,
  } = ctx;

  const cancelAssocs = churnAssociations || {
    numeric: (associations || []).filter((a) => a.type === "numeric"),
    categorical: (associations || []).filter((a) => a.type === "categorical"),
  };

  return {
    cancellation: buildCancellationAxisMatrix({
      associations: cancelAssocs,
      predictivePower: univariatePredictivePower,
      activeVsCancelled,
    }),
    nps: buildTargetCorrelationMatrix(clients, {
      targetField: "npsScore",
      targetLabel: "NPS",
      predictors: NPS_PREDICTORS,
      axis: "nps",
      title: "NPS — matriz de correlação",
      note: "Mostra como cada indicador varia junto com a nota NPS (Spearman). Associação observada, não causalidade.",
    }),
    renewal: buildRenewalAxisMatrix({
      renewalAssociations,
      predictiveLike: univariatePredictivePower,
    }),
    tenure: buildTargetCorrelationMatrix(clients, {
      targetField: "stayDays",
      targetLabel: "Permanência",
      predictors: TENURE_PREDICTORS,
      axis: "tenure",
      title: "Permanência — matriz de correlação",
      note: "Correlações descritivas com permanência em dias. Não confundir com a curva Kaplan–Meier (evento/censura).",
    }),
  };
}
