'use client';

// /daily-report — โครงตามแบบ Muse v48 · ทุกตัวเลขมาจาก data/scans/daily_report.json (scripts/build_daily_report.py)
// ที่ import ตอน build → หน้า static · ประโยคอธิบายสร้างจากกติกาในสคริปต์ (SEPA: lib/dailyReportTabs) ไม่มี AI
// ห้ามมีชื่อหุ้น วันที่ หรือจำนวนตายตัวในไฟล์นี้

import React, { useState } from 'react';
import Link from 'next/link';
import rawReport from '@/data/scans/daily_report.json';
import rawGeneratedAt from '@/data/scans/generated_at.json';
import {
  type DailyReport, type CalendarItem, RV_LABEL, scanTagLabel,
  shortDate, longDate, hhmm, fmtNum, fmtShares,
  calendarFor, calendarText, calendarScans, splitCalendar, latestScanDate,
} from '@/lib/dailyReport';
import { LIQ_DEFAULT } from '@/lib/liquidity';
import { rankSepa } from '@/lib/dailyReportTabs';
import { TS } from '@/lib/typeScale';
import {
  N, Pct, StatusTag, StaleTag, EventTags, InScans, NoData, TabHead, Verdict, ChangeBox, Chip, CountLine,
  CompactCard, WatchGrid, FullListLink, Fold,
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

function DaytradeTab({ rep }: { rep: DailyReport }) {
  const dt = rep.daytrade;
  if (!dt) return <NoData />;
  const rows = dt.rows; // เรียง RelVol มาก → น้อย มาจากสคริปต์
  const notes = dt.change_notes;
  return (
    <section data-testid="dr-daytrade">
      <TabHead title="Lekkung Daytrade Scan" date={dt.date} ts={dt.generated_at} compared={dt.compared_to} href={dt.page} />
      <Verdict text={dt.headline} />
      <CountLine parts={[{ label: 'ผ่าน', value: dt.counts.total }, { label: 'เข้าใหม่', value: dt.counts.new }, { label: 'หลุด', value: dt.counts.dropped }]} />

      <h3 className={s.sectionH}>เปลี่ยนวันนี้</h3>
      <div className={s.changes} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <ChangeBox title="เข้าใหม่ (NEW)" hint="ไม่อยู่ในสแกนวันทำการก่อนหน้า"
          chips={rows.filter(r => r.status === 'new').map(r => <Chip key={r.ticker} ticker={r.ticker}><Pct v={r.chg_pct} /></Chip>)}
          note={notes?.new_items && Object.keys(notes.new_items).length > 0 && (
            <>{Object.entries(notes.new_items).map(([t, why]) => <div key={t}>{t}: {why}</div>)}</>
          )} />
        <ChangeBox title="หลุด" chips={dt.dropped.map(d => <Chip key={d.ticker} ticker={d.ticker}><Pct v={d.chg_pct} /></Chip>)}
          note={notes && Object.keys(notes.dropped_items).length > 0 && (
            <>{Object.entries(notes.dropped_items).map(([t, why]) => <div key={t}>{t}: {why || '—'}</div>)}</>
          )} />
      </div>

      <h3 className={s.sectionH}>พรุ่งนี้ดูตัวไหน<small>ทุกตัวที่ผ่านสแกนวันนี้ เรียงวอลุ่มเทียบเฉลี่ยมาก → น้อย</small></h3>
      <WatchGrid testid="dr-watch-grid" empty={rows.length === 0}>
        {rows.map(r => (
          <CompactCard
            key={r.ticker} testid="dr-card" ticker={r.ticker} close={r.close} chg={r.chg_pct}
            tags={<>
              <StatusTag status={r.status} seenBefore={r.seen_before} />
              <XdTags items={calendarFor(rep.calendar?.items ?? [], r.ticker)} />
              <StaleTag stale={r.price_stale} barDate={r.bar_date} />
              {r.price_check === 'mismatch' && <span className={`${s.tag} ${s.tWarn}`}>⚠️ ราคาไม่ตรงสแกน</span>}
              <InScans scans={r.in_scans} exclude="daytrade" asTag />
              <EventTags events={r.events} />
            </>}
            facts={[
              ['ซื้อเมื่อผ่าน', r.trigger != null ? fmtNum(r.trigger) : '—'],
              ['ทิ้งเมื่อหลุด', fmtNum(r.stop)],
              ['วอลุ่มถึง 10:30', fmtShares(r.min_vol_1030)],
              ['วอลุ่มวันนี้', <>{fmtNum(r.rel_vol)} เท่า{r.rv_tier && <span className={s.muted}> ({RV_LABEL[r.rv_tier]})</span>}</>],
            ]}
            watch={r.watch}
          />
        ))}
      </WatchGrid>

      <FullListLink href={dt.page} n={dt.counts.total} label="หน้า Lekkung Daytrade Scan" />
      <Fold title="วิธีอ่าน · เกณฑ์สแกน">
        <p><b>เกณฑ์สแกน:</b> {dt.criteria.map(c => c.label).join(' · ')}</p>
        <p><b>วอลุ่มเทียบเฉลี่ย:</b> วอลุ่มวันนี้ ÷ ค่าเฉลี่ย 10 วัน · ≥ 1.5 เท่า = มาจริง · 1.0–1.5 = เกือบมา · ต่ำกว่า 1.0 = ยังไม่มา</p>
        <p><b>ซื้อเมื่อผ่าน:</b> High วัน ถ้าปิดต่ำกว่า High · ปิดที่ High ใช้ High 5 วัน → 30 วัน ที่สูงกว่าราคาปิด · <b>ทิ้งเมื่อหลุด:</b> Low วัน หรือราคาปิดวันก่อน ตัวที่ต่ำกว่าราคาปิดและใกล้กว่า · <b>วอลุ่มถึง 10:30:</b> 30% ของเฉลี่ย 10 วัน</p>
        <p><b>เข้าใหม่ (NEW) / หลุด:</b> ตามหน้า /lekkung-daytrade · ราคา: กราฟ 30 วันของ StockDesk · ⚠️ ราคาค้าง = ไม่มีแท่งของวันสแกน</p>
        <p>กฎหน้างาน: เปิดโดดไม่ไล่ · รอดิฟวอลุ่มแห้ง 10:15–10:30 · เช้าไม่วิ่ง ขาย · เสีย 2 ได้ 8 คัท 1–2 ช่อง</p>
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
