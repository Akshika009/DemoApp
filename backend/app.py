import datetime as dt
import os
import re
from decimal import Decimal
from itertools import product
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

try:
    from databricks import sql as databricks_sql
except Exception as import_exc:
    databricks_sql = None
    DATABRICKS_IMPORT_ERROR = str(import_exc)
else:
    DATABRICKS_IMPORT_ERROR = None

try:
    from databricks.sdk.core import Config as DatabricksConfig
    from databricks.sdk.core import oauth_service_principal
except Exception as import_exc:
    DatabricksConfig = None
    oauth_service_principal = None
    DATABRICKS_SDK_IMPORT_ERROR = str(import_exc)
else:
    DATABRICKS_SDK_IMPORT_ERROR = None

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DIST_DIR = PROJECT_ROOT / "dist"
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
CORS(app)

DEFAULT_TABLE = "dis_pfc_con_gold_test.pbc_afh_contract"

ALLOWED_CONTRACT_TYPES = {
    "Distributor",
    "Chain Customer Pricing/Rebates",
    "PDP Customer Pricing/Rebates",
    "Tier Customer",
    "PDP Off-Tier Customer",
}

UPLOAD_COLUMNS = [
    "ContractType",
    "ContractName",
    "StartDate",
    "EndDate",
    "InvenID",
    "GTIN",
    "ItemDescription",
    "ChainID",
    "Pack",
    "LocId",
    "DistributionCenter",
    "Distributor",
    "Customer",
    "ContractPrice",
    "DistFee",
    "Rebate",
    "LastUpdatedBy",
    "LastUpdatedDate",
    "Message",
    "FileName",
    "DistributorPrice",
    "Province",
    "Reason",
]

INSERT_COLUMNS = [
    "ContractType",
    "ContractName",
    "StartDate",
    "EndDate",
    "InvenID",
    "GTIN",
    "ItemDescription",
    "ChainID",
    "Pack",
    "LocId",
    "DistributionCenter",
    "Distributor",
    "Customer",
    "ContractPrice",
    "DistFee",
    "Rebate",
    "LastUpdatedBy",
    "Message",
    "FileName",
    "DistributorPrice",
    "Province",
    "Reason",
]

FULL_TEMPLATE_REQUIRED_COLUMNS = [
    "ContractType",
    "ContractName",
    "StartDate",
    "EndDate",
    "InvenID",
    "GTIN",
    "ItemDescription",
    "ChainID",
    "Pack",
    "LocId",
    "DistributionCenter",
    "Distributor",
    "Customer",
    "ContractPrice",
    "DistFee",
    "Rebate",
    "LastUpdatedBy",
    "LastUpdatedDate",
    "Message",
    "FileName",
    "DistributorPrice",
    "Province",
    "Reason",
]

PDP_TEMPLATE_REQUIRED_COLUMNS = [
    "ContractName",
    "InvenID",
    "GTIN",
    "Pack",
    "ContractPrice",
    "DistFee",
]

NUMERIC_COLUMNS = {"ContractPrice", "DistFee", "Rebate", "DistributorPrice"}
PRICE_COLUMNS_FOR_MULTIYEAR = ["ContractPrice", "DistributorPrice", "DistFee"]

OVERRIDE_COLUMN_MAP = {
    "distributor_price": ["DistributorPrice"],
    "chain_customer": ["ContractPrice"],
    "pdp_customer": ["ContractPrice", "DistFee"],
    "pdp_off_tier": ["DistFee"],
}


def _error_response(message, status=400, details=None):
    payload = {"error": message}
    if details:
        payload["details"] = details
    return jsonify(payload), status


def _normalize_list(value):
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [entry.strip() for entry in value.split(",") if entry.strip()]
    return []


def _sanitize_identifier(name):
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise ValueError(
            f"Invalid identifier '{name}'. Use only letters, numbers, and underscore."
        )
    return name


def _sanitize_table_name(name):
    parts = [part for part in name.split(".") if part]
    if not parts or len(parts) > 3:
        raise ValueError("Invalid table name format.")

    for part in parts:
        _sanitize_identifier(part)

    return ".".join(parts)


def _table_name():
    explicit = (os.getenv("DATABRICKS_TABLE") or "").strip()
    if explicit:
        return _sanitize_table_name(explicit)

    catalog = (os.getenv("DATABRICKS_CATALOG") or "").strip()
    schema = (os.getenv("DATABRICKS_SCHEMA") or "").strip()
    table_name = (os.getenv("DATABRICKS_TABLE_NAME") or "").strip()

    if table_name:
        if not catalog or not schema:
            raise ValueError(
                "When DATABRICKS_TABLE_NAME is used, DATABRICKS_CATALOG and DATABRICKS_SCHEMA are required."
            )
        return (
            f"{_sanitize_identifier(catalog)}."
            f"{_sanitize_identifier(schema)}."
            f"{_sanitize_identifier(table_name)}"
        )

    return _sanitize_table_name(DEFAULT_TABLE)


def _missing_databricks_config():
    def is_placeholder(raw):
        text = (raw or "").strip().lower()
        return (
            text.startswith("your_")
            or text in {"<your-value>", "replace_me", "changeme", "xxxx"}
        )

    def has_value(*keys):
        for key in keys:
            value = (os.getenv(key) or "").strip()
            if value and not is_placeholder(value):
                return True
        return False

    missing = []
    if not has_value("DATABRICKS_SERVER_HOSTNAME", "DATABRICKS_HOST"):
        missing.append("DATABRICKS_SERVER_HOSTNAME (or DATABRICKS_HOST)")

    if not has_value("DATABRICKS_HTTP_PATH", "DATABRICKS_WAREHOUSE_ID"):
        missing.append("DATABRICKS_HTTP_PATH (or DATABRICKS_WAREHOUSE_ID)")

    has_pat = has_value("DATABRICKS_ACCESS_TOKEN", "DATABRICKS_TOKEN")
    has_oauth = has_value("DATABRICKS_CLIENT_ID") and has_value("DATABRICKS_CLIENT_SECRET")
    if not has_pat and not has_oauth:
        missing.append(
            "Auth required: DATABRICKS_ACCESS_TOKEN (or DATABRICKS_TOKEN) "
            "or DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET"
        )

    return missing


def _normalize_databricks_hostname(value):
    host = (value or "").strip()
    host = re.sub(r"^https?://", "", host, flags=re.IGNORECASE)
    host = host.split("/")[0]
    return host


def _resolve_http_path():
    explicit = (os.getenv("DATABRICKS_HTTP_PATH") or "").strip()
    if explicit:
        return explicit

    warehouse_id = (os.getenv("DATABRICKS_WAREHOUSE_ID") or "").strip()
    if warehouse_id:
        return f"/sql/1.0/warehouses/{warehouse_id}"

    return ""


def _credential_provider(server_hostname):
    if DatabricksConfig is None or oauth_service_principal is None:
        raise RuntimeError(
            "Databricks SDK is required for OAuth M2M auth. "
            f"Import error: {DATABRICKS_SDK_IMPORT_ERROR}"
        )

    config = DatabricksConfig(
        host=f"https://{server_hostname}",
        client_id=(os.getenv("DATABRICKS_CLIENT_ID") or "").strip(),
        client_secret=(os.getenv("DATABRICKS_CLIENT_SECRET") or "").strip(),
    )

    return oauth_service_principal(config)


def _get_databricks_connection():
    if databricks_sql is None:
        raise RuntimeError(
            "databricks-sql-connector is not installed. "
            f"Import error: {DATABRICKS_IMPORT_ERROR}"
        )

    missing = _missing_databricks_config()
    if missing:
        raise RuntimeError(
            "Missing Databricks configuration: " + ", ".join(missing)
        )

    raw_host = (
        os.getenv("DATABRICKS_SERVER_HOSTNAME")
        or os.getenv("DATABRICKS_HOST")
        or ""
    )
    raw_token = (
        os.getenv("DATABRICKS_ACCESS_TOKEN")
        or os.getenv("DATABRICKS_TOKEN")
        or ""
    )
    http_path = _resolve_http_path()

    server_hostname = _normalize_databricks_hostname(raw_host)
    token = raw_token.strip()

    if token:
        return databricks_sql.connect(
            server_hostname=server_hostname,
            http_path=http_path,
            access_token=token,
        )

    return databricks_sql.connect(
        server_hostname=server_hostname,
        http_path=http_path,
        credentials_provider=lambda: _credential_provider(server_hostname),
    )


def _to_float_or_none(value):
    if value is None:
        return None

    if isinstance(value, (int, float, Decimal)):
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    text = text.replace("$", "").replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date(value):
    if value is None:
        return None

    if isinstance(value, dt.datetime):
        return value.date()

    if isinstance(value, dt.date):
        return value

    text = str(value).strip()
    if not text:
        return None

    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    iso_candidate = text.replace("Z", "+00:00")
    try:
        return dt.datetime.fromisoformat(iso_candidate).date()
    except ValueError:
        return None


def _format_date(value):
    parsed = _parse_date(value)
    return parsed.strftime("%Y-%m-%d") if parsed else None


def _add_years_safe(date_value, years_to_add):
    if not date_value:
        return None

    try:
        return date_value.replace(year=date_value.year + years_to_add)
    except ValueError:
        return date_value.replace(month=2, day=28, year=date_value.year + years_to_add)


def _serialize_value(value):
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return value


def _serialize_row_dict(row_dict):
    return {key: _serialize_value(value) for key, value in row_dict.items()}


def _normalize_row(raw_row, fallback_contract_type=None):
    row = {}
    for col in UPLOAD_COLUMNS:
        raw_value = raw_row.get(col)
        if isinstance(raw_value, str):
            raw_value = raw_value.strip() or None

        if col in NUMERIC_COLUMNS:
            row[col] = _to_float_or_none(raw_value)
        elif col in {"StartDate", "EndDate", "LastUpdatedDate"}:
            row[col] = _format_date(raw_value)
        else:
            row[col] = raw_value

    if fallback_contract_type:
        row["ContractType"] = fallback_contract_type

    return row


def _required_columns_for_contract_type(contract_type):
    if contract_type in {"Distributor", "Chain Customer Pricing/Rebates"}:
        return FULL_TEMPLATE_REQUIRED_COLUMNS
    return PDP_TEMPLATE_REQUIRED_COLUMNS


def _validate_template_columns(rows, required_columns):
    present_columns = set()
    for row in rows:
        if isinstance(row, dict):
            present_columns.update(row.keys())

    return [col for col in required_columns if col not in present_columns]


def _field_values(existing_value, selected_values):
    filtered = [v for v in selected_values if v and v.lower() != "all"]
    if filtered:
        return filtered

    if existing_value not in (None, ""):
        return [existing_value]

    return [None]


def _expand_with_selectors(row, contract_type, selectors):
    distributors = _normalize_list(selectors.get("distributors"))
    distribution_centers = _normalize_list(selectors.get("distributionCenters"))
    chains = _normalize_list(selectors.get("chains"))
    selected_start_date = _format_date(selectors.get("startDate"))
    selected_end_date = _format_date(selectors.get("endDate"))

    dist_values = _field_values(row.get("Distributor"), distributors)
    dc_values = _field_values(row.get("DistributionCenter"), distribution_centers)
    chain_values = _field_values(row.get("ChainID"), chains)

    expanded_rows = []
    for distributor, distribution_center, chain in product(
        dist_values, dc_values, chain_values
    ):
        expanded = dict(row)
        expanded["Distributor"] = distributor
        expanded["DistributionCenter"] = distribution_center
        expanded["ChainID"] = chain
        if selected_start_date:
            expanded["StartDate"] = selected_start_date
        if selected_end_date:
            expanded["EndDate"] = selected_end_date

        expanded_rows.append(expanded)

    return expanded_rows


def _build_multi_year_rows(base_row, multi_year_settings):
    enabled = bool(multi_year_settings.get("enabled"))
    renewal_years = int(multi_year_settings.get("years") or 0)
    increase_type = (multi_year_settings.get("increaseType") or "percentage").strip().lower()
    increase_value = float(multi_year_settings.get("increaseValue") or 0.0)

    rows = [base_row]
    if not enabled or renewal_years <= 0:
        return rows

    start_date = _parse_date(base_row.get("StartDate"))
    end_date = _parse_date(base_row.get("EndDate"))

    for year_offset in range(1, renewal_years + 1):
        future_row = dict(base_row)

        if start_date:
            shifted_start = _add_years_safe(start_date, year_offset)
            future_row["StartDate"] = shifted_start.strftime("%Y-%m-%d")

        if end_date:
            shifted_end = _add_years_safe(end_date, year_offset)
            future_row["EndDate"] = shifted_end.strftime("%Y-%m-%d")

        for price_col in PRICE_COLUMNS_FOR_MULTIYEAR:
            base_price = _to_float_or_none(base_row.get(price_col))
            if base_price is None:
                continue

            if increase_type == "percentage":
                adjusted = base_price * ((1 + (increase_value / 100.0)) ** year_offset)
            else:
                adjusted = base_price + (increase_value * year_offset)
            future_row[price_col] = round(adjusted, 4)

        message = (future_row.get("Message") or "").strip()
        suffix = f"Auto-renewed year +{year_offset}"
        future_row["Message"] = f"{message}; {suffix}" if message else suffix

        rows.append(future_row)

    return rows


def _normalize_multi_year_settings(raw_settings):
    settings = raw_settings if isinstance(raw_settings, dict) else {}
    enabled = bool(settings.get("enabled"))

    if not enabled:
        return {
            "enabled": False,
            "years": 0,
            "increaseType": "percentage",
            "increaseValue": 0.0,
        }, None

    years_raw = settings.get("years")
    try:
        years = int(years_raw)
    except (TypeError, ValueError):
        return None, "Number of years for renewal must be a whole number."

    if years < 1 or years > 10:
        return None, "Number of years for renewal must be between 1 and 10."

    increase_type = (settings.get("increaseType") or "").strip().lower()
    if increase_type not in {"amount", "percentage"}:
        return None, "Increase type must be Amount or Percentage."

    increase_value = _to_float_or_none(settings.get("increaseValue"))
    if increase_value is None:
        return None, "Annual price increase value is required for multi-year contracts."
    if increase_value < 0:
        return None, "Annual price increase value cannot be negative."

    return {
        "enabled": True,
        "years": years,
        "increaseType": increase_type,
        "increaseValue": float(increase_value),
    }, None


def _required_selector_error(contract_type, selectors):
    distributors = _normalize_list(selectors.get("distributors"))
    distribution_centers = _normalize_list(selectors.get("distributionCenters"))
    chains = _normalize_list(selectors.get("chains"))
    start_date = _format_date(selectors.get("startDate"))
    end_date = _format_date(selectors.get("endDate"))

    if contract_type == "Distributor":
        if not distributors:
            return "Select distributor value(s) for Distributor contract type."
        if not distribution_centers:
            return "Select distribution center value(s) for Distributor contract type."

    if contract_type == "Chain Customer Pricing/Rebates" and not chains:
        return "Select chain name value(s) for Chain Customer Pricing/Rebates contract type."

    if not start_date or not end_date:
        return "Contract start date and end date are required."

    if _parse_date(start_date) > _parse_date(end_date):
        return "Contract start date must be earlier than or equal to end date."

    return None


def _insert_values_from_row(row):
    return [row.get(col) for col in INSERT_COLUMNS]


def _add_in_filter(clauses, params, column_name, values):
    filtered = [value for value in values if value and str(value).strip().lower() != "all"]
    if not filtered:
        return

    placeholders = ", ".join(["?"] * len(filtered))
    clauses.append(f"{column_name} IN ({placeholders})")
    params.extend(filtered)


def _build_selector_where(selectors):
    clauses = []
    params = []

    _add_in_filter(clauses, params, "Distributor", _normalize_list(selectors.get("distributors")))
    _add_in_filter(clauses, params, "DistributionCenter", _normalize_list(selectors.get("distributionCenters")))
    _add_in_filter(clauses, params, "ChainID", _normalize_list(selectors.get("chains")))
    _add_in_filter(clauses, params, "Pack", _normalize_list(selectors.get("packages")))

    start_date = _format_date(selectors.get("startDate"))
    end_date = _format_date(selectors.get("endDate"))

    if start_date:
        clauses.append("StartDate >= ?")
        params.append(start_date)

    if end_date:
        clauses.append("EndDate <= ?")
        params.append(end_date)

    return clauses, params


def _execute_batch(cursor, query, rows):
    if not rows:
        return

    if hasattr(cursor, "executemany"):
        cursor.executemany(query, rows)
    else:
        for row_params in rows:
            cursor.execute(query, row_params)


def _frontend_index_path():
    return DIST_DIR / "index.html"


def _frontend_available():
    return _frontend_index_path().exists()


@app.route("/")
def home():
    if _frontend_available():
        return send_from_directory(DIST_DIR, "index.html")
    return "Databricks Contracts API is running. Frontend build not found."


@app.route("/health", methods=["GET"])
def health():
    missing = _missing_databricks_config()
    has_connector = databricks_sql is not None

    table_name = None
    table_error = None
    try:
        table_name = _table_name()
    except Exception as err:
        table_error = str(err)

    status = "ok" if not missing and has_connector and not table_error else "degraded"
    return jsonify(
        {
            "status": status,
            "table": table_name,
            "tableConfigError": table_error,
            "connectorInstalled": has_connector,
            "missingConfig": missing,
            "timestamp": dt.datetime.utcnow().isoformat() + "Z",
        }
    )


@app.route("/health/databricks", methods=["GET"])
def databricks_health():
    try:
        table = _table_name()
        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            cursor.execute("SELECT current_catalog(), current_schema(), current_user()")
            info = cursor.fetchone() or (None, None, None)
            cursor.execute(f"SELECT 1 FROM {table} LIMIT 1")
            sample = cursor.fetchone()
            cursor.close()

        return jsonify(
            {
                "status": "ok",
                "table": table,
                "currentCatalog": _serialize_value(info[0]),
                "currentSchema": _serialize_value(info[1]),
                "currentUser": _serialize_value(info[2]),
                "tableReadable": bool(sample is not None),
                "timestamp": dt.datetime.utcnow().isoformat() + "Z",
            }
        )
    except Exception as err:
        return _error_response("Databricks health check failed.", 500, str(err))


@app.route("/contracts", methods=["GET"])
def get_contracts():
    try:
        table = _table_name()
        limit = max(1, min(5000, int(request.args.get("limit", "500"))))
        offset = max(0, min(500000, int(request.args.get("offset", "0"))))

        contract_type = (request.args.get("contractType") or "").strip()
        distributor = (request.args.get("distributor") or "").strip()
        chain = (request.args.get("chain") or "").strip()
        search = (request.args.get("search") or "").strip().lower()

        where_clauses = []
        params = []

        if contract_type:
            where_clauses.append("ContractType = ?")
            params.append(contract_type)

        if distributor:
            where_clauses.append("Distributor = ?")
            params.append(distributor)

        if chain:
            where_clauses.append("ChainID = ?")
            params.append(chain)

        if search:
            searchable_columns = [
                "ContractName",
                "ContractType",
                "Distributor",
                "DistributionCenter",
                "ChainID",
                "InvenID",
                "GTIN",
                "Pack",
            ]
            search_expr = " OR ".join(
                [f"LOWER(CAST({col} AS STRING)) LIKE ?" for col in searchable_columns]
            )
            where_clauses.append(f"({search_expr})")
            params.extend([f"%{search}%"] * len(searchable_columns))

        query = f"SELECT {', '.join(UPLOAD_COLUMNS)} FROM {table}"
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        query += (
            " ORDER BY COALESCE(LastUpdatedDate, StartDate) DESC "
            f"LIMIT {limit} OFFSET {offset}"
        )

        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            cursor.execute(query, params)
            columns = [desc[0] for desc in cursor.description]
            rows = [_serialize_row_dict(dict(zip(columns, values))) for values in cursor.fetchall()]
            cursor.close()

        return jsonify(rows)
    except Exception as err:
        return _error_response("Failed to fetch contracts.", 500, str(err))


@app.route("/contracts/summary", methods=["GET"])
def get_contract_summary():
    try:
        table = _table_name()
        with _get_databricks_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(f"SELECT COUNT(*) AS total_contracts FROM {table}")
            total_contracts = cursor.fetchone()[0]

            cursor.execute(
                f"""
                SELECT ContractType, COUNT(*) AS total
                FROM {table}
                GROUP BY ContractType
                ORDER BY total DESC
                """
            )
            by_type = [
                {
                    "contractType": _serialize_value(row[0]) or "Unknown",
                    "count": int(_serialize_value(row[1]) or 0),
                }
                for row in cursor.fetchall()
            ]
            cursor.close()

        return jsonify(
            {
                "totalContracts": int(_serialize_value(total_contracts) or 0),
                "byType": by_type,
            }
        )
    except Exception as err:
        return _error_response("Failed to fetch contract summary.", 500, str(err))


@app.route("/metadata/distributors", methods=["GET"])
def get_distributors():
    try:
        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            cursor.execute(
                f"""
                SELECT DISTINCT Distributor
                FROM {_table_name()}
                WHERE Distributor IS NOT NULL
                ORDER BY Distributor
                """
            )
            values = [_serialize_value(row[0]) for row in cursor.fetchall() if row[0]]
            cursor.close()

        return jsonify(values)
    except Exception as err:
        return _error_response("Failed to fetch distributors.", 500, str(err))


@app.route("/metadata/chains", methods=["GET"])
def get_chains():
    try:
        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            cursor.execute(
                f"""
                SELECT DISTINCT ChainID
                FROM {_table_name()}
                WHERE ChainID IS NOT NULL
                ORDER BY ChainID
                """
            )
            values = [_serialize_value(row[0]) for row in cursor.fetchall() if row[0]]
            cursor.close()

        return jsonify(values)
    except Exception as err:
        return _error_response("Failed to fetch chains.", 500, str(err))


@app.route("/metadata/distribution-centers", methods=["GET"])
def get_distribution_centers():
    try:
        distributors = [
            entry
            for entry in _normalize_list(request.args.get("distributors", ""))
            if entry.lower() != "all"
        ]

        query = f"""
            SELECT DISTINCT DistributionCenter
            FROM {_table_name()}
            WHERE DistributionCenter IS NOT NULL
        """
        params = []

        if distributors:
            placeholders = ", ".join(["?"] * len(distributors))
            query += f" AND Distributor IN ({placeholders})"
            params.extend(distributors)

        query += " ORDER BY DistributionCenter"

        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            cursor.execute(query, params)
            values = [_serialize_value(row[0]) for row in cursor.fetchall() if row[0]]
            cursor.close()

        return jsonify(values)
    except Exception as err:
        return _error_response("Failed to fetch distribution centers.", 500, str(err))


@app.route("/metadata/packs", methods=["GET"])
def get_packs():
    try:
        selectors = {
            "distributors": _normalize_list(request.args.get("distributors", "")),
            "distributionCenters": _normalize_list(
                request.args.get("distributionCenters", "")
            ),
            "chains": _normalize_list(request.args.get("chains", "")),
        }
        where_clauses, params = _build_selector_where(selectors)

        query = f"SELECT DISTINCT Pack FROM {_table_name()} WHERE Pack IS NOT NULL"
        if where_clauses:
            query += " AND " + " AND ".join(where_clauses)
        query += " ORDER BY Pack"

        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            cursor.execute(query, params)
            values = [_serialize_value(row[0]) for row in cursor.fetchall() if row[0]]
            cursor.close()

        return jsonify(values)
    except Exception as err:
        return _error_response("Failed to fetch packs.", 500, str(err))


@app.route("/contracts/upload", methods=["POST"])
def upload_contracts():
    payload = request.get_json(silent=True) or {}
    contract_type = (payload.get("contractType") or "").strip()
    selectors = payload.get("selectors") or {}
    multi_year_settings = payload.get("multiYear") or {}
    file_contents = payload.get("fileContents") or []

    if contract_type not in ALLOWED_CONTRACT_TYPES:
        return _error_response("Invalid or missing contract type.", 400)

    if not isinstance(file_contents, list) or not file_contents:
        return _error_response("File contents are required for upload.", 400)

    if not all(isinstance(row, dict) for row in file_contents):
        return _error_response("Invalid file content payload.", 400)

    required_columns = _required_columns_for_contract_type(contract_type)
    missing_template_columns = _validate_template_columns(file_contents, required_columns)
    if missing_template_columns:
        return (
            jsonify(
                {
                    "error": "Uploaded file is missing required columns.",
                    "missingColumns": missing_template_columns,
                }
            ),
            400,
        )

    selector_error = _required_selector_error(contract_type, selectors)
    if selector_error:
        return _error_response(selector_error, 400)

    normalized_multi_year, multi_year_error = _normalize_multi_year_settings(
        multi_year_settings
    )
    if multi_year_error:
        return _error_response(multi_year_error, 400)

    insert_query = f"""
        INSERT INTO {_table_name()} (
            ContractType, ContractName, StartDate, EndDate, InvenID, GTIN,
            ItemDescription, ChainID, Pack, LocId, DistributionCenter,
            Distributor, Customer, ContractPrice, DistFee, Rebate,
            LastUpdatedBy, LastUpdatedDate, Message, FileName,
            DistributorPrice, Province, Reason
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?
        )
    """

    rows_to_insert = []
    source_row_count = len(file_contents)
    scoped_row_count = 0
    generated_row_count = 0

    for raw_row in file_contents:
        base_row = _normalize_row(raw_row, fallback_contract_type=contract_type)
        # We also need to handle LastUpdatedDate from the row or current timestamp
        if not base_row.get("LastUpdatedDate"):
            base_row["LastUpdatedDate"] = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        scoped_rows = _expand_with_selectors(base_row, contract_type, selectors)
        scoped_row_count += len(scoped_rows)

        for scoped_row in scoped_rows:
            final_rows = _build_multi_year_rows(scoped_row, normalized_multi_year)
            if len(final_rows) > 1:
                generated_row_count += len(final_rows) - 1
            for final_row in final_rows:
                # Map the fields in order for the query
                row_values = [
                    final_row.get("ContractType"),
                    final_row.get("ContractName"),
                    final_row.get("StartDate"),
                    final_row.get("EndDate"),
                    final_row.get("InvenID"),
                    final_row.get("GTIN"),
                    final_row.get("ItemDescription"),
                    final_row.get("ChainID"),
                    final_row.get("Pack"),
                    final_row.get("LocId"),
                    final_row.get("DistributionCenter"),
                    final_row.get("Distributor"),
                    final_row.get("Customer"),
                    final_row.get("ContractPrice"),
                    final_row.get("DistFee"),
                    final_row.get("Rebate"),
                    final_row.get("LastUpdatedBy"),
                    final_row.get("LastUpdatedDate"),
                    final_row.get("Message"),
                    final_row.get("FileName"),
                    final_row.get("DistributorPrice"),
                    final_row.get("Province"),
                    final_row.get("Reason")
                ]
                rows_to_insert.append(row_values)

    if not rows_to_insert:
        return _error_response("No valid rows to insert after processing selectors.", 400)

    try:
        with _get_databricks_connection() as connection:
            cursor = connection.cursor()
            _execute_batch(cursor, insert_query, rows_to_insert)
            cursor.close()

        return (
            jsonify(
                {
                    "message": "Contracts uploaded successfully.",
                    "insertedRows": len(rows_to_insert),
                    "sourceRows": source_row_count,
                    "selectorExpandedRows": scoped_row_count,
                    "generatedRows": generated_row_count,
                    "multiYearEnabled": normalized_multi_year["enabled"],
                    "contractType": contract_type,
                }
            ),
            201,
        )
    except Exception as err:
        return _error_response("Failed to upload contracts.", 500, str(err))


@app.route("/contracts/override", methods=["POST"])
def override_contracts():
    payload = request.get_json(silent=True) or {}

    override_type = (payload.get("overrideType") or "").strip().lower()
    selectors = payload.get("selectors") or {}
    override_mode = (payload.get("overrideMode") or "amount").strip().lower()
    override_value = _to_float_or_none(payload.get("overrideValue"))
    file_contents = payload.get("fileContents") or []

    if override_type not in OVERRIDE_COLUMN_MAP:
        return _error_response("Invalid override type.", 400)

    if override_mode not in {"amount", "percentage"}:
        return _error_response("Invalid override mode.", 400)

    target_columns = OVERRIDE_COLUMN_MAP[override_type]
    selector_where, selector_params = _build_selector_where(selectors)

    statements_executed = 0

    try:
        with _get_databricks_connection() as connection:
            cursor = connection.cursor()

            if isinstance(file_contents, list) and file_contents:
                for raw_row in file_contents:
                    if not isinstance(raw_row, dict):
                        continue

                    row = _normalize_row(raw_row)
                    where_clauses = ["InvenID = ?", "GTIN = ?", "Pack = ?"]
                    where_params = [row.get("InvenID"), row.get("GTIN"), row.get("Pack")]

                    if not all(where_params):
                        continue

                    if row.get("ContractName"):
                        where_clauses.append("ContractName = ?")
                        where_params.append(row.get("ContractName"))

                    set_clauses = []
                    set_params = []

                    for column in target_columns:
                        file_value = _to_float_or_none(raw_row.get(column))
                        if file_value is not None:
                            set_clauses.append(f"{column} = ?")
                            set_params.append(file_value)
                            continue

                        if override_value is None:
                            continue

                        if override_mode == "percentage":
                            factor = 1 + (override_value / 100.0)
                            set_clauses.append(f"{column} = COALESCE({column}, 0) * ?")
                            set_params.append(factor)
                        else:
                            set_clauses.append(f"{column} = ?")
                            set_params.append(override_value)

                    if not set_clauses:
                        continue

                    all_where_clauses = where_clauses + selector_where
                    all_where_params = where_params + selector_params

                    update_sql = f"""
                        UPDATE {_table_name()}
                        SET {", ".join(set_clauses)}
                        WHERE {' AND '.join(all_where_clauses)}
                    """
                    cursor.execute(update_sql, set_params + all_where_params)
                    statements_executed += 1
            else:
                if override_value is None:
                    return _error_response("Provide override value for manual override.", 400)

                if not selector_where:
                    return _error_response(
                        "Manual override requires at least one filter (package, distributor, chain, DC, or date).",
                        400,
                    )

                set_clauses = []
                set_params = []
                for column in target_columns:
                    if override_mode == "percentage":
                        factor = 1 + (override_value / 100.0)
                        set_clauses.append(f"{column} = COALESCE({column}, 0) * ?")
                        set_params.append(factor)
                    else:
                        set_clauses.append(f"{column} = ?")
                        set_params.append(override_value)

                update_sql = f"""
                    UPDATE {_table_name()}
                    SET {", ".join(set_clauses)}
                    WHERE {' AND '.join(selector_where)}
                """
                cursor.execute(update_sql, set_params + selector_params)
                statements_executed = 1

            cursor.close()

        return jsonify(
            {
                "message": "Override applied successfully.",
                "overrideType": override_type,
                "updatesApplied": statements_executed,
            }
        )
    except Exception as err:
        return _error_response("Failed to apply override.", 500, str(err))


@app.route("/<path:path>")
def serve_spa(path):
    if path.startswith(("health", "contracts", "metadata")):
        return _error_response("Endpoint not found.", 404)

    target = DIST_DIR / path
    if target.exists() and target.is_file():
        return send_from_directory(DIST_DIR, path)

    if _frontend_available():
        return send_from_directory(DIST_DIR, "index.html")

    return _error_response("Frontend build not found.", 404)


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("PORT") or os.getenv("DATABRICKS_APP_PORT") or "5000"),
        debug=(os.getenv("FLASK_DEBUG", "0") == "1"),
    )
