"""
Unit tests for calculate_report_card.py pure helpers (stdlib unittest, no network).

Usage:
    python -X utf8 scripts/test_report_card.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from calculate_report_card import (  # noqa: E402
    build_date_index,
    drop_dates,
    first_appearances,
    forward_return,
    non_trading_dates,
    summarize_horizon,
    win_flat_loss,
)


def row(d, close, vol):
    return (d, close, vol, close, close)


class NonTradingDatesTest(unittest.TestCase):
    def test_holiday_row_with_zero_volume_everywhere_is_dropped(self):
        prices = {
            "AAA": [row("2026-07-27", 10, 100), row("2026-07-28", 10, 0), row("2026-07-30", 11, 50)],
            "BBB": [row("2026-07-27", 5, 10), row("2026-07-28", 5, 0), row("2026-07-30", 6, 20)],
            "CCC": [row("2026-07-27", 2, 10), row("2026-07-28", 2, 0), row("2026-07-30", 2, 30)],
        }
        self.assertEqual(non_trading_dates(prices), {"2026-07-28"})

    def test_single_suspended_stock_does_not_remove_the_day(self):
        prices = {
            "AAA": [row("2026-08-03", 10, 100)],
            "BBB": [row("2026-08-03", 5, 0)],  # suspended / no trades
            "CCC": [row("2026-08-03", 2, 10)],
        }
        self.assertEqual(non_trading_dates(prices), set())

    def test_threshold_is_half_of_tickers_with_a_row(self):
        # 2 of 4 traded = exactly 50% -> trading day; 1 of 4 -> not.
        half = {f"T{i}": [row("2026-08-04", 1, 1 if i < 2 else 0)] for i in range(4)}
        self.assertEqual(non_trading_dates(half), set())
        quarter = {f"T{i}": [row("2026-08-05", 1, 1 if i < 1 else 0)] for i in range(4)}
        self.assertEqual(non_trading_dates(quarter), {"2026-08-05"})

    def test_missing_volume_counts_as_not_traded(self):
        prices = {"AAA": [row("2026-08-12", 10, None)], "BBB": [row("2026-08-12", 5, 0)]}
        self.assertEqual(non_trading_dates(prices), {"2026-08-12"})

    def test_empty(self):
        self.assertEqual(non_trading_dates({}), set())


class ForwardReturnAcrossHolidayTest(unittest.TestCase):
    def test_holiday_rows_no_longer_count_toward_d_plus_n(self):
        series = [
            row("2026-07-24", 10, 1),   # D (signal)
            row("2026-07-27", 11, 1),   # D+1 entry
            row("2026-07-28", 11, 0),   # holiday
            row("2026-07-29", 11, 0),   # holiday
            row("2026-07-30", 12, 1),   # D+2 once holidays are removed
        ]
        raw_ret, _ = forward_return(series, build_date_index(series), "2026-07-24", 2)
        self.assertEqual(raw_ret, 0.0)  # the bug: exit lands on a holiday copy of D+1

        clean = drop_dates(series, {"2026-07-28", "2026-07-29"})
        ret, _ = forward_return(clean, build_date_index(clean), "2026-07-24", 2)
        self.assertAlmostEqual(ret, (12 / 11 - 1) * 100)

    def test_incomplete_horizon_is_dropped_not_zero(self):
        series = [row("2026-09-29", 10, 1), row("2026-09-30", 10.5, 1)]
        ret, _ = forward_return(series, build_date_index(series), "2026-09-29", 5)
        self.assertIsNone(ret)

    def test_entry_is_d_plus_1_close(self):
        series = [row("2026-09-01", 100, 1), row("2026-09-02", 50, 1), row("2026-09-03", 60, 1)]
        ret, _ = forward_return(series, build_date_index(series), "2026-09-01", 2)
        self.assertAlmostEqual(ret, 20.0)  # 60/50 - 1, never priced off D's own close


class HolidaySnapshotTest(unittest.TestCase):
    def test_pick_first_seen_on_a_holiday_snapshot_enters_on_the_next_trading_day(self):
        sets = {"2026-07-27": {"A"}, "2026-07-28": {"A", "B", "C"}, "2026-07-30": {"A", "B"}}
        holidays = {"2026-07-28"}
        vdates = [d for d in sorted(sets) if d not in holidays]
        self.assertEqual(sorted(first_appearances(vdates, sets)), [("A", "2026-07-27"), ("B", "2026-07-30")])


class WinFlatLossTest(unittest.TestCase):
    def test_counts_and_float_tolerance(self):
        self.assertEqual(win_flat_loss([1.0, 0.0, -0.5, 5e-12, -5e-12, 2.0]), (2, 3, 1))

    def test_summary_fields_add_up_and_win_rate_unchanged(self):
        rets = [2.0, 0.0, 0.0, -1.0, 3.0]
        rows = [{"ticker": f"T{i}", "entry_date": "2026-09-01", "return_pct": r, "set_return_pct": None}
                for i, r in enumerate(rets)]
        s = summarize_horizon(rows)
        self.assertEqual((s["n_win"], s["n_flat"], s["n_loss"]), (2, 2, 1))
        self.assertEqual(s["n_win"] + s["n_flat"] + s["n_loss"], s["n"])
        self.assertEqual(s["win_rate_pct"], 40.0)  # wins / n, flats stay in the denominator
        self.assertEqual(s["flat_pct"], 40.0)
        self.assertEqual(s["median_return_pct"], 0.0)

    def test_empty_summary(self):
        s = summarize_horizon([])
        self.assertEqual((s["n"], s["n_win"], s["n_flat"], s["n_loss"], s["flat_pct"]), (0, 0, 0, 0, None))


if __name__ == "__main__":
    unittest.main(verbosity=2)
