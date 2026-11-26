"""
build_capital_events.py — public/data/capital_events.json for the /calendar capital-event rows.

Facts only (no prices): the page computes % / theoretical ex-price / ⚠ itself from the latest scan close.

events[].kind
  listing    "หุ้นเพิ่มทุนของ X เริ่มซื้อขาย" — SET announcement body (template "รับหลักทรัพย์เพิ่มทุน"):
             shares {old,new,total}, source_type PP/RO/W/CB/ESOP, price (or prices per group), allottees, date = first trade day
  ro_result  F53-5 "แบบรายงานผลการขาย ... หุ้นสามัญ ... ผู้ถือหุ้น" — allotted / sold / take_up_pct; linked to the
             same ticker's listing (and XR) as shares.basis = actual
  board      board / EGM resolution about PP / RO / Warrant / convertible — ticker, date, title, link only (free text, no numbers)
  XR / XW    Settrade x-calendar: ratio, price, allotShare, subscription, xdate, recordDate; an XR and XW of the same
             ticker + xdate are linked (RO with free warrants)

Every announcement is checked (old + new = total; PP: allottees add up to new). A failed check drops it with a warning.
Announcement bodies already in the previous file (by news_id) are never fetched again; at most MAX_FETCH new ones per
run, >= REQUEST_GAP s apart; a page with no body is skipped and NOT remembered (tried again next run).

Any part that fails → that part is empty + warnings[]. Exit code is 0 unless the output file cannot be written.

Usage:
    python scripts/build_capital_events.py                       # writes public/data/capital_events.json
    python scripts/build_capital_events.py --out /tmp/ce.json    # anywhere else (testing)
    python scripts/build_capital_events.py --no-fetch            # no network at all (cache + news titles only)
"""

import argparse
import glob
import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from build_news_flags import CAL_API, CAL_PAGE, UA, item_date, news_tickers  # noqa: E402  (shared, not modified)

BANGKOK_TZ = timezone(timedelta(hours=7))
ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, '..'))
HISTORY_DIR = os.path.join(ROOT, 'public', 'data', 'history')
SECTOR_MAP_FILE = os.path.join(ROOT, 'data', 'scans', 'sector_map.json')
OUT_FILE = os.path.join(ROOT, 'public', 'data', 'capital_events.json')
SET_NEWS_URL = 'https://www.set.or.th/th/market/news-and-alert/newsdetails?id={id}&symbol={sym}'

NEWS_DAYS = 30          # listing / board / ro_result: announcements of the last 30 days
XR_BACK_DAYS = 10       # XR/XW: xdate from today-10 ...
XR_AHEAD_DAYS = 60      # ... to today+60
MAX_FETCH = 20          # new announcement bodies per run
REQUEST_GAP = 2.5       # seconds between any two web requests
FUND_SUBSECTOR = 'Property Fund & REITs'

# ── headline classification (rules from the 2026-11-26 study, scratch/capital_2026-11-26/02_classify.py) ──
FUND_WORDS = ['หน่วยทรัสต์', 'กองทรัสต์', 'ทรัสต์เพื่อการลงทุน', 'หน่วยลงทุน', 'ผู้ถือหน่วย']
USE_OF_FUNDS_RE = re.compile(r'การใช้?เงิน|ใช้?เงินเพิ่มทุน|ใช้?เงินในส่วนที่เพิ่มทุน')
LISTING_RE = re.compile(r'หุ้นเพิ่มทุนของ\s*\S+\s*เริ่ม(?:ซื้อขาย|เป็นหลักทรัพย์จดทะเบียน)')
F535_SALE_RE = re.compile(r'แบบรายงานผลการขาย(?:ของ)?\s*(.+?)\s*ที่เสนอขายให้แก่\s*(.+?)\s*\(F53-5\)')
W_TOKEN_RE = re.compile(r'(?<![A-Za-z])[A-Z0-9&]+-W\d+|ESOP|Warrant|ใบสำคัญแสดงสิทธิ')
OTHER_CO = ['บริษัทย่อย', 'บริษัทร่วม', 'ลงทุนในหุ้น', 'ลงทุนในบริษัท', 'ซื้อหุ้นเพิ่มทุน', 'ซื้อหุ้นสามัญเพิ่มทุน', 'สละสิทธิ', 'เข้าลงทุน',
            'ได้มาซึ่งสินทรัพย์', 'ได้มาและจำหน่ายไปซึ่งสินทรัพย์']
OTHER_CO_RE = re.compile(r'เพิ่มทุน\S*?(?:ของ|ใน)?\s*(?:บริษัท|บจ\.?)\s*[^()]{1,60}?จำกัด(?!\s*\(มหาชน\))')
OWN_MARKERS = ['Private Placement', 'Right Offering', 'Rights Offering', 'ใบสำคัญแสดงสิทธิ', 'ผู้ถือหุ้นเดิม', 'บุคคลในวงจำกัด',
               'General Mandate', 'มอบอำนาจทั่วไป', 'หุ้นกู้แปลงสภาพ', 'จัดสรรหุ้นเพิ่มทุน']
ADMIN_WORDS = ['จดทะเบียนเพิ่มทุน', 'เพิ่มทุนชำระแล้ว', 'กรมพัฒนาธุรกิจการค้า', 'กระทรวงพาณิชย์']
PP_WORDS = ['Private Placement', 'บุคคลในวงจำกัด', 'ผู้ลงทุนโดยเฉพาะเจาะจง', 'General Mandate', 'มอบอำนาจทั่วไป']
RO_WORDS = ['Right Offering', 'Rights Offering', 'ผู้ถือหุ้นเดิมตามสัดส่วน', 'ให้แก่ผู้ถือหุ้นเดิม', 'เสนอขายให้แก่ผู้ถือหุ้นเดิม']
RO_TOK = re.compile(r'(?<![A-Za-z])(?:RO|PPO)(?![A-Za-z])')
PP_TOK = re.compile(r'(?<![A-Za-z])PP(?![A-Za-z])')
BOARD_RE = re.compile(r'มติ|ประชุมวิสามัญ|ประชุมผู้ถือหุ้น|EGM|การจัดสรรหุ้นเพิ่มทุนแบบ')


def classify_title(title, is_fund=False):
    """(kind, tags) for a SET headline. kind: 'listing' | 'ro_result' | 'board' | None (not a capital event we keep)."""
    t = title or ''
    if is_fund or any(w in t for w in FUND_WORDS) or USE_OF_FUNDS_RE.search(t):
        return None, []
    if LISTING_RE.search(t):
        return 'listing', []
    m = F535_SALE_RE.search(t)
    if m:
        sec, buyer = m.group(1), m.group(2)
        if 'ผู้ถือหุ้น' in buyer and not W_TOKEN_RE.search(sec) and 'หุ้นกู้' not in sec:
            return 'ro_result', ['RO']
        return None, []
    if 'ยกเลิก' in t or 'แบบรายงานผลการใช้สิทธิ' in t or re.search(r'กำหนดการ(?:ใช้สิทธิ|แปลง)|พ้นสภาพ|วันซื้อขายวันสุดท้าย|ปรับสิทธิ|สรุปข้อสนเทศ', t):
        return None, []
    own = any(w in t for w in OWN_MARKERS) or RO_TOK.search(t) or PP_TOK.search(t)
    if (any(w in t for w in OTHER_CO) or OTHER_CO_RE.search(t)) and not own:
        return None, []
    if any(w in t for w in ADMIN_WORDS) and not own:
        return None, []
    tags = []
    if any(w in t for w in PP_WORDS) or PP_TOK.search(t):
        tags.append('PP')
    if any(w in t for w in RO_WORDS) or RO_TOK.search(t):
        tags.append('RO')
    if W_TOKEN_RE.search(t):
        tags.append('W')
    if 'หุ้นกู้แปลงสภาพ' in t or 'ตราสารแปลงสภาพ' in t:
        tags.append('CB')
    if tags and BOARD_RE.search(t) and not re.search(r'ผลการ(?:ขาย|จอง|เสนอขาย)', t):
        return 'board', tags
    return None, []


# ── announcement body parsing ────────────────────────────────────────────────
TH_MON = {'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12}
TH_DATE_RE = re.compile(r'(\d{1,2})\s*(' + '|'.join(re.escape(k) for k in TH_MON) + r')\s*(\d{4})')
KV_RE = re.compile(r'^(.*?)\s*\t+\s*:\s?(.*)$')
BODY_RE = re.compile(r'<div class="raw-html">(.*?)</div></pre>', re.S)
PDF_RE = re.compile(r'https://weblink\.set\.or\.th/dat/news/[^"\s]+\.pdf')
ALLOTTEE_RE = re.compile(r'((?:\d\)\s*)?[^\d()]*?(?:\([^)]*\))?[^\d]*?)\s*จำนวน\s*([\d,]+)\s*หุ้น')


def _num(s):
    try:
        return float(str(s).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def th_dates(s):
    return [date(int(y) - 543, TH_MON[mo], int(d)).isoformat() for d, mo, y in TH_DATE_RE.findall(s or '')]


def extract_body(page_html):
    """(body text, pdf link) from a SET newsdetails page; body None when the page has no announcement box."""
    m = BODY_RE.search(page_html or '')
    pdf = PDF_RE.search(page_html or '')
    return (html.unescape(m.group(1)) if m else None), (pdf.group(0) if pdf else None)


def kv_lines(text):
    """[[key, value]]: 'key<TAB…> : value'; a line with tabs but no ':' is a header; other lines continue the last value."""
    out = []
    for ln in (text or '').splitlines():
        s = ln.strip()
        if not s or set(s) <= {'_'}:
            continue
        m = KV_RE.match(ln)
        if m:
            out.append([m.group(1).strip(), m.group(2).strip()])
        elif '\t' in ln or not out:
            out.append([s, ''])
        else:
            out[-1][1] = (out[-1][1] + ' ' + s).strip()
    return out


def _source_of(text):
    if 'ผู้ถือหุ้นเดิม' in text:
        return 'RO'
    if 'ใบสำคัญแสดงสิทธิ' in text:
        return 'W'
    if 'หุ้นกู้แปลงสภาพ' in text or 'แปลงสภาพหุ้นกู้' in text:
        return 'CB'
    if re.search(r'พนักงาน|ESOP', text):
        return 'ESOP'
    return 'PP'


def parse_listing(text):
    """Template 'รับหลักทรัพย์เพิ่มทุน' → dict, or (None, reason) when a check fails."""
    kv = kv_lines(text)
    if not kv or not kv[0][0].startswith('รับหลักทรัพย์เพิ่มทุน'):
        return None, 'not the listing template'
    shares, groups, section, r = {}, [], None, {}
    for k, v in kv:
        if k.startswith('ชื่อบริษัท'):
            m = re.search(r'\(([A-Z0-9&\-]+)\)\s*$', v)
            r['ticker'] = m.group(1) if m else None
        elif k.startswith('ทุนเดิม'):
            section = 'old'
        elif k.startswith('จำนวนหุ้นเพิ่มทุน'):
            section = 'new'
        elif k.startswith('ทุนใหม่'):
            section = 'total'
        elif k.startswith('- หุ้นสามัญ') and section:
            shares[section] = _num(v)
        elif k.startswith('- หุ้น'):
            pass  # preferred shares etc. - common shares only
        elif k.startswith('มูลค่าหุ้นที่ตราไว้'):
            r['par'] = _num(v)
        elif re.match(r'จัดสร+(?:ให้|เพื่อ)', k):  # SET writes "จัดสรรร"
            groups.append({'to': v, 'allottees': [{'name': re.sub(r'^\d\)\s*', '', a).strip(), 'shares': _num(n)}
                                                  for a, n in ALLOTTEE_RE.findall(v)]})
        elif groups and k.startswith(('ราคาเสนอขาย', 'ราคาจองซื้อ', 'ราคาใช้สิทธิ', 'ราคาการแปลงสภาพ')):
            groups[-1]['price'] = _num(v)
        elif groups and k.startswith('อัตรา'):
            a = re.findall(r'[\d][\d.,]*', v)
            if len(a) >= 2:
                groups[-1]['ratio'] = {'a': _num(a[0]), 'b': _num(a[1])}
        elif groups and k.startswith(('วันจองซื้อ', 'วันใช้สิทธิ')):
            groups[-1]['dates'] = th_dates(v)
        elif k.startswith('วันที่เริ่มซื้อขาย'):
            d = th_dates(v)
            r['date'] = d[0] if d else None
        elif k.startswith('หมายเหตุ'):
            r['note'] = v or None
    old, new, total = shares.get('old'), shares.get('new'), shares.get('total')
    if not (old and new and total) or abs(old + new - total) > 0.5:
        return None, f'shares do not add up ({old} + {new} != {total})'
    if not r.get('date'):
        return None, 'no first trade date'
    if not groups:
        return None, 'no allocation group'
    for g in groups:
        g['source'] = _source_of(g['to'])
    sources = sorted({g['source'] for g in groups})
    source = sources[0] if len(sources) == 1 else '+'.join(sources)
    allottees = [a for g in groups if g['source'] == 'PP' for a in g['allottees']]
    if source == 'PP' and abs(sum(a['shares'] or 0 for a in allottees) - new) > 0.5:
        return None, 'PP allottees do not add up to the new shares'
    prices = [g.get('price') for g in groups]
    uniq = sorted({p for p in prices if p is not None})
    ratio = next((g['ratio'] for g in groups if g.get('ratio')), None)
    return {
        'ticker': r.get('ticker'), 'date': r['date'], 'source_type': source,
        'shares': {'old': int(old), 'new': int(new), 'total': int(total), 'basis': 'actual'},
        'price': uniq[0] if len(uniq) == 1 else None,
        'prices': [{'price': g.get('price'), 'shares': int(sum(a['shares'] or 0 for a in g['allottees'])) or None} for g in groups] if len(uniq) > 1 else None,
        'ratio': ratio,  # RO: old : new · W / CB: security : shares
        'allottees': [{'name': a['name'], 'shares': int(a['shares'])} for a in allottees][:10],
        'subscription': next((g['dates'] for g in groups if g.get('dates')), None),
        'par': r.get('par'), 'note': r.get('note'),
    }, None


def parse_f535(text):
    """F53-5 'แบบรายงานผลการขายหุ้น' → dict, or (None, reason)."""
    kv = kv_lines(text)
    if not kv or 'F53-5' not in kv[0][0]:
        return None, 'not an F53-5 form'
    keys = [k for k, _ in kv]
    r = {}
    for i, (k, v) in enumerate(kv):
        if k.startswith('วันที่รายงานผล'):
            d = th_dates(v)
            r['report_date'] = d[0] if d else None
        elif k == 'ประเภทของหลักทรัพย์ที่เสนอขาย' and i + 1 < len(kv):
            r['security'] = keys[i + 1]
        elif k == 'เสนอขายให้แก่' and i + 1 < len(kv):
            r['offered_to'] = keys[i + 1]
        elif k.startswith('อัตรา') and 'ratio' not in r:
            a = re.findall(r'[\d][\d.,]*', v)
            if len(a) >= 2:
                r['ratio'] = {'a': _num(a[0]), 'b': _num(a[1])}
        elif k.startswith(('ราคาจองซื้อ', 'ราคาเสนอขาย')) and 'price' not in r:
            r['price'] = _num(v)
        elif k.startswith('วันจองซื้อ') and 'subscription' not in r:
            r['subscription'] = th_dates(v)
        elif k.startswith('รวมจำนวนหุ้นที่จัดสรร'):
            r['allotted'] = _num(v)
        elif k.startswith('รวมจำนวนหุ้นที่ขายได้'):
            r['sold'] = _num(v)
        elif k.startswith('รวมจำนวนหุ้นคงเหลือ'):
            r['left'] = _num(v)
        elif k.startswith('จำนวนเงินที่ได้รับรวม'):
            r['proceeds'] = _num(v)
    if r.get('security') != 'หุ้นสามัญ' or 'ผู้ถือหุ้น' not in (r.get('offered_to') or ''):
        return None, f"not a rights offering of common shares ({r.get('security')} / {r.get('offered_to')})"
    if not r.get('allotted') or r.get('sold') is None or abs(r['sold'] + (r.get('left') or 0) - r['allotted']) > 0.5:
        return None, 'sold + left != allotted'
    r['allotted'], r['sold'] = int(r['allotted']), int(r['sold'])
    r['left'] = int(r['left']) if r.get('left') is not None else None
    r['take_up_pct'] = round(r['sold'] / r['allotted'] * 100, 2)
    return r, None


# ── Settrade x-calendar (XR / XW) ────────────────────────────────────────────

def ratio_parts(s):
    a = [_num(x) for x in re.findall(r'[\d][\d.,]*', s or '')]
    return (a[0], a[1]) if len(a) == 2 and a[0] and a[1] else (None, None)


def xr_xw_events(cal_days, start, end):
    """XR / XW events with xdate in [start, end] from raw x-calendar days; XR+XW of one ticker+xdate are linked."""
    out = []
    for day in cal_days or []:
        for grp in day.get('types') or []:
            for ca in grp.get('corporateActions') or []:
                kind = ca.get('caType') or grp.get('type')
                if kind not in ('XR', 'XW'):
                    continue
                xd = (ca.get('xdate') or day.get('date') or '')[:10]
                if not xd or not (start.isoformat() <= xd <= end.isoformat()):
                    continue
                o, n = ratio_parts(ca.get('ratio'))
                allot = ca.get('allotShare')
                out.append({
                    'id': f"{kind}:{ca.get('symbol')}:{xd}", 'kind': kind, 'ticker': ca.get('symbol'), 'date': xd,
                    'record_date': (ca.get('recordDate') or '')[:10] or None,
                    'subscription': {'begin': (ca.get('beginSubscription') or '')[:10] or None,
                                     'end': (ca.get('endSubscription') or '')[:10] or None},
                    'ratio': {'old': o, 'new': n, 'text': ca.get('ratio')},
                    'price': ca.get('price'), 'rights_for': ca.get('rightsFor'),
                    'allot_share': allot,
                    # old shares = allotShare × old/new (exact: SOLAR / B52 checked against SET)
                    'shares': {'old': round(allot * o / n) if allot and o and n else None, 'new': allot, 'basis': 'max'},
                    'linked': None,
                    'origin': {'source': 'settrade-calendar'},
                })
    seen_ids = {}
    for e in out:  # two XW of one ticker on one day (e.g. two warrant series) → unique ids
        n = seen_ids.get(e['id'], 0)
        seen_ids[e['id']] = n + 1
        if n:
            e['id'] = f"{e['id']}#{n + 1}"
    by_key = {}
    for e in out:
        by_key.setdefault((e['ticker'], e['date']), []).append(e)
    for evs in by_key.values():
        xr = [e for e in evs if e['kind'] == 'XR']
        xw = [e for e in evs if e['kind'] == 'XW']
        if xr and xw:
            for e in xr:
                e['linked'] = [w['id'] for w in xw]
            for e in xw:
                e['linked'] = [r['id'] for r in xr]
    out.sort(key=lambda e: (e['date'], e['ticker'], e['kind']))
    return out


# ── linking ──────────────────────────────────────────────────────────────────

def link_ro_results(events):
    """Attach each ro_result to the same ticker's RO listing / XR (basis actual)."""
    results = [e for e in events if e['kind'] == 'ro_result']
    for e in events:
        if e['kind'] == 'listing' and e.get('source_type') == 'RO':
            r = next((x for x in sorted(results, key=lambda x: x['date'], reverse=True)
                      if x['ticker'] == e['ticker'] and x['date'] <= e['date'] and (x.get('price') is None or x['price'] == e.get('price'))), None)
            if r:
                e['result'] = {'news_id': r.get('news_id'), 'allotted': r['allotted'], 'sold': r['sold'], 'take_up_pct': r['take_up_pct']}
            elif e.get('ratio') and e['ratio'].get('a') and e['ratio'].get('b'):
                mx = e['shares']['old'] * e['ratio']['b'] / e['ratio']['a']
                e['result'] = {'news_id': None, 'allotted': round(mx), 'sold': e['shares']['new'],
                               'take_up_pct': round(e['shares']['new'] / mx * 100, 2), 'from': 'listing÷ratio'}
        elif e['kind'] == 'XR':
            r = next((x for x in results if x['ticker'] == e['ticker'] and x['date'] >= e['date'] and x.get('price') == e.get('price')), None)
            if r:
                e['result'] = {'news_id': r.get('news_id'), 'allotted': r['allotted'], 'sold': r['sold'], 'take_up_pct': r['take_up_pct']}
                e['shares'] = dict(e['shares'], actual_new=r['sold'])
    return events


# ── IO ──────────────────────────────────────────────────────────────────────

class Fetcher:
    """One opener with cookies; >= REQUEST_GAP s between requests; counts requests."""

    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last = 0.0
        self.count = 0

    def get(self, url, accept='*/*', referer=None, timeout=20):
        wait = REQUEST_GAP - (time.monotonic() - self.last)
        if self.last and wait > 0:
            time.sleep(wait)
        h = {'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'}
        if referer:
            h['Referer'] = referer
        try:
            with self.op.open(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        finally:
            self.last = time.monotonic()
            self.count += 1


def months_between(start, end):
    y, m, out = start.year, start.month, []
    while (y, m) <= (end.year, end.month):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def load_capital_news(today, universe, is_fund):
    """SET headlines of the last NEWS_DAYS days that classify as listing / ro_result / board, newest first, one per news_id."""
    cutoff = today - timedelta(days=NEWS_DAYS)
    items, seen = [], set()
    for path in sorted(glob.glob(os.path.join(HISTORY_DIR, '*', 'news.json')), reverse=True):
        try:
            d = date.fromisoformat(os.path.basename(os.path.dirname(path)))
        except ValueError:
            continue
        if d > today or d < cutoff:
            continue
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f'[capital-events] WARN cannot read {path}: {e}')
            continue
        rows = data if isinstance(data, list) else data.get('items', [])
        known = universe | {str(i.get('tickerHint')).strip().upper() for i in rows if i.get('tickerHint')}
        for it in rows:
            if not str(it.get('source', '')).startswith('SET'):
                continue
            nd = item_date(it)
            if nd is None or nd > today or nd < cutoff:
                continue
            m = re.search(r'[?&]id=(\d+)', it.get('link') or '')
            nid = m.group(1) if m else None
            if not nid or nid in seen:
                continue
            tickers = news_tickers(it, known)
            if not tickers:
                continue
            kind, tags = classify_title(it.get('title'), any(is_fund(t) for t in tickers))
            if not kind:
                continue
            seen.add(nid)
            items.append({'news_id': nid, 'date': nd.isoformat(), 'ticker': tickers[0], 'title': it.get('title'),
                          'kind': kind, 'tags': tags, 'ts': it.get('ts') or 0})
    items.sort(key=lambda x: (x['date'], x['ts']), reverse=True)
    return items


def build(today, fetch=True, prev=None, max_fetch=MAX_FETCH):
    warnings = []
    prev = prev or {}
    cache = dict(prev.get('fetched') or {})  # news_id -> {status, event|reason}
    try:
        with open(SECTOR_MAP_FILE, encoding='utf-8') as f:
            t2s = json.load(f).get('ticker_to_sector', {})
    except Exception as e:
        t2s = {}
        warnings.append(f'sector_map unreadable: {e}')
    universe = set(t2s)
    is_fund = lambda t: (t2s.get(t) or {}).get('subsector') == FUND_SUBSECTOR  # noqa: E731

    fetcher = Fetcher() if fetch else None
    events = []

    # 1) SET announcements
    try:
        news = load_capital_news(today, universe, is_fund)
    except Exception as e:
        news = []
        warnings.append(f'news load failed: {e}')
    fetched_now, pending = 0, 0
    board_seen = set()
    for n in news:
        link = SET_NEWS_URL.format(id=n['news_id'], sym=n['ticker'])
        if n['kind'] == 'board':
            key = (n['ticker'], re.sub(r'\s*\((?:แก้ไข|เพิ่มเติม)[^)]*\)', '', n['title']).strip())
            if key in board_seen:
                continue  # an older version of the same headline
            board_seen.add(key)
            events.append({'id': f"BOARD:{n['ticker']}:{n['news_id']}", 'kind': 'board', 'ticker': n['ticker'], 'date': n['date'],
                           'tags': n['tags'], 'title': n['title'], 'origin': {'source': 'set-news', 'news_id': n['news_id'], 'link': link}})
            continue
        c = cache.get(n['news_id'])
        if c is None:
            if not fetcher or fetched_now >= max_fetch:
                pending += 1
                continue
            try:
                page = fetcher.get(link, accept='text/html').decode('utf-8', errors='replace')
            except Exception as e:
                warnings.append(f"{n['ticker']} {n['news_id']}: fetch failed ({e}) - retry next run")
                fetched_now += 1
                continue
            fetched_now += 1
            body, pdf = extract_body(page)
            if not body:
                warnings.append(f"{n['ticker']} {n['news_id']}: empty page - retry next run")
                continue
            parsed, why = (parse_listing if n['kind'] == 'listing' else parse_f535)(body)
            if parsed is None:
                c = {'status': 'invalid', 'kind': n['kind'], 'ticker': n['ticker'], 'date': n['date'], 'reason': why}
                warnings.append(f"{n['ticker']} {n['news_id']}: dropped - {why}")
            else:
                c = {'status': 'ok', 'kind': n['kind'], 'ticker': n['ticker'], 'date': n['date'], 'data': parsed, 'pdf': pdf}
            cache[n['news_id']] = c
        if c.get('status') != 'ok':
            continue
        d = dict(c['data'])
        tk = d.pop('ticker', None) or c['ticker']
        if n['kind'] == 'listing':
            events.append({'id': f"LIST:{tk}:{d['date']}:{n['news_id']}", 'kind': 'listing', 'ticker': tk, 'announce_date': n['date'], **d,
                           'origin': {'source': 'set-news', 'news_id': n['news_id'], 'link': link, 'pdf': c.get('pdf')}})
        else:
            events.append({'id': f"RORES:{tk}:{n['news_id']}", 'kind': 'ro_result', 'ticker': tk, 'date': d.get('report_date') or n['date'],
                           'news_id': n['news_id'], **d, 'origin': {'source': 'set-news', 'news_id': n['news_id'], 'link': link}})
    if pending:
        warnings.append(f'{pending} announcement(s) not fetched yet (limit {max_fetch}/run) - next run')
    # forget cache entries older than the news window
    cutoff = (today - timedelta(days=NEWS_DAYS + 5)).isoformat()
    cache = {k: v for k, v in cache.items() if (v.get('date') or '') >= cutoff}

    # 2) Settrade XR / XW
    xr_ok = False
    if fetcher:
        start, end = today - timedelta(days=XR_BACK_DAYS), today + timedelta(days=XR_AHEAD_DAYS)
        try:
            fetcher.get(CAL_PAGE, accept='text/html', timeout=15)
            days = []
            for y, m in months_between(start, end):
                raw = fetcher.get(CAL_API.format(y=y, m=m), accept='application/json', referer=CAL_PAGE, timeout=15)
                got = json.loads(raw)
                if not isinstance(got, list):
                    raise ValueError(f'{y}-{m:02d}: not a list')
                days.extend(got)
            events.extend(xr_xw_events(days, start, end))
            xr_ok = True
        except Exception as e:
            warnings.append(f'settrade x-calendar failed: {e} - XR/XW empty this run')
    else:
        warnings.append('--no-fetch: XR/XW not fetched')

    link_ro_results(events)
    events.sort(key=lambda e: (e['date'], e['ticker'], e['kind']))
    counts = {}
    for e in events:
        counts[e['kind']] = counts.get(e['kind'], 0) + 1
    return {
        'generated_at': datetime.now(BANGKOK_TZ).isoformat(timespec='seconds'),
        'as_of': today.isoformat(),
        'schema_version': 1,
        'sources': {'set_news': {'headlines': len(news), 'fetched_now': fetched_now, 'pending': pending},
                    'settrade_calendar': {'ok': xr_ok}, 'requests': fetcher.count if fetcher else 0},
        'counts': counts,
        'warnings': warnings,
        'events': events,
        'fetched': cache,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=OUT_FILE)
    ap.add_argument('--prev', default=None, help='previous file for the news_id cache (default: --out)')
    ap.add_argument('--today', default=None, help='YYYY-MM-DD (testing)')
    ap.add_argument('--no-fetch', action='store_true')
    ap.add_argument('--max-fetch', type=int, default=MAX_FETCH)
    args = ap.parse_args()
    today = date.fromisoformat(args.today) if args.today else datetime.now(BANGKOK_TZ).date()
    prev = None
    for p in (args.prev, args.out):
        if p and os.path.exists(p):
            try:
                with open(p, encoding='utf-8') as f:
                    prev = json.load(f)
                break
            except Exception as e:
                print(f'[capital-events] WARN previous file unreadable ({p}): {e}')
    t0 = time.monotonic()
    try:
        out = build(today, fetch=not args.no_fetch, prev=prev, max_fetch=args.max_fetch)
    except Exception as e:  # never fail the job: write an empty file with the reason
        out = {'generated_at': datetime.now(BANGKOK_TZ).isoformat(timespec='seconds'), 'as_of': today.isoformat(), 'schema_version': 1,
               'warnings': [f'build failed: {e}'], 'events': [], 'fetched': (prev or {}).get('fetched') or {}}
    try:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        tmp = args.out + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        os.replace(tmp, args.out)
    except Exception as e:
        print(f'[capital-events] ERROR cannot write {args.out}: {e}')
        sys.exit(1)
    print(f"[capital-events] {len(out['events'])} events {out.get('counts')} · requests {out.get('sources', {}).get('requests')} · "
          f"{len(out['warnings'])} warnings · {time.monotonic() - t0:.1f}s → {args.out}")
    for w in out['warnings']:
        print(f'[capital-events] WARN {w}')


if __name__ == '__main__':
    main()
