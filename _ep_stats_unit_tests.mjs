/**
 * Testes determinísticos — stats + regras Performance EP + NPS.
 * Uso: node _ep_stats_unit_tests.mjs
 */
import assert from "node:assert/strict";
import {
  median,
  pointBiserial,
  chiSquareIndependence,
  fisherExact2x2,
  kaplanMeier,
  rocAuc,
} from "./netlify/functions/_shared/stats-tests.mjs";
import {
  classifyNpsScore,
  computeNpsBreakdown,
  latestNpsByClient,
} from "./netlify/functions/_shared/nps-metrics.mjs";
import { buildEpPerformanceFromPayloads } from "./netlify/functions/ep-performance.mjs";
import { buildNpsAnalysis } from "./netlify/functions/statistical-crosses.mjs";

// --- median ---
assert.equal(median([1, 2, 3]), 2);
assert.equal(median([1, 2, 3, 4]), 2.5);
assert.equal(median([null, 5]), 5);
assert.equal(median([]), null);

// --- point-biserial ---
{
  const x = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14];
  const y = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const r = pointBiserial(x, y);
  assert.ok(r.r != null && r.r > 0.8, `point-biserial too weak: ${r.r}`);
}

// --- Cramér V ---
{
  const table = [
    [30, 10],
    [10, 30],
  ];
  const chi = chiSquareIndependence(table);
  assert.ok(chi.cramersV != null && chi.cramersV > 0.3, `cramersV=${chi.cramersV}`);
}

// --- Fisher ---
{
  const f = fisherExact2x2(30, 10, 10, 30);
  assert.ok(f.pValue != null && f.pValue < 0.05, `fisher p=${f.pValue}`);
}

// --- AUC + inversion ---
{
  const scores = [0.1, 0.2, 0.25, 0.3, 0.35, 0.8, 0.85, 0.9, 0.92, 0.95];
  const labels = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const auc = rocAuc(scores, labels);
  assert.ok(auc > 0.7, `auc=${auc}`);
  const inv = rocAuc(scores.map((s) => -s), labels);
  const adj = Math.max(inv, 1 - inv);
  assert.ok(adj > 0.7, `adjusted inverted auc=${adj}`);
}

// --- Kaplan–Meier + censor ---
{
  const km = kaplanMeier([
    { time: 10, event: true },
    { time: 20, event: false },
    { time: 30, event: true },
    { time: 40, event: false },
  ]);
  assert.ok(Array.isArray(km.curve) && km.curve.length >= 1);
  assert.equal(kaplanMeier([]).nStart, 0);
  assert.equal(kaplanMeier([{ time: -1, event: true }]).nStart, 0);
}

// --- NPS classification / index (not mean) ---
{
  assert.equal(classifyNpsScore(10), "promoter");
  assert.equal(classifyNpsScore(9), "promoter");
  assert.equal(classifyNpsScore(8), "passive");
  assert.equal(classifyNpsScore(7), "passive");
  assert.equal(classifyNpsScore(6), "detractor");
  assert.equal(classifyNpsScore(0), "detractor");
  const allPromoters = computeNpsBreakdown([10, 10, 9, 9]);
  assert.equal(allPromoters.nps, 100);
  assert.equal(allPromoters.meanScore, 9.5);
  assert.notEqual(allPromoters.nps, allPromoters.meanScore);
  const mixed = computeNpsBreakdown([10, 10, 10, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(mixed.nps, -40);
}

// --- NPS latest-by-client dedupe ---
{
  const latest = latestNpsByClient([
    { client_id: "a", score: 5, submitted_at: "2026-01-01", tipo_de_forms: "NPS" },
    { client_id: "a", score: 10, submitted_at: "2026-06-01", tipo_de_forms: "NPS" },
    { client_id: "b", score: 8, submitted_at: "2026-03-01", tipo_de_forms: "CSAT" },
  ]);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].score, 10);
}

// --- EP builder rules ---
{
  const general = {
    clients: [
      {
        clientId: "1",
        engineer: "Ana",
        analyticalStatus: "Ativo",
        status: "Ativo",
        segmentLabel: "PRIVATE",
        ciclo: 2,
        data_inicio_ciclo: "2025-01-01",
        data_fim_ciclo: "2026-01-01",
      },
      {
        clientId: "2",
        engineer: "Ana",
        analyticalStatus: "Cancelado",
        status: "Cancelado",
        cancellationDate: "2026-01-01",
        segmentLabel: "PRIVATE",
        ciclo: 1,
      },
      {
        clientId: "3",
        engineer: "Ana",
        analyticalStatus: "Ativo",
        status: "Ativo",
        segmentLabel: "PRIVATE",
        ciclo: 3,
      },
      { clientId: "4", engineer: "Bruno", analyticalStatus: "Congelado", status: "Congelado", segmentLabel: "APEX", ciclo: 0 },
      { clientId: "5", engineer: null, analyticalStatus: "Ativo", status: "Ativo" },
    ],
  };
  const meetings = {
    clients: [
      {
        clientId: "1",
        meetings: [
          { startTime: "2026-02-01T10:00:00Z", meetingDateStatus: "ok" },
          { startTime: "2026-03-01T10:00:00Z", meetingDateStatus: "ok" },
        ],
      },
      { clientId: "2", meetings: [{ startTime: "2025-12-01T10:00:00Z", meetingDateStatus: "ok" }] },
      { clientId: "3", meetings: [] },
      { clientId: "4", meetings: [{ startTime: "2026-01-15T10:00:00Z", meetingDateStatus: "invalid" }] },
    ],
  };
  const npsRows = [
    { id: "n1", client_id: "1", score: 10, submitted_at: "2026-02-15", tipo_de_forms: "NPS" },
    { id: "n2", client_id: "2", score: 3, submitted_at: "2025-12-15", tipo_de_forms: "NPS" },
    { id: "n3", client_id: "3", score: 9, submitted_at: "2026-04-01", tipo_de_forms: "NPS" },
    { id: "n4", client_id: "3", score: 8, submitted_at: "2026-01-01", tipo_de_forms: "NPS" },
  ];
  const payload = buildEpPerformanceFromPayloads(general, meetings, {
    npsRows,
    mechanismsPayload: {
      clients: [
        {
          clientId: "1",
          mechanisms: [
            { mechanismId: "m1", name: "Seguro", status: "Implementado" },
            { mechanismId: "m2", name: "Fundo", status: "Em andamento" },
          ],
        },
        {
          clientId: "3",
          mechanisms: [{ mechanismId: "m1", name: "Seguro", status: "Implementado" }],
        },
      ],
    },
  });
  const ana = payload.engineers.find((e) => e.engineer === "Ana");
  assert.equal(ana.totalClients, 3);
  assert.equal(ana.cancelledClients, 1);
  assert.equal(ana.clientsWithMeeting, 2);
  assert.equal(ana.clientsWithoutMeeting, 1);
  assert.equal(ana.totalMeetings, 3);
  assert.equal(ana.averageMeetingsPerClient, 1);
  assert.equal(ana.medianMeetingsAmongWithMeetings, 1.5);
  assert.ok(ana.sampleSize === "very_small" || /pequena/i.test(ana.sampleSizeLabel));
  assert.equal(ana.npsResponses, 3);
  assert.equal(ana.npsEligible, false);
  assert.ok(ana.nps != null);
  assert.ok(ana.npsMeanScore != null);
  assert.equal(ana.npsPromoters, 2);
  assert.equal(ana.npsDetractors, 1);
  assert.equal(ana.renewedClients, 2);
  assert.equal(ana.totalRenewals, 3);
  assert.equal(ana.clientsWithImplementedMechanisms, 2);
  assert.equal(ana.mechanismTypesUsed, 1);
  assert.equal(payload.summary.renewedClients, 2);
  assert.equal(payload.summary.totalRenewals, 3);
  assert.ok(payload.renewalsByAdvisor.length >= 2);
  assert.ok(payload.cycleDistribution.some((r) => r.label === "Ciclo 1"));
  assert.ok(payload.renewalClients.length >= 4);
  assert.ok(payload.pending?.renewal?.available === true);
  assert.ok(payload.pending?.renewal?.renewalRuleConfirmed === true);
  const blank = payload.engineers.find((e) => e.engineer === "Não informado");
  assert.equal(blank.totalClients, 1);
  assert.equal(payload.summary.advisorsWithPortfolio, 2);
  assert.equal(payload.summary.confirmedCancelledClients, 1);
  assert.ok(payload.metricAvailability.some((m) => m.id === "mechanisms_ep" && m.available === true));
  assert.ok(payload.pending?.mechanismsPerEp?.available === true);
  assert.ok(payload.metricAvailability.some((m) => m.id === "renewal" && m.available === true));
  assert.ok(payload.metricAvailability.some((m) => m.id === "response_time" && m.available === false));
  assert.match(payload.attributionNote || "", /atualmente vinculado/i);
  assert.equal(payload.metadata.renewalFormula, "max(currentCycle - 1, 0)");
  assert.equal(payload.metadata.cycleSource, "public.clients.ciclo");
}

// --- NPS leakage: post-cancel excluded ---
{
  const clients = [
    {
      clientId: "c1",
      isActive: false,
      isCancelled: true,
      cancellationDate: "2026-03-01",
      stayDays: 90,
      meetingCount: 2,
    },
    {
      clientId: "c2",
      isActive: true,
      isCancelled: false,
      cancellationDate: null,
      stayDays: 120,
      meetingCount: 4,
    },
  ];
  const npsRows = [
    { client_id: "c1", score: 2, submitted_at: "2026-04-01", tipo_de_forms: "NPS" },
    { client_id: "c2", score: 10, submitted_at: "2026-02-01", tipo_de_forms: "NPS" },
  ];
  const analysis = buildNpsAnalysis(clients, npsRows, { minSample: 1 });
  assert.equal(analysis.excludedPostCancel, 1);
  assert.equal(analysis.responsesPredictive, 1);
  assert.equal(analysis.overall.nps, 100);
}

// --- zero preservado + aliases FE nos cruzamentos ---
{
  const { analyzePopulation } = await import("./netlify/functions/statistical-crosses.mjs");
  const clients = [];
  for (let i = 0; i < 40; i += 1) {
    clients.push({
      clientId: `a${i}`,
      isActive: true,
      isCancelled: false,
      isFrozen: false,
      monthlyIncome: i === 0 ? 0 : 10000 + i,
      meetingCount: i % 3,
      noShowCount: 0,
      stayDays: 100 + i,
      hasMeeting: i % 3 > 0,
      hasFinancialData: true,
      segment: "PRIVATE",
      engineer: "Ana",
      incomeBand: "Até 10 mil",
      liquidityBand: "Até 50 mil",
      survivalValid: true,
      survivalTime: 100 + i,
      survivalEvent: 0,
    });
  }
  for (let i = 0; i < 12; i += 1) {
    clients.push({
      clientId: `c${i}`,
      isActive: false,
      isCancelled: true,
      isFrozen: false,
      monthlyIncome: 8000 + i,
      meetingCount: 0,
      noShowCount: 0,
      stayDays: 40 + i,
      hasMeeting: false,
      hasFinancialData: false,
      segment: "APEX",
      engineer: "Bruno",
      incomeBand: "Até 10 mil",
      liquidityBand: "Até 50 mil",
      survivalValid: true,
      survivalTime: 40 + i,
      survivalEvent: 1,
    });
  }
  const out = analyzePopulation(clients, { minSample: 5 });
  assert.ok(out.population.activeUsedInComparison === 40);
  assert.ok(out.population.cancelledUsedInComparison === 12);
  const meetings = out.comparisons.find((r) => r.id === "meetingCount");
  assert.ok(meetings);
  assert.equal(meetings.medianActive != null || meetings.activeMedian != null, true);
  assert.equal(meetings.nActive ?? meetings.activeN, meetings.activeN);
  assert.ok((meetings.n ?? 0) >= 5);
  assert.ok(meetings.coveragePercent != null);
  // zero meetings is valid — cancelled median can be 0
  assert.equal(meetings.medianCancelled ?? meetings.cancelledMedian, 0);
  const assocMeet = out.associations.find((a) => a.id === "meetingCount");
  assert.ok(assocMeet);
  assert.ok(assocMeet.absMeasure != null || assocMeet.associationAbs != null || assocMeet.status);
}

// --- Pharus status normalization ---
{
  const { normalizeMeetingStatus } = await import("./netlify/functions/pharus-ep-meetings.mjs");
  assert.equal(normalizeMeetingStatus("completed"), "completed");
  assert.equal(normalizeMeetingStatus("canceled"), "cancelled");
  assert.equal(normalizeMeetingStatus("cancelled"), "cancelled");
  assert.equal(normalizeMeetingStatus("scheduled"), "scheduled");
}

console.log("ALL _ep_stats_unit_tests PASSED");
