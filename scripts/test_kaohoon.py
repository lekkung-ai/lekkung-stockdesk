import urllib.request
import re

url = 'https://www.kaohoon.com/news'
headers = {'User-Agent': 'Mozilla/5.0'}
try:
    req = urllib.request.Request(url, headers=headers)
    html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
    
    # Simple regex to grab all links containing DITTO
    blocks = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([^<]+)</a>', html)
    print('Found', len(blocks), 'a tags')
    for b in blocks:
        if 'DITTO' in b[1].upper() or 'DITTO' in b[0].upper():
            print('DITTO:', b)
            
    # Print some h3 titles to see structure
    h3s = re.findall(r'<h3[^>]*>.*?</h3>', html, re.DOTALL | re.IGNORECASE)
    print("Sample H3s:", h3s[:3])
except Exception as e:
    print('ERROR:', e)
