import { requireCorporateAuth } from "./_shared/auth.mjs";
import { computeGeneralDataPayload } from "./general-data.mjs";
import { computeMeetingsPayload } from "./meetings.mjs";
import { computeOnboardingPayload } from "./onboarding.mjs";
import { computeMechanismsPayload } from "./mechanisms.mjs";
import { computeFinancialUpdatesPayload } from "./financial-updates.mjs";
import { computeCancellationsPayload } from "./cancellations.mjs";
import { computeTemporalIndicatorsPayload } from "./temporal-indicators.mjs";
import { computeSupportPayload } from "./support.mjs";
import { computeStatisticalCrossesPayload } from "./statistical-crosses.mjs";
import platformUsageHandler from "./platform-usage.mjs";
import satisfactionHandler from "./satisfaction.mjs";
import patrimonialPlanHandler from "./patrimonial-plan.mjs";

const STATS_TIMEOUT_MS = 90_000;

function pct(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

function round1(value) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

function healthStatus(metric, value) {
  const rules = {
    nps: [[50, "good"], [30, "warn"], [-Infinity, "bad"]],
    renewalRate: [[70, "good"], [50, "warn"], [-Infinity, "bad"]],
    completedOnboarding: [[75, "good"], [55, "warn"], [-Infinity, "bad"]],
    attendanceRate: [[85, "good"], [70, "warn"], [-Infinity, "bad"]],
    loginCoverage: [[60, "good"], [40, "warn"], [-Infinity, "bad"]],
    financialUpdated30: [[50, "good"], [30, "warn"], [-Infinity, "bad"]],
    activeRiskPercent: [[10, "good"], [20, "warn"], [Infinity, "bad"]],
  };
  const bands = rules[metric];
  if (!bands || value == null || !Number.isFinite(value)) return "neutral";
  for (const [threshold, status] of bands) {
    if (metric === "activeRiskPercent") {
      if (value <= threshold) return status;
    } else if (value >= threshold) {
      return status;
    }
  }
  return "neutral";
}

async function invokeJson(handler, request) {
  const response = await handler(request);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${response.status}`);
    err.code = body.code || "handler_error";
    throw err;
  }
  return response.json();
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
    console.warn("[Executive Summary] statistical-crosses skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}

function dominantSegment(distributions) {
  const segments = distributions?.segments || [];
  if (!segments.length) return null;
  return [...segments].sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.label || null;
}

function countRenewedClients(clients) {
  if (!Array.isArray(clients)) return 0;
  return clients.filter((row) => Number(row.currentCycle ?? row.ciclo ?? 0) > 1).length;
}

function pickSecondCancellationReason(cancellations) {
  const ranked = cancellations?.distributions?.byReasonCategory
    || cancellations?.distributions?.byCategory
    || [];
  if (ranked[1]?.label) return ranked[1].label;
  return cancellations?.summary?.secondReasonCategory
    || cancellations?.summary?.secondReason
    || ranked[0]?.label
    || cancellations?.summary?.topReasonCategory
    || cancellations?.summary?.topReason
    || null;
}

function buildInsight(statistical, cancellations) {
  const discovery = statistical?.discoveries?.[0];
  if (discovery?.title && discovery?.text) return `${discovery.title}: ${discovery.text}`;
  if (discovery?.headline) return discovery.headline;
  if (discovery?.title && discovery?.detail) return `${discovery.title}: ${discovery.detail}`;
  if (statistical?.summary?.topAssociationLabel) {
    const strength = statistical.summary.topAssociationStrength || statistical.summary.topAssociationMeasure || "";
    return `Principal associação com cancelamento: ${statistical.summary.topAssociationLabel}${strength ? ` (${strength})` : ""}.`;
  }
  if (cancellations?.summary?.topReasonCategory) {
    return `Principal categoria de cancelamento: ${cancellations.summary.topReasonCategory}.`;
  }
  return null;
}

export async function computeExecutiveSummaryPayload(request) {
  const [
    generalResult,
    meetingsResult,
    onboardingResult,
    mechanismsResult,
    financialResult,
    cancellationsResult,
    temporalResult,
    supportResult,
    platformResult,
    satisfactionResult,
    planResult,
    statisticalResult,
  ] = await Promise.allSettled([
    computeGeneralDataPayload(),
    computeMeetingsPayload({ includeMeetingTypes: false }),
    computeOnboardingPayload(),
    computeMechanismsPayload(),
    computeFinancialUpdatesPayload(),
    computeCancellationsPayload(),
    computeTemporalIndicatorsPayload(),
    computeSupportPayload(),
    invokeJson(platformUsageHandler, request),
    invokeJson(satisfactionHandler, request),
    invokeJson(patrimonialPlanHandler, request),
    loadStatisticalCrosses(),
  ]);

  const unwrap = (result, label) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[Executive Summary] ${label} failed:`, result.reason instanceof Error ? result.reason.message : result.reason);
    return null;
  };

  const general = unwrap(generalResult, "general-data");
  const meetings = unwrap(meetingsResult, "meetings");
  const onboarding = unwrap(onboardingResult, "onboarding");
  const mechanisms = unwrap(mechanismsResult, "mechanisms");
  const financial = unwrap(financialResult, "financial-updates");
  const cancellations = unwrap(cancellationsResult, "cancellations");
  const temporal = unwrap(temporalResult, "temporal-indicators");
  const support = unwrap(supportResult, "support");
  const platform = unwrap(platformResult, "platform-usage");
  const satisfaction = unwrap(satisfactionResult, "satisfaction");
  const plan = unwrap(planResult, "patrimonial-plan");
  const statistical = statisticalResult.status === "fulfilled" ? statisticalResult.value : null;

  const g = general?.summary || {};
  const totalClients = g.totalClients || 0;
  const activeClients = g.activeClients || 0;
  const renewedClients = countRenewedClients(general?.clients);
  const renewalRate = pct(renewedClients, totalClients);
  const nps = satisfaction?.summary?.nps ?? null;
  const effectiveCancellations = cancellations?.summary?.effectiveCancellations ?? g.cancelledClients ?? 0;
  const inCancellationProcess = cancellations?.summary?.clientsInCancellationProcess ?? 0;

  const northStar = {
    activeClients: { value: activeClients, health: "neutral" },
    nps: { value: nps, health: healthStatus("nps", nps) },
    renewalRate: { value: renewalRate, renewedClients, health: healthStatus("renewalRate", renewalRate) },
    typicalStayDays: { value: g.typicalStayDays ?? null, label: g.typicalStayDays != null ? `${Math.round(g.typicalStayDays)} d` : "—" },
    effectiveCancellations: { value: effectiveCancellations, health: "neutral" },
  };

  const portfolioComposition = [
    { label: "Ativos", count: activeClients, color: "#42c985" },
    { label: "Congelados", count: g.frozenClients || 0, color: "#69a8ff" },
    { label: "Cancelados confirmados", count: g.cancelledClients || 0, color: "#ef6b73" },
    { label: "Em processo de cancelamento", count: inCancellationProcess, color: "#f6bd4b" },
  ].map((item) => ({
    ...item,
    percent: pct(item.count, totalClients),
  }));

  const npsDistribution = satisfaction?.distributions?.npsClassification || [];

  const payload = {
    generatedAt: new Date().toISOString(),
    period: "snapshot",
    storytelling: {
      thesis: "A jornada do cliente está saudável, entregue e sustentável?",
      readingOrder: ["northStar", "portfolio", "journey", "engagement", "satisfaction", "risk", "charts"],
    },
    northStar,
    blocks: {
      portfolio: {
        totalClients,
        activeClients,
        frozenClients: g.frozenClients || 0,
        inCancellationProcess,
        financialProfilePercent: g.financialProfilePercent ?? null,
        dominantSegment: dominantSegment(general?.distributions),
      },
      journey: {
        completedOnboardingPercent: onboarding?.summary?.completedPercent ?? null,
        typicalFirstMeetingDays: onboarding?.summary?.averageFirstMeetingDays ?? null,
        planDeliveredClients: plan?.summary?.deliveredClients ?? null,
        planDeliveredPercent: pct(plan?.summary?.deliveredClients || 0, plan?.summary?.totalClients || totalClients),
        attendanceRate: meetings?.summary?.attendanceRate ?? null,
        implementationPercent: mechanisms?.summary?.implementationPercent ?? null,
        health: {
          completedOnboarding: healthStatus("completedOnboarding", onboarding?.summary?.completedPercent),
          attendanceRate: healthStatus("attendanceRate", meetings?.summary?.attendanceRate),
        },
      },
      engagement: {
        loginCoverage: platform?.summary?.loginCoverage ?? null,
        typicalDaysSinceLastAccess: platform?.summary?.typicalDaysSinceLastAccess ?? null,
        updatedLast30DaysPercent: financial?.summary?.updatedLast30DaysPercentOfFinancial ?? financial?.summary?.updatedLast30DaysPercent ?? null,
        outdatedOver90DaysPercent: financial?.summary?.outdatedOver90DaysPercent ?? null,
        health: {
          loginCoverage: healthStatus("loginCoverage", platform?.summary?.loginCoverage),
          financialUpdated30: healthStatus("financialUpdated30", financial?.summary?.updatedLast30DaysPercentOfFinancial ?? financial?.summary?.updatedLast30DaysPercent),
        },
      },
      satisfaction: {
        csatAverage: round1(satisfaction?.summary?.csatAverage),
        csatSatisfiedPercent: satisfaction?.summary?.csatSatisfiedPercent ?? null,
        npsResponseRate: satisfaction?.summary?.npsResponseRate ?? null,
        totalTickets: support?.summary?.totalTickets ?? null,
        urgentTickets: support?.summary?.urgentTickets ?? null,
        identificationCoverage: support?.summary?.identificationCoverage ?? null,
      },
    },
    risk: {
      funnel: {
        intentions: cancellations?.summary?.intentionsRegistered ?? 0,
        orders: cancellations?.summary?.ordersRegistered ?? 0,
        effective: effectiveCancellations,
        rateIntentionToOrder: cancellations?.summary?.funnel?.rateIntentionToOrder ?? null,
        rateIntentionToEffective: cancellations?.summary?.funnel?.rateIntentionToEffective ?? null,
      },
      activeClientsWithSignals: temporal?.summary?.activeClientsWithSignals ?? null,
      activeClientsWithSignalsPercent: temporal?.summary?.activeClientsWithSignalsPercent ?? null,
      inCancellationProcess,
      topCancellationReason: pickSecondCancellationReason(cancellations),
      topSignal: temporal?.activeRisk?.topSignal || temporal?.preCancellation?.topSignal || null,
      insight: buildInsight(statistical, cancellations),
      health: {
        activeRiskPercent: healthStatus("activeRiskPercent", temporal?.summary?.activeClientsWithSignalsPercent),
      },
    },
    charts: {
      portfolioComposition,
      npsClassification: npsDistribution,
    },
    meta: {
      sourcesLoaded: {
        general: Boolean(general),
        meetings: Boolean(meetings),
        onboarding: Boolean(onboarding),
        mechanisms: Boolean(mechanisms),
        financial: Boolean(financial),
        cancellations: Boolean(cancellations),
        temporal: Boolean(temporal),
        support: Boolean(support),
        platform: Boolean(platform),
        satisfaction: Boolean(satisfaction),
        plan: Boolean(plan),
        statistical: Boolean(statistical),
      },
      warnings: [],
    },
  };

  for (const [key, loaded] of Object.entries(payload.meta.sourcesLoaded)) {
    if (!loaded) payload.meta.warnings.push(`Fonte indisponível: ${key}`);
  }

  return payload;
}

export default async function handler(request) {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  try {
    const payload = await computeExecutiveSummaryPayload(request);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Executive Summary] failed:", error instanceof Error ? error.message : error);
    return Response.json(
      {
        error: "Não foi possível consolidar o resumo executivo.",
        code: "executive_summary_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
