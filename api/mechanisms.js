const { sendResponse } = require("./_adapter.js");

module.exports = async function mechanisms(_req, res) {
  const { default: handler } = await import("../netlify/functions/mechanisms.mjs");
  return sendResponse(handler, res);
};
