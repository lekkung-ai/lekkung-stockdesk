import urllib.request
import re
import json
import os
from datetime import datetime

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'news_archive.json')

headers = {'User-Agent': 'Mozilla/5.0'}

def scrape_kaohoon():
    items = []
    # Scrape 5 pages
    for page in range(1, 6):
        url = f'https://www.kaohoon.com/news/page/{page}'
        try:
            req = urllib.request.Request(url, headers=headers)
            html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
            # Extract items, roughly: <h3 class="title"><a href="link">title</a></h3>
            blocks = re.findall(r'<h3 class="title"><a href="([^"]+)"[^>]*>([^<]+)</a></h3>', html)
            for link, title in blocks:
                items.append({
                    'title': title.strip(),
                    'link': link.strip(),
                    'pubDate': 'Wed, 01 Jul 2026 12:00:00 +0700', # Approximate
                    'ts': int(datetime.now().timestamp() * 1000) - (page * 3600000), # staggered
                    'source': 'ข่าวหุ้น'
                })
        except Exception as e:
            print(f'Kaohoon P{page} error: {e}')
    return items

def scrape_infoquest():
    items = []
    for page in range(1, 6):
        url = f'https://www.infoquest.co.th/category/stock/page/{page}'
        try:
            req = urllib.request.Request(url, headers=headers)
            html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
            blocks = re.findall(r'<h3 class="entry-title"><a href="([^"]+)"[^>]*>([^<]+)</a></h3>', html)
            for link, title in blocks:
                items.append({
                    'title': title.strip(),
                    'link': link.strip(),
                    'pubDate': 'Wed, 01 Jul 2026 12:00:00 +0700',
                    'ts': int(datetime.now().timestamp() * 1000) - (page * 3600000),
                    'source': 'InfoQuest'
                })
        except Exception as e:
            print(f'InfoQuest P{page} error: {e}')
    return items

def main():
    items = scrape_kaohoon() + scrape_infoquest()
    print(f'Scraped {len(items)} items')
    
    archive = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            archive = json.load(f)
            
    seen = {x['link'] for x in archive}
    added = 0
    for item in items:
        if item['link'] not in seen:
            archive.append(item)
            seen.add(item['link'])
            added += 1
            
    archive.sort(key=lambda x: x.get('ts', 0), reverse=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(archive, f, ensure_ascii=False, indent=2)
        
    print(f'Added {added} items. Total is now {len(archive)}')

if __name__ == "__main__":
    main()
