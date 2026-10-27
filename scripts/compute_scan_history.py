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

market-stage / stage-analysis write data/scans/{scanName}_transitions.json
instead (stage runs per ticker, see build_transitions()).

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
    "lekkung_daytrade": "lekkung_daytrade",
    "sepa": "sepa",
    "kell": "oliver_kell",
    "oneil": "oneil",
    "breakout": "breakout",
}

# The two stage scans list every ticker every day, so "which days was it in the
# scan" says nothing (every ticker shows up every day). For them the history
# view shows stage changes instead: data/scans/{fname}_transitions.json, built
# by build_transitions() below.
TRANSITION_SCANNERS = {
    "market-stage": "market_stage",
    "stage-analysis": "weinstein",
}
# A snapshot where at least this share of tickers kept yesterday's exact price
# was scanned off a copied (holiday) bar, not a trading day - skipped.
SAME_PRICE_SHARE_NON_TRADING = 0.9
# Bounds the file as snapshots pile up (~1 year of trading days).
TRANSITION_MAX_DATES = 250

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


def stage_by_ticker(rows: list) -> dict:
    out = {}
    for r in rows:
        t = r.get("Ticker") or r.get("ticker")
        st = r.get("Stage")
        if t and st:
            out[t] = st
    return out


def trading_snapshots(snapshots: list) -> list:
    """[(date, rows)] without the holiday snapshots (most prices equal the
    previous kept snapshot's). Input must be in date order."""
    kept = []
    prev_close = None
    for d, rows in snapshots:
        closes = close_by_ticker(rows)
        if prev_close:
            common = [t for t in closes if t in prev_close]
            same = sum(1 for t in common if closes[t] == prev_close[t])
            if common and same >= SAME_PRICE_SHARE_NON_TRADING * len(common):
                continue
        kept.append((d, rows))
        prev_close = closes
    return kept


def build_transitions(snapshots: list) -> tuple[list, list]:
    """snapshots: [(date, rows)] trading days only, in date order.

    Returns (dates, tickers) where each ticker is
        {"ticker", "runs": [[stage, startDate, endDate], ...], "closeByDate"}
    A run is a stretch of the same stage; a day the ticker is missing from the
    scan does not end its run (the next run starts on the next day it is seen
    with another stage). closeByDate holds the close on each run's first day
    plus the ticker's last day.
    """
    dates = [d for d, _ in snapshots]
    runs: dict[str, list] = {}
    closes: dict[str, dict] = {}
    last_close: dict[str, tuple] = {}
    for d, rows in snapshots:
        close = close_by_ticker(rows)
        for ticker, stage in stage_by_ticker(rows).items():
            tr = runs.setdefault(ticker, [])
            if tr and tr[-1][0] == stage:
                tr[-1][2] = d
            else:
                tr.append([stage, d, d])
                if ticker in close:
                    closes.setdefault(ticker, {})[d] = close[ticker]
            if ticker in close:
                last_close[ticker] = (d, close[ticker])
    tickers = []
    for ticker, tr in runs.items():
        cbd = closes.get(ticker, {})
        if ticker in last_close:
            d, c = last_close[ticker]
            cbd[d] = c
        tickers.append({"ticker": ticker, "runs": tr, "closeByDate": dict(sorted(cbd.items()))})
    tickers.sort(key=lambda t: t["ticker"])
    return dates, tickers


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

    for key, fname in TRANSITION_SCANNERS.items():
        snaps = []
        for d in all_dates:
            data = load_json(os.path.join(hist_dir, d, f"{fname}.json"))
            rows = rows_of(data)
            if rows:
                snaps.append((d, rows))
        snaps = trading_snapshots(snaps)[-TRANSITION_MAX_DATES:]
        dates, tickers = build_transitions(snaps)
        out = {
            "generatedAt": generated_at,
            "scan": key,
            "dates": dates,
            "tickers": tickers,
        }
        out_file = os.path.join(scans_dir, f"{fname}_transitions.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {key}: {len(tickers)} tickers over {len(dates)} days -> {out_file}")


if __name__ == "__main__":
    main()
