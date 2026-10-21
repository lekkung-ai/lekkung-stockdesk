import raw from '@/data/scans/weinstein_history.json';
import type { ScanHistoryData } from '@/lib/scanHistory';

// One module per scan so a page bundles only its own history (see lib/scanHistory.ts).
export const stageAnalysisHistory = raw as unknown as ScanHistoryData;
