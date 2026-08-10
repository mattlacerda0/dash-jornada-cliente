/**
 * Smoke checks for SC tenure/NPS/cohort/export wiring (no DB).
 */
import assert from "assert";
import { applyRenewalTenureAdjustment } from "../netlify/functions/_shared/client-tenure.mjs";
import { buildNpsComparativeMatrix } from "../netlify/functions/_shared/sc-client-insights.mjs";
import { buildGroupComparativeMatrix } from "../netlify/functions/_shared/sc-exploratory-ext.mjs";
import { NPS_PREDICTORS } from "../netlify/functions/_shared/sc-axis-matrices.mjs";
import { buildCohortRetention } from "../netlify/functions/_shared/cohort-retention.mjs";
import fs from "fs";

const clients = [
  {
    clientId: "1", currentCycle: 1, stayDays: applyRenewalTenureAdjustment(200, 1),
    stayDaysChronological: 200, hasRenewed: false, isActive: true, isCancelled: false,
    npsClass: "promoter", hasNps: true, npsPredictiveOk: true, npsScore: 10,
    implementedMechanismCount: 2, mechanismCount: 5, meetingCount: 3,
    contractDate: "2025-01-15", hireDate: "2025-01-15", cancellationDate: null,
    survivalTime: 200, survivalEvent: 0,
  },
  {
    clientId: "2", currentCycle: 2, stayDays: applyRenewalTenureAdjustment(200, 2),
    stayDaysChronological: 200, hasRenewed: true, isActive: true, isCancelled: false,
    npsClass: "detractor", hasNps: true, npsPredictiveOk: true, npsScore: 3,
    implementedMechanismCount: 1, mechanismCount: 4, meetingCount: 1,
    contractDate: "2025-02-10", hireDate: "2025-02-10", cancellationDate: null,
    survivalTime: 200, survivalEvent: 0,
  },
  {
    clientId: "3", currentCycle: 2, stayDays: applyRenewalTenureAdjustment(280, 2),
    stayDaysChronological: 280, hasRenewed: true, isActive: false, isCancelled: true,
    npsClass: "passive", hasNps: true, npsPredictiveOk: true, npsScore: 7,
    implementedMechanismCount: 0, mechanismCount: 2, meetingCount: 0,
    contractDate: "2025-03-01", hireDate: "2025-03-01", cancellationDate: "2025-12-06",
    survivalTime: 280, survivalEvent: 1,
  },
];

const nps = buildNpsComparativeMatrix(clients);
assert.ok(!nps.variables.some((v) => v.id === "mechanismCount"), "NPS must not include Mecanismos");
assert.ok(nps.variables.some((v) => v.id === "implementedMechanismCount"), "NPS must keep Mecanismos implementados");
assert.ok(!NPS_PREDICTORS.some((v) => v.id === "mechanismCount"));
assert.ok(NPS_PREDICTORS.some((v) => v.id === "implementedMechanismCount"));

const groups = buildGroupComparativeMatrix(clients);
const renewed = groups.groups.find((g) => g.id === "renewed");
assert.ok(renewed);
assert.strictEqual(renewed.n, 2, "Renovados = currentCycle >= 2");
assert.ok(groups.variables.some((v) => v.id === "stayDays"));
assert.ok(groups.variables.some((v) => v.id === "implementedMechanismCount"));

const cohort = buildCohortRetention(clients, { hireFrom: "2025-01-01", granularity: "month" });
assert.ok(cohort.cohorts.length >= 1);
assert.ok(cohort.cohorts[0].key.startsWith("2025-01") || cohort.cohorts.some((c) => c.key.startsWith("2025-")));
assert.ok(!JSON.stringify(cohort).includes("565"), "cohort must not use adjusted tenure values");

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(html.includes('id="scCohortPeriod"') && html.includes('since_2025_01" selected'));
assert.ok(html.includes("skip") || html.includes("#view-statistical-crosses"));
assert.ok(html.includes("if (table.closest('#view-statistical-crosses'))"));
assert.ok(html.includes("getScNpsCorrExportPayload"));
assert.ok(html.includes('id="scGroupExportHost"'));
assert.ok(html.includes("Para clientes com dois ou mais ciclos cuja permanência calculada seja inferior a 365 dias"));
assert.ok(!html.includes(".slice(0, 26)") || !/escapeHtml\(\(r\.label \|\| r\.id\)\.slice\(0,\s*26\)/.test(html));

console.log("OK smoke NPS/group/cohort/export wiring");
console.log({
  npsVars: nps.variables.map((v) => v.id),
  renewedN: renewed.n,
  cohortKeys: cohort.cohorts.map((c) => c.key),
  stayParity: clients.map((c) => ({ id: c.clientId, stayDays: c.stayDays, chrono: c.stayDaysChronological })),
});
