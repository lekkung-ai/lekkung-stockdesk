'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar as CalendarIcon } from 'lucide-react';
import Pagination from '@/components/Pagination';
import type { CalendarRow } from '@/app/api/corporate-action/route';

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

function BucketBadge({ bucket, caType }: { bucket: string; caType: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${BUCKET_STYLE[bucket] ?? BUCKET_STYLE.XA}`}>
      {caType}
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
  const [toDate, setToDate] = useState(addDaysISO(todayISO(), 7));
  const [page, setPage] = useState(1);

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
    return rows.filter(r => {
      if (bucket !== 'ทั้งหมด' && r.bucket !== bucket) return false;
      if (query.trim() && !r.ticker.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, bucket, query]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">ปฏิทินหลักทรัพย์</h1>
          <p className="text-[12px] text-white/35 mt-0.5">XD / XR / XW / XM · SET Corporate Action Calendar</p>
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
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
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
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">วันที่</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">หลักทรัพย์</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">เครื่องหมาย</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25">รายละเอียด</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">วันจ่าย/ประชุม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => (
                  <tr key={`${row.ticker}-${row.caType}-${row.xDate}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2.5 text-[12px] text-white/55 whitespace-nowrap">
                      {isoToThaiLabel(row.xDate)}
                    </td>
                    <td
                      onClick={() => router.push(`/stock/${row.ticker}`)}
                      className="px-3 py-2.5 text-[13px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                    >
                      {row.ticker}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <BucketBadge bucket={row.bucket} caType={row.caType} />
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-white/65 max-w-[360px]">
                      {row.detail}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-white/55 whitespace-nowrap">
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
