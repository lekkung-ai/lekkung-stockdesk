// Earnings bucket classification + styling - shared by the /earnings page,
// the calendar page's 4-color legend, the F45 section on /stock/[ticker],
// and (as a Python port) classify_bucket() in scripts/fetch_earnings.py. Any
// change to the classification rule here must be mirrored by hand there -
// no cross-language import.

export type EarningsBucket = 'profit_growth' | 'turnaround' | 'profit_shrink' | 'loss_shrink' | 'loss_worse' | 'no_base';

export const BUCKET_ORDER: EarningsBucket[] = ['profit_growth', 'turnaround', 'profit_shrink', 'loss_shrink', 'loss_worse', 'no_base'];

export const BUCKET_LABEL: Record<EarningsBucket, string> = {
  profit_growth: 'กำไรโต',
  turnaround: 'พลิกกำไร',
  profit_shrink: 'กำไรหด',
  loss_shrink: 'ขาดทุนลดลง',
  loss_worse: 'ขาดทุน-แย่ลง',
  no_base: 'ไม่มีฐานเทียบ',
};

export const BUCKET_COLOR: Record<EarningsBucket, string> = {
  profit_growth: '#1D9E75', // green - profit, grew vs last year
  turnaround: '#0B6E4F',    // dark green - flipped from loss to profit
  profit_shrink: '#EF9F27', // orange - still profit, but less than last year
  loss_shrink: '#EAB308',   // yellow - still a loss, but smaller than last year
  loss_worse: '#E24B4A',    // red - loss grew, or flipped from profit to loss
  no_base: '#8A8F98',       // gray - last year's base is 0/missing (e.g. new IPO) - never guess a direction
};

export const BUCKET_BADGE_STYLE: Record<EarningsBucket, string> = {
  profit_growth: 'bg-[#1D9E75]/15 text-[#1D9E75] ring-1 ring-[#1D9E75]/30',
  turnaround: 'bg-[#0B6E4F]/15 text-[#0B6E4F] ring-1 ring-[#0B6E4F]/30',
  profit_shrink: 'bg-[#EF9F27]/15 text-[#EF9F27] ring-1 ring-[#EF9F27]/30',
  loss_shrink: 'bg-[#EAB308]/15 text-[#EAB308] ring-1 ring-[#EAB308]/30',
  loss_worse: 'bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30',
  no_base: 'bg-[#8A8F98]/15 text-[#8A8F98] ring-1 ring-[#8A8F98]/30',
};

// Kept in sync with classify_bucket() in scripts/fetch_earnings.py.
//   profit_growth  - profit both periods, this period >= last year
//   profit_shrink  - profit both periods, this period <  last year
//   loss_shrink    - loss both periods, this period's loss <  last year's loss
//   loss_worse     - loss both periods with this period's loss >= last year's,
//                    OR profit last year but a loss this period
//   turnaround     - last year was a loss (not zero/missing), profit this period
//   no_base        - last year's netProfit is 0 or missing (new IPO, no
//                    comparable prior-year period) - YoY is undefined, so
//                    this must never be folded into profit_growth/turnaround
export function classifyBucket(netProfit: number | null | undefined, netProfitPrior: number | null | undefined): EarningsBucket | null {
  if (netProfit == null) return null; // this period's own result is unknown - nothing to classify

  if (netProfitPrior == null || netProfitPrior === 0) {
    return 'no_base';
  }

  const wasProfit = netProfitPrior > 0;
  const isProfit = netProfit > 0;

  if (isProfit && wasProfit) {
    return netProfit >= netProfitPrior ? 'profit_growth' : 'profit_shrink';
  }
  if (!isProfit && wasProfit) {
    return 'loss_worse'; // profit -> loss
  }
  if (isProfit && !wasProfit) {
    return 'turnaround'; // loss -> profit
  }
  // both periods negative (a real loss both years)
  return netProfit > netProfitPrior ? 'loss_shrink' : 'loss_worse';
}
