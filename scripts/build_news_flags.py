"""
build_news_flags.py  –  rule-based "important news" flags per ticker for the scan pages.

Inputs (all read-only):
  - SET announcements in public/data/history/<date>/news.json (items whose source starts with "SET"):
    the last NEWS_WINDOW_DAYS days for every flag, the whole history for mark (latest state per code)
  - public/data/earnings/earnings_feed.json  (calendar: predicted / confirmed dates, announcements)
  - XD/XR calendar: Settrade stock-calendar API (session cookie first, same as
    app/api/corporate-action/route.ts); if Settrade refuses (CI IP), the deployed
    /api/corporate-action route; if both fail the xd_soon flag is skipped
  - data/scans/sector_map.json  (the ticker universe used to read tickers out of headlines)

Output: public/data/news_flags.json
  { generated_at, as_of, sources, flags: { TICKER: [ {type, label, severity, date, title, link} ] } }

Usage:
    python scripts/build_news_flags.py              # writes public/data/news_flags.json
    python scripts/build_news_flags.py --dry-run    # build + print counts, write nothing
    python scripts/build_news_flags.py --out <file> # write somewhere else (manual testing)
    python scripts/build_news_flags.py --no-xd      # skip the XD/XR network fetch

If no news file can be read at all the script logs ERROR, exits 1 and leaves the old file alone.
"""

import argparse
import glob
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

BANGKOK_TZ = timezone(timedelta(hours=7))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, '..'))
HISTORY_DIR = os.path.join(ROOT, 'public', 'data', 'history')
EARNINGS_FILE = os.path.join(ROOT, 'public', 'data', 'earnings', 'earnings_feed.json')
SECTOR_MAP_FILE = os.path.join(ROOT, 'data', 'scans', 'sector_map.json')
OUT_FILE = os.path.join(ROOT, 'public', 'data', 'news_flags.json')

# ── windows (days) ──────────────────────────────────────────────────────────
NEWS_WINDOW_DAYS = 30
EARNINGS_SOON_DAYS = 14
EARNINGS_OUT_DAYS = 7
XD_SOON_DAYS = 10
BUYBACK_DAYS = 7
CAPITAL_DAYS = 30
MGMT_DAYS = 30

# ── classification keywords (first matching category wins: mark → buyback → capital → mgmt) ──
# mark: "ขึ้น/ปลด(เครื่องหมาย) <code>[, <code> …]" — each code must be followed by a non-letter
_MARK_CODE = r'(?:SP|NP|NR|H|CB|CC|CF|CS|C)(?![A-Za-z])'
MARK_RE = re.compile(r'(ขึ้น|ปลด|เพิ่มเหตุ(?:การณ์)?)\s*(?:เครื่องหมาย)?\s*["“\'‘]?(' + _MARK_CODE + r'(?:\s*(?:,|และ|/)\s*' + _MARK_CODE + r')*)')
MARK_CODE_RE = re.compile(_MARK_CODE)
HALT_WORDS = ['หยุดพักการซื้อขาย']
# delisted ("เพิกถอน … จากการเป็นหลักทรัพย์จดทะเบียน", not "อาจถูกเพิกถอน") → every mark is cleared
DELIST_RE = re.compile(r'เพิกถอน(?:หลักทรัพย์)?.*จากการเป็นหลักทรัพย์จดทะเบียน')
HALT_LIFT_WORDS = ['ยกเลิกการหยุดพัก', 'ปลดการหยุดพัก']
BUYBACK_WORDS = ['ซื้อหุ้นคืน', 'Treasury Stock', 'treasury stock']
BUYBACK_EXCLUDE = ['บริษัทร่วมทุน', 'จากผู้ถือหุ้น']
CAPITAL_WORDS = ['เพิ่มทุน', 'Right Offering', 'Rights Offering', 'Private Placement', 'ออกใบสำคัญแสดงสิทธิ']
CAPITAL_TOKEN_RE = re.compile(r'(?<![A-Za-z])(RO|PP)(?![A-Za-z])')
CAPITAL_EXCLUDE = ['แบบรายงานผลการใช้สิทธิ', 'กำหนดการใช้สิทธิ']
CANCEL_WORD = 'ยกเลิก'
# investing in / waiving someone else's new shares - not this company raising capital ...
CAPITAL_OTHER_CO = ['ลงทุนในหุ้น', 'ซื้อหุ้นเพิ่มทุน', 'เพิ่มทุนของบริษัท', 'เพิ่มทุนของบมจ', 'เพิ่มทุนของ บมจ', 'สละสิทธิ']
# ... unless the headline also names this company's own raise
CAPITAL_OWN_MARKERS = ['เพิ่มทุนจดทะเบียน', 'Right Offering', 'Rights Offering', 'Private Placement', 'ออกใบสำคัญแสดงสิทธิ']
MGMT_ACTION_WORDS = ['เปลี่ยนแปลง', 'แต่งตั้ง', 'ลาออก', 'เปลี่ยน']
MGMT_ROLE_WORDS = ['CEO', 'CFO', 'ประธานกรรมการ', 'กรรมการผู้จัดการ', 'ประธานเจ้าหน้าที่บริหาร', 'ประธานเจ้าหน้าที่การเงิน']
MGMT_DEPUTY_RE = re.compile(r'(รอง|ผู้ช่วย)(กรรมการผู้จัดการ|ประธานกรรมการ|ประธานเจ้าหน้าที่)\S*')  # deputies don't count
# never flagged regardless of wording (form-59 digests, AGM/EGM notices, agenda calls, new subsidiaries)
SKIP_WORDS = ['แบบ 59', 'เชิญเสนอ', 'เสนอวาระ', 'เสนอระเบียบวาระ', 'เชิญประชุม', 'จัดตั้งบริษัทย่อย']

TICKER_TOKEN_RE = re.compile(r'(?<![A-Za-z0-9])([A-Z][A-Z0-9&\-]{1,9})(?![A-Za-z0-9])')

SEVERITY = {
    'mark': 'red',
    'earnings_soon': 'orange',
    'xd_soon': 'orange',
    'buyback': 'blue',
    'capital': 'purple',
    'mgmt': 'gray',
    'earnings_out': 'green',
}
SEVERITY_ORDER = ['red', 'orange', 'blue', 'purple', 'gray', 'green']

SET_QUOTE_URL = 'https://www.set.or.th/th/market/product/stock/quote/{}/rights-benefits'
CAL_PAGE = 'https://www.settrade.com/th/equities/stock-calendar'
CAL_API = 'https://www.settrade.com/api/set/stock-calendar/{y}/{m}/x-calendar?symbols=&caTypes='
FALLBACK_CA_URL = 'https://stockdesk-chi.vercel.app/api/corporate-action?from={f}&to={t}'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'


# ── pure functions ──────────────────────────────────────────────────────────

def news_tickers(item, universe):
    """Tickers a news item is about: tickerHint (unless missing / "SET"), else tokens in the title that are in `universe`."""
    hint = (item.get('tickerHint') or '').strip().upper()
    if hint and hint != 'SET':
        return [hint]
    seen = []
    for tok in TICKER_TOKEN_RE.findall(item.get('title') or ''):
        if tok in universe and tok not in seen:
            seen.append(tok)
    return seen


def classify(title):
    """(category, detail) for a SET headline; category None = not flagged.

    mark → detail {code: on} for every code the headline puts on (ขึ้น) or lifts (ปลด),
    e.g. "ขึ้นเครื่องหมาย SP และปลดเครื่องหมาย CC" → {'SP': True, 'CC': False} ("เพิ่มเหตุ CB" counts as on);
    'delist' (no flag, clears every mark of the ticker); other categories → detail None.
    """
    t = title or ''
    changes = {}
    for m in MARK_RE.finditer(t):
        for code in MARK_CODE_RE.findall(m.group(2)):
            changes[code] = m.group(1) != 'ปลด'
    if changes:
        return 'mark', changes
    if DELIST_RE.search(t) and 'อาจ' not in t:
        return 'delist', None
    if any(w in t for w in HALT_WORDS):
        return 'mark', {'H': not any(w in t for w in HALT_LIFT_WORDS)}
    if any(w in t for w in SKIP_WORDS):
        return None, None
    if any(w in t for w in BUYBACK_WORDS):
        return (None, None) if any(w in t for w in BUYBACK_EXCLUDE) else ('buyback', None)
    if any(w in t for w in CAPITAL_WORDS) or CAPITAL_TOKEN_RE.search(t):
        if CANCEL_WORD in t or any(w in t for w in CAPITAL_EXCLUDE):
            return None, None
        own = any(w in t for w in CAPITAL_OWN_MARKERS) or CAPITAL_TOKEN_RE.search(t)
        if any(w in t for w in CAPITAL_OTHER_CO) and not own:
            return None, None
        return 'capital', None
    roles = MGMT_DEPUTY_RE.sub('', t)
    if any(w in t for w in MGMT_ACTION_WORDS) and any(w in roles for w in MGMT_ROLE_WORDS):
        return 'mgmt', None
    return None, None


def item_date(item):
    """Bangkok date of a news item (ts in ms, else ISO / RFC pubDate)."""
    ts = item.get('ts')
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).astimezone(BANGKOK_TZ).date()
    try:
        return datetime.fromisoformat(item['pubDate']).astimezone(BANGKOK_TZ).date()
    except Exception:
        return None


def _flag(ftype, label, d, title, link):
    return {'type': ftype, 'label': label, 'severity': SEVERITY[ftype], 'date': d.isoformat() if d else None,
            'title': title, 'link': link}


def news_flags(items, universe, today):
    """Flags from SET announcements. items: news.json rows (any source; non-SET ignored).

    mark looks at every item given (latest state per code, however old); the other
    categories only at the last NEWS_WINDOW_DAYS days (then their own shorter windows).
    """
    seen = set()
    events = {}  # ticker -> list of (date, ts, category, detail, title, link)
    # headlines without a hint may name tickers outside sector_map (e.g. a delisted stock whose
    # earlier announcements carried its own hint) - accept any ticker seen as a hint too
    known = set(universe) | {str(i.get('tickerHint')).strip().upper() for i in items
                             if i.get('tickerHint') and str(i.get('tickerHint')).strip().upper() != 'SET'}
    for it in items:
        if not str(it.get('source', '')).startswith('SET'):
            continue
        d = item_date(it)
        if d is None or d > today:
            continue
        cat, detail = classify(it.get('title'))
        if cat is None or (cat not in ('mark', 'delist') and (today - d).days > NEWS_WINDOW_DAYS):
            continue
        for t in news_tickers(it, known):
            key = (t, it.get('link'), it.get('title'))
            if key in seen:
                continue
            seen.add(key)
            events.setdefault(t, []).append((d, it.get('ts') or 0, cat, detail, it.get('title'), it.get('link')))

    out = {}
    for t, evs in events.items():
        evs.sort(key=lambda e: (e[0], e[1]))
        flags = []
        # mark: latest state per code; show the codes still on
        state = {}
        for d, _, cat, detail, title, link in evs:
            if cat == 'mark':
                for code, is_on in detail.items():
                    state[code] = (is_on, d, title, link)
            elif cat == 'delist':
                state.clear()
        on = [(c, v) for c, v in state.items() if v[0]]
        if on:
            on.sort(key=lambda cv: cv[1][1])
            _, d, title, link = on[-1][1]
            flags.append(_flag('mark', 'เครื่องหมาย ' + ', '.join(c for c, _ in on), d, title, link))
        for cat, window, label in (('buyback', BUYBACK_DAYS, 'ซื้อหุ้นคืน'),
                                   ('capital', CAPITAL_DAYS, 'เพิ่มทุน'),
                                   ('mgmt', MGMT_DAYS, 'เปลี่ยนผู้บริหาร')):
            recent = [e for e in evs if e[2] == cat and (today - e[0]).days <= window]
            if recent:
                d, _, _, _, title, link = recent[-1]
                flags.append(_flag(cat, label, d, title, link))
        if flags:
            out[t] = flags
    return out


def _parse_day(s):
    try:
        return datetime.fromisoformat(s).astimezone(BANGKOK_TZ).date()
    except Exception:
        try:
            return date.fromisoformat(s[:10])
        except Exception:
            return None


def earnings_flags(feed, today):
    """earnings_soon (predicted date within EARNINGS_SOON_DAYS, nothing filed since) and earnings_out (filed within EARNINGS_OUT_DAYS)."""
    out = {}
    if not feed:
        return out
    buckets = feed.get('buckets') or {}
    filed = {}  # ticker -> latest announcement / confirmed date
    for a in feed.get('announcements') or []:
        d = _parse_day(a.get('announceDate') or '')
        t = a.get('ticker')
        if not t or d is None or d > today:
            continue
        if t not in filed or d >= filed[t][0]:
            filed[t] = (d, a)
    for c in feed.get('calendar') or []:
        t, d = c.get('ticker'), _parse_day(c.get('date') or '')
        if c.get('status') == 'confirmed' and t and d and d <= today and (t not in filed or d > filed[t][0]):
            filed[t] = (d, c)

    for t, (d, a) in filed.items():
        if (today - d).days <= EARNINGS_OUT_DAYS:
            label = 'งบออกแล้ว'
            b = buckets.get(a.get('bucket') or '', {}).get('label')
            if b:
                label += ' · ' + b
            q = a.get('quarter') or ''
            out.setdefault(t, []).append(_flag('earnings_out', label, d, f'ส่งงบ {q}'.strip(), a.get('f45Url')))

    for c in feed.get('calendar') or []:
        t, d = c.get('ticker'), _parse_day(c.get('date') or '')
        if c.get('status') != 'predicted' or not t or d is None:
            continue
        days = (d - today).days
        if not 0 <= days <= EARNINGS_SOON_DAYS:
            continue
        if t in filed and (d - filed[t][0]).days < 45:  # already filed for this round
            continue
        label = 'งบออก ~วันนี้' if days == 0 else f'งบออก ~{days} วัน'
        title = 'วันคาดส่งงบ (ทำนายจากรอบเดียวกันของปีก่อน)'
        out.setdefault(t, []).append(_flag('earnings_soon', label, d, title, None))
    return out


def xd_flags(rows, today):
    """xd_soon from corporate-action rows ({ticker, caType|bucket, xDate, detail})."""
    out = {}
    for r in rows or []:
        kind = (r.get('bucket') or r.get('caType') or '').upper()
        if kind not in ('XD', 'XR'):
            continue
        t, d = r.get('ticker'), _parse_day(r.get('xDate') or '')
        if not t or d is None:
            continue
        days = (d - today).days
        if not 0 <= days <= XD_SOON_DAYS:
            continue
        label = f'{kind} วันนี้' if days == 0 else f'{kind} ใน {days} วัน'
        title = f'วัน {kind}' + (f' · {r["detail"]}' if r.get('detail') else '')
        out.setdefault(t, []).append(_flag('xd_soon', label, d, title, SET_QUOTE_URL.format(t)))
    return out


def merge_flags(*parts):
    """Union per ticker, one flag per type (first wins), sorted by severity then date desc."""
    merged = {}
    for part in parts:
        for t, flags in part.items():
            cur = merged.setdefault(t, [])
            for f in flags:
                if not any(x['type'] == f['type'] for x in cur):
                    cur.append(f)
    for t in merged:
        merged[t].sort(key=lambda f: (SEVERITY_ORDER.index(f['severity']), -(date.fromisoformat(f['date']).toordinal() if f['date'] else 0)))
    return dict(sorted(merged.items()))


# ── IO ──────────────────────────────────────────────────────────────────────

def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_news(today):
    """All news days up to today (mark needs the whole history). Days older than
    NEWS_WINDOW_DAYS keep only SET items. ok/bad count the recent window only."""
    items, ok, bad, older = [], 0, 0, 0
    cutoff = today - timedelta(days=NEWS_WINDOW_DAYS)
    for path in sorted(glob.glob(os.path.join(HISTORY_DIR, '*', 'news.json'))):
        try:
            d = date.fromisoformat(os.path.basename(os.path.dirname(path)))
        except ValueError:
            continue
        if d > today:
            continue
        recent = d >= cutoff
        try:
            data = load_json(path)
            rows = data if isinstance(data, list) else data.get('items', [])
            if recent:
                items.extend(rows)
                ok += 1
            else:
                items.extend(r for r in rows if str(r.get('source', '')).startswith('SET'))
                older += 1
        except Exception as e:
            if recent:
                bad += 1
            print(f'[news-flags] WARN cannot read {path}: {e}')
    return items, ok, bad, older


def ca_detail(ca):
    """Short text for a raw Settrade corporate action: dividend for XD, ratio / price for XR."""
    if ca.get('dividend') is not None:
        return f"เงินปันผล {ca['dividend']} บาท/หุ้น"
    if ca.get('tentativeDividend'):
        return f"เงินปันผล เบื้องต้น {ca['tentativeDividend']} บาท/หุ้น"
    parts = []
    if ca.get('ratio'):
        parts.append(f"อัตราส่วน {ca['ratio']}")
    if ca.get('price') is not None:
        parts.append(f"ราคา {ca['price']} บาท")
    return ' · '.join(parts)


def _ca_from_settrade(today):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.open(urllib.request.Request(CAL_PAGE, headers={'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'th-TH,th;q=0.9'}), timeout=15).read()
    rows = []
    end = today + timedelta(days=XD_SOON_DAYS)
    months = {(today.year, today.month), (end.year, end.month)}
    for y, m in sorted(months):
        req = urllib.request.Request(CAL_API.format(y=y, m=m), headers={'User-Agent': UA, 'Accept': 'application/json', 'Referer': CAL_PAGE})
        days = json.load(op.open(req, timeout=15))
        for day in days:
            for grp in day.get('types') or []:
                for ca in grp.get('corporateActions') or []:
                    rows.append({'ticker': ca.get('symbol'), 'caType': ca.get('caType') or grp.get('type'),
                                 'xDate': (ca.get('xdate') or day.get('date') or '')[:10],
                                 'detail': ca_detail(ca)})
    return rows


def _ca_from_deployed(today):
    url = FALLBACK_CA_URL.format(f=today.isoformat(), t=(today + timedelta(days=XD_SOON_DAYS)).isoformat())
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
        return json.load(r).get('rows') or []


def load_corporate_actions(today):
    """(rows, source) — Settrade direct, else the deployed route, else ([], 'unavailable')."""
    for name, fn in (('settrade', _ca_from_settrade), ('stockdesk-api', _ca_from_deployed)):
        try:
            rows = fn(today)
            if rows:
                return rows, name
            print(f'[news-flags] WARN XD source {name}: no rows')
        except Exception as e:
            print(f'[news-flags] WARN XD source {name} failed: {e}')
    return [], 'unavailable'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--out', default=None)
    ap.add_argument('--no-xd', action='store_true')
    ap.add_argument('--today', default=None, help='YYYY-MM-DD (testing)')
    args = ap.parse_args()

    now = datetime.now(BANGKOK_TZ)
    today = date.fromisoformat(args.today) if args.today else now.date()

    t0 = time.monotonic()
    items, ok, bad, older = load_news(today)
    if ok == 0:
        print(f'[news-flags] ERROR no readable news.json in the last {NEWS_WINDOW_DAYS} days ({bad} unreadable) - leaving the old file untouched')
        sys.exit(1)

    universe = set(load_json(SECTOR_MAP_FILE).get('ticker_to_sector', {}))
    try:
        feed = load_json(EARNINGS_FILE)
    except Exception as e:
        print(f'[news-flags] WARN earnings_feed unreadable: {e}')
        feed = None
    ca_rows, ca_source = ([], 'skipped') if args.no_xd else load_corporate_actions(today)

    flags = merge_flags(news_flags(items, universe, today), earnings_flags(feed, today), xd_flags(ca_rows, today))
    out = {
        'generated_at': now.isoformat(timespec='seconds'),
        'as_of': today.isoformat(),
        'sources': {'news_days': ok, 'older_days_for_marks': older, 'news_items': len(items), 'earnings': feed is not None, 'xd': ca_source, 'xd_rows': len(ca_rows)},
        'flags': flags,
    }
    counts = {}
    for fl in flags.values():
        for f in fl:
            counts[f['type']] = counts.get(f['type'], 0) + 1
    print(f'[news-flags] as_of {today} · news days {ok} (+{older} older, marks only) · items {len(items)} · {time.monotonic() - t0:.1f}s · XD source {ca_source} ({len(ca_rows)} rows) · tickers {len(flags)} · {counts}')

    if args.dry_run:
        return
    path = args.out or OUT_FILE
    text = json.dumps(out, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'[news-flags] wrote {path}')


if __name__ == '__main__':
    main()
