// Server-only: the scan files behind the PEAD badges (bundled JSON, like /scanner).
// Only used by app/api/earnings/route.ts - the client gets the small lookup, not these files.
import rawMarketStage from '@/data/scans/market_stage.json';
import rawWeinstein from '@/data/scans/weinstein.json';
import rawRs from '@/data/scans/rs_ranking.json';
import rawSepa from '@/data/scans/sepa.json';
import rawLekkung from '@/data/scans/lekkung.json';
import rawKell from '@/data/scans/oliver_kell.json';
import rawBreakout from '@/data/scans/breakout.json';
import rawPpbp from '@/data/scans/ppbp.json';
import rawOneil from '@/data/scans/oneil.json';
import { buildPeadExtras, type PeadExtra, type PeadSources } from './peadExtras';

type Rows = PeadSources['marketStage'];
const rows = (v: unknown): Rows => (Array.isArray(v) ? (v as Rows) : null);

export function peadExtrasFor(tickers: string[]): Record<string, PeadExtra> {
  return buildPeadExtras(tickers, {
    marketStage: rows(rawMarketStage),
    weinstein: rows(rawWeinstein),
    rsRanking: rows(rawRs),
    scans: {
      sepa: rows(rawSepa), lekkung: rows(rawLekkung), kell: rows(rawKell),
      breakout: rows(rawBreakout), ppbp: rows(rawPpbp), oneil: rows(rawOneil),
    },
  });
}
