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
