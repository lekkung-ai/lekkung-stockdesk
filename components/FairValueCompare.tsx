'use client';

// เทียบ "มูลค่าที่เหมาะสม" หลายวิธีกับราคาจริงในภาพเดียว
//
// ทุกสูตรในไฟล์นี้ port มาจากหน้า valuation เดิมแบบตรงตัว รวมถึง "การปัดเลขระหว่างทาง"
// ด้วย เพราะหน้า pe-pbv ปัดค่าลง input ก่อนคูณ (eps/bvps ทศนิยม 2, target PE ทศนิยม 1)
// ถ้าไม่ปัดตาม ค่าจะเพี้ยนจากหน้าเดิมหลักสิบสตางค์ แล้วผู้ใช้จะเห็นตัวเลขสองหน้าไม่ตรงกัน
//   - PE/PBV : app/valuation/pe-pbv/page.tsx:58-67, 149-150
//
// ค่ากลางใช้ "median" ไม่ใช่ค่าเฉลี่ย เพราะแต่ละวิธีให้ผลต่างกันได้หลายเท่าตัว
// (COM7: fairPE 27.61 vs fairPBV 5.09 · SRICHA: 55.46 vs 3.77) ค่าเฉลี่ยจะถูกตัวสุดโต่ง
// ลากไปทั้งก้อน — และเมื่อช่วงห่างกันมากจะขึ้นธงเตือนแทนที่จะรายงานเลขเดียวแบบมั่นใจเกินจริง

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getStockValuation, getSectorMedians } from '@/lib/valuation';

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

function upsideCls(u: number): string {
  return u >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]';
}

// ── PE/PBV relative — offline ล้วน ไม่มี fetch (lib/valuation.ts อ่าน market_stage.json) ──
export function buildRelativeMethods(ticker: string): FairValueMethod[] {
  const val = getStockValuation(ticker);
  const med = getSectorMedians(ticker);
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

  const href = `/valuation/pe-pbv?ticker=${encodeURIComponent(ticker)}`;
  return [
    {
      key: 'pe',
      label: 'P/E เทียบกลุ่ม',
      // สูตรกำกับจะโชว์เฉพาะตอนคำนวณได้จริง ไม่งั้นจะกลายเป็น "EPS undefined × P/E 12.7"
      sublabel: fairPe != null ? `EPS ${eps?.toFixed(2)} × P/E ${targetPe} (median ${sector})` : `P/E กลาง ${sector} ${targetPe ?? '—'}`,
      fair: fairPe,
      ineligible: fairPe == null ? (eps == null || eps <= 0 ? 'ไม่มี EPS (ขาดทุน/ไม่มีข้อมูล P/E)' : 'ไม่มี P/E กลาง ของกลุ่ม') : null,
      href,
    },
    {
      key: 'pbv',
      label: 'P/BV เทียบกลุ่ม',
      sublabel: fairPb != null ? `BVPS ${bvps?.toFixed(2)} × P/BV ${targetPb} (median ${sector})` : `P/BV กลาง ${sector} ${targetPb ?? '—'}`,
      fair: fairPb,
      ineligible: fairPb == null ? 'ไม่มี BVPS หรือ P/BV กลาง ของกลุ่ม' : null,
      href,
    },
  ];
}

// ── DDM (Gordon Growth) — port จาก app/valuation/ddm/page.tsx:125-151 ────────
// fair = dps × (1 + g) ÷ (r − g) โดย g/r เป็นสัดส่วน (4% -> 0.04) เหมือนหน้าเดิม
// เงื่อนไขที่หน้าเดิมบล็อกไว้ ยกมาครบ: dps ต้อง > 0 และ r ต้องมากกว่า g (ไม่งั้นหารด้วย
// เลขติดลบ/ศูนย์ แล้วได้มูลค่าติดลบหรืออนันต์)
export interface DdmInputs { price: number | null; dps: number | null; dividendYield: number | null }

export function buildDdmMethod(ticker: string, inputs: DdmInputs | null, loading: boolean): FairValueMethod {
  const href = `/valuation/ddm?ticker=${encodeURIComponent(ticker)}`;
  const base: Omit<FairValueMethod, 'fair' | 'ineligible' | 'sublabel'> = {
    key: 'ddm',
    label: 'DDM (ปันผล)',
    href,
  };
  if (loading) return { ...base, sublabel: 'กำลังโหลดข้อมูลปันผล...', fair: null, ineligible: 'กำลังโหลด...' };
  if (!inputs) return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'ดึงข้อมูลปันผลไม่ได้' };

  const dps = inputs.dps;
  const growth = DDM_GROWTH_PCT / 100;
  const r = DDM_REQUIRED_RETURN_PCT / 100;

  if (dps == null || !Number.isFinite(dps) || dps <= 0) {
    return { ...base, sublabel: 'Gordon Growth', fair: null, ineligible: 'ไม่เข้าเกณฑ์ (ไม่จ่ายปันผล)' };
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
    sublabel: `DPS ${dps.toFixed(2)} × (1+${DDM_GROWTH_PCT}%) ÷ (${DDM_REQUIRED_RETURN_PCT}%−${DDM_GROWTH_PCT}%)`,
    fair,
    ineligible: null,
  };
}

// ── DCF 2-stage — port จาก app/valuation/dcf/page.tsx:136-201 ────────────────
// เดินกระแสเงินสด n ปี คิดลดกลับด้วย WACC + Terminal Value แล้วสะพานเป็นมูลค่าต่อหุ้น
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

export function buildDcfMethod(ticker: string, inputs: DcfInputs | null, loading: boolean): FairValueMethod {
  const href = `/valuation/dcf?ticker=${encodeURIComponent(ticker)}`;
  const base = { key: 'dcf', label: 'DCF (กระแสเงินสด)', href };
  if (loading) return { ...base, sublabel: 'กำลังโหลดงบกระแสเงินสด...', fair: null, ineligible: 'กำลังโหลด...', band: null };
  if (!inputs) return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'ดึงข้อมูล FCF ไม่ได้', band: null };

  const { fcf, netDebt, shares } = inputs;
  if (fcf == null || !Number.isFinite(fcf) || fcf <= 0) {
    // หน้า DCF เดิมยอมให้คำนวณ FCF ติดลบ (ได้มูลค่าติดลบ) แต่บนแทร็กเทียบราคา
    // มูลค่าติดลบอ่านไม่ได้ความ จึงตัดทิ้งแทนที่จะวางหมุดใต้ศูนย์
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
    sublabel: `FCF ${Math.round(f).toLocaleString()} ลบ. · WACC ${DCF_WACC_PCT}% · g ${DCF_GROWTH_PCT}% · ${DCF_YEARS} ปี`,
    fair,
    ineligible: null,
    band: lo != null && hi != null && lo > 0 ? { lo, hi } : null,
  };
}

// ── Track: ราคาจริง vs มูลค่าที่เหมาะสม บนแกนเดียวกัน ──────────────────────────
function ValueTrack({
  methods,
  price,
  medianFair,
}: {
  methods: FairValueMethod[];
  price: number;
  medianFair: number | null;
}) {
  const fairs = methods.flatMap(m =>
    m.fair == null ? [] : m.band ? [m.fair, m.band.lo, m.band.hi] : [m.fair]
  );
  const lo = Math.min(price, ...fairs);
  const hi = Math.max(price, ...fairs);
  const span = hi - lo || 1;
  const pad = 8; // เว้นขอบซ้าย/ขวาไม่ให้ marker ตกขอบ
  const pos = (v: number) => pad + ((v - lo) / span) * (100 - pad * 2);

  return (
    <div className="space-y-3">
      {methods.map(m => (
        <div key={m.key} className="grid grid-cols-[104px_1fr_112px] items-center gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-white/70 truncate">{m.label}</div>
            <div className="text-[9.5px] text-white/25 truncate" title={m.sublabel}>{m.sublabel}</div>
          </div>

          <div className="relative h-6">
            {/* รางพื้นหลัง */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[3px] rounded-full bg-white/[0.06]" />
            {m.fair != null && m.band && (
              /* ช่วงมูลค่าเมื่อขยับ WACC ±1 จุด — บอกว่าหมุดนี้ไม่ใช่ตัวเลขตายตัว */
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[9px] rounded-sm bg-white/[0.10] border border-white/[0.12]"
                style={{
                  left: `${Math.min(pos(m.band.lo), pos(m.band.hi))}%`,
                  width: `${Math.max(2, Math.abs(pos(m.band.hi) - pos(m.band.lo)))}%`,
                }}
                title={`ช่วงมูลค่าเมื่อ WACC ±1%: ${m.band.lo.toFixed(2)} – ${m.band.hi.toFixed(2)} บาท`}
              />
            )}
            {m.fair != null && (
              <>
                {/* ระยะห่างจากราคาปัจจุบันถึงมูลค่าที่เหมาะสม */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full"
                  style={{
                    left: `${Math.min(pos(price), pos(m.fair))}%`,
                    width: `${Math.abs(pos(m.fair) - pos(price))}%`,
                    background: m.fair >= price ? 'rgba(29,158,117,0.45)' : 'rgba(226,75,74,0.45)',
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#13161e]"
                  style={{ left: `calc(${pos(m.fair)}% - 5px)`, background: m.fair >= price ? '#1D9E75' : '#E24B4A' }}
                  title={`มูลค่าที่เหมาะสม ${m.fair.toFixed(2)} บาท`}
                />
              </>
            )}
            {/* ราคาปัจจุบัน */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-white/80"
              style={{ left: `calc(${pos(price)}% - 1px)` }}
              title={`ราคาปัจจุบัน ${price.toFixed(2)} บาท`}
            />
          </div>

          <div className="text-right">
            {m.fair != null ? (
              <>
                <div className="text-[13px] font-bold text-white tabular-nums leading-tight">{m.fair.toFixed(2)}</div>
                <div className={`text-[10.5px] font-semibold tabular-nums ${upsideCls(upsidePct(m.fair, price))}`}>
                  {upsidePct(m.fair, price) >= 0 ? '+' : ''}{upsidePct(m.fair, price).toFixed(1)}%
                </div>
              </>
            ) : (
              <div className="text-[10px] text-white/30 leading-tight" title={m.ineligible ?? ''}>
                {m.ineligible ?? 'ไม่มีข้อมูล'}
              </div>
            )}
          </div>
        </div>
      ))}

      {medianFair != null && (
        <div className="grid grid-cols-[104px_1fr_112px] items-center gap-3 pt-1 border-t border-white/[0.06]">
          <div className="text-[11px] font-bold text-white/80">ค่ากลาง (median)</div>
          <div className="relative h-4">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 border-2 border-[#13161e]"
              style={{ left: `calc(${pos(medianFair)}% - 6px)`, background: medianFair >= price ? '#1D9E75' : '#E24B4A' }}
            />
            <div className="absolute top-0 bottom-0 w-[2px] bg-white/80" style={{ left: `calc(${pos(price)}% - 1px)` }} />
          </div>
          <div className="text-right">
            <div className="text-[15px] font-extrabold text-white tabular-nums leading-tight">{medianFair.toFixed(2)}</div>
            <div className={`text-[11px] font-bold tabular-nums ${upsideCls(upsidePct(medianFair, price))}`}>
              {upsidePct(medianFair, price) >= 0 ? '+' : ''}{upsidePct(medianFair, price).toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FairValueCompare({
  ticker,
  currentPrice,
}: {
  ticker: string;
  currentPrice: number | null;
}) {
  const [ddmInputs, setDdmInputs] = useState<DdmInputs | null>(null);
  const [ddmLoading, setDdmLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDdmLoading(true);
    setDdmInputs(null);
    fetch(`/api/ddm-inputs/${encodeURIComponent(ticker)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data && !data.error) setDdmInputs({ price: data.price ?? null, dps: data.dps ?? null, dividendYield: data.dividendYield ?? null });
        setDdmLoading(false);
      })
      .catch(() => { if (!cancelled) setDdmLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const [dcfInputs, setDcfInputs] = useState<DcfInputs | null>(null);
  const [dcfLoading, setDcfLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDcfLoading(true);
    setDcfInputs(null);
    fetch(`/api/dcf-inputs/${encodeURIComponent(ticker)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data && !data.error) {
          setDcfInputs({ price: data.price ?? null, fcf: data.fcf ?? null, netDebt: data.netDebt ?? null, shares: data.shares ?? null });
        }
        setDcfLoading(false);
      })
      .catch(() => { if (!cancelled) setDcfLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const relative = useMemo(() => buildRelativeMethods(ticker), [ticker]);
  const ddm = buildDdmMethod(ticker, ddmInputs, ddmLoading);
  const dcf = buildDcfMethod(ticker, dcfInputs, dcfLoading);
  const methods = [...relative, ddm, dcf];

  const offlinePrice = getStockValuation(ticker)?.price ?? null;
  const price = currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : offlinePrice;

  const usable = methods.filter(m => m.fair != null).map(m => m.fair as number);
  const medianFair = median(usable);

  if (price == null || price <= 0 || usable.length === 0) {
    return (
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
        <h2 className="text-section text-ink mb-2">มูลค่าที่เหมาะสม (Fair Value)</h2>
        <p className="text-[12px] text-white/30">
          ไม่มีข้อมูลพอจะประเมินมูลค่าหุ้นตัวนี้ (ต้องมี P/E หรือ P/BV และราคาปัจจุบัน)
        </p>
      </div>
    );
  }

  const upsides = usable.map(f => upsidePct(f, price));
  const spread = Math.max(...upsides) - Math.min(...upsides);
  const diverged = usable.length >= 2 && spread > DIVERGENCE_SPREAD_PCT;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-section text-ink">มูลค่าที่เหมาะสม (Fair Value)</h2>
          <p className="text-[11px] text-white/30 mt-0.5">
            เทียบราคาปัจจุบัน <span className="text-white/60 tabular-nums font-semibold">{price.toFixed(2)}</span> บาท
            กับมูลค่าที่ประเมินได้จากหลายวิธี
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/30">
          <span className="w-[2px] h-3 bg-white/80 inline-block" />
          <span>ราคาปัจจุบัน</span>
        </div>
      </div>

      <ValueTrack methods={methods} price={price} medianFair={medianFair} />

      {diverged && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-label px-3.5 py-2.5 rounded-xl">
          <span className="text-[13px] leading-none mt-0.5">⚠</span>
          <span>
            แต่ละวิธีให้ผลต่างกันมาก (ช่วง upside กว้าง {spread.toFixed(0)}%) — ค่ากลางยังไม่ควรใช้เป็นข้อสรุปเดี่ยว
            ให้ดูที่มาของแต่ละวิธีประกอบ
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-white/30">
        <Link href={`/valuation/pe-pbv?ticker=${encodeURIComponent(ticker)}`} className="text-white/40 hover:text-white/70 underline decoration-dotted underline-offset-2 transition-colors">
          ปรับสมมติฐาน P/E · P/BV เอง
        </Link>
        <Link href={`/valuation/ddm?ticker=${encodeURIComponent(ticker)}`} className="text-white/40 hover:text-white/70 underline decoration-dotted underline-offset-2 transition-colors">
          ปรับสมมติฐาน DDM เอง
        </Link>
        <Link href={`/valuation/dcf?ticker=${encodeURIComponent(ticker)}`} className="text-white/40 hover:text-white/70 underline decoration-dotted underline-offset-2 transition-colors">
          ปรับสมมติฐาน DCF เอง
        </Link>
      </div>
    </div>
  );
}
