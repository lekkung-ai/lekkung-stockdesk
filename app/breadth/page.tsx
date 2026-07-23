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
import { Info, HelpCircle, BookOpen } from 'lucide-react';

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

      {/* ── Knowledge Base Section (คู่มือและคำอธิบายองค์ประกอบหน้า Market Breadth) ── */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 md:p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3">
          <BookOpen className="text-blue-400" size={20} />
          <div>
            <h2 className="text-[16px] font-bold text-white tracking-tight">Market Breadth Knowledge Base</h2>
            <p className="text-[11.5px] text-white/40 mt-0.5">
              คู่มือและคำอธิบายการใช้งานตัวชี้วัดความกว้างของตลาดหุ้นไทยเพื่อการเทรดและประเมินความเสี่ยง
            </p>
          </div>
        </div>

        {/* Highlight Question: % เหนือ MA10/20/50/200 เปรียบเทียบกับอะไร? */}
        <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-4 space-y-2">
          <h3 className="text-[13.5px] font-bold text-blue-300 flex items-center gap-1.5">
            <span>❓</span>
            <span>ตัวเลข "% เหนือ MA10 / 20 / 50 / 200" เปรียบเทียบมาจากอะไร?</span>
          </h3>
          <p className="text-[12px] text-white/80 leading-relaxed">
            ตัวเลขเปอร์เซ็นต์นี้คำนวณเปรียบเทียบจาก <strong className="text-white">จักรวาลหุ้นไทยทั้งหมดใน SET Universe (ประมาณ 866 บริษัท)</strong> โดยคิดสัดส่วนว่ามีกี่ % (จำนวนกี่บริษัท) ที่ราคาปิดล่าสุดยืนอยู่ <strong className="text-emerald-400">สูงกว่า (เหนือ) เส้นค่าเฉลี่ยเคลื่อนที่ (Moving Average)</strong> ของตัวมันเอง
          </p>
          <div className="bg-black/40 p-3 rounded-lg border border-white/10 text-[11.5px] text-white/70 space-y-1 mt-2 font-mono">
            <p className="font-bold text-blue-300 font-sans">📌 ตัวอย่างการตีความ:</p>
            <p>• ถ้า <span className="text-emerald-400">% เหนือ MA50 = 78.6%</span> หมายถึง จากหุ้นไทย 866 ตัว มีถึง 681 ตัวที่ราคาอยู่เหนือเส้น MA50 สะท้อนสภาวะตลาดสมบูรณ์แข็งแกร่ง (Healthy Market)</p>
            <p>• ถ้า <span className="text-rose-400">% เหนือ MA50 &lt; 35%</span> หมายถึง หุ้นส่วนใหญ่ในตลาดหลุดเส้นค่าเฉลี่ย ตลาดกำลังอ่อนแออย่างมาก ควรเพิ่มความระมัดระวังในการเข้าซื้อ</p>
          </div>
        </div>

        {/* Section Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Card 1: Market Stage & Header Banner */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2">
            <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              1. สถานะตลาด & Summary KPI Cards
            </h3>
            <p className="text-[11.5px] text-white/60 leading-relaxed">
              สรุปสภาวะรวมของตลาดหุ้นไทยในมุมมอง Macro View ตามหลักการของ CAN SLIM (William O'Neil):
            </p>
            <ul className="text-[11px] text-white/60 space-y-1 list-disc list-inside pl-1">
              <li><strong className="text-emerald-400">Uptrend</strong>: ตลาดเป็นขาขึ้นแข็งแกร่ง น่าลงทุนและเปิดสถานะหุ้นใหม่ได้เต็มที่</li>
              <li><strong className="text-amber-400">Under Pressure</strong>: ตลาดเริ่มตึงตัว มีแรงขายสะสม ต้องเริ่มจำกัดขนาดพอร์ต</li>
              <li><strong className="text-rose-400">Correction</strong>: ตลาดเข้าสู่รอบพักตัว/ขาลง ควรถือเงินสดเป็นหลัก</li>
              <li><strong className="text-white">DD (Distribution Days)</strong>: วันกระจายหุ้น (SET ปิดลบ ≥0.2% พร้อม Volume สูงขึ้น) หากเกิด 5-6 วันในรอบ 25 วัน บ่งบอกสถาบันกำลังเทขาย</li>
            </ul>
          </div>

          {/* Card 2: SET Index + FTD/DD Markers */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2">
            <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              2. SET Index + FTD / DD Markers
            </h3>
            <p className="text-[11.5px] text-white/60 leading-relaxed">
              กราฟแท่งเทียนราคา SET Index พร้อมมาร์กเกอร์แสดงจุดเปลี่ยนผ่านสำคัญ:
            </p>
            <ul className="text-[11px] text-white/60 space-y-1 list-disc list-inside pl-1">
              <li><strong className="text-emerald-400">FTD (Follow-Through Day)</strong>: วันยืนยันการกลับตัวเป็นขาขึ้นรอบใหม่ (เกิดในวันที่ 4-10 ของการพยายามฟื้นตัว โดย SET บวก ≥1.5% พร้อม Volume เพิ่ม)</li>
              <li><strong className="text-rose-400">DD (Distribution Day)</strong>: จุดเตือนการเทขายของรายใหญ่ในวันนั้นๆ</li>
            </ul>
          </div>

          {/* Card 3: % New 52-Week High / Low */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2">
            <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              3. % หุ้นทำ 52-Week High / Low รายวัน
            </h3>
            <p className="text-[11.5px] text-white/60 leading-relaxed">
              เปรียบเทียบสัดส่วนหุ้นที่สามารถทำ New High หรือ New Low รอบ 1 ปี:
            </p>
            <ul className="text-[11px] text-white/60 space-y-1 list-disc list-inside pl-1">
              <li><strong className="text-blue-400">% 52W High สูงขึ้น</strong>: บ่งบอกมีกลุ่มหุ้นนำตลาด (Leading Stocks) ทะลุทำจุดสูงสุดใหม่ต่อเนื่อง</li>
              <li><strong className="text-rose-400">% 52W Low พุ่งสูงขึ้น</strong>: บ่งบอกหุ้นในตลาดกำลังโดนทุบหลุดแนวรับรุนแรง สัญญาณอันตราย</li>
            </ul>
          </div>

          {/* Card 4: % Above MA Lines (Breadth Lines) */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2">
            <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              4. % หุ้นยืนเหนือเส้น MA10 / 20 / 50 / 200
            </h3>
            <p className="text-[11.5px] text-white/60 leading-relaxed">
              แสดงการกระจายตัวของราคาหุ้นในแต่ละกรอบเวลาเทียบกับเส้นค่าเฉลี่ย:
            </p>
            <ul className="text-[11px] text-white/60 space-y-1 list-disc list-inside pl-1">
              <li><strong className="text-[#1D9E75]">MA10 (10 วัน)</strong>: วัดแรงส่งเก็งกำไรระยะสั้นมากๆ</li>
              <li><strong className="text-[#F9C942]">MA20 (20 วัน)</strong>: วัดแนวโน้มระยะสั้น (ใช้ดูโซน Overbought/Oversold รายสัปดาห์)</li>
              <li><strong className="text-[#3B82F6]">MA50 (50 วัน)</strong>: เส้นอ้างอิงสุขภาพตลาดระยะกลาง (เกณฑ์สำคัญ &gt; 50% = ตลาดปกติ)</li>
              <li><strong className="text-[#AA00FF]">MA200 (200 วัน)</strong>: แยกแยะสภาวะตลาดกระทิง (Bull) vs ตลาดหมี (Bear) ระยะยาว</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
