// Wrapper Vercel (@vercel/node) para o endpoint interno servidor-servidor.
// A lógica vive em netlify/functions/assistant-data.mjs (camada compartilhada).
// Este wrapper repassa método, headers, URL e body para um Request Web API,
// pois o handler depende do Authorization e do corpo JSON.
module.exports = async function assistantData(req, res) {
  try {
    const { default: handler } = await import(
      "../netlify/functions/assistant-data.mjs"
    );

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;

    const request = new Request(`${protocol}://${host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });

    const response = await handler(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[assistant-data]", error instanceof Error ? error.message : error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        success: false,
        error: "Erro interno ao consultar os dados do assistente.",
        code: "internal_error",
        generated_at: new Date().toISOString(),
      }),
    );
  }
};
