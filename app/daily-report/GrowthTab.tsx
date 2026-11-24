'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { shortDate, hhmm, fmtNum, fmtPct, pctClass } from '@/lib/dailyReport';
import {
  type GrowthSection, type GrowthFilter, type DroppedRow,
  GROWTH_FILTERS, growthCounts, maxBy, fyLabel, quarterLabel,
} from '@/lib/dailyReportTabs';
import { Calc, Pct, StatusTag, StaleTag, EventTags, InScans, DaysCell, DAYS_TITLE, NoData, Phase2Box, SignalCard, FilterButton } from './shared';
import s from './DailyReport.module.css';

const LABEL: Record<GrowthFilter, string> = { all: 'ทั้งหมด', new: 'เข้าใหม่', reentry: 'กลับเข้า', stay: 'อยู่ต่อ' };

function DropTable({ rows, kind, testid }: { rows: DroppedRow[]; kind: 'today' | 'earlier'; testid: string }) {
  return (
    <div className={s.tshell}>
      <table className={`${s.table} ${s.tableSm}`} data-testid={testid}>
        <thead>
          <tr>
            <th className={s.stk}>หุ้น</th>
            <th className={s.r}>ราคา</th>
            <th className={s.r}>%วันนี้</th>
            <th className={s.r}>{kind === 'today' ? 'อยู่ในสแกนมา' : 'วันล่าสุดในสแกน'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.ticker} data-testid={`${testid}-row`}>
              <td className={s.stk}>
                <span className={s.tk}>{d.ticker}</span>
                <StaleTag stale={d.price_stale} barDate={d.bar_date} />
                <EventTags events={d.events} />
                <InScans scans={d.in_scans} />
              </td>
              <td className={`${s.r} ${s.price}`}>{fmtNum(d.close)}</td>
              <td className={s.r}><Pct v={d.chg_pct} /></td>
              <td className={s.r}>{kind === 'today' ? `${d.days_before_drop} วัน` : shortDate(d.last_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GrowthTab({ g }: { g: GrowthSection | null }) {
  const [filter, setFilter] = useState<GrowthFilter>('all');
  const rows = useMemo(() => g?.rows ?? [], [g]);
  const counts = useMemo(() => growthCounts(rows), [rows]);
  const shown = useMemo(() => rows.filter(r => filter === 'all' || r.status === filter), [rows, filter]);
  if (!g) return <NoData />;

  const nearHigh = maxBy(rows, r => r.pct_from_52w_high);
  const aboveEma = maxBy(rows, r => r.vs_ema10_pct);
  const news = rows.filter(r => r.status === 'new');
  const re = rows.filter(r => r.status === 'reentry');
  const ts = hhmm(g.generated_at);
  const goDropped = () => document.getElementById('dr-growth-dropped')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section data-testid="dr-growth">
      <h2 className={s.tabTitle}>Lekkung Growth</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(g.date)}{ts && ` ${ts}`} · <b>เทียบกับ: {shortDate(g.compared_to)}</b> · <Link href={g.page}>เปิดหน้าสแกน ↗</Link>
      </p>

      <div className={s.stats}>
        <div className={`${s.card} ${s.stat}`}><div className={s.big}>{g.counts.total}</div><div className={s.lbl}>ผ่านสแกนวันนี้</div></div>
        <SignalCard sig={g.signal_d10} href={g.report_card_href} />
        <div className={`${s.card} ${s.stat}`}>
          <div className={s.bigSm}>{nearHigh ? <>{nearHigh.ticker} <Pct v={nearHigh.pct_from_52w_high} /></> : '—'}</div>
          <div className={s.lbl}>ใกล้ 52W High สุด <Calc /></div>
        </div>
        <div className={`${s.card} ${s.stat}`}>
          <div className={s.bigSm}>{aboveEma ? <>{aboveEma.ticker} <Pct v={aboveEma.vs_ema10_pct} /></> : '—'}</div>
          <div className={s.lbl}>เหนือ EMA10 มากสุด <Calc /></div>
        </div>
      </div>

      <div className={s.changes}>
        <div className={`${s.card} ${s.chg}`}>
          <h3>เข้าใหม่ <span>{news.length} ตัว · ไม่อยู่ในสแกนตลอด {g.lookback_days} วันทำการ</span></h3>
          <div className={s.chips}>{news.length ? news.map(r => <span key={r.ticker} className={s.chip}><b>{r.ticker}</b> <Pct v={r.chg_pct} /></span>) : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
        </div>
        <div className={`${s.card} ${s.chg}`}>
          <h3>กลับเข้า <span>{re.length} ตัว · วงเล็บ = วันล่าสุดที่อยู่ในสแกน</span></h3>
          <div className={s.chips}>{re.length ? re.map(r => <span key={r.ticker} className={s.chip}><b>{r.ticker}</b> <small>({shortDate(r.last_seen)})</small></span>) : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
        </div>
        <div className={`${s.card} ${s.chg}`}>
          <h3>หลุด <span>{g.dropped.length} ตัว</span></h3>
          <div className={s.chips}>{g.dropped.length ? g.dropped.map(d => <span key={d.ticker} className={s.chip}><b>{d.ticker}</b> <Pct v={d.chg_pct} /></span>) : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
        </div>
      </div>

      <div className={s.controls}>
        {GROWTH_FILTERS.map(f => (
          <FilterButton key={f} prefix="gr" id={f} label={LABEL[f]} count={counts[f]} active={filter === f} onClick={() => setFilter(f)} />
        ))}
        <FilterButton prefix="gr" id="dropped" label="หลุดวันนี้" count={g.dropped.length} active={false} onClick={goDropped} />
      </div>

      <div className={s.tshell} data-testid="gr-table-shell">
        <table className={s.table} data-testid="gr-table">
          <thead>
            <tr>
              <th className={s.stk}>หุ้น</th>
              <th className={s.r}>ราคา</th>
              <th className={s.r}>%วันนี้</th>
              <th className={s.r} title={DAYS_TITLE}>วัน (รอบนี้ · ไม้)</th>
              <th className={s.r}>P/E</th>
              <th className={s.r}>ROE</th>
              <th className={s.r}>Rev Gr (FY)</th>
              <th className={s.r}>Profit Gr (ไตรมาสล่าสุด YoY)</th>
              <th className={s.r}>vs EMA10<Calc /></th>
              <th className={s.r}>% ห่าง 52W High<Calc /></th>
              <th className={s.r} title="close × volume ของวันสแกนวันเดียว (ADTV_MB ของ lekkung.json) ไม่ใช่ค่าเฉลี่ย">มูลค่าวันนี้ (1 วัน)</th>
              <th>ข่าว</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.ticker} data-testid="gr-row" data-ticker={r.ticker}>
                <td className={s.stk}>
                  <Link href={`/stock/${r.ticker}`} className={s.tk}>{r.ticker}</Link>
                  <StatusTag status={r.status} />
                  <StaleTag stale={r.price_stale} barDate={r.bar_date} />
                  {r.status === 'reentry' && <span className={s.ls}>ล่าสุดในสแกน {shortDate(r.last_seen)}</span>}
                  <InScans scans={r.in_scans} exclude="growth" />
                </td>
                <td className={`${s.r} ${s.price}`}>{fmtNum(r.close)}</td>
                <td className={s.r}><Pct v={r.chg_pct} /></td>
                <td className={s.r}><DaysCell streak={r.streak_days} web={r.days_web} /></td>
                <td className={s.r}>{fmtNum(r.pe, 1)}</td>
                <td className={s.r}>{r.roe_pct == null ? '—' : `${r.roe_pct.toFixed(1)}%`}</td>
                <td className={`${s.r} ${s[pctClass(r.rev_gr_fy)]}`}>
                  {fmtPct(r.rev_gr_fy, 1)}<span className={s.ls}>{fyLabel(r.rev_gr_period) ?? '—'}</span>
                </td>
                <td className={`${s.r} ${s[pctClass(r.profit_gr_q_yoy)]}`}>
                  {fmtPct(r.profit_gr_q_yoy, 1)}<span className={s.ls}>{quarterLabel(r.profit_gr_quarter) ?? '—'} YoY</span>
                </td>
                <td className={s.r}>
                  {r.vs_ema10 != null ? `${r.vs_ema10 > 0 ? '+' : ''}${fmtNum(r.vs_ema10)}` : '—'}
                  <span className={s.ls}>{fmtPct(r.vs_ema10_pct)}</span>
                </td>
                <td className={s.r}><Pct v={r.pct_from_52w_high} /></td>
                <td className={s.r}>{fmtNum(r.value_mb_1d, 1)}</td>
                <td><EventTags events={r.events} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.note}>
        เรียงตามมูลค่าวันนี้ มาก → น้อย · วัน: ตัวแรก = รอบนี้ (ติดกันถึงวันนี้) · ตัวหลัง = ไม้ตามหน้าสแกน (กติกา 5 วัน) ·
        มูลค่าวันนี้ = ราคาปิด × วอลุ่มของวันเดียว (ไม่ใช่ ADTV เฉลี่ย)
      </p>

      <h3 className={s.sec} id="dr-growth-dropped">หลุดวันนี้<small>{g.dropped.length} ตัว</small></h3>
      {g.dropped.length ? <DropTable rows={g.dropped} kind="today" testid="gr-dropped" /> : <p className={s.note}>ไม่มีตัวที่หลุดวันนี้</p>}

      <h3 className={s.sec}>หลุดก่อนหน้า ยังไม่กลับเข้า<small>ภายใน {g.lookback_days} วันทำการ · {g.dropped_earlier.length} ตัว</small></h3>
      {g.dropped_earlier.length ? <DropTable rows={g.dropped_earlier} kind="earlier" testid="gr-earlier" /> : <p className={s.note}>ไม่มี</p>}
      <p className={s.note}>ราคา / %วันนี้ ของตัวที่หลุด มาจากกราฟราคา 30 วันของ StockDesk</p>

      <Phase2Box><span className={s.p2}>เฟส 2</span> การ์ดรายตัว (ข่าว · งบ · เป้าโบรก)</Phase2Box>
    </section>
  );
}
