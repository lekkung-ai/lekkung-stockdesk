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

Price window: Yahoo period1/period2 from PRICE_LOOKBACK_BUFFER_DAYS before the
earliest signal date of any scan up to today, so every signal has a D row
(a fixed range=3mo silently dropped every signal older than ~3 months).

Trading calendar: Yahoo returns rows for Thai holidays (e.g. 2026-07-28/29,
2026-08-12) with Volume 0 and the previous Close. Counting them as trading days
shifts D+N and produces fake 0% returns. A date is a trading day only when at
least TRADING_DAY_MIN_ACTIVE_SHARE of tickers with a row that day have
Volume > 0; other dates are removed from every series (and the SET series)
before any D+N lookup.

Output: data/scans/report_card.json

Run AFTER the daily snapshot step (so today's picks are included) and after
compute_scan_days.py. Non-fatal on missing data — always produces valid JSON,
degrading gracefully (n=0 for horizons that don't have enough forward data yet).

Usage:
    python -X utf8 calculate_report_card.py
    python -X utf8 calculate_report_card.py --out <scratch>/report_card.json   # testing
"""

import argparse
import bisect
import csv
import json
import math
import os
import random
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone, timedelta

from scan_calendar import valid_dates
from scan_setups import SETUP_GAP_DAYS, history_dates, scan_calendar, split_setups

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

# Price window starts this many calendar days before the earliest signal, so
# the signal day D itself is always inside the fetched series.
PRICE_LOOKBACK_BUFFER_DAYS = 14

# A date is a trading day when >= this share of tickers with a row that day
# traded (Volume > 0). Holiday rows from Yahoo have Volume 0 for everyone.
TRADING_DAY_MIN_ACTIVE_SHARE = 0.5

# |return| below this counts as flat (r == 0), guarding float noise.
FLAT_EPS = 1e-9

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


def load_ticker_prices(ticker: str, start_date: str):
    """Returns a sorted list of (date_str, close_float, volume_float, high_float, low_float)
    for one ticker from Yahoo Finance Chart API, from start_date (YYYY-MM-DD) to now, or [] if missing."""
    sym = f"{ticker}.BK"
    period1 = int(datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    period2 = int(time.time()) + 86400
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}"
           f"?interval=1d&period1={period1}&period2={period2}")
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

            # One row per date (Yahoo can append a live duplicate of the last day); keep the latest.
            out = list({row[0]: row for row in out}.values())
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


def non_trading_dates(price_map) -> set:
    """Dates that are not SET trading days, inferred from the fetched prices.

    price_map: ticker -> series of (date_str, close, volume, ...).
    A date is a trading day when at least TRADING_DAY_MIN_ACTIVE_SHARE of the
    tickers that have a row on that date have Volume > 0. Returns the other dates.
    """
    rows = {}
    active = {}
    for series in price_map.values():
        for row in series:
            d = row[0]
            rows[d] = rows.get(d, 0) + 1
            vol = row[2]
            if vol is not None and vol > 0:
                active[d] = active.get(d, 0) + 1
    return {d for d, n in rows.items() if active.get(d, 0) < TRADING_DAY_MIN_ACTIVE_SHARE * n}


def drop_dates(series, dates: set):
    """series without the rows whose date is in `dates`."""
    return [row for row in series if row[0] not in dates]


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


def win_flat_loss(returns):
    """(n_win, n_flat, n_loss) — flat means |r| < FLAT_EPS."""
    n_flat = sum(1 for r in returns if abs(r) < FLAT_EPS)
    n_win = sum(1 for r in returns if r >= FLAT_EPS)
    return n_win, n_flat, len(returns) - n_win - n_flat


def summarize_horizon(rows):
    n = len(rows)
    if n == 0:
        return {
            "n": 0, "avg_return_pct": None, "median_return_pct": None,
            "win_rate_pct": None, "avg_set_return_pct": None, "excess_return_pct": None,
            "n_win": 0, "n_flat": 0, "n_loss": 0, "flat_pct": None,
            "best5": [], "worst5": [],
        }
    returns = sorted(r["return_pct"] for r in rows)
    mid = n // 2
    median = returns[mid] if n % 2 == 1 else (returns[mid - 1] + returns[mid]) / 2
    avg = sum(returns) / n
    wins, flats, losses = win_flat_loss(returns)
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
        "n_win": wins,
        "n_flat": flats,
        "n_loss": losses,
        "flat_pct": round(flats / n * 100, 2),
        "best5": best5,
        "worst5": worst5,
    }


def _idx_on_or_before(dates, day):
    """Index of the last series date <= day, or None."""
    i = bisect.bisect_right(dates, day) - 1
    return i if i >= 0 else None


def _mfe_mae(series, entry_i, exit_i, entry_p):
    """Best high / worst low from the day AFTER entry to the exit day, vs the entry
    close. The entry day's own high/low are not counted (the fill is at its close).
    Held 0 days -> (0.0, 0.0)."""
    if exit_i <= entry_i:
        return 0.0, 0.0
    seg = series[entry_i + 1 : exit_i + 1]
    highs = [x[3] for x in seg if len(x) > 3 and x[3] is not None and math.isfinite(x[3])]
    lows = [x[4] for x in seg if len(x) > 4 and x[4] is not None and math.isfinite(x[4])]
    mfe = (max(highs) / entry_p - 1.0) * 100.0 if highs else None
    mae = (min(lows) / entry_p - 1.0) * 100.0 if lows else None
    if mfe is not None and not math.isfinite(mfe):
        mfe = None
    if mae is not None and not math.isfinite(mae):
        mae = None
    return mfe, mae


def compute_setups(hitDates, series, valid_scan_dates=None):
    """Setups of one ticker, split by scan_setups.split_setups (the shared rule:
    a setup ends after SETUP_GAP_DAYS scan days out in a row; out 1-4 days it is
    still open, with days_out = N).

    valid_scan_dates: the scan's calendar (days the scan produced a file, minus
    non-trading days). None -> every price date counts as a scan day.

    Prices: entry = close of the day after the setup's first hit.
      exit_price (ก, main)         = close of the day after the last hit
      exit_price_confirmed (ข)     = close on the day the 5th out day is reached
      open setups (incl. out 1-4)  = latest close for both (an estimate)
    """
    if not hitDates or not series:
        return []
    date_to_idx = {s[0]: i for i, s in enumerate(series)}
    sdates = [s[0] for s in series]
    calendar = sorted(valid_scan_dates) if valid_scan_dates is not None else sdates

    out = []
    for st in split_setups(hitDates, calendar):
        fi = date_to_idx.get(st["start"])
        if fi is None or fi + 1 >= len(series):
            continue  # ไม่มี D+1
        entry_i = fi + 1
        entry_d, entry_p = series[entry_i][0], series[entry_i][1]
        if entry_p is None or entry_p <= 0 or not math.isfinite(entry_p):
            continue
        closed = st["status"] == "closed"
        if closed:
            li = _idx_on_or_before(sdates, st["last_hit"])
            exit_i = li + 1 if (li is not None and li + 1 < len(series)) else li
            conf_i = _idx_on_or_before(sdates, st["closed_on"])
        else:
            exit_i = conf_i = len(series) - 1
        if exit_i is None or conf_i is None:
            continue
        exit_i = max(exit_i, entry_i)
        conf_i = max(conf_i, entry_i)
        exit_d, exit_p = series[exit_i][0], series[exit_i][1]
        conf_d, conf_p = series[conf_i][0], series[conf_i][1]
        if exit_p is None or not math.isfinite(exit_p) or conf_p is None or not math.isfinite(conf_p):
            continue

        ret_pct = (exit_p / entry_p - 1.0) * 100.0
        ret_conf = (conf_p / entry_p - 1.0) * 100.0
        if not math.isfinite(ret_pct) or not math.isfinite(ret_conf):
            continue

        mfe, mae = _mfe_mae(series, entry_i, exit_i, entry_p)
        mfe_c, mae_c = _mfe_mae(series, entry_i, conf_i, entry_p)

        seg = series[entry_i : exit_i + 1]
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
            "status": "closed" if closed else "open",
            "days_out": st["days_out"],
            "setup_seq": st["seq"],
            "first_hit": st["start"],
            "last_hit": st["last_hit"],
            "exit_date_confirmed": conf_d,
            "exit_price_confirmed": round(conf_p, 2),
            "holding_days_confirmed": conf_i - entry_i,
            "return_pct_confirmed": round(ret_conf, 2),
            "mfe_pct_confirmed": round(mfe_c, 2) if mfe_c is not None else None,
            "mae_pct_confirmed": round(mae_c, 2) if mae_c is not None else None,
        })
    return out


def confirmed_view(setups):
    """The same setups with the (ข) exit (5th out day) swapped into the main
    fields, so summarize_setups / setup_extras can build the (ข) summary."""
    out = []
    for s in setups:
        c = dict(s)
        for k in ("return_pct", "holding_days", "mfe_pct", "mae_pct", "exit_date", "exit_price"):
            if f"{k}_confirmed" in s:
                c[k] = s[f"{k}_confirmed"]
        out.append(c)
    return out


def summarize_setups(all_setups):
    closed = [s for s in all_setups if s.get("status") == "closed"]
    n_closed = len(closed)
    n_open = sum(1 for s in all_setups if s.get("status") == "open")
    n_pending = sum(1 for s in all_setups if s.get("status") == "open" and (s.get("days_out") or 0) >= 1)

    if n_closed == 0:
        return {
            "n_closed": 0,
            "n_open": n_open,
            "n_pending": n_pending,
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
        "n_pending": n_pending,
        "avg_return_pct": round(avg_return, 2) if avg_return is not None and math.isfinite(avg_return) else None,
        "win_rate_pct": round(win_rate, 2) if win_rate is not None and math.isfinite(win_rate) else None,
        "avg_holding_days": round(avg_holding, 1) if avg_holding is not None and math.isfinite(avg_holding) else None,
        "avg_mfe_pct": round(avg_mfe, 2) if avg_mfe is not None and math.isfinite(avg_mfe) else None,
        "avg_mae_pct": round(avg_mae, 2) if avg_mae is not None and math.isfinite(avg_mae) else None,
    }


# ---------------------------------------------------------------------------
# Extra per-setup / per-scan fields (added on top of the numbers above — they
# never change how a setup is split, priced or summarised).
# ---------------------------------------------------------------------------

STAGE_FILE = os.path.join(SCANS_DIR, "market_stage_transitions.json")
STAGE_NO_DATA = "ไม่มีข้อมูล"
STAGE_ORDER = ["S.Bull", "Bull", "Accumulation", "Recovery", "Warning", "Distribution", "Bear", STAGE_NO_DATA]

# Return buckets for the distribution chart. Each entry: (label, test(r)).
# Every bucket includes its lower edge (−10 goes to "−10…−6", +2 to "2…4").
# Flat (|r| < FLAT_EPS) has its own bucket "0"; the buckets either side of it
# are strictly negative / strictly positive.
HIST_BUCKETS = [
    ("< −10", lambda r: r < -10),
    ("−10…−6", lambda r: -10 <= r < -6),
    ("−6…−4", lambda r: -6 <= r < -4),
    ("−4…−2", lambda r: -4 <= r < -2),
    ("−2…0", lambda r: -2 <= r <= -FLAT_EPS),
    ("0", lambda r: abs(r) < FLAT_EPS),
    ("0…2", lambda r: FLAT_EPS <= r < 2),
    ("2…4", lambda r: 2 <= r < 4),
    ("4…6", lambda r: 4 <= r < 6),
    ("6…10", lambda r: 6 <= r < 10),
    ("> 10", lambda r: r >= 10),
]
HIST_LABELS = [b[0] for b in HIST_BUCKETS]

GIVEBACK_MFE_PCT = 3.0     # "เคยกำไร +3% ขึ้นไป แต่ขายเท่าทุนหรือขาดทุน"
SCATTER_MAX_POINTS = 600
SCATTER_SEED = 20261105    # fixed -> same sample every run for the same setups


def load_stage_lookup(path=STAGE_FILE):
    """ticker -> [(stage, first_date, last_date), ...] from market_stage_transitions.json,
    or None when the file is missing/unreadable (the caller then writes stage = null)."""
    data = load_json(path)
    if not isinstance(data, dict) or not isinstance(data.get("tickers"), list):
        return None
    lookup = {}
    for rec in data["tickers"]:
        t = rec.get("ticker") if isinstance(rec, dict) else None
        runs = rec.get("runs") if t else None
        if not isinstance(runs, list):
            continue
        clean = [(r[0], r[1], r[2]) for r in runs if isinstance(r, (list, tuple)) and len(r) >= 3]
        if clean:
            lookup[t] = clean
    return lookup


def stage_on(lookup, ticker, day):
    """Stage of `ticker` on `day` = the run whose [first, last] contains that day.
    No run covers it (not tracked yet, gap, IPO/UNKNOWN label) -> STAGE_NO_DATA.
    lookup None (no stage file) -> None."""
    if lookup is None:
        return None
    for stage, first, last in lookup.get(ticker, ()):
        if first <= day <= last:
            return stage if stage in STAGE_ORDER else STAGE_NO_DATA
    return STAGE_NO_DATA


def exit_reason(setup):
    if setup.get("status") == "open":
        return "open"
    if setup.get("holding_days") == 0:
        return "single_day"
    return "left_scan"


def _finite(v):
    return v is not None and isinstance(v, (int, float)) and math.isfinite(v)


def _r2(v):
    return round(v, 2) if _finite(v) else None


def _mean(values):
    vals = [v for v in values if _finite(v)]
    if not vals:
        return None
    m = sum(vals) / len(vals)
    return m if math.isfinite(m) else None


def _median(values):
    vals = sorted(v for v in values if _finite(v))
    n = len(vals)
    if n == 0:
        return None
    mid = n // 2
    return vals[mid] if n % 2 == 1 else (vals[mid - 1] + vals[mid]) / 2


def _win_rate(returns):
    if not returns:
        return None
    wins, _, _ = win_flat_loss(returns)
    return wins / len(returns) * 100.0


def setup_extras(all_setups, stage_available=True):
    """New setup_summary fields, from the CLOSED setups only. Returned as a dict
    that is merged into summarize_setups()'s output (old keys are untouched)."""
    closed = [s for s in all_setups if s.get("status") == "closed" and _finite(s.get("return_pct"))]
    n = len(closed)
    returns = [s["return_pct"] for s in closed]
    n_win, n_flat, n_loss = win_flat_loss(returns)
    if n == 0:
        return {
            "n_win": 0, "n_flat": 0, "n_loss": 0, "n_single_day": 0,
            "median_return_pct": None, "avg_win_pct": None, "avg_loss_pct": None,
            "payoff_ratio": None, "giveback_n": 0, "giveback_mfe_pct": GIVEBACK_MFE_PCT,
            "hist": None, "hist_labels": HIST_LABELS, "by_stage": None, "monthly": None,
            "scatter": None, "scatter_sampled": False,
        }

    avg_win = _mean([r for r in returns if r >= FLAT_EPS])
    avg_loss = _mean([r for r in returns if r <= -FLAT_EPS])
    payoff = None
    if avg_win is not None and avg_loss is not None and abs(avg_loss) > 0:
        payoff = avg_win / abs(avg_loss)
        if not math.isfinite(payoff):
            payoff = None

    giveback = sum(
        1 for s in closed
        if _finite(s.get("mfe_pct")) and s["mfe_pct"] >= GIVEBACK_MFE_PCT and s["return_pct"] <= 0
    )

    hist = [0] * len(HIST_BUCKETS)
    for r in returns:
        for i, (_, test) in enumerate(HIST_BUCKETS):
            if test(r):
                hist[i] += 1
                break

    def group_stats(group):
        rets = [s["return_pct"] for s in group]
        return {
            "n": len(group),
            "avg_return_pct": _r2(_mean(rets)),
            "win_rate_pct": _r2(_win_rate(rets)),
        }

    by_stage = None
    if stage_available:
        groups = {}
        for s in closed:
            groups.setdefault(s.get("stage_at_entry") or STAGE_NO_DATA, []).append(s)
        by_stage = []
        for stage in STAGE_ORDER:
            g = groups.get(stage)
            if not g:
                continue
            row = {"stage": stage, **group_stats(g)}
            row["avg_mfe_pct"] = _r2(_mean([s.get("mfe_pct") for s in g]))
            by_stage.append(row)

    months = {}
    for s in closed:
        months.setdefault(s["entry_date"][:7], []).append(s)
    monthly = []
    for m in sorted(months):
        g = months[m]
        row = {"month": m, **group_stats(g)}
        total = sum(s["return_pct"] for s in g)
        row["sum_return_pct"] = _r2(total)
        # keep the key order month, n, avg, sum, win
        monthly.append({k: row[k] for k in ("month", "n", "avg_return_pct", "sum_return_pct", "win_rate_pct")})

    points = [[s["mfe_pct"], s["return_pct"]] for s in closed if _finite(s.get("mfe_pct"))]
    sampled = len(points) > SCATTER_MAX_POINTS
    if sampled:
        idx = sorted(random.Random(SCATTER_SEED).sample(range(len(points)), SCATTER_MAX_POINTS))
        points = [points[i] for i in idx]

    return {
        "n_win": n_win,
        "n_flat": n_flat,
        "n_loss": n_loss,
        "n_single_day": sum(1 for s in closed if s.get("holding_days") == 0),
        "median_return_pct": _r2(_median(returns)),
        "avg_win_pct": _r2(avg_win),
        "avg_loss_pct": _r2(avg_loss),
        "payoff_ratio": _r2(payoff),
        "giveback_n": giveback,
        "giveback_mfe_pct": GIVEBACK_MFE_PCT,
        "hist": hist,
        "hist_labels": HIST_LABELS,
        "by_stage": by_stage,
        "monthly": monthly,
        "scatter": points,
        "scatter_sampled": sampled,
    }


# Refuse to overwrite the file when the total number of setups drops by more
# than this share versus the file already on disk (a broken price fetch or a
# missing history dir would otherwise wipe the report card).
DROP_GUARD_MAX_SHARE = 0.30


# Bump when the way setups are split/priced changes. The drop guard then compares
# a formula-independent count (tickers with a setup) instead of the setup total.
# 1 = old rule (closed the day it left the scan, merged back within 5 days)
# 2 = scan_setups.split_setups (ends after 5 scan days out), MFE from entry+1
SETUP_FORMULA_VERSION = 2


def total_setups(report):
    if not isinstance(report, dict):
        return 0
    scans = report.get("scans") or {}
    return sum(len(s.get("setups") or []) for s in scans.values() if isinstance(s, dict))


def total_setup_tickers(report):
    """Distinct (scan, ticker) pairs with at least one setup - does not depend on
    how a ticker's hits are split into setups."""
    if not isinstance(report, dict):
        return 0
    scans = report.get("scans") or {}
    return sum(
        len({r.get("ticker") for r in (s.get("setups") or [])})
        for s in scans.values() if isinstance(s, dict)
    )


def drop_guard_ok(new_report, prev_report):
    """(ok, prev_total, new_total). ok is False when the count fell by > DROP_GUARD_MAX_SHARE.
    Same formula version -> counts setups. Different version (a formula change) ->
    counts tickers with a setup, which a formula change should not move much."""
    same_formula = (
        isinstance(prev_report, dict)
        and prev_report.get("setup_formula_version", 1) == (new_report or {}).get("setup_formula_version", 1)
    )
    count = total_setups if same_formula else total_setup_tickers
    prev_total = count(prev_report)
    new_total = count(new_report)
    if prev_total <= 0:
        return True, prev_total, new_total
    return new_total >= prev_total * (1 - DROP_GUARD_MAX_SHARE), prev_total, new_total


def write_json_atomic(path, obj):
    """allow_nan=False: a NaN/Infinity anywhere raises instead of writing invalid JSON."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def history_window_start(hist_data):
    """First day of a *_history.json window (generatedAt - windowDays), or None."""
    if not isinstance(hist_data, dict):
        return None
    try:
        gen = datetime.fromisoformat(str(hist_data["generatedAt"]))
        return (gen.date() - timedelta(days=int(hist_data["windowDays"]))).isoformat()
    except (KeyError, TypeError, ValueError):
        return None


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Scan report card (forward returns + setups).")
    p.add_argument("--out", default=OUT_FILE,
                   help="output path (default: data/scans/report_card.json). Use a scratch path when testing.")
    p.add_argument("--stage-file", default=STAGE_FILE,
                   help="market_stage_transitions.json used for stage_at_entry (missing -> stage = null)")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    out_file = args.out
    dates = sorted(
        d for d in os.listdir(HIST_DIR)
        if os.path.isdir(os.path.join(HIST_DIR, d)) and d[0].isdigit()
    )
    if not dates:
        # Never overwrite a real report card with an empty one.
        print("[report-card] ERROR: No history dates found - nothing to compute, file not written.")
        sys.exit(1)

    print(f"[report-card] History dates available: {len(dates)} ({dates[0]}..{dates[-1]})")

    weekday_dates = history_dates(HIST_DIR)

    # Pass 1: signals per scan (no prices yet) — the price window and the
    # trading calendar both need the whole ticker set up front.
    scan_inputs = {}
    for scan_key, fname in SCANNERS.items():
        # เดินเฉพาะ "วันที่สแกนตัวนี้ได้ผลออกมาจริง" (ไฟล์มีอยู่ ต่อให้ข้างในเป็น [])
        # วันที่ pipeline ขาดจะอ่านได้เป็นลิสต์ว่าง ทำให้ first_appearances เห็นหุ้น
        # ที่ถืออยู่แล้วเป็น "pick ใหม่" ในวันถัดมา -> total_picks บวมและสถิติ D+5/10/20
        # นับ position เดิมซ้ำอีกรอบจากวันที่ผิด
        vdates = valid_dates(HIST_DIR, fname, dates)
        date_sets = {}
        for d in vdates:
            date_sets[d] = tickers_of(load_json(os.path.join(HIST_DIR, d, f"{fname}.json")))

        # Setups: the scan calendar (weekday + file exists) and hits over the FULL
        # snapshot history, split by scan_setups.split_setups - the same input
        # compute_scan_days / compute_scan_history use, so DAYS, the chart's
        # setupStarts and these rows agree. Scans that have a *_history.json keep
        # that file's window: only setups whose last hit is inside it are listed.
        cal = scan_calendar(HIST_DIR, fname, weekday_dates)
        hits_by_ticker = {}
        for d in cal:
            for t in date_sets.get(d, ()):
                hits_by_ticker.setdefault(t, []).append(d)
        ticker_hits = sorted(hits_by_ticker.items())
        window_start = history_window_start(load_json(os.path.join(SCANS_DIR, f"{fname}_history.json")))

        scan_inputs[scan_key] = (vdates, date_sets, ticker_hits, cal, window_start)

    signal_dates = [d for vdates, *_ in scan_inputs.values() for d in vdates]
    first_signal = min(signal_dates) if signal_dates else dates[0]
    price_start = (date.fromisoformat(first_signal) - timedelta(days=PRICE_LOOKBACK_BUFFER_DAYS)).isoformat()
    tickers = sorted(
        {t for _, date_sets, *_ in scan_inputs.values() for d_set in date_sets.values() for t in d_set}
    )
    print(f"[report-card] First signal {first_signal} - fetching prices from {price_start} for {len(tickers)} tickers")

    raw_prices = {t: load_ticker_prices(t, price_start) for t in tickers}
    fetched_ok = sum(1 for s in raw_prices.values() if s)
    fetched_fail = len(raw_prices) - fetched_ok

    holidays = non_trading_dates({t: s for t, s in raw_prices.items() if s})
    print(f"[report-card] Non-trading dates removed ({len(holidays)}): {', '.join(sorted(holidays)) or '-'}")

    price_cache = {}
    for t, series in raw_prices.items():
        series = drop_dates(series, holidays)
        price_cache[t] = (series, build_date_index(series))

    def get_price_series(ticker):
        return price_cache.get(ticker, ([], {}))

    stage_lookup = load_stage_lookup(args.stage_file)
    if stage_lookup is None:
        print(f"[report-card] WARNING: stage file not found/unreadable ({args.stage_file}) - stage_at_entry = null, by_stage = null.")
    else:
        print(f"[report-card] Stage history loaded for {len(stage_lookup)} tickers ({args.stage_file})")

    set_series = drop_dates(load_set_index_series(), holidays)
    set_index = build_date_index(set_series)
    if not set_series:
        print("[report-card] WARNING: no SET Index series found in breadth.json - excess return will be null.")

    result_scans = {}
    total_missing_price_file = 0
    total_excluded_outliers = 0

    for scan_key, (vdates, date_sets, ticker_hits, cal, window_start) in scan_inputs.items():
        # Snapshots written on a non-trading day were scanned off Yahoo's
        # holiday bar — not a scan day: a pick that is still listed on the next
        # trading day gets that day as D (entry = its D+1 close).
        vdates = [d for d in vdates if d not in holidays]
        cal = [d for d in cal if d not in holidays]
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
        for ticker, hit_dates in ticker_hits:
            if not ticker or not hit_dates:
                continue
            series, _ = get_price_series(ticker)
            if not series:
                continue
            t_setups = compute_setups(hit_dates, series, valid_scan_dates=cal)
            for st in t_setups:
                if window_start and st["last_hit"] < window_start:
                    continue
                st["stage_at_entry"] = stage_on(stage_lookup, ticker, st["entry_date"])
                st["exit_reason"] = exit_reason(st)
                scan_setups.append({"ticker": ticker, **st})

        scan_setups.sort(key=lambda s: (s["entry_date"], s["ticker"]))

        conf = confirmed_view(scan_setups)
        result_scans[scan_key] = {
            "total_picks": len(entries),
            "horizons": {str(h): summarize_horizon(horizon_rows[h]) for h in HORIZONS},
            "setups": scan_setups,
            "setup_window_start": window_start,
            "setup_summary": {
                **summarize_setups(scan_setups),
                **setup_extras(scan_setups, stage_available=stage_lookup is not None),
            },
            # (ข) same setups, exit = close on the day the 5th out day is reached
            "setup_summary_confirmed": {
                **summarize_setups(conf),
                **setup_extras(conf, stage_available=stage_lookup is not None),
            },
        }
        n5 = result_scans[scan_key]["horizons"]["5"]["n"]
        n_closed = result_scans[scan_key]["setup_summary"]["n_closed"]
        n_open = result_scans[scan_key]["setup_summary"]["n_open"]
        print(f"  {scan_key}: {len(entries)} unique entries, D+5 computable for {n5}, setups: {n_closed} closed, {n_open} open")

    print(f"[report-card] Price fetch summary: {fetched_ok} succeeded, {fetched_fail} failed out of {len(raw_prices)} unique tickers")
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
            "trading_days": (
                "นับ D+N เฉพาะวันทำการ: วันที่หุ้นมีปริมาณซื้อขายไม่ถึงครึ่งของหุ้นที่มีข้อมูลวันนั้น (วันหยุดที่ Yahoo ใส่แถวราคาเดิมมาให้) "
                f"ถูกตัดออกก่อนคำนวณ — ตัด {len(holidays)} วัน"
            ),
            "setups": (
                f"ไม้ = เริ่มวันแรกที่ติดสแกน จบเมื่อหลุดสแกนครบ {SETUP_GAP_DAYS} วันทำการติดกัน (นับเฉพาะวันที่สแกนมีข้อมูล) · "
                f"หลุด 1–{SETUP_GAP_DAYS - 1} วันยังถืออยู่ (days_out) · กลับมาหลังจบ = ไม้ใหม่ · "
                "exit_price = ราคาปิดวันถัดจากวันสุดท้ายที่ติดสแกน · exit_price_confirmed = ราคาปิดวันที่หลุดครบ "
                f"{SETUP_GAP_DAYS} วัน · MFE/MAE นับราคาสูง/ต่ำตั้งแต่วันหลังวันเข้าซื้อถึงวันขาย"
            ),
            "win_flat_loss": "ชนะ = ผลตอบแทน > 0 · เสมอ = ราคาออกเท่าราคาเข้า · แพ้ = ผลตอบแทน < 0 · win rate = ชนะ ÷ ทั้งหมด (นับเสมอในตัวหาร)",
            "outlier_guard": (
                f"รายการที่ผลตอบแทนเกิน ±{OUTLIER_RETURN_THRESHOLD_PCT:.0f}% และในช่วงเวลานั้นหุ้นมีวันที่ไม่มีการซื้อขายเลย "
                "(หยุดพักการซื้อขาย/ขึ้นเครื่องหมายห้ามซื้อขาย) ถูกตัดออกจากสถิติ เพราะราคาที่ใช้คำนวณไม่ใช่ราคาที่ซื้อขายได้จริง — "
                f"ตัดรายการผิดปกติ {total_excluded_outliers} รายการ"
            ),
        },
        "setup_formula_version": SETUP_FORMULA_VERSION,
        "history_range": {"first_date": dates[0], "last_date": dates[-1], "n_dates": len(dates)},
        "price_range": {"first_date": price_start, "first_signal_date": first_signal},
        "non_trading_dates": sorted(holidays),
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
            f"Aborting without overwriting {out_file}."
        )
        sys.exit(1)

    # Drop guard: compare against the file being replaced (or the real report
    # card when writing a fresh scratch file).
    prev_path = out_file if os.path.exists(out_file) else OUT_FILE
    ok, prev_total, new_total = drop_guard_ok(output, load_json(prev_path))
    if not ok:
        print(
            f"[report-card] ERROR: total setups dropped {prev_total} -> {new_total} "
            f"(> {DROP_GUARD_MAX_SHARE:.0%} fewer than {prev_path}). Aborting without overwriting {out_file}."
        )
        sys.exit(1)

    try:
        write_json_atomic(out_file, output)
    except ValueError as e:  # NaN / Infinity slipped into a number
        print(f"[report-card] ERROR: non-finite number in output ({e}). Aborting without overwriting {out_file}.")
        sys.exit(1)
    print(f"[report-card] Saved: {out_file} (setups {prev_total} -> {new_total})")


if __name__ == "__main__":
    main()

