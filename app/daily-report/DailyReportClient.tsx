'use client';

// /daily-report เฟส 1 — แถบตลาด + แท็บ Daytrade · ข้อมูลทั้งหมดมาจาก data/scans/daily_report.json
// (scripts/build_daily_report.py) ที่ import ตอน build → หน้า static ไม่อ่านไฟล์ตอน request
// ห้ามมีชื่อหุ้น วันที่ หรือจำนวนตายตัวในไฟล์นี้ — ทุกค่ามาจากไฟล์ข้อมูล

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import rawReport from '@/data/scans/daily_report.json';
import rawGeneratedAt from '@/data/scans/generated_at.json';
import {
  type DailyReport, type CalendarItem, type DtRow, type DtFilter, type RvTier,
  DT_FILTERS, DT_FILTER_LABELS, STATUS_LABEL, RV_LABEL, CLOSE_POS_LABEL, TRIGGER_LABEL, SCAN_LABEL,
  matchFilter, matchQuery, filterCounts, shortDate, longDate, hhmm, fmtNum, fmtPct, fmtShares, pctClass,
  calendarFor, calendarText, splitCalendar, latestScanDate,
} from '@/lib/dailyReport';
import s from './DailyReport.module.css';

const REPORT = rawReport as unknown as DailyReport;
const LATEST_SCAN = latestScanDate(rawGeneratedAt as Record<string, unknown>);

type TabKey = 'daytrade' | 'growth' | 'sepa' | 'stage';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'daytrade', label: 'Daytrade' },
  { key: 'growth', label: 'Lekkung Growth' },
  { key: 'sepa', label: 'SEPA' },
  { key: 'stage', label: 'Market Stage' },
];

const Calc = ({ children = 'คำนวณ', title }: { children?: React.ReactNode; title?: string }) => (
  <span className={s.calc} title={title}>{children}</span>
);

function Pct({ v }: { v: number | null | undefined }) {
  return <span className={s[pctClass(v)]}>{fmtPct(v)}</span>;
}

function StatusTag({ status }: { status: DtRow['status'] }) {
  const cls = status === 'new' ? s.tNew : status === 'reentry' ? s.tRe : s.tStay;
  return <span className={`${s.tag} ${cls}`}>{STATUS_LABEL[status]}</span>;
}

function rvClass(t: RvTier | null) {
  return t === 'hi' ? s.rvHi : t === 'mid' ? s.rvMid : s.rvLo;
}

function Sparkline({ closes }: { closes: DtRow['closes_7d'] }) {
  if (closes.length < 2) return null;
  const p = closes.map(c => c.close);
  const w = 300, h = 40, pad = 3;
  const mn = Math.min(...p), mx = Math.max(...p), rg = mx - mn || 1;
  const pts = p
    .map((v, i) => `${(pad + (i * (w - 2 * pad)) / (p.length - 1)).toFixed(1)},${(h - pad - ((v - mn) / rg) * (h - 2 * pad)).toFixed(1)}`)
    .join(' ');
  const col = p[p.length - 1] >= p[0] ? 'var(--green)' : 'var(--red)';
  return (
    <div className={s.spark}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
      </svg>
      <div className={s.cap}>
        ราคาปิด {p.length} วันทำการ ({shortDate(closes[0].date)} – {shortDate(closes[closes.length - 1].date)}) · {fmtNum(p[0])} → {fmtNum(p[p.length - 1])}
      </div>
    </div>
  );
}

function PriceWarn({ r }: { r: DtRow }) {
  if (r.price_stale) {
    return <span className={`${s.tag} ${s.tWarn}`} title={`แท่งราคาล่าสุด ${r.bar_date ?? '—'} ไม่ใช่วันสแกน`}>⚠️ ราคาค้าง</span>;
  }
  if (r.price_check === 'mismatch') {
    return <span className={`${s.tag} ${s.tWarn}`} title="ราคาจากกราฟ 30 วันไม่ตรงกับไฟล์สแกน">⚠️ ราคาไม่ตรงสแกน</span>;
  }
  return null;
}

function TriggerCell({ r }: { r: DtRow }) {
  if (r.price_stale || r.trigger_kind == null) return <span className={s.flat}>—</span>;
  return (
    <>
      {r.trigger != null ? fmtNum(r.trigger) : <span className={s.flat}>—</span>}
      <span className={s.ls}>{TRIGGER_LABEL[r.trigger_kind]}</span>
    </>
  );
}

function StockCard({ r, rep, flash }: { r: DtRow; rep: DailyReport; flash: boolean }) {
  const cal = calendarFor(rep.calendar.items, r.ticker);
  const vMark = r.rv_tier === 'hi' ? [s.ok, '✓'] : r.rv_tier === 'mid' ? [s.mid, '~'] : [s.bad, '✗'];
  const pOk = (r.chg_pct ?? 0) > 0;
  const lookback = rep.daytrade?.lookback_days;
  return (
    <article className={`${s.card} ${s.sc} ${flash ? s.scFlash : ''}`} id={`c-${r.ticker}`} data-testid="dr-card" data-ticker={r.ticker}>
      <div className={s.scTop}>
        <div>
          <h3>
            <Link href={`/stock/${r.ticker}`}>{r.ticker}</Link> <StatusTag status={r.status} />
            {cal.map(c => <span key={c.date + c.type} className={`${s.tag} ${s.tXd}`} title={c.note}>{calendarText(c)}</span>)}
            <PriceWarn r={r} />
          </h3>
          <div className={s.meta}>
            {r.status === 'reentry' && <>ล่าสุดในสแกน {shortDate(r.last_seen)} · </>}
            {r.status === 'stay' && <>อยู่ในสแกนติดกัน {r.streak_days} วัน · </>}
            {r.status === 'new' && <>ไม่อยู่ในสแกนตลอด {lookback} วันทำการ · </>}
            อยู่ใน: {r.in_scans.map(k => SCAN_LABEL[k] ?? k).join(' · ')}
          </div>
          {r.events.length > 0 && (
            <div className={s.meta}>ป้ายข่าว: {r.events.map(e => e.label).join(' · ')}</div>
          )}
        </div>
        <div className={s.px}>
          <b className={s.price}>{fmtNum(r.close)}</b>
          <div><Pct v={r.chg_pct} /></div>
        </div>
      </div>
      <div className={s.kpis}>
        <span className={s.kpi}>RelVol<b>{fmtNum(r.rel_vol)}</b></span>
        <span className={s.kpi}>มูลค่า<b>{fmtNum(r.value_mb, 1)}</b> ลบ. <Calc />{r.thin && <span className={`${s.tag} ${s.tWarn}`}>เงินบาง</span>}</span>
        <span className={s.kpi}>วัน (รอบนี้)<b>{r.streak_days}</b></span>
        <span className={s.kpi}>RSI7<b>{fmtNum(r.rsi7, 1)}</b></span>
      </div>
      {!r.price_stale && <Sparkline closes={r.closes_7d} />}
      <div className={s.lines}>
        <p>
          <span className={pOk ? s.ok : s.bad}>{pOk ? '✓' : '✗'} P</span> ปิด <Pct v={r.chg_pct} />
          {r.close_position && <> {CLOSE_POS_LABEL[r.close_position]}</>}
          {!r.price_stale && <> (เปิด {fmtNum(r.open)} · Low {fmtNum(r.low)} · High {fmtNum(r.high)})</>}
          {r.trigger_kind === 'close_30d_high' && <> · ปิดสูงสุดในรอบ 30 วัน</>}
        </p>
        <p>
          <span className={vMark[0]}>{vMark[1]} V</span> วอลุ่ม {fmtShares(r.volume)} หุ้น = {fmtNum(r.rel_vol)} เท่าของค่าเฉลี่ย 10 วัน ({fmtShares(r.avg_vol_10d)})
        </p>
      </div>
      <div className={s.plan}>
        <p>
          ✅ <b>สนใจเมื่อ:</b>{' '}
          {r.price_stale ? (
            <>ราคาค้าง — ไม่คำนวณจุดสนใจ</>
          ) : r.trigger != null ? (
            <>ผ่าน <span className={s.lvl}>{fmtNum(r.trigger)}</span> ({r.trigger_kind ? TRIGGER_LABEL[r.trigger_kind] : ''})</>
          ) : (
            <>ทำ High ใหม่เหนือ <span className={s.lvl}>{fmtNum(r.close)}</span> (ไม่มีแนวต้านใน 30 วัน)</>
          )}
          {' '}+ ถึง 10:30 วอลุ่ม ≥ <b>{fmtShares(r.min_vol_1030)}</b> หุ้น <Calc />
        </p>
        <p>
          ❌ <b>ทิ้งเมื่อ:</b> {r.stop != null ? <>หลุด <span className={s.lvl}>{fmtNum(r.stop)}</span></> : 'ราคาค้าง — ไม่คำนวณจุดทิ้ง'} · คัท 1–2 ช่อง
        </p>
      </div>
      <div className={s.p2box}>เฟส 2 · ข่าวรายตัว · คำวินิจฉัย P-V-T · ชั้น ✅/👀/⏳</div>
    </article>
  );
}

function CalChip({ i, strong }: { i: CalendarItem; strong: boolean }) {
  return (
    <span className={strong ? s.calIn : s.calOut} title={i.note}>
      {i.ticker}{i.amount != null ? ` ${i.amount}` : ''}
      {strong && i.in_scans.map(k => <span key={k} className={s.scanTag}>{SCAN_LABEL[k] ?? k}</span>)}
    </span>
  );
}

function CalLine({ items, strong }: { items: CalendarItem[]; strong: boolean }) {
  return (
    <>
      {(['XD', 'XR'] as const).map(type => {
        const its = items.filter(i => i.type === type);
        if (!its.length) return null;
        return <span key={type} className={s.calGroup}><span className={s.calType}>{type}:</span> {its.map(i => <React.Fragment key={i.ticker + i.date}><CalChip i={i} strong={strong} />{' '}</React.Fragment>)}</span>;
      })}
    </>
  );
}

function CalendarBox({ rep }: { rep: DailyReport }) {
  const sp = splitCalendar(rep.calendar.items, rep.calendar.next_trading_day);
  const weekDates = [...new Set(sp.week.shown.map(i => i.date))];
  const hiddenDates = [...new Set(sp.week.hidden.map(i => i.date))].sort();
  const tmCount = sp.tomorrow.inScan.length + sp.tomorrow.other.length;
  return (
    <div className={s.mBox} data-testid="dr-calendar">
      <h4>ปฏิทิน XD/XR (จากป้ายข่าว SET {rep.calendar.ahead_days} วันข้างหน้า) · ตัวหนา = อยู่ในสแกนของเรา</h4>
      <div className={s.calRow}>
        <b>พรุ่งนี้ {shortDate(rep.calendar.next_trading_day)}</b>
        {tmCount === 0 ? <span className={s.flat}> ไม่มี XD/XR</span> : (
          <>
            {sp.tomorrow.inScan.length > 0 && <div className={s.calDay}><CalLine items={sp.tomorrow.inScan} strong /></div>}
            {sp.tomorrow.other.length > 0 && <div className={s.calDay}><CalLine items={sp.tomorrow.other} strong={false} /></div>}
          </>
        )}
      </div>
      <div className={s.calRow}>
        <b>ภายในสัปดาห์</b>
        {weekDates.length === 0 && <span className={s.flat}> ไม่มีหุ้นในสแกนที่ XD/XR</span>}
        {weekDates.map(d => (
          <div key={d} className={s.calDay}>
            <span className={s.calDate}>{shortDate(d)}</span> <CalLine items={sp.week.shown.filter(i => i.date === d)} strong />
          </div>
        ))}
        {sp.week.hidden.length > 0 && (
          <details className={s.calMore} data-testid="dr-cal-more">
            <summary>+ อีก {sp.week.hidden.length} ตัวที่ไม่อยู่ในสแกน</summary>
            {hiddenDates.map(d => (
              <div key={d} className={s.calDay}>
                <span className={s.calDate}>{shortDate(d)}</span> <CalLine items={sp.week.hidden.filter(i => i.date === d)} strong={false} />
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

function MarketBar({ rep }: { rep: DailyReport }) {
  const m = rep.market;
  return (
    <section className={`${s.card} ${s.market}`} data-testid="dr-market">
      <div className={s.mTop}>
        <span className={s.mDate}>{longDate(m.date)}</span>
        <span className={s.mItem}>SET <b className={s.price}>{fmtNum(m.set_close)}</b> <Pct v={m.set_chg_pct} /></span>
        <span className={s.mItem}>
          มูลค่า <b>{fmtNum(m.value_mb, 0)}</b> ลบ.{' '}
          <Calc title="ผลรวมมูลค่าของหุ้นในระบบ ไม่ใช่ตัวเลขทางการของ SET">รวมหุ้นในระบบ</Calc>
        </span>
        <span className={s.mItem} title={`ข้ามหุ้นที่ไม่มีแท่งของวันนี้ ${m.breadth.skipped_no_bar} ตัว`}>
          บวก <b className={s.pos}>{m.breadth.up}</b> · คงที่ <b>{m.breadth.flat}</b> · ลบ <b className={s.neg}>{m.breadth.down}</b> <Calc />
        </span>
        <span className={s.p2}>ธีมวันนี้ · เฟส 2</span>
      </div>
      {m.condition && (m.condition.caution ? (
        <div className={s.mAlert}>
          <span>⚠️</span>
          <span>
            <b>สภาพตลาด: {m.condition.label}</b>
            {m.condition.dd_count != null && <> · มีวันขายหนัก (Distribution Day) {m.condition.dd_count} วันในช่วง {m.condition.dd_window} วันทำการ</>}
            {m.condition.advice && <> — {m.condition.advice}</>}
          </span>
        </div>
      ) : (
        <div className={s.mInfo}>
          สภาพตลาด: <b>{m.condition.label}</b>
          {m.condition.dd_count != null && <> · DD {m.condition.dd_window} วัน: {m.condition.dd_count}</>}
        </div>
      ))}
      <div className={s.mRow}>
        <CalendarBox rep={rep} />
      </div>
    </section>
  );
}

function DaytradeTab({ rep }: { rep: DailyReport }) {
  const dt = rep.daytrade;
  const [filter, setFilter] = useState<DtFilter>('all');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const rows = useMemo(() => dt?.rows ?? [], [dt]);
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const shown = useMemo(() => rows.filter(r => matchFilter(r, filter) && matchQuery(r, q)), [rows, filter, q]);

  if (!dt) return <div className={`${s.card} ${s.placeholder}`}>ยังไม่มีข้อมูล Daytrade ของวันนี้</div>;

  const byStatus = (st: DtRow['status']) => rows.filter(r => r.status === st);
  const reentry = byStatus('reentry');
  const news = byStatus('new');
  const ts = hhmm(dt.generated_at);
  const goCard = (t: string) => {
    document.getElementById(`c-${t}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlash(t);
    window.setTimeout(() => setFlash(cur => (cur === t ? null : cur)), 1600);
  };

  return (
    <section data-testid="dr-daytrade">
      <h2 className={s.tabTitle}>Lekkung Daytrade Scan</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(dt.date)}{ts && ` ${ts}`} · <b>เทียบกับ: {shortDate(dt.compared_to)}</b> · <Link href={dt.page}>เปิดหน้าสแกน ↗</Link>
      </p>

      <div className={s.stats}>
        <div className={`${s.card} ${s.stat}`}><div className={s.big}>{dt.counts.total}</div><div className={s.lbl}>ผ่านสแกนวันนี้</div></div>
        <div className={`${s.card} ${s.stat}`}>
          <div className={s.big}><span className={s.pos}>{dt.counts.rv_hi}</span> · <span style={{ color: 'var(--amber)' }}>{dt.counts.rv_mid}</span> · <span className={s.flat}>{dt.counts.rv_lo}</span></div>
          <div className={s.lbl}>วอลุ่ม: มาจริง (≥1.5) · เฉียด (1.0–1.5) · ไม่มา (&lt;1.0)</div>
        </div>
        <div className={`${s.card} ${s.stat}`}><div className={s.big}>{dt.counts.new} · {dt.counts.reentry} · {dt.counts.stay}</div><div className={s.lbl}>เข้าใหม่ · กลับเข้า · อยู่ต่อ</div></div>
        <div className={`${s.card} ${s.stat}`}>
          <div className={`${s.big} ${s.neg}`}>{dt.counts.dropped}</div>
          <div className={s.lbl}>หลุดวันนี้{dt.dropped.length > 0 && ` (${dt.dropped.map(d => d.ticker).join(', ')})`}</div>
        </div>
      </div>

      <div className={s.changes}>
        <div className={`${s.card} ${s.chg}`}>
          <h3>เข้าใหม่ <span>{news.length} ตัว · ไม่อยู่ในสแกนตลอด {dt.lookback_days} วันทำการ</span></h3>
          <div className={s.chips}>
            {news.length ? news.map(r => <span key={r.ticker} className={s.chip}><b>{r.ticker}</b> <Pct v={r.chg_pct} /></span>)
              : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}
          </div>
        </div>
        <div className={`${s.card} ${s.chg}`}>
          <h3>กลับเข้า <span>{reentry.length} ตัว · วงเล็บ = วันล่าสุดที่อยู่ในสแกน</span></h3>
          <div className={s.chips}>
            {reentry.length ? reentry.map(r => <span key={r.ticker} className={s.chip}><b>{r.ticker}</b> <small>({shortDate(r.last_seen)})</small></span>)
              : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}
          </div>
        </div>
        <div className={`${s.card} ${s.chg}`}>
          <h3>หลุด <span>{dt.dropped.length} ตัว</span></h3>
          <div className={s.chips}>
            {dt.dropped.length ? dt.dropped.map(d => <span key={d.ticker} className={s.chip}><b>{d.ticker}</b> <Pct v={d.chg_pct} /></span>)
              : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}
          </div>
        </div>
      </div>

      <div className={s.controls}>
        <input type="search" className={s.search} placeholder="ค้นหาหุ้น…" value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาหุ้น" />
        {DT_FILTERS.map(f => (
          <button
            key={f}
            type="button"
            className={s.f}
            aria-pressed={filter === f}
            disabled={counts[f] === 0}
            onClick={() => setFilter(f)}
            data-testid={`dr-filter-${f}`}
            data-count={counts[f]}
          >
            {DT_FILTER_LABELS[f]} <span className={s.n}>{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className={s.tshell} data-testid="dr-table-shell">
        <table className={`${s.table} ${s.clickRows}`} data-testid="dr-table">
          <thead>
            <tr>
              <th className={s.stk}>หุ้น</th>
              <th className={s.r}>ปิด</th>
              <th className={s.r}>%วันนี้</th>
              <th>RelVol</th>
              <th className={s.r}>มูลค่า (ลบ.)<Calc /></th>
              <th>ปิดที่<Calc /></th>
              <th className={s.r}>จุดสนใจ<Calc /></th>
              <th className={s.r}>จุดทิ้ง<Calc /></th>
              <th className={s.r}>วอลุ่มถึง 10:30<Calc>30%</Calc></th>
              <th>Tech Rating</th>
              <th className={s.r}>P/E</th>
              <th className={s.r}>EPS Gr YoY</th>
              <th className={s.r}>วัน (รอบนี้)</th>
              <th className={s.p2h}>ชั้น / ข่าว</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const cal = calendarFor(rep.calendar.items, r.ticker);
              return (
                <tr key={r.ticker} onClick={() => goCard(r.ticker)} data-testid="dr-row" data-ticker={r.ticker}>
                  <td className={s.stk}>
                    <span className={s.tk}>{r.ticker}</span>
                    <StatusTag status={r.status} />
                    {cal.map(c => <span key={c.date + c.type} className={`${s.tag} ${s.tXd}`} title={c.note}>{calendarText(c)}</span>)}
                    <PriceWarn r={r} />
                    {r.status === 'reentry' && <span className={s.ls}>ล่าสุดในสแกน {shortDate(r.last_seen)}</span>}
                  </td>
                  <td className={`${s.r} ${s.price}`}>{fmtNum(r.close)}</td>
                  <td className={s.r}><Pct v={r.chg_pct} /></td>
                  <td>
                    <span className={`${s.rv} ${rvClass(r.rv_tier)}`}><i style={{ width: `${Math.min(100, ((r.rel_vol ?? 0) / 2) * 100)}%` }} /></span>
                    {fmtNum(r.rel_vol)} {r.rv_tier && RV_LABEL[r.rv_tier]}
                  </td>
                  <td className={s.r}>{fmtNum(r.value_mb, 1)}{r.thin && <span className={`${s.tag} ${s.tWarn}`}>เงินบาง</span>}</td>
                  <td>{r.close_position ? CLOSE_POS_LABEL[r.close_position] : '—'}</td>
                  <td className={`${s.r} ${s.lvl}`}><TriggerCell r={r} /></td>
                  <td className={`${s.r} ${s.lvl}`}>{fmtNum(r.stop)}</td>
                  <td className={s.r}>{fmtShares(r.min_vol_1030)}</td>
                  <td>{r.tech_label ?? '—'} {fmtNum(r.tech_rating)}</td>
                  <td className={s.r}>{fmtNum(r.pe, 1)}</td>
                  <td className={`${s.r} ${s[pctClass(r.eps_gr_yoy)]}`}>{fmtPct(r.eps_gr_yoy, 1)}</td>
                  <td className={s.r}>{r.streak_days}</td>
                  <td><span className={s.p2}>เฟส 2</span></td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={14} className={s.empty}>ไม่มีหุ้นตามตัวกรองนี้</td></tr>}
          </tbody>
        </table>
      </div>
      <p className={s.note}>
        เรียงตาม RelVol มาก → น้อย · คลิกแถวเพื่อเลื่อนไปการ์ด · จุดสนใจ = High วัน ถ้าปิดต่ำกว่า High ถ้าปิดที่ High ใช้ High 5 วัน → 30 วัน ที่สูงกว่าราคาปิด ·
        จุดทิ้ง = Low วัน หรือปิดวันก่อน ตัวที่ต่ำกว่าราคาปิดและใกล้กว่า · วอลุ่มถึง 10:30 = 30% ของค่าเฉลี่ย 10 วัน
      </p>

      <h3 className={s.sec}>การ์ดรายตัว<small>เรียงตามตาราง</small></h3>
      <div className={s.cards} data-testid="dr-cards">
        {shown.map(r => <StockCard key={r.ticker} r={r} rep={rep} flash={flash === r.ticker} />)}
      </div>

      <h3 className={s.sec}>ตัวที่หลุดวันนี้</h3>
      {dt.dropped.length === 0 ? (
        <p className={s.note}>ไม่มีตัวที่หลุดวันนี้</p>
      ) : (
        <div className={s.tshell}>
          <table className={`${s.table} ${s.tableSm}`} data-testid="dr-dropped">
            <thead>
              <tr>
                <th className={s.stk}>หุ้น</th><th className={s.r}>ปิด</th><th className={s.r}>%วันนี้</th>
                <th className={s.r}>อยู่ในสแกนมา</th><th>ตกเกณฑ์ข้อ<Calc /></th><th className={s.r}>เช็คได้</th>
              </tr>
            </thead>
            <tbody>
              {dt.dropped.map(d => (
                <tr key={d.ticker}>
                  <td className={`${s.stk} ${s.tk}`}>
                    {d.ticker}
                    {d.price_stale && <span className={`${s.tag} ${s.tWarn}`}>⚠️ ราคาค้าง</span>}
                  </td>
                  <td className={`${s.r} ${s.price}`}>{fmtNum(d.close)}</td>
                  <td className={s.r}><Pct v={d.chg_pct} /></td>
                  <td className={s.r}>{d.days_before_drop} วัน</td>
                  <td>{d.check.failed.length ? d.check.failed.join(' · ') : <span className={s.flat}>ไม่พบข้อที่ตก (ข้อที่เช็คได้ผ่านหมด)</span>}</td>
                  <td className={s.r}>{d.check.checked}/{d.check.total} ข้อ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.note}>
        &quot;ตกเกณฑ์ข้อ&quot; คิดจากเกณฑ์สแกนทีละข้อด้วยข้อมูลของวันนี้ที่หาได้ · ข้อที่ไม่มีข้อมูล (เช่น RSI7, ADX, Tech Rating ของวันนี้) ไม่เดา ·
        บทเรียนจากตัวที่หลุด <span className={s.p2}>เฟส 2</span>
      </p>

      <h3 className={s.sec}>กฎหน้างาน</h3>
      <div className={s.rules}>
        <div className={s.card}>
          <h3>กฎถาวร</h3>
          <ul>
            <li>เปิดโดดไม่ไล่</li>
            <li>รอดิฟวอลุ่มแห้ง 10:15–10:30</li>
            <li>เช้าไม่วิ่ง ขาย</li>
            <li>เสีย 2 ได้ 8 · คัท 1–2 ช่อง</li>
            <li>ห้ามห่อหุ้นที่บวกแรงโดยไม่มีข่าวข้ามคืน</li>
          </ul>
        </div>
        <div className={s.card}>
          <h3>ปฏิทินที่เกี่ยวกับหุ้นในแท็บนี้</h3>
          {(() => {
            const its = rows.flatMap(r => calendarFor(rep.calendar.items, r.ticker));
            return its.length ? (
              <ul>{its.map(i => <li key={i.ticker + i.date + i.type}>{i.ticker} · {i.type} {shortDate(i.date)}{i.amount != null ? ` ${i.amount} บาท` : ` · ${i.note}`}</li>)}</ul>
            ) : <p className={s.flat} style={{ margin: 0 }}>ไม่มี XD/XR ของหุ้นในแท็บนี้</p>;
          })()}
          <p className={s.note} style={{ margin: '8px 0 0' }}>ดึงจากชุดเดียวกับแถบปฏิทินด้านบน</p>
        </div>
      </div>

      <details className={`${s.card} ${s.fold}`}>
        <summary>วิธีอ่านแท็บนี้ + เกณฑ์สแกน</summary>
        <div className={s.foldBody}>
          <p><b>เกณฑ์สแกน:</b> {dt.criteria.map(c => c.label).join(' · ')}</p>
          <p><b>สถานะ:</b> เทียบกับวันทำการก่อนหน้า · อยู่ต่อ = อยู่วันก่อนหน้าด้วย · กลับเข้า = ไม่อยู่วันก่อนหน้า แต่เคยอยู่ใน {dt.lookback_days} วันทำการ · เข้าใหม่ = ไม่อยู่เลยใน {dt.lookback_days} วันทำการ</p>
          <p><b>RelVol:</b> วอลุ่มวันนี้ ÷ ค่าเฉลี่ย 10 วัน · ≥ 1.5 มาจริง · 1.0–1.5 เฉียด · &lt; 1.0 ไม่มา</p>
          <p><b>ปิดที่:</b> ที่ High วัน / ชิด High (25% บนของแท่ง) / กลางแท่ง / ชิด Low (25% ล่าง)</p>
          <p><b>มูลค่า:</b> ราคาปิด × วอลุ่ม (ประมาณ) · ต่ำกว่า 10 ลบ. ติดป้ายเงินบาง</p>
          <p><b>วัน (รอบนี้):</b> จำนวนวันทำการที่อยู่ในสแกนติดกันถึงวันนี้ · เข้าหรือกลับเข้าวันนี้ = 1</p>
          <p><b>Tech Rating:</b> คะแนนจาก TradingView · ≥ 0.5 Strong Buy · ≥ 0.1 Buy</p>
          <p><b>ราคา:</b> OHLC จากกราฟ 30 วันของ StockDesk · ⚠️ ราคาค้าง = ไม่มีแท่งของวันสแกน (ไม่คำนวณจุดสนใจ/จุดทิ้ง)</p>
        </div>
      </details>
    </section>
  );
}

export default function DailyReportClient() {
  const rep = REPORT;
  const [tab, setTab] = useState<TabKey>('daytrade');
  const isOld = LATEST_SCAN != null && rep.date !== LATEST_SCAN;
  const ts = hhmm(rep.daytrade?.generated_at);
  return (
    <div className={s.root} data-testid="daily-report">
      <h1 className={s.h1}>สรุปสแกนรายวัน</h1>
      <p className={s.sub}>
        สแกน {longDate(rep.date)}{ts && ` · ${ts}`} · เทียบกับวันทำการก่อนหน้า {shortDate(rep.compared_to)} · ทุกตัวเลขมาจากข้อมูล StockDesk · ป้าย <Calc /> = ค่าที่หน้านี้คำนวณเพิ่มเอง
      </p>
      {isOld && (
        <div className={s.staleBar} data-testid="dr-stale">
          ข้อมูลสรุปของวันที่ {longDate(rep.date)} · สแกนล่าสุดคือ {longDate(LATEST_SCAN)} (สรุปของวันล่าสุดยังไม่ถูกสร้าง)
        </div>
      )}

      <MarketBar rep={rep} />

      <nav className={s.tabs} role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={s.tab}
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            data-testid={`dr-tab-${t.key}`}
          >
            {t.label}
            {t.key === 'daytrade' && rep.daytrade ? <small>{rep.daytrade.counts.total}</small> : t.key !== 'daytrade' ? <small>เร็ว ๆ นี้</small> : null}
          </button>
        ))}
      </nav>

      {tab === 'daytrade' ? (
        <DaytradeTab rep={rep} />
      ) : (
        <div className={`${s.card} ${s.placeholder}`}>แท็บ {TABS.find(t => t.key === tab)?.label} — เร็ว ๆ นี้</div>
      )}
    </div>
  );
}
