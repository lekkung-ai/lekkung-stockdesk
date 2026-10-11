'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { scanData } from '@/lib/scanData';
import { stageData, weinsteinData } from '@/lib/strategyData';
import { fundTickers, listedFundTickers, tickerToSector } from '@/lib/sectorData';
import { useMarketQuotes } from '@/lib/useMarketQuotes';
import { heatTextColor } from '@/lib/heatColor';
import { compareValuesNullLast } from '@/lib/fundFilter';
import { tvPriceNote } from '@/lib/priceSource';
import { stageCls, Td, TableWrap, SortableTh, type SortConfig } from '@/components/StrategyTable';

// กองทุน & REIT — ทุกตัวใน sector_map subsector "Property Fund & REITs" ที่ TradingView ยังมีราคา
// (sectorData.listedFundTickers — รายการเดียวกับกลุ่มบน heatmap /sector และลิงก์บน /sector/property)
// · ราคา / 1D% / market cap / ปันผล จาก TradingView ทุกตัว · stage / ADTV / 52W มีเฉพาะตัวที่อยู่ใน
// universe ของสแกน (combined.json / market_stage / weinstein) — นอกนั้น "—" · ไม่จัดอันดับ RS จึงไม่มีคอลัมน์ RS

const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];
const stageRank = (stage: string | null) => {
  if (!stage) return null;
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i; // unrecognised labels sort after known stages
};

type SortKey = 'ticker' | 'subsector' | 'price' | 'chg' | 'mcap' | 'stage' | 'adtv' | 'dy' | 'fromHigh';
const SORT_KEYS: readonly SortKey[] = ['ticker', 'subsector', 'price', 'chg', 'mcap', 'stage', 'adtv', 'dy', 'fromHigh'];

interface FundRow {
  ticker: string;
  subsector: string | null;
  price: number | null;
  chg: number | null;
  mcap: number | null; // ล้านบาท
  stage: string | null;
  adtv: number | null;
  dy: number | null;
  fromHigh: number | null;
}

const adtvMap = new Map(stageData.map(s => [s.Ticker, s['ADTV(MB)']]));
const high52Map = new Map(weinsteinData.map(w => [w.Ticker, w['52W_High']]));
const scanByTicker = new Map(scanData.map(s => [s.ticker, s]));
const ALL_FUNDS = fundTickers('SET');

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

  const { status: quotesStatus, quotes, fetchedAt } = useMarketQuotes();
  const [yields, setYields] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/fund-dividends')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(json => { if (!cancelled) setYields((json?.yields ?? {}) as Record<string, number | null>); })
      .catch(() => {}); // ไม่มีข้อมูลปันผล → คอลัมน์แสดง "—"
    return () => { cancelled = true; };
  }, []);

  // quotes ok → only funds TradingView still prices (delisted ones drop out) · loading / error → every
  // sector_map fund, prices "—" (or the scan close for funds in the universe)
  const tickers = useMemo(() => (quotesStatus === 'ok' ? listedFundTickers(quotes) : ALL_FUNDS), [quotesStatus, quotes]);
  const rows = useMemo<FundRow[]>(() => tickers.map(t => {
    const scan = scanByTicker.get(t);
    const price = num(quotes[t]?.price) ?? num(scan?.price);
    const mcap = num(quotes[t]?.mcap);
    const high = num(high52Map.get(t));
    return {
      ticker: t,
      subsector: tickerToSector[t]?.subsector || null,
      price,
      chg: num(quotes[t]?.chg),
      mcap: mcap != null ? mcap / 1e6 : null,
      stage: scan?.stage ?? null,
      adtv: num(adtvMap.get(t)),
      dy: num(yields[t]),
      fromHigh: price != null && high != null && high > 0 ? ((price - high) / high) * 100 : null,
    };
  }), [tickers, quotes, yields]);

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
          กองทุน &amp; REIT <span className="text-white/35 font-medium" data-testid="funds-count">· {quotesStatus === 'loading' ? '…' : rows.length} ตัว</span>
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
            <SortableTh right sortKey="mcap" currentSort={sortConfig} onSort={handleSort}>Market cap (ลบ.)</SortableTh>
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
              <Td right mono>{r.mcap == null ? '—' : Math.round(r.mcap).toLocaleString('en-US')}</Td>
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
      <p className="text-[11px] text-white/30" data-testid="funds-source">
        {quotesStatus === 'error' ? 'ไม่มีข้อมูลราคาสด' : tvPriceNote(fetchedAt)} · ราคา / 1D% / market cap / ปันผล จาก TradingView
        · Stage / ADTV / % From 52W High มีเฉพาะตัวที่อยู่ในสแกน (ตัวอื่นแสดง —)
      </p>
    </div>
  );
}
