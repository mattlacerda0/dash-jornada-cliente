const { sendResponse } = require("./_adapter.js");

module.exports = async function patrimonialPlan(_req, res) {
  const { default: handler } = await import("../netlify/functions/patrimonial-plan.mjs");
  return sendResponse(handler, res);
};
