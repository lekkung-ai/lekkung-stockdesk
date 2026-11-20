import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // /sector-rotation (RRG) was replaced by /sector-flow
    return [{ source: '/sector-rotation', destination: '/sector-flow', permanent: false }];
  },
  outputFileTracingIncludes: {
    // Every path a Route Handler reads via fs.readFileSync at request time
    // must be listed here, or Vercel's serverless bundle excludes it (only
    // files Next's build-time tracing can prove are needed get bundled) -
    // the file exists fine in the git repo and deploys, fs just can't see
    // it at runtime, silently falling back to an empty response with no
    // error surfaced anywhere. This is what happened to /earnings:
    // public/data/earnings/ was never added here when that route was built.
    //
    // Bind each pattern to the routes that really read it, never history
    // folders under '/*': on 2026-11-20 '/*' carried all of data/history
    // (~197 MB) + public/data/history (~25 MB) into all 79 functions
    // (/stock/[ticker] 244 MB of Vercel's 250 MB), so Vercel could not group
    // routes and the deploy failed with "No more than 12 Serverless Functions".
    // Route keys are globs: '/stock/*' = /stock/[ticker] ('[' is a glob char).
    '/*': [
      './public/data/earnings/**/*',
    ],
    '/stock/*': [
      // lib/listingStatusData.ts: universe_changes snapshot of every date + SET news of every date
      './data/history/*/universe_changes.json',
      './public/data/history/*/news.json',
      // lib/sepaChecklistData.ts / lib/kellChecklistData.ts อ่านตอน request (ไฟล์อาจยังไม่มี → การ์ดแบบเดิม)
      './data/scans/sepa_checklist.json',
      './data/scans/kell_checklist.json',
      // lib/stockInsightsData.ts อ่านตอน request (การ์ด จุดเข้า / ประวัติในสแกน / แรงเงิน ของหน้า /stock)
      './data/scans/sepa.json',
      './data/scans/scan_days.json',
      './data/scans/sepa_history.json',
      './data/scans/oliver_kell_history.json',
      './data/scans/breakout_history.json',
      './data/scans/lekkung_history.json',
      './data/scans/oneil_history.json',
      './data/scans/market_stage_transitions.json',
      './data/scans/report_card.json',
      './data/scans/nvdr.json',
      './data/scans/sector_rs_history.json',
    ],
    // lib/listingStatusData.ts (same reads as /stock/*)
    '/api/listing-status': [
      './data/history/*/universe_changes.json',
      './public/data/history/*/news.json',
    ],
    // app/api/history: the date index only
    '/api/history': ['./data/history/index.json'],
    // daily snapshots read by date (readStaticDay + lib/secLatest findLatestSecDay)
    '/api/sec/r59': ['./data/history/*/r59.json'],
    '/api/sec/r246': ['./data/history/*/r246.json'],
    // last 7 / 60 days of news snapshots, last 7 days of research snapshots
    '/api/news/*': ['./public/data/history/*/news.json'],
    '/api/research/*': ['./public/data/history/*/research.json'],
  },
  // Turbopack traces fs reads with a dynamic date (path.join(cwd, 'data', 'history', date, file))
  // as the whole folder. Excludes run after includes, so keep only the file each route reads
  // (history folders are exactly <dir>/index.json + <dir>/<date>/<file>).
  // Note: Next joins these with path.join, so on a Windows build the backslashes escape '!(' and
  // only '*.json' takes effect - the local Windows trace stays big; Vercel (Linux) applies them all.
  outputFileTracingExcludes: {
    '/stock/*': [
      './data/history/*.json',
      './data/history/*/!(universe_changes.json)',
      './public/data/history/*.json',
      './public/data/history/*/!(news.json)',
    ],
    '/api/listing-status': [
      './data/history/*.json',
      './data/history/*/!(universe_changes.json)',
      './public/data/history/*.json',
      './public/data/history/*/!(news.json)',
    ],
    '/api/sec/r59': ['./data/history/*.json', './data/history/*/!(r59.json)'],
    '/api/sec/r246': ['./data/history/*.json', './data/history/*/!(r246.json)'],
    '/api/news/*': ['./public/data/history/*.json', './public/data/history/*/!(news.json)'],
    '/api/research/*': ['./public/data/history/*.json', './public/data/history/*/!(research.json)'],
  },
};

export default nextConfig;
