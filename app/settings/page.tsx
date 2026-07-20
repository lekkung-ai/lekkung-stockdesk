'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, X, Copy, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import rawSectorMap from '@/data/scans/sector_map.json';
import rawCombined from '@/data/scans/combined.json';
import rawUniverseChanges from '@/data/scans/universe_changes.json';

// ─── Types ──────────────────────────────────────────────────────────────────
interface SectorMapEntry { sector: string; subsector: string; market: string }
interface SectorMapFile {
  updated: string;
  sectors: { sector: string; subsector: string; market: string; tickers: string[]; count: number }[];
  ticker_to_sector: Record<string, SectorMapEntry>;
}
interface NewTicker { ticker: string; company_name: string | null; guessed_sector: string | null; guessed_subsector: string | null }
interface DelistedTicker { ticker: string }
interface UniverseChangesFile {
  generated_at: string | null;
  new_tickers: NewTicker[];
  delisted_tickers: DelistedTicker[];
}
interface PipelineStatus {
  last_run_at: string | null;
  last_success_at: string | null;
  status: 'success' | 'failure' | null;
  failed_step: string | null;
  source: 'local' | 'cloud' | null;
}

const sectorMap = rawSectorMap as unknown as SectorMapFile;
const universeChanges = rawUniverseChanges as unknown as UniverseChangesFile;
const _rawC = rawCombined as unknown as { ticker: string }[] | { data: { ticker: string }[] };
const combinedTickers = new Set((Array.isArray(_rawC) ? _rawC : _rawC.data).map(c => c.ticker));

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function fmtThaiDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ─── Section 1: System health (pipeline_status.json + generated_at freshness) ───
function SystemHealthCard() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/data/pipeline_status.json');
        if (!res.ok) throw new Error();
        setStatus(await res.json());
      } catch {
        setLoadFailed(true);
      }
    })();
  }, []);

  const isOk = status?.status === 'success';

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
      <h2 className="text-[14px] font-bold text-white mb-3">ศูนย์สุขภาพระบบ</h2>
      {loadFailed ? (
        <p className="text-label text-white/30">โหลด pipeline_status.json ไม่สำเร็จ</p>
      ) : !status ? (
        <p className="text-label text-white/30">กำลังโหลด...</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-label font-semibold ${
            isOk ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]'
          }`}>
            {isOk ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {isOk ? 'Pipeline ปกติ' : `ล้มเหลว${status.failed_step ? `: ${status.failed_step}` : ''}`}
          </span>
          <span className="text-label text-white/40">รันล่าสุด: {fmtThaiDateTime(status.last_run_at)}</span>
          <span className="text-label text-white/40">สำเร็จล่าสุด: {fmtThaiDateTime(status.last_success_at)}</span>
          {status.source && <span className="text-label text-white/25">({status.source})</span>}
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Pending universe changes (approve/reject + copy-prompt) ───
type Decision = 'pending' | 'approved' | 'rejected';

function PendingChangesCard() {
  const [newDecisions, setNewDecisions] = useState<Record<string, Decision>>({});
  const [delistDecisions, setDelistDecisions] = useState<Record<string, Decision>>({});
  const [sectorEdits, setSectorEdits] = useState<Record<string, { sector: string; subsector: string }>>({});
  const [copied, setCopied] = useState(false);

  const newTickers = universeChanges.new_tickers ?? [];
  const delistedTickers = universeChanges.delisted_tickers ?? [];
  const hasAny = newTickers.length > 0 || delistedTickers.length > 0;

  function getSectorEdit(t: NewTicker) {
    return sectorEdits[t.ticker] ?? { sector: t.guessed_sector ?? '', subsector: t.guessed_subsector ?? '' };
  }
  function setSectorEdit(ticker: string, field: 'sector' | 'subsector', value: string) {
    setSectorEdits(prev => ({ ...prev, [ticker]: { ...getSectorEdit({ ticker } as NewTicker), ...prev[ticker], [field]: value } }));
  }

  const approvedNew = newTickers.filter(t => newDecisions[t.ticker] === 'approved');
  const approvedDelist = delistedTickers.filter(t => delistDecisions[t.ticker] === 'approved');

  function buildPrompt(): string {
    const lines: string[] = [];
    lines.push('งาน: อัปเดต universe หุ้นใน stockdesk ตามรายการที่ approve จาก /settings');
    lines.push('ไฟล์ที่ต้องแก้: data/scans/sector_map.json (ทั้ง "ticker_to_sector" และ bucket ที่ตรงกันใน "sectors[].tickers")');
    lines.push('');
    if (approvedNew.length > 0) {
      lines.push(`เพิ่มหุ้นใหม่ ${approvedNew.length} ตัว:`);
      for (const t of approvedNew) {
        const edit = getSectorEdit(t);
        lines.push(`  - ${t.ticker}${t.company_name ? ` (${t.company_name})` : ''}: sector="${edit.sector || 'ยังไม่ระบุ - โปรดเดาจากชื่อบริษัท/ธุรกิจ'}", subsector="${edit.subsector || 'ยังไม่ระบุ'}"`);
      }
      lines.push('');
    }
    if (approvedDelist.length > 0) {
      lines.push(`ลบหุ้นที่เพิกถอน/ไม่พบใน universe ปัจจุบันแล้ว ${approvedDelist.length} ตัว:`);
      for (const t of approvedDelist) {
        lines.push(`  - ${t.ticker}: ลบออกจาก ticker_to_sector และจาก sectors[].tickers bucket ของมัน (ลด count ลง 1 ด้วย)`);
      }
      lines.push('');
    }
    lines.push('ขั้นตอน:');
    lines.push('1. แก้ data/scans/sector_map.json ตามรายการข้างต้น (คงรูปแบบ/การเรียงลำดับเดิม)');
    lines.push('2. รัน python scripts/validate_sector_mapping.py เพื่อยืนยันว่าไม่มี ticker ตกหล่น');
    lines.push('3. build + สรุปการเปลี่ยนแปลงให้ผมดู แล้วรอ confirm ก่อน push');
    return lines.join('\n');
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable - button just won't confirm */ }
  }

  const totalApproved = approvedNew.length + approvedDelist.length;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-white">การเปลี่ยนแปลง Universe ที่รอตรวจสอบ</h2>
        {universeChanges.generated_at && (
          <span className="text-label text-white/25">ตรวจล่าสุด: {fmtThaiDateTime(universeChanges.generated_at)}</span>
        )}
      </div>

      {!hasAny ? (
        <p className="text-label text-white/35">
          ยังไม่พบการเปลี่ยนแปลง (ตรวจทุกวันจันทร์ผ่าน check_universe.py — ถ้ายังไม่เคยรัน จะว่างแบบนี้จนกว่าจะถึงรอบถัดไป)
        </p>
      ) : (
        <>
          {newTickers.length > 0 && (
            <div>
              <h3 className="text-label font-semibold text-[#1D9E75] mb-2">หุ้นใหม่ที่เจอ ({newTickers.length})</h3>
              <div className="space-y-2">
                {newTickers.map(t => {
                  const decision = newDecisions[t.ticker] ?? 'pending';
                  const edit = getSectorEdit(t);
                  return (
                    <div key={t.ticker} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-white/[0.03]">
                      <div className="min-w-[110px]">
                        <div className="text-[13px] font-semibold text-white">{t.ticker}</div>
                        <div className="text-[11px] text-white/35">{t.company_name ?? 'ไม่พบชื่อบริษัท'}</div>
                      </div>
                      <input
                        value={edit.sector}
                        onChange={e => setSectorEdit(t.ticker, 'sector', e.target.value)}
                        placeholder="sector"
                        className="px-2 py-1 bg-white/[0.05] border border-white/[0.08] rounded text-[12px] text-white/80 outline-none focus:border-white/25 w-[130px]"
                      />
                      <input
                        value={edit.subsector}
                        onChange={e => setSectorEdit(t.ticker, 'subsector', e.target.value)}
                        placeholder="subsector"
                        className="px-2 py-1 bg-white/[0.05] border border-white/[0.08] rounded text-[12px] text-white/80 outline-none focus:border-white/25 w-[150px]"
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => setNewDecisions(p => ({ ...p, [t.ticker]: decision === 'approved' ? 'pending' : 'approved' }))}
                          className={`p-1.5 rounded-lg transition-colors ${decision === 'approved' ? 'bg-[#1D9E75]/20 text-[#1D9E75]' : 'text-white/25 hover:text-white/50'}`}
                          title="Approve"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setNewDecisions(p => ({ ...p, [t.ticker]: decision === 'rejected' ? 'pending' : 'rejected' }))}
                          className={`p-1.5 rounded-lg transition-colors ${decision === 'rejected' ? 'bg-[#E24B4A]/20 text-[#E24B4A]' : 'text-white/25 hover:text-white/50'}`}
                          title="Reject"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {delistedTickers.length > 0 && (
            <div>
              <h3 className="text-label font-semibold text-[#E24B4A] mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                หุ้นที่หายจาก universe ({delistedTickers.length})
              </h3>
              <p className="text-[11px] text-white/25 mb-2 flex items-start gap-1.5">
                <HelpCircle size={12} className="flex-shrink-0 mt-0.5" />
                อาจเป็นเพิกถอนจริง หรือแค่ TradingView สแกนไม่เจอชั่วคราว/เป็นกองทุน-REIT ที่ universe หลักไม่รวมอยู่แล้ว — ตรวจสอบก่อน approve เสมอ
              </p>
              <div className="space-y-1.5">
                {delistedTickers.map(t => {
                  const decision = delistDecisions[t.ticker] ?? 'pending';
                  return (
                    <div key={t.ticker} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
                      <span className="text-[13px] font-semibold text-white/80 min-w-[80px]">{t.ticker}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => setDelistDecisions(p => ({ ...p, [t.ticker]: decision === 'approved' ? 'pending' : 'approved' }))}
                          className={`p-1.5 rounded-lg transition-colors ${decision === 'approved' ? 'bg-[#1D9E75]/20 text-[#1D9E75]' : 'text-white/25 hover:text-white/50'}`}
                          title="Approve (ลบออกจาก sector_map)"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setDelistDecisions(p => ({ ...p, [t.ticker]: decision === 'rejected' ? 'pending' : 'rejected' }))}
                          className={`p-1.5 rounded-lg transition-colors ${decision === 'rejected' ? 'bg-[#E24B4A]/20 text-[#E24B4A]' : 'text-white/25 hover:text-white/50'}`}
                          title="Reject (ยังไม่ลบ)"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-white/[0.06] flex items-center gap-3">
            <button
              onClick={handleCopyPrompt}
              disabled={totalApproved === 0}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-label font-semibold transition-colors ${
                totalApproved === 0 ? 'bg-white/[0.04] text-white/20 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Copy size={14} />
              {copied ? 'คัดลอกแล้ว!' : `คัดลอกพรอมต์ (${totalApproved} รายการที่ approve)`}
            </button>
            <span className="text-[11px] text-white/25">แล้วนำไปวางใน Claude Code เพื่อแก้ sector_map.json จริง</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section 3: Current universe browser (search + per-sector counts) ───
function UniverseBrowserCard() {
  const [query, setQuery] = useState('');

  const sectorCounts = useMemo(
    () => sectorMap.sectors.map(s => ({ sector: s.sector, subsector: s.subsector, count: s.count })),
    []
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return Object.entries(sectorMap.ticker_to_sector)
      .filter(([ticker]) => ticker.includes(q))
      .slice(0, 40)
      .map(([ticker, info]) => ({ ticker, ...info }));
  }, [query]);

  const totalTickers = Object.keys(sectorMap.ticker_to_sector).length;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-white">Universe ปัจจุบัน</h2>
        <span className="text-label text-white/30">{totalTickers} หลักทรัพย์ · {sectorMap.sectors.length} sector/subsector</span>
      </div>

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="ค้นหา ticker..."
        className="w-full px-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-label text-white/80 placeholder:text-white/25 outline-none focus:border-white/20"
      />

      {query.trim() ? (
        <div className="divide-y divide-white/[0.04]">
          {searchResults.length === 0 ? (
            <p className="text-label text-white/25 py-3">ไม่พบหลักทรัพย์ที่ตรงกับ &ldquo;{query}&rdquo;</p>
          ) : (
            searchResults.map(r => (
              <div key={r.ticker} className="flex items-center gap-3 py-2">
                <span className="text-[13px] font-semibold text-white w-[70px] flex-shrink-0">{r.ticker}</span>
                <span className="text-label text-white/40 flex-1">{r.sector} · {r.subsector}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                  combinedTickers.has(r.ticker) ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-white/[0.06] text-white/25'
                }`}>
                  {combinedTickers.has(r.ticker) ? 'มีข้อมูล scan' : 'ไม่มีข้อมูล scan'}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {sectorCounts.map(s => (
            <div key={`${s.sector}-${s.subsector}`} className="px-3 py-2 rounded-lg bg-white/[0.03]">
              <div className="text-[11px] text-white/70 font-medium truncate">{s.sector}</div>
              <div className="text-[10px] text-white/30 truncate">{s.subsector}</div>
              <div className="text-[13px] font-bold text-white/90 tabular-nums mt-0.5">{s.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">Settings</h1>
        <p className="text-label text-meta mt-0.5">สุขภาพระบบ · universe หุ้น · การเปลี่ยนแปลงที่รอตรวจสอบ</p>
      </div>
      <SystemHealthCard />
      <PendingChangesCard />
      <UniverseBrowserCard />
    </div>
  );
}
