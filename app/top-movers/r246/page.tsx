'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar } from 'lucide-react';
import Pagination from '@/components/Pagination';

const PER_PAGE = 20;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function todayISO() { return new Date().toISOString().slice(0, 10); }

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function thaiDateToISO(thai: string): string | null {
  const m = thai.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${parseInt(m[3]) - 543}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

function fmtPct(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val || '—';
  return n.toFixed(4) + '%';
}

function PctDelta({ before, after }: { before: string; after: string }) {
  const b = parseFloat(before);
  const a = parseFloat(after);
  if (isNaN(b) || isNaN(a)) return <span className="text-white/30">—</span>;
  const delta = a - b;
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0.001 ? 'text-green-400' : delta < -0.001 ? 'text-red-400' : 'text-white/45';
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-[11px]">
      <span className="text-white/50">{b.toFixed(2)}%</span>
      <span className="text-white/20">→</span>
      <span className="text-white/80">{a.toFixed(2)}%</span>
      <span className={`${color} text-[10px]`}>({sign}{delta.toFixed(4)}%)</span>
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const isAcquire = /ได้มา/.test(method) && !/จำหน่าย/.test(method);
  const isDispose = /จำหน่าย/.test(method);
  const cls = isAcquire ? 'bg-green-500/20 text-green-400'
    : isDispose ? 'bg-red-500/20 text-red-400'
    : 'bg-white/10 text-white/45';
  const label = isAcquire ? 'ได้มา' : isDispose ? 'จำหน่าย' : method.slice(0, 10);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

const COL_TICKER = 'หลักทรัพย์';
const COL_PERSON = 'ชื่อผู้ได้มา/จำหน่าย';
const COL_METHOD = 'วิธีการ';
const COL_DATE = 'วันที่ได้มา/จำหน่าย';
const COL_BEFORE = '% ก่อนได้มา/จำหน่าย';
const COL_CHANGE = '% ได้มา/จำหน่าย';
const COL_AFTER = '% หลังได้มา/จำหน่าย';

export default function Report246Page() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fetchDate, setFetchDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState(daysAgoISO(30));
  const [toDate, setToDate] = useState(todayISO());
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const res = await fetch('/api/sec/r246');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRawRows(data.rows ?? []);
      setFetchDate(data.fetchDate ?? '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    return rawRows.filter(row => {
      const rowISO = thaiDateToISO(row[COL_DATE] ?? '');
      if (rowISO && (rowISO < fromDate || rowISO > toDate)) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const ticker = (row[COL_TICKER] ?? '').toLowerCase();
        const person = (row[COL_PERSON] ?? '').toLowerCase();
        if (!ticker.includes(q) && !person.includes(q)) return false;
      }
      return true;
    });
  }, [rawRows, fromDate, toDate, query]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Determine which columns are available in the API response
  const hasBeforeAfter = headers.includes(COL_BEFORE) && headers.includes(COL_AFTER);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">รายงาน 246</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            การได้มา/จำหน่ายหลักทรัพย์ของผู้ถือหุ้นรายใหญ่ · SEC
            {fetchDate && ` · ดึงข้อมูลเมื่อ ${isoToThaiLabel(fetchDate)}`}
          </p>
        </div>
        <button onClick={loadData} className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="ค้นหาหลักทรัพย์, ชื่อผู้ถือหุ้น..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Calendar size={12} className="text-white/30" />
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={e => { setFromDate(e.target.value); setPage(1); }}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
          />
          <span className="text-white/25 text-[11px]">ถึง</span>
          <input
            type="date"
            value={toDate}
            max={todayISO()}
            onChange={e => { setToDate(e.target.value); setPage(1); }}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #9F7AEA' }}>
        {loading ? (
          <div className="py-16 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button onClick={loadData} className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors">
              ลองอีกครั้ง
            </button>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {rawRows.length > 0 ? 'ไม่พบข้อมูลในช่วงวันที่เลือก' : 'ไม่พบข้อมูล'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">หลักทรัพย์</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">ผู้ถือหุ้น</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">วิธีการ</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">วันที่</th>
                  {hasBeforeAfter && (
                    <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">% ก่อน → หลัง</th>
                  )}
                  {headers.includes(COL_CHANGE) && (
                    <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">Δ%</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td
                      onClick={() => row[COL_TICKER] && router.push(`/stock/${row[COL_TICKER]}`)}
                      className="px-3 py-2.5 text-[12px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                    >
                      {row[COL_TICKER] ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-white/65 max-w-[200px] truncate">
                      {row[COL_PERSON] ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <MethodBadge method={row[COL_METHOD] ?? ''} />
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-white/55 whitespace-nowrap">
                      {row[COL_DATE] ?? '—'}
                    </td>
                    {hasBeforeAfter && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <PctDelta before={row[COL_BEFORE] ?? ''} after={row[COL_AFTER] ?? ''} />
                      </td>
                    )}
                    {headers.includes(COL_CHANGE) && (
                      <td className="px-3 py-2.5 text-[12px] tabular-nums text-white/55 whitespace-nowrap">
                        {fmtPct(row[COL_CHANGE] ?? '')}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: ก.ล.ต. (SEC) · Form 246{filteredRows.length > 0 ? ` · ${filteredRows.length} รายการ` : ''}
      </p>
    </div>
  );
}
