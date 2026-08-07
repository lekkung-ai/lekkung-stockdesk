'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  TableWrap,
  SortableTh,
  SortConfig,
  Td,
} from '@/components/StrategyTable';

interface BestWorstEntry {
  ticker: string;
  entry_date: string;
  return_pct: number;
}

interface HorizonMetric {
  n: number;
  avg_return_pct: number | null;
  median_return_pct: number | null;
  win_rate_pct: number | null;
  avg_set_return_pct: number | null;
  excess_return_pct: number | null;
  best5?: BestWorstEntry[];
  worst5?: BestWorstEntry[];
}

interface SetupEntry {
  ticker: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  holding_days: number;
  return_pct: number;
  mfe_pct: number | null;
  mae_pct: number | null;
  status: 'open' | 'closed';
}

interface SetupSummary {
  n_closed: number;
  n_open: number;
  avg_return_pct: number | null;
  win_rate_pct: number | null;
  avg_holding_days: number | null;
  avg_mfe_pct: number | null;
  avg_mae_pct: number | null;
}

interface ScanDataProps {
  total_picks: number;
  horizons: Record<string, HorizonMetric>;
  setups?: SetupEntry[];
  setup_summary?: SetupSummary;
}

function fmtPct(n: number | null, showSign = true): string {
  if (n == null) return '—';
  const sign = showSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function returnColor(n: number | null): string {
  if (n == null) return 'rgba(255,255,255,0.3)';
  if (n > 0) return '#1D9E75';
  if (n < 0) return '#E24B4A';
  return 'rgba(255,255,255,0.5)';
}

const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function fmtShortDate(iso: string): string {
  if (!iso || !iso.includes('-')) return iso;
  const [, m, d] = iso.split('-');
  return `${parseInt(d)} ${SHORT_MONTHS[parseInt(m) - 1]}`;
}

function countOccurrences(entries: BestWorstEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.ticker] = (counts[e.ticker] ?? 0) + 1;
  return counts;
}

function TickerChip({ entry, occurrenceCount }: { entry: BestWorstEntry; occurrenceCount: number }) {
  return (
    <Link
      href={`/stock/${entry.ticker}`}
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="text-label font-semibold text-white/80 truncate">{entry.ticker}</span>
        {occurrenceCount > 1 && (
          <span className="text-[10px] text-white/30 flex-shrink-0" title={`ติดลิสต์นี้ ${occurrenceCount} ครั้ง คนละวันสัญญาณ`}>
            ×{occurrenceCount}
          </span>
        )}
        <span className="text-[10px] text-white/25 tabular-nums flex-shrink-0">{fmtShortDate(entry.entry_date)}</span>
      </span>
      <span className="text-label font-medium tabular-nums flex-shrink-0" style={{ color: returnColor(entry.return_pct) }}>
        {fmtPct(entry.return_pct)}
      </span>
    </Link>
  );
}

export default function ReportCardDetailClient({
  scanLabel,
  scanColor,
  scanData,
}: {
  scanKey: string;
  scanLabel: string;
  scanColor: string;
  scanData: ScanDataProps;
}) {
  const [viewMode, setViewMode] = useState<'setup' | 'horizon'>('setup');
  const [sort, setSort] = useState<SortConfig>({ key: 'return_pct', dir: 'desc' });

  const setups = scanData.setups ?? [];
  const summary = scanData.setup_summary ?? {
    n_closed: 0,
    n_open: 0,
    avg_return_pct: null,
    win_rate_pct: null,
    avg_holding_days: null,
    avg_mfe_pct: null,
    avg_mae_pct: null,
  };

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        return prev.dir === 'desc' ? { key, dir: 'asc' } : null;
      }
      return { key, dir: 'desc' };
    });
  };

  const sortedSetups = [...setups].sort((a, b) => {
    if (!sort) return 0;
    const { key, dir } = sort;
    const va = (a as any)[key];
    const vb = (b as any)[key];

    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    if (typeof va === 'string' && typeof vb === 'string') {
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    const na = Number(va);
    const nb = Number(vb);
    return dir === 'asc' ? na - nb : nb - na;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Back button */}
      <Link
        href="/report-card"
        className="inline-flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
      >
        <ChevronLeft size={14} />
        กลับไป Report Card Overview
      </Link>

      {/* Header & Sub-toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: scanColor }} />
          <div>
            <h1 className="text-[20px] font-bold text-white">{scanLabel}</h1>
            <p className="text-[12px] text-white/35 mt-0.5">
              {summary.n_closed} closed setups · {summary.n_open} open · {scanData.total_picks} total picks
            </p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex bg-[#13161e] border border-white/[0.07] p-1 rounded-xl gap-1 self-start md:self-auto">
          <button
            onClick={() => setViewMode('setup')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              viewMode === 'setup'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            Setup-based (Full Path)
          </button>
          <button
            onClick={() => setViewMode('horizon')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              viewMode === 'horizon'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            Fixed Horizons (D+5/10/20)
          </button>
        </div>
      </div>

      {viewMode === 'setup' ? (
        <div className="space-y-6">
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
              <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-1">Avg Return / Setup</span>
              <span className="text-[24px] font-bold tabular-nums" style={{ color: returnColor(summary.avg_return_pct) }}>
                {fmtPct(summary.avg_return_pct)}
              </span>
              <span className="text-[11px] text-white/25 block mt-1">จาก {summary.n_closed} closed setups</span>
            </div>

            <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
              <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-1">Win Rate</span>
              <span className="text-[24px] font-bold text-white tabular-nums">
                {summary.win_rate_pct != null ? `${summary.win_rate_pct.toFixed(1)}%` : '—'}
              </span>
              <span className="text-[11px] text-white/25 block mt-1">
                {summary.n_closed > 0 ? `${Math.round((summary.win_rate_pct! / 100) * summary.n_closed)} / ${summary.n_closed} setups` : '—'}
              </span>
            </div>

            <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
              <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-1">Avg Holding</span>
              <span className="text-[24px] font-bold text-white tabular-nums">
                {summary.avg_holding_days != null ? `${summary.avg_holding_days} วัน` : '—'}
              </span>
              <span className="text-[11px] text-white/25 block mt-1">ระยะเวลาถือโดยเฉลี่ย</span>
            </div>

            <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
              <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-1">Avg MFE / MAE</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-bold text-[#1D9E75] tabular-nums" title="Maximum Favorable Excursion (กำไรสูงสุดระหว่างถือ)">
                  {fmtPct(summary.avg_mfe_pct)}
                </span>
                <span className="text-[12px] text-white/20">/</span>
                <span className="text-[18px] font-bold text-[#E24B4A] tabular-nums" title="Maximum Adverse Excursion (ขาดทุนสูงสุดระหว่างถือ)">
                  {fmtPct(summary.avg_mae_pct)}
                </span>
              </div>
              <span className="text-[11px] text-white/25 block mt-1">พีคสูงสุด / ขาดทุนสูงสุด</span>
            </div>
          </div>

          {/* Full-path Setups Table */}
          <TableWrap>
            <thead className="border-b border-white/[0.06] bg-white/[0.015]">
              <tr>
                <SortableTh sortKey="ticker" currentSort={sort} onSort={handleSort}>Symbol</SortableTh>
                <SortableTh sortKey="entry_date" currentSort={sort} onSort={handleSort}>Entry (D+1)</SortableTh>
                <SortableTh sortKey="exit_date" currentSort={sort} onSort={handleSort}>Exit</SortableTh>
                <SortableTh right sortKey="holding_days" currentSort={sort} onSort={handleSort}>ถือ (วัน)</SortableTh>
                <SortableTh right sortKey="return_pct" currentSort={sort} onSort={handleSort}>Return</SortableTh>
                <SortableTh right sortKey="mfe_pct" currentSort={sort} onSort={handleSort}>MFE</SortableTh>
                <SortableTh right sortKey="mae_pct" currentSort={sort} onSort={handleSort}>MAE</SortableTh>
                <SortableTh sortKey="status" currentSort={sort} onSort={handleSort}>สถานะ</SortableTh>
              </tr>
            </thead>
            <tbody>
              {sortedSetups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-white/30 text-[12px]">
                    ยังไม่มีข้อมูล setup ในสแกนนี้
                  </td>
                </tr>
              ) : (
                sortedSetups.map((s, idx) => (
                  <tr key={`${s.ticker}-${s.entry_date}-${idx}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <Td>
                      <Link href={`/stock/${s.ticker}`} className="font-bold text-white hover:text-emerald-400 transition-colors">
                        {s.ticker}
                      </Link>
                    </Td>
                    <Td mono>
                      <span className="text-white/80">{s.entry_date}</span>
                      <span className="text-white/35 ml-1.5">@{s.entry_price.toFixed(2)}</span>
                    </Td>
                    <Td mono>
                      <span className="text-white/80">{s.exit_date}</span>
                      <span className="text-white/35 ml-1.5">@{s.exit_price.toFixed(2)}</span>
                    </Td>
                    <Td right mono>{s.holding_days}</Td>
                    <Td right mono className="font-semibold">
                      <span style={{ color: returnColor(s.return_pct) }}>{fmtPct(s.return_pct)}</span>
                    </Td>
                    <Td right mono className="text-white/50">{fmtPct(s.mfe_pct)}</Td>
                    <Td right mono className="text-white/50">{fmtPct(s.mae_pct)}</Td>
                    <Td>
                      {s.status === 'open' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#378ADD]/15 text-[#378ADD] border border-[#378ADD]/30">
                          ยังถือ (open)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.05] text-white/40">
                          closed
                        </span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Fixed Horizons View */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['5', '10', '20'].map(h => {
              const m = scanData.horizons[h];
              if (!m) return null;
              const best5 = m.best5 ?? [];
              const worst5 = m.worst5 ?? [];
              const bestCounts = countOccurrences(best5);
              const worstCounts = countOccurrences(worst5);

              return (
                <div key={h} className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <h3 className="text-[14px] font-bold text-white">D+{h} วันทำการ</h3>
                    <span className="text-[11px] text-white/30">n = {m.n}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/25 block mb-1">Win Rate</span>
                      <span className="text-[20px] font-bold text-white tabular-nums">
                        {m.win_rate_pct != null ? `${m.win_rate_pct.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/25 block mb-1">Avg Return</span>
                      <span className="text-[20px] font-bold tabular-nums" style={{ color: returnColor(m.avg_return_pct) }}>
                        {fmtPct(m.avg_return_pct)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                    <span className="text-white/30">ส่วนต่าง vs SET</span>
                    <span className="font-semibold tabular-nums" style={{ color: returnColor(m.excess_return_pct) }}>
                      {fmtPct(m.excess_return_pct)}
                    </span>
                  </div>

                  {(best5.length > 0 || worst5.length > 0) && (
                    <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                      {best5.length > 0 && (
                        <div>
                          <div className="text-[9.5px] uppercase tracking-wider text-[#1D9E75]/70 mb-1.5">Best 5 (D+{h})</div>
                          <div className="space-y-1">
                            {best5.map(e => (
                              <TickerChip key={e.ticker + e.entry_date} entry={e} occurrenceCount={bestCounts[e.ticker]} />
                            ))}
                          </div>
                        </div>
                      )}
                      {worst5.length > 0 && (
                        <div>
                          <div className="text-[9.5px] uppercase tracking-wider text-[#E24B4A]/70 mb-1.5">Worst 5 (D+{h})</div>
                          <div className="space-y-1">
                            {worst5.map(e => (
                              <TickerChip key={e.ticker + e.entry_date} entry={e} occurrenceCount={worstCounts[e.ticker]} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
