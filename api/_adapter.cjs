function collectHeaders(req) {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value != null) headers.set(key, String(value));
  });
  return headers;
}

function bufferFromUnknown(value) {
  if (value == null || value === "") return undefined;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value);
  if (typeof value === "object" && typeof value.pipe !== "function") {
    return Buffer.from(JSON.stringify(value));
  }
  return undefined;
}

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const parsed = bufferFromUnknown(req.body);
  if (parsed) return parsed;

  if (req.body && typeof req.body.pipe === "function") {
    const streamed = [];
    for await (const chunk of req.body) streamed.push(Buffer.from(chunk));
    if (streamed.length) return Buffer.concat(streamed);
  }

  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
  } catch (error) {
    console.error("[adapter] failed to read body", error instanceof Error ? error.message : error);
    return undefined;
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function toFetchRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const body = await readBody(req);
  const init = {
    method: req.method || "GET",
    headers: collectHeaders(req),
  };
  if (body) {
    init.body = body;
    init.duplex = "half";
  }
  return new Request(`${protocol}://${host}${req.url || "/"}`, init);
}

async function sendResponse(handler, req, res) {
  try {
    const response = await handler(await toFetchRequest(req));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  } catch (error) {
    console.error("[adapter]", error instanceof Error ? error.stack || error.message : error);
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      success: false,
      code: "internal_error",
      error: "Não foi possível processar a requisição.",
    }));
  }
}

module.exports = { sendResponse };
