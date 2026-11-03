"""
pytest for the /earnings definitions on the batch side (no network, no files):
turnaround (no %), ⚡ acceleration, the sara-am text fix, and the PEAD price path.
The page-side twins live in lib/earningsMetrics.ts (+ lib/earningsMetrics.test.ts).

Usage:
    python -m pytest scripts/test_earnings_defs.py -q
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enrich_earnings_pead import compute_pead  # noqa: E402
import enrich_earnings_pead  # noqa: E402
from extract_reason import clean_text, fix_sara_am  # noqa: E402
from fetch_earnings import (  # noqa: E402
    classify_profit_acceleration, is_previous_quarter, meaningful_yoy, merge_announcement_fields,
)

AM = chr(0x0E33)
NIKHAHIT_AA = chr(0x0E4D) + chr(0x0E32)


# ── sara am ──

def test_space_before_sara_am():
    assert fix_sara_am(f'รวมจ {AM}นวน ก {AM}ไร') == f'รวมจ{AM}นวน ก{AM}ไร'


def test_nikhahit_aa_becomes_sara_am():
    out = fix_sara_am(f'นัยส{NIKHAHIT_AA}คัญ')
    assert out == f'นัยส{AM}คัญ'
    assert chr(0x0E4D) not in out


def test_clean_text_line_break_before_sara_am():
    assert clean_text(f'ก\n{AM}ไรสุทธิ') == f'ก{AM}ไรสุทธิ'


# ── turnaround ──

def test_turnaround_has_no_pct():
    assert meaningful_yoy(2_385_896_000, -669_143_000) is None  # SCC
    assert meaningful_yoy(5, 0) is None
    assert round(meaningful_yoy(120, 100), 6) == 20


# ── acceleration ──

def test_accelerating_needs_faster_growth_than_last_quarter():
    assert classify_profit_acceleration(125, 100, 110, 100) == 'accelerating'   # +25% vs +10%
    assert classify_profit_acceleration(105, 100, 150, 100) == 'decelerating'   # +5% vs +50%


def test_not_accelerating_when_negative_or_no_prior_quarter():
    assert classify_profit_acceleration(90, 100, 50, 100) == 'stable'
    assert classify_profit_acceleration(200, 100, 110, None) == 'stable'
    assert classify_profit_acceleration(200, -100, 110, 100) == 'stable'        # turnaround -> no %


def test_previous_quarter_must_be_back_to_back():
    assert is_previous_quarter('ไตรมาส 3/2569', 'ไตรมาส 2/2569')
    assert not is_previous_quarter('ไตรมาส 1/2569', 'ไตรมาส 3/2568')
    assert not is_previous_quarter('ไตรมาส 1/2569', 'ไตรมาส 2/2569')
    assert not is_previous_quarter('ประจำปี 2569', 'ไตรมาส 3/2569')


def test_merge_recomputes_acceleration():
    new = {'quarter': 'ไตรมาส 3/2569', 'priorQuarter': 'ไตรมาส 2/2569', 'netProfit': 125, 'netProfitPrior': 100,
           'netProfitPriorQ': 110, 'netProfitPriorQPrior': 100, 'eps': None, 'epsPrior': None,
           'profitAcceleration': 'stable'}
    merged = merge_announcement_fields(new, {'eps': 1.0})
    assert merged['profitAcceleration'] == 'accelerating'
    assert round(merged['netProfitPriorQYoY'], 6) == 10


# ── PEAD price path ──

def test_price_path_from_daily_series(monkeypatch):
    # 8 trading days; announced after the close on day 5 (index 5) -> T0 = index 6
    closes = [100, 101, 99, 100, 102, 100, 103, 104]
    series = [(f'2026-10-{20 + i:02d}', c, c) for i, c in enumerate(closes)]
    monkeypatch.setitem(enrich_earnings_pead.SERIES_CACHE, 'XYZ', series)
    out = compute_pead('XYZ', '2026-10-25T17:30:00+07:00')
    assert out['gap_pct'] == 3.0
    assert out['drift_d1_pct'] == 4.0
    path = out['price_path']
    assert path['pre'] == [1.0, -1.0, 0.0, 2.0, 0.0]   # closes idx 1..5 vs base 100
    assert path['post'] == [3.0, 4.0]                  # gap, D+1 (no later days yet)


# ── 5-quarter history / 9-month figures ──

from fetch_earnings import build_profit_history, parse_f45_detail  # noqa: E402


def q(label, np, prior, cum=None, cum_prior=None, months=None):
    return {'quarter': label, 'netProfit': np, 'netProfitPrior': prior,
            'netProfitCum': cum, 'netProfitCumPrior': cum_prior, 'cumMonths': months}


def test_q4_is_full_year_minus_nine_months():
    filings = [  # newest first
        q('ไตรมาส 3/2569', 30, 20, cum=90, cum_prior=60, months=9),
        q('ไตรมาส 2/2569', 32, 21, cum=60, cum_prior=40, months=6),
        q('ไตรมาส 1/2569', 28, 19),
        q('ประจำปี 2568', 85, 70),
    ]
    hist = build_profit_history(filings, 2569, 3)
    assert [h['q'] for h in hist] == ['Q3/68', 'Q4/68', 'Q1/69', 'Q2/69', 'Q3/69']
    # Q4/68 = FY68 85 - 9M68 60 (the 9M68 figure is the year-ago column of the Q3/69 filing)
    assert [h['np'] for h in hist] == [20, 25, 28, 32, 30]


def test_q4_without_nine_months_is_a_gap_not_the_full_year():
    filings = [q('ไตรมาส 1/2569', 28, 19), q('ประจำปี 2568', 85, 70)]
    hist = build_profit_history(filings, 2569, 1)
    assert hist[-2] == {'q': 'Q4/68', 'np': None}
    assert hist[-1] == {'q': 'Q1/69', 'np': 28}


def test_missing_quarters_stay_none():
    hist = build_profit_history([q('ไตรมาส 3/2569', 30, 20, cum=90, cum_prior=60, months=9)], 2569, 3)
    assert [h['np'] for h in hist] == [20, None, None, None, 30]


def test_loss_and_profit_mixed_and_newest_filing_wins():
    filings = [
        q('ไตรมาส 3/2569', 2386, -669, cum=18000, cum_prior=-500, months=9),  # SCC-like turnaround
        q('ไตรมาส 2/2569', 11534, -200),
        q('ไตรมาส 3/2568', -700, 400, cum=-480, cum_prior=900, months=9),      # older figure for Q3/68
        q('ประจำปี 2568', -100, 1200),
    ]
    hist = build_profit_history(filings, 2569, 3)
    by_q = {h['q']: h['np'] for h in hist}
    assert by_q['Q3/68'] == -669          # the Q3/69 filing's restated year-ago figure wins
    assert by_q['Q4/68'] == -100 - (-500)  # FY68 - 9M68, both losses -> +400
    assert by_q['Q2/69'] == 11534
    assert by_q['Q1/69'] is None


ADVANC_Q3_PRE = '''
                                           (หน่วย : พันบาท)
งบการเงิน
                                   ไตรมาสที่ 3                 9 เดือน
                                      สอบทาน                    สอบทาน
สิ้นสุดวันที่\t\t\t            30 กันยายน                  30 กันยายน
ปี       \t\t\t    2569         2568         2569         2568
กำไร (ขาดทุน) \t\t\t13,504,271   12,038,861   40,715,782   33,604,272
ส่วนที่เป็นของผู้ถือ
หุ้นของบริษัทใหญ่ *
กำไร (ขาดทุน) \t\t\t      4.54         4.05        13.69        11.30
สุทธิ
'''


def test_parse_nine_month_columns_from_real_f45():
    p = parse_f45_detail(f'<pre>{ADVANC_Q3_PRE}</pre>')
    assert p['quarter'] == 'ไตรมาส 3/2569'
    assert p['netProfit'] == 13_504_271_000 and p['netProfitPrior'] == 12_038_861_000
    assert p['cumMonths'] == 9
    assert p['netProfitCum'] == 40_715_782_000 and p['netProfitCumPrior'] == 33_604_272_000
    assert p['eps'] == 4.54


def test_parse_single_period_filing_has_no_cumulative():
    pre = ADVANC_Q3_PRE.replace('ไตรมาสที่ 3                 9 เดือน', 'ไตรมาสที่ 1') \
        .replace('13,504,271   12,038,861   40,715,782   33,604,272', '13,504,271   12,038,861') \
        .replace('4.54         4.05        13.69        11.30', '4.54         4.05')
    p = parse_f45_detail(f'<pre>{pre}</pre>')
    assert p['netProfitCum'] is None and p['cumMonths'] is None
    assert p['eps'] == 4.54


def test_cache_keeps_real_pages_only(monkeypatch):
    import fetch_earnings as fe
    pages = {'1': f'<pre>{ADVANC_Q3_PRE}</pre>', '2': '<pre>no figures here</pre>', '3': '<html>throttled</html>'}
    calls = []
    monkeypatch.setattr(fe, 'fetch_detail_html', lambda nid, t, c: calls.append(nid) or pages[nid])
    monkeypatch.setattr(fe, 'F45_CACHE', {})
    monkeypatch.setattr(fe, 'F45_CACHE_USED', set())
    for nid in ('1', '2', '3', '1', '2', '3'):
        fe.parsed_f45({'id': nid, 'datetime': '2026-11-03T17:50:00+07:00'}, 'X', '')
    assert fe.F45_CACHE['1']['netProfit'] == 13_504_271_000
    assert fe.F45_CACHE['1']['filed'] == '2026-11-03'
    assert fe.F45_CACHE['2'] == {'quarter': None, 'filed': '2026-11-03'}  # real F45 page, nothing usable - don't ask again
    assert '3' not in fe.F45_CACHE                   # no F45 table - retried next run
    assert calls == ['1', '2', '3', '3']


def test_prune_drops_only_filings_too_old_for_any_history(monkeypatch):
    import fetch_earnings as fe
    from datetime import datetime
    monkeypatch.setattr(fe, 'F45_CACHE', {'old': {'filed': '2025-01-01'}, 'new': {'filed': '2025-11-04'}, 'nodate': {}})
    kept = fe.prune_f45_cache(datetime(2026, 11, 3, tzinfo=fe.BANGKOK_TZ))
    assert set(kept) == {'new', 'nodate'}


# ── history fetch limits ──

def _fresh_cache(monkeypatch, fe):
    monkeypatch.setattr(fe, 'F45_CACHE', {})
    monkeypatch.setattr(fe, 'F45_CACHE_USED', set())
    monkeypatch.setattr(fe, 'F45_FETCHES', [0])


def _jobs(n, pages_each=5):
    # announceDate rises with i, so the last job is the newest announcement
    return [{'ticker': f'T{i:03d}', 'announceDate': f'2026-11-{1 + i // 60:02d}T{i % 24:02d}:{i % 60:02d}:00+07:00',
             'items': [{'id': f'{i}-{k}', 'datetime': '2026-08-01T17:00:00+07:00'} for k in range(pages_each)]}
            for i in range(n)]


def test_history_stops_at_the_page_budget_newest_first(monkeypatch):
    import fetch_earnings as fe
    _fresh_cache(monkeypatch, fe)
    calls = []
    monkeypatch.setattr(fe, 'fetch_detail_html', lambda nid, t, c: calls.append(t) or f'<pre>{ADVANC_Q3_PRE}</pre>')
    jobs = _jobs(250)  # peak-season day: 250 filings x 5 older pages
    done, stats = fe.fetch_history(jobs, '', sleep=lambda s: None)
    assert stats['fetched'] == fe.HISTORY_PAGE_BUDGET == 150 and len(calls) == 150
    assert len(done) == 30 and len(stats['pending']) == 220 and stats['stopped'] == 'budget'
    newest = sorted(jobs, key=lambda j: j['announceDate'], reverse=True)
    assert set(done) == {j['ticker'] for j in newest[:30]}       # newest announcements first
    # next run: those 150 pages come from the cache, the next 150 are fetched
    calls.clear()
    done2, stats2 = fe.fetch_history(jobs, '', sleep=lambda s: None)
    assert len(calls) == 150 and len(done2) == 60 and len(stats2['pending']) == 190


def test_history_pauses_between_requests_only(monkeypatch):
    import fetch_earnings as fe
    _fresh_cache(monkeypatch, fe)
    monkeypatch.setattr(fe, 'fetch_detail_html', lambda nid, t, c: f'<pre>{ADVANC_Q3_PRE}</pre>')
    pauses = []
    fe.fetch_history(_jobs(2), '', sleep=pauses.append)
    assert len(pauses) == 10 and all(0.3 <= p <= 0.5 for p in pauses)
    pauses.clear()
    fe.fetch_history(_jobs(2), '', sleep=pauses.append)        # all cached now
    assert pauses == []


def test_history_stops_after_five_blank_pages_in_a_row(monkeypatch):
    import fetch_earnings as fe
    _fresh_cache(monkeypatch, fe)
    calls = []

    def fake(nid, t, c):
        calls.append(nid)
        return f'<pre>{ADVANC_Q3_PRE}</pre>' if len(calls) <= 3 else '<html>throttled</html>'
    monkeypatch.setattr(fe, 'fetch_detail_html', fake)
    done, stats = fe.fetch_history(_jobs(10), '', sleep=lambda s: None)
    assert len(calls) == 3 + fe.HISTORY_BLANK_STREAK_STOP == 8   # 3 good, then 5 blank -> stop
    assert stats['stopped'] == 'blank' and done == {} and len(stats['pending']) == 10


def test_current_f45_is_never_limited(monkeypatch):
    import fetch_earnings as fe
    from datetime import datetime, timedelta
    _fresh_cache(monkeypatch, fe)
    monkeypatch.setattr(fe, 'HISTORY_PAGE_BUDGET', 0)
    monkeypatch.setattr(fe, 'fetch_news_list', lambda t, c: [
        {'id': 'now', 'datetime': '2026-11-03T17:50:00+07:00', 'url': 'u',
         'headline': 'สรุปผลการดำเนินงานของ บจ. ไตรมาสที่ 3 (F45) (สอบทานแล้ว)'},
        {'id': 'old', 'datetime': '2026-08-06T17:00:00+07:00', 'url': 'u2',
         'headline': 'สรุปผลการดำเนินงานของ บจ. ไตรมาสที่ 2 (F45) (สอบทานแล้ว)'},
    ])
    calls = []
    monkeypatch.setattr(fe, 'fetch_detail_html', lambda nid, t, c: calls.append(nid) or f'<pre>{ADVANC_Q3_PRE}</pre>')
    now = datetime(2026, 11, 3, 20, tzinfo=fe.BANGKOK_TZ)
    res = fe.process_ticker('ADVANC', {}, '', now, now - timedelta(days=45), now, now + timedelta(days=45))
    assert calls == ['now']                                 # current F45 fetched in the ticker pass
    assert res['announcement']['netProfit'] == 13_504_271_000
    assert [i['id'] for i in res['history_items']] == ['old']
    done, stats = fe.fetch_history([{'ticker': 'ADVANC', 'announceDate': 'x', 'items': res['history_items']}], '',
                                   sleep=lambda s: None)
    assert calls == ['now'] and stats['pending'] == ['ADVANC']  # budget 0 holds back history only
