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

const TABS = ['แปลง Warrant', 'XD / XR / XW / PP Dilution'] as const;
type Tab = (typeof TABS)[number];

const DILUTION_TYPES = ['XD', 'XW', 'XR', 'PP'] as const;
type DilutionType = (typeof DILUTION_TYPES)[number];

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

// ── XD/XR/XW dilution math ───────────────────────────────────────────────────
// Unified TERP (theoretical ex-rights price) formula — XD is just the special
// case where additionalPrice = 0 (a stock dividend gives new shares for free).
// Verified against the reference spreadsheet's XD/XW/XR examples exactly.
interface DilutionInputs {
  priceBefore: number;
  additionalPrice: number; // 0 for XD, exercise price for XW, subscription price for XR
  oldRatio: number;
  newRatio: number;
  oldShares: number | null; // optional — only needed to show share counts
}
interface DilutionResult {
  newShares: number | null;
  totalShares: number | null;
  dilutionPct: number;
  increasePct: number;
  priceAfter: number;
  priceDilutionPct: number;
}
function computeDilution(inp: DilutionInputs): DilutionResult {
  const denom = inp.oldRatio + inp.newRatio;
  const dilutionPct = denom > 0 ? (inp.newRatio / denom) * 100 : 0;
  const increasePct = inp.oldRatio > 0 ? (inp.newRatio / inp.oldRatio) * 100 : 0;
  const priceAfter = denom > 0 ? (inp.priceBefore * inp.oldRatio + inp.additionalPrice * inp.newRatio) / denom : inp.priceBefore;
  const priceDilutionPct = inp.priceBefore !== 0 ? ((priceAfter - inp.priceBefore) / inp.priceBefore) * 100 : 0;
  const newShares = inp.oldShares != null && inp.oldRatio > 0 ? inp.oldShares * (inp.newRatio / inp.oldRatio) : null;
  const totalShares = inp.oldShares != null && newShares != null ? inp.oldShares + newShares : null;
  return { newShares, totalShares, dilutionPct, increasePct, priceAfter, priceDilutionPct };
}

// ── Private Placement (PP) math ──────────────────────────────────────────────
// Unlike XD/XR/XW, PP has no automatic ex-date on the board — this is a
// theoretical post-money estimate based on total shares outstanding, not a
// ratio. Uses absolute share counts (Total_Shares, PP_Shares), not proportions.
interface PPInputs {
  priceBefore: number;
  totalShares: number;
  ppShares: number;
  ppPrice: number;
}
interface PPResult {
  theoreticalPrice: number;
  controlDilutionPct: number;
  priceDilutionPct: number;
}
function computePP(inp: PPInputs): PPResult {
  const denom = inp.totalShares + inp.ppShares;
  const theoreticalPrice = denom > 0
    ? (inp.priceBefore * inp.totalShares + inp.ppPrice * inp.ppShares) / denom
    : inp.priceBefore;
  const controlDilutionPct = denom > 0 ? (inp.ppShares / denom) * 100 : 0;
  const priceDilutionPct = inp.priceBefore !== 0 ? ((theoreticalPrice - inp.priceBefore) / inp.priceBefore) * 100 : 0;
  return { theoreticalPrice, controlDilutionPct, priceDilutionPct };
}

// ── Shared result-display helpers (bigger main figures per spec) ────────────
function dilutionTierColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs > 10) return 'text-[#E24B4A]';
  if (abs >= 5) return 'text-[#F2C94C]';
  return 'text-white/50';
}
function MainResult({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-2 pb-2.5">
      <div className="text-[13px] text-white/40 mb-1">{label}</div>
      <div className="text-[30px] font-semibold text-white tabular-nums leading-tight">{value}</div>
    </div>
  );
}
function DilutionDisplay({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[13px] text-white/40">{label}</span>
      <span className={`text-[20px] font-bold tabular-nums ${dilutionTierColor(pct)}`}>
        {pct >= 0 ? '+' : ''}{fmt(pct, 2)}%
      </span>
    </div>
  );
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
  label, value, onChange, unit, decimals = 4, big = false,
}: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; decimals?: number; big?: boolean;
}) {
  return (
    <div className={big ? 'bg-white/[0.03] rounded-lg px-3.5 py-3' : 'bg-white/[0.03] rounded-lg px-3 py-2.5'}>
      <div className={big ? 'text-[13px] text-white/40 mb-1.5' : 'text-[11px] text-white/35 mb-1'}>{label}</div>
      <div className="flex items-baseline gap-1.5">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step="any"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className={`w-full bg-transparent font-semibold text-white tabular-nums outline-none border-b border-transparent focus:border-white/25 transition-colors ${big ? 'text-[16px]' : 'text-[15px]'}`}
        />
        {unit && <span className={big ? 'text-[13px] text-white/30 flex-shrink-0' : 'text-[11px] text-white/30 flex-shrink-0'}>{unit}</span>}
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

// ── One XD / XW / XR dilution card ───────────────────────────────────────────
function DilutionBlock({
  title, priceLabel, additionalPriceLabel, showShares, accentColor, warrantMode = false,
}: {
  title: string; priceLabel: string; additionalPriceLabel: string | null; showShares: boolean; accentColor: string; warrantMode?: boolean;
}) {
  const [priceBefore, setPriceBefore] = useState(0);
  const [additionalPrice, setAdditionalPrice] = useState(0);
  const [oldRatio, setOldRatio] = useState(1);
  const [newRatio, setNewRatio] = useState(1);
  // XW-only: raw warrant units and their conversion ratio, multiplied together
  // to get the actual new-share count — entering the raw unit count directly
  // into "new ratio" would silently understate dilution whenever the
  // conversion ratio isn't 1:1 (e.g. adjusted after a prior corporate action).
  const [warrantUnits, setWarrantUnits] = useState(1);
  const [conversionRatio, setConversionRatio] = useState(1);
  const [oldSharesInput, setOldSharesInput] = useState('');

  const oldShares = oldSharesInput.trim() ? parseFloat(oldSharesInput) : null;
  const effectiveNewRatio = warrantMode ? warrantUnits * conversionRatio : newRatio;
  const result = useMemo(
    () => computeDilution({ priceBefore, additionalPrice: additionalPriceLabel ? additionalPrice : 0, oldRatio, newRatio: effectiveNewRatio, oldShares }),
    [priceBefore, additionalPrice, additionalPriceLabel, oldRatio, effectiveNewRatio, oldShares]
  );

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderTop: `3px solid ${accentColor}` }}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-[14px] font-bold text-white">{title}</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className={`grid gap-2.5 grid-cols-2 sm:grid-cols-3 ${warrantMode ? 'lg:grid-cols-4' : ''}`}>
          <FieldInput big label={priceLabel} value={priceBefore} onChange={setPriceBefore} unit="บาท" decimals={2} />
          {additionalPriceLabel && (
            <FieldInput big label={additionalPriceLabel} value={additionalPrice} onChange={setAdditionalPrice} unit="บาท" decimals={2} />
          )}
          <FieldInput big label="สัดส่วน หุ้นเดิม" value={oldRatio} onChange={setOldRatio} decimals={2} />
          {warrantMode ? (
            <>
              <FieldInput big label="จำนวน Warrant ที่ใช้สิทธิ" value={warrantUnits} onChange={setWarrantUnits} decimals={0} />
              <FieldInput big label="อัตราแปลงสภาพ (หุ้นแม่/Warrant)" value={conversionRatio} onChange={setConversionRatio} decimals={4} />
            </>
          ) : (
            <FieldInput big label="สัดส่วน หุ้นใหม่" value={newRatio} onChange={setNewRatio} decimals={2} />
          )}
        </div>
        {warrantMode && (
          <p className="text-[11px] text-white/25 -mt-1">
            = {fmt(effectiveNewRatio, 4)} หุ้นใหม่ (ปรับอัตราแปลงสภาพแล้ว) ใช้แทนค่า &quot;สัดส่วน หุ้นใหม่&quot;
          </p>
        )}

        {showShares && (
          <div className="bg-white/[0.03] rounded-lg px-3.5 py-3">
            <div className="text-[13px] text-white/40 mb-1.5">จำนวนหุ้นเดิม (ไม่บังคับ)</div>
            <input
              type="number"
              value={oldSharesInput}
              step="any"
              onChange={e => setOldSharesInput(e.target.value)}
              placeholder="ใส่ถ้าต้องการดูจำนวนหุ้นที่เพิ่ม"
              className="w-full bg-transparent text-[16px] font-semibold text-white tabular-nums outline-none placeholder:text-white/20 placeholder:text-[12px] placeholder:font-normal"
            />
          </div>
        )}

        <div className="pt-1">
          <ResultRow label="Control Dilution" value={`${fmt(result.dilutionPct, 2)}%`} />
          <ResultRow label="มีหุ้นเพิ่ม" value={`${fmt(result.increasePct, 2)}%`} />
          {showShares && oldShares != null && (
            <>
              <ResultRow label="จำนวนหุ้นเพิ่ม" value={fmt(result.newShares, 0)} />
              <ResultRow label="จำนวนหุ้นใหม่ (รวม)" value={fmt(result.totalShares, 0)} />
            </>
          )}
          <MainResult label={`ราคาวัน ${title.split(' ')[0]}`} value={`${fmt(result.priceAfter, 2)} บาท`} />
          <DilutionDisplay label="Price Dilution" pct={result.priceDilutionPct} />
        </div>
      </div>
    </div>
  );
}

// ── Private Placement card ────────────────────────────────────────────────────
function PPBlock() {
  const [priceBefore, setPriceBefore] = useState(0);
  const [totalShares, setTotalShares] = useState(0);
  const [ppShares, setPpShares] = useState(0);
  const [ppPrice, setPpPrice] = useState(0);

  const result = useMemo(
    () => computePP({ priceBefore, totalShares, ppShares, ppPrice }),
    [priceBefore, totalShares, ppShares, ppPrice]
  );

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderTop: '3px solid #E67E22' }}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-[14px] font-bold text-white">Private Placement (PP)</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
          <FieldInput big label="ราคาปิดก่อนประกาศ" value={priceBefore} onChange={setPriceBefore} unit="บาท" decimals={2} />
          <FieldInput big label="ราคาเสนอขาย PP" value={ppPrice} onChange={setPpPrice} unit="บาท" decimals={2} />
          <FieldInput big label="จำนวนหุ้นเดิมทั้งหมด" value={totalShares} onChange={setTotalShares} unit="หุ้น" decimals={0} />
          <FieldInput big label="จำนวนหุ้น PP ใหม่" value={ppShares} onChange={setPpShares} unit="หุ้น" decimals={0} />
        </div>

        <div className="px-3.5 py-3 rounded-lg bg-[#F2C94C]/10 border border-[#F2C94C]/25 text-[12px] text-[#F2C94C] leading-relaxed">
          ⚠️ PP ไม่มี Ex-date บนกระดาน ราคานี้เป็นการประเมินทางทฤษฎีเท่านั้น ราคาจริงขึ้นกับกลไกตลาด
        </div>

        <div className="pt-1">
          <MainResult label="ราคาประเมินทางทฤษฎี (Post-Money)" value={`${fmt(result.theoreticalPrice, 2)} บาท`} />
          <DilutionDisplay label="% Control Dilution" pct={result.controlDilutionPct} />
        </div>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('แปลง Warrant');
  const [dilutionType, setDilutionType] = useState<DilutionType>('XD');

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
        <div className="space-y-4">
          <p className="text-[12px] text-white/35">
            คำนวณราคาปรับฐาน (ราคาทฤษฎีหลังขึ้นเครื่องหมาย) และสัดส่วนหุ้นที่เพิ่มขึ้น — กรอกตัวเลขเองได้เลย
          </p>

          {/* Segmented control — one dilution type shown at a time */}
          <div className="flex gap-1.5 flex-wrap">
            {DILUTION_TYPES.map(d => (
              <button
                key={d}
                onClick={() => setDilutionType(d)}
                className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${
                  dilutionType === d ? 'bg-white/10 text-white border border-white/20' : 'bg-white/[0.03] text-white/40 border border-transparent hover:text-white/70'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {dilutionType === 'XD' && (
            <DilutionBlock
              title="XD Dilution"
              priceLabel="ราคาก่อน XD"
              additionalPriceLabel={null}
              showShares
              accentColor="#1D9E75"
            />
          )}
          {dilutionType === 'XW' && (
            <DilutionBlock
              title="XW Dilution"
              priceLabel="ราคาก่อน XW"
              additionalPriceLabel="Exercise Price"
              showShares
              warrantMode
              accentColor="#7F77DD"
            />
          )}
          {dilutionType === 'XR' && (
            <DilutionBlock
              title="XR Dilution"
              priceLabel="ราคาก่อน XR"
              additionalPriceLabel="ราคาเพิ่มทุน"
              showShares
              accentColor="#378ADD"
            />
          )}
          {dilutionType === 'PP' && <PPBlock />}

          <p className="text-[10px] text-white/20 text-right">
            {dilutionType === 'PP'
              ? 'สูตร: ราคาทฤษฎี = (ราคาก่อน × หุ้นเดิมทั้งหมด + ราคา PP × หุ้น PP ใหม่) / (หุ้นเดิมทั้งหมด + หุ้น PP ใหม่)'
              : 'สูตร: ราคาทฤษฎี = (ราคาก่อน × สัดส่วนหุ้นเดิม + ราคาที่จ่ายเพิ่ม × สัดส่วนหุ้นใหม่) / (สัดส่วนหุ้นเดิม + สัดส่วนหุ้นใหม่)'}
          </p>
        </div>
      )}
    </div>
  );
}
