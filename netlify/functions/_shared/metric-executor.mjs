/**
 * Executor determinístico: lê o payload do dashboard via portalMetricRegistry.
 * Proibido recalcular média/mediana/percentual em paralelo.
 */
import {
  getMetricDef,
  buildMetricDefinitionText,
  buildMetricLocationText,
  resolveCanonicalMetricId,
  VALUE_UNAVAILABLE_ASSISTANT_MESSAGE,
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
const NBV_NO_OFFICIAL_EXECUTOR = new Set(["satisfaction_nps_index", "sc_lift"]);

export async function executeMetricQuery(queryPlan, options = {}) {
  const metricId = resolveCanonicalMetricId(queryPlan.metric);
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

  if (queryPlan.metric && !catalogDef) {
    base.success = false;
    base.warnings.push("Métrica desconhecida; execução arbitrária não é permitida.");
    return base;
  }

  if (NBV_NO_OFFICIAL_EXECUTOR.has(metricId) && ["value", "average", "median", "comparison"].includes(intent)) {
    base.success = false;
    base.warnings.push("Indicador exige validação de negócio e não possui executor oficial.");
    base.definition_text = buildMetricDefinitionText(metricId);
    base.location_text = buildMetricLocationText(metricId);
    return base;
  }

  if (catalogDef?.status === "needs_business_validation") {
    base.warnings.push("Regra ainda não unificada; o valor segue a implementação atual, sem promover uma verdade oficial única.");
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
    if (catalogDef?.status === "needs_business_validation") {
      base.definition_text += " Há regra em validação; não tratar este texto como verdade oficial única entre telas.";
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

  const kind = catalogDef?.executionKind;
  if (kind === "pending" || kind === "knowledge_only") {
    base.success = false;
    base.definition_text = [
      buildMetricDefinitionText(metricId),
      VALUE_UNAVAILABLE_ASSISTANT_MESSAGE,
    ].filter(Boolean).join(" ");
    base.location_text = buildMetricLocationText(metricId);
    base.warnings.push(`Métrica ${metricId} sem executor de valor (${kind}).`);
    return base;
  }

  if (!registryEntry) {
    base.success = false;
    base.warnings.push("Indicador não mapeado no registry do dashboard.");
    base.definition_text = [
      buildMetricDefinitionText(metricId),
      VALUE_UNAVAILABLE_ASSISTANT_MESSAGE,
    ].filter(Boolean).join(" ");
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
    base.definition_text = catalogDef?.description || resolved.definition;
    base.sources = catalogDef?.sources || resolved.sources || [];
    base.realtime_database = resolved.value != null;
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
  if (result.metric === "most_used_mechanism") {
    const v = result.value;
    if (v && typeof v === "object" && v.name) {
      const n = Number(v.clientCount ?? v.count ?? 0);
      return `O mecanismo mais utilizado é ${v.name}, presente em ${fmt(n)} clientes.`;
    }
    if (typeof v === "string" && v.trim()) {
      return `O mecanismo mais utilizado é ${v}.`;
    }
    return "Não há mecanismo calculável no recorte atual.";
  }
  if (result.metric === "top_meeting_types") {
    return `${label}: ${typeof result.value === "string" ? result.value : withUnit(result.value)}. Fonte exclusiva: Business Data · Agendamentos.calendly_eventos (não altera os demais indicadores de reuniões).`;
  }
  if (result.metric === "combined_people_with_mechanisms") {
    const detail = result.value_detail || {};
    return `Há ${fmt(result.value)} registros de clientes com mecanismos nas duas fontes (BASE QV ${fmt(detail.baseQvClientsWithMechanisms)} + App Pharus ${fmt(detail.appPharusUsersWithMechanisms)}). O total é soma bruta; pode haver pessoas presentes em ambas.`;
  }
  if (result.domain === "pharus_mechanisms") {
    const raw = typeof result.value === "object" ? JSON.stringify(result.value) : withUnit(result.value);
    return `No App Pharus, ${String(label).toLowerCase()}: ${raw}. Vínculos suggested contam como mecanismos associados ao usuário nesta análise.`;
  }
  if (result.metric === "attendance_rate" || result.metric === "no_show_rate") {
    return `${label}: ${withUnit(result.value)}. Considera apenas reuniões já ocorridas e não canceladas (elegíveis = total − futuras − canceladas).`;
  }
  if (result.metric === "total_meeting_reschedules" || result.metric === "rescheduled_meetings") {
    return `${label}: ${withUnit(result.value)}. Cobertura parcial: considera apenas remarcações registradas de forma estruturada e pode não representar o total real.`;
  }
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

const APPROX_RE = /\b(aproximadamente|cerca de|quase|em torno de|por volta de|mais ou menos)\b/i;

export function officialNumberVariants(value) {
  if (value == null || typeof value !== "number" || Number.isNaN(value)) return [];
  return [...new Set([
    String(value),
    String(Math.round(value * 100) / 100),
    value.toLocaleString("pt-BR"),
    value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    value.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  ])];
}

export function geminiAlteredOfficialNumber(answer, result) {
  const text = String(answer || "");
  if (!text.trim()) return true;
  if (APPROX_RE.test(text)) return true;
  const values = [];
  if (typeof result?.value === "number") values.push(result.value);
  if (typeof result?.average === "number") values.push(result.average);
  if (typeof result?.median === "number") values.push(result.median);
  if (typeof result?.value?.median === "number") values.push(result.value.median);
  if (typeof result?.value?.average === "number") values.push(result.value.average);
  if (!values.length) return false;
  return values.some((v) => !officialNumberVariants(v).some((variant) => text.includes(variant)));
}

export function sanitizeVerbalizedAnswer(answer, result, fallback) {
  const text = String(answer || "").trim();
  if (!text) return fallback;
  if (geminiAlteredOfficialNumber(text, result)) return fallback;
  return text;
}

export { formatUnit };
