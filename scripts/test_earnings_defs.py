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
