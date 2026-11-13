"""
compute_scan_days.py  –  Compute how many consecutive days each ticker has been
in a given scanner's list, using the daily snapshots under data/history/.

Output: data/scans/scan_days.json
    { "lekkung": {"AAA": 3, ...}, "oneil": {...}, "sepa": {...}, "kell": {...} }

lekkung / oneil / sepa / kell / breakout: DAYS = scan days since the start of the
CURRENT setup (scan_setups.py: a setup ends only after 5 scan days out in a row,
so 1-4 days out still count). lekkung_daytrade / market-stage / stage-analysis
keep the old rule (consecutive days, any day out resets to 1).

Run AFTER the daily snapshot step so today's snapshot is included.
Usage:
    python -X utf8 compute_scan_days.py
    python -X utf8 compute_scan_days.py --out <scratch>/scan_days.json   # testing
"""

import argparse
import json
import os
from datetime import datetime

from scan_calendar import valid_dates
from scan_setups import SETUP_RULE_SCANS, current_setup

# page key -> history/scan filename (without .json)
SCANNERS = {
    "lekkung": "lekkung",
    "lekkung_daytrade": "lekkung_daytrade",
    "oneil": "oneil",
    "sepa": "sepa",
    "kell": "oliver_kell",
    "breakout": "breakout",
    "market-stage": "market_stage",
    "stage-analysis": "weinstein",
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


def _is_weekday(dstr: str) -> bool:
    try:
        return datetime.fromisoformat(dstr).weekday() < 5
    except ValueError:
        return False


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None, help="output path (default data/scans/scan_days.json)")
    args = ap.parse_args(argv)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    hist_dir = os.path.join(stockdesk_dir, "data", "history")
    scans_dir = os.path.join(stockdesk_dir, "data", "scans")

    # เดินแค่วันจันทร์-ศุกร์ - บางโฟลเดอร์เสาร์-อาทิตย์มี <scan>.json ค้างอยู่
    # (catch-up run ที่บันทึกผิดวันที่) ถ้านับด้วยจะเป็นสแกนของตัวเองปลอม ทำให้
    # streak บวมเกินจริง (เคยพบ: AMATA sepa DAYS=72 ทั้งที่วันทำการจริงมีแค่ 57)
    dates = sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[0].isdigit() and _is_weekday(d)
    )
    print(f"  History dates: {len(dates)} ({dates[0]}..{dates[-1]})" if dates else "  No history dates")

    result = {}
    for key, fname in SCANNERS.items():
        # นับ streak เฉพาะ "วันที่สแกนตัวนี้ได้ผลออกมาจริง" (ไฟล์มีอยู่) - วันที่
        # pipeline ขาดจะอ่านได้เป็นลิสต์ว่างแล้วตัด streak ทิ้งทั้งที่หุ้นไม่ได้หลุด
        # ไปไหน ทำให้ DAYS ของทุก scan ชนเพดานเท่ากันหมดที่ "จำนวนวันตั้งแต่ pipeline
        # ขาดครั้งล่าสุด" (ก่อนแก้: ทุก scan max = 26 = วันที่ขาดล่าสุดคือ 2026-07-26)
        # วันที่ไฟล์มีอยู่แต่หุ้นไม่อยู่ในลิสต์ = หลุดจริง ยังตัด streak ตามเดิม
        vdates = valid_dates(hist_dir, fname, dates)
        date_sets = {}
        for d in vdates:
            date_sets[d] = tickers_of(load_json(os.path.join(hist_dir, d, f"{fname}.json")))

        current = tickers_of(load_json(os.path.join(scans_dir, f"{fname}.json")))
        streaks = {}
        if fname in SETUP_RULE_SCANS:
            # weekday + file exists = a scan day (vdates already is exactly that)
            hits_by_ticker = {}
            for d in vdates:
                for t in date_sets[d]:
                    hits_by_ticker.setdefault(t, []).append(d)
            for ticker in current:
                cs = current_setup(hits_by_ticker.get(ticker, []), vdates)
                streaks[ticker] = max(cs["days"] if cs else 1, 1)
            result[key] = streaks
            print(f"    {key}: {len(streaks)} tickers, {len(vdates)}/{len(dates)} valid dates, "
                  f"max days = {max(streaks.values(), default=0)} (setup rule)")
            continue
        for ticker in current:
            streak = 0
            for d in reversed(vdates):
                if ticker in date_sets.get(d, set()):
                    streak += 1
                else:
                    break
            streaks[ticker] = max(streak, 1)  # present today => at least 1
        result[key] = streaks
        print(f"    {key}: {len(streaks)} tickers, {len(vdates)}/{len(dates)} valid dates, "
              f"max streak = {max(streaks.values(), default=0)}")

    out_file = args.out or os.path.join(scans_dir, "scan_days.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Saved: {out_file}")


if __name__ == "__main__":
    main()
