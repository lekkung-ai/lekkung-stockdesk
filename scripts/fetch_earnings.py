"""
fetch_earnings.py - Market-wide earnings announcement feed (F45 + งบการเงิน + MD&A).

Endpoint probed 2026-07-14 via browser devtools on settrade.com:
  https://www.settrade.com/api/set/news/{ticker}/list?limit=N
This is the same per-ticker company-disclosure feed app/api/f45/[ticker]/route.ts
already scrapes (headline includes "F45"), just pulled for every ticker instead
of one. There is no market-wide "all companies today" variant of this endpoint
and set.or.th's own news center is Incapsula-blocked from a server (see
app/api/f45/[ticker]/route.ts comment) - so the only path to a market-wide feed
is iterating the full ticker universe, one request per ticker, same as this
script does. Response fields: id, datetime, symbol, source, url (set.or.th
newsdetails link - used verbatim as the outbound link, never re-hosted),
headline, tag ("financial-statement" on the actual งบการเงิน filing).

Also probed: the per-ticker feed has NO advance "board meeting scheduled to
approve financials" notice - "แจ้งมติที่ประชุมคณะกรรมการ..." headlines are same-day
resolution announcements (มติ = decision already made), not advance notices.
Checked 20 large caps (BBL, SCB, ADVANC, GULF, etc.) for a
"กำหนด...ประชุมคณะกรรมการ...งบ" (not มติ) pattern - zero matches. So the calendar's
"confirmed" column is only ever a real filing that already happened; there is
no earlier "board meeting date" signal to promote to confirmed. "Predicted"
dates are last year's same-quarter filing date shifted +365 days - the only
signal available.

F45 number parsing (parse_f45_detail) is a straight port of parseF45Detail()
in app/api/f45/[ticker]/route.ts - same <pre> block, same label regexes -
kept in sync manually since one is TS (request-time) and one is Python
(batch-time).

Usage:
    python fetch_earnings.py                 # writes real snapshot file
    python fetch_earnings.py --dry-run        # fetch + print summary, write nothing
    python fetch_earnings.py --out <dir>      # write into <dir> instead of the
                                               # real public/data/earnings/ tree
    python fetch_earnings.py --limit 50       # only process the first 50 tickers
                                               # (universe order, for quick testing)
    python fetch_earnings.py --tickers A,B,C  # only process this explicit list

Always use --dry-run or --out when testing manually - see save_research.py's
docstring for why (a bare test run once collided with the scheduled pipeline's
own git rebase).

Output:
    stockdesk/public/data/earnings/earnings_feed.json
"""

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
BANGKOK_TZ = timezone(timedelta(hours=7))
WINDOW_DAYS = 45
NEWS_LIST_LIMIT = 100  # Busy tickers (PTT, banks) bury quarterly filings under IR
                        # news - probed 2026-07-14: PTT's Aug-2025 F45 (needed for
                        # this year's prediction) sits at position 84/100, and does
                        # NOT appear at all within the most recent 40 items. 100 is
                        # the smallest limit that reliably keeps ~2yr of F45 history
                        # in view for the busiest tickers.
WORKERS = 16
DETAIL_MATCH_DAYS = 3  # statement/MD&A items are matched to their F45 anchor if
                        # filed within this many days of it

SCRIPT_DIR = os.path.dirname(__file__)
SECTOR_MAP_PATH = os.path.join(SCRIPT_DIR, '..', 'data', 'scans', 'sector_map.json')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'public', 'data', 'earnings')

BUCKET_LABELS = {
    'profit_growth': 'กำไรโต',
    'turnaround': 'พลิกกำไร',
    'profit_shrink': 'กำไรหด',
    'loss_shrink': 'ขาดทุนลดลง',
    'loss_worse': 'ขาดทุน-แย่ลง',
    'no_base': 'ไม่มีฐานเทียบ',
}


def make_ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def http_get(url, headers, timeout=10):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=make_ssl_ctx()) as resp:
        raw_cookies = resp.headers.get_all('Set-Cookie') or []
        cookie = '; '.join(c.split(';')[0].strip() for c in raw_cookies if c.strip())
        body = resp.read().decode('utf-8', errors='replace')
        return resp.status, body, cookie


def get_session_cookie():
    try:
        _, _, cookie = http_get(
            'https://www.settrade.com/th/home',
            {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
            },
        )
        return cookie
    except Exception:
        return ''


def fetch_news_list(ticker, cookie, limit=NEWS_LIST_LIMIT, max_tries=3):
    url = f'https://www.settrade.com/api/set/news/{ticker}/list?limit={limit}'
    for attempt in range(1, max_tries + 1):
        try:
            headers = {
                'User-Agent': UA,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
                'Referer': f'https://www.settrade.com/th/equities/quote/{ticker}/news',
            }
            if cookie:
                headers['Cookie'] = cookie
            status, body, _ = http_get(url, headers)
            if status == 200:
                data = json.loads(body)
                return data.get('newsInfoList', []) or []
        except Exception:
            pass
        if attempt < max_tries:
            time.sleep(0.4 * attempt)
    return []


def fetch_detail_html(news_id, ticker, cookie, max_tries=2):
    url = f'https://www.settrade.com/th/news-and-articles/news/{news_id}?symbol={ticker}'
    for attempt in range(1, max_tries + 1):
        try:
            headers = {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
                'Referer': f'https://www.settrade.com/th/equities/quote/{ticker}/news',
            }
            if cookie:
                headers['Cookie'] = cookie
            status, body, _ = http_get(url, headers)
            if status == 200:
                return body
        except Exception:
            pass
        if attempt < max_tries:
            time.sleep(0.4 * attempt)
    return ''


# ── Headline classification ─────────────────────────────────────────────────

def classify_kind(headline):
    if 'F45' in headline:
        return 'f45'
    if 'คำอธิบายและวิเคราะห์ของฝ่ายจัดการ' in headline or 'คำอธิบายและการวิเคราะห์ของฝ่ายจัดการ' in headline or 'MD&A' in headline:
        return 'mda'
    if 'งบการเงิน' in headline:
        return 'statement'
    return None


def is_correction(headline):
    return 'แก้ไข' in headline


# ── F45 detail-page parsing (port of parseF45Detail in f45/[ticker]/route.ts) ──

def parse_number(s):
    # SET's F45 template writes losses as "(34,882)" (accounting parens), not
    # "-34,882" - probed 2026-07-14 on DEXON's Q1 F45. The character class
    # below includes the parens so the surrounding profit-pair regex still
    # captures the full token; strip+negate here.
    try:
        s = s.strip()
        negative = s.startswith('(') and s.endswith(')')
        if negative:
            s = s[1:-1]
        n = float(s.replace(',', ''))
        return -n if negative else n
    except (ValueError, AttributeError):
        return None


def yoy_pct(curr, prior):
    if curr is None or prior is None or prior == 0:
        return None
    return (curr - prior) / abs(prior) * 100


def parse_f45_detail(html):
    pre_match = re.search(r'<pre>([\s\S]*?)</pre>', html)
    if not pre_match:
        return {}
    # Correction filings sometimes tag the revised figure inline with no
    # separating whitespace - e.g. "(0.04)(แก้ไข)       (0.14)" (verified on
    # NRF's corrected Q1 F45) - which would otherwise break the profit-pair
    # regex below (swallows the annotation's opening paren, never closes).
    # Kept in sync with the identical strip in lib/parseF45.ts.
    text = pre_match.group(1).replace('(แก้ไข)', '')

    quarter_match = re.search(r'ไตรมาสที่\s*(\d)', text)
    # Non-calendar fiscal-year companies (e.g. BTS, year-end 31 มี.ค.) label
    # their annual filing "12 เดือน" instead of "ประจำปี" - kept in sync with
    # the identical check in lib/parseF45.ts.
    is_annual = not quarter_match and ('ประจำปี' in text or re.search(r'12\s*เดือน', text))
    year_match = re.search(r'ปี\s*[\r\n\s\t]+(\d{4})\s+(\d{4})', text)
    period_end_match = re.search(r'สิ้นสุดวันที่[\s\S]{0,60}?(\d{1,2}\s+\S+)\s*[\r\n]', text)
    opinion_match = re.search(r'ประเภทรายงานของผู้สอบบัญชีในงบการเงิน[\s\S]{0,30}?[\r\n]\s*([^\r\n]+)', text)
    unit_is_thousand = bool(re.search(r'หน่วย\s*:\s*พันบาท', text))
    scale = 1000 if unit_is_thousand else 1

    profit_pairs = re.findall(r'กำไร \(ขาดทุน\)\s*([\d,.\-()]+)\s+([\d,.\-()]+)', text)
    net_profit = parse_number(profit_pairs[0][0]) if profit_pairs else None
    net_profit_prior = parse_number(profit_pairs[0][1]) if profit_pairs else None
    eps = parse_number(profit_pairs[1][0]) if len(profit_pairs) > 1 else None
    eps_prior = parse_number(profit_pairs[1][1]) if len(profit_pairs) > 1 else None

    net_profit_scaled = net_profit * scale if net_profit is not None else None
    net_profit_prior_scaled = net_profit_prior * scale if net_profit_prior is not None else None
    year = year_match.group(1) if year_match else ''

    if quarter_match:
        quarter = f'ไตรมาส {quarter_match.group(1)}/{year}'
    elif is_annual:
        quarter = f'ประจำปี {year}'
    else:
        quarter = None

    return {
        'quarter': quarter,
        'periodEnd': f"{period_end_match.group(1).strip()} {year}".strip() if period_end_match else None,
        'netProfit': net_profit_scaled,
        'netProfitPrior': net_profit_prior_scaled,
        'netProfitYoY': yoy_pct(net_profit_scaled, net_profit_prior_scaled),
        'eps': eps,
        'epsPrior': eps_prior,
        'epsYoY': yoy_pct(eps, eps_prior),
        'auditorOpinion': opinion_match.group(1).strip() if opinion_match else None,
    }


def classify_bucket(net_profit, net_profit_prior):
    # Kept in sync with classifyBucket() in lib/earningsBucket.ts - 6 buckets:
    #   profit_growth - profit both periods, this period >= last year
    #   profit_shrink - profit both periods, this period <  last year
    #   loss_shrink   - loss both periods, this period's loss <  last year's
    #   loss_worse    - loss both periods (this period's loss >= last year's),
    #                   OR profit last year but a loss this period
    #   turnaround    - last year was a loss (not zero/missing), profit this period
    #   no_base       - last year's netProfit is 0 or missing (new IPO, no
    #                   comparable prior-year period) - YoY undefined, must
    #                   never be folded into profit_growth/turnaround
    if net_profit is None:
        return None

    if net_profit_prior is None or net_profit_prior == 0:
        return 'no_base'

    was_profit = net_profit_prior > 0
    is_profit = net_profit > 0

    if is_profit and was_profit:
        return 'profit_growth' if net_profit >= net_profit_prior else 'profit_shrink'
    if not is_profit and was_profit:
        return 'loss_worse'  # profit -> loss
    if is_profit and not was_profit:
        return 'turnaround'  # loss -> profit
    return 'loss_shrink' if net_profit > net_profit_prior else 'loss_worse'


# ── Universe ─────────────────────────────────────────────────────────────────

def load_universe():
    with open(SECTOR_MAP_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    t2s = data.get('ticker_to_sector', {})
    return sorted(t2s.keys()), t2s


# ── Per-ticker processing ───────────────────────────────────────────────────

def parse_dt(iso_str):
    try:
        return datetime.fromisoformat(iso_str)
    except Exception:
        return None


def classify_profit_acceleration(net_profit, net_profit_prior, net_profit_prior_q, yoy, qoq):
    if net_profit is None:
        return 'stable'
    is_turnaround_yoy = net_profit_prior is not None and net_profit_prior < 0 and net_profit > 0
    is_turnaround_qoq = net_profit_prior_q is not None and net_profit_prior_q < 0 and net_profit > 0
    if is_turnaround_yoy and is_turnaround_qoq:
        return 'double_turnaround'
    if yoy is not None and yoy > 0 and qoq is not None and qoq > 0:
        return 'accelerating'
    if yoy is not None and yoy > 0 and qoq is not None and qoq < 0:
        return 'decelerating'
    return 'stable'


def process_ticker(ticker, sector_info, cookie, now, window_start, predict_from, predict_to):
    items = fetch_news_list(ticker, cookie)
    if not items:
        return None

    for it in items:
        it['_kind'] = classify_kind(it.get('headline', ''))
        it['_dt'] = parse_dt(it.get('datetime', ''))
    items = [it for it in items if it['_kind'] and it['_dt']]
    items.sort(key=lambda it: it['_dt'], reverse=True)

    f45_items = [it for it in items if it['_kind'] == 'f45']
    result = {'ticker': ticker, 'sector': sector_info.get('sector'), 'announcement': None, 'calendar': None}

    f45_in_window = next((it for it in f45_items if it['_dt'] >= window_start), None)

    if f45_in_window:
        detail_html = fetch_detail_html(f45_in_window['id'], ticker, cookie)
        parsed = parse_f45_detail(detail_html) if detail_html else {}
        net_profit = parsed.get('netProfit')
        net_profit_prior = parsed.get('netProfitPrior')

        anchor_dt = f45_in_window['_dt']

        # Fetch prior quarter F45 for QoQ comparison (skipping Annual filings)
        net_profit_prior_q = None
        net_profit_qoq = None
        f45_idx = f45_items.index(f45_in_window)
        for prev_candidate in f45_items[f45_idx + 1:]:
            detail_prev_html = fetch_detail_html(prev_candidate['id'], ticker, cookie)
            parsed_prev = parse_f45_detail(detail_prev_html) if detail_prev_html else {}
            q_label = parsed_prev.get('quarter') or ''
            if q_label and 'ประจำปี' not in q_label and '12 เดือน' not in q_label:
                net_profit_prior_q = parsed_prev.get('netProfit')
                net_profit_qoq = yoy_pct(net_profit, net_profit_prior_q)
                break

        def nearest(kind):
            cands = [
                it for it in items
                if it['_kind'] == kind and abs((it['_dt'] - anchor_dt).days) <= DETAIL_MATCH_DAYS
            ]
            return cands[0] if cands else None

        statement_item = nearest('statement')
        mda_item = nearest('mda')

        yoy = parsed.get('netProfitYoY')
        profit_acceleration = classify_profit_acceleration(net_profit, net_profit_prior, net_profit_prior_q, yoy, net_profit_qoq)

        result['announcement'] = {
            'ticker': ticker,
            'sector': sector_info.get('sector'),
            'subsector': sector_info.get('subsector'),
            'market': sector_info.get('market'),
            'announceDate': f45_in_window.get('datetime'),
            'quarter': parsed.get('quarter'),
            'periodEnd': parsed.get('periodEnd'),
            'netProfit': net_profit,
            'netProfitPrior': net_profit_prior,
            'netProfitYoY': yoy,
            'netProfitPriorQ': net_profit_prior_q,
            'netProfitQoQ': net_profit_qoq,
            'profitAcceleration': profit_acceleration,
            'eps': parsed.get('eps'),
            'epsPrior': parsed.get('epsPrior'),
            'epsYoY': parsed.get('epsYoY'),
            'auditorOpinion': parsed.get('auditorOpinion'),
            'isCorrection': is_correction(f45_in_window.get('headline', '')),
            'bucket': classify_bucket(net_profit, net_profit_prior),
            'f45Url': f45_in_window.get('url'),
            'statementUrl': statement_item.get('url') if statement_item else None,
            'mdaUrl': mda_item.get('url') if mda_item else None,
            'headline': f45_in_window.get('headline'),
        }
        result['calendar'] = {
            'ticker': ticker,
            'date': f45_in_window.get('datetime'),
            'status': 'confirmed',
            'quarter': parsed.get('quarter'),
        }
    else:
        # No filing in the current window - look for a prior-year same-quarter
        # F45 date that, shifted +365 days, lands in the prediction window.
        best = None
        for it in f45_items:
            predicted_date = it['_dt'] + timedelta(days=365)
            if predict_from <= predicted_date <= predict_to:
                if best is None or predicted_date > best[0]:
                    best = (predicted_date, it)
        if best:
            predicted_date, source_item = best
            result['calendar'] = {
                'ticker': ticker,
                'date': predicted_date.isoformat(),
                'status': 'predicted',
                'quarter': None,
                'basedOnLastYear': source_item.get('datetime'),
            }

    if not result['announcement'] and not result['calendar']:
        return None
    return result


# Same key strategy as scripts/extract_reason.py's cache_key() - must stay
# in sync. Used to carry data forward across a full regeneration of this
# file, the same merge-on-write principle save_news.py already uses for its
# own two-writers problem.
def _reason_key(a):
    return a.get('f45Url') or f"{a.get('ticker')}|{a.get('quarter')}|{a.get('announceDate')}"


def load_existing_announcements(out_path):
    if not os.path.exists(out_path):
        return {}
    try:
        with open(out_path, 'r', encoding='utf-8') as f:
            existing = json.load(f)
    except Exception:
        return {}
    return {_reason_key(a): a for a in existing.get('announcements', [])}


# reason/reason_source are carried forward by their own dedicated,
# key-matched restore (see the main-loop merge below) rather than by this
# generic pass, since a "fresh but empty" reason is the normal, expected
# state for a filing extract_reason.py hasn't processed yet - not something
# to unconditionally treat as data loss.
_FIELD_MERGE_EXCLUDE = {'reason', 'reason_source'}


def _is_empty(v):
    return v is None or v == ''


def merge_announcement_fields(new_a, old_a):
    """Field-level merge, not whole-record replacement: a run that only
    managed to fetch partial data for a ticker (e.g. the F45 detail-page
    fetch failed, so parse_f45_detail() returned {} and every derived field
    on the fresh record is None) must not blank out a previously-good field.
    A non-empty fresh value always wins - this is what lets a genuine
    correction filing actually update the numbers. Only an empty fresh value
    falls back to the old one, and never the reverse. This is the general
    form of the reason-loss bug fixed 2026-07-16/17 (which only patched the
    `reason` field) - the same partial-fetch failure could just as easily
    have blanked netProfit/quarter/etc, and did, which is why "-" was still
    showing up for tickers with a real prior filing."""
    if not old_a:
        return new_a
    merged = dict(new_a)
    for key, new_val in new_a.items():
        if key in _FIELD_MERGE_EXCLUDE:
            continue
        if _is_empty(new_val) and not _is_empty(old_a.get(key)):
            merged[key] = old_a[key]
    # netProfitYoY/epsYoY/bucket are derived from the fields just merged
    # above, not independent data - recompute rather than trust whichever
    # run's derived value happened to survive the merge.
    merged['netProfitYoY'] = yoy_pct(merged.get('netProfit'), merged.get('netProfitPrior'))
    merged['epsYoY'] = yoy_pct(merged.get('eps'), merged.get('epsPrior'))
    merged['bucket'] = classify_bucket(merged.get('netProfit'), merged.get('netProfitPrior'))
    return merged


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='fetch and print summary, write nothing')
    parser.add_argument('--out', default=None, help='write into this dir instead of the real public/data/earnings/ tree')
    parser.add_argument('--limit', type=int, default=None, help='only process the first N tickers (universe order)')
    parser.add_argument('--tickers', default=None, help='comma-separated explicit ticker list (overrides --limit/universe)')
    parser.add_argument('--workers', type=int, default=WORKERS, help='concurrent request workers')
    args = parser.parse_args()

    out_dir = args.out if args.out else OUTPUT_DIR
    if args.out:
        print(f"[--out] Writing into {out_dir} instead of the real earnings/ tree")
    if args.dry_run:
        print("[--dry-run] Fetching only - nothing will be written")

    universe, sector_map = load_universe()
    if args.tickers:
        universe = [t.strip().upper() for t in args.tickers.split(',') if t.strip()]
    elif args.limit:
        universe = universe[:args.limit]

    print(f"Universe: {len(universe)} tickers")

    cookie = get_session_cookie()
    print(f"Session cookie acquired: {'yes' if cookie else 'no (proceeding without)'}")

    now = datetime.now(BANGKOK_TZ)
    window_start = now - timedelta(days=WINDOW_DAYS)
    predict_from = now - timedelta(days=3)
    predict_to = now + timedelta(days=WINDOW_DAYS)

    announcements = []
    calendar = []
    errors = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_ticker, t, sector_map.get(t, {}), cookie, now, window_start, predict_from, predict_to): t
            for t in universe
        }
        done = 0
        for fut in as_completed(futures):
            t = futures[fut]
            done += 1
            if done % 100 == 0 or done == len(universe):
                print(f"  ...{done}/{len(universe)} tickers processed")
            try:
                res = fut.result()
            except Exception as e:
                print(f"  ERROR {t}: {e}")
                errors += 1
                continue
            if not res:
                continue
            if res['announcement']:
                announcements.append(res['announcement'])
            if res['calendar']:
                calendar.append(res['calendar'])

    announcements.sort(key=lambda a: a['announceDate'] or '', reverse=True)
    calendar.sort(key=lambda c: c['date'] or '')

    # Merge-on-write: (1) field-level merge so a run that only got partial
    # data for a ticker (a failed detail-page fetch, say) can't blank out
    # fields a previous successful run already captured, and (2) carry
    # forward any reason already extracted for a filing still in this run's
    # window, so this file never regresses to reason-less even if
    # extract_reason.py never gets to run afterward this time. A record that
    # never had a reason gets none here either way - extract_reason.py (or
    # the next run once it does succeed) is what actually fills new ones in.
    out_path_for_merge = os.path.join(args.out if args.out else OUTPUT_DIR, 'earnings_feed.json')
    existing_by_key = load_existing_announcements(out_path_for_merge)
    restored_reason = 0
    restored_fields = 0
    merged_announcements = []
    for a in announcements:
        old = existing_by_key.get(_reason_key(a))
        merged = merge_announcement_fields(a, old)
        if old and merged != a:
            restored_fields += 1

        if old and old.get('reason_source') == 'mda_extract' and old.get('reason'):
            merged['reason'], merged['reason_source'] = old['reason'], old['reason_source']
            restored_reason += 1
        else:
            merged.setdefault('reason', '')
            merged.setdefault('reason_source', 'none')
        merged_announcements.append(merged)
    announcements = merged_announcements
    if restored_reason:
        print(f"Carried forward {restored_reason} previously-extracted reason(s) from the existing file")
    if restored_fields:
        print(f"Backfilled empty field(s) on {restored_fields} record(s) from the existing file (partial-fetch protection)")

    buckets = {}
    for key, label in BUCKET_LABELS.items():
        members = [a for a in announcements if a['bucket'] == key]
        members_sorted = sorted(
            (a for a in members if a['netProfitYoY'] is not None),
            key=lambda a: a['netProfitYoY'],
            reverse=(key in ('profit_growth', 'turnaround', 'loss_shrink')),
        )
        buckets[key] = {
            'label': label,
            'count': len(members),
            'top3': [
                {'ticker': a['ticker'], 'netProfitYoY': a['netProfitYoY']}
                for a in members_sorted[:3]
            ],
        }

    output = {
        'generatedAt': now.isoformat(),
        'windowDays': WINDOW_DAYS,
        'universeSize': len(universe),
        'buckets': buckets,
        'announcements': announcements,
        'calendar': calendar,
    }

    print(f"\nSummary: {len(announcements)} announcements, {len(calendar)} calendar entries, {errors} errors")
    for key, label in BUCKET_LABELS.items():
        print(f"  {label}: {buckets[key]['count']}")

    if args.dry_run:
        print("\n[--dry-run] Not writing output file.")
        return

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'earnings_feed.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path}")


if __name__ == '__main__':
    main()
