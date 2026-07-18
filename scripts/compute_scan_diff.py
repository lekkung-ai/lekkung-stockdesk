"""
compute_scan_diff.py  –  Compare today's scan results against the previous
trading day's daily snapshot to find which tickers are newly in the list
today ("เข้าใหม่") and which dropped out ("หลุดออก") - drives the chips
filter row + NEW badge on scan pages.

Output: data/scans/{scanName}_diff.json
    {
      "generatedAt": "2026-07-18T17:30:00+07:00",
      "scan": "sepa",
      "previousDate": "2026-07-17",
      "currentDate": "2026-07-18",
      "newTickers": ["MGC", "SGC"],
      "droppedTickers": [{"ticker": "TRT", "lastClose": 15.10}]
    }

Run AFTER the daily snapshot step (same point as compute_scan_days.py /
compute_scan_history.py) so today's own snapshot dir already exists and can
be excluded when picking the previous date to diff against.
Usage:
    python -X utf8 compute_scan_diff.py
"""

import json
import os
from datetime import datetime, timedelta, timezone

# page key -> history/scan filename (without .json) - same convention/list
# as compute_scan_days.py.
SCANNERS = {
    "lekkung": "lekkung",
    "oneil": "oneil",
    "sepa": "sepa",
    "kell": "oliver_kell",
    "breakout": "breakout",
    "market-stage": "market_stage",
    "stage-analysis": "weinstein",
}

BANGKOK_TZ = timezone(timedelta(hours=7))


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def rows_of(data) -> list:
    if data is None:
        return []
    return data if isinstance(data, list) else data.get("data", [])


def close_by_ticker(rows: list) -> dict:
    out = {}
    for r in rows:
        t = r.get("Ticker") or r.get("ticker")
        c = r.get("Close") or r.get("close") or r.get("Price") or r.get("price")
        if t and c is not None:
            out[t] = c
    return out


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    hist_dir = os.path.join(stockdesk_dir, "data", "history")
    scans_dir = os.path.join(stockdesk_dir, "data", "scans")

    today = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d")

    dates = sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[0].isdigit()
    )
    prior_dates = [d for d in dates if d < today]
    if not prior_dates:
        print("  No prior history date to diff against - skipping (first run?)")
        return
    previous_date = prior_dates[-1]
    print(f"  Diffing today ({today}) against previous trading day ({previous_date})")

    generated_at = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00")

    for key, fname in SCANNERS.items():
        current_rows = rows_of(load_json(os.path.join(scans_dir, f"{fname}.json")))
        current_close = close_by_ticker(current_rows)
        current_tickers = set(current_close.keys())

        previous_rows = rows_of(load_json(os.path.join(hist_dir, previous_date, f"{fname}.json")))
        previous_close = close_by_ticker(previous_rows)
        previous_tickers = set(previous_close.keys())

        new_tickers = sorted(current_tickers - previous_tickers)
        dropped_tickers = [
            {"ticker": t, "lastClose": previous_close.get(t)}
            for t in sorted(previous_tickers - current_tickers)
        ]

        out = {
            "generatedAt": generated_at,
            "scan": key,
            "previousDate": previous_date,
            "currentDate": today,
            "newTickers": new_tickers,
            "droppedTickers": dropped_tickers,
        }
        out_file = os.path.join(scans_dir, f"{fname}_diff.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print(f"    {key}: +{len(new_tickers)} new, -{len(dropped_tickers)} dropped -> {out_file}")


if __name__ == "__main__":
    main()
