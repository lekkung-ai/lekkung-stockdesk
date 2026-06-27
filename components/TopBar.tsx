'use client';

import { Bell, Settings, Menu } from 'lucide-react';
import SearchBox from './SearchBox';
import { useStock } from '@/context/stock';
import type { Market } from '@/context/stock';

const MARKETS: { code: Market; flag: string }[] = [
  { code: 'SET', flag: '🇹🇭' },
  { code: 'US', flag: '🇺🇸' },
  { code: 'HK', flag: '🇭🇰' },
];

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { selectedMarket, setSelectedMarket } = useStock();

  return (
    <header className="h-14 flex items-center gap-2 px-3 md:px-4 border-b border-white/[0.07] bg-[#0d0f15] flex-shrink-0">
      {/* Hamburger — mobile + tablet (drawer); hidden on desktop static sidebar */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <Menu size={18} />
      </button>

      {/* Search — takes all available space */}
      <div className="flex-1 min-w-0">
        <SearchBox />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Market switcher — always visible */}
        <div className="flex items-center gap-0.5 bg-white/[0.05] rounded-xl p-1">
          {MARKETS.map(m => (
            <button
              key={m.code}
              onClick={() => setSelectedMarket(m.code)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] sm:text-[12px] font-medium transition-colors min-h-[36px] ${
                selectedMarket === m.code
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:text-white/65'
              }`}
            >
              <span className="text-sm leading-none">{m.flag}</span>
              <span className="hidden sm:inline">{m.code}</span>
            </button>
          ))}
        </div>

        {/* Bell & Settings — hidden on mobile */}
        <button className="hidden sm:flex p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors">
          <Bell size={16} />
        </button>
        <button className="hidden sm:flex p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors">
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
