'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function HistoryPicker() {
  const [dates, setDates] = useState<string[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDate = searchParams.get('date');

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(d => setDates(d.dates ?? []));
  }, []);

  if (dates.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 md:mx-0 px-4 md:px-0">
      <span className="text-[10px] text-white/25 uppercase tracking-wider flex-shrink-0">ย้อนหลัง</span>
      <button
        onClick={() => router.push('/')}
        className={[
          'flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
          !currentDate
            ? 'bg-[#378ADD]/15 border-[#378ADD]/30 text-[#378ADD]'
            : 'border-white/[0.07] text-white/35 hover:text-white/60 hover:border-white/15',
        ].join(' ')}
      >
        Latest
      </button>
      {dates.map(d => (
        <button
          key={d}
          onClick={() => router.push(`/?date=${d}`)}
          className={[
            'flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
            currentDate === d
              ? 'bg-[#378ADD]/15 border-[#378ADD]/30 text-[#378ADD]'
              : 'border-white/[0.07] text-white/35 hover:text-white/60 hover:border-white/15',
          ].join(' ')}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
