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
    '/*': [
      './data/history/**/*',
      './public/data/history/**/*',
      './public/data/earnings/**/*',
      // lib/sepaChecklistData.ts อ่านตอน request (ไฟล์อาจยังไม่มี → การ์ด SEPA แบบเดิม)
      './data/scans/sepa_checklist.json',
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
  },
};

export default nextConfig;
