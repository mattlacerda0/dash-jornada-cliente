const { sendResponse } = require("./_adapter.js");

module.exports = async function generalData(req, res) {
  const { default: handler } = await import("../netlify/functions/general-data.mjs");
  return sendResponse(handler, req, res);
};

