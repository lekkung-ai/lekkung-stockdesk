'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Calendar, ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import Pagination from '@/components/Pagination';
import TableSkeleton from '@/components/TableSkeleton';

const PER_PAGE = 20;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function todayISO() { return new Date().toISOString().slice(0, 10); }

function shiftDay(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return dt.toISOString().slice(0, 10);
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

function RetroactiveBadge() {
  return (
    <span
      title="เผยแพร่ห่างจากวันทำรายการเกิน 2 วันทำการ"
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25 ml-1.5"
    >
      ประกาศย้อนหลัง
    </span>
  );
}

const COL_TICKER = 'หลักทรัพย์';
const COL_PERSON = 'ชื่อผู้ได้มา/จำหน่าย';
const COL_METHOD = 'วิธีการ';
const COL_PUBLISH = 'วันที่เผยแพร่'; // primary sort - the field actually queried by
const COL_DATE = 'วันที่ได้มา/จำหน่าย'; // transaction date - secondary, distinct field
const COL_BEFORE = '% ก่อนได้มา/จำหน่าย';
// SEC ตั้งชื่อ <th> คอลัมน์นี้ไม่มีเว้นวรรคหลัง % (ต่างจาก ก่อน/หลัง ที่มีเว้นวรรค)
// ต้อง match ตรงตาม HTML ต้นทาง — อย่าเติมเว้นวรรคให้ "สวย" ไม่งั้นคอลัมน์ Δ% หายทั้งคอลัมน์
const COL_CHANGE = '%ได้มา/จำหน่าย';
const COL_AFTER = '% หลังได้มา/จำหน่าย';
// คอลัมน์ "(กลุ่ม)" = สัดส่วนที่ถือรวมทั้งกลุ่ม (concert party) ต่างจากตัวเดี่ยว 15.4% ของแถว
// เคสสำคัญ: ผู้ยื่นถือ 0% เอง แต่กลุ่มถือ 55-82% (เช่น TRUE/FPT) — ตัวเดี่ยวอย่างเดียวทำให้เข้าใจผิด
// key ก่อน/หลัง มีเว้นวรรคหลัง % (ตาม HTML ต้นทาง SEC) — อย่าแก้
const COL_BEFORE_G = '% ก่อนได้มา/จำหน่าย (กลุ่ม)';
const COL_AFTER_G = '% หลังได้มา/จำหน่าย (กลุ่ม)';

export default function Report246Page() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fetchDate, setFetchDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKind, setErrorKind] = useState<'' | 'load' | 'timeout'>('');
  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState(COL_PUBLISH);
  const [sortDesc, setSortDesc] = useState(true);
  const [rangeDays, setRangeDays] = useState(0); // 0 = วันเดียว (โหมดเดิม) · 7/14/30 = ค้นย้อนหลัง
  const [truncated, setTruncated] = useState(false); // API ตัดช่วงเหลือ 45 วัน
  const [partial, setPartial] = useState(false); // บางวัน scrape ไม่สำเร็จ
  const isRange = rangeDays > 0;

  const prevDay = () => {
    setSelectedDate(shiftDay(selectedDate, -1));
    setPage(1);
  };
  const nextDay = () => {
    const nx = shiftDay(selectedDate, 1);
    if (nx <= todayISO()) {
      setSelectedDate(nx);
      setPage(1);
    }
  };

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDesc(!sortDesc);
    else { setSortCol(col); setSortDesc(true); }
    setPage(1);
  };

  const loadData = useCallback(async (date: string, days: number, background = false) => {
    if (background) setRefreshing(true);
    else { setLoading(true); setPage(1); }
    setErrorKind('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const url = days > 0
        ? `/api/sec/r246?from=${shiftDay(date, -(days - 1))}&to=${date}`
        : `/api/sec/r246?date=${date}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRawRows(data.rows ?? []);
      setFetchDate(data.fetchDate ?? '');
      setTruncated(data.truncated === true);
      setPartial(data.partial === true);
    } catch (err) {
      if (!background) setErrorKind((err as Error)?.name === 'AbortError' ? 'timeout' : 'load');
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedDate, rangeDays);
  }, [loadData, selectedDate, rangeDays]);

  const filteredRows = useMemo(() => {
    // Date range is applied server-side; here we only do text search + sort.
    const result = rawRows.filter(row => {
      if (query.trim()) {
        const q = query.toLowerCase();
        const ticker = (row[COL_TICKER] ?? '').toLowerCase();
        const person = (row[COL_PERSON] ?? '').toLowerCase();
        if (!ticker.includes(q) && !person.includes(q)) return false;
      }
      return true;
    });

    if (sortCol) {
      // Publish/transaction date columns show a Thai BE "DD/MM/YYYY" label,
      // which does not sort correctly as a plain string - use the ISO dates
      // the API already computed for these two columns instead.
      const isoKey = sortCol === COL_PUBLISH ? '__publishISO' : sortCol === COL_DATE ? '__txISO' : null;
      result.sort((a, b) => {
        if (isoKey) {
          const va = a[isoKey] ?? '';
          const vb = b[isoKey] ?? '';
          return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
        }
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

  // Determine which columns are available in the API response
  const hasBeforeAfter = headers.includes(COL_BEFORE) && headers.includes(COL_AFTER);
  const hasGroup = headers.includes(COL_BEFORE_G) && headers.includes(COL_AFTER_G);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">รายงาน 246</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            การได้มา/จำหน่ายหลักทรัพย์ของผู้ถือหุ้นรายใหญ่ · SEC · กรองตามวันที่เผยแพร่
            {fetchDate && ` · ดึงข้อมูลเมื่อ ${isoToThaiLabel(fetchDate)}`}
            {refreshing && ' · กำลังอัปเดต…'}
          </p>
        </div>
        <button onClick={() => loadData(selectedDate, rangeDays)} className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0">
          <RefreshCw size={13} className={loading || refreshing ? 'animate-spin' : ''} />
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
          {!isRange && (
            <button
              type="button"
              onClick={prevDay}
              className="p-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-white/50 hover:text-white/80 hover:border-white/20 transition-colors"
              title="วันก่อนหน้า"
            >
              <ChevronLeft size={14} />
            </button>
          )}
          <div className="relative flex items-center">
            <Calendar size={12} className="absolute left-2.5 text-white/30 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              max={todayISO()}
              onChange={e => { setSelectedDate(e.target.value); setPage(1); }}
              className="pl-7 pr-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
            />
          </div>
          {!isRange && (
            <button
              type="button"
              onClick={nextDay}
              disabled={selectedDate >= todayISO()}
              className="p-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-white/50 hover:text-white/80 hover:border-white/20 disabled:opacity-30 disabled:hover:text-white/50 disabled:hover:border-white/[0.07] transition-colors"
              title="วันถัดไป"
            >
              <ChevronRight size={14} />
            </button>
          )}
          <select
            value={rangeDays}
            onChange={e => { setRangeDays(Number(e.target.value)); setPage(1); }}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark] cursor-pointer"
            title="ช่วงย้อนหลัง"
          >
            <option value={0}>วันเดียว</option>
            <option value={7}>ย้อนหลัง 7 วัน</option>
            <option value={14}>ย้อนหลัง 14 วัน</option>
            <option value={30}>ย้อนหลัง 30 วัน</option>
          </select>
          {isRange ? (
            <span className="text-[12px] text-white/60 font-medium px-1 whitespace-nowrap">
              {isoToThaiLabel(shiftDay(selectedDate, -(rangeDays - 1)))} – {selectedDate === todayISO() ? 'วันนี้' : isoToThaiLabel(selectedDate)}
            </span>
          ) : (
            <>
              <span className="text-[12px] text-white/60 font-medium px-1">
                {selectedDate === todayISO() ? 'วันนี้' : isoToThaiLabel(selectedDate)}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                  selectedDate === todayISO()
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}
              >
                {selectedDate === todayISO() ? '● Live' : 'Static'}
              </span>
            </>
          )}
        </div>
      </div>

      {(truncated || partial) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {truncated && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/25">
              ⚠ ช่วงเกิน 45 วัน — แสดงเฉพาะ 45 วันล่าสุด
            </span>
          )}
          {partial && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/25">
              ⚠ บางวันดึงข้อมูลไม่สำเร็จ — ผลอาจไม่ครบ
            </span>
          )}
        </div>
      )}

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #9F7AEA' }}>
        {loading ? (
          <TableSkeleton rows={10} />
        ) : errorKind ? (
          <div className="py-16 text-center space-y-3">
            {errorKind === 'timeout' ? (
              <p className="text-[13px] text-rose-400/80">ช่วงที่เลือกกว้างเกินไป โหลดไม่ทัน — ลองเลือกช่วงสั้นลง</p>
            ) : (
              <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            )}
            <button onClick={() => loadData(selectedDate, rangeDays)} className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors">
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
                  {[COL_TICKER, COL_PERSON, COL_METHOD, COL_PUBLISH, COL_DATE].map(h => (
                    <th
                      key={h}
                      onClick={() => handleSort(h)}
                      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap cursor-pointer hover:text-white/40 select-none group ${h === COL_TICKER ? 'sticky left-0 z-10 bg-[#13161e]' : ''}`}
                    >
                      <div className="flex items-center gap-1">
                        {h === COL_TICKER ? 'หลักทรัพย์' : h === COL_PERSON ? 'ผู้ถือหุ้น' : h === COL_METHOD ? 'วิธีการ' : h === COL_PUBLISH ? 'วันที่เผยแพร่' : 'วันที่ทำรายการ'}
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
                  {hasBeforeAfter && (
                    <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">% ก่อน → หลัง</th>
                  )}
                  {hasGroup && (
                    <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">% ก่อน → หลัง (กลุ่ม)</th>
                  )}
                  {headers.includes(COL_CHANGE) && (
                    <th 
                      onClick={() => handleSort(COL_CHANGE)}
                      className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap cursor-pointer hover:text-white/40 select-none group"
                    >
                      <div className="flex items-center gap-1">
                        Δ%
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100 transition-opacity" data-active={sortCol === COL_CHANGE}>
                          {sortCol === COL_CHANGE ? (
                            sortDesc ? <ArrowDown size={10} className="text-white/50" /> : <ArrowUp size={10} className="text-white/50" />
                          ) : (
                            <ArrowDown size={10} className="text-white/20" />
                          )}
                        </div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
            <tbody className="divide-y divide-white/[0.03]">
                {pageRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td
                      onClick={() => row[COL_TICKER] && router.push(`/stock/${row[COL_TICKER]}`)}
                      className="sticky left-0 z-10 bg-[#13161e] px-3 py-2.5 text-[13px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                    >
                      {row[COL_TICKER] ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-white/65 whitespace-normal max-w-[250px] leading-relaxed align-top">
                      {row[COL_PERSON] ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <MethodBadge method={row[COL_METHOD] ?? ''} />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-white/55 whitespace-nowrap">
                      <span className="inline-flex items-center">
                        {row[COL_PUBLISH] ?? '—'}
                        {row['__retroactive'] === '1' && <RetroactiveBadge />}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-white/40 whitespace-nowrap">
                      {row[COL_DATE] ?? '—'}
                    </td>
                    {hasBeforeAfter && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <PctDelta before={row[COL_BEFORE] ?? ''} after={row[COL_AFTER] ?? ''} />
                      </td>
                    )}
                    {hasGroup && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <PctDelta before={row[COL_BEFORE_G] ?? ''} after={row[COL_AFTER_G] ?? ''} />
                      </td>
                    )}
                    {headers.includes(COL_CHANGE) && (
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-white/55 whitespace-nowrap">
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
