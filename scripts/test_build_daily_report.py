"""
Tests for build_daily_report.py (rules of /daily-report phase 1).

Usage:
    python -X utf8 -m pytest scripts/test_build_daily_report.py -q
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_daily_report as m  # noqa: E402


def weekdays(start="2026-09-01", n=30):
    d = date.fromisoformat(start)
    out = []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def bar(d, o, h, l, c):
    return {"date": d, "open": o, "high": h, "low": l, "close": c}


class TestClosePosition(unittest.TestCase):
    def test_h_equals_l_is_mid(self):
        self.assertEqual(m.close_position(bar("x", 5, 5, 5, 5)), "mid")

    def test_at_high(self):
        self.assertEqual(m.close_position(bar("x", 9, 10, 8, 10)), "at_high")

    def test_near_high_low_mid(self):
        self.assertEqual(m.close_position(bar("x", 9, 10, 6, 9)), "near_high")    # 0.75
        self.assertEqual(m.close_position(bar("x", 9, 10, 6, 7)), "near_low")     # 0.25
        self.assertEqual(m.close_position(bar("x", 9, 10, 6, 8)), "mid")          # 0.5


class TestTrigger(unittest.TestCase):
    def setUp(self):
        self.days = weekdays(n=30)

    def series(self, highs, closes):
        return [bar(d, c, h, c - 0.5, c) for d, h, c in zip(self.days, highs, closes)]

    def test_high_day(self):
        b = self.series([10] * 30, [9] * 30)
        self.assertEqual(m.trigger_of(b, self.days[-1]), (10, "high_day"))

    def test_high_5d(self):
        highs = [10] * 29 + [9]
        b = self.series(highs, [9] * 30)
        b[-3]["high"] = 9.6
        self.assertEqual(m.trigger_of(b, self.days[-1]), (10, "high_5d"))

    def test_high_30d(self):
        highs = [12] + [9] * 29
        b = self.series(highs, [9] * 30)
        self.assertEqual(m.trigger_of(b, self.days[-1]), (12, "high_30d"))

    def test_close_at_30d_high_is_null(self):
        b = self.series([9] * 29 + [10], [9] * 29 + [10])
        self.assertEqual(m.trigger_of(b, self.days[-1]), (None, "close_30d_high"))

    def test_trigger_never_le_close(self):
        b = self.series([10] * 30, [10] * 30)  # every high == close
        trig, kind = m.trigger_of(b, self.days[-1])
        self.assertIsNone(trig)

    def test_no_bar_on_day(self):
        b = self.series([10] * 29, [9] * 29)  # last bar is the day before
        self.assertEqual(m.trigger_of(b, self.days[-1]), (None, None))


class TestStop(unittest.TestCase):
    def test_nearest_below_close(self):
        self.assertEqual(m.stop_of(9.0, 9.5, 10.0), (9.5, "prev_close"))
        self.assertEqual(m.stop_of(9.6, 9.5, 10.0), (9.6, "low"))

    def test_prev_close_above_close(self):
        self.assertEqual(m.stop_of(9.0, 11.0, 10.0), (9.0, "low"))

    def test_none_below_close_falls_back_to_low(self):
        self.assertEqual(m.stop_of(10.0, 10.0, 10.0), (10.0, "low"))


class TestTiers(unittest.TestCase):
    def test_rv(self):
        self.assertEqual([m.rv_tier(v) for v in (1.5, 1.49, 1.0, 0.99, None)], ["hi", "mid", "mid", "lo", None])

    def test_tech(self):
        self.assertEqual([m.tech_label(v) for v in (0.5, 0.49, 0.1, 0.09)], ["Strong Buy", "Buy", "Buy", "Neutral"])

    def test_xd_amount(self):
        self.assertEqual(m.xd_amount("วัน XD · เงินปันผล 0.05 บาท/หุ้น"), 0.05)
        self.assertIsNone(m.xd_amount("วัน XR · 1:1"))


class TestClassify(unittest.TestCase):
    def setUp(self):
        self.cal = weekdays(n=20)
        self.sets = {d: set() for d in self.cal}

    def put(self, t, idxs):
        for i in idxs:
            self.sets[self.cal[i]].add(t)

    def test_stay_streak(self):
        self.put("A", [16, 17, 18, 19])
        prev, cur, _ = m.classify(self.cal, self.sets, self.cal[19])
        self.assertEqual(prev, self.cal[18])
        self.assertEqual(cur["A"], {"status": "stay", "last_seen": None, "streak_days": 4})

    def test_reentry_within_10(self):
        self.put("A", [9, 19])  # last seen 10 scan days before
        _, cur, _ = m.classify(self.cal, self.sets, self.cal[19])
        self.assertEqual(cur["A"]["status"], "reentry")
        self.assertEqual(cur["A"]["last_seen"], self.cal[9])
        self.assertEqual(cur["A"]["streak_days"], 1)

    def test_back_after_11_days_is_new(self):
        self.put("A", [8, 19])  # 11 scan days before → outside the 10-day window
        _, cur, _ = m.classify(self.cal, self.sets, self.cal[19])
        self.assertEqual(cur["A"], {"status": "new", "last_seen": None, "streak_days": 1})

    def test_dropped(self):
        self.put("A", [15, 16, 17, 18])
        _, cur, drop = m.classify(self.cal, self.sets, self.cal[19])
        self.assertNotIn("A", cur)
        self.assertEqual(drop["A"], {"status": "dropped", "days_before_drop": 4})


class TestHolidayFolder(unittest.TestCase):
    """โฟลเดอร์ history ของวันหยุด (ไม่มีแท่ง SET) ต้องไม่ถูกนับเป็นวันสแกน"""

    def test_build_skips_holiday_and_stale_price(self):
        days = weekdays(start="2026-10-01", n=8)
        holiday = days[5]
        trading = [d for d in days if d != holiday]
        with tempfile.TemporaryDirectory() as root:
            scans = os.path.join(root, "data", "scans")
            os.makedirs(scans)
            os.makedirs(os.path.join(root, "public", "data"))

            def w(path, obj):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(obj, f)

            w(os.path.join(scans, "breadth.json"),
              {"set_index": [{"date": d, "close": 1000 + i, "volume": 5e10} for i, d in enumerate(trading)],
               "market_stage": {"stage": "Uptrend", "dd_count_25d": 1}})
            w(os.path.join(scans, "sector_map.json"), {"ticker_to_sector": {}})
            w(os.path.join(scans, "combined.json"), {"data": []})
            # AAA: bars every trading day · BBB: no bar on the last day (stale)
            w(os.path.join(scans, "topmover_charts.json"), {"data": {
                "AAA": {"bars": [bar(d, 9, 10, 8, 9 + i * 0.1) for i, d in enumerate(trading)]},
                "BBB": {"bars": [bar(d, 9, 10, 8, 9) for d in trading[:-1]]},
            }})
            w(os.path.join(root, "public", "data", "news_flags.json"), {"flags": {}})
            for d in days:
                rows = [{"Ticker": "AAA", "Close": 1, "Change_Pct": 1}]
                if d == holiday:
                    rows.append({"Ticker": "HOL", "Close": 1})  # only on the holiday snapshot
                if d == trading[-1]:
                    rows.append({"Ticker": "BBB", "Close": 9, "Change_Pct": 0, "Volume": 2e6,
                                 "Rel_Volume": 1.1, "Avg_Volume_10D": 1e6, "Tech_Rating": 0.3})
                    rows.append({"Ticker": "HOL", "Close": 1, "Change_Pct": 1})
                w(os.path.join(root, "data", "history", d, "lekkung_daytrade.json"), {"data": rows})

            rep = m.build(root)
            self.assertEqual(rep["date"], trading[-1])
            self.assertEqual(rep["compared_to"], trading[-2])  # not the holiday folder
            rows = {r["ticker"]: r for r in rep["daytrade"]["rows"]}
            self.assertEqual(rows["AAA"]["status"], "stay")
            self.assertEqual(rows["AAA"]["streak_days"], len(trading))
            self.assertEqual(rows["HOL"]["status"], "new")  # holiday hit ignored
            self.assertTrue(rows["BBB"]["price_stale"])
            self.assertIsNone(rows["BBB"]["trigger"])
            self.assertIsNone(rows["BBB"]["stop"])
            self.assertEqual(rows["BBB"]["min_vol_1030"], 300000)
            self.assertEqual(rep["market"]["breadth"]["skipped_no_bar"], 1)


if __name__ == "__main__":
    unittest.main()
