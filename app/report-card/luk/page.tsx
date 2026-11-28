import type { Metadata } from 'next';
import { loadRcEvents } from '@/lib/rcEventsData';
import { PENDING_NOTE, SETUP_LABEL, fmtInt, fmtRate, sourceText, type LukLongGroup, type LukWeakGroup } from '@/lib/rcEvents';
import { BackLink, Fallback, Pt, Ret, Section, SmallBadge, TD, TDR, TH, THR, Warnings, thaiDate } from '@/components/reportCard/EventsUi';

export const metadata: Metadata = { title: 'Martin Luk — Report Card' };

const REGIME_LABEL: Record<string, string> = { LONG: 'LONG', MIXED: 'MIXED', DEFENSIVE: 'DEFENSIVE', SHORT: 'SHORT' };

// static ○: อ่าน data/scans/report_card_events.json ตอน build (ไม่มีไฟล์ → ข้อความรอข้อมูล)
export default function LukReportCardPage() {
  const data = loadRcEvents();
  const long = data?.luk.long ?? null;
  const weak = data?.luk.weak ?? null;
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <BackLink />
        <h1 className="mt-1 text-[22px] font-extrabold text-white">Report Card · Martin Luk</h1>
        <p className="mt-1 text-[13px] text-white/60">
          วัดจากกราฟรายวันแทนกราฟ 1 นาที/5 นาทีที่ Luk ใช้จริง → ใช้ดูทิศทาง ไม่ใช่ผลเทรดจริง
        </p>
        {data && <p className="mt-0.5 text-[13px] text-white/45" data-testid="rce-sources">{sourceText(data.sources.luk, thaiDate)}</p>}
      </div>
      {!data && <Fallback text="ยังไม่มีข้อมูล Report Card แบบเหตุการณ์ · จะมาในรอบสแกนถัดไป" />}
      {data && !long && <Fallback text="ยังไม่มีรายการฝั่งซื้อของ Martin Luk ที่วัดผลได้" />}
      {data && long && (
        <>
          <Section title="ฝั่งซื้อ แยกตาม setup" testid="rce-luk-setup"
            sub={<>* แท่งเดียวกันแตะทั้งจุดเข้าและ stop = นับว่าโดน stop (ระวังสุด) · ตัวเลขจริงอาจดีกว่านี้ถ้าเข้าด้วยกราฟเล็ก · {PENDING_NOTE}</>}>
            <LongTable rows={[...long.by_setup.map(g => ({ key: SETUP_LABEL[g.setup ?? ''] ?? g.setup ?? '-', g })), { key: 'ทั้งหมด', g: long.all }]} />
          </Section>
          <Section title="ฝั่งซื้อ แยกตาม regime วันเกิด" testid="rce-luk-regime">
            <LongTable rows={long.by_regime.map(g => ({ key: REGIME_LABEL[g.regime ?? ''] ?? g.regime ?? '-', g }))} />
          </Section>
        </>
      )}
      {data && weak && weak.by_setup.length > 0 && (
        <Section title="หุ้นอ่อนแรง: อ่อนจริงไหม (ผลเทียบ SET)" testid="rce-luk-weak"
          sub="จากราคาปิดวันที่ขึ้นรายการ · ไม่ใช่สัญญาณชอร์ต">
          <WeakTable rows={weak.by_setup} />
        </Section>
      )}
      {data && data.luk.recent.length > 0 && (
        <Section title={`รายการฝั่งซื้อล่าสุด ${data.luk.recent.length} รายการ`} testid="rce-recent">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead><tr>
                <th className={`${TH} text-left`}>วันที่</th><th className={`${TH} text-left`}>หุ้น</th><th className={`${TH} text-left`}>Setup</th>
                <th className={THR}>Regime</th><th className={THR}>เกิดจุดเข้า</th><th className={THR}>ราคาเข้า</th><th className={THR}>ปิดวันเข้า</th>
                <th className={THR}>5 วัน</th><th className={THR}>10 วัน</th><th className={THR}>ใช้ stop</th>
              </tr></thead>
              <tbody>
                {data.luk.recent.map(r => (
                  <tr key={`${r.date}-${r.symbol}-${r.setup}`}>
                    <td className={`${TD} text-left whitespace-nowrap`}>{thaiDate(r.date)}{r.source === 'backfill' && <span className="ml-1 text-[12px] text-white/35">ย้อนหลัง</span>}</td>
                    <td className={`${TD} text-left`}><a href={`/stock/${encodeURIComponent(r.symbol)}`} className="font-bold text-[#60a5fa] hover:underline">{r.symbol}</a></td>
                    <td className={`${TD} text-left whitespace-nowrap`}>{SETUP_LABEL[r.setup] ?? r.setup}</td>
                    <td className={TDR}>{r.regime ?? '-'}</td>
                    <td className={TDR}>{r.triggered == null ? <span className="text-white/35">pending</span> : r.triggered ? (r.stopped_entry_day ? 'เข้า · โดน stop' : 'เข้า') : 'ไม่เข้า'}</td>
                    <td className={`${TDR} text-[#7dd3fc]`}>{r.entry?.toFixed(2) ?? '—'}</td>
                    {[r.r_close, r.r5, r.r10, r.r_stop].map((v, i) => (
                      <td key={i} className={TDR}>{r.triggered ? (v == null ? <span className="text-white/35">pending</span> : <Ret v={v} />) : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {data && (
        <Section title="วิธีวัด" testid="rce-defs">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-white/55">
            {[data.definitions.luk_long, data.definitions.luk_weak, data.definitions.common].filter(Boolean).map(d => <li key={d}>{d}</li>)}
          </ul>
        </Section>
      )}
      {data && <Warnings warnings={data.warnings} />}
    </div>
  );
}

function LongTable({ rows }: { rows: { key: string; g: LukLongGroup }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-[14px]">
        <thead><tr>
          <th className={`${TH} text-left`}>กลุ่ม</th><th className={THR}>รายการ</th><th className={THR}>เกิดจุดเข้า</th>
          <th className={THR}>โดน stop วันเข้า*</th><th className={THR}>ปิดวันเข้า</th><th className={THR}>5 วัน</th><th className={THR}>10 วัน</th>
          <th className={THR}>ชนะ (10 วัน)</th><th className={THR}>ใช้ stop</th><th className={THR}>MFE / MAE 10 วัน</th>
        </tr></thead>
        <tbody>
          {rows.map(({ key, g }) => (
            <tr key={key} className={g.small_sample ? 'opacity-55' : ''} data-row={key}>
              <td className={`${TD} text-left whitespace-nowrap`}>{key}<SmallBadge show={g.small_sample} /></td>
              <td className={TDR}>{fmtInt(g.n_events)}{g.pending > 0 && <div className="text-[12px] text-white/35">pending {g.pending}</div>}</td>
              <td className={TDR}>{fmtRate(g.trigger_pct)}<div className="text-[12px] text-white/35">{fmtInt(g.triggered)} ครั้ง</div></td>
              <td className={TDR}>{fmtRate(g.stopped_entry_day_pct)}</td>
              <td className={TDR}><Ret v={g.r_close.avg} /></td><td className={TDR}><Ret v={g.r5.avg} /></td>
              <td className={`${TDR} font-semibold`}><Ret v={g.r10.avg} /></td><td className={TDR}>{fmtRate(g.r10.win_pct)}</td>
              <td className={TDR}><Ret v={g.r_stop.avg} /></td>
              <td className={`${TDR} whitespace-nowrap`}><Ret v={g.mfe_avg} /> / <Ret v={g.mae_avg} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeakTable({ rows }: { rows: LukWeakGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead><tr>
          <th className={`${TH} text-left`}>แบบ</th><th className={THR}>รายการ</th><th className={THR}>แพ้ SET ใน 5 วัน</th>
          <th className={THR}>1 วัน (SET)</th><th className={THR}>5 วัน (SET)</th><th className={THR}>10 วัน (SET)</th><th className={THR}>เทียบ SET 5 วัน (จุด)</th>
        </tr></thead>
        <tbody>
          {rows.map(g => (
            <tr key={g.setup} className={g.small_sample ? 'opacity-55' : ''} data-row={g.setup}>
              <td className={`${TD} text-left whitespace-nowrap`}>{SETUP_LABEL[g.setup ?? ''] ?? g.setup}<SmallBadge show={g.small_sample} /></td>
              <td className={TDR}>{fmtInt(g.n_events)}</td>
              <td className={`${TDR} font-semibold`}>{fmtRate(g.underperform_5_pct)}</td>
              {[g.d1, g.d5, g.d10].map((h, i) => (
                <td key={i} className={`${TDR} whitespace-nowrap`}><Ret v={h.avg} /> <span className="text-[12px] text-white/40">(<Ret v={h.set_avg} />)</span></td>
              ))}
              <td className={TDR}><Pt v={g.d5.excess_avg} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
