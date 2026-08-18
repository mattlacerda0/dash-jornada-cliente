import { computeGeneralDataPayload } from "../general-data.mjs";
import { computeOnboardingPayload } from "../onboarding.mjs";
import { computeMeetingsPayload } from "../meetings.mjs";
import { computeMechanismsPayload } from "../mechanisms.mjs";
import { computePharusMechanismsPayload } from "../pharus-mechanisms.mjs";
import { computeFinancialUpdatesPayload } from "../financial-updates.mjs";
import { computeEngagementPayload } from "../engagement.mjs";
import { computeSupportPayload } from "../support.mjs";
import { computeCancellationsPayload } from "../cancellations.mjs";
import { computeTemporalIndicatorsPayload } from "../temporal-indicators.mjs";
import { computeEpPerformancePayload } from "../ep-performance.mjs";
import { computeStatisticalCrossesPayload } from "../statistical-crosses.mjs";
import { computeExecutiveSummaryPayload } from "../executive-summary.mjs";
import patrimonialPlanHandler from "../patrimonial-plan.mjs";
import platformUsageHandler from "../platform-usage.mjs";
import satisfactionHandler from "../satisfaction.mjs";
import qualityHandler from "../quality.mjs";

const STATS_TIMEOUT_MS = 90_000;
const INTERNAL_BASE = "http://127.0.0.1/";

async function invokeJson(handler, path = INTERNAL_BASE) {
  const response = await handler(new Request(path));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error || `HTTP ${response.status}`);
    err.code = body.code || "handler_error";
    err.status = response.status;
    throw err;
  }
  return body;
}

async function loadStatisticalCrosses() {
  try {
    return await Promise.race([
      computeStatisticalCrossesPayload(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("statistical_crosses_timeout")), STATS_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn("[Portal Snapshot] statistical-crosses skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function buildPortalSnapshot() {
  const startedAt = Date.now();
  process.env.PORTAL_INTERNAL_DATA_RUN = "1";

  const [
    general,
    onboarding,
    plan,
    meetings,
    mechanisms,
    pharusMechanisms,
    financial,
    engagement,
    platform,
    support,
    cancellations,
    satisfaction,
    temporal,
    epPerformance,
    statisticalCrosses,
    quality,
    executive,
  ] = await Promise.all([
    computeGeneralDataPayload(),
    computeOnboardingPayload(),
    invokeJson(patrimonialPlanHandler, `${INTERNAL_BASE}api/patrimonial-plan`),
    computeMeetingsPayload(),
    computeMechanismsPayload(),
    computePharusMechanismsPayload(),
    computeFinancialUpdatesPayload(),
    computeEngagementPayload(),
    invokeJson(platformUsageHandler, `${INTERNAL_BASE}api/platform-usage`),
    computeSupportPayload(),
    computeCancellationsPayload(),
    invokeJson(satisfactionHandler, `${INTERNAL_BASE}api/satisfaction?program=all`),
    computeTemporalIndicatorsPayload(),
    computeEpPerformancePayload(),
    loadStatisticalCrosses(),
    invokeJson(qualityHandler, `${INTERNAL_BASE}api/quality`),
    computeExecutiveSummaryPayload(new Request(`${INTERNAL_BASE}api/executive-summary`)),
  ]);

  const elapsedMs = Date.now() - startedAt;
  const generatedAt = new Date().toISOString();

  return {
    meta: {
      version: 1,
      generatedAt,
      elapsedMs,
      keys: [
        "general",
        "onboarding",
        "plan",
        "meetings",
        "mechanisms",
        "pharusMechanisms",
        "financial",
        "engagement",
        "platform",
        "support",
        "cancellations",
        "satisfaction",
        "temporal",
        "epPerformance",
        "statisticalCrosses",
        "quality",
        "executive",
      ],
    },
    general,
    onboarding,
    plan,
    meetings,
    mechanisms,
    pharusMechanisms,
    financial,
    engagement,
    platform,
    support,
    cancellations,
    satisfaction,
    temporal,
    epPerformance,
    statisticalCrosses,
    quality,
    executive,
  };
}
