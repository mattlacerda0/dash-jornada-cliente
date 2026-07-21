const { sendResponse } = require("./_adapter.js");

module.exports = async function quality(_req, res) {
  const { default: handler } = await import("../netlify/functions/quality.mjs");
  return sendResponse(handler, res);
};
