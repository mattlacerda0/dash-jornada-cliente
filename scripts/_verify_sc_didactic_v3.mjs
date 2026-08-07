import { pooledSd, median, standardizedDifference } from "../netlify/functions/_shared/stats-tests.mjs";
import { buildCohortRetention } from "../netlify/functions/_shared/cohort-retention.mjs";
import { buildCancellationAxisMatrix, buildRenewalAxisMatrix } from "../netlify/functions/_shared/sc-axis-matrices.mjs";

const a = [10, 12, 11, 9, 10];
const b = [20, 22, 19, 21, 18];
const sd = pooledSd(a, b);
const d = standardizedDifference(median(b), median(a), sd);
if (!(sd > 1) || Math.abs(d - 1) < 1e-9) {
  console.error("stdDiff still collapsing", { sd, d });
  process.exit(1);
}
console.log("STDDIFF_OK", { sd: +sd.toFixed(3), d });

const clients = [
  { clientId: 1, contractDate: "2026-01-15", isCancelled: false },
  { clientId: 2, contractDate: "2026-01-20", isCancelled: true, cancellationDate: "2026-03-01" },
  { clientId: 3, contractDate: "2026-02-01", isCancelled: true, cancellationDate: null },
];
const r = buildCohortRetention(clients, { hireFrom: "2026-01-01", cutoffDate: "2026-07-01" });
if (r.metadata.skippedCancelledNoDate !== 1 || r.metadata.clientsWithHire !== 2) {
  console.error("cohort filter fail", r.metadata);
  process.exit(2);
}
console.log("COHORT_OK", r.metadata);

const cancel = buildCancellationAxisMatrix({
  associations: [{ id: "meetingCount", label: "Reuniões", association: 0.3, coveragePercent: 80, n: 100 }],
  predictivePower: [{ id: "meetingCount", aucAdjusted: 0.7 }],
  activeVsCancelled: [{
    id: "meetingCount",
    medianActive: 10,
    medianCancelled: 20,
    sdPooled: sd,
    stdDiff: d,
    nActive: 50,
    nCancelled: 50,
  }],
});
const stdCell = cancel.rows[0]?.stdDiff;
if (stdCell == null || Math.abs(stdCell - 1) < 1e-9) {
  console.error("matrix stdDiff bad", cancel.rows[0]);
  process.exit(3);
}
const ren = buildRenewalAxisMatrix({
  renewalAssociations: { numeric: [{ id: "meetingCount", label: "Reuniões", association: 0.2, coverage: 70, n: 80 }], categorical: [] },
  renewedVsNotRenewed: [{ id: "meetingCount", medianRenewed: 5, medianNotRenewed: 2, sdPooled: 2, stdDiff: 1.5 }],
});
if (!ren.metrics.some((m) => m.id === "stdDiff")) {
  console.error("renewal missing stdDiff metric");
  process.exit(4);
}
console.log("MATRIX_OK", { cancelStd: stdCell, renewalHasStd: true });
console.log("ALL_OK");
