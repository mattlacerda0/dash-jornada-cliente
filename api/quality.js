const { sendResponse } = require("./_adapter.cjs");

const handlers = {
  quality: "../netlify/functions/quality.mjs",
  "financial-updates": "../netlify/functions/financial-updates.mjs",
};

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/api/quality", `https://${req.headers.host || "localhost"}`);
  const routeName = url.searchParams.get("fn") || url.pathname.split("/").filter(Boolean).pop() || "quality";
  const modulePath = handlers[routeName] || handlers.quality;

  const { default: fn } = await import(modulePath);
  return sendResponse(fn, req, res);
};
