'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  breadthGeneratedAt,
  breadthRows,
  setIndexBars,
  marketStage,
  latestFtdDate,
  latest52w,
  type BreadthRow,
  type SetIndexBar,
  type MarketStage,
} from '@/lib/breadthData';
import { formatShortThaiDate, formatThaiDate } from '@/lib/utils';
import SetIndexChart from '@/components/breadth/SetIndexChart';
import BreadthLineChart from '@/components/breadth/BreadthLineChart';
import { Info, HelpCircle } from 'lucide-react';

const STAGE_CLS: Record<string, string> = {
  Uptrend: 'bg-[#1D9E75]/20 text-[#1D9E75] border-[#1D9E75]/40',
  'Under Pressure': 'bg-[#F9C942]/20 text-[#F9C942] border-[#F9C942]/40',
  Correction: 'bg-[#E24B4A]/20 text-[#E24B4A] border-[#E24B4A]/40',
};

function ChartCard({
  title,
  subtitle,
  children,
  generatedAt,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  generatedAt: string;
}) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 shadow-sm hover:border-white/[0.12] transition-colors">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-x-3 gap-y-1 border-b border-white/[0.05] pb-2.5">
        <div>
          <h2 className="text-[13.5px] font-bold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-[10px] font-medium text-white/30">สแกนล่าสุด: {formatShortThaiDate(generatedAt)}</span>
      </div>
      {children}
    </div>
  );
}

export default function BreadthPage() {
  const [chartDays, setChartDays] = useState<number>(90);
  const [showRuleInfo, setShowRuleInfo] = useState<boolean>(false);
  const [dynamicData, setDynamicData] = useState<{
    generatedAt: string;
    stage: MarketStage;
    bars: SetIndexBar[];
    rows: BreadthRow[];
  }>({
    generatedAt: breadthGeneratedAt,
    stage: marketStage,
    bars: setIndexBars,
    rows: breadthRows,
  });

  useEffect(() => {
    fetch('/api/breadth')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        setDynamicData({
          generatedAt: d.generated_at || breadthGeneratedAt,
          stage: d.market_stage || marketStage,
          bars: d.set_index || setIndexBars,
          rows: d.breadth || breadthRows,
        });
      })
      .catch(() => {});
  }, []);

  const chartRows = useMemo(() => dynamicData.rows.slice(-chartDays), [dynamicData.rows, chartDays]);
  const chartBars = useMemo(() => dynamicData.bars.slice(-chartDays), [dynamicData.bars, chartDays]);

  const latestRow = useMemo(() => {
    return dynamicData.rows.length > 0 ? dynamicData.rows[dynamicData.rows.length - 1] : null;
  }, [dynamicData.rows]);

  const ftdDate = useMemo(() => {
    for (let i = dynamicData.bars.length - 1; i >= 0; i--) {
      if (dynamicData.bars[i].marker === 'FTD') return dynamicData.bars[i].date;
    }
    return null;
  }, [dynamicData.bars]);

  const stageCls = STAGE_CLS[dynamicData.stage.stage] ?? 'bg-white/10 text-white/60 border-white/20';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header Banner */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[20px] font-bold text-white tracking-tight">SET Market Breadth</h1>
              <span className={`px-3 py-0.5 rounded-full text-[11.5px] font-extrabold border ${stageCls}`}>
                {dynamicData.stage.stage}
              </span>
            </div>
            <p className="text-[12px] text-white/40 mt-1">
              ดัชนีสุขภาพความกว้างของตลาดหุ้นไทย · ข้อมูลล่าสุด ณ {formatThaiDate(dynamicData.generatedAt)}
            </p>
          </div>

          {/* Timeframe Selector Pills */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] self-start sm:self-auto">
            <span className="text-[10px] text-white/30 font-medium px-2 hidden md:inline">ย้อนหลัง:</span>
            {[
              { days: 30, label: '30 วัน' },
              { days: 90, label: '90 วัน' },
              { days: 180, label: '180 วัน' },
              { days: 365, label: '1 ปี' },
            ].map(tf => (
              <button
                key={tf.days}
                onClick={() => setChartDays(tf.days)}
                className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all ${
                  chartDays === tf.days
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Market Breadth KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-white/[0.06]">
          {/* % MA10 */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-xl">
            <p className="text-[10px] font-medium text-white/40">เหนือ MA10 (ระยะสั้น)</p>
            <p className={`text-[16px] font-extrabold tabular-nums mt-0.5 ${(latestRow?.pct_above_ma10 ?? 0) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {latestRow?.pct_above_ma10 != null ? `${latestRow.pct_above_ma10.toFixed(1)}%` : '-'}
            </p>
          </div>

          {/* % MA20 */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-xl">
            <p className="text-[10px] font-medium text-white/40">เหนือ MA20 (ระยะสั้น-กลาง)</p>
            <p className={`text-[16px] font-extrabold tabular-nums mt-0.5 ${(latestRow?.pct_above_ma20 ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {latestRow?.pct_above_ma20 != null ? `${latestRow.pct_above_ma20.toFixed(1)}%` : '-'}
            </p>
          </div>

          {/* % MA50 */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-xl">
            <p className="text-[10px] font-medium text-white/40">เหนือ MA50 (สุขภาพตลาด)</p>
            <p className={`text-[16px] font-extrabold tabular-nums mt-0.5 ${(latestRow?.pct_above_ma50 ?? 0) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {latestRow?.pct_above_ma50 != null ? `${latestRow.pct_above_ma50.toFixed(1)}%` : '-'}
            </p>
          </div>

          {/* % MA200 */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-xl">
            <p className="text-[10px] font-medium text-white/40">เหนือ MA200 (ระยะยาว)</p>
            <p className={`text-[16px] font-extrabold tabular-nums mt-0.5 ${(latestRow?.pct_above_ma200 ?? 0) >= 50 ? 'text-purple-400' : 'text-white/60'}`}>
              {latestRow?.pct_above_ma200 != null ? `${latestRow.pct_above_ma200.toFixed(1)}%` : '-'}
            </p>
          </div>

          {/* 52W High / Low */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-xl">
            <p className="text-[10px] font-medium text-white/40">52WH / 52WL วันนี้</p>
            <p className="text-[15px] font-bold tabular-nums mt-0.5 text-white/90">
              <span className="text-blue-400">{latestRow?.pct_new_52wh != null ? `${latestRow.pct_new_52wh.toFixed(1)}%` : '-'}</span>
              <span className="text-white/30 mx-1">/</span>
              <span className="text-rose-400">{latestRow?.pct_new_52wl != null ? `${latestRow.pct_new_52wl.toFixed(1)}%` : '-'}</span>
            </p>
          </div>

          {/* DD Count & FTD */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-xl">
            <p className="text-[10px] font-medium text-white/40">วันกระจายหุ้น (DD 25 วัน)</p>
            <div className="flex items-baseline justify-between mt-0.5">
              <p className={`text-[16px] font-extrabold tabular-nums ${dynamicData.stage.dd_count_25d >= 5 ? 'text-rose-400' : dynamicData.stage.dd_count_25d >= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {dynamicData.stage.dd_count_25d} วัน
              </p>
              <span className="text-[9.5px] text-white/40">FTD: {ftdDate ? formatShortThaiDate(ftdDate) : '-'}</span>
            </div>
          </div>
        </div>

        {/* Rule Toggle Info Accordion */}
        <div className="pt-1">
          <button
            onClick={() => setShowRuleInfo(!showRuleInfo)}
            className="flex items-center gap-1.5 text-[11.5px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            <HelpCircle size={13} />
            <span>{showRuleInfo ? 'ซ่อนคำอธิบายเกณฑ์วิเคราะห์สภาวะตลาด (O\'Neil IBD Rules)' : 'ดูคำอธิบายเกณฑ์วิเคราะห์สภาวะตลาด (O\'Neil IBD Rules)'}</span>
          </button>

          {showRuleInfo && (
            <div className="mt-3 bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-2 text-[11.5px] text-white/60 leading-relaxed animate-in fade-in duration-200">
              <p className="font-bold text-white flex items-center gap-1">
                <Info size={13} className="text-blue-400" />
                เกณฑ์ประเมินสถานะตลาด (Market Stage Rules):
              </p>
              <ul className="list-disc list-inside space-y-1 text-white/70 pl-1">
                <li><strong className="text-emerald-400">Uptrend (ขาขึ้นปกติ)</strong>: ตลาดอยู่ในสภาวะกระทิง ปริมาณสแกนหุ้นเหนือ MA50 มีสุขภาพดี และ Distribution Days (DD) น้อยกว่า 4 วัน</li>
                <li><strong className="text-amber-400">Under Pressure (ตลาดตึงตัว/เริ่มกดดัน)</strong>: พบ Distribution Days (DD) สะสมตั้งแต่ 4-5 วันขึ้นไปในรอบ 25 วันทำการ หรือหุ้นในตลาดสแกนเหนือ MA50 ต่ำกว่า 35%</li>
                <li><strong className="text-rose-400">Correction (ตลาดเข้าสู่รอบปรับฐาน/พักตัว)</strong>: พบ Distribution Days (DD) สะสมตั้งแต่ 6 วันขึ้นไปในรอบ 25 วันทำการ</li>
              </ul>
              <p className="text-[10.5px] text-white/40 pt-1 italic">
                * FTD (Follow-Through Day) หมายถึงวันยืนยันการกลับตัวเป็นขาขึ้นรอบใหม่ โดย SET ปิดบวกอย่างน้อย +1.5% พร้อม Volume เพิ่มขึ้นจากวันก่อน
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Charts */}
      <ChartCard
        title="SET Index + FTD/DD Markers (แท่งเทียนราคา)"
        subtitle={`กราฟแท่งเทียน SET Index แสดงจุด FTD (Follow-Through Day) และ DD (Distribution Day) ย้อนหลัง ${chartDays} วัน`}
        generatedAt={dynamicData.generatedAt}
      >
        <SetIndexChart bars={chartBars} height={270} />
      </ChartCard>

      <ChartCard
        title="% หุ้นทำ 52-Week High / Low รายวัน"
        subtitle="% สัดส่วนหุ้นในตลาดที่ทำ New 52-Week High vs New 52-Week Low (บ่งบอกความร้อนแรงหรือโดนเทขาย)"
        generatedAt={dynamicData.generatedAt}
      >
        <BreadthLineChart
          rows={chartRows}
          series={[
            { key: 'pct_new_52wh', label: '% 52W High ใหม่', color: '#3B82F6' },
            { key: 'pct_new_52wl', label: '% 52W Low ใหม่', color: '#E24B4A' },
          ]}
          height={190}
        />
      </ChartCard>

      <ChartCard
        title="% หุ้นยืนเหนือเส้นค่าเฉลี่ย MA10 / MA20 / MA50 / MA200"
        subtitle="ตัวชี้วัด Breadth ความกว้างตลาด (หากเส้นสแกนเหนือ 50% ตลาดฝั่งซื้อกุมความได้เปรียบ)"
        generatedAt={dynamicData.generatedAt}
      >
        <BreadthLineChart
          rows={chartRows}
          series={[
            { key: 'pct_above_ma10', label: '% เหนือ MA10', color: '#1D9E75' },
            { key: 'pct_above_ma20', label: '% เหนือ MA20', color: '#F9C942' },
            { key: 'pct_above_ma50', label: '% เหนือ MA50', color: '#3B82F6' },
            { key: 'pct_above_ma200', label: '% เหนือ MA200', color: '#AA00FF' },
          ]}
          referenceValue={50}
          height={210}
        />
      </ChartCard>
    </div>
  );
}
