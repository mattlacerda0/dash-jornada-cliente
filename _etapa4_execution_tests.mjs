/**
 * Testes da Etapa 4: resolução canônica + execução via registry/portal-query.
 * Sem Gemini. Pode chamar compute*Payload (Supabase somente leitura).
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

import {
  resolveCanonicalMetricId,
  getMetricDef,
  planSemanticQuery,
} from "./netlify/functions/_shared/portal-metric-catalog.mjs";
import { getRegistryMetric } from "./netlify/functions/_shared/portal-metric-registry.mjs";
import { executeMetricQuery } from "./netlify/functions/_shared/metric-executor.mjs";
import {
  resolvePortalQuestion,
  validateQueryPlan,
  executePortalQuery,
} from "./netlify/functions/_shared/portal-query.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

async function expectValue(metricId, extra = {}) {
  const exec = await executeMetricQuery({
    metric: metricId,
    domain: getMetricDef(metricId)?.domain,
    intent: "value",
    filters: {},
    ...extra,
  });
  assert(exec.metric === resolveCanonicalMetricId(metricId), `canonical ${exec.metric}`);
  assert(exec.value !== undefined, "undefined value");
  assert(exec.unit, "missing unit");
  assert(Array.isArray(exec.sources), "sources");
  return exec;
}

async function run() {
  {
    const ok = resolveCanonicalMetricId("cancelled_meetings") === "cancelled_meetings_count"
      && resolveCanonicalMetricId("rescheduled_meetings") === "total_meeting_reschedules"
      && resolveCanonicalMetricId("sc_kaplan_meier") === "sc_survival";
    record("1 IDs legados resolvem", ok);
  }

  {
    const blocked = validateQueryPlan({ intent: "value", domain: "general", metric: "active_clients", sql: "select 1" });
    record("2 SQL livre rejeitado", blocked.ok === false && /não é permitida/i.test(String(blocked.clarification)));
  }

  {
    const exec = await executeMetricQuery({ metric: "totally_fake_metric_xyz", intent: "value" });
    record("3 métrica desconhecida não executa", exec.success === false && exec.value == null);
  }

  {
    const exec = await executeMetricQuery({ metric: "satisfaction_nps_index", intent: "value" });
    const def = getMetricDef("satisfaction_nps_index");
    record(
      "4 NBV sem executor oficial",
      def.status === "needs_business_validation"
        && exec.success === false
        && exec.value == null
        && /validação de negócio/i.test(String(exec.warnings?.join(" "))),
    );
  }

  const questions = [
    ["quantos clientes estão ativos?", "active_clients"],
    ["quantos clientes renovaram?", "renewed_clients"],
    ["quantos clientes têm dados financeiros?", "clients_with_financial_data"],
    ["quantos tiveram atualização financeira real?", "financial_post_creation_updates"],
    ["quantos clientes possuem mecanismos implementados?", "implemented_mechanisms"],
    ["quantos responderam NPS?", "nps_official_responses"],
    ["quantos são promotores?", "nps_official_promoters"],
  ];

  for (const [q, expected] of questions) {
    const local = resolvePortalQuestion(q);
    const planned = planSemanticQuery(q, {}, {});
    record(`5 resolver: ${q}`, local.metric === expected && planned.metric === expected, `portal-query=${local.metric} semantic=${planned.metric}`);
  }

  try {
    const active = await expectValue("active_clients");
    record("6 executar ativos", typeof active.value === "number" && active.unit === "clients", String(active.value));
  } catch (e) {
    record("6 executar ativos", false, e.message);
  }

  try {
    const renewed = await expectValue("renewed_clients");
    record("7 executar renovados", typeof renewed.value === "number" && renewed.unit === "clients", String(renewed.value));
  } catch (e) {
    record("7 executar renovados", false, e.message);
  }

  try {
    const rate = await expectValue("renewal_rate");
    record("8 executar taxa renovação", rate.value == null || typeof rate.value === "number", String(rate.value));
  } catch (e) {
    record("8 executar taxa renovação", false, e.message);
  }

  try {
    const fin = await expectValue("financial_post_creation_updates");
    record("9 executar atualização real", typeof fin.value === "number", String(fin.value));
  } catch (e) {
    record("9 executar atualização real", false, e.message);
  }

  try {
    const impl = await expectValue("implemented_mechanisms");
    record("10 executar mecanismos implementados", typeof impl.value === "number", String(impl.value));
  } catch (e) {
    record("10 executar mecanismos implementados", false, e.message);
  }

  try {
    const nps = await expectValue("nps_official_responses");
    const promoters = await expectValue("nps_official_promoters");
    record(
      "11 executar NPS oficial",
      typeof nps.value === "number" && typeof promoters.value === "number" && nps.unit === "responses",
      `resp=${nps.value} prom=${promoters.value}`,
    );
  } catch (e) {
    record("11 executar NPS oficial", false, e.message);
  }

  {
    const local = resolvePortalQuestion("quantos clientes renovaram?");
    const validated = validateQueryPlan({ intent: "value", domain: local.domain, metric: local.metric });
    record("12 validateQueryPlan renovação", validated.ok === true && !validated.pending, JSON.stringify(validated.warnings));
    try {
      const result = await executePortalQuery(validated.plan);
      record(
        "13 executePortalQuery renovação",
        result.value !== undefined && result.metric === "renewed_clients",
        String(result.value),
      );
    } catch (e) {
      record("13 executePortalQuery renovação", false, e.message);
    }
  }

  {
    const temporal = getMetricDef("temporal_financial_updates");
    const satisfaction = getMetricDef("satisfaction_nps_index");
    record(
      "14 NBV não promovida a confirmed",
      temporal.status === "needs_business_validation"
        && satisfaction.status === "needs_business_validation"
        && !getRegistryMetric("satisfaction_nps_index"),
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passaram.`);
  if (failed.length) process.exitCode = 1;
}

run().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
