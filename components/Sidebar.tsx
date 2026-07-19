'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Globe, LayoutDashboard, Map, ScanLine, TrendingUp, BarChart2,
  Layers, Zap, Newspaper, Activity, Fuel,
  X, FileText, Package, CalendarDays, Calculator, BookOpen, Award, FileBarChart,
} from 'lucide-react';
import { scanData } from '@/lib/scanData';

const COUNTS = {
  all: scanData.length,
  sepa: scanData.filter(s => s.sepa).length,
  kell: scanData.filter(s => s.kell).length,
  uptrend: scanData.filter(s => s.stage === 'Bull' || s.stage === 'S.Bull').length,
  breakout: scanData.filter(s => s.breakout).length,
  lekkung: scanData.filter(s => s.lekkung).length,
  oneil: scanData.filter(s => s.oneil).length,
  weinstein: scanData.filter(s => (s as any).weinstein).length,
};

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  indent?: boolean;
  count?: number;
  exact?: boolean;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'ภาพรวม',
    items: [
      { label: 'Overview', href: '/', icon: Globe },
      { label: 'Market Breadth', href: '/breadth', icon: BarChart2 },
      { label: 'Sector Map', href: '/sector', icon: Map },
      { label: 'Macro & Commodities', href: '/macro', icon: Fuel },
      { label: 'Top Movers', href: '/top-movers', icon: Activity, exact: true },
      { label: 'Big Lot', href: '/top-movers/biglot', icon: Package, indent: true },
      { label: 'รายงาน 59-2', href: '/top-movers/r59', icon: FileText, indent: true },
      { label: 'รายงาน 246-2', href: '/top-movers/r246', icon: FileText, indent: true },
      { label: 'Fund Flow (NVDR)', href: '/nvdr', icon: Activity },
      { label: 'ข่าว & บทวิเคราะห์', href: '/news', icon: Newspaper },
      { label: 'ประกาศงบ', href: '/earnings', icon: FileBarChart },
      { label: 'ปฏิทินหลักทรัพย์', href: '/calendar', icon: CalendarDays },
      { label: 'เครื่องคำนวณ Warrant', href: '/calculator', icon: Calculator },
      { label: 'My Stocks', href: '/my-stocks', icon: LayoutDashboard },
      { label: 'Knowledge Base', href: '/knowledge', icon: BookOpen },
      { label: 'Report Card', href: '/report-card', icon: Award },
    ],
  },
  {
    section: 'Scanner',
    items: [
      { label: 'Quant Scanner', href: '/scanner', icon: ScanLine, count: COUNTS.all },
      { label: 'Lekkung Growth', href: '/lekkung', icon: Activity, indent: true, count: COUNTS.lekkung },
      { label: 'CAN SLIM (O\'Neil)', href: '/oneil', icon: TrendingUp, indent: true, count: COUNTS.oneil },
      { label: 'SEPA Trend Template', href: '/sepa', icon: TrendingUp, indent: true, count: COUNTS.sepa },
      { label: 'Oliver Kell EMAC', href: '/kell', icon: BarChart2, indent: true, count: COUNTS.kell },
      { label: 'Stage Analysis', href: '/stage-analysis', icon: Layers, indent: true, count: COUNTS.weinstein },
      { label: 'Market Stage', href: '/market-stage', icon: Layers, indent: true, count: COUNTS.uptrend },
      { label: 'Breakout Setup', href: '/breakout', icon: Zap, indent: true, count: COUNTS.breakout },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  desktopOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, desktopOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function isActive(item: NavItem): boolean {
    const [hrefPath, hrefQs] = item.href.split('?');
    const matchesPath = item.exact
      ? pathname === hrefPath
      : (hrefPath === '/' ? pathname === '/' : pathname === hrefPath || pathname.startsWith(hrefPath + '/'));
    if (!matchesPath) return false;
    if (!hrefQs) return true;
    const hrefParams = new URLSearchParams(hrefQs);
    for (const [key, val] of hrefParams.entries()) {
      if (searchParams.get(key) !== val) return false;
    }
    return true;
  }

  // Labels/section headers hide whenever the sidebar is collapsed for the
  // current context — mobile drawer closed (open=false) or desktop
  // collapsed (desktopOpen=false).
  const labelCls = `${open ? 'block' : 'hidden'} ${desktopOpen ? 'md:block' : 'md:hidden'}`;

  return (
    <aside
      className={[
        'fixed md:static inset-y-0 left-0 z-30 overflow-hidden',
        'w-[75vw] max-w-[280px] flex-shrink-0 flex flex-col',
        desktopOpen ? 'md:w-[220px]' : 'md:w-0',
        'bg-[#0b0d12] border-r border-white/[0.07]',
        desktopOpen ? '' : 'md:border-r-0',
        'transition-all duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
    >
      {/* Logo row */}
      <div
        className="min-h-14 flex items-center justify-between px-3 md:px-4 border-b border-white/[0.07] flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className={`font-bold text-[15px] text-white tracking-tight whitespace-nowrap ${labelCls}`}>
          StockDesk
        </span>
        <span className={`font-bold text-[13px] text-white tracking-tight ${open ? 'hidden' : 'block'} md:hidden`}>
          SD
        </span>
        <button
          onClick={onClose}
          className="md:hidden p-2 rounded text-white/30 hover:text-white/70 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X size={15} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-1 md:px-2 space-y-4">
        {NAV_GROUPS.map(group => (
          <div key={group.section}>
            <p className={`px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25 whitespace-nowrap ${labelCls}`}>
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const active = isActive(item);
                const label = item.count !== undefined ? `${item.label} (${item.count})` : item.label;
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={onClose}
                    title={label}
                    className={[
                      'flex items-center gap-2 rounded-lg transition-colors',
                      'py-2.5 md:py-[6px]',
                      open ? 'justify-start' : 'justify-center',
                      'md:justify-start',
                      item.indent
                        ? `${open ? 'pl-7 pr-2' : 'px-2'} md:pl-7 md:pr-2`
                        : 'px-2',
                      active
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/45 hover:text-white/75 hover:bg-white/[0.05]',
                    ].join(' ')}
                  >
                    <Icon size={14} className="flex-shrink-0" />
                    <span className={`truncate text-[12.5px] whitespace-nowrap ${labelCls}`}>
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* TODO: Backlog #1 — /settings page doesn't exist yet; link hidden to avoid 404 prefetch.
      <div className="p-1 md:p-2 border-t border-white/[0.07] flex-shrink-0">
        <Link
          href="/settings"
          title="Settings"
          className={`flex items-center gap-2 px-2 py-2.5 md:py-[6px] rounded-lg text-[12.5px] text-white/45 hover:text-white/75 hover:bg-white/[0.05] transition-colors ${open ? 'justify-start' : 'justify-center'} md:justify-start`}
        >
          <Settings size={13} className="flex-shrink-0" />
          <span className={`whitespace-nowrap ${labelCls}`}>Settings</span>
        </Link>
      </div>
      */}
    </aside>
  );
}
