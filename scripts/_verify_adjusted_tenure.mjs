/**
 * Unit tests: adjusted analytical tenure (renewal +365 once).
 * Run: node scripts/_verify_adjusted_tenure.mjs
 */
import assert from "assert";
import {
  applyRenewalTenureAdjustment,
  calculateAnalyticalTenure,
  calculateBaseTenureDays,
} from "../netlify/functions/_shared/client-tenure.mjs";

const cases = [
  { name: "A", cycle: 1, base: 200, expected: 200 },
  { name: "B", cycle: 2, base: 200, expected: 565 },
  { name: "C", cycle: 2, base: 365, expected: 365 },
  { name: "D", cycle: 2, base: 500, expected: 500 },
  { name: "E", cycle: 3, base: 300, expected: 665 },
];

for (const c of cases) {
  const got = applyRenewalTenureAdjustment(c.base, c.cycle);
  assert.strictEqual(got, c.expected, `case ${c.name}: got ${got}, expected ${c.expected}`);
}

// No multiplicative renewal bonus
assert.strictEqual(applyRenewalTenureAdjustment(200, 5), 565);

const base = calculateBaseTenureDays({
  hireDate: "2025-01-01",
  cancellationDate: "2025-07-20",
  isCancelledWithDate: true,
});
assert.ok(base.stayDaysBase != null && base.stayDaysBase >= 200 && base.stayDaysBase <= 210);

const adj = calculateAnalyticalTenure({
  hireDate: "2025-01-01",
  cancellationDate: "2025-07-20",
  isCancelledWithDate: true,
  currentCycle: 2,
});
assert.strictEqual(adj.stayDaysChronological, adj.stayDaysBase);
assert.strictEqual(adj.stayDays, adj.stayDaysBase + 365);
assert.strictEqual(adj.adjusted, true);

// Survival/cohort must use chronological — helper exposes it separately
assert.notStrictEqual(adj.stayDays, adj.stayDaysChronological);

console.log("OK adjusted tenure cases A–E + chronological separation");
