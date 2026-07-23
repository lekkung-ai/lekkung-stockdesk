"""
save_news.py  –  Fetch news RSS feeds and save as daily snapshot JSON, same
pattern as save_biglot.py.

Usage:
    python save_news.py                  # writes real snapshot files
    python save_news.py --dry-run        # fetch + print counts, write nothing
    python save_news.py --out <dir>      # write into <dir> instead of the
                                          # real public/data/history/ tree
                                          # (e.g. a scratchpad dir for testing)

Output:
    stockdesk/public/data/history/YYYY-MM-DD/news.json  (one file per day,
    bucketed by each item's own pubDate — a single run can touch several
    days' files since some feeds' latest items span more than one day)

Always use --dry-run or --out when testing manually - writing straight into
the real history tree collides with the scheduled pipeline
(update_stockdesk.bat / GitHub Actions) if it runs while you're testing,
producing a diverged commit it can't cleanly rebase past (see the
2026-07-13 incident: a manual test run here left the local git repo mid
rebase-conflict on that day's news.json).

TWO WRITERS, BY DESIGN - DO NOT "SIMPLIFY" THIS TO OVERWRITE:
public/data/history/<date>/news.json has two independent writers that can
run within minutes of each other: the cloud pipeline (daily-scan.yml /
iaa-research-morning.yml, GitHub Actions) and this machine's local Task
Scheduler job (update_stockdesk.bat). Each runs this script in its own
checkout, so neither sees the other's fetch. If this script just overwrote
the day file with whatever it fetched, whichever writer's git push landed
second would silently discard the other's items - no error, no conflict,
just lost news. The load_day_file() -> union -> dedupe-by-link -> sort
below (see main()) exists specifically to make two independent runs
converge to the same superset instead of clobbering each other.

That merge logic alone didn't stop the 2026-07-13/07-14 conflicts though -
those were git-level, not application-level: update_stockdesk.bat used to
run this script (and the other save_*.py scripts) BEFORE its own
`git pull --rebase` on this repo, so the merge above ran against a stale
local base, and by the time the pull finally happened the local commit and
the actual remote had already diverged on this file. Fixed by moving the
stockdesk pull earlier in update_stockdesk.bat (see its Step 5.65) so the
merge above runs against a base that's as fresh as possible - and by
sorting deterministically (ts, then link) below so two runs that do end up
with an identical merged item set always serialize to byte-identical JSON
instead of differing only in tie-order. Keep both fixes if you touch this
file again - the plain "just write what you fetched" version is what
caused the incidents.
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

# Console output includes Thai feed names; reconfigure stdout to UTF-8 so this
# doesn't depend on the caller's console codepage (cmd.exe defaults to cp1252
# unless `chcp 65001` was run first).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Kept in sync with the live feed list in app/api/news/[ticker]/route.ts.
# See that file's "Verified NOT usable" comment block for why other
# candidates (Share2Trade, Wealthy Thai, Bangkokbiznews, Prachachat,
# Thansettakij, MGR Online, The Standard Wealth, Settrade feedburner) are
# excluded.
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
    # HoonSmart's domain is consistently slow (15-30s+ for any path, not just
    # /feed/) - too slow for the live web route (12s timeout, one page load =
    # unacceptable wait), but this batch script runs once per pipeline cycle
    # and can afford to wait it out (see FEED_TIMEOUT_OVERRIDES below). Items
    # land in the daily archive only, so freshness here is "per pipeline run",
    # not realtime - acceptable since that's already true of this whole file.
    'HOONSMART': 'https://hoonsmart.com/feed/',
}

# efinancethai has no RSS - fetched separately via fetch_efin() (custom JSON
# API, not RSS XML like everything in FEEDS above). Kept in sync with
# lib/efinanceThai.ts on the web side.
EFIN_URL = 'https://www.efinancethai.com/ServiceNew/ServiceController.ashx?colTypeID=21&pageNumber=1&pageSize=20&typeColumn=true'

# Per-feed timeout override (seconds). Feeds not listed use DEFAULT_TIMEOUT.
FEED_TIMEOUT_OVERRIDES = {
    'HOONSMART': 60,
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

def fetch_efin(headers, ctx, timeout):
    """efinancethai's API - not RSS, custom JSON, and declares
    charset=windows-874 (Thai legacy codepage) regardless of what we ask for
    -> decode with cp874 (Python's name for windows-874), not utf-8, or Thai
    text comes out as mojibake. Verified against the live API 2026-07-14."""
    req = urllib.request.Request(EFIN_URL, headers=headers)
    resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
    raw_bytes = resp.read()
    data = json.loads(raw_bytes.decode('cp874'))
    items = []
    for row in data.get('Data', []):
        last_update = row.get('LastUpdate', '')
        ts = 0
        if last_update:
            try:
                dt = datetime.strptime(last_update, '%Y-%m-%d %H:%M:%S').replace(tzinfo=BANGKOK_TZ)
                ts = int(dt.timestamp() * 1000)
            except Exception:
                pass
        title = row.get('title', '')
        link = row.get('full_path_link', '')
        if not title or not link:
            continue
        security = (row.get('security') or '').strip()
        item = {
            'title': title,
            'link': link,
            'pubDate': last_update,
            'ts': ts,
            'source': 'EFIN',
        }
        if security:
            item['tickerHint'] = security
        items.append(item)
    return items


def fetch_set(headers, ctx, timeout=15):
    req_home = urllib.request.Request(
        'https://www.settrade.com/th/equities/quote/SET/news',
        headers=headers
    )
    cookie = ''
    try:
        with urllib.request.urlopen(req_home, timeout=timeout, context=ctx) as resp:
            raw_cookies = resp.headers.get_all('Set-Cookie') or []
            cookie = '; '.join(c.split(';')[0].strip() for c in raw_cookies if c.strip())
    except Exception:
        pass

    api_headers = dict(headers)
    api_headers['Referer'] = 'https://www.settrade.com/th/equities/quote/SET/news'
    api_headers['Accept'] = 'application/json, text/plain, */*'
    if cookie:
        api_headers['Cookie'] = cookie

    url = 'https://www.settrade.com/api/set/news/SET/list?limit=50'
    req_api = urllib.request.Request(url, headers=api_headers)
    items = []
    with urllib.request.urlopen(req_api, timeout=timeout, context=ctx) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        rows = data.get('newsInfoList', []) or []
        for r in rows:
            dt_str = r.get('datetime', '')
            ts = 0
            if dt_str:
                try:
                    dt = datetime.fromisoformat(dt_str)
                    ts = int(dt.timestamp() * 1000)
                except Exception:
                    pass
            title = r.get('headline', '')
            symbol = r.get('symbol')
            link = r.get('url') or f"https://www.set.or.th/th/market/news-and-alert/newsdetails?id={r.get('id')}&symbol={symbol or 'SET'}"
            if not title:
                continue
            item = {
                'title': title,
                'link': link,
                'pubDate': dt_str,
                'ts': ts,
                'source': 'SET (ตลาดหลักทรัพย์)',
            }
            if symbol and symbol != 'SET':
                item['tickerHint'] = symbol
            items.append(item)
    return items


def bangkok_date(ts_ms):
    if not ts_ms:
        return None
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).astimezone(BANGKOK_TZ)
    return dt.strftime('%Y-%m-%d')

def load_day_file(date_str, history_dir):
    path = os.path.join(history_dir, date_str, 'news.json')
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
    path = os.path.join(dir_path, 'news.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

def merge_news_items(existing, new_items):
    """Union two news-item lists, deduped by link, sorted deterministically.

    This is the exact fix for the two-writers problem described in this
    file's module docstring - also reused as-is by scripts/safe_push.py to
    resolve a git-level news.json conflict between two independently-fetched
    versions (call with existing=ours, new_items=theirs; the result is what
    both sides should have converged to). Do not duplicate this logic
    elsewhere - import this function instead, or the two copies will drift.

    Returns (merged_list, added_count).
    """
    seen_links = {it.get('link') for it in existing if it.get('link')}
    merged = list(existing)
    added = 0
    for item in new_items:
        link = item.get('link')
        if link and link not in seen_links:
            seen_links.add(link)
            merged.append(item)
            added += 1
    # Sort key includes link as a tiebreaker (not just ts) so that two
    # independent runs which end up merging to the identical item set -
    # the common case, since both are unioning against a shared history -
    # always produce byte-identical JSON, regardless of the order each
    # run happened to fetch/append items in. ts-only sorting is stable
    # per-run but not deterministic ACROSS runs when two items share a ts.
    merged.sort(key=lambda x: (-x.get('ts', 0), x.get('link', '')))
    return merged, added

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
        timeout = FEED_TIMEOUT_OVERRIDES.get(name, DEFAULT_TIMEOUT)
        print(f"Fetching {name}... (timeout {timeout}s)")
        try:
            req = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
            xml = resp.read().decode('utf-8')
            items = parse_rss(xml, name)
            print(f" -> Got {len(items)} items")
            fetched_items.extend(items)
        except Exception as e:
            print(f" -> ERROR: {e}")

    print("Fetching EFIN... (timeout 15s, custom JSON API, not RSS)")
    try:
        efin_items = fetch_efin(headers, ctx, 15)
        print(f" -> Got {len(efin_items)} items")
        fetched_items.extend(efin_items)
    except Exception as e:
        print(f" -> ERROR: {e}")

    print("Fetching SET (ตลาดหลักทรัพย์)... (timeout 15s, custom API)")
    try:
        set_items = fetch_set(headers, ctx, 15)
        print(f" -> Got {len(set_items)} items")
        fetched_items.extend(set_items)
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
        existing = load_day_file(date_str, history_dir)
        merged, added = merge_news_items(existing, new_items)
        if args.dry_run:
            print(f"{date_str}: +{added} new -> {len(merged)} total (dry-run, not written)")
        else:
            save_day_file(date_str, merged, history_dir)
            print(f"{date_str}: +{added} new -> {len(merged)} total")

if __name__ == '__main__':
    main()
