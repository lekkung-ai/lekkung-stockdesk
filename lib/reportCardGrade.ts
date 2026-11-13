// The top of /report-card/[scan]: the three-question badges, the one-line summary and the
// "ถ้าเปลี่ยนวิธีขาย" rows. Every threshold lives in GRADE_RULES (the page's "วิธีวัด" box
// reads the same constants), so changing a rule is one edit here.
import { ScanReport, WhatIfKey, WhatIfRow, fmtPct, isNum } from './reportCard';

export type Grade = 'g' | 'm' | 'b';
export const GRADE_LABEL: Record<Grade, string> = { g: 'ดี', m: 'พอใช้', b: 'ต้องแก้' };

export const GRADE_RULES = {
  horizons: ['5', '10', '20'] as const,
  /** card 2 "พอใช้": the average is no worse than this, or the win share is within PROFIT_WIN_SLACK of break-even */
  profitAvgFloor: -0.3,
  profitWinSlack: 5,
  /** card 3: kept at least this share of the average best gain (MFE) when selling */
  exitCaptureGood: 0.4,
  /** fewer closed setups than this -> "ตัวอย่างน้อย" */
  smallSample: 30,
  /** monthly bars with fewer setups than this are drawn faded */
  monthFaintN: 10,
  /** a what-if row must beat the current rule (on the same setups) by at least this many points to be marked "ดีสุด" */
  whatIfBestMin: 0.2,
  /** ...and have at least this many setups; fewer -> faded numbers + "ตัวอย่างน้อย", never ดีสุด */
  whatIfMinN: 30,
} as const;

export interface ScanGrade {
  pick: Grade;
  profit: Grade;
  exit: Grade;
  /** excess return vs SET per horizon that has data, in GRADE_RULES.horizons order */
  excess: { h: string; v: number }[];
  nUp: number;
  /** wins ÷ (wins + losses) × 100, flat setups left out */
  winShare: number | null;
  /** 1 / (1 + payoff) × 100 - the win share needed to break even; null without a payoff ratio */
  breakEven: number | null;
  /** avg return ÷ avg MFE (0 when MFE ≤ 0) */
  capture: number;
  avg: number | null;
  mfe: number | null;
}

export function gradeScan(scan: Pick<ScanReport, 'horizons' | 'setup_summary'>): ScanGrade {
  const sum = scan.setup_summary;
  const excess = GRADE_RULES.horizons
    .map(h => ({ h, v: scan.horizons?.[h]?.excess_return_pct }))
    .filter((x): x is { h: (typeof GRADE_RULES.horizons)[number]; v: number } => isNum(x.v));
  const nUp = excess.filter(x => x.v > 0).length;
  const pick: Grade = excess.length > 0 && nUp === excess.length ? 'g' : excess.length > 0 && nUp >= excess.length / 2 ? 'm' : 'b';

  const avg = isNum(sum?.avg_return_pct) ? sum!.avg_return_pct : null;
  const nWin = sum?.n_win ?? 0;
  const nLoss = sum?.n_loss ?? 0;
  const winShare = nWin + nLoss > 0 ? (nWin / (nWin + nLoss)) * 100 : null;
  const payoff = sum?.payoff_ratio;
  const breakEven = isNum(payoff) && payoff > 0 ? 100 / (1 + payoff) : null;
  let profit: Grade = 'b';
  if (avg != null && avg > 0 && (breakEven == null || (winShare != null && winShare >= breakEven))) profit = 'g';
  else if (
    (avg != null && avg > GRADE_RULES.profitAvgFloor) ||
    (breakEven != null && winShare != null && winShare >= breakEven - GRADE_RULES.profitWinSlack)
  )
    profit = 'm';

  const mfe = isNum(sum?.avg_mfe_pct) ? sum!.avg_mfe_pct : null;
  const capture = avg != null && mfe != null && mfe > 0 ? avg / mfe : 0;
  const exit: Grade = avg == null ? 'b' : capture >= GRADE_RULES.exitCaptureGood ? 'g' : capture >= 0 && avg >= 0 ? 'm' : 'b';

  return { pick, profit, exit, excess, nUp, winShare, breakEven, capture, avg, mfe };
}

export interface Verdict {
  head: string;
  why: string;
  smallSample: boolean;
}

/** One-line summary + 1-2 sentences, built only from the numbers on the page. */
export function verdictFor(scan: Pick<ScanReport, 'horizons' | 'setup_summary'>, g: ScanGrade = gradeScan(scan)): Verdict {
  const sum = scan.setup_summary;
  const nClosed = sum?.n_closed ?? 0;
  const smallSample = nClosed > 0 && nClosed < GRADE_RULES.smallSample;
  if (g.avg == null || nClosed === 0) {
    return { head: 'ยังไม่มีไม้ที่ปิดแล้ว จึงยังสรุปผลไม่ได้', why: 'รอให้มีไม้ที่หลุดสแกนครบ 5 วันทำการก่อน', smallSample: false };
  }
  const total = g.excess.length;
  const a =
    total === 0 ? 'ยังเทียบกับตลาดไม่ได้' : g.pick === 'g' ? 'เลือกหุ้นได้ดีกว่าตลาด' : g.pick === 'm' ? 'เลือกหุ้นได้พอ ๆ กับตลาด' : 'หุ้นที่เลือกยังแพ้ตลาด';
  const b = g.avg > 0 ? `และทำกำไรเฉลี่ย ${fmtPct(g.avg)} ต่อไม้` : `แต่ยังไม่ทำกำไร (เฉลี่ย ${fmtPct(g.avg)} ต่อไม้)`;
  const ws = g.winShare == null ? '–' : `${Math.round(g.winShare)}%`;
  const be = g.breakEven == null ? '–' : `${Math.round(g.breakEven)}%`;
  let why: string;
  if (g.avg > 0) {
    const tail =
      g.winShare != null && g.winShare >= 50 ? `และไม้ที่กำไรมี ${ws} ของไม้ที่มีผล` : `จึงยังคุ้มแม้ไม้ที่กำไรมีแค่ ${ws} ของไม้ที่มีผล`;
    why = `ชนะทีได้เฉลี่ย ${fmtPct(sum?.avg_win_pct)} แพ้ทีเสีย ${fmtPct(sum?.avg_loss_pct)} ${tail}`;
  } else if (g.pick !== 'b' && total > 0) {
    why =
      `หุ้นที่สแกนเลือกชนะ SET ${g.nUp} จาก ${total} ระยะถือ แต่ถือตามสแกนแล้วผลเฉลี่ยยังติดลบ ` +
      `เพราะไม้ที่กำไรมี ${ws} ของไม้ที่มีผล ขณะที่ต้องชนะอย่างน้อย ${be} ถึงจะคุ้มทุน จุดที่ต้องดูต่อคือจังหวะขาย (ช่องที่ 3)`;
  } else {
    why = `หุ้นที่สแกนเลือกชนะ SET ${g.nUp} จาก ${total} ระยะถือ และผลเฉลี่ยต่อไม้ยังติดลบ ดูรายละเอียดใน 3 ช่องด้านล่าง`;
  }
  return { head: `${a} ${b}`, why, smallSample };
}

export const WHAT_IF_ORDER: WhatIfKey[] = ['current', 'exit_on_drop', 'hold_5', 'hold_10', 'hold_20', 'tp_3', 'tp_5', 'sl_3'];

export const WHAT_IF_LABEL: Record<WhatIfKey, string> = {
  current: 'ตอนนี้: ขายเมื่อหลุดสแกนครบ 5 วัน',
  exit_on_drop: 'ขายทันทีที่หลุดสแกน',
  hold_5: 'ถือตายตัว 5 วันทำการ',
  hold_10: 'ถือตายตัว 10 วันทำการ',
  hold_20: 'ถือตายตัว 20 วันทำการ',
  tp_3: 'ขายทำกำไรที่ +3%',
  tp_5: 'ขายทำกำไรที่ +5%',
  sl_3: 'คัทขาดทุนที่ −3%',
};

export interface WhatIfLine extends WhatIfRow {
  key: WhatIfKey;
  label: string;
  /** diff_pct from the script: avg − the main rule on the SAME setups (null for the current row / an old file) */
  diff: number | null;
  /** the main rule's average on the same setups as this row */
  sameAvg: number | null;
  /** fewer than GRADE_RULES.whatIfMinN setups */
  lowSample: boolean;
  /** exit_on_drop: its own setups, not comparable setup by setup */
  differentSet: boolean;
  best: boolean;
}

/**
 * Rows in WHAT_IF_ORDER. "ดีสุด" goes to the single row with the biggest diff_pct when that diff is
 * ≥ whatIfBestMin and n ≥ whatIfMinN. A row on a different set of setups (exit_on_drop) never gets it.
 */
export function whatIfLines(whatIf: ScanReport['what_if']): WhatIfLine[] {
  if (!whatIf) return [];
  const lines: WhatIfLine[] = WHAT_IF_ORDER.filter(k => whatIf[k]).map(k => {
    const r = whatIf[k]!;
    return {
      ...r,
      key: k,
      label: WHAT_IF_LABEL[k],
      diff: k !== 'current' && isNum(r.diff_pct) ? r.diff_pct : null,
      sameAvg: isNum(r.current_same_avg_pct) ? r.current_same_avg_pct : null,
      lowSample: r.n < GRADE_RULES.whatIfMinN,
      differentSet: r.different_set === true,
      best: false,
    };
  });
  let best: WhatIfLine | null = null;
  for (const l of lines) {
    if (l.diff == null || l.lowSample || l.differentSet) continue;
    if (l.diff >= GRADE_RULES.whatIfBestMin - 1e-9 && (!best || l.diff > best.diff!)) best = l;
  }
  if (best) best.best = true;
  return lines;
}
