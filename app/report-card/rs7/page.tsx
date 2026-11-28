import type { Metadata } from 'next';
import { loadRcEvents } from '@/lib/rcEventsData';
import { PENDING_NOTE, PHASE_LABEL, PHASE_READ, STATUS_LABEL, fmtInt, fmtRate, sourceText, type Rs7BuyGroup, type Rs7WatchGroup } from '@/lib/rcEvents';
import { BackLink, BarPair, Fallback, Pt, Ret, Section, SmallBadge, TD, TDR, TH, THR, Warnings, thaiDate } from '@/components/reportCard/EventsUi';

export const metadata: Metadata = { title: 'RS Leaders — Report Card' };

// static ○: อ่าน data/scans/report_card_events.json ตอน build (ไม่มีไฟล์ → ข้อความรอข้อมูล)
export default function Rs7ReportCardPage() {
  const data = loadRcEvents();
  const buy = data?.rs7.buy ?? null;
  const watch = data?.rs7.watch ?? null;
  const scale = Math.max(1, ...((buy?.by_pattern ?? []).flatMap(g => [Math.abs(g.d20.avg ?? 0), Math.abs(g.d20.set_avg ?? 0)])));
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <BackLink />
        <h1 className="mt-1 text-[22px] font-extrabold text-white">Report Card · RS Leaders (Minervini 7)</h1>
        <p className="mt-1 text-[13px] text-white/60">
          ราคาเข้า = ราคาปิดวันที่เกิดจุดซื้อ · วัดผล 5 / 10 / 20 วันทำการ · ไม่มีกฎขาย (ดูผลถือครบกำหนด) · MFE/MAE ภายใน 20 วัน
        </p>
        {data && <p className="mt-0.5 text-[13px] text-white/45" data-testid="rce-sources">{sourceText(data.sources.rs7, thaiDate)}</p>}
      </div>
      {!data && <Fallback text="ยังไม่มีข้อมูล Report Card แบบเหตุการณ์ · จะมาในรอบสแกนถัดไป" />}
      {data && !buy && <Fallback text="ยังไม่มีสัญญาณซื้อของ RS-7 ที่วัดผลได้" />}
      {data && buy && (
        <>
          <Section title="ผลเฉลี่ย 20 วันหลังจุดซื้อ เทียบ SET ช่วงเดียวกัน แยกตามรูปแบบ" testid="rce-bars"
            sub={<>แท่งบน = หุ้นในรูปแบบ · แท่งเทา = SET ช่วงเดียวกัน · จาง = ตัวอย่างน้อยกว่า {data.smallSampleN} ครั้ง</>}>
            {buy.by_pattern.map(g => (
              <BarPair key={g.pattern} label={<>{g.pattern} {g.name} <span className="text-white/40">({g.d20.n})</span></>}
                a={g.d20.avg} b={g.d20.set_avg ?? null} scale={scale} small={g.small_sample} />
            ))}
          </Section>

          <Section title="แยกตามรูปแบบ" sub={<>รวม {fmtInt(buy.all.n_events)} ครั้ง · {PENDING_NOTE}</>} testid="rce-by-pattern">
            <BuyTable rows={[...buy.by_pattern.map(g => ({ key: `${g.pattern} ${g.name}`, g })), { key: 'ทั้งหมด', g: buy.all }]} />
            <p className="mt-2 text-[13px] text-white/45">4 Sore thumbs · 5 Fast rebound เป็นรายการเฝ้า ไม่มีจุดซื้อของตัวเอง → นับในส่วน &ldquo;เข้า list แล้วเกิดอะไรต่อ&rdquo;</p>
          </Section>

          <Section title="แยกตามช่วงดัชนีวันที่เกิดจุดซื้อ" testid="rce-by-phase">
            <BuyTable rows={buy.by_phase.map(g => ({ key: PHASE_LABEL[g.phase ?? ''] ?? g.phase ?? '-', g, read: PHASE_READ[g.phase ?? ''] }))} withRead />
          </Section>
        </>
      )}
      {data && watch && (
        <Section title="ฝั่งเฝ้า: เข้า list แล้วเกิดอะไรต่อ" testid="rce-watch"
          sub={<>{fmtRate(watch.all.converted_pct)} ของรายการที่ขึ้นสถานะเฝ้า เกิดจุดซื้อภายใน 20 วัน (รวม {fmtInt(watch.all.n_entries)} ครั้ง)</>}>
          <div className="grid gap-4 lg:grid-cols-2">
            <WatchTable title="แยกตามสถานะ" rows={watch.by_status.map(g => ({ key: STATUS_LABEL[g.status ?? ''] ?? g.status ?? '-', g }))} />
            <WatchTable title="แยกตามรูปแบบ" rows={watch.by_pattern.map(g => ({ key: `${g.pattern} ${g.name}`, g }))} />
          </div>
        </Section>
      )}
      {data && data.rs7.recent.length > 0 && (
        <Section title={`จุดซื้อล่าสุด ${data.rs7.recent.length} ครั้ง`} testid="rce-recent">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead><tr>
                <th className={`${TH} text-left`}>วันที่</th><th className={`${TH} text-left`}>หุ้น</th><th className={`${TH} text-left`}>รูปแบบ · สถานะ</th>
                <th className={THR}>ช่วง</th><th className={THR}>ราคาเข้า</th><th className={THR}>5 วัน</th><th className={THR}>10 วัน</th><th className={THR}>20 วัน</th>
              </tr></thead>
              <tbody>
                {data.rs7.recent.map(r => (
                  <tr key={`${r.date}-${r.ticker}-${r.pattern}`}>
                    <td className={`${TD} text-left whitespace-nowrap`}>{thaiDate(r.date)}{r.source === 'backfill' && <span className="ml-1 text-[12px] text-white/35">ย้อนหลัง</span>}</td>
                    <td className={`${TD} text-left`}><a href={`/stock/${encodeURIComponent(r.ticker)}`} className="font-bold text-[#60a5fa] hover:underline">{r.ticker}</a></td>
                    <td className={`${TD} text-left whitespace-nowrap`}>{r.pattern} · {r.status}</td>
                    <td className={TDR}>{r.phase ?? '-'}</td>
                    <td className={`${TDR} text-[#7dd3fc]`}>{r.entry?.toFixed(2) ?? '—'}</td>
                    {[r.r5, r.r10, r.r20].map((v, i) => <td key={i} className={TDR}>{v == null ? <span className="text-white/35">pending</span> : <Ret v={v} />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {data && <Definitions defs={[data.definitions.rs7_buy, data.definitions.rs7_watch, data.definitions.common]} />}
      {data && <Warnings warnings={data.warnings} />}
    </div>
  );
}

function BuyTable({ rows, withRead = false }: { rows: { key: string; g: Rs7BuyGroup; read?: string }[]; withRead?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[14px]">
        <thead><tr>
          <th className={`${TH} text-left`}>{withRead ? 'ช่วง' : 'รูปแบบ'}</th><th className={THR}>ครั้ง</th>
          <th className={THR}>5 วัน</th><th className={THR}>10 วัน</th><th className={THR}>20 วัน</th><th className={THR}>ชนะ (20 วัน)</th>
          <th className={THR}>เทียบ SET (จุด)</th><th className={THR}>MFE / MAE</th>
          {withRead && <th className={`${TH} text-left`}>อ่านว่า</th>}
        </tr></thead>
        <tbody>
          {rows.map(({ key, g, read }) => (
            <tr key={key} className={g.small_sample ? 'opacity-55' : ''} data-row={key}>
              <td className={`${TD} text-left whitespace-nowrap`}>{key}<SmallBadge show={g.small_sample} /></td>
              <td className={TDR}>{fmtInt(g.n_events)}{g.d20.pending > 0 && <div className="text-[12px] text-white/35">pending {g.d20.pending}</div>}</td>
              <td className={TDR}><Ret v={g.d5.avg} /></td><td className={TDR}><Ret v={g.d10.avg} /></td>
              <td className={`${TDR} font-semibold`}><Ret v={g.d20.avg} /></td>
              <td className={TDR}>{fmtRate(g.d20.win_pct)}</td>
              <td className={TDR}><Pt v={g.d20.excess_avg} /></td>
              <td className={`${TDR} whitespace-nowrap`}><Ret v={g.mfe_avg} /> / <Ret v={g.mae_avg} /></td>
              {withRead && <td className={`${TD} text-left text-[13px] text-white/55`}>{read ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WatchTable({ title, rows }: { title: string; rows: { key: string; g: Rs7WatchGroup }[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-[13px] font-semibold text-white/70">{title}</div>
      <table className="w-full min-w-[420px] border-collapse text-[14px]">
        <thead><tr>
          <th className={`${TH} text-left`}>{title.replace('แยกตาม', '')}</th><th className={THR}>เข้า list</th>
          <th className={THR}>เกิดจุดซื้อใน 20 วัน</th><th className={THR}>ผล 20 วัน</th>
        </tr></thead>
        <tbody>
          {rows.map(({ key, g }) => (
            <tr key={key} className={g.small_sample ? 'opacity-55' : ''}>
              <td className={`${TD} text-left whitespace-nowrap`}>{key}<SmallBadge show={g.small_sample} /></td>
              <td className={TDR}>{fmtInt(g.n_entries)}</td>
              <td className={TDR}>{fmtRate(g.converted_pct)}</td>
              <td className={TDR}><Ret v={g.d20.avg} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Definitions({ defs }: { defs: (string | undefined)[] }) {
  const list = defs.filter((d): d is string => !!d);
  if (!list.length) return null;
  return (
    <Section title="วิธีวัด" testid="rce-defs">
      <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-white/55">{list.map(d => <li key={d}>{d}</li>)}</ul>
      <p className="mt-2 text-[13px] text-white/45">ผลถือครบกำหนด ไม่มีกฎขายระหว่างทาง → ใช้เทียบคุณภาพสัญญาณ ไม่ใช่ผลพอร์ต · ผลย้อนหลังไม่ได้การันตีอนาคต</p>
    </Section>
  );
}
