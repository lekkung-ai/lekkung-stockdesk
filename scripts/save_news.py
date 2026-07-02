import urllib.request
import urllib.parse
import ssl
import json
import os
import re
from datetime import datetime
from email.utils import parsedate_to_datetime

# Sources provided by user
FEEDS = {
    'ข่าวหุ้น': 'https://www.kaohoon.com/feed',
    'มิติหุ้น': 'https://www.mitihoon.com/feed/',
    'หุ้นสมาร์ท': 'https://hoonsmart.com/feed/',
    'Share2Trade': 'https://www.share2trade.com/feed/',
    'Wealthy Thai': 'https://www.wealthythai.com/feed/',
    'กรุงเทพธุรกิจ': 'https://www.bangkokbiznews.com/rss/finance',
    'ประชาชาติธุรกิจ': 'https://www.prachachat.net/category/finance/feed',
    'ฐานเศรษฐกิจ': 'https://www.thansettakij.com/rss/finance',
    'ผู้จัดการออนไลน์': 'https://mgronline.com/rss/stockmarket.xml',
    'The Standard Wealth': 'https://thestandard.co/wealth/feed/',
    # Also add InfoQuest and RYT9 which are working
    'InfoQuest': 'https://www.infoquest.co.th/stock/feed/',
    'RYT9 (SET)': 'https://www.ryt9.com/tag/SET/rss.xml'
}

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'news_archive.json')
MAX_ITEMS = 1000

NAMED_ENTITIES = {
    'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", 'nbsp': ' ', 'hellip': '…',
    'ldquo': '“', 'rdquo': '”', 'lsquo': '‘', 'rsquo': '’',
    'mdash': '—', 'ndash': '–', 'laquo': '«', 'raquo': '»'
}

def decode_entities(s):
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
        pub_date_raw = re.search(r'<pubDate>([\s\S]*?)<\/pubDate>', block, re.IGNORECASE)

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

def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    all_items = []
    
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                all_items = json.load(f)
            print(f"Loaded {len(all_items)} items from {OUTPUT_FILE}")
        except Exception as e:
            print(f"Error loading {OUTPUT_FILE}: {e}")

    for name, url in FEEDS.items():
        print(f"Fetching {name}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=10, context=ctx)
            xml = resp.read().decode('utf-8')
            items = parse_rss(xml, name)
            print(f" -> Got {len(items)} items")
            all_items.extend(items)
        except Exception as e:
            print(f" -> ERROR: {e}")

    seen_links = set()
    unique_items = []
    
    all_items.sort(key=lambda x: x.get('ts', 0), reverse=True)
    
    five_days_ms = 5 * 24 * 60 * 60 * 1000
    now_ms = int(datetime.now().timestamp() * 1000)
    
    for item in all_items:
        link = item.get('link')
        if link and link not in seen_links:
            # Only keep news that are less than 5 days old (approx 5 days = 432,000,000 ms)
            if now_ms - item.get('ts', 0) <= five_days_ms:
                seen_links.add(link)
                unique_items.append(item)
            
    unique_items = unique_items[:2000]
    
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(unique_items, f, ensure_ascii=False, indent=2)
        
    print(f"Saved {len(unique_items)} unique items to {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
