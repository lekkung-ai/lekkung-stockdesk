"""
compute_scan_history.py  –  Aggregate the last N days of daily snapshots per
ticker into a lookback-friendly file, for the "วันนี้ | ย้อนหลัง" toggle on
/lekkung (and, later, any other scan page via the same SCANNERS config -
written generic on purpose so adding a second scan doesn't need a rewrite).

Output: data/scans/{scanName}_history.json
    {
      "generatedAt": "2026-07-14T18:30:00+07:00",
      "scan": "lekkung",
      "windowDays": 90,
      "tickers": [
        {
          "ticker": "MGC",
          "hitDates": ["2026-07-10", "2026-07-13", "2026-07-14"],
          "hitCount": 3,
          "closeByDate": {"2026-07-10": 8.5, "2026-07-13": 9.05, "2026-07-14": 9.1},
          "firstSeen": "2026-07-10",
          "lastSeen": "2026-07-14",
          "firstClose": 8.5,
          "lastClose": 9.1,
          "pctChange": 7.06
        },
        ...
      ]
    }

"pctChange"/"lastClose" are as of the most recent day this ticker appeared in
the scan within the window - a batch-time figure, not a live intraday price
(the "today" view already has live prices via useLivePrices; this file is
for browsing scan history, not real-time quotes).

Run AFTER the daily snapshot step (same point as compute_scan_days.py).
Usage:
    python -X utf8 compute_scan_history.py
"""

import json
import os
from datetime import datetime, timedelta, timezone

# page key -> history/scan filename (without .json) - same convention as
# compute_scan_days.py. Add an entry here to extend this to another scan;
# nothing else in this file needs to change.
SCANNERS = {
    "lekkung": "lekkung",
    "sepa": "sepa",
    "kell": "oliver_kell",
    "oneil": "oneil",
    "breakout": "breakout",
    "market-stage": "market_stage",
    "stage-analysis": "weinstein",
}

WINDOW_DAYS = 90
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


def _is_weekday(dstr: str) -> bool:
    try:
        return datetime.fromisoformat(dstr).weekday() < 5
    except ValueError:
        return False


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    hist_dir = os.path.join(stockdesk_dir, "data", "history")

    all_dates = sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[0].isdigit() and _is_weekday(d)
    )
    if not all_dates:
        print("  No history dates - nothing to aggregate")
        return

    cutoff = (datetime.now(BANGKOK_TZ) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
    dates = [d for d in all_dates if d >= cutoff]
    print(f"  History dates in window: {len(dates)}/{len(all_dates)} (cutoff {cutoff})")

    scans_dir = os.path.join(stockdesk_dir, "data", "scans")
    generated_at = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00")

    for key, fname in SCANNERS.items():
        # ticker -> {date: close} across the window
        by_ticker: dict[str, dict[str, float]] = {}
        for d in dates:
            rows = rows_of(load_json(os.path.join(hist_dir, d, f"{fname}.json")))
            for ticker, close in close_by_ticker(rows).items():
                by_ticker.setdefault(ticker, {})[d] = close

        tickers_out = []
        for ticker, close_by_date in by_ticker.items():
            hit_dates = sorted(close_by_date.keys())
            first_seen, last_seen = hit_dates[0], hit_dates[-1]
            first_close = close_by_date[first_seen]
            last_close = close_by_date[last_seen]
            pct_change = (
                (last_close - first_close) / first_close * 100
                if first_close else None
            )
            tickers_out.append({
                "ticker": ticker,
                "hitDates": hit_dates,
                "hitCount": len(hit_dates),
                "closeByDate": close_by_date,
                "firstSeen": first_seen,
                "lastSeen": last_seen,
                "firstClose": first_close,
                "lastClose": last_close,
                "pctChange": round(pct_change, 2) if pct_change is not None else None,
            })

        tickers_out.sort(key=lambda t: t["lastSeen"], reverse=True)

        out = {
            "generatedAt": generated_at,
            "scan": key,
            "windowDays": WINDOW_DAYS,
            "tickers": tickers_out,
        }
        out_file = os.path.join(scans_dir, f"{fname}_history.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {key}: {len(tickers_out)} tickers -> {out_file}")


if __name__ == "__main__":
    main()
