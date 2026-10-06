"""
pytest for build_news_flags.py pure functions (no network, no files).

Usage:
    python -m pytest scripts/test_build_news_flags.py -q
"""

import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_news_flags import classify, earnings_flags, merge_flags, news_flags, news_tickers, xd_flags  # noqa: E402

TODAY = date(2026, 10, 6)
BKK = timezone(timedelta(hours=7))
UNIVERSE = {'ANAN', 'CIMBT', 'GLAND', 'LRH', 'PROS', 'PROSPECT', 'GAC03', 'AAA', 'BBB'}


def news(title, hint=None, days_ago=1, link=None):
    ts = int(datetime(TODAY.year, TODAY.month, TODAY.day, 9, tzinfo=BKK).timestamp() * 1000) - days_ago * 86400000
    it = {'title': title, 'link': link or f'https://x/{abs(hash((title, hint, days_ago)))}', 'ts': ts, 'source': 'SET (ตลาดหลักทรัพย์)'}
    if hint is not None:
        it['tickerHint'] = hint
    return it


# ── classify ────────────────────────────────────────────────────────────────

def test_mark_on_and_off():
    assert classify('ตลาดหลักทรัพย์ขึ้นเครื่องหมาย SP หลักทรัพย์ของ TAPAC กรณีไม่ส่งงบการเงินสิ้นสุดวันที่ 31 ก.ค. 2569') == ('mark', {'SP': True})
    assert classify('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย CC ของหลักทรัพย์  ECF') == ('mark', {'CC': True})
    assert classify('ตลาดหลักทรัพย์ฯ แจ้งดำเนินการกับ ECF กรณีส่วนของผู้ถือหุ้นมีค่าน้อยกว่าศูนย์ และขึ้น SP กรณีผู้สอบบัญชีไม่แสดงความเห็นต่องบการเงินปี 68') == ('mark', {'SP': True})
    assert classify('ตลาดหลักทรัพย์ปลดเครื่องหมาย H หลักทรัพย์ของ GAC03') == ('mark', {'H': False})
    assert classify('ตลาดหลักทรัพย์ฯ ขึ้น SP, CS หลักทรัพย์ของ INGRS กรณีผู้สอบบัญชีไม่แสดงความเห็นต่องบการเงินประจำปี 2569') == ('mark', {'SP': True, 'CS': True})
    assert classify('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย SP และปลดเครื่องหมาย CC หลักทรัพย์ GRAND กรณีมีกรรมการตรวจสอบไม่ครบถ้วนตามข้อกำหนด') == ('mark', {'SP': True, 'CC': False})
    assert classify('ตลาดหลักทรัพย์ฯ ขึ้น SP และเพิ่มเหตุ CB,CS หลักทรัพย์ MVP') == ('mark', {'SP': True, 'CB': True, 'CS': True})
    assert classify('ตลาดหลักทรัพย์ฯ เพิ่มเหตุเครื่องหมาย CB หลักทรัพย์ EMPIRE กรณีบริษัทผิดนัดชำระหนี้') == ('mark', {'CB': True})
    assert classify('หยุดพักการซื้อขายหลักทรัพย์ AAA ชั่วคราว') == ('mark', {'H': True})


def test_buyback_and_the_anan_exception():
    assert classify('แจ้งมติคณะกรรมการบริษัทเรื่องโครงการซื้อหุ้นคืนเพื่อการบริหารทางการเงิน')[0] == 'buyback'
    assert classify('รายงานผลการซื้อหุ้นคืน (Treasury Stock)')[0] == 'buyback'
    assert classify('การซื้อหุ้นคืนจากบริษัทร่วมทุน')[0] is None  # ANAN
    assert classify('การซื้อหุ้นคืนจากบริษัทร่วมทุนและการจำหน่ายหุ้นที่ซื้อคืนให้กับนักลงทุนรายใหม่')[0] is None
    assert classify('ซื้อหุ้นคืนจากผู้ถือหุ้นรายใหญ่')[0] is None


def test_capital_and_its_exceptions():
    assert classify('แจ้งมติคณะกรรมการ เรื่องการเพิ่มทุนจดทะเบียน และการจัดสรรหุ้นเพิ่มทุนแบบ PP')[0] == 'capital'
    assert classify('แจ้งกำหนดการจองซื้อหุ้นเพิ่มทุน (RO)')[0] == 'capital'
    assert classify('การออกใบสำคัญแสดงสิทธิที่จะซื้อหุ้นสามัญ (AAA-W3)')[0] == 'capital'
    assert classify('แบบรายงานผลการใช้สิทธิของใบสำคัญแสดงสิทธิ AAA-W2')[0] is None
    assert classify('กำหนดการใช้สิทธิครั้งที่ 4 ของใบสำคัญแสดงสิทธิ AAA-W2')[0] is None
    # PROS: cancelled RO → skipped
    assert classify('แจ้งยกเลิก EGM ครั้งที่ 1/2569 วันที่ 25 ส.ค. 2569 และยกเลิก Record Date สำหรับ EGM, Record Date สำหรับ Right Offering และกำหนดวันจองซื้อและชำระเงินค่าหุ้นเพิ่มทุนตามกำหนด')[0] is None
    # no false RO / PP inside words
    assert classify('PROSPECT แจ้งกำหนดการจ่ายประโยชน์ตอบแทน')[0] is None
    assert classify('APPLE ประกาศข้อมูล')[0] is None


def test_investing_in_another_companys_new_shares_is_not_capital():
    for t in ['แจ้งมติคณะกรรมการบริษัทครั้งที่ 5/2569 เรื่อง อนุมัติการเข้าลงทุนในหุ้นสามัญเพิ่มทุนของบริษัท จตุเจริญภัทร จำกัด',
              'แจ้งมติเรื่องการเข้าลงทุนในหุ้นสามัญเพิ่มทุนของบริษัท ไอแคร์ ประกันภัย จำกัด (มหาชน)',
              'แจ้งการสละสิทธิการจองซื้อหุ้นสามัญเพิ่มทุนของบริษัทย่อย และการจัดประชุมวิสามัญผู้ถือหุ้นของบริษัทครั้งที่ 1/2569',
              'แจ้งมติอนุมัติการซื้อหุ้นเพิ่มทุน บมจ.อี-คอมเมอร์ซ ดิจิทัล เอไอ ไทย โฮลดิ้ง ซึ่งเข้าข่ายเป็นรายการที่เกี่ยวโยงกัน']:
        assert classify(t)[0] is None, t
    # own raise in the same headline still counts
    assert classify('แจ้งมติที่ประชุมคณะกรรมการบริษัท การลดทุน การเพิ่มทุน การจัดสรรหุ้นเพิ่มทุนแบบ PP การทำรายการเข้าลงทุนในหุ้นสามัญ')[0] == 'capital'
    assert classify('หุ้นเพิ่มทุนของ MMM เริ่มซื้อขายวันที่ 14 กันยายน 2569')[0] == 'capital'


def test_delisting_with_cash_balance_is_not_capital_or_buyback():
    t = 'ตลาดหลักทรัพย์ฯ เพิกถอนหลักทรัพย์ของ CIMBT GLAND และ LRH จากการเป็นหลักทรัพย์จดทะเบียน และจะเปิดให้ซื้อขายหลักทรัพย์ชั่วคราวระหว่างวันที่ 3 - 11 กันยายน 2569 โดยให้ซื้อด้วย Cash Balance'
    assert classify(t)[0] not in ('capital', 'buyback')


def test_mgmt():
    assert classify('แจ้งการลาออกของประธานเจ้าหน้าที่บริหาร (CEO)')[0] == 'mgmt'
    assert classify('แต่งตั้งกรรมการผู้จัดการคนใหม่')[0] == 'mgmt'
    assert classify('แจ้งกรรมการ/ผู้บริหาร เปลี่ยนชื่อ')[0] is None
    assert classify('แจ้งการแต่งตั้งรักษาการรองกรรมการผู้จัดการใหญ่อาวุโส สายงานปฏิบัติการ')[0] is None
    assert classify('แต่งตั้งรองกรรมการผู้จัดการ และแต่งตั้ง CFO')[0] == 'mgmt'


def test_skipped_categories():
    for t in ['SEC News : สรุปแบบ 59 ประจำวันที่ 30 กันยายน 2569',
              'ขอเชิญผู้ถือหุ้นเสนอระเบียบวาระการประชุมและรายชื่อบุคคลเพื่อรับคัดเลือกเป็นกรรมการบริษัทสำหรับการประชุมสามัญผู้ถือหุ้น ประจำปี 2570',
              'แจ้งการจัดตั้งบริษัทย่อย',
              'งบการเงิน ไตรมาสที่ 2/2569 (สอบทานแล้ว)']:
        assert classify(t) == (None, None), t


# ── tickers ─────────────────────────────────────────────────────────────────

def test_ticker_from_hint_or_title():
    assert news_tickers({'title': 'x', 'tickerHint': 'ANAN'}, UNIVERSE) == ['ANAN']
    # GAC03: announced in the SET's name, no hint → read from the title
    assert news_tickers({'title': 'ตลาดหลักทรัพย์ขึ้นเครื่องหมาย H หลักทรัพย์ของ GAC03'}, UNIVERSE) == ['GAC03']
    assert news_tickers({'title': 'ตลาดหลักทรัพย์ฯ เพิกถอน CIMBT GLAND และ LRH', 'tickerHint': 'SET'}, UNIVERSE) == ['CIMBT', 'GLAND', 'LRH']
    assert news_tickers({'title': 'ตลาดหลักทรัพย์ขึ้น H หลักทรัพย์ของ ZZZ'}, UNIVERSE) == []  # not in sector_map


# ── per-ticker flags ────────────────────────────────────────────────────────

def test_mark_keeps_latest_state():
    items = [news('ตลาดหลักทรัพย์ขึ้นเครื่องหมาย H หลักทรัพย์ของ GAC03', days_ago=3),
             news('ตลาดหลักทรัพย์ปลดเครื่องหมาย H หลักทรัพย์ของ GAC03', days_ago=2),
             news('ตลาดหลักทรัพย์ขึ้นเครื่องหมาย SP หลักทรัพย์ของ AAA', hint='AAA', days_ago=5),
             news('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย CC ของหลักทรัพย์ AAA', hint='AAA', days_ago=4),
             news('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย CB ของหลักทรัพย์ BBB', hint='BBB', days_ago=4),
             news('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย SP และปลดเครื่องหมาย CB หลักทรัพย์ BBB', hint='BBB', days_ago=1)]
    out = news_flags(items, UNIVERSE, TODAY)
    assert 'GAC03' not in out  # H lifted
    assert out['BBB'][0]['label'] == 'เครื่องหมาย SP'  # CB lifted in the same headline
    assert out['AAA'][0]['type'] == 'mark' and out['AAA'][0]['severity'] == 'red'
    assert out['AAA'][0]['label'] == 'เครื่องหมาย SP, CC'


def test_mark_reads_the_whole_history():
    # put on 60 days ago, never lifted → still flagged
    on = news('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย CC ของหลักทรัพย์ AAA', hint='AAA', days_ago=60)
    out = news_flags([on], UNIVERSE, TODAY)
    assert out['AAA'][0]['label'] == 'เครื่องหมาย CC' and out['AAA'][0]['date'] == (TODAY - timedelta(days=60)).isoformat()
    # put on 90 days ago and lifted 40 days ago → no flag
    items = [news('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย SP หลักทรัพย์ BBB', hint='BBB', days_ago=90),
             news('ตลาดหลักทรัพย์ฯ ปลดเครื่องหมาย SP หลักทรัพย์ BBB', hint='BBB', days_ago=40)]
    assert 'BBB' not in news_flags(items, UNIVERSE, TODAY)
    # other categories keep their windows even when old items are passed in
    assert 'AAA' not in news_flags([news('แจ้งมติเพิ่มทุน RO', hint='AAA', days_ago=60)], UNIVERSE, TODAY)


def test_delisting_clears_marks():
    items = [news('ตลท. ขึ้น SP "BANPU" และ "BPP" วันที่ 17 ก.ค. - 3 ส.ค. 2569 เพื่อดำเนินการตามขั้นตอนควบบริษัท', hint='BBB', days_ago=80),
             news('ตลาดหลักทรัพย์ฯ เพิกถอน BANPUU และ BPP จากการเป็นหลักทรัพย์จดทะเบียน', hint='BBB', days_ago=67),
             news('ตลาดหลักทรัพย์ฯ ขึ้นเครื่องหมาย SP หลักทรัพย์ AAA', hint='AAA', days_ago=30),
             news('ตลาดหลักทรัพย์ฯ ประกาศเพิ่มเหตุเข้าข่ายอาจถูกเพิกถอนหลักทรัพย์ AAA กรณีส่วนของผู้ถือหุ้นมีค่าน้อยกว่าศูนย์', hint='AAA', days_ago=10)]
    out = news_flags(items, UNIVERSE, TODAY)
    assert 'BBB' not in out
    # delisting headline without a hint, ticker outside sector_map but known from its own earlier hint
    aks = [news('ตลาดหลักทรัพย์ฯ ขึ้น SP หลักทรัพย์ของ ZZZ ซึ่งอาจเข้าข่ายอาจถูกเพิกถอน', hint='ZZZ', days_ago=90),
           news('ตลาดหลักทรัพย์ฯ เพิกถอนหลักทรัพย์ของ ZZZ จากการเป็นหลักทรัพย์จดทะเบียน และจะเปิดให้ซื้อขายหลักทรัพย์ชั่วคราว', days_ago=5)]
    assert 'ZZZ' not in news_flags(aks, UNIVERSE, TODAY)
    assert out['AAA'][0]['label'] == 'เครื่องหมาย SP'  # "อาจถูกเพิกถอน" does not clear


def test_windows_and_dedupe():
    items = [news('รายงานผลการซื้อหุ้นคืน', hint='AAA', days_ago=8),
             news('รายงานผลการซื้อหุ้นคืน', hint='BBB', days_ago=2, link='L1'),
             news('รายงานผลการซื้อหุ้นคืน', hint='BBB', days_ago=2, link='L1'),
             news('แจ้งมติเพิ่มทุน RO', hint='BBB', days_ago=29),
             news('แจ้งมติเพิ่มทุน RO', hint='AAA', days_ago=31),
             news('ข่าวจากแหล่งอื่น ซื้อหุ้นคืน', hint='AAA', days_ago=1) | {'source': 'EFIN'}]
    out = news_flags(items, UNIVERSE, TODAY)
    assert 'AAA' not in out  # buyback 8 days old, capital 31 days old, non-SET source ignored
    assert [f['type'] for f in out['BBB']] == ['buyback', 'capital']
    assert out['BBB'][0]['link'] == 'L1'


def test_anan_not_buyback_end_to_end():
    out = news_flags([news('การซื้อหุ้นคืนจากบริษัทร่วมทุน', hint='ANAN', days_ago=1)], UNIVERSE, TODAY)
    assert 'ANAN' not in out


def test_earnings_flags():
    feed = {
        'buckets': {'profit_growth': {'label': 'กำไรโต'}},
        'announcements': [{'ticker': 'AAA', 'announceDate': '2026-10-02T08:00:00+07:00', 'quarter': 'ไตรมาส 3/2569', 'bucket': 'profit_growth', 'f45Url': 'u'},
                          {'ticker': 'OLD', 'announceDate': '2026-09-20T08:00:00+07:00', 'bucket': 'profit_growth'}],
        'calendar': [{'ticker': 'BBB', 'date': '2026-10-15T17:00:00+07:00', 'status': 'predicted'},
                     {'ticker': 'CCC', 'date': '2026-10-25T17:00:00+07:00', 'status': 'predicted'},
                     {'ticker': 'DDD', 'date': '2026-09-01T17:00:00+07:00', 'status': 'predicted'},
                     {'ticker': 'AAA', 'date': '2026-10-08T17:00:00+07:00', 'status': 'predicted'},
                     {'ticker': 'EEE', 'date': '2026-10-04T10:00:00+07:00', 'status': 'confirmed'}],
    }
    out = earnings_flags(feed, TODAY)
    assert out['AAA'] == [{'type': 'earnings_out', 'label': 'งบออกแล้ว · กำไรโต', 'severity': 'green', 'date': '2026-10-02', 'title': 'ส่งงบ ไตรมาส 3/2569', 'link': 'u'}]
    assert out['BBB'][0]['label'] == 'งบออก ~9 วัน' and out['BBB'][0]['severity'] == 'orange'
    assert 'CCC' not in out and 'DDD' not in out and 'OLD' not in out  # 19 days ahead / past prediction / filed 16 days ago
    assert out['EEE'][0]['type'] == 'earnings_out'


def test_xd_flags():
    rows = [{'ticker': 'AAA', 'bucket': 'XD', 'xDate': '2026-10-09', 'detail': 'เงินปันผล 0.20 บาท/หุ้น'},
            {'ticker': 'BBB', 'caType': 'XR', 'xDate': '2026-10-06'},
            {'ticker': 'CCC', 'bucket': 'XD', 'xDate': '2026-10-20'},
            {'ticker': 'DDD', 'bucket': 'XM', 'xDate': '2026-10-07'}]
    out = xd_flags(rows, TODAY)
    assert out['AAA'][0]['label'] == 'XD ใน 3 วัน'
    assert out['BBB'][0]['label'] == 'XR วันนี้'
    assert 'CCC' not in out and 'DDD' not in out


def test_merge_sorts_by_severity_and_has_no_nan():
    import json
    m = merge_flags({'AAA': [{'type': 'mgmt', 'label': 'x', 'severity': 'gray', 'date': '2026-10-01', 'title': 't', 'link': None}]},
                    {'AAA': [{'type': 'mark', 'label': 'y', 'severity': 'red', 'date': '2026-09-01', 'title': 't', 'link': None},
                             {'type': 'mark', 'label': 'dup', 'severity': 'red', 'date': '2026-09-02', 'title': 't', 'link': None}]})
    assert [f['type'] for f in m['AAA']] == ['mark', 'mgmt']
    json.dumps(m, allow_nan=False)
