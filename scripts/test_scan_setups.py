"""
Tests for scan_setups.py (the shared "where does a setup start/end" rule).

Usage:
    python -X utf8 -m pytest scripts/test_scan_setups.py -q
    python -X utf8 scripts/test_scan_setups.py
"""

import os
import sys
import tempfile
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scan_setups import current_setup, scan_calendar, split_setups  # noqa: E402


def weekdays(start="2026-09-01", n=40):
    out, d = [], date.fromisoformat(start)
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


CAL = weekdays()


def hits(*idx):
    return [CAL[i] for i in idx]


class GapRuleTest(unittest.TestCase):
    def test_out_1_day_is_one_setup(self):
        s = split_setups(hits(0, 1, 3, 4), CAL[:5])
        self.assertEqual(len(s), 1)
        self.assertEqual((s[0]["start"], s[0]["status"], s[0]["days_out"], s[0]["days"]), (CAL[0], "open", 0, 5))

    def test_out_4_days_is_still_one_setup(self):
        s = split_setups(hits(0, 5), CAL[:6])  # out on 1,2,3,4
        self.assertEqual(len(s), 1)
        self.assertEqual(s[0]["n_hits"], 2)

    def test_out_5_days_then_back_is_a_new_setup(self):
        # out on 1..5 (5 days) -> closed on CAL[5]; back on CAL[6] = setup #2
        s = split_setups(hits(0, 6), CAL[:7])
        self.assertEqual([x["seq"] for x in s], [1, 2])
        self.assertEqual((s[0]["status"], s[0]["closed_on"], s[0]["days_out"]), ("closed", CAL[5], 5))
        self.assertEqual((s[1]["start"], s[1]["status"], s[1]["days"]), (CAL[6], "open", 1))

    def test_out_6_days_is_a_new_setup(self):
        s = split_setups(hits(0, 7), CAL[:8])
        self.assertEqual(len(s), 2)
        self.assertEqual(s[0]["closed_on"], CAL[5])

    def test_back_on_5th_day_after_last_hit_is_the_same_setup(self):
        # last hit CAL[0]; back on CAL[5] = only 4 out days -> same setup
        self.assertEqual(len(split_setups(hits(0, 5), CAL[:6])), 1)
        # back on CAL[6] = 5 out days -> new setup
        self.assertEqual(len(split_setups(hits(0, 6), CAL[:7])), 2)

    def test_pending_while_out_1_to_4_days(self):
        for n_out in range(1, 5):
            s = split_setups(hits(0, 1), CAL[: 2 + n_out])
            self.assertEqual(len(s), 1)
            self.assertEqual((s[0]["status"], s[0]["days_out"], s[0]["closed_on"]), ("pending", n_out, None))
            self.assertEqual(s[0]["days"], 2 + n_out)  # out days still count toward DAYS
        s = split_setups(hits(0, 1), CAL[:7])  # out 5
        self.assertEqual((s[0]["status"], s[0]["closed_on"], s[0]["days"]), ("closed", CAL[6], 2))

    def test_days_not_in_the_calendar_do_not_count(self):
        # CAL[1..4] missing from the calendar (holiday / no data) -> 0 out days
        cal = [CAL[0]] + CAL[5:8]
        s = split_setups([CAL[0], CAL[7]], cal)
        self.assertEqual(len(s), 1)
        self.assertEqual(s[0]["days"], 4)

    def test_weekend_and_holiday_calendar_gaps(self):
        cal = weekdays("2026-10-05", 8)  # 05..09, 12..14
        cal.remove("2026-10-13")         # holiday: not a scan day
        s = split_setups(["2026-10-05"], cal)
        # out on 06,07,08,09,12 = 5 -> closed on 12 (13 is not a day)
        self.assertEqual((s[0]["status"], s[0]["closed_on"]), ("closed", "2026-10-12"))

    def test_hits_outside_calendar_are_ignored(self):
        s = split_setups(["2026-09-05", CAL[0]], CAL[:3])  # 09-05 is a Saturday, not in CAL
        self.assertEqual(s[0]["start"], CAL[0])
        self.assertEqual(split_setups(["2026-09-05"], CAL[:3]), [])

    def test_open_setup_at_end_of_data(self):
        s = split_setups(hits(0, 1, 2, 9, 10), CAL[:11])
        self.assertEqual(len(s), 2)
        self.assertEqual(s[-1]["status"], "open")
        self.assertEqual(current_setup(hits(0, 1, 2, 9, 10), CAL[:11])["start"], CAL[9])
        self.assertIsNone(current_setup(hits(0), CAL[:11]))

    def test_latest_cuts_the_data(self):
        h = hits(0, 1, 8)
        s = split_setups(h, CAL, latest=CAL[3])
        self.assertEqual(len(s), 1)
        self.assertEqual((s[0]["status"], s[0]["days_out"]), ("pending", 2))

    def test_closed_setup_never_reopens_as_days_are_added(self):
        h = hits(0, 1, 2, 4, 9, 10, 11, 17, 18, 25)
        seen_closed = {}
        for k in range(1, len(CAL) + 1):
            for s in split_setups(h, CAL[:k]):
                key = s["start"]
                if key in seen_closed:
                    self.assertEqual(s["status"], "closed", f"reopened {key} at day {k}")
                    self.assertEqual(s["last_hit"], seen_closed[key]["last_hit"])
                    self.assertEqual(s["closed_on"], seen_closed[key]["closed_on"])
                elif s["status"] == "closed":
                    seen_closed[key] = s

    def test_empty(self):
        self.assertEqual(split_setups([], CAL), [])
        self.assertEqual(split_setups(hits(0), []), [])


class ScanCalendarTest(unittest.TestCase):
    def test_file_must_exist_weekday_and_not_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            for d, has in [("2026-09-04", True), ("2026-09-05", True), ("2026-09-07", False),
                           ("2026-09-08", True), ("2026-09-09", True)]:
                os.makedirs(os.path.join(tmp, d))
                if has:
                    with open(os.path.join(tmp, d, "sepa.json"), "w") as f:
                        f.write("[]")  # empty list = scan ran, nothing passed -> still a day
            self.assertEqual(scan_calendar(tmp, "sepa"), ["2026-09-04", "2026-09-08", "2026-09-09"])
            self.assertEqual(scan_calendar(tmp, "sepa", exclude={"2026-09-08"}), ["2026-09-04", "2026-09-09"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
