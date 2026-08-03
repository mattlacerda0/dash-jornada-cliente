import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !(String(process.env[key] || "").trim())) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const { spearman, coveragePct } = await import("../netlify/functions/_shared/stats-tests.mjs");
const sp = spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
const sp2 = spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
console.log("spearman_self_check", { perfect: sp, inverse: sp2, cov: coveragePct(3, 10) });

const { computeStatisticalCrossesPayload } = await import("../netlify/functions/statistical-crosses.mjs");
const p = await computeStatisticalCrossesPayload({ filters: { status: "active_cancelled" } });

const out = {
  summary: p.summary,
  population: p.population,
  pendingRenewal: p.pending?.renewal,
  counts: {
    associations: p.associations?.length,
    comparisons: p.comparisons?.length,
    univariatePredictivePower: p.univariatePredictivePower?.length,
    predictivePower: p.predictivePower?.length,
    npsCorrelations: p.npsCorrelations?.length,
    npsGroups: p.npsGroups?.length,
    renewalNumeric: p.renewalAssociations?.numeric?.length,
    renewalCategorical: p.renewalAssociations?.categorical?.length,
    renewedVsNot: p.renewedVsNotRenewed?.length,
    tenureCorrelations: p.tenureCorrelations?.length,
    tenureBuckets: p.tenureBuckets?.length,
    excludedVariables: p.excludedVariables?.length,
    activeVsCancelled: p.activeVsCancelled?.length,
  },
  renewalEligible: {
    eligible: p.renewalAssociations?.eligible,
    renewed: p.renewalAssociations?.renewed,
    notRenewed: p.renewalAssociations?.notRenewed,
  },
  survivalAtRisk: p.survival?.atRisk,
  topAssociation: p.associations?.[0]
    ? { id: p.associations[0].id, label: p.associations[0].label, abs: p.associations[0].associationAbs }
    : null,
  delivery: {
    npsGroups: (p.npsGroups || []).map((g) => ({
      label: g.label,
      n: g.n,
      cancelled: g.cancelled,
      cancelledPct: g.cancelledPct,
      renewed: g.renewed,
      renewedPct: g.renewedPct,
    })),
    topAuc: (() => {
      const rows = [...(p.univariatePredictivePower || [])]
        .filter((x) => Number.isFinite(Number(x.aucAdjusted ?? x.aucInverted ?? x.auc)))
        .sort((a, b) => Number(b.aucAdjusted ?? b.aucInverted ?? b.auc) - Number(a.aucAdjusted ?? a.aucInverted ?? a.auc));
      const t = rows[0];
      return t
        ? { label: t.label, auc: t.aucOriginal ?? t.auc, aucAdjusted: t.aucAdjusted ?? t.aucInverted }
        : null;
    })(),
    topChurnNumeric: (p.churnAssociations?.numeric || p.numericAssociations || []).slice(0, 5).map((x) => ({
      label: x.label,
      association: x.association,
    })),
    survival: {
      nStart: p.survival?.overall?.nStart,
      events: p.survival?.overall?.events,
      censored: p.survival?.overall?.censored,
      medianSurvival: p.survival?.overall?.medianSurvival,
      groups: (p.survival?.groups || []).length,
      logRank: p.survival?.logRank
        ? { groupA: p.survival.logRank.groupA, groupB: p.survival.logRank.groupB, pValue: p.survival.logRank.pValue }
        : null,
    },
    excludedLeakage: (p.excludedVariables || [])
      .filter((e) => /leak/i.test(`${e.status || ""} ${e.reason || ""} ${e.note || ""}`))
      .map((e) => e.label || e.id),
  },
  metadata: p.metadata,
};
writeFileSync(resolve(root, "scripts/_smoke_statistical_crosses.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
