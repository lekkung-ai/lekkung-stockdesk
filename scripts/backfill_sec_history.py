"""Backfill historical Form 59-2 and 246-2 data into data/history/{date}/
from export CSV files.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

R59_HEADERS = [
    "ชื่อบริษัท",
    "ชื่อผู้บริหาร",
    "ความสัมพันธ์ *",
    "ประเภทหลักทรัพย์",
    "วันที่ได้มา/จำหน่าย",
    "จำนวน",
    "ราคา",
    "วิธีการได้มา/จำหน่าย",
    "หมายเหตุ",
]
R59_DATE_BASIS = "วันที่ สนง.รับเอกสาร"

R246_HEADERS = [
    "หลักทรัพย์",
    "ชื่อผู้ได้มา/จำหน่าย",
    "วิธีการ",
    "ประเภทหลักทรัพย์",
    "% ก่อนได้มา/จำหน่าย",
    "%ได้มา/จำหน่าย",
    "% หลังได้มา/จำหน่าย",
    "วันที่ได้มา/จำหน่าย",
    "% ก่อนได้มา/จำหน่าย (กลุ่ม)",
    "%ได้มา/จำหน่าย (กลุ่ม)",
    "% หลังได้มา/จำหน่าย (กลุ่ม)",
    "หมายเหตุ",
    "PDF",
    "หมายเลข",
]
R246_DATE_BASIS = "วันที่เผยแพร่"


def to_iso(date_str: Any) -> str | None:
    """Robust date parsing using pandas with M/D/YYYY primary format and auto-fallback."""
    s = str(date_str).strip()
    if not s or s == "nan" or s == "None":
        return None
    try:
        dt = pd.to_datetime(s, format="%m/%d/%Y")  # M/D/YYYY (CSV จริง)
    except Exception:
        try:
            dt = pd.to_datetime(s)  # fallback auto
        except Exception:
            return None
    if pd.isna(dt):
        return None
    return dt.strftime("%Y-%m-%d")


def clean_str(val: Any) -> str:
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    if s.lower() == "nan":
        return ""
    return s


def backfill_r59(csv_path: Path, history_root: Path) -> tuple[int, int]:
    """Read CSV, filter 59-2, and write data/history/{date}/r59.json."""
    if not csv_path.exists():
        print(f"⚠️ r59 file not found: {csv_path}")
        return 0, 0

    df = pd.read_csv(csv_path, dtype=str)

    type_col = next((c for c in df.columns if c.lower() == "type"), None)
    if type_col:
        df = df[df[type_col].str.contains("59-2", na=False, case=False)]

    date_col = next((c for c in df.columns if c.lower() in ("date", "filing_date", "filingdate")), None)
    if not date_col:
        print("❌ Could not find Date column in r59 CSV")
        return 0, 0

    df["iso_date"] = df[date_col].apply(to_iso)
    df = df[df["iso_date"].notna()]

    col_map: Dict[str, str] = {}
    for col in df.columns:
        c_clean = col.strip()
        if c_clean in ("ความสัมพันธ์", "ความสัมพันธ์*"):
            col_map[col] = "ความสัมพันธ์ *"
        elif c_clean in R59_HEADERS:
            col_map[col] = c_clean

    written_count = 0
    total_dates = 0

    for date_str, group in df.groupby("iso_date"):
        total_dates += 1
        if date_str == "2026-08-14":
            print(f"  [SKIP] 2026-08-14 (reserved for live scrape)")
            continue

        target_dir = history_root / date_str
        target_file = target_dir / "r59.json"
        if target_file.exists():
            print(f"  [SKIP] {date_str}/r59.json already exists")
            continue

        rows: List[Dict[str, str]] = []
        for _, row in group.iterrows():
            row_dict: Dict[str, str] = {}
            for h in R59_HEADERS:
                orig_col = next((k for k, v in col_map.items() if v == h), None)
                val = clean_str(row.get(orig_col)) if orig_col else clean_str(row.get(h, ""))
                row_dict[h] = val
            rows.append(row_dict)

        payload = {
            "generatedAt": f"{date_str}T18:07:00+07:00",
            "date": date_str,
            "from": date_str,
            "to": date_str,
            "dateBasis": R59_DATE_BASIS,
            "fetchDate": date_str,
            "headers": R59_HEADERS,
            "rows": rows,
        }

        target_dir.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        written_count += 1

    return written_count, total_dates


def backfill_r246(csv_path: Path, history_root: Path) -> tuple[int, int]:
    """Read CSV, filter 246-2, and write data/history/{date}/r246.json."""
    if not csv_path.exists():
        print(f"⚠️ r246 file not found: {csv_path}")
        return 0, 0

    df = pd.read_csv(csv_path, dtype=str)

    sec_col = next((c for c in df.columns if "หลักทรัพย์" in c or c.lower() == "ticker"), None)
    if sec_col:
        df = df[df[sec_col].notna() & (df[sec_col].str.strip() != "") & (df[sec_col].str.strip() != "ไม่พบข้อมูล")]

    date_col = next((c for c in df.columns if c.lower() in ("date", "filing_date", "publish_date", "วันที่เผยแพร่")), None)
    if not date_col:
        print("❌ Could not find Date column in r246 CSV")
        return 0, 0

    df["iso_date"] = df[date_col].apply(to_iso)
    df = df[df["iso_date"].notna()]

    col_map: Dict[str, str] = {}
    for col in df.columns:
        c_clean = col.strip()
        matched = False
        for target_h in R246_HEADERS:
            norm_target = target_h.replace(" ", "")
            norm_col = c_clean.replace(" ", "")
            if norm_col == norm_target:
                col_map[col] = target_h
                matched = True
                break
        if not matched and c_clean in R246_HEADERS:
            col_map[col] = c_clean

    written_count = 0
    total_dates = 0

    for date_str, group in df.groupby("iso_date"):
        total_dates += 1
        if date_str == "2026-08-14":
            print(f"  [SKIP] 2026-08-14 (reserved for live scrape)")
            continue

        target_dir = history_root / date_str
        target_file = target_dir / "r246.json"
        if target_file.exists():
            print(f"  [SKIP] {date_str}/r246.json already exists")
            continue

        rows: List[Dict[str, str]] = []
        for _, row in group.iterrows():
            row_dict: Dict[str, str] = {}
            for h in R246_HEADERS:
                orig_col = next((k for k, v in col_map.items() if v == h), None)
                val = clean_str(row.get(orig_col)) if orig_col else clean_str(row.get(h, ""))
                row_dict[h] = val
            rows.append(row_dict)

        payload = {
            "generatedAt": f"{date_str}T18:07:00+07:00",
            "date": date_str,
            "from": date_str,
            "to": date_str,
            "dateBasis": R246_DATE_BASIS,
            "fetchDate": date_str,
            "headers": R246_HEADERS,
            "rows": rows,
        }

        target_dir.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        written_count += 1

    return written_count, total_dates


def resolve_csv_path(p_str: str, root_dir: Path, default_name: str) -> Path:
    candidates = [
        Path(p_str),
        root_dir / p_str,
        root_dir / "data" / p_str,
        root_dir.parent / "data" / "csv" / default_name,
        Path(r"E:\AI Agent\Claude\dashboard\data\csv") / default_name,
    ]
    for c in candidates:
        if c.exists():
            return c
    return Path(p_str)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill SEC r59/r246 history JSONs from CSVs.")
    parser.add_argument("--r59-csv", default="59_246.csv", help="Path to 59_246 CSV")
    parser.add_argument("--r246-csv", default="246.csv", help="Path to 246 CSV")
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent
    history_root = root_dir / "data" / "history"

    r59_path = resolve_csv_path(args.r59_csv, root_dir, "59_246.csv")
    r246_path = resolve_csv_path(args.r246_csv, root_dir, "246.csv")

    print(f"=== Starting SEC History Backfill ===")
    print(f"History root: {history_root}")
    print(f"r59 CSV: {r59_path}")
    print(f"r246 CSV: {r246_path}")

    r59_written, r59_total = backfill_r59(r59_path, history_root)
    print(f"\n📊 R59 Backfill Summary: {r59_written}/{r59_total} dates written")

    r246_written, r246_total = backfill_r246(r246_path, history_root)
    print(f"📊 R246 Backfill Summary: {r246_written}/{r246_total} dates written")

    total_files = r59_written + r246_written
    print(f"\n🎉 Total JSON files written: {total_files}")


if __name__ == "__main__":
    main()
