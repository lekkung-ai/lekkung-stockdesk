import sys
import os
import json
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__)))
import save_biglot

items = save_biglot.fetch_rss()
dates = []
def parse_pre_block(html: str) -> list[dict]:
    import bs4
    soup = bs4.BeautifulSoup(html, 'html.parser')
    pres = soup.find_all('pre')
    if not pres:
        return []
    rows = []
    for pre in pres:
        for line in pre.text.strip().split('\n'):
            parts = line.split()
            if len(parts) >= 5 and parts[0] != 'หลักทรัพย์':
                try:
                    symbol = parts[0]
                    transactions = int(parts[1].replace(',', ''))
                    volume = int(parts[2].replace(',', ''))
                    raw_value = float(parts[3].replace(',', ''))
                    value = round(raw_value / 1000, 2)
                    avg_price = float(parts[4].replace(',', ''))
                    rows.append({
                        "symbol": symbol,
                        "transactions": transactions,
                        "volume": volume,
                        "value": value,
                        "avgPrice": avg_price,
                    })
                except Exception:
                    pass
    return rows

for item in items:
    dt = datetime.strptime(item["pubDate"], "%a, %d %b %Y %H:%M:%S %z")
    date_str = dt.strftime("%Y-%m-%d")
    
    print(f"Fetching {date_str}...")
    html = save_biglot.fetch_article(item["link"])
    rows = save_biglot.parse_html_table(html)
    if not rows:
        rows = parse_pre_block(html)
    
    if rows:
        out_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'history', date_str)
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, "biglot.json")
        result = {
            "date": date_str,
            "publishedAt": item["pubDate"],
            "source": "InfoQuest/RYT9",
            "rows": rows
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
        print(f"Saved {date_str}")
        dates.append(date_str)

# index.json is derived from the folders (Big Lot days only) - never hand-assembled here
import build_history_index
build_history_index.rebuild(build_history_index.default_history_root())
