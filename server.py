#!/usr/bin/env python3
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / "exemplo.env"
if not ENV_FILE.exists():
    ENV_FILE = ROOT / ".env"

FIELDS = [
    ("Cliente", "clients", "qv_id", True),
    ("Cliente", "clients", "name", True),
    ("Cliente", "clients", "email", True),
    ("Cliente", "clients", "phone", True),
    ("Cliente", "clients", "created_at", False),
    ("Cliente", "clients", "status", True),
    ("Cliente", "clients", "segmentacao", True),
    ("Cliente", "clients", "engenheiro_patrimonial", True),
    ("Cliente", "clients", "objetivo_principal", True),
    ("Cancelamento", "clients", "data_churn", False),
    ("Cancelamento", "clients", "motivo_churn", True),
    ("Financeiro", "client_financial_data", "ultima_renda_mensal", False),
    ("Financeiro", "client_financial_data", "ultimo_aporte", False),
    ("Financeiro", "client_financial_data", "reserva_liquidez", False),
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
    ("Cancelamento", "cancellations", "motivo", True),
    ("Cancelamento", "cancellations", "motivo_categoria", False),
    ("Cancelamento", "cancellations", "churn_efetivado_at", False),
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
            "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
            "Accept-Profile": "public",
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
    return {
        "domain": domain,
        "table": table,
        "column": column,
        "totalRows": count_rows(table),
        "missingRows": count_rows(table, column, include_blank),
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
    results.sort(key=lambda item: (item["domain"], item["table"], item["column"]))
    return {"data": results, "errors": errors, "generatedAt": datetime.now(timezone.utc).isoformat()}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/quality":
            try:
                body = json.dumps(quality_payload(), ensure_ascii=False).encode()
                self.send_response(200)
            except Exception as exc:
                body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
                self.send_response(500)
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
