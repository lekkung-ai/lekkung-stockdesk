'use client';

import Link from 'next/link';
import { useMarketQuotes } from '@/lib/useMarketQuotes';
import { fundTickers, listedFundTickers, tickerToSector, FUND_GROUP_LABEL } from '@/lib/sectorData';

// "กองทุน & REIT (n) →" under a sector page title — n is the same list /funds shows
// (sector_map funds with a TradingView price), limited to this sector + market. No funds → nothing.
export default function FundsLink({ sector, market }: { sector: string; market: string }) {
  const { status, quotes } = useMarketQuotes();
  const inSector = (t: string) => tickerToSector[t]?.sector === sector;
  if (!fundTickers(market).some(inSector)) return null;
  const n = status === 'ok'
    ? listedFundTickers(quotes, market).filter(inSector).length
    : null;
  if (n === 0) return null;
  return (
    <Link href="/funds" data-testid="sector-funds-link" className="inline-block mt-1 text-[12px] font-semibold text-sky-400/80 hover:text-sky-300 transition-colors">
      {FUND_GROUP_LABEL}{n != null ? ` (${n})` : ''} →
    </Link>
  );
}
