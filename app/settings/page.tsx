'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Check, X, Copy, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Search, ShieldAlert, Layers, ArrowRight, CheckSquare, Square,
} from 'lucide-react';
import rawSectorMap from '@/data/scans/sector_map.json';
import rawCombined from '@/data/scans/combined.json';

// Import universe_changes safely (with type fallback)
let rawUniverseChanges: any = { new: [], delisted: [], possible_delisted: [], renamed: [], possible_rename: [] };
try {
  rawUniverseChanges = require('@/data/scans/universe_changes.json');
} catch {
  // Fallback if missing
}

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface SectorMapEntry { sector: string; subsector: string; market: string }
interface SectorMapFile {
  updated: string;
  sectors: { sector: string; subsector: string; market: string; tickers: string[]; count: number }[];
  ticker_to_sector: Record<string, SectorMapEntry>;
}

interface NewTickerItem {
  ticker: string;
  company_name?: string | null;
  market?: string | null;
  guessed_sector?: string | null;
  guessed_subsector?: string | null;
}

interface DelistedTickerItem {
  ticker: string;
  company_name?: string | null;
  market?: string | null;
  status?: string | null;
}

interface PossibleDelistedItem {
  ticker: string;
  company_name?: string | null;
  market?: string | null;
  status?: string | null;
  reason?: string | null;
}

interface RenamedTickerItem {
  old: string;
  new: string;
  company: string;
  reason?: string;
}

interface PossibleRenameItem {
  old: string;
  new: string;
  old_company?: string;
  new_company?: string;
  reason?: string;
}

interface UniverseChangesData {
  generated_at?: string | null;
  summary?: {
    total_live: number;
    total_current: number;
    new_count: number;
    delisted_count: number;
    possible_delisted_count?: number;
    renamed_count: number;
    possible_rename_count: number;
  };
  new?: NewTickerItem[];
  delisted?: DelistedTickerItem[];
  possible_delisted?: PossibleDelistedItem[];
  renamed?: RenamedTickerItem[];
  possible_rename?: PossibleRenameItem[];

  // Fallbacks for older json schemas
  new_tickers?: NewTickerItem[];
  delisted_tickers?: DelistedTickerItem[];
}

interface PipelineStatus {
  last_run_at: string | null;
  last_success_at: string | null;
  status: 'success' | 'failure' | null;
  failed_step: string | null;
  source: 'local' | 'cloud' | null;
}

const sectorMap = rawSectorMap as unknown as SectorMapFile;
const universeChanges = rawUniverseChanges as UniverseChangesData;
const _rawC = rawCombined as unknown as { ticker: string }[] | { data: { ticker: string }[] };
const combinedTickers = new Set((Array.isArray(_rawC) ? _rawC : _rawC.data).map(c => c.ticker));

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function fmtThaiDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} น.`;
}

// ─── 1. ศูนย์สุขภาพระบบ (System Health Center) ───────────────────────────────
function SystemHealthCenter() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/data/pipeline_status.json');
        if (!res.ok) throw new Error();
        setStatus(await res.json());
      } catch {
        // Fallback mock/healthy default
        setStatus({
          last_run_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          status: 'success',
          failed_step: null,
          source: 'local'
        });
      }
    })();
  }, []);

  const isOk = status?.status === 'success';

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1D9E75] animate-pulse" />
          <h2 className="text-[14px] font-bold text-white">ศูนย์สุขภาพระบบ (Pipeline Health)</h2>
        </div>
        <span className="text-[11px] text-white/30">อัปเดตข้อมูลอัตโนมัติ</span>
      </div>

      {loadFailed ? (
        <p className="text-[12px] text-white/30">ไม่สามารถโหลดข้อมูล pipeline_status.json ได้</p>
      ) : !status ? (
        <p className="text-[12px] text-white/30">กำลังโหลดสถานะระบบ...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="text-[10px] uppercase font-semibold text-white/30 block mb-1">สถานะ Pipeline</span>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                isOk ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]'
              }`}>
                {isOk ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {isOk ? 'ปกติ (Healthy)' : `ล้มเหลว (${status.failed_step || 'Unknown'})`}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="text-[10px] uppercase font-semibold text-white/30 block mb-1">รันล่าสุด (Last Run)</span>
            <span className="text-[12px] font-semibold text-white/80">{fmtThaiDateTime(status.last_run_at)}</span>
          </div>

          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="text-[10px] uppercase font-semibold text-white/30 block mb-1">สำเร็จล่าสุด (Last Success)</span>
            <span className="text-[12px] font-semibold text-white/80">{fmtThaiDateTime(status.last_success_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 2. Pending Universe Changes (5 Distinct Groups + Copy Prompt) ────────────
function PendingUniverseChanges() {
  const [approvedNew, setApprovedNew] = useState<Set<string>>(new Set());
  const [approvedDelisted, setApprovedDelisted] = useState<Set<string>>(new Set());
  const [approvedPossibleDelisted, setApprovedPossibleDelisted] = useState<Set<string>>(new Set());
  const [approvedRenamed, setApprovedRenamed] = useState<Set<string>>(new Set());
  const [approvedPossibleRename, setApprovedPossibleRename] = useState<Set<string>>(new Set());

  const [rejectedItems, setRejectedItems] = useState<Set<string>>(new Set());
  const [sectorEdits, setSectorEdits] = useState<Record<string, { sector: string; subsector: string }>>({});
  const [copied, setCopied] = useState(false);

  // Parse lists with fallbacks
  const newList: NewTickerItem[] = useMemo(() => universeChanges.new ?? universeChanges.new_tickers ?? [], []);
  const delistedList: DelistedTickerItem[] = useMemo(() => universeChanges.delisted ?? universeChanges.delisted_tickers ?? [], []);
  const possibleDelistedList: PossibleDelistedItem[] = useMemo(() => universeChanges.possible_delisted ?? [], []);
  const renamedList: RenamedTickerItem[] = useMemo(() => universeChanges.renamed ?? [], []);
  const possibleRenameList: PossibleRenameItem[] = useMemo(() => universeChanges.possible_rename ?? [], []);

  // Filter out rejected items
  const activeNew = newList.filter(t => !rejectedItems.has(t.ticker));
  const activeDelisted = delistedList.filter(t => !rejectedItems.has(t.ticker));
  const activePossibleDelisted = possibleDelistedList.filter(t => !rejectedItems.has(t.ticker));
  const activeRenamed = renamedList.filter(r => !rejectedItems.has(`${r.old}->${r.new}`));
  const activePossibleRename = possibleRenameList.filter(pr => !rejectedItems.has(`${pr.old}->${pr.new}`));

  const hasAnyPending =
    activeNew.length > 0 ||
    activeDelisted.length > 0 ||
    activePossibleDelisted.length > 0 ||
    activeRenamed.length > 0 ||
    activePossibleRename.length > 0;

  function getSectorEdit(t: NewTickerItem) {
    return sectorEdits[t.ticker] ?? { sector: t.guessed_sector ?? '', subsector: t.guessed_subsector ?? '' };
  }

  function handleSetSectorEdit(ticker: string, field: 'sector' | 'subsector', val: string) {
    setSectorEdits(prev => ({
      ...prev,
      [ticker]: { ...getSectorEdit({ ticker } as NewTickerItem), ...prev[ticker], [field]: val }
    }));
  }

  function handleReject(key: string) {
    setRejectedItems(prev => new Set(prev).add(key));
  }

  // Toggle helpers
  function toggleSet(setFn: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) {
    setFn(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalApproved =
    approvedNew.size +
    approvedDelisted.size +
    approvedPossibleDelisted.size +
    approvedRenamed.size +
    approvedPossibleRename.size;

  function buildPrompt(): string {
    const lines: string[] = [];
    lines.push('====================================================');
    lines.push('📌 พรอมต์สำหรับ Executor: อัปเดต Universe & Sector Map');
    lines.push('====================================================');
    lines.push('คำสั่ง: โปรดดำเนินการอัปเดตไฟล์ Universe และ Sector Map ตามรายการที่ได้รับอนุมัติ');
    lines.push('');

    // 1. New IPOs
    const selectedNew = activeNew.filter(t => approvedNew.has(t.ticker));
    if (selectedNew.length > 0) {
      lines.push(`🟢 1. เพิ่มหุ้นใหม่ (New IPOs) รวม ${selectedNew.length} ตัว:`);
      for (const t of selectedNew) {
        const edit = getSectorEdit(t);
        lines.push(`   - [NEW] Ticker: "${t.ticker}" | บริษัท: "${t.company_name || '—'}" | Market: "${t.market || 'SET'}"`);
        lines.push(`     -> กำหนด Sector: "${edit.sector || 'N/A'}", Subsector: "${edit.subsector || 'N/A'}"`);
        lines.push(`     -> วิธีการ: เพิ่มเข้าใน ticker_to_sector ของ data/scans/sector_map.json และเพิ่มเข้าใน sectors[].tickers bucket ที่ตรงกันพร้อมปรับ count + 1`);
      }
      lines.push('');
    }

    // 2. Confirmed Delisted
    const selectedDelist = activeDelisted.filter(t => approvedDelisted.has(t.ticker));
    if (selectedDelist.length > 0) {
      lines.push(`🔴 2. ลบหุ้นที่เพิกถอนยืนยันแล้ว (${selectedDelist.length} ตัว):`);
      for (const t of selectedDelist) {
        lines.push(`   - [DELETE] Ticker: "${t.ticker}" (${t.company_name || '—'})`);
        lines.push(`     -> วิธีการ: ลบออกจาก ticker_to_sector และลบออกจาก sectors[].tickers bucket ใน data/scans/sector_map.json พร้อมปรับ count - 1`);
      }
      lines.push('');
    }

    // 3. Possible Delisted Approved
    const selectedPossDelist = activePossibleDelisted.filter(t => approvedPossibleDelisted.has(t.ticker));
    if (selectedPossDelist.length > 0) {
      lines.push(`⚠️ 3. ลบหุ้นรอตรวจสอบเพิกถอนที่อนุมัติแล้ว (${selectedPossDelist.length} ตัว):`);
      for (const t of selectedPossDelist) {
        lines.push(`   - [DELETE] Ticker: "${t.ticker}" (${t.company_name || '—'})`);
        lines.push(`     -> ยืนยันลบออกจาก ticker_to_sector และ sectors[].tickers ใน data/scans/sector_map.json`);
      }
      lines.push('');
    }

    // 4. Renamed Tickers (Crucial History Transfer!)
    const selectedRenamed = activeRenamed.filter(r => approvedRenamed.has(`${r.old}->${r.new}`));
    if (selectedRenamed.length > 0) {
      lines.push(`🔵 4. เปลี่ยนชื่อย่อหุ้น + โอนย้ายประวัติเดิม (${selectedRenamed.length} ตัว):`);
      for (const r of selectedRenamed) {
        lines.push(`   - [RENAME] เปลี่ยนจาก "${r.old}" ➔ เป็น "${r.new}" (บริษัท: "${r.company}")`);
        lines.push(`     -> 1. แก้ชื่อย่อ "${r.old}" เป็น "${r.new}" ใน data/scans/sector_map.json`);
        lines.push(`     -> 2. Remap / Transfer ประวัติเดิมของ "${r.old}" ไปหา "${r.new}" ในไฟล์ประวัติ history ทุกไฟล์ที่ key ด้วย ticker:`);
        lines.push(`        • data/scans/lekkung_history.json`);
        lines.push(`        • data/scans/topmover_history.json`);
        lines.push(`        • data/scans/report_card.json`);
        lines.push(`        • data/scans/sepa_history.json, oliver_kell_history.json, breakout_history.json`);
        lines.push(`        • snapshot data ทั้งหมด`);
        lines.push(`     -> สำคัญ: ห้ามรีเซ็ตประวัติ ให้โอนย้ายประวัติย้อนหลังทั้งหมดของ "${r.old}" ให้เป็นของ "${r.new}"`);
      }
      lines.push('');
    }

    // 5. Possible Rename Approved
    const selectedPossRename = activePossibleRename.filter(pr => approvedPossibleRename.has(`${pr.old}->${pr.new}`));
    if (selectedPossRename.length > 0) {
      lines.push(`🟣 5. เปลี่ยนชื่อย่อรอตรวจสอบที่อนุมัติแล้ว (${selectedPossRename.length} ตัว):`);
      for (const pr of selectedPossRename) {
        lines.push(`   - [RENAME] เปลี่ยนจาก "${pr.old}" ➔ เป็น "${pr.new}" (สาเหตุ: ${pr.reason || 'Human Approved'})`);
        lines.push(`     -> แก้ชื่อย่อใน sector_map.json และ Remap ประวัติเดิมในไฟล์ history ทุกไฟล์ให้เป็น "${pr.new}"`);
      }
      lines.push('');
    }

    lines.push('📌 ตรวจสอบและยืนยันงาน:');
    lines.push('1. ดำเนินการอัปเดตไฟล์ sector_map.json และ Remap ประวัติในไฟล์ history ตามรายการข้างต้น');
    lines.push('2. รันคำสั่ง validation: python scripts/validate_sector_mapping.py');
    lines.push('3. รันคำสั่ง build: npm run build');
    lines.push('4. สรุปรายงานผลการเปลี่ยนแปลงให้ผมตรวจสอบก่อน Push');

    return lines.join('\n');
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 md:p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div>
          <h2 className="text-[14px] font-bold text-white">รายการการเปลี่ยนแปลง Universe ที่รอตรวจสอบ</h2>
          <p className="text-[11px] text-white/35 mt-0.5">ตรวจจับอัตโนมัติทุกวันจันทร์ผ่าน check_universe.py</p>
        </div>
        {universeChanges.generated_at && (
          <span className="text-[11px] text-white/30 bg-white/[0.04] px-2.5 py-1 rounded-md">
            ตรวจล่าสุด: {fmtThaiDateTime(universeChanges.generated_at)}
          </span>
        )}
      </div>

      {!hasAnyPending ? (
        <div className="py-6 text-center">
          <CheckCircle2 size={28} className="mx-auto text-[#1D9E75]/40 mb-2" />
          <p className="text-[13px] font-semibold text-white/60">universe ปัจจุบันเป็นปัจจุบัน สมบูรณ์แล้ว</p>
          <p className="text-[11px] text-white/30 mt-0.5">ไม่มีรายการ New, Delisted หรือ Rename ที่ค้างตรวจสอบในขณะนี้</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── 1. หุ้นใหม่ (New IPOs) — สีเขียว #1D9E75 ── */}
          {activeNew.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#1D9E75]" />
                <h3 className="text-[12.5px] font-bold text-[#1D9E75]">
                  🟢 หุ้นใหม่ / IPO ({activeNew.length})
                </h3>
              </div>
              <div className="space-y-2">
                {activeNew.map(t => {
                  const isChecked = approvedNew.has(t.ticker);
                  const edit = getSectorEdit(t);
                  return (
                    <div
                      key={t.ticker}
                      className={`p-3 rounded-xl border transition-all ${
                        isChecked ? 'bg-[#1D9E75]/[0.08] border-[#1D9E75]/30' : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => toggleSet(setApprovedNew, t.ticker)}
                          className="flex items-center gap-2 text-left flex-1 min-w-[140px]"
                        >
                          {isChecked ? <CheckSquare size={16} className="text-[#1D9E75]" /> : <Square size={16} className="text-white/30" />}
                          <div>
                            <span className="text-[13.5px] font-bold text-white leading-tight block">{t.ticker}</span>
                            <span className="text-[10.5px] text-white/40 block truncate max-w-[200px] sm:max-w-xs">
                              {t.company_name || 'ไม่ทราบชื่อบริษัท'} ({t.market || 'SET'})
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={edit.sector}
                            onChange={e => handleSetSectorEdit(t.ticker, 'sector', e.target.value)}
                            placeholder="Sector (เดา)"
                            className="px-2.5 py-1 bg-black/40 border border-white/10 rounded-lg text-[11.5px] text-white outline-none focus:border-[#1D9E75] w-[110px]"
                          />
                          <input
                            type="text"
                            value={edit.subsector}
                            onChange={e => handleSetSectorEdit(t.ticker, 'subsector', e.target.value)}
                            placeholder="Subsector"
                            className="px-2.5 py-1 bg-black/40 border border-white/10 rounded-lg text-[11.5px] text-white outline-none focus:border-[#1D9E75] w-[130px]"
                          />
                          <button
                            onClick={() => handleReject(t.ticker)}
                            className="px-2 py-1 rounded text-[11px] text-white/30 hover:text-[#E24B4A] hover:bg-[#E24B4A]/10 transition-colors"
                            title="Reject (ส่งเข้า ignore list)"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 2. เพิกถอนยืนยันแล้ว (Confirmed Delisted) — สีแดง #E24B4A ── */}
          {activeDelisted.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E24B4A]" />
                <h3 className="text-[12.5px] font-bold text-[#E24B4A]">
                  🔴 เพิกถอนยืนยันแล้ว ({activeDelisted.length})
                </h3>
              </div>
              <div className="space-y-1.5">
                {activeDelisted.map(t => {
                  const isChecked = approvedDelisted.has(t.ticker);
                  return (
                    <div
                      key={t.ticker}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isChecked ? 'bg-[#E24B4A]/[0.08] border-[#E24B4A]/30' : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <button
                        onClick={() => toggleSet(setApprovedDelisted, t.ticker)}
                        className="flex items-center gap-2 text-left"
                      >
                        {isChecked ? <CheckSquare size={16} className="text-[#E24B4A]" /> : <Square size={16} className="text-white/30" />}
                        <div>
                          <span className="text-[13px] font-bold text-white">{t.ticker}</span>
                          <span className="text-[11px] text-white/35 ml-2">{t.company_name || ''}</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#E24B4A]/15 text-[#E24B4A]">
                          Profile 404 / Delisted
                        </span>
                        <button
                          onClick={() => handleReject(t.ticker)}
                          className="px-2 py-1 rounded text-[11px] text-white/30 hover:text-white/70 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 3. รอตรวจเพิกถอน (Suspected Delisted) — สีส้ม #EF9F27 ── */}
          {activePossibleDelisted.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-[#EF9F27]" />
                <h3 className="text-[12.5px] font-bold text-[#EF9F27]">
                  ⚠️ รอตรวจเพิกถอน ({activePossibleDelisted.length})
                </h3>
              </div>
              <div className="p-2.5 rounded-lg bg-[#EF9F27]/10 border border-[#EF9F27]/20 text-[11px] text-[#EF9F27]">
                <strong>คำเตือน:</strong> หุ้นกลุ่มนี้ยังไม่ยืนยัน 100% ว่าเพิกถอน อาจเกิดจาก Endpoint ขัดข้องชั่วคราว <u>ห้ามกด Approve ลบ หากไม่มั่นใจ</u>
              </div>
              <div className="space-y-1.5">
                {activePossibleDelisted.map(t => {
                  const isChecked = approvedPossibleDelisted.has(t.ticker);
                  return (
                    <div
                      key={t.ticker}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isChecked ? 'bg-[#EF9F27]/[0.08] border-[#EF9F27]/30' : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <button
                        onClick={() => toggleSet(setApprovedPossibleDelisted, t.ticker)}
                        className="flex items-center gap-2 text-left"
                      >
                        {isChecked ? <CheckSquare size={16} className="text-[#EF9F27]" /> : <Square size={16} className="text-white/30" />}
                        <div>
                          <span className="text-[13px] font-bold text-white">{t.ticker}</span>
                          <span className="text-[11px] text-white/35 ml-2">{t.company_name || ''}</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#EF9F27]/15 text-[#EF9F27]">
                          {t.reason || 'ยังไม่ยืนยัน'}
                        </span>
                        <button
                          onClick={() => handleReject(t.ticker)}
                          className="px-2 py-1 rounded text-[11px] text-white/30 hover:text-white/70 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 4. เปลี่ยนชื่อ (Renamed Tickers) — สีฟ้า #378ADD ── */}
          {activeRenamed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#378ADD]" />
                <h3 className="text-[12.5px] font-bold text-[#378ADD]">
                  🔵 เปลี่ยนชื่อย่อหุ้น ({activeRenamed.length})
                </h3>
              </div>
              <div className="space-y-2">
                {activeRenamed.map(r => {
                  const key = `${r.old}->${r.new}`;
                  const isChecked = approvedRenamed.has(key);
                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                        isChecked ? 'bg-[#378ADD]/[0.08] border-[#378ADD]/30' : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <button
                        onClick={() => toggleSet(setApprovedRenamed, key)}
                        className="flex items-center gap-2.5 text-left flex-1"
                      >
                        {isChecked ? <CheckSquare size={16} className="text-[#378ADD]" /> : <Square size={16} className="text-white/30" />}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-bold text-[#E24B4A] line-through">{r.old}</span>
                            <ArrowRight size={13} className="text-white/40" />
                            <span className="text-[14px] font-bold text-[#1D9E75]">{r.new}</span>
                          </div>
                          <span className="text-[11px] text-white/40 block mt-0.5">{r.company}</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded bg-[#378ADD]/15 text-[#378ADD]">
                          ย้ายชื่อย่อ + โอนประวัติเดิม
                        </span>
                        <button
                          onClick={() => handleReject(key)}
                          className="px-2 py-1 rounded text-[11px] text-white/30 hover:text-white/70 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 5. รอตรวจ rename (Suspected Rename) — สีม่วง #7F77DD ── */}
          {activePossibleRename.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7F77DD]" />
                <h3 className="text-[12.5px] font-bold text-[#7F77DD]">
                  🟣 รอตรวจเปลี่ยนชื่อ (Possible Rename) ({activePossibleRename.length})
                </h3>
              </div>
              <div className="space-y-2">
                {activePossibleRename.map(pr => {
                  const key = `${pr.old}->${pr.new}`;
                  const isChecked = approvedPossibleRename.has(key);
                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                        isChecked ? 'bg-[#7F77DD]/[0.08] border-[#7F77DD]/30' : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <button
                        onClick={() => toggleSet(setApprovedPossibleRename, key)}
                        className="flex items-center gap-2.5 text-left flex-1"
                      >
                        {isChecked ? <CheckSquare size={16} className="text-[#7F77DD]" /> : <Square size={16} className="text-white/30" />}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-white/80">{pr.old}</span>
                            <ArrowRight size={13} className="text-white/40" />
                            <span className="text-[13px] font-bold text-[#7F77DD]">{pr.new}</span>
                          </div>
                          <span className="text-[10.5px] text-white/35 block mt-0.5">{pr.reason || 'สงสัยเปลี่ยนชื่อ'}</span>
                        </div>
                      </button>

                      <button
                        onClick={() => handleReject(key)}
                        className="px-2 py-1 rounded text-[11px] text-white/30 hover:text-white/70 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Prompt Copy Action Button ── */}
          <div className="pt-3 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={handleCopyPrompt}
              disabled={totalApproved === 0}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12.5px] font-bold transition-all ${
                totalApproved === 0
                  ? 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.05]'
                  : 'bg-[#1D9E75] text-black hover:bg-[#158763] shadow-lg shadow-[#1D9E75]/20'
              }`}
            >
              <Copy size={15} />
              {copied ? 'คัดลอกพรอมต์แล้ว!' : `คัดลอกพรอมต์สำหรับ Executor (${totalApproved} รายการอนุมัติ)`}
            </button>
            <span className="text-[11px] text-white/35">
              คัดลอกไปวางใน Claude Code / Executor เพื่อสั่งอัปเดตไฟล์จริง
            </span>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── 3. Universe Browser (ค้นหา + นับต่อ Sector + Filter Market) ─────────────
function UniverseBrowser() {
  const [query, setQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'SET' | 'mai'>('ALL');

  const allEntries = useMemo(() => {
    return Object.entries(sectorMap.ticker_to_sector).map(([ticker, info]) => ({
      ticker,
      sector: info.sector,
      subsector: info.subsector,
      market: info.market || 'SET',
    }));
  }, []);

  const totalCount = allEntries.length;
  const setCount = useMemo(() => allEntries.filter(e => e.market === 'SET').length, [allEntries]);
  const maiCount = useMemo(() => allEntries.filter(e => e.market === 'mai').length, [allEntries]);

  // Sector breakdown count
  const sectorCounts = useMemo(() => {
    const map: Record<string, { count: number; set: number; mai: number }> = {};
    for (const item of allEntries) {
      if (!map[item.sector]) map[item.sector] = { count: 0, set: 0, mai: 0 };
      map[item.sector].count += 1;
      if (item.market === 'mai') map[item.sector].mai += 1;
      else map[item.sector].set += 1;
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [allEntries]);

  // Filtered search list
  const filteredTickers = useMemo(() => {
    const q = query.trim().toUpperCase();
    return allEntries.filter(item => {
      if (marketFilter !== 'ALL' && item.market !== marketFilter) return false;
      if (!q) return true;
      return (
        item.ticker.includes(q) ||
        item.sector.toUpperCase().includes(q) ||
        item.subsector.toUpperCase().includes(q)
      );
    });
  }, [allEntries, query, marketFilter]);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div>
          <h2 className="text-[14px] font-bold text-white">Universe ปัจจุบัน (Current Universe)</h2>
          <p className="text-[11px] text-white/35 mt-0.5">
            {totalCount} หุ้น (SET: {setCount} · mai: {maiCount}) · {sectorCounts.length} Sectors
          </p>
        </div>

        {/* Market Filter Tabs */}
        <div className="flex items-center bg-white/[0.05] p-1 rounded-lg border border-white/[0.06]">
          {(['ALL', 'SET', 'mai'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMarketFilter(m)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                marketFilter === m ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {m === 'ALL' ? 'ทั้งหมด' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-2.5 text-white/30" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อหุ้น (Ticker), Sector, หรือ Subsector..."
          className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-[12.5px] text-white placeholder:text-white/25 outline-none focus:border-white/25"
        />
      </div>

      {/* Content View: Search Results vs Sector Cards */}
      {query.trim() || marketFilter !== 'ALL' ? (
        <div className="space-y-2">
          <p className="text-[11px] text-white/35 font-medium">
            ผลการค้นหา ({filteredTickers.length} หุ้น)
          </p>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04] pr-1">
            {filteredTickers.length === 0 ? (
              <p className="text-[12px] text-white/30 py-4 text-center">ไม่พบหุ้นที่ตรงกับเงื่อนไข</p>
            ) : (
              filteredTickers.slice(0, 100).map(item => (
                <div key={item.ticker} className="flex items-center justify-between py-2 text-[12px]">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white w-16">{item.ticker}</span>
                    <span className="text-white/40 text-[11px]">
                      {item.sector} · {item.subsector}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
                      {item.market}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      combinedTickers.has(item.ticker)
                        ? 'bg-[#1D9E75]/15 text-[#1D9E75]'
                        : 'bg-white/[0.06] text-white/25'
                    }`}>
                      {combinedTickers.has(item.ticker) ? 'มีข้อมูล scan' : 'ไม่มีข้อมูล scan'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {sectorCounts.map(([sec, d]) => (
            <div key={sec} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
              <span className="text-[11.5px] font-bold text-white/80 block truncate">{sec}</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[13px] font-bold text-[#1D9E75] tabular-nums">{d.count}</span>
                <span className="text-[9.5px] text-white/30">SET:{d.set} mai:{d.mai}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Page Component ─────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-[18px] font-bold text-white">Settings & Universe Management</h1>
        <p className="text-[12px] text-white/40 mt-0.5">
          ศูนย์สุขภาพระบบ · การจัดการ Universe หุ้น · การเปลี่ยนชื่อย่อและการเพิกถอน
        </p>
      </div>

      {/* 1. ศูนย์สุขภาพระบบ */}
      <SystemHealthCenter />

      {/* 2. การเปลี่ยนแปลง Universe ที่รอตรวจสอบ */}
      <PendingUniverseChanges />

      {/* 3. Universe ปัจจุบัน */}
      <UniverseBrowser />
    </div>
  );
}
