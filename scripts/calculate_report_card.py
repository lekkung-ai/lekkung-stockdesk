"""
calculate_report_card.py — historical forward-return performance per scan.

For each scan (sepa / kell / breakout / lekkung_growth / ppbp), walks every
daily snapshot under data/history/<date>/ and, for each ticker's FIRST
appearance of a run (consecutive re-appearances don't count as new entries),
computes forward return at D+5 / D+10 / D+20 trading days — entry price is
the Close on D+1 (the day after the signal, since scans run after market
close and D+1 is the earliest realistic fill), and horizons are measured
from D (not from the entry day) per the exact assumption baked into the
output JSON.

Data sources:
  - Pick lists:    data/history/<date>/{sepa,oliver_kell,breakout,lekkung,ppbp}.json
  - Price history: data_engine's data/history/<TICKER>.csv (Date-indexed OHLCV,
                    ~3 years back — a completely different "history" dir than
                    the one above, despite the same name; lives in the sibling
                    data_engine repo, not stockdesk)
  - SET Index:      data/scans/breadth.json -> set_index (already fetched by
                    calculate_breadth.py, reused here instead of a second
                    yfinance call)

Output: data/scans/report_card.json

Run AFTER the daily snapshot step (so today's picks are included) and after
compute_scan_days.py. Non-fatal on missing data — always produces valid JSON,
degrading gracefully (n=0 for horizons that don't have enough forward data yet).

Usage:
    python -X utf8 calculate_report_card.py
"""

import csv
import json
import os
import sys
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STOCKDESK_DIR = os.path.dirname(SCRIPT_DIR)
HIST_DIR = os.path.join(STOCKDESK_DIR, "data", "history")
SCANS_DIR = os.path.join(STOCKDESK_DIR, "data", "scans")
OUT_FILE = os.path.join(SCANS_DIR, "report_card.json")

# data_engine lives as a sibling repo, not inside stockdesk — same layout
# update_stockdesk.bat already assumes (DATA_ENGINE_DIR). Overridable via
# env var so this still works if the sibling layout ever changes.
DATA_ENGINE_HISTORY_DIR = os.environ.get(
    "DATA_ENGINE_HISTORY_DIR",
    os.path.normpath(os.path.join(STOCKDESK_DIR, "..", "..", "..", "Stock Agent", "data_engine", "data", "history")),
)

HORIZONS = [5, 10, 20]

# report-card key -> history/scan filename (without .json)
SCANNERS = {
    "sepa": "sepa",
    "kell": "oliver_kell",
    "breakout": "breakout",
    "lekkung_growth": "lekkung",
    "ppbp": "ppbp",
    "oneil": "oneil",
}


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def tickers_of(data) -> set:
    if data is None:
        return set()
    rows = data if isinstance(data, list) else data.get("data", [])
    out = set()
    for r in rows:
        t = r.get("Ticker") or r.get("ticker")
        if t:
            out.add(t)
    return out


def load_ticker_prices(ticker: str):
    """Returns a sorted list of (date_str, close_float, volume_float_or_None) for
    one ticker, or [] if missing. Volume is carried alongside Close so
    forward_return() can detect a trading halt (0 volume) inside the window -
    a stock frozen at a stale Close during a suspension isn't tradeable at
    that price, so a huge return spanning a halt is a data-quality issue, not
    a real, actionable outcome."""
    path = os.path.join(DATA_ENGINE_HISTORY_DIR, f"{ticker}.csv")
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        # first column has no header (pandas index) - DictReader keys it as None or ''
        date_key = reader.fieldnames[0]
        for row in reader:
            date_str = row.get(date_key)
            close_raw = row.get("Close")
            if not date_str or not close_raw:
                continue
            try:
                close = float(close_raw)
            except ValueError:
                continue
            volume_raw = row.get("Volume")
            try:
                volume = float(volume_raw) if volume_raw not in (None, "") else None
            except ValueError:
                volume = None
            out.append((date_str, close, volume))
    out.sort(key=lambda x: x[0])
    return out


def load_set_index_series():
    """Returns a sorted list of (date_str, close_float, volume) for the SET
    Index, from breadth.json. Volume is a constant non-zero placeholder (the
    index itself is never "halted") purely so this series has the same
    3-tuple shape forward_return() expects for both stock and benchmark
    series."""
    breadth = load_json(os.path.join(SCANS_DIR, "breadth.json"))
    if not breadth or "set_index" not in breadth:
        return []
    rows = breadth["set_index"]
    if isinstance(rows, dict):
        rows = list(rows.values())
    out = [(r["date"], float(r["close"]), 1.0) for r in rows if r.get("date") and r.get("close") is not None]
    out.sort(key=lambda x: x[0])
    return out


def build_date_index(series):
    """date_str -> row index, for O(1) lookups into a sorted (date, close, volume) list."""
    return {row[0]: i for i, row in enumerate(series)}


OUTLIER_RETURN_THRESHOLD_PCT = 40.0


def _has_volume_halt(series, entry_idx: int, exit_idx: int) -> bool:
    """True if any day in [entry_idx, exit_idx] (inclusive) has zero/missing
    volume - the signature of a trading halt/suspension. A stock frozen at a
    stale Close while suspended isn't tradeable at that price, so a Close-to-
    Close return spanning a halt doesn't reflect a real, actionable outcome
    (confirmed against real data: INGRS's reported -61% D+5 return was two
    weeks of zero-volume suspension followed by the market's first real
    repricing on resumption, not a stock anyone could have bought or sold at
    the "entry" price used here)."""
    for i in range(entry_idx, exit_idx + 1):
        vol = series[i][2]
        if vol is None or vol <= 0:
            return True
    return False


def forward_return(series, date_index, signal_date: str, horizon: int):
    """
    Entry = close at D+1 (row after signal_date). Exit = close at D+horizon
    (measured from signal_date, per the stated assumption). Returns
    (return_pct, is_outlier) - return_pct is None if the signal date isn't in
    the series, or D+1 / D+horizon fall past the end of available price
    history (not enough forward data yet). is_outlier is True when the return
    exceeds +/-40% AND the window contains a volume-halt signature - the
    caller drops these from the stats (they're a data-quality artifact, not a
    real tradeable outcome) rather than folding an unreachable price into
    "average return".
    """
    if signal_date not in date_index:
        return None, False
    d_idx = date_index[signal_date]
    entry_idx = d_idx + 1
    exit_idx = d_idx + horizon
    if exit_idx >= len(series) or entry_idx >= len(series):
        return None, False
    entry_price = series[entry_idx][1]
    exit_price = series[exit_idx][1]
    if entry_price <= 0:
        return None, False
    ret = (exit_price / entry_price - 1.0) * 100.0
    is_outlier = abs(ret) > OUTLIER_RETURN_THRESHOLD_PCT and _has_volume_halt(series, entry_idx, exit_idx)
    return ret, is_outlier


def first_appearances(dates, date_sets):
    """
    dates: sorted list of history date strings.
    date_sets: {date: set(tickers)}.
    Returns [(ticker, entry_date), ...] — one entry per NEW streak start
    (a ticker present on consecutive dates counts once, on the first date).
    """
    entries = []
    prev_set = set()
    for d in dates:
        cur_set = date_sets.get(d, set())
        for ticker in cur_set:
            if ticker not in prev_set:
                entries.append((ticker, d))
        prev_set = cur_set
    return entries


def summarize_horizon(rows):
    """rows: list of {ticker, entry_date, return_pct, set_return_pct}. Returns metrics dict."""
    n = len(rows)
    if n == 0:
        return {
            "n": 0, "avg_return_pct": None, "median_return_pct": None,
            "win_rate_pct": None, "avg_set_return_pct": None, "excess_return_pct": None,
            "best5": [], "worst5": [],
        }
    returns = sorted(r["return_pct"] for r in rows)
    mid = n // 2
    median = returns[mid] if n % 2 == 1 else (returns[mid - 1] + returns[mid]) / 2
    avg = sum(returns) / n
    wins = sum(1 for r in returns if r > 0)
    set_returns = [r["set_return_pct"] for r in rows if r["set_return_pct"] is not None]
    avg_set = sum(set_returns) / len(set_returns) if set_returns else None
    ranked = sorted(rows, key=lambda r: r["return_pct"])
    worst5 = [{"ticker": r["ticker"], "entry_date": r["entry_date"], "return_pct": round(r["return_pct"], 2)} for r in ranked[:5]]
    best5 = [{"ticker": r["ticker"], "entry_date": r["entry_date"], "return_pct": round(r["return_pct"], 2)} for r in ranked[-5:][::-1]]
    return {
        "n": n,
        "avg_return_pct": round(avg, 2),
        "median_return_pct": round(median, 2),
        "win_rate_pct": round(wins / n * 100, 2),
        "avg_set_return_pct": round(avg_set, 2) if avg_set is not None else None,
        "excess_return_pct": round(avg - avg_set, 2) if avg_set is not None else None,
        "best5": best5,
        "worst5": worst5,
    }


def main():
    dates = sorted(
        d for d in os.listdir(HIST_DIR)
        if os.path.isdir(os.path.join(HIST_DIR, d)) and d[0].isdigit()
    )
    if not dates:
        print("[report-card] No history dates found - nothing to compute.")
        json.dump({"generated_at": None, "scans": {}}, open(OUT_FILE, "w", encoding="utf-8"))
        return

    print(f"[report-card] History dates available: {len(dates)} ({dates[0]}..{dates[-1]})")

    set_series = load_set_index_series()
    set_index = build_date_index(set_series)
    if not set_series:
        print("[report-card] WARNING: no SET Index series found in breadth.json - excess return will be null.")

    price_cache = {}  # ticker -> (series, date_index), loaded lazily

    def get_price_series(ticker):
        if ticker not in price_cache:
            series = load_ticker_prices(ticker)
            price_cache[ticker] = (series, build_date_index(series))
        return price_cache[ticker]

    result_scans = {}
    total_missing_price_file = 0
    total_excluded_outliers = 0

    for scan_key, fname in SCANNERS.items():
        date_sets = {}
        for d in dates:
            date_sets[d] = tickers_of(load_json(os.path.join(HIST_DIR, d, f"{fname}.json")))

        entries = first_appearances(dates, date_sets)
        horizon_rows = {h: [] for h in HORIZONS}

        for ticker, entry_date in entries:
            series, tdate_index = get_price_series(ticker)
            if not series:
                total_missing_price_file += 1
                continue
            for h in HORIZONS:
                ret, is_outlier = forward_return(series, tdate_index, entry_date, h)
                if ret is None:
                    continue
                if is_outlier:
                    total_excluded_outliers += 1
                    continue
                set_ret, _ = forward_return(set_series, set_index, entry_date, h) if set_series else (None, False)
                horizon_rows[h].append({
                    "ticker": ticker, "entry_date": entry_date,
                    "return_pct": ret, "set_return_pct": set_ret,
                })

        result_scans[scan_key] = {
            "total_picks": len(entries),
            "horizons": {str(h): summarize_horizon(horizon_rows[h]) for h in HORIZONS},
        }
        n5 = result_scans[scan_key]["horizons"]["5"]["n"]
        print(f"  {scan_key}: {len(entries)} unique entries, D+5 computable for {n5}")

    if total_missing_price_file:
        print(f"[report-card] {total_missing_price_file} (ticker, entry) pairs skipped - no price CSV found "
              f"in {DATA_ENGINE_HISTORY_DIR}")
    if total_excluded_outliers:
        print(f"[report-card] {total_excluded_outliers} (ticker, horizon) pair(s) excluded as trading-halt outliers "
              f"(|return| > {OUTLIER_RETURN_THRESHOLD_PCT:.0f}% with a zero-volume day in the window)")

    now = datetime.now(timezone(timedelta(hours=7))).isoformat()
    output = {
        "generated_at": now,
        "assumptions": {
            "entry_price": "ราคาเข้าซื้อ = ราคาปิดของวันทำการถัดไปหลังวันที่ scan ขึ้นสัญญาณ (scan รันหลังตลาดปิด วันถัดไปคือวันแรกที่ซื้อได้จริง)",
            "horizons_measured_from": "นับระยะเวลาจากวันที่ scan ขึ้นสัญญาณ ไม่ใช่จากวันที่เข้าซื้อ เช่น ผลตอบแทน D+5 คือ ราคาปิด(D+5) หาร ราคาปิด(D+1) ลบ 1",
            "dedup": "หุ้นที่ติด scan ต่อเนื่องหลายวัน นับเป็น 1 ครั้งจากวันแรกที่ติดเท่านั้น ไม่นับซ้ำทุกวันที่ยังอยู่ในลิสต์",
            "excess_return": "ผลตอบแทนเฉลี่ยของ scan ลบผลตอบแทนดัชนี SET ในช่วงเวลาเดียวกัน (D+1 ถึง D+N)",
            "horizons_excluded_if_incomplete": "คู่ (หุ้น, ช่วงเวลา) จะถูกตัดออกจากสถิติของช่วงนั้น ถ้ายังไม่มีข้อมูลราคาย้อนหลังพอจะไปถึง D+N",
            "outlier_guard": (
                f"รายการที่ผลตอบแทนเกิน ±{OUTLIER_RETURN_THRESHOLD_PCT:.0f}% และในช่วงเวลานั้นหุ้นมีวันที่ไม่มีการซื้อขายเลย "
                "(หยุดพักการซื้อขาย/ขึ้นเครื่องหมายห้ามซื้อขาย) ถูกตัดออกจากสถิติ เพราะราคาที่ใช้คำนวณไม่ใช่ราคาที่ซื้อขายได้จริง — "
                f"ตัดรายการผิดปกติ {total_excluded_outliers} รายการ"
            ),
        },
        "history_range": {"first_date": dates[0], "last_date": dates[-1], "n_dates": len(dates)},
        "scans": result_scans,
    }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[report-card] Saved: {OUT_FILE}")


if __name__ == "__main__":
    main()
