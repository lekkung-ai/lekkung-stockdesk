'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, ChevronDown } from 'lucide-react';
import Pagination from '@/components/Pagination';

interface BigLotRow {
  symbol: string;
  volume: number;
  value: number;
  avgPrice: number;
  time: string;
}

interface BigLotData {
  date: string;
  publishedAt: string;
  source: string;
  rows: BigLotRow[];
  availableDates: string[];
}

const PER_PAGE = 20;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

function pubDateToTime(pubDate: string): string {
  const d = new Date(pubDate);
  const bk = new Date(d.getTime() + 7 * 3600000);
  return `${String(bk.getUTCHours()).padStart(2, '0')}:${String(bk.getUTCMinutes()).padStart(2, '0')}`;
}

function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function BigLotPage() {
  const router = useRouter();
  const [data, setData] = useState<BigLotData | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const loadData = useCallback(async (date?: string) => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const url = date ? `/api/settrade/biglot?date=${date}` : '/api/settrade/biglot';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json: BigLotData = await res.json();
      setData(json);
      if (!date) setSelectedDate(json.date);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function handleDateChange(d: string) {
    setSelectedDate(d);
    loadData(d);
  }

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.rows;
    const q = query.toLowerCase();
    return data.rows.filter(r => r.symbol.toLowerCase().includes(q));
  }, [data, query]);

  const totalPages = Math.ceil(filteredRows.length / PER_PAGE);
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-white">Big Lot</h1>
          {data?.publishedAt ? (
            <p className="text-[12px] text-white/35 mt-0.5">
              ข้อมูล ณ {isoToThaiLabel(data.date)} เวลา {pubDateToTime(data.publishedAt)} น. · {data.source}
            </p>
          ) : (
            <p className="text-[12px] text-white/35 mt-0.5">รายการซื้อขายบิ๊กล็อต</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date select */}
          {data && data.availableDates.length > 0 && (
            <div className="relative flex items-center">
              <select
                value={selectedDate}
                onChange={e => handleDateChange(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-[12px] text-white/70 outline-none focus:border-white/20 transition-colors cursor-pointer"
              >
                {data.availableDates.map(d => (
                  <option key={d} value={d}>{isoToThaiLabel(d)}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 text-white/30 pointer-events-none" />
            </div>
          )}
          <button
            onClick={() => loadData(selectedDate || undefined)}
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
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button
              onClick={() => loadData()}
              className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {data && data.rows.length > 0 ? 'ไม่พบผลลัพธ์ที่ตรงกัน' : 'ไม่พบข้อมูล Big Lot'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['หลักทรัพย์', "จำนวนหุ้น", 'มูลค่า (ลบ.)', 'ราคาเฉลี่ย (บ.)', 'เวลา'].map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td
                      onClick={() => router.push(`/stock/${row.symbol}`)}
                      className="px-4 py-3 text-[12px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                    >
                      {row.symbol}
                    </td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-white/65 whitespace-nowrap text-right">
                      {fmtNum(row.volume)}
                    </td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-white/65 whitespace-nowrap text-right">
                      {fmtNum(row.value, 2)}
                    </td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-white/65 whitespace-nowrap text-right">
                      {fmtNum(row.avgPrice, 2)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-white/40 whitespace-nowrap">
                      {row.time}
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
        แหล่งข้อมูล: InfoQuest/RYT9 · รวมทุกตลาด (SET+MAI+DW)
        {filteredRows.length > 0 && ` · ${filteredRows.length} รายการ`}
      </p>
    </div>
  );
}
