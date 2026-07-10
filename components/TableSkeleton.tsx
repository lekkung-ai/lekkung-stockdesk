// Reusable pulsing-row skeleton for table/list loading states across the app —
// replaces plain "Loading..." text so a loading table looks like a table.
export default function TableSkeleton({
  rows = 8,
  className = '',
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`animate-pulse divide-y divide-white/[0.04] ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-3 w-5 rounded bg-white/[0.06] flex-shrink-0" />
          <div className="h-3 w-14 rounded bg-white/[0.08] flex-shrink-0" />
          <div className="h-3 w-16 rounded bg-white/[0.05] hidden sm:block" />
          <div className="h-3 w-20 rounded bg-white/[0.05] ml-auto" />
          <div className="h-3 w-14 rounded bg-white/[0.06] hidden md:block" />
        </div>
      ))}
    </div>
  );
}
