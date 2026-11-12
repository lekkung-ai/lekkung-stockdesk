"""
pytest: the F45 history budget (no network). The light 20:00 run passes --history-budget.

Usage:
    python -m pytest scripts/test_fetch_earnings_budget.py -q
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fetch_earnings as fe  # noqa: E402


def _jobs():
    return [
        {'ticker': 'NEW', 'announceDate': '2026-11-05T19:00', 'items': [{'id': 'n1'}, {'id': 'n2'}]},
        {'ticker': 'OLD', 'announceDate': '2026-11-04T18:00', 'items': [{'id': 'o1'}]},
    ]


def test_budget_zero_fetches_nothing_and_leaves_everything_pending(monkeypatch):
    monkeypatch.setattr(fe, 'F45_CACHE', {})
    monkeypatch.setattr(fe, 'fetch_f45', lambda *a, **k: (_ for _ in ()).throw(AssertionError('no request at budget 0')))
    done, stats = fe.fetch_history(_jobs(), None, budget=0, sleep=lambda s: None)
    assert done == {} and stats['fetched'] == 0 and stats['stopped'] == 'budget'
    assert sorted(stats['pending']) == ['NEW', 'OLD']


def test_cached_pages_are_free_even_at_budget_zero(monkeypatch):
    monkeypatch.setattr(fe, 'F45_CACHE', {'o1': {'quarter': 'ไตรมาส 2/2569', 'netProfit': 5}})
    done, stats = fe.fetch_history(_jobs(), None, budget=0, sleep=lambda s: None)
    assert list(done) == ['OLD'] and stats['fetched'] == 0


def test_small_budget_goes_newest_announcement_first(monkeypatch):
    monkeypatch.setattr(fe, 'F45_CACHE', {})
    asked = []

    def fake(item, ticker, cookie):
        asked.append(item['id'])
        return {'quarter': 'ไตรมาส 2/2569', 'netProfit': 1}, 'ok'
    monkeypatch.setattr(fe, 'fetch_f45', fake)
    done, stats = fe.fetch_history(_jobs(), None, budget=2, sleep=lambda s: None)
    assert asked == ['n1', 'n2'] and list(done) == ['NEW'] and stats['pending'] == ['OLD']


def test_default_budget_unchanged():
    assert fe.HISTORY_PAGE_BUDGET == 150


# ── history queue order (ADTV first) ─────────────────────────────────────────

def _q():
    return [
        {'ticker': 'SMALL', 'announceDate': '2026-11-11T20:00', 'items': [{'id': 's1'}]},
        {'ticker': 'BIG', 'announceDate': '2026-11-09T10:00', 'items': [{'id': 'b1'}, {'id': 'b2'}]},
        {'ticker': 'NOADTV_NEW', 'announceDate': '2026-11-11T09:00', 'items': [{'id': 'n1'}]},
        {'ticker': 'NOADTV_OLD', 'announceDate': '2026-11-05T09:00', 'items': [{'id': 'o1'}]},
        {'ticker': 'TIE_A', 'announceDate': '2026-11-06T09:00', 'items': [{'id': 't1'}]},
        {'ticker': 'TIE_B', 'announceDate': '2026-11-10T09:00', 'items': [{'id': 't2'}]},
    ]


ADTV = {'BIG': 900.0, 'SMALL': 2.0, 'TIE_A': 50.0, 'TIE_B': 50.0}


def test_orders_by_adtv_desc_ties_and_missing_keep_old_order():
    order = [j['ticker'] for j in fe.order_history_jobs(_q(), ADTV)]
    # BIG first; the 50-ADTV tie keeps newest-first (TIE_B before TIE_A); SMALL; then no-ADTV, newest first
    assert order == ['BIG', 'TIE_B', 'TIE_A', 'SMALL', 'NOADTV_NEW', 'NOADTV_OLD']


def test_no_adtv_map_keeps_old_order():
    order = [j['ticker'] for j in fe.order_history_jobs(_q(), None)]
    assert order == ['SMALL', 'NOADTV_NEW', 'TIE_B', 'BIG', 'TIE_A', 'NOADTV_OLD']
    assert order == [j['ticker'] for j in fe.order_history_jobs(_q(), None)]


def test_load_adtv_missing_file_is_none_and_bad_rows_are_skipped(tmp_path):
    assert fe.load_adtv(str(tmp_path / 'nope.json')) is None
    p = tmp_path / 'ms.json'
    p.write_text('[{"Ticker":"A","ADTV(MB)":12.5},{"Ticker":"B","ADTV(MB)":null},{"Ticker":"C"},{"ADTV(MB)":3}]', encoding='utf-8')
    assert fe.load_adtv(str(p)) == {'A': 12.5}


def test_fetch_history_follows_adtv_order_and_never_exceeds_budget(monkeypatch):
    monkeypatch.setattr(fe, 'F45_CACHE', {})
    asked = []

    def fake(item, ticker, cookie):
        asked.append(item['id'])
        return {'quarter': 'ไตรมาส 2/2569', 'netProfit': 1}, 'ok'
    monkeypatch.setattr(fe, 'fetch_f45', fake)
    done, stats = fe.fetch_history(_q(), None, budget=3, sleep=lambda s: None, adtv=ADTV)
    assert asked == ['b1', 'b2', 't2'] and stats['fetched'] == 3 and stats['stopped'] == 'budget'
    assert list(done) == ['BIG', 'TIE_B'] and 'TIE_A' in stats['pending']


def test_fetch_history_default_adtv_none_is_old_behaviour(monkeypatch):
    monkeypatch.setattr(fe, 'F45_CACHE', {})
    asked = []
    monkeypatch.setattr(fe, 'fetch_f45', lambda item, t, c: (asked.append(item['id']) or {'quarter': 'ไตรมาส 2/2569'}, 'ok'))
    fe.fetch_history(_q(), None, budget=2, sleep=lambda s: None)
    assert asked == ['s1', 'n1']
