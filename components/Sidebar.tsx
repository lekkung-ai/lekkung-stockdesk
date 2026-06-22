'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Globe, LayoutDashboard, Map, ScanLine, TrendingUp, BarChart2,
  Layers, Zap, Award, Trophy, Newspaper,
  Settings, X,
} from 'lucide-react';
import { scanData } from '@/lib/scanData';

const COUNTS = {
  all: scanData.length,
  sepa: scanData.filter(s => s.sepa).length,
  kell: scanData.filter(s => s.kell).length,
  uptrend: scanData.filter(s => s.stage === 'Bull' || s.stage === 'S.Bull').length,
  breakout: scanData.filter(s => s.breakout).length,
  rs80: scanData.filter(s => s.rs_score >= 80).length,
  combo3: scanData.filter(s => s.combo_score >= 3).length,
};

const NAV_GROUPS = [
  {
    section: 'ภาพรวม',
    items: [
      { label: 'Overview', href: '/', icon: Globe },
      { label: 'My Stocks', href: '/my-stocks', icon: LayoutDashboard },
      { label: 'Sector Map', href: '/sector', icon: Map },
    ],
  },
  {
    section: 'Scanner',
    items: [
      { label: 'ทั้งหมด', href: '/scanner', icon: ScanLine, count: COUNTS.all },
      { label: 'SEPA Trend Template', href: '/sepa', icon: TrendingUp, indent: true, count: COUNTS.sepa },
      { label: 'Oliver Kell EMAC', href: '/kell', icon: BarChart2, indent: true, count: COUNTS.kell },
      { label: 'Market Stage', href: '/market-stage', icon: Layers, indent: true, count: COUNTS.uptrend },
      { label: 'Breakout Setup', href: '/breakout', icon: Zap, indent: true, count: COUNTS.breakout },
      { label: 'RS Leaders', href: '/rs-leaders', icon: Award, indent: true, count: COUNTS.rs80 },
      { label: 'Combo Score', href: '/combo', icon: Trophy, indent: true, count: COUNTS.combo3 },
    ],
  },
  {
    section: 'Portfolio',
    items: [
      { label: 'ข่าว', href: '/news', icon: Newspaper },
    ],
  },
] as const;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function isActive(href: string): boolean {
    const [hrefPath, hrefQs] = href.split('?');
    const matchesPath = hrefPath === '/' ? pathname === '/' : pathname === hrefPath || pathname.startsWith(hrefPath + '/');
    if (!matchesPath) return false;
    if (!hrefQs) return true;
    const hrefParams = new URLSearchParams(hrefQs);
    for (const [key, val] of hrefParams.entries()) {
      if (searchParams.get(key) !== val) return false;
    }
    return true;
  }

  return (
    <aside
      className={[
        'fixed md:static inset-y-0 left-0 z-30',
        'w-[220px] flex-shrink-0 flex flex-col',
        'bg-[#0b0d12] border-r border-white/[0.07]',
        'transition-transform duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.07] flex-shrink-0">
        <span className="font-bold text-[15px] text-white tracking-tight">StockDesk</span>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded text-white/30 hover:text-white/70 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map(group => (
          <div key={group.section}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const count = 'count' in item ? item.count : undefined;
                const label = count !== undefined ? `${item.label} (${count})` : item.label;
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={[
                      'flex items-center gap-2 rounded-lg py-[6px] text-[12.5px] transition-colors',
                      'indent' in item && item.indent ? 'pl-7 pr-2' : 'px-2',
                      active
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/45 hover:text-white/75 hover:bg-white/[0.05]',
                    ].join(' ')}
                  >
                    <Icon size={13} className="flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-white/[0.07] flex-shrink-0">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-2 py-[6px] rounded-lg text-[12.5px] text-white/45 hover:text-white/75 hover:bg-white/[0.05] transition-colors"
        >
          <Settings size={13} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
