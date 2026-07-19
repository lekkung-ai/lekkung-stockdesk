"""
extract_reason.py - Rule-based "สาเหตุ" (reason) extraction for earnings
announcements. Runs after fetch_earnings.py, reads its output
(earnings_feed.json), and adds a `reason` / `reason_source` field to each
announcement by pulling the MD&A (คำอธิบายและการวิเคราะห์ของฝ่ายจัดการ) PDF and
heuristically locating the sentence that explains the profit/loss move. No AI
API involved - pure keyword/regex heuristic, see extract_reason_sentence().

How the MD&A document is reached (probed 2026-07-16):
  - `mdaUrl` on each announcement is a set.or.th newsdetails link
    (`https://www.set.or.th/...`), which is Incapsula-blocked from a server
    and also blocked at the browser-tool-policy level - not fetchable
    directly.
  - The same disclosure is also reachable via settrade.com's detail page
    (`fetch_detail_html()`, imported from fetch_earnings.py - already used
    there for F45 numbers), built from mdaUrl's own `id`/`symbol` query
    params. That page's SSR-embedded Nuxt state includes a plain
    `"downloadUrl":"https:\\/\\/weblink.set.or.th\\/dat\\/news\\/...pdf"` key
    - a single regex on the already-fetched HTML, no browser/JS execution
    needed. weblink.set.or.th is not blocked either at the tool level or via
    plain urllib.
  - For an "mda" classified item, the settrade.com page's own inline
    `content` field is just a metadata stub (company/period, no narrative) -
    the actual causal-reasoning text only exists inside the linked PDF.
  - PDF text extraction: poppler's pdftotext (both -layout and default mode)
    produces garbled/missing Thai characters on these SET-generated PDFs -
    numbers and ASCII fragments survive, Thai script does not (broken/custom
    glyph-to-Unicode mapping in the embedded font). PyMuPDF (`fitz`) extracts
    clean, correct Thai text from the same file - used here instead.

Caching: extraction is expensive (fetch settrade detail page + fetch PDF +
parse) and MD&A documents never change after filing (except a genuine
correction filing, which gets its own distinct f45Url/news id and so is a
different cache key automatically - always extracted fresh). Results persist
in reason_cache.json keyed by f45Url, so a given filing is only ever
extracted once across all future runs even though earnings_feed.json itself
is fully regenerated (not merged) on every fetch_earnings.py run.

Schema note for future upgrade: `reason` / `reason_source` is deliberately
the same shape this would take if upgraded to an AI-generated summary later
("reason_source": "ai_summary" alongside "mda_extract"/"none") - the frontend
only needs to know reason is non-empty, not how it was produced.

Usage:
    python extract_reason.py                  # process real earnings_feed.json + reason_cache.json in place
    python extract_reason.py --dry-run         # extract + print quality report, write nothing
    python extract_reason.py --out <dir>       # read/write feed+cache in <dir> instead of the real tree
    python extract_reason.py --limit 5         # only run fresh extraction for the first 5 cache-miss items (testing)

Output (in addition to the report printed to stdout):
    stockdesk/public/data/earnings/earnings_feed.json   (reason/reason_source added to each announcement)
    stockdesk/public/data/earnings/reason_cache.json    (persistent extraction cache, keyed by f45Url)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import urlparse, parse_qs

import fitz  # PyMuPDF

sys.path.insert(0, os.path.dirname(__file__))
from fetch_earnings import (  # noqa: E402
    UA, BANGKOK_TZ, OUTPUT_DIR,
    make_ssl_ctx, get_session_cookie, fetch_detail_html,
)

SEARCH_WINDOW_CHARS = 2000
SENTENCE_TARGET_CHARS = 180
SENTENCE_MAX_CHARS = 220
PDF_MAX_PAGES = 6
PDF_TEXT_BUDGET = 3000  # stop reading pages once we have this much raw text (comfortably > SEARCH_WINDOW_CHARS after cleanup)

RESULT_KEYWORDS_RE = re.compile(r'(กำไร|ขาดทุน|รายได้)')
CONNECTOR_KEYWORDS_RE = re.compile(r'(เนื่องจาก|เป็นผลจาก|เป็นผลมาจาก|สาเหตุหลัก|จากการ|เพราะ)')
# Nuxt's SSR state is a minified JS object literal, not JSON - keys are bare
# identifiers (downloadUrl:"...", not "downloadUrl":"...").
DOWNLOAD_URL_RE = re.compile(r'downloadUrl\s*:\s*"([^"]*)"')
BOILERPLATE_PREFIX_RE = re.compile(
    r'^.*?(?:บริษัทฯ?\s*ขอชี้แจง(?:ผลการดำเนินงาน)?|ขอเรียนชี้แจง(?:ผลการดำเนินงาน)?'
    r'|เรียน\s*กรรมการและผู้จัดการ|ตลาดหลักทรัพย์แห่งประเทศไทย)', re.S
)
# PDF page-number footers/headers ("หน้า 1/3", "Page 2 of 5") and stray
# control/replacement characters left behind by the PDF's font remapping -
# both are extraction noise, never part of the actual narrative sentence.
PAGE_NUM_RE = re.compile(r'(?:หน้า(?:ที่)?|page)\s*\d+(?:\s*(?:/|of)\s*\d+)?', re.I)
CONTROL_CHARS_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f�]')
# Some of these PDFs remap accented Latin glyphs (Latin-1 Supplement / Latin
# Extended-A, e.g. ř ś š Š É Ê) onto what should be plain digits/Thai vowels -
# a font-embedding failure distinct from the sara-am one below. Unlike that
# one there's no safe character-level fix, so a sentence containing any of
# these is unrecoverably garbled and must be discarded rather than shown.
GARBLED_CHARS_RE = re.compile(r'[À-ɏ]')
# Thai vowel/tone marks that only ever attach to a preceding consonant and
# can never legitimately open a word on their own - if a candidate sentence
# starts with one, the cut landed inside a glyph cluster (a "mid-word" cut).
# ั mai han-akat, ิ-ฺ above/below vowels + phinthu,
# ็-๎ mai taikhu/tone marks/thanthakhat/yamakkan, ำ sara am.
THAI_NON_INITIAL_RE = re.compile(r'^[ัำิ-ฺ็-๎]')

FAIL_LABELS = {
    'no_mda_url': 'ไม่มีเอกสาร MD&A แนบ (mdaUrl ว่าง)',
    'bad_mda_url': 'แกะ id/symbol จาก mdaUrl ไม่ได้',
    'detail_fetch_failed': 'ดึงหน้ารายละเอียด settrade.com ไม่สำเร็จ',
    'no_pdf_url': 'ไม่พบลิงก์ PDF (downloadUrl) ในหน้ารายละเอียด',
    'pdf_fetch_failed': 'ดึงไฟล์ PDF ไม่สำเร็จ',
    'pdf_extract_failed': 'เปิด/อ่านข้อความจาก PDF ไม่สำเร็จ',
    'no_text_layer': 'PDF ไม่มีชั้นข้อความ (เอกสารสแกนเป็นภาพ)',
    'no_sentence_match': 'อ่านข้อความได้ แต่ไม่พบประโยคที่เข้าเงื่อนไข heuristic',
}


def json_unescape(s):
    return (
        s.replace('\\u002F', '/').replace('\\u002f', '/')
         .replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
         .replace('\\\\', '\\')
    )


def parse_mda_ids(mda_url):
    try:
        qs = parse_qs(urlparse(mda_url).query)
        news_id = qs.get('id', [None])[0]
        symbol = qs.get('symbol', [None])[0]
        if news_id and symbol:
            return news_id, symbol
    except Exception:
        pass
    return None, None


def extract_pdf_download_url(html):
    m = DOWNLOAD_URL_RE.search(html)
    if not m:
        return None
    url = json_unescape(m.group(1))
    return url if url.lower().endswith('.pdf') else None


def fetch_pdf_bytes(url, max_tries=2, timeout=20):
    for attempt in range(1, max_tries + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout, context=make_ssl_ctx()) as resp:
                if resp.status == 200:
                    return resp.read()
        except Exception:
            pass
        if attempt < max_tries:
            time.sleep(0.5 * attempt)
    return None


def extract_pdf_text(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    try:
        parts = []
        total = 0
        for i, page in enumerate(doc):
            if i >= PDF_MAX_PAGES:
                break
            t = page.get_text()
            parts.append(t)
            total += len(t)
            if total >= PDF_TEXT_BUDGET:
                break
        return '\n'.join(parts)
    finally:
        doc.close()


def clean_text(raw):
    # SET's PDF generator emits the sara-am vowel (ำ) as a stray space
    # followed by า (e.g. "จ ากัด" for "จำกัด" - confirmed against real
    # extracted text) - a broken glyph->Unicode mapping in the embedded font.
    # า never legitimately starts a word right after whitespace in Thai (it's
    # a dependent vowel, never a word-initial character), so collapsing
    # " า" -> "ำ" is unconditionally safe.
    text = raw.replace(' า', 'ำ')
    text = CONTROL_CHARS_RE.sub(' ', text)
    text = PAGE_NUM_RE.sub(' ', text)
    text = re.sub(r'[ \t\r\n]+', ' ', text).strip()
    return text


def strip_leading_boilerplate(text):
    m = BOILERPLATE_PREFIX_RE.match(text)
    return text[m.end():].strip() if m else text


def _sentence_bounds(window, anchor):
    """Find a safe [start, end) span around `anchor` that begins and ends on
    a real sentence boundary (right after ". ", or at whitespace) - never a
    hard character-count cut that could land mid-word. Returns None when no
    such safe span exists within the length budget, so the caller can drop
    the candidate instead of emitting a mangled fragment."""
    limit = min(len(window), anchor + SENTENCE_MAX_CHARS)

    period_start = window.rfind('. ', 0, anchor)
    space_start = window.rfind(' ', 0, anchor)
    if period_start != -1 and anchor - period_start <= SENTENCE_MAX_CHARS:
        start = period_start + 2
    elif space_start != -1:
        start = space_start + 1
    else:
        start = 0  # anchor is near the very start of the window - text start is a safe boundary

    period_end = window.find('. ', anchor, limit)
    if period_end != -1:
        end = period_end + 1  # keep the period itself, drop the trailing space
    else:
        space_end = window.rfind(' ', max(anchor, start + SENTENCE_TARGET_CHARS - 40), limit)
        if space_end == -1 or space_end <= anchor:
            return None  # can't reach a safe end boundary without cutting mid-word
        end = space_end

    return start, end


def extract_reason_sentence(text):
    window = text[:SEARCH_WINDOW_CHARS]
    for m in CONNECTOR_KEYWORDS_RE.finditer(window):
        ctx_start = max(0, m.start() - 150)
        ctx_end = min(len(window), m.end() + 150)
        if not RESULT_KEYWORDS_RE.search(window[ctx_start:ctx_end]):
            continue

        bounds = _sentence_bounds(window, m.start())
        if bounds is None:
            continue
        sentence = window[bounds[0]:bounds[1]].strip()

        # Reject anything that still looks broken: too short to be a real
        # sentence, starting on a combining vowel/tone mark (proof the start
        # boundary landed inside a word/glyph cluster), or containing
        # font-remapping garbage this PDF's embedded font produced instead
        # of real digits/vowels.
        if len(sentence) < 20 or THAI_NON_INITIAL_RE.match(sentence) or GARBLED_CHARS_RE.search(sentence):
            continue
        return sentence
    return None


def extract_reason_for_announcement(a, cookie):
    """Returns (reason, reason_source, fail_category). fail_category is None on success."""
    mda_url = a.get('mdaUrl')
    if not mda_url:
        return '', 'none', 'no_mda_url'

    news_id, ticker = parse_mda_ids(mda_url)
    if not news_id or not ticker:
        return '', 'none', 'bad_mda_url'

    html = fetch_detail_html(news_id, ticker, cookie)
    if not html:
        return '', 'none', 'detail_fetch_failed'

    pdf_url = extract_pdf_download_url(html)
    if not pdf_url:
        return '', 'none', 'no_pdf_url'

    pdf_bytes = fetch_pdf_bytes(pdf_url)
    if not pdf_bytes:
        return '', 'none', 'pdf_fetch_failed'

    try:
        raw_text = extract_pdf_text(pdf_bytes)
    except Exception:
        return '', 'none', 'pdf_extract_failed'
    if not raw_text.strip():
        return '', 'none', 'no_text_layer'  # scanned/image-only PDF, nothing to extract from

    text = strip_leading_boilerplate(clean_text(raw_text))
    sentence = extract_reason_sentence(text)
    if not sentence:
        return '', 'none', 'no_sentence_match'

    return sentence, 'mda_extract', None


def cache_key(a):
    return a.get('f45Url') or f"{a.get('ticker')}|{a.get('quarter')}|{a.get('announceDate')}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='extract and print report, write nothing')
    parser.add_argument('--out', default=None, help='read/write feed+cache in this dir instead of the real earnings/ tree')
    parser.add_argument('--limit', type=int, default=None, help='only run fresh extraction for the first N cache-miss announcements (testing)')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()

    out_dir = args.out if args.out else OUTPUT_DIR
    feed_path = os.path.join(out_dir, 'earnings_feed.json')
    cache_path = os.path.join(out_dir, 'reason_cache.json')

    if not os.path.exists(feed_path):
        print(f"ERROR: feed file not found: {feed_path}")
        sys.exit(1)

    with open(feed_path, 'r', encoding='utf-8') as f:
        feed = json.load(f)

    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            cache = json.load(f)

    announcements = feed.get('announcements', [])
    print(f"Announcements in feed: {len(announcements)}")

    # Snapshot which specific filings had a reason before anything below
    # mutates announcements in place - the regression guard at the end
    # compares against this set (not just a raw count), so a filing that
    # legitimately ages out of the 45-day window doesn't false-positive as
    # a regression the way a plain before/after count would.
    prev_keys_with_reason = {cache_key(a) for a in announcements if a.get('reason_source') == 'mda_extract'}

    to_extract = []
    for a in announcements:
        key = cache_key(a)
        cached = cache.get(key)
        if cached and cached.get('reason_source') == 'mda_extract':
            a['reason'] = cached['reason']
            a['reason_source'] = cached['reason_source']
        elif a.get('reason_source') == 'mda_extract' and a.get('reason'):
            # fetch_earnings.py's own merge-on-write already restored this
            # one from the previous file (our cache.json is missing/behind)
            # - trust it and backfill the cache, instead of attempting a
            # fresh extraction that could fail and overwrite a good value
            # with an empty one.
            cache[key] = {
                'reason': a['reason'],
                'reason_source': a['reason_source'],
                'extractedAt': datetime.now(BANGKOK_TZ).isoformat(),
            }
        else:
            # No cached success (a past failure is never cached as final -
            # see the write-back below - so this also retries anything that
            # failed on a previous run, instead of getting stuck at "—"
            # forever the way a cached failure would).
            to_extract.append((key, a))

    cache_hit_count = len(announcements) - len(to_extract)
    if args.limit is not None:
        to_extract = to_extract[:args.limit]

    skipped_by_limit = len(announcements) - cache_hit_count - len(to_extract)
    limit_note = f", skipped by --limit: {skipped_by_limit}" if skipped_by_limit else ""
    print(f"Cache hits: {cache_hit_count}, fresh extractions this run: {len(to_extract)}{limit_note}")

    cookie = get_session_cookie() if to_extract else ''
    success_examples = []
    fail_examples = []
    fresh_success = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(extract_reason_for_announcement, a, cookie): (key, a) for key, a in to_extract}
        done = 0
        for fut in as_completed(futures):
            key, a = futures[fut]
            done += 1
            if done % 10 == 0 or done == len(to_extract):
                print(f"  ...{done}/{len(to_extract)} extracted")
            try:
                reason, reason_source, fail_cat = fut.result()
            except Exception as e:
                reason, reason_source, fail_cat = '', 'none', f'exception:{e}'

            a['reason'] = reason
            a['reason_source'] = reason_source

            if reason_source == 'mda_extract':
                # Only successes are cached. A failure is left out of the
                # cache entirely so the next run retries it instead of being
                # stuck at "—" forever - this is what let TISCO/AEONTS/TNH's
                # 2026-07-16 extraction failures go unretried indefinitely.
                cache[key] = {
                    'reason': reason,
                    'reason_source': reason_source,
                    'extractedAt': datetime.now(BANGKOK_TZ).isoformat(),
                }
                fresh_success += 1
                if len(success_examples) < 5:
                    success_examples.append((a.get('ticker'), a.get('quarter'), reason))
            elif len(fail_examples) < 3:
                fail_examples.append((a.get('ticker'), a.get('quarter'), fail_cat))

    for a in announcements:
        a.setdefault('reason', '')
        a.setdefault('reason_source', 'none')

    total = len(announcements)
    total_with_reason = sum(1 for a in announcements if a.get('reason_source') == 'mda_extract')
    rate = (total_with_reason / total * 100) if total else 0.0

    print("\n=== Quality report ===")
    print(f"Total announcements: {total}")
    print(f"With extracted reason overall: {total_with_reason} ({rate:.1f}%)")
    print(f"This run's fresh extractions: {len(to_extract)}, succeeded: {fresh_success}")
    print("\n5 successful examples:")
    for ticker, quarter, reason in success_examples:
        print(f"  [{ticker} {quarter}] {reason}")
    print("\n3 failed examples:")
    for ticker, quarter, cat in fail_examples:
        print(f"  [{ticker} {quarter}] {FAIL_LABELS.get(cat, cat)}")

    # Regression guard: a filing that was in the window before AND still is
    # now must not have lost its reason - that's exactly the two incidents
    # (2026-07-16, 2026-07-17) this whole file exists to stop happening a
    # third time. A filing aging out of the 45-day window is not a
    # regression (it's just gone), so this only checks filings present in
    # both snapshots - fail loud and refuse to write rather than silently
    # push a worse file.
    current_keys_with_reason = {cache_key(a) for a in announcements if a.get('reason_source') == 'mda_extract'}
    still_present_keys = {cache_key(a) for a in announcements}
    regressed = (prev_keys_with_reason & still_present_keys) - current_keys_with_reason
    if regressed:
        print("\n" + "=" * 70, file=sys.stderr)
        print(f"ERROR: REASON REGRESSION DETECTED - {len(regressed)} filing(s) that had a reason "
              f"before this run lost it. Refusing to write - investigate before retrying.", file=sys.stderr)
        for k in list(regressed)[:10]:
            print(f"  - {k}", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print("\n[--dry-run] Not writing feed/cache files.")
        return

    with open(feed_path, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {feed_path}")
    print(f"Wrote {cache_path}")


if __name__ == '__main__':
    main()
