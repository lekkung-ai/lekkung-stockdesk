'use client';

import ScanHistoryView from '@/components/ScanHistoryView';
import { stageAnalysisHistory } from '@/lib/scanHistoryData/stageAnalysis';

// Loaded on demand (next/dynamic in app/stage-analysis/page.tsx): the history
// file is ~1.8 MB raw and only the "ย้อนหลัง" tab needs it.
export default function StageAnalysisHistoryView() {
  return <ScanHistoryView data={stageAnalysisHistory} />;
}
