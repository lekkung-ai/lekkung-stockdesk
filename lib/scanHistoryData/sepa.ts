import raw from '@/data/scans/sepa_history.json';
import type { ScanHistoryData } from '@/lib/scanHistory';

// One module per scan so a page bundles only its own history (see lib/scanHistory.ts).
export const sepaHistory = raw as unknown as ScanHistoryData;
