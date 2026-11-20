// ตัวโหลดข้อมูลการ์ดใหม่ 3 ใบของหน้า /stock/[ticker] (server เท่านั้น)
// อ่านไฟล์ใน data/scans/ ตอน request ผ่าน fs แล้วส่งเฉพาะส่วนของหุ้นตัวนี้ไปที่ browser
// (report_card.json ~2.3 MB, market_stage_transitions.json ~0.9 MB ฯลฯ — ห้ามส่งทั้งไฟล์)
// ทุกไฟล์อยู่ใน outputFileTracingIncludes ของ next.config.ts · cache ตาม mtime · อ่านไม่ได้ → ส่วนนั้นเป็น null
import fs from 'fs';
import path from 'path';
import {
  STRIP_SCANS,
  buildScanHistoryCard,
  entryPlanFromSepaRow,
  groupRs,
  nvdrForTicker,
  type MoneyFlowCard,
  type RawReportCardScans,
  type RawSectorRsHistory,
  type StockInsights,
} from '@/lib/stockInsights';

const DIR = path.join(process.cwd(), 'data', 'scans');

/** history file ของแต่ละแถวในแถบ 30 วัน */
const HISTORY_FILE: Record<string, string> = {
  sepa: 'sepa_history.json',
  kell: 'oliver_kell_history.json',
  breakout: 'breakout_history.json',
  lekkung: 'lekkung_history.json',
  oneil: 'oneil_history.json',
};

const cache = new Map<string, { mtimeMs: number; value: unknown }>();

/** อ่าน + แปลงไฟล์ครั้งเดียวต่อ mtime (index by ticker) */
function loadFile<T>(file: string, transform: (raw: unknown) => T): T | null {
  const full = path.join(DIR, file);
  try {
    const { mtimeMs } = fs.statSync(full);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.value as T;
    const value = transform(JSON.parse(fs.readFileSync(full, 'utf-8')) as unknown);
    cache.set(file, { mtimeMs, value });
    return value;
  } catch {
    return null;
  }
}

type ByTicker = Map<string, Record<string, unknown>>;
function indexList(list: unknown, key: string): ByTicker {
  const m: ByTicker = new Map();
  if (Array.isArray(list)) {
    for (const r of list as Record<string, unknown>[]) {
      const t = r?.[key];
      if (typeof t === 'string') m.set(t.toUpperCase(), r);
    }
  }
  return m;
}

const sepaRows = () => loadFile('sepa.json', raw => indexList(raw, 'Ticker'));
const historyRows = (file: string) => loadFile(file, raw => indexList((raw as { tickers?: unknown })?.tickers, 'ticker'));
const stageTransitions = () => loadFile('market_stage_transitions.json', raw => {
  const r = raw as { dates?: unknown; tickers?: unknown };
  return { dates: r?.dates, byTicker: indexList(r?.tickers, 'ticker') };
});
const scanDays = () => loadFile('scan_days.json', raw => raw as Record<string, Record<string, unknown> | undefined>);
/** report_card: เก็บเฉพาะ setups แยกตามหุ้น + setup_summary (ไม่เก็บ scatter/hist ทั้งไฟล์ไว้ใน memory) */
const reportCard = () => loadFile('report_card.json', raw => {
  const scans = (raw as { scans?: Record<string, { setups?: unknown; setup_summary?: Record<string, unknown> }> })?.scans ?? {};
  const out: Record<string, { byTicker: Map<string, unknown[]>; summary: Record<string, unknown> | undefined }> = {};
  for (const [k, v] of Object.entries(scans)) {
    const byTicker = new Map<string, unknown[]>();
    if (Array.isArray(v?.setups)) {
      for (const s of v.setups as Record<string, unknown>[]) {
        const t = s?.ticker;
        if (typeof t !== 'string') continue;
        const arr = byTicker.get(t) ?? [];
        arr.push(s);
        byTicker.set(t, arr);
      }
    }
    const sum = v?.setup_summary;
    out[k] = {
      byTicker,
      summary: sum ? { n_closed: sum.n_closed, win_rate_pct: sum.win_rate_pct, avg_return_pct: sum.avg_return_pct, avg_mfe_pct: sum.avg_mfe_pct, by_stage: sum.by_stage } : undefined,
    };
  }
  return out;
});
const nvdr = () => loadFile('nvdr.json', raw => raw as { latest_date?: unknown; today?: unknown; '5d'?: unknown });
const sectorRs = () => loadFile('sector_rs_history.json', raw => raw as RawSectorRsHistory);

export interface InsightsGroup { market: string | null; sector: string | null; subsector: string | null }

export function stockInsightsFor(ticker: string, group: InsightsGroup, opts: { isFund: boolean }): StockInsights {
  const t = ticker.toUpperCase();

  // ① จุดเข้า & แผนเทรด — กองทุน/REIT ไม่มีการ์ดนี้
  const entryPlan = opts.isFund ? null : entryPlanFromSepaRow(sepaRows()?.get(t));

  // ② ประวัติในสแกน
  const st = stageTransitions();
  const rc = reportCard();
  const rcForTicker: RawReportCardScans = {};
  if (rc) {
    for (const [k, v] of Object.entries(rc)) rcForTicker[k] = { setups: v.byTicker.get(t) ?? [], setup_summary: v.summary };
  }
  const hitDates: Record<string, unknown> = {};
  for (const s of STRIP_SCANS) hitDates[s.key] = historyRows(HISTORY_FILE[s.key])?.get(t)?.hitDates;
  const history = buildScanHistoryCard({
    ticker: t,
    dates: st?.dates,
    stageRuns: st?.byTicker.get(t)?.runs,
    hitDates,
    scanDays: scanDays(),
    reportCard: rc ? rcForTicker : null,
  });

  // ③ แรงเงิน & กลุ่ม — กองทุนไม่อยู่ในตัวเลขกลุ่ม → ไม่ใช้ RS กลุ่ม
  const flow = nvdrForTicker(nvdr(), t);
  const rs = opts.isFund ? null : groupRs(sectorRs(), group.market, group.sector, group.subsector);
  const moneyFlow: MoneyFlowCard | null = flow.today || flow.d5 || rs ? { ...flow, rs } : null;

  return { entryPlan, history, moneyFlow };
}
