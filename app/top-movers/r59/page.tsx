'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import Pagination from '@/components/Pagination';

const PER_PAGE = 20;

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
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const res = await fetch('/api/sec/r59');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRawRows(data.rows ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rawRows;
    const q = query.toLowerCase();
    return rawRows.filter(row => Object.values(row).some(v => v.toLowerCase().includes(q)));
  }, [rawRows, query]);

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

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="ค้นหาชื่อบริษัท, ผู้บริหาร, หลักทรัพย์..."
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
        />
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
        แหล่งข้อมูล: ก.ล.ต. (SEC) · Form 59-2{filteredRows.length > 0 ? ` · ${filteredRows.length} รายการ` : ''}
      </p>
    </div>
  );
}
