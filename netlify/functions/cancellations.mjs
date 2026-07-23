/**
 * Cancelamentos — BASE QV (public.*).
 * App Pharus (mecanismos / último acesso) fica fora desta versão.
 *
 * Reuniões antes do cancelamento: somente realizadas com presença confirmada
 * (attendanceStatus === compareceu), mesma normalização do dashboard Reuniões.
 * Interação v1: última reunião realizada antes do cancelamento.
 */
import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";
import { calculateClientSegment } from "./general-data.mjs";

const CLIENT_SELECT =
  "id,codigo,name,status,data_inicio_ciclo,created_at,engenheiro_patrimonial,segmentacao,data_churn,motivo_churn";
const CANCEL_SELECT =
  "id,client_id,motivo,motivo_categoria,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at,updated_at,created_at";
const FINANCIAL_SELECT = "id,client_id,ultima_renda_mensal,ultimo_aporte,reserva_liquidez,valor_imoveis_quitados,cheque_especial,parcelamento_cartao,credito_pessoal,credito_consignado,created_at,updated_at";
const CALENDLY_SELECT = "id,client_id,calendly_event_uri,event_name,start_time,end_time,host_email,manually_linked";
const MANUAL_SELECT = "id,client_id,title,start_time,end_time,google_event_id";
const ATTENDANCE_SELECT = "calendly_event_uri,status,remarcado,link_gravacao,created_at,updated_at";

const STAGE_RANK = {
  "Distrato assinado": 3,
  "Pedido de cancelamento": 2,
  "Intenção registrada": 1,
};

const SEGMENT_LABELS = ["APEX", "PRIVATE", "PRINCIPAL", "DEBTS", "OVER", "Dados insuficientes"];

const STAY_RANGES = [
  "Até 3 meses",
  "De 4 a 6 meses",
  "De 7 a 12 meses",
  "De 13 a 24 meses",
  "Mais de 24 meses",
  "Dados insuficientes",
];

const MEETING_RANGES = ["0 reuniões", "1 a 2", "3 a 5", "6 a 10", "Mais de 10", "Dados insuficientes"];

const FINANCIAL_RANGES = [
  "Até 30 dias antes",
  "31 a 60 dias",
  "61 a 90 dias",
  "91 a 180 dias",
  "Mais de 180 dias",
  "Sem atualização anterior",
];

const USED_FIELDS = [
  { schema: "public", table: "cancellations", column: "client_id", role: "join" },
  { schema: "public", table: "cancellations", column: "motivo", role: "reason" },
  { schema: "public", table: "cancellations", column: "motivo_categoria", role: "category" },
  { schema: "public", table: "cancellations", column: "distrato_assinado_at", role: "cancelDate1" },
  { schema: "public", table: "cancellations", column: "data_pedido", role: "cancelDate2" },
  { schema: "public", table: "cancellations", column: "intencao_registrada_at", role: "cancelDate3" },
  { schema: "public", table: "cancellations", column: "archived_at", role: "softDelete" },
  { schema: "public", table: "clients", column: "id", role: "clientId" },
  { schema: "public", table: "clients", column: "data_inicio_ciclo", role: "hireDate" },
  { schema: "public", table: "clients", column: "created_at", role: "hireFallback" },
  { schema: "public", table: "clients", column: "engenheiro_patrimonial", role: "engineer" },
  { schema: "public", table: "client_financial_data", column: "updated_at", role: "financialUpdate" },
  { schema: "public", table: "client_meetings", column: "start_time", role: "meetingStart" },
  { schema: "public", table: "meeting_attendance", column: "status", role: "attendance" },
];

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

/** Datas defensivas: ISO date, timestamp, DD/MM/YYYY — sem cast frágil. */
function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s|$)/);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    const d = Number(br[1]);
    const m = Number(br[2]);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function foldToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLabel(raw, fallback = "Não informado") {
  const trimmed = blankToNull(typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : raw);
  if (trimmed == null) return { key: "", label: fallback, raw: null };
  return { key: foldToken(trimmed), label: String(trimmed), raw: String(trimmed) };
}

function cancellationStageFromDates(distrato, pedido, intencao) {
  if (distrato) return "Distrato assinado";
  if (pedido) return "Pedido de cancelamento";
  if (intencao) return "Intenção registrada";
  return null;
}

function consolidatedCancelDate(distrato, pedido, intencao) {
  return distrato || pedido || intencao || null;
}

function cancelDateSource(distrato, pedido, intencao) {
  if (distrato) return "distrato_assinado_at";
  if (pedido) return "data_pedido";
  if (intencao) return "intencao_registrada_at";
  return null;
}

function stayRangeFromMonths(months) {
  if (months == null) return "Dados insuficientes";
  if (months <= 3) return "Até 3 meses";
  if (months <= 6) return "De 4 a 6 meses";
  if (months <= 12) return "De 7 a 12 meses";
  if (months <= 24) return "De 13 a 24 meses";
  return "Mais de 24 meses";
}

function meetingCountBand(count) {
  if (count == null) return "Dados insuficientes";
  if (count === 0) return "0 reuniões";
  if (count <= 2) return "1 a 2";
  if (count <= 5) return "3 a 5";
  if (count <= 10) return "6 a 10";
  return "Mais de 10";
}

function financialRecencyBand(days) {
  if (days == null) return "Sem atualização anterior";
  if (days <= 30) return "Até 30 dias antes";
  if (days <= 60) return "31 a 60 dias";
  if (days <= 90) return "61 a 90 dias";
  if (days <= 180) return "91 a 180 dias";
  return "Mais de 180 dias";
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function robustStats(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { median: null, mean: null, validCount: 0 };
  const mean = round1(sorted.reduce((a, b) => a + b, 0) / sorted.length);
  const median = round1(percentile(sorted, 50));
  return { median, mean, validCount: sorted.length };
}

function normalizeAttendanceStatus(status) {
  const s = foldToken(status).replace(/_/g, " ");
  if (!s) return "desconhecido";
  if (["compareceu", "realizado", "realizada", "concluido", "concluida", "presente"].includes(s)) return "compareceu";
  if (["nao compareceu", "faltou", "ausente", "no show", "noshow"].includes(s) || s.includes("nao compare")) {
    return "nao_compareceu";
  }
  if (["cancelada", "cancelado", "canceled", "cancelled"].includes(s)) return "cancelada";
  return "desconhecido";
}

async function fetchAll(table, select, order = "id.asc") {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, process.env.DATA_SUPABASE_URL);
    url.searchParams.set("select", select);
    if (order) url.searchParams.set("order", order);
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${table}: HTTP ${response.status} ${detail.slice(0, 160)}`);
    }
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

/** Mesma dedupe do Dados Gerais + motivo/categoria do registro vencedor. */
function buildCancellationMap(cancellations) {
  const map = new Map();
  const activeProcessCounts = new Map();
  const now = startOfDay(new Date());
  let formatWarnings = 0;

  for (const row of cancellations) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    if (parseDate(row.archived_at)) continue;

    const rawDistrato = blankToNull(row.distrato_assinado_at);
    const rawPedido = blankToNull(row.data_pedido);
    const rawIntencao = blankToNull(row.intencao_registrada_at);
    const distrato = parseDate(rawDistrato);
    const pedido = parseDate(rawPedido);
    const intencao = parseDate(rawIntencao);
    if ((rawDistrato && !distrato) || (rawPedido && !pedido) || (rawIntencao && !intencao)) formatWarnings += 1;

    const consolidated = consolidatedCancelDate(distrato, pedido, intencao);
    if (!consolidated) continue;

    const stage = cancellationStageFromDates(distrato, pedido, intencao);
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || consolidated;
    const rank = STAGE_RANK[stage] || 0;
    activeProcessCounts.set(clientId, (activeProcessCounts.get(clientId) || 0) + 1);

    const warnings = [];
    if (startOfDay(consolidated) > now) warnings.push("Data de cancelamento futura");

    const candidate = {
      date: consolidated,
      stage,
      rank,
      updated,
      warnings,
      dateSource: cancelDateSource(distrato, pedido, intencao),
      motivo: blankToNull(row.motivo),
      motivoCategoria: blankToNull(row.motivo_categoria),
      cancellationRowId: blankToNull(row.id),
    };

    const current = map.get(clientId);
    if (!current) {
      map.set(clientId, candidate);
      continue;
    }
    const better =
      candidate.rank > current.rank
      || (candidate.rank === current.rank
        && (candidate.date > current.date
          || (candidate.date.getTime() === current.date.getTime() && candidate.updated > current.updated)));
    if (better) {
      map.set(clientId, {
        ...candidate,
        warnings: [...new Set([...current.warnings, ...candidate.warnings])],
      });
    } else {
      map.set(clientId, {
        ...current,
        warnings: [...new Set([...current.warnings, ...candidate.warnings])],
      });
    }
  }

  const multiples = new Set(
    [...activeProcessCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  );
  return { map, multiples, formatWarnings };
}

function buildFinancialMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const updated = parseDate(row.updated_at);
    const created = parseDate(row.created_at);
    let date = null;
    let source = "unavailable";
    if (updated) {
      date = updated;
      source = "updated_at";
    } else if (created) {
      date = created;
      source = "created_at";
    }
    const current = map.get(clientId);
    const score = date ? date.getTime() : 0;
    const currentScore = current?.date ? current.date.getTime() : -1;
    if (!current || score > currentScore || (score === currentScore && Number(row.id) > Number(current.id || 0))) {
      map.set(clientId, {
        id: row.id,
        date,
        source,
        monthlyIncome: toNumber(row.ultima_renda_mensal),
        lastContribution: toNumber(row.ultimo_aporte),
        liquidityReserve: toNumber(row.reserva_liquidez),
        paidPropertiesValue: toNumber(row.valor_imoveis_quitados),
        debt: {
          cheque_especial: row.cheque_especial,
          parcelamento_cartao: row.parcelamento_cartao,
          credito_pessoal: row.credito_pessoal,
          credito_consignado: row.credito_consignado,
        },
      });
    }
  }
  return map;
}

function buildAttendanceMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const uri = blankToNull(row.calendly_event_uri);
    if (!uri) continue;
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || new Date(0);
    const current = map.get(uri);
    if (!current || updated > current.updated) {
      map.set(uri, { updated, status: normalizeAttendanceStatus(row.status) });
    }
  }
  return map;
}

function consolidateMeetings(calendlyRows, manualRows, attendanceMap) {
  const byClient = new Map();
  const seenUris = new Set();
  const seenComposite = new Set();

  const push = (clientId, meeting) => {
    if (!clientId) return;
    if (!byClient.has(clientId)) byClient.set(clientId, []);
    byClient.get(clientId).push(meeting);
  };

  for (const row of calendlyRows) {
    const clientId = blankToNull(row.client_id);
    const start = parseDate(row.start_time);
    const uri = blankToNull(row.calendly_event_uri);
    const dedupe = uri || `cm:${row.id}`;
    if (seenUris.has(dedupe)) continue;
    seenUris.add(dedupe);
    const title = blankToNull(row.event_name) || "Reunião";
    const comp = clientId && start ? `${clientId}|${start.toISOString().slice(0, 16)}|${foldToken(title)}` : null;
    if (comp) seenComposite.add(comp);
    const attendance = uri ? attendanceMap.get(uri) : null;
    push(clientId ? String(clientId) : null, {
      startTime: start,
      attendanceStatus: attendance?.status || "desconhecido",
      title,
      source: "calendly",
    });
  }

  for (const row of manualRows) {
    const clientId = blankToNull(row.client_id);
    const start = parseDate(row.start_time);
    const title = blankToNull(row.title) || "Reunião manual";
    const googleId = blankToNull(row.google_event_id);
    if (googleId && seenUris.has(`g:${googleId}`)) continue;
    const comp = clientId && start ? `${clientId}|${start.toISOString().slice(0, 16)}|${foldToken(title)}` : null;
    if (comp && seenComposite.has(comp)) continue;
    if (googleId) seenUris.add(`g:${googleId}`);
    if (comp) seenComposite.add(comp);
    // Manual sem attendance: presença desconhecida (não conta como realizada).
    push(clientId ? String(clientId) : null, {
      startTime: start,
      attendanceStatus: "desconhecido",
      title,
      source: "manual",
    });
  }

  return byClient;
}

function distributionFrom(rows, getLabel, preferredOrder = null) {
  const total = rows.length || 1;
  const map = new Map();
  const labels = new Map();
  for (const row of rows) {
    const { key, label } = normalizeLabel(getLabel(row));
    const k = key || "__empty__";
    map.set(k, (map.get(k) || 0) + 1);
    if (!labels.has(k)) labels.set(k, label);
  }
  let entries = [...map.entries()].map(([k, count]) => ({
    key: k,
    label: labels.get(k),
    count,
    percent: pct(count, total),
  }));
  if (preferredOrder?.length) {
    const byLabel = new Map(entries.map((e) => [e.label, e]));
    entries = preferredOrder.map((label) => {
      const found = byLabel.get(label);
      return found || { key: foldToken(label), label, count: 0, percent: 0 };
    });
  } else {
    entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  }
  return entries;
}

function buildCancelMonthSeries(dates, now, monthsBack = 12) {
  const buckets = new Map();
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }
  const nowKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const date of dates) {
    if (!date || date > now) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key > nowKey || !buckets.has(key)) continue;
    buckets.set(key, buckets.get(key) + 1);
  }
  return [...buckets.entries()].map(([month, count]) => ({ month, label: month, count }));
}

function buildPayload(clients, cancellations, financialRows, calendlyRows, manualRows, attendanceRows) {
  const now = new Date();
  const { map: cancelMap, multiples, formatWarnings } = buildCancellationMap(cancellations);
  const financialMap = buildFinancialMap(financialRows);
  const attendanceMap = buildAttendanceMap(attendanceRows);
  const meetingsByClient = consolidateMeetings(calendlyRows, manualRows, attendanceMap);
  const clientById = new Map(clients.map((c) => [String(c.id), c]));

  const structuredWarnings = [];
  if (formatWarnings) {
    structuredWarnings.push({
      code: "DATE_FORMAT",
      message: `${formatWarnings} valor(es) de data de cancelamento com formato inconsistente (não parseável).`,
    });
  }

  // Orphans: cancel map sem cliente (agregado — não 1 aviso por registro)
  let orphanCancelCount = 0;
  for (const clientId of cancelMap.keys()) {
    if (!clientById.has(String(clientId))) orphanCancelCount += 1;
  }
  if (orphanCancelCount) {
    structuredWarnings.push({
      code: "ORPHAN_CANCEL",
      label: "Cancelamentos sem cliente correspondente",
      count: orphanCancelCount,
      severity: "warning",
      message: `${orphanCancelCount} cancelamento(s) sem cliente encontrado.`,
    });
  }

  const rows = [];
  const seenClientIds = new Set();

  const considerClient = (client, cancelInfo, dateSourceOverride = null) => {
    const clientId = String(client.id);
    if (seenClientIds.has(clientId)) return;
    if (!cancelInfo?.date) return;
    seenClientIds.add(clientId);

    const dataWarnings = [...(cancelInfo.warnings || [])];
    const cancellationDate = cancelInfo.date;
    const hireCycle = parseDate(client.data_inicio_ciclo);
    const createdAt = parseDate(client.created_at);
    const hireDate = hireCycle || createdAt;
    const hireSource = hireCycle ? "data_inicio_ciclo" : createdAt ? "created_at" : null;

    let daysToCancellation = null;
    let stayMonths = null;
    let stayRange = "Dados insuficientes";
    if (hireDate && cancellationDate) {
      const days = daysBetween(hireDate, cancellationDate);
      if (days < 0) {
        dataWarnings.push("Cancelamento anterior à contratação");
      } else if (cancellationDate > now) {
        dataWarnings.push("Data de cancelamento futura");
      } else {
        daysToCancellation = days;
        stayMonths = Math.floor(days / 30);
        stayRange = stayRangeFromMonths(stayMonths);
      }
    } else {
      if (!hireDate) dataWarnings.push("Data de contratação ausente");
      if (!cancellationDate) dataWarnings.push("Data de cancelamento ausente");
    }

    const motivoNorm = normalizeLabel(cancelInfo.motivo || client.motivo_churn);
    const categoriaNorm = normalizeLabel(cancelInfo.motivoCategoria);
    const hasReason = Boolean(motivoNorm.raw);
    if (!hasReason) dataWarnings.push("Motivo ausente");
    if (!categoriaNorm.raw) dataWarnings.push("Categoria ausente");
    if (multiples.has(client.id) || multiples.has(clientId)) {
      dataWarnings.push("Duplicidade de cancelamento (múltiplos processos ativos)");
    }

    const meetings = meetingsByClient.get(clientId) || [];
    const completedBefore = meetings
      .filter((m) => {
        if (!m.startTime || m.startTime > now) return false;
        if (m.attendanceStatus !== "compareceu") return false;
        return startOfDay(m.startTime) <= startOfDay(cancellationDate);
      })
      .sort((a, b) => a.startTime - b.startTime);

    const meetingsAfterCancel = meetings.filter(
      (m) => m.startTime && m.attendanceStatus === "compareceu" && startOfDay(m.startTime) > startOfDay(cancellationDate),
    );
    if (meetingsAfterCancel.length) dataWarnings.push("Reunião posterior ao cancelamento");

    const meetingsBeforeCount = completedBefore.length;
    const lastMeeting = completedBefore.length ? completedBefore[completedBefore.length - 1] : null;
    let daysSinceLastMeeting = null;
    if (lastMeeting?.startTime) {
      const d = daysBetween(lastMeeting.startTime, cancellationDate);
      if (d >= 0) daysSinceLastMeeting = d;
    } else {
      dataWarnings.push("Cliente sem reunião realizada anterior ao cancelamento");
    }

    const financial = financialMap.get(clientId) || financialMap.get(client.id) || null;
    let financialUpdateDate = null;
    let financialUpdateSource = "unavailable";
    let daysSinceFinancialUpdate = null;
    if (financial?.date) {
      if (startOfDay(financial.date) > startOfDay(cancellationDate)) {
        dataWarnings.push("Atualização financeira posterior ao cancelamento");
      } else {
        financialUpdateDate = financial.date;
        financialUpdateSource = financial.source;
        daysSinceFinancialUpdate = daysBetween(financial.date, cancellationDate);
        if (daysSinceFinancialUpdate < 0) {
          daysSinceFinancialUpdate = null;
          dataWarnings.push("Valor negativo em dias sem atualização financeira");
        }
      }
    } else {
      dataWarnings.push("Cliente sem atualização financeira anterior");
    }

    const segmentInfo = calculateClientSegment(
      {
        monthlyIncome: financial?.monthlyIncome ?? null,
        liquidityReserve: financial?.liquidityReserve ?? null,
        lastContribution: financial?.lastContribution ?? null,
        paidPropertiesValue: financial?.paidPropertiesValue ?? null,
      },
      financial?.debt || {},
    );

    const insufficientCore =
      daysToCancellation == null
      || meetingsBeforeCount == null
      || (!hasReason && daysSinceFinancialUpdate == null && daysSinceLastMeeting == null);

    rows.push({
      clientId,
      clientCode: blankToNull(client.codigo) || "Não informado",
      clientName: blankToNull(client.name) || "Não informado",
      engineer: normalizeLabel(client.engenheiro_patrimonial).label,
      segment: segmentInfo.segmentLabel || "Dados insuficientes",
      analyticalStatus: "Cancelado",
      hireDate: hireDate ? hireDate.toISOString() : null,
      hireDateSource: hireSource,
      cancellationDate: cancellationDate.toISOString(),
      cancellationDateSource: dateSourceOverride || cancelInfo.dateSource || "cancellations",
      cancellationStage: cancelInfo.stage || null,
      daysToCancellation,
      stayMonths,
      stayRange,
      reason: motivoNorm.label,
      reasonRaw: motivoNorm.raw,
      hasReason,
      category: categoriaNorm.label,
      categoryRaw: categoriaNorm.raw,
      meetingsBeforeCancellation: meetingsBeforeCount,
      meetingsBeforeBand: meetingCountBand(meetingsBeforeCount),
      lastMeetingDate: lastMeeting?.startTime ? lastMeeting.startTime.toISOString() : null,
      daysSinceLastMeeting,
      lastInteractionDate: lastMeeting?.startTime ? lastMeeting.startTime.toISOString() : null,
      daysWithoutInteraction: daysSinceLastMeeting,
      interactionDefinition: "last_completed_meeting_before_cancellation",
      financialUpdateDate: financialUpdateDate ? financialUpdateDate.toISOString() : null,
      financialUpdateSource,
      daysSinceFinancialUpdate,
      financialRecencyBand: financialRecencyBand(daysSinceFinancialUpdate),
      insufficientData: Boolean(insufficientCore),
      meetingsSummary: completedBefore.slice(-5).map((m) => ({
        title: m.title,
        startTime: m.startTime.toISOString(),
        source: m.source,
      })),
      dataWarnings: [...new Set(dataWarnings)],
    });
  };

  for (const client of clients) {
    const info = cancelMap.get(client.id) || cancelMap.get(String(client.id));
    if (info?.date) {
      considerClient(client, info);
      continue;
    }
    // Fallback alinhado ao Dados Gerais: data_churn
    const churn = parseDate(client.data_churn);
    if (churn) {
      considerClient(client, {
        date: churn,
        stage: null,
        warnings: ["Data de cancelamento via clients.data_churn (fallback)"],
        dateSource: "clients.data_churn",
        motivo: blankToNull(client.motivo_churn),
        motivoCategoria: null,
      }, "clients.data_churn");
    }
  }

  const total = rows.length;
  const withReason = rows.filter((r) => r.hasReason).length;
  const withoutReason = total - withReason;
  const stayStats = robustStats(rows.map((r) => r.daysToCancellation));
  const meetingStats = robustStats(rows.map((r) => r.meetingsBeforeCancellation));
  const financialStats = robustStats(rows.map((r) => r.daysSinceFinancialUpdate).filter((d) => d != null));
  const interactionStats = robustStats(rows.map((r) => r.daysWithoutInteraction).filter((d) => d != null));
  const insufficientDataClients = rows.filter((r) => r.insufficientData).length;

  const byEngineer = distributionFrom(rows, (r) => (r.engineer === "Não informado" ? null : r.engineer)).map((e) => ({
    ...e,
    sampleSize: e.count,
    percentOfCancellations: e.percent,
  }));

  return {
    generatedAt: now.toISOString(),
    source: "public.cancellations + public.clients (BASE QV)",
    interactionDefinition: {
      version: 1,
      label: "Dias desde a última reunião antes do cancelamento",
      rule: "Última reunião com presença confirmada (compareceu) com data <= cancelamento.",
      pendingAppPharus: ["mecanismos implementados antes do cancelamento", "último acesso antes do cancelamento"],
    },
    summary: {
      totalCancellations: total,
      withReason,
      withoutReason,
      withReasonPercent: pct(withReason, total || 1),
      withoutReasonPercent: pct(withoutReason, total || 1),
      medianDaysToCancellation: stayStats.median,
      averageDaysToCancellation: stayStats.mean,
      staySampleSize: stayStats.validCount,
      medianMeetingsBeforeCancellation: meetingStats.median,
      averageMeetingsBeforeCancellation: meetingStats.mean,
      meetingsSampleSize: meetingStats.validCount,
      medianDaysSinceFinancialUpdate: financialStats.median,
      averageDaysSinceFinancialUpdate: financialStats.mean,
      financialSampleSize: financialStats.validCount,
      medianDaysWithoutInteraction: interactionStats.median,
      averageDaysWithoutInteraction: interactionStats.mean,
      interactionSampleSize: interactionStats.validCount,
      insufficientDataClients,
      topReason: distributionFrom(rows.filter((r) => r.hasReason), (r) => r.reason)[0]?.label || null,
    },
    distributions: {
      byReason: distributionFrom(rows, (r) => (r.hasReason ? r.reason : null)),
      byCategory: distributionFrom(rows, (r) => (r.categoryRaw ? r.category : null)),
      byMonth: buildCancelMonthSeries(rows.map((r) => parseDate(r.cancellationDate)).filter(Boolean), now, 12),
      byStayRange: distributionFrom(rows, (r) => r.stayRange, STAY_RANGES),
      byMeetingCount: distributionFrom(rows, (r) => r.meetingsBeforeBand, MEETING_RANGES),
      byFinancialRecency: distributionFrom(rows, (r) => r.financialRecencyBand, FINANCIAL_RANGES),
      byEngineer,
      bySegment: distributionFrom(rows, (r) => r.segment, SEGMENT_LABELS),
    },
    clients: rows,
    warnings: structuredWarnings,
    quality: {
      usedFields: USED_FIELDS,
      meetingRule: "presence_confirmed_compareceu_only",
      pendingAppPharus: [
        "mecanismos implementados antes do cancelamento",
        "último acesso antes do cancelamento",
      ],
    },
  };
}

export async function computeCancellationsPayload() {
  const configError = dataConfigurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }
  const [clients, cancellations, financialRows, calendlyRows, manualRows, attendanceRows] = await Promise.all([
    fetchAll("clients", CLIENT_SELECT),
    fetchAll("cancellations", CANCEL_SELECT),
    fetchAll("client_financial_data", FINANCIAL_SELECT),
    fetchAll("client_meetings", CALENDLY_SELECT),
    fetchAll("manual_meetings", MANUAL_SELECT),
    fetchAll("meeting_attendance", ATTENDANCE_SELECT),
  ]);
  return buildPayload(clients, cancellations, financialRows, calendlyRows, manualRows, attendanceRows);
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }

  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  const configError = dataConfigurationError();
  if (configError) {
    return Response.json({ error: configError, code: "config" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const started = Date.now();
    const payload = await computeCancellationsPayload();
    console.error(
      `[Cancellations] endpoint=/api/cancellations status=200 ms=${Date.now() - started} ` +
        `total=${payload?.summary?.totalCancellations ?? "?"}`,
    );
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "[Cancellations] endpoint=/api/cancellations status=500 " +
        `code=${error?.code || "data_query_failed"} message=${error instanceof Error ? error.message : String(error)}`,
    );
    return Response.json(
      {
        error: "Não foi possível consultar os cancelamentos.",
        code: error?.code || "data_query_failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
