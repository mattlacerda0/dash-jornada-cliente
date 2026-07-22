const { sendResponse } = require("./_adapter.cjs");

module.exports = async function handler(req, res) {
  const { default: fn } = await import("../netlify/functions/general-data.mjs");
  return sendResponse(fn, req, res);
};
