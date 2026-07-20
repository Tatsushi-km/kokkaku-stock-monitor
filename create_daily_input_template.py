from __future__ import annotations

import argparse
import csv
import io
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "stocks_master.csv"
DEFAULT_TEMPLATE_OUTPUT = PROJECT_ROOT / "data" / "daily_input_template.csv"
DEFAULT_SAMPLE_OUTPUT = PROJECT_ROOT / "data" / "daily_input_sample.csv"
DEFAULT_UPDATE_OUTPUT = PROJECT_ROOT / "data" / "daily_input_update.csv"

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
]


def read_master_rows(input_path: Path) -> list[dict[str, str]]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    with input_path.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        if reader.fieldnames is None:
            raise ValueError("Input CSV has no header row.")

        required_columns = {"code", "name"}
        missing_columns = required_columns - set(reader.fieldnames)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"Input CSV is missing required column(s): {missing}")

        rows = []
        for record in reader:
            code = (record.get("code") or "").strip()
            name = (record.get("name") or "").strip()
            if not code and not name:
                continue

            row = {column: "" for column in OUTPUT_COLUMNS}
            row["code"] = code
            row["name"] = name
            rows.append(row)

    return rows


def make_sample_row(base_row: dict[str, str], index: int) -> dict[str, str]:
    row = dict(base_row)
    row.update(
        {
            "current_price": str(1000 + index * 230),
            "change_pct": format_decimal([-1.2, 0.4, 1.8, 3.1, -0.7][index % 5]),
            "volume": str(800000 + index * 85000),
            "volume_ratio": format_decimal([0.8, 1.1, 1.6, 2.2, 0.9, 1.4][index % 6]),
            "ma25_gap": format_decimal([-12.0, -3.5, 2.0, 8.0, 16.0][index % 5]),
            "ma75_gap": format_decimal([-8.0, -1.5, 3.0, 6.5, 12.0][index % 5]),
            "per": format_decimal([18.5, 24.0, 38.5, 55.0, 72.0][index % 5]),
            "pbr": format_decimal([1.1, 1.8, 2.6, 3.4, 4.2][index % 5]),
            "credit_ratio": format_decimal([0.7, 1.2, 2.1, 3.5, 5.0][index % 5]),
            "next_earnings": f"2026/08/{(index % 28) + 1:02d}",
        }
    )
    return row


def format_decimal(value: float) -> str:
    return f"{value:.1f}"


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


def create_daily_input_files(
    input_path: Path,
    template_output_path: Path,
    sample_output_path: Path,
    update_output_path: Path,
) -> int:
    template_rows = read_master_rows(input_path)
    sample_rows = [make_sample_row(row, index) for index, row in enumerate(template_rows)]

    write_csv(template_output_path, template_rows)
    write_csv(sample_output_path, sample_rows)
    write_csv(update_output_path, template_rows)

    return len(template_rows)


def create_template(input_path: Path, output_path: Path) -> int:
    rows = read_master_rows(input_path)
    write_csv(output_path, rows)
    return len(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create daily_input template, sample, and update CSV files from data/stocks_master.csv."
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
        default=DEFAULT_TEMPLATE_OUTPUT,
        help="Output path. Defaults to data/daily_input_template.csv.",
    )
    parser.add_argument(
        "--sample-output",
        type=Path,
        default=DEFAULT_SAMPLE_OUTPUT,
        help="Sample output path. Defaults to data/daily_input_sample.csv.",
    )
    parser.add_argument(
        "--update-output",
        type=Path,
        default=DEFAULT_UPDATE_OUTPUT,
        help="Daily update output path. Defaults to data/daily_input_update.csv.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    row_count = create_daily_input_files(args.input, args.output, args.sample_output, args.update_output)
    print(f"Created {args.output} ({row_count} rows)")
    print(f"Created {args.sample_output} ({row_count} rows, sample data for testing only)")
    print(f"Created {args.update_output} ({row_count} rows)")


if __name__ == "__main__":
    main()
