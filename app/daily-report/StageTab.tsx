'use client';

import React from 'react';
import { shortDate, fmtNum } from '@/lib/dailyReport';
import { type StageSection, type StageMove, stageWatchLists, shareOf } from '@/lib/dailyReportTabs';
import { N, Pct, StaleTag, NoData, Verdict, CountLine, CompactCard, WatchGrid, FullListLink, Fold } from './shared';
import s from './DailyReport.module.css';

const STAGE_COLOR: Record<string, string> = {
  Accumulation: '#7fb5e3', Recovery: '#9fd3f5', Bull: '#3d9e63', 'S.Bull': '#5fd08a',
  Warning: '#d9a425', Distribution: '#d96b25', Bear: '#ff8780', IPO: '#8a97a0',
};

function MoveCards({ rows, testid }: { rows: StageMove[]; testid: string }) {
  return (
    <WatchGrid testid={testid} empty={rows.length === 0}>
      {rows.map(m => (
        <CompactCard
          key={m.ticker} testid={`${testid}-card`} ticker={m.ticker} close={m.price} chg={m.chg_pct}
          tags={<>{m.is_fund && <span className={s.tag}>กองทุน/REIT</span>}<StaleTag stale={m.price_stale} barDate={m.bar_date} /></>}
          sub={<><span style={{ color: STAGE_COLOR[m.from] }}>{m.from}</span> → <b style={{ color: STAGE_COLOR[m.to] }}>{m.to}</b></>}
          facts={[
            ['EMA200', <>{fmtNum(m.ema200)} (<Pct v={m.vs_ema200_pct} />)</>],
            ['ADTV 50 วัน', <>{fmtNum(m.adtv_mb, 1)} ลบ.</>],
            ['เปลี่ยน stage ใน 5 วัน', `${m.flips_5d} ครั้ง`],
          ]}
          watch={m.notes}
        />
      ))}
    </WatchGrid>
  );
}

export default function StageTab({ ms }: { ms: StageSection | null }) {
  if (!ms) return <NoData />;
  const total = ms.total_stock; // ยอดหุ้นสามัญชุดเดียวกันทุกจุด
  const st = ms.counts.stock;
  const { entered, fellToBear } = stageWatchLists(ms);
  const fundParts = ms.stage_order.filter(k => (ms.counts.fund[k] ?? 0) > 0).map(k => `${k} ${ms.counts.fund[k]}`);

  return (
    <section data-testid="dr-stage">
      <h2 className={s.tabTitle}>Market Stage</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(ms.date)} · <b>เทียบกับ: {shortDate(ms.compared_to)}</b>
      </p>
      <Verdict text={ms.headline} />
      <CountLine parts={[{ label: 'หุ้นสามัญ', value: total }, { label: 'ย้าย stage วันนี้', value: ms.transitions_total }, { label: 'กองทุน/REIT (แยกนับ)', value: ms.total_fund }]} />

      <div className={`${s.card} ${s.barCard}`}>
        <div className={s.stageBar} data-testid="stage-bar">
          {ms.stage_order.map(k => (st[k] ?? 0) > 0 && (
            <i key={k} data-count={st[k]} title={`${k} ${st[k]} (${shareOf(st[k], total).toFixed(1)}%)`}
              style={{ width: `${shareOf(st[k], total)}%`, background: STAGE_COLOR[k] }} className={s.num}>
              {shareOf(st[k], total) >= 6 ? st[k] : ''}
            </i>
          ))}
        </div>
        <div className={s.legend} data-testid="stage-legend">
          {ms.stage_order.map(k => (
            <span key={k} data-count={st[k] ?? 0}>
              <i style={{ background: STAGE_COLOR[k] }} />{k} <b className={s.num}>{st[k] ?? 0}</b> <span className={s.num}>{shareOf(st[k] ?? 0, total).toFixed(1)}%</span>
            </span>
          ))}
        </div>
        <p className={s.fundLine} data-testid="stage-funds">
          กองทุน/REIT <N>{ms.total_fund}</N> ตัว (ไม่รวมในตัวเลขด้านบน){fundParts.length > 0 && <>: {fundParts.join(' · ')}</>}
        </p>
      </div>

      <h3 className={s.sectionH}>พรุ่งนี้ดูตัวไหน<small>เฉพาะสภาพคล่องดี: ADTV ≥ <N>{ms.focus_rule.watch_min_adtv_mb}</N> ลบ. และราคา ≥ <N>{ms.focus_rule.watch_min_price}</N> บาท</small></h3>
      <h4 className={s.subH} data-testid="stage-entered-h">เพิ่งเข้ากลุ่มสะสม/ฟื้นตัว<small><N>{entered.length}</N> ตัว</small></h4>
      <MoveCards rows={entered} testid="stage-entered" />
      <h4 className={s.subH} data-testid="stage-fell-h">หลุดลงขาลง<small><N>{fellToBear.length}</N> ตัว</small></h4>
      <MoveCards rows={fellToBear} testid="stage-fell" />

      <FullListLink href={ms.page} n={total} label="หน้า Market Stage" />
      <Fold title="วิธีอ่าน · เกณฑ์">
        <p><b>Stage:</b> ไฟล์ market_stage.json ของ StockDesk · กองทุน/REIT แยกนับจากหุ้นสามัญเสมอ · Bull/S.Bull = แข็งแรงสุด แต่ไม่ใช่จุดเข้าใหม่</p>
        <p><b>เพิ่งเข้ากลุ่มสะสม/ฟื้นตัว:</b> ย้ายเข้า Accumulation หรือ Recovery จากนอกกลุ่ม · <b>หลุดลงขาลง:</b> ย้ายจาก Accumulation/Recovery ลง Bear</p>
        <p><b>เปลี่ยน stage ใน 5 วัน:</b> จำนวนครั้งที่ stage เปลี่ยนระหว่างวันสแกนติดกัน ใน 5 วันสแกนล่าสุด</p>
      </Fold>
    </section>
  );
}
