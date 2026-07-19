'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const SCROLL_CONTAINER_ID = 'app-scroll';
const SHOW_AFTER_PX = 1400; // roughly 2 phone screens of scroll

// Floating "back to top" button for long mobile infinite-scroll lists -
// shows up once the user has scrolled past ~2 screens so they can jump back
// without swiping all the way up by hand.
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const root = document.getElementById(SCROLL_CONTAINER_ID);
    if (!root) return;
    const onScroll = () => setVisible(root.scrollTop > SHOW_AFTER_PX);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => document.getElementById(SCROLL_CONTAINER_ID)?.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="ขึ้นบนสุด"
      className="md:hidden fixed bottom-5 right-4 z-30 w-11 h-11 rounded-full bg-[#1D9E75] text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
    >
      <ArrowUp size={18} />
    </button>
  );
}
