'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles, TrendingUp, TrendingDown, CircleDollarSign, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';

interface DdmInitialData {
  ticker: string;
  price: number | null;
  dps: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
}

function DdmValuationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTicker = searchParams.get('ticker') ?? '';

  const [inputTicker, setInputTicker] = useState(rawTicker);
  const [activeTicker, setActiveTicker] = useState(rawTicker.toUpperCase().trim());

  // Input states (strings for natural user editing)
  const [dpsStr, setDpsStr] = useState<string>('');
  const [growthStr, setGrowthStr] = useState<string>('4');
  const [rStr, setRStr] = useState<string>('10');
  const [priceStr, setPriceStr] = useState<string>('');

  // Reference data from TradingView
  const [refYield, setRefYield] = useState<number | null>(null);
  const [refPayout, setRefPayout] = useState<number | null>(null);

  // Auto-fill state tracking
  const [autoFilledFields, setAutoFilledFields] = useState<{
    dps?: boolean;
    price?: boolean;
  }>({});
  const [hasAutoFilled, setHasAutoFilled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Sync with URL query param
  useEffect(() => {
    const t = (searchParams.get('ticker') ?? '').toUpperCase().trim();
    setInputTicker(t);
    setActiveTicker(t);
  }, [searchParams]);

  // Fetch initial DDM inputs from TradingView via our API
  useEffect(() => {
    if (!activeTicker) {
      setDpsStr('');
      setPriceStr('');
      setRefYield(null);
      setRefPayout(null);
      setAutoFilledFields({});
      setHasAutoFilled(false);
      setFetchError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setFetchError(null);

    fetch(`/api/ddm-inputs/${encodeURIComponent(activeTicker)}`)
      .then(async res => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'no_data' : 'fetch_failed');
        }
        return res.json() as Promise<DdmInitialData>;
      })
      .then(data => {
        if (!isMounted) return;
        setIsLoading(false);

        const newAutoFilled: typeof autoFilledFields = {};

        if (data.dps != null && Number.isFinite(data.dps)) {
          setDpsStr(data.dps.toString());
          newAutoFilled.dps = true;
        } else {
          setDpsStr('');
        }

        if (data.price != null && Number.isFinite(data.price)) {
          setPriceStr(data.price.toString());
          newAutoFilled.price = true;
        } else {
          setPriceStr('');
        }

        setRefYield(data.dividendYield != null && Number.isFinite(data.dividendYield) ? data.dividendYield : null);
        setRefPayout(data.payoutRatio != null && Number.isFinite(data.payoutRatio) ? data.payoutRatio : null);

        setAutoFilledFields(newAutoFilled);
        setHasAutoFilled(Object.keys(newAutoFilled).length > 0);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
        setHasAutoFilled(false);
        setAutoFilledFields({});
        setRefYield(null);
        setRefPayout(null);
        setFetchError('ไม่พบข้อมูลตั้งต้น — กรอกตัวเลขด้วยตนเอง');
      });

    return () => {
      isMounted = false;
    };
  }, [activeTicker]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const t = inputTicker.toUpperCase().trim();
    if (t) {
      router.push(`/valuation/ddm?ticker=${encodeURIComponent(t)}`);
    } else {
      router.push('/valuation/ddm');
    }
  };

  // Parsed numerical parameters
  const dps = parseFloat(dpsStr);
  const growth = parseFloat(growthStr) / 100;
  const r = parseFloat(rStr) / 100;
  const price = parseFloat(priceStr);

  // Guards
  const isRFinite = Number.isFinite(r);
  const isGFinite = Number.isFinite(growth);
  const isRInvalid = isRFinite && isGFinite && r <= growth;
  const isDpsInvalid = Number.isFinite(dps) && dps <= 0;
  const isDpsMissing = dpsStr.trim() !== '' && (!Number.isFinite(dps) || dps <= 0);

  const isValidInputs =
    Number.isFinite(dps) &&
    dps > 0 &&
    isGFinite &&
    isRFinite &&
    !isRInvalid &&
    Number.isFinite(price) &&
    price > 0;

  // Single-stage Gordon Growth Calculation
  const calculationResults = useMemo(() => {
    if (!isValidInputs) return null;

    const fairValue = (dps * (1 + growth)) / (r - growth);
    if (!Number.isFinite(fairValue)) return null;

    const upside = ((fairValue - price) / price) * 100;
    if (!Number.isFinite(upside)) return null;

    return {
      dps,
      growth,
      r,
      fairValue,
      upside,
      price,
    };
  }, [isValidInputs, dps, growth, r, price]);

  // Sensitivity Matrix Calculations (r x g)
  const sensitivityData = useMemo(() => {
    if (!Number.isFinite(dps) || dps <= 0 || !Number.isFinite(price) || price <= 0) return null;

    const baseRPct = parseFloat(rStr);
    const baseGPct = parseFloat(growthStr);
    if (!Number.isFinite(baseRPct) || !Number.isFinite(baseGPct)) return null;

    const rSteps = [-1.0, -0.5, 0, 0.5, 1.0].map(d => parseFloat((baseRPct + d).toFixed(2)));
    const gSteps = [-1.0, -0.5, 0, 0.5, 1.0].map(d => parseFloat((baseGPct + d).toFixed(2)));

    const rows = rSteps.map(rPct => {
      const rDec = rPct / 100;
      const cols = gSteps.map(gPct => {
        const gDec = gPct / 100;
        if (rDec <= gDec) {
          return {
            rPct,
            gPct,
            fairValue: null,
            upside: null,
            isBase: false,
          };
        }

        const cellFv = (dps * (1 + gDec)) / (rDec - gDec);
        const cellUpside = Number.isFinite(cellFv) ? ((cellFv - price) / price) * 100 : null;
        const isBase = Math.abs(rPct - baseRPct) < 0.001 && Math.abs(gPct - baseGPct) < 0.001;

        return {
          rPct,
          gPct,
          fairValue: Number.isFinite(cellFv) ? cellFv : null,
          upside: Number.isFinite(cellUpside) ? cellUpside : null,
          isBase,
        };
      });

      return { rPct, cols };
    });

    return { rSteps, gSteps, rows, baseRPct, baseGPct };
  }, [dps, growthStr, rStr, price]);

  // Eligibility condition
  const isYieldLow = activeTicker && (refYield == null || refYield < 1.5);
  const isYieldAdequate = activeTicker && refYield != null && refYield >= 1.5;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header & Ticker Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CircleDollarSign size={18} />
            </div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">Dividend Discount Model (DDM Valuation)</h1>
          </div>
          <p className="text-[13px] text-white/40 mt-1">
            ประเมินมูลค่าหุ้นด้วยเงินปันผลคิดลด (Gordon Growth Model) พร้อมตารางความอ่อนไหว Required Return (r) × Dividend Growth (g)
          </p>
        </div>

        {/* Ticker Search Box */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="ค้นหา Ticker เช่น PTT, DELTA"
              value={inputTicker}
              onChange={e => setInputTicker(e.target.value.toUpperCase())}
              className="bg-white/[0.04] border border-white/[0.1] rounded-xl px-3.5 py-2 pl-9 text-[13px] font-bold text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 w-[200px] sm:w-[240px] uppercase"
            />
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-white text-black font-bold text-[12px] rounded-xl hover:bg-white/90 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5"
          >
            {isLoading ? 'กำลังโหลด...' : 'โหลด'}
          </button>
        </form>
      </div>

      {/* ELIGIBILITY GUARD BANNER (แสดงก่อนตารางเสมอ) */}
      {activeTicker && (
        <>
          {isYieldLow && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[13.5px] leading-relaxed flex items-start gap-3 shadow-sm">
              <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold text-amber-200">⚠ คำเตือนความเหมาะสมของโมเดล (Eligibility Guard):</strong>{' '}
                หุ้นนี้จ่ายปันผลน้อย/ไม่จ่าย (yield {refYield != null ? `${refYield.toFixed(2)}%` : '0.00%'}) — DDM ให้ผลไม่มีความหมายกับหุ้นที่ไม่เน้นปันผลหรือหุ้นเติบโต เหมาะกับหุ้นปันผลสม่ำเสมอ (bank, utility, โทรคมนาคม) เท่านั้น
                <div className="text-[12px] text-amber-300/70 mt-1">
                  * ท่านยังสามารถปรับตัวเลขและคำนวณได้ แต่โปรดระมัดระวังว่าผลลัพธ์อาจไม่สะท้อนมูลค่าที่แท้จริง
                </div>
              </div>
            </div>
          )}
          {isYieldAdequate && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[13px] flex items-center gap-2.5 shadow-sm">
              <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
              <span>
                <strong>เหมาะกับการประเมินด้วย DDM:</strong> หุ้นนี้จ่ายปันผลสม่ำเสมอ (Dividend Yield ปัจจุบัน {refYield?.toFixed(2)}% · Payout Ratio {refPayout != null ? `${refPayout.toFixed(1)}%` : '—'})
              </span>
            </div>
          )}
        </>
      )}

      {/* Valuation Parameters Grid */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-white">พารามิเตอร์ประเมินมูลค่า (DDM Inputs)</h2>
            {activeTicker && (
              <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-white font-extrabold text-[12px]">
                {activeTicker}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasAutoFilled && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-400" />
                ค่าตั้งต้นจาก TradingView
              </span>
            )}
            {fetchError && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-bold">
                {fetchError}
              </span>
            )}
          </div>
        </div>

        {/* 4 Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Base DPS */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium flex items-center">
              <span>DPS ปีฐาน (บาท/หุ้น)</span>
              {autoFilledFields.dps && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1.5" title="ดึงจาก TradingView" />
              )}
            </label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 2.10"
              value={dpsStr}
              onChange={e => {
                setDpsStr(e.target.value);
                setAutoFilledFields(prev => ({ ...prev, dps: false }));
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 2. Dividend Growth g (%) */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium">Dividend growth g (%)</label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 4.0"
              value={growthStr}
              onChange={e => setGrowthStr(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 3. Required Return r (%) */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium">Required return r (%)</label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 10.0"
              value={rStr}
              onChange={e => setRStr(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 4. Current Price */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium flex items-center">
              <span>ราคาปัจจุบัน (บาท)</span>
              {autoFilledFields.price && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1.5" title="ดึงจาก TradingView" />
              )}
            </label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 40.50"
              value={priceStr}
              onChange={e => {
                setPriceStr(e.target.value);
                setAutoFilledFields(prev => ({ ...prev, price: false }));
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Reference Metrics Info Bar */}
        {(refYield != null || refPayout != null) && (
          <div className="pt-2 border-t border-white/[0.05] flex flex-wrap items-center gap-4 text-[12px] text-white/60">
            <span className="font-semibold text-white/40">ข้อมูลประกอบ (Reference):</span>
            {refYield != null && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Dividend Yield ปัจจุบัน: <strong className="text-white font-bold">{refYield.toFixed(2)}%</strong>
              </span>
            )}
            {refPayout != null && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Payout Ratio: <strong className="text-white font-bold">{refPayout.toFixed(1)}%</strong>
              </span>
            )}
          </div>
        )}

        {/* Guard: r <= g Error Alert */}
        {isRInvalid && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[13px] flex items-center gap-2.5">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <span>
              <strong>ข้อผิดพลาด:</strong> Required return ต้องมากกว่า dividend growth (ไม่งั้นสูตรระเบิด) — ปัจจุบัน r = {parseFloat(rStr || '0').toFixed(1)}% และ g = {parseFloat(growthStr || '0').toFixed(1)}%
            </span>
          </div>
        )}

        {/* Guard: DPS <= 0 Alert */}
        {isDpsMissing && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[13px] flex items-center gap-2.5">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>
              <strong>ข้อจำกัด:</strong> หุ้นไม่จ่ายปันผล ใช้ DDM ไม่ได้ (DPS ต้องมากกว่า 0 บาท/หุ้น)
            </span>
          </div>
        )}
      </div>

      {/* Output Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Fair Value / หุ้น */}
        <div className="bg-gradient-to-br from-[#181d29] to-[#13161e] border border-emerald-500/30 rounded-2xl p-5 space-y-2 relative shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-emerald-400">Fair Value / หุ้น (มูลค่าเหมาะสม)</span>
            <span className="text-[11px] text-emerald-400/60">Gordon Growth Model</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[28px] font-extrabold text-white tracking-tight">
              {calculationResults != null ? calculationResults.fairValue.toFixed(2) : '—'}
              <span className="text-[13px] font-normal text-white/40 ml-1">บาท</span>
            </span>
          </div>
        </div>

        {/* Card 2: Upside / Downside */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">Upside / Downside</span>
            <span className="text-[11px] text-white/30">vs ราคาปัจจุบัน {calculationResults ? `${price.toFixed(2)} บาท` : ''}</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            {calculationResults?.upside != null ? (
              <span
                className={`text-[20px] font-extrabold px-3 py-1 rounded-xl flex items-center gap-1.5 border ${
                  calculationResults.upside >= 0
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}
              >
                {calculationResults.upside >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                {calculationResults.upside >= 0
                  ? `+${calculationResults.upside.toFixed(1)}%`
                  : `${calculationResults.upside.toFixed(1)}%`}
              </span>
            ) : (
              <span className="text-[24px] font-extrabold text-white/30">—</span>
            )}
          </div>
        </div>

        {/* Card 3: Reference Summary */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">ข้อมูลเงินปันผล</span>
            <span className="text-[11px] text-white/30">TradingView TTM</span>
          </div>
          <div className="space-y-1 pt-1">
            <div className="text-[13px] text-white/80">
              Yield ปัจจุบัน: <strong className="text-white font-bold">{refYield != null ? `${refYield.toFixed(2)}%` : '—'}</strong>
            </div>
            <div className="text-[13px] text-white/80">
              Payout Ratio: <strong className="text-white font-bold">{refPayout != null ? `${refPayout.toFixed(1)}%` : '—'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Formula Explanation Card */}
      {calculationResults && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap font-medium">
            <span className="text-white/50">สูตรการคำนวณ:</span>
            <span className="text-emerald-400 font-bold">
              Gordon Growth: DPS {dps.toFixed(2)} × (1 + {growthStr}%) ÷ ({rStr}% − {growthStr}%)
            </span>
            <span className="text-white/40">=</span>
            <span className="text-white font-extrabold text-[15px]">
              {calculationResults.fairValue.toFixed(2)} บาท
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-white/10 text-white font-extrabold text-[11px] uppercase tracking-wider self-start sm:self-auto">
            Single-Stage DDM
          </span>
        </div>
      )}

      {/* Sensitivity Table: Required Return (r) x Dividend Growth (g) */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-[15px] font-bold text-white">Sensitivity Matrix (Required Return r × Dividend Growth g)</h2>
          <p className="text-[12px] text-white/40 mt-0.5">
            Fair Value / หุ้น (บาท) และ % Upside ตามช่วง Required Return (r) และ Dividend Growth (g)
          </p>
        </div>

        {sensitivityData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-3 text-left text-white/40 font-medium border-b border-white/[0.06] text-[13px]">
                    r \ g
                  </th>
                  {sensitivityData.gSteps.map(gVal => (
                    <th
                      key={gVal}
                      className={`p-3 font-bold border-b border-white/[0.06] text-[13px] ${
                        Math.abs(gVal - sensitivityData.baseGPct) < 0.001 ? 'text-emerald-400' : 'text-white/60'
                      }`}
                    >
                      {gVal.toFixed(1)}% {Math.abs(gVal - sensitivityData.baseGPct) < 0.001 && '(Base)'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivityData.rows.map(row => (
                  <tr key={row.rPct} className="border-b border-white/[0.03]">
                    <td
                      className={`p-3 text-left font-bold text-[13px] ${
                        Math.abs(row.rPct - sensitivityData.baseRPct) < 0.001 ? 'text-emerald-400' : 'text-white/60'
                      }`}
                    >
                      {row.rPct.toFixed(1)}% {Math.abs(row.rPct - sensitivityData.baseRPct) < 0.001 && '(Base)'}
                    </td>
                    {row.cols.map((col, cIdx) => (
                      <td
                        key={cIdx}
                        className={`p-3 transition-all ${
                          col.isBase ? 'ring-2 ring-emerald-400 rounded-lg bg-emerald-500/10 font-extrabold' : ''
                        }`}
                      >
                        {col.fairValue != null && Number.isFinite(col.fairValue) ? (
                          <>
                            <div className="font-bold text-white text-[14px]">{col.fairValue.toFixed(2)}</div>
                            {col.upside != null && Number.isFinite(col.upside) && (
                              <div
                                className={`text-[12px] font-semibold mt-0.5 ${
                                  col.upside >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {col.upside >= 0 ? `+${col.upside.toFixed(1)}%` : `${col.upside.toFixed(1)}%`}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-white/20 italic font-mono text-[14px]">—</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-white/30 text-[13px] italic bg-white/[0.01] rounded-xl border border-white/[0.03]">
            {isRInvalid
              ? 'กรุณาปรับ Required Return (r) ให้มากกว่า Dividend Growth (g) เพื่อแสดงผลตาราง Sensitivity Matrix'
              : 'กรอกข้อมูลพารามิเตอร์ให้ครบถ้วนเพื่อแสดงตาราง Sensitivity Matrix'}
          </div>
        )}
      </div>
    </div>
  );
}

function DdmSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto animate-pulse">
      <div className="h-20 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      <div className="h-48 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      </div>
    </div>
  );
}

export default function DdmValuationPage() {
  return (
    <Suspense fallback={<DdmSkeleton />}>
      <DdmValuationContent />
    </Suspense>
  );
}