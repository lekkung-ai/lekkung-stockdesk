'use client';

import { classifyRating, RATING_BUCKET_STYLE } from '@/lib/researchRating';
import { formatNewsTime } from './NewsCard';

// Single research-item card, shared by components/ResearchTab.tsx (/news's
// บทวิเคราะห์ tab) and StockDetailPage.tsx's "บทวิเคราะห์ที่เกี่ยวข้อง"
// section - same reasoning as NewsCard.tsx.
export interface ResearchCardItem {
  title: string;
  link: string;
  ts: number;
  source: string;
  broker: string | null;
  targetPrice: number | null;
  rating: string | null;
  fileUrl?: string | null;
  tickers?: string[];
}

export default function ResearchCard({
  item,
  tickerFilter,
  onTickerClick,
  className = 'px-5 py-4',
}: {
  item: ResearchCardItem;
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
      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-label">
        {item.broker && (
          <span className="text-label font-bold px-1.5 py-0.5 rounded bg-[#7F77DD]/15 text-[#7F77DD] ring-1 ring-[#7F77DD]/30">
            {item.broker}
          </span>
        )}
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
        {item.rating && (
          <span className={`text-label font-bold px-1.5 py-0.5 rounded ${RATING_BUCKET_STYLE[classifyRating(item.rating)]}`}>
            {item.rating}
          </span>
        )}
        {item.targetPrice != null && (
          <span className="text-label font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/60">
            เป้า {item.targetPrice} บาท
          </span>
        )}
        {item.fileUrl && (
          <a
            href={item.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-label font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            PDF
          </a>
        )}
        {/* Source is a plain gray label here, not a colored badge - unlike
            NewsCard, where source is the primary signal (which outlet), a
            research item's identity is the broker/rating above; the source
            (Kaohoon/มิติหุ้น/SETTrade IAA) is just provenance. */}
        <span className="ml-auto text-meta whitespace-nowrap">
          {item.source} · {formatNewsTime(item.ts)}
        </span>
      </div>
    </div>
  );
}
