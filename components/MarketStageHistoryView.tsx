'use client';

import ScanHistoryView from '@/components/ScanHistoryView';
import { marketStageHistory } from '@/lib/scanHistoryData/marketStage';

// Loaded on demand (next/dynamic in app/market-stage/page.tsx): the history
// file is ~1.8 MB raw and only the "ย้อนหลัง" tab needs it.
export default function MarketStageHistoryView() {
  return <ScanHistoryView data={marketStageHistory} />;
}
