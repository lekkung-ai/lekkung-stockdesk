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
    closed_highlights,
    compute_setups,
    exit_on_drop_returns,
    hold_return,
    is_outlier_return,
    outlier_brief,
    scan_range_of,
    simulate_exit,
    what_if_summary,
    drop_dates,
    drop_guard_ok,
    exit_reason,
    is_single_day,
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
        self.assertEqual(exit_reason({"status": "closed", "first_hit": "2026-09-01", "last_hit": "2026-09-01",
                                      "holding_days": 4}), "single_day")
        self.assertEqual(exit_reason({"status": "closed", "first_hit": "2026-09-01", "last_hit": "2026-09-03",
                                      "holding_days": 6}), "left_scan")
        # old rows without first/last hit: 0-day hold
        self.assertEqual(exit_reason({"status": "closed", "holding_days": 0}), "single_day")

    def test_single_day_setup_sells_on_the_5th_out_day(self):
        # hit once on D (09-01): entry = D+1 close, main exit = close on the 5th out day
        series = [row(f"2026-09-{d:02d}", 10 + d, 1) for d in range(1, 12)]
        out = compute_setups(["2026-09-01"], series)
        self.assertEqual(len(out), 1)
        s = out[0]
        self.assertEqual((s["entry_date"], s["exit_date"], s["holding_days"], s["status"]),
                         ("2026-09-02", "2026-09-06", 4, "closed"))
        self.assertEqual(s["return_pct"], round((16 / 12 - 1) * 100, 2))
        self.assertEqual((s["exit_date_drop"], s["holding_days_drop"], s["return_pct_drop"]), ("2026-09-02", 0, 0.0))
        self.assertTrue(is_single_day(s))
        self.assertEqual(exit_reason(s), "single_day")


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


def bar(d, close, high, low):
    return (d, close, 1.0, high, low)


def wd(n, start="2026-09-01"):
    from datetime import date, timedelta
    out, d = [], date.fromisoformat(start)
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


class MfeMaeTest(unittest.TestCase):
    def test_zero_day_hold_is_zero_even_with_a_wide_entry_day(self):
        days = wd(2)
        # entry day (days[1]) is the latest bar and has a huge intraday range - must not count
        series = [bar(d, 10.0, 10.0, 10.0) for d in days]
        series[1] = bar(days[1], 10.0, 13.0, 8.0)
        out = compute_setups([days[0]], series, valid_scan_dates=days)
        self.assertEqual(out[0]["holding_days"], 0)
        self.assertEqual((out[0]["mfe_pct"], out[0]["mae_pct"]), (0.0, 0.0))

    def test_entry_day_range_is_excluded_later_days_count(self):
        days = wd(12)
        series = [bar(d, 10.0, 10.0, 10.0) for d in days]
        series[1] = bar(days[1], 10.0, 15.0, 5.0)   # entry day: ignored
        series[2] = bar(days[2], 10.0, 11.0, 9.5)   # counted
        out = compute_setups([days[0], days[1]], series, valid_scan_dates=days)
        s = out[0]
        # main exit = 5th out day after days[1] = days[6]
        self.assertEqual((s["entry_date"], s["exit_date"], s["holding_days"]), (days[1], days[6], 5))
        self.assertEqual((s["mfe_pct"], s["mae_pct"]), (10.0, -5.0))


class SetupRuleInReportCardTest(unittest.TestCase):
    def test_out_3_days_is_open_with_days_out_and_latest_price(self):
        days = wd(8)
        series = [bar(d, 10.0 + i, 10.0 + i, 10.0 + i) for i, d in enumerate(days)]
        out = compute_setups(days[:5], series, valid_scan_dates=days)  # out on days 5,6,7
        self.assertEqual(len(out), 1)
        s = out[0]
        self.assertEqual((s["status"], s["days_out"], s["exit_date"]), ("open", 3, days[-1]))
        self.assertEqual(s["exit_price_drop"], s["exit_price"])
        self.assertEqual(exit_reason(s), "open")

    def test_closed_has_both_exits(self):
        days = wd(12)
        series = [bar(d, 10.0 + i, 10.0 + i, 10.0 + i) for i, d in enumerate(days)]
        out = compute_setups(days[:3], series, valid_scan_dates=days)  # last hit days[2]
        s = out[0]
        self.assertEqual(s["status"], "closed")
        self.assertEqual((s["exit_date"], s["exit_price"]), (days[7], 17.0))            # main: 5th out day
        self.assertEqual((s["exit_date_drop"], s["exit_price_drop"]), (days[3], 13.0))  # day after last hit
        self.assertEqual((s["holding_days"], s["holding_days_drop"]), (6, 2))
        self.assertEqual((s["first_hit"], s["last_hit"], s["n_hits"]), (days[0], days[2], 3))

    def test_back_within_4_days_is_one_setup_back_after_5_is_two(self):
        days = wd(20)
        series = [bar(d, 10.0, 10.0, 10.0) for d in days]
        self.assertEqual(len(compute_setups([days[0], days[5]], series, valid_scan_dates=days)), 1)
        self.assertEqual(len(compute_setups([days[0], days[6]], series, valid_scan_dates=days)), 2)

    def test_closed_never_reopens_day_by_day(self):
        days = wd(30)
        series = [bar(d, 10.0 + i * 0.1, 10.0 + i * 0.1, 10.0 + i * 0.1) for i, d in enumerate(days)]
        hits = [days[i] for i in (0, 1, 2, 4, 9, 10, 11, 17, 18, 25)]
        closed = {}
        for k in range(2, len(days) + 1):
            for s in compute_setups([h for h in hits if h <= days[k - 1]], series[:k], valid_scan_dates=days[:k]):
                if s["entry_date"] in closed:
                    self.assertEqual(s["status"], "closed")
                    self.assertEqual(s["exit_price"], closed[s["entry_date"]]["exit_price"])
                elif s["status"] == "closed":
                    closed[s["entry_date"]] = s

    def test_no_nan_in_numbers(self):
        import math
        days = wd(12)
        series = [bar(d, 10.0, None, None) for d in days]
        for s in compute_setups(days[:2], series, valid_scan_dates=days):
            for k, v in s.items():
                if isinstance(v, float):
                    self.assertTrue(math.isfinite(v), k)


class FormulaVersionGuardTest(unittest.TestCase):
    def rep(self, n_setups, n_tickers, version=None):
        r = {"scans": {"a": {"setups": [{"ticker": f"T{i % n_tickers}"} for i in range(n_setups)]}}}
        if version is not None:
            r["setup_formula_version"] = version
        return r

    def test_formula_change_compares_tickers_not_setups(self):
        # 100 setups over 50 tickers -> 60 setups over the same 50 tickers: ok after a formula change
        self.assertTrue(drop_guard_ok(self.rep(60, 50, 2), self.rep(100, 50))[0])
        # ...but blocked when the formula did not change
        self.assertFalse(drop_guard_ok(self.rep(60, 50, 2), self.rep(100, 50, 2))[0])
        # a formula change still blocks losing most tickers (broken fetch)
        self.assertFalse(drop_guard_ok(self.rep(30, 30, 2), self.rep(100, 50))[0])

    def test_version_3_vs_2_is_a_formula_change(self):
        self.assertTrue(drop_guard_ok(self.rep(60, 50, 3), self.rep(100, 50, 2))[0])
        self.assertFalse(drop_guard_ok(self.rep(60, 50, 3), self.rep(100, 50, 3))[0])


class SimulateExitTest(unittest.TestCase):
    # entry at index 0, close 10
    def ser(self, *bars):
        return [bar("2026-09-01", 10.0, 10.0, 10.0)] + [bar(f"2026-09-{i + 2:02d}", c, h, l) for i, (c, h, l) in enumerate(bars)]

    def test_take_profit_touched(self):
        series = self.ser((10.1, 10.2, 9.9), (10.2, 10.35, 10.0), (9.0, 9.0, 8.0))
        self.assertEqual(simulate_exit(series, 0, 3, 10.0, tp_pct=3.0), 3.0)

    def test_stop_touched(self):
        series = self.ser((10.0, 10.1, 9.69), (12.0, 12.0, 11.0))
        self.assertEqual(simulate_exit(series, 0, 2, 10.0, sl_pct=3.0), -3.0)

    def test_both_on_the_same_day_is_the_stop(self):
        series = self.ser((10.0, 10.6, 9.6))
        self.assertEqual(simulate_exit(series, 0, 1, 10.0, tp_pct=5.0, sl_pct=3.0), -3.0)

    def test_not_touched_sells_at_the_main_exit(self):
        series = self.ser((10.1, 10.2, 9.9), (10.2, 10.25, 10.0))
        self.assertAlmostEqual(simulate_exit(series, 0, 2, 10.0, tp_pct=3.0, sl_pct=3.0), 2.0)

    def test_entry_day_is_not_counted(self):
        series = self.ser((10.1, 10.2, 9.9))
        series[0] = bar("2026-09-01", 10.0, 12.0, 8.0)  # entry day touches both - ignored
        self.assertAlmostEqual(simulate_exit(series, 0, 1, 10.0, tp_pct=3.0, sl_pct=3.0), 1.0)

    def test_hold_n(self):
        series = self.ser((11.0, 11, 11), (12.0, 12, 12))
        self.assertAlmostEqual(hold_return(series, 0, 2, 10.0), 20.0)
        self.assertIsNone(hold_return(series, 0, 5, 10.0))


class WhatIfTest(unittest.TestCase):
    def test_rows_use_the_same_closed_setups(self):
        days = wd(30)
        # rises 1%/day; hit days 0..2, then out -> closes on days[7]
        series = [bar(d, 10.0 * (1 + 0.01 * i), 10.0 * (1 + 0.01 * i) + 0.05, 10.0 * (1 + 0.01 * i) - 0.05)
                  for i, d in enumerate(days)]
        setups = compute_setups(days[:3], series, valid_scan_dates=days)
        setups += compute_setups(days[25:30], series, valid_scan_dates=days)  # open at the end: not counted
        wi = what_if_summary(setups, exit_on_drop_returns(days[:3], series, days))
        self.assertEqual(wi["current"]["n"], 1)
        self.assertEqual((wi["tp_3"]["n"], wi["tp_3"]["avg_return_pct"], wi["tp_3"]["win_rate_pct"]), (1, 3.0, 100.0))
        self.assertEqual(wi["sl_3"]["avg_return_pct"], wi["current"]["avg_return_pct"])  # stop never touched
        self.assertEqual(wi["hold_5"]["n"], 1)
        self.assertEqual(wi["exit_on_drop"]["n"], 1)
        self.assertEqual(set(wi), {"current", "exit_on_drop", "hold_5", "hold_10", "hold_20", "tp_3", "tp_5", "sl_3"})
        for row in wi.values():
            self.assertTrue({"current_same_avg_pct", "current_same_win_pct", "diff_pct", "different_set"} <= set(row))

    def test_exit_on_drop_counts_a_new_setup_after_each_drop(self):
        days = wd(15)
        series = [bar(d, 10.0 + i, 10.0 + i, 10.0 + i) for i, d in enumerate(days)]
        # in on 0,1 | out 2 | in 3 | out 4.. -> two closed runs (main rule: one setup)
        hits = [days[0], days[1], days[3]]
        r = exit_on_drop_returns(hits, series, days)
        self.assertEqual(len(r), 2)
        self.assertAlmostEqual(r[0], (12.0 / 11.0 - 1) * 100)   # entry days[1], exit first out day days[2]
        self.assertAlmostEqual(r[1], (14.0 / 14.0 - 1) * 100)   # entry days[4] = first out day
        self.assertEqual(len(compute_setups(hits, series, valid_scan_dates=days)), 1)
        # still in the scan on the last day -> not counted
        self.assertEqual(exit_on_drop_returns(days[10:15], series, days), [])


class HighlightsTest(unittest.TestCase):
    def mk(self, t, entry, exit_, r, single=False):
        return {"ticker": t, "entry_date": entry, "exit_date": exit_, "holding_days": 5, "return_pct": r,
                "mfe_pct": 1.0, "exit_reason": "left_scan", "status": "closed",
                "first_hit": entry, "last_hit": entry if single else "2026-12-31"}

    def test_recent_best_worst_last30(self):
        rows = [self.mk(f"T{i}", f"2026-09-{i + 1:02d}", f"2026-10-{i + 1:02d}", float(i - 5)) for i in range(10)]
        rows.append(self.mk("ONE", "2026-10-20", "2026-10-27", 50.0, single=True))
        rows.append({**self.mk("OPEN", "2026-10-20", "2026-11-12", 99.0), "status": "open"})
        h = closed_highlights(rows, "2026-11-12")
        self.assertEqual(len(h["recent_closed"]), 8)
        self.assertEqual(h["recent_closed"][0]["ticker"], "ONE")
        self.assertNotIn("OPEN", [x["ticker"] for x in h["recent_closed"]])
        self.assertEqual([x["ticker"] for x in h["best3"]], ["T9", "T8", "T7"])   # single-day left out
        self.assertEqual([x["ticker"] for x in h["worst3"]], ["T0", "T1", "T2"])
        # exits T0..T9 = 10-01..10-10 are before the 30-day line; only ONE (10-27) is inside
        self.assertEqual(h["last30"]["since"], "2026-10-13")
        self.assertEqual((h["last30"]["n"], h["last30"]["n_win"]), (1, 1))

    def test_no_closed(self):
        h = closed_highlights([], None)
        self.assertEqual((h["recent_closed"], h["best3"], h["last30"]["n"]), ([], [], 0))


class ScanRangeTest(unittest.TestCase):
    def test_range_spans_all_scans(self):
        r = scan_range_of({"a": {"scan_range": {"first_date": "2026-06-24", "last_date": "2026-11-12"}},
                           "b": {"scan_range": {"first_date": "2026-07-01", "last_date": "2026-11-13"}},
                           "c": {"scan_range": {"first_date": None, "last_date": None}}})
        self.assertEqual(r, {"first_date": "2026-06-24", "last_date": "2026-11-13"})

    def test_all_data_is_used(self):
        # a setup from long ago is still listed (no 90-day window)
        days = wd(150, "2026-01-05")
        series = [bar(d, 10.0, 10.0, 10.0) for d in days]
        out = compute_setups([days[0], days[140]], series, valid_scan_dates=days)
        self.assertEqual(out[0]["first_hit"], days[0])
        self.assertEqual(len(out), 2)


def mk_setup(ret, what_if, **kw):
    return {"status": "closed", "return_pct": ret, "_what_if": what_if, **kw}


class SameSetWhatIfTest(unittest.TestCase):
    def setUp(self):
        # hold_20 exists only for the two OLDER setups; the main rule is much worse on those
        self.setups = [
            mk_setup(-2.0, {"hold_5": 1.0, "hold_10": 1.0, "hold_20": 4.0, "tp_3": 0.0, "tp_5": 0.0, "sl_3": 0.0}),
            mk_setup(-4.0, {"hold_5": 0.0, "hold_10": 2.0, "hold_20": 2.0, "tp_3": 0.0, "tp_5": 0.0, "sl_3": 0.0}),
            mk_setup(6.0, {"hold_5": 2.0, "hold_10": None, "hold_20": None, "tp_3": 3.0, "tp_5": 5.0, "sl_3": 6.0}),
            mk_setup(8.0, {"hold_5": 3.0, "hold_10": None, "hold_20": None, "tp_3": 3.0, "tp_5": 5.0, "sl_3": 8.0}),
        ]
        self.wi = what_if_summary(self.setups, [1.0, -1.0, 3.0])

    def test_current_is_the_whole_set(self):
        c = self.wi["current"]
        self.assertEqual((c["n"], c["avg_return_pct"], c["diff_pct"]), (4, 2.0, None))

    def test_rule_on_a_subset_is_compared_on_that_subset(self):
        h = self.wi["hold_20"]
        self.assertEqual((h["n"], h["avg_return_pct"]), (2, 3.0))
        self.assertEqual((h["current_same_avg_pct"], h["diff_pct"]), (-3.0, 6.0))   # not 2.0 / 1.0
        self.assertEqual(h["different_set"], False)
        h10 = self.wi["hold_10"]
        self.assertEqual((h10["n"], h10["current_same_avg_pct"], h10["diff_pct"]), (2, -3.0, 4.5))

    def test_full_set_rule(self):
        t = self.wi["hold_5"]
        self.assertEqual((t["n"], t["avg_return_pct"], t["current_same_avg_pct"], t["diff_pct"]), (4, 1.5, 2.0, -0.5))

    def test_current_same_win_rate_uses_the_same_rows(self):
        h = self.wi["hold_20"]
        self.assertEqual((h["win_rate_pct"], h["current_same_win_pct"]), (100.0, 0.0))

    def test_exit_on_drop_is_a_different_set_compared_with_the_whole(self):
        d = self.wi["exit_on_drop"]
        self.assertEqual((d["n"], d["different_set"]), (3, True))
        self.assertEqual((d["current_same_avg_pct"], d["diff_pct"]), (2.0, round(1.0 - 2.0, 2)))

    def test_outlier_setups_are_not_counted_anywhere_in_the_table(self):
        extra = mk_setup(-75.0, {"hold_5": -75.0, "hold_10": -75.0, "hold_20": -75.0, "tp_3": -75.0, "tp_5": -75.0, "sl_3": -3.0},
                         excluded_outlier=True)
        wi = what_if_summary(self.setups + [extra], [])
        self.assertEqual(wi["current"]["n"], 4)
        self.assertEqual(wi["hold_5"]["avg_return_pct"], 1.5)


class OutlierGuardTest(unittest.TestCase):
    def series(self, closes, vols):
        days = wd(len(closes))
        return [(d, c, v, c, c) for d, c, v in zip(days, closes, vols)]

    def test_rule(self):
        ser = self.series([10, 10, 5, 5], [1, 1, 0, 1])
        self.assertTrue(is_outlier_return(ser, 1, 3, -50.0))       # big move + a zero-volume day
        self.assertFalse(is_outlier_return(ser, 1, 3, -39.9))      # not big enough
        self.assertFalse(is_outlier_return(ser, 1, 3, 40.0))       # the rule is strictly more than 40
        self.assertTrue(is_outlier_return(ser, 1, 3, 40.01))
        self.assertFalse(is_outlier_return(self.series([10, 10, 5, 5], [1, 1, 1, 1]), 1, 3, -50.0))  # traded every day
        self.assertFalse(is_outlier_return(ser, 0, 3, None))

    def test_halt_outside_the_holding_window_does_not_count(self):
        ser = self.series([10, 10, 10, 5, 5], [0, 1, 1, 1, 1])
        self.assertFalse(is_outlier_return(ser, 1, 4, -50.0))

    def test_setup_is_flagged_when_it_fails_the_guard(self):
        days = wd(14)
        closes = [10.0] * 3 + [5.0] * 11                     # -50% after entry
        vols = [1.0] * 3 + [0.0] + [1.0] * 10                # a day with no trading while held
        series = [(d, c, v, c, c) for d, c, v in zip(days, closes, vols)]
        out = compute_setups([days[0]], series, valid_scan_dates=days)
        self.assertEqual(len(out), 1)
        self.assertTrue(out[0].get("excluded_outlier"))
        self.assertEqual(out[0]["status"], "closed")

    def test_big_move_that_traded_every_day_is_kept(self):
        days = wd(14)
        closes = [10.0] * 3 + [5.0] * 11
        series = [(d, c, 1.0, c, c) for d, c in zip(days, closes)]
        out = compute_setups([days[0]], series, valid_scan_dates=days)
        self.assertNotIn("excluded_outlier", out[0])

    def test_open_setups_are_never_excluded(self):
        days = wd(6)
        series = [(d, 10.0 if i < 3 else 5.0, 0.0 if i == 4 else 1.0, 5.0, 5.0) for i, d in enumerate(days)]
        out = compute_setups(days[:4], series, valid_scan_dates=days)
        self.assertEqual(out[0]["status"], "open")
        self.assertNotIn("excluded_outlier", out[0])

    def test_brief_has_the_reason(self):
        b = outlier_brief({"ticker": "INGRS", "entry_date": "2026-10-01", "exit_date": "2026-10-09", "return_pct": -75.0})
        self.assertEqual((b["ticker"], b["return_pct"]), ("INGRS", -75.0))
        self.assertIn("40%", b["reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
