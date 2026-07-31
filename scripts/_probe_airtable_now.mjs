/**
 * Probe bkp_airtable exposure. Usage: node --env-file=.env scripts/_probe_airtable_now.mjs
 */
async function probe(url, key, schema, table) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=2`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": schema,
      "Content-Profile": schema,
      Prefer: "count=exact",
    },
  });
  const data = await res.json().catch(() => null);
  const arr = Array.isArray(data) ? data : [];
  const cr = res.headers.get("content-range") || "";
  return {
    schema,
    table,
    ok: res.ok,
    status: res.status,
    contentRange: cr,
    cols: arr[0] ? Object.keys(arr[0]) : [],
    sample: arr.slice(0, 1),
    error: res.ok ? null : JSON.stringify(data).slice(0, 300),
  };
}

const bizUrl = (process.env.BUSINESS_DATA_SUPABASE_URL || process.env.AUTH_SUPABASE_URL || "").trim();
const bizKey = (process.env.AUTH_SUPABASE_ANON_KEY || "").trim();
const dataUrl = (process.env.DATA_SUPABASE_URL || "").trim();
const dataKey = (process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || "").trim();
const configuredSchema = (process.env.BUSINESS_DATA_SUPABASE_SCHEMA || "bkp_airtable").trim();

const out = { bizUrl: bizUrl.slice(0, 48), configuredSchema, probes: [] };

for (const schema of [configuredSchema, "bkp_airtable", "public", "research", "airtable"]) {
  for (const table of ["bkp_clientes_id", "bkp_reunioes", "clientes_id", "reunioes"]) {
    if (bizUrl && bizKey) out.probes.push(await probe(bizUrl, bizKey, schema, table));
    if (dataUrl && dataKey) out.probes.push({ ...(await probe(dataUrl, dataKey, schema, table)), via: "DATA" });
  }
}

// Also probe cancellation_statuses on DATA
if (dataUrl && dataKey) {
  out.statuses = await probe(dataUrl, dataKey, "public", "cancellation_statuses");
  out.statuses_alt = await probe(dataUrl, dataKey, "public", "cancellations_statuses");
}

const ok = out.probes.filter((p) => p.ok);
console.log(JSON.stringify({ okCount: ok.length, ok, statuses: out.statuses, statuses_alt: out.statuses_alt, sampleFail: out.probes.find((p) => !p.ok) }, null, 2));
