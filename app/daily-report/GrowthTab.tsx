'use client';

import React, { useMemo } from 'react';
import { shortDate, fmtNum } from '@/lib/dailyReport';
import { fyShort, quarterShort } from '@/lib/growthPeriod';
import { type GrowthSection, growthWatchlist, GROWTH_REASON_LABEL } from '@/lib/dailyReportTabs';
import {
  Pct, N, StatusTag, StaleTag, EventTags, InScans, NoData, TabHead, Verdict, ChangeBox, Chip, CountLine,
  CompactCard, WatchGrid, FullListLink, Fold,
} from './shared';
import s from './DailyReport.module.css';

const pct1 = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

export default function GrowthTab({ g }: { g: GrowthSection | null }) {
  const watch = useMemo(() => (g ? growthWatchlist(g.rows) : []), [g]);
  if (!g) return <NoData />;
  const notes = g.change_notes;
  return (
    <section data-testid="dr-growth">
      <TabHead title="Lekkung Growth" date={g.date} ts={g.generated_at} compared={g.compared_to} href={g.page} />
      <Verdict text={g.headline} />
      <CountLine parts={[{ label: 'ผ่าน', value: g.counts.total }, { label: 'เข้าใหม่', value: g.counts.new }, { label: 'หลุด', value: g.counts.dropped }]} />

      <h3 className={s.sectionH}>เปลี่ยนวันนี้</h3>
      <div className={s.changes} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <ChangeBox title="เข้าใหม่ (NEW)" hint="ไม่อยู่ในสแกนวันทำการก่อนหน้า"
          chips={g.rows.filter(r => r.status === 'new').map(r => <Chip key={r.ticker} ticker={r.ticker}><Pct v={r.chg_pct} /></Chip>)}
          note={notes?.new_items && Object.keys(notes.new_items).length > 0 && (
            <>{Object.entries(notes.new_items).map(([t, why]) => <div key={t}>{t}: {why}</div>)}</>
          )} />
        <ChangeBox title="หลุด" chips={g.dropped.map(d => <Chip key={d.ticker} ticker={d.ticker}><Pct v={d.chg_pct} /></Chip>)}
          note={notes && Object.keys(notes.dropped_items).length > 0 && (
            <>{Object.entries(notes.dropped_items).map(([t, why]) => <div key={t}>{t}: {why || '—'}</div>)}</>
          )} />
      </div>

      <h3 className={s.sectionH}>พรุ่งนี้ดูตัวไหน<small>ห่าง High รอบปี ≤ 3% · เหนือ EMA10 &lt; 1% · เข้าใหม่วันนี้</small></h3>
      <WatchGrid testid="gr-watch" empty={watch.length === 0}>
        {watch.map(({ row: r, reasons }) => (
          <CompactCard
            key={r.ticker} testid="gr-watch-card" ticker={r.ticker} close={r.close} chg={r.chg_pct}
            tags={<><StatusTag status={r.status} seenBefore={r.seen_before} /><StaleTag stale={r.price_stale} barDate={r.bar_date} /><InScans scans={r.in_scans} exclude="growth" asTag /><EventTags events={r.events} /></>}
            sub={reasons.map(x => GROWTH_REASON_LABEL[x]).join(' · ')}
            facts={[
              ['vs EMA10', <>{r.vs_ema10 != null ? `${r.vs_ema10 >= 0 ? '+' : ''}${r.vs_ema10.toFixed(2)}` : '-'} ({pct1(r.vs_ema10_pct)})</>],
              ['ห่าง High', pct1(r.pct_from_52w_high)],
              [`Profit Gr (QoQY) ${quarterShort(r.growth_quarter_end) ?? ''}`.trim(), pct1(r.profit_gr_q_yoy).replace('+', '')],
            ]}
            watch={r.watch}
          />
        ))}
      </WatchGrid>

      <FullListLink href={g.page} n={g.counts.total} label="หน้า Lekkung Growth" />
      <Fold title="วิธีอ่าน · เกณฑ์">
        <p><b>พรุ่งนี้ดูตัวไหน:</b> ตัวที่ห่าง High รอบปีไม่เกิน 3% หรือเหนือ EMA10 ไม่ถึง 1% หรือเพิ่งเข้าสแกนวันนี้ (ตัวเดียวเข้าหลายเกณฑ์แสดงครั้งเดียว)</p>
        <p><b>เข้าใหม่ (NEW) / หลุด:</b> ตามหน้า /lekkung · ตัวเล็กสีเทา &ldquo;เคยอยู่ล่าสุด&rdquo; = ข้อมูลเสริมจากประวัติ {g.lookback_days} วันทำการ</p>
        <p><b>รายได้:</b> {fyShort(g.rows[0]?.rev_gr_period) ?? '—'} · <b>กำไรไตรมาสล่าสุด:</b> {quarterShort(g.rows[0]?.growth_quarter_end) ?? '—'} · ราคาปิดวันสแกน {shortDate(g.date)} <N>{fmtNum(g.rows[0]?.close)}</N> (ตัวอย่างแถวแรก)</p>
      </Fold>
    </section>
  );
}
