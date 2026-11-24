"""
build_daily_report.py  -  สรุปสแกนรายวัน (/daily-report) เฟส 1: แถบตลาด + แท็บ Daytrade

อ่านไฟล์ที่ pipeline เขียนไว้แล้วเท่านั้น (ไม่ยิงเน็ต) แล้วเขียนไฟล์ใหม่ไฟล์เดียว:
    data/scans/daily_report.json

แหล่งข้อมูล
    data/history/<วัน>/lekkung_daytrade.json   ชุดหุ้น Daytrade ของแต่ละวัน (สถานะ / streak)
    data/history/<วัน>/lekkung.json, sepa.json  อยู่ในสแกนไหนอีก (in_scans)
    data/scans/topmover_charts.json            OHLC 30 วันของทุกหุ้น (ไม่ถูก archive รายวัน)
    data/scans/breadth.json (+ history)        SET OHLC / มูลค่า (set_index) + สภาพตลาด (market_stage)
    data/scans/combined.json, sector_map.json  แยกกองทุน/REIT ออกจาก breadth
    data/history/<วัน>/market_stage.json       EMA200 ของตัวที่หลุด (เช็คเกณฑ์)
    public/data/news_flags.json                events รายตัว + ปฏิทิน XD/XR 10 วันข้างหน้า

กติกา (ตรงตาม spec เฟส 1)
    วันทำการ   = วันที่ที่มีแท่งใน breadth.json.set_index (โฟลเดอร์ history ของวันหยุดถูกข้าม)
    วันสแกน    = วันทำการที่มีไฟล์ของสแกนนั้นใน data/history
    วันก่อนหน้า = วันสแกนล่าสุดก่อน date
    stay      = อยู่วันก่อนหน้าด้วย · streak = วันสแกนติดกันถึง date
    reentry   = ไม่อยู่วันก่อนหน้า แต่อยู่ใน 10 วันสแกนก่อน date · มี last_seen · streak 1
    new       = ไม่อยู่เลยใน 10 วันสแกนก่อน date · streak 1
    dropped   = อยู่วันก่อนหน้า ไม่อยู่ date · days_before_drop = streak ณ วันก่อนหน้า

Usage:
    python -X utf8 scripts/build_daily_report.py                 # วันสแกนล่าสุด
    python -X utf8 scripts/build_daily_report.py --date 2026-11-20
    python -X utf8 scripts/build_daily_report.py --out <scratch>/daily_report.json
"""

import argparse
import json
import math
import os
import re
import sys
from datetime import date as Date, datetime, timedelta, timezone

SCHEMA_VERSION = 1
BANGKOK_TZ = timezone(timedelta(hours=7))
LOOKBACK_DAYS = 10          # reentry / new window (วันสแกนก่อน date)
CAL_AHEAD_DAYS = 10         # ปฏิทิน XD/XR ล่วงหน้า (วันปฏิทิน)
# Market Stage นับเป็น "อยู่ในสแกน" เฉพาะ 4 stage นี้ (ใช้กับ in_scans ของปฏิทิน)
STAGE_IN_SCAN = ("Accumulation", "Recovery", "Bull", "S.Bull")
THIN_VALUE_MB = 10.0
MIN_VOL_1030_RATIO = 0.30
FUND_SUBSECTOR = "Property Fund & REITs"  # same constant as lib/sectorData.ts FUND_SUBSECTOR

# ข้อความสภาพตลาด — ชุดเดียวกับ MarketStageStrip ใน app/sepa/page.tsx +
# CAUTION_STAGES ใน lib/sepaTier.ts (คัดลอกตรงตัว ถ้าแก้ที่นั่นต้องแก้ที่นี่ด้วย)
CAUTION_STAGES = ["Correction", "Under Pressure"]
CAUTION_ADVICE = "ช่วงนี้ควรซื้อน้อยลงและใช้ position เล็กลง"

# เกณฑ์ Lekkung Daytrade 9 ข้อ (ตรงกับ data_engine/tools/scanner/scan_lekkung_daytrade.py SCAN_FILTER)
CRITERIA = [
    ("common_stock", "หุ้นสามัญ (ไม่ใช่กองทุน/REIT)"),
    ("close_gt_1", "ราคา > 1"),
    ("close_gt_ema200", "ปิดเหนือ EMA200"),
    ("chg_gt_0", "Chg% > 0"),
    ("vol_gt_1m", "Vol > 1M"),
    ("rsi7_gt_50", "RSI7 > 50"),
    ("avgvol10_1m_50m", "AvgVol10 1–50M"),
    ("adx_gt_20", "ADX14 > 20"),
    ("tech_ge_buy", "Tech Rating ≥ Buy"),
]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STOCKDESK_DIR = os.path.dirname(SCRIPT_DIR)


# ─── helpers ────────────────────────────────────────────────────────────────

def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def rows_of(data):
    if data is None:
        return []
    if isinstance(data, list):
        return data
    rows = data.get("data", [])
    return rows if isinstance(rows, list) else []


def tickers_of(data):
    return {r.get("Ticker") or r.get("ticker") for r in rows_of(data)} - {None}


def num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    f = float(v)
    return f if math.isfinite(f) else None


def rnd(v, nd=4):
    v = num(v)
    return None if v is None else round(v, nd)


# ─── calendar / status rules (pure, tested) ───────────────────────────────

def scan_days(trading_days, has_file):
    """วันสแกน = วันทำการ (ascending) ที่สแกนนั้นมีไฟล์ · has_file(d) -> bool"""
    return [d for d in sorted(trading_days) if has_file(d)]


def streak_at(ticker, cal, sets, upto):
    """จำนวนวันสแกนติดกันที่ ticker อยู่ในสแกน นับถอยจาก upto (รวม upto)"""
    k = 0
    for d in reversed([x for x in cal if x <= upto]):
        if ticker in sets.get(d, set()):
            k += 1
        else:
            break
    return k


def classify(cal, sets, day, lookback=LOOKBACK_DAYS):
    """สถานะของทุกหุ้นในวัน `day` เทียบวันสแกนก่อนหน้า

    cal:  วันสแกน (ascending) · sets: {วัน: set(ticker)} · day ต้องอยู่ใน cal
    คืน (compared_to, {ticker: {...}} ของหุ้นวันนี้, {ticker: {...}} ของตัวที่หลุด)
    """
    if day not in cal:
        raise ValueError(f"{day} is not a scan day")
    i = cal.index(day)
    prev = cal[i - 1] if i > 0 else None
    window = cal[max(0, i - lookback):i]  # 10 วันสแกนก่อน day (ไม่รวม day)
    today = sets.get(day, set())
    before = sets.get(prev, set()) if prev else set()
    current = {}
    for t in today:
        if t in before:
            current[t] = {"status": "stay", "last_seen": None, "streak_days": streak_at(t, cal, sets, day)}
        else:
            seen = [d for d in window if t in sets.get(d, set())]
            if seen:
                current[t] = {"status": "reentry", "last_seen": seen[-1], "streak_days": 1}
            else:
                current[t] = {"status": "new", "last_seen": None, "streak_days": 1}
    dropped = {t: {"status": "dropped", "days_before_drop": streak_at(t, cal, sets, prev)}
               for t in before - today}
    return prev, current, dropped


# ─── price rules (pure, tested) ───────────────────────────────────────────

def bars_upto(bars, day):
    return [b for b in bars if b.get("date") and b["date"] <= day]


def close_position(o_h_l_c):
    h, l, c = o_h_l_c["high"], o_h_l_c["low"], o_h_l_c["close"]
    if h == l:
        return "mid"
    if c == h:
        return "at_high"
    pos = (c - l) / (h - l)
    if pos >= 0.75:
        return "near_high"
    if pos <= 0.25:
        return "near_low"
    return "mid"


def trigger_of(bars, day):
    """จุดสนใจ: High วัน > close → High วัน · ไม่งั้น max high 5 วัน → 30 วัน ที่ > close · ไม่งั้น null
    bars: แท่งถึง `day` (ascending, แท่งสุดท้าย = day) · ห้ามคืน trigger <= close"""
    upto = bars_upto(bars, day)
    if not upto or upto[-1]["date"] != day:
        return None, None
    c = upto[-1]["close"]
    h = upto[-1]["high"]
    if h > c:
        return h, "high_day"
    h5 = max(b["high"] for b in upto[-5:])
    if h5 > c:
        return h5, "high_5d"
    h30 = max(b["high"] for b in upto[-30:])
    if h30 > c:
        return h30, "high_30d"
    return None, "close_30d_high"


def stop_of(low, prev_close, close):
    """จุดทิ้ง: จาก low กับ prev_close เลือกตัวที่ < close และใกล้ close ที่สุด · ไม่มี → low"""
    cands = [v for v in (low, prev_close) if v is not None and v < close]
    if not cands:
        return low, "low"
    best = max(cands)
    return best, ("low" if best == low else "prev_close")


def rv_tier(rel):
    if rel is None:
        return None
    if rel >= 1.5:
        return "hi"
    if rel >= 1.0:
        return "mid"
    return "lo"


def tech_label(score):
    if score is None:
        return None
    if score >= 0.5:
        return "Strong Buy"
    if score >= 0.1:
        return "Buy"
    return "Neutral"


def price_block(bars, day):
    """OHLC ของ day + prev_close + closes_7d · ไม่มีแท่งของ day → price_stale (ไม่เดาค่า)"""
    upto = bars_upto(bars or [], day)
    if not upto:
        return {"price_stale": True, "bar_date": None}
    last = upto[-1]
    if last["date"] != day:
        return {"price_stale": True, "bar_date": last["date"]}
    prev_close = upto[-2]["close"] if len(upto) >= 2 else None
    return {
        "price_stale": False,
        "bar_date": day,
        "open": last["open"], "high": last["high"], "low": last["low"], "close": last["close"],
        "prev_close": prev_close,
        "closes_7d": [{"date": b["date"], "close": b["close"]} for b in upto[-7:]],
    }


def xd_amount(title):
    """'วัน XD · เงินปันผล 0.05 บาท/หุ้น' → 0.05 · parse ไม่ได้ → None"""
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*บาท", title or "")
    return float(m.group(1)) if m else None


# ─── builders ──────────────────────────────────────────────────────────────

class Ctx:
    def __init__(self, root):
        self.root = root
        self.hist = os.path.join(root, "data", "history")
        self.scans = os.path.join(root, "data", "scans")
        self.breadth = load_json(os.path.join(self.scans, "breadth.json")) or {}
        self.trading_days = sorted({b["date"] for b in self.breadth.get("set_index", []) if b.get("date")})
        charts = load_json(os.path.join(self.scans, "topmover_charts.json")) or {}
        self.charts = charts.get("data", {}) or {}
        sm = load_json(os.path.join(self.scans, "sector_map.json")) or {}
        self.t2s = sm.get("ticker_to_sector", {}) or {}
        comb = load_json(os.path.join(self.scans, "combined.json")) or {}
        self.is_fund_comb = {r.get("ticker"): r.get("Is_Fund") for r in rows_of(comb)}
        self.flags_file = load_json(os.path.join(root, "public", "data", "news_flags.json")) or {}

    def hist_path(self, day, fname):
        return os.path.join(self.hist, day, f"{fname}.json")

    def has(self, day, fname):
        return os.path.exists(self.hist_path(day, fname))

    def is_fund(self, t):
        v = self.is_fund_comb.get(t)
        if v is not None:
            return bool(v)
        return (self.t2s.get(t, {}) or {}).get("subsector") == FUND_SUBSECTOR

    def bars(self, t):
        return (self.charts.get(t) or {}).get("bars") or []

    def ema200_chart(self, t, day):
        c = self.charts.get(t) or {}
        bars, ema = c.get("bars") or [], c.get("ema200") or []
        for b, e in zip(bars, ema):
            if b.get("date") == day:
                return num(e)
        return None


def build_market(ctx, day):
    si = [b for b in ctx.breadth.get("set_index", []) if b.get("date") and b["date"] <= day]
    bar = si[-1] if si and si[-1]["date"] == day else None
    prev = si[-2] if bar and len(si) >= 2 else None
    m = {"date": day, "set_close": None, "set_chg_pct": None, "value_mb": None, "value_chg_pct": None,
         "value_is_universe": True}
    if bar:
        m["set_close"] = rnd(bar.get("close"), 2)
        if prev and num(prev.get("close")):
            m["set_chg_pct"] = rnd((bar["close"] / prev["close"] - 1) * 100, 2)
        if num(bar.get("volume")) is not None:
            m["value_mb"] = rnd(bar["volume"] / 1e6, 0)
            if prev and num(prev.get("volume")):
                m["value_chg_pct"] = rnd((bar["volume"] / prev["volume"] - 1) * 100, 2)

    up = flat = down = skipped = 0
    for t, c in ctx.charts.items():
        if ctx.is_fund(t):
            continue
        upto = bars_upto(c.get("bars") or [], day)
        if len(upto) < 2 or upto[-1]["date"] != day:
            skipped += 1
            continue
        cl, pc = upto[-1]["close"], upto[-2]["close"]
        if cl > pc:
            up += 1
        elif cl < pc:
            down += 1
        else:
            flat += 1
    m["breadth"] = {"up": up, "flat": flat, "down": down, "skipped_no_bar": skipped, "is_calc": True,
                    "universe": "topmover_charts · หุ้นสามัญ (ตัดกองทุน/REIT)"}

    # สภาพตลาด: breadth.json ของวันนั้น (history) → ไม่มีก็ใช้ไฟล์ปัจจุบันถ้าเป็นวันล่าสุด
    hb = load_json(ctx.hist_path(day, "breadth"))
    ms = (hb or {}).get("market_stage")
    if ms is None and ctx.trading_days and day == ctx.trading_days[-1]:
        ms = ctx.breadth.get("market_stage")
    if ms and isinstance(ms.get("stage"), str) and ms["stage"].strip():
        caution = ms["stage"] in CAUTION_STAGES
        m["condition"] = {"label": ms["stage"], "dd_window": 25, "dd_count": ms.get("dd_count_25d"),
                          "caution": caution, "advice": CAUTION_ADVICE if caution else None}
    else:
        m["condition"] = None
    return m


def scan_membership(ctx, day):
    """สแกนที่หุ้นแต่ละตัวอยู่ ณ `day` → {scan: set(ticker)} (ใช้ in_scans ของปฏิทิน)
    growth / sepa (ทั้งไฟล์) / daytrade จาก history ของวันนั้น · market_stage เฉพาะ STAGE_IN_SCAN"""
    mem = {
        "growth": tickers_of(load_json(ctx.hist_path(day, "lekkung"))),
        "sepa": tickers_of(load_json(ctx.hist_path(day, "sepa"))),
        "daytrade": tickers_of(load_json(ctx.hist_path(day, "lekkung_daytrade"))),
    }
    ms = rows_of(load_json(ctx.hist_path(day, "market_stage")))
    mem["market_stage"] = {r.get("Ticker") for r in ms if r.get("Stage") in STAGE_IN_SCAN} - {None}
    return mem


SCAN_ORDER = ("daytrade", "growth", "sepa", "market_stage")


def scans_of(mem, ticker):
    return [k for k in SCAN_ORDER if ticker in mem.get(k, set())]


def build_calendar(ctx, day):
    out = []
    mem = scan_membership(ctx, day)
    end = (Date.fromisoformat(day) + timedelta(days=CAL_AHEAD_DAYS)).isoformat()
    for t, flags in (ctx.flags_file.get("flags") or {}).items():
        for f in flags or []:
            if f.get("type") != "xd_soon":
                continue
            d = f.get("date")
            if not d or not (day < d <= end):
                continue
            title = f.get("title") or ""
            kind = "XR" if "XR" in title or "XR" in (f.get("label") or "") else "XD"
            out.append({"date": d, "type": kind, "ticker": t, "amount": xd_amount(title) if kind == "XD" else None,
                        "note": title, "in_scans": scans_of(mem, t)})
    out.sort(key=lambda r: (r["date"], r["ticker"]))
    # วันทำการถัดไป (ใช้แยก "พรุ่งนี้" ในหน้า) — จากปฏิทิน SET ถ้ามีวันหลัง day · ไม่มี (วันล่าสุด) → วันธรรมดาถัดไป
    nxt = [d for d in ctx.trading_days if d > day]
    if nxt:
        next_day = nxt[0]
    else:
        nd = Date.fromisoformat(day) + timedelta(days=1)
        while nd.weekday() >= 5:
            nd += timedelta(days=1)
        next_day = nd.isoformat()
    return {"as_of": ctx.flags_file.get("as_of"), "ahead_days": CAL_AHEAD_DAYS, "next_trading_day": next_day,
            "items": out}


def check_dropped(ctx, t, day, pb):
    """เช็คเกณฑ์ 9 ข้อด้วยข้อมูลของ `day` ที่หาได้ · ไม่มีข้อมูล → unknown (ไม่เดา)"""
    res = {k: "unknown" for k, _ in CRITERIA}
    src = {}
    res["common_stock"] = "fail" if ctx.is_fund(t) else "pass"
    src["common_stock"] = "combined.json Is_Fund / sector_map"
    if not pb.get("price_stale"):
        c, pc = pb["close"], pb.get("prev_close")
        res["close_gt_1"] = "pass" if c > 1 else "fail"
        src["close_gt_1"] = "topmover_charts"
        if pc:
            res["chg_gt_0"] = "pass" if c > pc else "fail"
            src["chg_gt_0"] = "topmover_charts"
        ms = {r.get("Ticker"): r for r in rows_of(load_json(ctx.hist_path(day, "market_stage")))}
        ema = num((ms.get(t) or {}).get("EMA200"))
        ema_src = "market_stage.json EMA200"
        if ema is None:
            ema = ctx.ema200_chart(t, day)
            ema_src = "topmover_charts ema200"
        if ema is not None:
            res["close_gt_ema200"] = "pass" if c > ema else "fail"
            src["close_gt_ema200"] = ema_src
    # วอลุ่มของวันนั้นมีเฉพาะตัวที่ติดอันดับ topmover_ranking (ถ้าเป็นไฟล์ของวันเดียวกัน)
    tr = load_json(ctx.hist_path(day, "topmover_ranking")) or {}
    if tr.get("date") == day:
        for mk in (tr.get("markets") or {}).values():
            for lst in (mk or {}).values():
                for r in lst or []:
                    if r.get("symbol") == t and num(r.get("totalVolume")) is not None:
                        res["vol_gt_1m"] = "pass" if r["totalVolume"] > 1_000_000 else "fail"
                        src["vol_gt_1m"] = "topmover_ranking"
    failed = [label for k, label in CRITERIA if res[k] == "fail"]
    checked = sum(1 for v in res.values() if v != "unknown")
    return {"criteria": res, "sources": src, "failed": failed, "checked": checked, "total": len(CRITERIA)}


def build_daytrade(ctx, day):
    fname = "lekkung_daytrade"
    cal = scan_days(ctx.trading_days, lambda d: ctx.has(d, fname))
    if day not in cal:
        return None
    sets = {d: tickers_of(load_json(ctx.hist_path(d, fname))) for d in cal}
    prev, current, dropped = classify(cal, sets, day)
    raw = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(day, fname)))}
    prev_raw = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(prev, fname)))} if prev else {}
    in_growth = tickers_of(load_json(ctx.hist_path(day, "lekkung")))
    in_sepa = tickers_of(load_json(ctx.hist_path(day, "sepa")))
    flags = ctx.flags_file.get("flags") or {}

    def in_scans(t, daytrade):
        s = (["daytrade"] if daytrade else []) + (["growth"] if t in in_growth else []) + (["sepa"] if t in in_sepa else [])
        return s

    rows, mismatches = [], []
    for t, st in current.items():
        r = raw.get(t, {})
        close = num(r.get("Close"))
        chg = num(r.get("Change_Pct"))
        pb = price_block(ctx.bars(t), day)
        row = {"ticker": t, "name": r.get("Name"), **st,
               "close": close, "chg_pct": rnd(chg, 2), "volume": num(r.get("Volume")),
               "avg_vol_10d": num(r.get("Avg_Volume_10D")), "rel_vol": rnd(r.get("Rel_Volume"), 2),
               "rv_tier": rv_tier(num(r.get("Rel_Volume"))),
               "rsi7": rnd(r.get("RSI7"), 1), "adx": rnd(r.get("ADX"), 1),
               "tech_rating": rnd(r.get("Tech_Rating"), 2), "tech_label": tech_label(num(r.get("Tech_Rating"))),
               "pe": rnd(r.get("PE_Ratio"), 1), "eps_gr_yoy": rnd(r.get("EPS_Growth_YoY"), 1),
               "price_stale": pb["price_stale"], "bar_date": pb.get("bar_date"),
               "open": None, "high": None, "low": None, "prev_close": None, "closes_7d": [],
               "close_position": None, "trigger": None, "trigger_kind": None, "stop": None, "stop_kind": None,
               "price_check": None}
        av = row["avg_vol_10d"]
        row["min_vol_1030"] = round(MIN_VOL_1030_RATIO * av) if av is not None else None
        if close is not None and row["volume"] is not None:
            row["value_mb"] = rnd(close * row["volume"] / 1e6, 2)
            row["thin"] = row["value_mb"] < THIN_VALUE_MB
        else:
            row["value_mb"], row["thin"] = None, None
        row["value_is_calc"] = True
        if not pb["price_stale"]:
            row.update({k: pb[k] for k in ("open", "high", "low", "prev_close", "closes_7d")})
            row["close_position"] = close_position(pb)
            trig, kind = trigger_of(ctx.bars(t), day)
            row["trigger"], row["trigger_kind"] = trig, kind
            sp, sk = stop_of(pb["low"], pb["prev_close"], pb["close"])
            row["stop"], row["stop_kind"] = sp, sk
            calc_chg = (pb["close"] / pb["prev_close"] - 1) * 100 if pb["prev_close"] else None
            ok = (close is not None and abs(pb["close"] - close) < 1e-6
                  and calc_chg is not None and chg is not None and abs(calc_chg - chg) < 0.01)
            row["price_check"] = "ok" if ok else "mismatch"
            if not ok:
                mismatches.append(t)
        row["in_scans"] = in_scans(t, True)
        row["events"] = flags.get(t, [])
        rows.append(row)
    rows.sort(key=lambda x: (-(x["rel_vol"] if x["rel_vol"] is not None else -1), x["ticker"]))

    drops = []
    for t, st in dropped.items():
        pb = price_block(ctx.bars(t), day)
        chg = None
        if not pb["price_stale"] and pb.get("prev_close"):
            chg = rnd((pb["close"] / pb["prev_close"] - 1) * 100, 2)
        drops.append({"ticker": t, **st, "close": pb.get("close"), "chg_pct": chg,
                      "price_stale": pb["price_stale"], "bar_date": pb.get("bar_date"),
                      "prev_close_in_scan": num(prev_raw.get(t, {}).get("Close")),
                      "check": check_dropped(ctx, t, day, pb),
                      "in_scans": in_scans(t, False), "events": flags.get(t, [])})
    drops.sort(key=lambda x: x["ticker"])

    count = lambda k, v: sum(1 for r in rows if r[k] == v)  # noqa: E731
    return {
        "scan": fname, "page": "/lekkung-daytrade", "date": day, "compared_to": prev,
        "generated_at": (load_json(ctx.hist_path(day, fname)) or {}).get("generated_at"),
        "counts": {"total": len(rows), "new": count("status", "new"), "reentry": count("status", "reentry"),
                   "stay": count("status", "stay"), "dropped": len(drops),
                   "rv_hi": count("rv_tier", "hi"), "rv_mid": count("rv_tier", "mid"), "rv_lo": count("rv_tier", "lo")},
        "lookback_days": LOOKBACK_DAYS,
        "price_mismatch": mismatches,
        "rows": rows,
        "dropped": drops,
        "criteria": [{"key": k, "label": label} for k, label in CRITERIA],
    }


def latest_scan_day(ctx, fname="lekkung_daytrade"):
    cal = scan_days(ctx.trading_days, lambda d: ctx.has(d, fname))
    return cal[-1] if cal else None


def build(root, day=None):
    ctx = Ctx(root)
    day = day or latest_scan_day(ctx)
    if day is None:
        raise SystemExit("no scan day found")
    if day not in ctx.trading_days:
        raise SystemExit(f"{day} is not a trading day (no SET bar in breadth.json)")
    dt = build_daytrade(ctx, day)
    return {
        "schema_version": SCHEMA_VERSION,
        "date": day,
        "compared_to": dt["compared_to"] if dt else None,
        "generated_at": datetime.now(BANGKOK_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00"),
        "market": build_market(ctx, day),
        "calendar": build_calendar(ctx, day),
        "daytrade": dt,
        "growth": None,
        "sepa": None,
        "market_stage": None,
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (default: latest scan day)")
    ap.add_argument("--out", default=None, help="output path (default data/scans/daily_report.json)")
    ap.add_argument("--root", default=STOCKDESK_DIR, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    report = build(args.root, args.date)
    out = args.out or os.path.join(args.root, "data", "scans", "daily_report.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    dt = report["daytrade"] or {}
    print(f"  daily_report {report['date']} vs {report['compared_to']}: daytrade "
          f"{(dt.get('counts') or {})} mismatch={dt.get('price_mismatch')} -> {out}")


if __name__ == "__main__":
    sys.exit(main())
