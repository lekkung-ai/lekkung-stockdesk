'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles, TrendingUp, TrendingDown, Scale, Plus, X } from 'lucide-react';
import { getStockValuation, getSectorMedians, type StockValuation } from '@/lib/valuation';

const EPS_LABELS = ['Bear', 'Base', 'Bull'];

function PePbvValuationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTicker = searchParams.get('ticker') ?? '';

  const [inputTicker, setInputTicker] = useState(rawTicker);
  const [activeTicker, setActiveTicker] = useState(rawTicker.toUpperCase().trim());

  // Input states (strings for natural user editing)
  const [priceStr, setPriceStr] = useState<string>('');
  const [epsStr, setEpsStr] = useState<string>('');
  const [bvpsStr, setBvpsStr] = useState<string>('');
  const [targetPeStr, setTargetPeStr] = useState<string>('');
  const [targetPbvStr, setTargetPbvStr] = useState<string>('');

  // Table mode & Scenario state
  const [tableMode, setTableMode] = useState<'sens' | 'scen'>('sens');
  const [epsScenarios, setEpsScenarios] = useState<string[]>(['', '', '']); // Bear/Base/Bull
  const [peColumns, setPeColumns] = useState<string[]>(['10', '13', '16', '20']);

  const [stockVal, setStockVal] = useState<StockValuation | null>(null);
  const [secMedians, setSecMedians] = useState<{ sector: string; secPe: number | null; secPb: number | null; n: number } | null>(null);

  // Sync with URL query param
  useEffect(() => {
    const t = (searchParams.get('ticker') ?? '').toUpperCase().trim();
    setInputTicker(t);
    setActiveTicker(t);
  }, [searchParams]);

  // Load valuation data whenever activeTicker changes
  useEffect(() => {
    if (!activeTicker) {
      setStockVal(null);
      setSecMedians(null);
      setPriceStr('');
      setEpsStr('');
      setBvpsStr('');
      setTargetPeStr('');
      setTargetPbvStr('');
      return;
    }

    const val = getStockValuation(activeTicker);
    const med = getSectorMedians(activeTicker);

    setStockVal(val);
    setSecMedians(med);

    if (val) {
      setPriceStr(val.price != null && Number.isFinite(val.price) ? val.price.toString() : '');
      setEpsStr(val.eps != null && Number.isFinite(val.eps) ? val.eps.toFixed(2) : '');
      setBvpsStr(val.bvps != null && Number.isFinite(val.bvps) ? val.bvps.toFixed(2) : '');

      const defaultPe = med?.secPe != null ? med.secPe : val.pe;
      const defaultPb = med?.secPb != null ? med.secPb : val.pbv;

      setTargetPeStr(defaultPe != null && Number.isFinite(defaultPe) ? defaultPe.toFixed(1) : '');
      setTargetPbvStr(defaultPb != null && Number.isFinite(defaultPb) ? defaultPb.toFixed(2) : '');
    } else {
      setPriceStr('');
      setEpsStr('');
      setBvpsStr('');
      setTargetPeStr('');
      setTargetPbvStr('');
    }
  }, [activeTicker]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const t = inputTicker.toUpperCase().trim();
    if (t) {
      router.push(`/valuation/pe-pbv?ticker=${encodeURIComponent(t)}`);
    } else {
      router.push('/valuation/pe-pbv');
    }
  };

  const handleApplySectorMedian = () => {
    if (secMedians) {
      if (secMedians.secPe != null && Number.isFinite(secMedians.secPe)) {
        setTargetPeStr(secMedians.secPe.toFixed(1));
      }
      if (secMedians.secPb != null && Number.isFinite(secMedians.secPb)) {
        setTargetPbvStr(secMedians.secPb.toFixed(2));
      }
    }
  };

  // Scenario handlers
  const handleUpdateEpsScenario = (index: number, val: string) => {
    setEpsScenarios(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleAddEpsScenario = () => {
    setEpsScenarios(prev => [...prev, '']);
  };

  const handleRemoveEpsScenario = (index: number) => {
    if (epsScenarios.length > 1) {
      setEpsScenarios(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleUpdatePeColumn = (index: number, val: string) => {
    setPeColumns(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleAddPeColumn = () => {
    setPeColumns(prev => [...prev, '15']);
  };

  const handleRemovePeColumn = (index: number) => {
    if (peColumns.length > 1) {
      setPeColumns(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Parsed numeric values
  const price = parseFloat(priceStr);
  const eps = parseFloat(epsStr);
  const bvps = parseFloat(bvpsStr);
  const targetPe = parseFloat(targetPeStr);
  const targetPbv = parseFloat(targetPbvStr);

  const isValidPrice = Number.isFinite(price) && price > 0;
  const isValidEps = Number.isFinite(eps) && eps > 0;
  const isValidBvps = Number.isFinite(bvps) && bvps > 0;
  const isValidTargetPe = Number.isFinite(targetPe) && targetPe > 0;
  const isValidTargetPbv = Number.isFinite(targetPbv) && targetPbv > 0;

  // Fair value calculations
  const fairPe = isValidEps && isValidTargetPe ? eps * targetPe : null;
  const fairPbv = isValidBvps && isValidTargetPbv ? bvps * targetPbv : null;

  const fairAvg = useMemo(() => {
    if (fairPe != null && fairPbv != null) return (fairPe + fairPbv) / 2;
    if (fairPe != null) return fairPe;
    if (fairPbv != null) return fairPbv;
    return null;
  }, [fairPe, fairPbv]);

  const upsidePe = fairPe != null && isValidPrice ? ((fairPe - price) / price) * 100 : null;
  const upsidePbv = fairPbv != null && isValidPrice ? ((fairPbv - price) / price) * 100 : null;
  const upsideAvg = fairAvg != null && isValidPrice ? ((fairAvg - price) / price) * 100 : null;

  // Sector comparisons
  const currPe = stockVal?.pe;
  const currPb = stockVal?.pbv;
  const secPe = secMedians?.secPe;
  const secPb = secMedians?.secPb;

  const peDiffPct = currPe != null && secPe != null && secPe > 0 ? ((currPe - secPe) / secPe) * 100 : null;
  const pbDiffPct = currPb != null && secPb != null && secPb > 0 ? ((currPb - secPb) / secPb) * 100 : null;

  // Sensitivity Matrix Variations
  const peSteps = useMemo(() => {
    if (!isValidTargetPe) return [];
    const deltas = [-4, -2, 0, 2, 4];
    return deltas
      .map(d => parseFloat((targetPe + d).toFixed(1)))
      .filter(v => v > 0);
  }, [targetPe, isValidTargetPe]);

  const pbvSteps = useMemo(() => {
    if (!isValidTargetPbv) return [];
    const deltas = [-0.2, -0.1, 0, 0.1, 0.2];
    return deltas
      .map(d => parseFloat((targetPbv + d).toFixed(2)))
      .filter(v => v > 0);
  }, [targetPbv, isValidTargetPbv]);

  // Valid Scenario lists
  const validEpsScenarios = useMemo(() => {
    return epsScenarios
      .map((val, idx) => ({
        val: parseFloat(val),
        raw: val,
        idx,
        label: EPS_LABELS[idx] ?? `#${idx + 1}`,
      }))
      .filter(item => Number.isFinite(item.val));
  }, [epsScenarios]);

  const validPeColumns = useMemo(() => {
    return peColumns
      .map((val, idx) => ({
        val: parseFloat(val),
        raw: val,
        idx,
      }))
      .filter(item => Number.isFinite(item.val) && item.val > 0);
  }, [peColumns]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header & Ticker Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Scale size={18} />
            </div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">PE / PBV Relative Valuation</h1>
          </div>
          <p className="text-[13px] text-white/40 mt-1">
            ประเมินมูลค่าหุ้นเชิงเปรียบเทียบด้วย P/E และ P/BV Multiple เทียบมัธยฐานอุตสาหกรรม
          </p>
        </div>

        {/* Ticker Search Box */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="ค้นหา Ticker เช่น PTT, KBANK"
              value={inputTicker}
              onChange={e => setInputTicker(e.target.value.toUpperCase())}
              className="bg-white/[0.04] border border-white/[0.1] rounded-xl px-3.5 py-2 pl-9 text-[13px] font-bold text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 w-[200px] sm:w-[240px] uppercase"
            />
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-white text-black font-bold text-[12px] rounded-xl hover:bg-white/90 transition-all shadow-sm"
          >
            โหลด
          </button>
        </form>
      </div>

      {/* Main Grid: Inputs & Sector Benchmarks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Valuation Parameters (Editable Inputs) */}
        <div className="lg:col-span-2 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
              <span>พารามิเตอร์ประเมินมูลค่า</span>
              {activeTicker && (
                <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-white font-extrabold text-[12px]">
                  {activeTicker}
                </span>
              )}
            </h2>
            <span className="text-[12px] text-white/40">แก้ไขตัวเลขเพื่อดูการเปลี่ยนแปลง Real-time</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] text-white/50 font-medium">ราคาปัจจุบัน (บาท)</label>
              <input
                type="number"
                step="any"
                placeholder="กรอกราคา"
                value={priceStr}
                onChange={e => setPriceStr(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-white/50 font-medium">EPS (บาท/หุ้น)</label>
              <input
                type="number"
                step="any"
                placeholder="กรอก EPS"
                value={epsStr}
                onChange={e => setEpsStr(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-white/50 font-medium">BVPS (บาท/หุ้น)</label>
              <input
                type="number"
                step="any"
                placeholder="กรอก BVPS"
                value={bvpsStr}
                onChange={e => setBvpsStr(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] text-white/50 font-medium">Target P/E (เท่า)</label>
              <input
                type="number"
                step="any"
                placeholder="เช่น 12.0"
                value={targetPeStr}
                onChange={e => setTargetPeStr(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-white/50 font-medium">Target P/BV (เท่า)</label>
              <input
                type="number"
                step="any"
                placeholder="เช่น 1.20"
                value={targetPbvStr}
                onChange={e => setTargetPbvStr(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        </div>

        {/* Right 1 Col: Sector Benchmark & Quick Action */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-white">Sector Benchmark</span>
              {secMedians?.sector && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {secMedians.sector} (n={secMedians.n})
                </span>
              )}
            </div>

            {secMedians ? (
              <div className="space-y-2.5 text-[12px]">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div>
                    <p className="text-white/40">P/E ปัจจุบัน vs กลุ่ม</p>
                    <p className="text-white font-bold mt-0.5">
                      {currPe != null ? `${currPe.toFixed(1)}x` : '—'} <span className="text-white/30 font-normal">vs</span> {secPe != null ? `${secPe.toFixed(1)}x` : '—'}
                    </p>
                  </div>
                  {peDiffPct != null && (
                    <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                      peDiffPct < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {peDiffPct < 0 ? `ถูกกว่า ${Math.abs(peDiffPct).toFixed(1)}%` : `แพงกว่า ${peDiffPct.toFixed(1)}%`}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div>
                    <p className="text-white/40">P/BV ปัจจุบัน vs กลุ่ม</p>
                    <p className="text-white font-bold mt-0.5">
                      {currPb != null ? `${currPb.toFixed(2)}x` : '—'} <span className="text-white/30 font-normal">vs</span> {secPb != null ? `${secPb.toFixed(2)}x` : '—'}
                    </p>
                  </div>
                  {pbDiffPct != null && (
                    <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                      pbDiffPct < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {pbDiffPct < 0 ? `ถูกกว่า ${Math.abs(pbDiffPct).toFixed(1)}%` : `แพงกว่า ${pbDiffPct.toFixed(1)}%`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-white/30 italic py-4 text-center">
                {activeTicker ? 'ไม่พบข้อมูลกลุ่มอุตสาหกรรม' : 'กรอก Ticker เพื่อดูค่าเฉลี่ยมัธยฐานกลุ่ม'}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleApplySectorMedian}
            disabled={!secMedians || (secMedians.secPe == null && secMedians.secPb == null)}
            className="w-full py-2.5 px-3 bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-40 disabled:pointer-events-none border border-white/[0.1] text-white font-bold text-[12px] rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>ใช้ median sector เป็น target</span>
          </button>
        </div>
      </div>

      {/* Output 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Fair Value (P/E) */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">Fair Value (P/E Model)</span>
            <span className="text-[11px] text-white/30">EPS × Target P/E</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[28px] font-extrabold text-white tracking-tight">
              {fairPe != null ? `${fairPe.toFixed(2)}` : '—'}
              <span className="text-[13px] font-normal text-white/40 ml-1">บาท</span>
            </span>
            {upsidePe != null && (
              <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                upsidePe >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {upsidePe >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {upsidePe >= 0 ? `+${upsidePe.toFixed(1)}%` : `${upsidePe.toFixed(1)}%`}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Fair Value (P/BV) */}
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/50">Fair Value (P/BV Model)</span>
            <span className="text-[11px] text-white/30">BVPS × Target P/BV</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[28px] font-extrabold text-white tracking-tight">
              {fairPbv != null ? `${fairPbv.toFixed(2)}` : '—'}
              <span className="text-[13px] font-normal text-white/40 ml-1">บาท</span>
            </span>
            {upsidePbv != null && (
              <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                upsidePbv >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {upsidePbv >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {upsidePbv >= 0 ? `+${upsidePbv.toFixed(1)}%` : `${upsidePbv.toFixed(1)}%`}
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Fair Value เฉลี่ย (Blend) */}
        <div className="bg-gradient-to-br from-[#181d29] to-[#13161e] border border-emerald-500/30 rounded-2xl p-5 space-y-2 relative shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-emerald-400">Fair Value เฉลี่ย (Blend)</span>
            <span className="text-[11px] text-emerald-400/60">50% P/E + 50% P/BV</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[28px] font-extrabold text-white tracking-tight">
              {fairAvg != null ? `${fairAvg.toFixed(2)}` : '—'}
              <span className="text-[13px] font-normal text-white/40 ml-1">บาท</span>
            </span>
            {upsideAvg != null && (
              <span className={`text-[13px] font-extrabold px-3 py-1 rounded-lg flex items-center gap-1 border ${
                upsideAvg >= 0
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}>
                {upsideAvg >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {upsideAvg >= 0 ? `Upside +${upsideAvg.toFixed(1)}%` : `Downside ${upsideAvg.toFixed(1)}%`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table Section: Sensitivity vs Scenario Toggle */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">
              {tableMode === 'sens' ? 'Sensitivity Analysis (เมทริกซ์ความอ่อนไหว)' : 'Scenario Matrix (fwd EPS × Target P/E)'}
            </h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              {tableMode === 'sens'
                ? 'มูลค่าพื้นฐานเฉลี่ย (บาท) และ % Upside ตามช่วง Target P/E (แถว) และ Target P/BV (คอลัมน์)'
                : 'จำลองมูลค่าหุ้นตาม Forward EPS แต่ละกรณี (Bear / Base / Bull) เทียบกับ Target P/E Multiples'}
            </p>
          </div>

          {/* Toggle pill buttons */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] w-fit">
            <button
              type="button"
              onClick={() => setTableMode('sens')}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                tableMode === 'sens'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Sensitivity · PE × PBV
            </button>
            <button
              type="button"
              onClick={() => setTableMode('scen')}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                tableMode === 'scen'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Scenario · fwd EPS × PE
            </button>
          </div>
        </div>

        {/* Tab 1: Sensitivity (PE x PBV) */}
        {tableMode === 'sens' && (
          isValidEps && isValidBvps && isValidTargetPe && isValidTargetPbv ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] text-center border-collapse">
                <thead>
                  <tr>
                    <th className="p-2.5 text-left text-white/40 font-medium border-b border-white/[0.06]">
                      P/E \ P/BV
                    </th>
                    {pbvSteps.map(pb => (
                      <th
                        key={pb}
                        className={`p-2.5 font-bold border-b border-white/[0.06] ${
                          Math.abs(pb - targetPbv) < 0.001 ? 'text-emerald-400' : 'text-white/60'
                        }`}
                      >
                        {pb.toFixed(2)}x {Math.abs(pb - targetPbv) < 0.001 && '(Base)'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {peSteps.map(pe => (
                    <tr key={pe} className="border-b border-white/[0.03]">
                      <td className={`p-2.5 text-left font-bold ${
                        Math.abs(pe - targetPe) < 0.001 ? 'text-emerald-400' : 'text-white/60'
                      }`}>
                        {pe.toFixed(1)}x {Math.abs(pe - targetPe) < 0.001 && '(Base)'}
                      </td>
                      {pbvSteps.map(pb => {
                        const fPe = eps * pe;
                        const fPb = bvps * pb;
                        const fAvg = (fPe + fPb) / 2;
                        const up = isValidPrice ? ((fAvg - price) / price) * 100 : null;
                        const isBase = Math.abs(pe - targetPe) < 0.001 && Math.abs(pb - targetPbv) < 0.001;

                        return (
                          <td
                            key={pb}
                            className={`p-2.5 transition-all ${
                              isBase ? 'ring-2 ring-emerald-400 rounded-lg bg-emerald-500/10 font-extrabold' : ''
                            }`}
                          >
                            <div className="font-bold text-white">{fAvg.toFixed(2)}</div>
                            {up != null && (
                              <div className={`text-[10.5px] font-semibold mt-0.5 ${
                                up >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                                {up >= 0 ? `+${up.toFixed(1)}%` : `${up.toFixed(1)}%`}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-white/40 text-[13px] bg-white/[0.01] rounded-xl border border-white/[0.03] space-y-1">
              <p>⚠ EPS ไม่มีค่า (หุ้นขาดทุน) — สลับไปแท็บ Scenario เพื่อกรอก forward EPS ที่คาดการณ์เอง</p>
              <p className="text-[12px] text-white/25">หรือกรอก EPS, BVPS, Target P/E และ Target P/BV ให้ครบถ้วนเพื่อแสดงตาราง</p>
            </div>
          )
        )}

        {/* Tab 2: Scenario (fwd EPS x PE) */}
        {tableMode === 'scen' && (
          <div className="space-y-6">
            {/* 2-Col Config Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              {/* Left Col: Forward EPS Rows */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-white">Forward EPS (แถว)</span>
                  <button
                    type="button"
                    onClick={handleAddEpsScenario}
                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={13} /> เพิ่มแถว
                  </button>
                </div>
                <div className="space-y-2">
                  {epsScenarios.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-white/40 w-12 flex-shrink-0">
                        {EPS_LABELS[idx] ?? `#${idx + 1}`}
                      </span>
                      <input
                        type="number"
                        step="any"
                        placeholder="เช่น 0.90"
                        value={val}
                        onChange={e => handleUpdateEpsScenario(idx, e.target.value)}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-[13px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
                      />
                      {epsScenarios.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEpsScenario(idx)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="ลบแถวนี้"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Col: Target PE Columns */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-white">Target P/E (คอลัมน์)</span>
                  <button
                    type="button"
                    onClick={handleAddPeColumn}
                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={13} /> เพิ่ม PE
                  </button>
                </div>
                <div className="space-y-2">
                  {peColumns.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-white/40 w-10 flex-shrink-0">
                        PE #{idx + 1}
                      </span>
                      <input
                        type="number"
                        step="any"
                        placeholder="เช่น 15"
                        value={val}
                        onChange={e => handleUpdatePeColumn(idx, e.target.value)}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-[13px] font-bold text-white focus:outline-none focus:border-emerald-500/50"
                      />
                      {peColumns.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePeColumn(idx)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="ลบคอลัมน์นี้"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Matrix Table */}
            {validEpsScenarios.length > 0 && validPeColumns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] text-center border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2.5 text-left text-white/40 font-medium border-b border-white/[0.06]">
                        Forward EPS \ Target P/E
                      </th>
                      {validPeColumns.map(col => (
                        <th
                          key={col.idx}
                          className="p-2.5 font-bold text-white/80 border-b border-white/[0.06]"
                        >
                          PE {col.val}x
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validEpsScenarios.map(row => (
                      <tr key={row.idx} className="border-b border-white/[0.03]">
                        <td className="p-2.5 text-left font-bold text-white/80">
                          EPS {row.val.toFixed(2)} <span className="text-[11px] font-normal text-white/40 ml-1">{row.label}</span>
                        </td>
                        {validPeColumns.map(col => {
                          const fairVal = row.val * col.val;
                          const up = isValidPrice ? ((fairVal - price) / price) * 100 : null;

                          return (
                            <td key={col.idx} className="p-2.5">
                              <div className="font-bold text-white">{fairVal.toFixed(2)}</div>
                              {up != null && (
                                <div className={`text-[10.5px] font-semibold mt-0.5 ${
                                  up >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                  {up >= 0 ? `+${up.toFixed(1)}%` : `${up.toFixed(1)}%`}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-white/30 text-[13px] italic bg-white/[0.01] rounded-xl border border-white/[0.03]">
                {validEpsScenarios.length === 0
                  ? 'กรอก forward EPS อย่างน้อย 1 ค่า เพื่อแสดงตาราง Scenario'
                  : 'กรอก Target P/E อย่างน้อย 1 ค่า เพื่อแสดงตาราง Scenario'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ValuationSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto animate-pulse">
      <div className="h-20 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-64 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-64 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-28 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-28 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
        <div className="h-28 bg-[#13161e] border border-white/[0.08] rounded-2xl" />
      </div>
    </div>
  );
}

export default function PePbvValuationPage() {
  return (
    <Suspense fallback={<ValuationSkeleton />}>
      <PePbvValuationContent />
    </Suspense>
  );
}
