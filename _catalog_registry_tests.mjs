/**
 * Testes estruturais do catálogo e do registry (Etapa 3).
 * Não usa Git. Não altera o banco. Não chama compute*Payload.
 */
import {
  portalMetricCatalog,
  getMetricDef,
  resolveCanonicalMetricId,
  LEGACY_METRIC_IDS,
  METRIC_STATUS,
  validateSemanticQueryPlan,
  normalize,
} from "./netlify/functions/_shared/portal-metric-catalog.mjs";
import {
  portalMetricRegistry,
  portalDomainExecutors,
  getRegistryMetric,
  listRegistryMetrics,
} from "./netlify/functions/_shared/portal-metric-registry.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

const VALID_STATUS = new Set(Object.values(METRIC_STATUS));
const VALID_KIND = new Set(["live", "dashboard_payload", "derived", "pending", "knowledge_only"]);
const DERIVED_FAKE_COLUMNS = new Set([
  "spearman", "auc", "lift", "kaplan_meier", "kaplan-meier", "cohort", "std_diff",
]);

function metricPhrases(m) {
  return [...(m.aliases || []), ...(m.questions || [])];
}

function sourceIsPhysical(src) {
  if (!src || typeof src !== "object") return false;
  return Boolean(src.table || src.schema);
}

function run() {
  const metrics = Object.values(portalMetricCatalog);
  const ids = Object.keys(portalMetricCatalog);

  {
    const unique = new Set(ids);
    const ok = unique.size === ids.length && metrics.every((m) => m.id && m.id === portalMetricCatalog[m.id]?.id);
    record("1 IDs únicos e iguais à chave", ok, `${ids.length} IDs`);
  }

  {
    const missing = metrics.filter((m) => !m.label || !m.domain || !m.status || !m.executionKind);
    record("2 campos obrigatórios (label/domain/status/executionKind)", missing.length === 0, missing.map((m) => m.id).join(", "));
  }

  {
    const bad = metrics.filter((m) => !VALID_STATUS.has(m.status));
    record("3 status válidos", bad.length === 0, bad.map((m) => `${m.id}=${m.status}`).join(", "));
  }

  {
    const bad = metrics.filter((m) => !VALID_KIND.has(m.executionKind));
    record("4 executionKind válidos", bad.length === 0, bad.map((m) => `${m.id}=${m.executionKind}`).join(", "));
  }

  {
    const missing = metrics.filter((m) => m.status === "confirmed" && !String(m.description || "").trim());
    record("5 confirmed possuem definição", missing.length === 0, missing.map((m) => m.id).join(", "));
  }

  {
    const owner = new Map();
    const conflicts = [];
    for (const m of metrics) {
      for (const phrase of metricPhrases(m)) {
        const a = normalize(phrase);
        if (!a || a.length < 4) continue;
        const prev = owner.get(a);
        if (prev && prev !== m.id) conflicts.push(`${a} → ${prev} vs ${m.id}`);
        else owner.set(a, m.id);
      }
    }
    record("6 aliases não conflitantes", conflicts.length === 0, conflicts.slice(0, 12).join("; "));
  }

  {
    let ok = true;
    const detail = [];
    for (const [legacy, canonical] of Object.entries(LEGACY_METRIC_IDS)) {
      const resolvedId = resolveCanonicalMetricId(legacy);
      const def = getMetricDef(legacy);
      if (resolvedId !== canonical) {
        ok = false;
        detail.push(`${legacy} resolveu ${resolvedId}`);
      }
      if (!def || def.id !== canonical) {
        ok = false;
        detail.push(`${legacy} getMetricDef=${def?.id}`);
      }
    }
    record("7 IDs legados resolvem para canônico", ok, detail.join("; ") || Object.keys(LEGACY_METRIC_IDS).join(", "));
  }

  {
    const missing = [];
    for (const id of Object.keys(portalMetricRegistry)) {
      if (!getMetricDef(id)) missing.push(id);
    }
    record("8 todo registry aponta para métrica existente", missing.length === 0, missing.join(", "));
  }

  {
    const missing = [];
    for (const [id, entry] of Object.entries(portalMetricRegistry)) {
      if (["live", "dashboard_payload", "derived"].includes(entry.executionKind)) {
        if (!portalDomainExecutors[entry.domain]?.compute) missing.push(id);
      }
    }
    record("9 executores de registry existem para kinds consultáveis", missing.length === 0, missing.join(", "));
  }

  {
    const incomplete = [];
    for (const m of metrics) {
      for (const src of m.sources || []) {
        if (!sourceIsPhysical(src)) continue;
        const cols = src.columns || (src.column ? [src.column] : []);
        if (!src.table || !cols.length) incomplete.push(`${m.id}:${src.table || "?"}`);
      }
    }
    record("10 fontes físicas têm tabela/colunas", incomplete.length === 0, incomplete.join(", "));
  }

  {
    const fakes = [];
    for (const m of metrics) {
      const derived = m.derivedMetric || m.executionKind === "derived";
      if (!derived) continue;
      for (const src of m.sources || []) {
        const cols = src.columns || (src.column ? [src.column] : []);
        for (const col of cols) {
          if (DERIVED_FAKE_COLUMNS.has(normalize(col))) fakes.push(`${m.id}.${col}`);
        }
        if (DERIVED_FAKE_COLUMNS.has(normalize(src.table))) fakes.push(`${m.id}.${src.table}`);
      }
    }
    record("11 derivadas não fingem coluna de banco", fakes.length === 0, fakes.join(", "));
  }

  {
    const plan = validateSemanticQueryPlan({
      intent: "formula",
      metric: "chronological_stay_days",
      domain: "general",
      confidence: 1,
    });
    record("12 knowledge_only aceita fórmula sem executor", plan.ok === true, JSON.stringify(plan.errors));
  }

  {
    const a = getRegistryMetric("cancelled_meetings");
    const b = getRegistryMetric("cancelled_meetings_count");
    record("13 registry resolve ID legado", Boolean(a && b && a.payloadPath === b.payloadPath), a ? a.payloadPath : "null");
  }

  {
    const kinds = Object.fromEntries([...VALID_KIND].map((k) => [k, 0]));
    for (const entry of listRegistryMetrics()) {
      kinds[entry.executionKind] = (kinds[entry.executionKind] || 0) + 1;
    }
    record("14 registry tem executionKind preenchido", Object.values(kinds).every((n) => n >= 0) && listRegistryMetrics().every((m) => VALID_KIND.has(m.executionKind)), JSON.stringify(kinds));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passaram.`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

run();
