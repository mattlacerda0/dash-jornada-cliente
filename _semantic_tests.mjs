/**
 * Testes obrigatórios da camada semântica (catálogo + contexto + executor).
 * Não usa Git. Pode chamar Supabase para valores.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
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
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

import {
  planSemanticQuery,
  emptyConversationContext,
  mergeConversationContext,
  validateSemanticQueryPlan,
  buildMetricDefinitionText,
} from "./netlify/functions/_shared/portal-metric-catalog.mjs";
import { executeMetricQuery, verbalizeMetricResult } from "./netlify/functions/_shared/metric-executor.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function onlyNumber(text) {
  return /^\s*[\d.,]+\s*%?\s*$/.test(String(text || "").trim());
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

async function run() {
  let ctx = emptyConversationContext();

  // 1. formula média primeiro mecanismo — sem valor isolado (página Mecanismos)
  {
    const plan = planSemanticQuery("Como é calculada a média até o primeiro mecanismo?", ctx, { current_page: "mechanisms" });
    assert(plan.intent === "formula", `intent=${plan.intent}`);
    assert(plan.metric === "average_days_to_first_implementation", `metric=${plan.metric}`);
    assert(plan.use_metric_definition === true, "use_metric_definition");
    assert(plan.use_realtime_query === false, "use_realtime_query");
    const exec = await executeMetricQuery(plan);
    assert(exec.value == null, "value must be null");
    const text = verbalizeMetricResult(plan, exec);
    assert(!onlyNumber(text), `answer is only number: ${text}`);
    assert(/média|contrat|implement|dias/i.test(text), `weak definition: ${text}`);
    ctx = mergeConversationContext(ctx, plan.conversation_context);
    record("1 formula média 1º mecanismo", true, plan.metric);
  }

  // 2. valor média (Mecanismos — mesma função do dashboard)
  {
    const plan = planSemanticQuery("Qual é a média até o primeiro mecanismo?", ctx, { current_page: "mechanisms" });
    assert(plan.intent === "average", `intent=${plan.intent}`);
    assert(plan.metric === "average_days_to_first_implementation", `metric=${plan.metric}`);
    assert(plan.aggregation === "average", `agg=${plan.aggregation}`);
    const v = validateSemanticQueryPlan(plan);
    assert(v.ok, JSON.stringify(v.errors));
    const exec = await executeMetricQuery(plan);
    assert(exec.value != null && typeof exec.value === "number", `value=${exec.value}`);
    assert(exec.unit === "days", `unit=${exec.unit}`);
    const text = verbalizeMetricResult(plan, exec);
    assert(/dias/i.test(text), text);
    assert(!onlyNumber(text), text);
    ctx = mergeConversationContext(ctx, plan.conversation_context);
    record("2 valor média 1º mecanismo", true, `${exec.value} ${exec.unit}`);
  }

  // 3. mediana
  {
    const plan = planSemanticQuery("Qual é a mediana até o primeiro mecanismo?", emptyConversationContext());
    assert(plan.intent === "median", `intent=${plan.intent}`);
    assert(plan.metric === "median_days_to_first_implementation", `metric=${plan.metric}`);
    const exec = await executeMetricQuery(plan);
    assert(exec.value != null, `value=${exec.value}`);
    assert(exec.unit === "days", `unit=${exec.unit}`);
    const text = verbalizeMetricResult(plan, exec);
    assert(/mediana|dias/i.test(text), text);
    ctx = mergeConversationContext(emptyConversationContext(), plan.conversation_context);
    record("3 mediana 1º mecanismo", true, `${exec.value} ${exec.unit}`);
  }

  // 4. média e mediana com contexto
  {
    const plan = planSemanticQuery("Qual é a média e a mediana?", ctx);
    assert(plan.intent === "comparison", `intent=${plan.intent}`);
    assert(plan.metric === ctx.last_metric, `metric=${plan.metric} ctx=${ctx.last_metric}`);
    const exec = await executeMetricQuery(plan);
    assert(exec.value && typeof exec.value === "object", JSON.stringify(exec.value));
    assert(exec.value.median != null && exec.value.average != null, JSON.stringify(exec.value));
    record("4 comparison contexto", true, JSON.stringify(exec.value));
  }

  // 5. definição onboarding — não número
  {
    ctx = emptyConversationContext();
    const plan = planSemanticQuery("Como são contabilizados os clientes que concluíram onboarding?", ctx);
    assert(plan.intent === "definition" || plan.intent === "formula", `intent=${plan.intent}`);
    assert(plan.metric === "completed_onboarding_clients", `metric=${plan.metric}`);
    const exec = await executeMetricQuery(plan);
    assert(exec.value == null, `value=${exec.value}`);
    const text = verbalizeMetricResult(plan, exec);
    assert(!onlyNumber(text), text);
    assert(/onboarding|estágio|jornada/i.test(text), text);
    ctx = mergeConversationContext(ctx, plan.conversation_context);
    record("5 definição onboarding", true, plan.metric);
  }

  // 6. quantos concluíram — valor com contexto
  {
    const plan = planSemanticQuery("Quantos concluíram?", ctx);
    assert(plan.intent === "value", `intent=${plan.intent}`);
    assert(plan.metric === "completed_onboarding_clients", `metric=${plan.metric}`);
    const exec = await executeMetricQuery(plan);
    assert(typeof exec.value === "number" && exec.value > 0, `value=${exec.value}`);
    ctx = mergeConversationContext(ctx, plan.conversation_context);
    record("6 quantos concluíram (contexto)", true, String(exec.value));
  }

  // 7. qual a regra — fórmula, não número
  {
    const plan = planSemanticQuery("Qual a regra?", ctx);
    assert(plan.intent === "formula", `intent=${plan.intent}`);
    assert(plan.metric === "completed_onboarding_clients", `metric=${plan.metric}`);
    const exec = await executeMetricQuery(plan);
    assert(exec.value == null, `value=${exec.value}`);
    const text = verbalizeMetricResult(plan, exec);
    assert(!onlyNumber(text), text);
    record("7 qual a regra (contexto)", true, text.slice(0, 80));
  }

  // 8. ambiguidade 1 mecanismo
  {
    const plan = planSemanticQuery("Quantos clientes usam 1 mecanismo?", emptyConversationContext());
    assert(plan.intent === "clarification", `intent=${plan.intent}`);
    assert(!plan.metric, `metric=${plan.metric}`);
    assert(/disponível|implementado/i.test(plan.clarification || ""), plan.clarification);
    assert(plan.metric !== "total_clients", "must not be total_clients");
    record("8 clarificação 1 mecanismo", true, plan.clarification.slice(0, 90));
  }

  // 9. exatamente um implementado
  {
    const plan = planSemanticQuery(
      "Quantos clientes possuem exatamente um mecanismo implementado?",
      emptyConversationContext(),
    );
    assert(plan.metric === "clients_with_exactly_one_implemented_mechanism", `metric=${plan.metric}`);
    const exec = await executeMetricQuery(plan);
    assert(typeof exec.value === "number", `value=${exec.value}`);
    assert(exec.unit === "clients", `unit=${exec.unit}`);
    ctx = mergeConversationContext(emptyConversationContext(), plan.conversation_context);
    record("9 exatamente 1 implementado", true, String(exec.value));
  }

  // 10. onde está esse dado
  {
    const plan = planSemanticQuery("Onde está esse dado?", ctx);
    assert(plan.intent === "location", `intent=${plan.intent}`);
    assert(plan.metric === "clients_with_exactly_one_implemented_mechanism", `metric=${plan.metric}`);
    const exec = await executeMetricQuery(plan);
    assert(exec.value == null, `value=${exec.value}`);
    const text = verbalizeMetricResult(plan, exec) || buildMetricDefinitionText(plan.metric);
    assert(/client_mecanismos|mecanismos/i.test(exec.location_text || text), exec.location_text || text);
    record("10 localização contexto", true, exec.location_text || text);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n---");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

run().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
