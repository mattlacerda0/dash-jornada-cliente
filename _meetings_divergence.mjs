/**
 * Diagnóstico TEMPORÁRIO e LOCAL da divergência Reuniões (dashboard x chatbot).
 * Não faz Git, não faz deploy, não altera o banco. Usa IDs técnicos e contagens
 * agregadas (sem dados pessoais). Cenário congelado: 21/07/2026.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
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

const { resolvePortalContext } = await import("./netlify/functions/_shared/portal-query.mjs");
const { computeMeetingsPayload } = await import("./netlify/functions/meetings.mjs");

const NOW = new Date("2026-07-21T20:51:00Z"); // 21/07/2026 17:51 (UTC-3)
const payload = await computeMeetingsPayload();
const clients = payload.clients || [];

/* --------- Replicação FIEL do dashboard Reuniões (index.html) --------- */
const isAnalytic = (m) => m && m.meetingDateStatus !== "before_client_entry" && m.meetingDateStatus !== "invalid";
const keyOf = (m) => m.meetingId || `${m.source}|${m.startTime}|${m.title || ""}`;

function periodWindow(cfg) {
  // Réplica de periodStart()/periodEnd() do dashboard.
  if (cfg.period === "all") return { from: null, to: null };
  if (cfg.period === "custom") {
    return {
      from: cfg.from ? new Date(cfg.from + "T00:00:00Z") : null,
      to: cfg.to ? new Date(cfg.to + "T23:59:59Z") : null,
    };
  }
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - Number(cfg.period));
  return { from: d, to: null }; // presets NÃO têm limite superior (inclui futuras)
}
function inWindow(m, w) {
  const s = m.startTime ? new Date(m.startTime) : null;
  if (!s || Number.isNaN(s.getTime())) return false;
  if (w.from && s < w.from) return false;
  if (w.to && s > w.to) return false;
  return true;
}
function periodDivisor(cfg) {
  if (cfg.period === "all") return null;
  if (cfg.period === "30") return 1;
  if (cfg.period === "90") return 3;
  if (cfg.period === "180") return 6;
  if (cfg.period === "365") return 12;
  if (cfg.period === "custom") {
    const w = periodWindow(cfg);
    const a = w.from, b = w.to || NOW;
    if (!a) return null;
    return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1);
  }
  return Math.max(1, Math.round(Number(cfg.period) / 30));
}
function clientMeetings(c, cfg) {
  const all = (c.meetings || []).filter(isAnalytic);
  if (cfg.period === "all") return all;
  const w = periodWindow(cfg);
  return all.filter((m) => inWindow(m, w));
}
function dashboardSummary(cfg) {
  const periodActive = cfg.period !== "all";
  const rows = [];
  const keys = new Set();
  for (const c of clients) {
    const meetings = clientMeetings(c, cfg);
    if (cfg.engineer && c.engineer !== cfg.engineer) continue;
    if (cfg.first === "yes" && c.firstMeetingCompleted !== true) continue;
    if (cfg.first === "no" && c.firstMeetingCompleted !== false) continue;
    if (cfg.attendance && !meetings.some((m) => m.attendanceStatus === cfg.attendance)) continue;
    if (periodActive && !meetings.length) continue;
    const absences = periodActive ? meetings.filter((m) => m.attendanceStatus === "nao_compareceu").length : c.absences;
    const reschedules = periodActive ? meetings.filter((m) => m.rescheduled).length : c.reschedules;
    if (cfg.absence === "yes" && !(absences > 0)) continue;
    if (cfg.reschedule === "yes" && !(reschedules > 0)) continue;
    rows.push({ meetings: periodActive ? meetings : (c.meetings || []).filter(isAnalytic), absences, reschedules, firstMeetingCompleted: c.firstMeetingCompleted });
  }
  let total = 0;
  for (const r of rows) for (const m of r.meetings) { const k = keyOf(m); if (!keys.has(k)) { keys.add(k); total += 1; } }
  const divisor = periodActive ? periodDivisor(cfg) : null;
  let avg = null;
  if (total && periodActive && divisor) avg = Math.round((total / divisor) * 10) / 10;
  const flat = rows.flatMap((r) => r.meetings);
  const classifiable = flat.filter((m) => { const s = m.startTime ? new Date(m.startTime) : null; if (!s || s > NOW) return false; return m.attendanceStatus === "compareceu" || m.attendanceStatus === "nao_compareceu"; });
  const attended = classifiable.filter((m) => m.attendanceStatus === "compareceu").length;
  return {
    total,
    avg,
    divisor,
    totalNoShows: rows.reduce((a, r) => a + (r.absences || 0), 0),
    totalReschedules: rows.reduce((a, r) => a + (r.reschedules || 0), 0),
    attendanceRate: classifiable.length ? Math.round((attended / classifiable.length) * 1000) / 10 : null,
    clientsWithFirstMeeting: rows.filter((r) => r.firstMeetingCompleted === true).length,
    keys,
  };
}

/* ------------------------ 1) CAUSA DA DIVERGÊNCIA ------------------------ */
// setDash: regra real da tela (rolling now-30d, sem limite superior, inclui futuras).
const setDash = dashboardSummary({ period: "30" });
// setOld: regra ANTIGA do chatbot (limite SP início-do-dia 22/06 .. 22/07 exclusivo; exclui futuras).
const oldFrom = new Date("2026-06-22T03:00:00Z");
const oldTo = new Date("2026-07-22T03:00:00Z");
const oldKeys = new Set();
for (const c of clients) for (const m of (c.meetings || []).filter(isAnalytic)) {
  const s = new Date(m.startTime);
  if (s >= oldFrom && s < oldTo) oldKeys.add(keyOf(m));
}
// Índice p/ classificar divergências.
const byKey = new Map();
for (const c of clients) for (const m of (c.meetings || []).filter(isAnalytic)) byKey.set(keyOf(m), m);

const onlyInDashboard = [...setDash.keys].filter((k) => !oldKeys.has(k));
const onlyInOld = [...oldKeys].filter((k) => !setDash.keys.has(k));
const reason = { futura: 0, borda_inferior: 0, outro: 0 };
for (const k of onlyInDashboard) {
  const m = byKey.get(k);
  const s = new Date(m.startTime);
  if (s > NOW) reason.futura += 1;
  else if (s < oldFrom) reason.borda_inferior += 1;
  else reason.outro += 1;
}

console.log("========== 1) CAUSA (Últimos 30 dias) ==========");
console.log(JSON.stringify({
  dashboardCount: setDash.total,
  oldAssistantCount: oldKeys.size,
  onlyInDashboard: onlyInDashboard.length,
  onlyInOldAssistant: onlyInOld.length,
  motivosOnlyInDashboard: reason,
}, null, 2));
console.log("dashboard: rolling", periodWindow({ period: "30" }).from.toISOString(), "-> aberto (inclui futuras)");
console.log("chatbot antigo: 2026-06-22T03:00Z -> 2026-07-22T03:00Z (SP, exclui futuras)");

/* --------------------- 2) TABELA COMPARATIVA (item 10) --------------------- */
async function engine(q, field = "value") {
  const r = await resolvePortalContext(q, NOW);
  const dc = r.dados_contexto || {};
  return field === "value" ? dc.value : dc[field];
}

// Engenheiro com mais reuniões (para o cenário EP).
const engCount = new Map();
for (const c of clients) { if (!c.engineer || c.engineer === "Não informado") continue; engCount.set(c.engineer, (engCount.get(c.engineer) || 0) + (c.totalMeetings || 0)); }
const topEng = [...engCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

const scenarios = [
  ["Todo o histórico", dashboardSummary({ period: "all" }).total, await engine("quantas reunioes no total")],
  ["Últimos 30 dias", setDash.total, await engine("quantas reunioes nos ultimos 30 dias")],
  ["Último mês (jun/2026)", dashboardSummary({ period: "custom", from: "2026-06-01", to: "2026-06-30" }).total, await engine("quantas reunioes no ultimo mes")],
  ["Este mês (jul/2026)", dashboardSummary({ period: "custom", from: "2026-07-01", to: "2026-07-31" }).total, await engine("quantas reunioes este mes")],
  ["Intervalo 22/06–21/07", dashboardSummary({ period: "custom", from: "2026-06-22", to: "2026-07-21" }).total, await engine("quantas reunioes entre 22/06/2026 e 21/07/2026")],
  [`EP ${topEng || "-"}`, dashboardSummary({ period: "all", engineer: topEng }).total, await engine(`quantas reunioes do EP ${topEng || ""}`)],
  ["Comparecimento (%)", dashboardSummary({ period: "all" }).attendanceRate, await engine("qual a taxa de comparecimento")],
  ["No-shows", dashboardSummary({ period: "all" }).totalNoShows, await engine("quantos no-shows")],
  ["Remarcações", dashboardSummary({ period: "all" }).totalReschedules, await engine("quantas reunioes remarcadas")],
  ["Com primeira reunião", dashboardSummary({ period: "all" }).clientsWithFirstMeeting, await engine("quantos clientes com primeira reuniao")],
];

console.log("\n========== 2) TABELA COMPARATIVA ==========");
console.log("| Cenário | Dashboard | Chatbot | Resultado |");
console.log("|---|---:|---:|---|");
let allOk = true;
for (const [name, dash, bot] of scenarios) {
  const ok = dash === bot;
  if (!ok) allOk = false;
  console.log(`| ${name} | ${dash} | ${bot} | ${ok ? "OK" : "XX"} |`);
}

/* --------------------- 3) MÉDIA/MÊS (item 8) --------------------- */
const avgMeta = await resolvePortalContext("qual a media de reunioes por mes nos ultimos 30 dias", NOW);
console.log("\n========== 3) MÉDIA/MÊS (Últimos 30 dias) ==========");
console.log(JSON.stringify({
  totalMeetings: setDash.total,
  periodMonthDivisor: setDash.divisor,
  averageMeetingsPerMonth_dashboard: setDash.avg,
  averageMeetingsPerMonth_chatbot: avgMeta.dados_contexto?.value ?? null,
}, null, 2));

console.log(allOk ? "\n>>> TODOS OS CENÁRIOS BATEM." : "\n>>> AINDA HÁ DIVERGÊNCIA.");
