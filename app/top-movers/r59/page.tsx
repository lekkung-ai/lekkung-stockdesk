'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar } from 'lucide-react';
import Pagination from '@/components/Pagination';

const PER_PAGE = 20;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToThaiDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${String(parseInt(y) + 543)}`;
}

function thaiDateToISO(thai: string): string | null {
  const m = thai.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const year = parseInt(m[3]) - 543;
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function isTicker(val: string): boolean {
  return /^[A-Z][A-Z0-9]{1,9}$/.test(val.trim());
}

function isTickerCol(header: string): boolean {
  return /หลักทรัพย์|บริษัท|symbol|ticker/i.test(header);
}

export default function Report59Page() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const res = await fetch('/api/sec/r59');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const hdrs: string[] = data.headers ?? [];
      const rows: Record<string, string>[] = data.rows ?? [];
      setHeaders(hdrs);
      setRawRows(rows);

      // Auto-select latest date if today has no data
      const dateCol = hdrs.find(h => /วันที่/.test(h));
      if (dateCol && rows.length > 0) {
        const todayThai = isoToThaiDate(todayISO());
        const hasToday = rows.some(r => r[dateCol] === todayThai);
        if (!hasToday) {
          const isoList = [...new Set(rows.map(r => r[dateCol] ?? '').filter(Boolean))]
            .map(d => thaiDateToISO(d))
            .filter((x): x is string => x !== null)
            .sort()
            .reverse();
          if (isoList[0]) setSelectedDate(isoList[0]);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    const dateCol = headers.find(h => /วันที่/.test(h));
    const thaiDate = isoToThaiDate(selectedDate);

    return rawRows.filter(row => {
      if (dateCol) {
        const rowDate = row[dateCol] ?? '';
        if (rowDate && rowDate !== thaiDate) return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        return Object.values(row).some(v => v.toLowerCase().includes(q));
      }
      return true;
    });
  }, [rawRows, headers, query, selectedDate]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleCell(header: string, value: string) {
    if (isTickerCol(header) && isTicker(value)) router.push(`/stock/${value.trim()}`);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">รายงาน 59-2</h1>
          <p className="text-[12px] text-white/35 mt-0.5">การซื้อขายหลักทรัพย์ของผู้บริหาร · SEC</p>
        </div>
        <button
          onClick={loadData}
          className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="ค้นหาชื่อบริษัท, ผู้บริหาร, หลักทรัพย์..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
          />
        </div>
        {/* Date picker */}
        <div className="relative flex items-center flex-shrink-0">
          <Calendar size={12} className="absolute left-2.5 text-white/30 pointer-events-none" />
          <input
            type="date"
            value={selectedDate}
            max={todayISO()}
            onChange={e => { setSelectedDate(e.target.value); setPage(1); }}
            className="pl-7 pr-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 transition-colors [color-scheme:dark]"
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
            <button onClick={loadData} className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors">
              ลองอีกครั้ง
            </button>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {rawRows.length > 0 ? 'ไม่พบข้อมูลในวันที่เลือก' : 'ไม่พบข้อมูล'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {headers.map(h => (
                    <th key={h} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    {headers.map(h => {
                      const val = row[h] ?? '—';
                      const clickable = isTickerCol(h) && isTicker(val);
                      return (
                        <td
                          key={h}
                          onClick={() => handleCell(h, val)}
                          className={[
                            'px-3 py-2.5 text-[12px] whitespace-nowrap',
                            clickable ? 'text-blue-400 font-semibold cursor-pointer hover:text-blue-300' : 'text-white/65',
                          ].join(' ')}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
