const { sendResponse } = require("./_adapter.js");

module.exports = async function platformUsage(_req, res) {
  const { default: handler } = await import("../netlify/functions/platform-usage.mjs");
  return sendResponse(handler, res);
};
