/**
 * Regra analítica oficial de cancelamento (portal inteiro).
 *
 * Cancelado analítico = registro NÃO arquivado em public.cancellations com:
 *   churn_efetivado_at OU distrato_assinado_at
 *
 * Data analítica = churn_efetivado_at ?? distrato_assinado_at
 *
 * NÃO usam status/permanência/KPI analítico:
 *   data_pedido, intencao_registrada_at
 * (podem aparecer só como contexto operacional)
 */

export const ANALYTICAL_CANCEL_SELECT =
  "id,client_id,churn_efetivado_at,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at";

export const ANALYTICAL_CANCEL_FIELDS = [
  { table: "cancellations", column: "churn_efetivado_at", role: "cancellationDatePriority1" },
  { table: "cancellations", column: "distrato_assinado_at", role: "cancellationDatePriority2" },
  { table: "cancellations", column: "archived_at", role: "cancellationSoftDelete" },
  { table: "cancellations", column: "data_pedido", role: "operationalOnly" },
  { table: "cancellations", column: "intencao_registrada_at", role: "operationalOnly" },
];

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

/** Aceita Date, ISO (YYYY-MM-DD), timestamp e DD/MM/YYYY (padrão BR). Não assume MM/DD. */
export function parseFlexibleDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s|$)/);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    const day = Number(br[1]);
    const month = Number(br[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(y, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function foldStatusToken(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeClientStatus(rawStatus) {
  const token = foldStatusToken(rawStatus);
  if (!token || token === "null" || token === "undefined" || token === "vazio") {
    return "Não informado";
  }
  if (["ativo", "active", "ativa"].includes(token)) return "Ativo";
  if (
    [
      "churn",
      "cancelado",
      "cancelada",
      "canceled",
      "cancelled",
      "encerrado",
      "encerrada",
      "inativo",
      "inativa",
      "inactive",
    ].includes(token)
    || token.includes("cancel")
    || token.includes("churn")
    || token.includes("encerr")
  ) {
    return "Cancelado";
  }
  if (
    ["congelado", "congelada", "freeze", "frozen", "pausado", "pausada"].includes(token)
    || token.includes("congel")
    || token.includes("pausad")
  ) {
    return "Congelado";
  }
  return "Não informado";
}

/**
 * Avalia um registro de public.cancellations.
 * @returns {{ isCancelled: boolean, cancellationDate: Date|null, source: string|null, stage: string|null, operational: object }}
 */
export function getAnalyticalCancellation(cancellation) {
  if (!cancellation || parseFlexibleDate(cancellation.archived_at)) {
    return {
      isCancelled: false,
      cancellationDate: null,
      source: null,
      stage: null,
      operational: {
        dataPedido: parseFlexibleDate(cancellation?.data_pedido),
        intencaoRegistradaAt: parseFlexibleDate(cancellation?.intencao_registrada_at),
      },
    };
  }

  const churnDate = parseFlexibleDate(cancellation.churn_efetivado_at);
  const signedDate = parseFlexibleDate(cancellation.distrato_assinado_at);
  const operational = {
    dataPedido: parseFlexibleDate(cancellation.data_pedido),
    intencaoRegistradaAt: parseFlexibleDate(cancellation.intencao_registrada_at),
  };

  if (churnDate) {
    return {
      isCancelled: true,
      cancellationDate: churnDate,
      source: "churn_efetivado_at",
      stage: "Churn efetivado",
      operational,
      rawChurn: cancellation.churn_efetivado_at,
      rawDistrato: cancellation.distrato_assinado_at,
    };
  }

  if (signedDate) {
    return {
      isCancelled: true,
      cancellationDate: signedDate,
      source: "distrato_assinado_at",
      stage: "Distrato assinado",
      operational,
      rawChurn: cancellation.churn_efetivado_at,
      rawDistrato: cancellation.distrato_assinado_at,
    };
  }

  return {
    isCancelled: false,
    cancellationDate: null,
    source: null,
    stage: null,
    operational,
  };
}

/** Rank: churn efetivado > distrato. Empate: data mais recente, depois updated_at. */
const SOURCE_RANK = {
  churn_efetivado_at: 2,
  distrato_assinado_at: 1,
};

/**
 * Uma linha analítica por client_id.
 * Ignora archived_at; só entra quem tem churn_efetivado_at ou distrato_assinado_at.
 */
export function buildAnalyticalCancellationMap(cancellations) {
  const map = new Map();
  const activeProcessCounts = new Map();
  const orphanClientIds = [];
  const now = startOfDay(new Date());
  let formatWarnings = 0;
  let rowsWithoutClientId = 0;
  let rowsWithInvalidChurn = 0;
  let rowsWithInvalidDistrato = 0;

  for (const row of cancellations || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) {
      rowsWithoutClientId += 1;
      orphanClientIds.push(row.id || null);
      continue;
    }
    const clientKey = String(clientId);
    if (parseFlexibleDate(row.archived_at)) continue;

    const rawChurn = blankToNull(row.churn_efetivado_at);
    const rawDistrato = blankToNull(row.distrato_assinado_at);
    if (rawChurn && !parseFlexibleDate(rawChurn)) rowsWithInvalidChurn += 1;
    if (rawDistrato && !parseFlexibleDate(rawDistrato)) rowsWithInvalidDistrato += 1;

    const analytical = getAnalyticalCancellation(row);
    if (!analytical.isCancelled) continue;

    const updated =
      parseFlexibleDate(row.updated_at)
      || parseFlexibleDate(row.created_at)
      || analytical.cancellationDate;
    const rank = SOURCE_RANK[analytical.source] || 0;

    activeProcessCounts.set(clientKey, (activeProcessCounts.get(clientKey) || 0) + 1);

    const warnings = [];
    if (startOfDay(analytical.cancellationDate) > now) {
      warnings.push("Data de cancelamento futura");
    }

    const candidate = {
      date: analytical.cancellationDate,
      stage: analytical.stage,
      rank,
      updated,
      warnings,
      dateSource: analytical.source,
      source: analytical.source,
      isCancelled: true,
      hasChurnEfetivado: Boolean(parseFlexibleDate(row.churn_efetivado_at)),
      hasDistrato: Boolean(parseFlexibleDate(row.distrato_assinado_at)),
      operationalPedido: analytical.operational?.dataPedido || null,
      operationalIntencao: analytical.operational?.intencaoRegistradaAt || null,
      motivo: blankToNull(row.motivo),
      motivoCategoria: blankToNull(row.motivo_categoria),
      cancellationRowId: blankToNull(row.id),
    };

    const current = map.get(clientKey);
    if (!current) {
      map.set(clientKey, candidate);
      continue;
    }

    const better =
      candidate.rank > current.rank
      || (candidate.rank === current.rank
        && (candidate.date > current.date
          || (candidate.date.getTime() === current.date.getTime()
            && candidate.updated > current.updated)));

    if (better) {
      map.set(clientKey, {
        ...candidate,
        warnings: [...new Set([...current.warnings, ...candidate.warnings])],
      });
    } else {
      map.set(clientKey, {
        ...current,
        warnings: [...new Set([...current.warnings, ...candidate.warnings])],
      });
    }
  }

  const multiples = new Set(
    [...activeProcessCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  );

  return {
    map,
    multiples,
    orphanClientIds,
    activeProcessCounts,
    formatWarnings,
    rowsWithoutClientId,
    rowsWithInvalidChurn,
    rowsWithInvalidDistrato,
  };
}

/**
 * Status analítico: cancelamento analítico (churn/distrato) prevalece.
 * Status bruto "Cancelado" sem churn_efetivado_at/distrato_assinado_at
 * NÃO conta como Cancelado analítico (vira Não informado).
 */
export function resolveAnalyticalStatus(rawStatus, cancellationDate) {
  if (cancellationDate) return "Cancelado";
  const normalized = normalizeClientStatus(rawStatus);
  if (normalized === "Cancelado") return "Não informado";
  return normalized;
}

export function resolveAnalyticalStatusFromMaps(rawStatus, cancelInfo) {
  const date = cancelInfo?.date || null;
  return resolveAnalyticalStatus(rawStatus, date);
}

/** Alias legado — mesma implementação. */
export function buildCancellationMap(cancellations) {
  return buildAnalyticalCancellationMap(cancellations);
}
