'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

type Market = 'set' | 'mai';

function isTicker(val: string): boolean {
  return /^[A-Z][A-Z0-9]{1,9}$/.test(val.trim());
}

function isTickerCol(header: string): boolean {
  return /หลักทรัพย์|symbol|ticker/i.test(header);
}

export default function BigLotPage() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>('set');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadData = useCallback(async (m: Market) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/settrade/biglot?market=${m}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(market); }, [market, loadData]);

  function handleCell(header: string, value: string) {
    if (isTickerCol(header) && isTicker(value)) {
      router.push(`/stock/${value.trim()}`);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Big Lot</h1>
          <p className="text-[12px] text-white/35 mt-0.5">{market.toUpperCase()} · SETTrade real-time</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
          <button
            onClick={() => loadData(market)}
            className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #EF9F27' }}>
        {loading ? (
          <div className="py-16 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button
              onClick={() => loadData(market)}
              className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">ไม่พบข้อมูล Big Lot</p>
            <p className="text-[11px] text-white/20 mt-1">ข้อมูลอาจโหลดผ่าน JavaScript (client-side)</p>
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
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    {headers.map(h => {
                      const val = row[h] ?? '—';
                      const clickable = isTickerCol(h) && isTicker(val);
                      return (
                        <td
                          key={h}
                          className={[
                            'px-4 py-3 text-[12px] tabular-nums whitespace-nowrap',
                            clickable
                              ? 'text-blue-400 font-semibold cursor-pointer hover:text-blue-300'
                              : 'text-white/65',
                          ].join(' ')}
                          onClick={() => handleCell(h, val)}
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

      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SETTrade · {market.toUpperCase()}
      </p>
    </div>
  );
}
