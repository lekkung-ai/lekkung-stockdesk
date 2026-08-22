'use client';

// แบนเนอร์เตือน "สแกนนี้ร่วงเหลือ 0 ตัวทั้งที่เพิ่งมีของ" - อ่านธงที่
// scripts/write_pipeline_status.py คำนวณไว้ (เกณฑ์ R1) จาก pipeline_status.json
//
// เคสที่ธงนี้มีไว้จับ: scanner รันจบแบบไม่มี error แต่คืน 0 แถวเพราะ logic พังเอง
// (CAN SLIM 2026-08-20: ROE threshold เดาหน่วยผิดจนไม่มีหุ้นตัวไหนผ่าน แล้วขึ้น
// success เงียบๆ) - Missing Guard จับได้แค่ไฟล์หาย ส่วน valid-date guard จับได้แค่
// pipeline ขาด ทั้งคู่ไม่เห็นเคสนี้เลย
//
// ธงเป็น "สถานะ" ไม่ใช่ "เหตุการณ์": ติดค้างทุกวันที่ยังได้ 0 และดับเองเมื่อสแกน
// กลับมามีหุ้น ถ้าตลาดว่างจริงยาวเกินหน้าต่างที่ตั้งไว้ ธงก็ดับเองเช่นกัน

import { useEffect, useState } from 'react';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

export interface ScanWarning {
  scan: string;
  last_n: number;
  last_nonzero_n: number;
  last_nonzero_date: string | null;
  peak_n?: number;
  current_date: string;
  reason?: string;
}

export default function ScanWarningBanner({ scanKey, label }: { scanKey: string; label: string }) {
  const [warning, setWarning] = useState<ScanWarning | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/pipeline_status.json')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        const list: ScanWarning[] = Array.isArray(data.scan_warnings) ? data.scan_warnings : [];
        setWarning(list.find(w => w.scan === scanKey) ?? null);
      })
      .catch(() => {
        // ไม่มีไฟล์/อ่านไม่ได้ = ไม่เตือน ดีกว่าเตือนผิด
      });
    return () => { cancelled = true; };
  }, [scanKey]);

  if (!warning) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-label px-4 py-2.5 rounded-xl">
      <span className="text-[14px]">⚠</span>
      <span>
        {label} ร่วงจาก {warning.last_nonzero_n} → 0 ตั้งแต่ {isoToThaiLabel(warning.current_date)} — อาจมีปัญหา ตรวจสอบ
      </span>
    </div>
  );
}
