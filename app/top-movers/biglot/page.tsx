'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar } from 'lucide-react';
import Pagination from '@/components/Pagination';

type Market = 'set' | 'mai';

const PER_PAGE = 20;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isTicker(val: string): boolean {
  return /^[A-Z][A-Z0-9]{1,9}$/.test(val.trim());
}

function isTickerCol(header: string): boolean {
  return /หลักทรัพย์|symbol|ticker/i.test(header);
}

export default function BigLotPage() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>('set');
  const [date, setDate] = useState(todayISO());
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const loadData = useCallback(async (m: Market, d: string) => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const isToday = d === todayISO();
      const url = isToday
        ? `/api/settrade/biglot?market=${m}`
        : `/data/history/${d}/biglot.json`;

      const res = await fetch(url, isToday ? { cache: 'no-store' } : undefined);
      if (!res.ok) {
        setError(isToday ? 'ไม่สามารถโหลดข้อมูลได้' : `ไม่มีข้อมูลวันที่ ${d}`);
        setHeaders([]); setAllRows([]);
        return;
      }
      const data = await res.json();

      let h: string[], r: Record<string, string>[];
      if (isToday) {
        h = data.headers ?? [];
        r = data.rows ?? [];
      } else {
        const mData = data[m] ?? { headers: [], rows: [] };
        h = mData.headers ?? [];
        r = mData.rows ?? [];
      }
      setHeaders(h);
      setAllRows(r);
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(market, date); }, [market, date, loadData]);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return allRows;
    const q = query.toLowerCase();
    return allRows.filter(row => Object.values(row).some(v => v.toLowerCase().includes(q)));
  }, [allRows, query]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleCell(header: string, value: string) {
    if (isTickerCol(header) && isTicker(value)) router.push(`/stock/${value.trim()}`);
  }

  const isToday = date === todayISO();

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-white">Big Lot</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            {market.toUpperCase()} · {isToday ? 'Real-time' : `ข้อมูลวันที่ ${date}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Market tabs */}
          {(['set', 'mai'] as Market[]).map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={[
                'px-4 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all border',
                market === m
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'border-white/[0.07] text-white/35 hover:text-white/60',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
          {/* Date picker */}
          <div className="relative flex items-center">
            <Calendar size={12} className="absolute left-2.5 text-white/30 pointer-events-none" />
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={e => setDate(e.target.value)}
              className="pl-7 pr-2 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-[12px] text-white/70 outline-none focus:border-white/20 transition-colors [color-scheme:dark]"
            />
          </div>
          {/* Refresh */}
          <button
            onClick={() => loadData(market, date)}
            className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="ค้นหาหลักทรัพย์..."
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #EF9F27' }}>
        {loading ? (
          <div className="py-16 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">{error}</p>
            <button
              onClick={() => loadData(market, date)}
              className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {allRows.length > 0 ? 'ไม่พบผลลัพธ์ที่ตรงกัน' : 'ไม่พบข้อมูล Big Lot'}
            </p>
            {!isToday && allRows.length === 0 && (
              <p className="text-[11px] text-white/20 mt-1">ข้อมูลย้อนหลังจะมีเมื่อรัน update_stockdesk.bat</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {headers.map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">
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
                            'px-4 py-3 text-[12px] tabular-nums whitespace-nowrap',
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

      {/* Pagination + footer */}
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      )}
      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SETTrade · {market.toUpperCase()}
        {filteredRows.length > 0 && ` · ${filteredRows.length} รายการ`}
      </p>
    </div>
  );
}
