/**
 * Executive Composer (Etapa 8.5)
 *
 * Gera executive_analysis determinística a partir de page profile + snapshot +
 * candidates. Sem Gemini. Sem recálculo de KPIs. Sem PII.
 */

import { extractCandidatesFromSnapshot, CANDIDATE_HEURISTICS } from "./executive-candidates.mjs";
import { getExecutivePageProfile } from "./executive-page-profiles.mjs";
import { textHasForbiddenCausality } from "./executive-ai.mjs";
import {
  evidenceForDisplay,
  presentMetricLabel,
  humanizeCandidate,
  humanizeLimitation,
  isDebugLimitation,
} from "./executive-labels.mjs";

export const COMPOSER_VERSION = "8.9";

const ACTION_LIBRARY = Object.freeze({
  active_without_meeting: {
    title: "Investigar ativos sem reunião",
    description: "Investigar a distribuição dos clientes ativos sem reunião entre as carteiras e identificar onde a ausência de acompanhamento está mais concentrada.",
  },
  no_recent_contact: {
    title: "Avaliar cadência de contato",
    description: "Investigar quais carteiras concentram clientes ativos sem contato recente e avaliar se a cadência atual precisa ser ajustada.",
  },
  relevant_unfavorable_change: {
    title: "Investigar variação recente",
    description: "Investigar a origem da variação recente deste indicador e verificar se está concentrada em períodos ou carteiras específicas.",
  },
  meetings_completed_by_month: {
    title: "Investigar queda no volume de reuniões",
    description: "Investigar a origem da redução recente no volume de reuniões e verificar se está concentrada em períodos ou carteiras específicas.",
  },
  LOW_COVERAGE: {
    title: "Ampliar a cobertura do indicador",
    description: "Priorizar a melhoria da cobertura deste indicador antes de usá-lo para decisões sobre toda a carteira.",
  },
  SMALL_SAMPLE: {
    title: "Tratar a amostra com cautela",
    description: "Avaliar se a amostra pode ser ampliada antes de generalizar esta leitura.",
  },
  CANCELLED_WITHOUT_CONFIRMED_DATE: {
    title: "Qualificar registros de cancelamento",
    description: "Revisar os clientes marcados como cancelados sem uma confirmação de data e priorizar a regularização dessas informações.",
  },
  association: {
    title: "Investigar o padrão associado",
    description: "Investigar o padrão que mais se destaca nesta leitura e conferir se ele se concentra em carteiras ou grupos específicos.",
  },
  multi_method_theme: {
    title: "Investigar o padrão que se destaca em várias análises",
    description: "Investigar como esse fator se distribui na carteira, sem tratar o conjunto de métodos como prova de causa.",
  },
  predictive_discrimination: {
    title: "Investigar a distinção entre grupos",
    description: "Investigar a variável que melhor distingue os grupos observados, sem tratar o resultado como certeza de cancelamento.",
  },
  group_difference: {
    title: "Investigar a diferença entre grupos",
    description: "Investigar a principal diferença observada entre grupos nesta leitura.",
  },
  survival: {
    title: "Investigar o padrão de permanência",
    description: "Investigar o padrão de permanência observado nesta leitura.",
  },
  cohort: {
    title: "Investigar a retenção por grupo de entrada",
    description: "Investigar o padrão de retenção dos grupos de entrada, sem generalizar além do que a amostra permite.",
  },
  non_renewed_volume: {
    title: "Investigar quem ainda não renovou",
    description: "Entender o perfil dos clientes elegíveis que ainda não renovaram, sem transformar o ciclo em comparação entre carteiras.",
  },
  COVERAGE_SPREAD: {
    title: "Comparar carteiras com cautela",
    description: "Evitar comparar engenheiros diretamente quando a cobertura e o tamanho das carteiras forem muito diferentes.",
  },
  WITHOUT_ENGINEER: {
    title: "Completar o vínculo da carteira",
    description: "Regularizar os clientes sem engenheiro patrimonial vinculado para a leitura de carteira ficar mais completa.",
  },
  PERIOD_IN_PROGRESS: {
    title: "Acompanhar o fechamento do período",
    description: "Revisitar a tendência depois que o período mais recente fechar, para confirmar se a variação se sustenta.",
  },
});

function fmtInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function fmtNum(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function clip(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function relevantChange(cmp) {
  const rel = cmp?.relative_change;
  if (rel == null || !Number.isFinite(Number(rel))) return false;
  return Math.abs(Number(rel)) >= (CANDIDATE_HEURISTICS.relativeChangeAbsMin || 10);
}

function cardsFromCandidates(list, max, kind) {
  return (list || []).slice(0, max).map((raw) => {
    const cand = humanizeCandidate(raw) || raw;
    const evidence = evidenceForDisplay(cand);
    if (kind === "attention") {
      return {
        severity: "attention",
        title: clip(cand.title || "Ponto de atenção", 120),
        description: clip(cand.message || cand.title || "", 500),
        evidence,
      };
    }
    if (kind === "positive") {
      return {
        title: clip(cand.title || "Sinal positivo", 120),
        description: clip(cand.message || cand.title || "", 500),
        evidence,
      };
    }
    return {
      title: clip(cand.title || "Limitação", 120),
      description: clip(cand.message || cand.title || "", 500),
      metric: cand.metric || null,
      category: cand.category || null,
    };
  });
}

function splitLimitations(candidates, max = 4) {
  const executive = [];
  const debug = [];
  for (const cand of candidates.limitation_candidates || []) {
    if (isDebugLimitation(cand)) {
      debug.push({
        code: cand.code || null,
        metric: cand.metric || null,
        category: cand.category || "technical",
        message: cand.message || cand.title || null,
      });
      continue;
    }
    const human = humanizeLimitation(cand);
    if (!human) continue;
    executive.push(human);
    if (executive.length >= max) break;
  }
  return { executive, debug };
}

function actionForCandidate(cand) {
  if (!cand) return null;
  if (cand.category === "technical" || cand.code === "TECHNICAL") return null;
  if (cand.metric === "meetings_completed_by_month" && cand.reason === "relevant_unfavorable_change") {
    return { ...ACTION_LIBRARY.meetings_completed_by_month, based_on: [cand.metric] };
  }
  const byReason = ACTION_LIBRARY[cand.reason];
  const byCode = ACTION_LIBRARY[cand.code];
  const byKind = ACTION_LIBRARY[cand.category];
  const picked = byReason || byCode || byKind || ACTION_LIBRARY.relevant_unfavorable_change;
  if (!picked) return null;
  const basedOn = cand.metric ? [cand.metric] : (cand.code ? [cand.code] : []);
  if (!basedOn.length) return null;
  return {
    title: picked.title,
    description: picked.description,
    based_on: basedOn,
  };
}

function selectActions(candidates, max = 3) {
  const pool = [
    ...(candidates.attention_candidates || []),
    ...(candidates.limitation_candidates || []).filter((c) => c.category !== "technical" && c.code !== "TECHNICAL"),
  ];
  const out = [];
  const seen = new Set();
  for (const cand of pool) {
    if (out.length >= max) break;
    const action = actionForCandidate(cand);
    if (!action) continue;
    const key = `${action.title}|${action.based_on.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

function joinSentences(parts, max = 4) {
  return parts.filter(Boolean).slice(0, max).join(" ");
}

function composeGeneral(snapshot, candidates, profile) {
  const h = snapshot.highlights || {};
  const growth = snapshot.growth || {};
  const active = h.active_clients;
  const stay = h.median_tenure_days;
  const coverage = h.financial_coverage;
  const cmp = (snapshot.comparisons || []).find((c) => c.metric === "latest_month_acquisitions");
  const hasTrend = relevantChange(cmp) || relevantChange({ relative_change: growth.relative_change });
  const rel = cmp?.relative_change ?? growth.relative_change;
  const up = Number(rel) > 0;

  let headline;
  if (active != null && hasTrend) {
    headline = up
      ? `A carteira reúne ${fmtInt(active)} clientes ativos, com aceleração recente nas novas aquisições.`
      : `A carteira reúne ${fmtInt(active)} clientes ativos, com desaceleração recente nas novas aquisições.`;
  } else if (active != null && stay != null) {
    headline = `A carteira atual reúne ${fmtInt(active)} clientes ativos, com permanência típica de ${fmtInt(stay)} dias.`;
  } else if (active != null) {
    headline = `A carteira atual reúne ${fmtInt(active)} clientes ativos.`;
  } else {
    headline = profile?.executiveObjective || "Leitura executiva da carteira.";
  }

  const sentences = [];
  if (hasTrend && cmp?.previous != null && cmp?.current != null) {
    sentences.push(`As aquisições passaram de ${fmtInt(cmp.previous)} para ${fmtInt(cmp.current)} no período mais recente.`);
  }
  if (coverage != null) {
    sentences.push(`A cobertura financeira alcança ${fmtPct(coverage)}.`);
  }
  if (stay != null && hasTrend) {
    sentences.push(`A permanência típica no recorte ativo é de ${fmtInt(stay)} dias.`);
  }
  const qualityLim = (candidates.limitation_candidates || []).find((c) => c.code === "CANCELLED_WITHOUT_CONFIRMED_DATE");
  if (qualityLim) {
    sentences.push("Há limitações de qualidade nos registros de cancelamento.");
  }
  if (!sentences.length && stay != null) {
    sentences.push(`A permanência típica no recorte é de ${fmtInt(stay)} dias.`);
  }

  return { headline, executive_summary: joinSentences(sentences) };
}

function composeMeetings(snapshot, candidates, profile) {
  const h = snapshot.highlights || {};
  const cov = h.meeting_coverage_rate;
  const neverMet = h.never_met;
  const attendance = h.attendance_rate;
  const noShow = h.no_show_rate;
  const longGap = h.long_gap;
  const cmp = (snapshot.comparisons || []).find((c) => c.metric === "meetings_completed_by_month");

  let headline;
  if (cov != null && Number(neverMet) > 0) {
    headline = `${fmtPct(cov)} dos clientes ativos possuem reunião registrada; ${fmtInt(neverMet)} ainda não tiveram acompanhamento.`;
  } else if (cov != null && attendance != null) {
    headline = `${fmtPct(cov)} dos clientes ativos possuem reunião registrada, com comparecimento de ${fmtPct(attendance)}.`;
  } else if (cov != null) {
    headline = `${fmtPct(cov)} dos clientes ativos possuem reunião registrada.`;
  } else {
    headline = profile?.executiveObjective || "Leitura executiva de reuniões.";
  }

  const sentences = [];
  if (attendance != null && noShow != null) {
    sentences.push(`O comparecimento está em ${fmtPct(attendance)} e a ausência em ${fmtPct(noShow)}.`);
  }
  if (relevantChange(cmp) && cmp.previous != null && cmp.current != null) {
    const down = Number(cmp.relative_change) < 0;
    const absRel = fmtPct(Math.abs(Number(cmp.relative_change)));
    sentences.push(`As reuniões realizadas passaram de ${fmtInt(cmp.previous)} para ${fmtInt(cmp.current)} no período mais recente${absRel ? `, uma ${down ? "redução" : "alta"} de ${absRel}` : ""}.`);
  }
  if (Number(longGap) > 0) {
    sentences.push(`${fmtInt(longGap)} clientes ativos estão há mais de 90 dias sem reunião.`);
  }
  const partial = (candidates.limitation_candidates || []).find((c) => c.code === "PARTIAL_SOURCE");
  if (partial) {
    sentences.push("O registro de remarcações ainda não cobre todos os casos.");
  }

  return { headline, executive_summary: joinSentences(sentences) };
}

function composeStatistical(snapshot, candidates, profile) {
  const h = snapshot.highlights || {};
  const grouped = (candidates.attention_candidates || []).find((c) => c.reason === "multi_method_theme");
  const top = h.top_association || (snapshot.discoveries || []).find((d) => d.kind === "association");
  const nps = h.nps || {};

  let headline;
  if (grouped?.title) {
    headline = grouped.title.replace(/se destaca em diferentes análises$/i, "aparece de forma consistente em diferentes análises.");
  } else if (top?.label) {
    headline = `${top.label} apresenta a associação mais relevante com cancelamento nesta leitura.`;
  } else {
    headline = profile?.executiveObjective || "Principais padrões observados nesta leitura.";
  }

  const sentences = [];
  if (grouped?.message) {
    sentences.push(grouped.message);
  } else if (top && (top.abs != null || top.value != null)) {
    sentences.push(`A associação observada é ${fmtNum(top.abs ?? top.value, 2)}.`);
  }
  const second = (candidates.attention_candidates || []).find((c) => c.reason === "association" && c.id !== grouped?.id);
  if (second?.title) {
    sentences.push(second.message || second.title);
  }
  const survivalCand = (candidates.attention_candidates || []).find((c) => c.reason === "survival");
  if (survivalCand?.message && sentences.length < 4) {
    sentences.push(survivalCand.message);
  }
  if (nps.coverage != null && Number(nps.coverage) < 20) {
    const idx = nps.index != null ? `O NPS de ${fmtNum(nps.index, 1)} ` : "O NPS ";
    sentences.push(`${idx}vale para quem respondeu (cobertura de ${fmtPct(nps.coverage)}), não para toda a carteira.`);
  }

  return { headline, executive_summary: joinSentences(sentences) };
}

function composeRenewal(snapshot, candidates, profile) {
  const h = snapshot.highlights || {};
  const eligible = h.eligible;
  const renewed = h.renewed;
  const notRenewed = h.not_renewed;
  const rate = h.renewal_rate;
  const maxCycle = h.max_current_cycle;
  const cycle1Share = h.cycle_1_share;

  let headline;
  if (eligible != null && renewed != null && rate != null) {
    headline = `Dos ${fmtInt(eligible)} clientes elegíveis, ${fmtInt(renewed)} renovaram (${fmtPct(rate)}).`;
  } else if (renewed != null) {
    headline = `${fmtInt(renewed)} clientes já renovaram nesta leitura.`;
  } else {
    headline = profile?.executiveObjective || "Leitura executiva de renovação.";
  }

  const sentences = [];
  if (notRenewed != null) {
    sentences.push(`${fmtInt(notRenewed)} clientes elegíveis ainda não renovaram.`);
  }
  if (cycle1Share != null && Number(cycle1Share) >= 50) {
    sentences.push(`A maior parte dos elegíveis ainda está no primeiro ciclo (${fmtPct(cycle1Share)}).`);
  }
  if (maxCycle != null && Number(maxCycle) > 1) {
    sentences.push(`O maior ciclo atual observado é ${fmtInt(maxCycle)}.`);
  }

  return { headline, executive_summary: joinSentences(sentences) };
}

function composeEp(snapshot, candidates, profile) {
  const h = snapshot.highlights || {};
  const dist = h.coverage_spread || {};
  const coverage = dist.median ?? h.median_meeting_coverage ?? h.meeting_coverage;
  const advisors = h.advisors;
  const total = h.active_clients ?? h.total_clients;
  const withoutMeeting = h.clients_without_meeting;
  const nps = h.nps;
  const npsCoverage = h.nps_coverage;
  const top = (snapshot.ep_highlights || [])[0];
  const watch = (snapshot.ep_attention || [])[0];
  const spread = dist.spread;

  let headline;
  if (top?.ep_name && watch?.ep_name && spread != null && Number(spread) >= 15) {
    headline = `As carteiras ativas apresentam diferenças relevantes de cobertura, com destaque para ${top.ep_name} e atenção em ${watch.ep_name}.`;
  } else if (spread != null && total != null && advisors != null) {
    headline = `Há diferença de ${fmtNum(spread, 1)} p.p. entre as carteiras com maior e menor cobertura de reuniões entre clientes ativos.`;
  } else if (total != null && advisors != null && coverage != null) {
    headline = `Os ${fmtInt(advisors)} EPs acompanham ${fmtInt(total)} clientes ativos, com mediana de cobertura de reuniões de ${fmtPct(coverage)}.`;
  } else if (coverage != null) {
    headline = `A mediana de cobertura de reuniões na carteira ativa é de ${fmtPct(coverage)}.`;
  } else {
    headline = profile?.executiveObjective || "Leitura executiva da performance da carteira ativa.";
  }

  const sentences = [];
  if (total != null && advisors != null && coverage != null) {
    const gap = withoutMeeting != null && Number(withoutMeeting) > 0
      ? `; ${fmtInt(withoutMeeting)} ativos ainda sem reunião`
      : "";
    const spreadBit = spread != null
      ? ` A maior diferença de cobertura entre carteiras comparáveis é de ${fmtNum(spread, 1)} p.p.`
      : (dist.p25 != null && dist.p75 != null
        ? ` Metade dos EPs elegíveis está entre ${fmtPct(dist.p25)} e ${fmtPct(dist.p75)}.`
        : "");
    sentences.push(`A leitura considera ${fmtInt(total)} clientes ativos em ${fmtInt(advisors)} engenheiros, com mediana de cobertura de ${fmtPct(coverage)}${gap}.${spreadBit}`);
  } else if (dist.p25 != null && dist.p75 != null) {
    sentences.push(`Metade dos EPs elegíveis possui cobertura de reuniões entre ${fmtPct(dist.p25)} e ${fmtPct(dist.p75)}.`);
  }
  if (top?.ep_name) {
    const cov = (top.metrics || []).find((m) => /cobertura de reuniões/i.test(m.label));
    sentences.push(cov
      ? `${top.ep_name} aparece entre os destaques, com cobertura de reuniões de ${fmtPct(cov.value)}.`
      : `${top.ep_name} aparece entre os destaques de acompanhamento da carteira ativa.`);
  }
  if (watch?.ep_name) {
    const cov = (watch.metrics || []).find((m) => /cobertura de reuniões/i.test(m.label));
    sentences.push(cov
      ? `${watch.ep_name} pede atenção, com uma das menores coberturas observadas (${fmtPct(cov.value)}).`
      : `${watch.ep_name} pede atenção na cobertura de acompanhamento da carteira ativa.`);
  }
  if (h.nps_sample_limited || (nps != null && npsCoverage != null && Number(npsCoverage) < 20)) {
    const idx = nps != null ? `O NPS de ${fmtNum(nps, 1)} ` : "O NPS ";
    sentences.push(`${idx}vale para quem respondeu${npsCoverage != null ? ` (cobertura de ${fmtPct(npsCoverage)})` : ""} e não descreve toda a carteira ativa.`);
  }

  return { headline, executive_summary: joinSentences(sentences, 4) };
}

function composeTemporal(snapshot, candidates, profile) {
  const comparisons = snapshot.comparisons || [];
  const ranked = [...comparisons]
    .filter((c) => relevantChange(c))
    .sort((a, b) => Math.abs(Number(b.relative_change)) - Math.abs(Number(a.relative_change)));
  const top = ranked[0];
  const h = snapshot.highlights || {};

  const phraseFor = (cmp) => {
    const label = presentMetricLabel(cmp.metric, "") || "este indicador";
    const absRel = fmtPct(Math.abs(Number(cmp.relative_change)));
    const down = Number(cmp.relative_change) < 0;
    return `${label.toLowerCase()} ${down ? "recuaram" : "avançaram"} ${absRel}`;
  };

  let headline;
  if (ranked.length >= 2) {
    headline = `No período mais recente, ${phraseFor(ranked[0])} e ${phraseFor(ranked[1])}.`;
  } else if (top) {
    headline = `No período mais recente, ${phraseFor(top)}.`;
  } else if (h.last_meetings != null) {
    headline = `O período mais recente registrou ${fmtInt(h.last_meetings)} reuniões.`;
  } else {
    headline = profile?.executiveObjective || "Leitura executiva das mudanças recentes.";
  }

  const sentences = [];
  for (const cmp of ranked.slice(0, 3)) {
    if (cmp.previous != null && cmp.current != null) {
      const label = presentMetricLabel(cmp.metric, "O indicador");
      sentences.push(`${label} passaram de ${fmtInt(cmp.previous)} para ${fmtInt(cmp.current)}.`);
    }
  }
  if (h.active_with_signals != null && sentences.length < 3) {
    sentences.push(`${fmtInt(h.active_with_signals)} clientes ativos apresentam sinais no recorte recente.`);
  }

  return { headline, executive_summary: joinSentences(sentences) };
}

const PAGE_STRATEGIES = {
  general: composeGeneral,
  meetings: composeMeetings,
  "statistical-crosses": composeStatistical,
  renewal: composeRenewal,
  ep: composeEp,
  temporal: composeTemporal,
};

/**
 * @param {object} snapshot
 * @param {object} [candidates]
 * @returns {{ executive_analysis: object, metadata: object }}
 */
export function composeDeterministicAnalysis(snapshot, candidates) {
  const started = Date.now();
  const page = snapshot?.page || "general";
  const profile = getExecutivePageProfile(page);
  const cands = candidates || extractCandidatesFromSnapshot(snapshot);
  const maxAttention = profile?.maxAttention || cands.max_attention || 3;
  const maxPositives = profile?.maxPositives || 2;
  const maxActions = profile?.maxActions || 3;
  const maxLimitations = profile?.maxLimitations || 4;

  const strategy = PAGE_STRATEGIES[page] || composeGeneral;
  const copy = strategy(snapshot, cands, profile);

  const { executive: executiveLimitations, debug: debugLimitations } = splitLimitations(cands, maxLimitations);
  const highlight_numbers = (Array.isArray(snapshot?.highlight_numbers) ? snapshot.highlight_numbers : [])
    .slice(0, 4)
    .map((item) => {
      let label = presentMetricLabel(item.metric, item.label || "") || item.label || "";
      if ((item.metric === "sc_top_association" || item.unit === "association") && label && !/associa/i.test(label)) {
        const phrase = /dias até primeira reunião/i.test(label) ? "tempo até a 1ª reunião" : label;
        label = `Associação · ${phrase}`;
      }
      return { ...item, label };
    });

  const analysis = {
    headline: clip(copy.headline, 180),
    executive_summary: clip(copy.executive_summary || copy.headline, 520),
    highlight_numbers,
    attention_points: cardsFromCandidates(cands.attention_candidates, maxAttention, "attention"),
    positive_signals: cardsFromCandidates(cands.positive_candidates, maxPositives, "positive"),
    recommended_actions: selectActions(cands, maxActions),
    limitations: executiveLimitations,
    executive_limitations: executiveLimitations,
    scope: snapshot?.scope || null,
    ep_highlights: Array.isArray(snapshot?.ep_highlights) ? snapshot.ep_highlights.slice(0, 3) : [],
    ep_attention: Array.isArray(snapshot?.ep_attention) ? snapshot.ep_attention.slice(0, 3) : [],
  };

  return {
    executive_analysis: analysis,
    metadata: {
      generation_mode: "deterministic",
      composer_version: COMPOSER_VERSION,
      ai_generated: false,
      page,
    },
    debug_limitations: debugLimitations,
    timing_ms: { composer: Date.now() - started },
  };
}

export function analysisHasForbiddenCausality(analysis) {
  const blob = [
    analysis?.headline,
    analysis?.executive_summary,
    ...(analysis?.attention_points || []).map((c) => `${c.title} ${c.description}`),
    ...(analysis?.positive_signals || []).map((c) => `${c.title} ${c.description}`),
    ...(analysis?.recommended_actions || []).map((c) => `${c.title} ${c.description}`),
  ].join(" ");
  return textHasForbiddenCausality(blob).hit === true;
}

export { ACTION_LIBRARY, fmtInt, fmtPct };
