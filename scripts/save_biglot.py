"""
save_biglot.py  –  Fetch Big Lot from Settrade and save as static history JSON.

Usage:
    python save_biglot.py [YYYY-MM-DD]

Output:
    stockdesk/public/data/history/YYYY-MM-DD/biglot.json

Format:
    { "date": "...", "set": { "headers": [...], "rows": [...] }, "mai": { ... } }

This file is committed to public/ so Vercel serves it as a static asset.
The Big Lot page fetches /data/history/YYYY-MM-DD/biglot.json for past dates.
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

MARKET_URLS = {
    "set": "https://www.settrade.com/th/equities/market-data/biglot",
    "mai": "https://www.settrade.com/th/mai/market-data/biglot",
}


# ── HTML table parser (mirrors parseHtmlTable.ts logic) ──────────────────────

def strip_tags(html: str) -> str:
    html = re.sub(r"<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    html = html.replace("&lt;", "<").replace("&gt;", ">")
    html = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), html)
    return re.sub(r"\s+", " ", html).strip()


def extract_tag_contents(tag: str, html: str) -> list[str]:
    open_re = re.compile(
        rf"<{tag}(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", re.IGNORECASE
    )
    close = f"</{tag}>"
    results = []
    for m in open_re.finditer(html):
        start = m.end()
        end = html.lower().find(close.lower(), start)
        if end == -1:
            continue
        results.append(html[start:end])
        # next finditer iteration skips past close tag automatically
    return results


def parse_html_table(html: str, table_index: int = 0):
    tables = extract_tag_contents("table", html)
    if table_index >= len(tables):
        return [], []
    tbl = tables[table_index]

    raw_headers = [strip_tags(h) for h in extract_tag_contents("th", tbl)]
    headers = [
        re.sub(r"\s*\(Click to sort[^)]*\)", "", h, flags=re.IGNORECASE).strip()
        for h in raw_headers
    ]
    headers = [h for h in headers if h]

    rows = []
    for row_html in extract_tag_contents("tr", tbl):
        cells = [strip_tags(c) for c in extract_tag_contents("td", row_html)]
        if not cells:
            continue
        row = {headers[i] if i < len(headers) else f"col{i}": c for i, c in enumerate(cells)}
        rows.append(row)

    return headers, rows


# ── Fetch one market ──────────────────────────────────────────────────────────

def fetch_market(market: str):
    url = MARKET_URLS[market]
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Referer": "https://www.settrade.com",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  Warning: failed to fetch {market}: {e}")
        return None

    # Try each table until we find one with data rows
    for i in range(6):
        headers, rows = parse_html_table(html, i)
        if len(rows) > 2:
            return {"headers": headers, "rows": rows}

    print(f"  Warning: no data table found for {market} (market may be closed)")
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    out_dir = os.path.join(stockdesk_dir, "public", "data", "history", date_str)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "biglot.json")

    print(f"  Fetching Big Lot for {date_str}...")
    result = {"date": date_str}

    for market in ("set", "mai"):
        data = fetch_market(market)
        result[market] = data
        if data:
            print(f"    {market.upper()}: {len(data['rows'])} rows")
        else:
            print(f"    {market.upper()}: no data")

    if result.get("set") or result.get("mai"):
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  Saved: {out_file}")
    else:
        print("  Skipped: no data for either market (closed day?)")


if __name__ == "__main__":
    main()
