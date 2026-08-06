import { pooledSd, median, standardizedDifference } from "../netlify/functions/_shared/stats-tests.mjs";
import { buildCohortRetention } from "../netlify/functions/_shared/cohort-retention.mjs";
import { buildTargetCorrelationMatrix, NPS_PREDICTORS } from "../netlify/functions/_shared/sc-axis-matrices.mjs";
import { buildGroupComparativeMatrix } from "../netlify/functions/_shared/sc-exploratory-ext.mjs";

const a = [10, 12, 11, 9, 10];
const b = [20, 22, 19, 21, 18];
const sd = pooledSd(a, b);
const d = standardizedDifference(median(b), median(a), sd);
if (!(sd > 1) || Math.abs(d) < 0.5) {
  console.error("stdDiff fail", { sd, d });
  process.exit(1);
}

const clients = [
  { clientId: 1, contractDate: "2026-01-15", isCancelled: false, npsScore: 9, npsClass: "promoter", meetingCount: 5, stayDays: 100 },
  { clientId: 2, contractDate: "2026-01-20", isCancelled: true, cancellationDate: "2026-03-01", npsScore: 2, npsClass: "detractor", meetingCount: 1, stayDays: 40 },
  { clientId: 3, contractDate: "2026-02-01", isCancelled: true, cancellationDate: null, npsScore: 3, npsClass: "detractor", meetingCount: 0, stayDays: null },
  { clientId: 1, contractDate: "2026-01-15", isCancelled: false, npsScore: 9, npsClass: "promoter", meetingCount: 5, stayDays: 100 }, // dup
];
for (let i = 4; i <= 25; i += 1) {
  clients.push({
    clientId: i,
    contractDate: "2026-01-10",
    isCancelled: false,
    npsScore: i % 2 ? 9 : 2,
    npsClass: i % 2 ? "promoter" : "detractor",
    meetingCount: i % 2 ? 8 : 1,
    stayDays: 80 + i,
  });
}

const cohort = buildCohortRetention(clients, { hireFrom: "2026-01-01", cutoffDate: "2026-07-01" });
if (cohort.metadata.skippedCancelledNoDate !== 1) {
  console.error("cohort cancel no date", cohort.metadata);
  process.exit(2);
}
if ((cohort.metadata.skippedDuplicate || 0) < 1) {
  console.error("cohort dup not skipped", cohort.metadata);
  process.exit(3);
}
console.log("COHORT_OK", cohort.metadata);

const nps = buildTargetCorrelationMatrix(clients, {
  targetField: "npsScore",
  targetLabel: "NPS",
  predictors: NPS_PREDICTORS.filter((p) => p.id === "meetingCount"),
  axis: "nps",
  title: "NPS",
  minN: 10,
  stdDiffGroups: {
    groupA: (c) => c.npsClass === "promoter",
    groupB: (c) => c.npsClass === "detractor",
    labelA: "Promotores",
    labelB: "Detratores",
    minN: 5,
  },
});
if (!nps.metrics.some((m) => m.id === "stdDiff")) {
  console.error("NPS missing stdDiff metric", nps.metrics);
  process.exit(4);
}
if (nps.rows[0]?.stdDiff == null) {
  console.error("NPS stdDiff null", nps.rows[0]);
  process.exit(5);
}
console.log("NPS_STD_OK", nps.rows[0]);

const tenure = buildTargetCorrelationMatrix(clients, {
  targetField: "stayDays",
  targetLabel: "Permanência",
  predictors: NPS_PREDICTORS.filter((p) => p.id === "meetingCount"),
  axis: "tenure",
  title: "Tenure",
  minN: 10,
});
if (tenure.metrics.some((m) => m.id === "stdDiff")) {
  console.error("tenure should not invent stdDiff");
  process.exit(6);
}
console.log("TENURE_NO_STD_OK");

const group = buildGroupComparativeMatrix(clients.filter((c) => c.clientId !== 3 || c.cancellationDate));
const cell = group.cells.find((c) => c.standardized != null);
if (!cell || cell.reference == null) {
  console.error("group cell missing reference", cell);
  process.exit(7);
}
console.log("GROUP_OK", { refN: group.referenceN, std: cell.standardized });
console.log("ALL_OK");
