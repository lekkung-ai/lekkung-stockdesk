'use client';

import { Th, Td, TableWrap } from '@/components/StrategyTable';
import { getScanDiff } from '@/lib/scanDiff';

// Shown when the "หลุดวันนี้" chip is active - these tickers aren't in
// today's scan output at all, so only ticker + last known close (from the
// previous trading day's snapshot) is available, not the full row shape.
export default function DroppedTickersList({ scanName }: { scanName: string }) {
  const diff = getScanDiff(scanName);
  const rows = diff?.droppedTickers ?? [];

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-label text-white/30">ไม่มีหุ้นหลุดออกจาก scan นี้เมื่อเทียบกับวันทำการก่อนหน้า</p>
      </div>
    );
  }

  return (
    <TableWrap>
      <thead className="border-b border-white/[0.06] bg-white/[0.015]">
        <tr>
          <Th>#</Th>
          <Th>Symbol</Th>
          <Th right>ราคาล่าสุด (วันที่หลุด)</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.ticker} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
            <Td className="text-white/40"><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
            <Td>
              <div className="font-bold text-white">{r.ticker}</div>
            </Td>
            <Td right mono>{r.lastClose != null ? r.lastClose.toFixed(2) : '—'}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
