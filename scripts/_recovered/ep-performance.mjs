import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";
import {
  computeGeneralDataPayload,
  robustStats,
} from "./general-data.mjs";
import { computeMeetingsPayload } from "./meetings.mjs";

/**
 * Performance do Engenheiro Patrimonial (BASE QV).
 *
 * Atribuição: somente EP atual (clients.engenheiro_patrimonial).
 * Sem histórico de responsável — eventos históricos vão para o EP atual.
 *
 * Calculável:
 * - carteira / composição
 * - percentual cancelado da carteira (composição, NÃO taxa temporal)
 * - cobertura e frequência de reuniões
 *
 * Não calculável nesta página:
 * - taxa temporal de cancelamento (sem exposição no período)
 * - NPS por EP (fonte nps_responses ok; join ainda não exposto na UI)
 * - tempo de resposta / renovação (sem fonte)
 * - mecanismos via App Pharus (só sugestões — não é implementação)
 */

function pct(n, d) {
  if (d == null || d <= 0 || n == null) return null;
  return Math.round((n / d) * 1000) / 10;
}

function round1(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function blankToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inPeriod(iso, from, to) {
  if (!from && !to) return true;
  const d = parseDate(iso);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function sampleSizeBucket(n) {
  if (n == null || n <= 0) return { code: "empty", label: "Sem clientes" };
  if (n < 10) return { code: "very_small", label: "Amostra muito pequena" };
  if (n < 30) return { code: "small", label: "Amostra pequena" };
  return { code: "regular", label: "Amostra regular" };
}

function engineerIsBlank(name) {
  return !name || name === "Não informado";
}

/**
 * @param {{ periodFrom?: Date|null, periodTo?: Date|null }} [options]
 */
export function buildEpPerformanceFromPayloads(generalPayload, meetingsPayload, options = {}) {
  const periodFrom = options.periodFrom || null;
  const periodTo = options.periodTo || null;
  const periodActive = Boolean(periodFrom || periodTo);

  const generalClients = Array.isArray(generalPayload?.clients) ? generalPayload.clients : [];
  const meetingByClient = new Map(
    (Array.isArray(meetingsPayload?.clients) ? meetingsPayload.clients : []).map((c) => [
      String(c.clientId),
      c,
    ]),
  );

  const warnings = [
    {
      code: "ep_assignment_current_only",
      severity: "warning",
      label: "Atribuição ao EP atual",
      message:
        "Os eventos históricos são atribuídos ao EP atualmente registrado no cliente. Mudanças anteriores de responsável não estão disponíveis.",
    },
  ];

  const pending = {
    temporalCancellationRate: {
      status: "unavailable",
      sourceFound: false,
      note:
        "Taxa temporal (cancelamentos no período ÷ expostos) não implementada: não há forma segura de identificar clientes expostos no período.",
    },
    nps: {
      status: "pending",
      sourceFound: true,
      tables: ["nps_responses"],
      note:
        "Fonte NPS confirmada (score 0–10, client_id). Removida da UI até o join com EP atual ser exposto com amostra.",
    },
    responseTime: {
      status: "unavailable",
      sourceFound: false,
      note: "Tempo de resposta: sem data de solicitação + primeira resposta do EP confirmadas.",
    },
    renewal: {
      status: "unavailable",
      sourceFound: false,
      note: "Renovação: sem população de elegíveis confirmada na BASE QV.",
    },
    mechanismsPerEp: {
      status: "unavailable",
      sourceFound: false,
      source: "app_pharus",
      tables: ["user_mechanisms", "mechanisms"],
      note:
        "Não viável com a fonte atual: o App Pharus registra sugestões (status suggested), não conclusões de implementação. Sem implemented_at e sem chave confirmada App Pharus ↔ cliente BASE QV.",
    },
  };

  if (periodActive) {
    warnings.push({
      code: "period_applies_to_meetings",
      severity: "info",
      label: "Período nas reuniões",
      message:
        "O período filtra reuniões pela data do evento. O percentual cancelado da carteira permanece composição da carteira registrada (não é taxa temporal).",
    });
  }

  const byEngineer = new Map();

  for (const client of generalClients) {
    const engineer = blankToNull(client.engineer) || "Não informado";
    const clientId = String(client.clientId || client.id || "");
    if (!clientId) continue;

    if (!byEngineer.has(engineer)) {
      byEngineer.set(engineer, { engineer, clients: [] });
    }

    const meetingClient = meetingByClient.get(clientId);
    const validMeetingStarts = (Array.isArray(meetingClient?.meetings) ? meetingClient.meetings : [])
      .filter((m) => m && m.meetingDateStatus !== "before_client_entry" && m.meetingDateStatus !== "invalid")
      .map((m) => m.startTime)
      .filter(Boolean);

    let meetingsInScope = validMeetingStarts;
    if (periodActive) {
      meetingsInScope = validMeetingStarts.filter((iso) => inPeriod(iso, periodFrom, periodTo));
    }

    const cancelled = client.analyticalStatus === "Cancelado" || client.status === "Cancelado";
    const cancelledInPeriod =
      cancelled && (!periodActive || inPeriod(client.cancellationDate, periodFrom, periodTo));

    byEngineer.get(engineer).clients.push({
      clientId,
      clientName: client.clientName || client.name || "Não informado",
      clientCode: client.clientCode || client.codigo || null,
      analyticalStatus: client.analyticalStatus || client.status || "Não informado",
      segment: client.segmentLabel || client.segment || "Dados insuficientes",
      cancellationDate: client.cancellationDate || null,
      cancelled,
      cancelledInPeriod,
      totalMeetings: meetingsInScope.length,
      meetingDates: validMeetingStarts,
      hireDate: client.acquisitionDate || client.hireDate || client.contractDate || null,
    });
  }

  const engineers = [...byEngineer.values()]
    .map((bucket) => {
      const clients = bucket.clients;
      const totalClients = clients.length;
      const activeClients = clients.filter((c) => c.analyticalStatus === "Ativo").length;
      const frozenClients = clients.filter((c) => c.analyticalStatus === "Congelado").length;
      const cancelledClients = clients.filter((c) => c.cancelled).length;
      const unknownStatusClients = clients.filter((c) => c.analyticalStatus === "Não informado").length;
      const activeOrFrozenClients = activeClients + frozenClients;
      const cancelledInPeriod = clients.filter((c) => c.cancelledInPeriod).length;

      // Composição da carteira — NÃO é taxa temporal de performance
      const cancelledShareOfPortfolio = pct(cancelledClients, totalClients);

      const meetingCounts = clients.map((c) => c.totalMeetings);
      const totalMeetings = meetingCounts.reduce((a, b) => a + b, 0);
      const clientsWithMeeting = meetingCounts.filter((n) => n > 0).length;
      const clientsWithoutMeeting = totalClients - clientsWithMeeting;
      const meetingCoverage = pct(clientsWithMeeting, totalClients);
      const averageMeetingsPerClient =
        totalClients > 0 ? round1(totalMeetings / totalClients) : null;
      const countsWithMeeting = meetingCounts.filter((n) => n > 0);
      const medianMeetingsAmongWithMeetings = round1(robustStats(countsWithMeeting).median);
      const medianMeetingsAllClients = round1(robustStats(meetingCounts).median);

      const sample = sampleSizeBucket(totalClients);
      const qualityAlerts = [];
      if (engineerIsBlank(bucket.engineer)) qualityAlerts.push("EP não informado");
      if (sample.code === "very_small") qualityAlerts.push("Amostra muito pequena");
      else if (sample.code === "small") qualityAlerts.push("Amostra pequena");
      if (clientsWithoutMeeting === totalClients && totalClients > 0) {
        qualityAlerts.push("Nenhuma reunião na carteira");
      }
      if (cancelledShareOfPortfolio === 100 && totalClients < 10) {
        qualityAlerts.push("100% cancelado em amostra pequena — interpretação limitada");
      }

      const statusSum = activeClients + frozenClients + cancelledClients + unknownStatusClients;
      if (statusSum !== totalClients) {
        qualityAlerts.push("Soma de status diverge do total de clientes");
      }

      return {
        engineer: bucket.engineer,
        totalClients,
        activeClients,
        frozenClients,
        activeOrFrozenClients,
        cancelledClients,
        unknownStatusClients,
        cancelledInPeriod,
        cancelledShareOfPortfolio,
        /** @deprecated use cancelledShareOfPortfolio — mantido para compatibilidade chatbot */
        cancellationRate: cancelledShareOfPortfolio,
        meetingCoverage,
        clientsWithMeeting,
        clientsWithoutMeeting,
        totalMeetings,
        averageMeetingsPerClient,
        medianMeetingsAmongWithMeetings,
        medianMeetingsAllClients,
        sampleSize: sample.code,
        sampleSizeLabel: sample.label,
        qualityAlerts,
        methodology: {
          engineerAssignment:
            "EP atual em clients.engenheiro_patrimonial (sem histórico de troca)",
          cancelledShareOfPortfolio:
            "clientes com status analítico Cancelado ÷ total de clientes atribuídos ao EP",
          meetings:
            "Reuniões válidas da consolidação da página Reuniões; período filtra pela data da reunião",
          meetingCoverage: "clientes com ≥1 reunião válida ÷ clientes do EP",
          averageMeetingsPerClient: "total de reuniões válidas ÷ clientes do EP",
          medianMeetingsAmongWithMeetings:
            "mediana da quantidade de reuniões entre clientes com ≥1 reunião",
        },
        clients,
      };
    })
    .sort((a, b) => b.totalClients - a.totalClients || a.engineer.localeCompare(b.engineer, "pt-BR"));

  const withEp = engineers.filter((e) => e.engineer !== "Não informado");
  const clientsWithEp = withEp.reduce((a, e) => a + e.totalClients, 0);
  const clientsWithoutEp = engineers.find((e) => e.engineer === "Não informado")?.totalClients || 0;
  const portfolioStats = robustStats(withEp.map((e) => e.totalClients));

  const overallCancelled = withEp.reduce((a, e) => a + e.cancelledClients, 0);
  const overallCancelledShare = pct(overallCancelled, clientsWithEp);
  const overallWithMeeting = withEp.reduce((a, e) => a + e.clientsWithMeeting, 0);
  const overallMeetingCoverage = pct(overallWithMeeting, clientsWithEp);
  const overallMeetings = withEp.reduce((a, e) => a + e.totalMeetings, 0);
  const overallAvgMeetings =
    clientsWithEp > 0 ? round1(overallMeetings / clientsWithEp) : null;

  if (clientsWithoutEp) {
    warnings.push({
      code: "clients_without_engineer",
      severity: "warning",
      label: "Clientes sem EP",
      count: clientsWithoutEp,
      message: `${clientsWithoutEp} cliente(s) sem Engenheiro Patrimonial informado.`,
    });
  }

  const verySmall = withEp.filter((e) => e.sampleSize === "very_small").length;
  if (verySmall) {
    warnings.push({
      code: "small_samples",
      severity: "warning",
      label: "Amostras muito pequenas",
      count: verySmall,
      message: `${verySmall} EP(s) com menos de 10 clientes — percentuais extremos (ex.: 100%) têm interpretação limitada.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "BASE QV",
    attribution: "current_engineer_only",
    attributionNote:
      "Os eventos históricos são atribuídos ao EP atualmente registrado no cliente. Mudanças anteriores de responsável não estão disponíveis.",
    periodAppliedByEvent: true,
    periodNote:
      "Período aplica-se às reuniões (data do evento). Percentual cancelado da carteira é composição, não taxa temporal.",
    cancellationMetric: {
      id: "cancelled_share_of_portfolio",
      label: "Percentual cancelado da carteira",
      numerator: "clientes com status analítico Cancelado",
      denominator: "total de clientes atribuídos ao EP no recorte",
      isTemporalRate: false,
      periodFilter: "não altera o denominador; cancelamentos no período ficam só como contagem auxiliar",
    },
    summary: {
      totalEngineers: withEp.length,
      totalClients: generalClients.length,
      clientsWithEngineer: clientsWithEp,
      clientsWithoutEngineer: clientsWithoutEp,
      medianClientsPerEngineer:
        portfolioStats.median == null ? null : round1(portfolioStats.median),
      averageClientsPerEngineer:
        portfolioStats.mean == null ? null : round1(portfolioStats.mean),
      cancelledShareOfPortfolio: overallCancelledShare,
      cancelledClients: overallCancelled,
      meetingCoverage: overallMeetingCoverage,
      clientsWithMeeting: overallWithMeeting,
      averageMeetingsPerClient: overallAvgMeetings,
      totalMeetings: overallMeetings,
      /** aliases legados */
      overallCancellationRate: overallCancelledShare,
      medianMeetingsPerClient: null,
    },
    engineers,
    distributions: {
      byPortfolioSize: withEp.map((e) => ({
        label: e.engineer,
        count: e.totalClients,
        active: e.activeClients,
        frozen: e.frozenClients,
        cancelled: e.cancelledClients,
        sampleSize: e.sampleSize,
        percent: pct(e.totalClients, clientsWithEp) || 0,
      })),
      byCancelledShare: withEp.map((e) => ({
        label: e.engineer,
        rate: e.cancelledShareOfPortfolio,
        cancelled: e.cancelledClients,
        total: e.totalClients,
        sampleSize: e.sampleSize,
        sampleSizeLabel: e.sampleSizeLabel,
      })),
      byMeetingCoverage: withEp.map((e) => ({
        label: e.engineer,
        coverage: e.meetingCoverage,
        withMeeting: e.clientsWithMeeting,
        total: e.totalClients,
        sampleSize: e.sampleSize,
      })),
      byMeetingFrequency: withEp.map((e) => ({
        label: e.engineer,
        average: e.averageMeetingsPerClient,
        medianAmongWithMeetings: e.medianMeetingsAmongWithMeetings,
        totalMeetings: e.totalMeetings,
        withMeeting: e.clientsWithMeeting,
        total: e.totalClients,
        sampleSize: e.sampleSize,
      })),
      byActive: withEp.map((e) => ({
        label: e.engineer,
        count: e.activeClients,
        percent: pct(e.activeClients, clientsWithEp) || 0,
        sampleSize: e.sampleSize,
      })),
    },
    pending,
    warnings,
    quality: {
      usedFields: [
        { schema: "public", table: "clients", column: "engenheiro_patrimonial" },
        { schema: "public", table: "clients", column: "status" },
        { schema: "public", table: "cancellations", column: "distrato_assinado_at" },
        { schema: "public", table: "cancellations", column: "data_pedido" },
        { schema: "public", table: "cancellations", column: "intencao_registrada_at" },
        { schema: "public", table: "client_meetings", column: "client_id" },
        { schema: "public", table: "manual_meetings", column: "client_id" },
        { schema: "public", table: "meeting_attendance", column: "status" },
      ],
      notes: [
        "Percentual cancelado = composição da carteira registrada (EP atual).",
        "App Pharus: sugestões ≠ implementação — métrica de mecanismos por EP não liberada.",
      ],
    },
  };
}

export async function computeEpPerformancePayload(options = {}) {
  const cfg = dataConfigurationError();
  if (cfg) {
    const err = new Error(cfg);
    err.code = "config";
    throw err;
  }
  const [generalPayload, meetingsPayload] = await Promise.all([
    computeGeneralDataPayload(),
    computeMeetingsPayload(),
  ]);
  return buildEpPerformanceFromPayloads(generalPayload, meetingsPayload, options);
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

  const cfg = dataConfigurationError();
  if (cfg) {
    return Response.json({ error: cfg, code: "config" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const payload = await computeEpPerformancePayload();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[EP Performance]", error instanceof Error ? error.message : error);
    return Response.json(
      {
        error: "Não foi possível consolidar a performance dos EPs.",
        code: error?.code || "data_query_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
