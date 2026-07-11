export function ChangeBadge({
  value,
  decimals = 2,
}: {
  value: number | null | undefined;
  decimals?: number;
}) {
  if (value == null) {
    return <span className="text-white/20 text-[11px]">—</span>;
  }

  const isPos = value > 0;
  const isNeg = value < 0;
  const color = isPos ? '#1D9E75' : isNeg ? '#E24B4A' : '#9ca3af';
  const bg = isPos ? 'rgba(29,158,117,0.12)' : isNeg ? 'rgba(226,75,74,0.12)' : 'rgba(156,163,175,0.1)';

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums whitespace-nowrap"
      style={{ color, background: bg }}
    >
      {isPos ? '+' : ''}
      {value.toFixed(decimals)}%
    </span>
  );
}
