import {
  breadthGeneratedAt,
  breadthRows,
  setIndexBars,
  marketStage,
  latestFtdDate,
  latest52w,
} from '@/lib/breadthData';
import { formatShortThaiDate, formatThaiDate } from '@/lib/utils';
import SetIndexChart from '@/components/breadth/SetIndexChart';
import BreadthLineChart from '@/components/breadth/BreadthLineChart';

const CHART_DAYS = 90;

const STAGE_CLS: Record<string, string> = {
  Uptrend: 'bg-[#1D9E75]/15 text-[#1D9E75]',
  'Under Pressure': 'bg-[#F9C942]/15 text-[#F9C942]',
  Correction: 'bg-[#E24B4A]/15 text-[#E24B4A]',
};

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-x-3 gap-y-1">
        <div>
          <h2 className="text-[13px] font-semibold text-white/80">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/30 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-[10px] text-white/25">ณ สแกน {formatShortThaiDate(breadthGeneratedAt)}</span>
      </div>
      {children}
    </div>
  );
}

export default function BreadthPage() {
  const chartRows = breadthRows.slice(-CHART_DAYS);
  const chartBars = setIndexBars.slice(-CHART_DAYS);
  const { pct_new_52wh, pct_new_52wl } = latest52w();
  const ftdDate = latestFtdDate();
  const pctMa50 = marketStage.pct_above_ma50_today;
  const stageCls = STAGE_CLS[marketStage.stage] ?? 'bg-white/10 text-white/60';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[18px] font-bold text-white">SET Market Breadth</h1>
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${stageCls}`}>
            {marketStage.stage}
          </span>
        </div>
        <p className="text-[12px] text-white/40 mt-1">
          เหนือ MA50: <span className="text-white/70 font-medium">{pctMa50 != null ? `${pctMa50.toFixed(1)}%` : '-'}</span>
          {' · '}
          52WH/52WL วันนี้:{' '}
          <span className="text-white/70 font-medium">
            {pct_new_52wh != null ? `${pct_new_52wh.toFixed(1)}%` : '-'} / {pct_new_52wl != null ? `${pct_new_52wl.toFixed(1)}%` : '-'}
          </span>
          {' · '}
          FTD ล่าสุด: <span className="text-white/70 font-medium">{ftdDate ? formatShortThaiDate(ftdDate) : 'ไม่มีในช่วงข้อมูล'}</span>
        </p>
        <p className="text-[11px] text-white/25 mt-1">อัปเดตล่าสุด: {formatThaiDate(breadthGeneratedAt)}</p>
      </div>

      <ChartCard title="SET Index + FTD/DD markers" subtitle={`แท่งเทียน ${CHART_DAYS} วัน`}>
        <SetIndexChart bars={chartBars} height={260} />
      </ChartCard>

      <ChartCard title="% ทำ 52W High / Low รายวัน">
        <BreadthLineChart
          rows={chartRows}
          series={[
            { key: 'pct_new_52wh', label: '% 52W High ใหม่', color: '#3B82F6' },
            { key: 'pct_new_52wl', label: '% 52W Low ใหม่', color: '#E24B4A' },
          ]}
          height={180}
        />
      </ChartCard>

      <ChartCard title="% เหนือ MA10 / 20 / 50 / 200">
        <BreadthLineChart
          rows={chartRows}
          series={[
            { key: 'pct_above_ma10', label: '% เหนือ MA10', color: '#1D9E75' },
            { key: 'pct_above_ma20', label: '% เหนือ MA20', color: '#F9C942' },
            { key: 'pct_above_ma50', label: '% เหนือ MA50', color: '#3B82F6' },
            { key: 'pct_above_ma200', label: '% เหนือ MA200', color: '#AA00FF' },
          ]}
          referenceValue={50}
          height={200}
        />
      </ChartCard>
    </div>
  );
}
