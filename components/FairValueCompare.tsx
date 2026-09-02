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
import { getStockValuation, getSectorMedians, getSectorSpread, type SectorSpread } from '@/lib/valuation';
import { getSectorForTicker } from '@/lib/sectorData';

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

  // targetPe/targetPb มาจาก median กลุ่มจริงไหม (ไม่งั้น fallback ไปใช้ค่าของหุ้นเอง)
  // ใช้เงื่อนไขเดียวกับ relative.groupMedian เพื่อไม่ให้สูตรกับแถบเทียบกลุ่มขัดกัน
  const peFromGroup = med?.secPe != null && Number.isFinite(med.secPe);
  const pbFromGroup = med?.secPb != null && Number.isFinite(med.secPb);

  const href = `/valuation/pe-pbv?ticker=${encodeURIComponent(ticker)}`;
  return [
    {
      key: 'pe',
      label: 'P/E เทียบกลุ่ม',
      // สูตรกำกับจะโชว์เฉพาะตอนคำนวณได้จริง ไม่งั้นจะกลายเป็น "EPS undefined × P/E 12.7"
      // "(median กลุ่ม)" ต่อท้ายเฉพาะเมื่อ targetPe เป็น median กลุ่มจริง — fallback ไม่ต่อ ไม่งั้นโกหก
      sublabel: fairPe != null ? `EPS ${eps?.toFixed(2)} × P/E ${targetPe}${peFromGroup ? ` (median ${sector})` : ''}` : `P/E กลาง ${sector} ${targetPe ?? '—'}`,
      fair: fairPe,
      ineligible: fairPe == null ? (eps == null || eps <= 0 ? 'ไม่มี EPS (ขาดทุน/ไม่มีข้อมูล P/E)' : 'ไม่มี P/E กลาง ของกลุ่ม') : null,
      href,
      // groupMedian ใช้ค่า median จริง (med.secPe) ไม่ใช่ fallback — null เมื่อกลุ่มไม่มีค่ากลาง
      relative: {
        current: val?.pe != null && Number.isFinite(val.pe) ? val.pe : null,
        groupMedian: med?.secPe != null && Number.isFinite(med.secPe) ? med.secPe : null,
        n: med?.n ?? 0,
        sector,
        unit: 'P/E',
      },
    },
    {
      key: 'pbv',
      label: 'P/BV เทียบกลุ่ม',
      sublabel: fairPb != null ? `BVPS ${bvps?.toFixed(2)} × P/BV ${targetPb}${pbFromGroup ? ` (median ${sector})` : ''}` : `P/BV กลาง ${sector} ${targetPb ?? '—'}`,
      fair: fairPb,
      ineligible: fairPb == null ? 'ไม่มี BVPS หรือ P/BV กลาง ของกลุ่ม' : null,
      href,
      relative: {
        current: val?.pbv != null && Number.isFinite(val.pbv) ? val.pbv : null,
        groupMedian: med?.secPb != null && Number.isFinite(med.secPb) ? med.secPb : null,
        n: med?.n ?? 0,
        sector,
        unit: 'P/BV',
      },
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

  // ── sector-guard: DCF (FCF-based) ใช้กับกลุ่มการเงินไม่ได้ทุก subsector ─────────
  // แบงก์/เงินทุน-หลักทรัพย์/ประกัน เป็นธุรกิจ balance-sheet-driven — "FCF" ปนกระแส
  // งบดุล (เงินฝาก/สินเชื่อ/reserves) ไม่ใช่เงินสดอิสระจริง ทำให้มูลค่า inflated
  // (KBANK +167%, SAWAD +345%) · guard FCF≤0 ด้านล่างกันได้แค่ตัวที่ FCF ติดลบ ตัวที่
  // FCF บวก-แต่-เพี้ยนหลุดหมด จึงตัดทั้ง sector ตั้งแต่ต้น ก่อนเสียเวลาโหลด/คำนวณ
  // getSectorForTicker ไม่ normalize key ภายใน → ต้อง uppercase/trim เองกันพลาด
  if (getSectorForTicker(ticker.toUpperCase().trim())?.sector === 'Financials') {
    return { ...base, sublabel: '2-Stage DCF', fair: null, ineligible: 'DCF ไม่เหมาะกับกลุ่มการเงิน — FCF ปนกระแสงบดุล (ใช้ DDM/relative แทน)', band: null };
  }

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

const FAIR_ZONE_PCT = 5; // |upside ของ median| ต่ำกว่านี้ = ถือว่าราคาใกล้เคียงมูลค่า (โซนกลาง)
const LOW_PEER_N = 10;   // peer น้อยกว่านี้ = เตือนว่ากลุ่มตัวอย่างเล็ก เชื่อ median ได้น้อยลง

function fmtSignedPct(u: number): string {
  return `${u >= 0 ? '+' : ''}${u.toFixed(1)}%`;
}

// ── แถบเทียบ multiple ของหุ้น vs median กลุ่ม (เฉพาะ P/E, P/BV ที่มีค่ากลางจริง) ──
// เทรดต่ำกว่ากลุ่ม = ตลาดให้ราคาถูกกว่าเพื่อน (โทนเขียว) · สูงกว่ากลุ่ม = แพงกว่า (โทนแดง)
// n: จำนวน peer per-metric จาก sectorSpread (nPe/nPb) — แม่นกว่า rel.n ที่เป็นค่ารวม max
// fallback เป็น rel.n เมื่อไม่มี (กันพลาด) แต่ปกติ groupMedian != null → มี spread เสมอ
function GroupCompareBar({ rel, n }: { rel: RelativeCompare; n?: number }) {
  const current = rel.current;
  const grp = rel.groupMedian;
  if (current == null || grp == null || grp <= 0) return null;

  const peerN = n ?? rel.n;
  const max = Math.max(current, grp) || 1;
  const premium = ((current - grp) / grp) * 100; // >0 = หุ้นเทรดแพงกว่ากลุ่ม
  const stockAbove = premium >= 0;
  const stockColor = stockAbove ? '#E24B4A' : '#1D9E75';

  const Row = ({ label, sub, value, pct, color }: { label: string; sub?: string; value: number; pct: number; color: string }) => (
    <div className="flex items-center gap-2.5">
      <div className="w-[92px] shrink-0 text-[13px] text-white/60 leading-tight">
        {label}{sub && <span className="text-[11px] text-white/30"> {sub}</span>}
      </div>
      <div className="relative flex-1 h-4 rounded-sm bg-white/[0.05] overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <div className="w-[64px] shrink-0 text-right text-[17px] font-semibold tabular-nums text-white/90">
        {value.toFixed(2)}<span className="text-white/30 text-[11px]">x</span>
      </div>
    </div>
  );

  return (
    <div className="mt-2.5 space-y-2 rounded-md bg-black/20 px-3 py-2.5">
      <Row label={`หุ้นนี้ (${rel.unit})`} value={current} pct={(current / max) * 100} color={stockColor} />
      <Row label="กลุ่ม median" sub={`n=${peerN}`} value={grp} pct={(grp / max) * 100} color="rgba(255,255,255,0.30)" />
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[14px] font-semibold" style={{ color: stockColor }}>
          เทรด{stockAbove ? 'สูง' : 'ต่ำ'}กว่ากลุ่ม {Math.abs(premium).toFixed(0)}%
        </span>
        {peerN > 0 && peerN < LOW_PEER_N && (
          <span className="text-[11px] text-amber-400/70">⚠ peer น้อย ({peerN} ตัว)</span>
        )}
      </div>
    </div>
  );
}

// percentile → ข้อความบรรทัดเดียว (แทนแถบ range ที่รก) · PE/PBV ต่ำ = ถูก = pctile ต่ำ
// ค่า pctile หลังกรอง outlier เดียวกับ median (PE≤100, PBV≤20)
function rankLabelOf(pctile: number | null | undefined): { text: string; color: string } | null {
  if (pctile == null) return null;
  if (pctile >= 100) return { text: 'แพงกว่าทั้งกลุ่ม', color: '#E24B4A' };
  if (pctile <= 0) return { text: 'ถูกกว่าทั้งกลุ่ม', color: '#1D9E75' };
  if (pctile < 50) return { text: `ถูกกว่า ${Math.round(100 - pctile)}% ของกลุ่ม`, color: '#1D9E75' };
  return { text: `แพงกว่า ${Math.round(pctile)}% ของกลุ่ม`, color: '#E24B4A' };
}

// ── การ์ดต่อวิธี: label + สูตร + fair value + %upside + ส่วนขยายเฉพาะวิธี ──
// ใช้ทั้งการ์ด relative (P/E·P/BV ใน grid 2 คอลัมน์) และ DDM/DCF (เต็มความกว้าง)
function MethodRow({ m, price, spread }: { m: FairValueMethod; price: number; spread: SectorSpread | null }) {
  const eligible = m.fair != null;
  const upside = eligible ? upsidePct(m.fair as number, price) : null;
  const hasGroup = eligible && m.relative != null && m.relative.groupMedian != null;
  const relFallback = m.relative != null && m.relative.groupMedian == null && eligible;
  // percentile → ข้อความบรรทัดเดียว (เฉพาะ P/E·P/BV ที่มี median กลุ่มจริง)
  const rank = hasGroup ? rankLabelOf(m.key === 'pe' ? spread?.pePctile : spread?.pbPctile) : null;

  return (
    <div className="h-full rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold text-white/90 leading-tight">{m.label}</div>
          <div className="text-[11.5px] text-white/35 mt-1 leading-snug break-words" title={m.sublabel}>{m.sublabel}</div>
        </div>
        <div className="text-right shrink-0">
          {eligible ? (
            <>
              <div className="text-[23px] font-bold text-white tabular-nums leading-none">{(m.fair as number).toFixed(2)}</div>
              <div className={`text-[15px] font-bold tabular-nums mt-1 ${upsideCls(upside as number)}`}>{fmtSignedPct(upside as number)}</div>
            </>
          ) : (
            <div className="flex items-start gap-1 text-[12px] text-white/45 max-w-[160px] justify-end text-right leading-snug">
              <span className="text-amber-400/50 mt-px">⚠</span>
              <span>{m.ineligible ?? 'ไม่มีข้อมูล'}</span>
            </div>
          )}
        </div>
      </div>

      {/* P/E · P/BV: แถบเทียบกลุ่ม (โชว์เฉพาะเมื่อมี median กลุ่มจริง) · n = per-metric จาก spread */}
      {hasGroup && m.relative && (
        <GroupCompareBar rel={m.relative} n={m.key === 'pe' ? spread?.nPe : spread?.nPb} />
      )}

      {/* percentile: หุ้นนี้อยู่อันดับไหนในกลุ่ม (แทนแถบ range ที่รก) */}
      {rank && (
        <div className="mt-2 text-[13px] font-semibold" style={{ color: rank.color }}>
          {rank.text}
        </div>
      )}

      {/* fallback trap: fair คำนวณจากค่าตัวเอง ไม่ใช่กลุ่ม — บอกตรงๆ อย่าโชว์แถบเทียบกลุ่ม */}
      {relFallback && (
        <div className="mt-2 text-[11px] text-amber-400/70 leading-snug">
          ไม่มีค่ากลางของกลุ่ม — อิงค่าปัจจุบันของหุ้นเอง (ไม่ใช่การเทียบกลุ่ม)
        </div>
      )}

      {/* DDM: ระบุว่าเป็นมูลค่าแท้จริงจากปันผล ไม่อิงกลุ่ม */}
      {eligible && m.key === 'ddm' && (
        <div className="mt-2 text-[11px] text-white/30 leading-snug">คำนวณจากปันผลคาดการณ์ · ไม่อิงกลุ่ม</div>
      )}

      {/* DCF: ช่วง sensitivity เมื่อขยับ WACC ±1 จุด */}
      {eligible && m.band && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/35 leading-snug">
          <span className="inline-block w-6 h-[6px] rounded-sm bg-white/[0.14] border border-white/[0.12] shrink-0" />
          ช่วงเมื่อ WACC ±1%: <span className="tabular-nums text-white/60 font-medium">{m.band.lo.toFixed(2)}–{m.band.hi.toFixed(2)}</span> บาท
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
  const sectorSpread = useMemo(() => getSectorSpread(ticker), [ticker]);
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

  // ── ภาพรวม: median fair vs ราคา → ถูก/แพง/ใกล้เคียง ──
  const medianUpside = medianFair != null ? upsidePct(medianFair, price) : null;
  const verdictTone: 'green' | 'red' | 'neutral' =
    medianUpside == null ? 'neutral'
      : medianUpside > FAIR_ZONE_PCT ? 'green'
      : medianUpside < -FAIR_ZONE_PCT ? 'red'
      : 'neutral';
  const verdict = {
    green: {
      icon: '▲', box: 'bg-[#1D9E75]/10 border-[#1D9E75]/30', text: 'text-[#1D9E75]', dot: '#1D9E75',
      msg: medianUpside != null ? `ราคาปัจจุบันถูกกว่ามูลค่าที่ประเมินได้ ${medianUpside.toFixed(0)}%` : '',
    },
    red: {
      icon: '▼', box: 'bg-[#E24B4A]/10 border-[#E24B4A]/30', text: 'text-[#E24B4A]', dot: '#E24B4A',
      msg: medianUpside != null ? `ราคาปัจจุบันแพงกว่ามูลค่าที่ประเมินได้ ${Math.abs(medianUpside).toFixed(0)}%` : '',
    },
    neutral: {
      icon: '≈', box: 'bg-white/[0.04] border-white/[0.1]', text: 'text-white/70', dot: 'rgba(255,255,255,0.55)',
      msg: 'ราคาปัจจุบันใกล้เคียงมูลค่าที่เหมาะสม',
    },
  }[verdictTone];

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-4">
      {/* 1 · header + ราคาปัจจุบันมุมขวา */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-section text-ink">มูลค่าที่เหมาะสม (Fair Value)</h2>
          <p className="text-[10.5px] text-white/30 mt-0.5">ประเมินหลายวิธีแล้วเทียบกับราคาตลาด</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-white/30 uppercase tracking-wide">ราคาปัจจุบัน</div>
          <div className="text-[19px] font-bold text-white tabular-nums leading-tight">{price.toFixed(2)}</div>
        </div>
      </div>

      {/* 2 · แถบสรุปภาพรวม (ถูก/แพง/ใกล้เคียง) */}
      <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3.5 ${verdict.box}`}>
        <span className={`text-[19px] leading-none mt-0.5 ${verdict.text}`}>{verdict.icon}</span>
        <div className="min-w-0">
          <div className={`text-[18px] font-bold leading-tight ${verdict.text}`}>{verdict.msg}</div>
          <div className="text-[12.5px] text-white/40 mt-1">
            อิงค่ากลาง (median) ของ {usable.length} วิธีที่ประเมินได้ เทียบราคา {price.toFixed(2)} บาท
          </div>
        </div>
      </div>

      {/* 3 · P/E · P/BV คู่กัน 2 คอลัมน์ (มือถือ < 768px stack เป็น 1 คอลัมน์) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-stretch">
        {relative.map(m => <MethodRow key={m.key} m={m} price={price} spread={sectorSpread} />)}
      </div>

      {/* DDM · DCF เต็มความกว้าง (absolute model เนื้อหาน้อย) */}
      <div className="space-y-2">
        {[ddm, dcf].map(m => <MethodRow key={m.key} m={m} price={price} spread={sectorSpread} />)}
      </div>

      {/* 4 · ค่ากลางรวม (เด่น) */}
      {medianFair != null && medianUpside != null && (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rotate-45 inline-block shrink-0" style={{ background: verdict.dot }} />
            <div>
              <div className="text-[15.5px] font-bold text-white/90 leading-tight">ค่ากลางรวมทุกวิธี</div>
              <div className="text-[11px] text-white/35 mt-0.5">median ของ {usable.length} วิธีที่ประเมินได้</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[28px] font-extrabold text-white tabular-nums leading-none">{medianFair.toFixed(2)}</div>
            <div className={`text-[16.5px] font-bold tabular-nums mt-1 ${upsideCls(medianUpside)}`}>{fmtSignedPct(medianUpside)}</div>
          </div>
        </div>
      )}

      {/* คงธงเตือน spread กว้าง */}
      {diverged && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-label px-3.5 py-2.5 rounded-xl">
          <span className="text-[13px] leading-none mt-0.5">⚠</span>
          <span>
            แต่ละวิธีให้ผลต่างกันมาก (ช่วง upside กว้าง {spread.toFixed(0)}%) — ค่ากลางยังไม่ควรใช้เป็นข้อสรุปเดี่ยว
            ให้ดูที่มาของแต่ละวิธีประกอบ
          </span>
        </div>
      )}

      {/* 5 · footer: อธิบาย "อิงกลุ่ม" + สมมติฐาน + ลิงก์ปรับเอง */}
      <div className="space-y-2 pt-0.5">
        <p className="text-[10px] text-white/25 leading-relaxed">
          <span className="text-white/45 font-medium">“อิงกลุ่ม”</span> = เอา EPS/BVPS ของหุ้นคูณกับค่า P/E · P/BV กลาง (median) ของหุ้นในกลุ่มเดียวกัน —
          ถ้าหุ้นเทรด<span className="text-[#1D9E75]">ต่ำ</span>กว่าค่ากลางกลุ่ม มูลค่าที่ได้จะสูงกว่าราคา (ดูมี upside) และกลับกัน ·
          ส่วน DDM/DCF เป็นการประเมินมูลค่าแท้จริง ไม่อิงกลุ่ม
        </p>
        <p className="text-[10px] text-white/25 leading-relaxed">
          สมมติฐานมาตรฐานเดียวกับหน้า valuation · DCF: WACC {DCF_WACC_PCT}% · g {DCF_GROWTH_PCT}% · terminal {DCF_TERMINAL_GROWTH_PCT}% · {DCF_YEARS} ปี ·
          DDM: r {DDM_REQUIRED_RETURN_PCT}% · g {DDM_GROWTH_PCT}% —
          เปลี่ยน WACC 1 จุด มูลค่า DCF ขยับ 20-30% (แถบจางในการ์ด DCF คือช่วงนั้น)
        </p>
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
    </div>
  );
}
