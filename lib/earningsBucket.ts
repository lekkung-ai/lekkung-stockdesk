// Earnings bucket classification + styling - shared by the /earnings page,
// the F45 section on /stock/[ticker], and (as a Python port) classify_bucket()
// in scripts/fetch_earnings.py. Any change to the classification rule here
// must be mirrored by hand there - no cross-language import.

export type EarningsBucket = 'profit_growth' | 'turnaround' | 'profit_shrink' | 'loss_worse';

export const BUCKET_ORDER: EarningsBucket[] = ['profit_growth', 'turnaround', 'profit_shrink', 'loss_worse'];

export const BUCKET_LABEL: Record<EarningsBucket, string> = {
  profit_growth: 'กำไรโต',
  turnaround: 'ฟื้นตัว-พลิกกำไร',
  profit_shrink: 'กำไรหด',
  loss_worse: 'ขาดทุน-แย่ลง',
};

export const BUCKET_COLOR: Record<EarningsBucket, string> = {
  profit_growth: '#1D9E75', // green
  turnaround: '#4B9EF5',    // blue
  profit_shrink: '#EF9F27', // orange
  loss_worse: '#E24B4A',    // red
};

export const BUCKET_BADGE_STYLE: Record<EarningsBucket, string> = {
  profit_growth: 'bg-[#1D9E75]/15 text-[#1D9E75] ring-1 ring-[#1D9E75]/30',
  turnaround: 'bg-[#4B9EF5]/15 text-[#4B9EF5] ring-1 ring-[#4B9EF5]/30',
  profit_shrink: 'bg-[#EF9F27]/15 text-[#EF9F27] ring-1 ring-[#EF9F27]/30',
  loss_worse: 'bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30',
};

// Kept in sync with classify_bucket() in scripts/fetch_earnings.py.
// A prior-year loss that only shrinks (not necessarily flips positive) still
// counts as "turnaround" (ฟื้นตัว) here, not "profit_growth" - matches the
// spec's own worked example (a company flipping to profit must land in the
// recovery bucket, never profit_growth).
export function classifyBucket(netProfit: number | null | undefined, netProfitPrior: number | null | undefined): EarningsBucket | null {
  if (netProfit == null || netProfitPrior == null) return null;
  if (netProfit > 0 && netProfitPrior > 0) {
    return netProfit >= netProfitPrior ? 'profit_growth' : 'profit_shrink';
  }
  if (netProfitPrior <= 0) {
    return netProfit > netProfitPrior ? 'turnaround' : 'loss_worse';
  }
  return 'loss_worse'; // netProfit <= 0 and netProfitPrior > 0: profit -> loss
}
