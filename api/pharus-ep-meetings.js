const { sendResponse } = require("./_adapter.js");

module.exports = async function handler(req, res) {
  const { default: fn } = await import("../netlify/functions/pharus-ep-meetings.mjs");
  return sendResponse(fn, req, res);
};
