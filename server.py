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
ENV_FILE = ROOT / "exemplo.env"
if not ENV_FILE.exists():
    ENV_FILE = ROOT / ".env"

# (domain, table, column, include_blank)
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
    ("Financeiro", "client_financial_data", "ultima_renda_mensal", False),
    ("Financeiro", "client_financial_data", "ultimo_aporte", False),
    ("Financeiro", "client_financial_data", "reserva_liquidez", False),
    ("Financeiro", "client_financial_data", "possui_imovel", False),
    ("Financeiro", "client_financial_data", "possui_carro", False),
    ("Financeiro", "client_financial_data", "possui_consorcio", False),
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
    ("Reuniões", "manual_meetings", "recurrence_group_id", True),
    ("Reuniões", "meeting_attendance", "calendly_event_uri", True),
    ("Reuniões", "meeting_attendance", "status", True),
    ("Reuniões", "meeting_attendance", "remarcado", False),
    ("Reuniões", "meeting_attendance", "created_at", False),
    ("Reuniões", "client_implementation_meeting_date", "client_id", False),
    ("Reuniões", "client_implementation_meeting_date", "meeting_date", False),
    ("Reuniões", "client_implementation_meeting_date", "source", True),
    ("Mecanismos", "client_mecanismos", "status", True),
    ("Mecanismos", "client_mecanismos", "implemented_at", False),
    ("Satisfação", "nps_responses", "score", False),
    ("Satisfação", "nps_responses", "submitted_at", False),
    ("Satisfação", "csat_responses", "score", False),
    ("Satisfação", "csat_responses", "submitted_at", False),
    ("Cancelamento", "cancellations", "client_id", False),
    ("Cancelamento", "cancellations", "motivo", True),
    ("Cancelamento", "cancellations", "motivo_categoria", False),
    ("Cancelamento", "cancellations", "churn_efetivado_at", False),
]

FIELD_DESCRIPTIONS = {
    ("clients", "id"): "Identificador técnico único do cliente",
    ("clients", "codigo"): "Código de identificação do cliente na Quarta Via",
    ("clients", "name"): "Nome do cliente",
    ("clients", "data_inicio_ciclo"): "Data de início do vínculo ou ciclo do cliente",
    ("clients", "data_churn"): "Data de churn registrada no cadastro do cliente",
    ("clients", "status"): "Situação atual do cliente",
    ("clients", "segmentacao"): "Segmento atribuído ao cliente",
    ("clients", "engenheiro_patrimonial"): "Engenheiro Patrimonial responsável pelo acompanhamento",
    ("cancellations", "client_id"): "Vínculo do cancelamento com o cliente",
    ("cancellations", "churn_efetivado_at"): "Data em que o cancelamento foi efetivamente concluído",
    ("client_financial_data", "reserva_liquidez"): "Reserva de liquidez informada pelo cliente",
    ("client_financial_data", "ultimo_aporte"): "Valor do último aporte registrado",
    ("client_financial_data", "ultima_renda_mensal"): "Última renda mensal registrada",
    ("client_financial_data", "possui_imovel"): "Indica se o cliente possui imóvel",
    ("client_financial_data", "possui_carro"): "Indica se o cliente possui carro",
    ("client_financial_data", "possui_consorcio"): "Indica se o cliente possui consórcio",
    ("client_meetings", "start_time"): "Data e horário de início da reunião",
    ("client_meetings", "end_time"): "Data e horário de término da reunião",
    ("client_meetings", "calendly_event_uri"): "Identificador externo do evento no Calendly",
    ("client_meetings", "event_name"): "Título ou nome do evento de reunião",
    ("client_meetings", "host_email"): "E-mail do anfitrião da reunião",
    ("client_meetings", "manually_linked"): "Indica vínculo manual da reunião ao cliente",
    ("client_meetings", "client_id"): "Cliente vinculado à reunião Calendly",
    ("manual_meetings", "title"): "Título da reunião registrada manualmente",
    ("manual_meetings", "start_time"): "Data e horário de início da reunião",
    ("manual_meetings", "client_id"): "Cliente vinculado à reunião manual",
    ("manual_meetings", "google_event_id"): "Identificador do evento no Google Calendar",
    ("meeting_attendance", "status"): "Situação de presença ou realização da reunião",
    ("meeting_attendance", "remarcado"): "Indica se a reunião foi remarcada",
    ("meeting_attendance", "calendly_event_uri"): "Identificador externo do evento no Calendly",
    ("client_implementation_meeting_date", "meeting_date"): "Data registrada para a reunião de implementação",
    ("client_implementation_meeting_date", "client_id"): "Cliente com data de reunião de implementação",
    ("client_implementation_meeting_date", "source"): "Origem do registro da reunião de implementação",
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
    {"table": "client_financial_data", "column": "reserva_liquidez", "role": "liquidityReserve"},
    {"table": "client_financial_data", "column": "ultimo_aporte", "role": "lastContribution"},
    {"table": "client_financial_data", "column": "ultima_renda_mensal", "role": "monthlyIncome"},
    {"table": "client_financial_data", "column": "possui_imovel", "role": "hasProperty"},
    {"table": "client_financial_data", "column": "possui_carro", "role": "hasCar"},
    {"table": "client_financial_data", "column": "possui_consorcio", "role": "hasConsortium"},
]


def load_env():
    if not ENV_FILE.exists():
        raise RuntimeError("Arquivo .env não encontrado")
    for raw in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


def supabase_headers():
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "public",
    }


def count_rows(table, column=None, include_blank=False):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    select_col = "client_id" if table == "client_implementation_meeting_date" else "id"
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
        "totalRows": count_rows(table),
        "missingRows": count_rows(table, column, include_blank),
    }
    description = FIELD_DESCRIPTIONS.get((table, column))
    if description:
        item["description"] = description
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
    base = os.environ["SUPABASE_URL"].rstrip("/")
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


def fetch_all_safe(table, select="*", page_size=1000):
    try:
        return fetch_all(table, select, page_size)
    except Exception as exc:
        return {"error": str(exc), "rows": []}


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


def median(nums):
    clean = sorted(num for num in nums if num is not None)
    if not clean:
        return None
    mid = len(clean) // 2
    if len(clean) % 2:
        return clean[mid]
    return round((clean[mid - 1] + clean[mid]) / 2, 2)


def first_value(row, *names):
    for name in names:
        value = blank_to_null(row.get(name))
        if value is not None:
            return value
    return None


def min_date(values):
    dates = [parse_date(value) for value in values if blank_to_null(value) is not None]
    dates = [date for date in dates if date is not None]
    return min(dates) if dates else None


def max_date(values):
    dates = [parse_date(value) for value in values if blank_to_null(value) is not None]
    dates = [date for date in dates if date is not None]
    return max(dates) if dates else None


def positive_status(value, tokens):
    text = str(value or "").lower()
    return any(token in text for token in tokens)


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
    clients = fetch_all("clients", CLIENT_SELECT)
    cancellations = fetch_all("cancellations", CANCEL_SELECT)
    financial_rows = fetch_all("client_financial_data", FINANCIAL_SELECT)
    cancel_map, multiples = build_cancellation_map(cancellations)
    financial_map = build_financial_map(financial_rows)
    now = datetime.now(timezone.utc)
    rows = []

    for client in clients:
        data_warnings = []
        contract_date = parse_date(client.get("data_inicio_ciclo"))
        created_at = parse_date(client.get("created_at"))
        stay_start_date = contract_date or created_at
        used_created_fallback = not contract_date and bool(created_at)
        cancel_primary = (cancel_map.get(client.get("id")) or {}).get("date")
        cancel_fallback = parse_date(client.get("data_churn"))
        cancellation_date = cancel_primary or cancel_fallback
        raw_status = blank_to_null(client.get("status"))
        status = normalize_client_status(raw_status)
        cancelled = status == "Cancelado"
        financial = financial_map.get(client.get("id"))

        if not contract_date:
            data_warnings.append("Sem data de contratação")
        if used_created_fallback:
            data_warnings.append(
                "Permanência calculada com data de criação do cliente por ausência de data de contratação."
            )
        if cancelled and not cancellation_date:
            data_warnings.append("Cancelado sem data de cancelamento")
        if not cancelled and cancellation_date:
            data_warnings.append("Cliente ativo/congelado com data de cancelamento")
        if not raw_status:
            data_warnings.append("Cliente sem status")
        if not blank_to_null(client.get("segmentacao")):
            data_warnings.append("Cliente sem segmento")
        if not blank_to_null(client.get("engenheiro_patrimonial")):
            data_warnings.append("Cliente sem engenheiro responsável")
        if not financial:
            data_warnings.append("Sem diagnóstico financeiro")
        else:
            if financial["monthlyIncome"] is None:
                data_warnings.append("Renda mensal ausente")
            if financial["lastContribution"] is None:
                data_warnings.append("Último aporte ausente")
            if financial["liquidityReserve"] is None:
                data_warnings.append("Reserva de liquidez ausente")
        if client.get("id") in multiples:
            data_warnings.append("Múltiplos cancelamentos efetivados para o mesmo cliente")

        stay_days = None
        stay_months = None
        stay_range = "Sem data de referência"
        inconsistent = False
        if stay_start_date:
            end_date = cancellation_date or now
            if stay_start_date.tzinfo is None:
                stay_start_date = stay_start_date.replace(tzinfo=timezone.utc)
            if end_date.tzinfo is None:
                end_date = end_date.replace(tzinfo=timezone.utc)
            days = days_between(stay_start_date, end_date)
            if days < 0:
                inconsistent = True
                data_warnings.append("Cancelamento anterior à contratação")
            else:
                stay_days = days
                stay_months = round(days / 30.4375, 1)
                stay_range = stay_range_from_months(stay_months)

        monthly_income = financial["monthlyIncome"] if financial else None
        last_contribution = financial["lastContribution"] if financial else None
        liquidity_reserve = financial["liquidityReserve"] if financial else None

        rows.append(
            {
                "clientId": str(client.get("id")),
                "clientCode": blank_to_null(client.get("codigo")),
                "clientName": blank_to_null(client.get("name")) or "Não informado",
                "contractDate": contract_date.isoformat() if contract_date else None,
                "cancellationDate": cancellation_date.isoformat() if cancellation_date else None,
                "stayDays": None if inconsistent else stay_days,
                "stayMonths": None if inconsistent else stay_months,
                "stayRange": stay_range,
                "stayUsedCreatedAtFallback": used_created_fallback,
                "status": status,
                "rawStatus": raw_status,
                "segment": label_or_unknown(client.get("segmentacao")),
                "engineer": label_or_unknown(client.get("engenheiro_patrimonial")),
                "hasFinancialProfile": bool(financial),
                "monthlyIncome": monthly_income,
                "lastContribution": last_contribution,
                "liquidityReserve": liquidity_reserve,
                "hasProperty": financial["hasProperty"] if financial else None,
                "hasCar": financial["hasCar"] if financial else None,
                "hasConsortium": financial["hasConsortium"] if financial else None,
                "incomeBand": income_band(monthly_income),
                "liquidityBand": liquidity_band(liquidity_reserve),
                "dataWarnings": data_warnings,
            }
        )

    liquidity_values = [row["liquidityReserve"] for row in rows if row["liquidityReserve"] is not None]
    contribution_values = [row["lastContribution"] for row in rows if row["lastContribution"] is not None]
    income_values = [row["monthlyIncome"] for row in rows if row["monthlyIncome"] is not None]
    with_financial = sum(1 for row in rows if row["hasFinancialProfile"])
    total = len(rows) or 1
    active_clients = sum(1 for row in rows if row["status"] == "Ativo")
    cancelled_clients = sum(1 for row in rows if row["status"] == "Cancelado")
    frozen_clients = sum(1 for row in rows if row["status"] == "Congelado")

    raw_by_normalized = {}
    for row in rows:
        raw_by_normalized.setdefault(row["status"], set())
        if row["rawStatus"]:
            raw_by_normalized[row["status"]].add(str(row["rawStatus"]))
    status_consistency_notes = [
        f"{len(variants)} variações de escrita encontradas para o status {label}."
        for label, variants in raw_by_normalized.items()
        if len(variants) > 1
    ]
    distinct_raw_statuses = sorted(
        {row["rawStatus"] for row in rows if row["rawStatus"]},
        key=lambda value: str(value).lower(),
    )

    summary = {
        "totalClients": len(rows),
        "activeClients": active_clients,
        "cancelledClients": cancelled_clients,
        "frozenClients": frozen_clients,
        "averageStayDays": average([row["stayDays"] for row in rows if row["stayDays"] is not None]),
        "averageLiquidityReserve": average(liquidity_values),
        "liquidityReserveFilledCount": len(liquidity_values),
        "averageLastContribution": average(contribution_values),
        "lastContributionFilledCount": len(contribution_values),
        "averageMonthlyIncome": average(income_values),
        "monthlyIncomeFilledCount": len(income_values),
        "clientsWithFinancialProfile": with_financial,
        "financialProfilePercent": round(with_financial / total * 1000) / 10,
    }

    financial_profile = [
        {"label": "Imóvel", "count": sum(1 for row in rows if row["hasProperty"] is True)},
        {"label": "Carro", "count": sum(1 for row in rows if row["hasCar"] is True)},
        {"label": "Consórcio", "count": sum(1 for row in rows if row["hasConsortium"] is True)},
        {
            "label": "Reserva de liquidez",
            "count": sum(1 for row in rows if row["liquidityReserve"] is not None),
        },
    ]
    for item in financial_profile:
        item["percent"] = round(item["count"] / total * 1000) / 10

    status_dist = [
        item
        for item in distribution_from(rows, lambda row: row["status"], STATUS_LABELS)
        if item["count"] > 0
    ]
    distributions = {
        "status": status_dist,
        "segments": distribution_from(rows, lambda row: row["segment"]),
        "engineers": distribution_from(rows, lambda row: row["engineer"]),
        "stayRanges": distribution_from(rows, lambda row: row["stayRange"], STAY_RANGES),
        "financialProfile": financial_profile,
        "monthlyIncome": distribution_from(rows, lambda row: row["incomeBand"], INCOME_BANDS),
        "liquidityReserve": distribution_from(rows, lambda row: row["liquidityBand"], LIQUIDITY_BANDS),
    }
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "distributions": distributions,
        "clients": rows,
        "quality": {
            "usedFields": USED_FIELDS,
            "warnings": [],
            "statusConsistency": {
                "distinctRawValues": distinct_raw_statuses,
                "distinctRawCount": len(distinct_raw_statuses),
                "notes": status_consistency_notes,
            },
        },
    }


def build_rows_by_client(rows):
    mapping = {}
    for row in rows:
        client_id = first_value(row, "client_id", "cliente_id", "clientId", "qv_id")
        if not client_id:
            continue
        mapping.setdefault(str(client_id), []).append(row)
    return mapping


def onboarding_payload():
    warnings = []
    clients = fetch_all("clients", CLIENT_SELECT)

    meetings_result = fetch_all_safe("client_meetings", "*")
    journeys_result = fetch_all_safe("client_journeys", "*")
    mechanisms_result = fetch_all_safe("client_mecanismos", "*")

    optional_sources = {
        "client_meetings": meetings_result,
        "client_journeys": journeys_result,
        "client_mecanismos": mechanisms_result,
    }
    for table, result in optional_sources.items():
        if isinstance(result, dict):
            warnings.append(f"{table}: {result['error']}")

    meetings = meetings_result if isinstance(meetings_result, list) else []
    journeys = journeys_result if isinstance(journeys_result, list) else []
    mechanisms = mechanisms_result if isinstance(mechanisms_result, list) else []

    plan_rows = []
    plan_table = None
    for table in ("client_patrimonial_plans", "patrimonial_plans", "planos_patrimoniais"):
        result = fetch_all_safe(table, "*")
        if isinstance(result, list):
            plan_rows = result
            plan_table = table
            break
    if not plan_table:
        warnings.append("Plano patrimonial: nenhuma tabela candidata encontrada no schema public.")

    meetings_by_client = build_rows_by_client(meetings)
    journeys_by_client = build_rows_by_client(journeys)
    mechanisms_by_client = build_rows_by_client(mechanisms)
    plans_by_client = build_rows_by_client(plan_rows)

    rows = []
    for client in clients:
        client_id = str(client.get("id"))
        contract_date = parse_date(client.get("data_inicio_ciclo")) or parse_date(client.get("created_at"))
        client_meetings = meetings_by_client.get(client_id, [])
        client_journeys = journeys_by_client.get(client_id, [])
        client_mechanisms = mechanisms_by_client.get(client_id, [])
        client_plans = plans_by_client.get(client_id, [])

        first_meeting = min_date([
            first_value(row, "start_time", "started_at", "scheduled_at", "created_at")
            for row in client_meetings
        ])
        plan_delivered = min_date([
            first_value(row, "delivered_at", "entregue_at", "data_entrega", "created_at")
            for row in client_plans
            if positive_status(first_value(row, "status", "state", "etapa"), ("entreg", "aprov", "finaliz", "conclu"))
            or first_value(row, "delivered_at", "entregue_at", "data_entrega")
        ])
        plan_approved = min_date([
            first_value(row, "approved_at", "aprovado_at", "data_aprovacao", "updated_at", "created_at")
            for row in client_plans
            if positive_status(first_value(row, "status", "state", "etapa"), ("aprov",))
            or first_value(row, "approved_at", "aprovado_at", "data_aprovacao")
        ])
        first_implementation = min_date([
            first_value(row, "implemented_at", "implantado_at", "data_implementacao", "updated_at", "created_at")
            for row in client_mechanisms
            if positive_status(first_value(row, "status", "state"), ("implement", "implant", "conclu", "feito"))
            or first_value(row, "implemented_at", "implantado_at", "data_implementacao")
        ])

        journey_started = min_date([
            first_value(row, "started_at", "created_at")
            for row in client_journeys
        ])
        journey_completed = min_date([
            first_value(row, "completed_at", "finished_at", "concluded_at", "updated_at")
            for row in client_journeys
            if positive_status(first_value(row, "status", "state"), ("conclu", "complete", "finaliz"))
            or to_number(first_value(row, "progress_percent", "percentual", "completion_percent")) == 100
        ])
        progress_values = [
            to_number(first_value(row, "progress_percent", "percentual", "completion_percent", "progress"))
            for row in client_journeys
        ]
        progress_values = [value for value in progress_values if value is not None]
        progress = max(progress_values) if progress_values else (100 if journey_completed else 0 if client_journeys else None)

        def days_until(date):
            if not contract_date or not date:
                return None
            return days_between(contract_date, date)

        total_onboarding_days = None
        onboarding_end = journey_completed or plan_approved or first_implementation
        if contract_date and onboarding_end:
            total_onboarding_days = days_between(contract_date, onboarding_end)

        rows.append({
            "clientId": client_id,
            "clientCode": blank_to_null(client.get("codigo")),
            "clientName": blank_to_null(client.get("name")) or "Não informado",
            "status": blank_to_null(client.get("status")) or "Não informado",
            "engineer": label_or_unknown(client.get("engenheiro_patrimonial")),
            "contractDate": contract_date.isoformat() if contract_date else None,
            "firstMeetingDate": first_meeting.isoformat() if first_meeting else None,
            "planDeliveredDate": plan_delivered.isoformat() if plan_delivered else None,
            "planApprovedDate": plan_approved.isoformat() if plan_approved else None,
            "firstImplementationDate": first_implementation.isoformat() if first_implementation else None,
            "daysToFirstMeeting": days_until(first_meeting),
            "daysToPlanDelivery": days_until(plan_delivered),
            "daysToPlanApproval": days_until(plan_approved),
            "daysToFirstImplementation": days_until(first_implementation),
            "totalOnboardingDays": total_onboarding_days,
            "completedOnboarding": bool(journey_completed) or (progress == 100),
            "onboardingPercent": progress,
            "journeyRecords": len(client_journeys),
            "meetingRecords": len(client_meetings),
            "planRecords": len(client_plans),
            "mechanismRecords": len(client_mechanisms),
        })

    total = len(rows) or 1
    complete_count = sum(1 for row in rows if row["completedOnboarding"])
    with_first_meeting = sum(1 for row in rows if row["daysToFirstMeeting"] is not None)
    with_plan_delivery = sum(1 for row in rows if row["daysToPlanDelivery"] is not None)
    with_plan_approval = sum(1 for row in rows if row["daysToPlanApproval"] is not None)
    with_implementation = sum(1 for row in rows if row["daysToFirstImplementation"] is not None)

    indicators = [
        {
            "indicator": "Dias entre contratação e primeira reunião",
            "viability": "Sim" if with_first_meeting else "Sem base",
            "metric": "Diferença em dias entre clients.data_inicio_ciclo e a menor data em client_meetings.start_time.",
            "value": median([row["daysToFirstMeeting"] for row in rows]),
            "unit": "dias",
            "coverage": round(with_first_meeting / total * 1000) / 10,
        },
        {
            "indicator": "Dias entre contratação e entrega do plano patrimonial",
            "viability": "Sim" if with_plan_delivery else "Sem base",
            "metric": f"Usar status e datas do plano patrimonial por cliente{f' em {plan_table}' if plan_table else ''}.",
            "value": median([row["daysToPlanDelivery"] for row in rows]),
            "unit": "dias",
            "coverage": round(with_plan_delivery / total * 1000) / 10,
        },
        {
            "indicator": "Dias entre contratação e aprovação do plano",
            "viability": "Sim" if with_plan_approval else "Sem base",
            "metric": f"Usar data de aprovação/status aprovado do plano patrimonial{f' em {plan_table}' if plan_table else ''}.",
            "value": median([row["daysToPlanApproval"] for row in rows]),
            "unit": "dias",
            "coverage": round(with_plan_approval / total * 1000) / 10,
        },
        {
            "indicator": "Dias entre contratação e primeiro mecanismo implementado",
            "viability": "Não identificado" if not with_implementation else "Sim",
            "metric": "Diferença em dias entre contratação e primeira implementação em client_mecanismos.",
            "value": median([row["daysToFirstImplementation"] for row in rows]),
            "unit": "dias",
            "coverage": round(with_implementation / total * 1000) / 10,
        },
        {
            "indicator": "Tempo total de onboarding",
            "viability": "Sim" if any(row["totalOnboardingDays"] is not None for row in rows) else "Sem base",
            "metric": "Dias entre contratação e conclusão da jornada, aprovação do plano ou primeira implementação.",
            "value": median([row["totalOnboardingDays"] for row in rows]),
            "unit": "dias",
            "coverage": round(sum(1 for row in rows if row["totalOnboardingDays"] is not None) / total * 1000) / 10,
        },
        {
            "indicator": "Concluiu onboarding (Sim/Não)",
            "viability": "Sim" if journeys else "Sem base",
            "metric": "Cliente com jornada concluída ou percentual de onboarding igual a 100%.",
            "value": complete_count,
            "unit": "clientes",
            "coverage": round(complete_count / total * 1000) / 10,
        },
        {
            "indicator": "Percentual do onboarding concluído",
            "viability": "Sim" if journeys else "Sem base",
            "metric": "Maior percentual de progresso registrado por cliente em client_journeys.",
            "value": average([row["onboardingPercent"] for row in rows if row["onboardingPercent"] is not None]),
            "unit": "%",
            "coverage": round(sum(1 for row in rows if row["onboardingPercent"] is not None) / total * 1000) / 10,
        },
        {
            "indicator": "Tempo médio para cada etapa da jornada",
            "viability": "Sim" if journeys else "Sem base",
            "metric": "Média dos tempos disponíveis entre contratação, reunião, plano e conclusão.",
            "value": average([
                value
                for row in rows
                for value in (
                    row["daysToFirstMeeting"],
                    row["daysToPlanDelivery"],
                    row["daysToPlanApproval"],
                    row["totalOnboardingDays"],
                )
                if value is not None
            ]),
            "unit": "dias",
            "coverage": round(sum(1 for row in rows if row["journeyRecords"] > 0) / total * 1000) / 10,
        },
    ]

    distributions = {
        "completion": distribution_from(rows, lambda row: "Concluiu" if row["completedOnboarding"] else "Não concluiu"),
        "progress": distribution_from(rows, lambda row: (
            "Sem base" if row["onboardingPercent"] is None else
            "0-24%" if row["onboardingPercent"] < 25 else
            "25-49%" if row["onboardingPercent"] < 50 else
            "50-74%" if row["onboardingPercent"] < 75 else
            "75-99%" if row["onboardingPercent"] < 100 else
            "100%"
        ), ["0-24%", "25-49%", "50-74%", "75-99%", "100%", "Sem base"]),
        "engineers": distribution_from(rows, lambda row: row["engineer"]),
    }

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totalClients": len(rows),
            "completedOnboarding": complete_count,
            "completedPercent": round(complete_count / total * 1000) / 10,
            "medianFirstMeetingDays": indicators[0]["value"],
            "medianTotalOnboardingDays": indicators[4]["value"],
            "averageOnboardingPercent": indicators[6]["value"],
        },
        "indicators": indicators,
        "distributions": distributions,
        "clients": rows,
        "sources": {
            "primary": "BASE QV",
            "schema": "public",
            "tables": ["clients", "client_journeys", "client_meetings", "client_mecanismos"] + ([plan_table] if plan_table else []),
            "warnings": warnings,
        },
    }
def meetings_payload():
    """Reaproveita a consolidação do Netlify Function via Node (fonte única)."""
    result = subprocess.run(
        ["node", str(ROOT / "run_meetings_api.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=os.environ.copy(),
        timeout=180,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "falha ao gerar meetings").strip()
        raise RuntimeError(detail[:240])
    return json.loads(result.stdout)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/quality":
            try:
                body = json.dumps(quality_payload(), ensure_ascii=False).encode()
                self.send_response(200)
            except Exception as exc:
                body = json.dumps({"error": "Falha ao consultar indicadores de qualidade"}, ensure_ascii=False).encode()
                self.send_response(500)
                print(f"quality error: {exc}")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/general-data":
            try:
                body = json.dumps(general_data_payload(), ensure_ascii=False).encode()
                self.send_response(200)
            except Exception as exc:
                body = json.dumps({"error": "Não foi possível consolidar os dados gerais"}, ensure_ascii=False).encode()
                self.send_response(500)
                print(f"general-data error: {exc}")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/onboarding":
            try:
                body = json.dumps(onboarding_payload(), ensure_ascii=False).encode()
                self.send_response(200)
            except Exception as exc:
                body = json.dumps({"error": "Não foi possível consolidar a jornada e onboarding"}, ensure_ascii=False).encode()
                self.send_response(500)
                print(f"onboarding error: {exc}")
        if path == "/api/meetings":
            try:
                body = json.dumps(meetings_payload(), ensure_ascii=False).encode()
                self.send_response(200)
            except Exception as exc:
                body = json.dumps({"error": "Não foi possível consolidar os dados de reuniões"}, ensure_ascii=False).encode()
                self.send_response(500)
            print(f"meetings error: {exc}")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


if __name__ == "__main__":
    try:
        load_env()
        required = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        missing = [key for key in required if not os.environ.get(key)]
        if missing:
            raise RuntimeError("Variáveis ausentes: " + ", ".join(missing))
    except Exception as exc:
        print(f"Configuração inválida: {exc}", file=sys.stderr)
        raise SystemExit(1)
    os.chdir(ROOT)
    port = int(os.environ.get("PORT", "4173"))
    print(f"Dashboard disponível em http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
