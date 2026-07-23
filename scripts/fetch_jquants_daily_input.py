from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python 3.8 fallback.
    ZoneInfo = None  # type: ignore[assignment]


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "stocks_master.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "daily_input_jquants.csv"
ENV_PATH = PROJECT_ROOT / ".env"
CACHE_DIR = PROJECT_ROOT / "data" / ".jquants_cache"
DEFAULT_END_DATE_SAFETY_DAYS = 90
DEFAULT_FETCH_WINDOW_DAYS = 180
DEFAULT_REQUEST_SLEEP_SECONDS = 1.5
RATE_LIMIT_BACKOFF_SECONDS = [5.0, 15.0, 30.0]
API_KEY_PLACEHOLDERS = {"", "your_api_key_here", "YOUR_API_KEY", "YOUR_API_KEY_HERE"}
SUBSCRIPTION_RANGE_PATTERN = re.compile(
    r"Your subscription covers the following dates:\s*"
    r"(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})"
)

OUTPUT_COLUMNS = [
    "code",
    "name",
    "current_price",
    "change_pct",
    "volume",
    "volume_ratio",
    "ma25_gap",
    "ma75_gap",
    "per",
    "pbr",
    "credit_ratio",
    "next_earnings",
    "price_date",
]


class MissingApiKeyError(RuntimeError):
    pass


class MissingClientError(RuntimeError):
    pass


class FetchResult:
    def __init__(self, quotes: list[dict[str, Any]], from_date: str, to_date: str) -> None:
        self.quotes = quotes
        self.from_date = from_date
        self.to_date = to_date


def load_dotenv(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (key not in os.environ or not os.environ[key]):
            os.environ[key] = value


def get_api_key() -> str:
    api_key = os.environ.get("JQUANTS_API_KEY", "").strip()
    if api_key in API_KEY_PLACEHOLDERS:
        raise MissingApiKeyError(
            "JQUANTS_API_KEY is missing. Create .env from .env.example and set "
            "JQUANTS_API_KEY to your J-Quants V2 API key."
        )
    return api_key


def create_jquants_client(api_key: str) -> Any:
    try:
        import jquantsapi  # type: ignore[import-not-found]
    except ImportError as error:
        raise MissingClientError(
            "jquants-api-client is not installed. Run: py -m pip install -r requirements.txt"
        ) from error

    return jquantsapi.ClientV2(api_key=api_key)


def read_master_rows(input_path: Path) -> list[dict[str, str]]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    csv_text = read_text_with_encoding_fallback(input_path)
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        raise ValueError("Input CSV has no header row.")

    required_columns = {"code", "name"}
    missing_columns = required_columns - set(reader.fieldnames)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"Input CSV is missing required column(s): {missing}")

    rows: list[dict[str, str]] = []
    for record in reader:
        code = (record.get("code") or "").strip()
        name = (record.get("name") or "").strip()
        if not code and not name:
            continue
        rows.append(blank_row(code, name))

    return rows


def read_text_with_encoding_fallback(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        return path.read_text(encoding="cp932")


def blank_row(code: str, name: str) -> dict[str, str]:
    row = {column: "" for column in OUTPUT_COLUMNS}
    row["code"] = code
    row["name"] = name
    return row


def write_csv(output_path: Path, rows: list[dict[str, str]]) -> None:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    csv_text = buffer.getvalue()

    if output_path.exists():
        existing_text = output_path.read_text(encoding="utf-8")
        if existing_text == csv_text:
            return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as output_file:
        output_file.write(csv_text)


def fetch_daily_quotes(
    client: Any,
    code: str,
    from_date: str,
    to_date: str,
    *,
    from_date_is_fixed: bool,
    force_refresh: bool,
) -> FetchResult:
    request_from_date = from_date
    request_to_date = to_date
    subscription_date_adjusted = False
    rate_limit_retry_index = 0

    while True:
        try:
            quotes = fetch_daily_quotes_from_cache_or_api(
                client,
                code,
                request_from_date,
                request_to_date,
                force_refresh=force_refresh,
            )
            return FetchResult(quotes, request_from_date, request_to_date)
        except Exception as error:
            subscription_dates = extract_subscription_dates(error)
            if subscription_dates and not subscription_date_adjusted:
                _, subscription_to_date = subscription_dates
                if yyyymmdd_to_date(request_to_date) > yyyymmdd_to_date(subscription_to_date):
                    request_to_date = subscription_to_date
                    if not from_date_is_fixed:
                        request_from_date = date_to_yyyymmdd(
                            yyyymmdd_to_date(subscription_to_date)
                            - dt.timedelta(days=DEFAULT_FETCH_WINDOW_DAYS)
                        )
                    subscription_date_adjusted = True
                    print(
                        "[WARN] Adjusted J-Quants to-date to subscription limit "
                        f"{request_to_date} and retrying {code}.",
                        file=sys.stderr,
                    )
                    continue

            if is_rate_limit_error(error) and rate_limit_retry_index < len(RATE_LIMIT_BACKOFF_SECONDS):
                sleep_seconds = RATE_LIMIT_BACKOFF_SECONDS[rate_limit_retry_index]
                rate_limit_retry_index += 1
                print(
                    f"[WARN] 429 rate limit for {code}. Retrying after {sleep_seconds:g} seconds.",
                    file=sys.stderr,
                )
                time.sleep(sleep_seconds)
                continue

            raise


def fetch_daily_quotes_from_cache_or_api(
    client: Any,
    code: str,
    from_date: str,
    to_date: str,
    *,
    force_refresh: bool,
) -> list[dict[str, Any]]:
    if not force_refresh:
        cached_quotes = read_quote_cache(code, from_date, to_date)
        if cached_quotes is not None:
            return cached_quotes

    quotes = fetch_daily_quotes_once(client, code, from_date, to_date)
    if not force_refresh:
        write_quote_cache(code, from_date, to_date, quotes)
    return quotes


def fetch_daily_quotes_once(
    client: Any,
    code: str,
    from_date: str,
    to_date: str,
) -> list[dict[str, Any]]:
    frame = client.get_eq_bars_daily(
        code=normalize_code(code),
        from_yyyymmdd=from_date,
        to_yyyymmdd=to_date,
    )
    if frame is None:
        return []
    if hasattr(frame, "empty") and frame.empty:
        return []
    if hasattr(frame, "to_dict"):
        return list(frame.to_dict("records"))
    if isinstance(frame, list):
        return [record for record in frame if isinstance(record, dict)]

    raise TypeError("J-Quants client returned an unsupported data shape.")


def quote_cache_path(code: str, from_date: str, to_date: str) -> Path:
    safe_code = re.sub(r"[^0-9A-Za-z_.-]+", "_", normalize_code(code))
    return CACHE_DIR / f"{safe_code}_{from_date}_{to_date}.json"


def read_quote_cache(code: str, from_date: str, to_date: str) -> list[dict[str, Any]] | None:
    if not CACHE_DIR.exists():
        return None

    cache_path = quote_cache_path(code, from_date, to_date)
    if not cache_path.exists():
        return None

    try:
        cached_value = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(cached_value, list):
        return None
    return [record for record in cached_value if isinstance(record, dict)]


def write_quote_cache(code: str, from_date: str, to_date: str, quotes: list[dict[str, Any]]) -> None:
    if not CACHE_DIR.exists():
        return

    cache_path = quote_cache_path(code, from_date, to_date)
    try:
        cache_path.write_text(
            json.dumps(json_safe_records(quotes), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        return


def json_safe_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {str(key): json_safe_value(value) for key, value in record.items()}
        for record in records
    ]


def json_safe_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "item"):
        return json_safe_value(value.item())
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def extract_subscription_dates(error: Exception) -> tuple[str, str] | None:
    match = SUBSCRIPTION_RANGE_PATTERN.search(str(error))
    if not match:
        return None

    from_date = parse_date(match.group(1))
    to_date = parse_date(match.group(2))
    return from_date, to_date


def is_rate_limit_error(error: Exception) -> bool:
    response = getattr(error, "response", None)
    status_code = getattr(error, "status_code", None) or getattr(response, "status_code", None)
    if status_code == 429:
        return True

    text = str(error).lower()
    return "429" in text or "too many requests" in text


def normalize_code(code: str) -> str:
    return str(code).strip()


def calculate_metrics(quotes: list[dict[str, Any]]) -> dict[str, str]:
    sorted_quotes = sorted(quotes, key=quote_date_key)
    close_rows = [
        (index, quote, quote_close(quote))
        for index, quote in enumerate(sorted_quotes)
    ]
    close_rows = [
        (index, quote, close)
        for index, quote, close in close_rows
        if close is not None
    ]

    if not close_rows:
        raise ValueError("No close price data returned.")

    latest_index, latest_quote, latest_close = close_rows[-1]
    latest_date_text = quote_date_text(latest_quote)
    if not latest_date_text:
        raise ValueError("No price date returned for the latest close price.")

    previous_close = close_rows[-2][2] if len(close_rows) >= 2 else None
    effective_quotes = sorted_quotes[: latest_index + 1]
    close_values = [close for index, _, close in close_rows if index <= latest_index]

    volume_values = [quote_volume(quote) for quote in effective_quotes]
    volume_values = [volume for volume in volume_values if volume is not None]
    latest_volume = quote_volume(latest_quote)

    average_volume_20 = average(volume_values[-20:]) if len(volume_values) >= 20 else None
    average_close_25 = average(close_values[-25:]) if len(close_values) >= 25 else None
    average_close_75 = average(close_values[-75:]) if len(close_values) >= 75 else None

    return {
        "current_price": format_price(latest_close),
        "change_pct": format_decimal(percent_change(latest_close, previous_close)),
        "volume": format_volume(latest_volume),
        "volume_ratio": format_decimal(ratio(latest_volume, average_volume_20)),
        "ma25_gap": format_decimal(percent_change(latest_close, average_close_25)),
        "ma75_gap": format_decimal(percent_change(latest_close, average_close_75)),
        "price_date": format_price_date(latest_date_text),
    }


def quote_date_key(quote: dict[str, Any]) -> str:
    value = quote_date_text(quote)
    if not value:
        return ""
    try:
        return parse_date(value)
    except ValueError:
        return value


def quote_date_text(quote: dict[str, Any]) -> str:
    value = quote.get("Date") or quote.get("date") or ""
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "nat"}:
        return ""
    if "T" in text:
        text = text.split("T", 1)[0]
    if " " in text:
        text = text.split(" ", 1)[0]
    return text


def quote_close(quote: dict[str, Any]) -> float | None:
    for key in ("C", "Close", "AdjC", "AdjustmentClose"):
        close = to_float(quote.get(key))
        if close is not None:
            return close
    return None


def quote_volume(quote: dict[str, Any]) -> float | None:
    for key in ("Vo", "Volume", "AdjVo", "AdjustmentVolume"):
        volume = to_float(quote.get(key))
        if volume is not None:
            return volume
    return None


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric_value = float(value)
        if math.isnan(numeric_value):
            return None
        return numeric_value

    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"nan", "none", "null", "nat"}:
        return None

    try:
        numeric_value = float(text)
    except ValueError:
        return None

    if math.isnan(numeric_value):
        return None
    return numeric_value


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def percent_change(latest: float | None, base: float | None) -> float | None:
    if latest is None or base in (None, 0):
        return None
    return (latest - base) / base * 100


def format_price(value: float | None) -> str:
    if value is None:
        return ""
    if value.is_integer():
        return str(int(value))
    return f"{value:.2f}"


def format_volume(value: float | None) -> str:
    if value is None:
        return ""
    return str(int(round(value)))


def format_decimal(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def format_price_date(value: str) -> str:
    normalized = parse_date(value)
    return yyyymmdd_to_date(normalized).isoformat()


def parse_date(text: str) -> str:
    normalized = text.strip().replace("-", "")
    if len(normalized) != 8 or not normalized.isdigit():
        raise ValueError(f"Date must be YYYYMMDD or YYYY-MM-DD: {text}")
    return normalized


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer.") from error


def env_float(name: str, default: float) -> float:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    try:
        return float(value)
    except ValueError as error:
        raise ValueError(f"{name} must be a number.") from error


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name, "").strip().lower()
    if not value:
        return default
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    raise ValueError(f"{name} must be true or false.")


def env_date(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value or is_auto_value(value):
        return ""
    return parse_date(value)


def is_auto_value(value: str) -> bool:
    return value.strip().lower() == "auto"


def yyyymmdd_to_date(value: str) -> dt.date:
    return dt.datetime.strptime(parse_date(value), "%Y%m%d").date()


def date_to_yyyymmdd(value: dt.date) -> str:
    return value.strftime("%Y%m%d")


def today_jst() -> dt.date:
    if ZoneInfo is None:
        return dt.date.today()
    return dt.datetime.now(ZoneInfo("Asia/Tokyo")).date()


def resolve_date_range(args: argparse.Namespace) -> tuple[str, str, bool]:
    raw_to_date = args.to_date if args.to_date is not None else os.environ.get("JQUANTS_TO_DATE", "")
    raw_from_date = (
        args.from_date if args.from_date is not None else os.environ.get("JQUANTS_FROM_DATE", "")
    )
    to_date_text = raw_to_date.strip()
    from_date_text = raw_from_date.strip()

    if to_date_text:
        if is_auto_value(to_date_text):
            to_date_value = today_jst()
            to_date = date_to_yyyymmdd(to_date_value)
        else:
            to_date = parse_date(to_date_text)
            to_date_value = yyyymmdd_to_date(to_date)
    else:
        to_date_value = today_jst() - dt.timedelta(days=DEFAULT_END_DATE_SAFETY_DAYS)
        to_date = date_to_yyyymmdd(to_date_value)

    lookback_days = args.lookback_days or env_int("JQUANTS_LOOKBACK_DAYS", DEFAULT_FETCH_WINDOW_DAYS)

    if from_date_text:
        if is_auto_value(from_date_text):
            from_date = date_to_yyyymmdd(to_date_value - dt.timedelta(days=lookback_days))
            from_date_is_fixed = False
        else:
            from_date = parse_date(from_date_text)
            from_date_is_fixed = True
    else:
        from_date = date_to_yyyymmdd(to_date_value - dt.timedelta(days=lookback_days))
        from_date_is_fixed = False

    return from_date, to_date, from_date_is_fixed


def print_output_summary(rows: list[dict[str, str]]) -> None:
    price_dates = sorted(row.get("price_date", "") for row in rows if row.get("price_date"))
    print(f"Output CSV header: {','.join(OUTPUT_COLUMNS)}")
    if price_dates:
        print(f"price_date min: {price_dates[0]}")
        print(f"price_date max: {price_dates[-1]}")
    else:
        print("price_date min: -")
        print("price_date max: -")
    print(f"Output rows: {len(rows)}")


def update_rows_with_jquants(
    rows: list[dict[str, str]],
    client: Any,
    from_date: str,
    to_date: str,
    *,
    from_date_is_fixed: bool,
    request_sleep_seconds: float,
    force_refresh: bool,
) -> int:
    error_count = 0
    active_from_date = from_date
    active_to_date = to_date

    for index, row in enumerate(rows):
        code = row["code"]
        name = row["name"]
        try:
            result = fetch_daily_quotes(
                client,
                code,
                active_from_date,
                active_to_date,
                from_date_is_fixed=from_date_is_fixed,
                force_refresh=force_refresh,
            )
            active_from_date = result.from_date
            active_to_date = result.to_date
            metrics = calculate_metrics(result.quotes)
            row.update(metrics)
            print(
                f"[OK] {code} {name}: "
                f"current_price={row['current_price']} price_date={row['price_date'] or '-'}"
            )
        except Exception as error:  # noqa: BLE001 - keep all rows even when one symbol fails.
            error_count += 1
            print(f"[ERROR] {code} {name}: {error}", file=sys.stderr)

        if index < len(rows) - 1 and request_sleep_seconds > 0:
            time.sleep(request_sleep_seconds)

    return error_count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch J-Quants V2 daily bars and create data/daily_input_jquants.csv."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Path to stocks_master.csv. Defaults to data/stocks_master.csv.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output path. Defaults to data/daily_input_jquants.csv.",
    )
    parser.add_argument(
        "--from-date",
        help="Start date for daily bars. Accepts YYYYMMDD, YYYY-MM-DD, or auto.",
    )
    parser.add_argument(
        "--to-date",
        help=(
            "End date for daily bars. Accepts YYYYMMDD, YYYY-MM-DD, or auto. "
            "Defaults to JQUANTS_TO_DATE or about 90 days before today in JST."
        ),
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        help="Calendar days to look back when --from-date is omitted. Defaults to JQUANTS_LOOKBACK_DAYS or 180.",
    )
    parser.add_argument(
        "--request-sleep",
        type=float,
        help="Seconds to sleep between symbols. Defaults to JQUANTS_REQUEST_SLEEP or 1.5.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    load_dotenv()

    rows = read_master_rows(args.input)
    from_date, to_date, from_date_is_fixed = resolve_date_range(args)
    request_sleep_seconds = (
        args.request_sleep
        if args.request_sleep is not None
        else env_float("JQUANTS_REQUEST_SLEEP", DEFAULT_REQUEST_SLEEP_SECONDS)
    )
    force_refresh = env_bool("JQUANTS_FORCE_REFRESH", False)

    try:
        api_key = get_api_key()
    except MissingApiKeyError as error:
        write_csv(args.output, rows)
        print_output_summary(rows)
        print(f"[ERROR] {error}", file=sys.stderr)
        print(
            f"Created {args.output} with blank market data because JQUANTS_API_KEY is missing.",
            file=sys.stderr,
        )
        raise SystemExit(2) from error

    try:
        client = create_jquants_client(api_key)
    except MissingClientError as error:
        write_csv(args.output, rows)
        print_output_summary(rows)
        print(f"[ERROR] {error}", file=sys.stderr)
        print(
            f"Created {args.output} with blank market data because jquants-api-client is not installed.",
            file=sys.stderr,
        )
        raise SystemExit(2) from error

    print(f"Fetching J-Quants V2 daily bars: {from_date} to {to_date}")
    print(f"Request sleep: {request_sleep_seconds:g} seconds")
    if force_refresh:
        print("Force refresh: enabled")
    elif CACHE_DIR.exists():
        print(f"Cache: {CACHE_DIR}")
    error_count = update_rows_with_jquants(
        rows,
        client,
        from_date,
        to_date,
        from_date_is_fixed=from_date_is_fixed,
        request_sleep_seconds=request_sleep_seconds,
        force_refresh=force_refresh,
    )
    write_csv(args.output, rows)
    print_output_summary(rows)

    print(f"Created {args.output} ({len(rows)} rows)")
    if error_count:
        print(f"Completed with {error_count} symbol error(s). Blank rows were kept for failed symbols.")


if __name__ == "__main__":
    main()
