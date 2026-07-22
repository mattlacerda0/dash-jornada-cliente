const { sendResponse } = require("./_adapter.js");

module.exports = async function mechanisms(req, res) {
  const { default: handler } = await import("../netlify/functions/mechanisms.mjs");
  return sendResponse(handler, req, res);
};

