'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChangeBadge } from '@/components/ChangeBadge';
import TrendSparkline from '@/components/TrendSparkline';
import { formatShortThaiDate } from '@/lib/utils';
import {
  macroCommodities,
  macroGeneratedAt,
  macroMethodology,
  macroPalmOilNote,
  type MacroCommodity,
  type MacroZone,
} from '@/lib/macroData';

const ZONE_COLORS: Record<MacroZone, { border: string; bg: string; text: string }> = {
  energy: { border: '#EF9F27', bg: 'bg-[#EF9F27]/10', text: 'text-[#EF9F27]' },
  agri: { border: '#5D9E4A', bg: 'bg-[#5D9E4A]/10', text: 'text-[#5D9E4A]' },
  industrial: { border: '#A855F7', bg: 'bg-[#A855F7]/10', text: 'text-[#A855F7]' },
  financial: { border: '#378ADD', bg: 'bg-[#378ADD]/10', text: 'text-[#378ADD]' },
};

const ZONE_LABELS_TH: Record<MacroZone, string> = {
  energy: 'พลังงาน',
  agri: 'เกษตร-อาหาร',
  industrial: 'โลหะ-อุตสาหกรรม',
  financial: 'การเงิน-ดอกเบี้ย',
};

function formatPrice(close: number | null | undefined): string {
  if (close == null || isNaN(close)) return '—';
  if (close >= 1000) {
    return close.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }
  return close.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function CommodityCard({ commodity }: { commodity: MacroCommodity }) {
  const sparkData = (commodity.series || []).map(s => s.close);
  const zoneStyle = ZONE_COLORS[commodity.zone] || ZONE_COLORS.financial;
  const latestClose = commodity.latest?.close;

  return (
    <div className="bg-[#13161e] border border-white/[0.08] hover:border-white/[0.18] rounded-2xl p-4 transition-all space-y-3.5 shadow-sm hover:shadow-md">
      {/* Header: Title + Sparkline */}
      <div className="flex items-start justify-between gap-2 border-b border-white/[0.05] pb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${zoneStyle.bg} ${zoneStyle.text}`}>
              {ZONE_LABELS_TH[commodity.zone]}
            </span>
          </div>
          <h3 className="text-[15px] font-extrabold text-white truncate leading-tight tracking-tight">{commodity.name_th}</h3>
          <p className="text-[11.5px] text-white/45 truncate mt-0.5 font-medium">
            {commodity.name_en} · <span className="font-mono text-white/60 font-semibold">{commodity.symbol}</span>
          </p>
        </div>
        <div className="flex-shrink-0 pt-1">
          <TrendSparkline data={sparkData} width={80} height={28} />
        </div>
      </div>

      {/* Price & Badges */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[23px] font-black text-white tabular-nums leading-none tracking-tight">
              {formatPrice(latestClose)}
            </span>
          </div>
          <p className="text-[11.5px] text-white/40 mt-1.5 font-medium">{commodity.unit}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-center bg-white/[0.04] px-2.5 py-1 rounded-xl border border-white/[0.06]">
            <p className="text-[10.5px] font-semibold text-white/35 mb-0.5">1D</p>
            <ChangeBadge value={commodity.pct_1d} />
          </div>
          <div className="text-center bg-white/[0.04] px-2.5 py-1 rounded-xl border border-white/[0.06]">
            <p className="text-[10.5px] font-semibold text-white/35 mb-0.5">1M</p>
            <ChangeBadge value={commodity.pct_1m} />
          </div>
        </div>
      </div>

      {/* Stock Tickers Chips */}
      {commodity.tickers.length > 0 ? (
        <div className="pt-2.5 border-t border-white/[0.06] flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-white/40 font-semibold mr-0.5">กระทบหุ้น:</span>
          {commodity.tickers.map(t => (
            <Link
              key={t}
              href={`/stock/${t}`}
              className="text-[12px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/90 hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/[0.09] hover:border-emerald-500/30 transition-all shadow-sm"
            >
              {t}
            </Link>
          ))}
        </div>
      ) : (
        <div className="pt-2 border-t border-white/[0.04]">
          <span className="text-[11px] text-white/30 italic font-medium">ไม่มีหุ้นผูกโดยตรง (ดัชนีอ้างอิง)</span>
        </div>
      )}
    </div>
  );
}

export default function MacroPage() {
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [items, setItems] = useState<MacroCommodity[]>(macroCommodities);

  useEffect(() => {
    fetch('/api/macro')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || !d.commodities) return;
        const list: MacroCommodity[] = Object.entries(d.commodities).map(([symbol, data]: [string, any]) => ({
          symbol,
          name_th: data.name_th || symbol,
          name_en: data.name_en || symbol,
          unit: data.unit || '',
          zone: data.zone || 'financial',
          tickers: data.tickers || [],
          latest: data.latest || { date: '', close: 0 },
          pct_1d: data.pct_1d ?? null,
          pct_1m: data.pct_1m ?? null,
          series: data.series || [],
        }));
        if (list.length > 0) {
          setItems(list);
        }
      })
      .catch(() => {});
  }, []);

  // Top Movers Summary
  const topMovers = useMemo(() => {
    const valid = items.filter(c => c.pct_1d !== null);
    const sorted = [...valid].sort((a, b) => (b.pct_1d ?? 0) - (a.pct_1d ?? 0));
    return {
      gainers: sorted.slice(0, 3),
      losers: sorted.slice(-3).reverse(),
    };
  }, [items]);

  // Filtered List
  const filteredCommodities = useMemo(() => {
    return items.filter(c => {
      const matchesZone = selectedZone === 'all' || c.zone === selectedZone;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.name_th.toLowerCase().includes(q) ||
        c.name_en.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q) ||
        c.tickers.some(t => t.toLowerCase().includes(q));
      return matchesZone && matchesSearch;
    });
  }, [items, selectedZone, searchQuery]);

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    items.forEach(c => {
      counts[c.zone] = (counts[c.zone] || 0) + 1;
    });
    return counts;
  }, [items]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-extrabold text-white tracking-tight">Macro & Commodities Dashboard</h1>
            <span className="text-[12.5px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {items.length} ตัวแปร
            </span>
          </div>
          <p className="text-[13px] text-white/40 mt-1">
            ดัชนีโภคภัณฑ์และอัตราแลกเปลี่ยนที่มีผลต่อบริษัทจดทะเบียนในไทย · ข้อมูลล่าสุด ณ {formatShortThaiDate(macroGeneratedAt)}
          </p>
        </div>
      </div>

      {/* KPI Top Movers Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Gainers */}
        <div className="bg-[#13161e] border border-emerald-500/20 rounded-2xl p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <span className="text-[13.5px] font-extrabold text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              ปรับตัวขึ้นสูงสุดวันนี้ (Top Gainers)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {topMovers.gainers.map(item => (
              <div key={item.symbol} className="bg-white/[0.03] p-2.5 rounded-xl text-center border border-white/[0.04]">
                <p className="text-[12.5px] font-bold text-white truncate">{item.name_th}</p>
                <div className="mt-1.5"><ChangeBadge value={item.pct_1d} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-[#13161e] border border-rose-500/20 rounded-2xl p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <span className="text-[13.5px] font-extrabold text-rose-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse" />
              ปรับตัวลดลงสูงสุดวันนี้ (Top Losers)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {topMovers.losers.map(item => (
              <div key={item.symbol} className="bg-white/[0.03] p-2.5 rounded-xl text-center border border-white/[0.04]">
                <p className="text-[12.5px] font-bold text-white truncate">{item.name_th}</p>
                <div className="mt-1.5"><ChangeBadge value={item.pct_1d} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] p-3.5 rounded-2xl shadow-sm">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedZone('all')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
              selectedZone === 'all'
                ? 'bg-white text-black shadow'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            ทั้งหมด ({zoneCounts.all || 0})
          </button>
          <button
            onClick={() => setSelectedZone('energy')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
              selectedZone === 'energy'
                ? 'bg-[#EF9F27] text-black shadow'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            🔥 พลังงาน ({zoneCounts.energy || 0})
          </button>
          <button
            onClick={() => setSelectedZone('agri')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
              selectedZone === 'agri'
                ? 'bg-[#5D9E4A] text-white shadow'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            🌾 เกษตร-อาหาร ({zoneCounts.agri || 0})
          </button>
          <button
            onClick={() => setSelectedZone('industrial')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
              selectedZone === 'industrial'
                ? 'bg-[#A855F7] text-white shadow'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            🏗️ โลหะ-อุตสาหกรรม ({zoneCounts.industrial || 0})
          </button>
          <button
            onClick={() => setSelectedZone('financial')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
              selectedZone === 'financial'
                ? 'bg-[#378ADD] text-white shadow'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            💵 การเงิน-ดอกเบี้ย ({zoneCounts.financial || 0})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[260px]">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ค้นหาโภคภัณฑ์ หรือ Ticker (เช่น PTT, KCE, ยางพารา)..."
            className="w-full bg-white/[0.05] border border-white/[0.09] focus:border-white/30 rounded-xl px-3.5 py-2 text-[13px] text-white placeholder-white/30 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-[13px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Grid of Commodity Cards */}
      {filteredCommodities.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCommodities.map(c => (
            <CommodityCard key={c.symbol} commodity={c} />
          ))}
        </div>
      ) : (
        <div className="bg-[#13161e] border border-dashed border-white/[0.12] rounded-2xl p-12 text-center space-y-2">
          <p className="text-[15px] font-bold text-white/60">ไม่พบรายการโภคภัณฑ์ที่ตรงกับการค้นหา</p>
          <p className="text-[13px] text-white/35">ลองเปลี่ยนคำค้นหา หรือเลือกหมวดหมู่อื่น</p>
        </div>
      )}

      {/* Methodology Footer Note */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-2xl p-5 space-y-2.5">
        <h2 className="text-[13.5px] font-bold text-white/80">หมายเหตุและที่มาของข้อมูล</h2>
        <p className="text-[12.5px] text-white/50 leading-relaxed">{macroMethodology}</p>
        <p className="text-[12.5px] text-white/50 leading-relaxed">{macroPalmOilNote}</p>
      </div>
    </div>
  );
}
