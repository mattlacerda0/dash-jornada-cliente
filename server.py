#!/usr/bin/env python3
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
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
    ("Reuniões", "client_meetings", "start_time", False),
    ("Reuniões", "client_meetings", "event_name", True),
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
}

CLIENT_SELECT = "id,codigo,name,data_inicio_ciclo,status,segmentacao,engenheiro_patrimonial,data_churn"
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
    "Sem data de contratação",
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
    params = {"select": "id", "limit": "1"}
    if column:
        params[column] = "is.null"
        if include_blank:
            params = {"select": "id", "limit": "1", "or": f"({column}.is.null,{column}.eq.)"}
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


def quality_payload():
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(measure, field): field for field in FIELDS}
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                errors.append(str(exc))
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
        return "Sem data de contratação"
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


def is_cancelled_status(status):
    text = str(status or "").lower()
    return any(token in text for token in ("cancel", "churn", "inativ", "encerr"))


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
        cancel_primary = (cancel_map.get(client.get("id")) or {}).get("date")
        cancel_fallback = parse_date(client.get("data_churn"))
        cancellation_date = cancel_primary or cancel_fallback
        status = blank_to_null(client.get("status"))
        cancelled = is_cancelled_status(status) or bool(cancellation_date)
        financial = financial_map.get(client.get("id"))

        if not contract_date:
            data_warnings.append("Sem data de contratação")
        if cancelled and not cancellation_date:
            data_warnings.append("Cancelado sem data de cancelamento")
        if not cancelled and cancellation_date:
            data_warnings.append("Ativo com data de cancelamento")
        if not status:
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
        stay_range = "Sem data de contratação"
        inconsistent = False
        if contract_date:
            end_date = cancellation_date or now
            if contract_date.tzinfo is None:
                contract_date = contract_date.replace(tzinfo=timezone.utc)
            if end_date.tzinfo is None:
                end_date = end_date.replace(tzinfo=timezone.utc)
            days = days_between(contract_date, end_date)
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
                "status": status or "Não informado",
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
                "_cancelled": cancelled,
            }
        )

    liquidity_values = [row["liquidityReserve"] for row in rows if row["liquidityReserve"] is not None]
    contribution_values = [row["lastContribution"] for row in rows if row["lastContribution"] is not None]
    income_values = [row["monthlyIncome"] for row in rows if row["monthlyIncome"] is not None]
    with_financial = sum(1 for row in rows if row["hasFinancialProfile"])
    total = len(rows) or 1

    summary = {
        "totalClients": len(rows),
        "activeClients": sum(1 for row in rows if not row["_cancelled"]),
        "cancelledClients": sum(1 for row in rows if row["_cancelled"]),
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
            "label": "Reserva de liquidez informada",
            "count": sum(1 for row in rows if row["liquidityReserve"] is not None),
        },
    ]
    for item in financial_profile:
        item["percent"] = round(item["count"] / total * 1000) / 10

    distributions = {
        "status": distribution_from(rows, lambda row: row["status"]),
        "segments": distribution_from(rows, lambda row: row["segment"]),
        "engineers": distribution_from(rows, lambda row: row["engineer"]),
        "stayRanges": distribution_from(rows, lambda row: row["stayRange"], STAY_RANGES),
        "financialProfile": financial_profile,
        "monthlyIncome": distribution_from(rows, lambda row: row["incomeBand"], INCOME_BANDS),
        "liquidityReserve": distribution_from(rows, lambda row: row["liquidityBand"], LIQUIDITY_BANDS),
    }
    clients_out = [{k: v for k, v in row.items() if k != "_cancelled"} for row in rows]
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "distributions": distributions,
        "clients": clients_out,
        "quality": {"usedFields": USED_FIELDS, "warnings": []},
    }


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
