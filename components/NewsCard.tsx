'use client';

import { newsSourceCls } from '@/lib/newsSourceStyle';

// Single news-item card, shared by app/news/page.tsx's ข่าว tab and
// StockDetailPage.tsx's "ข่าวล่าสุด" section - previously each had its own
// copy that had drifted out of sync (different font sizes, StockDetailPage
// showed a same-prominence sentiment badge beside the headline instead of
// below it, app/news's tab never showed sentiment at all). One component,
// one visual result everywhere.
export interface NewsCardItem {
  title: string;
  link: string;
  ts: number;
  source: string;
  sentiment: 'pos' | 'neg' | 'neu';
  tickers?: string[];
}

export function formatNewsTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `เมื่อ ${mins} นาที`;
  if (hrs < 24) return `เมื่อ ${hrs} ชม.`;
  return (
    new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' น.'
  );
}

export default function NewsCard({
  item,
  tickerFilter,
  onTickerClick,
  className = 'px-5 py-4',
}: {
  item: NewsCardItem;
  tickerFilter?: string;
  onTickerClick?: (ticker: string) => void;
  className?: string;
}) {
  return (
    <div className={`hover:bg-white/[0.025] transition-colors ${className}`}>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-body text-ink leading-snug line-clamp-2 hover:text-[#5B9BD5] transition-colors"
      >
        {item.title}
      </a>
      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-label text-meta">
        {/* Neutral carries no information - shown items skip the badge
            entirely instead of a "Neutral" tag nobody needs to read. */}
        {item.sentiment !== 'neu' && (
          <span
            className={`font-semibold px-1.5 py-0.5 rounded text-label ${
              item.sentiment === 'pos' ? 'bg-[#EAF3DE] text-[#27500A]' : 'bg-[#FCEBEB] text-[#791F1F]'
            }`}
          >
            {item.sentiment === 'pos' ? 'Positive' : 'Negative'}
          </span>
        )}
        <span className={`font-semibold px-1.5 py-0.5 rounded text-label ${newsSourceCls(item.source)}`}>
          {item.source}
        </span>
        {item.tickers?.map(t => (
          <button
            key={t}
            onClick={() => onTickerClick?.(t)}
            className={`text-label font-bold px-1.5 py-0.5 rounded ring-1 transition-colors ${
              tickerFilter === t
                ? 'bg-[#5B9BD5] text-white ring-[#5B9BD5]'
                : 'bg-[#5B9BD5]/15 text-[#8FC1EA] ring-[#5B9BD5]/30 hover:bg-[#5B9BD5]/25 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
        <span>·</span>
        <span>{formatNewsTime(item.ts)}</span>
      </div>
    </div>
  );
}
