'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import Pagination from '@/components/Pagination';

const PER_PAGE = 20;

function parseThaiDate(s: string): number {
  if (!s) return 0;
  const m1 = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) {
    let year = parseInt(m1[3]);
    if (year > 2400) year -= 543;
    return new Date(year, parseInt(m1[2]) - 1, parseInt(m1[1])).getTime();
  }
  const m2 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    let year = parseInt(m2[1]);
    if (year > 2400) year -= 543;
    return new Date(year, parseInt(m2[2]) - 1, parseInt(m2[3])).getTime();
  }
  return 0;
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isTicker(val: string): boolean {
  return /^[A-Z][A-Z0-9]{1,9}$/.test(val.trim());
}

function isTickerCol(header: string): boolean {
  return /หลักทรัพย์|symbol|ticker/i.test(header);
}

export default function Report246Page() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState(daysAgoISO(7));
  const [dateTo, setDateTo] = useState(todayISO());
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const res = await fetch('/api/sec/r246');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const hdrs: string[] = data.headers ?? [];
      let rows: Record<string, string>[] = data.rows ?? [];
      const dateCol = hdrs.find(h => /วันที่/.test(h));
      if (dateCol) {
        rows = [...rows].sort((a, b) => parseThaiDate(b[dateCol] ?? '') - parseThaiDate(a[dateCol] ?? ''));
      }
      setHeaders(hdrs);
      setRawRows(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    const dateCol = headers.find(h => /วันที่/.test(h));
    const from = new Date(dateFrom).getTime();
    const to = new Date(dateTo + 'T23:59:59').getTime();

    return rawRows.filter(row => {
      if (dateCol) {
        const ts = parseThaiDate(row[dateCol] ?? '');
        if (ts && (ts < from || ts > to)) return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        return Object.values(row).some(v => v.toLowerCase().includes(q));
      }
      return true;
    });
  }, [rawRows, headers, query, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleCell(header: string, value: string) {
    if (isTickerCol(header) && isTicker(value)) router.push(`/stock/${value.trim()}`);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">รายงาน 246</h1>
          <p className="text-[12px] text-white/35 mt-0.5">การได้มา/จำหน่ายหลักทรัพย์ของผู้ถือหุ้นรายใหญ่ · SEC</p>
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
            placeholder="ค้นหาหลักทรัพย์, ชื่อผู้ถือหุ้น..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
          />
        </div>
        {/* Date range */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-white/30">จาก</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 transition-colors [color-scheme:dark]"
          />
          <span className="text-[11px] text-white/30">ถึง</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={todayISO()}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 transition-colors [color-scheme:dark]"
          />
          <button
            onClick={() => { setDateFrom(daysAgoISO(7)); setDateTo(todayISO()); setPage(1); }}
            className="px-2.5 py-2 text-[11px] rounded-xl border border-white/[0.07] text-white/40 hover:text-white/70 transition-colors whitespace-nowrap"
          >
            7 วัน
          </button>
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
              {rawRows.length > 0 ? 'ไม่พบผลลัพธ์ที่ตรงกัน' : 'ไม่พบข้อมูล'}
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
        แหล่งข้อมูล: ก.ล.ต. (SEC) · Form 246{filteredRows.length > 0 ? ` · ${filteredRows.length} รายการ` : ''}
      </p>
    </div>
  );
}
