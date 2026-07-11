import { memo } from 'react';

interface TrendSparklineProps {
  data: number[] | undefined;
  width?: number;
  height?: number;
}

function TrendSparklineImpl({ data, width = 64, height = 20 }: TrendSparklineProps) {
  if (!data || data.length < 2) {
    return <span className="text-white/15 text-[10px]">—</span>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');
  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? '#1D9E75' : '#E24B4A';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ตารางหุ้นแสดงหลายสิบแถวต่อหน้า — memo กันคำนวณ polyline ใหม่เวลาแถวอื่นๆ re-render
export default memo(TrendSparklineImpl);
