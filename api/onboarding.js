const { sendResponse } = require("./_adapter.js");

module.exports = async function onboarding(_req, res) {
  const { default: handler } = await import("../netlify/functions/onboarding.mjs");
  return sendResponse(handler, res);
};
