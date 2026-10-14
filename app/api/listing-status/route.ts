import { allInactiveStatusesWithTrading } from '@/lib/listingStatusData';

// Delisted / renamed tickers for the search box badges ({ statuses: { TICKER: ListingStatus } }).
// stillTrading comes from a live TradingView check, so the CDN keeps this for 5 minutes only.
export async function GET() {
  return Response.json(
    { statuses: await allInactiveStatusesWithTrading() },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60' } }
  );
}
