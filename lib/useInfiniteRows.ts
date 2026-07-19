'use client';

import { useState, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = 768;
const BATCH_SIZE = 15;
const SCROLL_CONTAINER_ID = 'app-scroll';

function scrollRoot(): HTMLElement | null {
  return document.getElementById(SCROLL_CONTAINER_ID);
}

// Shallow value comparison, not reference comparison - the caller passes a
// fresh array literal every render regardless of whether sigFilter/stages/
// sortConfig actually changed, so comparing the array containers themselves
// would always report "changed" and defeat the guard below entirely.
function sameDeps(a: unknown[] | null, b: unknown[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Mobile (<768px): incrementally reveals `rows` in batches of 15 as an
 * IntersectionObserver sentinel nears the bottom of the shared #app-scroll
 * container, instead of the desktop pagination the caller keeps rendering
 * above the mobile breakpoint - callers should render `visibleRows` only
 * when `isMobile` is true, and their existing desktop rows/pageRows
 * otherwise.
 *
 * `resetDeps` should be the exact dependency list the caller's own filtered
 * rows are memoized on (the same list already used to reset desktop `page`
 * state to 1) - so the two behaviors reset in lockstep on filter/sort/search.
 *
 * `restoreKey`, if given, persists {scrollTop, count} to sessionStorage so a
 * user who scrolled deep into the list, tapped a ticker link, and tapped
 * back lands on the same row instead of back at the top. Omit it on pages
 * where rows don't navigate to another route (nothing to restore from).
 */
export function useInfiniteRows<T>(rows: T[], resetDeps: unknown[], restoreKey?: string) {
  const [isMobile, setIsMobile] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);
  const restoredRef = useRef(false);
  const lastResetDepsRef = useRef<unknown[] | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // A new filter/sort/search result set starts back over from the first batch.
  // `sameDeps` does a shallow VALUE comparison rather than trusting a plain
  // dependency-array change, because a spurious extra render very early on
  // (React StrictMode's dev-only double-invoke, or an unrelated early state
  // update elsewhere on the page) hands this effect a brand-new array literal
  // every time regardless of whether sigFilter/stages/sortConfig actually
  // changed - without this guard, that spurious re-run would reset
  // visibleCount back to BATCH_SIZE right after the restore effect below had
  // just set it from sessionStorage.
  useEffect(() => {
    if (sameDeps(lastResetDepsRef.current, resetDeps)) return;
    lastResetDepsRef.current = resetDeps;
    setVisibleCount(BATCH_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  // One-time restore (mount only) of a previously scrolled-to position, e.g.
  // after tapping a ticker and coming back via browser back.
  useEffect(() => {
    if (!restoreKey || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = sessionStorage.getItem(`infiniteScroll:${restoreKey}`);
      if (!saved) return;
      const { count, scrollTop } = JSON.parse(saved) as { count: number; scrollTop: number };
      if (count > BATCH_SIZE) setVisibleCount(count);
      // Two rAFs: one to let the bumped visibleCount commit/paint the taller
      // list, one more so the browser has actually laid it out before we scroll.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scrollRoot()?.scrollTo({ top: scrollTop });
      }));
    } catch { /* ignore - sessionStorage unavailable or malformed entry */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the saved position fresh as the user scrolls/loads more.
  useEffect(() => {
    if (!restoreKey) return;
    const root = scrollRoot();
    if (!root) return;
    const onScroll = () => {
      try {
        sessionStorage.setItem(`infiniteScroll:${restoreKey}`, JSON.stringify({ scrollTop: root.scrollTop, count: visibleCount }));
      } catch { /* ignore - sessionStorage unavailable (private mode, quota) */ }
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [restoreKey, visibleCount]);

  // Load the next batch once the sentinel row nears the bottom of the scroll container.
  useEffect(() => {
    if (!isMobile) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(c => Math.min(c + BATCH_SIZE, rows.length));
        }
      },
      { root: scrollRoot(), rootMargin: '800px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, rows.length]);

  const clampedCount = Math.min(visibleCount, rows.length);
  const visibleRows = isMobile ? rows.slice(0, clampedCount) : rows;

  return { isMobile, visibleRows, visibleCount: clampedCount, totalCount: rows.length, sentinelRef };
}
