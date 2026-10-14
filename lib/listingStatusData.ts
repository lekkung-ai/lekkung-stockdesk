// ตัวโหลดข้อมูลสถานะการจดทะเบียน (server เท่านั้น — อ่านไฟล์ตอน request ผ่าน fs)
// data/history/**, public/data/history/** อยู่ใน outputFileTracingIncludes ของ next.config.ts แล้ว
import fs from 'fs';
import path from 'path';
import rawSectorMap from '@/data/scans/sector_map.json';
import rawCombined from '@/data/scans/combined.json';
import rawManual from '@/data/manual_listing_changes.json';
import { TRADINGVIEW_HEADERS } from '@/lib/tradingview';
import {
  buildListingIndex,
  getListingStatus,
  inactiveStatuses,
  tradingOnLatestSession,
  type ListingIndex,
  type ListingStatus,
  type ManualListingChanges,
  type NewsItemLike,
  type UniverseSnapshot,
} from '@/lib/listingStatus';

const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'history');
const LATEST_SNAPSHOT = path.join(ROOT, 'data', 'scans', 'universe_changes.json');
const NEWS_DIR = path.join(ROOT, 'public', 'data', 'history');

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function listDateDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  } catch {
    return [];
  }
}

function loadSnapshots(): UniverseSnapshot[] {
  const out: UniverseSnapshot[] = [];
  const add = (raw: unknown, fallbackDate: string | null) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const gen = typeof r.generated_at === 'string' ? r.generated_at.slice(0, 10) : null;
    const date = gen ?? fallbackDate;
    if (!date) return;
    out.push({
      date,
      delisted: Array.isArray(r.delisted) ? r.delisted : null,
      new: Array.isArray(r.new) ? r.new : null,
      renamed: Array.isArray(r.renamed) ? r.renamed : null,
    });
  };
  for (const d of listDateDirs(SNAPSHOT_DIR)) add(readJson(path.join(SNAPSHOT_DIR, d, 'universe_changes.json')), d);
  add(readJson(LATEST_SNAPSHOT), null);
  return out;
}

function loadNews(): NewsItemLike[] {
  const out: NewsItemLike[] = [];
  for (const d of listDateDirs(NEWS_DIR)) {
    const raw = readJson(path.join(NEWS_DIR, d, 'news.json'));
    const rows = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
    for (const it of rows as NewsItemLike[]) {
      if (it && String(it.source ?? '').startsWith('SET')) {
        out.push({ title: it.title, source: it.source, tickerHint: it.tickerHint, ts: it.ts, pubDate: it.pubDate });
      }
    }
  }
  return out;
}

function listedTickers(): string[] {
  const sm = (rawSectorMap as { ticker_to_sector?: Record<string, unknown> }).ticker_to_sector ?? {};
  const c = rawCombined as unknown as { ticker?: string }[] | { data?: { ticker?: string }[] };
  const rows = Array.isArray(c) ? c : c.data ?? [];
  return [...Object.keys(sm), ...rows.map(r => r?.ticker).filter((t): t is string => !!t)];
}

// ไฟล์เปลี่ยนเฉพาะตอน deploy → สร้าง index ครั้งเดียวต่อ instance
let cached: ListingIndex | null = null;

export function loadListingIndex(): ListingIndex {
  if (!cached) {
    cached = buildListingIndex({
      snapshots: loadSnapshots(),
      news: loadNews(),
      manual: rawManual as ManualListingChanges,
      listed: listedTickers(),
    });
  }
  return cached;
}

export function listingStatusFor(ticker: string): ListingStatus {
  return getListingStatus(ticker, loadListingIndex());
}

export function allInactiveStatuses(): Record<string, ListingStatus> {
  return inactiveStatuses(loadListingIndex());
}

// ── ยังเปิดซื้อขายชั่วคราวไหม (TradingView) — ใช้แค่เติม stillTrading ให้หุ้นที่ delisted แล้ว ไม่ใช้ตัดสินสถานะ ──
const TV_REFERENCE = 'PTT'; // หุ้นอ้างอิงที่ซื้อขายปกติ → บอกว่าวันทำการล่าสุดคือวันไหน

async function stillTrading(tickers: string[]): Promise<Set<string>> {
  if (tickers.length === 0) return new Set();
  try {
    const names = [...new Set([...tickers, TV_REFERENCE])];
    const res = await fetch('https://scanner.tradingview.com/thailand/scan', {
      method: 'POST',
      headers: TRADINGVIEW_HEADERS,
      body: JSON.stringify({
        filter: [{ left: 'name', operation: 'in_range', right: names }],
        markets: ['thailand'],
        columns: ['name', 'volume', 'time'],
        range: [0, names.length],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return new Set();
    const json = await res.json();
    const rows: { d?: unknown[] }[] = Array.isArray(json?.data) ? json.data : [];
    const live = tradingOnLatestSession(rows.map(r => ({
      name: typeof r.d?.[0] === 'string' ? r.d[0] : null,
      volume: typeof r.d?.[1] === 'number' ? r.d[1] : null,
      time: typeof r.d?.[2] === 'number' ? r.d[2] : null,
    })));
    live.delete(TV_REFERENCE);
    return live;
  } catch {
    return new Set();
  }
}

async function withTrading(statuses: ListingStatus[], tickers: string[]): Promise<ListingStatus[]> {
  const delisted = tickers.filter((_, i) => statuses[i].status === 'delisted');
  const live = await stillTrading(delisted);
  return statuses.map((s, i) => (s.status === 'delisted' && live.has(tickers[i]) ? { ...s, stillTrading: true } : s));
}

/** สถานะ + stillTrading (ถามราคาเฉพาะหุ้นที่ delisted) */
export async function listingStatusWithTrading(ticker: string): Promise<ListingStatus> {
  const t = ticker.trim().toUpperCase();
  const [s] = await withTrading([listingStatusFor(t)], [t]);
  return s;
}

export async function allInactiveStatusesWithTrading(): Promise<Record<string, ListingStatus>> {
  const all = allInactiveStatuses();
  const tickers = Object.keys(all);
  const withLive = await withTrading(tickers.map(t => all[t]), tickers);
  return Object.fromEntries(tickers.map((t, i) => [t, withLive[i]]));
}
