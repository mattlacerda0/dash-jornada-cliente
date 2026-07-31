/**
 * Processo de cancelamento (etapas operacionais ≠ cancelamento efetivado).
 *
 * Intenção  = intencao_registrada_at
 * Pedido    = data_pedido
 * Efetivado = churn_efetivado_at OR distrato_assinado_at  (só isso tira da carteira ativa)
 *
 * data_pedido / intencao_registrada_at NÃO definem cancelamento analítico.
 */
import {
  getAnalyticalCancellation,
  parseFlexibleDate,
} from "./analytical-cancellation.mjs";
import { categorizeCancellationReason } from "./cancellation-reason-category.mjs";

export const CANCELLATION_PROCESS_SELECT = [
  "id",
  "client_id",
  "status_id",
  "motivo",
  "motivo_categoria",
  "churn_efetivado_at",
  "distrato_assinado_at",
  "distrato",
  "data_pedido",
  "intencao_registrada_at",
  "archived_at",
  "updated_at",
  "created_at",
  "passou_retencao",
  "entered_retencao_at",
  "retencao_iniciada_at",
  "nao_retencao_at",
  "desfecho",
  "tratativa",
  "valor_pago",
  "valor_a_reembolsar",
  "responsavel_name",
  "assigned_to",
  "is_critical",
  "estagio_cliente",
  "entered_offboarding_at",
  "stage_entered_at",
].join(",");

/** Entrada no processo: pedido; se ausente, intenção. Não é data de cancelamento efetivo. */
export function resolveProcessEntryDate(pedidoDate, intencaoDate) {
  if (pedidoDate) return { date: pedidoDate, source: "data_pedido" };
  if (intencaoDate) return { date: intencaoDate, source: "intencao_registrada_at" };
  return { date: null, source: null };
}

export function resolveAnalyticalProcessSituation({ hasEfetivado, hasPedido, hasIntencao }) {
  if (hasEfetivado) return "Cancelamento efetivado";
  if (hasPedido || hasIntencao) return "Intenção/pedido em andamento";
  return "Sem etapa identificada";
}

export const STAGE = {
  EFETIVADO: "Cancelamento efetivado",
  PEDIDO: "Pedido de cancelamento",
  INTENCAO: "Intenção de cancelamento",
  NENHUMA: "Sem etapa identificada",
};

export const STAGE_KEYS = {
  EFETIVADO: "efetivado",
  PEDIDO: "pedido",
  INTENCAO: "intencao",
  NENHUMA: "nenhuma",
};

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function toBool(value) {
  const raw = blankToNull(value);
  if (raw == null) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (["true", "t", "1", "sim", "yes", "y"].includes(s)) return true;
  if (["false", "f", "0", "nao", "não", "no", "n"].includes(s)) return false;
  return null;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function foldToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEstagioCliente(raw) {
  const t = foldToken(raw);
  if (!t) return "Não informado";
  if (t === "ativo_recente" || t.includes("recente")) return "Ativo recente";
  if (t === "ativo_maduro" || t.includes("maduro")) return "Ativo maduro";
  if (t === "indefinido" || t.includes("indefin")) return "Indefinido";
  if (t.includes("avaliacao") || t.includes("avaliação")) return "Avaliação 7d";
  return blankToNull(raw) ? String(raw).trim() : "Não informado";
}

function isDistratoTextSigned(raw) {
  const t = foldToken(raw);
  return t === "assinado" || t.includes("assinado");
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetween(start, end) {
  if (!start || !end) return null;
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function validPositiveDays(start, end) {
  const d = daysBetween(start, end);
  if (d == null || d < 0) return null;
  return d;
}

function stageRank(stageKey) {
  if (stageKey === STAGE_KEYS.EFETIVADO) return 3;
  if (stageKey === STAGE_KEYS.PEDIDO) return 2;
  if (stageKey === STAGE_KEYS.INTENCAO) return 1;
  return 0;
}

function resolveExclusiveStage({ hasEfetivado, hasPedido, hasIntencao }) {
  if (hasEfetivado) return { key: STAGE_KEYS.EFETIVADO, label: STAGE.EFETIVADO };
  if (hasPedido) return { key: STAGE_KEYS.PEDIDO, label: STAGE.PEDIDO };
  if (hasIntencao) return { key: STAGE_KEYS.INTENCAO, label: STAGE.INTENCAO };
  return { key: STAGE_KEYS.NENHUMA, label: STAGE.NENHUMA };
}

function parseDateOrInvalid(raw, invalidBag) {
  const text = blankToNull(raw);
  if (!text) return { date: null, invalid: false };
  const date = parseFlexibleDate(text);
  if (!date) {
    invalidBag.push(String(text).slice(0, 40));
    return { date: null, invalid: true };
  }
  return { date, invalid: false };
}

/**
 * Uma linha analítica por client_id a partir de public.cancellations.
 * Por padrão ignora archived_at preenchido.
 */
export function buildCancellationProcessMap(cancellations, { includeArchived = false } = {}) {
  const map = new Map();
  const activeCounts = new Map();
  let rowsWithoutClientId = 0;
  let archivedRows = 0;
  let distratoTextSignedWithoutDate = 0;
  let invalidDateCount = 0;
  const invalidDateSamples = [];

  for (const row of cancellations || []) {
    const archivedAt = parseFlexibleDate(row.archived_at);
    if (archivedAt) {
      archivedRows += 1;
      if (!includeArchived) continue;
    }

    const clientId = blankToNull(row.client_id);
    if (!clientId) {
      rowsWithoutClientId += 1;
      continue;
    }
    const clientKey = String(clientId);

    const invalidBag = [];
    const churnParsed = parseDateOrInvalid(row.churn_efetivado_at, invalidBag);
    const distratoParsed = parseDateOrInvalid(row.distrato_assinado_at, invalidBag);
    const pedidoParsed = parseDateOrInvalid(row.data_pedido, invalidBag);
    const intencaoParsed = parseDateOrInvalid(row.intencao_registrada_at, invalidBag);
    const enteredRetencao = parseDateOrInvalid(row.entered_retencao_at, invalidBag);
    const retencaoIniciada = parseDateOrInvalid(row.retencao_iniciada_at, invalidBag);
    const naoRetencao = parseDateOrInvalid(row.nao_retencao_at, invalidBag);
    const enteredOffboarding = parseDateOrInvalid(row.entered_offboarding_at, invalidBag);
    const stageEntered = parseDateOrInvalid(row.stage_entered_at, invalidBag);

    if (invalidBag.length) {
      invalidDateCount += invalidBag.length;
      for (const s of invalidBag) {
        if (invalidDateSamples.length < 8) invalidDateSamples.push(s);
      }
    }

    const analytical = getAnalyticalCancellation({
      ...row,
      churn_efetivado_at: churnParsed.date || row.churn_efetivado_at,
      distrato_assinado_at: distratoParsed.date || row.distrato_assinado_at,
    });

    // Prefer parsed dates for stages
    const churnDate = churnParsed.date;
    const distratoDate = distratoParsed.date;
    const pedidoDate = pedidoParsed.date;
    const intencaoDate = intencaoParsed.date;
    const hasEfetivado = Boolean(churnDate || distratoDate || analytical.isCancelled);
    const hasPedido = Boolean(pedidoDate);
    const hasIntencao = Boolean(intencaoDate);
    const exclusive = resolveExclusiveStage({ hasEfetivado, hasPedido, hasIntencao });

    const distratoText = blankToNull(row.distrato);
    if (isDistratoTextSigned(distratoText) && !distratoDate) {
      distratoTextSignedWithoutDate += 1;
    }

    const updated =
      parseFlexibleDate(row.updated_at)
      || parseFlexibleDate(row.created_at)
      || analytical.cancellationDate
      || pedidoDate
      || intencaoDate
      || new Date(0);

    const motivo = blankToNull(row.motivo);
    const categorized = categorizeCancellationReason(motivo);
    const passouRetencao = toBool(row.passou_retencao);
    const desfechoRaw = blankToNull(row.desfecho);
    const desfechoToken = foldToken(desfechoRaw);
    const isRetido = desfechoToken === "retido" || desfechoToken.includes("retid");
    const isCritical = toBool(row.is_critical) === true;
    const tratativa = blankToNull(row.tratativa);
    const responsavel =
      blankToNull(row.responsavel_name) || blankToNull(row.assigned_to) || null;
    const valorPago = toNumber(row.valor_pago);
    const valorReembolso = toNumber(row.valor_a_reembolsar);
    const retentionStart = enteredRetencao.date || retencaoIniciada.date;

    const chronologicalIssues = [];
    if (intencaoDate && pedidoDate && pedidoDate < intencaoDate) {
      chronologicalIssues.push("pedido_antes_intencao");
    }
    if (pedidoDate && analytical.cancellationDate && analytical.cancellationDate < pedidoDate) {
      chronologicalIssues.push("efetivado_antes_pedido");
    }
    if (intencaoDate && analytical.cancellationDate && analytical.cancellationDate < intencaoDate) {
      chronologicalIssues.push("efetivado_antes_intencao");
    }

    const processEntry = resolveProcessEntryDate(pedidoDate, intencaoDate);
    const inProcessCurrently = (hasPedido || hasIntencao) && !hasEfetivado;
    const analyticalSituation = resolveAnalyticalProcessSituation({
      hasEfetivado,
      hasPedido,
      hasIntencao,
    });

    const candidate = {
      clientId: clientKey,
      cancellationRowId: blankToNull(row.id),
      archivedAt: archivedAt || null,
      isArchived: Boolean(archivedAt),
      statusId: blankToNull(row.status_id),
      intencaoAt: intencaoDate,
      pedidoAt: pedidoDate,
      processEntryAt: processEntry.date,
      processEntrySource: processEntry.source,
      inProcessCurrently,
      analyticalSituation,
      churnEfetivadoAt: churnDate,
      distratoAssinadoAt: distratoDate,
      analyticalCancellationAt: analytical.cancellationDate || null,
      analyticalSource: analytical.source || null,
      hasIntencao,
      hasPedido,
      hasEfetivado,
      exclusiveStageKey: exclusive.key,
      exclusiveStage: exclusive.label,
      stageRank: stageRank(exclusive.key),
      updated,
      motivo,
      motivoCategoriaDb: blankToNull(row.motivo_categoria),
      reasonCategory: categorized.category,
      hasReason: Boolean(motivo),
      distratoText,
      distratoTextSignedWithoutDate: isDistratoTextSigned(distratoText) && !distratoDate,
      passouRetencao,
      retentionStartAt: retentionStart,
      naoRetencaoAt: naoRetencao.date,
      desfecho: desfechoRaw,
      hasDesfecho: Boolean(desfechoRaw),
      isRetido,
      tratativa,
      hasTratativa: Boolean(tratativa),
      valorPago,
      valorReembolso,
      responsavel,
      assignedTo: blankToNull(row.assigned_to),
      isCritical,
      estagioClienteRaw: blankToNull(row.estagio_cliente),
      estagioCliente: normalizeEstagioCliente(row.estagio_cliente),
      enteredOffboardingAt: enteredOffboarding.date,
      stageEnteredAt: stageEntered.date,
      chronologicalIssues,
      invalidDateFlags: {
        churn: churnParsed.invalid,
        distrato: distratoParsed.invalid,
        pedido: pedidoParsed.invalid,
        intencao: intencaoParsed.invalid,
      },
    };

    activeCounts.set(clientKey, (activeCounts.get(clientKey) || 0) + 1);

    const current = map.get(clientKey);
    if (!current) {
      map.set(clientKey, candidate);
      continue;
    }

    const better =
      candidate.stageRank > current.stageRank
      || (candidate.stageRank === current.stageRank
        && (candidate.updated > current.updated
          || (candidate.updated.getTime() === current.updated.getTime()
            && String(candidate.cancellationRowId || "") > String(current.cancellationRowId || ""))));

    const mergeProcessFields = (primary, secondary) => {
      const hasIntencao = primary.hasIntencao || secondary.hasIntencao;
      const hasPedido = primary.hasPedido || secondary.hasPedido;
      const hasEfetivado = primary.hasEfetivado || secondary.hasEfetivado;
      const intencaoAt = primary.intencaoAt || secondary.intencaoAt;
      const pedidoAt = primary.pedidoAt || secondary.pedidoAt;
      const processEntry = resolveProcessEntryDate(pedidoAt, intencaoAt);
      const excl = resolveExclusiveStage({ hasEfetivado, hasPedido, hasIntencao });
      return {
        ...primary,
        hasIntencao,
        hasPedido,
        hasEfetivado,
        intencaoAt,
        pedidoAt,
        processEntryAt: processEntry.date,
        processEntrySource: processEntry.source,
        inProcessCurrently: (hasPedido || hasIntencao) && !hasEfetivado,
        analyticalSituation: resolveAnalyticalProcessSituation({
          hasEfetivado,
          hasPedido,
          hasIntencao,
        }),
        churnEfetivadoAt: primary.churnEfetivadoAt || secondary.churnEfetivadoAt,
        distratoAssinadoAt: primary.distratoAssinadoAt || secondary.distratoAssinadoAt,
        analyticalCancellationAt:
          primary.analyticalCancellationAt || secondary.analyticalCancellationAt,
        statusId: primary.statusId || secondary.statusId,
        passouRetencao:
          primary.passouRetencao === true || secondary.passouRetencao === true
            ? true
            : primary.passouRetencao ?? secondary.passouRetencao,
        isCritical: primary.isCritical || secondary.isCritical,
        exclusiveStageKey: excl.key,
        exclusiveStage: excl.label,
        stageRank: stageRank(excl.key),
        chronologicalIssues: [...new Set([
          ...(primary.chronologicalIssues || []),
          ...(secondary.chronologicalIssues || []),
        ])],
      };
    };

    if (better) {
      map.set(clientKey, mergeProcessFields(candidate, current));
    } else {
      map.set(clientKey, mergeProcessFields(current, candidate));
    }
  }

  const multiples = new Set(
    [...activeCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  );

  return {
    map,
    multiples,
    rowsWithoutClientId,
    archivedRows,
    distratoTextSignedWithoutDate,
    invalidDateCount,
    invalidDateSamples,
    activeCounts,
  };
}

export function medianOf(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { median: null, sampleSize: 0 };
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
      : sorted[mid];
  return { median, sampleSize: sorted.length };
}

export function rateOrInsufficient(numerator, denominator) {
  if (!denominator) {
    return { rate: null, label: "Dados insuficientes", numerator, denominator: 0 };
  }
  const rate = Math.round((numerator / denominator) * 1000) / 10;
  return { rate, label: `${rate}%`, numerator, denominator };
}

export { validPositiveDays, toBool, toNumber, blankToNull, foldToken, isDistratoTextSigned };
