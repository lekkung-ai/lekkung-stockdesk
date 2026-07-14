// Shared rating-color classification for research cards (used by
// ResearchTab.tsx and the /stock/[ticker] related-research section).
//
// Kaohoon/มิติหุ้น research titles only ever produce the 3 fixed Thai words
// (ซื้อ/ขาย/ถือ), but SETTrade IAA's `rating` field is open-ended English
// text straight from each broker ("BUY", "Neutral", "Gradual buying
// (Maintain recommendation)", "BBB" for a credit rating, etc.) - one
// classifier handles both vocabularies by keyword match instead of an exact
// lookup table, since IAA alone doesn't have a fixed enum to key off.
export type RatingBucket = 'buy' | 'sell' | 'neutral';

export const RATING_BUCKET_STYLE: Record<RatingBucket, string> = {
  buy: 'bg-[#1D9E75]/15 text-[#1D9E75] ring-1 ring-[#1D9E75]/30',
  sell: 'bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30',
  neutral: 'bg-white/[0.07] text-white/50 ring-1 ring-white/10',
};

export function classifyRating(rating: string | null | undefined): RatingBucket {
  if (!rating) return 'neutral';
  const r = rating.toLowerCase();
  if (
    r.includes('ซื้อ') ||
    /\bbuy\b/.test(r) ||
    r.includes('outperform') ||
    r.includes('overweight') ||
    r.includes('accumulate') ||
    /\badd\b/.test(r)
  ) {
    return 'buy';
  }
  if (
    r.includes('ขาย') ||
    /\bsell\b/.test(r) ||
    r.includes('underperform') ||
    r.includes('underweight') ||
    r.includes('reduce')
  ) {
    return 'sell';
  }
  return 'neutral'; // ถือ, Neutral, Hold, Trading, credit ratings (BBB...), anything unrecognized
}

export const IAA_SOURCE_NAME = 'SETTrade IAA';
