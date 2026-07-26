'use client';

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import SearchBox from './SearchBox';
import { useStock } from '@/context/stock';
import type { Market } from '@/context/stock';

const MARKETS: { code: Market; flag: string }[] = [
  { code: 'SET', flag: '🇹🇭' },
  { code: 'US', flag: '🇺🇸' },
  { code: 'HK', flag: '🇭🇰' },
];

export default function TopBar({ onMenuClick, sidebarDesktopOpen }: { onMenuClick: () => void; sidebarDesktopOpen: boolean }) {
  const { selectedMarket, setSelectedMarket } = useStock();

  return (
    <header
      className="min-h-14 flex items-center gap-2 px-3 md:px-4 border-b border-white/[0.07] bg-[#0d0f15] flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Sidebar toggle — opens the drawer on phone, collapses/expands the static sidebar on desktop */}
      <button
        onClick={onMenuClick}
        title={sidebarDesktopOpen ? 'ซ่อน Sidebar' : 'แสดง Sidebar'}
        className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <Menu size={18} className="md:hidden" />
        {sidebarDesktopOpen ? (
          <PanelLeftClose size={18} className="hidden md:block" />
        ) : (
          <PanelLeftOpen size={18} className="hidden md:block" />
        )}
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
      </div>
    </header>
  );
}
