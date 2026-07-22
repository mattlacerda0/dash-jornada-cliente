const { sendResponse } = require("./_adapter.cjs");

module.exports = async function authConfig(req, res) {
  const { default: handler } = await import("../netlify/functions/auth-config.mjs");
  return sendResponse(handler, req, res);
};

