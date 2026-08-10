# -*- coding: utf-8 -*-
"""
backfill_sector_rs_history.py - Calculate time-series Sector and Subsector RS ratings.

Reads daily rs_ranking.json snapshots from data/history/<date>/rs_ranking.json
and sector_map.json to produce a time-series dataset of median RS scores
for both Sector and Subsector levels.

Output:
  data/scans/sector_rs_history.json
"""

import glob
import json
import math
import os
import statistics
import sys
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BANGKOK_TZ = timezone(timedelta(hours=7))

SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))

HISTORY_DIR = os.path.join(PROJECT_ROOT, 'data', 'history')
SECTOR_MAP_PATH = os.path.join(PROJECT_ROOT, 'data', 'scans', 'sector_map.json')
OUTPUT_PATH = os.path.join(PROJECT_ROOT, 'data', 'scans', 'sector_rs_history.json')


def main():
    if not os.path.exists(SECTOR_MAP_PATH):
        print(f"ERROR: sector_map.json not found at {SECTOR_MAP_PATH}")
        sys.exit(1)

    with open(SECTOR_MAP_PATH, 'r', encoding='utf-8') as f:
        sector_map = json.load(f)

    t2s = sector_map.get('ticker_to_sector', {})
    if not t2s:
        print(f"ERROR: ticker_to_sector missing or empty in {SECTOR_MAP_PATH}")
        sys.exit(1)

    # 1. Find all history snapshot paths for rs_ranking.json
    pattern = os.path.join(HISTORY_DIR, '*', 'rs_ranking.json')
    snapshot_files = sorted(glob.glob(pattern))

    valid_dates = []
    daily_rs_data = {}  # date -> {ticker: rs_rating}

    unmapped_tickers_set = set()

    for filePath in snapshot_files:
        date_str = os.path.basename(os.path.dirname(filePath))
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            if dt.weekday() >= 5:  # Skip weekends (Saturday=5, Sunday=6)
                continue
        except ValueError:
            continue

        try:
            with open(filePath, 'r', encoding='utf-8') as f:
                rs_list = json.load(f)
            if not isinstance(rs_list, list):
                continue
        except Exception as e:
            print(f"WARNING: Failed to read {filePath}: {e}")
            continue

        ticker_rs_map = {}
        for item in rs_list:
            if not isinstance(item, dict):
                continue
            ticker = item.get('Ticker')
            rs_val = item.get('RS_Rating')
            if ticker and rs_val is not None:
                try:
                    rs_val = float(rs_val)
                    if math.isfinite(rs_val):
                        ticker_rs_map[ticker] = rs_val
                except (ValueError, TypeError):
                    pass

        valid_dates.append(date_str)
        daily_rs_data[date_str] = ticker_rs_map

    print(f"Found {len(valid_dates)} valid weekday snapshot dates: {valid_dates[0]} to {valid_dates[-1] if valid_dates else 'N/A'}")

    if not valid_dates:
        print("ERROR: No valid weekday snapshots found. Aborting!")
        sys.exit(1)

    # 2. Discover all (market, sector) and (market, sector, subsector) groups in sector_map
    market_sector_subsectors = {}  # market -> sector -> set of subsectors
    market_sector_counts = {}      # market -> sector -> count of mapped tickers
    market_subsector_counts = {}   # market -> sector -> subsector -> count of mapped tickers

    for ticker, info in t2s.items():
        if not isinstance(info, dict):
            continue
        market = info.get('market', 'UNKNOWN')
        sector = info.get('sector', 'UNKNOWN')
        subsector = info.get('subsector', '')

        if market not in market_sector_subsectors:
            market_sector_subsectors[market] = {}
            market_sector_counts[market] = {}
            market_subsector_counts[market] = {}

        if sector not in market_sector_subsectors[market]:
            market_sector_subsectors[market][sector] = set()
            market_sector_counts[market][sector] = 0
            market_subsector_counts[market][sector] = {}

        market_sector_counts[market][sector] += 1

        # Ignore empty subsector string (e.g. MAI)
        if subsector:
            market_sector_subsectors[market][sector].add(subsector)
            market_subsector_counts[market][sector][subsector] = (
                market_subsector_counts[market][sector].get(subsector, 0) + 1
            )

    # 3. For each date, group stock RS ratings by (market, sector) and (market, sector, subsector)
    # Then compute median RS per date per group
    sectors_output = {}

    for market, sector_dict in market_sector_subsectors.items():
        sectors_output[market] = {}
        for sector, subsectors in sector_dict.items():
            sec_rs_series = []
            sec_count = market_sector_counts[market][sector]

            subsectors_output = {}
            for sub in sorted(subsectors):
                subsectors_output[sub] = {
                    "rs_series": [],
                    "count": market_subsector_counts[market][sector].get(sub, 0)
                }

            for d in valid_dates:
                ticker_rs_map = daily_rs_data[d]

                # Gather RS for this sector
                sec_ratings = []
                # Gather RS per subsector
                sub_ratings = {sub: [] for sub in subsectors}

                for t, rs in ticker_rs_map.items():
                    info = t2s.get(t)
                    if not info:
                        unmapped_tickers_set.add(t)
                        continue
                    m = info.get('market')
                    sec = info.get('sector')
                    sub = info.get('subsector', '')

                    if m == market and sec == sector:
                        sec_ratings.append(rs)
                        if sub in sub_ratings:
                            sub_ratings[sub].append(rs)

                # Compute sector median RS
                if sec_ratings:
                    m_val = round(float(statistics.median(sec_ratings)), 2)
                    sec_rs_series.append(m_val if math.isfinite(m_val) else None)
                else:
                    sec_rs_series.append(None)

                # Compute subsector median RS
                for sub, sub_list in sub_ratings.items():
                    if sub_list:
                        sub_m_val = round(float(statistics.median(sub_list)), 2)
                        subsectors_output[sub]["rs_series"].append(sub_m_val if math.isfinite(sub_m_val) else None)
                    else:
                        subsectors_output[sub]["rs_series"].append(None)

            sec_obj = {
                "rs_series": sec_rs_series,
                "count": sec_count
            }
            if subsectors_output:
                sec_obj["subsectors"] = subsectors_output

            sectors_output[market][sector] = sec_obj

    if unmapped_tickers_set:
        print(f"INFO: Skipped {len(unmapped_tickers_set)} unmapped tickers (e.g. {sorted(list(unmapped_tickers_set))[:5]})")

    total_sectors = sum(len(sec_dict) for sec_dict in sectors_output.values())
    if len(valid_dates) < 20 or total_sectors < 8:
        print(f"WARNING: Low data volume detected! dates={len(valid_dates)}, sectors={total_sectors}")

    if len(valid_dates) == 0 or total_sectors == 0:
        print("ERROR: Zero dates or sectors calculated. ABORTING overwrite!")
        sys.exit(1)

    now_iso = datetime.now(BANGKOK_TZ).isoformat()
    output_data = {
        "generated_at": now_iso,
        "method": "median_stock_rs_timeseries",
        "lookback_days": len(valid_dates),
        "dates": valid_dates,
        "sectors": sectors_output
    }

    # Verify allow_nan=False fail-fast guard
    try:
        output_json = json.dumps(output_data, ensure_ascii=False, indent=2, allow_nan=False)
    except ValueError as e:
        print(f"ERROR: Non-finite value guard failed during JSON serialization: {e}")
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(output_json)

    print(f"Successfully generated {OUTPUT_PATH}")
    print(f"Dates: {len(valid_dates)} ({valid_dates[0]} -> {valid_dates[-1]})")
    print(f"Sectors: SET={len(sectors_output.get('SET', {}))}, MAI={len(sectors_output.get('MAI', {}))}")


if __name__ == '__main__':
    main()
