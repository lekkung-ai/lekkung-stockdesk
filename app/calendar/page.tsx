'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar as CalendarIcon, ArrowDown, ArrowUp } from 'lucide-react';
import Pagination from '@/components/Pagination';
import type { CalendarRow } from '@/app/api/corporate-action/route';

type SortKey = 'xDate' | 'ticker' | 'caType' | 'detail' | 'payDate';
type SortConfig = { key: SortKey; dir: 'asc' | 'desc' } | null;

const PER_PAGE = 20;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isoToThaiLabel(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

const BUCKET_OPTS = ['ทั้งหมด', 'XD', 'XR', 'XW', 'XM'] as const;
type BucketOpt = (typeof BUCKET_OPTS)[number];

const BUCKET_STYLE: Record<string, string> = {
  XD: 'bg-green-500/20 text-green-400',
  XR: 'bg-blue-500/20 text-blue-400',
  XW: 'bg-purple-500/20 text-purple-400',
  XM: 'bg-white/10 text-white/60',
  XA: 'bg-orange-500/20 text-orange-400',
};

// Days from today until the given ISO date (yyyy-mm-dd), timezone-safe.
function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00Z').getTime();
  const today = new Date(todayISO() + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86400000);
}

// Color tier by proximity to the X-Date itself (applies to every bucket,
// not just XR/XW): grayed once it's passed/today, red inside 3 days, orange
// inside a week, otherwise the bucket's normal color.
function xDateTierCls(row: CalendarRow): string {
  const days = daysUntil(row.xDate);
  if (days <= 0) return 'bg-white/10 text-white/35';
  if (days <= 3) return 'bg-[#E24B4A]/20 text-[#E24B4A]';
  if (days <= 7) return 'bg-[#EF9F27]/20 text-[#EF9F27]';
  return BUCKET_STYLE[row.bucket] ?? BUCKET_STYLE.XA;
}

function DaysLeftBadge({ xDate }: { xDate: string }) {
  const days = daysUntil(xDate);
  if (days < 0) {
    return <span className="text-[10px] text-white/25 ml-1.5 whitespace-nowrap">ผ่านมาแล้ว {Math.abs(days)} วัน</span>;
  }
  if (days === 0) {
    return <span className="text-[10px] font-semibold text-white/45 bg-white/[0.06] px-1.5 py-0.5 rounded ml-1.5 whitespace-nowrap">วันนี้</span>;
  }
  const cls = days <= 3 ? 'bg-[#E24B4A]/15 text-[#E24B4A]' : days <= 7 ? 'bg-[#EF9F27]/15 text-[#EF9F27]' : 'bg-white/[0.05] text-white/30';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1.5 whitespace-nowrap ${cls}`}>เหลือ {days} วัน</span>;
}

function SortTh({
  sortKey, label, sortConfig, onSort, className = '',
}: {
  sortKey: SortKey; label: string; sortConfig: SortConfig; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortConfig?.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none group ${active ? 'text-white/60' : 'text-white/25 hover:text-white/40'} ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <div className={`flex flex-col opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'opacity-100' : ''}`}>
          {active ? (
            sortConfig!.dir === 'asc' ? <ArrowUp size={10} className="text-white/50" /> : <ArrowDown size={10} className="text-white/50" />
          ) : (
            <ArrowDown size={10} className="text-white/20" />
          )}
        </div>
      </div>
    </th>
  );
}

function BucketBadge({ row }: { row: CalendarRow }) {
  const cls = xDateTierCls(row);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${cls}`}>
      {row.caType}
    </span>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<BucketOpt>('ทั้งหมด');
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(addDaysISO(todayISO(), 30));
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    setPage(1);
  };

  const loadData = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const res = await fetch(`/api/corporate-action?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(fromDate, toDate); }, [loadData, fromDate, toDate]);

  const filteredRows = useMemo(() => {
    const result = rows.filter(r => {
      if (bucket !== 'ทั้งหมด' && r.bucket !== bucket) return false;
      if (query.trim() && !r.ticker.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });

    if (sortConfig) {
      const { key, dir } = sortConfig;
      result.sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;   // nulls (e.g. missing payDate) always sort last
        if (vb == null) return -1;
        return dir === 'asc' ? va.localeCompare(vb, 'th') : vb.localeCompare(va, 'th');
      });
    }
    // Default (no sort clicked): server already returns ascending by X-Date (closest first)
    return result;
  }, [rows, bucket, query, sortConfig]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">ปฏิทินหลักทรัพย์</h1>
          <p className="text-[12px] text-white/35 mt-0.5">XD / XR / XW / XM / อื่นๆ (XA) · SET Corporate Action Calendar</p>
        </div>
        <button
          onClick={() => loadData(fromDate, toDate)}
          className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {BUCKET_OPTS.map(b => (
          <button
            key={b}
            onClick={() => { setBucket(b); setPage(1); }}
            className={`px-3 py-1.5 rounded text-[12.5px] font-semibold transition-all ${
              bucket === b
                ? (b === 'ทั้งหมด' ? 'bg-white/15 text-white' : BUCKET_STYLE[b])
                : 'bg-white/[0.04] text-white/30 hover:text-white/60'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Search + date range */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="ค้นหาหลักทรัพย์..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CalendarIcon size={12} className="text-white/30" />
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={e => setFromDate(e.target.value)}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
          />
          <span className="text-white/25 text-[11px]">ถึง</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={e => setToDate(e.target.value)}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #4B9EF5' }}>
        {loading ? (
          <div className="py-16 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button
              onClick={() => loadData(fromDate, toDate)}
              className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {rows.length > 0 ? 'ไม่พบผลลัพธ์ที่ตรงกับตัวกรอง' : 'ไม่พบข้อมูลในช่วงวันที่เลือก'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <SortTh sortKey="xDate" label="วันขึ้นเครื่องหมาย (X-Date)" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="ticker" label="หลักทรัพย์" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="caType" label="เครื่องหมาย" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="detail" label="รายละเอียด" sortConfig={sortConfig} onSort={handleSort} className="!normal-case" />
                  <SortTh sortKey="payDate" label="วันจ่าย/ประชุม" sortConfig={sortConfig} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => (
                  <tr key={`${row.ticker}-${row.caType}-${row.xDate}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3 text-[14px] text-white/55 whitespace-nowrap">
                      {isoToThaiLabel(row.xDate)}
                      <DaysLeftBadge xDate={row.xDate} />
                    </td>
                    <td
                      onClick={() => router.push(`/stock/${row.ticker}`)}
                      className="px-3 py-3 text-[15px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                    >
                      {row.ticker}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <BucketBadge row={row} />
                    </td>
                    <td className="px-3 py-3 text-[14px] text-white/65 max-w-[360px]">
                      {row.detail}
                    </td>
                    <td className="px-3 py-3 text-[14px] text-white/55 whitespace-nowrap">
                      {isoToThaiLabel(row.payDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SET (ผ่าน Settrade) · Stock Calendar{filteredRows.length > 0 ? ` · ${filteredRows.length} รายการ` : ''}
      </p>
    </div>
  );
}
