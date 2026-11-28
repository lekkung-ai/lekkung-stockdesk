// ส่วน "สแกนแบบเหตุการณ์" ในหน้า /report-card (ใต้การ์ดสแกนเดิม) — การ์ด RS Leaders + Martin Luk
import Link from 'next/link';
import type { RcEventsData } from '@/lib/rcEvents';
import { fmtInt, fmtRate, lukPullback, rs7Summary } from '@/lib/rcEvents';
import { CARD, Pt, Ret, SmallBadge } from '@/components/reportCard/EventsUi';

function Stat({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[22px] font-bold tabular-nums leading-tight">{children}</div>
      <div className="text-[12px] text-white/45 mt-0.5">{k}</div>
    </div>
  );
}

export default function EventScanCards({ data }: { data: RcEventsData | null }) {
  const rs7 = data ? rs7Summary(data) : null;
  const lp = data ? lukPullback(data) : null;
  return (
    <section className="space-y-3" data-testid="rce-section">
      <div>
        <h2 className="text-[15px] font-extrabold text-white">สแกนแบบ &ldquo;เหตุการณ์&rdquo;</h2>
        <p className="mt-0.5 text-[13px] text-white/55">
          นับจากวันที่เกิดจุดซื้อ ไม่ใช่ &ldquo;อยู่ใน list = ถือ&rdquo; · ผลถือครบกำหนด ไม่มีกฎขาย · ใช้ราคาและ SET จาก pipeline
        </p>
      </div>
      {!data ? (
        <div className={`${CARD} p-5 text-[14px] text-white/60`} data-testid="rce-empty">
          ยังไม่มีข้อมูล Report Card แบบเหตุการณ์ · จะมาในรอบสแกนถัดไป
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link href="/report-card/rs7" className={`${CARD} block p-4 hover:border-white/20 transition-colors`} data-testid="rce-card-rs7">
            <div className="text-[16px] font-bold text-white">RS Leaders (Minervini 7)</div>
            <div className="text-[13px] text-white/50">สัญญาณซื้อ = BREAKOUT / PIVOT_RECLAIM / BASE_BREAKOUT · {fmtInt(rs7?.n)} ครั้ง</div>
            {rs7 ? (
              <>
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
                  <Stat k="ผลเฉลี่ย 20 วัน"><Ret v={rs7.d20.avg} /></Stat>
                  <Stat k="ชนะ (20 วัน)"><span className="text-white">{fmtRate(rs7.d20.win_pct)}</span></Stat>
                  <Stat k="เทียบ SET (จุด)"><Pt v={rs7.d20.excess_avg} /></Stat>
                </div>
                <div className="mt-2 text-[13px] text-white/60">
                  {rs7.best && <>ดีสุด: แบบ {rs7.best.pattern} {rs7.best.name} (<Ret v={rs7.best.d20.avg} />)</>}
                  {rs7.worst && <> · แย่สุด: แบบ {rs7.worst.pattern} {rs7.worst.name} (<Ret v={rs7.worst.d20.avg} />, {rs7.worst.d20.n} ครั้ง)<SmallBadge show={rs7.worst.small_sample} /></>}
                </div>
              </>
            ) : <div className="mt-3 text-[13px] text-white/50">ยังไม่มีสัญญาณซื้อที่วัดผลได้</div>}
          </Link>
          <Link href="/report-card/luk" className={`${CARD} block p-4 hover:border-white/20 transition-colors`} data-testid="rce-card-luk">
            <div className="text-[16px] font-bold text-white">Martin Luk</div>
            <div className="text-[13px] text-white/50">จุดเข้า = วันถัดไปทะลุ high + 1 tick · Long Pullback {fmtInt(lp?.n_events)} รายการ</div>
            {lp ? (
              <>
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
                  <Stat k="เกิดจุดเข้าจริง"><span className="text-white">{fmtRate(lp.trigger_pct)}</span></Stat>
                  <Stat k="ผล 10 วัน (ที่เข้าได้)"><Ret v={lp.r10.avg} /></Stat>
                  <Stat k="ชนะ (10 วัน)"><span className="text-white">{fmtRate(lp.r10.win_pct)}</span></Stat>
                  <Stat k="โดน stop วันเข้า*"><span className="text-white">{fmtRate(lp.stopped_entry_day_pct)}</span></Stat>
                </div>
                <div className="mt-2 text-[12px] text-white/45">* นับแบบระวังสุด: แท่งเดียวกันแตะทั้งจุดเข้าและ stop = โดน stop (กราฟรายวันไม่รู้ว่าอะไรก่อน)</div>
              </>
            ) : <div className="mt-3 text-[13px] text-white/50">ยังไม่มีรายการที่วัดผลได้</div>}
          </Link>
        </div>
      )}
    </section>
  );
}
