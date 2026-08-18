const { sendResponse } = require("./_adapter.cjs");

async function handler(req, res) {
  const url = new URL(req.url || "/api/quality", `https://${req.headers.host || "localhost"}`);
  const routeName = url.searchParams.get("fn") || url.pathname.split("/").filter(Boolean).pop() || "quality";

  const routes = {
    "auth-config": () => import("../netlify/functions/auth-config.mjs"),
    "quality": () => import("../netlify/functions/quality.mjs"),
    "general-data": () => import("../netlify/functions/general-data.mjs"),
    "onboarding": () => import("../netlify/functions/onboarding.mjs"),
    "patrimonial-plan": () => import("../netlify/functions/patrimonial-plan.mjs"),
    "meetings": () => import("../netlify/functions/meetings.mjs"),
    "mechanisms": () => import("../netlify/functions/mechanisms.mjs"),
    "pharus-mechanisms": () => import("../netlify/functions/pharus-mechanisms.mjs"),
    "financial-updates": () => import("../netlify/functions/financial-updates.mjs"),
    "engagement": () => import("../netlify/functions/engagement.mjs"),
    "platform-usage": () => import("../netlify/functions/platform-usage.mjs"),
    "support": () => import("../netlify/functions/support.mjs"),
    "cancellations": () => import("../netlify/functions/cancellations.mjs"),
    "satisfaction": () => import("../netlify/functions/satisfaction.mjs"),
    "ep-performance": () => import("../netlify/functions/ep-performance.mjs"),
    "pharus-ep-meetings": () => import("../netlify/functions/pharus-ep-meetings.mjs"),
    "statistical-crosses": () => import("../netlify/functions/statistical-crosses.mjs"),
    "temporal-indicators": () => import("../netlify/functions/temporal-indicators.mjs"),
    "executive-summary": () => import("../netlify/functions/executive-summary.mjs"),
    "portal-snapshot": () => import("../netlify/functions/portal-snapshot.mjs"),
    "ai-analysis": () => import("../netlify/functions/ai-analysis.mjs"),
  };

  const loadRoute = routes[routeName] || routes.quality;
  try {
    const { default: fn } = await loadRoute();
    return sendResponse(fn, req, res);
  } catch (error) {
    console.error("[quality]", routeName, error instanceof Error ? error.stack || error.message : error);
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      success: false,
      code: "internal_error",
      error: "Não foi possível processar a requisição.",
    }));
  }
}

handler.maxDuration = 60;
module.exports = handler;
