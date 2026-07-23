const { sendResponse } = require("./_adapter.cjs");

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/api/quality", `https://${req.headers.host || "localhost"}`);
  const routeName = url.searchParams.get("fn") || url.pathname.split("/").filter(Boolean).pop() || "quality";

  const { default: fn } =
    routeName === "financial-updates"
      ? await import("../netlify/functions/financial-updates.mjs")
      : routeName === "satisfaction"
        ? await import("../netlify/functions/satisfaction.mjs")
      : await import("../netlify/functions/quality.mjs");

  return sendResponse(fn, req, res);
};
