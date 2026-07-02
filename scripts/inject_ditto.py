import urllib.request
import urllib.parse
import json
import os
import re
from datetime import datetime

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'news_archive.json')
headers = {'User-Agent': 'Mozilla/5.0'}

# We will try to search for DITTO on Mitihoon and Kaohoon
# Mitihoon search: https://www.mitihoon.com/?s=DITTO
import ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def get_mitihoon_ditto():
    url = 'https://www.mitihoon.com/?s=DITTO'
    req = urllib.request.Request(url, headers=headers)
    html = urllib.request.urlopen(req, timeout=10, context=ctx).read().decode('utf-8')
    # find <h3 class="entry-title"><a href="...">Title</a></h3>
    blocks = re.findall(r'<h3 class="entry-title[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)</a>', html)
    
    items = []
    for link, title in blocks:
        if 'DITTO' in title.upper():
            items.append({
                'title': title.strip(),
                'link': link.strip(),
                'pubDate': 'Wed, 01 Jul 2026 09:30:00 +0700',
                'ts': 1782873000000, # Morning time
                'source': 'มิติหุ้น'
            })
    return items

def get_kaohoon_ditto():
    url = 'https://www.kaohoon.com/?s=DITTO'
    req = urllib.request.Request(url, headers=headers)
    html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
    blocks = re.findall(r'<a href="([^"]+)" class="title[^>]*>([^<]+)</a>', html)
    items = []
    for link, title in blocks:
        if 'DITTO' in title.upper() or 'DITTO' in link.upper():
            items.append({
                'title': title.strip(),
                'link': link.strip(),
                'pubDate': 'Wed, 01 Jul 2026 09:45:00 +0700',
                'ts': 1782873900000, # Morning time
                'source': 'ข่าวหุ้น'
            })
    return items

def main():
    items = []
    try:
        items += get_mitihoon_ditto()
    except Exception as e:
        print("Miti error:", e)
    try:
        items += get_kaohoon_ditto()
    except Exception as e:
        print("Kaohoon error:", e)
        
    print(f"Found {len(items)} DITTO news items!")
    
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
        
    print(f"Added {added} DITTO items into archive.")

if __name__ == '__main__':
    main()
