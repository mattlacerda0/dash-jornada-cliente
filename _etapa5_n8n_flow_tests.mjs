/**
 * Testes da Etapa 5: planner local + catálogo oficial + executor.
 * Não chama n8n remoto nem Gemini. Não usa Git. Backup Base QV só via compute* (leitura).
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
  planSemanticQuery,
  emptyConversationContext,
  mergeConversationContext,
  buildMetricLocationText,
  listMetricsForPlanner,
  listMetricsForPlannerSlice,
  getMetricDef,
  ACTIVE_PORTAL_PAGES,
  VALUE_UNAVAILABLE_ASSISTANT_MESSAGE,
} from "./netlify/functions/_shared/portal-metric-catalog.mjs";
import {
  executeMetricQuery,
  verbalizeMetricResult,
  sanitizeVerbalizedAnswer,
} from "./netlify/functions/_shared/metric-executor.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

function tryCase(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => record(name, true, detail))
    .catch((err) => record(name, false, err.message));
}

const PAGE_MATRIX = [
  { page: "general", defQ: "o que é permanência?", valueQ: "quantos clientes temos?" },
  { page: "journey", defQ: "o que é onboarding?", valueQ: "quantos clientes concluiram onboarding?" },
  { page: "meetings", defQ: "o que significa taxa de comparecimento?", valueQ: "quantas reuniões temos?" },
  { page: "mechanisms", defQ: "onde vejo mecanismos?", valueQ: "quantos têm mecanismos implementados?" },
  { page: "plan", defQ: "o que é plano entregue?", valueQ: "quantos planos foram entregues?" },
  { page: "financial", defQ: "como funciona a atualização financeira?", valueQ: "quantos clientes com dados financeiros na atualização financeira?" },
  { page: "platform", defQ: "o que é uso da plataforma?", valueQ: "quantos usuários app pharus?" },
  { page: "support", defQ: "o que é atendimento?", valueQ: "quantos acionamentos temos?" },
  { page: "cancellations", defQ: "em qual tela vejo churn?", valueQ: "quantos cancelamentos?" },
  { page: "ep", defQ: "onde encontro NPS?", valueQ: "qual a cobertura do NPS?" },
  { page: "statistical-crosses", defQ: "o que é AUC?", valueQ: "qual a auc?" },
  { page: "quality", defQ: "o que é qualidade dos dados?", valueQ: "qual a completude geral?" },
  { page: "renewal", defQ: "o que é renovação?", valueQ: "quantos renovaram?" },
  { page: "temporal", defQ: "o que são indicadores temporais?", valueQ: "quantos sujeitos nos indicadores temporais?" },
  { page: "satisfaction", defQ: "o que é CSAT?", valueQ: "qual o csat?" },
];

async function run() {
  const v2Path = resolve(root, "analytics-jornada-chat-v2.json");
  const v2 = existsSync(v2Path) ? readFileSync(v2Path, "utf8") : "";

  await tryCase("workflow v2 existe e não duplica o catálogo hardcoded", () => {
    assert(v2.length > 500, "arquivo vazio");
    assert(!/CATÁLOGO INICIAL/.test(v2), "ainda tem CATÁLOGO INICIAL");
    assert(!/Nunca classificar renda/.test(v2), "ainda tem regras de segmento");
    assert(!/DEBTS, APEX, PRIVATE/.test(v2), "ainda tem regras DEBTS/APEX");
    assert(v2.includes("Instruções do Assistente"), "node Instruções ausente");
    assert(v2.includes('"disabled": true'), "tool deveria permanecer desabilitada");
    assert(!v2.includes("metric_catalog"), "v2 não deve injetar metric_catalog no prompt");
  });

  await tryCase("slice do planner é curto (não 164 métricas inteiras)", () => {
    const full = listMetricsForPlanner();
    const slice = listMetricsForPlannerSlice({ currentPage: "meetings", lastMetric: "attendance_rate" });
    assert(full.length >= 160, `catálogo pequeno demais: ${full.length}`);
    assert(slice.length > 0 && slice.length <= 24, `slice=${slice.length}`);
    assert(slice.some((m) => m.id === "attendance_rate"), "last_metric deveria entrar no slice");
  });

  await tryCase("definição: o que é permanência?", async () => {
    const plan = planSemanticQuery("o que é permanência?", emptyConversationContext());
    assert(plan.intent === "definition", `intent=${plan.intent}`);
    assert(plan.metric === "median_stay_days", `metric=${plan.metric}`);
    assert(plan.use_realtime_query === false, "não deve consultar valor");
    const exec = await executeMetricQuery(plan);
    assert(exec.value == null, "definição não pode ter valor");
    const text = verbalizeMetricResult(plan, exec);
    assert(/perman/i.test(text), text);
  });

  await tryCase("definição: o que significa taxa de comparecimento?", async () => {
    const plan = planSemanticQuery("o que significa taxa de comparecimento?", emptyConversationContext());
    assert(plan.intent === "definition", `intent=${plan.intent}`);
    assert(plan.metric === "attendance_rate", `metric=${plan.metric}`);
    const text = verbalizeMetricResult(plan, await executeMetricQuery(plan));
    assert(/comparec|elegív|elegiv/i.test(text), text);
  });

  await tryCase("definição: o que é renovação?", async () => {
    const plan = planSemanticQuery("o que é renovação?", emptyConversationContext());
    assert(plan.intent === "definition", `intent=${plan.intent}`);
    assert(plan.metric === "renewed_clients", `metric=${plan.metric}`);
  });

  await tryCase("regra: como calculam cliente cancelado?", async () => {
    const plan = planSemanticQuery("como calculam cliente cancelado?", emptyConversationContext());
    assert(["formula", "definition"].includes(plan.intent), `intent=${plan.intent}`);
    assert(plan.metric === "cancelled_clients", `metric=${plan.metric}`);
    const text = verbalizeMetricResult(plan, await executeMetricQuery(plan));
    assert(/churn|distrato|cancel/i.test(text), text);
  });

  await tryCase("regra: como é calculado o NPS?", async () => {
    const plan = planSemanticQuery("como é calculado o NPS?", emptyConversationContext(), { current_page: "ep" });
    assert(["formula", "definition"].includes(plan.intent), `intent=${plan.intent}`);
    assert(plan.metric === "nps_official_index", `metric=${plan.metric}`);
  });

  await tryCase("regra: como funciona a atualização financeira?", async () => {
    const plan = planSemanticQuery("como funciona a atualização financeira?", emptyConversationContext());
    assert(["formula", "definition"].includes(plan.intent), `intent=${plan.intent}`);
    assert(plan.metric === "financial_post_creation_updates", `metric=${plan.metric}`);
    const text = verbalizeMetricResult(plan, await executeMetricQuery(plan));
    assert(/updated_at/i.test(text), text);
  });

  await tryCase("localização: onde vejo mecanismos?", async () => {
    const plan = planSemanticQuery("onde vejo mecanismos?", emptyConversationContext());
    assert(plan.intent === "location", `intent=${plan.intent}`);
    const loc = buildMetricLocationText(plan.metric);
    assert(/Implementação de Mecanismos/i.test(loc), loc);
  });

  await tryCase("localização: onde encontro NPS?", async () => {
    const plan = planSemanticQuery("onde encontro NPS?", emptyConversationContext());
    assert(plan.intent === "location", `intent=${plan.intent}`);
    assert(plan.metric === "nps_official_index", `metric=${plan.metric}`);
    const loc = buildMetricLocationText(plan.metric);
    assert(/Performance do EP/i.test(loc), loc);
    assert(/BASE QV/i.test(loc), loc);
  });

  await tryCase("localização: em qual tela vejo churn?", async () => {
    const plan = planSemanticQuery("em qual tela vejo churn?", emptyConversationContext());
    assert(plan.intent === "location", `intent=${plan.intent}`);
    const loc = buildMetricLocationText(plan.metric);
    assert(/Cancelamento/i.test(loc), loc);
  });

  const valueCases = [
    ["quantos clientes temos?", "total_clients"],
    ["quantos estão ativos?", "active_clients"],
    ["quantos renovaram?", "renewed_clients"],
    ["quantos responderam NPS?", "nps_official_responses"],
    ["quantos são promotores?", "nps_official_promoters"],
    ["quantos têm mecanismos implementados?", "implemented_mechanisms"],
  ];
  for (const [q, metric] of valueCases) {
    await tryCase(`valor: ${q}`, async () => {
      const plan = planSemanticQuery(q, emptyConversationContext());
      assert(plan.intent === "value" || plan.intent === "average", `intent=${plan.intent}`);
      assert(plan.metric === metric, `metric=${plan.metric}`);
      assert(plan.confidence >= 0.8, `confidence=${plan.confidence}`);
      const exec = await executeMetricQuery(plan);
      assert(exec.success, exec.warnings?.join("; "));
      assert(exec.value != null, "valor nulo");
      const text = verbalizeMetricResult(plan, exec);
      const num = typeof exec.value === "number" ? String(exec.value) : null;
      if (num) assert(text.includes(num) || text.includes(exec.value.toLocaleString("pt-BR")), text);
    });
  }

  await tryCase("conversação: renovaram → não renovados", async () => {
    let ctx = emptyConversationContext();
    const first = planSemanticQuery("quantos renovaram?", ctx);
    assert(first.metric === "renewed_clients", first.metric);
    ctx = mergeConversationContext(ctx, first.conversation_context);
    const second = planSemanticQuery("e os não renovados?", ctx);
    assert(second.metric === "non_renewed_clients", `metric=${second.metric} intent=${second.intent}`);
    assert(second.confidence >= 0.8, `confidence=${second.confidence}`);
    const exec = await executeMetricQuery(second);
    assert(exec.success && exec.value != null, exec.warnings?.join("; "));
  });

  await tryCase("conversação: cobertura NPS → quantos responderam", async () => {
    let ctx = emptyConversationContext();
    const first = planSemanticQuery("qual a cobertura do NPS?", ctx, { current_page: "ep" });
    assert(first.metric === "nps_official_coverage", first.metric);
    ctx = mergeConversationContext(ctx, first.conversation_context);
    const second = planSemanticQuery("e quantos responderam?", ctx);
    assert(second.metric === "nps_official_responses", `metric=${second.metric}`);
  });

  await tryCase("ambiguidade sem contexto: qual a média?", () => {
    const plan = planSemanticQuery("qual a média?", emptyConversationContext());
    assert(plan.intent === "clarification", `intent=${plan.intent} metric=${plan.metric}`);
    assert(!plan.metric, "não pode cair em métrica aleatória");
  });

  await tryCase("ambiguidade sem contexto: qual o total?", () => {
    const plan = planSemanticQuery("qual o total?", emptyConversationContext());
    assert(plan.intent === "clarification", `intent=${plan.intent} metric=${plan.metric}`);
    assert(plan.metric !== "total_clients", "proibido fallback silent total_clients");
  });

  await tryCase("ambiguidade sem contexto: como está isso?", () => {
    const plan = planSemanticQuery("como está isso?", emptyConversationContext());
    assert(plan.intent === "clarification", `intent=${plan.intent}`);
  });

  await tryCase("página Reuniões desambigua opções de média, sem escolher uma só", () => {
    const plan = planSemanticQuery("qual a média?", emptyConversationContext(), { current_page: "meetings" });
    assert(plan.intent === "clarification", `intent=${plan.intent} metric=${plan.metric}`);
    assert((plan.options || []).length >= 2 || /indicador/i.test(plan.clarification || ""), plan.clarification);
  });

  await tryCase("guardrail: Gemini não pode arredondar o número oficial", () => {
    const local = "Temos 423 clientes renovados.";
    const sanitized = sanitizeVerbalizedAnswer(
      "Temos aproximadamente 420 clientes renovados.",
      { value: 423, unit: "clients" },
      local,
    );
    assert(sanitized === local, sanitized);
    const ok = sanitizeVerbalizedAnswer(local, { value: 423 }, local);
    assert(ok === local, ok);
  });

  await tryCase("métrica pending não inventa valor (plano patrimonial)", async () => {
    const plan = planSemanticQuery("quantos planos foram entregues?", emptyConversationContext(), { current_page: "plan" });
    assert(plan.metric === "plan_delivered_meetings", plan.metric);
    const exec = await executeMetricQuery({ ...plan, intent: "value" });
    assert(exec.value == null, "pending não pode devolver número");
    const text = verbalizeMetricResult({ ...plan, intent: "value" }, exec);
    assert(text.includes("ainda não está disponível") || text.includes(VALUE_UNAVAILABLE_ASSISTANT_MESSAGE), text);
  });

  const pageCoverage = [];
  for (const row of PAGE_MATRIX) {
    await tryCase(`matriz ${row.page}: definição/localização`, async () => {
      const plan = planSemanticQuery(row.defQ, emptyConversationContext(), { current_page: row.page });
      assert(plan.intent !== "clarification" || plan.metric, `não resolveu: ${JSON.stringify({ intent: plan.intent, metric: plan.metric, clarification: plan.clarification })}`);
      assert(plan.metric, `sem métrica: ${plan.clarification}`);
      const def = getMetricDef(plan.metric);
      assert(def, `catálogo sem ${plan.metric}`);
      const exec = await executeMetricQuery({ ...plan, use_realtime_query: false, intent: plan.intent });
      if (["definition", "formula", "location"].includes(plan.intent)) {
        assert(exec.value == null, "definição/localização não pode ter valor");
      }
      pageCoverage.push({ page: row.page, metric: plan.metric, intent: plan.intent });
    });
    await tryCase(`matriz ${row.page}: valor`, async () => {
      const plan = planSemanticQuery(row.valueQ, emptyConversationContext(), { current_page: row.page });
      assert(plan.metric, `sem métrica: ${plan.clarification || plan.intent}`);
      const def = getMetricDef(plan.metric);
      const exec = await executeMetricQuery({ ...plan, intent: "value" });
      const kind = def?.executionKind;
      if (kind === "pending" || kind === "knowledge_only") {
        assert(exec.value == null, `${plan.metric} pending/knowledge inventou valor`);
        const text = verbalizeMetricResult({ ...plan, intent: "value" }, exec);
        assert(/ainda não está disponível/i.test(text), text);
      } else {
        assert(exec.success, `${plan.metric}: ${exec.warnings?.join("; ")}`);
        assert(exec.value != null, `${plan.metric} sem valor`);
      }
    });
  }

  await tryCase("todas as telas ativas entram na matriz", () => {
    const pages = new Set(PAGE_MATRIX.map((r) => r.page));
    for (const p of ACTIVE_PORTAL_PAGES) {
      assert(pages.has(p), `faltou página ${p}`);
    }
  });

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Etapa 5 ---");
  console.log(`total=${results.length} aprovados=${results.length - failed.length} falhas=${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
