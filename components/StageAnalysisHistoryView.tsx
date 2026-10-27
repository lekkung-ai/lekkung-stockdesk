'use client';

import StageTransitionView from '@/components/StageTransitionView';
import { stageAnalysisTransitions } from '@/lib/scanHistoryData/stageAnalysis';
import type { StageDef } from '@/lib/stageTransitions';

// Best -> worst (confirmed by the user 2026-10-27). Text colors = the Stage cell on
// the "today" table (2A blue, Stage 2 green, Stage 4 red, the rest grey); the
// "- transition" and Stage 1/3 strip fills are lighter shades of those so the
// daily strip can tell them apart.
const STAGES: StageDef[] = [
  { name: 'Stage 2A (Breakout)', rank: 7, color: '#00BFFF', badgeCls: 'text-[#00BFFF] font-bold' },
  { name: 'Stage 2 (Advancing)', rank: 6, color: '#1D9E75', badgeCls: 'text-[#1D9E75]' },
  { name: 'Stage 2- transition', rank: 5, color: 'rgba(29,158,117,0.5)', badgeCls: 'text-[#1D9E75]' },
  { name: 'Stage 1 (Basing)', rank: 4, color: 'rgba(255,255,255,0.6)', badgeCls: 'text-white/60' },
  { name: 'Stage 3 (Topping)', rank: 3, color: 'rgba(255,255,255,0.3)', badgeCls: 'text-white/60' },
  { name: 'Stage 4- transition', rank: 2, color: 'rgba(226,75,74,0.5)', badgeCls: 'text-[#E24B4A]' },
  { name: 'Stage 4 (Declining)', rank: 1, color: '#E24B4A', badgeCls: 'text-[#E24B4A]' },
  { name: 'Unknown', rank: null, color: '#424242', badgeCls: 'text-white/40' },
  { name: 'IPO', rank: null, color: 'rgba(255,255,255,0.14)', badgeCls: 'text-white/60' },
];

// Loaded on demand (next/dynamic in app/stage-analysis/page.tsx): only the "ย้อนหลัง" tab needs it.
export default function StageAnalysisHistoryView() {
  return <StageTransitionView data={stageAnalysisTransitions} stages={STAGES} />;
}
