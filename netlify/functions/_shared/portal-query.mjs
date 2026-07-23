import { computeGeneralDataPayload, measureBundle } from "../general-data.mjs";
import { computeMeetingsPayload } from "../meetings.mjs";
import { computeOnboardingPayload } from "../onboarding.mjs";

/**
 * Motor central de consulta do portal ("Assistente da Jornada" global).
 *
 * Arquitetura em duas etapas (plan → execute):
 *  - Gemini (n8n mode=plan) interpreta a linguagem e propõe um query_plan;
 *  - o backend valida o plano (allowlist), executa com compute*Payload dos dashboards
 *    e devolve query_result; Gemini (mode=answer) apenas verbaliza.
 *  - mode=rule usa o catálogo (sem número inventado).
 *
 * Fase 1: general, meetings, journey. Demais domínios: pending.
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
    client_status: null,
    segment: null,
    period: "all_time",
    dateFrom: null,
    dateTo: null,
    periodLabel: null,
    attendanceStatus: null,
    frequency: null,
    firstMeeting: null,
    hasNoShow: null,
    hasReschedule: null,
    hasFinancialData: null,
    hasMonthlyIncome: null,
    hasLiquidityReserve: null,
    hasLastContribution: null,
    onboardingStatus: null,
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

function parseFinancialFlags(n) {
  const out = {};
  if (/sem dados financeiros|sem perfil financeiro|nao (possuem|tem) dados financeiros/.test(n)) out.hasFinancialData = false;
  else if (/possuem? dados financeiros|com dados financeiros|com perfil financeiro|possuem? perfil financeiro/.test(n)) out.hasFinancialData = true;
  if (/com renda|com renda mensal|possuem? renda/.test(n)) out.hasMonthlyIncome = true;
  if (/sem renda|sem renda mensal/.test(n)) out.hasMonthlyIncome = false;
  if (/com reserva|possuem? reserva/.test(n)) out.hasLiquidityReserve = true;
  if (/com aporte|possuem? aporte/.test(n)) out.hasLastContribution = true;
  return out;
}

function parseFirstMeetingFilter(n) {
  if (/nao (fizeram|fez|realizaram|realizou) a? ?primeira reuniao|sem primeira reuniao|sem a primeira reuniao|nao fizeram a primeira|clientes sem primeira/.test(n)) {
    return { firstMeeting: "no", label: "Primeira reunião: não" };
  }
  if (/com primeira reuniao|realizaram a primeira reuniao|fizeram a primeira reuniao/.test(n)) {
    return { firstMeeting: "yes", label: "Primeira reunião: sim" };
  }
  return {};
}

function parseOnboardingStatus(n) {
  if (/concluiram onboarding|concluiu onboarding|onboarding conclu|completar.?am onboarding/.test(n)) {
    return { onboardingStatus: "completed", label: "Onboarding: concluído" };
  }
  if (/onboarding aberto|nao concluiram onboarding|ainda no onboarding/.test(n)) {
    return { onboardingStatus: "open", label: "Onboarding: aberto" };
  }
  return {};
}

/** Normaliza aliases do contrato Gemini (client_status, has_financial_data, etc.). */
export function normalizePlanFilters(raw = {}) {
  const f = emptyFilters();
  if (!raw || typeof raw !== "object") return f;
  const STATUS_MAP = {
    active: "Ativo", ativo: "Ativo", cancelled: "Cancelado", cancelado: "Cancelado",
    frozen: "Congelado", congelado: "Congelado",
    active_or_frozen: "active_or_frozen",
    active_and_frozen: "active_or_frozen",
  };
  const statusRaw = raw.client_status ?? raw.status ?? raw.clientStatus;
  if (statusRaw != null) {
    const key = String(statusRaw).toLowerCase().trim().replace(/\s+/g, "_");
    if (
      key === "active_or_frozen" ||
      key === "active_and_frozen" ||
      key.includes("ativos_e_congel") ||
      key.includes("ativos_ou_congel") ||
      key.includes("ativa_e_congel") ||
      /ativos?.+congel/.test(key)
    ) {
      f.status = "active_or_frozen";
      f.client_status = "active_or_frozen";
    } else {
      f.status = STATUS_MAP[key] || (["Ativo", "Cancelado", "Congelado"].includes(statusRaw) ? statusRaw : null);
      if (f.status === "Ativo") f.client_status = "active";
      else if (f.status === "Cancelado") f.client_status = "cancelled";
      else if (f.status === "Congelado") f.client_status = "frozen";
    }
  }
  if (raw.segment) f.segment = String(raw.segment).toUpperCase() === "DADOS INSUFICIENTES" ? "Dados insuficientes" : String(raw.segment).toUpperCase();
  if (raw.engineer) f.engineer = raw.engineer;
  if (raw.search) f.search = raw.search;
  const period = raw.period ?? raw.hiring_period ?? raw.update_period;
  if (period) f.period = period;
  if (raw.date_from || raw.dateFrom) f.dateFrom = raw.date_from || raw.dateFrom;
  if (raw.date_to || raw.dateTo) f.dateTo = raw.date_to || raw.dateTo;
  if (raw.period_label || raw.periodLabel) f.periodLabel = raw.period_label || raw.periodLabel;
  if (raw.attendance_status || raw.attendanceStatus) f.attendanceStatus = raw.attendance_status || raw.attendanceStatus;
  if (raw.has_no_show === true || raw.hasNoShow === true) f.hasNoShow = true;
  if (raw.has_reschedule === true || raw.hasReschedule === true) f.hasReschedule = true;
  const first = raw.first_meeting ?? raw.firstMeeting;
  if (first === true || first === "yes") f.firstMeeting = "yes";
  if (first === false || first === "no") f.firstMeeting = "no";
  const hfd = raw.has_financial_data ?? raw.hasFinancialData;
  if (hfd === true || hfd === false) f.hasFinancialData = hfd;
  const hmi = raw.has_monthly_income ?? raw.hasMonthlyIncome;
  if (hmi === true || hmi === false) f.hasMonthlyIncome = hmi;
  const hlr = raw.has_liquidity_reserve ?? raw.hasLiquidityReserve;
  if (hlr === true || hlr === false) f.hasLiquidityReserve = hlr;
  const hlc = raw.has_last_contribution ?? raw.hasLastContribution;
  if (hlc === true || hlc === false) f.hasLastContribution = hlc;
  if (raw.onboarding_status || raw.onboardingStatus) f.onboardingStatus = raw.onboarding_status || raw.onboardingStatus;
  if (raw.only_active_clients === true || raw.onlyActiveClients === true) f.status = "Ativo";
  return f;
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

function matchesAnalyticalStatusFilter(analyticalStatus, filterStatus) {
  if (!filterStatus) return true;
  if (filterStatus === "active_or_frozen") {
    return analyticalStatus === "Ativo" || analyticalStatus === "Congelado";
  }
  return analyticalStatus === filterStatus;
}

function applyGeneralFilters(rows, f) {
  return rows.filter((r) => {
    if (f.engineer && r.engineer !== f.engineer) return false;
    if (f.status && !matchesAnalyticalStatusFilter(r.analyticalStatus, f.status)) return false;
    if (f.client_status) {
      const want = String(f.client_status).toLowerCase();
      const st = String(r.analyticalStatus || "");
      if (want === "active" && st !== "Ativo") return false;
      if (want === "frozen" && st !== "Congelado") return false;
      if (want === "cancelled" && st !== "Cancelado") return false;
      if (want === "unknown" && st !== "Não informado") return false;
      if (want === "active_or_frozen" && st !== "Ativo" && st !== "Congelado") return false;
    }
    if (f.segment && r.segmentLabel !== f.segment) return false;
    if (f.hasFinancialData === true && !r.hasFinancialProfile) return false;
    if (f.hasFinancialData === false && r.hasFinancialProfile) return false;
    if (f.hasMonthlyIncome === true && r.monthlyIncome == null) return false;
    if (f.hasMonthlyIncome === false && r.monthlyIncome != null) return false;
    if (f.hasLiquidityReserve === true && r.liquidityReserve == null) return false;
    if (f.hasLiquidityReserve === false && r.liquidityReserve != null) return false;
    if (f.hasLastContribution === true && r.lastContribution == null) return false;
    if (f.hasLastContribution === false && r.lastContribution != null) return false;
    if (f.dateFrom || f.dateTo) {
      if (!withinRange(r.acquisitionDate, f.dateFrom, f.dateTo)) return false;
    }
    return true;
  });
}

const GENERAL_METRICS = {
  total_clients: { label: "Total de clientes", sources: [CLIENTS_ID], compute: (rows) => rows.length },
  active_clients: { label: "Clientes ativos", implied: { status: "Ativo" }, sources: [CLIENTS_STATUS, ...CANCEL_SOURCES], compute: (rows) => rows.length },
  active_or_frozen_clients: {
    label: "Clientes ativos e congelados",
    implied: { status: "active_or_frozen" },
    sources: [CLIENTS_STATUS, ...CANCEL_SOURCES],
    compute: (rows) => rows.length,
  },
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

const GENERAL_ALLOWED_FILTERS = [
  "engineer", "status", "segment", "period", "dateFrom", "dateTo", "search",
  "clientId", "clientCode", "clientName",
  "hasFinancialData", "hasMonthlyIncome", "hasLiquidityReserve", "hasLastContribution",
];

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
    clientsWithoutFirstMeeting: rows.filter((c) => c.firstMeetingCompleted === false).length,
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
  clients_without_first_meeting: { label: "Clientes sem primeira reunião", field: "clientsWithoutFirstMeeting", definition: "clients", sources: MEETING_SOURCES },
  days_since_last_meeting: { label: "Dias desde a última reunião (típico)", field: "typicalDaysSinceLastMeeting", type: "median", definition: "median_days", sources: MEETING_SOURCES },
  typical_interval: { label: "Intervalo típico entre reuniões (dias)", field: "typicalIntervalDays", type: "median", definition: "median_days", sources: MEETING_SOURCES },
  typical_meeting_interval: { label: "Intervalo típico entre reuniões (dias)", field: "typicalIntervalDays", type: "median", definition: "median_days", sources: MEETING_SOURCES },
};

const MEETINGS_ALLOWED_FILTERS = ["engineer", "period", "dateFrom", "dateTo", "attendanceStatus", "hasNoShow", "hasReschedule", "firstMeeting", "frequency", "search", "clientId", "clientCode", "clientName"];

/* --------------------------- Domínio journey (onboarding) --------- */
/*
 * Reutiliza computeOnboardingPayload. Regras confirmadas no código:
 * - daysTo*: contratação (data_inicio_ciclo|created_at) → evento; média aritmética;
 *   valores negativos entram na média (podem gerar média negativa, ex. entrega do plano).
 * - completedOnboarding: estágio atual NÃO está em OPEN_ONBOARDING_STAGE_IDS.
 * - totalOnboardingDays: transições a partir de estágios de início do onboarding.
 */

const JOURNEY_SOURCES = [
  { schema: SUPABASE, table: "clients", column: "data_inicio_ciclo" },
  { schema: SUPABASE, table: "client_journeys", column: "current_stage_id" },
  { schema: SUPABASE, table: "client_meetings", column: "start_time" },
  { schema: SUPABASE, table: "client_implementation_meeting_date", column: "meeting_date" },
  { schema: SUPABASE, table: "client_mecanismos", column: "implemented_at" },
];

function avgFinite(values) {
  const clean = values.filter((v) => v != null && Number.isFinite(v));
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function statusMatchesRaw(rawStatus, analytical) {
  const n = normalize(rawStatus);
  if (analytical === "Ativo") return n.includes("ativ") && !n.includes("inativ");
  if (analytical === "Cancelado") return n.includes("cancel") || n.includes("churn") || n.includes("encerr");
  if (analytical === "Congelado") return n.includes("congel") || n.includes("pausad") || n.includes("freeze");
  return true;
}

function applyJourneyFilters(rows, f) {
  return rows.filter((r) => {
    if (f.engineer && r.engineer !== f.engineer) return false;
    if (f.status && !statusMatchesRaw(r.status, f.status)) return false;
    if (f.onboardingStatus === "completed" && r.completedOnboarding !== true) return false;
    if (f.onboardingStatus === "open" && r.completedOnboarding !== false) return false;
    return true;
  });
}

const JOURNEY_METRICS = {
  average_days_to_first_meeting: {
    label: "Média de dias até a primeira reunião",
    type: "average",
    definition: "average_days_contract_to_first_meeting",
    sources: JOURNEY_SOURCES,
    rule:
      "Diferença em dias entre clients.data_inicio_ciclo (fallback created_at) e a primeira client_meetings.start_time. Usa média aritmética dos clientes com as duas datas. Intervalos negativos entram no cálculo.",
    compute: (rows) => avgFinite(rows.map((r) => r.daysToFirstMeeting)),
  },
  average_days_to_plan_delivery: {
    label: "Média de dias até a entrega do plano",
    type: "average",
    definition: "average_days_contract_to_plan",
    sources: JOURNEY_SOURCES,
    rule:
      "Diferença em dias entre clients.data_inicio_ciclo e a primeira client_implementation_meeting_date.meeting_date. Média aritmética. Valores negativos (plano antes da contratação) entram no cálculo e podem gerar média negativa.",
    compute: (rows) => avgFinite(rows.map((r) => r.daysToPlanDelivery)),
  },
  average_days_to_first_mechanism: {
    label: "Média de dias até o primeiro mecanismo",
    type: "average",
    definition: "average_days_contract_to_first_mechanism",
    sources: JOURNEY_SOURCES,
    rule:
      "Diferença em dias entre clients.data_inicio_ciclo e a primeira client_mecanismos.implemented_at (status implementado/concluído ou com data de implementação). Usa média aritmética dos clientes com as duas datas.",
    compute: (rows) => avgFinite(rows.map((r) => r.daysToFirstImplementation)),
  },
  average_onboarding_days: {
    label: "Média de dias de onboarding",
    type: "average",
    definition: "average_total_onboarding_days",
    sources: JOURNEY_SOURCES,
    rule:
      "Média da duração das transições de client_journeys a partir dos estágios iniciais de onboarding até a próxima mudança de current_stage_id do mesmo client_id.",
    compute: (rows) => avgFinite(rows.map((r) => r.totalOnboardingDays)),
  },
  completed_onboarding_clients: {
    label: "Clientes que concluíram onboarding",
    definition: "completed_onboarding",
    sources: JOURNEY_SOURCES,
    rule:
      "Cliente com registro em client_journeys cujo estágio atual (current_stage_id) é diferente dos estágios abertos de onboarding. Sem jornada: não entra no numerador nem no denominador de cobertura.",
    compute: (rows) => rows.filter((r) => r.completedOnboarding === true).length,
  },
};

const JOURNEY_ALLOWED_FILTERS = ["search", "status", "engineer", "onboardingStatus"];

/* ------------------------------------------------------------------ */
/* Registro central de domínios                                        */
/* ------------------------------------------------------------------ */

export const portalDomains = {
  general: { compute: computeGeneralDataPayload, metrics: GENERAL_METRICS, allowedFilters: GENERAL_ALLOWED_FILTERS },
  meetings: { compute: computeMeetingsPayload, metrics: MEETINGS_METRICS, allowedFilters: MEETINGS_ALLOWED_FILTERS },
  journey: { compute: computeOnboardingPayload, metrics: JOURNEY_METRICS, allowedFilters: JOURNEY_ALLOWED_FILTERS },
  // Alias amigável
  onboarding: { compute: computeOnboardingPayload, metrics: JOURNEY_METRICS, allowedFilters: JOURNEY_ALLOWED_FILTERS },
  // Fases seguintes:
  patrimonial_plan: { pending: true },
  mechanisms: { pending: true },
  financial_updates: { pending: true },
  platform_usage: { pending: true },
  support: { pending: true },
  quality: { pending: true },
};

/** Registro central usado pelo planejador (Gemini) e pelo executor. */
export const portalQueryRegistry = portalDomains;

/**
 * Cues de domínios de fases futuras. Detectados ANTES das métricas genéricas,
 * mas DEPOIS das métricas explícitas de journey (ex.: média até primeiro mecanismo).
 */
const PENDING_DOMAIN_CUES = [
  ["quality", /preenchiment|preenchid|campos? com alerta|qualidade dos dados|taxa de preenchimento|dados ausentes|valores ausentes|duplicad/],
  ["support", /chamad|ticket|atendimento|demanda|reclamac|elogio|escalonad|escalad|prioridade|priorit|\bsla\b/],
  ["platform_usage", /usuarios? (qv360|da plataforma)|fizeram login|realizaram login|total de logins|uso da plataforma|sessoes/],
  ["patrimonial_plan", /plano patrimonial|qv360|app pharus|planos entregues|planos aprovados/],
  ["mechanisms", /mecanismos? conclu|mecanismos? implement|taxa de implementacao|mecanismos? aptos|clientes com mecanismos/],
  ["financial_updates", /atualizacao financeira|atualizaram os dados|atualizaram o cadastro|sem atualizac|sem atualizar|desatualizad|recencia financeira|dias sem atualiz|nao atualizaram/],
];

function detectPendingDomain(n) {
  for (const [dom, re] of PENDING_DOMAIN_CUES) {
    if (re.test(n)) return dom;
  }
  return null;
}

/**
 * Detecção de métrica (ordem importa: específicas antes das genéricas).
 */
const METRIC_PATTERNS = [
  // journey — antes de mechanisms/pending
  [/media ate o primeiro mecanismo na jornada|media.*primeiro mecanismo.*(jornada|onboarding)/, "journey", "average_days_to_first_mechanism"],
  [/tempo tipico ate (a )?primeira implementacao|mediana ate (a )?primeira implementacao|mediana ate o primeiro mecanismo/, "mechanisms", "median_days_to_first_implementation"],
  [/media ate (a )?primeira implementacao|media ate o primeiro mecanismo|dias ate o primeiro mecanismo/, "mechanisms", "average_days_to_first_implementation"],
  [/media ate (a )?entrega do plano|dias ate (a )?entrega do plano|entrega do plano patrimonial/, "journey", "average_days_to_plan_delivery"],
  [/media ate (a )?primeira reuniao|dias ate (a )?primeira reuniao|dias entre contratacao e primeira reuniao/, "journey", "average_days_to_first_meeting"],
  [/media (de |do )?onboarding|tempo total de onboarding|onboarding total/, "journey", "average_onboarding_days"],
  [/concluiram onboarding|concluiu onboarding|onboarding conclu|completar.?am onboarding/, "journey", "completed_onboarding_clients"],
  // meetings — específicas
  [/taxa de comparecimento|comparecimento|presenca/, "meetings", "attendance_rate"],
  [/no.?show|nao compareceu|nao compareceram|faltaram|faltas|ausenc/, "meetings", "no_show_meetings"],
  [/remarcad|reagendad/, "meetings", "rescheduled_meetings"],
  [/nao (fizeram|fez|realizaram|realizou) a? ?primeira reuniao|sem primeira reuniao|sem a primeira reuniao|clientes sem primeira/, "meetings", "clients_without_first_meeting"],
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
  // Localização tem prioridade sobre "renda/valor" embutido na pergunta.
  if (LOCATION_CUE.test(n)) return "location";
  // "Como é calculada a média..." é regra, não valor (salvo se também pedir quantidade).
  if (hasRule && !/\b(quant|qtd|numero|total de|quantos|quantas)\b/.test(n)) return "rule";
  if (hasValue && hasRule) return "mixed";
  if (hasValue) return "value";
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
  // Métricas conhecidas (inclui journey) têm prioridade sobre pending.
  for (const [re, dom, key] of METRIC_PATTERNS) {
    if (re.test(n)) { domain = dom; metric = key; break; }
  }
  if (!metric) {
    const pendingDomain = detectPendingDomain(n);
    if (pendingDomain) domain = pendingDomain;
  }

  const filters = emptyFilters();
  const filterLabels = [];

  const period = parsePeriod(n, now);
  const instants = rangeInstants(period, now);
  filters.period = period.period;
  filters.dateFrom = instants.from ? instants.from.toISOString() : null;
  filters.dateTo = instants.to ? instants.to.toISOString() : null;
  filters.periodLabel = period.label;
  const periodLabel = period.label;

  const status = parseStatusFilter(n);
  const segment = parseSegmentFilter(n);
  const engineerToken = parseEngineerToken(n);
  const attendance = parseAttendanceFilter(n);
  const financial = parseFinancialFlags(n);
  const firstMeeting = parseFirstMeetingFilter(n);
  const onboarding = parseOnboardingStatus(n);

  if (status.status) filters.status = status.status;
  if (segment.segment) filters.segment = segment.segment;
  if (engineerToken) filters.engineer = engineerToken;
  if (attendance.hasNoShow) filters.hasNoShow = true;
  if (attendance.hasReschedule) filters.hasReschedule = true;
  if (attendance.attendanceStatus) filters.attendanceStatus = attendance.attendanceStatus;
  if (financial.hasFinancialData !== undefined) filters.hasFinancialData = financial.hasFinancialData;
  if (financial.hasMonthlyIncome !== undefined) filters.hasMonthlyIncome = financial.hasMonthlyIncome;
  if (financial.hasLiquidityReserve !== undefined) filters.hasLiquidityReserve = financial.hasLiquidityReserve;
  if (financial.hasLastContribution !== undefined) filters.hasLastContribution = financial.hasLastContribution;
  if (firstMeeting.firstMeeting) filters.firstMeeting = firstMeeting.firstMeeting;
  if (onboarding.onboardingStatus) filters.onboardingStatus = onboarding.onboardingStatus;

  // Perguntas cruzadas de status + dados financeiros usam contagem filtrada.
  if (metric === "clients_with_financial_data" && filters.status) {
    /* mantém métrica; filtros já aplicados */
  } else if (metric === "cancelled_clients" && filters.hasFinancialData != null) {
    metric = "clients_with_financial_data";
  } else if (metric === "active_clients" && filters.hasFinancialData != null && !filters.segment) {
    metric = "clients_with_financial_data";
  }

  if (domain && metric) {
    const def = (portalDomains[domain]?.metrics || {})[metric];
    if (def?.implied) {
      for (const [k, v] of Object.entries(def.implied)) {
        if (filters[k] == null) filters[k] = v;
      }
    }
  }

  // Ambiguidade vaga
  if (!metric && !domain && (engineerToken || /\b(dados|informac|recent|resumo|situacao|panorama)\b/.test(n))) {
    ambiguities.push("Você quer consultar os clientes da carteira de um Engenheiro Patrimonial, um cliente específico ou outra página do portal?");
    ambiguities.push("Qual indicador você quer consultar? (ex.: clientes ativos, no-shows, onboarding)");
    if (engineerToken) ambiguities.push(`Confirmar o nome mencionado: "${engineerToken}".`);
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
  const checks = [
    "attendanceStatus", "hasNoShow", "hasReschedule", "segment", "status",
    "priority", "supportStatus", "requestedByClient", "mechanism", "mechanismStatus",
    "category", "financialRecency", "hasFinancialData", "hasMonthlyIncome",
    "hasLiquidityReserve", "hasLastContribution", "onboardingStatus", "firstMeeting",
  ];
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
    status: "Status do cliente",
    financialRecency: "Recência financeira (Atualização Financeira)",
    hasFinancialData: "Possui dados financeiros (Dados Gerais)",
    hasMonthlyIncome: "Possui renda (Dados Gerais)",
    hasLiquidityReserve: "Possui reserva (Dados Gerais)",
    hasLastContribution: "Possui aporte (Dados Gerais)",
    onboardingStatus: "Status de onboarding (Jornada)",
    firstMeeting: "Primeira reunião (Reuniões)",
  };
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
  if (filters.hasFinancialData === true) labels.push("Possui dados financeiros");
  if (filters.hasFinancialData === false) labels.push("Sem dados financeiros");
  if (filters.hasMonthlyIncome === true) labels.push("Possui renda mensal");
  if (filters.hasMonthlyIncome === false) labels.push("Sem renda mensal");
  if (filters.attendanceStatus === "nao_compareceu" || filters.hasNoShow) labels.push("Presença: no-show");
  else if (filters.attendanceStatus === "compareceu") labels.push("Presença: compareceu");
  if (filters.hasReschedule) labels.push("Remarcação: sim");
  if (filters.firstMeeting === "yes") labels.push("Primeira reunião: sim");
  if (filters.firstMeeting === "no") labels.push("Primeira reunião: não");
  if (filters.onboardingStatus === "completed") labels.push("Onboarding: concluído");
  if (filters.onboardingStatus === "open") labels.push("Onboarding: aberto");
  const periodText = (period && period.label) || filters.periodLabel;
  if (periodText) labels.push(`Período: ${periodText}`);
  return labels;
}

/* ------------------------------------------------------------------ */
/* Validação e execução do query_plan                                  */
/* ------------------------------------------------------------------ */

const ALLOWED_INTENTS = new Set(["value", "rule", "location", "quality", "mixed", "general"]);
const FORBIDDEN_PLAN_KEYS = new Set(["sql", "url", "query", "raw_sql", "endpoint"]);

/** Catálogo compacto enviado ao modo plan do n8n (sem funções). */
export function buildPlanCatalog() {
  const domains = {};
  for (const [name, cfg] of Object.entries(portalQueryRegistry)) {
    if (cfg.pending) {
      domains[name] = { pending: true, metrics: [], filters: [] };
      continue;
    }
    domains[name] = {
      pending: false,
      metrics: Object.entries(cfg.metrics || {}).map(([id, m]) => ({
        id,
        label: m.label,
        definition: m.definition || null,
        rule: m.rule || null,
      })),
      filters: cfg.allowedFilters || [],
    };
  }
  return domains;
}

function periodLabelFromKey(period) {
  const map = {
    last_30_days: "últimos 30 dias",
    last_7_days: "últimos 7 dias",
    last_90_days: "últimos 90 dias",
    last_month: "mês passado",
    previous_calendar_month: "mês passado",
    this_month: "este mês",
    this_year: "este ano",
    last_year: "ano passado",
    today: "hoje",
    yesterday: "ontem",
  };
  return map[period] || null;
}

function parseYmd(iso) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function periodMetaFromPlan(filters, now = new Date()) {
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? parseYmd(filters.dateFrom) : null;
    const to = filters.dateTo ? parseYmd(filters.dateTo) : null;
    return { kind: "calendar", rollingDays: null, from, to, period: filters.period || "custom", label: filters.periodLabel };
  }
  const p = filters.period;
  if (!p || p === "all_time" || p === "all") return { kind: "all", rollingDays: null, from: null, to: null, period: "all_time", label: null };
  if (p === "last_30_days") return { kind: "rolling", rollingDays: 30, from: null, to: null, period: p, label: "últimos 30 dias" };
  if (p === "last_7_days") return { kind: "rolling", rollingDays: 7, from: null, to: null, period: p, label: "últimos 7 dias" };
  if (p === "last_90_days") return { kind: "rolling", rollingDays: 90, from: null, to: null, period: p, label: "últimos 90 dias" };
  const fake = {
    last_month: "mes passado",
    previous_calendar_month: "mes passado",
    this_month: "este mes",
    this_year: "este ano",
    last_year: "ano passado",
    today: "hoje",
    yesterday: "ontem",
  }[p];
  if (fake) return parsePeriod(fake, now);
  return { kind: "all", rollingDays: null, from: null, to: null, period: "all_time", label: null };
}

/**
 * Valida um query_plan vindo do Gemini (ou do planejador local).
 */
export function validateQueryPlan(rawPlan) {
  const warnings = [];
  const clarification = [];
  if (!rawPlan || typeof rawPlan !== "object") {
    return { ok: false, clarification: ["Não foi possível interpretar a consulta. Reformule a pergunta."], warnings };
  }
  for (const key of Object.keys(rawPlan)) {
    if (FORBIDDEN_PLAN_KEYS.has(normalize(key))) {
      return { ok: false, clarification: ["A consulta pedida não é permitida."], warnings: ["Campo proibido no plano."] };
    }
  }

  let intent = ALLOWED_INTENTS.has(rawPlan.intent) ? rawPlan.intent : "value";
  let domain = rawPlan.domain ? String(rawPlan.domain) : null;
  if (domain === "onboarding") domain = "journey";
  let metric = rawPlan.metric ? String(rawPlan.metric) : null;

  if (rawPlan.clarification) clarification.push(String(rawPlan.clarification));
  if (Array.isArray(rawPlan.ambiguities)) clarification.push(...rawPlan.ambiguities.map(String));

  if (!domain && intent === "value") clarification.push("Qual página do portal você quer consultar?");
  if (domain && !portalQueryRegistry[domain]) {
    return { ok: false, clarification: [`Domínio desconhecido: ${domain}.`], warnings };
  }
  const cfg = domain ? portalQueryRegistry[domain] : null;
  if (cfg?.pending) {
    return {
      ok: false,
      plan: { intent, domain, metric, filters: normalizePlanFilters(rawPlan.filters), group_by: null, sort: null, limit: null },
      warnings: ["Consulta a este indicador ainda não está disponível nesta fase."],
      clarification: [],
      pending: true,
    };
  }
  if (domain && metric && cfg && !cfg.metrics?.[metric]) {
    warnings.push(`Métrica "${metric}" não existe no domínio ${domain}.`);
    metric = null;
  }
  if (intent === "value" && domain && !metric) clarification.push("Qual indicador você quer consultar?");

  const filters = normalizePlanFilters(rawPlan.filters || {});
  if (filters.period === "previous_calendar_month") filters.period = "last_month";
  if (cfg && !cfg.pending) warnings.push(...validateFiltersForDomain(domain, filters));
  if (rawPlan.group_by != null || rawPlan.sort != null || rawPlan.limit != null) {
    warnings.push("Agrupamento/ordenação/limite ainda não são suportados e foram ignorados.");
  }

  const plan = {
    intent,
    domain,
    metric,
    filters,
    group_by: null,
    sort: null,
    limit: null,
    periodMeta: periodMetaFromPlan(filters),
    periodLabel: filters.periodLabel || periodLabelFromKey(filters.period),
  };

  if (clarification.length) return { ok: false, plan, clarification, warnings };
  if (intent === "rule" || intent === "location" || intent === "general") {
    return { ok: true, plan, clarification: [], warnings, skipExecute: true };
  }
  if (!domain || !metric) {
    return { ok: false, plan, clarification: clarification.length ? clarification : ["Faltam domínio ou métrica."], warnings };
  }
  return { ok: true, plan, clarification: [], warnings };
}

/** Executa um query_plan já validado reutilizando compute*Payload dos dashboards. */
export async function executePortalQuery(queryPlan, now = new Date(), options = {}) {
  const question = options.question || "";
  const domain = queryPlan.domain === "onboarding" ? "journey" : queryPlan.domain;
  const metric = queryPlan.metric;
  const filters = { ...emptyFilters(), ...(queryPlan.filters || {}) };
  const periodMeta = queryPlan.periodMeta || periodMetaFromPlan(filters, now);
  const periodLabel = queryPlan.periodLabel || filters.periodLabel || periodLabelFromKey(filters.period);

  const base = {
    value: null,
    label: null,
    domain,
    metric,
    filters,
    filter_labels: [],
    sources: [],
    warnings: [...(queryPlan.warnings || [])],
    ambiguities: [],
    realtime_database: false,
    generated_at: nowIso(),
    metric_definition: null,
    metadata: null,
    metric_rule: null,
  };

  const cfg = portalQueryRegistry[domain];
  if (!cfg || cfg.pending || !cfg.metrics?.[metric]) {
    base.warnings.push("Consulta a este indicador ainda não está disponível.");
    return base;
  }
  const def = cfg.metrics[metric];

  try {
    const payload = await cfg.compute();

    if ((cfg.allowedFilters || []).includes("engineer")) {
      const engineers = uniqueEngineers(payload);
      if (filters.engineer && !engineers.includes(filters.engineer)) {
        const cands = detectEngineerCandidates(normalize(String(filters.engineer) + " " + question), engineers);
        if (cands.length === 1) filters.engineer = cands[0];
        else if (cands.length > 1) {
          base.ambiguities.push(`Há mais de um Engenheiro Patrimonial correspondente: ${cands.join(", ")}. Qual deles?`);
          filters.engineer = null;
          return base;
        } else if (options.engineerToken) {
          base.warnings.push(`Engenheiro Patrimonial "${options.engineerToken}" não encontrado na base.`);
          filters.engineer = null;
        }
      } else if (options.engineerToken && !filters.engineer) {
        const cands = detectEngineerCandidates(normalize(question), engineers);
        if (cands.length === 1) filters.engineer = cands[0];
        else if (cands.length > 1) {
          base.ambiguities.push(`Há mais de um Engenheiro Patrimonial correspondente: ${cands.join(", ")}. Qual deles?`);
          return base;
        }
      } else if (!filters.engineer && question) {
        const cands = detectEngineerCandidates(normalize(question), engineers);
        if (cands.length === 1) filters.engineer = cands[0];
        else if (cands.length > 1) {
          base.ambiguities.push(`Há mais de um Engenheiro Patrimonial correspondente: ${cands.join(", ")}. Qual deles?`);
          return base;
        }
      }
    }

    base.warnings.push(...validateFiltersForDomain(domain, filters));

    let value;
    if (domain === "general") {
      const filtered = applyGeneralFilters(payload.clients || [], filters);
      value = def.compute(filtered, filters);
    } else if (domain === "meetings") {
      const mf = {
        engineer: filters.engineer || null,
        attendance: filters.attendanceStatus || "all",
        first: filters.firstMeeting || "all",
        absence: filters.hasNoShow ? "yes" : "all",
        reschedule: filters.hasReschedule ? "yes" : "all",
      };
      const view = getFilteredMeetings(payload, mf, periodMeta, now);
      value = view.summary[def.field];
      base.metric_definition = def.definition || null;
      base.metadata = view.metadata;
      filters.dateFrom = view.metadata.dateFrom;
      filters.dateTo = view.metadata.dateTo;
    } else if (domain === "journey") {
      const filtered = applyJourneyFilters(payload.clients || [], filters);
      value = def.compute(filtered, filters);
      base.metric_definition = def.definition || null;
      base.metric_rule = def.rule || null;
      if (typeof value === "number" && value < 0) {
        base.warnings.push("O indicador resultou negativo: há eventos com data anterior à contratação na base.");
      }
      if (metric === "average_onboarding_days" && (value === 0 || value == null)) {
        base.warnings.push("Cobertura limitada para o tempo total de onboarding; verifique a base de client_journeys.");
      }
    }

    base.value = value === undefined ? null : value;
    base.label = def.label;
    base.sources = def.sources || [];
    base.filter_labels = buildFilterLabels(filters, { label: periodLabel });
    base.filters = filters;
    base.realtime_database = base.value != null;
    if (base.value == null) base.warnings.push("Indicador não calculável com os dados disponíveis para este recorte.");
    return base;
  } catch (err) {
    console.error("[portal-query] executePortalQuery", domain, metric, err?.message || err);
    base.warnings.push("Não foi possível calcular o indicador no momento.");
    return base;
  }
}

export function localPlanToQueryPlan(local) {
  return {
    intent: local.intent,
    domain: local.domain,
    metric: local.metric,
    filters: local.filters,
    group_by: null,
    sort: null,
    limit: null,
    periodMeta: local.periodMeta,
    periodLabel: local.periodLabel,
    ambiguities: local.ambiguities,
    warnings: local.warnings,
    _engineerToken: local._engineerToken,
  };
}

/* ------------------------------------------------------------------ */
/* Entrada principal: monta o dados_contexto confiável                 */
/* ------------------------------------------------------------------ */

/**
 * resolvePortalContext(question, now): planeja localmente, valida e executa.
 * Mantido para compatibilidade; o /api/assistant preferencialmente usa
 * o fluxo plan (n8n) → validateQueryPlan → executePortalQuery.
 */
export async function resolvePortalContext(question, now = new Date()) {
  const plan = resolvePortalQuestion(question, now);
  const { intent } = plan;

  if (intent !== "value" && intent !== "mixed") {
    const ambiguities = [...plan.ambiguities];
    const nq = normalize(question);
    if (!plan.metric && !plan.domain && /\b(dados|informac|recent|resumo|situacao|status|panorama)\b/.test(nq)) {
      try {
        const payload = await computeGeneralDataPayload();
        const cands = detectEngineerCandidates(nq, uniqueEngineers(payload));
        if (cands.length) {
          ambiguities.push("Você quer consultar os clientes da carteira de um Engenheiro Patrimonial, um cliente específico ou outra página do portal?");
          ambiguities.push("Qual indicador você quer consultar?");
          ambiguities.push(cands.length === 1 ? `Confirmar o Engenheiro Patrimonial: ${cands[0]}.` : `Qual Engenheiro Patrimonial? ${cands.join(", ")}.`);
        }
      } catch { /* ignore */ }
    }
    if (ambiguities.length) {
      return {
        intent,
        dados_contexto: {
          domain: null, metric: null, value: null, label: null,
          filters: plan.filters, filter_labels: [], sources: [],
          warnings: [...plan.warnings], ambiguities,
          realtime_database: false, generated_at: nowIso(),
        },
      };
    }
    return { intent, dados_contexto: null };
  }

  const qp = localPlanToQueryPlan(plan);
  const validated = validateQueryPlan(qp);
  if (validated.pending || !validated.ok) {
    return {
      intent,
      dados_contexto: {
        domain: qp.domain, metric: qp.metric, value: null, label: null,
        filters: qp.filters, filter_labels: [], sources: [],
        warnings: validated.warnings || [],
        ambiguities: validated.clarification || [],
        realtime_database: false, generated_at: nowIso(),
      },
    };
  }

  const result = await executePortalQuery(validated.plan, now, {
    question,
    engineerToken: plan._engineerToken,
  });
  return { intent, dados_contexto: result, query_plan: validated.plan };
}
