import raw from '@/data/scans/oneil_history.json';
import type { ScanHistoryData } from '@/lib/scanHistory';

// One module per scan so a page bundles only its own history (see lib/scanHistory.ts).
export const oneilHistory = raw as unknown as ScanHistoryData;
