/**
 * Executor determinístico: lê o payload do dashboard via portalMetricRegistry.
 * Proibido recalcular média/mediana/percentual em paralelo.
 */
import {
  getMetricDef,
  buildMetricDefinitionText,
  buildMetricLocationText,
} from "./portal-metric-catalog.mjs";
import {
  getRegistryMetric,
  resolveMetricFromDashboard,
} from "./portal-metric-registry.mjs";

function nowIso() {
  return new Date().toISOString();
}

function formatUnit(unit, value) {
  if (value == null) return null;
  if (unit === "days") return `${value} dias`;
  if (unit === "percent") return `${value}%`;
  if (unit === "clients") return `${value} clientes`;
  if (unit === "mechanisms") return `${value} mecanismos`;
  return String(value);
}

/**
 * executeMetricQuery(queryPlan)
 * definition/formula/location → texto; value/average/median/comparison → registry.
 */
export async function executeMetricQuery(queryPlan, options = {}) {
  const metricId = queryPlan.metric;
  const intent = queryPlan.intent || "value";
  const registryEntry = getRegistryMetric(metricId);
  const catalogDef = getMetricDef(metricId);
  const filters = queryPlan.filters || {};

  const base = {
    success: true,
    metric: metricId,
    domain: queryPlan.domain || registryEntry?.domain || catalogDef?.domain || null,
    intent,
    aggregation: queryPlan.aggregation || registryEntry?.aggregation || catalogDef?.aggregation || null,
    value: null,
    value_detail: null,
    average: null,
    median: null,
    sample_size: null,
    unit: registryEntry?.unit || catalogDef?.unit || null,
    label: registryEntry?.label || catalogDef?.label || null,
    filters,
    filter_labels: [],
    sources: catalogDef?.sources || [],
    warnings: [],
    definition_text: null,
    location_text: null,
    realtime_database: false,
    generated_at: nowIso(),
  };

  if (!metricId) {
    base.warnings.push("Métrica ausente.");
    return base;
  }

  if (intent === "definition" || intent === "formula") {
    base.definition_text =
      registryEntry?.definition
      || buildMetricDefinitionText(metricId)
      || "Não há definição cadastrada para este indicador.";
    if (registryEntry?.inclusionRules?.length) {
      base.definition_text += ` Entram: ${registryEntry.inclusionRules.join("; ")}.`;
    }
    if (registryEntry?.exclusionRules?.length) {
      base.definition_text += ` Não entram: ${registryEntry.exclusionRules.join("; ")}.`;
    }
    base.use_metric_definition = true;
    base.realtime_database = false;
    return base;
  }

  if (intent === "location") {
    base.location_text = buildMetricLocationText(metricId)
      || (catalogDef?.sources?.length
        ? `Os dados vêm de ${catalogDef.sources.map((s) => `${s.schema}.${s.table}.${s.column}`).join("; ")}.`
        : null);
    base.definition_text = base.location_text;
    base.realtime_database = false;
    return base;
  }

  if (!registryEntry) {
    base.success = false;
    base.warnings.push("Indicador não mapeado no registry do dashboard.");
    base.definition_text =
      "Ainda não tenho esse indicador mapeado com segurança. Pode especificar qual card ou página você está consultando?";
    return base;
  }

  const aggregation =
    intent === "average" ? "average"
      : intent === "median" ? "median"
        : intent === "comparison" ? "comparison"
          : (queryPlan.aggregation || registryEntry.aggregation);

  try {
    const resolved = await resolveMetricFromDashboard(
      registryEntry.domain,
      metricId,
      filters,
      { aggregation, payload: options.payload },
    );

    if (!resolved.success) {
      base.success = false;
      base.warnings.push(resolved.message || resolved.answerHint || resolved.error);
      base.definition_text = resolved.answerHint || null;
      return base;
    }

    base.domain = resolved.domain;
    base.label = resolved.label;
    base.aggregation = resolved.aggregation;
    base.value = resolved.value;
    base.average = resolved.average;
    base.median = resolved.median;
    base.value_detail = resolved.value_detail;
    base.sample_size = resolved.sample_size;
    base.unit = resolved.unit;
    base.definition_text = resolved.definition;
    base.realtime_database = true;
    base.payload_path = resolved.payload_path;
    return base;
  } catch (err) {
    console.error("[executeMetricQuery]", metricId, err?.message || err);
    base.warnings.push("Não foi possível carregar o payload do dashboard.");
    return base;
  }
}

/** Monta texto de resposta local quando o n8n falha (fallback). */
export function verbalizeMetricResult(queryPlan, result) {
  const intent = queryPlan.intent || result.intent;
  const unit = result.unit;

  if (intent === "clarification" && queryPlan.clarification) return queryPlan.clarification;
  if (intent === "definition" || intent === "formula") {
    return result.definition_text || "Não há definição cadastrada para este indicador.";
  }
  if (intent === "location") {
    return result.location_text || result.definition_text || "Fonte não documentada para este indicador.";
  }
  if (!result.success && result.definition_text) return result.definition_text;
  if (!result.success && result.warnings?.length) {
    return result.warnings.join(" ");
  }
  if (result.value == null) {
    return "Não foi possível obter esse indicador no payload do dashboard.";
  }

  const fmt = (n) => {
    if (n == null) return "—";
    if (typeof n !== "number") return String(n);
    if (Number.isInteger(n)) return n.toLocaleString("pt-BR");
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };

  const withUnit = (n) => {
    if (unit === "days") return `${fmt(n)} dias`;
    if (unit === "percent") return `${fmt(n)}%`;
    if (unit === "clients") return `${fmt(n)} clientes`;
    if (unit === "mechanisms") return `${fmt(n)} mecanismos`;
    if (unit === "currency") {
      return `R$ ${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
    }
    return fmt(n);
  };

  if (intent === "comparison" || result.aggregation === "comparison") {
    const med = result.value?.median ?? result.median;
    const avg = result.value?.average ?? result.average;
    return `A mediana é de ${withUnit(med)} e a média é de ${withUnit(avg)}.`;
  }
  if (intent === "median" || result.aggregation === "median") {
    const v = typeof result.value === "object" ? result.value.median : result.value;
    if (unit === "currency") {
      const labelTxt = String(result.label || "mediana");
      const article = /^(renda|reserva)/i.test(labelTxt) ? "A" : "O";
      return `${article} ${labelTxt.toLowerCase()} é de ${withUnit(v)}.`;
    }
    if (/\btipic/.test(String(queryPlan._questionNorm || "")) || /típico|tipico/i.test(result.label || "")) {
      return `O tempo típico é de ${withUnit(v)}.`;
    }
    return `A mediana é de ${withUnit(v)}.`;
  }
  if (intent === "average" || result.aggregation === "average") {
    const v = typeof result.value === "object" ? result.value.average : result.value;
    return `A média é de ${withUnit(v)}.`;
  }

  const label = result.label || "indicador";
  if (unit === "clients") {
    const name = result.metric === "total_clients" || /^total de clientes$/i.test(label)
      ? "clientes"
      : String(label).toLowerCase();
    return `Temos ${fmt(result.value)} ${name}.`;
  }
  if (unit === "currency") {
    const labelTxt = String(result.label || "valor");
    const article = /^(renda|reserva)/i.test(labelTxt) ? "A" : "O";
    return `${article} ${labelTxt.toLowerCase()} é de ${withUnit(result.value)}.`;
  }
  return `${label}: ${withUnit(result.value)}.`;
}

export { formatUnit };
