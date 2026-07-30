/** Probe allowed schemas for airtable-like tables. node --env-file=.env scripts/_probe_airtable_schemas.mjs */
async function listTablesHint(url, key, schema, table) {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": schema,
      Prefer: "count=exact",
    },
  });
  const data = await res.json().catch(() => null);
  const arr = Array.isArray(data) ? data : [];
  return {
    schema,
    table,
    ok: res.ok,
    status: res.status,
    cols: arr[0] ? Object.keys(arr[0]) : [],
    error: res.ok ? null : JSON.stringify(data).slice(0, 220),
    contentRange: res.headers.get("content-range"),
  };
}

const url = (process.env.BUSINESS_DATA_SUPABASE_URL || process.env.AUTH_SUPABASE_URL || "").trim();
const key = (process.env.AUTH_SUPABASE_ANON_KEY || "").trim();
const schemas = ["public", "bl_test", "dw_bitrix", "contracts_app"];
const tables = [
  "bkp_clientes_id",
  "bkp_reunioes",
  "clientes_id",
  "reunioes",
  "airtable_clientes",
  "airtable_reunioes",
  "bkp_clientes",
];
const out = [];
for (const schema of schemas) {
  for (const table of tables) out.push(await listTablesHint(url, key, schema, table));
}
console.log(JSON.stringify(out.filter((x) => x.ok || (x.status !== 404 && x.status !== 406)), null, 2));
console.log("--- fails sample ---");
console.log(JSON.stringify(out.filter((x) => !x.ok).slice(0, 5), null, 2));
