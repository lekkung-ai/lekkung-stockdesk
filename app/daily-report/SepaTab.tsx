'use client';

import React, { useMemo } from 'react';
import { LIQ_DEFAULT, LIQ_LABELS } from '@/lib/liquidity';
import { toNum, vcpFootprint } from '@/lib/sepaTier';
import { shortDate, fmtNum, type DailyReport } from '@/lib/dailyReport';
import { type SepaSection, rankSepa, sepaReadyList, sepaHeadline, sepaWatch, fplusLabel } from '@/lib/dailyReportTabs';
import {
  Pct, N, StatusTag, StaleTag, EventTags, InScans, NoData, TabHead, Verdict, ChangeBox, Chip, CountLine,
  CompactCard, WatchGrid, FullListLink, Fold,
} from './shared';
import s from './DailyReport.module.css';

export default function SepaTab({ sp, market }: { sp: SepaSection | null; market: DailyReport['market'] }) {
  // มุมมองเริ่มต้นแบบหน้า /sepa (ชุดสภาพคล่องค่าเริ่มต้น)
  const ranked = useMemo(() => (sp ? rankSepa(sp.rows, LIQ_DEFAULT) : []), [sp]);
  const prevRanked = useMemo(() => (sp ? rankSepa(sp.prev_rows, LIQ_DEFAULT) : []), [sp]);
  const ready = useMemo(() => sepaReadyList(ranked), [ranked]);
  if (!sp) return <NoData />;

  const viewSet = new Set(ranked.map(x => x.row.Ticker));
  const prevViewSet = new Set(prevRanked.map(x => x.row.Ticker));
  const web = sp.web_diff;
  const newRows = ranked.filter(x => x.row.status === 'new');
  const drops = sp.dropped.filter(d => prevViewSet.has(d.ticker));
  const nNew = web ? web.new_tickers.filter(t => viewSet.has(t)).length : newRows.length;
  const nDrop = web ? web.dropped_tickers.filter(t => prevViewSet.has(t)).length : drops.length;

  return (
    <section data-testid="dr-sepa">
      <TabHead title="SEPA Trend Template" date={sp.date} ts={sp.generated_at} compared={sp.compared_to} href={sp.page} />
      <Verdict text={sepaHeadline(ranked)} />
      <CountLine parts={[
        { label: 'ผ่าน', value: ranked.length }, { label: 'พร้อมยิง', value: ready.length },
        { label: 'เข้าใหม่', value: nNew }, { label: 'หลุด', value: nDrop },
      ]} />
      {market?.condition && (
        <p className={s.tabHead} data-testid="sepa-market-ref">
          สภาพตลาด {market.condition.label} (ดูแถบตลาดด้านบน) · มุมมอง: สภาพคล่อง {LIQ_LABELS[LIQ_DEFAULT]} เหมือนค่าเริ่มต้นของหน้า /sepa
        </p>
      )}

      <h3 className={s.sectionH}>เปลี่ยนวันนี้</h3>
      <div className={s.changes} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <ChangeBox title="เข้าใหม่ (NEW)" hint="ไม่อยู่ในสแกนวันทำการก่อนหน้า"
          chips={newRows.map(x => <Chip key={x.row.Ticker} ticker={x.row.Ticker}><Pct v={x.row.chg_pct} /></Chip>)}
          note={newRows.length > 0 && newRows.map(x => <div key={x.row.Ticker}>{x.row.Ticker}: {x.row.seen_before ? `เคยอยู่ล่าสุด ${shortDate(x.row.seen_before)}` : `ครั้งแรกใน ${sp.lookback_days} วันทำการ`}</div>)} />
        <ChangeBox title="หลุด" chips={drops.map(d => <Chip key={d.ticker} ticker={d.ticker}><Pct v={d.chg_pct} /></Chip>)}
          note={drops.length > 0 && drops.map(d => <div key={d.ticker}>{d.ticker}: {d.days_before_drop === 1 ? 'อยู่รอบนี้แค่วันเดียว' : <>อยู่มา <N>{d.days_before_drop}</N> วัน</>}</div>)} />
      </div>

      <h3 className={s.sectionH}>พรุ่งนี้ดูตัวไหน<small>🎯 พร้อมยิง เรียงจากใกล้ Pivot ที่สุด</small></h3>
      <WatchGrid testid="sepa-watch" empty={ready.length === 0}>
        {ready.map(x => {
          const r = x.row;
          const toPivot = toNum(r.VCP_ToPivot);
          return (
            <CompactCard
              key={r.Ticker} testid="sepa-watch-card" ticker={r.Ticker} close={toNum(r.Price)} chg={r.chg_pct}
              tags={<><StatusTag status={r.status} seenBefore={r.seen_before} /><span className={s.tag}>{fplusLabel(r.Fundamental_Pass)}</span><StaleTag stale={r.price_stale} barDate={r.bar_date} /><InScans scans={r.in_scans} exclude="sepa" asTag /><EventTags events={r.events} /></>}
              facts={[
                ['Pivot', fmtNum(toNum(r.VCP_Pivot))],
                ['ต้องขึ้นอีก', toPivot == null ? '—' : `${toPivot.toFixed(1)}%`],
                ['VCP', vcpFootprint(r) ?? '—'],
                ['Score', Math.round(x.score)],
              ]}
              watch={sepaWatch(x)}
            />
          );
        })}
      </WatchGrid>

      <FullListLink href={sp.page} n={ranked.length} label="หน้า SEPA Trend Template" />
      <Fold title="วิธีอ่าน · เกณฑ์">
        <p><b>พร้อมยิง:</b> VCP หดตัวเป็นขั้น ≥ 2 ครั้ง และราคาต่ำกว่า Pivot 0–5% (เกณฑ์เดียวกับหน้า /sepa) · เรียงระยะถึง Pivot ใกล้ → ไกล</p>
        <p><b>Score:</b> สูตรเดียวกับหน้า /sepa (RS 50% · งบ 20% · ใกล้ High 30%) · <b>เข้าใหม่ (NEW) / หลุด:</b> ตามหน้า /sepa</p>
      </Fold>
    </section>
  );
}
