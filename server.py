#!/usr/bin/env python3
import json
import os
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent


def _parse_env_line(raw: str):
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    if not key:
        return None
    return key, value


def load_env():
    """Carrega .env (e opcionalmente exemplo.env) antes de validar variáveis."""
    candidates = [ROOT / ".env", ROOT / "exemplo.env"]
    loaded_from = None

    try:
        from dotenv import load_dotenv  # type: ignore

        for path in candidates:
            if path.exists():
                load_dotenv(path, override=False)
                if loaded_from is None:
                    loaded_from = path.name
    except ImportError:
        pass

    # Parser próprio: garante chaves mesmo sem python-dotenv e normaliza espaços.
    for path in candidates:
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8-sig").splitlines():
            parsed = _parse_env_line(raw)
            if not parsed:
                continue
            key, value = parsed
            # Não sobrescrever variáveis já definidas no ambiente do processo.
            if key not in os.environ or not str(os.environ.get(key) or "").strip():
                os.environ[key] = value
        if loaded_from is None:
            loaded_from = path.name

    if loaded_from is None:
        raise RuntimeError("Arquivo .env não encontrado (procure .env ao lado de server.py).")
    print(f"Variáveis carregadas de {loaded_from}")

# (domain, table, column, include_blank) — uniqueness: public.{table}.{column}
FIELDS = [
    ("Cliente", "clients", "id", False),
    ("Cliente", "clients", "codigo", True),
    ("Cliente", "clients", "qv_id", True),
    ("Cliente", "clients", "name", True),
    ("Cliente", "clients", "email", True),
    ("Cliente", "clients", "phone", True),
    ("Cliente", "clients", "created_at", False),
    ("Cliente", "clients", "data_inicio_ciclo", False),
    ("Cliente", "clients", "status", True),
    ("Cliente", "clients", "segmentacao", True),
    ("Cliente", "clients", "engenheiro_patrimonial", True),
    ("Cliente", "clients", "objetivo_principal", True),
    ("Cancelamento", "clients", "data_churn", False),
    ("Cancelamento", "clients", "motivo_churn", True),
    ("Financeiro", "client_financial_data", "client_id", False),
    ("Financeiro", "client_financial_data", "created_at", False),
    ("Financeiro", "client_financial_data", "updated_at", False),
    ("Financeiro", "client_financial_data", "ultima_renda_mensal", False),
    ("Financeiro", "client_financial_data", "ultimo_aporte", False),
    ("Financeiro", "client_financial_data", "reserva_liquidez", False),
    ("Financeiro", "client_financial_data", "valor_imoveis_quitados", False),
    ("Financeiro", "client_financial_data", "possui_imovel", False),
    ("Financeiro", "client_financial_data", "possui_carro", False),
    ("Financeiro", "client_financial_data", "possui_consorcio", False),
    ("Financeiro", "client_financial_data", "cheque_especial", False),
    ("Financeiro", "client_financial_data", "parcelamento_cartao", False),
    ("Financeiro", "client_financial_data", "credito_pessoal", False),
    ("Financeiro", "client_financial_data", "credito_consignado", False),
    ("Jornada", "client_journeys", "started_at", False),
    ("Jornada", "client_journeys", "current_stage_id", False),
    ("Reuniões", "client_meetings", "id", False),
    ("Reuniões", "client_meetings", "client_id", False),
    ("Reuniões", "client_meetings", "calendly_event_uri", True),
    ("Reuniões", "client_meetings", "event_name", True),
    ("Reuniões", "client_meetings", "start_time", False),
    ("Reuniões", "client_meetings", "end_time", False),
    ("Reuniões", "client_meetings", "host_email", True),
    ("Reuniões", "client_meetings", "manually_linked", False),
    ("Reuniões", "manual_meetings", "id", False),
    ("Reuniões", "manual_meetings", "client_id", False),
    ("Reuniões", "manual_meetings", "title", True),
    ("Reuniões", "manual_meetings", "start_time", False),
    ("Reuniões", "manual_meetings", "end_time", False),
    ("Reuniões", "manual_meetings", "google_event_id", True),
    ("Reuniões", "manual_meetings", "recurrence_group_id", False),
    ("Reuniões", "meeting_attendance", "calendly_event_uri", True),
    ("Reuniões", "meeting_attendance", "status", True),
    ("Reuniões", "meeting_attendance", "remarcado", False),
    ("Reuniões", "meeting_attendance", "link_gravacao", True),
    ("Reuniões", "meeting_attendance", "created_at", False),
    ("Reuniões", "meeting_attendance", "updated_at", False),
    ("Reuniões", "client_implementation_meeting_date", "client_id", False),
    ("Reuniões", "client_implementation_meeting_date", "meeting_date", False),
    ("Reuniões", "client_implementation_meeting_date", "source", True),
    ("Mecanismos", "client_mecanismos", "id", False),
    ("Mecanismos", "client_mecanismos", "client_id", False),
    ("Mecanismos", "client_mecanismos", "mecanismo_id", False),
    ("Mecanismos", "client_mecanismos", "status", True),
    ("Mecanismos", "client_mecanismos", "implemented_at", False),
    ("Mecanismos", "client_mecanismos", "created_at", False),
    ("Mecanismos", "client_mecanismos", "no_plano", False),
    ("Mecanismos", "client_mecanismos", "sequence", False),
    ("Mecanismos", "client_mecanismos", "source", True),
    ("Mecanismos", "client_mecanismos", "valor_aplicado", False),
    ("Mecanismos", "mecanismos", "id", False),
    ("Mecanismos", "mecanismos", "name", True),
    ("Mecanismos", "mecanismos", "categoria", True),
    ("Mecanismos", "mecanismos", "mercado", True),
    ("Mecanismos", "mecanismos", "programa", True),
    ("Mecanismos", "mecanismos", "status", True),
    ("Satisfação", "nps_responses", "score", False),
    ("Satisfação", "nps_responses", "submitted_at", False),
    ("Satisfação", "csat_responses", "score", False),
    ("Satisfação", "csat_responses", "submitted_at", False),
    ("Cancelamento", "cancellations", "client_id", False),
    ("Cancelamento", "cancellations", "motivo", True),
    ("Cancelamento", "cancellations", "motivo_categoria", False),
    ("Cancelamento", "cancellations", "distrato_assinado_at", False),
    ("Cancelamento", "cancellations", "data_pedido", False),
    ("Cancelamento", "cancellations", "intencao_registrada_at", False),
    ("Cancelamento", "cancellations", "archived_at", False),
    ("Cancelamento", "cancellations", "churn_efetivado_at", False),
    ("Cancelamento", "cancellations", "updated_at", False),
    ("Cancelamento", "cancellations", "created_at", False),
    ("Aquisição", "vw_info_cliente", "id_cliente", False),
    ("Aquisição", "vw_info_cliente", "data_assinatura_contrato", False),
    ("Atendimento", "demands", "id", False),
    ("Atendimento", "demands", "client_id", False),
    ("Atendimento", "demands", "title", True),
    ("Atendimento", "demands", "type", True),
    ("Atendimento", "demands", "priority", True),
    ("Atendimento", "demands", "status", True),
    ("Atendimento", "demands", "requested_by_client", False),
    ("Atendimento", "demands", "assigned_to", False),
    ("Atendimento", "demands", "resolved_at", False),
    ("Atendimento", "demands", "resolved_by", False),
    ("Atendimento", "demands", "created_at", False),
    ("Atendimento", "demands", "updated_at", False),
]

FIELD_DESCRIPTIONS = {
    ("clients", "id"): "Identificador técnico único do cliente.",
    ("clients", "codigo"): "Código de identificação do cliente na Quarta Via.",
    ("clients", "name"): "Nome do cliente.",
    ("clients", "created_at"): "Data de criação do cadastro, usada como último fallback quando as datas de contratação não estão disponíveis.",
    ("clients", "data_inicio_ciclo"): "Data de início do ciclo do cliente, usada como fallback da aquisição.",
    ("clients", "data_churn"): "Data de churn registrada no cadastro do cliente.",
    ("clients", "status"): "Situação atual do cliente, usada na classificação entre ativo, cancelado e congelado.",
    ("clients", "segmentacao"): "Segmento atribuído ao cliente.",
    ("clients", "engenheiro_patrimonial"): "Engenheiro Patrimonial responsável pelo acompanhamento do cliente.",
    ("cancellations", "client_id"): "Cliente vinculado ao registro de cancelamento.",
    ("cancellations", "distrato_assinado_at"): "Data em que o distrato do cliente foi assinado.",
    ("cancellations", "data_pedido"): "Data em que o pedido de cancelamento foi registrado.",
    ("cancellations", "intencao_registrada_at"): "Data em que a intenção de cancelamento foi registrada.",
    ("cancellations", "archived_at"): "Data de arquivamento lógico do processo de cancelamento; registros arquivados são ignorados na consolidação.",
    ("cancellations", "churn_efetivado_at"): "Data em que o cancelamento foi efetivamente concluído (legado; a consolidação analítica usa distrato/pedido/intenção).",
    ("cancellations", "updated_at"): "Data de atualização do cancelamento, usada para escolher o registro mais recente.",
    ("cancellations", "created_at"): "Data de criação do registro de cancelamento, usada como apoio na consolidação.",
    ("vw_info_cliente", "id_cliente"): "Identificador do cliente na visão de informações cadastrais.",
    ("vw_info_cliente", "data_assinatura_contrato"): "Data em que o contrato do cliente foi assinado, usada como referência principal de aquisição.",
    ("client_financial_data", "client_id"): "Cliente vinculado às informações financeiras.",
    ("client_financial_data", "created_at"): "Data de criação do registro financeiro do cliente.",
    ("client_financial_data", "updated_at"): "Data da última atualização conhecida do registro financeiro.",
    ("client_financial_data", "reserva_liquidez"): "Valor informado como reserva de liquidez do cliente.",
    ("client_financial_data", "valor_imoveis_quitados"): "Valor total dos imóveis quitados informado pelo cliente.",
    ("client_financial_data", "ultimo_aporte"): "Valor do último aporte financeiro registrado.",
    ("client_financial_data", "ultima_renda_mensal"): "Última renda mensal registrada para o cliente.",
    ("client_financial_data", "possui_imovel"): "Indica se o cliente informou possuir imóvel.",
    ("client_financial_data", "possui_carro"): "Indica se o cliente informou possuir carro.",
    ("client_financial_data", "possui_consorcio"): "Indica se o cliente informou possuir consórcio.",
    ("client_financial_data", "cheque_especial"): "Indica se o cliente possui cheque especial (usado para identificar dívidas).",
    ("client_financial_data", "parcelamento_cartao"): "Indica se o cliente possui parcelamento de cartão (usado para identificar dívidas).",
    ("client_financial_data", "credito_pessoal"): "Indica se o cliente possui crédito pessoal (usado para identificar dívidas).",
    ("client_financial_data", "credito_consignado"): "Indica se o cliente possui crédito consignado (usado para identificar dívidas).",
    ("client_meetings", "id"): "Identificador único da reunião registrada.",
    ("client_meetings", "client_id"): "Cliente vinculado à reunião.",
    ("client_meetings", "calendly_event_uri"): "Identificador externo do evento no Calendly.",
    ("client_meetings", "event_name"): "Título ou nome da reunião.",
    ("client_meetings", "start_time"): "Data e horário de início da reunião.",
    ("client_meetings", "end_time"): "Data e horário de término da reunião.",
    ("client_meetings", "host_email"): "E-mail do anfitrião responsável pela reunião.",
    ("client_meetings", "manually_linked"): "Indica se a reunião foi vinculada manualmente ao cliente.",
    ("manual_meetings", "id"): "Identificador único da reunião criada manualmente.",
    ("manual_meetings", "client_id"): "Cliente vinculado à reunião manual.",
    ("manual_meetings", "title"): "Título da reunião manual.",
    ("manual_meetings", "start_time"): "Data e horário de início da reunião manual.",
    ("manual_meetings", "end_time"): "Data e horário de término da reunião manual.",
    ("manual_meetings", "google_event_id"): "Identificador do evento relacionado no Google Calendar.",
    ("manual_meetings", "recurrence_group_id"): "Identificador usado para agrupar reuniões recorrentes.",
    ("meeting_attendance", "calendly_event_uri"): "Identificador da reunião associado ao registro de presença.",
    ("meeting_attendance", "status"): "Situação de presença do cliente na reunião.",
    ("meeting_attendance", "remarcado"): "Indica se a reunião foi remarcada.",
    ("meeting_attendance", "link_gravacao"): "Link da gravação associado ao registro de presença.",
    ("meeting_attendance", "created_at"): "Data de criação do registro de presença.",
    ("meeting_attendance", "updated_at"): "Data de atualização do registro de presença, usada para escolher o mais recente.",
    ("client_implementation_meeting_date", "meeting_date"): "Data registrada para a primeira reunião de implementação.",
    ("client_implementation_meeting_date", "client_id"): "Cliente vinculado à reunião de implementação.",
    ("client_implementation_meeting_date", "source"): "Fonte da data registrada para a reunião de implementação.",
    ("client_mecanismos", "id"): "Identificador técnico do vínculo cliente-mecanismo.",
    ("client_mecanismos", "client_id"): "Cliente vinculado ao mecanismo.",
    ("client_mecanismos", "mecanismo_id"): "Mecanismo vinculado ao cliente.",
    ("client_mecanismos", "status"): "Etapa atual do mecanismo: apto, iniciado ou concluído.",
    ("client_mecanismos", "implemented_at"): "Data e horário em que a implementação foi concluída.",
    ("client_mecanismos", "created_at"): "Data de criação do registro do mecanismo.",
    ("client_mecanismos", "no_plano"): "Indica se o mecanismo faz parte do plano do cliente.",
    ("client_mecanismos", "sequence"): "Ordem do mecanismo na jornada do cliente.",
    ("client_mecanismos", "source"): "Origem do registro do mecanismo.",
    ("client_mecanismos", "valor_aplicado"): "Valor aplicado associado à implementação do mecanismo.",
    ("mecanismos", "id"): "Identificador do mecanismo no catálogo.",
    ("mecanismos", "name"): "Nome do mecanismo no catálogo.",
    ("mecanismos", "categoria"): "Categoria cadastral do mecanismo (baixa cobertura nesta base).",
    ("mecanismos", "mercado"): "Mercado associado ao mecanismo, usado como dimensão analítica.",
    ("mecanismos", "programa"): "Programa ao qual o mecanismo está vinculado.",
    ("mecanismos", "status"): "Status cadastral do mecanismo no catálogo.",
    ("demands", "id"): "Identificador único do chamado de atendimento.",
    ("demands", "client_id"): "Cliente vinculado ao chamado de atendimento.",
    ("demands", "title"): "Título do chamado de atendimento.",
    ("demands", "type"): "Tipo/origem do chamado (não representa reclamação/elogio sem categoria confirmada).",
    ("demands", "priority"): "Prioridade informada para o chamado.",
    ("demands", "status"): "Status do chamado (aberto, em andamento, resolvido etc.).",
    ("demands", "requested_by_client"): "Indica se o chamado foi solicitado pelo cliente.",
    ("demands", "assigned_to"): "Responsável designado pelo chamado.",
    ("demands", "resolved_at"): "Data de resolução do chamado, usada para tempo de resolução.",
    ("demands", "resolved_by"): "Usuário que resolveu o chamado.",
    ("demands", "created_at"): "Data de abertura do chamado.",
    ("demands", "updated_at"): "Data da última atualização do chamado.",
}

FIELD_USED_IN = {
    ("clients", "id"): ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
    ("clients", "codigo"): ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
    ("clients", "name"): ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
    ("clients", "created_at"): ["Dados Gerais", "Reuniões", "Implementação de Mecanismos"],
    ("clients", "data_inicio_ciclo"): ["Dados Gerais", "Reuniões", "Implementação de Mecanismos"],
    ("clients", "data_churn"): ["Dados Gerais"],
    ("clients", "status"): ["Dados Gerais", "Implementação de Mecanismos", "Atualização Financeira"],
    ("clients", "segmentacao"): ["Dados Gerais"],
    ("clients", "engenheiro_patrimonial"): ["Dados Gerais", "Reuniões", "Implementação de Mecanismos", "Atualização Financeira"],
    ("client_mecanismos", "id"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "client_id"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "mecanismo_id"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "status"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "implemented_at"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "created_at"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "no_plano"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "sequence"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "source"): ["Implementação de Mecanismos"],
    ("client_mecanismos", "valor_aplicado"): ["Implementação de Mecanismos"],
    ("mecanismos", "id"): ["Implementação de Mecanismos"],
    ("mecanismos", "name"): ["Implementação de Mecanismos"],
    ("mecanismos", "categoria"): ["Implementação de Mecanismos"],
    ("mecanismos", "mercado"): ["Implementação de Mecanismos"],
    ("mecanismos", "programa"): ["Implementação de Mecanismos"],
    ("mecanismos", "status"): ["Implementação de Mecanismos"],
    ("cancellations", "client_id"): ["Dados Gerais"],
    ("cancellations", "distrato_assinado_at"): ["Dados Gerais"],
    ("cancellations", "data_pedido"): ["Dados Gerais"],
    ("cancellations", "intencao_registrada_at"): ["Dados Gerais"],
    ("cancellations", "archived_at"): ["Dados Gerais"],
    ("cancellations", "churn_efetivado_at"): ["Dados Gerais"],
    ("cancellations", "updated_at"): ["Dados Gerais"],
    ("cancellations", "created_at"): ["Dados Gerais"],
    ("vw_info_cliente", "id_cliente"): ["Dados Gerais"],
    ("vw_info_cliente", "data_assinatura_contrato"): ["Dados Gerais"],
    ("demands", "id"): ["Atendimento"],
    ("demands", "client_id"): ["Atendimento"],
    ("demands", "title"): ["Atendimento"],
    ("demands", "type"): ["Atendimento"],
    ("demands", "priority"): ["Atendimento"],
    ("demands", "status"): ["Atendimento"],
    ("demands", "requested_by_client"): ["Atendimento"],
    ("demands", "assigned_to"): ["Atendimento"],
    ("demands", "resolved_at"): ["Atendimento"],
    ("demands", "resolved_by"): ["Atendimento"],
    ("demands", "created_at"): ["Atendimento"],
    ("demands", "updated_at"): ["Atendimento"],
    ("client_financial_data", "client_id"): ["Dados Gerais", "Atualização Financeira"],
    ("client_financial_data", "created_at"): ["Atualização Financeira"],
    ("client_financial_data", "updated_at"): ["Dados Gerais", "Atualização Financeira"],
    ("client_financial_data", "reserva_liquidez"): ["Dados Gerais", "Atualização Financeira", "Segmentação por capacidade financeira"],
    ("client_financial_data", "valor_imoveis_quitados"): ["Segmentação por capacidade financeira"],
    ("client_financial_data", "ultimo_aporte"): ["Dados Gerais", "Atualização Financeira", "Segmentação por capacidade financeira"],
    ("client_financial_data", "ultima_renda_mensal"): ["Dados Gerais", "Atualização Financeira", "Segmentação por capacidade financeira"],
    ("client_financial_data", "possui_imovel"): ["Dados Gerais", "Atualização Financeira"],
    ("client_financial_data", "possui_carro"): ["Dados Gerais", "Atualização Financeira"],
    ("client_financial_data", "possui_consorcio"): ["Dados Gerais", "Atualização Financeira"],
    ("client_financial_data", "cheque_especial"): ["Segmentação por capacidade financeira"],
    ("client_financial_data", "parcelamento_cartao"): ["Segmentação por capacidade financeira"],
    ("client_financial_data", "credito_pessoal"): ["Segmentação por capacidade financeira"],
    ("client_financial_data", "credito_consignado"): ["Segmentação por capacidade financeira"],
    ("client_meetings", "id"): ["Reuniões"],
    ("client_meetings", "client_id"): ["Reuniões"],
    ("client_meetings", "calendly_event_uri"): ["Reuniões"],
    ("client_meetings", "event_name"): ["Reuniões"],
    ("client_meetings", "start_time"): ["Reuniões"],
    ("client_meetings", "end_time"): ["Reuniões"],
    ("client_meetings", "host_email"): ["Reuniões"],
    ("client_meetings", "manually_linked"): ["Reuniões"],
    ("manual_meetings", "id"): ["Reuniões"],
    ("manual_meetings", "client_id"): ["Reuniões"],
    ("manual_meetings", "title"): ["Reuniões"],
    ("manual_meetings", "start_time"): ["Reuniões"],
    ("manual_meetings", "end_time"): ["Reuniões"],
    ("manual_meetings", "google_event_id"): ["Reuniões"],
    ("manual_meetings", "recurrence_group_id"): ["Reuniões"],
    ("meeting_attendance", "calendly_event_uri"): ["Reuniões"],
    ("meeting_attendance", "status"): ["Reuniões"],
    ("meeting_attendance", "remarcado"): ["Reuniões"],
    ("meeting_attendance", "link_gravacao"): ["Reuniões"],
    ("meeting_attendance", "created_at"): ["Reuniões"],
    ("meeting_attendance", "updated_at"): ["Reuniões"],
    ("client_implementation_meeting_date", "client_id"): ["Reuniões"],
    ("client_implementation_meeting_date", "meeting_date"): ["Reuniões"],
    ("client_implementation_meeting_date", "source"): ["Reuniões"],
}

CLIENT_SELECT = "id,codigo,name,data_inicio_ciclo,created_at,status,segmentacao,engenheiro_patrimonial,data_churn"
CANCEL_SELECT = "client_id,churn_efetivado_at,updated_at,created_at"
FINANCIAL_SELECT = (
    "id,client_id,reserva_liquidez,ultimo_aporte,ultima_renda_mensal,"
    "possui_imovel,possui_carro,possui_consorcio,updated_at"
)
STAY_RANGES = [
    "Até 3 meses",
    "De 4 a 6 meses",
    "De 7 a 12 meses",
    "De 13 a 24 meses",
    "Mais de 24 meses",
    "Sem data de referência",
]
INCOME_BANDS = [
    "Até R$ 5 mil",
    "5 a 10 mil",
    "10 a 20 mil",
    "20 a 50 mil",
    "Acima de 50 mil",
    "Não informado",
]
LIQUIDITY_BANDS = [
    "Até R$ 50 mil",
    "50 a 100 mil",
    "100 a 250 mil",
    "250 a 500 mil",
    "500 mil a 1 milhão",
    "Acima de 1 milhão",
    "Não informado",
]
USED_FIELDS = [
    {"table": "clients", "column": "id", "role": "clientId"},
    {"table": "clients", "column": "codigo", "role": "clientCode"},
    {"table": "clients", "column": "name", "role": "clientName"},
    {"table": "clients", "column": "data_inicio_ciclo", "role": "contractDate"},
    {"table": "clients", "column": "created_at", "role": "stayFallbackDate"},
    {"table": "clients", "column": "status", "role": "status"},
    {"table": "clients", "column": "segmentacao", "role": "segment"},
    {"table": "clients", "column": "engenheiro_patrimonial", "role": "engineer"},
    {"table": "clients", "column": "data_churn", "role": "cancellationDateFallback"},
    {"table": "cancellations", "column": "client_id", "role": "cancellationJoin"},
    {"table": "cancellations", "column": "churn_efetivado_at", "role": "cancellationDatePrimary"},
    {"table": "cancellations", "column": "updated_at", "role": "cancellationRecency"},
    {"table": "cancellations", "column": "created_at", "role": "cancellationCreatedFallback"},
    {"table": "client_financial_data", "column": "client_id", "role": "financialJoin"},
    {"table": "client_financial_data", "column": "reserva_liquidez", "role": "liquidityReserve"},
    {"table": "client_financial_data", "column": "ultimo_aporte", "role": "lastContribution"},
    {"table": "client_financial_data", "column": "ultima_renda_mensal", "role": "monthlyIncome"},
    {"table": "client_financial_data", "column": "possui_imovel", "role": "hasProperty"},
    {"table": "client_financial_data", "column": "possui_carro", "role": "hasCar"},
    {"table": "client_financial_data", "column": "possui_consorcio", "role": "hasConsortium"},
    {"table": "client_financial_data", "column": "updated_at", "role": "financialRecency"},
]


CORPORATE_EMAIL_DOMAIN = "quartavia.com.br"


def is_corporate_email(email):
    if not isinstance(email, str):
        return False
    return email.strip().lower().endswith("@" + CORPORATE_EMAIL_DOMAIN)


def auth_config_payload():
    url = (os.environ.get("AUTH_SUPABASE_URL") or "").strip().rstrip("/")
    anon = (os.environ.get("AUTH_SUPABASE_ANON_KEY") or "").strip()
    if not url or not anon:
        raise RuntimeError("Configure AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY.")
    if not url.startswith("https://"):
        raise RuntimeError("AUTH_SUPABASE_URL deve usar HTTPS.")
    return {
        "authSupabaseUrl": url,
        "authSupabaseAnonKey": anon,
        "corporateDomain": CORPORATE_EMAIL_DOMAIN,
    }


def require_corporate_auth(handler):
    auth = handler.headers.get("Authorization") or handler.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return 401, {"error": "Não autenticado.", "code": "unauthenticated"}
    token = auth[7:].strip()
    if not token:
        return 401, {"error": "Não autenticado.", "code": "unauthenticated"}

    base = (os.environ.get("AUTH_SUPABASE_URL") or "").rstrip("/")
    api_key = (os.environ.get("AUTH_SUPABASE_ANON_KEY") or "").strip()
    if not base or not api_key:
        return 503, {"error": "Configure AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY.", "code": "config"}

    req = Request(
        f"{base}/auth/v1/user",
        headers={"Authorization": f"Bearer {token}", "apikey": api_key},
    )
    try:
        with urlopen(req, timeout=20) as resp:
            user = json.loads(resp.read().decode("utf-8"))
    except HTTPError:
        return 401, {"error": "Sessão inválida ou expirada.", "code": "unauthenticated"}
    except Exception:
        return 401, {"error": "Sessão inválida ou expirada.", "code": "unauthenticated"}

    if not is_corporate_email(user.get("email")):
        return 403, {"error": "O acesso é permitido somente para contas @quartavia.com.br.", "code": "invalid_domain"}
    return None


def send_json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def supabase_headers():
    key = os.environ["DATA_SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "public",
    }


TABLE_COUNT_SELECT = {
    "client_implementation_meeting_date": "client_id",
    "vw_info_cliente": "id_cliente",
}


def count_rows(table, column=None, include_blank=False):
    base = os.environ["DATA_SUPABASE_URL"].rstrip("/")
    select_col = TABLE_COUNT_SELECT.get(table, "id")
    params = {"select": select_col, "limit": "1"}
    if column:
        params[column] = "is.null"
        if include_blank:
            params = {"select": select_col, "limit": "1", "or": f"({column}.is.null,{column}.eq.)"}
    request = Request(
        f"{base}/rest/v1/{table}?{urlencode(params)}",
        headers={
            **supabase_headers(),
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            content_range = response.headers.get("Content-Range", "*/0")
            return int(content_range.rsplit("/", 1)[-1])
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{table}.{column or '*'}: {exc.code} {detail[:180]}") from exc


def measure(field):
    domain, table, column, include_blank = field
    item = {
        "domain": domain,
        "table": table,
        "column": column,
    }
    try:
        item["totalRows"] = count_rows(table)
        item["missingRows"] = count_rows(table, column, include_blank)
    except Exception as exc:
        item["totalRows"] = None
        item["missingRows"] = None
        item["measureError"] = str(exc)[:180]
    description = FIELD_DESCRIPTIONS.get((table, column))
    if description:
        item["description"] = description
    used_in = FIELD_USED_IN.get((table, column))
    if used_in:
        item["usedIn"] = used_in
    return item


def clients_status_consistency():
    rows = fetch_all("clients", "id,status")
    by_normalized = {}
    distinct_raw = set()
    for row in rows:
        raw = blank_to_null(row.get("status"))
        if raw is not None:
            distinct_raw.add(str(raw))
        label = normalize_client_status(raw)
        by_normalized.setdefault(label, set())
        if raw is not None:
            by_normalized[label].add(str(raw))
    notes = [
        f"{len(variants)} variações de escrita encontradas para o status {label}."
        for label, variants in sorted(by_normalized.items())
        if len(variants) > 1
    ]
    if distinct_raw:
        notes.insert(0, f"{len(distinct_raw)} valores distintos encontrados na coluna original de status.")
    return {
        "distinctRawValues": sorted(distinct_raw, key=lambda value: str(value).lower()),
        "distinctRawCount": len(distinct_raw),
        "notes": notes,
    }


def quality_payload():
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(measure, field): field for field in FIELDS}
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                errors.append(str(exc))
    try:
        consistency = clients_status_consistency()
        for item in results:
            if item.get("table") == "clients" and item.get("column") == "status":
                item["consistencyNotes"] = consistency["notes"]
                item["distinctRawValues"] = consistency["distinctRawValues"]
                item["distinctRawCount"] = consistency["distinctRawCount"]
                break
    except Exception as exc:
        errors.append(f"clients.status consistency: {exc}")
    results.sort(key=lambda item: (item["domain"], item["table"], item["column"]))
    return {"data": results, "errors": errors, "generatedAt": datetime.now(timezone.utc).isoformat()}


def fetch_all(table, select, page_size=1000):
    base = os.environ["DATA_SUPABASE_URL"].rstrip("/")
    rows = []
    offset = 0
    while True:
        params = urlencode({"select": select, "order": "id.asc"})
        request = Request(
            f"{base}/rest/v1/{table}?{params}",
            headers={
                **supabase_headers(),
                "Range": f"{offset}-{offset + page_size - 1}",
            },
        )
        try:
            with urlopen(request, timeout=60) as response:
                batch = json.loads(response.read().decode())
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{table}: {exc.code}") from exc
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if offset > 200000:
            break
    return rows


def blank_to_null(value):
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def to_number(value):
    raw = blank_to_null(value)
    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw)
    try:
        return float(str(raw).replace(",", "."))
    except ValueError:
        return None


def to_bool(value):
    raw = blank_to_null(value)
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw != 0
    text = str(raw).strip().lower()
    if text in {"true", "t", "1", "sim", "yes", "y"}:
        return True
    if text in {"false", "f", "0", "nao", "não", "no", "n"}:
        return False
    return None


def parse_date(value):
    raw = blank_to_null(value)
    if not raw:
        return None
    text = str(raw).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def stay_range_from_months(months):
    if months is None:
        return "Sem data de referência"
    if months <= 3:
        return "Até 3 meses"
    if months <= 6:
        return "De 4 a 6 meses"
    if months <= 12:
        return "De 7 a 12 meses"
    if months <= 24:
        return "De 13 a 24 meses"
    return "Mais de 24 meses"


def income_band(value):
    if value is None:
        return "Não informado"
    if value <= 5000:
        return "Até R$ 5 mil"
    if value <= 10000:
        return "5 a 10 mil"
    if value <= 20000:
        return "10 a 20 mil"
    if value <= 50000:
        return "20 a 50 mil"
    return "Acima de 50 mil"


def liquidity_band(value):
    if value is None:
        return "Não informado"
    if value <= 50000:
        return "Até R$ 50 mil"
    if value <= 100000:
        return "50 a 100 mil"
    if value <= 250000:
        return "100 a 250 mil"
    if value <= 500000:
        return "250 a 500 mil"
    if value <= 1000000:
        return "500 mil a 1 milhão"
    return "Acima de 1 milhão"


STATUS_LABELS = ["Ativo", "Cancelado", "Congelado", "Não informado"]


def fold_status_token(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.lower().split())


def normalize_client_status(raw_status):
    token = fold_status_token(raw_status)
    if not token or token in {"null", "undefined", "vazio"}:
        return "Não informado"
    if token in {"ativo", "active", "ativa"}:
        return "Ativo"
    if token in {
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
    } or any(part in token for part in ("cancel", "churn", "encerr")):
        return "Cancelado"
    if token in {
        "congelado",
        "congelada",
        "freeze",
        "frozen",
        "pausado",
        "pausada",
    } or any(part in token for part in ("congel", "pausad")):
        return "Congelado"
    return "Não informado"


def label_or_unknown(value):
    value = blank_to_null(value)
    return value if value is not None else "Não informado"


def days_between(start, end):
    return (end.date() - start.date()).days


def distribution_from(items, key_fn, ordered_labels=None):
    counts = {label: 0 for label in ordered_labels} if ordered_labels else {}
    for item in items:
        key = key_fn(item)
        counts[key] = counts.get(key, 0) + 1
    total = len(items) or 1
    entries = (
        [(label, counts.get(label, 0)) for label in ordered_labels]
        if ordered_labels
        else sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    )
    return [
        {"label": label, "count": count, "percent": round(count / total * 1000) / 10}
        for label, count in entries
    ]


def average(nums):
    if not nums:
        return None
    return round(sum(nums) / len(nums), 2)


def build_cancellation_map(cancellations):
    mapping = {}
    multiples = set()
    for row in cancellations:
        client_id = blank_to_null(row.get("client_id"))
        churn_at = parse_date(row.get("churn_efetivado_at"))
        if not client_id or not churn_at:
            continue
        current = mapping.get(client_id)
        if not current:
            mapping[client_id] = {
                "date": churn_at,
                "count": 1,
                "updated": parse_date(row.get("updated_at")) or parse_date(row.get("created_at")) or churn_at,
            }
            continue
        current["count"] += 1
        if current["count"] > 1:
            multiples.add(client_id)
        updated = parse_date(row.get("updated_at")) or parse_date(row.get("created_at")) or churn_at
        if churn_at > current["date"] or (churn_at == current["date"] and updated > current["updated"]):
            current["date"] = churn_at
            current["updated"] = updated
    return mapping, multiples


def build_financial_map(financial_rows):
    mapping = {}
    for row in financial_rows:
        client_id = blank_to_null(row.get("client_id"))
        if not client_id:
            continue
        updated = parse_date(row.get("updated_at")) or datetime.min.replace(tzinfo=timezone.utc)
        current = mapping.get(client_id)
        if not current or updated > current["updated"]:
            mapping[client_id] = {
                "updated": updated,
                "monthlyIncome": to_number(row.get("ultima_renda_mensal")),
                "lastContribution": to_number(row.get("ultimo_aporte")),
                "liquidityReserve": to_number(row.get("reserva_liquidez")),
                "hasProperty": to_bool(row.get("possui_imovel")),
                "hasCar": to_bool(row.get("possui_carro")),
                "hasConsortium": to_bool(row.get("possui_consorcio")),
            }
    return mapping


def general_data_payload():
    """Reaproveita a consolidação do Netlify Function via Node (fonte única)."""
    env = os.environ.copy()
    env["PORTAL_INTERNAL_DATA_RUN"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "run_general_data_api.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=300,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "falha ao gerar general-data").strip()
        raise RuntimeError(detail[:240])
    return json.loads(result.stdout)


def meetings_payload():
    """Reaproveita a consolidação do Netlify Function via Node (fonte única)."""
    env = os.environ.copy()
    env["PORTAL_INTERNAL_DATA_RUN"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "run_meetings_api.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=180,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "falha ao gerar meetings").strip()
        raise RuntimeError(detail[:240])
    return json.loads(result.stdout)


def mechanisms_payload():
    """Reaproveita a consolidação do Netlify Function via Node (fonte única)."""
    env = os.environ.copy()
    env["PORTAL_INTERNAL_DATA_RUN"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "run_mechanisms_api.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=180,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "falha ao gerar mechanisms").strip()
        raise RuntimeError(detail[:240])
    return json.loads(result.stdout)


def financial_updates_payload():
    """Reaproveita a consolidação do Netlify Function via Node (fonte única)."""
    env = os.environ.copy()
    env["PORTAL_INTERNAL_DATA_RUN"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "run_financial_updates_api.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=180,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "falha ao gerar financial-updates").strip()
        raise RuntimeError(detail[:240])
    return json.loads(result.stdout)


def support_payload():
    """Reaproveita a consolidação do Netlify Function via Node (fonte única)."""
    env = os.environ.copy()
    env["PORTAL_INTERNAL_DATA_RUN"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "run_support_api.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=180,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "falha ao gerar support").strip()
        raise RuntimeError(detail[:240])
    return json.loads(result.stdout)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/auth-config":
            try:
                send_json(self, 200, auth_config_payload())
            except Exception as exc:
                send_json(self, 503, {"error": str(exc)})
            return

        protected = {
            "/api/quality": ("quality", quality_payload, "Falha ao consultar indicadores de qualidade"),
            "/api/general-data": ("general-data", general_data_payload, "Não foi possível consolidar os dados gerais"),
            "/api/meetings": ("meetings", meetings_payload, "Não foi possível consolidar os dados de reuniões"),
            "/api/mechanisms": ("mechanisms", mechanisms_payload, "Não foi possível consolidar a implementação de mecanismos"),
            "/api/financial-updates": ("financial-updates", financial_updates_payload, "Não foi possível consolidar a atualização financeira"),
            "/api/support": ("support", support_payload, "Não foi possível consolidar o atendimento"),
        }
        if path in protected:
            denied = require_corporate_auth(self)
            if denied:
                status, payload = denied
                send_json(self, status, payload)
                return
            label, producer, err_msg = protected[path]
            try:
                send_json(self, 200, producer())
            except Exception as exc:
                send_json(self, 500, {"error": err_msg})
                print(f"{label} error: {exc}")
            return

        super().do_GET()

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


if __name__ == "__main__":
    try:
        load_env()
        required = (
            "AUTH_SUPABASE_URL",
            "AUTH_SUPABASE_ANON_KEY",
            "DATA_SUPABASE_URL",
            "DATA_SUPABASE_SERVICE_ROLE_KEY",
        )
        missing = [key for key in required if not str(os.environ.get(key) or "").strip()]
        if missing:
            raise RuntimeError("Variáveis ausentes: " + ", ".join(missing))
        print(
            "DATA_SUPABASE_URL configurada:",
            bool(str(os.environ.get("DATA_SUPABASE_URL") or "").strip()),
        )
        print(
            "DATA_SUPABASE_SERVICE_ROLE_KEY configurada:",
            bool(str(os.environ.get("DATA_SUPABASE_SERVICE_ROLE_KEY") or "").strip()),
            "len=",
            len(str(os.environ.get("DATA_SUPABASE_SERVICE_ROLE_KEY") or "").strip()),
        )
        print(
            "AUTH_SUPABASE_URL configurada:",
            bool(str(os.environ.get("AUTH_SUPABASE_URL") or "").strip()),
        )
        print(
            "AUTH_SUPABASE_ANON_KEY configurada:",
            bool(str(os.environ.get("AUTH_SUPABASE_ANON_KEY") or "").strip()),
            "len=",
            len(str(os.environ.get("AUTH_SUPABASE_ANON_KEY") or "").strip()),
        )
    except Exception as exc:
        # Nunca imprimir valores de chaves — apenas a mensagem com nomes.
        print(f"Configuração inválida: {exc}", file=sys.stderr)
        raise SystemExit(1)
    os.chdir(ROOT)
    port = int(os.environ.get("PORT", "4173"))
    print(f"Dashboard disponível em http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
