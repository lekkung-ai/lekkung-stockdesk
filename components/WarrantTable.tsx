'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, ArrowDown, ArrowUp } from 'lucide-react';
import type { WarrantListRow } from '@/app/api/warrant-list/route';

type SortKey = 'symbol' | 'parent' | 'price' | 'changePercent' | 'exercisePrice' | 'exerciseRatio' | 'maturityDate';
type SortConfig = { key: SortKey; dir: 'asc' | 'desc' } | null;

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function isoToThaiLabel(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

function SortTh({
  sortKey, label, sortConfig, onSort, className = '',
}: {
  sortKey: SortKey; label: string; sortConfig: SortConfig; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortConfig?.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none group ${active ? 'text-white/60' : 'text-white/25 hover:text-white/40'} ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <div className={`flex flex-col opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'opacity-100' : ''}`}>
          {active ? (
            sortConfig!.dir === 'asc' ? <ArrowUp size={10} className="text-white/50" /> : <ArrowDown size={10} className="text-white/50" />
          ) : (
            <ArrowDown size={10} className="text-white/20" />
          )}
        </div>
      </div>
    </th>
  );
}

export default function WarrantTable() {
  const router = useRouter();
  const [rows, setRows] = useState<WarrantListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'symbol', dir: 'asc' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/warrant-list');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.warrants ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const filteredRows = useMemo(() => {
    const result = rows.filter(r => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return r.symbol.toLowerCase().includes(q) || r.parent.toLowerCase().includes(q);
    });

    if (sortConfig) {
      const { key, dir } = sortConfig;
      result.sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string' && typeof vb === 'string') {
          return dir === 'asc' ? va.localeCompare(vb, 'th') : vb.localeCompare(va, 'th');
        }
        return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    }
    return result;
  }, [rows, query, sortConfig]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="ค้นหา Warrant หรือหุ้นแม่..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-8 pr-4 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[13px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
          />
        </div>
        <button
          onClick={loadData}
          className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #7F77DD' }}>
        {loading ? (
          <div className="py-16 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button
              onClick={loadData}
              className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {rows.length > 0 ? 'ไม่พบผลลัพธ์ที่ตรงกับตัวกรอง' : 'ไม่พบข้อมูล Warrant'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <SortTh sortKey="symbol" label="Warrant" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="parent" label="หุ้นแม่" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="price" label="ราคา" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="changePercent" label="%เปลี่ยนแปลง" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="exercisePrice" label="Exercise Price" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="exerciseRatio" label="Ratio (หุ้นแม่:1)" sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh sortKey="maturityDate" label="วันหมดอายุ" sortConfig={sortConfig} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filteredRows.map(row => (
                  <tr key={row.symbol} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3 text-[15px] font-semibold text-white/85 whitespace-nowrap">
                      {row.symbol}
                    </td>
                    <td
                      onClick={() => router.push(`/stock/${row.parent}`)}
                      className="px-3 py-3 text-[14px] font-semibold text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap"
                    >
                      {row.parent}
                    </td>
                    <td className="px-3 py-3 text-[14px] text-white/70 tabular-nums whitespace-nowrap">
                      {row.price != null ? row.price.toFixed(2) : '—'}
                    </td>
                    <td className={`px-3 py-3 text-[14px] font-semibold tabular-nums whitespace-nowrap ${
                      row.changePercent > 0 ? 'text-green-400' : row.changePercent < 0 ? 'text-red-400' : 'text-white/50'
                    }`}>
                      {row.changePercent != null ? `${row.changePercent > 0 ? '+' : ''}${row.changePercent.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-[14px] text-white/70 tabular-nums whitespace-nowrap">
                      {row.exercisePrice != null ? row.exercisePrice.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-3 text-[14px] text-white/70 tabular-nums whitespace-nowrap">
                      1 : {row.exerciseRatio}
                    </td>
                    <td className="px-3 py-3 text-[14px] text-white/55 whitespace-nowrap">
                      {isoToThaiLabel(row.maturityDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SET (ผ่าน Settrade) · อัปเดตทุก 5 นาที{filteredRows.length > 0 ? ` · ${filteredRows.length} รายการ` : ''}
      </p>
    </div>
  );
}
