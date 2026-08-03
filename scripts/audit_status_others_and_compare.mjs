/**
 * Auditoria: composição de "Outros / Não informados" na carteira EP
 * e comparação antes × depois da classificação refinada.
 * Somente leitura. Não altera banco.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !(String(process.env[key] || "").trim())) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const {
  buildAnalyticalCancellationMap,
  normalizeClientStatus,
  resolveAnalyticalStatusFromMaps,
  parseFlexibleDate,
  isDistratoTextSigned,
  ANALYTICAL_STATUS,
} = await import("../netlify/functions/_shared/analytical-cancellation.mjs");

const BASE = process.env.DATA_SUPABASE_URL;
const KEY = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error("Missing DATA_SUPABASE_URL / DATA_SUPABASE_SERVICE_ROLE_KEY");

async function fetchAll(table, select) {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, BASE);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + 999}`,
      },
    });
    if (!response.ok) throw new Error(`${table} ${response.status} ${await response.text()}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

const CLIENT_SELECT =
  "id,codigo,name,status,data_churn,data_inicio_ciclo,created_at,engenheiro_patrimonial";
const CANCEL_SELECT =
  "id,client_id,churn_efetivado_at,distrato_assinado_at,distrato,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at";

const [clients, cancellations] = await Promise.all([
  fetchAll("clients", CLIENT_SELECT),
  fetchAll("cancellations", CANCEL_SELECT),
]);

const { map: cancelMap, audit: cancelAudit } = buildAnalyticalCancellationMap(
  cancellations,
  clients,
);

/** Classificação ATUAL (como resolveAnalyticalStatusFromMaps hoje). */
function statusCurrent(client, cancelInfo) {
  return resolveAnalyticalStatusFromMaps(client.status, cancelInfo);
}

/**
 * Classificação NOVA pedida:
 * - Cancelado (com data) | Cancelado efetivado sem data | Marcado sem confirmação | …
 */
function statusNew(client, cancelInfo) {
  if (cancelInfo?.isCancelled) {
    if (cancelInfo.hasConfirmedDate && cancelInfo.date) {
      return ANALYTICAL_STATUS.CANCELLED_CONFIRMED; // "Cancelado"
    }
    return "Cancelado efetivado sem data";
  }
  const normalized = normalizeClientStatus(client.status);
  if (normalized === "Cancelado") return "Marcado como cancelado sem confirmação";
  return normalized;
}

function classifyOtherReason(client, cancelInfo, currentStatus) {
  const raw = client.status;
  const rawNorm = normalizeClientStatus(raw);
  const hasDataChurn = Boolean(parseFlexibleDate(client.data_churn));
  const cancelRows = (cancellations || []).filter(
    (r) => String(r.client_id) === String(client.id) && !parseFlexibleDate(r.archived_at),
  );
  const hasCancelRow = cancelRows.length > 0;
  const hasChurnAt = cancelRows.some((r) => parseFlexibleDate(r.churn_efetivado_at));
  const hasDistratoAt = cancelRows.some((r) => parseFlexibleDate(r.distrato_assinado_at));
  const hasDistratoText = cancelRows.some((r) => isDistratoTextSigned(r.distrato));

  let reason;
  if (currentStatus === "Cancelado sem data confirmada") {
    if (hasDataChurn) reason = "Data disponível em clients.data_churn, mas não considerada";
    else if (!hasCancelRow) reason = "Status bruto Cancelado sem data encontrada";
    else if (!hasChurnAt && !hasDistratoAt && !hasDistratoText) {
      reason = "Falha de vínculo com cancellations";
    } else reason = "Status bruto Cancelado sem data encontrada";
  } else if (!raw || !String(raw).trim()) {
    reason = "Status vazio";
  } else if (rawNorm === "Não informado") {
    reason = "Status bruto desconhecido";
  } else if (rawNorm === "Ativo" || rawNorm === "Congelado" || rawNorm === "Cancelado") {
    reason = "Outro status reconhecido";
  } else {
    reason = "Status bruto desconhecido";
  }

  return {
    clientId: String(client.id),
    rawStatus: raw ?? null,
    rawNormalized: rawNorm,
    analyticalStatus: currentStatus,
    hasDataChurn,
    hasChurnEfetivadoAt: hasChurnAt,
    hasDistratoAssinadoAt: hasDistratoAt,
    hasDistratoAssinadoText: hasDistratoText,
    hasCancellationsRow: hasCancelRow,
    isCancelledAnalytical: Boolean(cancelInfo?.isCancelled),
    cancelSource: cancelInfo?.source || null,
    reason,
  };
}

const countsCurrent = {
  Ativos: 0,
  Congelados: 0,
  "Cancelados com data": 0,
  "Cancelados sem data (efetivado Assinado)": 0,
  "Marcados como cancelados sem evidência": 0,
  "Não informados reais": 0,
  Total: 0,
};
const countsNew = { ...countsCurrent };
const otherReasons = {};
const otherDetails = [];
const movedFromOthersToCancelled = [];
const movedSemDataToComData = [];
const dataChurnNoCancelRow = [];
const divergentDates = [];
const multiSource = [];

let othersInPortfolioChart = 0;

for (const client of clients) {
  const cancelInfo = cancelMap.get(String(client.id)) || null;
  const cur = statusCurrent(client, cancelInfo);
  const neu = statusNew(client, cancelInfo);
  countsCurrent.Total += 1;
  countsNew.Total += 1;

  if (cur === "Ativo") countsCurrent.Ativos += 1;
  else if (cur === "Congelado") countsCurrent.Congelados += 1;
  else if (cur === "Cancelado") {
    if (cancelInfo?.hasConfirmedDate && cancelInfo?.date) countsCurrent["Cancelados com data"] += 1;
    else countsCurrent["Cancelados sem data (efetivado Assinado)"] += 1;
  } else if (cur === "Cancelado sem data confirmada") {
    countsCurrent["Marcados como cancelados sem evidência"] += 1;
  } else countsCurrent["Não informados reais"] += 1;

  if (neu === "Ativo") countsNew.Ativos += 1;
  else if (neu === "Congelado") countsNew.Congelados += 1;
  else if (neu === "Cancelado") countsNew["Cancelados com data"] += 1;
  else if (neu === "Cancelado efetivado sem data") {
    countsNew["Cancelados sem data (efetivado Assinado)"] += 1;
  } else if (neu === "Marcado como cancelado sem confirmação") {
    countsNew["Marcados como cancelados sem evidência"] += 1;
  } else countsNew["Não informados reais"] += 1;

  // Gráfico EP atual: other = total - ativo - congelado - cancelado("Cancelado")
  const inOther = cur !== "Ativo" && cur !== "Congelado" && cur !== "Cancelado";
  if (inOther) {
    othersInPortfolioChart += 1;
    const detail = classifyOtherReason(client, cancelInfo, cur);
    otherDetails.push(detail);
    otherReasons[detail.reason] = (otherReasons[detail.reason] || 0) + 1;
    if (neu === "Cancelado" || neu === "Cancelado efetivado sem data") {
      movedFromOthersToCancelled.push({
        clientId: detail.clientId,
        from: cur,
        to: neu,
        source: cancelInfo?.source,
      });
    }
  }

  // data_churn sem linha em cancellations
  if (parseFlexibleDate(client.data_churn)) {
    const rows = cancellations.filter(
      (r) => String(r.client_id) === String(client.id) && !parseFlexibleDate(r.archived_at),
    );
    if (!rows.length) {
      dataChurnNoCancelRow.push(String(client.id));
    }
  }

  if (cancelInfo?.sourcesMatched?.length > 1) {
    multiSource.push({
      clientId: String(client.id),
      sources: cancelInfo.sourcesMatched,
      chosen: cancelInfo.source,
      date: cancelInfo.date?.toISOString?.() || null,
    });
  }

  // divergências de datas
  if (cancelInfo?.isCancelled) {
    const churnAt = cancellations
      .filter((r) => String(r.client_id) === String(client.id) && !parseFlexibleDate(r.archived_at))
      .map((r) => parseFlexibleDate(r.churn_efetivado_at))
      .find(Boolean);
    const distratoAt = cancellations
      .filter((r) => String(r.client_id) === String(client.id) && !parseFlexibleDate(r.archived_at))
      .map((r) => parseFlexibleDate(r.distrato_assinado_at))
      .find(Boolean);
    const dataChurn = parseFlexibleDate(client.data_churn);
    const dates = [
      churnAt && { k: "churn_efetivado_at", d: churnAt },
      distratoAt && { k: "distrato_assinado_at", d: distratoAt },
      dataChurn && { k: "clients.data_churn", d: dataChurn },
    ].filter(Boolean);
    if (dates.length >= 2) {
      const times = dates.map((x) => x.d.getTime());
      const maxDiffDays = (Math.max(...times) - Math.min(...times)) / 86400000;
      if (maxDiffDays > 0) {
        divergentDates.push({
          clientId: String(client.id),
          dates: dates.map((x) => ({ source: x.k, iso: x.d.toISOString().slice(0, 10) })),
          maxDiffDays: Math.round(maxDiffDays * 10) / 10,
          chosenSource: cancelInfo.source,
        });
      }
    }
  }
}

// Simular "antes sem data_churn" vs agora para quem ganharia data
const mapWithoutDataChurn = buildAnalyticalCancellationMap(cancellations, []).map;
for (const client of clients) {
  const withChurn = cancelMap.get(String(client.id));
  const without = mapWithoutDataChurn.get(String(client.id));
  if (withChurn?.hasConfirmedDate && withChurn?.date) {
    const wasNoDate = !without || !without.hasConfirmedDate || !without.date;
    const gainedFromDataChurn =
      withChurn.source === "clients.data_churn"
      || (withChurn.hasClientDataChurn && (!without?.hasConfirmedDate));
    if (wasNoDate && gainedFromDataChurn) {
      movedSemDataToComData.push({
        clientId: String(client.id),
        source: withChurn.source,
      });
    }
  }
}

const sameDay = divergentDates.filter((d) => d.maxDiffDays === 0).length;
const upTo1 = divergentDates.filter((d) => d.maxDiffDays > 0 && d.maxDiffDays <= 1).length;
const over1 = divergentDates.filter((d) => d.maxDiffDays > 1).length;
const maxDiv = divergentDates.reduce((m, d) => Math.max(m, d.maxDiffDays), 0);

const diffTable = {};
for (const k of Object.keys(countsCurrent)) {
  if (k === "Total") continue;
  diffTable[k] = {
    before: countsCurrent[k],
    after: countsNew[k],
    delta: countsNew[k] - countsCurrent[k],
  };
}
diffTable.Total = {
  before: countsCurrent.Total,
  after: countsNew.Total,
  delta: 0,
};

const out = {
  generatedAt: new Date().toISOString(),
  cancelAudit,
  portfolioChartOthers: {
    totalInOtherSegment: othersInPortfolioChart,
    note: "Outros = carteira − Ativos − Congelados − Cancelado (efetivado). Inclui 'Cancelado sem data confirmada' e 'Não informado'.",
    reasonDistribution: otherReasons,
    sample: otherDetails.slice(0, 40),
  },
  comparison: diffTable,
  transitions: {
    fromOthersToCancelled: movedFromOthersToCancelled.length,
    fromSemDataToComDataViaDataChurn: movedSemDataToComData.length,
    dataChurnWithoutCancellationsRow: dataChurnNoCancelRow.length,
    multiSourceClients: multiSource.length,
  },
  dateDivergence: {
    clientsWithDivergentDates: divergentDates.length,
    sameDay: sameDay,
    upTo1Day: upTo1,
    over1Day: over1,
    maxDiffDays: maxDiv,
    sample: divergentDates.slice(0, 25),
  },
};

writeFileSync(
  resolve(root, "scripts/_audit_status_others_compare.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({
  others: out.portfolioChartOthers.reasonDistribution,
  othersTotal: othersInPortfolioChart,
  comparison: diffTable,
  transitions: out.transitions,
  dateDivergence: {
    clients: divergentDates.length,
    upTo1Day: upTo1,
    over1Day: over1,
    maxDiffDays: maxDiv,
  },
  cancelAudit,
}, null, 2));
