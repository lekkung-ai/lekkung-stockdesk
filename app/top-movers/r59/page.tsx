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

const COL_DATE = 'วันที่ได้มา/จำหน่าย';
const COL_METHOD = 'วิธีการได้มา/จำหน่าย';
const COL_COMPANY = 'ชื่อบริษัท';
const COL_PERSON = 'ชื่อผู้บริหาร';

export default function Report59Page() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fetchDate, setFetchDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState(daysAgoISO(7));
  const [toDate, setToDate] = useState(todayISO());
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
        const company = (row[COL_COMPANY] ?? '').toLowerCase();
        const person = (row[COL_PERSON] ?? '').toLowerCase();
        if (!company.includes(q) && !person.includes(q)) return false;
      }
      return true;
    });
  }, [rawRows, fromDate, toDate, query]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const displayHeaders = headers.filter(h => h !== COL_METHOD);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">รายงาน 59-2</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            การซื้อขายหลักทรัพย์ของผู้บริหาร · SEC
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
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">ซื้อ/ขาย</th>
                  {displayHeaders.map(h => (
                    <th key={h} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => {
                  const ticker = extractTicker(row[COL_COMPANY] ?? '');
                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <BuySellBadge action={row[COL_METHOD] ?? ''} />
                      </td>
                      {displayHeaders.map(h => {
                        const val = row[h] ?? '—';
                        const isCompany = h === COL_COMPANY;
                        return (
                          <td
                            key={h}
                            onClick={() => isCompany && ticker && router.push(`/stock/${ticker}`)}
                            className={[
                              'px-3 py-2.5 text-[12px] whitespace-nowrap',
                              isCompany && ticker
                                ? 'text-blue-400 font-semibold cursor-pointer hover:text-blue-300'
                                : 'text-white/65',
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
