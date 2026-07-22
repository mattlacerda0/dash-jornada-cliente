const { sendResponse } = require("./_adapter.cjs");

module.exports = async function platformUsage(req, res) {
  const { default: handler } = await import("../netlify/functions/platform-usage.mjs");
  return sendResponse(handler, req, res);
};

