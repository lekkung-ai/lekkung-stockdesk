interface MetricCardProps {
  label: string;
  value: string;
  sub: string;
  subColor?: 'green' | 'red' | 'gray';
}

export default function MetricCard({ label, value, sub, subColor = 'gray' }: MetricCardProps) {
  const subCls = {
    green: 'text-[#1D9E75]',
    red: 'text-[#E24B4A]',
    gray: 'text-white/40',
  }[subColor];

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 min-w-[152px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">{label}</p>
      <p className="text-[22px] font-bold text-white leading-none">{value}</p>
      <p className={`text-[12px] mt-1.5 ${subCls}`}>{sub}</p>
    </div>
  );
}
