# -*- coding: utf-8 -*-
"""
enrich_earnings_pead.py - Enrich earnings_feed.json with PEAD (Post-Earnings Announcement Drift)
gap_pct, drift_d1_pct, drift_d2_pct, and drift_d5_pct using Yahoo Finance 3-month daily series.

Usage:
    python scripts/enrich_earnings_pead.py
"""

import json
import math
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
FEED_PATH = os.path.join(PROJECT_ROOT, 'public', 'data', 'earnings', 'earnings_feed.json')

SERIES_CACHE = {}

def yahoo_series(ticker):
    """
    Fetch Yahoo chart series (open, close) for ticker.BK over 3mo interval=1d.
    Returns list of (date_str, open_price, close_price).
    Retries up to 2x (3 total attempts) with sleep 0.05s between calls.
    """
    if ticker in SERIES_CACHE:
        return SERIES_CACHE[ticker]
    
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.BK?interval=1d&range=3mo"
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    )
    
    series = []
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                d = json.load(resp)
            res = d['chart']['result'][0]
            ts = res.get('timestamp') or []
            q = res['indicators']['quote'][0]
            opens = q.get('open') or []
            closes = q.get('close') or []
            gmt = res['meta'].get('gmtoffset', 25200)
            tz = timezone(timedelta(seconds=gmt))
            
            for i, t in enumerate(ts):
                if t is None or i >= len(opens) or i >= len(closes):
                    continue
                if opens[i] is None or closes[i] is None:
                    continue
                ds = datetime.fromtimestamp(t, tz=tz).strftime('%Y-%m-%d')
                series.append((ds, opens[i], closes[i]))
            break
        except Exception:
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
            else:
                series = []
                
    SERIES_CACHE[ticker] = series
    time.sleep(0.05)  # Rate limit protection
    return series

def compute_pead(ticker, announce_iso):
    """
    Compute Gap % and Drift (D+1, D+2, D+5) % based on announcement hour and Yahoo daily series.
    Returns dict with gap_pct, drift_d1_pct, drift_d2_pct, drift_d5_pct or {} if data insufficient.
    """
    series = yahoo_series(ticker)
    if len(series) < 2:
        return {}
    
    dates = [s[0] for s in series]
    idx = {d: i for i, d in enumerate(dates)}
    a_date = announce_iso[:10]
    
    try:
        a_hour = int(announce_iso[11:13])
    except (ValueError, IndexError):
        return {}
    
    if a_date in idx:
        ai = idx[a_date]
        if a_hour < 10:            # ก่อนเปิด → T0=วันประกาศ, pre=ปิดวันก่อน, reaction=เปิดวันประกาศ
            if ai == 0:
                return {}
            t0 = ai
            pre = series[ai - 1][2]
            reaction = series[ai][1]
        elif a_hour < 16:          # เทรด → T0=วันประกาศ, pre=ปิดวันก่อน, reaction=ปิดวันประกาศ
            if ai == 0:
                return {}
            t0 = ai
            pre = series[ai - 1][2]
            reaction = series[ai][2]
        else:                      # หลังปิด → T0=วันถัดไป, pre=ปิดวันประกาศ, reaction=เปิดวันถัดไป
            if ai + 1 >= len(series):
                return {}
            t0 = ai + 1
            pre = series[ai][2]
            reaction = series[t0][1]
    else:
        # ประกาศวันหยุด → T0=วันทำการถัดไป, pre=ปิดวันทำการก่อนหน้า
        after = [i for i, d in enumerate(dates) if d > a_date]
        before = [i for i, d in enumerate(dates) if d < a_date]
        if not after or not before:
            return {}
        t0 = after[0]
        pre = series[before[-1]][2]
        reaction = series[t0][1]
        
    if pre is None or reaction is None or pre <= 0 or not math.isfinite(pre) or not math.isfinite(reaction):
        return {}
        
    gap = (reaction / pre - 1) * 100
    d1c = series[t0 + 1][2] if t0 + 1 < len(series) else None
    d2c = series[t0 + 2][2] if t0 + 2 < len(series) else None
    d5c = series[t0 + 5][2] if t0 + 5 < len(series) else None
    
    def safe(v):
        return round((v / pre - 1) * 100, 2) if (v is not None and math.isfinite(v)) else None
        
    g = round(gap, 2) if math.isfinite(gap) else None
    return {
        'gap_pct': g,
        'drift_d1_pct': safe(d1c),
        'drift_d2_pct': safe(d2c),
        'drift_d5_pct': safe(d5c)
    }

def main():
    if not os.path.exists(FEED_PATH):
        print(f"ERROR: File not found: {FEED_PATH}")
        sys.exit(1)
        
    with open(FEED_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    if isinstance(data, dict) and 'announcements' in data:
        recs = data['announcements']
    elif isinstance(data, list):
        recs = data
    else:
        recs = list(data.values())[0]
        
    count_before = len(recs)
    print(f"Loaded {count_before} announcement records from earnings_feed.json")
    
    enriched_count = 0
    failed_count = 0
    
    for i, r in enumerate(recs, 1):
        if not isinstance(r, dict):
            continue
        ticker = r.get('ticker')
        announce_date = r.get('announceDate')
        if not ticker or not announce_date:
            continue
            
        pead = compute_pead(ticker, announce_date)
        if pead:
            r.update(pead)
            enriched_count += 1
        else:
            failed_count += 1
            
        if i % 20 == 0 or i == count_before:
            print(f"Processing... [{i}/{count_before}] (Enriched: {enriched_count}, Failed/Skipped: {failed_count})")
            
    count_after = len(recs)
    
    # MERGE GUARD check: if record count drops by >30%
    if count_before > 0:
        drop_pct = (count_before - count_after) / count_before
        if drop_pct > 0.30:
            print(f"ERROR: MERGE GUARD ABORT - Record count dropped by {drop_pct*100:.1f}% (>30%)! Before={count_before}, After={count_after}")
            sys.exit(1)
            
    # Fail-fast check for Infinity/NaN using allow_nan=False
    try:
        output_json = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False)
    except ValueError as e:
        print(f"ERROR: Non-finite value guard failed during JSON serialization: {e}")
        sys.exit(1)
        
    with open(FEED_PATH, 'w', encoding='utf-8') as f:
        f.write(output_json)
        
    print(f"Successfully enriched {enriched_count}/{count_after} records with PEAD fields and updated {FEED_PATH}")

if __name__ == '__main__':
    main()
