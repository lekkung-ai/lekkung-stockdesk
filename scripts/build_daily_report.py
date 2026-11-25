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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_setups import current_setup, scan_calendar  # noqa: E402  (กติกา 5 วันของ DAYS บนหน้าสแกน)

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
    """เกณฑ์เดียวกับ techRatingLabel ใน lib/lekkungDaytradeData.ts (หน้า /lekkung-daytrade)"""
    if score is None:
        return None
    if score > 0.5:
        return "Strong Buy"
    if score >= 0.1:
        return "Buy"
    if score > -0.1:
        return "Neutral"
    if score >= -0.5:
        return "Sell"
    return "Strong Sell"


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
    """สแกนที่หุ้นแต่ละตัวอยู่ ณ `day` → {scan: set(ticker)} (ใช้ in_scans ทุกจุด: ทุกแท็บ + ปฏิทิน — ฟังก์ชันเดียว)
    growth / sepa (ทั้งไฟล์) / daytrade จาก history ของวันนั้น
    market_stage: {ticker: stage} เฉพาะ STAGE_IN_SCAN (Accumulation/Recovery/Bull/S.Bull) · stage อื่นไม่นับ"""
    mem = {
        "growth": tickers_of(load_json(ctx.hist_path(day, "lekkung"))),
        "sepa": tickers_of(load_json(ctx.hist_path(day, "sepa"))),
        "daytrade": tickers_of(load_json(ctx.hist_path(day, "lekkung_daytrade"))),
    }
    ms = rows_of(load_json(ctx.hist_path(day, "market_stage")))
    mem["market_stage"] = {r["Ticker"]: r["Stage"] for r in ms if r.get("Ticker") and r.get("Stage") in STAGE_IN_SCAN}
    return mem


SCAN_ORDER = ("daytrade", "growth", "sepa", "market_stage")


def scans_of(mem, ticker):
    """['daytrade', 'growth', 'sepa', 'market_stage:S.Bull'] — stage แนบชื่อจริงหลัง ':' (หน้าเว็บแสดง "Stage: S.Bull")"""
    out = []
    for k in SCAN_ORDER:
        grp = mem.get(k, set())
        if ticker in grp:
            out.append(f"{k}:{grp[ticker]}" if isinstance(grp, dict) else k)
    return out


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


def align_to_web(ctx, fname, days_key, day, cal, sets, prev, current, dropped, fallback_days):
    """ให้สถานะ / หลุด / Days ตรงกับหน้าสแกน (ผู้ใช้สั่ง: ไม่ตรงให้ยึดหน้าสแกน)

    หน้าสแกนติด NEW ตาม <scan>_diff.json (ไม่อยู่ในวันสแกนก่อนหน้า) และแสดง Days จาก scan_days.json
    ไฟล์ทั้งสองเป็นของรอบล่าสุดเท่านั้น → ใช้เมื่อ diff.currentDate == day · ย้อนหลังใช้กติกาเดียวกันคิดเอง
    status: 'new' | 'stay' (ไม่มี reentry แล้ว) · seen_before = เคยอยู่ใน 10 วันก่อนหน้า (ข้อมูลเสริม ตัวเล็กสีเทา)
    แก้ current / dropped ในที่ · คืน (days_map, source)"""
    diff = load_json(os.path.join(ctx.scans, f"{fname}_diff.json")) or {}
    use_web = diff.get("currentDate") == day
    web_new = set(diff.get("newTickers") or []) if use_web else None
    for t, st in current.items():
        is_new = (t in web_new) if use_web else st["status"] in ("new", "reentry")
        seen = st.get("last_seen")
        st["status"] = "new" if is_new else "stay"
        st["seen_before"] = seen if is_new else None
        st["last_seen"] = st["seen_before"]
    if use_web:
        web_drop = {x.get("ticker") for x in diff.get("droppedTickers") or []} - {None}
        for t in list(dropped):
            if t not in web_drop:
                del dropped[t]
        for t in web_drop - set(dropped):
            dropped[t] = {"status": "dropped", "days_before_drop": streak_at(t, cal, sets, prev) if prev else None}
    sd = (load_json(os.path.join(ctx.scans, "scan_days.json")) or {}).get(days_key)
    if use_web and isinstance(sd, dict):
        return {t: sd.get(t) for t in current}, "scan_days.json"
    return fallback_days(), "computed"



def build_daytrade(ctx, day):
    fname = "lekkung_daytrade"
    cal = scan_days(ctx.trading_days, lambda d: ctx.has(d, fname))
    if day not in cal:
        return None
    sets = {d: tickers_of(load_json(ctx.hist_path(d, fname))) for d in cal}
    prev, current, dropped = classify(cal, sets, day)
    days_map, days_src = align_to_web(ctx, fname, "lekkung_daytrade", day, cal, sets, prev, current, dropped,
                                      lambda: {t: streak_at(t, cal, sets, day) for t in current})
    raw = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(day, fname)))}
    prev_raw = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(prev, fname)))} if prev else {}
    mem = scan_membership(ctx, day)  # ป้าย "อยู่ใน" ชุดเดียวกันทุกแท็บ + ปฏิทิน
    flags = ctx.flags_file.get("flags") or {}

    def in_scans(t, _daytrade=None):
        return scans_of(mem, t)

    rows, mismatches = [], []
    for t, st in current.items():
        r = raw.get(t, {})
        close = num(r.get("Close"))
        chg = num(r.get("Change_Pct"))
        pb = price_block(ctx.bars(t), day)
        row = {"ticker": t, "name": r.get("Name"), **st, "days_web": days_map.get(t),
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
        "counts": {"total": len(rows), "prev_total": len(sets.get(prev, ())) if prev else None,
                   "new": count("status", "new"), "reentry": count("status", "reentry"),
                   "stay": count("status", "stay"), "dropped": len(drops),
                   "rv_hi": count("rv_tier", "hi"), "rv_mid": count("rv_tier", "mid"), "rv_lo": count("rv_tier", "lo")},
        "lookback_days": LOOKBACK_DAYS, "days_source": days_src,
        "price_mismatch": mismatches,
        "rows": rows,
        "dropped": drops,
        "criteria": [{"key": k, "label": label} for k, label in CRITERIA],
    }


def web_days(ctx, fname, day):
    """DAYS "ไม้ (ตามเว็บ)" ของทุกหุ้น ณ day — กติกา 5 วันเดียวกับ compute_scan_days.py
    (scan_setups.current_setup บนวันธรรมดาที่มีไฟล์ · นับวันที่หลุด 1-4 วันรวมด้วย)"""
    cal = [d for d in scan_calendar(ctx.hist, fname) if d <= day]
    hits = {}
    for d in cal:
        for t in tickers_of(load_json(ctx.hist_path(d, fname))):
            hits.setdefault(t, []).append(d)
    out = {}
    for t, hs in hits.items():
        cs = current_setup(hs, cal, latest=day)
        if cs:
            out[t] = max(cs["days"], 1)
    return out


def chart_price(ctx, t, day):
    """ราคา/% วันนี้จาก topmover_charts · ไม่มีแท่งของ day → price_stale (ไม่เดา)"""
    pb = price_block(ctx.bars(t), day)
    chg = None
    if not pb["price_stale"] and pb.get("prev_close"):
        chg = rnd((pb["close"] / pb["prev_close"] - 1) * 100, 2)
    return {"close": pb.get("close"), "chg_pct": chg, "price_stale": pb["price_stale"], "bar_date": pb.get("bar_date")}


def scan_status(ctx, fname, day):
    """cal / sets / prev / current / dropped / earlier-dropped ของสแกนหนึ่ง (กติกาเดียวกับ Daytrade)"""
    cal = scan_days(ctx.trading_days, lambda d: ctx.has(d, fname))
    if day not in cal:
        raise ValueError(f"{fname}: ไม่มีไฟล์ของวันที่ {day}")
    sets = {d: tickers_of(load_json(ctx.hist_path(d, fname))) for d in cal}
    prev, current, dropped = classify(cal, sets, day)
    i = cal.index(day)
    window = cal[max(0, i - LOOKBACK_DAYS):i]
    today, before = sets[day], sets.get(prev, set())
    earlier = {}
    for d in window:
        for t in sets[d]:
            if t not in today and t not in before:
                earlier[t] = d  # ascending → ค่าสุดท้าย = วันล่าสุดที่อยู่
    return cal, sets, prev, current, dropped, earlier


def build_growth(ctx, day):
    fname = "lekkung"
    cal, sets, prev, current, dropped, earlier = scan_status(ctx, fname, day)
    raw = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(day, fname)))}
    wd, days_src = align_to_web(ctx, fname, "lekkung", day, cal, sets, prev, current, dropped,
                                lambda: web_days(ctx, fname, day))
    mem = scan_membership(ctx, day)
    flags = ctx.flags_file.get("flags") or {}
    rows = []
    for t, st in current.items():
        r = raw.get(t, {})
        close, ema10, hi52 = num(r.get("Close")), num(r.get("EMA_10")), num(r.get("52W_High"))
        cp = chart_price(ctx, t, day)
        rows.append({
            "ticker": t, **st, "days_web": wd.get(t),
            "close": close, "chg_pct": rnd(r.get("Change_Pct"), 2),
            "pe": rnd(r.get("PE_Ratio"), 2), "roe_pct": rnd(num(r.get("ROE")) * 100, 2) if num(r.get("ROE")) is not None else None,
            "roe": num(r.get("ROE")),  # ค่าดิบ — หน้าเว็บปัดแบบเดียวกับ /lekkung ((ROE*100).toFixed(1))
            "rev_gr_fy": rnd(r.get("Revenue_Growth_YoY"), 2), "rev_gr_period": r.get("Rev_Growth_Period_End"),
            "profit_gr_q_yoy": rnd(r.get("NetProfit_Growth_QoQY"), 2), "profit_gr_quarter": r.get("Growth_Quarter"),
            "growth_quarter_end": r.get("Growth_Quarter_End"),  # หน้า /lekkung ใช้ quarterShort(Growth_Quarter_End)
            "growth_stale": r.get("Growth_Stale"),
            "ema10": ema10,
            "vs_ema10": rnd(close - ema10, 4) if close is not None and ema10 is not None else None,
            "vs_ema10_pct": rnd((close / ema10 - 1) * 100, 2) if close is not None and ema10 else None,
            "high_52w": hi52,
            "pct_from_52w_high": rnd((close / hi52 - 1) * 100, 2) if close is not None and hi52 else None,
            "value_mb_1d": rnd(r.get("ADTV_MB"), 2),
            "price_stale": cp["price_stale"], "bar_date": cp["bar_date"],
            "in_scans": scans_of(mem, t), "events": flags.get(t, []),
        })
    rows.sort(key=lambda x: (-(x["value_mb_1d"] or 0), x["ticker"]))

    def drop_row(t, extra):
        cp = chart_price(ctx, t, day)
        return {"ticker": t, **extra, **cp, "in_scans": scans_of(mem, t), "events": flags.get(t, [])}

    drops = sorted((drop_row(t, st) for t, st in dropped.items()), key=lambda x: x["ticker"])
    earlier_rows = sorted((drop_row(t, {"status": "dropped_earlier", "last_seen": d}) for t, d in earlier.items()),
                          key=lambda x: (x["last_seen"], x["ticker"]), reverse=True)
    rc = ((load_json(os.path.join(ctx.scans, "report_card.json")) or {}).get("scans") or {}).get("lekkung_growth") or {}
    count = lambda v: sum(1 for r in rows if r["status"] == v)  # noqa: E731
    return {
        "scan": fname, "page": "/lekkung", "date": day, "compared_to": prev,
        "generated_at": (load_json(os.path.join(ctx.scans, "generated_at.json")) or {}).get("lekkung"),
        "counts": {"total": len(rows), "prev_total": len(sets.get(prev, ())) if prev else None,
                   "new": count("new"), "reentry": count("reentry"), "stay": count("stay"),
                   "dropped": len(drops), "dropped_earlier": len(earlier_rows)},
        "lookback_days": LOOKBACK_DAYS, "days_source": days_src,
        "signal_d10": (rc.get("horizons") or {}).get("10"),
        "report_card_href": "/report-card/lekkung_growth",
        "rows": rows, "dropped": drops, "dropped_earlier": earlier_rows,
    }


SEPA_ROW_FIELDS = ["Ticker", "Price", "RS_Rating", "%_From_High", "ADTV(MB)", "Fundamental_Pass", "52W_High",
                   "VCP_T", "VCP_Contracting", "VCP_ToPivot", "VCP_Pivot", "VCP_Footprint", "VCP_Weeks",
                   "VCP_MaxDepth", "VCP_FinalDepth", "VCP_VolRatio"]
SEPA_PREV_FIELDS = ["Ticker", "RS_Rating", "%_From_High", "ADTV(MB)", "Fundamental_Pass"]


def build_sepa(ctx, day):
    """ใส่แถวดิบ (เฉพาะฟิลด์ที่สูตร/หน้า /sepa ใช้) — หน้าเว็บคิด score / rank / กลุ่ม ด้วย lib เดียวกับ /sepa"""
    fname = "sepa"
    cal, sets, prev, current, dropped, _earlier = scan_status(ctx, fname, day)
    wd, days_src = align_to_web(ctx, fname, "sepa", day, cal, sets, prev, current, dropped,
                                lambda: web_days(ctx, fname, day))
    raw = rows_of(load_json(ctx.hist_path(day, fname)))
    prev_raw = rows_of(load_json(ctx.hist_path(prev, fname))) if prev else []
    mem = scan_membership(ctx, day)
    flags = ctx.flags_file.get("flags") or {}
    rows = []
    for r in raw:
        t = r.get("Ticker")
        if t not in current:
            continue
        cp = chart_price(ctx, t, day)
        price = num(r.get("Price"))
        rows.append({**{k: r.get(k) for k in SEPA_ROW_FIELDS}, **current[t], "days_web": wd.get(t),
                     "chg_pct": cp["chg_pct"], "price_stale": cp["price_stale"], "bar_date": cp["bar_date"],
                     "price_check": None if cp["price_stale"] or price is None
                     else ("ok" if abs(cp["close"] - price) < 1e-6 else "mismatch"),
                     "in_scans": scans_of(mem, t), "events": flags.get(t, [])})
    prev_rows = [{k: r.get(k) for k in SEPA_PREV_FIELDS} for r in prev_raw]
    drops = []
    for t, st in dropped.items():
        drops.append({"ticker": t, **st, **chart_price(ctx, t, day), "in_scans": scans_of(mem, t),
                      "events": flags.get(t, [])})
    drops.sort(key=lambda x: x["ticker"])
    web = load_json(os.path.join(ctx.scans, "sepa_diff.json")) or {}
    web_diff = None
    if web.get("currentDate") == day:
        web_diff = {"previous_date": web.get("previousDate"), "new": len(web.get("newTickers") or []),
                    "dropped": len(web.get("droppedTickers") or []),
                    "new_tickers": web.get("newTickers") or [],
                    "dropped_tickers": [x.get("ticker") for x in web.get("droppedTickers") or []]}
    rc = ((load_json(os.path.join(ctx.scans, "report_card.json")) or {}).get("scans") or {}).get("sepa") or {}
    n = lambda v: sum(1 for r in rows if r["status"] == v)  # noqa: E731
    return {
        "scan": fname, "page": "/sepa", "date": day, "compared_to": prev,
        "generated_at": (load_json(os.path.join(ctx.scans, "generated_at.json")) or {}).get("sepa"),
        "counts": {"total": len(rows), "new": n("new"), "reentry": n("reentry"), "stay": n("stay"), "dropped": len(drops)},
        "web_diff": web_diff, "lookback_days": LOOKBACK_DAYS, "days_source": days_src,
        "signal_d10": (rc.get("horizons") or {}).get("10"), "report_card_href": "/report-card/sepa",
        "rows": rows, "prev_rows": prev_rows, "dropped": drops,
    }


STAGE_ORDER = ["Accumulation", "Recovery", "Bull", "S.Bull", "Warning", "Distribution", "Bear", "IPO"]
STAGE_GROUPS = [
    ("base", "Accumulation + Recovery", ["Accumulation", "Recovery"]),
    ("strong", "Bull + S.Bull", ["Bull", "S.Bull"]),
    ("weak", "Warning + Distribution", ["Warning", "Distribution"]),
    ("bear", "Bear", ["Bear"]),
]
FOCUS_STAGES = {"Accumulation", "Recovery"}
STAGE_LIST_N = 20
WATCH_MIN_ADTV_MB = 1.0
WATCH_MIN_PRICE = 1.0
FLIP_DAYS = 5


def build_market_stage(ctx, day):
    fname = "market_stage"
    cal = scan_days(ctx.trading_days, lambda d: ctx.has(d, fname))
    if day not in cal:
        raise ValueError(f"market_stage: ไม่มีไฟล์ของวันที่ {day}")
    i = cal.index(day)
    prev = cal[i - 1] if i > 0 else None
    rows = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(day, fname))) if r.get("Ticker")}
    if not rows:
        raise ValueError("market_stage: ไฟล์ว่างหรืออ่านไม่ได้")
    prev_rows = {r["Ticker"]: r for r in rows_of(load_json(ctx.hist_path(prev, fname)))} if prev else {}
    wein = {r.get("Ticker"): r for r in rows_of(load_json(ctx.hist_path(day, "weinstein")))}

    # เหวี่ยงใน 5 วัน: จำนวนครั้งที่ stage เปลี่ยนระหว่างวันสแกนติดกัน ใน 5 วันล่าสุด (ถึง day)
    span = cal[max(0, i - FLIP_DAYS):i + 1]
    stage_by_day = {d: {r.get("Ticker"): r.get("Stage") for r in rows_of(load_json(ctx.hist_path(d, fname)))}
                    for d in span}
    flips = {}
    for a, b in zip(span, span[1:]):
        for t, s_b in stage_by_day[b].items():
            s_a = stage_by_day[a].get(t)
            if s_a is not None and s_a != s_b:
                flips[t] = flips.get(t, 0) + 1

    def counts_of(rs):
        c = {"stock": {s: 0 for s in STAGE_ORDER}, "fund": {s: 0 for s in STAGE_ORDER}}
        for t, r in rs.items():
            side = "fund" if ctx.is_fund(t) else "stock"
            st = r.get("Stage")
            c[side][st] = c[side].get(st, 0) + 1
        return c

    cnt, cnt_prev = counts_of(rows), counts_of(prev_rows) if prev_rows else None
    stale = []

    def detail(t, r):
        cp = chart_price(ctx, t, day)
        if cp["price_stale"]:
            stale.append(t)
        price, ema200 = num(r.get("Price")), num(r.get("EMA200"))
        roe = num(r.get("ROE"))
        return {"ticker": t, "is_fund": ctx.is_fund(t), "price": price, "chg_pct": cp["chg_pct"],
                "price_stale": cp["price_stale"], "bar_date": cp["bar_date"],
                "ema50": num(r.get("EMA50")), "ema200": ema200,
                "vs_ema200_pct": rnd((price / ema200 - 1) * 100, 2) if price is not None and ema200 else None,
                "adtv_mb": num(r.get("ADTV(MB)")), "pe": rnd(r.get("PE_Ratio"), 2),
                "roe_pct": rnd(roe * 100, 2) if roe is not None else None,
                "days_in_stage": r.get("Bar_Count"), "flips_5d": flips.get(t, 0)}

    focus, others = [], {}
    total_moves = 0
    for t, r in rows.items():
        pr = prev_rows.get(t)
        if not pr or pr.get("Stage") == r.get("Stage"):
            continue
        total_moves += 1
        frm, to = pr.get("Stage"), r.get("Stage")
        if frm in FOCUS_STAGES or to in FOCUS_STAGES:
            d = detail(t, r)
            d.update({"from": frm, "to": to, "to_bear": to == "Bear",
                      "watch": (d["adtv_mb"] or 0) >= WATCH_MIN_ADTV_MB and (d["price"] or 0) >= WATCH_MIN_PRICE})
            focus.append(d)
        else:
            others.setdefault((frm, to), []).append((num(r.get("ADTV(MB)")) or 0, t))
    focus.sort(key=lambda x: (-(x["adtv_mb"] or 0), x["ticker"]))
    summary = [{"from": f, "to": to, "count": len(v),
                "examples": [t for _, t in sorted(v, key=lambda x: (-x[0], x[1]))[:3]]}
               for (f, to), v in others.items()]
    summary.sort(key=lambda x: (-x["count"], x["from"], x["to"]))

    lists = {}
    for st in STAGE_ORDER:
        members = [(t, r) for t, r in rows.items() if r.get("Stage") == st and not ctx.is_fund(t)]
        # ลำดับเดียวกับค่าเริ่มต้นของหน้า /market-stage (app/market-stage/page.tsx: b.Bar_Count - a.Bar_Count)
        # วันใน stage มาก → น้อย · เสมอกันคงลำดับไฟล์ (Array.sort ของ JS stable เหมือน Python)
        members.sort(key=lambda x: -(x[1].get("Bar_Count") or 0))
        out = []
        for t, r in members[:STAGE_LIST_N]:
            d = detail(t, r)
            hi = num((wein.get(t) or {}).get("52W_High"))
            d["pct_from_52w_high"] = rnd((d["price"] / hi - 1) * 100, 2) if d["price"] is not None and hi else None
            out.append(d)
        lists[st] = {"count": len(members), "rows": out}

    # ราคาค้างของทั้งชุด (ทุกหุ้นใน market_stage) — นับแยกจากรายการที่แสดง
    stale_all = sorted(t for t in rows if chart_price(ctx, t, day)["price_stale"])
    return {
        "scan": fname, "page": "/market-stage", "date": day, "compared_to": prev,
        "stage_order": STAGE_ORDER,
        "groups": [{"key": k, "label": lab, "stages": sts} for k, lab, sts in STAGE_GROUPS],
        "counts": cnt, "counts_prev": cnt_prev,
        "total_stock": sum(cnt["stock"].values()), "total_fund": sum(cnt["fund"].values()),
        "transitions_total": total_moves,
        "focus": focus, "summary": summary,
        "focus_rule": {"stages": sorted(FOCUS_STAGES), "watch_min_adtv_mb": WATCH_MIN_ADTV_MB,
                       "watch_min_price": WATCH_MIN_PRICE},
        "lists": lists, "list_limit": STAGE_LIST_N, "flip_days": FLIP_DAYS,
        "price_stale": stale_all,
    }


# ─── ประโยคอธิบายจากกติกา (ไม่มี AI · ไม่มีข่าว) ────────────────────────────
# ตัวเลขในประโยคมาจากฟิลด์เดียวกับตาราง · SEPA สร้างฝั่งหน้าเว็บ (lib/dailyReportTabs) เพราะอันดับ/Score/Pivot
# ต้องมาจาก lib ตัวเดียวกับหน้า /sepa — ห้ามคัดลอกสูตรมาไว้ใน Python

TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
NAMES_MAX = 3
EMA10_THIN_PCT = 1.0
NEAR_HIGH_PCT_GROWTH = 3.0
THIN_VALUE_GROWTH_MB = 5.0
FLIP_WARN = 3

# เกณฑ์ Daytrade ที่ตก → คำพูดธรรมดา (key ตรงกับ CRITERIA)
DROP_REASON_TH = {
    "common_stock": "ไม่ใช่หุ้นสามัญ",
    "close_gt_1": "ราคาต่ำกว่า 1 บาท",
    "close_gt_ema200": "ราคาหลุด EMA200",
    "chg_gt_0": "ราคาวันนี้ไม่บวก",
    "vol_gt_1m": "วอลุ่มวันนี้ไม่ถึง 1 ล้านหุ้น",
    "rsi7_gt_50": "RSI7 ไม่ถึง 50",
    "avgvol10_1m_50m": "วอลุ่มเฉลี่ย 10 วันไม่อยู่ในช่วง 1–50 ล้านหุ้น",
    "adx_gt_20": "ADX ไม่ถึง 20",
    "tech_ge_buy": "Tech Rating ต่ำกว่า Buy",
}


def th_date(iso):
    """'2026-11-23' → '23 พ.ย.'"""
    try:
        d = Date.fromisoformat(str(iso)[:10])
        return f"{d.day} {TH_MONTHS[d.month - 1]}"
    except Exception:
        return "—"


def names(ts, n=NAMES_MAX):
    ts = list(ts)
    if len(ts) <= n:
        return ", ".join(ts)
    return ", ".join(ts[:n]) + f" + อีก {len(ts) - n} ตัว"


def pct_txt(v, nd=2, sign=True):
    return "—" if v is None else (f"{v:+.{nd}f}%" if sign else f"{v:.{nd}f}%")


def price_txt(v):
    return "—" if v is None else f"{v:,.2f}"


def shares_txt(v):
    return "—" if v is None else f"{v / 1e6:.2f} ล้านหุ้น"


def count_change(n, prev, noun="สแกน"):
    if prev is None:
        return f"{noun} {n} ตัว"
    if n > prev:
        return f"{noun}เพิ่มเป็น {n} ตัว (จาก {prev})"
    if n < prev:
        return f"{noun}หดเหลือ {n} ตัว (จาก {prev})"
    return f"{noun}ทรงตัวที่ {n} ตัว"


def change_notes(rows, dropped, extra_reason=None):
    """คำอธิบายใต้กล่องเปลี่ยนแปลง: กลับเข้า → วันล่าสุด · หลุด → อยู่รอบเดียว / หลุดเพราะ…"""
    new = [r for r in rows if r["status"] == "new"]
    out = {"new": None, "reentry": None, "dropped": None, "dropped_items": {}, "new_items": {}}
    for r in new:  # NEW ตามหน้าสแกน · ข้อมูลเสริม: เคยอยู่ใน 10 วันทำการก่อนหน้าไหม
        out["new_items"][r["ticker"]] = (f"เคยอยู่ล่าสุด {th_date(r['seen_before'])}" if r.get("seen_before")
                                         else f"ครั้งแรกใน {LOOKBACK_DAYS} วันทำการ")
    if new:
        out["new"] = " · ".join(f"{t} {v}" for t, v in out["new_items"].items())
    parts = []
    for d in dropped:
        why = []
        if extra_reason:
            why += extra_reason(d)
        if d.get("days_before_drop") == 1:
            why.append("อยู่รอบนี้แค่วันเดียว")
        elif d.get("days_before_drop"):
            why.append(f"อยู่มา {d['days_before_drop']} วัน")
        txt = " · ".join(why)
        out["dropped_items"][d["ticker"]] = txt
        parts.append(f"{d['ticker']}: {txt}" if txt else d["ticker"])
    if parts:
        out["dropped"] = " · ".join(parts)
    return out


def notes_daytrade(dt):
    rows, c = dt["rows"], dt["counts"]
    head = count_change(c["total"], c.get("prev_total"))
    if not rows:
        dt["headline"] = f"{head} — วันนี้ไม่มีหุ้นผ่านเกณฑ์ Daytrade"
    else:
        top = max((r for r in rows if r.get("rel_vol") is not None), key=lambda r: r["rel_vol"], default=None)
        # เข้าใหม่ / หลุด = ตัวเลขเดียวกับป้าย NEW และรายการหลุดของหน้าสแกน
        head += f" (เข้าใหม่ {c.get('new', 0)} · หลุด {c.get('dropped', len(dt.get('dropped') or []))})"
        bits = [head]
        if top:
            word = {"hi": "วอลุ่มมาแรงสุด", "mid": "วอลุ่มมากสุด", "lo": "วอลุ่มมากสุดแต่ยังไม่ถึงค่าเฉลี่ย"}.get(top["rv_tier"], "วอลุ่มมากสุด")
            bits.append(f"— {top['ticker']} {word} {top['rel_vol']:.2f} เท่า")
        # "อีก M ตัว" ไม่นับตัวที่ถูกเอ่ยชื่อแล้ว
        lo = sum(1 for r in rows if r.get("rv_tier") == "lo" and r is not top)
        if lo and lo == len(rows) - 1 and top and top.get("rv_tier") == "lo":
            bits.append("· ทุกตัววอลุ่มยังไม่มา")
        elif lo:
            bits.append(f"· อีก {lo} ตัววอลุ่มยังไม่มา")
        dt["headline"] = " ".join(bits)
    for r in rows:
        r["watch"] = watch_daytrade(r)
    dt["change_notes"] = change_notes(
        rows, dt["dropped"],
        lambda d: [f"หลุดเพราะ{DROP_REASON_TH.get(k, k)}" for k, v in (d.get("check") or {}).get("criteria", {}).items() if v == "fail"])


RV_SUFFIX = {"hi": "วอลุ่มมาจริง", "mid": "วอลุ่มเกือบมา", "lo": "วอลุ่มยังไม่มา อย่าไล่"}


def watch_daytrade(r):
    if r.get("price_stale"):
        return ["⚠️ ราคาค้าง — ไม่มีจุดซื้อ/ทิ้งของวันนี้"]
    mv = shares_txt(r.get("min_vol_1030"))
    if r.get("trigger") is not None:
        buy = f"ผ่าน {price_txt(r['trigger'])} + ถึง 10:30 วอลุ่ม ≥ {mv} → ลุ้นต่อ"
    else:
        buy = f"ทำ High ใหม่เหนือ {price_txt(r.get('close'))} + ถึง 10:30 วอลุ่ม ≥ {mv} → ลุ้นต่อ"
    first = f"{buy} · หลุด {price_txt(r.get('stop'))} = จบรอบ"
    return [first, RV_SUFFIX[r["rv_tier"]]] if r.get("rv_tier") in RV_SUFFIX else [first]


def notes_growth(g):
    rows, c = g["rows"], g["counts"]
    bits = [count_change(c["total"], c.get("prev_total"))]
    ins = [r["ticker"] for r in rows if r["status"] in ("new", "reentry")]
    clauses = []
    if ins:
        clauses.append(f"{names(ins)} เข้ามา")
    if g["dropped"]:
        clauses.append(f"{names(d['ticker'] for d in g['dropped'])} หลุดไป")
    up = max((r for r in rows if r.get("chg_pct") is not None), key=lambda r: r["chg_pct"], default=None)
    if up and up["chg_pct"] > 0:
        clauses.append(f"{up['ticker']} บวกแรงสุด {pct_txt(up['chg_pct'])}")
    elif rows:
        clauses.append("วันนี้ไม่มีตัวไหนบวก")
    near = max((r for r in rows if r.get("pct_from_52w_high") is not None), key=lambda r: r["pct_from_52w_high"], default=None)
    if near:
        clauses.append(f"{near['ticker']} ใกล้ High สุด (ห่าง {abs(near['pct_from_52w_high']):.1f}%)")
    g["headline"] = bits[0] + (" — " + " · ".join(clauses) if clauses else "")
    for r in rows:
        r["watch"] = watch_growth(r)
    g["change_notes"] = change_notes(rows, g["dropped"])


def watch_growth(r):
    out = []
    v = r.get("vs_ema10_pct")
    if v is not None and v < 0:
        out.append(f"ราคาต่ำกว่า EMA10 ({pct_txt(v)}) — เส้นถูกหลุดแล้ว ระวัง")
    elif v is not None and v < EMA10_THIN_PCT:
        out.append(f"เกาะ EMA10 บาง ({pct_txt(v)}) — หลุดเส้นคือสัญญาณเปลี่ยน")
    h = r.get("pct_from_52w_high")
    if h is not None and h >= -NEAR_HIGH_PCT_GROWTH:
        out.append(f"ใกล้ High รอบปี {price_txt(r.get('high_52w'))} อีก {abs(h):.1f}% — จับตาเบรค")
    if r.get("status") == "new" and r.get("seen_before"):
        out.append(f"เพิ่งกลับเข้ามา (เคยอยู่ล่าสุด {th_date(r.get('seen_before'))})")
    val = r.get("value_mb_1d")
    if val is not None and val < THIN_VALUE_GROWTH_MB:
        out.append(f"สภาพคล่องบาง (มูลค่าวันนี้ {val:.1f} ลบ.)")
    if r.get("price_stale"):
        out.insert(0, "⚠️ ราคาค้าง")
    if not out:
        hi_txt = "—" if h is None else f"{abs(h):.1f}%"
        out.append(f"เหนือ EMA10 {pct_txt(v)} · ห่าง High รอบปี {hi_txt} — แนวโน้มยังปกติ")
    return out[:2]


GROUP_SHORT = {"base": "กลุ่มสะสม/ฟื้นตัว", "strong": "กลุ่มแข็งแรง (Bull/S.Bull)",
               "weak": "กลุ่มอ่อนแรง (Warning/Distribution)", "bear": "ขาลง (Bear)"}


def notes_stage(ms):
    st, prev = ms["counts"]["stock"], (ms.get("counts_prev") or {}).get("stock")
    total = ms["total_stock"] or 0
    grp = {g["key"]: g["stages"] for g in ms["groups"]}
    n = lambda c, k: sum((c or {}).get(s, 0) for s in grp.get(k, []))  # noqa: E731
    base = n(st, "base")
    d = base - n(prev, "base") if prev else None
    dtxt = "" if d is None else (f" ({d:+d} จากวันก่อน)" if d else " (เท่าวันก่อน)")
    share = {k: (n(st, k) / total * 100 if total else 0) for k in grp}
    top = max(share, key=share.get) if share else None
    if top == "bear":
        tail = f"ขาลงยังครอง {share['bear']:.1f}% ของหุ้นสามัญ"
    elif top:
        tail = f"{GROUP_SHORT.get(top, top)} มากสุด {share[top]:.1f}% ของหุ้นสามัญ"
    else:
        tail = ""
    moved = f" · ย้าย stage วันนี้ {ms['transitions_total']} ตัว"
    ms["headline"] = f"{GROUP_SHORT['base']} {base} ตัว{dtxt} — {tail}{moved}"
    for m in ms["focus"]:
        m["notes"] = watch_stage(m)  # "watch" ของแถวนี้คือธง น่าดู (bool) — ห้ามทับ


def watch_stage(m):
    out = []
    if m.get("price_stale"):
        out.append("⚠️ ราคาค้าง")
    if (m.get("flips_5d") or 0) >= FLIP_WARN:
        out.append(f"เหวี่ยง {m['flips_5d']} รอบใน 5 วัน — ยังไม่นิ่ง")
    v = m.get("vs_ema200_pct")
    if v is not None and v >= 0:
        out.append("ยืนเหนือ EMA200 แล้ว")
    elif v is not None:
        out.append(f"ยังใต้ EMA200 ({price_txt(m.get('ema200'))}) — รอยืนให้ได้ก่อน")
    return out[:2]


def latest_scan_day(ctx, fname="lekkung_daytrade"):
    cal = scan_days(ctx.trading_days, lambda d: ctx.has(d, fname))
    return cal[-1] if cal else None


def fallback_day(ctx):
    """ไม่มี breadth.json / ไม่มีวันทำการ → โฟลเดอร์ history ล่าสุด (ยังเขียนไฟล์ได้ พร้อม warnings)"""
    try:
        ds = sorted(d for d in os.listdir(ctx.hist) if d[:1].isdigit())
        return ds[-1] if ds else None
    except Exception:
        return None


def build(root, day=None):
    """แต่ละส่วนคำนวณแยก try — ส่วนไหนพัง → null + ข้อความใน warnings แล้วทำส่วนอื่นต่อ"""
    warnings = []
    ctx = Ctx(root)
    if not ctx.trading_days:
        warnings.append("breadth.json: ไม่มี set_index — ไม่รู้วันทำการ")
    day = day or latest_scan_day(ctx) or fallback_day(ctx)
    if day and ctx.trading_days and day not in ctx.trading_days:
        warnings.append(f"{day} ไม่มีแท่ง SET ใน breadth.json (ไม่ใช่วันทำการ?)")

    def section(name, fn):
        if not day:
            warnings.append(f"{name}: ไม่มีวันที่ให้คำนวณ")
            return None
        try:
            return fn(ctx, day)
        except Exception as e:  # noqa: BLE001 — ส่วนเดียวพังต้องไม่ล้มทั้งไฟล์
            warnings.append(f"{name}: {type(e).__name__}: {e}")
            return None

    dt = section("daytrade", build_daytrade)
    if day and dt is None and not any(w.startswith("daytrade") for w in warnings):
        warnings.append(f"daytrade: ไม่มีไฟล์ของวันที่ {day}")
    report = {
        "schema_version": SCHEMA_VERSION,
        "date": day,
        "compared_to": dt["compared_to"] if dt else None,
        "generated_at": datetime.now(BANGKOK_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00"),
        "market": section("market", build_market),
        "calendar": section("calendar", build_calendar),
        "daytrade": dt,
        "growth": section("growth", build_growth),
        "sepa": section("sepa", build_sepa),
        "market_stage": section("market_stage", build_market_stage),
    }
    if report["compared_to"] is None:
        for k in ("growth", "sepa", "market_stage"):
            if report[k]:
                report["compared_to"] = report[k]["compared_to"]
                break
    # ประโยคอธิบาย (กติกาในโค้ด ไม่มี AI) — แยก try ต่อแท็บ · พัง → แท็บนั้นไม่มีประโยค แต่ตัวเลขยังอยู่
    for name, fn in (("daytrade", notes_daytrade), ("growth", notes_growth), ("market_stage", notes_stage)):
        if report.get(name):
            try:
                fn(report[name])
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{name} notes: {type(e).__name__}: {e}")
    report["warnings"] = warnings
    return report


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (default: latest scan day)")
    ap.add_argument("--out", default=None, help="output path (default data/scans/daily_report.json)")
    ap.add_argument("--root", default=STOCKDESK_DIR, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    try:
        report = build(args.root, args.date)
    except Exception as e:  # noqa: BLE001 — สุดท้ายจริง ๆ ก็ยังเขียนไฟล์ (ทุกส่วน null)
        report = {"schema_version": SCHEMA_VERSION, "date": args.date, "compared_to": None,
                  "generated_at": datetime.now(BANGKOK_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00"),
                  "market": None, "calendar": None, "daytrade": None, "growth": None, "sepa": None,
                  "market_stage": None, "warnings": [f"build: {type(e).__name__}: {e}"]}
    out = args.out or os.path.join(args.root, "data", "scans", "daily_report.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    parts = {k: ("ok" if report.get(k) else "null") for k in ("market", "calendar", "daytrade", "growth", "sepa", "market_stage")}
    print(f"  daily_report {report['date']} vs {report['compared_to']}: {parts} warnings={report['warnings']} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
