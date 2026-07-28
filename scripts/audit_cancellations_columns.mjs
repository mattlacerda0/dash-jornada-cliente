/**
 * Audita colunas reais de public.cancellations via REST.
 * Uso: node scripts/audit_cancellations_columns.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(projectRoot, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const BASE = process.env.DATA_SUPABASE_URL;
const KEY = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;

const CANDIDATES = [
  "id", "client_id", "motivo", "motivo_categoria",
  "churn_efetivado_at", "distrato_assinado_at", "distrato",
  "data_pedido", "intencao_registrada_at",
  "archived_at", "updated_at", "created_at",
  "passou_retencao", "entered_retencao_at", "retencao_iniciada_at", "nao_retencao_at",
  "desfecho", "tratativa",
  "valor_pago", "valor_a_reembolsar",
  "responsavel_name", "assigned_to",
  "is_critical", "estagio_cliente",
  "entered_offboarding_at", "stage_entered_at",
];

async function probe(cols) {
  const url = new URL("/rest/v1/cancellations", BASE);
  url.searchParams.set("select", cols.join(","));
  url.searchParams.set("limit", "1");
  const res = await fetch(url, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Accept-Profile": "public",
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
}

const existing = [];
const missing = [];
for (const col of CANDIDATES) {
  const r = await probe([col]);
  if (r.ok) existing.push(col);
  else missing.push({ col, status: r.status, err: r.text });
}

// Fetch sample coverage
const select = existing.join(",");
const url = new URL("/rest/v1/cancellations", BASE);
url.searchParams.set("select", select);
url.searchParams.set("order", "id.asc");
const rows = [];
let offset = 0;
while (true) {
  const res = await fetch(url, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Accept-Profile": "public",
      Range: `${offset}-${offset + 999}`,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const batch = await res.json();
  rows.push(...batch);
  if (batch.length < 1000) break;
  offset += 1000;
}

function filled(col) {
  return rows.filter((r) => {
    const v = r[col];
    if (v == null) return false;
    if (typeof v === "string" && !v.trim()) return false;
    return true;
  }).length;
}

const coverage = {};
for (const col of existing) coverage[col] = { filled: filled(col), total: rows.length };

// Sample values for key fields
const samples = {};
for (const col of ["distrato", "desfecho", "tratativa", "estagio_cliente", "passou_retencao", "is_critical", "data_pedido"]) {
  if (!existing.includes(col)) continue;
  const set = new Set();
  for (const r of rows) {
    if (r[col] == null || r[col] === "") continue;
    set.add(String(r[col]).slice(0, 80));
    if (set.size >= 12) break;
  }
  samples[col] = [...set];
}

console.log(JSON.stringify({ existing, missing, rowCount: rows.length, coverage, samples }, null, 2));
