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


class TestCalendarInScans(unittest.TestCase):
    def make_root(self, root, day, nxt):
        def w(path, obj):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(obj, f)
        w(os.path.join(root, "data", "scans", "breadth.json"),
          {"set_index": [{"date": day, "close": 1, "volume": 1}, {"date": nxt, "close": 1, "volume": 1}]})
        h = os.path.join(root, "data", "history", day)
        w(os.path.join(h, "lekkung.json"), [{"Ticker": "GRO"}, {"Ticker": "MULTI"}])
        w(os.path.join(h, "sepa.json"), [{"Ticker": "SEP"}, {"Ticker": "MULTI"}])
        w(os.path.join(h, "lekkung_daytrade.json"), {"data": [{"Ticker": "DAY"}, {"Ticker": "MULTI"}]})
        w(os.path.join(h, "market_stage.json"), [
            {"Ticker": "BULL", "Stage": "Bull"}, {"Ticker": "SB", "Stage": "S.Bull"},
            {"Ticker": "ACC", "Stage": "Accumulation"}, {"Ticker": "REC", "Stage": "Recovery"},
            {"Ticker": "BEAR", "Stage": "Bear"}, {"Ticker": "WARN", "Stage": "Warning"},
            {"Ticker": "DIST", "Stage": "Distribution"}, {"Ticker": "IPO1", "Stage": "IPO"},
            {"Ticker": "MULTI", "Stage": "Bull"},
        ])
        flags = {t: [{"type": "xd_soon", "label": "XD", "date": nxt, "title": "วัน XD · เงินปันผล 0.10 บาท/หุ้น"}]
                 for t in ("MULTI", "NONE", "BEAR", "BULL", "SB", "ACC", "REC", "WARN", "DIST", "IPO1", "GRO")}
        w(os.path.join(root, "public", "data", "news_flags.json"), {"as_of": day, "flags": flags})

    def test_in_scans(self):
        days = weekdays(start="2026-11-16", n=2)
        with tempfile.TemporaryDirectory() as root:
            self.make_root(root, days[0], days[1])
            cal = m.build_calendar(m.Ctx(root), days[0])
            by = {i["ticker"]: i["in_scans"] for i in cal["items"]}
            self.assertEqual(by["MULTI"], ["daytrade", "growth", "sepa", "market_stage:Bull"])  # หลายสแกน
            self.assertEqual(by["NONE"], [])                                              # ไม่อยู่สักสแกน (ไม่ถูกตัดทิ้ง)
            self.assertEqual(by["GRO"], ["growth"])
            for t, st in (("BULL", "Bull"), ("SB", "S.Bull"), ("ACC", "Accumulation"), ("REC", "Recovery")):
                self.assertEqual(by[t], [f"market_stage:{st}"], t)                        # 4 stage ที่นับ · แนบชื่อ stage จริง
            for t in ("BEAR", "WARN", "DIST", "IPO1"):                                    # Bear/Warning/Distribution/IPO ไม่มีป้าย Stage
                self.assertEqual(by[t], [], t)
            self.assertEqual(len(cal["items"]), 11)                                       # ไม่ตัดรายการ
            self.assertEqual(cal["next_trading_day"], days[1])

    def test_next_trading_day_when_latest(self):
        # วันศุกร์ที่เป็นวันล่าสุด → วันทำการถัดไป = จันทร์
        with tempfile.TemporaryDirectory() as root:
            self.make_root(root, "2026-11-20", "2026-11-20")
            cal = m.build_calendar(m.Ctx(root), "2026-11-20")
            self.assertEqual(cal["next_trading_day"], "2026-11-23")


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


class Fixture:
    """root ขนาดเล็ก: 12 วันทำการ · growth / sepa / daytrade / market_stage ครบทุกวัน"""

    def __init__(self, root):
        self.root = root
        self.days = weekdays(start="2026-10-01", n=12)
        self.day = self.days[-1]
        self.prev = self.days[-2]
        scans = os.path.join(root, "data", "scans")
        write_json(os.path.join(scans, "breadth.json"),
                   {"set_index": [{"date": d, "close": 1000, "volume": 1e10} for d in self.days],
                    "market_stage": {"stage": "Uptrend", "dd_count_25d": 1}})
        write_json(os.path.join(scans, "sector_map.json"),
                   {"ticker_to_sector": {"FND": {"subsector": "Property Fund & REITs"}}})
        write_json(os.path.join(scans, "combined.json"), {"data": []})
        write_json(os.path.join(scans, "report_card.json"), {"scans": {}})
        write_json(os.path.join(scans, "generated_at.json"), {})
        bars = {t: {"bars": [bar(d, 10, 11, 9, 10 + i * 0.1) for i, d in enumerate(self.days)]}
                for t in ("AAA", "BBB", "CCC", "DDD", "EEE", "FND", "S1", "S2")}
        write_json(os.path.join(scans, "topmover_charts.json"), {"data": bars})
        write_json(os.path.join(root, "public", "data", "news_flags.json"), {"flags": {}})
        # growth: AAA ทุกวัน (stay) · BBB หายวันก่อน (reentry) · CCC อยู่ถึงวันก่อน (dropped) · DDD หลุดก่อนหน้า
        g = {d: ["AAA"] for d in self.days}
        g[self.days[-3]] += ["BBB", "DDD"]
        g[self.day] += ["BBB"]
        g[self.prev] += ["CCC"]
        # sepa: EEE เข้าใหม่วันนี้ · AAA อยู่ทุกวัน
        sp = {d: ["AAA"] for d in self.days}
        sp[self.day] += ["EEE"]
        # market stage: S1 Bear→Recovery (focus) · S2 Warning→Bull (summary) · FND กองทุน
        for d in self.days:
            h = os.path.join(root, "data", "history", d)
            write_json(os.path.join(h, "lekkung.json"),
                       [{"Ticker": t, "Close": 10, "EMA_10": 9.5, "52W_High": 12, "ADTV_MB": 5} for t in g[d]])
            write_json(os.path.join(h, "sepa.json"),
                       [{"Ticker": t, "Price": 10, "RS_Rating": 90, "%_From_High": "-5%", "ADTV(MB)": 8} for t in sp[d]])
            write_json(os.path.join(h, "lekkung_daytrade.json"), {"data": [{"Ticker": "AAA", "Close": 10}]})
            last = d == self.day
            write_json(os.path.join(h, "market_stage.json"), [
                {"Ticker": "S1", "Stage": "Recovery" if last else "Bear", "Price": 5, "EMA200": 4, "ADTV(MB)": 3, "Bar_Count": 1},
                {"Ticker": "S2", "Stage": "Bull" if last else "Warning", "Price": 5, "EMA200": 4, "ADTV(MB)": 9, "Bar_Count": 1},
                {"Ticker": "AAA", "Stage": "S.Bull", "Price": 10, "EMA200": 8, "ADTV(MB)": 5, "Bar_Count": 12},
                {"Ticker": "FND", "Stage": "Accumulation" if last else "Bear", "Price": 1.5, "EMA200": 2, "ADTV(MB)": 0, "Bar_Count": 1},
            ])
        write_json(os.path.join(scans, "sepa_diff.json"),
                   {"previousDate": self.prev, "currentDate": self.day, "newTickers": ["EEE"], "droppedTickers": []})


class TestNewSections(unittest.TestCase):
    def test_growth_sepa_stage(self):
        with tempfile.TemporaryDirectory() as root:
            fx = Fixture(root)
            rep = m.build(root)
            self.assertEqual(rep["warnings"], [])
            g = {r["ticker"]: r for r in rep["growth"]["rows"]}
            self.assertEqual(g["AAA"]["status"], "stay")
            self.assertEqual(g["AAA"]["streak_days"], len(fx.days))
            self.assertEqual(g["BBB"]["status"], "reentry")
            self.assertEqual(g["BBB"]["last_seen"], fx.days[-3])
            self.assertEqual(g["BBB"]["streak_days"], 1)
            self.assertEqual(g["BBB"]["days_web"], 3)  # ไม้ตามเว็บ: นับวันที่หลุดรวมด้วย
            self.assertEqual([d["ticker"] for d in rep["growth"]["dropped"]], ["CCC"])
            self.assertEqual([(d["ticker"], d["last_seen"]) for d in rep["growth"]["dropped_earlier"]], [("DDD", fx.days[-3])])
            self.assertEqual(g["AAA"]["vs_ema10_pct"], round((10 / 9.5 - 1) * 100, 2))

            s = rep["sepa"]
            self.assertEqual(s["web_diff"]["new"], 1)
            self.assertEqual({r["Ticker"]: r["status"] for r in s["rows"]}, {"AAA": "stay", "EEE": "new"})
            self.assertEqual(len(s["prev_rows"]), 1)

            ms = rep["market_stage"]
            self.assertEqual(ms["total_stock"], 3)
            self.assertEqual(ms["total_fund"], 1)
            self.assertEqual(ms["counts"]["fund"]["Accumulation"], 1)
            self.assertEqual(ms["transitions_total"], 3)
            self.assertEqual(len(ms["focus"]) + sum(x["count"] for x in ms["summary"]), ms["transitions_total"])
            fnd = [x for x in ms["focus"] if x["ticker"] == "FND"][0]
            self.assertTrue(fnd["is_fund"])
            self.assertFalse(any(r["ticker"] == "FND" for v in ms["lists"].values() for r in v["rows"]))
            self.assertEqual(ms["summary"], [{"from": "Warning", "to": "Bull", "count": 1, "examples": ["S2"]}])
            self.assertEqual({x["ticker"]: x["flips_5d"] for x in ms["focus"]}, {"S1": 1, "FND": 1})
            for x in ms["focus"]:  # ธง น่าดู ต้องยังเป็น bool · บรรทัดจับตาอยู่ที่ notes
                self.assertIsInstance(x["watch"], bool)
                self.assertTrue(x["notes"])

    def test_missing_sepa_file_other_sections_ok(self):
        with tempfile.TemporaryDirectory() as root:
            fx = Fixture(root)
            os.remove(os.path.join(root, "data", "history", fx.day, "sepa.json"))
            rep = m.build(root)
            self.assertIsNone(rep["sepa"])
            self.assertTrue(any(w.startswith("sepa") for w in rep["warnings"]))
            for k in ("market", "calendar", "daytrade", "growth", "market_stage"):
                self.assertIsNotNone(rep[k], k)

    def test_corrupt_market_stage(self):
        with tempfile.TemporaryDirectory() as root:
            fx = Fixture(root)
            with open(os.path.join(root, "data", "history", fx.day, "market_stage.json"), "w") as f:
                f.write("{not json")
            rep = m.build(root)
            self.assertIsNone(rep["market_stage"])
            self.assertTrue(any(w.startswith("market_stage") for w in rep["warnings"]))
            self.assertIsNotNone(rep["growth"])
            self.assertIsNotNone(rep["daytrade"])

    def test_main_always_writes_and_exits_0(self):
        with tempfile.TemporaryDirectory() as root:
            fx = Fixture(root)
            os.remove(os.path.join(root, "data", "scans", "breadth.json"))
            out = os.path.join(root, "out.json")
            self.assertEqual(m.main(["--root", root, "--out", out]), 0)
            with open(out, encoding="utf-8") as f:
                rep = json.load(f)
            self.assertTrue(rep["warnings"])
            self.assertIsNotNone(rep["date"])
            self.assertEqual(fx.day, rep["date"])


class TestStageOrderAndTotals(unittest.TestCase):
    def test_list_order_bar_count_desc_stable_and_extra_total(self):
        with tempfile.TemporaryDirectory() as root:
            fx = Fixture(root)
            rows = [
                {"Ticker": "P1", "Stage": "Bull", "Price": 5, "EMA200": 4, "ADTV(MB)": 1, "Bar_Count": 3},
                {"Ticker": "P2", "Stage": "Bull", "Price": 5, "EMA200": 4, "ADTV(MB)": 1, "Bar_Count": 9},
                {"Ticker": "P3", "Stage": "Bull", "Price": 5, "EMA200": 4, "ADTV(MB)": 1, "Bar_Count": 3},
                {"Ticker": "P0", "Stage": "Bull", "Price": 5, "EMA200": 4, "ADTV(MB)": 1, "Bar_Count": 3},
                {"Ticker": "NEW1", "Stage": "IPO", "Price": 5, "EMA200": None, "ADTV(MB)": 1, "Bar_Count": 2},
                {"Ticker": "WRN", "Stage": "Warning", "Price": 5, "EMA200": 4, "ADTV(MB)": 1, "Bar_Count": 4},
            ]
            path = os.path.join(root, "data", "history", fx.day, "market_stage.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(rows, f)
            ms = m.build(root)["market_stage"]
            # วันใน stage มาก → น้อย · เสมอกันคงลำดับไฟล์ (P1, P3, P0)
            self.assertEqual([r["ticker"] for r in ms["lists"]["Bull"]["rows"]], ["P2", "P1", "P3", "P0"])
            grouped = {s for g in ms["groups"] for s in g["stages"]}
            card_sum = sum(ms["counts"]["stock"].get(s, 0) for s in grouped)
            extra = sum(v for k, v in ms["counts"]["stock"].items() if k not in grouped)
            self.assertEqual(extra, 1)  # IPO
            self.assertEqual(card_sum + extra, ms["total_stock"])


def dt_row(t, status="stay", rv="lo", rel=0.5, trig=10.5, stop=9.5, stale=False, close=10.0, last_seen=None):
    return {"ticker": t, "status": status, "rv_tier": rv, "rel_vol": rel, "trigger": trig, "stop": stop,
            "price_stale": stale, "close": close, "min_vol_1030": 1_500_000, "last_seen": last_seen}


class TestNotesDaytrade(unittest.TestCase):
    def section(self, rows, dropped=(), prev=None):
        c = {"total": len(rows), "prev_total": prev, "rv_lo": sum(r["rv_tier"] == "lo" for r in rows)}
        return {"rows": rows, "dropped": list(dropped), "counts": c}

    def test_headline_shrink_top_relvol(self):
        dt = self.section([dt_row("AAA", rv="hi", rel=2.1), dt_row("BBB"), dt_row("CCC")], prev=5)
        m.notes_daytrade(dt)
        self.assertEqual(dt["headline"], "สแกนหดเหลือ 3 ตัว (จาก 5) — AAA วอลุ่มมาแรงสุด 2.10 เท่า · อีก 2 ตัววอลุ่มยังไม่มา")

    def test_headline_grow_and_empty(self):
        dt = self.section([dt_row("AAA", rv="mid", rel=1.2)], prev=0)
        m.notes_daytrade(dt)
        self.assertTrue(dt["headline"].startswith("สแกนเพิ่มเป็น 1 ตัว (จาก 0)"))
        empty = self.section([], prev=3)
        m.notes_daytrade(empty)
        self.assertEqual(empty["headline"], "สแกนหดเหลือ 0 ตัว (จาก 3) — วันนี้ไม่มีหุ้นผ่านเกณฑ์ Daytrade")
        all_lo = self.section([dt_row("A", rel=0.9), dt_row("B"), dt_row("C")], prev=3)
        m.notes_daytrade(all_lo)
        self.assertTrue(all_lo["headline"].endswith("· ทุกตัววอลุ่มยังไม่มา"))

    def test_watch_lines(self):
        self.assertEqual(m.watch_daytrade(dt_row("A", rv="hi")),
                         ["ผ่าน 10.50 + ถึง 10:30 วอลุ่ม ≥ 1.50 ล้านหุ้น → ลุ้นต่อ · หลุด 9.50 = จบรอบ", "วอลุ่มมาจริง"])
        self.assertEqual(m.watch_daytrade(dt_row("A", rv="mid"))[1], "วอลุ่มเกือบมา")
        self.assertEqual(m.watch_daytrade(dt_row("A", rv="lo"))[1], "วอลุ่มยังไม่มา อย่าไล่")
        self.assertTrue(m.watch_daytrade(dt_row("A", trig=None))[0].startswith("ทำ High ใหม่เหนือ 10.00"))
        self.assertEqual(m.watch_daytrade(dt_row("A", stale=True)), ["⚠️ ราคาค้าง — ไม่มีจุดซื้อ/ทิ้งของวันนี้"])

    def test_change_notes_and_drop_reason(self):
        rows = [dt_row("RE", status="reentry", last_seen="2026-11-17")]
        drops = [{"ticker": "D1", "days_before_drop": 1, "check": {"criteria": {"chg_gt_0": "fail", "rsi7_gt_50": "unknown"}}},
                 {"ticker": "D2", "days_before_drop": 4, "check": {"criteria": {"chg_gt_0": "pass"}}}]
        dt = self.section(rows, drops, prev=2)
        m.notes_daytrade(dt)
        n = dt["change_notes"]
        self.assertEqual(n["reentry"], "RE ล่าสุดอยู่ในสแกน 17 พ.ย.")
        self.assertIsNone(n["new"])
        self.assertEqual(n["dropped_items"]["D1"], "หลุดเพราะราคาวันนี้ไม่บวก · อยู่รอบนี้แค่วันเดียว")
        self.assertEqual(n["dropped_items"]["D2"], "อยู่มา 4 วัน")

    def test_no_drops_no_new(self):
        dt = self.section([dt_row("S")], prev=1)
        m.notes_daytrade(dt)
        self.assertEqual(dt["change_notes"]["dropped"], None)
        self.assertEqual(dt["change_notes"]["new"], None)
        self.assertEqual(dt["headline"], "สแกนทรงตัวที่ 1 ตัว — S วอลุ่มมากสุดแต่ยังไม่ถึงค่าเฉลี่ย 0.50 เท่า")


def gr_row(t, status="stay", chg=1.0, ema=2.0, hi=-10.0, val=50.0, last_seen=None, stale=False):
    return {"ticker": t, "status": status, "chg_pct": chg, "vs_ema10_pct": ema, "pct_from_52w_high": hi,
            "high_52w": 12.0, "value_mb_1d": val, "last_seen": last_seen, "price_stale": stale}


class TestNotesGrowth(unittest.TestCase):
    def test_headline_all_parts(self):
        g = {"rows": [gr_row("UP", chg=3.0), gr_row("RE", status="reentry", hi=-1.0, last_seen="2026-11-19")],
             "dropped": [{"ticker": "OUT", "days_before_drop": 2}], "counts": {"total": 2, "prev_total": 2}}
        m.notes_growth(g)
        self.assertEqual(g["headline"], "สแกนทรงตัวที่ 2 ตัว — RE เข้ามา · OUT หลุดไป · UP บวกแรงสุด +3.00% · RE ใกล้ High สุด (ห่าง 1.0%)")

    def test_headline_no_in_no_out_no_up(self):
        g = {"rows": [gr_row("A", chg=-1.0)], "dropped": [], "counts": {"total": 1, "prev_total": 1}}
        m.notes_growth(g)
        self.assertEqual(g["headline"], "สแกนทรงตัวที่ 1 ตัว — วันนี้ไม่มีตัวไหนบวก · A ใกล้ High สุด (ห่าง 10.0%)")

    def test_watch_priority_and_cap(self):
        self.assertEqual(m.watch_growth(gr_row("A", ema=0.4)), ["เกาะ EMA10 บาง (+0.40%) — หลุดเส้นคือสัญญาณเปลี่ยน"])
        self.assertEqual(m.watch_growth(gr_row("A", hi=-2.0))[0], "ใกล้ High รอบปี 12.00 อีก 2.0% — จับตาเบรค")
        self.assertEqual(m.watch_growth(gr_row("A", status="reentry", last_seen="2026-11-18"))[0], "เพิ่งกลับเข้ามา (ล่าสุดในสแกน 18 พ.ย.)")
        self.assertEqual(m.watch_growth(gr_row("A", val=3.0))[0], "สภาพคล่องบาง (มูลค่าวันนี้ 3.0 ลบ.)")
        many = m.watch_growth(gr_row("A", ema=0.2, hi=-1.0, val=1.0, status="reentry", last_seen="2026-11-18"))
        self.assertEqual(len(many), 2)
        self.assertTrue(m.watch_growth(gr_row("A", ema=-0.5))[0].startswith("ราคาต่ำกว่า EMA10"))
        self.assertEqual(m.watch_growth(gr_row("A")), ["เหนือ EMA10 +2.00% · ห่าง High รอบปี 10.0% — แนวโน้มยังปกติ"])
        self.assertEqual(m.watch_growth(gr_row("A", stale=True))[0], "⚠️ ราคาค้าง")


class TestNotesStage(unittest.TestCase):
    def section(self, now, prev):
        groups = [{"key": "base", "stages": ["Accumulation", "Recovery"]}, {"key": "strong", "stages": ["Bull", "S.Bull"]},
                  {"key": "weak", "stages": ["Warning", "Distribution"]}, {"key": "bear", "stages": ["Bear"]}]
        return {"counts": {"stock": now}, "counts_prev": {"stock": prev} if prev else None, "groups": groups,
                "total_stock": sum(now.values()), "transitions_total": 4, "focus": []}

    def test_headline_bear_dominant_and_delta(self):
        ms = self.section({"Accumulation": 3, "Recovery": 2, "Bull": 1, "Bear": 14}, {"Accumulation": 2, "Recovery": 1, "Bear": 17})
        m.notes_stage(ms)
        self.assertEqual(ms["headline"], "กลุ่มสะสม/ฟื้นตัว 5 ตัว (+2 จากวันก่อน) — ขาลงยังครอง 70.0% ของหุ้นสามัญ · ย้าย stage วันนี้ 4 ตัว")

    def test_headline_other_dominant_no_prev(self):
        ms = self.section({"Accumulation": 1, "Bull": 6, "Bear": 3}, None)
        m.notes_stage(ms)
        self.assertEqual(ms["headline"], "กลุ่มสะสม/ฟื้นตัว 1 ตัว — กลุ่มแข็งแรง (Bull/S.Bull) มากสุด 60.0% ของหุ้นสามัญ · ย้าย stage วันนี้ 4 ตัว")

    def test_watch(self):
        self.assertEqual(m.watch_stage({"vs_ema200_pct": 2.0, "flips_5d": 0}), ["ยืนเหนือ EMA200 แล้ว"])
        self.assertEqual(m.watch_stage({"vs_ema200_pct": -2.0, "ema200": 4.5, "flips_5d": 1}), ["ยังใต้ EMA200 (4.50) — รอยืนให้ได้ก่อน"])
        self.assertEqual(m.watch_stage({"vs_ema200_pct": 1.0, "flips_5d": 3}), ["เหวี่ยง 3 รอบใน 5 วัน — ยังไม่นิ่ง", "ยืนเหนือ EMA200 แล้ว"])
        self.assertEqual(m.watch_stage({"price_stale": True, "vs_ema200_pct": 1.0, "flips_5d": 4})[0], "⚠️ ราคาค้าง")


class TestNotesBrokenSection(unittest.TestCase):
    def test_notes_failure_keeps_numbers(self):
        with tempfile.TemporaryDirectory() as root:
            Fixture(root)
            orig = m.notes_growth
            m.notes_growth = lambda g: (_ for _ in ()).throw(RuntimeError("boom"))
            try:
                rep = m.build(root)
            finally:
                m.notes_growth = orig
            self.assertIsNotNone(rep["growth"])
            self.assertNotIn("headline", rep["growth"])
            self.assertTrue(any(w.startswith("growth notes") for w in rep["warnings"]))
            self.assertIn("headline", rep["daytrade"])
            self.assertIn("headline", rep["market_stage"])


if __name__ == "__main__":
    unittest.main()
