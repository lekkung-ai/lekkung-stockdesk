'use client';

import { useEffect, useState } from 'react';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: 'pos' | 'neg' | 'neu';
}

// Per-source badge colours
const SOURCE_STYLE: Record<string, string> = {
  InfoQuest: 'bg-[#E6F1FB] text-[#0C447C]',
  'ข่าวหุ้น': 'bg-[#FAEEDA] text-[#633806]',
  'มิติหุ้น': 'bg-[#EAF3DE] text-[#27500A]',
  'ประชาชาติ': 'bg-[#F3E8FB] text-[#5B2A86]',
  'กรุงเทพธุรกิจ': 'bg-[#FCEBEB] text-[#791F1F]',
  'Bangkok Post': 'bg-[#E5F3F4] text-[#0B5563]',
};

function sourceCls(source: string): string {
  return SOURCE_STYLE[source] ?? 'bg-white/[0.07] text-white/50';
}

function relativeDate(pubDate: string): string {
  try {
    const d = new Date(pubDate);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    if (mins < 1) return 'เมื่อสักครู่';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  } catch {
    return pubDate;
  }
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setNews(null);
    setError(false);
    fetch('/api/news/all')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (active) setNews(data.news ?? []);
      })
      .catch(() => {
        if (active) {
          setNews([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">ข่าวตลาด</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          รวมข่าวล่าสุดจาก InfoQuest · Kaohoon · RYT9 · Prachachat · Bangkok Biz
        </p>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {news === null ? (
          <div className="px-5 py-10 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลดข่าว...</span>
          </div>
        ) : news.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] text-white/30">
              {error ? 'โหลดข่าวไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ไม่พบข่าวล่าสุด'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {news.map((item, i) => {
              const sentCls =
                item.sentiment === 'pos' ? 'bg-[#EAF3DE] text-[#27500A]' :
                item.sentiment === 'neg' ? 'bg-[#FCEBEB] text-[#791F1F]' :
                'bg-white/[0.07] text-white/40';
              const sentLabel =
                item.sentiment === 'pos' ? 'Positive' :
                item.sentiment === 'neg' ? 'Negative' : 'Neutral';

              return (
                <a
                  key={item.link || i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-5 py-4 hover:bg-white/[0.025] transition-colors"
                >
                  <span className={`shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${sentCls}`}>
                    {sentLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/80 leading-snug line-clamp-2">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-white/25">
                      <span className={`font-semibold px-1.5 py-0.5 rounded ${sourceCls(item.source)}`}>
                        {item.source}
                      </span>
                      <span>·</span>
                      <span>{relativeDate(item.pubDate)}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
