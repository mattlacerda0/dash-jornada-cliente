const { sendResponse } = require("./_adapter.js");

module.exports = async function handler(req, res) {
  const { default: fn } = await import("../netlify/functions/mechanisms.mjs");
  return sendResponse(fn, req, res);
};
