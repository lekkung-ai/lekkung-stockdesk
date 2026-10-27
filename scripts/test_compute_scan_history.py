"""
Unit tests for compute_scan_history.py stage-transition helpers (stdlib unittest).

Usage:
    python -X utf8 scripts/test_compute_scan_history.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from compute_scan_history import build_transitions, trading_snapshots  # noqa: E402


def snap(d, *rows):
    """rows: (ticker, stage, price)"""
    return (d, [{"Ticker": t, "Stage": s, "Price": p} for t, s, p in rows])


def runs_of(tickers, ticker):
    return next(t for t in tickers if t["ticker"] == ticker)["runs"]


class BuildTransitionsTest(unittest.TestCase):
    def test_normal_stage_change(self):
        dates, tickers = build_transitions([
            snap("2026-10-01", ("AAA", "Bull", 10)),
            snap("2026-10-02", ("AAA", "Bull", 11)),
            snap("2026-10-05", ("AAA", "Warning", 9)),
            snap("2026-10-06", ("AAA", "Warning", 8)),
        ])
        self.assertEqual(dates, ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"])
        t = tickers[0]
        self.assertEqual(t["runs"], [["Bull", "2026-10-01", "2026-10-02"], ["Warning", "2026-10-05", "2026-10-06"]])
        # close on each run's first day + the last day only
        self.assertEqual(t["closeByDate"], {"2026-10-01": 10, "2026-10-05": 9, "2026-10-06": 8})

    def test_no_change_is_one_run(self):
        _, tickers = build_transitions([
            snap("2026-10-01", ("AAA", "Bear", 5)),
            snap("2026-10-02", ("AAA", "Bear", 5.5)),
            snap("2026-10-05", ("AAA", "Bear", 6)),
        ])
        self.assertEqual(runs_of(tickers, "AAA"), [["Bear", "2026-10-01", "2026-10-05"]])
        self.assertEqual(tickers[0]["closeByDate"], {"2026-10-01": 5, "2026-10-05": 6})

    def test_missing_day_does_not_break_the_run(self):
        _, tickers = build_transitions([
            snap("2026-10-01", ("AAA", "Bull", 10), ("BBB", "Bull", 1)),
            snap("2026-10-02", ("BBB", "Bull", 1)),  # AAA not in this day's scan
            snap("2026-10-05", ("AAA", "Bull", 12), ("BBB", "Bull", 1)),
        ])
        self.assertEqual(runs_of(tickers, "AAA"), [["Bull", "2026-10-01", "2026-10-05"]])

    def test_change_after_missing_day_starts_on_next_seen_day(self):
        _, tickers = build_transitions([
            snap("2026-10-01", ("AAA", "Bull", 10), ("BBB", "Bull", 1)),
            snap("2026-10-02", ("BBB", "Bull", 1)),
            snap("2026-10-05", ("AAA", "Warning", 9), ("BBB", "Bull", 1)),
        ])
        self.assertEqual(runs_of(tickers, "AAA"), [["Bull", "2026-10-01", "2026-10-01"], ["Warning", "2026-10-05", "2026-10-05"]])

    def test_ipo_to_stage_2_is_a_run_change(self):
        _, tickers = build_transitions([
            snap("2026-10-01", ("NEW", "IPO", 3)),
            snap("2026-10-02", ("NEW", "IPO", 3.2)),
            snap("2026-10-05", ("NEW", "Stage 2 (Advancing)", 3.5)),
        ])
        self.assertEqual(runs_of(tickers, "NEW"), [["IPO", "2026-10-01", "2026-10-02"], ["Stage 2 (Advancing)", "2026-10-05", "2026-10-05"]])

    def test_newly_listed_ticker_starts_mid_window(self):
        dates, tickers = build_transitions([
            snap("2026-10-01", ("AAA", "Bull", 10)),
            snap("2026-10-02", ("AAA", "Bull", 10), ("NEW", "IPO", 2)),
        ])
        self.assertEqual(len(dates), 2)
        self.assertEqual(runs_of(tickers, "NEW"), [["IPO", "2026-10-02", "2026-10-02"]])
        self.assertEqual(next(t for t in tickers if t["ticker"] == "NEW")["closeByDate"], {"2026-10-02": 2})


class TradingSnapshotsTest(unittest.TestCase):
    def test_holiday_snapshot_with_copied_prices_is_dropped(self):
        snaps = [
            snap("2026-08-11", ("AAA", "Bull", 10), ("BBB", "Bear", 5)),
            # holiday: prices copied from 08-11, stage flipped off the fake bar
            snap("2026-08-12", ("AAA", "Warning", 10), ("BBB", "Bear", 5)),
            snap("2026-08-13", ("AAA", "Bull", 10.5), ("BBB", "Bear", 5)),
        ]
        kept = trading_snapshots(snaps)
        self.assertEqual([d for d, _ in kept], ["2026-08-11", "2026-08-13"])
        _, tickers = build_transitions(kept)
        self.assertEqual(runs_of(tickers, "AAA"), [["Bull", "2026-08-11", "2026-08-13"]])

    def test_normal_days_are_kept(self):
        snaps = [
            snap("2026-10-01", ("AAA", "Bull", 10), ("BBB", "Bear", 5)),
            snap("2026-10-02", ("AAA", "Bull", 10), ("BBB", "Bear", 5.1)),
        ]
        self.assertEqual(len(trading_snapshots(snaps)), 2)


if __name__ == "__main__":
    unittest.main()
