/**
 * Teste local somente leitura — App Pharus (mechanisms / user_mechanisms).
 * Não imprime chaves, e-mails nem dados pessoais.
 *
 * Uso: node scripts/test_pharus_mechanisms_read.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getPharusEnv,
  getPharusSupabaseClient,
  pharusConfigurationError,
} from "../netlify/functions/_shared/env.mjs";
import { normalizeMechanismData } from "../netlify/functions/pharus-mechanisms.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
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

function log(msg) {
  console.log(msg);
}

const cfgErr = pharusConfigurationError();
const env = getPharusEnv();
log("=== Teste App Pharus (somente leitura) ===");
log(`URL configurada: ${Boolean(env.url)}`);
log(`ANON KEY configurada: ${Boolean(env.anonKey)} (len=${env.anonKey.length})`);
log(`Project ID: ${env.projectId}`);
log(`Schema preferido: ${env.schema}`);
if (cfgErr) {
  log(`FAIL config: ${cfgErr}`);
  log("Preencha PHARUS_SUPABASE_ANON_KEY no .env local e rode novamente.");
  process.exit(1);
}

const schemas = [...new Set([env.schema, "public", "core"].filter(Boolean))];
let working = null;

for (const schema of schemas) {
  log(`--- Probe schema: ${schema}`);
  try {
    const client = getPharusSupabaseClient({ schema });
    const mech = await client.rest("mechanisms", { select: "id,data,created_at,updated_at", limit: 1, countExact: true });
    const um = await client.rest("user_mechanisms", { select: "id,user_id,mechanism_id,status,created_at", limit: 1, countExact: true });
    log(`  mechanisms HTTP ${mech.status} total~${mech.total}`);
    log(`  user_mechanisms HTTP ${um.status} total~${um.total}`);
    if (mech.ok && um.ok) {
      working = { schema, client, mechSample: mech.data[0] || null, umSample: um.data[0] || null };
      break;
    }
    if (mech.status === 401 || mech.status === 403 || um.status === 401 || um.status === 403) {
      log("  Acesso negado (possível RLS sem política SELECT para anon).");
    }
  } catch (err) {
    log(`  erro: ${err.message || err}`);
  }
}

if (!working) {
  log("FAIL: não foi possível ler mechanisms + user_mechanisms.");
  log("Necessário: política SELECT para anon OU credencial backend com permissão. RLS não deve ser desativada.");
  process.exit(2);
}

log(`Schema confirmado: ${working.schema}`);
const client = working.client;

const mechanisms = await client.fetchAll("mechanisms", "id,data,created_at,updated_at");
const userMechs = await client.fetchAll("user_mechanisms", "id,user_id,mechanism_id,status,notes,created_at");

log(`mechanisms count: ${mechanisms.length}`);
log(`user_mechanisms count: ${userMechs.length}`);

const statuses = new Map();
for (const row of userMechs) {
  const s = row.status == null || String(row.status).trim() === "" ? "(vazio)" : String(row.status);
  statuses.set(s, (statuses.get(s) || 0) + 1);
}
log(`status distintos: ${[...statuses.entries()].map(([k, v]) => `${k}=${v}`).join(", ") || "(nenhum)"}`);

const catalogIds = new Set(mechanisms.map((r) => String(r.id)));
let orphans = 0;
for (const row of userMechs) {
  if (row.mechanism_id == null) continue;
  if (!catalogIds.has(String(row.mechanism_id))) orphans += 1;
}
log(`mechanism_id sem catálogo: ${orphans}`);

const warnings = [];
if (working.mechSample) {
  normalizeMechanismData(working.mechSample.data, warnings, working.mechSample.id);
  log(`sample mechanisms.data normalizado: ok=${warnings.length === 0}`);
  log(`sample fields presentes: id=${Boolean(working.mechSample.id)} data=${working.mechSample.data != null} created_at=${Boolean(working.mechSample.created_at)} updated_at=${Boolean(working.mechSample.updated_at)}`);
}
if (working.umSample) {
  log(`sample user_mechanisms fields: id=${Boolean(working.umSample.id)} user_id=${Boolean(working.umSample.user_id)} mechanism_id=${Boolean(working.umSample.mechanism_id)} status=${Boolean(working.umSample.status)} created_at=${Boolean(working.umSample.created_at)}`);
}

// Relacionamento: amostra de matches (sem IDs pessoais)
const matched = userMechs.filter((r) => r.mechanism_id != null && catalogIds.has(String(r.mechanism_id))).length;
log(`relacionamento mechanism_id=mechanisms.id: matches=${matched} / ${userMechs.length}`);

// Probe possíveis chaves de usuário (somente existência de tabelas/colunas — sem valores)
const userTableCandidates = ["profiles", "users", "user_profiles", "personal_info", "accounts", "user_metadata"];
log("--- Auditoria de chave de relacionamento (existência apenas) ---");
for (const table of userTableCandidates) {
  try {
    const probe = await client.rest(table, { select: "*", limit: 1 });
    if (!probe.ok) {
      log(`  ${working.schema}.${table}: HTTP ${probe.status}`);
      continue;
    }
    const row = probe.data[0] || {};
    const cols = Object.keys(row);
    const interesting = cols.filter((c) =>
      /email|qv|codigo|code|external|client|user/i.test(c)
    );
    log(`  ${working.schema}.${table}: ok cols=${cols.length} candidates=[${interesting.join(", ") || "—"}]`);
  } catch (err) {
    log(`  ${working.schema}.${table}: ${err.message || err}`);
  }
}

log("=== Fim do teste (sem PII / sem chaves) ===");
process.exit(0);
