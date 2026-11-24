'use client';

import React, { useMemo, useState } from 'react';
import { shortDate, fmtNum, fmtPct } from '@/lib/dailyReport';
import {
  type GrowthSection, type GrowthFilter, type DroppedRow,
  GROWTH_FILTERS, growthCounts, maxBy, fyLabel, quarterLabel,
} from '@/lib/dailyReportTabs';
import {
  N, Pct, Price, StatusTag, StaleTag, EventTags, InScans, NoData, TabHead, Verdict, StatCard, ChangeBox, Chip,
  FilterButton, StockCard, Fold, ReportCardLink, monoTickers,
} from './shared';
import s from './DailyReport.module.css';

const LABEL: Record<GrowthFilter, string> = { all: 'ทั้งหมด', new: 'เข้าใหม่', reentry: 'กลับเข้า', stay: 'อยู่ต่อ' };

function DropTable({ rows, kind, testid }: { rows: DroppedRow[]; kind: 'today' | 'earlier'; testid: string }) {
  return (
    <div className={s.tableShell}>
      <table className={`${s.table} ${s.tableSm}`} data-testid={testid}>
        <thead>
          <tr>
            <th className={s.stk}>หุ้น</th><th className={s.r}>ราคา</th><th className={s.r}>%วันนี้</th>
            <th className={s.r}>{kind === 'today' ? 'อยู่ในสแกนมา' : 'วันล่าสุดในสแกน'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.ticker} data-testid={`${testid}-row`}>
              <td className={s.stk}>
                <span className={`${s.tk} ${s.num}`}>{d.ticker}</span>
                <StaleTag stale={d.price_stale} barDate={d.bar_date} />
                <EventTags events={d.events} />
                <InScans scans={d.in_scans} />
              </td>
              <td className={s.r}><Price v={d.close} /></td>
              <td className={s.r}><Pct v={d.chg_pct} /></td>
              <td className={s.r}>{kind === 'today' ? <><N>{d.days_before_drop}</N> วัน</> : shortDate(d.last_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pctPlain = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

export default function GrowthTab({ g }: { g: GrowthSection | null }) {
  const [filter, setFilter] = useState<GrowthFilter>('all');
  const rows = useMemo(() => g?.rows ?? [], [g]);
  const counts = useMemo(() => growthCounts(rows), [rows]);
  const shown = useMemo(() => rows.filter(r => filter === 'all' || r.status === filter), [rows, filter]);
  if (!g) return <NoData />;

  const nearHigh = maxBy(rows, r => r.pct_from_52w_high);
  const aboveEma = maxBy(rows, r => r.vs_ema10_pct);
  const notes = g.change_notes;
  const goDropped = () => document.getElementById('dr-growth-dropped')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section data-testid="dr-growth">
      <TabHead title="Lekkung Growth" date={g.date} ts={g.generated_at} compared={g.compared_to} href={g.page} />
      <Verdict text={g.headline} />

      <div className={s.statCards}>
        <StatCard big={g.counts.total} label="ผ่านสแกนวันนี้" />
        <StatCard big={<>{g.counts.new + g.counts.reentry} · <span className={s.neg}>{g.counts.dropped}</span></>} label="เข้ามา · หลุดวันนี้" />
        <StatCard big={nearHigh ? nearHigh.ticker : '—'} label={nearHigh ? <>ใกล้ High รอบปีสุด (ห่าง <N>{pctPlain(Math.abs(nearHigh.pct_from_52w_high ?? 0))}</N>)</> : 'ใกล้ High รอบปีสุด'} />
        <StatCard big={aboveEma ? aboveEma.ticker : '—'} label={aboveEma ? <>เหนือ EMA10 มากสุด (<N>{fmtPct(aboveEma.vs_ema10_pct)}</N>)</> : 'เหนือ EMA10 มากสุด'} />
      </div>
      <ReportCardLink href={g.report_card_href} />

      <div className={s.changes}>
        <ChangeBox title="เข้าใหม่" hint={`ไม่อยู่ในสแกนตลอด ${g.lookback_days} วันทำการ`}
          chips={rows.filter(r => r.status === 'new').map(r => <Chip key={r.ticker} ticker={r.ticker}><Pct v={r.chg_pct} /></Chip>)}
          note={notes?.new && monoTickers(notes.new)} />
        <ChangeBox title="กลับเข้า" chips={rows.filter(r => r.status === 'reentry').map(r => <Chip key={r.ticker} ticker={r.ticker}><Pct v={r.chg_pct} /></Chip>)}
          note={notes?.reentry && monoTickers(notes.reentry)} />
        <ChangeBox title="หลุด" chips={g.dropped.map(d => <Chip key={d.ticker} ticker={d.ticker}><Pct v={d.chg_pct} /></Chip>)}
          note={notes && Object.keys(notes.dropped_items).length > 0 && (
            <>{Object.entries(notes.dropped_items).map(([t, why]) => <div key={t}><span className={s.num}>{t}</span>: {why || '—'}</div>)}</>
          )} />
      </div>

      <div className={s.controls}>
        {GROWTH_FILTERS.map(f => (
          <FilterButton key={f} prefix="gr" id={f} label={LABEL[f]} count={counts[f]} active={filter === f} onClick={() => setFilter(f)} />
        ))}
        <FilterButton prefix="gr" id="dropped" label="หลุดวันนี้" count={g.dropped.length} active={false} onClick={goDropped} />
      </div>

      <div className={s.tableShell} data-testid="gr-table-shell">
        <table className={s.table} data-testid="gr-table">
          <thead>
            <tr>
              <th className={s.stk}>หุ้น</th>
              <th className={s.r}>ราคา</th>
              <th className={s.r}>%วันนี้</th>
              <th className={s.r}>P/E</th>
              <th className={s.r}>ROE</th>
              <th className={s.r}>รายได้ทั้งปี</th>
              <th className={s.r}>กำไรไตรมาสล่าสุด YoY</th>
              <th className={s.r}>เทียบ EMA10</th>
              <th className={s.r}>ห่าง High รอบปี</th>
              <th className={s.r} title="ราคาปิด × วอลุ่มของวันสแกนวันเดียว (ไม่ใช่ค่าเฉลี่ย)">มูลค่าวันนี้ (ลบ.)</th>
              <th className={s.r}>อยู่ในสแกนติดกัน</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.ticker} data-testid="gr-row" data-ticker={r.ticker}>
                <td className={s.stk}>
                  <span className={`${s.tk} ${s.num}`}>{r.ticker}</span>
                  <StatusTag status={r.status} />
                  <StaleTag stale={r.price_stale} barDate={r.bar_date} />
                  <EventTags events={r.events} />
                </td>
                <td className={s.r}><Price v={r.close} /></td>
                <td className={s.r}><Pct v={r.chg_pct} /></td>
                <td className={s.r}><N>{fmtNum(r.pe, 1)}</N></td>
                <td className={s.r}><N>{pctPlain(r.roe_pct)}</N></td>
                <td className={s.r}><Pct v={r.rev_gr_fy} digits={1} /><span className={s.ls}>{fyLabel(r.rev_gr_period) ?? '—'}</span></td>
                <td className={s.r}><Pct v={r.profit_gr_q_yoy} digits={1} /><span className={s.ls}>{quarterLabel(r.profit_gr_quarter) ?? '—'}</span></td>
                <td className={s.r}><Pct v={r.vs_ema10_pct} /></td>
                <td className={s.r}><Pct v={r.pct_from_52w_high} /></td>
                <td className={s.r}><N>{fmtNum(r.value_mb_1d, 1)}</N></td>
                <td className={s.r}><N>{r.streak_days}</N> วัน</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.tableNote}>เรียงตามมูลค่าซื้อขายวันนี้ มาก → น้อย</p>

      <h3 className={s.sectionH}>การ์ดรายตัว<small>เรียงตามตาราง</small></h3>
      <div className={s.cards} data-testid="gr-cards">
        {shown.map(r => (
          <StockCard
            key={r.ticker} id={`g-${r.ticker}`} testid="gr-card" ticker={r.ticker} close={r.close} chg={r.chg_pct}
            tags={<><StatusTag status={r.status} lastSeen={r.last_seen} /><StaleTag stale={r.price_stale} barDate={r.bar_date} /><InScans scans={r.in_scans} exclude="growth" asTag /><EventTags events={r.events} /></>}
            left={{
              title: 'พื้นฐาน',
              rows: [
                ['P/E · ROE', <><N>{fmtNum(r.pe, 1)}</N> · <N>{pctPlain(r.roe_pct)}</N></>],
                [<>รายได้ทั้งปี ({fyLabel(r.rev_gr_period) ?? '—'})</>, <Pct key="rv" v={r.rev_gr_fy} digits={1} />],
                [<>กำไรไตรมาสล่าสุด ({quarterLabel(r.profit_gr_quarter) ?? '—'}) YoY</>, <Pct key="pf" v={r.profit_gr_q_yoy} digits={1} />],
              ],
            }}
            right={{
              title: 'เทคนิค / สแกน',
              rows: [
                ['เทียบ EMA10', <>{r.vs_ema10 != null ? <N>{`${r.vs_ema10 > 0 ? '+' : ''}${fmtNum(r.vs_ema10)}`}</N> : '—'} บาท (<Pct v={r.vs_ema10_pct} />)</>],
                ['ห่าง High รอบปี', <><Pct v={r.pct_from_52w_high} /> <span className={s.muted}>(High <N>{fmtNum(r.high_52w)}</N>)</span></>],
                ['มูลค่าซื้อขายวันนี้', <><N>{fmtNum(r.value_mb_1d, 1)}</N> ลบ.</>],
                ['อยู่ในสแกนติดกัน', <><N>{r.streak_days}</N> วัน</>],
              ],
            }}
            watch={r.watch}
          />
        ))}
      </div>

      <h3 className={s.sectionH} id="dr-growth-dropped">หลุดวันนี้<small>{g.dropped.length} ตัว</small></h3>
      {g.dropped.length ? <DropTable rows={g.dropped} kind="today" testid="gr-dropped" /> : <p className={s.tableNote}>ไม่มีตัวที่หลุดวันนี้</p>}
      <h3 className={s.sectionH}>หลุดก่อนหน้า ยังไม่กลับเข้า<small>ภายใน {g.lookback_days} วันทำการ · {g.dropped_earlier.length} ตัว</small></h3>
      {g.dropped_earlier.length ? <DropTable rows={g.dropped_earlier} kind="earlier" testid="gr-earlier" /> : <p className={s.tableNote}>ไม่มี</p>}

      <Fold title="แหล่งข้อมูล · เกณฑ์">
        <p><b>สแกน:</b> ไฟล์ lekkung.json ของ StockDesk · เทียบกับวันทำการก่อนหน้าที่มีไฟล์สแกน</p>
        <p><b>รายได้ทั้งปี:</b> การเติบโตของรายได้ปีบัญชีล่าสุดเทียบปีก่อน · <b>กำไรไตรมาสล่าสุด YoY:</b> กำไรสุทธิไตรมาสล่าสุดเทียบไตรมาสเดียวกันปีก่อน</p>
        <p><b>มูลค่าวันนี้:</b> ราคาปิด × วอลุ่มของวันเดียว (ไม่ใช่ค่าเฉลี่ย) · <b>ราคาของตัวที่หลุด:</b> กราฟราคา 30 วันของ StockDesk</p>
      </Fold>
    </section>
  );
}
