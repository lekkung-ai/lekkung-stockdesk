"""
save_news.py  –  Fetch news RSS feeds and save as daily snapshot JSON, same
pattern as save_biglot.py.

Usage:
    python save_news.py

Output:
    stockdesk/public/data/history/YYYY-MM-DD/news.json  (one file per day,
    bucketed by each item's own pubDate — a single run can touch several
    days' files since some feeds' latest items span more than one day)
"""

import urllib.request
import ssl
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

# Console output includes Thai feed names; reconfigure stdout to UTF-8 so this
# doesn't depend on the caller's console codepage (cmd.exe defaults to cp1252
# unless `chcp 65001` was run first).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Kept in sync with the live feed list in app/api/news/[ticker]/route.ts.
# See that file's "Verified NOT usable" comment block for why other
# candidates (HoonSmart, Share2Trade, Wealthy Thai, Bangkokbiznews,
# Prachachat, Thansettakij, MGR Online, The Standard Wealth, Settrade
# feedburner) are excluded.
FEEDS = {
    'InfoQuest': 'https://www.infoquest.co.th/stock/feed/',
    'ข่าวหุ้น': 'https://www.kaohoon.com/feed',
    'ข่าวหุ้น (ด่วน)': 'https://www.kaohoon.com/breakingnews/feed',
    'ข่าวหุ้น (ทั่วไป)': 'https://www.kaohoon.com/news/feed',
    'RYT9 (SET)': 'https://www.ryt9.com/tag/SET/rss.xml',
    'RYT9 (หุ้น)': 'https://www.ryt9.com/tag/%E0%B8%AB%E0%B8%B8%E0%B9%89%E0%B8%99/rss.xml',
    'มิติหุ้น': 'https://www.mitihoon.com/feed/',
    'มติชน': 'https://www.matichon.co.th/economy/feed',
    'Investing.com': 'https://th.investing.com/rss/news_25.rss',
    'RYT9 (IPO)': 'https://www.ryt9.com/tag/IPO/rss.xml',
}

HISTORY_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'history')
BANGKOK_TZ = timezone(timedelta(hours=7))

NAMED_ENTITIES = {
    'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", 'nbsp': ' ', 'hellip': '…',
    'ldquo': '“', 'rdquo': '”', 'lsquo': '‘', 'rsquo': '’',
    'mdash': '—', 'ndash': '–', 'laquo': '«', 'raquo': '»'
}

def decode_entities(s):
    s = re.sub(r'&#x([0-9a-fA-F]+);', lambda m: chr(int(m.group(1), 16)), s)
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), s)
    for k, v in NAMED_ENTITIES.items():
        s = s.replace(f'&{k};', v)
    return s.strip()

def extract_cdata(s):
    m = re.search(r'<!\[CDATA\[(.*?)\]\]>', s, re.DOTALL)
    if m:
        return m.group(1).strip()
    return re.sub(r'<[^>]+>', '', s).strip()

def parse_rss(xml, source_name):
    items = []
    blocks = re.findall(r'<item\b[^>]*>([\s\S]*?)<\/item>', xml, re.IGNORECASE)
    for block in blocks:
        title_raw = re.search(r'<title>([\s\S]*?)<\/title>', block, re.IGNORECASE)
        link_raw = re.search(r'<link>([\s\S]*?)<\/link>', block, re.IGNORECASE)
        if not link_raw:
            link_raw = re.search(r'<guid[^>]*>([\s\S]*?)<\/guid>', block, re.IGNORECASE)
        pub_date_raw = re.search(r'<pubDate[^>]*>(.*?)</pubDate>', block, re.IGNORECASE)

        if not title_raw or not link_raw:
            continue

        title = decode_entities(extract_cdata(title_raw.group(1)))
        link = extract_cdata(link_raw.group(1)).replace(" ", "")

        pubDate = ""
        ts = 0
        if pub_date_raw:
            pubDate = pub_date_raw.group(1).strip()
            if pubDate:
                try:
                    if not re.search(r'([+-]\d{2}:?\d{2}|Z|GMT|UTC?)\s*$', pubDate, re.IGNORECASE):
                        pubDate += ' +0700'
                    dt = parsedate_to_datetime(pubDate)
                    ts = int(dt.timestamp() * 1000)
                except Exception:
                    pass

        if title and link:
            items.append({
                'title': title,
                'link': link,
                'pubDate': pubDate,
                'ts': ts,
                'source': source_name
            })
    return items

def bangkok_date(ts_ms):
    if not ts_ms:
        return None
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).astimezone(BANGKOK_TZ)
    return dt.strftime('%Y-%m-%d')

def load_day_file(date_str):
    path = os.path.join(HISTORY_DIR, date_str, 'news.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_day_file(date_str, items):
    dir_path = os.path.join(HISTORY_DIR, date_str)
    os.makedirs(dir_path, exist_ok=True)
    path = os.path.join(dir_path, 'news.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    fetched_items = []
    for name, url in FEEDS.items():
        print(f"Fetching {name}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            xml = resp.read().decode('utf-8')
            items = parse_rss(xml, name)
            print(f" -> Got {len(items)} items")
            fetched_items.extend(items)
        except Exception as e:
            print(f" -> ERROR: {e}")

    # Bucket newly fetched items by the Bangkok-local date they were published,
    # not the date the script ran — a single scrape can touch more than one
    # day's file (e.g. a quiet feed's latest items still being from yesterday).
    by_date = {}
    skipped_unknown_date = 0
    for item in fetched_items:
        date_str = bangkok_date(item.get('ts'))
        if not date_str:
            skipped_unknown_date += 1
            continue
        by_date.setdefault(date_str, []).append(item)

    if skipped_unknown_date:
        print(f"Skipped {skipped_unknown_date} item(s) with no parseable pubDate")

    for date_str, new_items in by_date.items():
        existing = load_day_file(date_str)
        seen_links = {it.get('link') for it in existing if it.get('link')}
        merged = list(existing)
        added = 0
        for item in new_items:
            link = item.get('link')
            if link and link not in seen_links:
                seen_links.add(link)
                merged.append(item)
                added += 1
        merged.sort(key=lambda x: x.get('ts', 0), reverse=True)
        save_day_file(date_str, merged)
        print(f"{date_str}: +{added} new -> {len(merged)} total")

if __name__ == '__main__':
    main()
