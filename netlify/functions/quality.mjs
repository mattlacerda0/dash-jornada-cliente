import { requireCorporateAuth } from "./_shared/auth.mjs";
import { dataConfigurationError } from "./_shared/env.mjs";

// domain, table, column, includeBlank
// Uniqueness key: public.{table}.{column}
const FIELDS = [
  ["Cliente", "clients", "id", false],
  ["Cliente", "clients", "codigo", true],
  ["Cliente", "clients", "qv_id", true],
  ["Cliente", "clients", "name", true],
  ["Cliente", "clients", "email", true],
  ["Cliente", "clients", "phone", true],
  ["Cliente", "clients", "created_at", false],
  ["Cliente", "clients", "data_inicio_ciclo", false],
  ["Cliente", "clients", "status", true],
  ["Cliente", "clients", "segmentacao", true],
  ["Cliente", "clients", "engenheiro_patrimonial", true],
  ["Cliente", "clients", "objetivo_principal", true],
  ["Cancelamento", "clients", "data_churn", false],
  ["Cancelamento", "clients", "motivo_churn", true],
  ["Financeiro", "client_financial_data", "client_id", false],
  ["Financeiro", "client_financial_data", "created_at", false],
  ["Financeiro", "client_financial_data", "updated_at", false],
  ["Financeiro", "client_financial_data", "ultima_renda_mensal", false],
  ["Financeiro", "client_financial_data", "ultimo_aporte", false],
  ["Financeiro", "client_financial_data", "reserva_liquidez", false],
  ["Financeiro", "client_financial_data", "valor_imoveis_quitados", false],
  ["Financeiro", "client_financial_data", "possui_imovel", false],
  ["Financeiro", "client_financial_data", "possui_carro", false],
  ["Financeiro", "client_financial_data", "possui_consorcio", false],
  ["Financeiro", "client_financial_data", "cheque_especial", false],
  ["Financeiro", "client_financial_data", "parcelamento_cartao", false],
  ["Financeiro", "client_financial_data", "credito_pessoal", false],
  ["Financeiro", "client_financial_data", "credito_consignado", false],
  ["Jornada", "client_journeys", "started_at", false],
  ["Jornada", "client_journeys", "current_stage_id", false],
  ["Reuniões", "client_meetings", "id", false],
  ["Reuniões", "client_meetings", "client_id", false],
  ["Reuniões", "client_meetings", "calendly_event_uri", true],
  ["Reuniões", "client_meetings", "event_name", true],
  ["Reuniões", "client_meetings", "start_time", false],
  ["Reuniões", "client_meetings", "end_time", false],
  ["Reuniões", "client_meetings", "host_email", true],
  ["Reuniões", "client_meetings", "manually_linked", false],
  ["Reuniões", "manual_meetings", "id", false],
  ["Reuniões", "manual_meetings", "client_id", false],
  ["Reuniões", "manual_meetings", "title", true],
  ["Reuniões", "manual_meetings", "start_time", false],
  ["Reuniões", "manual_meetings", "end_time", false],
  ["Reuniões", "manual_meetings", "google_event_id", true],
  ["Reuniões", "manual_meetings", "recurrence_group_id", false],
  ["Reuniões", "meeting_attendance", "calendly_event_uri", true],
  ["Reuniões", "meeting_attendance", "status", true],
  ["Reuniões", "meeting_attendance", "remarcado", false],
  ["Reuniões", "meeting_attendance", "link_gravacao", true],
  ["Reuniões", "meeting_attendance", "created_at", false],
  ["Reuniões", "meeting_attendance", "updated_at", false],
  ["Reuniões", "client_implementation_meeting_date", "client_id", false],
  ["Reuniões", "client_implementation_meeting_date", "meeting_date", false],
  ["Reuniões", "client_implementation_meeting_date", "source", true],
  ["Mecanismos", "client_mecanismos", "id", false],
  ["Mecanismos", "client_mecanismos", "client_id", false],
  ["Mecanismos", "client_mecanismos", "mecanismo_id", false],
  ["Mecanismos", "client_mecanismos", "status", true],
  ["Mecanismos", "client_mecanismos", "implemented_at", false],
  ["Mecanismos", "client_mecanismos", "created_at", false],
  ["Mecanismos", "client_mecanismos", "no_plano", false],
  ["Mecanismos", "client_mecanismos", "sequence", false],
  ["Mecanismos", "client_mecanismos", "source", true],
  ["Mecanismos", "client_mecanismos", "valor_aplicado", false],
  ["Mecanismos", "mecanismos", "id", false],
  ["Mecanismos", "mecanismos", "name", true],
  ["Mecanismos", "mecanismos", "categoria", true],
  ["Mecanismos", "mecanismos", "mercado", true],
  ["Mecanismos", "mecanismos", "programa", true],
  ["Mecanismos", "mecanismos", "status", true],
  ["Satisfação", "nps_responses", "score", false],
  ["Satisfação", "nps_responses", "submitted_at", false],
  ["Satisfação", "csat_responses", "score", false],
  ["Satisfação", "csat_responses", "submitted_at", false],
  ["Cancelamento", "cancellations", "client_id", false],
  ["Cancelamento", "cancellations", "motivo", true],
  ["Cancelamento", "cancellations", "motivo_categoria", false],
  ["Cancelamento", "cancellations", "distrato_assinado_at", false],
  ["Cancelamento", "cancellations", "data_pedido", false],
  ["Cancelamento", "cancellations", "intencao_registrada_at", false],
  ["Cancelamento", "cancellations", "archived_at", false],
  ["Cancelamento", "cancellations", "churn_efetivado_at", false],
  ["Cancelamento", "cancellations", "updated_at", false],
  ["Cancelamento", "cancellations", "created_at", false],
  ["Aquisição", "vw_info_cliente", "id_cliente", false],
  ["Aquisição", "vw_info_cliente", "data_assinatura_contrato", false],
  ["Atendimento", "demands", "id", false],
  ["Atendimento", "demands", "client_id", false],
  ["Atendimento", "demands", "title", true],
  ["Atendimento", "demands", "type", true],
  ["Atendimento", "demands", "priority", true],
  ["Atendimento", "demands", "status", true],
  ["Atendimento", "demands", "requested_by_client", false],
  ["Atendimento", "demands", "assigned_to", false],
  ["Atendimento", "demands", "resolved_at", false],
  ["Atendimento", "demands", "resolved_by", false],
  ["Atendimento", "demands", "created_at", false],
  ["Atendimento", "demands", "updated_at", false],
];

const FIELD_DESCRIPTIONS = {
  "clients.id": "Identificador técnico único do cliente.",
  "clients.codigo": "Código de identificação do cliente na Quarta Via.",
  "clients.name": "Nome do cliente.",
  "clients.created_at": "Data de criação do cadastro, usada como último fallback quando as datas de contratação não estão disponíveis.",
  "clients.data_inicio_ciclo": "Data de início do ciclo do cliente, usada como entrada da jornada (aquisição e validação de reuniões).",
  "clients.data_churn": "Data de churn registrada no cadastro do cliente.",
  "clients.status": "Situação atual do cliente, usada na classificação entre ativo, cancelado e congelado.",
  "clients.segmentacao": "Segmento atribuído ao cliente.",
  "clients.engenheiro_patrimonial": "Engenheiro Patrimonial responsável pelo acompanhamento do cliente.",
  "cancellations.client_id": "Cliente vinculado ao registro de cancelamento.",
  "cancellations.distrato_assinado_at": "Data em que o distrato do cliente foi assinado.",
  "cancellations.data_pedido": "Data em que o pedido de cancelamento foi registrado.",
  "cancellations.intencao_registrada_at": "Data em que a intenção de cancelamento foi registrada.",
  "cancellations.archived_at": "Data de arquivamento lógico do processo de cancelamento; registros arquivados são ignorados na consolidação.",
  "cancellations.churn_efetivado_at": "Data em que o cancelamento foi efetivamente concluído (legado; a consolidação analítica usa distrato/pedido/intenção).",
  "cancellations.updated_at": "Data de atualização do cancelamento, usada para escolher o registro mais recente.",
  "cancellations.created_at": "Data de criação do registro de cancelamento, usada como apoio na consolidação.",
  "vw_info_cliente.id_cliente": "Identificador do cliente na visão de informações cadastrais.",
  "vw_info_cliente.data_assinatura_contrato": "Data em que o contrato do cliente foi assinado, usada como referência principal de aquisição.",
  "client_financial_data.client_id": "Cliente vinculado às informações financeiras.",
  "client_financial_data.created_at": "Data de criação do registro financeiro do cliente.",
  "client_financial_data.updated_at": "Data da última atualização conhecida do registro financeiro.",
  "client_financial_data.reserva_liquidez": "Valor informado como reserva de liquidez do cliente.",
  "client_financial_data.valor_imoveis_quitados": "Valor total dos imóveis quitados informado pelo cliente.",
  "client_financial_data.ultimo_aporte": "Valor do último aporte financeiro registrado.",
  "client_financial_data.ultima_renda_mensal": "Última renda mensal registrada para o cliente.",
  "client_financial_data.possui_imovel": "Indica se o cliente informou possuir imóvel.",
  "client_financial_data.possui_carro": "Indica se o cliente informou possuir carro.",
  "client_financial_data.possui_consorcio": "Indica se o cliente informou possuir consórcio.",
  "client_financial_data.cheque_especial": "Indica se o cliente possui cheque especial (usado para identificar dívidas).",
  "client_financial_data.parcelamento_cartao": "Indica se o cliente possui parcelamento de cartão (usado para identificar dívidas).",
  "client_financial_data.credito_pessoal": "Indica se o cliente possui crédito pessoal (usado para identificar dívidas).",
  "client_financial_data.credito_consignado": "Indica se o cliente possui crédito consignado (usado para identificar dívidas).",
  "client_meetings.id": "Identificador único da reunião registrada.",
  "client_meetings.client_id": "Cliente vinculado à reunião.",
  "client_meetings.calendly_event_uri": "Identificador externo do evento no Calendly.",
  "client_meetings.event_name": "Título ou nome da reunião.",
  "client_meetings.start_time": "Data e horário de início da reunião. Reuniões anteriores à entrada do cliente são excluídas das métricas de intervalo, primeira reunião e dias desde a última.",
  "client_meetings.end_time": "Data e horário de término da reunião.",
  "client_meetings.host_email": "E-mail do anfitrião responsável pela reunião.",
  "client_meetings.manually_linked": "Indica se a reunião foi vinculada manualmente ao cliente.",
  "manual_meetings.id": "Identificador único da reunião criada manualmente.",
  "manual_meetings.client_id": "Cliente vinculado à reunião manual.",
  "manual_meetings.title": "Título da reunião manual.",
  "manual_meetings.start_time": "Data e horário de início da reunião manual. Reuniões anteriores à entrada do cliente são excluídas das métricas temporais da jornada.",
  "manual_meetings.end_time": "Data e horário de término da reunião manual.",
  "manual_meetings.google_event_id": "Identificador do evento relacionado no Google Calendar.",
  "manual_meetings.recurrence_group_id": "Identificador usado para agrupar reuniões recorrentes.",
  "meeting_attendance.calendly_event_uri": "Identificador da reunião associado ao registro de presença.",
  "meeting_attendance.status": "Situação de presença do cliente na reunião.",
  "meeting_attendance.remarcado": "Indica se a reunião foi remarcada.",
  "meeting_attendance.link_gravacao": "Link da gravação associado ao registro de presença.",
  "meeting_attendance.created_at": "Data de criação do registro de presença.",
  "meeting_attendance.updated_at": "Data de atualização do registro de presença, usada para escolher o mais recente.",
  "client_implementation_meeting_date.meeting_date": "Data registrada para a primeira reunião de implementação.",
  "client_implementation_meeting_date.client_id": "Cliente vinculado à reunião de implementação.",
  "client_implementation_meeting_date.source": "Fonte da data registrada para a reunião de implementação.",
  "client_mecanismos.id": "Identificador técnico do vínculo cliente-mecanismo.",
  "client_mecanismos.client_id": "Cliente vinculado ao mecanismo.",
  "client_mecanismos.mecanismo_id": "Mecanismo vinculado ao cliente.",
  "client_mecanismos.status": "Etapa atual do mecanismo: apto, iniciado ou concluído.",
  "client_mecanismos.implemented_at": "Data e horário em que a implementação foi concluída.",
  "client_mecanismos.created_at": "Data de criação do registro do mecanismo.",
  "client_mecanismos.no_plano": "Indica se o mecanismo faz parte do plano do cliente.",
  "client_mecanismos.sequence": "Ordem do mecanismo na jornada do cliente.",
  "client_mecanismos.source": "Origem do registro do mecanismo.",
  "client_mecanismos.valor_aplicado": "Valor aplicado associado à implementação do mecanismo.",
  "mecanismos.id": "Identificador do mecanismo no catálogo.",
  "mecanismos.name": "Nome do mecanismo no catálogo.",
  "mecanismos.categoria": "Categoria cadastral do mecanismo (baixa cobertura nesta base).",
  "mecanismos.mercado": "Mercado associado ao mecanismo, usado como dimensão analítica.",
  "mecanismos.programa": "Programa ao qual o mecanismo está vinculado.",
  "mecanismos.status": "Status cadastral do mecanismo no catálogo.",
  "demands.id": "Identificador único do chamado de atendimento.",
  "demands.client_id": "Cliente vinculado ao chamado de atendimento.",
  "demands.title": "Título do chamado de atendimento.",
  "demands.type": "Tipo/origem do chamado (não representa reclamação/elogio sem categoria confirmada).",
  "demands.priority": "Prioridade informada para o chamado.",
  "demands.status": "Status do chamado (aberto, em andamento, resolvido etc.).",
  "demands.requested_by_client": "Indica se o chamado foi solicitado pelo cliente.",
  "demands.assigned_to": "Responsável designado pelo chamado.",
  "demands.resolved_at": "Data de resolução do chamado, usada para tempo de resolução.",
  "demands.resolved_by": "Usuário que resolveu o chamado.",
  "demands.created_at": "Data de abertura do chamado.",
  "demands.updated_at": "Data da última atualização do chamado.",
};

/** Dashboards que consomem a coluna (sem incluir campos só da própria página de qualidade). */
const FIELD_USED_IN = {
  "clients.id": ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
  "clients.codigo": ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
  "clients.name": ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
  "clients.created_at": ["Dados Gerais", "Reuniões", "Implementação de Mecanismos"],
  "clients.data_inicio_ciclo": ["Dados Gerais", "Reuniões", "Implementação de Mecanismos"],
  "clients.data_churn": ["Dados Gerais"],
  "clients.status": ["Dados Gerais", "Implementação de Mecanismos", "Atualização Financeira"],
  "clients.segmentacao": ["Dados Gerais"],
  "clients.engenheiro_patrimonial": ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
  "client_mecanismos.id": ["Implementação de Mecanismos"],
  "client_mecanismos.client_id": ["Implementação de Mecanismos"],
  "client_mecanismos.mecanismo_id": ["Implementação de Mecanismos"],
  "client_mecanismos.status": ["Implementação de Mecanismos"],
  "client_mecanismos.implemented_at": ["Implementação de Mecanismos"],
  "client_mecanismos.created_at": ["Implementação de Mecanismos"],
  "client_mecanismos.no_plano": ["Implementação de Mecanismos"],
  "client_mecanismos.sequence": ["Implementação de Mecanismos"],
  "client_mecanismos.source": ["Implementação de Mecanismos"],
  "client_mecanismos.valor_aplicado": ["Implementação de Mecanismos"],
  "mecanismos.id": ["Implementação de Mecanismos"],
  "mecanismos.name": ["Implementação de Mecanismos"],
  "mecanismos.categoria": ["Implementação de Mecanismos"],
  "mecanismos.mercado": ["Implementação de Mecanismos"],
  "mecanismos.programa": ["Implementação de Mecanismos"],
  "mecanismos.status": ["Implementação de Mecanismos"],
  "cancellations.client_id": ["Dados Gerais"],
  "cancellations.distrato_assinado_at": ["Dados Gerais"],
  "cancellations.data_pedido": ["Dados Gerais"],
  "cancellations.intencao_registrada_at": ["Dados Gerais"],
  "cancellations.archived_at": ["Dados Gerais"],
  "cancellations.churn_efetivado_at": ["Dados Gerais"],
  "cancellations.updated_at": ["Dados Gerais"],
  "cancellations.created_at": ["Dados Gerais"],
  "vw_info_cliente.id_cliente": ["Dados Gerais"],
  "vw_info_cliente.data_assinatura_contrato": ["Dados Gerais"],
  "client_financial_data.client_id": ["Dados Gerais", "Atualização Financeira"],
  "client_financial_data.created_at": ["Atualização Financeira"],
  "client_financial_data.updated_at": ["Dados Gerais", "Atualização Financeira"],
  "client_financial_data.reserva_liquidez": ["Dados Gerais", "Atualização Financeira", "Segmentação por capacidade financeira"],
  "client_financial_data.valor_imoveis_quitados": ["Segmentação por capacidade financeira"],
  "client_financial_data.ultimo_aporte": ["Dados Gerais", "Atualização Financeira", "Segmentação por capacidade financeira"],
  "client_financial_data.ultima_renda_mensal": ["Dados Gerais", "Atualização Financeira", "Segmentação por capacidade financeira"],
  "client_financial_data.possui_imovel": ["Dados Gerais", "Atualização Financeira"],
  "client_financial_data.possui_carro": ["Dados Gerais", "Atualização Financeira"],
  "client_financial_data.possui_consorcio": ["Dados Gerais", "Atualização Financeira"],
  "client_financial_data.cheque_especial": ["Segmentação por capacidade financeira"],
  "client_financial_data.parcelamento_cartao": ["Segmentação por capacidade financeira"],
  "client_financial_data.credito_pessoal": ["Segmentação por capacidade financeira"],
  "client_financial_data.credito_consignado": ["Segmentação por capacidade financeira"],
  "client_meetings.id": ["Reuniões"],
  "client_meetings.client_id": ["Reuniões"],
  "client_meetings.calendly_event_uri": ["Reuniões"],
  "client_meetings.event_name": ["Reuniões"],
  "client_meetings.start_time": ["Reuniões"],
  "client_meetings.end_time": ["Reuniões"],
  "client_meetings.host_email": ["Reuniões"],
  "client_meetings.manually_linked": ["Reuniões"],
  "manual_meetings.id": ["Reuniões"],
  "manual_meetings.client_id": ["Reuniões"],
  "manual_meetings.title": ["Reuniões"],
  "manual_meetings.start_time": ["Reuniões"],
  "manual_meetings.end_time": ["Reuniões"],
  "manual_meetings.google_event_id": ["Reuniões"],
  "manual_meetings.recurrence_group_id": ["Reuniões"],
  "meeting_attendance.calendly_event_uri": ["Reuniões"],
  "meeting_attendance.status": ["Reuniões"],
  "meeting_attendance.remarcado": ["Reuniões"],
  "meeting_attendance.link_gravacao": ["Reuniões"],
  "meeting_attendance.created_at": ["Reuniões"],
  "meeting_attendance.updated_at": ["Reuniões"],
  "client_implementation_meeting_date.client_id": ["Reuniões"],
  "client_implementation_meeting_date.meeting_date": ["Reuniões"],
  "client_implementation_meeting_date.source": ["Reuniões"],
  "demands.id": ["Atendimento"],
  "demands.client_id": ["Atendimento"],
  "demands.title": ["Atendimento"],
  "demands.type": ["Atendimento"],
  "demands.priority": ["Atendimento"],
  "demands.status": ["Atendimento"],
  "demands.requested_by_client": ["Atendimento"],
  "demands.assigned_to": ["Atendimento"],
  "demands.resolved_at": ["Atendimento"],
  "demands.resolved_by": ["Atendimento"],
  "demands.created_at": ["Atendimento"],
  "demands.updated_at": ["Atendimento"],
};

const TABLE_COUNT_SELECT = {
  client_implementation_meeting_date: "client_id",
  vw_info_cliente: "id_cliente",
};

function configurationError() {
  return dataConfigurationError();
}

function countSelectColumn(table) {
  return TABLE_COUNT_SELECT[table] || "id";
}

async function countRows(table, column, includeBlank = false) {
  const url = new URL(`/rest/v1/${table}`, process.env.DATA_SUPABASE_URL);
  const selectCol = countSelectColumn(table);
  url.searchParams.set("select", selectCol);
  url.searchParams.set("limit", "1");
  if (column) {
    if (includeBlank) url.searchParams.set("or", `(${column}.is.null,${column}.eq.)`);
    else url.searchParams.set(column, "is.null");
  }
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "public",
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let code = "";
    let message = detail.slice(0, 200);
    try {
      const parsed = JSON.parse(detail);
      code = parsed.code || "";
      message = parsed.message || message;
    } catch {
      /* keep raw */
    }
    console.error("[Quality]", {
      table,
      column: column || null,
      httpStatus: response.status,
      code: code || null,
      message: message.slice(0, 160),
    });
    const err = new Error(`${table}.${column || "*"}: HTTP ${response.status}${code ? ` [${code}]` : ""} ${message}`.trim());
    err.meta = {
      table,
      column: column || null,
      httpStatus: response.status,
      code: code || null,
      message,
    };
    throw err;
  }
  const range = response.headers.get("content-range") || "*/0";
  return Number(range.slice(range.lastIndexOf("/") + 1));
}

function foldStatusToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeClientStatus(rawStatus) {
  const token = foldStatusToken(rawStatus);
  if (!token || token === "null" || token === "undefined" || token === "vazio") return "Não informado";
  if (["ativo", "active", "ativa"].includes(token)) return "Ativo";
  if (
    ["churn", "cancelado", "cancelada", "canceled", "cancelled", "encerrado", "encerrada", "inativo", "inativa", "inactive"].includes(token) ||
    token.includes("cancel") || token.includes("churn") || token.includes("encerr")
  ) return "Cancelado";
  if (
    ["congelado", "congelada", "freeze", "frozen", "pausado", "pausada"].includes(token) ||
    token.includes("congel") || token.includes("pausad")
  ) return "Congelado";
  return "Não informado";
}

async function fetchClientStatuses() {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const url = new URL("/rest/v1/clients", process.env.DATA_SUPABASE_URL);
    url.searchParams.set("select", "status");
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "public",
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) throw new Error(`clients.status consistency: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

function clientsStatusConsistency(rows) {
  const byNormalized = new Map();
  const distinctRaw = new Set();
  for (const row of rows) {
    const raw = row?.status == null || String(row.status).trim() === "" ? null : String(row.status);
    if (raw) distinctRaw.add(raw);
    const label = normalizeClientStatus(raw);
    if (!byNormalized.has(label)) byNormalized.set(label, new Set());
    if (raw) byNormalized.get(label).add(raw);
  }
  const notes = [...byNormalized.entries()]
    .filter(([, set]) => set.size > 1)
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, set]) => `${set.size} variações de escrita encontradas para o status ${label}.`);
  if (distinctRaw.size) {
    notes.unshift(`${distinctRaw.size} valores distintos encontrados na coluna original de status.`);
  }
  return {
    distinctRawValues: [...distinctRaw].sort((a, b) => a.localeCompare(b, "pt-BR")),
    distinctRawCount: distinctRaw.size,
    notes,
  };
}

function assertUniqueFields(fields) {
  const seen = new Set();
  for (const [, table, column] of fields) {
    const key = `public.${table}.${column}`;
    if (seen.has(key)) throw new Error(`Campo duplicado na qualidade: ${key}`);
    seen.add(key);
  }
}

async function fetchAllRows(table, select, order = "id.asc") {
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
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

function parseDateLoose(value) {
  if (value == null || String(value).trim() === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCancelDateByClient(cancellations) {
  const STAGE_RANK = { d: 3, p: 2, i: 1 };
  const map = new Map();
  for (const row of cancellations) {
    if (!row.client_id || parseDateLoose(row.archived_at)) continue;
    const distrato = parseDateLoose(row.distrato_assinado_at);
    const pedido = parseDateLoose(row.data_pedido);
    const intencao = parseDateLoose(row.intencao_registrada_at);
    const date = distrato || pedido || intencao;
    if (!date) continue;
    const rank = distrato ? 3 : pedido ? 2 : 1;
    const current = map.get(row.client_id);
    if (!current || rank > current.rank || (rank === current.rank && date > current.date)) {
      map.set(row.client_id, { date, rank });
    }
  }
  return map;
}

async function preEntryMeetingsAudit() {
  const [clients, calendly, manual] = await Promise.all([
    fetchAllRows("clients", "id,data_inicio_ciclo,created_at"),
    fetchAllRows("client_meetings", "client_id,start_time"),
    fetchAllRows("manual_meetings", "client_id,start_time"),
  ]);
  const entryByClient = new Map();
  for (const client of clients) {
    const cycle = parseDateLoose(client.data_inicio_ciclo);
    const created = parseDateLoose(client.created_at);
    entryByClient.set(String(client.id), cycle || created || null);
  }
  let related = 0;
  let preEntry = 0;
  const impacted = new Set();
  for (const row of [...calendly, ...manual]) {
    const start = parseDateLoose(row.start_time);
    if (!start || !row.client_id) continue;
    related += 1;
    const entry = entryByClient.get(String(row.client_id));
    if (!entry) continue;
    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const entryDay = Date.UTC(entry.getUTCFullYear(), entry.getUTCMonth(), entry.getUTCDate());
    if (startDay < entryDay) {
      preEntry += 1;
      impacted.add(String(row.client_id));
    }
  }
  const pctRelated = related ? Math.round((preEntry / related) * 1000) / 10 : 0;
  return {
    related,
    preEntry,
    clientsImpacted: impacted.size,
    notes: [
      `Reuniões anteriores à entrada do cliente: ${preEntry} de ${related} reuniões relacionadas (${pctRelated}%).`,
      `Clientes impactados: ${impacted.size}.`,
      "Impacto nos indicadores: excluídas de primeira reunião, intervalo típico, dias desde a última, médias/medianas e faixas (sem abs nem zero).",
    ],
  };
}

async function closedWithoutCancellationAudit() {
  const [clients, cancellations] = await Promise.all([
    fetchAllRows("clients", "id,status,data_churn"),
    fetchAllRows(
      "cancellations",
      "client_id,distrato_assinado_at,data_pedido,intencao_registrada_at,archived_at",
    ),
  ]);
  const cancelMap = buildCancelDateByClient(cancellations);
  let closed = 0;
  let closedWithoutDate = 0;
  for (const client of clients) {
    const cancelDate = cancelMap.get(client.id)?.date || parseDateLoose(client.data_churn);
    const analytical = cancelDate ? "Cancelado" : normalizeClientStatus(client.status);
    if (analytical !== "Cancelado") continue;
    closed += 1;
    if (!cancelDate) closedWithoutDate += 1;
  }
  const pctClosed = closed ? Math.round((closedWithoutDate / closed) * 1000) / 10 : 0;
  const pctAll = clients.length ? Math.round((closedWithoutDate / clients.length) * 1000) / 10 : 0;
  return {
    closed,
    closedWithoutDate,
    notes: [
      `Cliente encerrado sem data de cancelamento: ${closedWithoutDate} casos (${pctClosed}% dos encerrados; ${pctAll}% da carteira).`,
      "Impacto na permanência: esses clientes são excluídos do indicador Permanência típica (não usam a data atual).",
    ],
  };
}

const OPTIONAL_QUALITY_TABLES = new Set(["vw_info_cliente"]);

function humanizePostgrestFailure(meta = {}, fallbackMessage = "") {
  const code = meta.code || "";
  const message = meta.message || fallbackMessage || "";
  if (code === "57014" || /timeout|canceling statement/i.test(message)) {
    return "Consulta expirou (timeout no banco).";
  }
  if (code === "42703" || /column .* does not exist/i.test(message)) {
    return "Coluna não encontrada.";
  }
  if (responseNotFound(meta.httpStatus, message)) {
    return "Tabela ou view não encontrada.";
  }
  if (meta.httpStatus) {
    return `Falha HTTP ${meta.httpStatus}${code ? ` [${code}]` : ""}.`;
  }
  return message.slice(0, 160) || "Falha desconhecida na consulta.";
}

function responseNotFound(status, message) {
  return status === 404 || /does not exist|not find/i.test(message || "");
}

function warningImpact(table, column) {
  const usedIn = FIELD_USED_IN[`${table}.${column}`] || [];
  if (table === "vw_info_cliente") {
    return "Indicador de aquisição/assinatura em Dados Gerais usa fallback (sem bloquear o restante da página).";
  }
  if (usedIn.length) {
    return `Afeta: ${usedIn.join(", ")}. Demais indicadores da página de Qualidade seguem válidos.`;
  }
  return "Demais indicadores da página de Qualidade seguem válidos.";
}

function buildFieldWarning(reason, fieldHint = {}) {
  const meta = reason?.meta || {};
  const table = meta.table || fieldHint.table || "desconhecida";
  const column = meta.column ?? fieldHint.column ?? null;
  const optional = OPTIONAL_QUALITY_TABLES.has(table);
  return {
    table,
    column,
    httpStatus: meta.httpStatus || null,
    code: meta.code || null,
    reason: humanizePostgrestFailure(meta, reason instanceof Error ? reason.message : String(reason || "")),
    impact: warningImpact(table, column),
    optional,
    usedIn: FIELD_USED_IN[`${table}.${column}`] || [],
    message: reason instanceof Error ? reason.message : String(reason || "Falha desconhecida"),
  };
}

export default async (request) => {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;
  const configError = configurationError();
  if (configError) return Response.json({ error: configError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    assertUniqueFields(FIELDS);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Configuração inválida" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  const totals = new Map();
  const totalFor = (table) => {
    if (!totals.has(table)) totals.set(table, countRows(table));
    return totals.get(table);
  };
  const settled = await Promise.allSettled(FIELDS.map(async ([domain, table, column, includeBlank]) => {
    const [totalRows, missingRows] = await Promise.all([totalFor(table), countRows(table, column, includeBlank)]);
    const key = `${table}.${column}`;
    const item = { domain, table, column, totalRows, missingRows };
    const description = FIELD_DESCRIPTIONS[key];
    if (description) item.description = description;
    const usedIn = FIELD_USED_IN[key];
    if (usedIn?.length) item.usedIn = usedIn;
    return item;
  }));
  const data = settled.filter((item) => item.status === "fulfilled").map((item) => item.value)
    .sort((a, b) => `${a.domain}.${a.table}.${a.column}`.localeCompare(`${b.domain}.${b.table}.${b.column}`));

  const warnings = [];
  const hardErrors = [];
  settled.forEach((item, index) => {
    if (item.status !== "rejected") return;
    const field = FIELDS[index];
    const warning = buildFieldWarning(item.reason, {
      table: field?.[1],
      column: field?.[2],
    });
    warnings.push(warning);
    if (!warning.optional) hardErrors.push(warning.message);
  });

  try {
    const consistency = clientsStatusConsistency(await fetchClientStatuses());
    const statusField = data.find((item) => item.table === "clients" && item.column === "status");
    if (statusField) {
      statusField.consistencyNotes = consistency.notes;
      statusField.distinctRawValues = consistency.distinctRawValues;
      statusField.distinctRawCount = consistency.distinctRawCount;
    }
  } catch (error) {
    const warning = buildFieldWarning(error, { table: "clients", column: "status" });
    warning.reason = "Falha na auditoria de consistência de status.";
    warning.impact = "Normalização de status pode ficar incompleta nos dashboards.";
    warning.optional = false;
    warnings.push(warning);
    hardErrors.push(warning.message);
  }
  try {
    const stayAudit = await closedWithoutCancellationAudit();
    const statusField = data.find((item) => item.table === "clients" && item.column === "status");
    if (statusField) {
      statusField.consistencyNotes = [...(statusField.consistencyNotes || []), ...stayAudit.notes];
    }
    for (const column of ["distrato_assinado_at", "data_pedido", "intencao_registrada_at"]) {
      const field = data.find((item) => item.table === "cancellations" && item.column === column);
      if (field) {
        field.consistencyNotes = [...(field.consistencyNotes || []), ...stayAudit.notes];
      }
    }
  } catch (error) {
    const warning = buildFieldWarning(error, { table: "cancellations", column: null });
    warning.reason = "Falha na auditoria de permanência.";
    warning.impact = "Notas de permanência podem ficar incompletas.";
    warning.optional = false;
    warnings.push(warning);
    hardErrors.push(warning.message);
  }
  try {
    const preEntryAudit = await preEntryMeetingsAudit();
    for (const key of [
      ["client_meetings", "start_time"],
      ["manual_meetings", "start_time"],
      ["clients", "data_inicio_ciclo"],
      ["clients", "created_at"],
    ]) {
      const field = data.find((item) => item.table === key[0] && item.column === key[1]);
      if (field) {
        field.consistencyNotes = [...(field.consistencyNotes || []), ...preEntryAudit.notes];
      }
    }
  } catch (error) {
    const warning = buildFieldWarning(error, { table: "client_meetings", column: "start_time" });
    warning.reason = "Falha na auditoria de reuniões pré-entrada.";
    warning.impact = "Notas de reuniões pré-entrada podem ficar incompletas.";
    warning.optional = false;
    warnings.push(warning);
    hardErrors.push(warning.message);
  }

  const failedTables = [...new Set(warnings.map((w) => w.table).filter(Boolean))];
  const connectionStatus = !data.length && warnings.length
    ? "failed"
    : warnings.length
      ? "connected_with_alerts"
      : "connected";

  return Response.json(
    {
      data,
      warnings,
      errors: hardErrors.length ? hardErrors : warnings.map((w) => w.message),
      failedTables,
      connectionStatus,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
