'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import StockChart from './StockChart';

// ── Prop types (all from server component) ─────────────────────────────────
interface StageEntry {
  Ticker: string;
  Stage: string;
  Price: number;
  EMA50: number;
  EMA200: number;
  Bar_Count: number;
  'ADTV(MB)': number;
}
interface SepaEntry {
  Ticker: string;
  Price: number;
  RS_Rating: number;
  SMA_50: number;
  SMA_200: number;
  '52W_High': number;
  '%_From_High': number;
}
interface KellEntry {
  Ticker: string;
  Signal: string;
  Price: number;
  EMA10: number;
  'Dist_EMA10_%': number;
  'ADTV(MB)': number;
  Status: string;
}
interface BreakoutEntry {
  Ticker: string;
  Price: number;
  Box_Low: number;
  'Box_High(Break)': number;
  'To_Break%': number;
  'ADTV(MB)': number;
  'Box_Width%': number;
  SMA150_Chg: number;
}
interface CombinedEntry {
  ticker: string;
  price: number;
  stage: string | null;
  rs_score: number;
  combo_score: number;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
}
interface SectorInfo { sector: string; subsector: string; }
interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: 'pos' | 'neg' | 'neu';
}

interface Props {
  ticker: string;
  stageEntry: StageEntry | null;
  sepaEntry: SepaEntry | null;
  kellEntry: KellEntry | null;
  breakoutEntry: BreakoutEntry | null;
  combinedEntry: CombinedEntry | null;
  sectorInfo: SectorInfo | null;
}

// ── Stage style helper ──────────────────────────────────────────────────────
function stageCls(stage: string): string {
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Accumulation' || stage === 'Recovery') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

// ── SEPA checklist ──────────────────────────────────────────────────────────
function SepaChecklist({ entry }: { entry: SepaEntry }) {
  const fromHigh = entry['%_From_High'];
  const items = [
    {
      label: 'Price > SMA 50',
      pass: entry.Price > entry.SMA_50,
      detail: `${entry.Price.toFixed(2)} > ${entry.SMA_50.toFixed(2)}`,
    },
    {
      label: 'Price > SMA 200',
      pass: entry.Price > entry.SMA_200,
      detail: `${entry.Price.toFixed(2)} > ${entry.SMA_200.toFixed(2)}`,
    },
    {
      label: 'SMA50 > SMA200 (Uptrend)',
      pass: entry.SMA_50 > entry.SMA_200,
      detail: `${entry.SMA_50.toFixed(2)} > ${entry.SMA_200.toFixed(2)}`,
    },
    {
      label: 'RS Rating ≥ 70',
      pass: entry.RS_Rating >= 70,
      detail: String(entry.RS_Rating),
    },
    {
      label: '% From 52W High ≤ 25%',
      pass: Math.abs(fromHigh) <= 25,
      detail: `${fromHigh > 0 ? '+' : ''}${fromHigh.toFixed(1)}%`,
    },
  ];

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 text-[13px] font-bold ${item.pass ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
              {item.pass ? '✓' : '✗'}
            </span>
            <span className="text-[12px] text-white/65 truncate">{item.label}</span>
          </div>
          <span className="text-[11px] text-white/35 tabular-nums flex-shrink-0">{item.detail}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function StockDetailPage({
  ticker,
  stageEntry,
  sepaEntry,
  kellEntry,
  breakoutEntry,
  combinedEntry,
  sectorInfo,
}: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState<{ price: number; change1d: number; shortName: string } | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);

  // Suppress unused warning for breakoutEntry (used as existence check)
  void breakoutEntry;

  useEffect(() => {
    fetch(`/api/quote/${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.price != null) setQuote(data); })
      .catch(() => {});
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/news/${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(data => setNews(data.news ?? []))
      .catch(() => setNews([]));
  }, [ticker]);

  const changeColor = quote
    ? quote.change1d > 0 ? '#1D9E75' : quote.change1d < 0 ? '#E24B4A' : '#9ca3af'
    : '#6b7280';

  const hasAnyScan = !!(stageEntry ?? sepaEntry ?? kellEntry ?? combinedEntry);
  const stage = stageEntry?.Stage ?? combinedEntry?.stage ?? null;
  const rs = combinedEntry?.rs_score ?? null;
  const combo = combinedEntry?.combo_score ?? null;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="space-y-3">
        {/* Breadcrumb / back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/65 transition-colors"
        >
          <ArrowLeft size={13} />
          กลับ
        </button>

        {/* Ticker + name + price */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-[28px] font-bold text-white leading-none">{ticker}</h1>
              {quote?.shortName && (
                <span className="text-[14px] text-white/40 truncate">{quote.shortName}</span>
              )}
            </div>
          </div>
          {/* Live price */}
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-bold text-white tabular-nums leading-none">
              {quote ? quote.price.toFixed(2) : (combinedEntry?.price.toFixed(2) ?? '—')}
            </span>
            {quote && (
              <span className="text-[16px] font-semibold tabular-nums" style={{ color: changeColor }}>
                {quote.change1d > 0 ? '+' : ''}{quote.change1d.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Info badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {sectorInfo && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.07] text-white/55">
              {sectorInfo.sector}
            </span>
          )}
          {sectorInfo?.subsector && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] text-white/35 bg-white/[0.04]">
              {sectorInfo.subsector}
            </span>
          )}
          {stage && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${stageCls(stage)}`}>
              {stage}
            </span>
          )}
        </div>

        {/* Signal badges row */}
        {hasAnyScan && (
          <div className="flex items-center gap-2 flex-wrap">
            {combinedEntry?.sepa && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#1D9E75]/15 text-[#1D9E75]">
                SEPA
              </span>
            )}
            {combinedEntry?.kell && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#378ADD]/15 text-[#378ADD]">
                Kell
              </span>
            )}
            {combinedEntry?.breakout && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EF9F27]/15 text-[#EF9F27]">
                Breakout
              </span>
            )}
            {rs != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.05] text-white/40">
                RS <span className="font-bold" style={{ color: rs >= 80 ? '#1D9E75' : rs >= 50 ? '#BA7517' : '#E24B4A' }}>{rs}</span>
              </span>
            )}
            {combo != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.05] text-white/40">
                Combo <span className="font-bold" style={{ color: combo >= 3 ? '#1D9E75' : combo === 2 ? '#BA7517' : '#6b7280' }}>{combo}/4</span>
              </span>
            )}
            {!hasAnyScan && (
              <span className="text-[12px] text-white/25">หุ้นนี้ยังไม่อยู่ในชุดสแกน</span>
            )}
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      <StockChart ticker={ticker} height={350} />

      {/* ── 2-column detail ── */}
      {!hasAnyScan ? (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-8 text-center">
          <p className="text-[14px] text-white/30">หุ้นนี้ยังไม่อยู่ในชุดสแกน</p>
          <p className="text-[12px] text-white/20 mt-1">ไม่มีข้อมูล SEPA / Stage / Kell สำหรับ {ticker}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Left — SEPA Checklist */}
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[13px] font-semibold text-white">SEPA Trend Template</h2>
              {sepaEntry ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1D9E75]/15 text-[#1D9E75]">ผ่าน</span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E24B4A]/10 text-[#E24B4A]">ไม่ผ่าน</span>
              )}
            </div>
            {sepaEntry ? (
              <SepaChecklist entry={sepaEntry} />
            ) : (
              <p className="text-[13px] text-white/30 text-center py-6">ไม่ผ่าน SEPA Trend Template</p>
            )}
          </div>

          {/* Right — Market Stage + Kell */}
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-5">

            {/* Market Stage */}
            <div>
              <h2 className="text-[13px] font-semibold text-white mb-3">Market Stage</h2>
              {stageEntry ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-semibold ${stageCls(stageEntry.Stage)}`}>
                      {stageEntry.Stage}
                    </span>
                    <span className="text-[12px] text-white/40">
                      อยู่ใน {stageEntry.Stage} มา <span className="text-white/65 font-medium">{stageEntry.Bar_Count}</span> วัน
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'EMA 50', val: stageEntry.EMA50.toFixed(2) },
                      { label: 'EMA 200', val: stageEntry.EMA200.toFixed(2) },
                      { label: 'ADTV (MB)', val: stageEntry['ADTV(MB)'].toFixed(1) },
                      { label: 'Price', val: stageEntry.Price.toFixed(2) },
                    ].map(r => (
                      <div key={r.label} className="bg-white/[0.03] rounded-lg px-3 py-2">
                        <div className="text-[10px] text-white/30 mb-0.5">{r.label}</div>
                        <div className="text-[13px] font-medium text-white/70 tabular-nums">{r.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-white/30 text-center py-3">ไม่มีข้อมูล Stage</p>
              )}
            </div>

            {/* Kell Detail */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-[13px] font-semibold text-white">Oliver Kell EMAC</h2>
                {kellEntry ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#378ADD]/15 text-[#378ADD]">ผ่าน</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] text-white/20 bg-white/[0.04]">ไม่ผ่าน</span>
                )}
              </div>
              {kellEntry ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#378ADD]/15 text-[#378ADD]">
                      {kellEntry.Signal}
                    </span>
                    <span className="text-[11px] text-white/35">{kellEntry.Status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { label: 'EMA 10', val: kellEntry.EMA10.toFixed(2) },
                      { label: 'Dist EMA10%', val: `${kellEntry['Dist_EMA10_%'].toFixed(1)}%` },
                      { label: 'Price', val: kellEntry.Price.toFixed(2) },
                      { label: 'ADTV (MB)', val: kellEntry['ADTV(MB)'].toFixed(1) },
                    ].map(r => (
                      <div key={r.label} className="bg-white/[0.03] rounded-lg px-3 py-2">
                        <div className="text-[10px] text-white/30 mb-0.5">{r.label}</div>
                        <div className="text-[13px] font-medium text-white/70 tabular-nums">{r.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-white/30 text-center py-3">ไม่ผ่าน Oliver Kell EMAC</p>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── News section ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[13px] font-semibold text-white">ข่าวล่าสุด</h2>
        </div>

        {news === null ? (
          <div className="px-5 py-6 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลดข่าว...</span>
          </div>
        ) : news.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-[13px] text-white/30">ไม่พบข่าวล่าสุดของ {ticker}</p>
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
              const formattedDate = (() => {
                try {
                  const d = new Date(item.pubDate);
                  const diff = Date.now() - d.getTime();
                  const mins = Math.floor(diff / 60000);
                  const hrs = Math.floor(diff / 3600000);
                  if (mins < 60) return `${mins} นาทีที่แล้ว`;
                  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
                  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                } catch { return item.pubDate; }
              })();

              return (
                <a
                  key={i}
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
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{formattedDate}</span>
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
