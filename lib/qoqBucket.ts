// QoQ classification and styling - shared across Earnings page and components.

export type QoQCategory =
  | 'profit_up'    // กำไรเพิ่มขึ้น (Green)
  | 'profit_same'  // กำไรเท่าเดิม (Blue)
  | 'profit_down'  // กำไรลดลง (Orange)
  | 'loss_down'    // ขาดทุนลดลง (Yellow)
  | 'loss_up'      // ขาดทุนเพิ่มขึ้น (Red)
  | 'no_base';     // ไม่มีฐานเทียบ (Gray)

export const QOQ_CATEGORIES: QoQCategory[] = [
  'profit_up',
  'profit_same',
  'profit_down',
  'loss_down',
  'loss_up',
];

export const QOQ_LABEL: Record<QoQCategory, string> = {
  profit_up: 'กำไรเพิ่มขึ้น',
  profit_same: 'กำไรเท่าเดิม',
  profit_down: 'กำไรลดลง',
  loss_down: 'ขาดทุนลดลง',
  loss_up: 'ขาดทุนเพิ่มขึ้น',
  no_base: 'ไม่มีฐานเทียบ',
};

export const QOQ_COLOR: Record<QoQCategory, string> = {
  profit_up: '#1D9E75',   // Green
  profit_same: '#3B82F6', // Blue
  profit_down: '#EF9F27', // Orange
  loss_down: '#EAB308',   // Yellow
  loss_up: '#E24B4A',     // Red
  no_base: '#8A8F98',     // Gray
};

export const QOQ_BADGE_STYLE: Record<QoQCategory, string> = {
  profit_up: 'bg-[#1D9E75]/15 text-[#1D9E75] ring-1 ring-[#1D9E75]/30',
  profit_same: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  profit_down: 'bg-[#EF9F27]/15 text-[#EF9F27] ring-1 ring-[#EF9F27]/30',
  loss_down: 'bg-[#EAB308]/15 text-[#EAB308] ring-1 ring-[#EAB308]/30',
  loss_up: 'bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30',
  no_base: 'bg-[#8A8F98]/15 text-[#8A8F98]',
};

export interface QoQAnalysis {
  category: QoQCategory;
  pct: number | null;
  label: string;
  color: string;
  badgeStyle: string;
}

export function classifyQoQ(
  netProfit: number | null | undefined,
  netProfitPriorQ: number | null | undefined,
  rawPct?: number | null | undefined
): QoQAnalysis {
  if (netProfit == null) {
    return {
      category: 'no_base',
      pct: null,
      label: QOQ_LABEL.no_base,
      color: QOQ_COLOR.no_base,
      badgeStyle: QOQ_BADGE_STYLE.no_base,
    };
  }

  // Calculate % QoQ standard growth formula: (curr - prev) / abs(prev) * 100
  let pct: number | null = rawPct ?? null;
  if (pct == null && netProfitPriorQ != null && netProfitPriorQ !== 0) {
    pct = ((netProfit - netProfitPriorQ) / Math.abs(netProfitPriorQ)) * 100;
  }

  if (netProfitPriorQ == null || netProfitPriorQ === 0) {
    if (pct != null) {
      const cat: QoQCategory = pct > 0.1 ? 'profit_up' : pct < -0.1 ? 'profit_down' : 'profit_same';
      return {
        category: cat,
        pct,
        label: QOQ_LABEL[cat],
        color: QOQ_COLOR[cat],
        badgeStyle: QOQ_BADGE_STYLE[cat],
      };
    }
    return {
      category: 'no_base',
      pct: null,
      label: QOQ_LABEL.no_base,
      color: QOQ_COLOR.no_base,
      badgeStyle: QOQ_BADGE_STYLE.no_base,
    };
  }

  const isCurrProfit = netProfit > 0;
  const isPrevProfit = netProfitPriorQ > 0;

  let category: QoQCategory = 'no_base';

  if (isCurrProfit && isPrevProfit) {
    if (pct != null && Math.abs(pct) < 0.1) {
      category = 'profit_same';
    } else if (netProfit >= netProfitPriorQ) {
      category = 'profit_up';
    } else {
      category = 'profit_down';
    }
  } else if (isCurrProfit && !isPrevProfit) {
    // Loss -> Profit QoQ (Turnaround QoQ)
    category = 'profit_up';
  } else if (!isCurrProfit && isPrevProfit) {
    // Profit -> Loss QoQ
    category = 'loss_up';
  } else {
    // Both Loss (< 0)
    if (netProfit > netProfitPriorQ) {
      // Current loss is smaller than prior Q loss -> Loss decreased
      category = 'loss_down';
    } else if (netProfit < netProfitPriorQ) {
      // Current loss is larger than prior Q loss -> Loss increased
      category = 'loss_up';
    } else {
      category = 'profit_same';
    }
  }

  return {
    category,
    pct,
    label: QOQ_LABEL[category],
    color: QOQ_COLOR[category],
    badgeStyle: QOQ_BADGE_STYLE[category],
  };
}
