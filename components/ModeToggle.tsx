'use client';

// Shared "วันนี้ | ย้อนหลัง" pill toggle - was hand-copied inline on
// app/lekkung/page.tsx before other scan pages adopted the same pattern;
// now a single component so every page's toggle stays visually identical.
export default function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'today' | 'history';
  onChange: (mode: 'today' | 'history') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-[#13161e] border border-white/[0.07] rounded-xl p-0.5">
      <button
        onClick={() => onChange('today')}
        className={`px-3 py-1.5 rounded-lg text-label font-medium transition-colors ${
          mode === 'today' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
        }`}
      >
        วันนี้
      </button>
      <button
        onClick={() => onChange('history')}
        className={`px-3 py-1.5 rounded-lg text-label font-medium transition-colors ${
          mode === 'history' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
        }`}
      >
        ย้อนหลัง
      </button>
    </div>
  );
}
