'use client';

// /daily-report — โครงตามแบบ Muse v48 · ทุกตัวเลขมาจาก data/scans/daily_report.json (scripts/build_daily_report.py)
// ที่ import ตอน build → หน้า static · ประโยคอธิบายสร้างจากกติกาในสคริปต์ (SEPA: lib/dailyReportTabs) ไม่มี AI
// ห้ามมีชื่อหุ้น วันที่ หรือจำนวนตายตัวในไฟล์นี้

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import rawReport from '@/data/scans/daily_report.json';
import rawGeneratedAt from '@/data/scans/generated_at.json';
import {
  type DailyReport, type CalendarItem, type DtRow, type DtFilter, type RvTier,
  DT_FILTERS, DT_FILTER_LABELS, RV_LABEL, CLOSE_POS_LABEL, TRIGGER_LABEL, scanTagLabel,
  matchFilter, matchQuery, filterCounts, shortDate, longDate, hhmm, fmtNum, fmtShares,
  calendarFor, calendarText, calendarScans, splitCalendar, latestScanDate,
} from '@/lib/dailyReport';
import { LIQ_DEFAULT } from '@/lib/liquidity';
import { rankSepa } from '@/lib/dailyReportTabs';
import { techRatingLabel } from '@/lib/lekkungDaytradeData';
import { TS } from '@/lib/typeScale';
import {
  N, Pct, Price, StatusTag, StaleTag, EventTags, InScans, NoData, TabHead, Verdict, StatCard, ChangeBox, Chip,
  FilterButton, StockCard, Fold, DaysCell, DAYS_TITLE_WEB,
} from './shared';
import GrowthTab from './GrowthTab';
import SepaTab from './SepaTab';
import StageTab from './StageTab';
import s from './DailyReport.module.css';

const REPORT = rawReport as unknown as DailyReport;
const LATEST_SCAN = latestScanDate(rawGeneratedAt as Record<string, unknown>);
const TAB_COUNT: Record<string, number | null> = {
  daytrade: REPORT.daytrade?.counts.total ?? null,
  growth: REPORT.growth?.counts.total ?? null,
  sepa: REPORT.sepa ? rankSepa(REPORT.sepa.rows, LIQ_DEFAULT).length : null,
  stage: REPORT.market_stage?.total_stock ?? null,
};

type TabKey = 'daytrade' | 'growth' | 'sepa' | 'stage';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'daytrade', label: 'Daytrade' },
  { key: 'growth', label: 'Lekkung Growth' },
  { key: 'sepa', label: 'SEPA' },
  { key: 'stage', label: 'Market Stage' },
];

function rvClass(t: RvTier | null) {
  return t === 'hi' ? s.rvHi : t === 'mid' ? s.rvMid : s.rvLo;
}

function RelVol({ r }: { r: DtRow }) {
  return (
    <>
      <span className={`${s.rvBar} ${rvClass(r.rv_tier)}`}><i style={{ width: `${Math.min(100, ((r.rel_vol ?? 0) / 2) * 100)}%` }} /></span>
      <N>{fmtNum(r.rel_vol)}</N> เท่า{r.rv_tier && <span className={s.muted}> ({RV_LABEL[r.rv_tier]})</span>}
    </>
  );
}

function Sparkline({ closes }: { closes: DtRow['closes_7d'] }) {
  if (closes.length < 2) return null;
  const p = closes.map(c => c.close);
  const w = 300, h = 38, pad = 3;
  const mn = Math.min(...p), mx = Math.max(...p), rg = mx - mn || 1;
  const pts = p.map((v, i) => `${(pad + (i * (w - 2 * pad)) / (p.length - 1)).toFixed(1)},${(h - pad - ((v - mn) / rg) * (h - 2 * pad)).toFixed(1)}`).join(' ');
  const col = p[p.length - 1] >= p[0] ? 'var(--green)' : 'var(--red)';
  return (
    <div className={s.spark}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
      </svg>
      <div className={s.cap}>
        ราคาปิด <N>{p.length}</N> วันทำการ ({shortDate(closes[0].date)} – {shortDate(closes[closes.length - 1].date)}) · <N>{fmtNum(p[0])} → {fmtNum(p[p.length - 1])}</N>
      </div>
    </div>
  );
}

function XdTags({ items }: { items: CalendarItem[] }) {
  return <>{items.map(c => <span key={c.date + c.type} className={`${s.tag} ${s.tXd}`} title={c.note}>{calendarText(c)}</span>)}</>;
}

// ─── แถบตลาด + ปฏิทิน ───────────────────────────────────────────────────

function CalChip({ i, strong }: { i: CalendarItem; strong: boolean }) {
  return (
    <span className={strong ? s.calIn : s.calOut} title={i.note}>
      <span className={s.num}>{i.ticker}{i.amount != null ? ` ${i.amount}` : ''}</span>
      {strong && calendarScans(i).map(k => <span key={k} className={s.scanTag}>{scanTagLabel(k)}</span>)}
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
  if (!rep.calendar) return null;
  const sp = splitCalendar(rep.calendar.items, rep.calendar.next_trading_day);
  const weekDates = [...new Set(sp.week.shown.map(i => i.date))];
  const hiddenDates = [...new Set(sp.week.hidden.map(i => i.date))].sort();
  const tmCount = sp.tomorrow.inScan.length + sp.tomorrow.other.length;
  return (
    <div className={s.mbCal} data-testid="dr-calendar">
      <div className={s.calHead}>ปฏิทิน XD/XR {rep.calendar.ahead_days} วันข้างหน้า · ตัวหนา = อยู่ใน Daytrade / Growth / SEPA</div>
      <div className={s.calRow}>
        <b>พรุ่งนี้ {shortDate(rep.calendar.next_trading_day)}</b>
        {tmCount === 0 ? <span> — ไม่มี XD/XR</span> : (
          <>
            {sp.tomorrow.inScan.length > 0 && <div className={s.calDay}><CalLine items={sp.tomorrow.inScan} strong /></div>}
            {sp.tomorrow.other.length > 0 && <div className={s.calDay}><CalLine items={sp.tomorrow.other} strong={false} /></div>}
          </>
        )}
      </div>
      <div className={s.calRow}>
        <b>ภายในสัปดาห์</b>
        {weekDates.length === 0 && <span> — ไม่มีหุ้นในสแกนที่ XD/XR</span>}
        {weekDates.map(d => (
          <div key={d} className={s.calDay}><span className={s.calDate}>{shortDate(d)}</span> <CalLine items={sp.week.shown.filter(i => i.date === d)} strong /></div>
        ))}
        {sp.week.hidden.length > 0 && (
          <details className={s.calMore} data-testid="dr-cal-more">
            <summary>+ อีก {sp.week.hidden.length} ตัวที่ไม่อยู่ในสแกน</summary>
            {hiddenDates.map(d => (
              <div key={d} className={s.calDay}><span className={s.calDate}>{shortDate(d)}</span> <CalLine items={sp.week.hidden.filter(i => i.date === d)} strong={false} /></div>
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
    <section className={`${s.card} ${s.marketbar}`} data-testid="dr-market">
      {m ? (
        <>
          <div className={s.mbTop}>
            <span className={s.mbDate}>{longDate(m.date)}</span>
            <span className={s.mbItem}>SET <b className={`${s.num} ${s.price}`}>{fmtNum(m.set_close)}</b> <Pct v={m.set_chg_pct} /></span>
            <span className={s.mbItem} title="ผลรวมมูลค่าของหุ้นในระบบ ไม่ใช่ตัวเลขทางการของ SET">
              มูลค่า (รวมหุ้นในระบบ) <b className={s.num}>{fmtNum(m.value_mb, 0)}</b> ลบ.
            </span>
            <span className={s.mbItem} title={`ข้ามหุ้นที่ไม่มีแท่งของวันนี้ ${m.breadth.skipped_no_bar} ตัว`}>
              หุ้นบวก <b className={`${s.num} ${s.pos}`}>{m.breadth.up}</b> · คงที่ <b className={s.num}>{m.breadth.flat}</b> · ลบ <b className={`${s.num} ${s.neg}`}>{m.breadth.down}</b>
            </span>
          </div>
          {m.condition && (m.condition.caution ? (
            <div className={s.mbAlert}>
              <span>⚠️</span>
              <span>
                <b>สภาพตลาด: {m.condition.label}</b>
                {m.condition.dd_count != null && <> · มีวันขายหนัก (Distribution Day) <N>{m.condition.dd_count}</N> วันในช่วง <N>{m.condition.dd_window}</N> วันทำการ</>}
                {m.condition.advice && <> — {m.condition.advice}</>}
              </span>
            </div>
          ) : (
            <div className={s.mbInfo}>
              สภาพตลาด: <b>{m.condition.label}</b>
              {m.condition.dd_count != null && <> · Distribution Day <N>{m.condition.dd_count}</N> วันใน <N>{m.condition.dd_window}</N> วันทำการ</>}
            </div>
          ))}
        </>
      ) : <span>รอบนี้ไม่มีข้อมูลแถบตลาด</span>}
      <CalendarBox rep={rep} />
    </section>
  );
}

// ─── แท็บ Daytrade ───────────────────────────────────────────────────────

function DaytradeCard({ r, rep, flash }: { r: DtRow; rep: DailyReport; flash: boolean }) {
  const cal = calendarFor(rep.calendar?.items ?? [], r.ticker);
  return (
    <StockCard
      id={`c-${r.ticker}`} testid="dr-card" ticker={r.ticker} flash={flash} close={r.close} chg={r.chg_pct}
      tags={<>
        <StatusTag status={r.status} seenBefore={r.seen_before} />
        <XdTags items={cal} />
        <StaleTag stale={r.price_stale} barDate={r.bar_date} />
        {r.price_check === 'mismatch' && <span className={`${s.tag} ${s.tWarn}`}>⚠️ ราคาไม่ตรงสแกน</span>}
        <InScans scans={r.in_scans} exclude="daytrade" asTag />
        <EventTags events={r.events} />
      </>}
      sub={r.name}
      left={{
        title: 'ราคาวันนี้',
        rows: [
          ['เปิด · ต่ำ · สูง', r.price_stale ? <span className={s.muted}>ราคาค้าง</span> : <N>{fmtNum(r.open)} · {fmtNum(r.low)} · {fmtNum(r.high)}</N>],
          ['ปิดที่', r.close_position ? CLOSE_POS_LABEL[r.close_position] : '—'],
          ['ซื้อเมื่อผ่าน', r.trigger != null ? <><N>{fmtNum(r.trigger)}</N> <span className={s.muted}>({r.trigger_kind ? TRIGGER_LABEL[r.trigger_kind] : ''})</span></> : <span className={s.muted}>{r.trigger_kind ? TRIGGER_LABEL[r.trigger_kind] : '—'}</span>],
          ['ทิ้งเมื่อหลุด', <N key="s">{fmtNum(r.stop)}</N>],
        ],
      }}
      right={{
        title: 'วอลุ่ม / สแกน',
        rows: [
          ['วอลุ่มวันนี้', <><N>{fmtShares(r.volume)}</N> หุ้น = <RelVol r={r} /></>],
          ['ถึง 10:30 ควรได้', <><N>{fmtShares(r.min_vol_1030)}</N> หุ้น (30% ของเฉลี่ย 10 วัน)</>],
          ['มูลค่าซื้อขาย', <><N>{fmtNum(r.value_mb, 1)}</N> ลบ.{r.thin && <span className={`${s.tag} ${s.tThin}`}>เงินบาง</span>}</>],
          ['RSI7 · Tech Rating', <><N>{fmtNum(r.rsi7, 1)}</N> · {techRatingLabel(r.tech_rating) ?? '—'} <N>{fmtNum(r.tech_rating)}</N></>],
          ['Days', <DaysCell key="d" web={r.days_web} streak={r.streak_days} />],
        ],
      }}
      extra={!r.price_stale && <div className={s.panel}><Sparkline closes={r.closes_7d} /></div>}
      watch={r.watch}
    />
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
  if (!dt) return <NoData />;

  const by = (st: DtRow['status']) => rows.filter(r => r.status === st);
  const notes = dt.change_notes;
  const goCard = (t: string) => {
    document.getElementById(`c-${t}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlash(t);
    window.setTimeout(() => setFlash(cur => (cur === t ? null : cur)), 1600);
  };

  return (
    <section data-testid="dr-daytrade">
      <TabHead title="Lekkung Daytrade Scan" date={dt.date} ts={dt.generated_at} compared={dt.compared_to} href={dt.page} />
      <Verdict text={dt.headline} />

      <div className={s.statCards}>
        <StatCard big={dt.counts.total} label="ผ่านสแกนวันนี้" />
        <StatCard big={<><span className={s.pos}>{dt.counts.rv_hi}</span> · <span style={{ color: 'var(--yellow)' }}>{dt.counts.rv_mid}</span> · <span className={s.flat}>{dt.counts.rv_lo}</span></>}
          label="วอลุ่ม มาจริง · เกือบมา · ยังไม่มา" />
        <StatCard big={<>{dt.counts.new} · {dt.counts.stay}</>} label="เข้าใหม่ (NEW) · อยู่ต่อ" />
        <StatCard big={<span className={s.neg}>{dt.counts.dropped}</span>} label="หลุดวันนี้" />
      </div>

      <div className={s.changes}>
        <ChangeBox title="เข้าใหม่ (NEW)" hint="ไม่อยู่ในสแกนวันทำการก่อนหน้า"
          chips={by('new').map(r => <Chip key={r.ticker} ticker={r.ticker}><Pct v={r.chg_pct} /></Chip>)}
          note={notes?.new_items && Object.keys(notes.new_items).length > 0 && (
            <>{Object.entries(notes.new_items).map(([t, why]) => <div key={t}>{t}: {why}</div>)}</>
          )} />
        <ChangeBox title="อยู่ต่อ" chips={by('stay').map(r => <Chip key={r.ticker} ticker={r.ticker}><span className={s.small}>Days {r.days_web ?? r.streak_days}</span></Chip>)} />
        <ChangeBox title="หลุด" chips={dt.dropped.map(d => <Chip key={d.ticker} ticker={d.ticker}><Pct v={d.chg_pct} /></Chip>)}
          note={notes && Object.keys(notes.dropped_items).length > 0 && (
            <>{Object.entries(notes.dropped_items).map(([t, why]) => <div key={t}>{t}: {why || '—'}</div>)}</>
          )} />
      </div>

      <div className={s.controls}>
        <input type="search" className={s.search} placeholder="ค้นหาหุ้น…" value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาหุ้น" />
        {DT_FILTERS.map(f => (
          <FilterButton key={f} prefix="dr" id={f} label={DT_FILTER_LABELS[f]} count={counts[f]} active={filter === f} onClick={() => setFilter(f)} />
        ))}
      </div>

      <div className={s.tableShell} data-testid="dr-table-shell">
        <table className={`${s.table} ${s.clickRows}`} data-testid="dr-table">
          <thead>
            <tr>
              <th className={s.stk}>หุ้น</th>
              <th className={s.r}>ปิด</th>
              <th className={s.r}>%วันนี้</th>
              <th>วอลุ่มเทียบเฉลี่ย 10 วัน</th>
              <th className={s.r}>มูลค่า (ลบ.)</th>
              <th>ปิดที่</th>
              <th className={s.r}>ซื้อเมื่อผ่าน</th>
              <th className={s.r}>ทิ้งเมื่อหลุด</th>
              <th className={s.r}>วอลุ่มถึง 10:30</th>
              <th>Tech Rating</th>
              <th className={s.r}>P/E</th>
              <th className={s.r}>EPS Gr YoY</th>
              <th className={s.r} title={DAYS_TITLE_WEB}>Days</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.ticker} onClick={() => goCard(r.ticker)} data-testid="dr-row" data-ticker={r.ticker}>
                <td className={s.stk}>
                  <span className={`${s.tk} ${s.num}`}>{r.ticker}</span>
                  <StatusTag status={r.status} seenBefore={r.seen_before} />
                  <XdTags items={calendarFor(rep.calendar?.items ?? [], r.ticker)} />
                  <StaleTag stale={r.price_stale} barDate={r.bar_date} />
                </td>
                <td className={s.r}><Price v={r.close} /></td>
                <td className={s.r}><Pct v={r.chg_pct} /></td>
                <td><RelVol r={r} /></td>
                <td className={s.r}><N>{fmtNum(r.value_mb, 1)}</N>{r.thin && <span className={`${s.tag} ${s.tThin}`}>เงินบาง</span>}</td>
                <td>{r.close_position ? CLOSE_POS_LABEL[r.close_position] : '—'}</td>
                <td className={s.r}>
                  {r.trigger != null ? <N>{fmtNum(r.trigger)}</N> : <span className={s.flat}>—</span>}
                  {r.trigger_kind && <span className={s.ls}>{TRIGGER_LABEL[r.trigger_kind]}</span>}
                </td>
                <td className={s.r}><N>{fmtNum(r.stop)}</N></td>
                <td className={s.r}><N>{fmtShares(r.min_vol_1030)}</N></td>
                <td>{techRatingLabel(r.tech_rating) ?? '—'}<span className={s.ls}>{fmtNum(r.tech_rating)}</span></td>
                <td className={s.r}><N>{fmtNum(r.pe, 1)}</N></td>
                <td className={s.r}><Pct v={r.eps_gr_yoy} digits={1} /></td>
                <td className={s.r}><DaysCell web={r.days_web} streak={r.streak_days} /></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={13} className={s.empty}>ไม่มีหุ้นตามตัวกรองนี้</td></tr>}
          </tbody>
        </table>
      </div>
      <p className={s.tableNote}>เรียงตามวอลุ่มเทียบเฉลี่ย มาก → น้อย · คลิกแถวเพื่อเลื่อนไปการ์ด</p>

      <h3 className={s.sectionH}>การ์ดรายตัว<small>เรียงตามตาราง</small></h3>
      <div className={s.cards} data-testid="dr-cards">
        {shown.map(r => <DaytradeCard key={r.ticker} r={r} rep={rep} flash={flash === r.ticker} />)}
      </div>

      <h3 className={s.sectionH}>ตัวที่หลุดวันนี้<small>{dt.dropped.length} ตัว</small></h3>
      {dt.dropped.length === 0 ? <p className={s.tableNote}>ไม่มีตัวที่หลุดวันนี้</p> : (
        <div className={s.tableShell}>
          <table className={`${s.table} ${s.tableSm}`} data-testid="dr-dropped">
            <thead><tr><th className={s.stk}>หุ้น</th><th className={s.r}>ปิด</th><th className={s.r}>%วันนี้</th><th className={s.r}>อยู่ในสแกนมา</th><th>หลุดเพราะ</th></tr></thead>
            <tbody>
              {dt.dropped.map(d => (
                <tr key={d.ticker}>
                  <td className={s.stk}><span className={`${s.tk} ${s.num}`}>{d.ticker}</span><StaleTag stale={d.price_stale} barDate={d.bar_date} /></td>
                  <td className={s.r}><Price v={d.close} /></td>
                  <td className={s.r}><Pct v={d.chg_pct} /></td>
                  <td className={s.r}><N>{d.days_before_drop}</N> วัน</td>
                  <td>
                    {d.check.failed.length ? d.check.failed.join(' · ') : <span className={s.muted}>ข้อที่เช็คได้ผ่านหมด</span>}
                    <span className={s.ls}>เช็คได้ <N>{d.check.checked}</N> จาก <N>{d.check.total}</N> ข้อ</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Fold title="กฎหน้างาน · วิธีอ่าน · เกณฑ์สแกน">
        <ul>
          <li>เปิดโดดไม่ไล่ · รอดิฟวอลุ่มแห้ง 10:15–10:30 · เช้าไม่วิ่ง ขาย · เสีย 2 ได้ 8 คัท 1–2 ช่อง</li>
        </ul>
        <p><b>เกณฑ์สแกน:</b> {dt.criteria.map(c => c.label).join(' · ')}</p>
        <p><b>วอลุ่มเทียบเฉลี่ย:</b> วอลุ่มวันนี้ ÷ ค่าเฉลี่ย 10 วัน · ≥ 1.5 เท่า = มาจริง · 1.0–1.5 = เกือบมา · ต่ำกว่า 1.0 = ยังไม่มา</p>
        <p><b>ซื้อเมื่อผ่าน:</b> High วัน ถ้าปิดต่ำกว่า High · ปิดที่ High ใช้ High 5 วัน → 30 วัน ที่สูงกว่าราคาปิด · <b>ทิ้งเมื่อหลุด:</b> Low วัน หรือราคาปิดวันก่อน ตัวที่ต่ำกว่าราคาปิดและใกล้กว่า</p>
        <p><b>มูลค่า:</b> ราคาปิด × วอลุ่ม (ประมาณ) · ต่ำกว่า 10 ลบ. ติดป้ายเงินบาง · <b>ราคา:</b> กราฟ 30 วันของ StockDesk · ⚠️ ราคาค้าง = ไม่มีแท่งของวันสแกน</p>
      </Fold>
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
      <h1 className={`${TS.pageTitle} text-white`}>สรุปสแกนรายวัน</h1>
      <p className={`${s.sub} ${s.readable}`}>สแกน {longDate(rep.date)}{ts && ` · ${ts}`} · เทียบกับวันทำการก่อนหน้า {shortDate(rep.compared_to)} · ทุกตัวเลขมาจากข้อมูล StockDesk</p>
      {isOld && (
        <div className={s.staleBar} data-testid="dr-stale">
          ข้อมูลสรุปของวันที่ {longDate(rep.date)} · สแกนล่าสุดคือ {longDate(LATEST_SCAN)} (สรุปของวันล่าสุดยังไม่ถูกสร้าง)
        </div>
      )}

      <MarketBar rep={rep} />

      <nav className={s.tabs} role="tablist">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" className={s.tab} aria-selected={tab === t.key}
            onClick={() => setTab(t.key)} data-testid={`dr-tab-${t.key}`}>
            {t.label}{TAB_COUNT[t.key] != null && <small className={s.num}>{TAB_COUNT[t.key]}</small>}
          </button>
        ))}
      </nav>

      {tab === 'daytrade' && <DaytradeTab rep={rep} />}
      {tab === 'growth' && <GrowthTab g={rep.growth} />}
      {tab === 'sepa' && <SepaTab sp={rep.sepa} market={rep.market} />}
      {tab === 'stage' && <StageTab ms={rep.market_stage} />}

      <p className={s.foot}>
        ป้าย NEW / หลุด / Days ตรงกับหน้าสแกน · ค่าที่หน้านี้คิดเพิ่ม: มูลค่าซื้อขาย · ปิดที่ · ซื้อเมื่อ/ทิ้งเมื่อ · วอลุ่มถึง 10:30 · % ห่าง High · ระยะจาก EMA · จำนวนหุ้นบวก/ลบ ·
        ประโยคอธิบายสร้างจากกติกาในโค้ด (ไม่ใช้ AI) · <Link href="/report-card">Report Card</Link>
      </p>
      {rep.warnings && rep.warnings.length > 0 && (
        <p className={s.tableNote} data-testid="dr-warnings">บางส่วนของรอบนี้คำนวณไม่ได้: {rep.warnings.join(' · ')}</p>
      )}
    </div>
  );
}
