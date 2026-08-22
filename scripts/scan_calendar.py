"""
scan_calendar.py  –  "วันไหนที่สแกนตัวนี้ได้ผลออกมาจริง"

ปัญหาที่แก้: data/history/<date>/<scan>.json หายไปได้ 2 แบบที่ความหมายต่างกันคนละขั้ว
  1. ไฟล์ "มี" แต่เป็น []      = scanner รันจบแล้วไม่มีหุ้นเข้าเกณฑ์ → หุ้นหลุดจริง
  2. ไฟล์ "ไม่มี"              = scanner ล่ม/ไม่ได้รัน/pipeline ขาดวันนั้น → ไม่มีข้อมูล

แบบที่ 2 เกิดจาก Missing Guard ใน data_engine/data/results/convert_to_json.py: ถ้า
CSV ของ scan หาย (= scan ล่ม) มันจะ "ไม่เขียน JSON" รอบนั้น แล้ว workflow ที่ copy
`data/results/output/*.json` เข้า snapshot ก็ไม่มีอะไรให้ copy → วันนั้นไม่มีไฟล์
(ตัวอย่างจริง: 2026-07-01 หายเฉพาะ weinstein, 2026-07-07 กับ 2026-07-15 หายทั้ง pipeline)

โค้ดที่นับ "ต่อเนื่อง/หลุด" เดิมอ่านผ่าน load_json() ซึ่งคืน None ตอนไฟล์หาย แล้วถูกยุบ
เป็น set() ว่างเท่ากับกรณี [] → วันที่ pipeline ขาดเลยถูกอ่านว่า "หุ้นหลุดหมดทั้งลิสต์"
ทำให้ NEW badge / DAYS / total_picks เพี้ยนทุกครั้งที่ pipeline ขาดสักวัน

กติกาเดียวของไฟล์นี้: **มีไฟล์ = valid (แม้ข้างในจะเป็น [])**
ห้ามตีความ [] ว่า invalid เด็ดขาด ไม่งั้นตลาดหมีที่สแกนว่างจริงจะถูกกลบ แล้วระบบจะ
carry-forward หุ้นที่ควรหลุดไปเรื่อยๆ ซึ่งผิดหนักกว่าปัญหาเดิม
"""

import os


def valid_dates(hist_dir: str, fname: str, dates) -> list:
    """คืนเฉพาะวันที่ scan ตัวนี้ "ได้ผลออกมาจริง" (ไฟล์มีอยู่ ไม่ว่าจะกี่แถว)

    เช็คที่ระดับไฟล์ด้วย os.path.exists ตรงๆ ไม่ใช่ load แล้วดูว่าว่างไหม เพราะ
    หลังโหลดแล้ว None (ไฟล์หาย) กับ [] (ว่างจริง) แยกกันไม่ออกอีกต่อไป
    """
    return [d for d in dates if os.path.exists(os.path.join(hist_dir, d, f"{fname}.json"))]


def previous_valid_date(hist_dir: str, fname: str, dates, before: str):
    """วัน valid ล่าสุดที่ก่อนหน้า `before` (None ถ้าไม่มี) — ใช้เป็นฐานเปรียบเทียบ
    แทน "ไดเรกทอรีล่าสุดก่อนวันนี้" ซึ่งอาจเป็นวันที่สแกนไม่ได้รัน"""
    prior = [d for d in valid_dates(hist_dir, fname, dates) if d < before]
    return prior[-1] if prior else None
