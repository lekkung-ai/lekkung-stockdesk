import raw from '@/data/scans/market_stage_transitions.json';
import type { StageTransitionData } from '@/lib/stageTransitions';

// One module per scan so a page bundles only its own history (see lib/scanHistory.ts).
export const marketStageTransitions = raw as unknown as StageTransitionData;
