'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  TableWrap,
  Th,
  SortableTh,
  SortConfig,
  Td,
} from '@/components/StrategyTable';
import ReportCardChart from '@/components/ReportCardChart';

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
  price_path?: number[];
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

const PER_PAGE = 20;

const SCAN_ROUTE_MAP: Record<string, string> = {
  lekkung_growth: '/lekkung',
  sepa: '/sepa',
  kell: '/kell',
  breakout: '/breakout',
  oneil: '/oneil',
  ppbp: '/scanner',
};

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

function Sparkline({ path, positive }: { path?: number[]; positive: boolean }) {
  if (!path || path.length < 2) return <span className="text-white/20">—</span>;
  const W = 100, H = 28, pad = 3;
  const stroke = positive ? '#1D9E75' : '#E24B4A';
  const pts = path
    .map((v, i) => {
      const x = pad + (i * (W - 2 * pad)) / (path.length - 1);
      const y = H - pad - (v / 100) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const firstPt = pts.split(' ')[0].split(',');
  const ex = firstPt[0];
  const ey = firstPt[1];
  const lastPt = pts.split(' ').slice(-1)[0].split(',');
  const lx = lastPt[0];
  const ly = lastPt[1];

  return (
    <svg width={W} height={H} className="inline-block vertical-middle">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" />
      <circle cx={ex} cy={ey} r="2.5" fill="#378ADD" />
      <circle cx={lx} cy={ly} r="2.5" fill={stroke} />
    </svg>
  );
}

// Compact stat card used by the expanded setup panel's stat strip.
function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
      <span className="text-[10px] uppercase tracking-wider text-white/30 block mb-0.5">{label}</span>
      <span className="text-[14px] font-bold tabular-nums block" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-white/25 block mt-0.5 tabular-nums">{sub}</span>}
    </div>
  );
}

// เข้า / ออก / ผลตอบแทน / MFE / MAE / ถือ — ใช้เฉพาะ field ที่มีจริงใน setup entry
// (vs SET ยังไม่มีข้อมูลระดับ setup จึงยังไม่แสดง)
function SetupStatStrip({ s }: { s: SetupEntry }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
      <StatCell label="เข้า" value={s.entry_price.toFixed(2)} sub={s.entry_date} color="rgba(255,255,255,0.85)" />
      <StatCell
        label={s.status === 'open' ? 'ล่าสุด' : 'ออก'}
        value={s.exit_price.toFixed(2)}
        sub={s.exit_date}
        color="rgba(255,255,255,0.85)"
      />
      <StatCell label="ผลตอบแทน" value={fmtPct(s.return_pct)} color={returnColor(s.return_pct)} />
      <StatCell
        label="MFE"
        value={fmtPct(s.mfe_pct)}
        sub="กำไรสูงสุดระหว่างถือ"
        color={s.mfe_pct == null ? undefined : s.mfe_pct >= 0 ? '#1D9E75' : '#E24B4A'}
      />
      <StatCell
        label="MAE"
        value={fmtPct(s.mae_pct)}
        sub="ขาดทุนสูงสุดระหว่างถือ"
        color={s.mae_pct == null ? undefined : '#E24B4A'}
      />
      <StatCell label="ถือ" value={`${s.holding_days} วัน`} color="rgba(255,255,255,0.85)" />
    </div>
  );
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
  scanKey,
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
  const [openSort, setOpenSort] = useState<SortConfig | null>({ key: 'return_pct', dir: 'desc' });
  const [openPage, setOpenPage] = useState(1);
  const [closedSort, setClosedSort] = useState<SortConfig | null>({ key: 'return_pct', dir: 'desc' });
  const [closedPage, setClosedPage] = useState(1);
  const [openSetup, setOpenSetup] = useState<string | null>(null);

  // Reset page=1 when scan changes
  React.useEffect(() => {
    setOpenPage(1);
    setClosedPage(1);
  }, [scanKey]);

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

  // Pre-calculate per-ticker setup counts & sequence numbers based on entry_date asc
  const tickerTotalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of setups) {
      counts[s.ticker] = (counts[s.ticker] ?? 0) + 1;
    }
    return counts;
  }, [setups]);

  const tickerSetupSeq = useMemo(() => {
    const seqMap = new Map<SetupEntry, number>();
    const grouped: Record<string, SetupEntry[]> = {};
    for (const s of setups) {
      if (!grouped[s.ticker]) grouped[s.ticker] = [];
      grouped[s.ticker].push(s);
    }
    for (const t in grouped) {
      grouped[t].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      grouped[t].forEach((s, i) => seqMap.set(s, i + 1));
    }
    return seqMap;
  }, [setups]);

  const sortSetupsList = (list: SetupEntry[], sortCfg: SortConfig | null) => {
    if (!sortCfg) return list;
    const { key, dir } = sortCfg;
    return [...list].sort((a, b) => {
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
  };

  const sortedOpenSetups = useMemo(() => {
    const list = setups.filter(s => s.status === 'open');
    if (!openSort) {
      return [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    }
    return sortSetupsList(list, openSort);
  }, [setups, openSort]);

  const openTotalPages = Math.max(1, Math.ceil(sortedOpenSetups.length / PER_PAGE));
  const currentOpenPage = Math.min(openPage, openTotalPages);

  const paginatedOpenSetups = useMemo(() => {
    const start = (currentOpenPage - 1) * PER_PAGE;
    return sortedOpenSetups.slice(start, start + PER_PAGE);
  }, [sortedOpenSetups, currentOpenPage]);

  const handleOpenSort = (key: string) => {
    setOpenPage(1);
    setOpenSort(prev => {
      if (prev?.key === key) {
        return prev.dir === 'desc' ? { key, dir: 'asc' } : null;
      }
      return { key, dir: 'desc' };
    });
  };

  const sortedClosedSetups = useMemo(() => {
    const list = setups.filter(s => s.status === 'closed');
    if (!closedSort) return list;
    return sortSetupsList(list, closedSort);
  }, [setups, closedSort]);

  const closedTotalPages = Math.max(1, Math.ceil(sortedClosedSetups.length / PER_PAGE));
  const currentClosedPage = Math.min(closedPage, closedTotalPages);

  const paginatedClosedSetups = useMemo(() => {
    const start = (currentClosedPage - 1) * PER_PAGE;
    return sortedClosedSetups.slice(start, start + PER_PAGE);
  }, [sortedClosedSetups, currentClosedPage]);

  const handleClosedSort = (key: string) => {
    setClosedPage(1);
    setClosedSort(prev => {
      if (prev?.key === key) {
        return prev.dir === 'desc' ? { key, dir: 'asc' } : null;
      }
      return { key, dir: 'desc' };
    });
  };

  const renderSetupRow = (s: SetupEntry, idx: number) => {
    const total = tickerTotalCounts[s.ticker] ?? 1;
    const seq = tickerSetupSeq.get(s) ?? 1;
    const isMulti = total > 1;
    const setupId = `${s.ticker}-${s.entry_date}`;
    const isExpanded = openSetup === setupId;

    return (
      <React.Fragment key={`${s.ticker}-${s.entry_date}-${idx}`}>
        <tr
          onClick={() => setOpenSetup(prev => prev === setupId ? null : setupId)}
          className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer ${
            isExpanded ? 'bg-white/[0.04]' : ''
          } ${isMulti ? 'border-l-2 border-l-[#378ADD]/50' : ''}`}
        >
          <Td>
            <Link
              href={`/stock/${s.ticker}`}
              onClick={(e) => e.stopPropagation()}
              className="font-bold text-white hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
            >
              <span>{s.ticker}</span>
              {isMulti && (
                <span className="text-[10px] text-[#378ADD] font-medium bg-[#378ADD]/10 px-1 py-0.2 rounded border border-[#378ADD]/20">
                  #{seq}
                </span>
              )}
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
          <Td className="text-center">
            <Sparkline path={s.price_path} positive={s.return_pct >= 0} />
          </Td>
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
        {isExpanded && (
          <tr key={`${setupId}-chart`} className="bg-black/20 border-b border-white/[0.04]">
            <td colSpan={9} className="p-3 md:p-4">
              <div className="bg-[#13161e] border border-emerald-500/25 rounded-xl p-4 m-1">
                <SetupStatStrip s={s} />
                {s.holding_days === 0 ? (
                  <div className="text-[12px] text-white/50 py-6 text-center">
                    เข้า–ออกวันเดียว (D+1) — ไม่มีช่วงราคาให้แสดง
                  </div>
                ) : (
                  <ReportCardChart
                    ticker={s.ticker}
                    entryDate={s.entry_date}
                    entryPrice={s.entry_price}
                    exitDate={s.exit_date}
                    exitPrice={s.exit_price}
                    returnPct={s.return_pct}
                    isOpen={s.status === 'open'}
                  />
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Back buttons */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href="/report-card"
          className="inline-flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ChevronLeft size={14} />
          กลับไป Report Card Overview
        </Link>
        {SCAN_ROUTE_MAP[scanKey] && (
          <Link
            href={SCAN_ROUTE_MAP[scanKey]}
            className="inline-flex items-center gap-1 text-[12px] text-[#1D9E75]/70 hover:text-[#1D9E75] transition-colors"
          >
            <ChevronLeft size={14} />
            กลับไปหน้าสแกน {scanLabel}
          </Link>
        )}
      </div>

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

          {/* Section 1: Open Setups (Shown only if sortedOpenSetups.length > 0) */}
          {sortedOpenSetups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#378ADD] animate-pulse" />
                  <h2 className="text-[14px] font-bold text-white">
                    🔵 ยังถืออยู่ ({sortedOpenSetups.length})
                  </h2>
                </div>
                <span className="text-[11px] text-white/35">
                  หน้า {currentOpenPage} / {openTotalPages}
                </span>
              </div>

              <TableWrap>
                <thead className="border-b border-white/[0.06] bg-white/[0.015]">
                  <tr>
                    <SortableTh sortKey="ticker" currentSort={openSort} onSort={handleOpenSort}>Symbol</SortableTh>
                    <SortableTh sortKey="entry_date" currentSort={openSort} onSort={handleOpenSort}>Entry (D+1)</SortableTh>
                    <SortableTh sortKey="exit_date" currentSort={openSort} onSort={handleOpenSort}>Latest MTM</SortableTh>
                    <SortableTh right sortKey="holding_days" currentSort={openSort} onSort={handleOpenSort}>ถือ (วัน)</SortableTh>
                    <SortableTh right sortKey="return_pct" currentSort={openSort} onSort={handleOpenSort}>Return</SortableTh>
                    <SortableTh right sortKey="mfe_pct" currentSort={openSort} onSort={handleOpenSort}>MFE</SortableTh>
                    <SortableTh right sortKey="mae_pct" currentSort={openSort} onSort={handleOpenSort}>MAE</SortableTh>
                    <Th className="text-center">ทรงราคา</Th>
                    <SortableTh sortKey="status" currentSort={openSort} onSort={handleOpenSort}>สถานะ</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOpenSetups.map((s, idx) => renderSetupRow(s, idx))}
                </tbody>
              </TableWrap>

              {/* Pagination controls for Open Setups */}
              {openTotalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px]">
                  <span className="text-white/40 text-[11px]">
                    ยังถือ {sortedOpenSetups.length} ตัว · แสดง {(currentOpenPage - 1) * PER_PAGE + 1}–{Math.min(currentOpenPage * PER_PAGE, sortedOpenSetups.length)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenPage(p => Math.max(1, p - 1))}
                      disabled={currentOpenPage === 1}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white/70"
                    >
                      <ChevronLeft size={13} />
                      ก่อนหน้า
                    </button>
                    <span className="text-white/60 font-medium px-1">
                      {currentOpenPage} / {openTotalPages}
                    </span>
                    <button
                      onClick={() => setOpenPage(p => Math.min(openTotalPages, p + 1))}
                      disabled={currentOpenPage === openTotalPages}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white/70"
                    >
                      ถัดไป
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Closed Setups */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[14px] font-bold text-white">
                ปิดรอบแล้ว ({sortedClosedSetups.length})
              </h2>
              <span className="text-[11px] text-white/35">
                หน้า {currentClosedPage} / {closedTotalPages}
              </span>
            </div>

            <TableWrap>
              <thead className="border-b border-white/[0.06] bg-white/[0.015]">
                <tr>
                  <SortableTh sortKey="ticker" currentSort={closedSort} onSort={handleClosedSort}>Symbol</SortableTh>
                  <SortableTh sortKey="entry_date" currentSort={closedSort} onSort={handleClosedSort}>Entry (D+1)</SortableTh>
                  <SortableTh sortKey="exit_date" currentSort={closedSort} onSort={handleClosedSort}>Exit</SortableTh>
                  <SortableTh right sortKey="holding_days" currentSort={closedSort} onSort={handleClosedSort}>ถือ (วัน)</SortableTh>
                  <SortableTh right sortKey="return_pct" currentSort={closedSort} onSort={handleClosedSort}>Return</SortableTh>
                  <SortableTh right sortKey="mfe_pct" currentSort={closedSort} onSort={handleClosedSort}>MFE</SortableTh>
                  <SortableTh right sortKey="mae_pct" currentSort={closedSort} onSort={handleClosedSort}>MAE</SortableTh>
                  <Th className="text-center">ทรงราคา</Th>
                  <SortableTh sortKey="status" currentSort={closedSort} onSort={handleClosedSort}>สถานะ</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedClosedSetups.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-white/30 text-[12px]">
                      ยังไม่มีข้อมูล closed setup ในสแกนนี้
                    </td>
                  </tr>
                ) : (
                  paginatedClosedSetups.map((s, idx) => renderSetupRow(s, idx))
                )}
              </tbody>
            </TableWrap>

            {/* Sparkline Legend */}
            <div className="flex items-center gap-1.5 text-[11px] text-white/35 px-1 pt-1">
              <span className="text-[#378ADD]">🔵</span>
              <span>จุดเข้า · เส้น=ราคาช่วงถือ (เขียว=กำไร แดง=ขาดทุน)</span>
            </div>

            {/* Pagination controls */}
            {closedTotalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px]">
                <span className="text-white/40 text-[11px]">
                  ปิดรอบ {sortedClosedSetups.length} ตัว · แสดง {(currentClosedPage - 1) * PER_PAGE + 1}–{Math.min(currentClosedPage * PER_PAGE, sortedClosedSetups.length)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setClosedPage(p => Math.max(1, p - 1))}
                    disabled={currentClosedPage === 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white/70"
                  >
                    <ChevronLeft size={13} />
                    ก่อนหน้า
                  </button>
                  <span className="text-white/60 font-medium px-1">
                    {currentClosedPage} / {closedTotalPages}
                  </span>
                  <button
                    onClick={() => setClosedPage(p => Math.min(closedTotalPages, p + 1))}
                    disabled={currentClosedPage === closedTotalPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white/70"
                  >
                    ถัดไป
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
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
