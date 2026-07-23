'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import nvdrRaw from '@/data/scans/nvdr.json';
import { getSectorForTicker } from '@/lib/sectorData';
import { Search, ExternalLink, Activity } from 'lucide-react';

interface NVDRItem {
  Date: string;
  Symbol: string;
  Buy: number;
  Sell: number;
  Total: number;
  Net: number;
}

interface NVDRData {
  latest_date: string;
  today: NVDRItem[];
  '5d': NVDRItem[];
}

function fmtVolume(num: number): string {
  if (num === 0) return '0 หุ้น';
  const abs = Math.abs(num);
  const sign = num > 0 ? '+' : '-';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M หุ้น`;
  }
  return `${sign}${abs.toLocaleString('en-US')} หุ้น`;
}

export default function NVDRPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [raw, setRaw] = useState<NVDRData>(() => {
    const d = (nvdrRaw as any)?.default ?? nvdrRaw ?? {};
    return {
      latest_date: d.latest_date || '',
      today: d.today || [],
      '5d': d['5d'] || [],
    };
  });

  useEffect(() => {
    fetch('/api/nvdr')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || !d.today) return;
        setRaw({
          latest_date: d.latest_date || '',
          today: d.today || [],
          '5d': d['5d'] || [],
        });
      })
      .catch(() => {});
  }, []);

  // Filter items by search query
  const filteredToday = useMemo(() => {
    if (!searchQuery.trim()) return raw.today;
    const q = searchQuery.trim().toLowerCase();
    return raw.today.filter(item => item.Symbol.toLowerCase().includes(q));
  }, [raw.today, searchQuery]);

  const filtered5d = useMemo(() => {
    if (!searchQuery.trim()) return raw['5d'];
    const q = searchQuery.trim().toLowerCase();
    return raw['5d'].filter(item => item.Symbol.toLowerCase().includes(q));
  }, [raw['5d'], searchQuery]);

  // Top Buys / Sells
  const topBuyToday = useMemo(() => {
    return [...filteredToday].sort((a, b) => b.Net - a.Net).slice(0, 20);
  }, [filteredToday]);

  const topSellToday = useMemo(() => {
    return [...filteredToday].sort((a, b) => a.Net - b.Net).slice(0, 20);
  }, [filteredToday]);

  const topBuy5d = useMemo(() => {
    return [...filtered5d].sort((a, b) => b.Net - a.Net).slice(0, 20);
  }, [filtered5d]);

  const topSell5d = useMemo(() => {
    return [...filtered5d].sort((a, b) => a.Net - b.Net).slice(0, 20);
  }, [filtered5d]);

  // Sector Summary
  const sectorSummary = useMemo(() => {
    const summary: Record<string, { buy: number; sell: number; total: number; net: number }> = {};
    for (const item of raw.today) {
      const secInfo = getSectorForTicker(item.Symbol);
      const sector = secInfo ? secInfo.sector : 'อื่นๆ / ไม่ระบุ';
      if (!summary[sector]) {
        summary[sector] = { buy: 0, sell: 0, total: 0, net: 0 };
      }
      summary[sector].buy += item.Buy || 0;
      summary[sector].sell += item.Sell || 0;
      summary[sector].total += item.Total || 0;
      summary[sector].net += item.Net || 0;
    }
    const arr = Object.entries(summary).map(([sector, vals]) => ({
      sector,
      ...vals,
    }));
    arr.sort((a, b) => b.net - a.net);
    return arr;
  }, [raw.today]);

  const TableBlock = ({ title, items, subtitle }: { title: string; subtitle?: string; items: NVDRItem[] }) => (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col shadow-sm">
      <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between">
        <div>
          <h2 className="text-[13.5px] font-bold text-white flex items-center gap-1.5">{title}</h2>
          {subtitle && <p className="text-[10.5px] text-white/30 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-[10px] font-semibold text-white/30 px-2 py-0.5 rounded bg-white/[0.04]">20 อันดับ</span>
      </div>
      <div className="flex-1 overflow-x-auto p-2">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-white/35 border-b border-white/[0.05]">
              <th className="py-2 px-3 font-medium">ลำดับ / หลักทรัพย์</th>
              <th className="py-2 px-3 font-medium text-right">จำนวนซื้อขายสุทธิ (Volume)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {items.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-white/30 italic">ไม่พบข้อมูล</td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item.Symbol}
                  onClick={() => router.push(`/stock/${item.Symbol}`)}
                  className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white/20 text-[11px] w-5 font-mono">{idx + 1}.</span>
                      <span className="text-white font-bold group-hover:text-blue-400 transition-colors">
                        {item.Symbol}
                      </span>
                      <ExternalLink size={10} className="text-white/20 group-hover:text-blue-400 transition-colors" />
                    </div>
                  </td>
                  <td className={`py-2 px-3 text-right font-bold tabular-nums ${
                    item.Net > 0 ? 'text-emerald-400' : item.Net < 0 ? 'text-rose-400' : 'text-white/50'
                  }`}>
                    {fmtVolume(item.Net)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header & Search */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-400" size={20} />
            <h1 className="text-[20px] font-bold text-white tracking-tight">NVDR Fund Flow</h1>
          </div>
          <p className="text-[12px] text-white/40 mt-1">
            สรุปปริมาณการซื้อขายสุทธิของนักลงทุนต่างชาติผ่าน NVDR · ข้อมูลล่าสุด ณ {raw.latest_date || '-'}
          </p>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[260px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ค้นหาหุ้น (เช่น PTTEP, KBANK)..."
            className="w-full bg-white/[0.05] border border-white/[0.09] focus:border-white/30 rounded-xl pl-9 pr-3 py-2 text-[12.5px] text-white placeholder-white/30 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-[12px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Grid Section 1: 1-Day NVDR Net Buy / Net Sell & Sector Summary */}
      <div className="space-y-4">
        <h2 className="text-[15px] font-bold text-white/90 flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <span>📅</span> สรุปกระแสเงิน NVDR รายวัน (1 วันล่าสุด)
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TableBlock title="Top Net Buy (1 วัน)" subtitle="ซื้อสุทธิสูงสุดรายวัน" items={topBuyToday} />
          <TableBlock title="Top Net Sell (1 วัน)" subtitle="ขายสุทธิสูงสุดรายวัน" items={topSellToday} />

          {/* Sector Summary Box */}
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl flex flex-col overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.02]">
              <h2 className="text-[13.5px] font-bold text-white">NVDR Trading by Sector (1 วัน)</h2>
              <p className="text-[10.5px] text-white/30 mt-0.5">ภาพรวมแยกตามกลุ่มอุตสาหกรรม</p>
            </div>
            <div className="flex-1 overflow-x-auto p-2 max-h-[420px]">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="text-white/35 border-b border-white/[0.05]">
                    <th className="py-2 px-2 font-medium">Sector</th>
                    <th className="py-2 px-2 font-medium text-right">ซื้อสุทธิ</th>
                    <th className="py-2 px-2 font-medium text-right">ขายสุทธิ</th>
                    <th className="py-2 px-2 font-medium text-right">สุทธิ (Net)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sectorSummary.map(sec => (
                    <tr key={sec.sector} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-2 px-2 font-bold text-white">{sec.sector}</td>
                      <td className="py-2 px-2 text-right text-emerald-400/80 tabular-nums">{fmtVolume(sec.buy)}</td>
                      <td className="py-2 px-2 text-right text-rose-400/80 tabular-nums">{fmtVolume(sec.sell)}</td>
                      <td className={`py-2 px-2 text-right font-extrabold tabular-nums ${
                        sec.net > 0 ? 'text-emerald-400' : sec.net < 0 ? 'text-rose-400' : 'text-white/60'
                      }`}>
                        {fmtVolume(sec.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Section 2: 5-Day Cumulative NVDR Net Buy / Net Sell */}
      <div className="space-y-4 pt-2">
        <h2 className="text-[15px] font-bold text-white/90 flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <span>📊</span> สรุปกระแสเงิน NVDR สะสมย้อนหลัง (5 วันทำการ)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TableBlock title="Top Net Buy (สะสม 5 วัน)" subtitle="ต่างชาติเก็บสะสมต่อเนื่อง" items={topBuy5d} />
          <TableBlock title="Top Net Sell (สะสม 5 วัน)" subtitle="ต่างชาติระบายขายสะสม" items={topSell5d} />
        </div>
      </div>
    </div>
  );
}
