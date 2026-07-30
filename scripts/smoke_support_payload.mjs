/**
 * Smoke local do payload de Atendimento (n8n fallback).
 * Uso: node --env-file=.env scripts/smoke_support_payload.mjs
 */
import { computeSupportPayload } from "../netlify/functions/support.mjs";

const payload = await computeSupportPayload({ accessToken: "", allowN8nFallback: true });
const s = payload.summary || {};
const meta = payload.meta || {};

function top(list, n = 8) {
  return (list || []).filter((i) => i.count > 0).slice(0, n);
}

console.log(JSON.stringify({
  source: payload.source,
  rowCountAcionamentos: meta.rowCountAcionamentos,
  rowCountTratados: meta.rowCountTratados,
  totalTickets: s.totalTickets,
  urgentTickets: s.urgentTickets,
  identifiedClients: s.identifiedClients,
  ticketsWithClient: s.ticketsWithClient,
  identificationCoverage: s.identificationCoverage,
  topArea: s.topArea,
  topAreaCount: s.topAreaCount,
  topType: s.topType,
  topTypeCount: s.topTypeCount,
  byArea: top(payload.byArea),
  byType: top(payload.byType),
  byPriority: top(payload.byPriority),
  byStatusRaw: top(meta.rawStatus || payload.byStatus),
  byRequester: top(payload.byRequester, 10),
  monthlyEvolutionSample: (payload.monthlyEvolution || []).slice(0, 3).concat((payload.monthlyEvolution || []).slice(-2)),
  dataCoverage: payload.dataCoverage,
  identification: payload.identification,
  statusDiversityUseful: meta.statusDiversityUseful,
  resolutionCoverageUseful: meta.resolutionCoverageUseful,
  qualityWarnings: (payload.qualityWarnings || []).slice(0, 8),
  sampleRow: (payload.tickets || [])[0] ? {
    ticketId: payload.tickets[0].ticketId,
    area: payload.tickets[0].area,
    areaChart: payload.tickets[0].areaChart,
    type: payload.tickets[0].type,
    priority: payload.tickets[0].priority,
    status: payload.tickets[0].status,
    clientLabel: payload.tickets[0].clientLabel,
  } : null,
}, null, 2));
