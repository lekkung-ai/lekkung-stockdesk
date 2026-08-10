import type { Metadata } from 'next';
import RotationLeaderboard from '@/components/RotationLeaderboard';

export const metadata: Metadata = {
  title: 'Sector Rotation Leaderboard',
  description: 'จัดอันดับ Sector ตาม Relative Strength (RS) และ Momentum (RRG Phase 2)',
};

export default function SectorRotationPage() {
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <RotationLeaderboard />
    </div>
  );
}
