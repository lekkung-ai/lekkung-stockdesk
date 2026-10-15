import type { ReactNode } from 'react';

// Full-width page container shared by /sector, /sector-flow, /macro and /breadth: no max-width,
// 16px side padding on phones, 24px from md up (so ≥1280 is 24px). Other pages keep their own container.
export default function FullWidthPage({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`px-4 py-4 md:px-6 md:py-6 min-w-0 ${className}`} data-layout="full">
      {children}
    </div>
  );
}
