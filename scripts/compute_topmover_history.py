"""
compute_topmover_history.py – Aggregate the last N days of archived
topmover_ranking.json snapshots (data/history/{date}/topmover_ranking.json,
written daily by data_engine's fetch_topmover_ranking.py) into a single
lookback file for the "วันนี้ (realtime) | ย้อนหลัง" toggle on /top-movers -
same "วันนี้ | ย้อนหลัง" pattern as compute_scan_history.py already runs for
the scan pages (SCANNERS dict below plays the same role as that file's).

Run AFTER the daily archive-copy step (same point as compute_scan_history.py -
data/history/{DATESTAMP}/*.json must already exist for today before this runs).

Output: data/scans/topmover_history.json
    {
      "generatedAt": "2026-07-21T18:30:00+07:00",
      "windowDays": 90,
      "dates": ["2026-06-15", ..., "2026-07-21"],
      "byDate": {
        "2026-07-21": {
          "set": {
            "topGainer": [{"symbol": "GEL", "last": 0.04, "percentChange": 33.33,
                           "totalVolume": 6254884, "totalValue": null}, ...],
            "topLoser": [...],
            "mostActiveValue": [...],
            "mostActiveVolume": [...]
          },
          "mai": { ...same 4 keys... }
        },
        ...
      }
    }

This file is fully re-derived from the archive every run (like
compute_scan_history.py) - no merge-on-write needed, since "today's row"
never carries forward stale state and re-running the same day just
recomputes an identical result.

Retention: every day within the last WINDOW_DAYS, PLUS the last archived
trading day of every calendar month kept forever (never dropped once it
ages out of the rolling window) - so a "this month vs 3 months ago" kind
of comparison stays possible indefinitely without the file growing
unbounded like the old Google Sheet did. No backfill from that old Sheet -
this starts accumulating fresh from whenever data_engine's
fetch_topmover_ranking.py first ran.

Usage:
    python -X utf8 compute_topmover_history.py
"""

import json
import os
from datetime import datetime, timedelta, timezone

WINDOW_DAYS = 90
BANGKOK_TZ = timezone(timedelta(hours=7))


def month_end_dates(all_dates: list[str]) -> set[str]:
    """Last archived date in each YYYY-MM group - permanent snapshots."""
    by_month: dict[str, str] = {}
    for d in all_dates:
        month_key = d[:7]  # YYYY-MM
        if month_key not in by_month or d > by_month[month_key]:
            by_month[month_key] = d
    return set(by_month.values())


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    hist_dir = os.path.join(stockdesk_dir, "data", "history")
    scans_dir = os.path.join(stockdesk_dir, "data", "scans")

    all_dates = sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[0].isdigit()
    ) if os.path.isdir(hist_dir) else []

    # First pass: which archived days actually have usable ranking data at
    # all (skip days that only ever got an empty pre-open snapshot - the
    # pipeline ran but the market genuinely had no ranking that run).
    valid_markets_by_date: dict[str, dict] = {}
    for d in all_dates:
        snapshot = load_json(os.path.join(hist_dir, d, "topmover_ranking.json"))
        if not snapshot:
            continue
        markets = snapshot.get("markets", {})
        has_any_rows = any(
            len(rows) > 0
            for market_data in markets.values()
            for rows in market_data.values()
        )
        if has_any_rows:
            valid_markets_by_date[d] = markets

    valid_dates = sorted(valid_markets_by_date.keys())
    cutoff = (datetime.now(BANGKOK_TZ) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
    permanent_dates = month_end_dates(valid_dates)
    dates_out = sorted(d for d in valid_dates if d >= cutoff or d in permanent_dates)
    print(
        f"  History dates: {len(dates_out)} kept (of {len(valid_dates)} with data) - "
        f"{sum(1 for d in dates_out if d >= cutoff)} within {WINDOW_DAYS}d window, "
        f"{sum(1 for d in dates_out if d < cutoff)} permanent month-end"
    )

    by_date = {d: valid_markets_by_date[d] for d in dates_out}
    out = {
        "generatedAt": datetime.now(BANGKOK_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00"),
        "windowDays": WINDOW_DAYS,
        "dates": dates_out,
        "byDate": by_date,
    }

    os.makedirs(scans_dir, exist_ok=True)
    out_path = os.path.join(scans_dir, "topmover_history.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  topmover_history: {len(dates_out)} dates with data -> {out_path}")


if __name__ == "__main__":
    main()
