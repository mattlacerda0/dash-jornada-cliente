/**
 * Compara regra ANTIGA vs NOVA de status analítico (sem Git / sem alterar banco).
 *
 * Antiga (portal anterior): cancelado se distrato_assinado_at OU data_pedido
 *   OU intencao_registrada_at (e variantes com data_churn em alguns fluxos).
 * Nova: cancelado só se churn_efetivado_at OU distrato_assinado_at (não arquivado).
 *
 * Uso: node scripts/compare_analytical_status.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  buildAnalyticalCancellationMap,
  normalizeClientStatus,
  resolveAnalyticalStatus,
  parseFlexibleDate,
} from "../netlify/functions/_shared/analytical-cancellation.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(projectRoot, name);
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

const BASE = process.env.DATA_SUPABASE_URL;
const KEY = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("DATA_SUPABASE_URL / DATA_SUPABASE_SERVICE_ROLE_KEY ausentes");
  process.exit(1);
}

async function fetchAll(table, select) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const url = new URL(`/rest/v1/${table}`, BASE);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Accept-Profile": "public",
        Prefer: "count=exact",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
    }
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 500000) break;
  }
  return rows;
}

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

/** Regra antiga: distrato > pedido > intenção (ignora archived). */
function buildOldCancellationMap(cancellations) {
  const map = new Map();
  for (const row of cancellations || []) {
    if (parseFlexibleDate(row.archived_at)) continue;
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const clientKey = String(clientId);
    const signed = parseFlexibleDate(row.distrato_assinado_at);
    const pedido = parseFlexibleDate(row.data_pedido);
    const intencao = parseFlexibleDate(row.intencao_registrada_at);
    let date = null;
    let source = null;
    if (signed) {
      date = signed;
      source = "distrato_assinado_at";
    } else if (pedido) {
      date = pedido;
      source = "data_pedido";
    } else if (intencao) {
      date = intencao;
      source = "intencao_registrada_at";
    }
    if (!date) continue;
    const updated = parseFlexibleDate(row.updated_at) || parseFlexibleDate(row.created_at) || date;
    const current = map.get(clientKey);
    const rank = source === "distrato_assinado_at" ? 3 : source === "data_pedido" ? 2 : 1;
    if (!current || rank > current.rank || (rank === current.rank && date > current.date)) {
      map.set(clientKey, { date, source, rank, updated });
    }
  }
  return map;
}

function resolveOldStatus(rawStatus, cancellationDate) {
  if (cancellationDate) return "Cancelado";
  return normalizeClientStatus(rawStatus);
}

function resolveNewStatus(rawStatus, cancellationDate) {
  return resolveAnalyticalStatus(rawStatus, cancellationDate);
}

function countByStatus(rows) {
  const out = { Ativo: 0, Congelado: 0, Cancelado: 0, "Não informado": 0 };
  for (const r of rows) out[r] = (out[r] || 0) + 1;
  return out;
}

async function main() {
  const [clients, cancellations] = await Promise.all([
    fetchAll("clients", "id,status,data_inicio_ciclo,created_at,data_churn"),
    fetchAll(
      "cancellations",
      "id,client_id,churn_efetivado_at,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at",
    ),
  ]);

  // Auditoria de colunas (amostra REST)
  const sample = cancellations[0] || {};
  const columnAudit = [
    ["churn_efetivado_at", "churn_efetivado_at" in sample || cancellations.some((r) => "churn_efetivado_at" in r), "churn_efetivado_at", "timestamptz|text (REST)"],
    ["distrato_assinado_at", "distrato_assinado_at" in sample || cancellations.some((r) => "distrato_assinado_at" in r), "distrato_assinado_at", "timestamptz|text (REST)"],
    ["data_pedido", "data_pedido" in sample || cancellations.some((r) => "data_pedido" in r), "data_pedido", "timestamptz|text (REST)"],
    ["intencao_registrada_at", "intencao_registrada_at" in sample || cancellations.some((r) => "intencao_registrada_at" in r), "intencao_registrada_at", "timestamptz|text (REST)"],
  ];

  const oldMap = buildOldCancellationMap(cancellations);
  const { map: newMap, multiples, rowsWithoutClientId, rowsWithInvalidChurn, rowsWithInvalidDistrato } =
    buildAnalyticalCancellationMap(cancellations);

  const oldStatuses = [];
  const newStatuses = [];
  let ativoToCancelado = 0;
  let congeladoToCancelado = 0;
  let canceladoAntigoToOther = 0;
  let affectedByPedidoRemoval = 0;
  let affectedByIntencaoRemoval = 0;
  let rawActiveToCancelled = 0;
  let rawFrozenToCancelled = 0;

  for (const client of clients) {
    const key = String(client.id);
    const oldInfo = oldMap.get(key);
    const newInfo = newMap.get(key);
    const oldSt = resolveOldStatus(client.status, oldInfo?.date || null);
    const newSt = resolveNewStatus(client.status, newInfo?.date || null);
    oldStatuses.push(oldSt);
    newStatuses.push(newSt);

    const raw = normalizeClientStatus(client.status);
    if (raw === "Ativo" && newInfo?.date) rawActiveToCancelled += 1;
    if (raw === "Congelado" && newInfo?.date) rawFrozenToCancelled += 1;

    if (oldSt === "Ativo" && newSt === "Cancelado") ativoToCancelado += 1;
    if (oldSt === "Congelado" && newSt === "Cancelado") congeladoToCancelado += 1;
    if (oldSt === "Cancelado" && newSt !== "Cancelado") canceladoAntigoToOther += 1;

    // Só pedido (sem churn/distrato) → deixa de ser cancelado analítico
    if (oldInfo?.source === "data_pedido" && !newInfo?.date && oldSt === "Cancelado" && newSt !== "Cancelado") {
      affectedByPedidoRemoval += 1;
    }
    if (oldInfo?.source === "intencao_registrada_at" && !newInfo?.date && oldSt === "Cancelado" && newSt !== "Cancelado") {
      affectedByIntencaoRemoval += 1;
    }
  }

  // Clientes com pedido/intenção mas sem churn/distrato (podem ter status bruto cancelado)
  let clientsOnlyPedido = 0;
  let clientsOnlyIntencao = 0;
  for (const [key, oldInfo] of oldMap.entries()) {
    if (newMap.has(key)) continue;
    if (oldInfo.source === "data_pedido") clientsOnlyPedido += 1;
    if (oldInfo.source === "intencao_registrada_at") clientsOnlyIntencao += 1;
  }

  const oldCounts = countByStatus(oldStatuses);
  const newCounts = countByStatus(newStatuses);

  const sqlA = newMap.size;
  const sqlB = newStatuses.filter((s) => s === "Ativo").length;
  const sqlC = rawActiveToCancelled;
  const sqlD = rawFrozenToCancelled;

  const report = {
    columnAudit: columnAudit.map(([expected, exists, real, type]) => ({
      expected,
      exists,
      realName: exists ? real : null,
      type: exists ? type : null,
    })),
    comparison: {
      totalClients: clients.length,
      old: oldCounts,
      new: newCounts,
      diff: {
        Ativo: newCounts.Ativo - oldCounts.Ativo,
        Congelado: newCounts.Congelado - oldCounts.Congelado,
        Cancelado: newCounts.Cancelado - oldCounts.Cancelado,
        "Não informado": newCounts["Não informado"] - oldCounts["Não informado"],
      },
      transitions: {
        ativoToCancelado,
        congeladoToCancelado,
        canceladoAntigoToOther,
        affectedByPedidoRemoval,
        affectedByIntencaoRemoval,
        clientsOnlyPedidoAnalyticalRemoved: clientsOnlyPedido,
        clientsOnlyIntencaoAnalyticalRemoved: clientsOnlyIntencao,
      },
    },
    sqlChecks: {
      A_cancelled_analytical: sqlA,
      B_active_analytical: sqlB,
      C_raw_active_to_cancelled: sqlC,
      D_raw_frozen_to_cancelled: sqlD,
    },
    qualityAggregates: {
      multiplesClients: multiples.size,
      rowsWithoutClientId,
      rowsWithInvalidChurn,
      rowsWithInvalidDistrato,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
