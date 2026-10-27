import raw from '@/data/scans/weinstein_transitions.json';
import type { StageTransitionData } from '@/lib/stageTransitions';

// One module per scan so a page bundles only its own history (see lib/scanHistory.ts).
export const stageAnalysisTransitions = raw as unknown as StageTransitionData;
