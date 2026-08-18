/**
 * Cache em memória da análise executiva (Etapa 8.5).
 * TTL curto. Sem persistência. Sem PII novo.
 */

export const EXECUTIVE_CACHE_TTL_MS = 15 * 60 * 1000;

const store = new Map();
const inflight = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function makeExecutiveCacheKey(page, filters = {}) {
  const norm = {};
  const src = filters && typeof filters === "object" ? filters : {};
  for (const key of Object.keys(src).sort()) {
    const value = src[key];
    if (value == null || value === "") continue;
    norm[key] = value;
  }
  return `${String(page || "")}::${JSON.stringify(norm)}`;
}

export function getExecutiveCache(key) {
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(key);
    return null;
  }
  return clone(row.value);
}

export function setExecutiveCache(key, value, ttlMs = EXECUTIVE_CACHE_TTL_MS) {
  store.set(key, { expiresAt: Date.now() + ttlMs, value: clone(value) });
}

export async function withExecutiveSingleFlight(key, factory) {
  if (inflight.has(key)) return inflight.get(key);
  const pending = Promise.resolve()
    .then(factory)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

export function resetExecutiveCache() {
  store.clear();
  inflight.clear();
}

export function executiveCacheSize() {
  return store.size;
}
