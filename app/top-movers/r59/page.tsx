'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar, ArrowDown, ArrowUp } from 'lucide-react';
import Pagination from '@/components/Pagination';
import TableSkeleton from '@/components/TableSkeleton';

const PER_PAGE = 20;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function todayISO() { return new Date().toISOString().slice(0, 10); }

function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

function extractTicker(companyName: string): string | null {
  const m = companyName.match(/\(([A-Z][A-Z0-9]{0,9})\)\s*$/);
  return m ? m[1] : null;
}

function BuySellBadge({ action }: { action: string }) {
  const isBuy = /ซื้อ/.test(action);
  const isSell = /ขาย/.test(action);
  const cls = isBuy ? 'bg-green-500/20 text-green-400'
    : isSell ? 'bg-red-500/20 text-red-400'
    : 'bg-white/10 text-white/45';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>
      {action}
    </span>
  );
}

const COL_METHOD = 'วิธีการได้มา/จำหน่าย';
const COL_COMPANY = 'ชื่อบริษัท';
const COL_PERSON = 'ชื่อผู้บริหาร';

export default function Report59Page() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fetchDate, setFetchDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDesc(!sortDesc);
    else { setSortCol(col); setSortDesc(true); }
    setPage(1);
  };

  const loadData = useCallback(async (from: string, to: string, background = false) => {
    if (background) setRefreshing(true);
    else { setLoading(true); setPage(1); }
    setError(false);
    try {
      const res = await fetch(`/api/sec/r59?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRawRows(data.rows ?? []);
      setFetchDate(data.fetchDate ?? '');
    } catch {
      if (!background) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Default (today) view: paint the static JSON snapshot instantly, then refresh
  // live in the background. Custom date ranges fetch live directly (with spinner).
  useEffect(() => {
    let cancelled = false;
    const today = todayISO();
    const isDefault = fromDate === today && toDate === today;
    if (!isDefault) { loadData(fromDate, toDate); return; }

    (async () => {
      let painted = false;
      try {
        const jr = await fetch('/data/sec/r59.json', { cache: 'no-store' });
        if (jr.ok) {
          const j = await jr.json();
          if (!cancelled && j?.date === today && Array.isArray(j.rows)) {
            setHeaders(j.headers ?? []);
            setRawRows(j.rows ?? []);
            setFetchDate(j.fetchDate ?? j.date ?? '');
            setLoading(false);
            painted = true;
          }
        }
      } catch { /* fall through to live */ }
      if (!cancelled) loadData(today, today, painted);
    })();

    return () => { cancelled = true; };
  }, [loadData, fromDate, toDate]);

  const filteredRows = useMemo(() => {
    // Date range is applied server-side; here we only do text search + sort.
    const result = rawRows.filter(row => {
      if (query.trim()) {
        const q = query.toLowerCase();
        const company = (row[COL_COMPANY] ?? '').toLowerCase();
        const person = (row[COL_PERSON] ?? '').toLowerCase();
        if (!company.includes(q) && !person.includes(q)) return false;
      }
      return true;
    });

    if (sortCol) {
      result.sort((a, b) => {
        const va = a[sortCol] ?? '';
        const vb = b[sortCol] ?? '';
        const numA = parseFloat(va.replace(/,/g, ''));
        const numB = parseFloat(vb.replace(/,/g, ''));
        const isNumA = !isNaN(numA) && /^[\d.,-]+$/.test(va);
        const isNumB = !isNaN(numB) && /^[\d.,-]+$/.test(vb);
        if (isNumA && isNumB) {
          return sortDesc ? numB - numA : numA - numB;
        }
        return sortDesc ? vb.localeCompare(va, 'th') : va.localeCompare(vb, 'th');
      });
    }
    return result;
  }, [rawRows, query, sortCol, sortDesc]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Company is rendered as its own sticky first column (see table below) so it
  // stays visible while scrolling the rest horizontally on narrow screens.
  const displayHeaders = headers.filter(h => h !== COL_METHOD && h !== COL_COMPANY);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">รายงาน 59-2</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            การซื้อขายหลักทรัพย์ของผู้บริหาร · SEC · กรองตามวันที่ สนง.รับเอกสาร
            {fetchDate && ` · ดึงข้อมูลเมื่อ ${isoToThaiLabel(fetchDate)}`}
            {refreshing && ' · กำลังอัปเดต…'}
          </p>
        </div>
        <button onClick={() => loadData(fromDate, toDate)} className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0">
          <RefreshCw size={13} className={loading || refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="ค้นหาชื่อบริษัท, ผู้บริหาร..."
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

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #4B9EF5' }}>
        {loading ? (
          <TableSkeleton rows={10} />
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button onClick={() => loadData(fromDate, toDate)} className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors">
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
                  <th
                    onClick={() => handleSort(COL_COMPANY)}
                    className="sticky left-0 z-10 bg-[#13161e] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap cursor-pointer hover:text-white/40 select-none group"
                  >
                    <div className="flex items-center gap-1">
                      {COL_COMPANY}
                      <div className="flex flex-col opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100 transition-opacity" data-active={sortCol === COL_COMPANY}>
                        {sortCol === COL_COMPANY ? (
                          sortDesc ? <ArrowDown size={10} className="text-white/50" /> : <ArrowUp size={10} className="text-white/50" />
                        ) : (
                          <ArrowDown size={10} className="text-white/20" />
                        )}
                      </div>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort(COL_METHOD)}
                    className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap cursor-pointer hover:text-white/40 select-none group"
                  >
                    <div className="flex items-center gap-1">
                      ซื้อ/ขาย
                      <div className="flex flex-col opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100 transition-opacity" data-active={sortCol === COL_METHOD}>
                        {sortCol === COL_METHOD ? (
                          sortDesc ? <ArrowDown size={10} className="text-white/50" /> : <ArrowUp size={10} className="text-white/50" />
                        ) : (
                          <ArrowDown size={10} className="text-white/20" />
                        )}
                      </div>
                    </div>
                  </th>
                  {displayHeaders.map(h => (
                    <th 
                      key={h} 
                      onClick={() => handleSort(h)}
                      className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap cursor-pointer hover:text-white/40 select-none group"
                    >
                      <div className="flex items-center gap-1">
                        {h}
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100 transition-opacity" data-active={sortCol === h}>
                          {sortCol === h ? (
                            sortDesc ? <ArrowDown size={10} className="text-white/50" /> : <ArrowUp size={10} className="text-white/50" />
                          ) : (
                            <ArrowDown size={10} className="text-white/20" />
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => {
                  const ticker = extractTicker(row[COL_COMPANY] ?? '');
                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td
                        onClick={() => ticker && router.push(`/stock/${ticker}`)}
                        className={[
                          'sticky left-0 z-10 bg-[#13161e] px-3 py-2.5 text-[13px] align-top whitespace-normal min-w-[150px] max-w-[250px] leading-relaxed',
                          ticker ? 'text-blue-400 font-semibold cursor-pointer hover:text-blue-300' : 'text-white/65',
                        ].join(' ')}
                      >
                        {row[COL_COMPANY] ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <BuySellBadge action={row[COL_METHOD] ?? ''} />
                      </td>
                      {displayHeaders.map(h => {
                        const val = row[h] ?? '—';
                        const shouldWrap = ['ประเภทหลักทรัพย์', 'ความสัมพันธ์', 'ชื่อผู้บริหาร'].some(kw => h.includes(kw));
                        return (
                          <td
                            key={h}
                            className={[
                              'px-3 py-2.5 text-[13px] align-top text-white/65',
                              shouldWrap ? 'whitespace-normal min-w-[150px] max-w-[250px] leading-relaxed' : 'whitespace-nowrap',
                            ].join(' ')}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: ก.ล.ต. (SEC) · Form 59-2{filteredRows.length > 0 ? ` · ${filteredRows.length} รายการ` : ''}
      </p>
    </div>
  );
}
