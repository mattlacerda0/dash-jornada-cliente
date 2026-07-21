import { computeGeneralDataPayload, measureBundle } from "../general-data.mjs";
import { computeMeetingsPayload } from "../meetings.mjs";

/**
 * Motor central de consulta do portal ("Assistente da Jornada" global).
 *
 * Responsabilidades (o backend é a fonte de verdade; o Gemini apenas verbaliza):
 *  1. identificar domínio/página e métrica a partir da pergunta;
 *  2. extrair e validar os filtros presentes por domínio;
 *  3. resolver entidades (ex.: Engenheiro Patrimonial) contra os valores REAIS do payload;
 *  4. aplicar os filtros ANTES de calcular a métrica, reaproveitando as linhas já
 *     normalizadas/deduplicadas pelos compute*Payload dos dashboards (não duplica regra);
 *  5. montar o dados_contexto confiável enviado ao n8n.
 *
 * Fase 1: domínios `general` e `meetings`. Demais domínios ficam reconhecidos como
 * "ainda não disponível" (sem inventar valores) até as próximas fases.
 */

const SUPABASE = "public";

/* ------------------------------------------------------------------ */
/* Utilitários de texto                                                */
/* ------------------------------------------------------------------ */

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Contrato global de filtros                                          */
/* ------------------------------------------------------------------ */

/** Objeto de filtros comum a todas as páginas (nem todo domínio usa todos). */
export function emptyFilters() {
  return {
    search: null,
    clientId: null,
    clientCode: null,
    clientName: null,
    engineer: null,
    status: null,
    segment: null,
    period: "all_time",
    dateFrom: null,
    dateTo: null,
    attendanceStatus: null,
    frequency: null,
    firstMeeting: null,
    hasNoShow: null,
    hasReschedule: null,
    mechanism: null,
    mechanismStatus: null,
    category: null,
    updatedRecently: null,
    financialRecency: null,
    supportStatus: null,
    priority: null,
    requestedByClient: null,
    assignedTo: null,
    hasResolution: null,
    dataQualityStatus: null,
    column: null,
    table: null,
  };
}

/* ------------------------------------------------------------------ */
/* Datas e períodos                                                    */
/*                                                                     */
/* IMPORTANTE: a página Reuniões (frontend) trabalha em UTC/instantes: */
/*  - presets "últimos N dias" = (agora - N dias) SEM limite superior  */
/*    (inclui reuniões futuras);                                       */
/*  - intervalos calendário (De/Até, mês, ano) = dia UTC inclusivo.    */
/* Para o chatbot bater EXATAMENTE com o dashboard, replicamos essa    */
/* mesma convenção (não usamos deslocamento de fuso local aqui).       */
/* ------------------------------------------------------------------ */

function ymd(date) {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), dow: date.getUTCDay() };
}

const MONTHS_PT = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

/** Retorna {y,m,d} (UTC) a partir de dd/mm/aaaa ou aaaa-mm-dd. */
function parseExplicitDate(token) {
  if (!token) return null;
  const iso = token.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]) - 1, d: Number(iso[3]) };
  const br = token.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const y = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return { y, m: Number(br[2]) - 1, d: Number(br[1]) };
  }
  return null;
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/**
 * Interpreta o período mencionado na pergunta e devolve metadados:
 *  { kind: 'all'|'rolling'|'calendar', rollingDays, from:{y,m,d}|null, to:{y,m,d}|null, period, label }
 * A conversão para instantes (com a semântica correta por domínio) é feita
 * em rangeInstants (general) e meetingPeriod (meetings).
 */
function parsePeriod(n, now) {
  const { y, m, d, dow } = ymd(now);
  const cal = (from, to, period, label) => ({ kind: "calendar", rollingDays: null, from, to, period, label });
  const roll = (days, period, label) => ({ kind: "rolling", rollingDays: days, from: null, to: null, period, label });
  const none = () => ({ kind: "all", rollingDays: null, from: null, to: null, period: "all_time", label: null });
  const today = { y, m, d };
  const shift = (dd) => { const t = new Date(Date.UTC(y, m, d) + dd * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; };

  const entre = n.match(/entre\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\s+e\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
  if (entre) {
    const a = parseExplicitDate(entre[1]);
    const b = parseExplicitDate(entre[2]);
    if (a && b) return cal(a, b, "custom", `entre ${entre[1]} e ${entre[2]}`);
  }
  const desde = n.match(/(?:desde|a partir de)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
  if (desde) {
    const a = parseExplicitDate(desde[1]);
    if (a) return cal(a, null, "custom", `desde ${desde[1]}`);
  }
  const ate = n.match(/\bate\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
  if (ate) {
    const b = parseExplicitDate(ate[1]);
    if (b) return cal(null, b, "custom", `até ${ate[1]}`);
  }

  const mesAno = n.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})/);
  if (mesAno) {
    const mm = MONTHS_PT[mesAno[1]];
    const yy = Number(mesAno[2]);
    return cal({ y: yy, m: mm, d: 1 }, { y: yy, m: mm, d: lastDayOfMonth(yy, mm) }, "custom", `${mesAno[1]} de ${yy}`);
  }
  const emAno = n.match(/\bem\s+(\d{4})\b/);
  if (emAno) {
    const yy = Number(emAno[1]);
    return cal({ y: yy, m: 0, d: 1 }, { y: yy, m: 11, d: 31 }, "year", `ano de ${yy}`);
  }

  const lastN = n.match(/ultim[oa]s?\s+(\d{1,3})\s+dias/);
  if (lastN) {
    const days = Number(lastN[1]);
    return roll(days, `last_${days}_days`, `últimos ${days} dias`);
  }
  if (/ultim[oa]s?\s+(7|sete)\s+dias/.test(n)) return roll(7, "last_7_days", "últimos 7 dias");
  if (/ultim[oa]s?\s+(30|trinta)\s+dias/.test(n)) return roll(30, "last_30_days", "últimos 30 dias");
  if (/ultim[oa]s?\s+(90|noventa)\s+dias/.test(n)) return roll(90, "last_90_days", "últimos 90 dias");

  if (/\bhoje\b/.test(n)) return cal(today, today, "today", "hoje");
  if (/\bontem\b/.test(n)) { const yst = shift(-1); return cal(yst, yst, "yesterday", "ontem"); }

  if (/semana passada|semana anterior|ultima semana/.test(n)) {
    const off = (dow + 6) % 7;
    const from = shift(-off - 7);
    const to = shift(-off - 1);
    return cal(from, to, "last_week", "semana passada");
  }
  if (/esta semana|nesta semana|semana atual/.test(n)) {
    const off = (dow + 6) % 7;
    return cal(shift(-off), today, "this_week", "esta semana");
  }

  if (/mes passado|mes anterior|ultimo mes/.test(n)) {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return cal({ y: py, m: pm, d: 1 }, { y: py, m: pm, d: lastDayOfMonth(py, pm) }, "last_month", "mês passado");
  }
  if (/este mes|neste mes|mes atual/.test(n)) {
    return cal({ y, m, d: 1 }, { y, m, d: lastDayOfMonth(y, m) }, "this_month", "este mês");
  }

  if (/ano passado|ano anterior|ultimo ano/.test(n)) {
    return cal({ y: y - 1, m: 0, d: 1 }, { y: y - 1, m: 11, d: 31 }, "last_year", "ano passado");
  }
  if (/este ano|neste ano|ano atual/.test(n)) {
    return cal({ y, m: 0, d: 1 }, { y, m: 11, d: 31 }, "this_year", "este ano");
  }

  return none();
}

function utcDayStart(c) {
  return new Date(Date.UTC(c.y, c.m, c.d, 0, 0, 0, 0));
}

/** Instantes [from, to) para o domínio general (fim exclusivo = dia seguinte). */
function rangeInstants(meta, now) {
  if (meta.kind === "all") return { from: null, to: null };
  if (meta.kind === "rolling") return { from: new Date(now.getTime() - meta.rollingDays * 86400000), to: null };
  const from = meta.from ? utcDayStart(meta.from) : null;
  const to = meta.to ? new Date(Date.UTC(meta.to.y, meta.to.m, meta.to.d + 1, 0, 0, 0, 0)) : null;
  return { from, to };
}

function toDate(v) {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

function withinRange(isoOrDate, from, to) {
  const t = toDate(isoOrDate);
  if (!t || Number.isNaN(t.getTime())) return false;
  const f = toDate(from);
  const tt = toDate(to);
  if (f && t < f) return false;
  if (tt && t >= tt) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Parsers globais reutilizáveis                                       */
/* ------------------------------------------------------------------ */

function parseStatusFilter(n) {
  if (/cancelad|churn|encerrad|inativ|distrat/.test(n)) return { status: "Cancelado", label: "Status: Cancelado" };
  if (/congelad|pausad|freeze|frozen/.test(n)) return { status: "Congelado", label: "Status: Congelado" };
  if (/\bativ/.test(n)) return { status: "Ativo", label: "Status: Ativo" };
  return { status: null, label: null };
}

function parseSegmentFilter(n) {
  if (/\bapex\b/.test(n)) return { segment: "APEX", label: "Segmento: APEX" };
  if (/\bprivate\b/.test(n)) return { segment: "PRIVATE", label: "Segmento: PRIVATE" };
  if (/\bprincipal\b/.test(n)) return { segment: "PRINCIPAL", label: "Segmento: PRINCIPAL" };
  if (/\bdebts\b|endivid|divida/.test(n)) return { segment: "DEBTS", label: "Segmento: DEBTS" };
  if (/\bover\b/.test(n)) return { segment: "OVER", label: "Segmento: OVER" };
  if (/dados insuficientes|sem dados suficientes/.test(n)) return { segment: "Dados insuficientes", label: "Segmento: Dados insuficientes" };
  return { segment: null, label: null };
}

/** Extrai o token textual do Engenheiro Patrimonial (resolução real ocorre depois). */
function parseEngineerToken(n) {
  const patterns = [
    /(?:engenheir[oa])\s+(?:patrimonial\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){0,2})/,
    /\bep\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2})/,
    /carteira\s+(?:d[aeo])\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2})/,
  ];
  const STOP = new Set(["temos", "tem", "teve", "tiveram", "possui", "possuem", "esta", "estao", "foram", "fez", "fizeram", "de", "do", "da", "no", "na", "e", "com", "ativos", "ativo", "cancelados", "nos", "nas", "este", "esta"]);
  for (const re of patterns) {
    const m = n.match(re);
    if (m && m[1]) {
      const words = m[1].split(" ").filter((w) => w && !STOP.has(w));
      if (words.length) return words.slice(0, 2).join(" ");
    }
  }
  return null;
}

function parseAttendanceFilter(n) {
  if (/no.?show|nao compareceu|nao compareceram|faltaram|faltas|faltou|ausenc/.test(n)) {
    return { hasNoShow: true, attendanceStatus: "nao_compareceu", label: "Presença: no-show" };
  }
  if (/remarcad|reagendad/.test(n)) return { hasReschedule: true, label: "Remarcação: sim" };
  if (/compareceu|compareceram|presente/.test(n)) return { attendanceStatus: "compareceu", label: "Presença: compareceu" };
  return {};
}

/* ------------------------------------------------------------------ */
/* Catálogo de métricas por domínio                                    */
/* ------------------------------------------------------------------ */

const CLIENTS_ID = { schema: SUPABASE, table: "clients", column: "id" };
const CLIENTS_STATUS = { schema: SUPABASE, table: "clients", column: "status" };
const CLIENTS_ENGINEER = { schema: SUPABASE, table: "clients", column: "engenheiro_patrimonial" };
const CANCEL_SOURCES = [
  { schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },
  { schema: SUPABASE, table: "cancellations", column: "data_pedido" },
  { schema: SUPABASE, table: "cancellations", column: "intencao_registrada_at" },
];
const FINANCIAL_SOURCES = [
  { schema: SUPABASE, table: "client_financial_data", column: "ultima_renda_mensal" },
  { schema: SUPABASE, table: "client_financial_data", column: "ultimo_aporte" },
  { schema: SUPABASE, table: "client_financial_data", column: "reserva_liquidez" },
];
const ACQUISITION_SOURCES = [
  { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
  { schema: SUPABASE, table: "clients", column: "created_at" },
];
const MEETING_SOURCES = [
  { schema: SUPABASE, table: "client_meetings", column: "start_time" },
  { schema: SUPABASE, table: "manual_meetings", column: "start_time" },
];
const ATTENDANCE_SOURCE = [{ schema: SUPABASE, table: "meeting_attendance", column: "status" }];

const SEGMENT_LABELS = { APEX: "Clientes APEX", PRIVATE: "Clientes PRIVATE", PRINCIPAL: "Clientes PRINCIPAL", DEBTS: "Clientes DEBTS", OVER: "Clientes OVER" };

function monthsBetween(a, b) {
  if (!a || !b) return 1;
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, months);
}

/* --------------------------- Domínio general ---------------------- */

function applyGeneralFilters(rows, f) {
  return rows.filter((r) => {
    if (f.engineer && r.engineer !== f.engineer) return false;
    if (f.status && r.analyticalStatus !== f.status) return false;
    if (f.segment && r.segmentLabel !== f.segment) return false;
    if (f.dateFrom || f.dateTo) {
      if (!withinRange(r.acquisitionDate, f.dateFrom, f.dateTo)) return false;
    }
    return true;
  });
}

const GENERAL_METRICS = {
  total_clients: { label: "Total de clientes", sources: [CLIENTS_ID], compute: (rows) => rows.length },
  active_clients: { label: "Clientes ativos", implied: { status: "Ativo" }, sources: [CLIENTS_STATUS, ...CANCEL_SOURCES], compute: (rows) => rows.length },
  cancelled_clients: { label: "Clientes cancelados", implied: { status: "Cancelado" }, sources: [CLIENTS_STATUS, ...CANCEL_SOURCES], compute: (rows) => rows.length },
  frozen_clients: { label: "Clientes congelados", implied: { status: "Congelado" }, sources: [CLIENTS_STATUS], compute: (rows) => rows.length },
  clients_with_financial_data: { label: "Clientes com dados financeiros", sources: FINANCIAL_SOURCES, compute: (rows) => rows.filter((r) => r.hasFinancialProfile).length },
  apex_clients: { label: "Clientes APEX", implied: { segment: "APEX" }, sources: FINANCIAL_SOURCES, compute: (rows) => rows.length },
  private_clients: { label: "Clientes PRIVATE", implied: { segment: "PRIVATE" }, sources: FINANCIAL_SOURCES, compute: (rows) => rows.length },
  principal_clients: { label: "Clientes PRINCIPAL", implied: { segment: "PRINCIPAL" }, sources: FINANCIAL_SOURCES, compute: (rows) => rows.length },
  debts_clients: { label: "Clientes DEBTS", implied: { segment: "DEBTS" }, sources: FINANCIAL_SOURCES, compute: (rows) => rows.length },
  over_clients: { label: "Clientes OVER", implied: { segment: "OVER" }, sources: FINANCIAL_SOURCES, compute: (rows) => rows.length },
  insufficient_segment_data: { label: "Clientes sem dados suficientes para segmento", sources: FINANCIAL_SOURCES, compute: (rows) => rows.filter((r) => r.segmentStatus === "insufficient_data").length },
  acquired_clients: { label: "Clientes contratados", sources: ACQUISITION_SOURCES, compute: (rows) => rows.filter((r) => r.acquisitionDate).length },
  median_stay_days: { label: "Permanência típica (dias)", type: "median", sources: [{ schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" }], compute: (rows) => measureBundle("stayDays", rows.map((r) => r.stayDays).filter((v) => v != null)).displayValue },
  median_monthly_income: { label: "Renda mensal típica", type: "median", sources: [FINANCIAL_SOURCES[0]], compute: (rows) => measureBundle("monthlyIncome", rows.map((r) => r.monthlyIncome).filter((v) => v != null)).displayValue },
  median_liquidity_reserve: { label: "Reserva de liquidez típica", type: "median", sources: [FINANCIAL_SOURCES[2]], compute: (rows) => measureBundle("liquidityReserve", rows.map((r) => r.liquidityReserve).filter((v) => v != null)).displayValue },
  median_last_contribution: { label: "Último aporte típico", type: "median", sources: [FINANCIAL_SOURCES[1]], compute: (rows) => measureBundle("lastContribution", rows.map((r) => r.lastContribution).filter((v) => v != null)).displayValue },
};

const GENERAL_ALLOWED_FILTERS = ["engineer", "status", "segment", "period", "dateFrom", "dateTo", "search", "clientId", "clientCode", "clientName"];

/* --------------------------- Domínio meetings --------------------- */
/*
 * PORTE FIEL da lógica do dashboard Reuniões (index.html):
 * applyMeetingFilters + calculateMeetingSummary. Mesma coleção normalizada
 * (payload.clients[].meetings), mesma exclusão (before_client_entry/invalid),
 * mesma deduplicação (meetingId), mesmos filtros e mesmas fórmulas.
 * Assim o chatbot e a tela produzem exatamente os mesmos números.
 */

function isAnalyticMeeting(m) {
  return m && m.meetingDateStatus !== "before_client_entry" && m.meetingDateStatus !== "invalid";
}

/**
 * Converte os metadados de período na janela usada pela tela:
 *  - rolling ("últimos N dias"): from = agora - N dias, to = null (inclui futuras);
 *  - calendário: dia UTC inclusivo [00:00:00Z, 23:59:59.999Z].
 * divisor replica periodMonthDivisor do dashboard (30->1, 90->3, 180->6, 365->12; custom->meses).
 */
function meetingPeriod(meta, now) {
  if (meta.kind === "all") return { active: false, from: null, to: null, divisor: null };
  if (meta.kind === "rolling") {
    const from = new Date(now.getTime() - meta.rollingDays * 86400000);
    const preset = { 30: 1, 90: 3, 180: 6, 365: 12 }[meta.rollingDays];
    const divisor = preset || Math.max(1, Math.round(meta.rollingDays / 30));
    return { active: true, from, to: null, divisor };
  }
  const from = meta.from ? new Date(Date.UTC(meta.from.y, meta.from.m, meta.from.d, 0, 0, 0, 0)) : null;
  const to = meta.to ? new Date(Date.UTC(meta.to.y, meta.to.m, meta.to.d, 23, 59, 59, 999)) : null;
  let divisor = 1;
  if (meta.from && meta.to) divisor = Math.max(1, (meta.to.y - meta.from.y) * 12 + (meta.to.m - meta.from.m) + 1);
  return { active: true, from, to, divisor };
}

function meetingInPeriod(m, mp) {
  const s = m.startTime ? new Date(m.startTime) : null;
  if (!s || Number.isNaN(s.getTime())) return false;
  if (mp.from && s < mp.from) return false;
  if (mp.to && s > mp.to) return false;
  return true;
}

function clientMeetingsInPeriod(c, mp) {
  const all = (c.meetings || []).filter(isAnalyticMeeting);
  if (!mp.active) return all;
  return all.filter((m) => meetingInPeriod(m, mp));
}

function percentileSorted(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function avgNums(a) {
  if (!a.length) return null;
  return Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100;
}

/** Porte de robustStatsClient (mediana). */
function robustStatsPort(values, allowNeg = false) {
  const filled = values.filter((v) => v != null && Number.isFinite(v));
  const valid = filled.filter((v) => allowNeg || v >= 0).sort((a, b) => a - b);
  if (!valid.length) return { mean: null, median: null, validCount: 0 };
  const mean = avgNums(valid);
  const median = Math.round(percentileSorted(valid, 50) * 100) / 100;
  return { mean, median, validCount: valid.length };
}

function meetingDaysBetweenUTC(a, b) {
  return Math.floor((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) -
    Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86400000);
}

/** Métricas por cliente recalculadas no recorte de período (porte de enrichMeetingClientMetrics). */
function enrichScopedClient(meetings, now) {
  const completed = meetings
    .filter((m) => { const s = m.startTime ? new Date(m.startTime) : null; return s && s <= now && m.attendanceStatus === "compareceu"; })
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const pastAny = meetings
    .filter((m) => { const s = m.startTime ? new Date(m.startTime) : null; return s && s <= now && m.attendanceStatus !== "cancelada"; })
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  let daysSinceLastMeeting = null;
  const lastSrc = completed.length ? completed : pastAny;
  if (lastSrc.length) {
    const lastDate = new Date(lastSrc[lastSrc.length - 1].startTime);
    if (!Number.isNaN(lastDate.getTime()) && lastDate <= now) {
      const days = meetingDaysBetweenUTC(lastDate, now);
      if (days >= 0) daysSinceLastMeeting = days;
    }
  }

  const intervals = [];
  const seen = new Set();
  const deduped = [];
  for (const m of completed) {
    const t = new Date(m.startTime).getTime();
    if (seen.has(t)) continue;
    seen.add(t);
    deduped.push(m);
  }
  for (let i = 1; i < deduped.length; i += 1) {
    const diff = meetingDaysBetweenUTC(new Date(deduped[i - 1].startTime), new Date(deduped[i].startTime));
    if (diff > 0) intervals.push(diff);
  }
  const intervalStats = robustStatsPort(intervals);
  return {
    absences: meetings.filter((m) => m.attendanceStatus === "nao_compareceu").length,
    reschedules: meetings.filter((m) => m.rescheduled).length,
    daysSinceLastMeeting,
    typicalIntervalDays: intervalStats.median,
    averageIntervalDays: intervalStats.mean,
  };
}

/** Porte de applyMeetingFilters (sem os filtros de busca/frequência, não usados pelo chatbot). */
function applyMeetingFiltersPort(clients, mf, mp, now) {
  const periodActive = mp.active;
  const rows = [];
  for (const c of clients) {
    const meetings = clientMeetingsInPeriod(c, mp);
    if (mf.engineer && c.engineer !== mf.engineer) continue;
    if (mf.first === "yes" && c.firstMeetingCompleted !== true) continue;
    if (mf.first === "no" && c.firstMeetingCompleted !== false) continue;
    if (mf.attendance !== "all" && !meetings.some((m) => m.attendanceStatus === mf.attendance)) continue;
    if (periodActive && !meetings.length) continue;
    const scopedAbsences = periodActive ? meetings.filter((m) => m.attendanceStatus === "nao_compareceu").length : c.absences;
    const scopedReschedules = periodActive ? meetings.filter((m) => m.rescheduled).length : c.reschedules;
    if (mf.absence === "yes" && !(scopedAbsences > 0)) continue;
    if (mf.reschedule === "yes" && !(scopedReschedules > 0)) continue;
    if (periodActive) {
      const e = enrichScopedClient(meetings, now);
      rows.push({ ...c, meetings, absences: e.absences, reschedules: e.reschedules, daysSinceLastMeeting: e.daysSinceLastMeeting, typicalIntervalDays: e.typicalIntervalDays, averageIntervalDays: e.averageIntervalDays });
    } else {
      rows.push({ ...c, meetings: (c.meetings || []).filter(isAnalyticMeeting) });
    }
  }
  return rows;
}

/** Porte de calculateMeetingSummary (dedup por meetingId, mesmas fórmulas). */
function calculateMeetingSummaryPort(rows, mp, now) {
  const periodActive = mp.active;
  const meetings = rows.flatMap((c) => (c.meetings || []).filter(isAnalyticMeeting));
  const uniqueIds = new Set();
  let totalMeetings = 0;
  for (const m of meetings) {
    const key = m.meetingId || `${m.source}|${m.startTime}|${m.title || ""}`;
    if (uniqueIds.has(key)) continue;
    uniqueIds.add(key);
    totalMeetings += 1;
  }
  let averageMeetingsPerMonth = null;
  if (totalMeetings) {
    if (periodActive) {
      if (mp.divisor) averageMeetingsPerMonth = Math.round((totalMeetings / mp.divisor) * 10) / 10;
    } else {
      const dated = meetings.map((m) => new Date(m.startTime)).filter((x) => !Number.isNaN(x.getTime())).sort((a, b) => a - b);
      if (dated.length) averageMeetingsPerMonth = Math.round((totalMeetings / monthsBetween(dated[0], dated[dated.length - 1])) * 10) / 10;
    }
  }
  const daysSinceStats = robustStatsPort(rows.map((c) => c.daysSinceLastMeeting).filter((v) => v != null));
  const intervalStats = robustStatsPort(rows.map((c) => c.typicalIntervalDays ?? c.averageIntervalDays).filter((v) => v != null && v >= 0));
  const totalNoShows = rows.reduce((a, c) => a + (c.absences || 0), 0);
  const totalReschedules = rows.reduce((a, c) => a + (c.reschedules || 0), 0);
  const classifiable = meetings.filter((m) => {
    const s = m.startTime ? new Date(m.startTime) : null;
    if (!s || s > now) return false;
    return m.attendanceStatus === "compareceu" || m.attendanceStatus === "nao_compareceu";
  });
  const attended = classifiable.filter((m) => m.attendanceStatus === "compareceu").length;
  const attendanceRate = classifiable.length ? Math.round((attended / classifiable.length) * 1000) / 10 : null;
  return {
    totalMeetings,
    averageMeetingsPerMonth,
    totalNoShows,
    totalReschedules,
    attendanceRate,
    clientsWithFirstMeeting: rows.filter((c) => c.firstMeetingCompleted === true).length,
    typicalDaysSinceLastMeeting: daysSinceStats.median,
    typicalIntervalDays: intervalStats.median,
    periodMonthDivisor: periodActive ? mp.divisor : null,
    filteredClients: rows.length,
  };
}

/** Fonte única do domínio Reuniões: retorna records filtrados + metadados + summary. */
function getFilteredMeetings(payload, mf, meta, now) {
  const mp = meetingPeriod(meta, now);
  const clients = payload.clients || [];
  const totalBeforeFilters = clients.reduce((a, c) => a + (c.meetings || []).filter(isAnalyticMeeting).length, 0);
  const rows = applyMeetingFiltersPort(clients, mf, mp, now);
  const summary = calculateMeetingSummaryPort(rows, mp, now);
  return {
    summary,
    metadata: {
      dateFrom: mp.from ? mp.from.toISOString() : null,
      dateTo: mp.to ? mp.to.toISOString() : null,
      timezone: "UTC (mesma convenção do dashboard Reuniões)",
      periodOpenEnded: mp.active && !mp.to,
      periodMonthDivisor: summary.periodMonthDivisor,
      totalBeforeFilters,
      totalAfterFilters: summary.totalMeetings,
    },
  };
}

const MEETINGS_METRICS = {
  total_meetings: { label: "Total de reuniões", field: "totalMeetings", definition: "registered", sources: MEETING_SOURCES },
  no_show_meetings: { label: "Reuniões com no-show", field: "totalNoShows", definition: "no_show", sources: ATTENDANCE_SOURCE },
  rescheduled_meetings: { label: "Reuniões remarcadas", field: "totalReschedules", definition: "rescheduled", sources: ATTENDANCE_SOURCE },
  attendance_rate: { label: "Taxa de comparecimento (%)", field: "attendanceRate", type: "rate", definition: "completed_rate", sources: ATTENDANCE_SOURCE },
  average_meetings_per_month: { label: "Média de reuniões por mês", field: "averageMeetingsPerMonth", type: "rate", definition: "registered_per_month", sources: MEETING_SOURCES },
  clients_with_first_meeting: { label: "Clientes com primeira reunião", field: "clientsWithFirstMeeting", definition: "clients", sources: MEETING_SOURCES },
  days_since_last_meeting: { label: "Dias desde a última reunião (típico)", field: "typicalDaysSinceLastMeeting", type: "median", definition: "median_days", sources: MEETING_SOURCES },
  typical_interval: { label: "Intervalo típico entre reuniões (dias)", field: "typicalIntervalDays", type: "median", definition: "median_days", sources: MEETING_SOURCES },
};

const MEETINGS_ALLOWED_FILTERS = ["engineer", "period", "dateFrom", "dateTo", "attendanceStatus", "hasNoShow", "hasReschedule", "firstMeeting", "frequency", "search", "clientId", "clientCode", "clientName"];

/* ------------------------------------------------------------------ */
/* Registro central de domínios                                        */
/* ------------------------------------------------------------------ */

export const portalDomains = {
  general: { compute: computeGeneralDataPayload, metrics: GENERAL_METRICS, allowedFilters: GENERAL_ALLOWED_FILTERS },
  meetings: { compute: computeMeetingsPayload, metrics: MEETINGS_METRICS, allowedFilters: MEETINGS_ALLOWED_FILTERS },
  // Fases seguintes:
  mechanisms: { pending: true },
  financial_updates: { pending: true },
  support: { pending: true },
  quality: { pending: true },
};

/**
 * Cues de domínios de fases futuras. Detectados ANTES das métricas de general/meetings
 * para não roubar a intenção (ex.: "mecanismos dos clientes APEX" não é general).
 */
const PENDING_DOMAIN_CUES = [
  ["quality", /preenchiment|preenchid|campos? com alerta|qualidade dos dados|taxa de preenchimento|dados ausentes|valores ausentes|duplicad/],
  ["support", /chamad|ticket|atendimento|demanda|reclamac|elogio|escalonad|escalad|prioridade|priorit|\bsla\b/],
  ["mechanisms", /mecanismo|implementad|implementac|\bapto\b|\baptos\b|elegiv/],
  ["financial_updates", /atualizacao financeira|atualizaram os dados|atualizaram o cadastro|sem atualizac|sem atualizar|desatualizad|recencia|dias sem atualiz|nao atualizaram/],
];

function detectPendingDomain(n) {
  for (const [dom, re] of PENDING_DOMAIN_CUES) {
    if (re.test(n)) return dom;
  }
  return null;
}

/**
 * Detecção de métrica (ordem importa: específicas antes das genéricas).
 * Cada entrada: [regex, domain, metricKey]. Métricas de valor típico (renda,
 * liquidez, aporte, permanência) vêm ANTES dos segmentos, pois o segmento é
 * apenas um filtro ("renda típica dos clientes PRIVATE" -> mediana + filtro).
 */
const METRIC_PATTERNS = [
  // meetings — específicas
  [/taxa de comparecimento|comparecimento|presenca/, "meetings", "attendance_rate"],
  [/no.?show|nao compareceu|nao compareceram|faltaram|faltas|ausenc/, "meetings", "no_show_meetings"],
  [/remarcad|reagendad/, "meetings", "rescheduled_meetings"],
  [/primeira reuniao|primeiras reunioes|first meeting/, "meetings", "clients_with_first_meeting"],
  [/reunioes por mes|media de reunioes|reunioes\/mes/, "meetings", "average_meetings_per_month"],
  [/intervalo (?:tipico|medio|entre)|intervalo entre reunioes/, "meetings", "typical_interval"],
  [/dias desde a ultima reuniao|desde a ultima reuniao/, "meetings", "days_since_last_meeting"],
  [/reuni|meeting/, "meetings", "total_meetings"],
  // general — valores típicos (mediana) antes de segmentos
  [/renda (?:mensal|tipica|media|typical)|qual a renda|renda dos clientes|renda dos/, "general", "median_monthly_income"],
  [/reserva de liquidez|liquidez tipica|liquidez/, "general", "median_liquidity_reserve"],
  [/ultimo aporte|aporte tipico|aporte medio|aporte dos/, "general", "median_last_contribution"],
  [/permanencia|tempo de permanencia|tempo de casa/, "general", "median_stay_days"],
  // general — segmentos
  [/\bapex\b/, "general", "apex_clients"],
  [/\bprivate\b/, "general", "private_clients"],
  [/\bprincipal\b/, "general", "principal_clients"],
  [/\bdebts\b|endivid/, "general", "debts_clients"],
  [/\bover\b/, "general", "over_clients"],
  [/dados insuficientes|sem dados suficientes|dados insuficiente/, "general", "insufficient_segment_data"],
  [/dados financeiros|perfil financeiro|diagnostico financeiro/, "general", "clients_with_financial_data"],
  [/contratad|adquirid|aquisicao|novos clientes|entraram|contratacao/, "general", "acquired_clients"],
  [/cancelad|churn|encerrad/, "general", "cancelled_clients"],
  [/congelad|pausad/, "general", "frozen_clients"],
  [/\bativ/, "general", "active_clients"],
  [/client/, "general", "total_clients"],
];

const VALUE_CUE = /(quant|qtd|numero|total|taxa|percentu|quanto|qual (?:a|o|e|foi)|media|mediana|tipic|renda|reserva|aporte|permanencia)/;
const LOCATION_CUE = /\bonde\b|em qual tabela|qual tabela|qual a coluna|qual coluna|em que tabela|localiza|onde fica|onde esta|de onde|qual schema/;
const RULE_CUE = /\bregra\b|como e calcul|como calcul|como funciona|criterio|o que e considerad|o que define|definicao|como determina|como e definido/;
const QUALITY_CUE = /qualidade|preenchid|ausente|faltando|falta de|confiab|nao calculavel|incompleto|inconsistent/;

function detectIntent(n) {
  const hasValue = VALUE_CUE.test(n);
  const hasRule = RULE_CUE.test(n);
  if (hasValue && hasRule) return "mixed";
  if (hasValue) return "value";
  if (LOCATION_CUE.test(n)) return "location";
  if (hasRule) return "rule";
  if (QUALITY_CUE.test(n)) return "quality";
  return "general";
}

/* ------------------------------------------------------------------ */
/* Planejamento (parsing puro, sem acesso a dados)                     */
/* ------------------------------------------------------------------ */

/**
 * resolvePortalQuestion(question, now): identifica domínio, métrica, intenção e
 * filtros textuais (Engenheiro fica como token bruto; a resolução de entidade
 * ocorre em resolvePortalContext com o payload carregado).
 */
export function resolvePortalQuestion(question, now = new Date()) {
  const n = normalize(question);
  const intent = detectIntent(n);
  const warnings = [];
  const ambiguities = [];

  let domain = null;
  let metric = null;
  const pendingDomain = detectPendingDomain(n);
  if (pendingDomain) {
    domain = pendingDomain; // fase futura: reconhecido, porém sem cálculo ainda
  } else {
    for (const [re, dom, key] of METRIC_PATTERNS) {
      if (re.test(n)) { domain = dom; metric = key; break; }
    }
  }

  const filters = emptyFilters();
  const filterLabels = [];

  // Período (global)
  const period = parsePeriod(n, now);
  const instants = rangeInstants(period, now);
  filters.period = period.period;
  filters.dateFrom = instants.from ? instants.from.toISOString() : null;
  filters.dateTo = instants.to ? instants.to.toISOString() : null;
  const periodLabel = period.label;

  // Status, segmento, engenheiro, presença (globais)
  const status = parseStatusFilter(n);
  const segment = parseSegmentFilter(n);
  const engineerToken = parseEngineerToken(n);
  const attendance = parseAttendanceFilter(n);

  if (status.status) filters.status = status.status;
  if (segment.segment) filters.segment = segment.segment;
  if (engineerToken) filters.engineer = engineerToken; // token bruto; resolvido depois
  if (attendance.hasNoShow) filters.hasNoShow = true;
  if (attendance.hasReschedule) filters.hasReschedule = true;
  if (attendance.attendanceStatus) filters.attendanceStatus = attendance.attendanceStatus;

  // Métrica implica dimensão (evita filtro redundante e sustenta o rótulo).
  if (domain && metric) {
    const def = (portalDomains[domain]?.metrics || {})[metric];
    if (def?.implied) {
      for (const [k, v] of Object.entries(def.implied)) filters[k] = v;
    }
  }

  // Ambiguidade: entidade citada sem domínio/métrica claros (ex.: "dados recentes do Gabriel").
  if (!metric && !domain && engineerToken) {
    ambiguities.push("Sobre qual página você quer saber? (Dados Gerais, Reuniões, Mecanismos, Atualização Financeira, Atendimento ou Qualidade)");
    ambiguities.push("Qual indicador você quer consultar?");
    ambiguities.push(`Confirmar o Engenheiro Patrimonial mencionado: "${engineerToken}".`);
  }

  return { domain, metric, intent, filters, filterLabels, ambiguities, warnings, periodLabel, periodMeta: period, _engineerToken: engineerToken };
}

/* ------------------------------------------------------------------ */
/* Resolução de entidades e validação de filtros                       */
/* ------------------------------------------------------------------ */

function uniqueEngineers(payload) {
  const set = new Set();
  for (const r of payload.clients || []) {
    if (r.engineer && r.engineer !== "Não informado") set.add(r.engineer);
  }
  return [...set];
}

/**
 * Resolve o Engenheiro Patrimonial varrendo a pergunta contra os nomes REAIS do
 * payload (sem lista fixa). Correspondência: nome completo contido na frase,
 * ou qualquer parte do nome (>= 4 letras) presente como palavra. Retorna os
 * candidatos únicos encontrados.
 */
function detectEngineerCandidates(nQuestion, engineers) {
  const words = new Set(nQuestion.split(/[^a-z0-9]+/).filter(Boolean));
  const full = [];
  const partial = [];
  for (const e of engineers) {
    const en = normalize(e);
    if (en.length >= 4 && nQuestion.includes(en)) { full.push(e); continue; }
    const parts = en.split(" ").filter((p) => p.length >= 4);
    if (parts.some((p) => words.has(p))) partial.push(e);
  }
  // Nome completo citado vence match por primeiro nome (evita ambiguidade falsa
  // quando vários EPs compartilham o primeiro nome, ex.: "Rodrigo").
  return full.length ? full : partial;
}

/** Remove filtros não suportados pelo domínio, gerando warning explícito. */
function validateFiltersForDomain(domain, filters) {
  const allowed = new Set(portalDomains[domain]?.allowedFilters || []);
  const warnings = [];
  const NAMES = {
    priority: "Prioridade (Atendimento)",
    supportStatus: "Status do chamado (Atendimento)",
    requestedByClient: "Solicitado pelo cliente (Atendimento)",
    mechanism: "Mecanismo (Mecanismos)",
    mechanismStatus: "Status do mecanismo (Mecanismos)",
    category: "Categoria (Mecanismos/Atendimento)",
    attendanceStatus: "Status de presença (Reuniões)",
    hasNoShow: "No-show (Reuniões)",
    hasReschedule: "Remarcação (Reuniões)",
    segment: "Segmento (Dados Gerais)",
    status: "Status do cliente (Dados Gerais)",
    financialRecency: "Recência financeira (Atualização Financeira)",
  };
  const checks = ["attendanceStatus", "hasNoShow", "hasReschedule", "segment", "status", "priority", "supportStatus", "requestedByClient", "mechanism", "mechanismStatus", "category", "financialRecency"];
  for (const key of checks) {
    const present = filters[key] !== null && filters[key] !== false;
    if (present && !allowed.has(key)) {
      warnings.push(`${NAMES[key] || key} não se aplica a esta consulta e foi ignorado.`);
      filters[key] = key === "hasNoShow" || key === "hasReschedule" ? null : null;
    }
  }
  return warnings;
}

function buildFilterLabels(filters, period) {
  const labels = [];
  if (filters.engineer) labels.push(`Engenheiro Patrimonial: ${filters.engineer}`);
  if (filters.status) labels.push(`Status: ${filters.status}`);
  if (filters.segment) labels.push(`Segmento: ${filters.segment}`);
  if (filters.attendanceStatus === "nao_compareceu" || filters.hasNoShow) labels.push("Presença: no-show");
  else if (filters.attendanceStatus === "compareceu") labels.push("Presença: compareceu");
  if (filters.hasReschedule) labels.push("Remarcação: sim");
  if (period && period.label) labels.push(`Período: ${period.label}`);
  return labels;
}

/* ------------------------------------------------------------------ */
/* Entrada principal: monta o dados_contexto confiável                 */
/* ------------------------------------------------------------------ */

/**
 * resolvePortalContext(question, now): planeja, carrega o payload do domínio,
 * resolve entidades, valida e aplica filtros e calcula a métrica.
 * Retorna { intent, dados_contexto } no formato esperado pelo /api/assistant.
 */
export async function resolvePortalContext(question, now = new Date()) {
  const plan = resolvePortalQuestion(question, now);
  const { intent } = plan;

  // Intenções sem valor usam o catálogo do agente (regra/localização), exceto
  // quando a pergunta é vaga com uma entidade citada -> pedimos esclarecimento.
  if (intent !== "value" && intent !== "mixed") {
    const ambiguities = [...plan.ambiguities];
    const nq = normalize(question);
    if (!plan.metric && !plan.domain && /\b(dados|informac|recent|resumo|situacao|status|panorama)\b/.test(nq)) {
      try {
        const payload = await computeGeneralDataPayload();
        const cands = detectEngineerCandidates(nq, uniqueEngineers(payload));
        if (cands.length) {
          ambiguities.push("Sobre qual página você quer saber? (Dados Gerais, Reuniões, Mecanismos, Atualização Financeira, Atendimento ou Qualidade)");
          ambiguities.push("Qual indicador você quer consultar?");
          ambiguities.push(cands.length === 1 ? `Confirmar o Engenheiro Patrimonial: ${cands[0]}.` : `Qual Engenheiro Patrimonial? ${cands.join(", ")}.`);
        }
      } catch {
        /* sem payload disponível: mantém sem ambiguidade adicional */
      }
    }
    if (ambiguities.length) {
      return {
        intent,
        dados_contexto: {
          domain: null,
          metric: null,
          value: null,
          label: null,
          filters: plan.filters,
          filter_labels: [],
          sources: [],
          warnings: [...plan.warnings],
          ambiguities,
          realtime_database: false,
          generated_at: nowIso(),
        },
      };
    }
    return { intent, dados_contexto: null };
  }

  const base = {
    domain: plan.domain,
    metric: plan.metric,
    value: null,
    label: null,
    filters: plan.filters,
    filter_labels: [],
    sources: [],
    warnings: [...plan.warnings],
    ambiguities: [...plan.ambiguities],
    realtime_database: false,
    generated_at: nowIso(),
  };

  // Sem métrica reconhecida ou domínio de fase futura: não inventar.
  const domainCfg = plan.domain ? portalDomains[plan.domain] : null;
  if (!plan.metric || !domainCfg || domainCfg.pending || !domainCfg.metrics?.[plan.metric]) {
    if (plan.domain && domainCfg?.pending) {
      base.warnings.push("Consulta a este indicador ainda não está disponível.");
    } else if (!plan.metric) {
      base.warnings.push("Métrica ainda não disponível para consulta.");
    }
    return { intent, dados_contexto: base };
  }

  try {
    const payload = await domainCfg.compute();
    const def = domainCfg.metrics[plan.metric];

    // Resolução de entidade: Engenheiro Patrimonial (contra os nomes reais).
    if (portalDomains[plan.domain]?.allowedFilters?.includes("engineer")) {
      const engineers = uniqueEngineers(payload);
      const cands = detectEngineerCandidates(normalize(question), engineers);
      if (cands.length === 1) {
        plan.filters.engineer = cands[0];
      } else if (cands.length > 1) {
        plan.filters.engineer = null;
        base.ambiguities.push(`Há mais de um Engenheiro Patrimonial correspondente: ${cands.join(", ")}. Qual deles?`);
      } else {
        if (plan._engineerToken) {
          base.warnings.push(`Engenheiro Patrimonial "${plan._engineerToken}" não encontrado na base.`);
        }
        plan.filters.engineer = null;
      }
    }

    // Validação de filtros por domínio (filtros incompatíveis geram warning).
    base.warnings.push(...validateFiltersForDomain(plan.domain, plan.filters));

    // Cálculo com filtros aplicados (fonte de verdade = backend).
    let value;
    if (plan.domain === "general") {
      const filtered = applyGeneralFilters(payload.clients || [], plan.filters);
      value = def.compute(filtered, plan.filters);
    } else if (plan.domain === "meetings") {
      // Fonte única: mesma coleção/dedup/filtros/fórmulas do dashboard Reuniões.
      const mf = {
        engineer: plan.filters.engineer || null,
        attendance: plan.filters.attendanceStatus || "all",
        first: plan.filters.firstMeeting || "all",
        absence: plan.filters.hasNoShow ? "yes" : "all",
        reschedule: plan.filters.hasReschedule ? "yes" : "all",
      };
      const view = getFilteredMeetings(payload, mf, plan.periodMeta, now);
      value = view.summary[def.field];
      base.metric_definition = def.definition || null;
      base.metadata = view.metadata;
      // Alinha o intervalo reportado ao realmente aplicado pela tela.
      base.filters.dateFrom = view.metadata.dateFrom;
      base.filters.dateTo = view.metadata.dateTo;
    }

    base.value = value === undefined ? null : value;
    base.label = def.label;
    base.sources = def.sources || [];
    base.filter_labels = buildFilterLabels(plan.filters, { label: plan.periodLabel });
    base.realtime_database = base.value != null;
    if (base.value == null) base.warnings.push("Indicador não calculável com os dados disponíveis para este recorte.");
    return { intent, dados_contexto: base };
  } catch (err) {
    console.error("[portal-query] falha ao calcular", plan.domain, plan.metric, err?.message || err);
    base.warnings.push("Não foi possível calcular o indicador no momento.");
    return { intent, dados_contexto: base };
  }
}
