'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { LIQ_DEFAULT, LIQ_LABELS, type LiqSet } from '@/lib/liquidity';
import { toNum, vcpFootprint, vcpTooltip, isVolumeDry } from '@/lib/sepaTier';
import { shortDate, hhmm, fmtNum, fmtPct, type DailyReport } from '@/lib/dailyReport';
import {
  type SepaSection, type SepaFilter, type SepaRow, type RankedSepa,
  SEPA_FILTERS, NEAR_HIGH_PCT, rankSepa, matchSepa, sepaFilterCounts, comparePivot, fplusLabel,
} from '@/lib/dailyReportTabs';
import { Calc, Pct, StatusTag, StaleTag, EventTags, InScans, DaysCell, DAYS_TITLE, NoData, Phase2Box, SignalCard, FilterButton } from './shared';
import s from './DailyReport.module.css';

const LABEL: Record<SepaFilter, string> = {
  all: 'ทั้งหมด', ready: '🎯 พร้อมยิง', watch: '👀 เฝ้าดู', fplus: 'F+', new: 'เข้าใหม่', reentry: 'กลับเข้า',
  near_high: `ห่าง High ≤ ${NEAR_HIGH_PCT}%`,
};

function TierTag({ tier }: { tier: RankedSepa<SepaRow>['tier'] }) {
  if (tier === 'ready') return <span className={`${s.tag} ${s.tReady}`}>🎯 พร้อมยิง</span>;
  if (tier === 'watch') return <span className={`${s.tag} ${s.tWatch}`}>👀 เฝ้าดู</span>;
  return null; // ไม่อยู่ในพร้อมยิง/เฝ้าดู → ไม่ติดป้ายกลุ่ม
}

function FTag({ v }: { v: boolean | null | undefined }) {
  const cls = v === true ? s.tF : s.tStay;
  return <span className={`${s.tag} ${cls}`}>{fplusLabel(v)}</span>;
}

export default function SepaTab({ sp, market }: { sp: SepaSection | null; market: DailyReport['market'] }) {
  const [liq, setLiq] = useState<LiqSet>(LIQ_DEFAULT);
  const [filter, setFilter] = useState<SepaFilter>('all');
  const [byPivot, setByPivot] = useState(false);

  const ranked = useMemo(() => (sp ? rankSepa(sp.rows, liq) : []), [sp, liq]);
  const prevRank = useMemo(() => new Map(sp ? rankSepa(sp.prev_rows, liq).map(x => [x.row.Ticker, x.rank]) : []), [sp, liq]);
  const counts = useMemo(() => sepaFilterCounts(ranked), [ranked]);
  const shown = useMemo(() => {
    const r = ranked.filter(x => matchSepa(x, filter));
    return byPivot ? [...r].sort((a, b) => comparePivot(a.row.VCP_ToPivot, b.row.VCP_ToPivot) || a.rank - b.rank) : r;
  }, [ranked, filter, byPivot]);
  if (!sp) return <NoData />;

  const allN = sp.rows.length;
  const viewSet = new Set(ranked.map(x => x.row.Ticker));
  const prevViewSet = new Set(rankSepa(sp.prev_rows, liq).map(x => x.row.Ticker));
  const ready = ranked.filter(x => x.tier === 'ready').length;
  const watch = ranked.filter(x => x.tier === 'watch').length;
  // เข้า/หลุด ตามเว็บ (sepa_diff) เป็นหลัก — นับเฉพาะตัวในมุมมองที่เลือก
  const web = sp.web_diff;
  const webNew = web ? web.new_tickers.filter(t => viewSet.has(t)) : null;
  const webDrop = web ? web.dropped_tickers.filter(t => prevViewSet.has(t)) : null;
  const myNew = ranked.filter(x => x.row.status === 'new');
  const myRe = ranked.filter(x => x.row.status === 'reentry');
  const splitOk = webNew != null && webNew.length === myNew.length + myRe.length;
  const drops = sp.dropped.filter(d => prevViewSet.has(d.ticker));
  const ts = hhmm(sp.generated_at);

  return (
    <section data-testid="dr-sepa">
      <h2 className={s.tabTitle}>SEPA Trend Template</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(sp.date)}{ts && ` ${ts}`} · <b>เทียบกับ: {shortDate(sp.compared_to)}</b> · <Link href={sp.page}>เปิดหน้าสแกน ↗</Link>
      </p>
      {market?.condition && (
        <p className={s.tabHead} data-testid="sepa-market-ref">
          สภาพตลาด {market.condition.label}
          {market.condition.dd_count != null && <> · Distribution Day {market.condition.dd_count} ครั้งใน {market.condition.dd_window} วันทำการ</>}
          {' '}(รายละเอียดที่แถบตลาดด้านบน)
        </p>
      )}

      <div className={s.controls}>
        <button
          type="button"
          className={s.f}
          aria-pressed={liq === 'all'}
          onClick={() => { setLiq(liq === 'all' ? LIQ_DEFAULT : 'all'); setFilter('all'); }}
          data-testid="sepa-liq-toggle"
        >
          {liq === 'all' ? `กลับไปชุดสภาพคล่อง ${LIQ_LABELS[LIQ_DEFAULT]}` : `แสดงทั้งหมด ${allN} ตัว`}
        </button>
        <span className={s.flat} data-testid="sepa-view">
          มุมมอง: {liq === 'all' ? 'ทั้งหมด' : `สภาพคล่อง ${LIQ_LABELS[liq]} (ค่าเริ่มต้นของหน้า /sepa)`} · {ranked.length} ตัว
        </span>
      </div>

      <div className={s.stats}>
        <div className={`${s.card} ${s.stat}`}>
          <div className={s.big} data-testid="sepa-count">{ranked.length}<span className={s.bigOf}> / {allN}</span></div>
          <div className={s.lbl}>ผ่านสแกน ({liq === 'all' ? 'ทั้งหมด' : 'ในชุดสภาพคล่อง'} / ทั้งหมด)</div>
        </div>
        <div className={`${s.card} ${s.stat}`}>
          <div className={s.big}>{ready} · {watch}</div>
          <div className={s.lbl}>🎯 พร้อมยิง · 👀 เฝ้าดู (เกณฑ์เดียวกับหน้า /sepa)</div>
        </div>
        <SignalCard sig={sp.signal_d10} href={sp.report_card_href} />
        <div className={`${s.card} ${s.stat}`}>
          <div className={s.big}>
            {webNew ? <><span className={s.pos}>+{webNew.length}</span> · <span className={s.neg}>−{webDrop?.length}</span></> : '—'}
          </div>
          <div className={s.lbl}>
            {webNew ? (
              splitOk ? <>เข้า {webNew.length} ตามเว็บ = เข้าใหม่ {myNew.length} + กลับเข้า {myRe.length} · หลุด {webDrop?.length}</>
                : <>เข้า {webNew.length} ตามเว็บ · หน้านี้นับได้ เข้าใหม่ {myNew.length} + กลับเข้า {myRe.length} (ไม่เท่ากัน: เว็บเทียบกับ {shortDate(web?.previous_date)})</>
            ) : <>ไม่มีไฟล์เข้า/หลุดของวันนี้ (sepa_diff) · หน้านี้นับได้ เข้าใหม่ {myNew.length} + กลับเข้า {myRe.length}</>}
          </div>
        </div>
      </div>

      <div className={s.changes}>
        <div className={`${s.card} ${s.chg}`}>
          <h3>เข้าใหม่ <span>{myNew.length} ตัว · ไม่อยู่ในสแกนตลอด {sp.lookback_days} วันทำการ</span></h3>
          <div className={s.chips}>{myNew.length ? myNew.map(x => <span key={x.row.Ticker} className={s.chip}><b>{x.row.Ticker}</b> <Pct v={x.row.chg_pct} /></span>) : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
        </div>
        <div className={`${s.card} ${s.chg}`}>
          <h3>กลับเข้า <span>{myRe.length} ตัว · วงเล็บ = วันล่าสุดที่อยู่ในสแกน</span></h3>
          <div className={s.chips}>{myRe.length ? myRe.map(x => <span key={x.row.Ticker} className={s.chip}><b>{x.row.Ticker}</b> <small>({shortDate(x.row.last_seen)})</small></span>) : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
        </div>
        <div className={`${s.card} ${s.chg}`}>
          <h3>หลุด <span>{drops.length} ตัว</span></h3>
          <div className={s.chips}>{drops.length ? drops.map(d => <span key={d.ticker} className={s.chip}><b>{d.ticker}</b> <Pct v={d.chg_pct} /></span>) : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
        </div>
      </div>

      <div className={s.controls}>
        {SEPA_FILTERS.map(f => (
          <FilterButton key={f} prefix="sepa" id={f} label={LABEL[f]} count={counts[f]} active={filter === f} onClick={() => setFilter(f)} />
        ))}
        <button type="button" className={s.f} aria-pressed={byPivot} onClick={() => setByPivot(v => !v)} data-testid="sepa-sort-pivot">
          {byPivot ? 'เรียงตามอันดับ' : 'เรียงตามระยะถึง Pivot'}
        </button>
      </div>

      <div className={s.tshell}>
        <table className={s.table} data-testid="sepa-table">
          <thead>
            <tr>
              <th className={s.r}>อันดับ</th>
              <th className={s.stk}>หุ้น</th>
              <th className={s.r} title="Composite Score สูตรเดียวกับหน้า /sepa (RS 50% · งบ 20% · ใกล้ High 30%)">Score</th>
              <th className={s.r}>ราคา</th>
              <th className={s.r}>%วันนี้<Calc /></th>
              <th className={s.r} title={DAYS_TITLE}>วัน (รอบนี้ · ไม้)</th>
              <th className={s.r}>% ห่าง High</th>
              <th>VCP</th>
              <th className={s.r}>ถึง Pivot</th>
              <th className={s.r}>RS</th>
              <th className={s.r}>ADTV 50 วัน (ลบ.)</th>
              <th className={s.r}>อันดับวันก่อน</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(x => {
              const r = x.row;
              const prev = prevRank.get(r.Ticker);
              const toPivot = toNum(r.VCP_ToPivot);
              const fp = vcpFootprint(r);
              return (
                <tr key={r.Ticker} data-testid="sepa-row" data-ticker={r.Ticker} data-rank={x.rank} data-score={x.score} data-topivot={toPivot ?? ''}>
                  <td className={s.r}>{x.rank}</td>
                  <td className={s.stk}>
                    <Link href={`/stock/${r.Ticker}`} className={s.tk}>{r.Ticker}</Link>
                    {r.status !== 'stay' && <StatusTag status={r.status} />}
                    <TierTag tier={x.tier} />
                    <FTag v={r.Fundamental_Pass} />
                    <StaleTag stale={r.price_stale} barDate={r.bar_date} />
                    <EventTags events={r.events} />
                    {r.status === 'reentry' && <span className={s.ls}>ล่าสุดในสแกน {shortDate(r.last_seen)}</span>}
                    <InScans scans={r.in_scans} exclude="sepa" />
                  </td>
                  <td className={s.r}>{Math.round(x.score)}</td>
                  <td className={`${s.r} ${s.price}`}>{fmtNum(r.Price)}</td>
                  <td className={s.r}><Pct v={r.chg_pct} /></td>
                  <td className={s.r}><DaysCell streak={r.streak_days} web={r.days_web} /></td>
                  <td className={s.r}><Pct v={x.fromHigh} /></td>
                  <td title={vcpTooltip(r) ?? undefined}>
                    {fp ?? <span className={s.flat}>—</span>}
                    {fp && isVolumeDry(r) && <span className={s.ls}>วอลุ่มแห้ง</span>}
                  </td>
                  <td className={s.r}>
                    {toPivot == null ? <span className={s.flat}>—</span> : (
                      <>
                        {fmtNum(toNum(r.VCP_Pivot))}
                        <span className={s.ls}>
                          {toPivot < 0 ? <span className={s.warnTxt}>ผ่าน Pivot แล้ว {fmtPct(-toPivot, 1)}</span> : `ต่ำกว่า ${toPivot.toFixed(1)}%`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={s.r}>{r.RS_Rating}</td>
                  <td className={s.r}>{fmtNum(r['ADTV(MB)'], 1)}</td>
                  <td className={s.r}>
                    {prev == null ? <span className={s.flat}>—</span> : (
                      <>
                        {prev}{' '}
                        {prev > x.rank ? <span className={s.pos}>↑{prev - x.rank}</span> : prev < x.rank ? <span className={s.neg}>↓{x.rank - prev}</span> : <span className={s.flat}>=</span>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.note}>
        อันดับ / Score / กลุ่ม คิดด้วยสูตรและเกณฑ์เดียวกับหน้า /sepa ในมุมมองเดียวกัน · อันดับวันก่อน = สูตรเดียวกันกับข้อมูลวันก่อน ·
        ถึง Pivot: ราคา Pivot และระยะที่ราคาอยู่ต่ำกว่า · เรียงตาม Pivot: ใกล้ → ไกล แล้วตัวที่ผ่าน Pivot แล้ว แล้วตัวที่ไม่มี Pivot ·
        {' '}F+ = ผ่านเกณฑ์งบ · ไม่มี F+ = มีงบแต่ไม่ผ่าน · ไม่มีข้อมูลงบ = ไม่มีงบให้ตรวจ
      </p>

      <h3 className={s.sec}>หลุดวันนี้<small>{drops.length} ตัว</small></h3>
      {drops.length ? (
        <div className={s.tshell}>
          <table className={`${s.table} ${s.tableSm}`} data-testid="sepa-dropped">
            <thead><tr><th className={s.stk}>หุ้น</th><th className={s.r}>ราคา</th><th className={s.r}>%วันนี้</th><th className={s.r}>อยู่ในสแกนมา</th></tr></thead>
            <tbody>
              {drops.map(d => (
                <tr key={d.ticker}>
                  <td className={s.stk}><span className={s.tk}>{d.ticker}</span><StaleTag stale={d.price_stale} barDate={d.bar_date} /><EventTags events={d.events} /><InScans scans={d.in_scans} /></td>
                  <td className={`${s.r} ${s.price}`}>{fmtNum(d.close)}</td>
                  <td className={s.r}><Pct v={d.chg_pct} /></td>
                  <td className={s.r}>{d.days_before_drop} วัน</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className={s.note}>ไม่มีตัวที่หลุดวันนี้ในมุมมองนี้</p>}

      <Phase2Box><span className={s.p2}>เฟส 2</span> การ์ดรายตัว (ข่าว · งบ · เป้าโบรก)</Phase2Box>
    </section>
  );
}
