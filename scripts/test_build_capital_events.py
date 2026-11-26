"""
pytest for build_capital_events.py (no network). Fixtures = the announcement box of real SET pages (2026-11),
trimmed to the raw-html block: scripts/fixtures/capital_events/.

Usage:
    python -m pytest scripts/test_build_capital_events.py -q
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_capital_events as bce  # noqa: E402

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'capital_events')


def body(name):
    with open(os.path.join(FIX, name), encoding='utf-8') as f:
        text, pdf = bce.extract_body(f.read())
    assert text, name
    return text


def listing(name):
    r, why = bce.parse_listing(body(name))
    assert r is not None, why
    return r


# ── listing template ────────────────────────────────────────────────────────

def test_kgen_pp_two_groups_same_price():
    r = listing('ann_KGEN_108203801.html')
    assert r['ticker'] == 'KGEN'
    assert r['shares'] == {'old': 2225726175, 'new': 200000000, 'total': 2425726175, 'basis': 'actual'}
    assert r['source_type'] == 'PP' and r['price'] == 1.35 and r['prices'] is None
    assert r['date'] == '2026-11-23'
    assert [a['shares'] for a in r['allottees']] == [185185185, 14814815]
    assert r['allottees'][0]['name'].startswith('บริษัท ระยองไวร์')


def test_solar_pp_three_people_numbered_lines():
    r = listing('ann_SOLAR_108241101.html')
    assert r['source_type'] == 'PP' and r['price'] == 0.32 and r['date'] == '2026-11-25'
    assert len(r['allottees']) == 3 and sum(a['shares'] for a in r['allottees']) == 130712000
    assert r['note'] and 'จดทะเบียน' in r['note']


def test_ro_listing_ratio_and_wrapped_company_name():
    r = listing('ann_STPI_108203701.html')
    assert r['source_type'] == 'RO' and r['price'] == 5.55 and r['ratio'] == {'a': 11.0, 'b': 1.0}
    assert r['allottees'] == []
    r = listing('ann_ROH_107347201.html')  # company name wraps to the next line
    assert r['ticker'] == 'ROH' and r['source_type'] == 'RO' and r['shares']['new'] == 280000000


def test_warrant_and_convertible_sources():
    r = listing('ann_IROYAL_108017201.html')
    assert r['source_type'] == 'W' and r['price'] == 2.92 and r['shares']['new'] == 58033232
    r = listing('ann_AJA_108287801.html')
    assert r['source_type'] == 'CB' and r['price'] == 0.099 and r['date'] == '2026-11-27'


def test_all_listing_fixtures_parse():
    for n in os.listdir(FIX):
        if n.startswith('ann_'):
            listing(n)


def test_listing_check_failures_are_dropped():
    good = body('ann_KGEN_108203801.html')
    r, why = bce.parse_listing(good.replace('2,425,726,175', '2,425,726,176'))
    assert r is None and 'add up' in why
    r, why = bce.parse_listing(good.replace('185,185,185 หุ้น', '185,185,100 หุ้น'))
    assert r is None and 'allottees' in why
    r, why = bce.parse_listing('อะไรก็ไม่รู้\t\t : 1')
    assert r is None


def test_spelling_variant_and_preferred_shares_line():
    text = body('ann_KGEN_108203801.html').replace('จัดสรรรให้', 'จัดสรรให้')
    text = text.replace('- หุ้นสามัญ (หุ้น)                        \t\t\t : 2,225,726,175',
                        '- หุ้นสามัญ (หุ้น)                        \t\t\t : 2,225,726,175\n- หุ้นบุริมสิทธิ (หุ้น)   \t\t\t : 5,000')
    r, why = bce.parse_listing(text)
    assert r is not None, why
    assert r['shares']['old'] == 2225726175


# ── F53-5 ───────────────────────────────────────────────────────────────────

def test_f535_rights_offering_take_up():
    r, why = bce.parse_f535(body('f535_STPI_107434001.html'))
    assert r is not None, why
    assert (r['allotted'], r['sold'], r['take_up_pct']) == (164752035, 27374050, 16.62)
    assert r['price'] == 5.55 and r['report_date'] == '2026-11-09'
    r, _ = bce.parse_f535(body('f535_PROEN_107398901.html'))
    assert r['take_up_pct'] == 38.23


# ── headline classification ─────────────────────────────────────────────────

def test_classify_title():
    c = bce.classify_title
    assert c('หุ้นเพิ่มทุนของ KGEN เริ่มซื้อขายวันที่ 23 พฤศจิกายน 2569')[0] == 'listing'
    assert c('หุ้นเพิ่มทุนของ ROH เริ่มเป็นหลักทรัพย์จดทะเบียนวันที่ 6 พฤศจิกายน 2569')[0] == 'listing'
    assert c('แบบรายงานผลการขายของหุ้นสามัญที่เสนอขายให้แก่ผู้ถือหุ้นสามัญทั้งหมด (F53-5)')[0] == 'ro_result'
    assert c('แบบรายงานผลการขายของ BC-W5 ที่เสนอขายให้แก่ ผู้ถือหุ้นสามัญทั้งหมด (F53-5)')[0] is None
    assert c('แบบรายงานผลการขายของ หุ้นสามัญ ที่เสนอขายให้แก่ บุคคลในวงจำกัด (F53-5)')[0] is None
    k, tags = c('การลดทุนจดทะเบียน,การเพิ่มทุนจดทะเบียน, การออกและเสนอขายหุ้นเพิ่มทุนให้แก่ผู้ถือหุ้นเดิมตามสัดส่วนการถือหุ้น (Right Offering) และกำหนดวันประชุมวิสามัญผู้ถือหุ้น')
    assert k == 'board' and tags == ['RO']
    k, tags = c('แจ้งมติกรรมการเกี่ยวกับการเสนอขายหุ้นสามัญเพิ่มทุน (PPO) และการเรียกประชุม EGM 1/2569')
    assert k == 'board' and tags == ['RO']
    # schedule / amendment without a resolution: covered by the XR row, not kept as board
    assert c('แจ้งการแก้ไขอัตราส่วนการจัดสรรหุ้นสามัญเพิ่มทุนให้แก่ผู้ถือหุ้นเดิมตามสัดส่วนการถือหุ้น (PPO)')[0] is None
    k, tags = c('การจัดสรรหุ้นเพิ่มทุนแบบ General Mandate')
    assert k == 'board' and tags == ['PP']
    # not counted
    assert c('แจ้งการเพิ่มทุนจดทะเบียนบริษัทย่อย (แก้ไข)')[0] is None
    assert c('แจ้งเปลี่ยนแปลงวัตถุประสงค์การใช้เงินที่ได้รับจากการเสนอขายหุ้นสามัญเพิ่มทุนให้แก่ประชาชนเป็นครั้งแรก (IPO)')[0] is None
    assert c('รายงานการใชเงินเพิ่มทุนสิ้นสุด ณ วันที่ 30 มิถุนายน 2569')[0] is None
    assert c('การเผยแพร่เอกสารการจองซื้อหน่วยทรัสต์เพิ่มเติมสำหรับการเพิ่มทุนครั้งที่ 5')[0] is None
    assert c('แจ้งการจดทะเบียนเพิ่มทุนจดทะเบียน ต่อกรมพัฒนาธุรกิจการค้า กระทรวงพาณิชย์')[0] is None
    assert c('แจ้งมติที่ประชุมคณะกรรมการบริษัทฯ ครั้งที่ 5/2569 การเพิ่มทุนจดทะเบียนบริษัท ไทยคาร์บอน แอนด์ ไบโอชาร์ จำกัด')[0] is None
    assert c('หุ้นเพิ่มทุนของ X เริ่มซื้อขายวันที่ 1 ธันวาคม 2569', is_fund=True)[0] is None


# ── Settrade XR / XW ────────────────────────────────────────────────────────

def ca(sym, kind, xd, ratio, price, allot):
    return {'symbol': sym, 'caType': kind, 'xdate': f'{xd}T00:00:00+07:00', 'recordDate': None, 'ratio': ratio, 'price': price,
            'allotShare': allot, 'beginSubscription': '2026-12-18T00:00:00+07:00', 'endSubscription': '2026-12-24T00:00:00+07:00',
            'rightsFor': 'หุ้นสามัญ'}


def test_xr_old_shares_and_ro_with_warrant_link():
    days = [{'date': '2026-11-26', 'types': [{'type': 'XR', 'corporateActions': [ca('SOLAR', 'XR', '2026-11-26', '5.500003 : 1', 0.32, 261424000)]}]},
            {'date': '2026-11-27', 'types': [{'type': 'XR', 'corporateActions': [ca('B52', 'XR', '2026-11-27', '2 : 3', 0.15, 1509420294)]}]},
            {'date': '2026-11-24', 'types': [{'type': 'XR', 'corporateActions': [ca('META', 'XR', '2026-11-24', '1 : 33', 0.1127, 2440800120)]},
                                             {'type': 'XW', 'corporateActions': [ca('META', 'XW', '2026-11-24', '33 : 10', None, 739636400)]}]},
            {'date': '2027-03-01', 'types': [{'type': 'XR', 'corporateActions': [ca('LATE', 'XR', '2027-03-01', '1 : 1', 1, 1)]}]}]
    ev = bce.xr_xw_events(days, date(2026, 11, 16), date(2027, 1, 25))
    by = {e['id']: e for e in ev}
    assert 'XR:LATE:2027-03-01' not in by
    assert abs(by['XR:SOLAR:2026-11-26']['shares']['old'] - 1437832744) < 100
    assert by['XR:B52:2026-11-27']['shares']['old'] == 1006280196
    assert by['XR:META:2026-11-24']['linked'] == ['XW:META:2026-11-24']
    assert by['XW:META:2026-11-24']['linked'] == ['XR:META:2026-11-24']
    assert by['XR:SOLAR:2026-11-26']['linked'] is None


def test_link_ro_results_to_listing():
    stpi = listing('ann_STPI_108203701.html')
    roh = listing('ann_ROH_107347201.html')
    res, _ = bce.parse_f535(body('f535_STPI_107434001.html'))
    events = [{'kind': 'listing', 'ticker': 'STPI', **{k: v for k, v in stpi.items() if k != 'ticker'}},
              {'kind': 'listing', 'ticker': 'ROH', **{k: v for k, v in roh.items() if k != 'ticker'}},
              {'kind': 'ro_result', 'ticker': 'STPI', 'date': res['report_date'], 'news_id': '107434001', **res}]
    bce.link_ro_results(events)
    assert events[0]['result']['take_up_pct'] == 16.62 and events[0]['result']['news_id'] == '107434001'
    assert events[1]['result']['take_up_pct'] == 100.0 and events[1]['result']['from'] == 'listing÷ratio'
