const { sendResponse } = require("./_adapter.cjs");

module.exports = async function handler(req, res) {
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
  };

  const loadRoute = routes[routeName] || routes.quality;
  const { default: fn } = await loadRoute();

  return sendResponse(fn, req, res);
};
