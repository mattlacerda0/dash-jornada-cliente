const { sendResponse } = require("./_adapter.cjs");

module.exports = async function patrimonialPlan(req, res) {
  const { default: handler } = await import("../netlify/functions/patrimonial-plan.mjs");
  return sendResponse(handler, req, res);
};

