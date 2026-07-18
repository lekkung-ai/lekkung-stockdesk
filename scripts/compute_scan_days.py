"""
compute_scan_days.py  –  Compute how many consecutive days each ticker has been
in a given scanner's list, using the daily snapshots under data/history/.

Output: data/scans/scan_days.json
    { "lekkung": {"AAA": 3, ...}, "oneil": {...}, "sepa": {...}, "kell": {...} }

Run AFTER the daily snapshot step so today's snapshot is included.
Usage:
    python -X utf8 compute_scan_days.py
"""

import json
import os

# page key -> history/scan filename (without .json)
SCANNERS = {
    "lekkung": "lekkung",
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


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    hist_dir = os.path.join(stockdesk_dir, "data", "history")
    scans_dir = os.path.join(stockdesk_dir, "data", "scans")

    dates = sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[0].isdigit()
    )
    print(f"  History dates: {len(dates)} ({dates[0]}..{dates[-1]})" if dates else "  No history dates")

    result = {}
    for key, fname in SCANNERS.items():
        # presence set per date (most-recent last)
        date_sets = {}
        for d in dates:
            date_sets[d] = tickers_of(load_json(os.path.join(hist_dir, d, f"{fname}.json")))

        current = tickers_of(load_json(os.path.join(scans_dir, f"{fname}.json")))
        streaks = {}
        for ticker in current:
            streak = 0
            for d in reversed(dates):
                if ticker in date_sets.get(d, set()):
                    streak += 1
                else:
                    break
            streaks[ticker] = max(streak, 1)  # present today => at least 1
        result[key] = streaks
        print(f"    {key}: {len(streaks)} tickers, max streak = {max(streaks.values(), default=0)}")

    out_file = os.path.join(scans_dir, "scan_days.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Saved: {out_file}")


if __name__ == "__main__":
    main()
