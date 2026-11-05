"""
pytest: Thai PUA glyph variants (U+F700-U+F71A) in MD&A text -> real Thai characters,
on top of the existing sara-am fix. Page-side twin: lib/earningsThaiText.test.ts.

Usage:
    python -m pytest scripts/test_thai_pua.py -q
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract_reason import THAI_PUA_MAP, clean_text, fix_sara_am, fix_thai_pua, fix_thai_text  # noqa: E402

AM = chr(0x0E33)
NIKHAHIT_AA = chr(0x0E4D) + chr(0x0E32)
P = chr  # P(0xF70B) = the PUA glyph


def test_true_reason_real_case():
    # TRUE Q3/2569, as PyMuPDF returned it: "รายได" + low mai tho, "ล" + low mai tho + "าน", "ป" + left sara ii
    raw = f'โดยรายได{P(0xF70B)}จากการให{P(0xF70B)}บริการเป{P(0xF712)}น 41.6 พันล{P(0xF70B)}านบาท ' \
          f'ข{P(0xF70B)}ามโครงข{P(0xF70A)}าย ป{P(0xF710)}จจัย โทรทัศน{P(0xF70E)} เมื่อเทียบกับป{P(0xF702)}ก{P(0xF70A)}อน'
    assert fix_thai_text(raw) == 'โดยรายได้จากการให้บริการเป็น 41.6 พันล้านบาท ข้ามโครงข่าย ปัจจัย โทรทัศน์ เมื่อเทียบกับปีก่อน'


def test_every_tone_mark_variant():
    for pua, real in [(0xF705, 0x0E48), (0xF70A, 0x0E48), (0xF713, 0x0E48),   # ่
                      (0xF706, 0x0E49), (0xF70B, 0x0E49), (0xF714, 0x0E49),   # ้
                      (0xF707, 0x0E4A), (0xF70C, 0x0E4A), (0xF715, 0x0E4A),   # ๊
                      (0xF708, 0x0E4B), (0xF70D, 0x0E4B), (0xF716, 0x0E4B),   # ๋
                      (0xF709, 0x0E4C), (0xF70E, 0x0E4C), (0xF717, 0x0E4C)]:  # ์
        assert fix_thai_pua('ก' + chr(pua)) == 'ก' + chr(real), hex(pua)


def test_mai_han_akat_upper_and_lower_vowels():
    assert fix_thai_pua(f'ป{P(0xF710)}จจุบัน') == 'ปัจจุบัน'          # ั
    assert fix_thai_pua(f'ม{P(0xF701)}ถุนายน') == 'มิถุนายน'          # ิ
    assert fix_thai_pua(f'ท{P(0xF702)}่') == 'ที่'                     # ี
    assert fix_thai_pua(f'ข{P(0xF703)}้น') == 'ขึ้น'                    # ึ
    assert fix_thai_pua(f'ม{P(0xF704)}อ') == 'มือ'                     # ื
    assert fix_thai_pua(f'ก{P(0xF712)}') == 'ก็'                       # ็
    assert fix_thai_pua(f'ค{P(0xF718)}ณ') == 'คุณ'                     # ุ
    assert fix_thai_pua(f'ส{P(0xF719)}ง') == 'สูง'                     # ู
    assert fix_thai_pua(f'{P(0xF700)}าน') == 'ฐาน'                     # ฐ without descender
    assert fix_thai_pua(f'{P(0xF70F)}ี่ปุ่น') == 'ญี่ปุ่น'               # ญ without descender


def test_table_covers_f700_to_f71a_and_targets_are_thai():
    assert sorted(THAI_PUA_MAP) == list(range(0xF700, 0xF71B))
    assert all(0x0E01 <= v <= 0x0E5B for v in THAI_PUA_MAP.values())


def test_replacement_char_and_other_pua_untouched():
    lost = 'กำไร' + chr(0xFFFD) + 'สุทธิ'
    assert fix_thai_text(lost) == lost                     # real data loss: reported, never guessed
    bullet = 'เป็นผลมาจาก ' + chr(0xF0D8)                   # Symbol-font bullet, not Thai
    assert fix_thai_text(bullet) == bullet


def test_sara_am_still_fixed_together_with_pua():
    assert fix_sara_am(f'รวมจ {AM}นวน ก {AM}ไร') == f'รวมจ{AM}นวน ก{AM}ไร'
    assert fix_thai_text(f'นัยส{NIKHAHIT_AA}คัญ ต{P(0xF70A)}อ') == f'นัยส{AM}คัญ ต่อ'
    assert fix_thai_text(f'ก {AM}ไรเพิ่มข{P(0xF703)}{P(0xF70B)}น') == f'ก{AM}ไรเพิ่มขึ้น'


def test_clean_text_applies_the_pua_fix():
    assert clean_text(f'รายได{P(0xF70B)}\nเพิ่มข{P(0xF703)}{P(0xF70B)}น') == 'รายได้ เพิ่มขึ้น'


def test_correct_text_and_empty_values_untouched():
    ok = 'กำไรสุทธิ 57.63 ล้านบาท เพิ่มขึ้นร้อยละ 20.91'
    assert fix_thai_text(ok) == ok
    assert fix_thai_text('') == ''
    assert fix_thai_text(None) is None


# ── IPA look-alikes after a Thai character (U+0269 -> ิ, U+026D -> ึ) ──

from extract_reason import fix_thai_ipa  # noqa: E402

I, L = chr(0x0269), chr(0x026D)


def test_true_ipa_vowels():
    raw = f'รายได้จากการให้บร{I}การ โทรทัศน์บอกรับสมาช{I}ก เพิ่มข{L}้น 2.1%'
    assert fix_thai_text(raw) == 'รายได้จากการให้บริการ โทรทัศน์บอกรับสมาชิก เพิ่มขึ้น 2.1%'


def test_true_full_raw_pua_plus_ipa():
    raw = f'ให{P(0xF70B)}บร{I}การ เพิ่มข{L}{P(0xF70B)}น'
    assert fix_thai_text(raw) == 'ให้บริการ เพิ่มขึ้น'


def test_english_ipa_untouched():
    for s in (f'the {I} and {L} letters', f'IPA: [{I}] [{L}]', f'A{I}B{L}', f'{I}{L} at the start', f'ไทย {I}'):
        assert fix_thai_ipa(s) == s, s
        assert fix_thai_text(s) == s, s
