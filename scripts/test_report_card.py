"""
Unit tests for calculate_report_card.py pure helpers (stdlib unittest, no network).

Usage:
    python -X utf8 scripts/test_report_card.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json  # noqa: E402
import tempfile  # noqa: E402

from calculate_report_card import (  # noqa: E402
    HIST_LABELS,
    STAGE_NO_DATA,
    STAGE_ORDER,
    build_date_index,
    compute_setups,
    drop_dates,
    drop_guard_ok,
    exit_reason,
    first_appearances,
    forward_return,
    load_stage_lookup,
    non_trading_dates,
    setup_extras,
    stage_on,
    summarize_horizon,
    summarize_setups,
    win_flat_loss,
    write_json_atomic,
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


def setup(ret, *, status="closed", hold=3, mfe=1.0, entry="2026-09-01", stage="Bull"):
    return {"ticker": "T", "entry_date": entry, "return_pct": ret, "holding_days": hold,
            "mfe_pct": mfe, "mae_pct": -1.0, "status": status, "stage_at_entry": stage}


class StageLookupTest(unittest.TestCase):
    def write(self, obj):
        f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(obj, f)
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def test_stage_is_the_run_that_covers_the_entry_day(self):
        lk = load_stage_lookup(self.write({"tickers": [{"ticker": "AAA", "runs": [
            ["Bull", "2026-08-01", "2026-08-10"], ["S.Bull", "2026-08-11", "2026-08-31"],
            ["IPO", "2026-09-01", "2026-09-05"]]}]}))
        self.assertEqual(stage_on(lk, "AAA", "2026-08-10"), "Bull")
        self.assertEqual(stage_on(lk, "AAA", "2026-08-11"), "S.Bull")
        self.assertEqual(stage_on(lk, "AAA", "2026-07-01"), STAGE_NO_DATA)   # before tracking
        self.assertEqual(stage_on(lk, "AAA", "2026-09-02"), STAGE_NO_DATA)   # label outside STAGE_ORDER
        self.assertEqual(stage_on(lk, "ZZZ", "2026-08-05"), STAGE_NO_DATA)   # ticker not tracked

    def test_missing_stage_file_gives_null_not_a_crash(self):
        lk = load_stage_lookup(os.path.join(tempfile.gettempdir(), "no_such_stage_file_rc.json"))
        self.assertIsNone(lk)
        self.assertIsNone(stage_on(lk, "AAA", "2026-08-05"))
        ex = setup_extras([setup(1.0, stage=None), setup(-1.0, stage=None)], stage_available=False)
        self.assertIsNone(ex["by_stage"])
        self.assertEqual(ex["n_win"] + ex["n_flat"] + ex["n_loss"], 2)


class ExitReasonTest(unittest.TestCase):
    def test_reasons(self):
        self.assertEqual(exit_reason({"status": "open", "holding_days": 0}), "open")
        self.assertEqual(exit_reason({"status": "closed", "holding_days": 0}), "single_day")
        self.assertEqual(exit_reason({"status": "closed", "holding_days": 4}), "left_scan")

    def test_zero_day_setup_is_still_flat_and_closed(self):
        # hit once on D, entry = D+1 close, exit = day after last hit = the same D+1 bar
        series = [row(f"2026-09-{d:02d}", 10 + d, 1) for d in range(1, 12)]
        out = compute_setups(["2026-09-01"], series)
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0]["holding_days"], out[0]["return_pct"], out[0]["status"]), (0, 0.0, "closed"))
        self.assertEqual(exit_reason(out[0]), "single_day")


class SetupExtrasTest(unittest.TestCase):
    def test_counts_payoff_giveback_hist_and_groups_add_up(self):
        s = [
            setup(4.0, mfe=6.0, entry="2026-08-03", stage="S.Bull"),
            setup(2.0, mfe=2.5, entry="2026-08-20", stage="Bull"),
            setup(0.0, hold=0, mfe=3.5, entry="2026-09-01", stage="Bull"),   # single day, gave back
            setup(-2.0, mfe=4.0, entry="2026-09-02", stage=STAGE_NO_DATA),  # gave back
            setup(-10.0, mfe=0.0, entry="2026-09-03", stage="Bear"),
            setup(5.0, status="open", mfe=9.0),                              # open: ignored
        ]
        ex = setup_extras(s)
        self.assertEqual((ex["n_win"], ex["n_flat"], ex["n_loss"], ex["n_single_day"]), (2, 1, 2, 1))
        self.assertEqual(ex["median_return_pct"], 0.0)
        self.assertEqual((ex["avg_win_pct"], ex["avg_loss_pct"]), (3.0, -6.0))
        self.assertEqual(ex["payoff_ratio"], 0.5)
        self.assertEqual(ex["giveback_n"], 2)
        self.assertEqual(len(ex["hist"]), len(HIST_LABELS))
        self.assertEqual(ex["hist"][HIST_LABELS.index("−10…−6")], 1)   # lower edge included
        self.assertEqual(ex["hist"][HIST_LABELS.index("−2…0")], 1)
        self.assertEqual(ex["hist"][HIST_LABELS.index("0")], 1)
        self.assertEqual(ex["hist"][HIST_LABELS.index("2…4")], 1)
        self.assertEqual(ex["hist"][HIST_LABELS.index("4…6")], 1)
        n = 5
        self.assertEqual(sum(ex["hist"]), n)
        self.assertEqual(sum(r["n"] for r in ex["by_stage"]), n)
        self.assertEqual(sum(r["n"] for r in ex["monthly"]), n)
        self.assertEqual([r["stage"] for r in ex["by_stage"]], ["S.Bull", "Bull", "Bear", STAGE_NO_DATA])
        self.assertEqual([r["month"] for r in ex["monthly"]], ["2026-08", "2026-09"])
        self.assertEqual(ex["monthly"][1]["sum_return_pct"], -12.0)
        self.assertEqual(ex["monthly"][0]["win_rate_pct"], 100.0)
        self.assertEqual(len(ex["scatter"]), n)

    def test_win_count_matches_old_summary_win_rate(self):
        s = [setup(r) for r in (1.0, 0.0, -1.0, 0.01, -0.01, 0.0)]
        old = summarize_setups(s)
        ex = setup_extras(s)
        self.assertAlmostEqual(old["win_rate_pct"], round(ex["n_win"] / old["n_closed"] * 100, 2))

    def test_one_sided_payoff_is_null(self):
        self.assertIsNone(setup_extras([setup(1.0), setup(2.0)])["payoff_ratio"])
        self.assertIsNone(setup_extras([setup(-1.0), setup(0.0)])["payoff_ratio"])

    def test_no_closed_setups(self):
        ex = setup_extras([setup(1.0, status="open")])
        self.assertEqual((ex["n_win"], ex["n_flat"], ex["n_loss"]), (0, 0, 0))
        self.assertIsNone(ex["hist"])
        self.assertIsNone(ex["by_stage"])
        self.assertIsNone(ex["monthly"])
        self.assertIsNone(ex["payoff_ratio"])

    def test_scatter_is_capped_and_deterministic(self):
        s = [setup(float(i % 7 - 3), mfe=float(i % 11)) for i in range(1500)]
        a, b = setup_extras(s), setup_extras(s)
        self.assertEqual(len(a["scatter"]), 600)
        self.assertTrue(a["scatter_sampled"])
        self.assertEqual(a["scatter"], b["scatter"])

    def test_stage_order_constant(self):
        self.assertEqual(STAGE_ORDER, ["S.Bull", "Bull", "Accumulation", "Recovery", "Warning",
                                       "Distribution", "Bear", STAGE_NO_DATA])


class DropGuardAndWriteTest(unittest.TestCase):
    def rep(self, n):
        return {"scans": {"a": {"setups": [{}] * n}}}

    def test_drop_over_30_percent_blocks(self):
        self.assertFalse(drop_guard_ok(self.rep(69), self.rep(100))[0])
        self.assertTrue(drop_guard_ok(self.rep(70), self.rep(100))[0])
        self.assertTrue(drop_guard_ok(self.rep(5), None)[0])        # no previous file
        self.assertTrue(drop_guard_ok(self.rep(150), self.rep(100))[0])

    def test_nan_is_refused(self):
        path = os.path.join(tempfile.gettempdir(), "rc_nan_test.json")
        with self.assertRaises(ValueError):
            write_json_atomic(path, {"x": float("nan")})
        self.assertFalse(os.path.exists(path))


if __name__ == "__main__":
    unittest.main(verbosity=2)
