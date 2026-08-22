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
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

from scan_calendar import valid_dates

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
    """Returns a sorted list of (date_str, close_float, volume_float, high_float, low_float)
    for one ticker from Yahoo Finance Chart API, or [] if missing."""
    sym = f"{ticker}.BK"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval=1d&range=3mo"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.load(resp)
            result = data.get("chart", {}).get("result", [])
            if not result:
                return []
            res = result[0]
            timestamps = res.get("timestamp", [])
            quote = res.get("indicators", {}).get("quote", [{}])[0]
            closes = quote.get("close", [])
            volumes = quote.get("volume", [])
            highs = quote.get("high", [])
            lows = quote.get("low", [])
            meta = res.get("meta", {})
            gmtoffset = meta.get("gmtoffset", 25200)
            tz = timezone(timedelta(seconds=gmtoffset))

            out = []
            for i, ts in enumerate(timestamps):
                if ts is None:
                    continue
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                v = volumes[i] if i < len(volumes) and volumes[i] is not None else 0.0
                h = highs[i] if i < len(highs) and highs[i] is not None else None
                l = lows[i] if i < len(lows) and lows[i] is not None else None
                dt = datetime.fromtimestamp(ts, tz=tz)
                date_str = dt.strftime("%Y-%m-%d")
                out.append((
                    date_str,
                    float(c),
                    float(v),
                    float(h) if h is not None else None,
                    float(l) if l is not None else None,
                ))

            out.sort(key=lambda x: x[0])
            time.sleep(0.05)
            return out
        except Exception:
            time.sleep(0.3)
    return []


def load_set_index_series():
    """Returns a sorted list of (date_str, close_float, volume, high, low) for the SET Index."""
    breadth = load_json(os.path.join(SCANS_DIR, "breadth.json"))
    if not breadth or "set_index" not in breadth:
        return []
    rows = breadth["set_index"]
    if isinstance(rows, dict):
        rows = list(rows.values())
    out = [
        (r["date"], float(r["close"]), 1.0, float(r["close"]), float(r["close"]))
        for r in rows
        if r.get("date") and r.get("close") is not None
    ]
    out.sort(key=lambda x: x[0])
    return out


def build_date_index(series):
    """date_str -> row index, for O(1) lookups into a sorted series list."""
    return {row[0]: i for i, row in enumerate(series)}


OUTLIER_RETURN_THRESHOLD_PCT = 40.0


def _has_volume_halt(series, entry_idx: int, exit_idx: int) -> bool:
    """True if any day in [entry_idx, exit_idx] (inclusive) has zero/missing volume."""
    for i in range(entry_idx, exit_idx + 1):
        vol = series[i][2]
        if vol is None or vol <= 0:
            return True
    return False


def forward_return(series, date_index, signal_date: str, horizon: int):
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


def compute_setups(hitDates, series):
    if not hitDates or not series:
        return []
    date_to_idx = {s[0]: i for i, s in enumerate(series)}
    GAP = 5  # gap >= 5 trading days = แตก setup

    # 1. แบ่ง setup
    setups_dates = []
    cur = [hitDates[0]]
    for prev, curr in zip(hitDates, hitDates[1:]):
        pi = date_to_idx.get(prev)
        ci = date_to_idx.get(curr)
        gap = 99 if (pi is None or ci is None) else (ci - pi - 1)
        if gap >= GAP:
            setups_dates.append(cur)
            cur = [curr]
        else:
            cur.append(curr)
    setups_dates.append(cur)

    # 2. คำนวณต่อ setup
    out = []
    for s in setups_dates:
        first_hit, last_hit = s[0], s[-1]
        fi = date_to_idx.get(first_hit)
        if fi is None or fi + 1 >= len(series):
            continue  # ไม่มี D+1
        entry_i = fi + 1
        entry_d, entry_p = series[entry_i][0], series[entry_i][1]
        if entry_p is None or entry_p <= 0 or not math.isfinite(entry_p):
            continue
        li = date_to_idx.get(last_hit)
        is_open = (last_hit == hitDates[-1] and last_hit == series[-1][0])
        if is_open:
            exit_i = len(series) - 1
            status = "open"
        else:
            exit_i = li + 1 if (li is not None and li + 1 < len(series)) else li
            status = "closed"
        if exit_i is None or exit_i >= len(series):
            continue
        exit_d, exit_p = series[exit_i][0], series[exit_i][1]
        if exit_p is None or not math.isfinite(exit_p):
            continue

        ret_pct = (exit_p / entry_p - 1.0) * 100.0
        if not math.isfinite(ret_pct):
            continue

        seg = series[entry_i : exit_i + 1]
        highs = [x[3] for x in seg if len(x) > 3 and x[3] is not None and math.isfinite(x[3])]
        lows = [x[4] for x in seg if len(x) > 4 and x[4] is not None and math.isfinite(x[4])]

        mfe = (max(highs) / entry_p - 1.0) * 100.0 if highs else None
        mae = (min(lows) / entry_p - 1.0) * 100.0 if lows else None
        if mfe is not None and not math.isfinite(mfe):
            mfe = None
        if mae is not None and not math.isfinite(mae):
            mae = None

        closes_seg = [x[1] for x in seg if len(x) > 1 and x[1] is not None and math.isfinite(x[1])]
        if len(closes_seg) >= 2:
            N = 10
            if len(closes_seg) <= N:
                sampled = closes_seg
            else:
                idxs = [round(i * (len(closes_seg) - 1) / (N - 1)) for i in range(N)]
                sampled = [closes_seg[i] for i in idxs]
            lo, hi = min(sampled), max(sampled)
            rng = hi - lo
            path = [round((c - lo) / rng * 100.0, 1) if rng > 0 else 50.0 for c in sampled]
        else:
            path = []

        out.append({
            "entry_date": entry_d,
            "entry_price": round(entry_p, 2),
            "exit_date": exit_d,
            "exit_price": round(exit_p, 2),
            "holding_days": exit_i - entry_i,
            "return_pct": round(ret_pct, 2),
            "mfe_pct": round(mfe, 2) if mfe is not None else None,
            "mae_pct": round(mae, 2) if mae is not None else None,
            "price_path": path,
            "status": status,
        })
    return out


def summarize_setups(all_setups):
    closed = [s for s in all_setups if s.get("status") == "closed"]
    n_closed = len(closed)
    n_open = sum(1 for s in all_setups if s.get("status") == "open")

    if n_closed == 0:
        return {
            "n_closed": 0,
            "n_open": n_open,
            "avg_return_pct": None,
            "win_rate_pct": None,
            "avg_holding_days": None,
            "avg_mfe_pct": None,
            "avg_mae_pct": None,
        }

    returns = [s["return_pct"] for s in closed if s.get("return_pct") is not None and math.isfinite(s["return_pct"])]
    wins = sum(1 for r in returns if r > 0)
    avg_return = sum(returns) / len(returns) if returns else None
    win_rate = (wins / len(returns) * 100.0) if returns else None

    holds = [s["holding_days"] for s in closed if s.get("holding_days") is not None and math.isfinite(s["holding_days"])]
    avg_holding = (sum(holds) / len(holds)) if holds else None

    mfes = [s["mfe_pct"] for s in closed if s.get("mfe_pct") is not None and math.isfinite(s["mfe_pct"])]
    avg_mfe = (sum(mfes) / len(mfes)) if mfes else None

    maes = [s["mae_pct"] for s in closed if s.get("mae_pct") is not None and math.isfinite(s["mae_pct"])]
    avg_mae = (sum(maes) / len(maes)) if maes else None

    return {
        "n_closed": n_closed,
        "n_open": n_open,
        "avg_return_pct": round(avg_return, 2) if avg_return is not None and math.isfinite(avg_return) else None,
        "win_rate_pct": round(win_rate, 2) if win_rate is not None and math.isfinite(win_rate) else None,
        "avg_holding_days": round(avg_holding, 1) if avg_holding is not None and math.isfinite(avg_holding) else None,
        "avg_mfe_pct": round(avg_mfe, 2) if avg_mfe is not None and math.isfinite(avg_mfe) else None,
        "avg_mae_pct": round(avg_mae, 2) if avg_mae is not None and math.isfinite(avg_mae) else None,
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
    fetched_ok = 0
    fetched_fail = 0

    def get_price_series(ticker):
        nonlocal fetched_ok, fetched_fail
        if ticker not in price_cache:
            series = load_ticker_prices(ticker)
            if series:
                fetched_ok += 1
            else:
                fetched_fail += 1
            price_cache[ticker] = (series, build_date_index(series))
        return price_cache[ticker]

    result_scans = {}
    total_missing_price_file = 0
    total_excluded_outliers = 0

    for scan_key, fname in SCANNERS.items():
        # เดินเฉพาะ "วันที่สแกนตัวนี้ได้ผลออกมาจริง" (ไฟล์มีอยู่ ต่อให้ข้างในเป็น [])
        # วันที่ pipeline ขาดจะอ่านได้เป็นลิสต์ว่าง ทำให้ first_appearances เห็นหุ้น
        # ที่ถืออยู่แล้วเป็น "pick ใหม่" ในวันถัดมา -> total_picks บวมและสถิติ D+5/10/20
        # นับ position เดิมซ้ำอีกรอบจากวันที่ผิด
        vdates = valid_dates(HIST_DIR, fname, dates)
        date_sets = {}
        for d in vdates:
            date_sets[d] = tickers_of(load_json(os.path.join(HIST_DIR, d, f"{fname}.json")))

        entries = first_appearances(vdates, date_sets)
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

        # Compute setup-based history for this scan
        scan_setups = []
        hist_file = os.path.join(SCANS_DIR, f"{fname}_history.json")
        hist_data = load_json(hist_file)

        if hist_data and "tickers" in hist_data and isinstance(hist_data["tickers"], list):
            ticker_hits = [(rec.get("ticker"), rec.get("hitDates", [])) for rec in hist_data["tickers"] if rec.get("ticker")]
        else:
            all_scan_tickers = sorted(set(t for d_set in date_sets.values() for t in d_set))
            ticker_hits = [(t, sorted(d for d in vdates if t in date_sets[d])) for t in all_scan_tickers]

        for ticker, hit_dates in ticker_hits:
            if not ticker or not hit_dates:
                continue
            series, _ = get_price_series(ticker)
            if not series:
                continue
            t_setups = compute_setups(hit_dates, series)
            for st in t_setups:
                scan_setups.append({"ticker": ticker, **st})

        scan_setups.sort(key=lambda s: (s["entry_date"], s["ticker"]))

        result_scans[scan_key] = {
            "total_picks": len(entries),
            "horizons": {str(h): summarize_horizon(horizon_rows[h]) for h in HORIZONS},
            "setups": scan_setups,
            "setup_summary": summarize_setups(scan_setups),
        }
        n5 = result_scans[scan_key]["horizons"]["5"]["n"]
        n_closed = result_scans[scan_key]["setup_summary"]["n_closed"]
        n_open = result_scans[scan_key]["setup_summary"]["n_open"]
        print(f"  {scan_key}: {len(entries)} unique entries, D+5 computable for {n5}, setups: {n_closed} closed, {n_open} open")

    print(f"[report-card] Price fetch summary: {fetched_ok} succeeded, {fetched_fail} failed out of {len(price_cache)} unique tickers")
    if total_missing_price_file:
        print(f"[report-card] {total_missing_price_file} (ticker, entry) pairs skipped - no price data fetched")
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

    total_computable_n = sum(
        result_scans[s]["horizons"][str(h)]["n"]
        for s in result_scans
        for h in HORIZONS
    )
    if total_computable_n == 0:
        print(
            f"[report-card] ERROR: Total computable n is 0 across all scans. "
            f"Price data missing or unreadable from Yahoo API. "
            f"Aborting without overwriting {OUT_FILE}."
        )
        sys.exit(1)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[report-card] Saved: {OUT_FILE}")


if __name__ == "__main__":
    main()

