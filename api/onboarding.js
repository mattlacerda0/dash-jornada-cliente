const { sendResponse } = require("./_adapter.cjs");

module.exports = async function onboarding(req, res) {
  const { default: handler } = await import("../netlify/functions/onboarding.mjs");
  return sendResponse(handler, req, res);
};

