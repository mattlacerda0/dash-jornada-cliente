function toFetchRequest(req) {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value != null) headers.set(key, String(value));
  });
  return new Request(`https://${req.headers.host || "localhost"}${req.url || "/"}`, {
    method: req.method || "GET",
    headers,
  });
}

async function sendResponse(handler, req, res) {
  const response = await handler(toFetchRequest(req));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

module.exports = { sendResponse };
