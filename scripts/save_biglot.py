"""
save_biglot.py  –  Fetch Big Lot summary from RYT9 and save as static history JSON.

Usage:
    python save_biglot.py [YYYY-MM-DD]  # YYYY-MM-DD is advisory only (logging) -
                                          # the snapshot is always saved under the
                                          # article's own publish date, not this
    python save_biglot.py --dry-run      # fetch + print, write nothing
    python save_biglot.py --out <dir>    # write into <dir> instead of the real
                                          # public/data/history/ tree (testing)

Output:
    stockdesk/public/data/history/YYYY-MM-DD/biglot.json

The snapshot is labeled with the RSS item's own pubDate (converted to a
Bangkok-local date), not the date the script happened to run. Bucketing by
run-date used to silently relabel a stale article as today's data on any day
RYT9 hadn't published a fresh summary yet (holidays, or a pipeline run before
~17:00 ICT) - see the 2026-07-09 incident: that folder's biglot.json turned
out to be 07-08's article duplicated under the wrong date. Always use
--dry-run or --out when testing manually - same reasoning as save_news.py.
"""

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
import re

# Console output includes Thai article titles; reconfigure stdout to UTF-8 so
# this doesn't depend on the caller's console codepage (cmd.exe defaults to
# cp1252 unless `chcp 65001` was run first) - same fix as save_news.py.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
RSS_URL = "https://www.ryt9.com/tag/BIG+LOT%3A/rss.xml"
BANGKOK_TZ = timezone(timedelta(hours=7))

def inner_content(tag: str, html: str) -> list[str]:
    open_re = re.compile(rf"<{tag}(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", re.IGNORECASE)
    close = f"</{tag}>"
    results = []
    for m in open_re.finditer(html):
        start = m.end()
        end = html.lower().find(close.lower(), start)
        if end == -1:
            continue
        results.append(html[start:end])
    return results

def strip_tags(html: str) -> str:
    html = re.sub(r"<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    html = html.replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", html).strip()

def fetch_rss():
    req = urllib.request.Request(RSS_URL, headers={"User-Agent": UA, "Accept": "application/rss+xml"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            xml = resp.read().decode("utf-8")
    except Exception as e:
        print(f"Error fetching RSS: {e}")
        return []
    
    items = []
    for block in inner_content("item", xml):
        title_m = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</title>", block, re.IGNORECASE)
        link_m = re.search(r"<link>\s*(https?:[^\s<]+?)\s*</link>", block, re.IGNORECASE)
        date_m = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", block, re.IGNORECASE)
        title = title_m.group(1).strip() if title_m else ""
        link = link_m.group(1).strip() if link_m else ""
        pub_date = date_m.group(1).strip() if date_m else ""
        
        if "วันนี้" in title and "มูลค่าสูงสุด" in title and link and pub_date:
            items.append({"title": title, "link": link, "pubDate": pub_date})
            
    return items

def parse_html_table(html: str) -> list[dict]:
    tables = inner_content("table", html)
    if not tables:
        return []
    
    rows = []
    for tr in inner_content("tr", tables[0]):
        tds = inner_content("td", tr)
        if not tds:
            tds = inner_content("th", tr) # sometimes they use th for cells
            
        cells = [strip_tags(td) for td in tds]
        
        if len(cells) >= 5:
            # หลักทรัพย์ | รายการ | จำนวนหุ้น | มูลค่า (พันบาท) | ราคาเฉลี่ย (บาท) | ราคาพาร์
            symbol = cells[0].strip()
            if not symbol or not re.match(r"^[A-Za-z0-9\-\.]+$", symbol):
                continue
            if symbol == "หลักทรัพย์":
                continue
                
            try:
                transactions = int(cells[1].replace(",", ""))
                volume = int(cells[2].replace(",", ""))
                raw_value = float(cells[3].replace(",", ""))
                value = round(raw_value / 1000, 2) # พันบาท -> ลบ.
                avg_price = float(cells[4].replace(",", ""))
                
                rows.append({
                    "symbol": symbol,
                    "transactions": transactions,
                    "volume": volume,
                    "value": value,
                    "avgPrice": avg_price,
                })
            except (ValueError, IndexError):
                continue
    return rows

def fetch_article(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.ryt9.com"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")

def bangkok_date_from_pubdate(pub_date: str):
    """RSS pubDate -> 'YYYY-MM-DD' in Asia/Bangkok. None if unparseable."""
    if not pub_date:
        return None
    try:
        s = pub_date
        if not re.search(r"([+-]\d{2}:?\d{2}|Z|GMT|UTC?)\s*$", s, re.IGNORECASE):
            s += " +0700"
        dt = parsedate_to_datetime(s)
        return dt.astimezone(BANGKOK_TZ).strftime("%Y-%m-%d")
    except Exception:
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("run_date", nargs="?", default=None, help="advisory only - logging/comparison, not the save target")
    parser.add_argument("--dry-run", action="store_true", help="fetch and print, write nothing")
    parser.add_argument("--out", default=None, help="write into this dir instead of the real public/data/history/ tree (for manual testing)")
    args = parser.parse_args()

    requested_date = args.run_date or datetime.now().strftime("%Y-%m-%d")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    history_root = args.out if args.out else os.path.join(stockdesk_dir, "public", "data", "history")
    if args.out:
        print(f"  [--out] Writing into {history_root} instead of the real history tree")
    if args.dry_run:
        print("  [--dry-run] Fetching only - nothing will be written")

    print(f"  Fetching Big Lot Summary (pipeline run date {requested_date})...")

    items = fetch_rss()
    if not items:
        print("  Warning: No summary article found in RSS.")
        return

    item = items[0]
    print(f"    Found: {item['title']}")

    # Label the snapshot by the article's own publish date, not the day the
    # script happened to run (see module docstring for why).
    article_date = bangkok_date_from_pubdate(item["pubDate"]) or requested_date
    if article_date != requested_date:
        print(f"    Note: newest article is dated {article_date}, not {requested_date} - saving under its own date instead of mislabeling it.")

    out_dir = os.path.join(history_root, article_date)
    out_file = os.path.join(out_dir, "biglot.json")

    if os.path.exists(out_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
            if existing.get("publishedAt") == item["pubDate"]:
                print(f"    Already have this article's snapshot at {out_file} - skipping.")
                return
        except Exception:
            pass

    html = fetch_article(item["link"])
    rows = parse_html_table(html)

    if not rows:
        print("    Warning: No table or rows found in the article.")
        return

    result = {
        "date": article_date,
        "publishedAt": item["pubDate"],
        "source": "InfoQuest/RYT9",
        "rows": rows
    }

    if args.dry_run:
        print(f"    (dry-run) Would save {len(rows)} rows to: {out_file}")
        return

    os.makedirs(out_dir, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"    Saved {len(rows)} rows to: {out_file}")

if __name__ == "__main__":
    main()
