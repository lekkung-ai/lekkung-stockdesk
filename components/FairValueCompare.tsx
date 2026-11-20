'use client';

// เทียบ "มูลค่าที่เหมาะสม" หลายวิธีกับราคาจริงในภาพเดียว (หน้า /stock/[ticker] เท่านั้น)
//
// สูตร port มาจากหน้า valuation เดิมแบบตรงตัว รวมถึง "การปัดเลขระหว่างทาง"
// (eps/bvps ทศนิยม 2, target PE ทศนิยม 1, target PBV ทศนิยม 2)
//   - PE/PBV : app/valuation/pe-pbv/page.tsx:58-67, 149-150
// ต่างจากหน้า pe-pbv ที่ "กลุ่มเทียบ" เท่านั้น: หน้านี้ใช้กลุ่มย่อย (subsector) ก่อน ถ้ามีสมาชิกที่มี
// P/E และ P/BV ครบ ≥ 5 ตัว ไม่งั้น fallback เป็น sector (lib/valuation.ts getValuationGroup)
// หน้า pe-pbv ยังเทียบ sector เหมือนเดิม — ตัวเลขสองหน้าจึงต่างกันได้เมื่อหุ้นมีกลุ่มย่อยที่ใช้ได้
//
// ค่ากลางใช้ "median" ไม่ใช่ค่าเฉลี่ย เพราะแต่ละวิธีให้ผลต่างกันได้หลายเท่าตัว
// (COM7: fairPE 27.61 vs fairPBV 5.09 · SRICHA: 55.46 vs 3.77) ค่าเฉลี่ยจะถูกตัวสุดโต่ง
// ลากไปทั้งก้อน — และเมื่อช่วงห่างกันมากจะขึ้นธงเตือนแทนที่จะรายงานเลขเดียวแบบมั่นใจเกินจริง
//
// โครง: useFairValue() คำนวณทั้งหมด (หน้าใช้ค่าเดียวกันในการ์ดสรุปด้านบน) → <FairValueCompare fv={...} /> แสดงผล

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  getStockValuation,
  getValuationGroup,
  getValuationGroupMedians,
  getValuationGroupSpread,
  MIN_SUBSECTOR_COMPLETE_PEERS,
  type SectorSpread,
  type ValuationGroupMedians,
} from '@/lib/valuation';
import { getSectorForTicker } from '@/lib/sectorData';
import { VALUE_BAND_PCT } from '@/lib/stockSummary';

const DIVERGENCE_SPREAD_PCT = 30; // ช่วง upside ระหว่างวิธีสูงสุด-ต่ำสุด เกินเท่านี้ = ไม่น่าเชื่อถือพอจะสรุปเลขเดียว

// สมมติฐานเริ่มต้น — ต้องตรงกับ default ของหน้า valuation เดิม ไม่งั้นตัวเลขสองหน้าจะขัดกัน
//   DDM: app/valuation/ddm/page.tsx:25-26 (g 4%, r 10%)
const DDM_GROWTH_PCT = 4;
const DDM_REQUIRED_RETURN_PCT = 10;
//   DCF: app/valuation/dcf/page.tsx:25-28 (growth 6%, 10 ปี, terminal 2.5%, WACC 9%)
const DCF_GROWTH_PCT = 6;
const DCF_YEARS = 10;
const DCF_TERMINAL_GROWTH_PCT = 2.5;
const DCF_WACC_PCT = 9;
const DCF_WACC_BAND_PCT = 1; // ช่วงมูลค่าที่แสดง = WACC ±1 จุด ตามขอบของ sensitivity matrix หน้า DCF

const LOW_PEER_N = 10;   // peer น้อยกว่านี้ = เตือนว่ากลุ่มตัวอย่างเล็ก เชื่อ median ได้น้อยลง

// สี/ขนาดเฉพาะหน้านี้ (ไม่แตะ token ทั้งแอป) — ต้องตรงกับ StockDetailPage
const META = 'text-[#848ca0]';
const INK2 = 'text-[#b4bac8]';
const UP = '#1D9E75';
const DOWN = '#E24B4A';

/** ข้อมูลเทียบ multiple ของหุ้น vs ค่ากลางกลุ่ม — presentation ล้วน ไม่เกี่ยวการคำนวณ fair
 *  groupMedian == null คือสัญญาณว่า "ไม่มีค่ากลางกลุ่มจริง" (โค้ดคำนวณ fallback ไปใช้ค่าตัวเอง)
 *  UI ต้องซ่อนแถบเทียบกลุ่มในกรณีนั้น ไม่งั้นจะโกหกว่าเทียบกลุ่มทั้งที่เทียบตัวเอง */
export interface RelativeCompare {
  /** multiple ปัจจุบันของหุ้น (P/E หรือ P/BV) */
  current: number | null;
  /** median ของกลุ่ม — null = ไม่มีค่ากลางจริง ให้ซ่อนแถบเทียบกลุ่ม */
  groupMedian: number | null;
  /** จำนวน peer ที่กลุ่มใช้ (med.n) */
  n: number;
  sector: string;
  /** ป้ายหน่วย เช่น 'P/E' หรือ 'P/BV' */
  unit: string;
}

export interface FairValueMethod {
  key: string;
  label: string;
  sublabel: string;
  fair: number | null;
  /** เหตุผลที่ใช้วิธีนี้กับหุ้นตัวนี้ไม่ได้ (null = ใช้ได้) */
  ineligible: string | null;
  href: string;
  /** ช่วงมูลค่าเมื่อขยับสมมติฐาน (มีเฉพาะวิธีที่มี sensitivity เช่น DCF) */
  band?: { lo: number; hi: number } | null;
  /** ข้อมูลเทียบกลุ่ม (มีเฉพาะ P/E, P/BV) */
  relative?: RelativeCompare | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function upsidePct(fair: number, price: number): number {
  return ((fair - price) / price) * 100;
}

/** ราคา: ≥100 ไม่มีทศนิยม (205) · ต่ำกว่านั้น 2 ตำแหน่ง (32.30, 0.87) */
function fmtBaht(v: number): string {
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2);
}

// ── PE/PBV relative — offline ล้วน ไม่มี fetch (lib/valuation.ts อ่าน market_stage.json) ──
export function buildRelativeMethods(ticker: string, med: ValuationGroupMedians | null = getValuationGroupMedians(ticker)): FairValueMethod[] {
  const val = getStockValuation(ticker);
  const sector = med?.sector ?? 'กลุ่ม';

  // ปัดเหมือนหน้า pe-pbv เป๊ะ: eps/bvps -> 2 ตำแหน่ง, target PE -> 1 ตำแหน่ง, target PBV -> 2 ตำแหน่ง
  const eps = val?.eps != null && Number.isFinite(val.eps) ? parseFloat(val.eps.toFixed(2)) : null;
  const bvps = val?.bvps != null && Number.isFinite(val.bvps) ? parseFloat(val.bvps.toFixed(2)) : null;
  const targetPeRaw = med?.secPe != null ? med.secPe : val?.pe ?? null;
  const targetPbRaw = med?.secPb != null ? med.secPb : val?.pbv ?? null;
  const targetPe = targetPeRaw != null && Number.isFinite(targetPeRaw) ? parseFloat(targetPeRaw.toFixed(1)) : null;
  const targetPb = targetPbRaw != null && Number.isFinite(targetPbRaw) ? parseFloat(targetPbRaw.toFixed(2)) : null;

  const fairPe = eps != null && eps > 0 && targetPe != null && targetPe > 0 ? eps * targetPe : null;
  const fairPb = bvps != null && bvps > 0 && targetPb != null && targetPb > 0 ? bvps * targetPb : null;

  // targetPe/targetPb มาจาก median กลุ่มจริงไหม (ไม่งั้น fallback ไปใช้ค่าของหุ้นเอง)
  const peFromGroup = med?.secPe != null && Number.isFinite(med.secPe);
  const pbFromGroup = med?.secPb != null && Number.isFinite(med.secPb);

  const href = `/valuation/pe-pbv?ticker=${encodeURIComponent(ticker)}`;
  return [
    {
      key: 'pe',
      label: 'P/E เทียบกลุ่ม',
      // สูตรภาษาคน โชว์เฉพาะตอนคำนวณได้จริง · "กลาง {กลุ่ม}" เฉพาะเมื่อเป็น median กลุ่มจริง
      sublabel: fairPe != null
        ? `กำไร/หุ้น ${eps?.toFixed(2)} × P/E ${peFromGroup ? `กลาง ${sector} ` : 'ของหุ้นเอง '}${targetPe}×`
        : `P/E กลาง ${sector} ${targetPe ?? '—'}`,
      fair: fairPe,
      ineligible: fairPe == null ? (eps == null || eps <= 0 ? 'ไม่มีกำไร/หุ้น (ขาดทุนหรือไม่มีข้อมูล P/E)' : 'ไม่มี P/E กลางของกลุ่ม') : null,
      href,
      relative: {
        current: val?.pe != null && Number.isFinite(val.pe) ? val.pe : null,
        groupMedian: peFromGroup ? (med?.secPe as number) : null,
        n: med?.nPe ?? 0,
        sector,
        unit: 'P/E',
      },
    },
    {
      key: 'pbv',
      label: 'P/BV เทียบกลุ่ม',
      sublabel: fairPb != null
        ? `มูลค่าบัญชี/หุ้น ${bvps?.toFixed(2)} × P/BV ${pbFromGroup ? `กลาง ${sector} ` : 'ของหุ้นเอง '}${targetPb}×`
        : `P/BV กลาง ${sector} ${targetPb ?? '—'}`,
      fair: fairPb,
      ineligible: fairPb == null ? 'ไม่มีมูลค่าบัญชี/หุ้น หรือ P/BV กลางของกลุ่ม' : null,
      href,
      relative: {
        current: val?.pbv != null && Number.isFinite(val.pbv) ? val.pbv : null,
        groupMedian: pbFromGroup ? (med?.secPb as number) : null,
        n: med?.nPb ?? 0,
        sector,
        unit: 'P/BV',
      },
    },
  ];
}

// ── DDM (Gordon Growth) — port จาก app/valuation/ddm/page.tsx:125-151 ────────
// fair = dps × (1 + g) ÷ (r − g) โดย g/r เป็นสัดส่วน (4% -> 0.04) เหมือนหน้าเดิม
export interface DdmInputs { price: number | null; dps: number | null; dividendYield: number | null }

export function buildDdmMethod(ticker: string, inputs: DdmInputs | null, loading: boolean, noData = false): FairValueMethod {
  const href = `/valuation/ddm?ticker=${encodeURIComponent(ticker)}`;
  const base: Omit<FairValueMethod, 'fair' | 'ineligible' | 'sublabel'> = {
    key: 'ddm',
    label: 'ปันผล (DDM)',
    href,
  };
  if (loading) return { ...base, sublabel: 'กำลังโหลดข้อมูลปันผล...', fair: null, ineligible: 'กำลังโหลด...' };
  if (noData) return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'ไม่มีข้อมูล' };
  if (!inputs) return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'ดึงข้อมูลปันผลไม่ได้' };

  const dps = inputs.dps;
  const growth = DDM_GROWTH_PCT / 100;
  const r = DDM_REQUIRED_RETURN_PCT / 100;

  if (dps == null || !Number.isFinite(dps) || dps <= 0) {
    return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'ไม่จ่ายปันผล' };
  }
  if (!(r > growth)) {
    return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'r ต้องมากกว่า g' };
  }
  const fair = (dps * (1 + growth)) / (r - growth);
  if (!Number.isFinite(fair)) {
    return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'คำนวณไม่ได้' };
  }
  return {
    ...base,
    sublabel: `ปันผล ${dps.toFixed(2)} บาท โต ${DDM_GROWTH_PCT}% คิดลด ${DDM_REQUIRED_RETURN_PCT}%`,
    fair,
    ineligible: null,
  };
}

// ── DCF 2-stage — port จาก app/valuation/dcf/page.tsx:136-201 ────────────────
//   EV = Σ FCF(1+g)^t / (1+wacc)^t  +  [FCF_n(1+tg)/(wacc−tg)] / (1+wacc)^n
//   fair = (EV − netDebt) / shares
export interface DcfInputs { price: number | null; fcf: number | null; netDebt: number | null; shares: number | null }

function dcfFairValue(fcf: number, netDebt: number, shares: number, waccPct: number): number | null {
  const growth = DCF_GROWTH_PCT / 100;
  const wacc = waccPct / 100;
  const terminalGrowth = DCF_TERMINAL_GROWTH_PCT / 100;
  if (!(wacc > terminalGrowth) || !(shares > 0)) return null;

  let currentCf = fcf;
  let sumPV = 0;
  for (let y = 1; y <= DCF_YEARS; y++) {
    currentCf = currentCf * (1 + growth);
    sumPV += currentCf / Math.pow(1 + wacc, y);
  }
  const tv = (currentCf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  const pvTv = tv / Math.pow(1 + wacc, DCF_YEARS);
  const fair = (sumPV + pvTv - netDebt) / shares;
  return Number.isFinite(fair) ? fair : null;
}

export function buildDcfMethod(ticker: string, inputs: DcfInputs | null, loading: boolean, noData = false): FairValueMethod {
  const href = `/valuation/dcf?ticker=${encodeURIComponent(ticker)}`;
  const base = { key: 'dcf', label: 'กระแสเงินสด (DCF)', href };

  // ── sector-guard: DCF (FCF-based) ใช้กับกลุ่มการเงินไม่ได้ทุก subsector ─────────
  // แบงก์/เงินทุน-หลักทรัพย์/ประกัน เป็นธุรกิจ balance-sheet-driven — "FCF" ปนกระแส
  // งบดุล (เงินฝาก/สินเชื่อ/reserves) ไม่ใช่เงินสดอิสระจริง ทำให้มูลค่า inflated
  // (KBANK +167%, SAWAD +345%) จึงตัดทั้ง sector ตั้งแต่ต้น
  if (getSectorForTicker(ticker.toUpperCase().trim())?.sector === 'Financials') {
    return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'ไม่ใช้กับกลุ่มการเงิน — FCF ปนกระแสงบดุล', band: null };
  }

  if (loading) return { ...base, sublabel: 'กำลังโหลดงบกระแสเงินสด...', fair: null, ineligible: 'กำลังโหลด...', band: null };
  if (noData) return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'ไม่มีข้อมูล', band: null };
  if (!inputs) return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'ดึงข้อมูล FCF ไม่ได้', band: null };

  const { fcf, netDebt, shares } = inputs;
  if (fcf == null || !Number.isFinite(fcf) || fcf <= 0) {
    // มูลค่าติดลบอ่านไม่ได้ความบนเส้นราคา จึงตัดทิ้งแทนที่จะวางหมุดใต้ศูนย์
    return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'ใช้ไม่ได้ (FCF ติดลบ)', band: null };
  }
  if (netDebt == null || !Number.isFinite(netDebt) || shares == null || !Number.isFinite(shares) || shares <= 0) {
    return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'ข้อมูลหนี้สิน/จำนวนหุ้นไม่ครบ', band: null };
  }

  // ปัดทศนิยม 2 ตำแหน่งก่อนคำนวณ เหมือนที่หน้า DCF เติมค่าลงช่อง input (บรรทัด 81-100)
  const f = parseFloat(fcf.toFixed(2));
  const nd = parseFloat(netDebt.toFixed(2));
  const sh = parseFloat(shares.toFixed(2));

  const fair = dcfFairValue(f, nd, sh, DCF_WACC_PCT);
  if (fair == null || fair <= 0) {
    return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'คำนวณไม่ได้ (มูลค่าติดลบ)', band: null };
  }
  const hi = dcfFairValue(f, nd, sh, DCF_WACC_PCT - DCF_WACC_BAND_PCT); // WACC ต่ำ = มูลค่าสูง
  const lo = dcfFairValue(f, nd, sh, DCF_WACC_PCT + DCF_WACC_BAND_PCT);
  return {
    ...base,
    sublabel: `FCF ${Math.round(f).toLocaleString()} ลบ. โต ${DCF_GROWTH_PCT}% ${DCF_YEARS} ปี คิดลด ${DCF_WACC_PCT}%`,
    fair,
    ineligible: null,
    band: lo != null && hi != null && lo > 0 ? { lo, hi } : null,
  };
}

// ── hook: โหลด DDM/DCF + คำนวณทุกอย่างครั้งเดียว ให้การ์ดสรุปและส่วนรายละเอียดใช้ค่าเดียวกัน ──
export interface FairValueResult {
  ticker: string;
  methods: FairValueMethod[];
  relative: FairValueMethod[];
  ddm: FairValueMethod;
  dcf: FairValueMethod;
  ddmInputs: DdmInputs | null;
  group: ValuationGroupMedians | null;
  /** ชื่อ subsector ของหุ้น เมื่อ fallback เป็น sector (บอกเหตุผลในข้อความ) */
  fallbackFrom: string | null;
  sectorSpread: SectorSpread | null;
  price: number | null;
  usable: number[];
  medianFair: number | null;
  /** (median − ราคา) ÷ ราคา × 100 */
  medianUpside: number | null;
  spread: number | null;
  diverged: boolean;
  /** ยังรอ DDM/DCF อยู่ (median อาจเปลี่ยน) */
  loading: boolean;
}

export function useFairValue(ticker: string, currentPrice: number | null): FairValueResult {
  const [ddmInputs, setDdmInputs] = useState<DdmInputs | null>(null);
  const [ddmLoading, setDdmLoading] = useState(true);
  const [ddmNoData, setDdmNoData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDdmLoading(true);
    setDdmInputs(null);
    setDdmNoData(false);
    // soft=1: a ticker TradingView doesn't have comes back 200 { noData } — no 404 in the console
    fetch(`/api/ddm-inputs/${encodeURIComponent(ticker)}?soft=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data?.noData) setDdmNoData(true);
        else if (data && !data.error) setDdmInputs({ price: data.price ?? null, dps: data.dps ?? null, dividendYield: data.dividendYield ?? null });
        setDdmLoading(false);
      })
      .catch(() => { if (!cancelled) setDdmLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const [dcfInputs, setDcfInputs] = useState<DcfInputs | null>(null);
  const [dcfLoading, setDcfLoading] = useState(true);
  const [dcfNoData, setDcfNoData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDcfLoading(true);
    setDcfInputs(null);
    setDcfNoData(false);
    fetch(`/api/dcf-inputs/${encodeURIComponent(ticker)}?soft=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data?.noData) setDcfNoData(true);
        else if (data && !data.error) {
          setDcfInputs({ price: data.price ?? null, fcf: data.fcf ?? null, netDebt: data.netDebt ?? null, shares: data.shares ?? null });
        }
        setDcfLoading(false);
      })
      .catch(() => { if (!cancelled) setDcfLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const group = useMemo(() => getValuationGroupMedians(ticker), [ticker]);
  const relative = useMemo(() => buildRelativeMethods(ticker, group), [ticker, group]);
  const sectorSpread = useMemo(() => getValuationGroupSpread(ticker), [ticker]);
  const fallbackFrom = useMemo(() => {
    const g = getValuationGroup(ticker);
    const sub = getSectorForTicker(ticker.toUpperCase().trim())?.subsector;
    return g?.level === 'sector' && sub ? sub : null;
  }, [ticker]);
  const ddm = buildDdmMethod(ticker, ddmInputs, ddmLoading, ddmNoData);
  const dcf = buildDcfMethod(ticker, dcfInputs, dcfLoading, dcfNoData);
  const methods = [...relative, ddm, dcf];

  const offlinePrice = getStockValuation(ticker)?.price ?? null;
  const price = currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : offlinePrice;

  const usable = methods.filter(m => m.fair != null).map(m => m.fair as number);
  const medianFair = median(usable);
  const ok = price != null && price > 0 && usable.length > 0;
  const upsides = ok ? usable.map(f => upsidePct(f, price as number)) : [];
  const spread = upsides.length ? Math.max(...upsides) - Math.min(...upsides) : null;

  return {
    ticker,
    methods,
    relative,
    ddm,
    dcf,
    ddmInputs,
    group,
    fallbackFrom,
    sectorSpread,
    price,
    usable,
    medianFair: ok ? medianFair : null,
    medianUpside: ok && medianFair != null ? upsidePct(medianFair, price as number) : null,
    spread,
    diverged: usable.length >= 2 && spread != null && spread > DIVERGENCE_SPREAD_PCT,
    loading: ddmLoading || (dcfLoading && dcf.ineligible === 'กำลังโหลด...'),
  };
}

// ── แถบเทียบ multiple ของหุ้น vs median กลุ่ม (อยู่ใน <details> ที่มา) ──
function GroupCompareBar({ rel, n, pctile }: { rel: RelativeCompare; n?: number; pctile: number | null | undefined }) {
  const current = rel.current;
  const grp = rel.groupMedian;
  if (current == null || grp == null || grp <= 0) return null;

  const peerN = n ?? rel.n;
  const max = Math.max(current, grp) || 1;
  const premium = ((current - grp) / grp) * 100; // >0 = หุ้นเทรดแพงกว่ากลุ่ม
  const stockAbove = premium >= 0;
  const stockColor = stockAbove ? DOWN : UP;
  const rank = rankLabelOf(pctile);

  const Row = ({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) => (
    <div className="flex items-center gap-2.5">
      <div className={`w-[110px] shrink-0 text-[12px] ${META}`}>{label}</div>
      <div className="relative flex-1 h-2 rounded-sm bg-white/[0.05] overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <div className="w-[56px] shrink-0 text-right text-[12px] font-semibold text-[#eceef3]">{value.toFixed(2)}×</div>
    </div>
  );

  return (
    <div className="space-y-1.5 rounded-md bg-black/20 px-3 py-2.5">
      <div className="text-[12px] font-semibold text-[#eceef3]">{rel.unit}</div>
      <Row label="หุ้นนี้" value={current} pct={(current / max) * 100} color={stockColor} />
      <Row label={`กลาง ${rel.sector} (n=${peerN})`} value={grp} pct={(grp / max) * 100} color="rgba(255,255,255,0.30)" />
      <div className="flex items-center justify-between gap-2 flex-wrap text-[12px]">
        <span className="font-semibold" style={{ color: stockColor }}>
          เทรด{stockAbove ? 'สูง' : 'ต่ำ'}กว่ากลุ่ม {Math.abs(premium).toFixed(0)}%
          {rank && <span style={{ color: rank.color }}> · {rank.text}</span>}
        </span>
        {peerN > 0 && peerN < LOW_PEER_N && (
          <span className="text-amber-400/80">⚠ peer น้อย ({peerN} ตัว)</span>
        )}
      </div>
    </div>
  );
}

// percentile → ข้อความบรรทัดเดียว · PE/PBV ต่ำ = ถูก = pctile ต่ำ
function rankLabelOf(pctile: number | null | undefined): { text: string; color: string } | null {
  if (pctile == null) return null;
  if (pctile >= 100) return { text: 'แพงกว่าทั้งกลุ่ม', color: DOWN };
  if (pctile <= 0) return { text: 'ถูกกว่าทั้งกลุ่ม', color: UP };
  if (pctile < 50) return { text: `ถูกกว่า ${Math.round(100 - pctile)}% ของกลุ่ม`, color: UP };
  return { text: `แพงกว่า ${Math.round(pctile)}% ของกลุ่ม`, color: DOWN };
}

/** แกนอัตโนมัติ: ครอบทุกจุด (ราคา, ทุกวิธี, ช่วง DCF) + เผื่อขอบ 6% */
function scaleOf(values: number[]): { lo: number; hi: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.06, hi * 0.02, 0.01);
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}

// ── เส้นราคาเส้นเดียว: แถบช่วงมูลค่า + จุดแต่ละวิธี + ขีดราคาปัจจุบัน ──
function ValueScale({ fv }: { fv: FairValueResult }) {
  const price = fv.price as number;
  const pts = fv.methods.filter(m => m.fair != null);
  const zoneLo = Math.min(...fv.usable);
  const zoneHi = Math.max(...fv.usable);
  const all = [price, ...fv.usable, ...pts.flatMap(m => (m.band ? [m.band.lo, m.band.hi] : []))];
  const { lo, hi } = scaleOf(all);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const pricePos = pos(price);
  // ป้ายราคาไม่ให้ล้นขอบ: ชิดซ้าย/ขวาเมื่ออยู่ใกล้ขอบ
  const tagAlign = pricePos < 15 ? 'translate-x-0' : pricePos > 85 ? '-translate-x-full' : '-translate-x-1/2';

  return (
    <div data-testid="fair-value-scale">
      <div className="relative h-[62px] mx-1.5">
        <span className={`absolute top-0 ${tagAlign} whitespace-nowrap text-[12px] font-semibold text-[#eceef3]`} style={{ left: `${pricePos}%` }}>
          ราคาตอนนี้ {fmtBaht(price)}
        </span>
        <div className="absolute inset-x-0 top-[30px] h-1 rounded bg-white/[0.07]" />
        {pts.map(m => m.band && (
          <div
            key={`${m.key}-band`}
            className="absolute top-[29px] h-1.5 rounded bg-white/[0.12]"
            style={{ left: `${pos(m.band.lo)}%`, width: `${Math.max(0.5, pos(m.band.hi) - pos(m.band.lo))}%` }}
            title={`ช่วง ${m.label} เมื่อ WACC ±1%: ${m.band.lo.toFixed(2)}–${m.band.hi.toFixed(2)}`}
          />
        ))}
        <div
          className="absolute top-[26px] h-3 rounded-full bg-[#8b9cff]/25"
          style={{ left: `${pos(zoneLo)}%`, width: `${Math.max(0.8, pos(zoneHi) - pos(zoneLo))}%` }}
        />
        {pts.map(m => (
          <span
            key={m.key}
            className="absolute top-[26px] -ml-1.5 h-3 w-3 rounded-full bg-[#8b9cff] border-2 border-[#13161e]"
            style={{ left: `${pos(m.fair as number)}%` }}
            title={`${m.label}: ${(m.fair as number).toFixed(2)} บาท`}
          />
        ))}
        <span className="absolute top-[21px] -ml-0.5 h-[22px] w-1 rounded bg-[#eceef3]" style={{ left: `${pricePos}%` }} />
        <span className={`absolute left-0 top-[44px] text-[12px] ${META}`}>{fmtBaht(lo)}</span>
        <span className={`absolute right-0 top-[44px] text-[12px] ${META}`}>{fmtBaht(hi)}</span>
      </div>
      <div className={`mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] ${META}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-full bg-[#8b9cff]/25" />
          ช่วงมูลค่า <span className={INK2}>{fmtBaht(zoneLo)}–{fmtBaht(zoneHi)}</span> บาท
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#8b9cff]" />แต่ละวิธี</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded bg-[#eceef3]" />ราคาตลาด</span>
      </div>
    </div>
  );
}

export default function FairValueCompare({ fv }: { fv: FairValueResult }) {
  const { ticker, price, usable, medianFair, medianUpside, group } = fv;

  const groupText = group == null
    ? null
    : group.level === 'subsector'
      ? `เทียบกลุ่มย่อย ${group.sector} (P/E n=${group.nPe} · P/BV n=${group.nPb})`
      : group.level === 'fund'
        ? `เทียบ ${group.sector} (P/E n=${group.nPe} · P/BV n=${group.nPb})`
        : `เทียบ sector ${group.sector} (P/E n=${group.nPe} · P/BV n=${group.nPb})${fv.fallbackFrom ? ` — กลุ่มย่อย ${fv.fallbackFrom} มีหุ้นที่มี P/E และ P/BV ครบไม่ถึง ${MIN_SUBSECTOR_COMPLETE_PEERS} ตัว` : ''}`;

  const header = (chip?: ReactNode) => (
    <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
      <h3 className="text-[16px] font-semibold text-[#eceef3]">ราคาเหมาะสม</h3>
      {chip}
    </div>
  );

  if (price == null || price <= 0 || usable.length === 0 || medianFair == null || medianUpside == null) {
    return (
      <div data-testid="fair-value">
        {header()}
        <p className={`text-[12px] ${META}`}>
          {fv.loading && price != null ? 'กำลังประเมิน...' : 'ไม่มีข้อมูลพอจะประเมินมูลค่าหุ้นตัวนี้ (ต้องมี P/E หรือ P/BV และราคาปัจจุบัน)'}
        </p>
      </div>
    );
  }

  // ป้าย: ราคาเทียบค่ากลาง — upside < 0 = ราคาแพงกว่าค่ากลาง
  // สีตามเกณฑ์เดียวกับประโยคสรุปด้านบน (±10%) · ข้อความบอกทิศทางเสมอเมื่อห่างเกิน 0.5%
  const tone = medianUpside < -VALUE_BAND_PCT ? 'bad' : medianUpside > VALUE_BAND_PCT ? 'good' : 'neutral';
  const chipCls = tone === 'bad'
    ? 'bg-[#E24B4A]/12 text-[#E24B4A] border-[#E24B4A]/30'
    : tone === 'good'
      ? 'bg-[#1D9E75]/12 text-[#1D9E75] border-[#1D9E75]/30'
      : `bg-white/[0.05] ${INK2} border-white/10`;
  const chipText = medianUpside <= -0.5
    ? `แพงกว่าค่ากลาง ${Math.abs(medianUpside).toFixed(0)}%`
    : medianUpside >= 0.5
      ? `ถูกกว่าค่ากลาง ${medianUpside.toFixed(0)}%`
      : 'ราคาเท่าค่ากลาง';

  return (
    <div data-testid="fair-value" data-median={medianFair.toFixed(2)} data-upside={medianUpside.toFixed(1)}>
      {header(<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold ${chipCls}`}>{chipText}</span>)}

      {/* 1 · ตัวเลขใหญ่ 2 ตัว */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
        <div>
          <div className={`text-[12px] font-medium ${META}`}>ราคาเหมาะสม (ค่ากลาง {usable.length} วิธี)</div>
          <div className="text-[28px] font-bold leading-tight text-[#eceef3]" data-testid="fair-value-median">
            {fmtBaht(medianFair)} <span className={`text-[12px] font-normal ${META}`}>บาท</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[12px] font-medium ${META}`}>ราคาตลาด</div>
          <div className="text-[28px] font-bold leading-tight text-[#eceef3]">
            {fmtBaht(price)} <span className={`text-[12px] font-normal ${META}`}>บาท</span>
          </div>
        </div>
      </div>

      {/* 2 · เส้นราคาเส้นเดียว */}
      <ValueScale fv={fv} />

      {/* 3 · รายการวิธีละ 1 บรรทัด */}
      <div className="mt-2" data-testid="fair-value-methods">
        {fv.methods.map(m => {
          const ok = m.fair != null;
          return (
            <div
              key={m.key}
              className="grid grid-cols-[minmax(92px,auto)_1fr_auto] items-baseline gap-x-3 py-1.5 border-b border-white/[0.06] last:border-0 text-[14px]"
              data-method={m.key}
            >
              <span className={ok ? 'text-[#eceef3]' : META}>{m.label}</span>
              <span className={`text-[12px] ${META} min-w-0 break-words`}>
                {ok ? m.sublabel : m.ineligible ?? 'ไม่มีข้อมูล'}
                {ok && m.band && <> · ช่วง WACC ±1%: {m.band.lo.toFixed(2)}–{m.band.hi.toFixed(2)}</>}
              </span>
              <span className={`text-right font-semibold ${ok ? 'text-[#eceef3]' : META}`}>{ok ? fmtBaht(m.fair as number) : '—'}</span>
            </div>
          );
        })}
      </div>

      {groupText && <p className={`mt-2 text-[12px] ${META}`} data-testid="fair-value-group">{groupText}</p>}

      {/* ธงเตือน spread กว้าง */}
      {fv.diverged && fv.spread != null && (
        <div className="mt-2 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12px] px-3 py-2 rounded-lg">
          <span className="leading-none mt-0.5">⚠</span>
          <span>
            แต่ละวิธีให้ผลต่างกันมาก (ช่วง upside กว้าง {fv.spread.toFixed(0)}%) — ค่ากลางยังไม่ควรใช้เป็นข้อสรุปเดี่ยว ให้ดูที่มาของแต่ละวิธีประกอบ
          </span>
        </div>
      )}

      {/* 4 · ที่มา + ปรับสมมติฐาน (ของเดิมทั้งหมด พับไว้) */}
      <details className="mt-2 group">
        <summary className={`text-[12px] ${META} cursor-pointer select-none hover:text-[#b4bac8]`}>ที่มาและปรับสมมติฐานเอง</summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fv.relative.map(m => {
              const rel = m.relative;
              if (!rel || m.fair == null) return null;
              if (rel.groupMedian == null) {
                return (
                  <div key={m.key} className="text-[12px] text-amber-400/80 rounded-md bg-black/20 px-3 py-2.5">
                    {m.label}: ไม่มีค่ากลางของกลุ่ม — อิงค่าปัจจุบันของหุ้นเอง (ไม่ใช่การเทียบกลุ่ม)
                  </div>
                );
              }
              return (
                <GroupCompareBar
                  key={m.key}
                  rel={rel}
                  n={m.key === 'pe' ? fv.sectorSpread?.nPe : fv.sectorSpread?.nPb}
                  pctile={m.key === 'pe' ? fv.sectorSpread?.pePctile : fv.sectorSpread?.pbPctile}
                />
              );
            })}
          </div>
          <p className={`text-[12px] ${META} leading-relaxed`}>
            <span className={INK2}>“เทียบกลุ่ม”</span> = เอากำไร/หุ้น หรือมูลค่าบัญชี/หุ้น คูณกับ P/E · P/BV กลาง (median) ของหุ้นในกลุ่มเดียวกัน —
            ถ้าหุ้นเทรดต่ำกว่าค่ากลางกลุ่ม มูลค่าที่ได้จะสูงกว่าราคา (ดูมี upside) และกลับกัน ·
            ส่วน DDM/DCF เป็นการประเมินมูลค่าแท้จริงจากปันผล/กระแสเงินสด ไม่อิงกลุ่ม
          </p>
          <p className={`text-[12px] ${META} leading-relaxed`}>
            สมมติฐานมาตรฐานเดียวกับหน้า valuation · DCF: WACC {DCF_WACC_PCT}% · g {DCF_GROWTH_PCT}% · terminal {DCF_TERMINAL_GROWTH_PCT}% · {DCF_YEARS} ปี ·
            DDM: r {DDM_REQUIRED_RETURN_PCT}% · g {DDM_GROWTH_PCT}% — เปลี่ยน WACC 1 จุด มูลค่า DCF ขยับ 20-30% (แถบจางบนเส้นราคาคือช่วงนั้น) ·
            หน้า valuation P/E · P/BV เทียบระดับ sector จึงอาจได้ตัวเลขต่างจากที่นี่เมื่อใช้กลุ่มย่อย
          </p>
          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <Link href={`/valuation/pe-pbv?ticker=${encodeURIComponent(ticker)}`} className="text-[#8b9cff] hover:text-[#b4bfff] underline decoration-dotted underline-offset-2">
              ปรับสมมติฐาน P/E · P/BV เอง
            </Link>
            <Link href={`/valuation/ddm?ticker=${encodeURIComponent(ticker)}`} className="text-[#8b9cff] hover:text-[#b4bfff] underline decoration-dotted underline-offset-2">
              ปรับสมมติฐาน DDM เอง
            </Link>
            <Link href={`/valuation/dcf?ticker=${encodeURIComponent(ticker)}`} className="text-[#8b9cff] hover:text-[#b4bfff] underline decoration-dotted underline-offset-2">
              ปรับสมมติฐาน DCF เอง
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}
