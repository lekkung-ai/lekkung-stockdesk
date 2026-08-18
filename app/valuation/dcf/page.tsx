'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles, TrendingUp, TrendingDown, Calculator, AlertTriangle } from 'lucide-react';

interface DcfInitialData {
  ticker: string;
  price: number | null;
  fcf: number | null;
  netDebt: number | null;
  shares: number | null;
}

function DcfValuationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTicker = searchParams.get('ticker') ?? '';

  const [inputTicker, setInputTicker] = useState(rawTicker);
  const [activeTicker, setActiveTicker] = useState(rawTicker.toUpperCase().trim());

  // Input states (strings for natural user editing)
  const [fcfStr, setFcfStr] = useState<string>('');
  const [growthStr, setGrowthStr] = useState<string>('6');
  const [nYearsStr, setNYearsStr] = useState<string>('10');
  const [terminalGrowthStr, setTerminalGrowthStr] = useState<string>('2.5');
  const [waccStr, setWaccStr] = useState<string>('9');
  const [netDebtStr, setNetDebtStr] = useState<string>('');
  const [sharesStr, setSharesStr] = useState<string>('');
  const [priceStr, setPriceStr] = useState<string>('');

  // Auto-fill state tracking
  const [autoFilledFields, setAutoFilledFields] = useState<{
    fcf?: boolean;
    netDebt?: boolean;
    shares?: boolean;
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

  // Fetch initial DCF inputs from TradingView via our API
  useEffect(() => {
    if (!activeTicker) {
      setFcfStr('');
      setNetDebtStr('');
      setSharesStr('');
      setPriceStr('');
      setAutoFilledFields({});
      setHasAutoFilled(false);
      setFetchError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setFetchError(null);

    fetch(`/api/dcf-inputs/${encodeURIComponent(activeTicker)}`)
      .then(async res => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'no_data' : 'fetch_failed');
        }
        return res.json() as Promise<DcfInitialData>;
      })
      .then(data => {
        if (!isMounted) return;
        setIsLoading(false);

        const newAutoFilled: typeof autoFilledFields = {};

        if (data.fcf != null && Number.isFinite(data.fcf)) {
          setFcfStr(data.fcf.toFixed(2));
          newAutoFilled.fcf = true;
        } else {
          setFcfStr('');
        }

        if (data.netDebt != null && Number.isFinite(data.netDebt)) {
          setNetDebtStr(data.netDebt.toFixed(2));
          newAutoFilled.netDebt = true;
        } else {
          setNetDebtStr('');
        }

        if (data.shares != null && Number.isFinite(data.shares)) {
          setSharesStr(data.shares.toFixed(2));
          newAutoFilled.shares = true;
        } else {
          setSharesStr('');
        }

        if (data.price != null && Number.isFinite(data.price)) {
          setPriceStr(data.price.toString());
          newAutoFilled.price = true;
        } else {
          setPriceStr('');
        }

        setAutoFilledFields(newAutoFilled);
        setHasAutoFilled(Object.keys(newAutoFilled).length > 0);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
        setHasAutoFilled(false);
        setAutoFilledFields({});
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
      router.push(`/valuation/dcf?ticker=${encodeURIComponent(t)}`);
    } else {
      router.push('/valuation/dcf');
    }
  };

  // Parsed numerical parameters
  const fcf = parseFloat(fcfStr);
  const growth = parseFloat(growthStr) / 100;
  const nYears = Math.max(1, Math.min(15, parseInt(nYearsStr, 10) || 10));
  const terminalGrowth = parseFloat(terminalGrowthStr) / 100;
  const wacc = parseFloat(waccStr) / 100;
  const netDebt = parseFloat(netDebtStr);
  const shares = parseFloat(sharesStr);
  const price = parseFloat(priceStr);

  // Guards
  const isWaccFinite = Number.isFinite(wacc);
  const isTerminalGrowthFinite = Number.isFinite(terminalGrowth);
  const isWaccInvalid = isWaccFinite && isTerminalGrowthFinite && wacc <= terminalGrowth;

  const isValidInputs =
    Number.isFinite(fcf) &&
    Number.isFinite(growth) &&
    Number.isFinite(nYears) &&
    nYears >= 1 &&
    nYears <= 15 &&
    isTerminalGrowthFinite &&
    isWaccFinite &&
    !isWaccInvalid &&
    Number.isFinite(netDebt) &&
    Number.isFinite(shares) &&
    shares > 0 &&
    Number.isFinite(price) &&
    price > 0;

  // 2-Stage DCF Calculation
  const calculationResults = useMemo(() => {
    if (!isValidInputs) return null;

    let currentCf = fcf;
    const yearlyPv: { year: number; cf: number; pv: number }[] = [];
    let sumPV = 0;

    for (let y = 1; y <= nYears; y++) {
      currentCf = currentCf * (1 + growth);
      const pv = currentCf / Math.pow(1 + wacc, y);
      yearlyPv.push({ year: y, cf: currentCf, pv });
      sumPV += pv;
    }

    const cf_N = currentCf;
    const tv = (cf_N * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    const pvTv = tv / Math.pow(1 + wacc, nYears);
    const ev = sumPV + pvTv;
    const equity = ev - netDebt;
    const fairValue = equity / shares;
    const upside = ((fairValue - price) / price) * 100;
    const tvPctOfEv = ev > 0 ? (pvTv / ev) * 100 : 0;

    return {
      yearlyPv,
      sumPV,
      cf_N,
      tv,
      pvTv,
      ev,
      equity,
      fairValue,
      upside,
      tvPctOfEv,
    };
  }, [isValidInputs, fcf, growth, nYears, terminalGrowth, wacc, netDebt, shares, price]);

  // Sensitivity Matrix Calculations
  const sensitivityData = useMemo(() => {
    if (!isValidInputs) return null;

    const baseWaccPct = parseFloat(waccStr);
    const baseTgPct = parseFloat(terminalGrowthStr);

    const waccSteps = [-1.0, -0.5, 0, 0.5, 1.0].map(d => parseFloat((baseWaccPct + d).toFixed(2)));
    const tgSteps = [-1.0, -0.5, 0, 0.5, 1.0].map(d => parseFloat((baseTgPct + d).toFixed(2)));

    const rows = waccSteps.map(wPct => {
      const wDec = wPct / 100;
      const cols = tgSteps.map(tgPct => {
        const tgDec = tgPct / 100;
        if (wDec <= tgDec) {
          return {
            wPct,
            tgPct,
            fairValue: null,
            upside: null,
            isBase: false,
          };
        }

        let curr = fcf;
        let sPV = 0;
        for (let y = 1; y <= nYears; y++) {
          curr = curr * (1 + growth);
          sPV += curr / Math.pow(1 + wDec, y);
        }
        const tVal = (curr * (1 + tgDec)) / (wDec - tgDec);
        const pTv = tVal / Math.pow(1 + wDec, nYears);
        const cellEv = sPV + pTv;
        const cellEquity = cellEv - netDebt;
        const cellFv = cellEquity / shares;
        const cellUpside = ((cellFv - price) / price) * 100;
        const isBase = Math.abs(wPct - baseWaccPct) < 0.001 && Math.abs(tgPct - baseTgPct) < 0.001;

        return {
          wPct,
          tgPct,
          fairValue: cellFv,
          upside: cellUpside,
          isBase,
        };
      });

      return { wPct, cols };
    });

    return { waccSteps, tgSteps, rows, baseWaccPct, baseTgPct };
  }, [isValidInputs, fcf, growth, nYears, waccStr, terminalGrowthStr, netDebt, shares, price]);

  // Max value for bar chart normalization
  const maxBarValue = useMemo(() => {
    if (!calculationResults) return 1;
    const pvs = calculationResults.yearlyPv.map(item => item.pv);
    return Math.max(...pvs, calculationResults.pvTv, 1);
  }, [calculationResults]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header & Ticker Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Calculator size={18} />
            </div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">Discounted Cash Flow (DCF Valuation)</h1>
          </div>
          <p className="text-[13px] text-white/40 mt-1">
            โมเดลประเมินมูลค่ากระแสเงินสดอิสระ (2-Stage DCF) พร้อมตารางความอ่อนไหว WACC × Terminal Growth
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

      {/* Valuation Parameters Grid */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-white">พารามิเตอร์ประเมินมูลค่า (DCF Inputs)</h2>
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

        {/* 8 Inputs in 2 Rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Base FCF */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium flex items-center">
              <span>FCF ปีฐาน (ล้านบาท)</span>
              {autoFilledFields.fcf && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1.5" title="ดึงจาก TradingView" />
              )}
            </label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 77370.68"
              value={fcfStr}
              onChange={e => {
                setFcfStr(e.target.value);
                setAutoFilledFields(prev => ({ ...prev, fcf: false }));
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 2. Growth */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium">Growth เฉลี่ย (%)</label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 6.0"
              value={growthStr}
              onChange={e => setGrowthStr(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 3. Forecast Years (N) */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium">จำนวนปี forecast (1-15 ปี)</label>
            <input
              type="number"
              min="1"
              max="15"
              step="1"
              placeholder="10"
              value={nYearsStr}
              onChange={e => setNYearsStr(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 4. Terminal Growth */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium">Terminal Growth (%)</label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 2.5"
              value={terminalGrowthStr}
              onChange={e => setTerminalGrowthStr(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 5. WACC */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium">WACC / Discount Rate (%)</label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 9.0"
              value={waccStr}
              onChange={e => setWaccStr(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 6. Net Debt */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium flex items-center">
              <span>Net Debt (ล้านบาท)</span>
              {autoFilledFields.netDebt && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1.5" title="ดึงจาก TradingView" />
              )}
            </label>
            <input
              type="number"
              step="any"
              placeholder="ติดลบได้ถ้าเงินสดสุทธิ"
              value={netDebtStr}
              onChange={e => {
                setNetDebtStr(e.target.value);
                setAutoFilledFields(prev => ({ ...prev, netDebt: false }));
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 7. Shares Outstanding */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-white/50 font-medium flex items-center">
              <span>จำนวนหุ้น (ล้านหุ้น)</span>
              {autoFilledFields.shares && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1.5" title="ดึงจาก TradingView" />
              )}
            </label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 28324.34"
              value={sharesStr}
              onChange={e => {
                setSharesStr(e.target.value);
                setAutoFilledFields(prev => ({ ...prev, shares: false }));
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* 8. Current Price */}
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
              placeholder="เช่น 40.75"
              value={priceStr}
              onChange={e => {
                setPriceStr(e.target.value);
                setAutoFilledFields(prev => ({ ...prev, price: false }));
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Guard Error Alert Box */}
        {isWaccInvalid && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[13px] flex items-center gap-2.5">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <span>
              <strong>ข้อผิดพลาด:</strong> WACC ({parseFloat(waccStr || '0').toFixed(1)}%) ต้องมากกว่า Terminal Growth ({parseFloat(terminalGrowthStr || '0').toFixed(1)}%) ไม่งั้น Terminal Value จะเป็นอนันต์หรือไม่สมเหตุสมผล
            </span>
          </div>
        )}
      </div>

      {/* Output 4 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Enterprise Value */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">Enterprise Value (EV)</span>
            <span className="text-[11px] text-white/30">PV FCF + PV TV</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[24px] font-extrabold text-white tracking-tight">
              {calculationResults != null ? calculationResults.ev.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
              <span className="text-[12px] font-normal text-white/40 ml-1">ลบ.</span>
            </span>
          </div>
        </div>

        {/* Card 2: Equity Value */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">Equity Value</span>
            <span className="text-[11px] text-white/30">EV − Net Debt</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[24px] font-extrabold text-white tracking-tight">
              {calculationResults != null ? calculationResults.equity.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
              <span className="text-[12px] font-normal text-white/40 ml-1">ลบ.</span>
            </span>
          </div>
        </div>

        {/* Card 3: Fair Value / หุ้น */}
        <div className="bg-gradient-to-br from-[#181d29] to-[#13161e] border border-emerald-500/30 rounded-2xl p-5 space-y-2 relative shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-emerald-400">Fair Value / หุ้น</span>
            <span className="text-[11px] text-emerald-400/60">Equity / Shares</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[26px] font-extrabold text-white tracking-tight">
              {calculationResults != null ? calculationResults.fairValue.toFixed(2) : '—'}
              <span className="text-[13px] font-normal text-white/40 ml-1">บาท</span>
            </span>
          </div>
        </div>

        {/* Card 4: Upside / Downside */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">Upside / Downside</span>
            <span className="text-[11px] text-white/30">vs ราคาปัจจุบัน</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            {calculationResults?.upside != null ? (
              <span className={`text-[20px] font-extrabold px-3 py-1 rounded-xl flex items-center gap-1.5 border ${
                calculationResults.upside >= 0
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}>
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
      </div>

      {/* PV Breakdown Chart */}
      {calculationResults && (
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold text-white">Present Value Breakdown (โครงสร้างมูลค่าปัจจุบัน)</h2>
              <p className="text-[12px] text-white/40 mt-0.5">
                เปรียบเทียบมูลค่าปัจจุบันของกระแสเงินสดรายปี (Y1..Y{nYears}) เทียบกับ Terminal Value (TV)
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#2a78d6]" />
                <span className="text-white/70">PV FCF รายปี</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#eda100]" />
                <span className="text-white/70">PV Terminal Value</span>
              </div>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="pt-6 pb-2 px-2 overflow-x-auto">
            <div className="flex items-end gap-2 sm:gap-3 h-48 min-w-[550px] border-b border-white/[0.08] pb-1">
              {/* Forecast years bars */}
              {calculationResults.yearlyPv.map(bar => {
                const heightPct = Math.max(4, Math.round((bar.pv / maxBarValue) * 100));
                return (
                  <div key={bar.year} className="flex-1 flex flex-col items-center gap-2 group relative">
                    <div className="text-[10px] text-white/40 group-hover:text-white transition-colors font-medium">
                      {(bar.pv / 1000).toFixed(1)}k
                    </div>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-[#2a78d6] hover:bg-[#3b8ef0] rounded-t-md transition-all relative"
                    >
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 rounded-t-md transition-colors" />
                    </div>
                    <span className="text-[11px] text-white/60 font-bold">Y{bar.year}</span>
                  </div>
                );
              })}

              {/* Terminal Value Bar */}
              <div className="flex-1 flex flex-col items-center gap-2 group relative">
                <div className="text-[10px] text-amber-300 font-bold">
                  {(calculationResults.pvTv / 1000).toFixed(1)}k
                </div>
                <div
                  style={{ height: `${Math.max(4, Math.round((calculationResults.pvTv / maxBarValue) * 100))}%` }}
                  className="w-full bg-[#eda100] hover:bg-[#ffb31a] rounded-t-md transition-all relative"
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 rounded-t-md transition-colors" />
                </div>
                <span className="text-[11px] text-amber-400 font-extrabold">PV TV</span>
              </div>
            </div>
          </div>

          {/* Terminal Value % Notice */}
          <div className="text-[12px] p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-white/70">
            <span>
              Terminal Value คิดเป็น{' '}
              <strong className="text-white font-extrabold">{calculationResults.tvPctOfEv.toFixed(1)}%</strong> ของ Enterprise Value
            </span>
            {calculationResults.tvPctOfEv > 75 && (
              <span className="text-amber-400 font-bold ml-1.5">
                (สัดส่วนสูงมาก — Valuation มีความอ่อนไหวสูงต่อ WACC และ Terminal Growth)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sensitivity Table: WACC x Terminal Growth */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-[15px] font-bold text-white">Sensitivity Matrix (WACC × Terminal Growth)</h2>
          <p className="text-[12px] text-white/40 mt-0.5">
            Fair Value / หุ้น (บาท) และ % Upside ตามช่วง Discount Rate (WACC) และ Terminal Growth Rate
          </p>
        </div>

        {sensitivityData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-2.5 text-left text-white/40 font-medium border-b border-white/[0.06]">
                    WACC \ Terminal Growth
                  </th>
                  {sensitivityData.tgSteps.map(tg => (
                    <th
                      key={tg}
                      className={`p-2.5 font-bold border-b border-white/[0.06] ${
                        Math.abs(tg - sensitivityData.baseTgPct) < 0.001 ? 'text-emerald-400' : 'text-white/60'
                      }`}
                    >
                      {tg.toFixed(1)}% {Math.abs(tg - sensitivityData.baseTgPct) < 0.001 && '(Base)'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivityData.rows.map(row => (
                  <tr key={row.wPct} className="border-b border-white/[0.03]">
                    <td
                      className={`p-2.5 text-left font-bold ${
                        Math.abs(row.wPct - sensitivityData.baseWaccPct) < 0.001 ? 'text-emerald-400' : 'text-white/60'
                      }`}
                    >
                      {row.wPct.toFixed(1)}% {Math.abs(row.wPct - sensitivityData.baseWaccPct) < 0.001 && '(Base)'}
                    </td>
                    {row.cols.map((col, cIdx) => (
                      <td
                        key={cIdx}
                        className={`p-2.5 transition-all ${
                          col.isBase ? 'ring-2 ring-emerald-400 rounded-lg bg-emerald-500/10 font-extrabold' : ''
                        }`}
                      >
                        {col.fairValue != null && Number.isFinite(col.fairValue) ? (
                          <>
                            <div className="font-bold text-white">{col.fairValue.toFixed(2)}</div>
                            {col.upside != null && Number.isFinite(col.upside) && (
                              <div
                                className={`text-[10.5px] font-semibold mt-0.5 ${
                                  col.upside >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {col.upside >= 0 ? `+${col.upside.toFixed(1)}%` : `${col.upside.toFixed(1)}%`}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-white/20 italic font-mono">—</div>
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
            {isWaccInvalid
              ? 'กรุณาปรับ WACC ให้มากกว่า Terminal Growth เพื่อแสดงผลตาราง Sensitivity Matrix'
              : 'กรอกข้อมูลพารามิเตอร์ให้ครบถ้วนเพื่อแสดงตาราง Sensitivity Matrix'}
          </div>
        )}
      </div>
    </div>
  );
}

function DcfSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto animate-pulse">
      <div className="h-20 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      <div className="h-64 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-24 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      </div>
    </div>
  );
}

export default function DcfValuationPage() {
  return (
    <Suspense fallback={<DcfSkeleton />}>
      <DcfValuationContent />
    </Suspense>
  );
}
