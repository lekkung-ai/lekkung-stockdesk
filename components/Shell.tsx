'use client';

import { useState, useEffect, Suspense } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const DESKTOP_OPEN_KEY = 'sidebarDesktopOpen';

export default function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  // Restore the user's collapse preference after mount (avoids SSR/localStorage mismatch).
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_OPEN_KEY);
    if (stored !== null) setDesktopOpen(stored === '1');
  }, []);

  const toggleSidebar = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) {
      setMobileOpen(v => !v);
    } else {
      setDesktopOpen(v => {
        const next = !v;
        localStorage.setItem(DESKTOP_OPEN_KEY, next ? '1' : '0');
        return next;
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0f15] text-[#e2e4ec]">
      <Suspense fallback={<div className="hidden md:block w-[220px] flex-shrink-0 bg-[#0b0d12] border-r border-white/[0.07]" />}>
        <Sidebar open={mobileOpen} desktopOpen={desktopOpen} onClose={() => setMobileOpen(false)} />
      </Suspense>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={toggleSidebar} sidebarDesktopOpen={desktopOpen} />
        <main id="app-scroll" className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
