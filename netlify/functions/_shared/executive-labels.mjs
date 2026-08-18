/**
 * Labels e texto executivo (Etapa 8.6).
 * Catálogo oficial primeiro; override só quando o label técnico/genérico não serve à liderança.
 * Não recalcula métricas.
 */

import { getMetricDef } from "./portal-metric-catalog.mjs";

export const EXECUTIVE_LABEL_OVERRIDES = Object.freeze({
  latest_month_acquisitions: "Novas aquisições",
  meetings_completed_by_month: "Reuniões realizadas",
  attendance_rate: "Taxa de comparecimento",
  no_show_rate: "Taxa de ausência",
  meeting_coverage_rate: "Cobertura de reuniões",
  clients_with_meeting: "Clientes com reunião",
  never_met: "Clientes ativos sem reunião",
  long_gap: "Contato há mais de 90 dias",
  active_clients: "Clientes ativos",
  median_stay_days: "Permanência típica",
  financial_coverage: "Cobertura financeira",
  cancelled_without_confirmed_date: "Cancelados sem data confirmada",
  days_since_latest_meeting: "Dias desde a última reunião",
  sc_active_clients: "Clientes ativos no recorte",
  sc_nps: "NPS",
  sc_top_association: "Principal associação",
  total_meeting_reschedules: "Remarcações",
  renewal_eligible: "Elegíveis à renovação",
  renewed_clients: "Clientes que renovaram",
  non_renewed_clients: "Clientes que não renovaram",
  renewal_rate: "Taxa de renovação",
  max_current_cycle: "Maior ciclo atual",
  total_renewals: "Quantidade de renovações",
  ep_meeting_coverage: "Mediana de cobertura de reuniões",
  ep_nps: "NPS dos respondentes ativos",
  ep_clients_without_meeting: "Clientes ativos sem reunião",
  ep_clients_by_advisor: "EPs com carteira ativa",
  ep_active_clients: "Clientes ativos analisados",
  temporal_meetings: "Reuniões",
  temporal_logins: "Acessos",
  temporal_financial_updates: "Atualizações financeiras",
  temporal_implementations: "Implementações",
  temporal_nps_responses: "Respostas de NPS",
  temporal_active_with_signals: "Clientes ativos com sinais",
  temporal_days_without_activity: "Dias sem atividade",
});

const FORBIDDEN_VISIBLE = [
  "latest_month_acquisitions",
  "meetings_completed_by_month",
  "vw_info_cliente",
  "public.clients",
  "data_inicio_ciclo",
  "data_assinatura_contrato",
  "created_at",
  "PostgREST",
  "payload",
];

const TECHNICAL_LEAK_RE = new RegExp([
  "\\b(?:latest_month_acquisitions|meetings_completed_by_month|attendance_source|computePayload|executive_snapshot)\\b",
  "\\bvw_[a-z0-9_]+\\b",
  "\\bpublic\\.[a-z_]+\\b",
  "\\b(?:data_inicio_ciclo|data_assinatura_contrato|created_at)\\b",
  "\\b(?:PostgREST|PGRST\\d+|SELECT\\b|payload\\b|endpoint\\b)\\b",
  "\\btimeout\\b",
  "\\bfallback\\b",
  "\\.mjs\\b",
  "\\bschema\\.table\\b",
].join("|"), "i");

const SNAKE_ID_RE = /\b[a-z]{2,}(?:_[a-z0-9]+){1,}\b/;
const SNAKE_ALLOW = new Set(["no-show"]);

export function presentMetricLabel(metricId, currentLabel = "") {
  const id = String(metricId || "");
  const current = String(currentLabel || "").trim();
  if (id === "sc_top_association" && current && !looksLikeTechnicalIdentifier(current)) {
    return current;
  }
  if (EXECUTIVE_LABEL_OVERRIDES[id]) return EXECUTIVE_LABEL_OVERRIDES[id];
  if (current && !looksLikeTechnicalIdentifier(current)) return current;
  return getExecutiveMetricLabel(id, current);
}

export function getExecutiveMetricLabel(metricId, fallback = "") {
  if (!metricId) return fallback || "";
  const id = String(metricId);
  if (EXECUTIVE_LABEL_OVERRIDES[id]) return EXECUTIVE_LABEL_OVERRIDES[id];
  const def = getMetricDef(id);
  if (def?.label && !looksLikeTechnicalIdentifier(def.label)) return def.label;
  if (fallback && !looksLikeTechnicalIdentifier(fallback)) return fallback;
  return "";
}

export function looksLikeTechnicalIdentifier(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (TECHNICAL_LEAK_RE.test(s)) return true;
  if (FORBIDDEN_VISIBLE.some((token) => s.includes(token))) return true;
  if (SNAKE_ID_RE.test(s) && !SNAKE_ALLOW.has(s)) return true;
  return false;
}

export function fmtExecutiveInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function fmtExecutivePct(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function fmtExecutiveNumber(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function formatExecutiveMetric(value, unit, metricId) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const u = String(unit || "").toLowerCase();
  if (u === "percent" || metricId?.includes("rate") || metricId?.includes("coverage")) {
    return fmtExecutivePct(n);
  }
  if (u === "association" || u === "auc" || u === "std_diff" || u === "index") {
    return fmtExecutiveNumber(n, 2);
  }
  if (u === "days" || u === "day") return `${fmtExecutiveInt(n)} dias`;
  if (u === "cycles" || u === "cycle") return `${fmtExecutiveInt(n)} ciclos`;
  if (u === "currency" || u === "brl" || u === "r$") {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  if (u === "clients" || u === "meetings") return fmtExecutiveInt(n);
  if (Math.abs(n) % 1) return fmtExecutiveNumber(n, 2);
  return fmtExecutiveInt(n);
}

export function isDebugLimitation(lim) {
  const code = String(lim?.code || "").toUpperCase();
  const category = String(lim?.category || "").toLowerCase();
  const message = String(lim?.message || lim?.description || "");
  if (category === "technical" || code === "TECHNICAL") return true;
  if (TECHNICAL_LEAK_RE.test(message)) return true;
  return false;
}

export function humanizeLimitation(lim) {
  const code = String(lim?.code || "").toUpperCase();
  const value = lim?.value ?? lim?.evidence?.value ?? null;
  const count = value != null ? fmtExecutiveInt(value) : null;
  if (code === "CANCELLED_WITHOUT_CONFIRMED_DATE") {
    return {
      title: "Cancelamentos sem confirmação",
      description: count
        ? `${count} clientes estão marcados como cancelados sem uma data de confirmação.`
        : "Há clientes marcados como cancelados sem uma data de confirmação.",
      metric: lim.metric || "cancelled_without_confirmed_date",
      category: "data_quality",
    };
  }
  if (code === "LOW_COVERAGE" || code === "MODERATE_COVERAGE") {
    const label = getExecutiveMetricLabel(lim.metric, "este indicador");
    const cov = value != null ? fmtExecutivePct(value) : null;
    return {
      title: "Cobertura limitada",
      description: cov
        ? `${label} cobre ${cov} da base e não deve ser generalizado para toda a carteira.`
        : `${label} tem cobertura insuficiente para decisões sobre toda a carteira.`,
      metric: lim.metric || null,
      category: "coverage",
    };
  }
  if (code === "SMALL_SAMPLE") {
    return {
      title: "Amostra pequena",
      description: "A amostra observada é pequena e a leitura deve ser tratada com cautela.",
      metric: lim.metric || null,
      category: "sample",
    };
  }
  if (code === "PARTIAL_SOURCE") {
    return {
      title: "Cobertura parcial de remarcações",
      description: "O registro de remarcações ainda não cobre todos os casos.",
      metric: lim.metric || null,
      category: "coverage",
    };
  }
  if (code === "NEEDS_BUSINESS_VALIDATION") {
    return {
      title: "Indicador em validação",
      description: "Este indicador ainda depende de validação de negócio antes de sustentar uma decisão ampla.",
      metric: lim.metric || null,
      category: "business_validation",
    };
  }
  if (code === "SCOPE_FALLBACK" || code === "ATTENDANCE_NOT_RESCOPED") {
    return {
      title: "Recorte limitado",
      description: "Parte desta leitura usa o recorte oficial da página, não apenas os clientes ativos.",
      metric: lim.metric || null,
      category: "coverage",
    };
  }
  if (code === "INVALID_CYCLE") {
    return {
      title: "Ciclo não informado",
      description: count
        ? `${count} clientes ficaram de fora da taxa porque o ciclo atual não está preenchido de forma válida.`
        : "Alguns clientes ficaram de fora da taxa porque o ciclo atual não está preenchido de forma válida.",
      metric: lim.metric || "renewal_eligible",
      category: "data_quality",
    };
  }
  if (code === "PERIOD_IN_PROGRESS") {
    return {
      title: "Período ainda em andamento",
      description: "O período mais recente ainda não fechou, então a variação pode mudar até o fim do mês.",
      metric: lim.metric || null,
      category: "coverage",
    };
  }
  if (code === "INSUFFICIENT_HISTORY") {
    return {
      title: "Histórico curto para tendência",
      description: "Ainda não há períodos suficientes para comparar a variação recente com segurança.",
      metric: lim.metric || null,
      category: "sample",
    };
  }
  if (code === "COVERAGE_SPREAD") {
    return {
      title: "Cobertura desigual entre carteiras",
      description: "A cobertura de reuniões varia entre carteiras. Comparar engenheiros diretamente pode distorcer a leitura.",
      metric: lim.metric || "ep_meeting_coverage",
      category: "coverage",
    };
  }
  if (code === "WITHOUT_ENGINEER") {
    return {
      title: "Clientes sem engenheiro vinculado",
      description: count
        ? `${count} clientes não têm engenheiro patrimonial vinculado e ficam fora da leitura por carteira.`
        : "Há clientes sem engenheiro patrimonial vinculado.",
      metric: lim.metric || null,
      category: "coverage",
    };
  }
  if (code === "LOGIN_SCOPE") {
    return {
      title: "Acessos em recorte diferente",
      description: "Os acessos da série oficial incluem usuários da plataforma; o recorte de clientes ativos não sustentou essa série.",
      metric: lim.metric || "temporal_logins",
      category: "coverage",
    };
  }
  if (code === "RENEWAL_RATE_UNAVAILABLE") {
    return {
      title: "Taxa de renovação incompleta",
      description: "A taxa oficial de renovação só pode ser lida com os clientes que têm ciclo válido.",
      metric: lim.metric || "renewal_rate",
      category: "coverage",
    };
  }
  if (isDebugLimitation(lim)) return null;
  const title = String(lim.title || "").replace(/_/g, " ").trim();
  const description = String(lim.message || lim.description || "").trim();
  if (looksLikeTechnicalIdentifier(title) || looksLikeTechnicalIdentifier(description)) return null;
  if (!title || !description) return null;
  return {
    title,
    description,
    metric: lim.metric || null,
    category: lim.category || "data_quality",
  };
}

export function humanizeCandidate(cand) {
  if (!cand) return null;
  const metric = cand.metric;
  const label = getExecutiveMetricLabel(metric, cand.title || "");
  const ev = cand.evidence || {};
  const current = ev.current ?? ev.value ?? null;
  const previous = ev.previous ?? null;
  const rel = ev.relative_change;
  const down = ev.direction === "down" || (rel != null && Number(rel) < 0);

  if (cand.reason === "relevant_unfavorable_change" || cand.reason === "relevant_favorable_change") {
    if (metric === "meetings_completed_by_month") {
      const absRel = rel != null ? fmtExecutivePct(Math.abs(Number(rel))) : null;
      return {
        ...cand,
        title: down ? "Queda recente no volume de reuniões" : "Aumento no volume de reuniões",
        message: previous != null && current != null
          ? `As reuniões realizadas passaram de ${fmtExecutiveInt(previous)} para ${fmtExecutiveInt(current)} no período mais recente${absRel ? `, uma ${down ? "redução" : "alta"} de ${absRel}` : ""}.`
          : `O volume de reuniões mudou no período mais recente.`,
      };
    }
    if (metric === "latest_month_acquisitions") {
      return {
        ...cand,
        title: down ? "Desaceleração nas novas aquisições" : "Novas aquisições aceleraram",
        message: previous != null && current != null
          ? `Foram registradas ${fmtExecutiveInt(current)} novas aquisições no período mais recente, contra ${fmtExecutiveInt(previous)} no período anterior.`
          : `As novas aquisições mudaram no período mais recente.`,
      };
    }
    if (label) {
      return {
        ...cand,
        title: down ? `Queda em ${label.toLowerCase()}` : `Aumento em ${label.toLowerCase()}`,
        message: previous != null && current != null
          ? `${label} passou de ${fmtExecutiveInt(previous)} para ${fmtExecutiveInt(current)} no período mais recente.`
          : `${label} mudou no período mais recente.`,
      };
    }
  }

  if (cand.reason === "non_renewed_volume") {
    const n = ev.value ?? current;
    return {
      ...cand,
      title: cand.title && !looksLikeTechnicalIdentifier(cand.title) ? cand.title : "Clientes que ainda não renovaram",
      message: cand.message && !looksLikeTechnicalIdentifier(cand.message)
        ? cand.message
        : (n != null ? `${fmtExecutiveInt(n)} clientes elegíveis ainda não renovaram.` : "Há clientes elegíveis que ainda não renovaram."),
    };
  }

  if (cand.reason === "renewed_volume") {
    return {
      ...cand,
      title: "Clientes que já renovaram",
      message: cand.message && !looksLikeTechnicalIdentifier(cand.message)
        ? cand.message
        : "Há clientes que já renovaram.",
    };
  }

  if (cand.reason === "implementation_progress") {
    return {
      ...cand,
      title: "Implementação observada na carteira",
      message: cand.message && !looksLikeTechnicalIdentifier(cand.message)
        ? cand.message
        : "Há mecanismos implementados na carteira observada.",
    };
  }

  if (cand.reason === "active_without_meeting") {
    const n = ev.value ?? current;
    const ep = metric === "ep_clients_without_meeting";
    return {
      ...cand,
      title: ep ? "Clientes ativos sem reunião" : "Clientes sem acompanhamento",
      message: n != null
        ? (ep
          ? `${fmtExecutiveInt(n)} clientes ativos ainda não têm reunião registrada.`
          : `${fmtExecutiveInt(n)} clientes ativos ainda não possuem reunião registrada.`)
        : (ep ? "Há clientes ativos sem reunião registrada." : "Há clientes ativos sem reunião registrada."),
    };
  }

  if (cand.reason === "no_recent_contact") {
    const n = ev.value ?? current;
    return {
      ...cand,
      title: "Contato desatualizado",
      message: n != null
        ? `${fmtExecutiveInt(n)} clientes ativos estão há mais de 90 dias sem reunião.`
        : "Há clientes ativos sem contato recente.",
    };
  }

  if (cand.reason === "multi_method_theme") {
    return {
      ...cand,
      title: cand.title && !looksLikeTechnicalIdentifier(cand.title) ? cand.title : "Padrão consistente em diferentes análises",
      message: cand.message && !looksLikeTechnicalIdentifier(cand.message)
        ? cand.message
        : "Essa variável aparece de forma consistente em diferentes análises.",
    };
  }

  if (cand.reason === "association" || cand.reason === "predictive_discrimination" || cand.reason === "group_difference" || cand.reason === "survival" || cand.reason === "cohort") {
    if (cand.title && cand.message && !looksLikeTechnicalIdentifier(cand.title) && !looksLikeTechnicalIdentifier(cand.message)) {
      return { ...cand, title: cand.title, message: cand.message };
    }
    const name = cand.title && !looksLikeTechnicalIdentifier(cand.title) ? cand.title : label;
    const kindText = {
      association: "é o padrão associativo que mais se destaca nesta leitura.",
      predictive_discrimination: "ajuda a distinguir os grupos observados nesta leitura.",
      group_difference: "apresenta a principal diferença entre grupos nesta leitura.",
      survival: "aparece no padrão de permanência observado.",
      cohort: "aparece no padrão de retenção por grupo de entrada.",
    }[cand.reason];
    return {
      ...cand,
      title: name || "Padrão observado",
      message: `${name || "Este padrão"} ${kindText}`,
    };
  }

  const title = cand.title && !looksLikeTechnicalIdentifier(cand.title) ? cand.title : (label || "Ponto de atenção");
  const message = cand.message && !looksLikeTechnicalIdentifier(cand.message)
    ? cand.message
    : title;
  return { ...cand, title, message };
}

export function evidenceForDisplay(candidate) {
  const ev = candidate?.evidence;
  if (!ev) return [];
  const rows = Array.isArray(ev) ? ev : [ev];
  return rows
    .filter((item) => item && (item.metric != null || item.value != null || item.current != null || item.label))
    .map((item) => {
      const metric = item.metric || candidate.metric;
      const preferred = item.label && !looksLikeTechnicalIdentifier(item.label)
        ? item.label
        : presentMetricLabel(metric, item.label || "");
      return {
        metric,
        label: preferred,
        value: item.value ?? item.current ?? null,
        unit: item.unit || null,
      };
    })
    .filter((item) => item.label)
    .slice(0, 3);
}

export function visibleExecutiveText(analysis) {
  const parts = [
    analysis?.headline,
    analysis?.executive_summary,
    analysis?.scope?.label,
  ];
  for (const h of analysis?.highlight_numbers || []) {
    parts.push(h.label, h.unit);
  }
  for (const card of [...(analysis?.ep_highlights || []), ...(analysis?.ep_attention || [])]) {
    parts.push(card?.ep_name, card?.summary);
  }
  for (const card of [
    ...(analysis?.attention_points || []),
    ...(analysis?.positive_signals || []),
    ...(analysis?.recommended_actions || []),
    ...(analysis?.limitations || []),
    ...(analysis?.executive_limitations || []),
  ]) {
    parts.push(card?.title, card?.description);
    for (const ev of card?.evidence || []) parts.push(ev?.label);
  }
  return parts.filter(Boolean).join("\n");
}

export function visibleAnalysisHasTechnicalLeak(analysis) {
  const text = visibleExecutiveText(analysis);
  if (!text) return { hit: false, snippet: null };
  for (const token of FORBIDDEN_VISIBLE) {
    if (text.includes(token)) return { hit: true, snippet: token };
  }
  const leak = text.match(TECHNICAL_LEAK_RE);
  if (leak) return { hit: true, snippet: leak[0] };
  const snake = text.match(SNAKE_ID_RE);
  if (snake && !["pt-br"].includes(snake[0])) {
    return { hit: true, snippet: snake[0] };
  }
  return { hit: false, snippet: null };
}

export { FORBIDDEN_VISIBLE };
