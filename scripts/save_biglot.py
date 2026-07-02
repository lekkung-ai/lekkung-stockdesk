"""
save_biglot.py  –  Fetch Big Lot summary from RYT9 and save as static history JSON.

Usage:
    python save_biglot.py [YYYY-MM-DD]

Output:
    stockdesk/public/data/history/YYYY-MM-DD/biglot.json
"""

import json
import os
import sys
import urllib.request
from datetime import datetime
import re

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
RSS_URL = "https://www.ryt9.com/tag/BIG+LOT%3A/rss.xml"

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

def main():
    date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    out_dir = os.path.join(stockdesk_dir, "public", "data", "history", date_str)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "biglot.json")

    print(f"  Fetching Big Lot Summary for {date_str}...")
    
    items = fetch_rss()
    if not items:
        print("  Warning: No summary article found in RSS today.")
        return
        
    item = items[0]
    print(f"    Found: {item['title']}")
    
    html = fetch_article(item["link"])
    rows = parse_html_table(html)
    
    if not rows:
        print("    Warning: No table or rows found in the article.")
        return
        
    result = {
        "date": date_str,
        "publishedAt": item["pubDate"],
        "source": "InfoQuest/RYT9",
        "rows": rows
    }
    
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"    Saved {len(rows)} rows to: {out_file}")

if __name__ == "__main__":
    main()
