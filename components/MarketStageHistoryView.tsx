'use client';

import StageTransitionView from '@/components/StageTransitionView';
import { stageCls } from '@/components/StrategyTable';
import { marketStageTransitions } from '@/lib/scanHistoryData/marketStage';
import type { StageDef } from '@/lib/stageTransitions';

// Best -> worst (confirmed by the user 2026-10-27). Colors = stageCls on the "today" table.
const STAGES: StageDef[] = [
  { name: 'S.Bull', rank: 7, color: '#1b5e20' },
  { name: 'Bull', rank: 6, color: '#4caf50' },
  { name: 'Accumulation', rank: 5, color: '#00bcd4' },
  { name: 'Recovery', rank: 4, color: '#9e9e9e' },
  { name: 'Warning', rank: 3, color: '#FFEB3B' },
  { name: 'Distribution', rank: 2, color: '#ff9800' },
  { name: 'Bear', rank: 1, color: '#ef5350' },
  { name: 'UNKNOWN', rank: null, color: '#424242' },
  { name: 'IPO', rank: null, color: 'rgba(255,255,255,0.14)' },
].map(s => ({ ...s, badgeCls: stageCls(s.name) }));

// Loaded on demand (next/dynamic in app/market-stage/page.tsx): only the "ย้อนหลัง" tab needs it.
export default function MarketStageHistoryView() {
  return <StageTransitionView data={marketStageTransitions} stages={STAGES} />;
}
