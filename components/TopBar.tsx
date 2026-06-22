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
    <header className="h-14 flex items-center gap-3 px-4 border-b border-white/[0.07] bg-[#0d0f15] flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
      >
        <Menu size={18} />
      </button>

      <div className="flex-1 flex justify-center">
        <SearchBox />
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-0.5 bg-white/[0.05] rounded-xl p-1">
          {MARKETS.map(m => (
            <button
              key={m.code}
              onClick={() => setSelectedMarket(m.code)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                selectedMarket === m.code
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:text-white/65'
              }`}
            >
              <span className="text-base leading-none">{m.flag}</span>
              <span>{m.code}</span>
            </button>
          ))}
        </div>

        <button className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors">
          <Bell size={16} />
        </button>
        <button className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors">
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
