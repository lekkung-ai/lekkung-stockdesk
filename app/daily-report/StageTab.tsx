'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { shortDate, fmtNum } from '@/lib/dailyReport';
import { type StageSection, type StageMove, sumStages, shareOf } from '@/lib/dailyReportTabs';
import { Calc, Pct, StaleTag, NoData, Phase2Box } from './shared';
import s from './DailyReport.module.css';

const STAGE_COLOR: Record<string, string> = {
  Accumulation: '#a78bfa', Recovery: '#60a5fa', Bull: '#34d399', 'S.Bull': '#10b981',
  Warning: '#fbbf24', Distribution: '#f97316', Bear: '#f87171', IPO: '#94a3b8',
};
const GROUP_NOTE: Record<string, string> = {
  base: 'สะสม / ฟื้นตัว — โซนเฝ้าหาจุดเข้า',
  strong: 'แข็งแรงสุด แต่ไม่ใช่จุดเข้าใหม่',
  weak: 'เริ่มอ่อนแรง / แจกของ',
  bear: 'ขาลง',
};

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className={s.flat}>—</span>;
  if (v === 0) return <span className={s.flat}>±0</span>;
  return <span className={v > 0 ? s.pos : s.neg}>{v > 0 ? `+${v}` : `−${-v}`}</span>;
}

function MoveTable({ rows, testid }: { rows: StageMove[]; testid: string }) {
  return (
    <div className={s.tshell}>
      <table className={s.table} data-testid={testid}>
        <thead>
          <tr>
            <th className={s.stk}>หุ้น</th>
            <th>จาก → ไป</th>
            <th className={s.r}>%วันนี้</th>
            <th className={s.r}>ราคา vs EMA200<Calc /></th>
            <th className={s.r}>ADTV 50 วัน (ลบ.)</th>
            <th className={s.r}>P/E</th>
            <th className={s.r}>ROE</th>
            <th className={s.r} title="จำนวนครั้งที่ stage เปลี่ยนใน 5 วันสแกนล่าสุด">เหวี่ยงใน 5 วัน<Calc /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.ticker} className={m.to_bear ? s.rowBear : undefined} data-testid={`${testid}-row`}>
              <td className={s.stk}>
                <Link href={`/stock/${m.ticker}`} className={s.tk}>{m.ticker}</Link>
                {m.is_fund && <span className={`${s.tag} ${s.tStay}`}>กองทุน/REIT</span>}
                <StaleTag stale={m.price_stale} barDate={m.bar_date} />
              </td>
              <td><span style={{ color: STAGE_COLOR[m.from] }}>{m.from}</span> → <b style={{ color: STAGE_COLOR[m.to] }}>{m.to}</b></td>
              <td className={s.r}><Pct v={m.chg_pct} /></td>
              <td className={s.r}>
                <span className={s.price}>{fmtNum(m.price)}</span> <span className={s.flat}>/ {fmtNum(m.ema200)}</span>
                <span className={s.ls}><Pct v={m.vs_ema200_pct} /></span>
              </td>
              <td className={s.r}>{fmtNum(m.adtv_mb, 1)}</td>
              <td className={s.r}>{fmtNum(m.pe, 1)}</td>
              <td className={s.r}>{m.roe_pct == null ? '—' : `${m.roe_pct.toFixed(1)}%`}</td>
              <td className={s.r}>{m.flips_5d}</td>
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
  const watch = ms.focus.filter(m => m.watch);
  const thin = ms.focus.filter(m => !m.watch);
  const summarySum = ms.summary.reduce((a, x) => a + x.count, 0);
  const active = stage ?? ms.stage_order.find(k => (ms.lists[k]?.count ?? 0) > 0) ?? null;
  const list = active ? ms.lists[active] : null;
  const fundParts = ms.stage_order.filter(k => (ms.counts.fund[k] ?? 0) > 0).map(k => `${k} ${ms.counts.fund[k]}`);

  return (
    <section data-testid="dr-stage">
      <h2 className={s.tabTitle}>Market Stage</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(ms.date)} · <b>เทียบกับ: {shortDate(ms.compared_to)}</b> · หุ้นสามัญ {total} ตัว (กองทุน/REIT แยกนับ) · <Link href={ms.page}>เปิดหน้าสแกน ↗</Link>
      </p>

      <div className={s.stats} data-testid="stage-cards">
        {ms.groups.map(g => {
          const n = sumStages(st, g.stages);
          const d = stPrev ? n - sumStages(stPrev, g.stages) : null;
          return (
            <div key={g.key} className={`${s.card} ${s.stat}`} data-testid="stage-card" data-count={n}>
              <div className={s.big}>{n} <span className={s.bigOf}><Delta v={d} /></span></div>
              <div className={s.lbl}>{g.label} · {shareOf(n, total).toFixed(1)}% ของหุ้นสามัญ</div>
              <div className={s.lblSub}>{GROUP_NOTE[g.key]}</div>
            </div>
          );
        })}
      </div>

      <div className={`${s.card} ${s.barCard}`}>
        <div className={s.stackBar} data-testid="stage-bar">
          {ms.stage_order.map(k => (st[k] ?? 0) > 0 && (
            <i key={k} data-count={st[k]} title={`${k} ${st[k]} (${shareOf(st[k], total).toFixed(1)}%)`}
              style={{ width: `${shareOf(st[k], total)}%`, background: STAGE_COLOR[k] }} />
          ))}
        </div>
        <div className={s.legend} data-testid="stage-legend">
          {ms.stage_order.map(k => (
            <span key={k} data-count={st[k] ?? 0}>
              <i style={{ background: STAGE_COLOR[k] }} />{k} <b>{st[k] ?? 0}</b> <span className={s.flat}>{shareOf(st[k] ?? 0, total).toFixed(1)}%</span>
            </span>
          ))}
        </div>
        <p className={s.lblSub} data-testid="stage-funds">
          กองทุน/REIT {ms.total_fund} ตัว (ไม่รวมในตัวเลขด้านบน){fundParts.length > 0 && <>: {fundParts.join(' · ')}</>}
        </p>
      </div>

      <h3 className={s.sec}>ย้าย Stage วันนี้ — เข้า/ออก Accumulation · Recovery<small>{ms.focus.length} ตัว จากการย้ายทั้งหมด {ms.transitions_total}</small></h3>
      <p className={s.note}>
        น่าดู = ADTV ≥ {ms.focus_rule.watch_min_adtv_mb} ลบ. และราคา ≥ {ms.focus_rule.watch_min_price} บาท · พื้นแดง = ตกลง Bear · รวมกองทุน/REIT (มีป้ายกำกับ)
      </p>
      {watch.length ? <MoveTable rows={watch} testid="stage-focus" /> : <p className={s.note}>ไม่มีตัวที่น่าดู</p>}
      {thin.length > 0 && (
        <details className={`${s.card} ${s.fold}`} data-testid="stage-thin">
          <summary>สภาพคล่องต่ำ / หุ้นสตางค์ {thin.length} ตัว</summary>
          <MoveTable rows={thin} testid="stage-thin-table" />
        </details>
      )}

      <h3 className={s.sec}>การย้ายกลุ่มอื่น<small>{summarySum} ตัว · รวมกับตารางด้านบน = {ms.focus.length + summarySum} / {ms.transitions_total}</small></h3>
      <div className={s.tshell}>
        <table className={`${s.table} ${s.tableSm}`} data-testid="stage-summary">
          <thead><tr><th>จาก → ไป</th><th className={s.r}>จำนวน</th><th>ตัวอย่าง (ADTV สูงสุด)</th></tr></thead>
          <tbody>
            {ms.summary.map(x => (
              <tr key={x.from + x.to}>
                <td><span style={{ color: STAGE_COLOR[x.from] }}>{x.from}</span> → <b style={{ color: STAGE_COLOR[x.to] }}>{x.to}</b></td>
                <td className={s.r}>{x.count}</td>
                <td>{x.examples.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className={s.sec}>รายชื่อตาม Stage<small>หุ้นสามัญ · {ms.list_limit} ตัวแรก เรียงจากเพิ่งเข้า stage (วันใน stage น้อย → มาก)</small></h3>
      <div className={s.controls}>
        {ms.stage_order.map(k => {
          const n = ms.lists[k]?.count ?? 0;
          return (
            <button key={k} type="button" className={s.f} aria-pressed={active === k} disabled={n === 0}
              title={n === 0 ? 'ไม่มีหุ้นสามัญใน stage นี้วันนี้' : undefined}
              onClick={() => setStage(k)} data-testid={`stage-filter-${k}`} data-count={n}>
              {k} <span className={s.n}>{n}</span>
            </button>
          );
        })}
      </div>
      {list && active && (
        <>
          <div className={s.tshell}>
            <table className={`${s.table} ${s.tableSm}`} data-testid="stage-list">
              <thead>
                <tr><th className={s.stk}>หุ้น</th><th className={s.r}>วันใน stage</th><th className={s.r}>ราคา</th><th className={s.r}>ADTV 50 วัน (ลบ.)</th><th className={s.r}>% ห่าง 52W High<Calc /></th></tr>
              </thead>
              <tbody>
                {list.rows.map(r => (
                  <tr key={r.ticker} data-testid="stage-list-row">
                    <td className={s.stk}><Link href={`/stock/${r.ticker}`} className={s.tk}>{r.ticker}</Link><StaleTag stale={r.price_stale} barDate={r.bar_date} /></td>
                    <td className={s.r}>{r.days_in_stage ?? '—'}</td>
                    <td className={`${s.r} ${s.price}`}>{fmtNum(r.price)}</td>
                    <td className={s.r}>{fmtNum(r.adtv_mb, 1)}</td>
                    <td className={s.r}><Pct v={r.pct_from_52w_high ?? null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.note} data-testid="stage-list-note">
            แสดง {list.rows.length} จาก {list.count} ตัวใน {active}
            {(active === 'Bull' || active === 'S.Bull') && ' · Bull/S.Bull = แข็งแรงสุด แต่ไม่ใช่จุดเข้าใหม่'}
            {' '}· ดูครบที่ <Link href={ms.page}>หน้า Market Stage</Link>
          </p>
        </>
      )}
      {ms.price_stale.length > 0 && (
        <p className={s.note}>⚠️ ราคาค้าง {ms.price_stale.length} ตัวในชุดนี้ (ไม่มีแท่งราคาของวันสแกน) — ราคาในตารางเป็นราคาจากไฟล์สแกน</p>
      )}

      <Phase2Box><span className={s.p2}>เฟส 2</span> การ์ดรายตัว (ข่าว · งบ · เป้าโบรก)</Phase2Box>
    </section>
  );
}
