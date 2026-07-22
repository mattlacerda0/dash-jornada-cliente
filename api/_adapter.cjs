function collectHeaders(req) {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value != null) headers.set(key, String(value));
  });
  return headers;
}

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function toFetchRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  return new Request(`${protocol}://${host}${req.url || "/"}`, {
    method: req.method || "GET",
    headers: collectHeaders(req),
    body: await readBody(req),
  });
}

async function sendResponse(handler, req, res) {
  const response = await handler(await toFetchRequest(req));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

module.exports = { sendResponse };
