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

function WarrantConversionChart({
  childPrice,
  exerciseRatio,
  exercisePrice,
  parentPrice,
  costPerParentShare,
  profitPct,
}: {
  childPrice: number;
  exerciseRatio: number;
  exercisePrice: number;
  parentPrice: number;
  costPerParentShare: number | null;
  profitPct: number | null;
}) {
  if (costPerParentShare == null || costPerParentShare <= 0) return null;

  const pCurrent = parentPrice > 0 ? parentPrice : costPerParentShare;
  const pMax = Math.max(costPerParentShare * 1.6, pCurrent * 1.6, 5);
  const pMin = 0;

  const maxProfit = ((pMax - costPerParentShare) / costPerParentShare) * 100;

  const width = 600;
  const height = 250;
  const margin = { top: 40, right: 35, bottom: 45, left: 55 };
  const graphW = width - margin.left - margin.right;
  const graphH = height - margin.top - margin.bottom;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interactivePrice, setInteractivePrice] = useState<number>(pCurrent);
  const [isPointerDown, setIsPointerDown] = useState(false);

  // Keep interactivePrice synced if parentPrice changes from ticker switch
  useEffect(() => {
    setInteractivePrice(pCurrent);
  }, [pCurrent]);

  const getSvgX = (price: number) => {
    const ratio = Math.max(0, Math.min(1, (price - pMin) / (pMax - pMin)));
    return margin.left + ratio * graphW;
  };

  const yUpper = Math.max(100, Math.ceil(maxProfit / 20) * 20);
  const yLower = -100;

  const getSvgY = (pct: number) => {
    const clampedPct = Math.max(yLower, Math.min(yUpper, pct));
    const ratio = (clampedPct - yLower) / (yUpper - yLower);
    return margin.top + (1 - ratio) * graphH;
  };

  const updatePriceFromClientX = useCallback((clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const clampedSvgX = Math.max(margin.left, Math.min(width - margin.right, svgX));
    const ratio = (clampedSvgX - margin.left) / graphW;
    const rawPrice = pMin + ratio * (pMax - pMin);
    const roundedPrice = Math.max(0, Math.round(rawPrice * 100) / 100);
    setInteractivePrice(roundedPrice);
  }, [width, margin.left, margin.right, graphW, pMin, pMax]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsPointerDown(true);
    updatePriceFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // Desktop hover or active drag
    if (e.pointerType === 'mouse' || isPointerDown) {
      updatePriceFromClientX(e.clientX);
    }
  };

  const handlePointerUp = () => setIsPointerDown(false);

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      updatePriceFromClientX(e.touches[0].clientX);
    }
  };

  const zeroY = getSvgY(0);
  const breakevenX = getSvgX(costPerParentShare);
  const currentX = getSvgX(pCurrent);
  const currentY = getSvgY(profitPct ?? 0);

  const xStart = getSvgX(0);
  const yStart = getSvgY(-100);
  const xEnd = getSvgX(pMax);
  const yEnd = getSvgY(maxProfit);

  // Interactive point math (formula profitPct = (X - costPerParentShare) / costPerParentShare * 100)
  const interactiveProfitPct = ((interactivePrice - costPerParentShare) / costPerParentShare) * 100;
  const interactiveX = getSvgX(interactivePrice);
  const interactiveY = getSvgY(interactiveProfitPct);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-[14px] font-bold text-white flex items-center gap-2">
            <span>📈 กราฟเปรียบเทียบต้นทุนแปลงสิทธิ vs ราคาตลาด</span>
          </h3>
          <p className="text-[11.5px] text-white/40 mt-0.5">
            แกน X = ราคาหุ้นแม่ตลาด | แกน Y = %กำไร/ขาดทุนจากการแปลงสิทธิ · <span className="text-[#A78BFA] font-medium">💡 แตะหรือลากบนกราฟเพื่อทดลองเปลี่ยนราคา</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/50" /> แปลงแล้วคุ้ม (% &gt; 0)
          </span>
          <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/30 border border-rose-500/50" /> แปลงแล้วไม่คุ้ม (% &lt; 0)
          </span>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto text-xs select-none cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchStart={(e) => updatePriceFromClientX(e.touches[0].clientX)}
          onTouchMove={handleTouchMove}
        >
          <defs>
            <linearGradient id="greenArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#1D9E75" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="redArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E24B4A" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#E24B4A" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          {/* Shaded Profit Area (Green) */}
          <polygon
            points={`${breakevenX},${zeroY} ${xEnd},${zeroY} ${xEnd},${yEnd}`}
            fill="url(#greenArea)"
          />

          {/* Shaded Loss Area (Red) */}
          <polygon
            points={`${xStart},${yStart} ${breakevenX},${zeroY} ${xStart},${zeroY}`}
            fill="url(#redArea)"
          />

          {/* Grid lines */}
          <line x1={margin.left} y1={zeroY} x2={width - margin.right} y2={zeroY} stroke="#ffffff" strokeOpacity="0.25" strokeDasharray="3 3" />
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#ffffff" strokeOpacity="0.15" />
          <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#ffffff" strokeOpacity="0.15" />

          {/* Conversion Line */}
          <line x1={xStart} y1={yStart} x2={xEnd} y2={yEnd} stroke="#7F77DD" strokeWidth="2.5" />

          {/* Breakeven Marker (at P = costPerParentShare) */}
          <line x1={breakevenX} y1={margin.top} x2={breakevenX} y2={height - margin.bottom} stroke="#F9C942" strokeWidth="1.5" strokeDasharray="4 4" />
          <circle cx={breakevenX} cy={zeroY} r="4" fill="#F9C942" />
          <text x={breakevenX} y={margin.top - 14} textAnchor="middle" fill="#F9C942" fontSize="10" fontWeight="bold">
            จุดคุ้มทุนแปลง {costPerParentShare.toFixed(2)} บาท (0%)
          </text>

          {/* Current Stock Price Marker (at P = parentPrice) */}
          {parentPrice > 0 && (
            <>
              <line x1={currentX} y1={margin.top} x2={currentX} y2={height - margin.bottom} stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="2 2" />
              <circle cx={currentX} cy={currentY} r="4.5" fill="#38BDF8" stroke="#13161e" strokeWidth="1.5" />
              <g transform={`translate(${currentX}, ${currentY > zeroY ? Math.min(currentY + 18, height - margin.bottom - 10) : Math.max(currentY - 12, margin.top + 15)})`}>
                <rect
                  x="-70"
                  y="-10"
                  width="140"
                  height="20"
                  rx="5"
                  fill="#1E293B"
                  stroke="#38BDF8"
                  strokeWidth="1"
                />
                <text x="0" y="3" textAnchor="middle" fill="#38BDF8" fontSize="10" fontWeight="bold">
                  ราคาปัจจุบัน {parentPrice.toFixed(2)} ({profitPct != null && profitPct >= 0 ? '+' : ''}{profitPct?.toFixed(2)}%)
                </text>
              </g>
            </>
          )}

          {/* Interactive Draggable/Hover Marker & Tooltip */}
          {interactivePrice != null && (
            <>
              <line
                x1={interactiveX}
                y1={margin.top}
                x2={interactiveX}
                y2={height - margin.bottom}
                stroke="#A78BFA"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
              <circle
                cx={interactiveX}
                cy={interactiveY}
                r="6.5"
                fill="#A78BFA"
                stroke="#ffffff"
                strokeWidth="2"
                className="drop-shadow-md"
              />
              {/* Dynamic Interactive Tooltip Card */}
              <g transform={`translate(${Math.max(margin.left + 90, Math.min(width - margin.right - 90, interactiveX))}, ${interactiveY > zeroY ? Math.max(interactiveY - 32, margin.top + 20) : Math.min(interactiveY + 28, height - margin.bottom - 20)})`}>
                <rect
                  x="-110"
                  y="-13"
                  width="220"
                  height="26"
                  rx="6"
                  fill="#181028"
                  stroke="#A78BFA"
                  strokeWidth="1.5"
                  className="shadow-2xl"
                />
                <text x="0" y="3" textAnchor="middle" fontSize="11" fontWeight="bold">
                  <tspan fill="#A78BFA">ราคาหุ้นแม่ = {interactivePrice.toFixed(2)}</tspan>
                  <tspan fill="#ffffff" opacity="0.6"> → </tspan>
                  <tspan fill={interactiveProfitPct >= 0 ? '#1D9E75' : '#E24B4A'}>
                    {interactiveProfitPct >= 0 ? '+' : ''}{interactiveProfitPct.toFixed(2)}%
                  </tspan>
                </text>
              </g>
            </>
          )}

          {/* X Axis Labels */}
          <text x={margin.left} y={height - 12} fill="#ffffff" opacity="0.4" fontSize="10" textAnchor="start">
            0.00 บาท
          </text>
          <text x={width - margin.right} y={height - 12} fill="#ffffff" opacity="0.4" fontSize="10" textAnchor="end">
            {pMax.toFixed(2)} บาท
          </text>

          {/* Y Axis Labels */}
          <text x={margin.left - 8} y={margin.top + 5} fill="#1D9E75" fontSize="10" textAnchor="end" fontWeight="bold">
            +{yUpper}%
          </text>
          <text x={margin.left - 8} y={zeroY + 3} fill="#ffffff" opacity="0.5" fontSize="10" textAnchor="end">
            0%
          </text>
          <text x={margin.left - 8} y={height - margin.bottom - 5} fill="#E24B4A" fontSize="10" textAnchor="end" fontWeight="bold">
            -100%
          </text>
        </svg>
      </div>
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

              {/* Warrant Conversion Payoff Chart */}
              <WarrantConversionChart
                childPrice={childPrice}
                exerciseRatio={exerciseRatio}
                exercisePrice={exercisePrice}
                parentPrice={parentPrice}
                costPerParentShare={result.costPerParentShare}
                profitPct={result.profitPct}
              />
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
