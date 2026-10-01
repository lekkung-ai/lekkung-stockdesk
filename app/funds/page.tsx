'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { scanData } from '@/lib/scanData';
import { stageData, weinsteinData } from '@/lib/strategyData';
import { tickerToSector } from '@/lib/sectorData';
import { useMarketQuotes } from '@/lib/useMarketQuotes';
import { heatTextColor } from '@/lib/heatColor';
import { FUND_TICKERS, compareValuesNullLast } from '@/lib/fundFilter';
import { stageCls, Td, TableWrap, SortableTh, type SortConfig } from '@/components/StrategyTable';

// กองทุน & REIT — แถวใน combined.json ที่ Is_Fund = true · data-engine แยกออกจาก scanner หุ้น
// และไม่จัดอันดับ RS จึงไม่มีคอลัมน์ RS · ราคา / 1D% สดจาก /api/market-quotes (fallback ราคาใน JSON)

const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];
const stageRank = (stage: string | null) => {
  if (!stage) return null;
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i; // unrecognised labels sort after known stages
};

type SortKey = 'ticker' | 'subsector' | 'price' | 'chg' | 'stage' | 'adtv' | 'dy' | 'fromHigh';
const SORT_KEYS: readonly SortKey[] = ['ticker', 'subsector', 'price', 'chg', 'stage', 'adtv', 'dy', 'fromHigh'];

interface FundRow {
  ticker: string;
  subsector: string | null;
  price: number | null;
  chg: number | null;
  stage: string | null;
  adtv: number | null;
  dy: number | null;
  fromHigh: number | null;
}

const adtvMap = new Map(stageData.map(s => [s.Ticker, s['ADTV(MB)']]));
const high52Map = new Map(weinsteinData.map(w => [w.Ticker, w['52W_High']]));
const fundEntries = scanData.filter(s => FUND_TICKERS.has(s.ticker));

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sortValue(r: FundRow, key: SortKey): string | number | null {
  return key === 'stage' ? stageRank(r.stage) : r[key];
}

export default function FundsPage() {
  return (
    <Suspense fallback={null}>
      <FundsContent />
    </Suspense>
  );
}

function FundsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?sort=<column>&dir=asc|desc — anything invalid/missing = default (Symbol A→Z)
  const rawSort = searchParams.get('sort');
  const rawDir = searchParams.get('dir');
  const sortKey = rawSort && (SORT_KEYS as readonly string[]).includes(rawSort) && (rawDir === 'asc' || rawDir === 'desc')
    ? (rawSort as SortKey) : null;
  const sortDir = rawDir === 'asc' ? 'asc' : 'desc';
  const sortConfig = useMemo<SortConfig>(() => (sortKey ? { key: sortKey, dir: sortDir } : null), [sortKey, sortDir]);

  const { quotes } = useMarketQuotes();
  const [yields, setYields] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/fund-dividends')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(json => { if (!cancelled) setYields((json?.yields ?? {}) as Record<string, number | null>); })
      .catch(() => {}); // ไม่มีข้อมูลปันผล → คอลัมน์แสดง "—"
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo<FundRow[]>(() => fundEntries.map(s => {
    const price = num(quotes[s.ticker]?.price) ?? num(s.price);
    const high = num(high52Map.get(s.ticker));
    return {
      ticker: s.ticker,
      subsector: tickerToSector[s.ticker]?.subsector || null,
      price,
      chg: num(quotes[s.ticker]?.chg),
      stage: s.stage ?? null,
      adtv: num(adtvMap.get(s.ticker)),
      dy: num(yields[s.ticker]),
      fromHigh: price != null && high != null && high > 0 ? ((price - high) / high) * 100 : null,
    };
  }), [quotes, yields]);

  const sorted = useMemo(() => {
    const out = [...rows];
    if (sortConfig) {
      const key = sortConfig.key as SortKey;
      out.sort((a, b) => compareValuesNullLast(sortValue(a, key), sortValue(b, key), sortConfig.dir) || a.ticker.localeCompare(b.ticker));
    } else {
      out.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
    return out;
  }, [rows, sortConfig]);

  const handleSort = (key: string) => {
    const dir = sortConfig?.key === key && sortConfig.dir === 'desc' ? 'asc' : 'desc';
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', key);
    params.set('dir', dir);
    router.replace(`/funds?${params.toString()}`, { scroll: false });
  };

  const fmt = (v: number | null, digits = 2) => (v == null ? '—' : v.toFixed(digits));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">
          กองทุน &amp; REIT <span className="text-white/35 font-medium">· {rows.length} ตัว</span>
        </h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          แยกออกจาก scanner หุ้น (SEPA, Kell, Breakout ฯลฯ) · ไม่มีค่า RS เพราะ RS จัดอันดับเฉพาะหุ้น
        </p>
      </div>

      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <SortableTh sortKey="ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh sortKey="subsector" currentSort={sortConfig} onSort={handleSort}>Subsector</SortableTh>
            <SortableTh right sortKey="price" currentSort={sortConfig} onSort={handleSort}>ราคา</SortableTh>
            <SortableTh right sortKey="chg" currentSort={sortConfig} onSort={handleSort}>1D%</SortableTh>
            <SortableTh right sortKey="stage" currentSort={sortConfig} onSort={handleSort}>Stage</SortableTh>
            <SortableTh right sortKey="adtv" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
            <SortableTh right sortKey="dy" currentSort={sortConfig} onSort={handleSort}>ปันผล %</SortableTh>
            <SortableTh right sortKey="fromHigh" currentSort={sortConfig} onSort={handleSort}>% From 52W High</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.ticker}
              onClick={() => router.push(`/stock/${r.ticker}`)}
              className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <Td>
                <div className="flex items-center gap-2 font-bold text-white">
                  <span className="text-white/25 tabular-nums text-[11px] font-normal shrink-0">{i + 1}</span>
                  {r.ticker}
                </div>
              </Td>
              <Td><span className="text-white/50">{r.subsector ?? '—'}</span></Td>
              <Td right mono>{fmt(r.price)}</Td>
              <Td right mono>
                <span style={{ color: heatTextColor(r.chg) ?? undefined }}>
                  {r.chg == null ? '—' : `${r.chg > 0 ? '+' : ''}${r.chg.toFixed(2)}%`}
                </span>
              </Td>
              <Td right>
                {r.stage
                  ? <span className={`inline-block px-2 py-0.5 rounded text-[11px] ${stageCls(r.stage)}`}>{r.stage}</span>
                  : <span className="text-white/25">—</span>}
              </Td>
              <Td right mono>{fmt(r.adtv, 1)}</Td>
              <Td right mono>{r.dy == null ? '—' : `${r.dy.toFixed(2)}%`}</Td>
              <Td right mono>{r.fromHigh == null ? '—' : `${r.fromHigh.toFixed(1)}%`}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
