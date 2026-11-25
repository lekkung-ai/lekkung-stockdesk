'use client';

import React, { useMemo, useState } from 'react';
import { LIQ_DEFAULT, LIQ_LABELS, type LiqSet } from '@/lib/liquidity';
import { toNum, vcpFootprint, vcpTooltip } from '@/lib/sepaTier';
import { shortDate, fmtNum, type DailyReport } from '@/lib/dailyReport';
import {
  type SepaSection, type SepaFilter, type SepaRow, type RankedSepa,
  SEPA_FILTERS, NEAR_HIGH_PCT, rankSepa, matchSepa, sepaFilterCounts, comparePivot, fplusLabel, sepaHeadline, sepaWatch,
} from '@/lib/dailyReportTabs';
import {
  N, Pct, Price, StatusTag, StaleTag, EventTags, InScans, NoData, TabHead, Verdict, StatCard, ChangeBox, Chip,
  FilterButton, StockCard, Fold, ReportCardLink, DaysCell, DAYS_TITLE_WEB,
} from './shared';
import s from './DailyReport.module.css';

const LABEL: Record<SepaFilter, string> = {
  all: 'ทั้งหมด', ready: 'พร้อมยิง', watch: 'เฝ้าดู', fplus: 'F+', new: 'เข้าใหม่ (NEW)',
  near_high: `ห่าง High ≤ ${NEAR_HIGH_PCT}%`,
};
const TOP_CARDS = 10;

function TierTag({ tier }: { tier: RankedSepa<SepaRow>['tier'] }) {
  if (tier === 'ready') return <span className={`${s.tag} ${s.tReady}`}>🎯 พร้อมยิง</span>;
  if (tier === 'watch') return <span className={`${s.tag} ${s.tWatch}`}>👀 เฝ้าดู</span>;
  return null; // ไม่อยู่ในพร้อมยิง/เฝ้าดู → ไม่ติดป้ายกลุ่ม
}

function FTag({ v }: { v: boolean | null | undefined }) {
  return <span className={`${s.tag} ${v === true ? s.tF : s.tStay}`}>{fplusLabel(v)}</span>;
}

function PivotCell({ row }: { row: SepaRow }) {
  const toPivot = toNum(row.VCP_ToPivot);
  if (toPivot == null) return <span className={s.flat}>ไม่มีฐาน</span>;
  return (
    <>
      <N>{fmtNum(toNum(row.VCP_Pivot))}</N>
      <span className={s.ls}>{toPivot < 0 ? `ผ่านไปแล้ว ${Math.abs(toPivot).toFixed(1)}%` : `อีก ${toPivot.toFixed(1)}%`}</span>
    </>
  );
}

export default function SepaTab({ sp, market }: { sp: SepaSection | null; market: DailyReport['market'] }) {
  const [liq, setLiq] = useState<LiqSet>(LIQ_DEFAULT);
  const [filter, setFilter] = useState<SepaFilter>('all');
  const [byPivot, setByPivot] = useState(false);

  const ranked = useMemo(() => (sp ? rankSepa(sp.rows, liq) : []), [sp, liq]);
  const prevRanked = useMemo(() => (sp ? rankSepa(sp.prev_rows, liq) : []), [sp, liq]);
  const prevRank = useMemo(() => new Map(prevRanked.map(x => [x.row.Ticker, x.rank])), [prevRanked]);
  const counts = useMemo(() => sepaFilterCounts(ranked), [ranked]);
  const shown = useMemo(() => {
    const r = ranked.filter(x => matchSepa(x, filter));
    return byPivot ? [...r].sort((a, b) => comparePivot(a.row.VCP_ToPivot, b.row.VCP_ToPivot) || a.rank - b.rank) : r;
  }, [ranked, filter, byPivot]);
  if (!sp) return <NoData />;

  const allN = sp.rows.length;
  const viewSet = new Set(ranked.map(x => x.row.Ticker));
  const prevViewSet = new Set(prevRanked.map(x => x.row.Ticker));
  const ready = ranked.filter(x => x.tier === 'ready').length;
  const watch = ranked.filter(x => x.tier === 'watch').length;
  const web = sp.web_diff;
  const webNew = web ? web.new_tickers.filter(t => viewSet.has(t)) : null;
  const webDrop = web ? web.dropped_tickers.filter(t => prevViewSet.has(t)) : null;
  const myNew = ranked.filter(x => x.row.status === 'new');
  const readyRows = ranked.filter(x => x.tier === 'ready');
  const drops = sp.dropped.filter(d => prevViewSet.has(d.ticker));

  return (
    <section data-testid="dr-sepa">
      <TabHead title="SEPA Trend Template" date={sp.date} ts={sp.generated_at} compared={sp.compared_to} href={sp.page} />
      <Verdict text={sepaHeadline(ranked)} />
      {market?.condition && (
        <p className={s.tabHead} data-testid="sepa-market-ref">
          สภาพตลาด {market.condition.label}
          {market.condition.dd_count != null && <> · Distribution Day <N>{market.condition.dd_count}</N> ครั้งใน <N>{market.condition.dd_window}</N> วันทำการ</>}
          {' '}(ดูแถบตลาดด้านบน)
        </p>
      )}

      <div className={s.controls}>
        <button type="button" className={s.filter} aria-pressed={liq === 'all'} data-testid="sepa-liq-toggle"
          onClick={() => { setLiq(liq === 'all' ? LIQ_DEFAULT : 'all'); setFilter('all'); }}>
          {liq === 'all' ? `กลับไปชุดสภาพคล่อง ${LIQ_LABELS[LIQ_DEFAULT]}` : `แสดงทั้งหมด ${allN} ตัว`}
        </button>
        <span className={s.viewNote} data-testid="sepa-view">
          มุมมอง: {liq === 'all' ? 'ทั้งหมด' : `สภาพคล่อง ${LIQ_LABELS[liq]} (ค่าเริ่มต้นของหน้า /sepa)`} · <N>{ranked.length}</N> ตัว
        </span>
      </div>

      <div className={s.statCards}>
        <StatCard testid="sepa-count" big={<>{ranked.length}<span className={s.scOf}> / {allN}</span></>}
          label={liq === 'all' ? 'ผ่านสแกน (ทั้งหมด)' : 'ผ่านสแกน (ในชุดสภาพคล่อง / ทั้งหมด)'} />
        <StatCard big={<>{ready} · {watch}</>} label="พร้อมยิง · เฝ้าดู" />
        <StatCard big={<><span className={s.pos}>+{webNew ? webNew.length : myNew.length}</span> · <span className={s.neg}>−{webDrop ? webDrop.length : drops.length}</span></>}
          label="เข้าใหม่ (NEW) · หลุด — ตามหน้า /sepa" />
        <StatCard big={ranked[0] ? ranked[0].row.Ticker : '—'} label={ranked[0] ? <>อันดับ 1 · Score <N>{Math.round(ranked[0].score)}</N></> : 'อันดับ 1'} />
      </div>
      <ReportCardLink href={sp.report_card_href} />

      <div className={s.changes}>
        <ChangeBox title="เข้าใหม่ (NEW)" hint="ไม่อยู่ในสแกนวันทำการก่อนหน้า"
          chips={myNew.map(x => <Chip key={x.row.Ticker} ticker={x.row.Ticker}><Pct v={x.row.chg_pct} /></Chip>)}
          note={myNew.length > 0 && myNew.map(x => <div key={x.row.Ticker}>{x.row.Ticker}: {x.row.seen_before ? `เคยอยู่ล่าสุด ${shortDate(x.row.seen_before)}` : `ครั้งแรกใน ${sp.lookback_days} วันทำการ`}</div>)} />
        <ChangeBox title="🎯 พร้อมยิง" chips={readyRows.map(x => <Chip key={x.row.Ticker} ticker={x.row.Ticker}><span className={s.small}>อันดับ {x.rank}</span></Chip>)} />
        <ChangeBox title="หลุด" chips={drops.map(d => <Chip key={d.ticker} ticker={d.ticker}><Pct v={d.chg_pct} /></Chip>)}
          note={drops.length > 0 && drops.map(d => <div key={d.ticker}>{d.ticker}: {d.days_before_drop === 1 ? 'อยู่รอบนี้แค่วันเดียว' : <>อยู่มา <N>{d.days_before_drop}</N> วัน</>}</div>)} />
      </div>

      <div className={s.controls}>
        {SEPA_FILTERS.map(f => (
          <FilterButton key={f} prefix="sepa" id={f} label={LABEL[f]} count={counts[f]} active={filter === f} onClick={() => setFilter(f)} />
        ))}
        <button type="button" className={s.filter} aria-pressed={byPivot} onClick={() => setByPivot(v => !v)} data-testid="sepa-sort-pivot">
          {byPivot ? 'เรียงตามอันดับ' : 'เรียงตามระยะถึง Pivot'}
        </button>
      </div>

      <div className={s.tableShell}>
        <table className={s.table} data-testid="sepa-table">
          <thead>
            <tr>
              <th className={s.r}>อันดับ</th>
              <th className={s.stk}>หุ้น</th>
              <th className={s.r} title="สูตรเดียวกับหน้า /sepa (RS 50% · งบ 20% · ใกล้ High 30%)">Score</th>
              <th className={s.r}>ราคา</th>
              <th className={s.r}>%วันนี้</th>
              <th className={s.r} title={DAYS_TITLE_WEB}>Days</th>
              <th className={s.r}>ห่าง High</th>
              <th>VCP</th>
              <th className={s.r}>Pivot</th>
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
              return (
                <tr key={r.Ticker} data-testid="sepa-row" data-ticker={r.Ticker} data-rank={x.rank} data-score={x.score} data-topivot={toPivot ?? ''}>
                  <td className={s.r}><N>{x.rank}</N></td>
                  <td className={s.stk}>
                    <span className={`${s.tk} ${s.num}`}>{r.Ticker}</span>
                    <StatusTag status={r.status} seenBefore={r.seen_before} />
                    <TierTag tier={x.tier} />
                    <FTag v={r.Fundamental_Pass} />
                    <StaleTag stale={r.price_stale} barDate={r.bar_date} />
                  </td>
                  <td className={s.r}><N>{Math.round(x.score)}</N></td>
                  <td className={s.r}><Price v={r.Price} /></td>
                  <td className={s.r}><Pct v={r.chg_pct} /></td>
                  <td className={s.r}><DaysCell web={r.days_web} streak={r.streak_days} /></td>
                  <td className={s.r}><Pct v={x.fromHigh} digits={1} /></td>
                  <td title={vcpTooltip(r) ?? undefined}>{vcpFootprint(r) ? <N>{vcpFootprint(r)}</N> : <span className={s.flat}>—</span>}</td>
                  <td className={s.r}><PivotCell row={r} /></td>
                  <td className={s.r}><N>{r.RS_Rating}</N></td>
                  <td className={s.r}><N>{fmtNum(r['ADTV(MB)'], 1)}</N></td>
                  <td className={s.r}>
                    {prev == null ? <span className={s.flat}>—</span> : (
                      <><N>{prev}</N>{' '}{prev > x.rank ? <span className={s.pos}>↑<N>{prev - x.rank}</N></span> : prev < x.rank ? <span className={s.neg}>↓<N>{x.rank - prev}</N></span> : <span className={s.flat}>=</span>}</>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.tableNote}>
        อันดับ / Score / กลุ่ม ใช้สูตรและเกณฑ์เดียวกับหน้า /sepa ในมุมมองเดียวกัน · เรียงตาม Pivot: ใกล้ → ไกล แล้วตัวที่ผ่าน Pivot แล้ว แล้วตัวที่ไม่มีฐาน
      </p>

      <h3 className={s.sectionH}>การ์ดรายตัว — Top {TOP_CARDS}<small>ตามอันดับของมุมมองนี้</small></h3>
      <div className={s.cards} data-testid="sepa-cards">
        {ranked.slice(0, TOP_CARDS).map(x => {
          const r = x.row;
          return (
            <StockCard
              key={r.Ticker} id={`s-${r.Ticker}`} testid="sepa-card" ticker={r.Ticker} rank={x.rank} close={toNum(r.Price)} chg={r.chg_pct}
              tags={<><TierTag tier={x.tier} /><FTag v={r.Fundamental_Pass} /><StatusTag status={r.status} seenBefore={r.seen_before} /><StaleTag stale={r.price_stale} barDate={r.bar_date} /><InScans scans={r.in_scans} exclude="sepa" asTag /><EventTags events={r.events} /></>}
              right={{
                title: 'SEPA',
                rows: [
                  ['Score · RS', <><N>{Math.round(x.score)}</N> · <N>{r.RS_Rating}</N></>],
                  ['VCP', vcpFootprint(r) ? <N>{vcpFootprint(r)}</N> : 'ยังไม่มีฐาน'],
                  ['Pivot', <PivotCell key="p" row={r} />],
                  ['ห่าง High รอบปี', <Pct key="h" v={x.fromHigh} digits={1} />],
                  ['งบ', fplusLabel(r.Fundamental_Pass)],
                  ['Days · ADTV 50 วัน', <><DaysCell web={r.days_web} streak={r.streak_days} /> · <N>{fmtNum(r['ADTV(MB)'], 1)}</N> ลบ.</>],
                ],
              }}
              watch={sepaWatch(x)}
            />
          );
        })}
      </div>

      <h3 className={s.sectionH}>หลุดวันนี้<small>{drops.length} ตัว</small></h3>
      {drops.length ? (
        <div className={s.tableShell}>
          <table className={`${s.table} ${s.tableSm}`} data-testid="sepa-dropped">
            <thead><tr><th className={s.stk}>หุ้น</th><th className={s.r}>ราคา</th><th className={s.r}>%วันนี้</th><th className={s.r}>อยู่ในสแกนมา</th></tr></thead>
            <tbody>
              {drops.map(d => (
                <tr key={d.ticker}>
                  <td className={s.stk}><span className={`${s.tk} ${s.num}`}>{d.ticker}</span><StaleTag stale={d.price_stale} barDate={d.bar_date} /><InScans scans={d.in_scans} /></td>
                  <td className={s.r}><Price v={d.close} /></td>
                  <td className={s.r}><Pct v={d.chg_pct} /></td>
                  <td className={s.r}><N>{d.days_before_drop}</N> วัน</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className={s.tableNote}>ไม่มีตัวที่หลุดวันนี้ในมุมมองนี้</p>}

      <Fold title="แหล่งข้อมูล · เกณฑ์">
        <p><b>พร้อมยิง:</b> VCP หดตัวเป็นขั้น ≥ 2 ครั้ง และราคาต่ำกว่า Pivot 0–5% · <b>เฝ้าดู:</b> ยังไม่พร้อมยิง แต่ RS ≥ 80 และห่าง High รอบปีไม่เกิน 15%</p>
        <p><b>งบ:</b> F+ = ผ่านเกณฑ์งบ · ไม่มี F+ = มีงบแต่ไม่ผ่าน · ไม่มีข้อมูลงบ = ไม่มีงบให้ตรวจ</p>
        <p><b>เข้าใหม่ (NEW) / หลุด / Days:</b> ตามหน้า /sepa · ตัวเล็กสีเทา &ldquo;เคยอยู่ล่าสุด&rdquo; = ข้อมูลเสริมจากประวัติ 10 วันทำการ</p>
      </Fold>
    </section>
  );
}
