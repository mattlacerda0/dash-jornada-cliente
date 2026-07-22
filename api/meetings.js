const { sendResponse } = require("./_adapter.js");

module.exports = async function meetings(req, res) {
  const { default: handler } = await import("../netlify/functions/meetings.mjs");
  return sendResponse(handler, req, res);
};

