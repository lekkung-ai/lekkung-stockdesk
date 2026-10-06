'use client';

import { useEffect, useState } from 'react';
import { flagsFor, safeLink, splitVisible, type FlagSeverity, type NewsFlag, type NewsFlagsFile } from '@/lib/newsFlags';

// One fetch per page load, shared by every badge row. Missing / broken file → no badges.
let filePromise: Promise<NewsFlagsFile | null> | null = null;
function loadFlags(): Promise<NewsFlagsFile | null> {
  if (!filePromise) {
    filePromise = fetch('/data/news_flags.json')
      .then(r => (r.ok ? (r.json() as Promise<NewsFlagsFile>) : null))
      .catch(() => null);
  }
  return filePromise;
}

const STYLE: Record<FlagSeverity, string> = {
  red: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  purple: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  gray: 'bg-white/[0.06] text-white/60 border-white/20',
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
};

function tip(f: NewsFlag): string {
  return [f.title, f.date].filter(Boolean).join(' · ');
}

function Badge({ flag }: { flag: NewsFlag }) {
  const href = safeLink(flag.link);
  const cls = `group/flag relative inline-flex items-center px-1.5 py-px rounded border text-[10px] font-semibold leading-tight whitespace-nowrap focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${STYLE[flag.severity] ?? STYLE.gray}`;
  const body = (
    <>
      {flag.label}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-max max-w-[320px] whitespace-normal rounded-md border border-white/15 bg-[#1b1f2a] px-2 py-1.5 text-[11px] font-normal text-white/85 shadow-lg group-hover/flag:block group-focus/flag:block"
      >
        {tip(flag)}
      </span>
    </>
  );
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation(); // rows on scan pages are clickable
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${flag.label}: ${tip(flag)}`} onClick={stop} onKeyDown={stop} data-testid="news-flag">
      {body}
    </a>
  ) : (
    <span tabIndex={0} className={cls} aria-label={`${flag.label}: ${tip(flag)}`} onClick={stop} data-testid="news-flag">
      {body}
    </span>
  );
}

/** Small news flags next to a ticker: red first, max 3 + "+n". Nothing renders when there are none. */
export default function NewsFlagBadges({ ticker, className = '' }: { ticker: string; className?: string }) {
  const [file, setFile] = useState<NewsFlagsFile | null>(null);
  useEffect(() => {
    let alive = true;
    loadFlags().then(f => {
      if (alive) setFile(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  const flags = flagsFor(file, ticker);
  if (flags.length === 0) return null;
  const { shown, more } = splitVisible(flags);
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 align-middle ${className}`} data-testid="news-flags">
      {shown.map(f => (
        <Badge key={f.type} flag={f} />
      ))}
      {more.length > 0 && (
        <span
          tabIndex={0}
          className="text-[10px] text-white/45 px-1 rounded border border-white/15"
          title={more.map(f => `${f.label} · ${tip(f)}`).join('\n')}
          onClick={e => e.stopPropagation()}
        >
          +{more.length}
        </span>
      )}
    </span>
  );
}
