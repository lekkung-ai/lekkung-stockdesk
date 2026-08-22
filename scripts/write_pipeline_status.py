"""
write_pipeline_status.py - Records this pipeline run's outcome to
public/data/pipeline_status.json (merged with the existing file, so a failed
run doesn't erase the last known-good last_success_at). Called at the very
end of every pipeline run - update_stockdesk.bat and daily-scan.yml - success
or failure, so the "is the pipeline actually alive" question never again
depends on someone noticing a stale generated_at by hand.

Usage:
    python scripts/write_pipeline_status.py --status success --source local
    python scripts/write_pipeline_status.py --status failure --failed-step "run_all.py scan" --source cloud
    python scripts/write_pipeline_status.py --status success --source cloud --failed-steps scan_canslim.py scan_ppbp.py

failed_step (เอกพจน์) = step ระดับ workflow ที่ล้ม ทำให้ทั้งรอบเป็น failure
failed_steps (พหูพจน์) = scan ย่อยที่ returncode != 0 ระหว่างรอบ ซึ่ง run_all.py
ปล่อยให้รันต่อจนจบ (scan ตัวเดียวพังไม่ควรล้มทั้งรอบ) จึงบันทึกเสมอแม้ status=success
- ไม่งั้น scan ล่มจะขึ้น success เงียบ เหมือนเคส CAN SLIM 2026-08-20

scan_warnings = สแกนที่ "รันจบแบบไม่มี error แต่ผลลัพธ์ร่วงเป็น 0" ซึ่งไม่มี guard
ตัวไหนจับได้เลย (Missing Guard จับได้แค่ไฟล์หาย, valid-date guard จับได้แค่ pipeline
ขาด) - เคส CAN SLIM 2026-08-20 คือ scan รันจบ เขียน 0 แถวโดยสุจริตเพราะ threshold
พัง แล้วขึ้น success เงียบๆ ธงนี้ไม่ซ่อมข้อมูลอะไร แค่ทำให้คนเห็นว่าต้องมาดู

Output: public/data/pipeline_status.json
    {
      "last_run_at": "2026-07-16T18:11:00+07:00",
      "last_success_at": "2026-07-15T09:53:00+07:00",
      "status": "failure",
      "failed_step": "run_all.py scan",
      "failed_steps": ["scan_canslim.py"],
      "scan_warnings": [
        {"scan": "oneil", "last_n": 0, "last_nonzero_n": 5,
         "last_nonzero_date": "2026-08-19", "current_date": "2026-08-20",
         "reason": "ร่วงจาก 5 → 0 ตั้งแต่ 2026-08-20"}
      ],
      "source": "cloud"
    }
"""

import argparse
import json
import os
from datetime import datetime, timezone, timedelta

from scan_calendar import valid_dates

BANGKOK_TZ = timezone(timedelta(hours=7))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(SCRIPT_DIR, '..', 'public', 'data', 'pipeline_status.json')
HIST_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'history')

# เฉพาะสแกนแบบ "คัดเลือก" ที่มีหน้าเว็บของตัวเองให้ขึ้นแบนเนอร์ได้
# universe scan (market_stage/weinstein/stage_all) ไม่อยู่ในนี้ - ของพวกนั้น 0 แถว
# ถูกกันด้วย drop guard (MIN_UNIVERSE_ROWS) ใน convert_to_json อยู่แล้ว และอาการ
# ที่ต้องจับคือ "ครอบตลาดไม่ครบ" ซึ่งเป็นคนละเกณฑ์กัน
WARN_SCANS = {
    'lekkung': 'lekkung',
    'oneil': 'oneil',
    'sepa': 'sepa',
    'kell': 'oliver_kell',
    'breakout': 'breakout',
}

# เกณฑ์ R1 (เลือกจากการจำลองย้อนหลัง 44-49 วันทุกสแกน: จับเคส 2026-08-20 ได้
# โดย false alarm = 0 - ดูตารางการแกว่งจริงใน audit): ธงติดเมื่อวัน valid ล่าสุด
# ได้ 0 ตัว ทั้งที่ 10 วัน valid ก่อนหน้าเคยมีอย่างน้อย 3 ตัว
WARN_LOOKBACK_DAYS = 10
WARN_MIN_PREV_N = 3


def _count_rows(path):
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return None
    rows = data if isinstance(data, list) else data.get('data', [])
    return len(rows)


def compute_scan_warnings(hist_dir=HIST_DIR):
    """ธง "สแกนร่วงเป็น 0 ทั้งที่เพิ่งมีของ" ต่อสแกน (เกณฑ์ R1)

    นับจาก snapshot ใน data/history/<date>/ ไม่ใช่ data/scans/ เพราะวันที่ scan ล่ม
    Missing Guard จะปล่อยไฟล์ของเมื่อวานค้างไว้ใน data/scans/ (จะอ่านได้จำนวนเก่า
    แทนที่จะเป็น 0) ส่วน snapshot วันนั้นจะไม่มีไฟล์ = ไม่ใช่วัน valid ตั้งแต่แรก

    เป็น "สถานะ" ไม่ใช่ "เหตุการณ์": ธงติดอยู่ทุกวันที่ยังได้ 0 และดับเองทันทีที่
    สแกนกลับมามีหุ้น ถ้าตลาดทำให้ว่างจริงยาวเกิน WARN_LOOKBACK_DAYS วัน valid
    ธงก็ดับเอง (ยอมรับว่าเป็นสภาพตลาด ไม่ใช่บั๊ก)
    """
    if not os.path.isdir(hist_dir):
        return []
    dates = sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[0].isdigit()
    )
    warnings = []
    for key, fname in WARN_SCANS.items():
        vdates = valid_dates(hist_dir, fname, dates)
        if not vdates:
            continue
        current_date = vdates[-1]
        last_n = _count_rows(os.path.join(hist_dir, current_date, f'{fname}.json'))
        if last_n is None or last_n > 0:
            continue

        window = vdates[-(WARN_LOOKBACK_DAYS + 1):-1]
        counts = [(d, _count_rows(os.path.join(hist_dir, d, f'{fname}.json'))) for d in window]
        # ทริกเกอร์ดูค่าสูงสุดในหน้าต่าง (ทนวันที่ผลลัพธ์แกว่งลงชั่วคราว)...
        peak_n = max((n for _, n in counts if n), default=0)
        if peak_n < WARN_MIN_PREV_N:
            continue
        # ...แต่ข้อความรายงานใช้ "วันล่าสุดที่ยังมีของ" เพราะนั่นคือจุดที่คนอ่านคาดหวัง
        # ว่ามันร่วงมาจากตรงไหน
        recent = [(d, n) for d, n in counts if n]
        last_nonzero_date, last_nonzero_n = recent[-1] if recent else (None, peak_n)

        warnings.append({
            'scan': key,
            'last_n': last_n,
            'last_nonzero_n': last_nonzero_n,
            'last_nonzero_date': last_nonzero_date,
            'peak_n': peak_n,
            'current_date': current_date,
            'reason': f'ร่วงจาก {last_nonzero_n} → 0 ตั้งแต่ {current_date}',
        })
    return warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--status', required=True, choices=['success', 'failure'])
    parser.add_argument('--failed-step', default=None)
    parser.add_argument(
        '--failed-steps', nargs='*', default=None,
        help='ชื่อ scan ย่อยที่ returncode != 0 (อ่านมาจาก run_all.py -> run_status.json)',
    )
    parser.add_argument('--source', required=True, choices=['local', 'cloud'])
    args = parser.parse_args()

    now = datetime.now(BANGKOK_TZ).strftime('%Y-%m-%dT%H:%M:%S+07:00')

    existing = {}
    if os.path.exists(OUT_PATH):
        try:
            with open(OUT_PATH, encoding='utf-8') as f:
                existing = json.load(f)
        except Exception:
            existing = {}

    # เริ่มจากไฟล์เดิมแล้วค่อยทับเฉพาะ key ที่รอบนี้เป็นเจ้าของ - key อื่นที่ใครมา
    # เพิ่มทีหลังจะไม่หายไปเงียบๆ
    result = dict(existing)
    result.update({
        'last_run_at': now,
        'last_success_at': now if args.status == 'success' else existing.get('last_success_at'),
        'status': args.status,
        'failed_step': args.failed_step if args.status == 'failure' else None,
        # บันทึกเสมอ ไม่ผูกกับ args.status - รอบที่ทั้ง pipeline สำเร็จแต่มี scan
        # ย่อยพัง คือเคสที่ต้องเห็นที่สุด (เดิมไม่มีที่ให้บันทึกเลย)
        'failed_steps': args.failed_steps or [],
        # เขียนทุกรอบแม้ไม่มีธง (เป็น [] แทนที่จะไม่มี key) เพื่อให้ฝั่งเว็บอ่านตรงๆ
        # ได้โดยไม่ต้องเดา และเพื่อให้ธงเก่า "ดับ" จริงเมื่อสแกนกลับมาปกติ
        'scan_warnings': compute_scan_warnings(),
        'source': args.source,
    })

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"pipeline_status.json written: {result}")


if __name__ == '__main__':
    main()
