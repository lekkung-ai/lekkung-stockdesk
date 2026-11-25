'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { shortDate, fmtNum } from '@/lib/dailyReport';
import { type StageSection, type StageMove, sumStages, shareOf } from '@/lib/dailyReportTabs';
import { N, Pct, Price, StaleTag, NoData, Verdict, StatCard, StockCard, Fold } from './shared';
import s from './DailyReport.module.css';

const STAGE_COLOR: Record<string, string> = {
  Accumulation: '#7fb5e3', Recovery: '#9fd3f5', Bull: '#3d9e63', 'S.Bull': '#5fd08a',
  Warning: '#d9a425', Distribution: '#d96b25', Bear: '#ff8780', IPO: '#8a97a0',
};
const GROUP_NOTE: Record<string, string> = {
  base: 'สะสม / ฟื้นตัว — โซนเฝ้าหาจุดเข้า',
  strong: 'แข็งแรงสุด แต่ไม่ใช่จุดเข้าใหม่',
  weak: 'เริ่มอ่อนแรง / แจกของ',
  bear: 'ขาลง',
};

function Delta({ v }: { v: number | null }) {
  if (v == null) return null;
  if (v === 0) return <span className={s.flat}> ±0</span>;
  return <span className={v > 0 ? s.pos : s.neg}> {v > 0 ? `+${v}` : `−${-v}`}</span>;
}

function Move({ m }: { m: StageMove }) {
  return <><span style={{ color: STAGE_COLOR[m.from] }}>{m.from}</span> → <b style={{ color: STAGE_COLOR[m.to] }}>{m.to}</b></>;
}

function MoveTable({ rows, testid }: { rows: StageMove[]; testid: string }) {
  return (
    <div className={s.tableShell}>
      <table className={s.table} data-testid={testid}>
        <thead>
          <tr>
            <th className={s.stk}>หุ้น</th><th>จาก → ไป</th><th className={s.r}>%วันนี้</th>
            <th className={s.r}>ราคา / EMA200</th><th className={s.r}>ADTV 50 วัน (ลบ.)</th>
            <th className={s.r}>P/E</th><th className={s.r}>ROE</th><th className={s.r}>เปลี่ยน stage ใน 5 วัน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.ticker} className={m.to_bear ? s.rowBear : undefined} data-testid={`${testid}-row`}>
              <td className={s.stk}>
                <Link href={`/stock/${m.ticker}`} className={`${s.tk} ${s.num}`}>{m.ticker}</Link>
                {m.is_fund && <span className={`${s.tag} ${s.tStay}`}>กองทุน/REIT</span>}
                <StaleTag stale={m.price_stale} barDate={m.bar_date} />
              </td>
              <td><Move m={m} /></td>
              <td className={s.r}><Pct v={m.chg_pct} /></td>
              <td className={s.r}><Price v={m.price} /> <span className={s.muted}>/ <N>{fmtNum(m.ema200)}</N></span><span className={s.ls}><Pct v={m.vs_ema200_pct} /></span></td>
              <td className={s.r}><N>{fmtNum(m.adtv_mb, 1)}</N></td>
              <td className={s.r}><N>{fmtNum(m.pe, 1)}</N></td>
              <td className={s.r}><N>{m.roe_pct == null ? '—' : `${m.roe_pct.toFixed(1)}%`}</N></td>
              <td className={s.r}><N>{m.flips_5d}</N> ครั้ง</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StageTab({ ms }: { ms: StageSection | null }) {
  const [stage, setStage] = useState<string | null>(null);
  if (!ms) return <NoData />;
  const total = ms.total_stock; // ยอดหุ้นสามัญชุดเดียวกันทุกจุด
  const st = ms.counts.stock;
  const stPrev = ms.counts_prev?.stock;
  const baseStages = new Set(ms.focus_rule.stages);
  const watchRows = ms.focus.filter(m => m.watch);
  const thin = ms.focus.filter(m => !m.watch);
  const cardRows = watchRows.filter(m => baseStages.has(m.to)); // ย้ายเข้ากลุ่มสะสม/ฟื้นตัว + สภาพคล่องดี
  const summarySum = ms.summary.reduce((a, x) => a + x.count, 0);
  const grouped = new Set(ms.groups.flatMap(g => g.stages));
  const extra = ms.stage_order.filter(k => !grouped.has(k) && (st[k] ?? 0) > 0);
  const cardsSum = ms.groups.reduce((a, g) => a + sumStages(st, g.stages), 0);
  const extraSum = extra.reduce((a, k) => a + (st[k] ?? 0), 0);
  const active = stage ?? ms.stage_order.find(k => (ms.lists[k]?.count ?? 0) > 0) ?? null;
  const list = active ? ms.lists[active] : null;
  const fundParts = ms.stage_order.filter(k => (ms.counts.fund[k] ?? 0) > 0).map(k => `${k} ${ms.counts.fund[k]}`);

  return (
    <section data-testid="dr-stage">
      <h2 className={s.tabTitle}>Market Stage</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(ms.date)} · <b>เทียบกับ: {shortDate(ms.compared_to)}</b> · หุ้นสามัญ <N>{total}</N> ตัว (กองทุน/REIT แยกนับ) · <Link href={ms.page}>เปิดหน้าสแกน ↗</Link>
      </p>
      <Verdict text={ms.headline} />

      <div className={s.statCards} data-testid="stage-cards">
        {ms.groups.map(g => {
          const n = sumStages(st, g.stages);
          const d = stPrev ? n - sumStages(stPrev, g.stages) : null;
          return (
            <StatCard key={g.key} testid="stage-card" count={n} big={<>{n}<Delta v={d} /></>}
              label={<>{g.label} · <span className={s.num}>{shareOf(n, total).toFixed(1)}%</span><br />{GROUP_NOTE[g.key]}</>} />
          );
        })}
      </div>
      <p className={s.extraLine} data-testid="stage-extra" data-sum={cardsSum + extraSum}>
        {extra.length > 0 && <>+ {extra.map(k => `${k} ${st[k]} ตัว`).join(' · ')} · </>}รวมหุ้นสามัญ <N>{cardsSum + extraSum}</N> ตัว
      </p>

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

      <h3 className={s.sectionH}>ย้ายเข้า/ออก Accumulation · Recovery วันนี้<small><N>{ms.focus.length}</N> ตัว จากการย้ายทั้งหมด <N>{ms.transitions_total}</N></small></h3>
      <p className={s.tableNote}>สภาพคล่องดี = ADTV ≥ <N>{ms.focus_rule.watch_min_adtv_mb}</N> ลบ. และราคา ≥ <N>{ms.focus_rule.watch_min_price}</N> บาท · พื้นแดง = ตกลง Bear · รวมกองทุน/REIT (มีป้ายกำกับ)</p>
      {watchRows.length ? <MoveTable rows={watchRows} testid="stage-focus" /> : <p className={s.tableNote}>ไม่มีตัวที่สภาพคล่องดี</p>}
      {thin.length > 0 && (
        <details className={`${s.card} ${s.fold}`} data-testid="stage-thin">
          <summary>สภาพคล่องต่ำ / หุ้นสตางค์ <N>{thin.length}</N> ตัว</summary>
          <MoveTable rows={thin} testid="stage-thin-table" />
        </details>
      )}

      {cardRows.length > 0 && (
        <>
          <h3 className={s.sectionH}>การ์ดรายตัว<small>ย้ายเข้ากลุ่มสะสม/ฟื้นตัว และสภาพคล่องดี</small></h3>
          <div className={s.cards} data-testid="stage-cards-list">
            {cardRows.map(m => (
              <StockCard
                key={m.ticker} id={`m-${m.ticker}`} testid="stage-stock-card" ticker={m.ticker} close={m.price} chg={m.chg_pct}
                tags={<>{m.is_fund && <span className={`${s.tag} ${s.tStay}`}>กองทุน/REIT</span>}<StaleTag stale={m.price_stale} barDate={m.bar_date} /></>}
                sub={<Move m={m} />}
                right={{
                  title: 'Stage',
                  rows: [
                    ['ราคา / EMA200', <><N>{fmtNum(m.price)}</N> / <N>{fmtNum(m.ema200)}</N> (<Pct v={m.vs_ema200_pct} />)</>],
                    ['ADTV 50 วัน', <><N>{fmtNum(m.adtv_mb, 1)}</N> ลบ.</>],
                    ['P/E · ROE', <><N>{fmtNum(m.pe, 1)}</N> · <N>{m.roe_pct == null ? '—' : `${m.roe_pct.toFixed(1)}%`}</N></>],
                    ['เปลี่ยน stage ใน 5 วัน', <><N>{m.flips_5d}</N> ครั้ง</>],
                  ],
                }}
                watch={m.notes}
              />
            ))}
          </div>
        </>
      )}

      <h3 className={s.sectionH}>การย้ายกลุ่มอื่น<small><N>{summarySum}</N> ตัว · รวมกับตารางด้านบน = <N>{ms.focus.length + summarySum}</N> / <N>{ms.transitions_total}</N></small></h3>
      <div className={s.tableShell}>
        <table className={`${s.table} ${s.tableSm}`} data-testid="stage-summary">
          <thead><tr><th>จาก → ไป</th><th className={s.r}>จำนวน</th><th>ตัวอย่าง (ADTV สูงสุด)</th></tr></thead>
          <tbody>
            {ms.summary.map(x => (
              <tr key={x.from + x.to}>
                <td><span style={{ color: STAGE_COLOR[x.from] }}>{x.from}</span> → <b style={{ color: STAGE_COLOR[x.to] }}>{x.to}</b></td>
                <td className={s.r}><N>{x.count}</N></td>
                <td className={s.num}>{x.examples.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className={s.sectionH}>รายชื่อตาม Stage<small>หุ้นสามัญ · <N>{ms.list_limit}</N> ตัวแรก เรียงตามวันใน stage มาก → น้อย (เหมือนหน้า Market Stage)</small></h3>
      <div className={s.controls}>
        {ms.stage_order.map(k => {
          const n = ms.lists[k]?.count ?? 0;
          return (
            <button key={k} type="button" className={s.filter} aria-pressed={active === k} disabled={n === 0}
              title={n === 0 ? 'ไม่มีหุ้นสามัญใน stage นี้วันนี้' : undefined}
              onClick={() => setStage(k)} data-testid={`stage-filter-${k}`} data-count={n}>
              {k}<span className={`${s.cnt} ${s.num}`}>{n}</span>
            </button>
          );
        })}
      </div>
      {list && active && (
        <>
          <div className={s.tableShell}>
            <table className={`${s.table} ${s.tableSm}`} data-testid="stage-list">
              <thead><tr><th className={s.stk}>หุ้น</th><th className={s.r}>วันใน stage</th><th className={s.r}>ราคา</th><th className={s.r}>ADTV 50 วัน (ลบ.)</th><th className={s.r}>ห่าง High รอบปี</th></tr></thead>
              <tbody>
                {list.rows.map(r => (
                  <tr key={r.ticker} data-testid="stage-list-row">
                    <td className={s.stk}><Link href={`/stock/${r.ticker}`} className={`${s.tk} ${s.num}`}>{r.ticker}</Link><StaleTag stale={r.price_stale} barDate={r.bar_date} /></td>
                    <td className={s.r}><N>{r.days_in_stage ?? '—'}</N></td>
                    <td className={s.r}><Price v={r.price} /></td>
                    <td className={s.r}><N>{fmtNum(r.adtv_mb, 1)}</N></td>
                    <td className={s.r}><Pct v={r.pct_from_52w_high ?? null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.tableNote} data-testid="stage-list-note">
            แสดง <N>{list.rows.length}</N> จาก <N>{list.count}</N> ตัวใน {active}
            {(active === 'Bull' || active === 'S.Bull') && ' · Bull/S.Bull = แข็งแรงสุด แต่ไม่ใช่จุดเข้าใหม่'}
            {' '}· ดูครบที่ <Link href={ms.page}>หน้า Market Stage</Link>
          </p>
        </>
      )}
      {ms.price_stale.length > 0 && (
        <p className={s.tableNote}>⚠️ ราคาค้าง <N>{ms.price_stale.length}</N> ตัวในชุดนี้ (ไม่มีแท่งราคาของวันสแกน) — ราคาในตารางเป็นราคาจากไฟล์สแกน</p>
      )}

      <Fold title="แหล่งข้อมูล · เกณฑ์">
        <p><b>Stage:</b> ไฟล์ market_stage.json ของ StockDesk · กองทุน/REIT แยกนับจากหุ้นสามัญเสมอ</p>
        <p><b>เปลี่ยน stage ใน 5 วัน:</b> จำนวนครั้งที่ stage เปลี่ยนระหว่างวันสแกนติดกัน ใน 5 วันสแกนล่าสุด</p>
      </Fold>
    </section>
  );
}
