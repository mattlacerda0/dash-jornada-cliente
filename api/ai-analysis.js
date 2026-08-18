const { sendResponse } = require("./_adapter.cjs");

async function handler(req, res) {
  try {
    const { default: fn } = await import("../netlify/functions/ai-analysis.mjs");
    return sendResponse(fn, req, res);
  } catch (error) {
    console.error("[ai-analysis]", error instanceof Error ? error.stack || error.message : error);
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      success: false,
      code: "internal_error",
      error: "Não foi possível montar o contexto da análise.",
    }));
  }
}

handler.maxDuration = 60;
module.exports = handler;
