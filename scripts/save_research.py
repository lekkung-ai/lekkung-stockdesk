"""
save_research.py  –  Fetch broker-research RSS feeds and save as daily
snapshot JSON, same pattern as save_news.py.

Usage:
    python save_research.py              # writes real snapshot files
    python save_research.py --dry-run    # fetch + print counts, write nothing
    python save_research.py --out <dir>  # write into <dir> instead of the
                                          # real public/data/history/ tree

Always use --dry-run or --out when testing manually - see save_news.py's
docstring for why (a manual test run writing straight into the real history
tree caused a git rebase conflict against the scheduled pipeline on
2026-07-13).

Output:
    stockdesk/public/data/history/YYYY-MM-DD/research.json  (one file per
    day, bucketed by each item's own pubDate)

Only raw feed fields (title, link, pubDate, ts, source) are stored — broker
name / ticker / target price / rating are parsed from the title at request
time by app/api/research/[ticker]/route.ts, the same way for live and
archived items, so there's nothing extra to precompute here.
"""

import argparse
import urllib.request
import ssl
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Kept in sync with the live feed list in app/api/research/[ticker]/route.ts.
FEEDS = {
    'Kaohoon': 'https://www.kaohoon.com/stockanalysis/feed',
    # Vercel's production egress IP has been rate-limited/blocked on
    # mitihoon.com since 2026-07-11 (see app/api/news/[ticker]/route.ts) and
    # hadn't recovered as of 2026-07-13, so the research route dropped it
    # from its live FEEDS too - this script (run from a non-blocked machine)
    # is now its only path into the research tab, batch-freshness only.
    'มิติหุ้น': 'https://www.mitihoon.com/category/%e0%b8%9a%e0%b8%97%e0%b8%a7%e0%b8%b4%e0%b9%80%e0%b8%84%e0%b8%a3%e0%b8%b2%e0%b8%b0%e0%b8%ab%e0%b9%8c/feed',
}

DEFAULT_TIMEOUT = 15

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

def load_day_file(date_str, history_dir):
    path = os.path.join(history_dir, date_str, 'research.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_day_file(date_str, items, history_dir):
    dir_path = os.path.join(history_dir, date_str)
    os.makedirs(dir_path, exist_ok=True)
    path = os.path.join(dir_path, 'research.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='fetch and print counts, write nothing')
    parser.add_argument('--out', default=None, help='write into this dir instead of the real public/data/history/ tree (for manual testing)')
    args = parser.parse_args()

    history_dir = args.out if args.out else HISTORY_DIR
    if args.out:
        print(f"[--out] Writing into {history_dir} instead of the real history tree")
    if args.dry_run:
        print("[--dry-run] Fetching only - nothing will be written")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    fetched_items = []
    for name, url in FEEDS.items():
        print(f"Fetching {name}... (timeout {DEFAULT_TIMEOUT}s)")
        try:
            req = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT, context=ctx)
            xml = resp.read().decode('utf-8')
            items = parse_rss(xml, name)
            print(f" -> Got {len(items)} items")
            fetched_items.extend(items)
        except Exception as e:
            print(f" -> ERROR: {e}")

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
        existing = load_day_file(date_str, history_dir)
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
        if args.dry_run:
            print(f"{date_str}: +{added} new -> {len(merged)} total (dry-run, not written)")
        else:
            save_day_file(date_str, merged, history_dir)
            print(f"{date_str}: +{added} new -> {len(merged)} total")

if __name__ == '__main__':
    main()
