from __future__ import annotations

import argparse
import csv
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "stocks_master.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "daily_input_template.csv"

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


def create_template(input_path: Path, output_path: Path) -> int:
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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    return len(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a daily_input CSV template from data/stocks_master.csv."
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
        help="Output path. Defaults to data/daily_input_template.csv.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    row_count = create_template(args.input, args.output)
    print(f"Created {args.output} ({row_count} rows)")


if __name__ == "__main__":
    main()
