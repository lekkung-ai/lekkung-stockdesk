'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Search, RefreshCw, Loader2 } from 'lucide-react';
import { ALL_SET_TICKERS } from '@/lib/setTickers';
import type { WarrantInfo } from '@/app/api/warrant-info/[parent]/route';

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function isoToThaiLabel(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}
function fmt(n: number | null, decimals = 4): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const TABS = ['แปลง Warrant', 'XD / XR / XW Dilution'] as const;
type Tab = (typeof TABS)[number];

// ── Warrant conversion math (verified against the reference spreadsheet) ────
interface ConversionInputs {
  childUnits: number;
  exerciseRatio: number; // 1 หุ้นลูก : exerciseRatio หุ้นแม่
  childPrice: number;
  parentPrice: number;
  exercisePrice: number;
}
interface ConversionResult {
  parentSharesFromExercise: number;
  additionalCashNeeded: number;
  totalCashUsed: number;
  costPerParentShare: number | null;
  diffVsParent: number | null;
  profitPct: number | null;
}
function computeConversion(inp: ConversionInputs): ConversionResult {
  const parentSharesFromExercise = inp.childUnits * inp.exerciseRatio;
  const additionalCashNeeded = inp.exercisePrice * parentSharesFromExercise;
  const totalCashUsed = inp.childPrice * inp.childUnits + additionalCashNeeded;
  const costPerParentShare = parentSharesFromExercise > 0 ? totalCashUsed / parentSharesFromExercise : null;
  const diffVsParent = costPerParentShare != null ? inp.parentPrice - costPerParentShare : null;
  const profitPct = diffVsParent != null && costPerParentShare ? (diffVsParent / costPerParentShare) * 100 : null;
  return { parentSharesFromExercise, additionalCashNeeded, totalCashUsed, costPerParentShare, diffVsParent, profitPct };
}

// ── Lightweight parent-ticker autocomplete ───────────────────────────────────
function TickerAutocomplete({
  value, onChange, onSubmit, placeholder,
}: {
  value: string; onChange: (v: string) => void; onSubmit: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOut = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q) return [];
    return ALL_SET_TICKERS.filter(t => t.startsWith(q)).slice(0, 8);
  }, [value]);

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-[180px]">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Enter') { onSubmit(value.trim().toUpperCase()); setOpen(false); } }}
        className="w-full pl-9 pr-3 py-2.5 bg-[#13161e] border border-white/[0.08] rounded-xl text-[14px] text-white/85 placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 z-20 bg-[#181b24] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
          {matches.map(t => (
            <button
              key={t}
              onClick={() => { onChange(t); onSubmit(t); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[13px] text-white/75 hover:bg-white/[0.06] transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  label, value, onChange, unit, decimals = 4,
}: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; decimals?: number;
}) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
      <div className="text-[11px] text-white/35 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step="any"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent text-[15px] font-semibold text-white tabular-nums outline-none border-b border-transparent focus:border-white/25 transition-colors"
        />
        {unit && <span className="text-[11px] text-white/30 flex-shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight, sub }: { label: string; value: string; highlight?: 'pos' | 'neg' | 'main'; sub?: string }) {
  const color =
    highlight === 'pos' ? 'text-[#1D9E75]' :
    highlight === 'neg' ? 'text-[#E24B4A]' :
    highlight === 'main' ? 'text-[#F9C942]' : 'text-white/80';
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
      <div>
        <div className="text-[13.5px] text-white/60">{label}</div>
        {sub && <div className="text-[11px] text-white/25 mt-0.5">{sub}</div>}
      </div>
      <div className={`text-[16px] font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export default function CalculatorPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('แปลง Warrant');

  const [parentInput, setParentInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warrantList, setWarrantList] = useState<WarrantInfo[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');

  const [childUnits, setChildUnits] = useState(1);
  const [exerciseRatio, setExerciseRatio] = useState(1);
  const [childPrice, setChildPrice] = useState(0);
  const [parentPrice, setParentPrice] = useState(0);
  const [exercisePrice, setExercisePrice] = useState(0);
  const [maturityDate, setMaturityDate] = useState<string | null>(null);
  const [parentUsed, setParentUsed] = useState('');

  const fetchWarrantData = useCallback(async (parentTicker: string) => {
    const p = parentTicker.trim().toUpperCase();
    if (!p) return;
    setLoading(true);
    setError(null);
    setWarrantList([]);
    try {
      const [warrantRes, quoteRes] = await Promise.all([
        fetch(`/api/warrant-info/${encodeURIComponent(p)}`),
        fetch(`/api/quote/${encodeURIComponent(p)}`),
      ]);

      const warrantData = warrantRes.ok ? await warrantRes.json() : { warrants: [] };
      const warrants: WarrantInfo[] = warrantData.warrants ?? [];
      const quoteData = quoteRes.ok ? await quoteRes.json() : null;

      if (warrants.length === 0) {
        setError(`ไม่พบ warrant ที่ยังซื้อขายอยู่ของ ${p}`);
        return;
      }

      setParentUsed(p);
      setWarrantList(warrants);
      const first = warrants[0];
      setSelectedSymbol(first.symbol);
      setExerciseRatio(first.exerciseRatio);
      setChildPrice(first.childPrice);
      setExercisePrice(first.exercisePrice);
      setMaturityDate(first.maturityDate);
      if (quoteData?.price != null) setParentPrice(quoteData.price);
    } catch {
      setError('ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSelectWarrant(symbol: string) {
    const w = warrantList.find(x => x.symbol === symbol);
    if (!w) return;
    setSelectedSymbol(symbol);
    setExerciseRatio(w.exerciseRatio);
    setChildPrice(w.childPrice);
    setExercisePrice(w.exercisePrice);
    setMaturityDate(w.maturityDate);
  }

  const result = useMemo(
    () => computeConversion({ childUnits, exerciseRatio, childPrice, parentPrice, exercisePrice }),
    [childUnits, exerciseRatio, childPrice, parentPrice, exercisePrice]
  );

  const hasData = warrantList.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <Calculator size={18} className="text-[#7F77DD]" />
        <div>
          <h1 className="text-[18px] font-bold text-white">เครื่องคำนวณ Warrant / Dilution</h1>
          <p className="text-[12px] text-white/35 mt-0.5">คำนวณความคุ้มค่าของการแปลง Warrant เป็นหุ้นแม่</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1.5 border-b border-white/[0.07]">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-[13.5px] font-semibold transition-colors border-b-2 -mb-px ${
              tab === t ? 'text-white border-[#7F77DD]' : 'text-white/35 border-transparent hover:text-white/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'แปลง Warrant' ? (
        <div className="space-y-4">
          {/* Ticker input */}
          <div className="flex flex-wrap gap-2 items-center">
            <TickerAutocomplete
              value={parentInput}
              onChange={setParentInput}
              onSubmit={fetchWarrantData}
              placeholder="พิมพ์ชื่อหุ้นแม่ เช่น TRUBB แล้วกด Enter"
            />
            <button
              onClick={() => fetchWarrantData(parentInput)}
              disabled={loading || !parentInput.trim()}
              className="px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-[#7F77DD]/15 text-[#7F77DD] hover:bg-[#7F77DD]/25 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              ดึงข้อมูล
            </button>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#E24B4A]/10 border border-[#E24B4A]/25 text-[13px] text-[#E24B4A]">
              {error}
            </div>
          )}

          {/* Warrant selector, when parent has multiple */}
          {hasData && warrantList.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {warrantList.map(w => (
                <button
                  key={w.symbol}
                  onClick={() => handleSelectWarrant(w.symbol)}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
                    selectedSymbol === w.symbol ? 'bg-[#7F77DD] text-white' : 'bg-white/[0.05] text-white/50 hover:text-white/80'
                  }`}
                >
                  {w.symbol}
                </button>
              ))}
            </div>
          )}

          {hasData && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  onClick={() => router.push(`/stock/${parentUsed}`)}
                  className="text-[13px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300"
                >
                  {parentUsed}
                </span>
                <span className="text-white/25">→</span>
                <span className="text-[13px] font-semibold text-white/80">{selectedSymbol}</span>
                {maturityDate && (
                  <span className="text-[11px] text-white/30 ml-1">หมดอายุ {isoToThaiLabel(maturityDate)}</span>
                )}
                <span className="text-[10px] text-white/20 ml-auto">ดึงราคาสด · แก้ตัวเลขด้านล่างได้เอง</span>
              </div>

              {/* Editable inputs */}
              <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <FieldInput label="จำนวนหุ้นลูก" value={childUnits} onChange={setChildUnits} unit="หน่วย" decimals={0} />
                  <FieldInput label="อัตราส่วนใช้สิทธิ (1 หุ้นลูก : X หุ้นแม่)" value={exerciseRatio} onChange={setExerciseRatio} />
                  <FieldInput label="ราคาหุ้นลูกต่อหน่วย" value={childPrice} onChange={setChildPrice} unit="บาท" decimals={2} />
                  <FieldInput label="ราคาหุ้นแม่" value={parentPrice} onChange={setParentPrice} unit="บาท" decimals={2} />
                  <FieldInput label="ราคาใช้สิทธิ (Exercise Price)" value={exercisePrice} onChange={setExercisePrice} unit="บาท" decimals={2} />
                </div>
              </div>

              {/* Computed results */}
              <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4" style={{ borderLeft: '3px solid #7F77DD' }}>
                <h2 className="text-[13px] font-semibold text-white mb-2">ผลการคำนวณ</h2>
                <ResultRow
                  label="จำนวนหุ้นแม่จากการใช้สิทธิ"
                  sub={`${fmt(childUnits, 0)} × ${fmt(exerciseRatio)}`}
                  value={`${fmt(result.parentSharesFromExercise)} หุ้น`}
                />
                <ResultRow
                  label="เงินที่ต้องเพิ่มตอนใช้สิทธิ"
                  sub={`${fmt(exercisePrice, 2)} × ${fmt(result.parentSharesFromExercise)}`}
                  value={`${fmt(result.additionalCashNeeded)} บาท`}
                />
                <ResultRow
                  label="เงินทั้งหมดที่ใช้ (ค่าวอร์แรนต์ + ค่าใช้สิทธิ)"
                  value={`${fmt(result.totalCashUsed)} บาท`}
                />
                <ResultRow
                  label="ได้ 1 หุ้นแม่ในราคาต้นทุน"
                  highlight="main"
                  value={`${fmt(result.costPerParentShare)} บาท`}
                />
                <ResultRow
                  label="ส่วนต่างเทียบราคาหุ้นแม่ปัจจุบัน"
                  value={`${result.diffVsParent != null && result.diffVsParent >= 0 ? '+' : ''}${fmt(result.diffVsParent)} บาท`}
                  highlight={result.diffVsParent != null ? (result.diffVsParent >= 0 ? 'pos' : 'neg') : undefined}
                />
                <ResultRow
                  label="% กำไร/ขาดทุน จากการแปลงสิทธิ"
                  value={`${result.profitPct != null && result.profitPct >= 0 ? '+' : ''}${fmt(result.profitPct, 2)}%`}
                  highlight={result.profitPct != null ? (result.profitPct >= 0 ? 'pos' : 'neg') : undefined}
                  sub={result.profitPct != null && result.profitPct < 0 ? 'ติดลบ = แปลงสิทธิแล้วต้นทุนแพงกว่าซื้อหุ้นแม่ตรงๆ' : undefined}
                />
              </div>
            </>
          )}

          {!hasData && !loading && !error && (
            <div className="py-16 text-center">
              <p className="text-[13px] text-white/30">พิมพ์ชื่อหุ้นแม่ที่มี warrant แล้วกด Enter หรือปุ่ม &quot;ดึงข้อมูล&quot;</p>
              <p className="text-[11px] text-white/20 mt-1">ตัวอย่าง: TRUBB, NOBLE, JAS, BTS</p>
            </div>
          )}

          <p className="text-[10px] text-white/20 text-right">
            แหล่งข้อมูล: Settrade (ราคา warrant/exercise price/ratio) · Yahoo Finance (ราคาหุ้นแม่) · อัปเดตทุก 5 นาที
          </p>
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-[14px] text-white/30">กำลังพัฒนา — เร็วๆ นี้</p>
          <p className="text-[12px] text-white/20 mt-1">เครื่องคำนวณ Dilution จาก XD / XR / XW</p>
        </div>
      )}
    </div>
  );
}
