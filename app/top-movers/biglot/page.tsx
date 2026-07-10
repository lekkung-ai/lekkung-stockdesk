'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, ChevronDown } from 'lucide-react';
import Pagination from '@/components/Pagination';
import TableSkeleton from '@/components/TableSkeleton';

interface BigLotRow {
  symbol: string;
  transactions: number;
  volume: number;
  value: number;
  avgPrice: number;
}

interface HistoricalChartPoint {
  date: string;
  volume: number;
  row?: BigLotRow;
}

interface BigLotData {
  date: string;
  publishedAt: string;
  source: string;
  rows: BigLotRow[];
  availableDates?: string[]; // from API
}

const PER_PAGE = 20;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function isoToThaiLabel(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
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
  const [allDates, setAllDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [historicalChartData, setHistoricalChartData] = useState<HistoricalChartPoint[] | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  // Load all available historical dates from index.json
  useEffect(() => {
    fetch('/data/history/index.json', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : [])
      .then(dates => {
        if (Array.isArray(dates)) {
          // Sort dates descending
          setAllDates(dates.sort().reverse());
        }
      })
      .catch(() => {}); // ignore error if index.json doesn't exist yet
  }, []);

  const loadData = useCallback(async (date?: string) => {
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      let json: BigLotData;
      if (date) {
        // Fetch specific historical date
        const res = await fetch(`/data/history/${date}/biglot.json`, { cache: 'no-store' });
        if (res.ok) {
          json = await res.json();
          // Handle OLD JSON format
          const legacyJson = json as any;
          if (!json.rows && (legacyJson.set || legacyJson.mai)) {
            const legacyRows: BigLotRow[] = [];
            const processMarket = (m: any) => {
              if (m && Array.isArray(m.rows)) {
                m.rows.forEach((r: any) => {
                  const vals = Object.values(r) as string[];
                  if (vals.length >= 4) {
                    const volStr = String(vals[1] || '0').replace(/,/g, '');
                    legacyRows.push({
                      symbol: vals[0] || '',
                      transactions: 1,
                      volume: parseInt(volStr, 10) * 1000,
                      value: parseFloat(String(vals[2] || '0').replace(/,/g, '')),
                      avgPrice: parseFloat(String(vals[3] || '0').replace(/,/g, ''))
                    });
                  }
                });
              }
            };
            processMarket(legacyJson.set);
            processMarket(legacyJson.mai);
            json.rows = legacyRows;
            json.source = 'Settrade (Archive)';
          }
        } else {
          // fallback to API if historical JSON not found
          const apiRes = await fetch(`/api/settrade/biglot?date=${date}`, { cache: 'no-store' });
          if (!apiRes.ok) throw new Error();
          json = await apiRes.json();
        }
      } else {
        // Fetch latest live data
        const apiRes = await fetch('/api/settrade/biglot', { cache: 'no-store' });
        if (!apiRes.ok) throw new Error();
        json = await apiRes.json();
      }
      
      setData(json);
      if (!date && json.date) {
        setSelectedDate(json.date);
      }
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

  // Merge available dates from API and Historical Index
  const mergedDates = useMemo(() => {
    const s = new Set<string>();
    if (data?.availableDates) data.availableDates.forEach(d => s.add(d));
    allDates.forEach(d => s.add(d));
    if (data?.date) s.add(data.date);
    return Array.from(s).sort().reverse();
  }, [data, allDates]);

  const exactMatchSymbol = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length > 0 && /^[A-Z0-9\-\.&]+$/.test(q)) return q;
    return null;
  }, [query]);

  useEffect(() => {
    if (!exactMatchSymbol) {
      setHistoricalChartData(null);
      return;
    }
    
    let isMounted = true;
    const fetchHistory = async () => {
      setChartLoading(true);
      try {
        const recentDates = mergedDates.slice(0, 15);
        if (recentDates.length === 0) return;
        
        const promises = recentDates.map(async (d) => {
          let vol = 0;
          let rowData: BigLotRow | undefined;
          
          if (data && data.date === d) {
            const row = data.rows.find(r => r.symbol.toUpperCase() === exactMatchSymbol);
            if (row) {
              vol = row.volume;
              rowData = row;
            }
            return { date: d, volume: vol, row: rowData };
          }
          
          try {
            const res = await fetch(`/data/history/${d}/biglot.json`, { cache: 'no-store' });
            if (!res.ok) return { date: d, volume: 0 };
            const json = await res.json();
            
            if (json.rows && Array.isArray(json.rows)) {
              const row = json.rows.find((r: any) => r.symbol.toUpperCase() === exactMatchSymbol);
              if (row) {
                vol = row.volume;
                rowData = row;
              }
            } else {
              const checkMarket = (m: any) => {
                if (m && Array.isArray(m.rows)) {
                  const r = m.rows.find((x: any) => {
                    const vals = Object.values(x) as string[];
                    return vals[0] && vals[0].toUpperCase() === exactMatchSymbol;
                  });
                  if (r) {
                    const vals = Object.values(r) as string[];
                    const volStr = String(vals[1] || '0').replace(/,/g, '');
                    vol = parseInt(volStr, 10) * 1000;
                    rowData = {
                      symbol: vals[0] || '',
                      transactions: 1,
                      volume: vol,
                      value: parseFloat(String(vals[2] || '0').replace(/,/g, '')),
                      avgPrice: parseFloat(String(vals[3] || '0').replace(/,/g, ''))
                    };
                  }
                }
              };
              checkMarket(json.set);
              if (vol === 0) checkMarket(json.mai);
            }
            return { date: d, volume: vol, row: rowData };
          } catch {
            return { date: d, volume: 0 };
          }
        });
        
        const results = await Promise.all(promises);
        if (!isMounted) return;
        
        results.reverse(); // Chronological order
        setHistoricalChartData(results);
      } catch (err) {
        console.error('Failed to fetch historical big lot for chart', err);
      } finally {
        if (isMounted) setChartLoading(false);
      }
    };
    
    const t = setTimeout(fetchHistory, 300);
    return () => { isMounted = false; clearTimeout(t); };
  }, [exactMatchSymbol, mergedDates, data]);

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
            <p className="text-[12px] text-white/35 mt-0.5">รายการซื้อขายบิ๊กล็อตสรุปประจำวัน</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Picker */}
          <div className="relative flex items-center">
            <input
              type="date"
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
              onClick={e => {
                try {
                  if (typeof e.currentTarget.showPicker === 'function') {
                    e.currentTarget.showPicker();
                  }
                } catch (err) {}
              }}
              className="px-3 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-[12px] text-white/70 outline-none focus:border-white/20 transition-colors cursor-pointer dark:[color-scheme:dark] w-[130px]"
            />
          </div>
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

      {/* Historical Chart */}
      {exactMatchSymbol && (chartLoading || historicalChartData) && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold text-white">ปริมาณซื้อขาย Big Lot ย้อนหลัง 15 วัน</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">{exactMatchSymbol}</span>
            {chartLoading && <span className="text-[11px] text-white/30 ml-auto animate-pulse">กำลังโหลดข้อมูล...</span>}
          </div>
          
          {!chartLoading && historicalChartData && (
            <div className="space-y-4">
              {(() => {
                const totalVol = historicalChartData.reduce((sum, d) => sum + d.volume, 0);
                const activeDays = historicalChartData.filter(d => d.volume > 0).length;
                const avgVol = totalVol / (historicalChartData.length || 1);
                const maxVol = Math.max(...historicalChartData.map(d => d.volume), 1);
                
                return (
                  <>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-[11px] text-white/40">ปริมาณรวม (15 วัน)</p>
                        <p className="text-[15px] font-semibold text-white/90 tabular-nums">{fmtNum(totalVol)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/40">เฉลี่ยต่อวัน (15 วัน)</p>
                        <p className="text-[15px] font-semibold text-white/70 tabular-nums">{fmtNum(avgVol)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/40">จำนวนครั้ง (วัน)</p>
                        <p className="text-[15px] font-semibold text-white/70 tabular-nums">{activeDays}</p>
                      </div>
                    </div>
                    
                    <div className="relative h-[200px] w-full flex items-end justify-between gap-1 pt-4 border-b border-white/10">
                      {/* Average Line */}
                      {totalVol > 0 && (
                        <div 
                          className="absolute left-0 right-0 border-t border-dashed border-blue-400/30 z-0 pointer-events-none"
                          style={{ bottom: `${Math.pow(avgVol / maxVol, 0.33) * 100}%` }}
                        >
                          <span className="absolute right-0 -top-4 text-[9px] text-blue-400/50">Avg</span>
                        </div>
                      )}
                      
                      {/* Bars */}
                      {historicalChartData.map((d, i) => (
                        <div key={i} className="relative flex-1 flex flex-col justify-end items-center h-full group z-10">
                          {/* Tooltip */}
                          <div className="absolute -top-8 bg-black/80 border border-white/10 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                            <div className="font-semibold text-blue-300">{isoToThaiLabel(d.date)}</div>
                            <div className="text-white/80 tabular-nums">{fmtNum(d.volume)} หุ้น</div>
                          </div>
                          
                          <div 
                            className={`w-full max-w-[24px] rounded-t-sm transition-all duration-300 ${d.volume > 0 ? 'bg-blue-500/60 group-hover:bg-blue-400/80' : 'bg-transparent'}`}
                            style={{ height: d.volume > 0 ? `${Math.max(Math.pow(d.volume / maxVol, 0.33) * 100, 3)}%` : '0%' }}
                          />
                          
                          {/* X-Axis Label */}
                          <span className="absolute -bottom-5 text-[8px] text-white/20 whitespace-nowrap rotate-45 origin-left">
                            {d.date.slice(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="h-4" />
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #EF9F27' }}>
        {(() => {
          if (exactMatchSymbol) {
             const activeDays = (historicalChartData || []).filter(d => d.volume > 0);
             if (chartLoading) return <div className="py-16 text-center text-[12px] text-white/25 animate-pulse">กำลังโหลดข้อมูลย้อนหลัง...</div>;
             if (activeDays.length === 0) return <div className="py-16 text-center text-[13px] text-white/30">ไม่พบข้อมูล Big Lot ในช่วง 15 วันล่าสุด</div>;
             
             return (
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead>
                     <tr className="border-b border-white/[0.06]">
                       {['วันที่', 'หลักทรัพย์', 'รายการ', 'จำนวนหุ้น', 'มูลค่า (ลบ.)', 'ราคาเฉลี่ย (บ.)'].map((h, i) => (
                         <th key={h} className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap ${i === 0 ? 'sticky left-0 z-10 bg-[#13161e]' : ''} ${i > 1 ? 'text-right' : 'text-left'}`}>
                           {h}
                         </th>
                       ))}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/[0.03]">
                     {[...activeDays].reverse().map((d, i) => (
                       <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                         <td className="sticky left-0 z-10 bg-[#13161e] px-4 py-3 text-[13px] font-semibold text-white/70 whitespace-nowrap">
                           {isoToThaiLabel(d.date)}
                         </td>
                         <td
                           onClick={() => router.push(`/stock/${d.row?.symbol || exactMatchSymbol}`)}
                           className="px-4 py-3 text-[13px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                         >
                           {d.row?.symbol || exactMatchSymbol}
                         </td>
                         <td className="px-4 py-3 text-[13px] tabular-nums text-white/50 whitespace-nowrap text-right">
                           {fmtNum(d.row?.transactions || 1)}
                         </td>
                         <td className="px-4 py-3 text-[13px] tabular-nums text-white/65 whitespace-nowrap text-right">
                           {fmtNum(d.volume)}
                         </td>
                         <td className="px-4 py-3 text-[13px] tabular-nums text-white/65 whitespace-nowrap text-right">
                           {d.row?.value != null ? fmtNum(d.row.value, 2) : '-'}
                         </td>
                         <td className="px-4 py-3 text-[13px] tabular-nums text-white/65 whitespace-nowrap text-right">
                           {d.row?.avgPrice != null ? fmtNum(d.row.avgPrice, 2) : '-'}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             );
          }
          
          return loading ? (
            <TableSkeleton rows={10} />
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
                {data && data.rows?.length > 0 ? 'ไม่พบผลลัพธ์ที่ตรงกัน' : 'ไม่พบข้อมูล Big Lot'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['หลักทรัพย์', 'รายการ', 'จำนวนหุ้น', 'มูลค่า (ลบ.)', 'ราคาเฉลี่ย (บ.)'].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap ${i === 0 ? 'sticky left-0 z-10 bg-[#13161e]' : ''} ${i > 0 ? 'text-right' : 'text-left'}`}>
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
                        className="sticky left-0 z-10 bg-[#13161e] px-4 py-3 text-[13px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                      >
                        {row.symbol}
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-white/50 whitespace-nowrap text-right">
                        {fmtNum(row.transactions)}
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-white/65 whitespace-nowrap text-right">
                        {fmtNum(row.volume)}
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-white/65 whitespace-nowrap text-right">
                        {fmtNum(row.value, 2)}
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-white/65 whitespace-nowrap text-right">
                        {fmtNum(row.avgPrice, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: InfoQuest/RYT9 · รวมทุกตลาด (SET+MAI+DW)
        {filteredRows.length > 0 && ` · ${filteredRows.length} รายการ`}
      </p>
    </div>
  );
}
