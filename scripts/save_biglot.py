"""
save_biglot.py  –  Fetch Big Lot from Settrade and save as static history JSON.

Usage:
    python save_biglot.py [YYYY-MM-DD]

Output:
    stockdesk/public/data/history/YYYY-MM-DD/biglot.json
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


# ── HTML helpers ─────────────────────────────────────────────────────────────

def strip_tags(html: str) -> str:
    html = re.sub(r"<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    html = html.replace("&lt;", "<").replace("&gt;", ">")
    html = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), html)
    return re.sub(r"\s+", " ", html).strip()


def inner_content(tag: str, html: str) -> list[str]:
    """Extract inner HTML of every <tag>...</tag> occurrence."""
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
    return results


# ── Settrade Big Lot parser ───────────────────────────────────────────────────

def parse_settrade_biglot(html: str):
    """
    Returns (headers, rows) for the first table with real data.
    Extracts headers only from <thead> to avoid duplicate <th> from nested content.
    """
    tables = inner_content("table", html)

    for tbl in tables:
        # Headers from <thead> only
        thead_list = inner_content("thead", tbl)
        if not thead_list:
            continue

        raw_headers = [
            re.sub(r"\s*\(Click to sort[^)]*\)", "", strip_tags(h), flags=re.IGNORECASE).strip()
            for h in inner_content("th", thead_list[0])
        ]

        # Deduplicate: rename second occurrence of a header
        seen: dict[str, int] = {}
        headers: list[str] = []
        for h in raw_headers:
            if not h:
                continue
            if h not in seen:
                seen[h] = 0
                headers.append(h)
            else:
                seen[h] += 1
                headers.append(f"{h}_{seen[h]}")

        if not headers:
            continue

        # Rows from <tbody>
        tbody_list = inner_content("tbody", tbl)
        body_html = "".join(tbody_list)
        rows = []
        for row_html in inner_content("tr", body_html):
            cells = [strip_tags(c) for c in inner_content("td", row_html)]
            if not cells or not any(c.strip() for c in cells):
                continue
            row = {headers[i]: c for i, c in enumerate(cells) if i < len(headers)}
            rows.append(row)

        if len(rows) > 2:
            return headers, rows

    return [], []


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

    headers, rows = parse_settrade_biglot(html)
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
            print(f"    {market.upper()}: {len(data['rows'])} rows, headers: {data['headers']}")
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
