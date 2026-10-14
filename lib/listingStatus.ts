// สถานะการจดทะเบียนของหุ้น (ยังซื้อขาย / ถูกเพิกถอน / เปลี่ยนชื่อ) — pure functions, ไม่อ่านไฟล์เอง
// (ตัวโหลดข้อมูลฝั่ง server อยู่ที่ lib/listingStatusData.ts)
//
// หลักฐานที่ใช้:
//  - renamed:  universe_changes.json ทุก snapshot (data/history/<date>/ + data/scans/) → รายการ renamed {old, new}
//              วันที่ = วันของ snapshot แรกที่เห็นการเปลี่ยนชื่อ (ไฟล์ไม่มีวันมีผลจริง)
//  - delisted: universe_changes.json → รายการ delisted · ถ้าไม่มี ใช้ข่าว SET "เพิกถอน…จากการเป็นหลักทรัพย์จดทะเบียน"
//              (ไม่นับ "อาจถูกเพิกถอน" · กฎเดียวกับ scripts/build_news_flags.py) · วันที่ = วันที่ของข่าว SET นั้น
//  - manual:   data/manual_listing_changes.json — กรณีที่มีหลักฐานแต่ไม่อยู่ใน universe_changes (ทุกแถวต้องมี evidence)
//              ใช้เป็นลำดับสุดท้าย: universe_changes → ข่าว SET → manual
//  - ไม่มีราคา / API ไม่มีข้อมูล ไม่ใช่หลักฐาน → ไม่มีหลักฐานจากแหล่งไหนเลย = 'unknown'
//  - ราคาจาก TradingView ใช้แค่บอกว่าหุ้นที่ประกาศเพิกถอนแล้ว "ยังเปิดซื้อขายชั่วคราว" (stillTrading) ไม่ใช้ตัดสินสถานะ
//
// snapshot รูปแบบเก่า (2026-07-20, key "delisted_tickers") ไม่ใช้: เป็นรายการหลุดชั่วคราว 57 ตัว
// ที่ส่วนใหญ่ยังซื้อขายอยู่ (เช่น AKS, CHO, CV กลับมาใน "new" สัปดาห์ต่อมา)

export type ListingStatusKind = 'active' | 'delisted' | 'renamed' | 'unknown';
export type ListingSource = 'universe_changes' | 'set_news' | 'manual' | 'universe' | 'none';

export interface ListingStatus {
  status: ListingStatusKind;
  /** 'YYYY-MM-DD' (Asia/Bangkok) */
  date?: string;
  newTicker?: string;
  source: ListingSource;
  /** delisted แต่ TradingView ยังมีราคาของวันทำการล่าสุด (ช่วงเปิดซื้อขายชั่วคราวก่อนเพิกถอน) */
  stillTrading?: boolean;
}

export interface UniverseSnapshot {
  /** 'YYYY-MM-DD' ของ snapshot */
  date: string;
  delisted?: { ticker?: string }[] | null;
  new?: { ticker?: string }[] | null;
  renamed?: { old?: string; new?: string }[] | null;
}

export interface NewsItemLike {
  title?: string | null;
  source?: string | null;
  tickerHint?: string | null;
  ts?: number | null;
  pubDate?: string | null;
}

/** data/manual_listing_changes.json */
export interface ManualListingChanges {
  renamed?: { from?: string; to?: string; evidence?: string }[] | null;
  delisted?: { ticker?: string; date?: string; evidence?: string }[] | null;
}

export interface ListingSources {
  snapshots: UniverseSnapshot[];
  news: NewsItemLike[];
  manual?: ManualListingChanges | null;
  /** หุ้นในชุดปัจจุบัน (sector_map ∪ combined) */
  listed: Iterable<string>;
}

export interface ListingIndex {
  listed: Set<string>;
  renamed: Map<string, { newTicker: string; date: string }>;
  snapshotDelisted: Set<string>;
  newsDelisted: Map<string, string>;
  manualRenamed: Map<string, string>;
  manualDelisted: Map<string, string | null>;
}

// ── กฎข่าว SET (port จาก scripts/build_news_flags.py: classify → 'mark' ก่อน 'delist') ──
const MARK_CODE = '(?:SP|NP|NR|H|CB|CC|CF|CS|C)(?![A-Za-z])';
const MARK_RE = new RegExp(`(ขึ้น|ปลด|เพิ่มเหตุ(?:การณ์)?)\\s*(?:เครื่องหมาย)?\\s*["“'‘]?(${MARK_CODE}(?:\\s*(?:,|และ|/)\\s*${MARK_CODE})*)`);
const DELIST_RE = /เพิกถอน(?:หลักทรัพย์)?.*จากการเป็นหลักทรัพย์จดทะเบียน/;
const TICKER_TOKEN_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9&-]{1,9})(?![A-Za-z0-9])/g;

/** หัวข่าว SET ที่ประกาศเพิกถอนจริง (ไม่ใช่ "อาจถูกเพิกถอน" และไม่ใช่ข่าวขึ้น/ปลดเครื่องหมาย) */
export function isDelistHeadline(title: string | null | undefined): boolean {
  const t = title ?? '';
  if (MARK_RE.test(t)) return false;
  return DELIST_RE.test(t) && !t.includes('อาจ');
}

const isSetNews = (it: NewsItemLike) => String(it.source ?? '').startsWith('SET');

const hintOf = (it: NewsItemLike) => String(it.tickerHint ?? '').trim().toUpperCase();

/** หุ้นที่ข่าวพูดถึง: tickerHint (ยกเว้นว่าง / "SET") ไม่งั้นใช้คำในหัวข่าวที่อยู่ใน universe */
export function newsTickers(item: NewsItemLike, universe: Set<string>): string[] {
  const hint = hintOf(item);
  if (hint && hint !== 'SET') return [hint];
  const seen: string[] = [];
  for (const m of (item.title ?? '').matchAll(TICKER_TOKEN_RE)) {
    if (universe.has(m[1]) && !seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

const BKK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' (Asia/Bangkok) ของข่าว: ts (ms) ก่อน ไม่งั้น pubDate · อ่านไม่ได้ → null */
export function newsDate(item: NewsItemLike): string | null {
  const d = typeof item.ts === 'number' ? new Date(item.ts) : item.pubDate ? new Date(item.pubDate) : null;
  return d && !isNaN(d.getTime()) ? BKK_DATE.format(d) : null;
}

export function buildListingIndex({ snapshots, news, manual, listed }: ListingSources): ListingIndex {
  const listedSet = new Set(listed);
  const ordered = [...snapshots].filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date)).sort((a, b) => a.date.localeCompare(b.date));

  // renamed: snapshot แรกที่เห็นเป็นวันที่ · ข้ามถ้าชื่อเดิมยังอยู่ในชุดปัจจุบันแต่ชื่อใหม่ไม่อยู่ (สัญลักษณ์ชั่วคราว เช่น BANPU → BANPUU)
  const renamed = new Map<string, { newTicker: string; date: string }>();
  for (const s of ordered) {
    for (const r of s.renamed ?? []) {
      const oldT = r?.old?.trim().toUpperCase();
      const newT = r?.new?.trim().toUpperCase();
      if (!oldT || !newT || oldT === newT) continue;
      if (listedSet.has(oldT) && !listedSet.has(newT)) continue;
      const prev = renamed.get(oldT);
      if (!prev || prev.newTicker !== newT) renamed.set(oldT, { newTicker: newT, date: s.date });
    }
  }

  // delisted จาก snapshot · ถ้า snapshot หลังจากนั้นกลับมาอยู่ใน "new" ถือว่ายกเลิก
  const lastDelisted = new Map<string, string>();
  const lastNew = new Map<string, string>();
  for (const s of ordered) {
    for (const d of s.delisted ?? []) { const t = d?.ticker?.trim().toUpperCase(); if (t) lastDelisted.set(t, s.date); }
    for (const n of s.new ?? []) { const t = n?.ticker?.trim().toUpperCase(); if (t) lastNew.set(t, s.date); }
  }
  const snapshotDelisted = new Set<string>();
  for (const [t, d] of lastDelisted) {
    const n = lastNew.get(t);
    if (!n || n <= d) snapshotDelisted.add(t);
  }

  // delisted จากข่าว SET · วันที่ = ข่าวล่าสุดของหุ้นนั้น
  const setNews = news.filter(isSetNews);
  const universe = new Set(listedSet);
  for (const it of setNews) { const h = hintOf(it); if (h && h !== 'SET') universe.add(h); }
  const newsDelisted = new Map<string, string>();
  for (const it of setNews) {
    if (!isDelistHeadline(it.title)) continue;
    const d = newsDate(it);
    if (!d) continue;
    for (const t of newsTickers(it, universe)) {
      const prev = newsDelisted.get(t);
      if (!prev || d > prev) newsDelisted.set(t, d);
    }
  }

  // manual: แถวที่ไม่มี evidence ไม่นับ
  const hasEvidence = (e: unknown) => typeof e === 'string' && e.trim() !== '';
  const manualRenamed = new Map<string, string>();
  for (const r of manual?.renamed ?? []) {
    const from = r?.from?.trim().toUpperCase();
    const to = r?.to?.trim().toUpperCase();
    if (from && to && from !== to && hasEvidence(r.evidence)) manualRenamed.set(from, to);
  }
  const manualDelisted = new Map<string, string | null>();
  for (const d of manual?.delisted ?? []) {
    const t = d?.ticker?.trim().toUpperCase();
    if (t && hasEvidence(d.evidence)) manualDelisted.set(t, d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null);
  }

  return { listed: listedSet, renamed, snapshotDelisted, newsDelisted, manualRenamed, manualDelisted };
}

export function getListingStatus(ticker: string, index: ListingIndex): ListingStatus {
  const t = ticker.trim().toUpperCase();
  const r = index.renamed.get(t);
  if (r) return { status: 'renamed', newTicker: r.newTicker, date: r.date, source: 'universe_changes' };
  const newsDate = index.newsDelisted.get(t);
  if (index.snapshotDelisted.has(t)) {
    return newsDate ? { status: 'delisted', date: newsDate, source: 'universe_changes' } : { status: 'delisted', source: 'universe_changes' };
  }
  if (newsDate) return { status: 'delisted', date: newsDate, source: 'set_news' };
  const manualNew = index.manualRenamed.get(t);
  if (manualNew) return { status: 'renamed', newTicker: manualNew, source: 'manual' };
  if (index.manualDelisted.has(t)) {
    const d = index.manualDelisted.get(t);
    return d ? { status: 'delisted', date: d, source: 'manual' } : { status: 'delisted', source: 'manual' };
  }
  if (index.listed.has(t)) return { status: 'active', source: 'universe' };
  return { status: 'unknown', source: 'none' };
}

/** ทุกหุ้นที่ถูกเพิกถอน / เปลี่ยนชื่อ (สำหรับป้ายในช่องค้นหา) */
export function inactiveStatuses(index: ListingIndex): Record<string, ListingStatus> {
  const out: Record<string, ListingStatus> = {};
  for (const t of [...index.renamed.keys(), ...index.snapshotDelisted, ...index.newsDelisted.keys(), ...index.manualRenamed.keys(), ...index.manualDelisted.keys()]) {
    out[t] = getListingStatus(t, index);
  }
  return out;
}

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** 'YYYY-MM-DD' → "25 ส.ค. 2569" · รูปแบบผิด → '' */
export function thaiDateLabel(dateKey: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '');
  if (!m) return '';
  const month = Number(m[2]);
  if (month < 1 || month > 12) return '';
  return `${Number(m[3])} ${MONTHS_TH[month - 1]} ${Number(m[1]) + 543}`;
}

export interface TvBar {
  name?: string | null;
  /** เวลาแท่งล่าสุด (unix วินาที) — คอลัมน์ "time" ของ TradingView scanner */
  time?: number | null;
  volume?: number | null;
}

/**
 * หุ้นที่ยังมีการซื้อขายในวันทำการล่าสุด: วันที่ของแท่งล่าสุด (Asia/Bangkok) = วันที่ล่าสุดในชุด
 * (ชุดต้องมีหุ้นอ้างอิงที่ยังซื้อขายปกติ เช่น PTT เพื่อไม่ให้วันหยุดทำให้ผลเปลี่ยน) และ volume > 0
 */
export function tradingOnLatestSession(bars: TvBar[]): Set<string> {
  const dated = bars
    .filter(b => typeof b?.name === 'string' && typeof b.time === 'number' && b.time > 0)
    .map(b => ({ name: b.name!.toUpperCase(), date: BKK_DATE.format(new Date(b.time! * 1000)), volume: b.volume ?? 0 }));
  const latest = dated.reduce((m, b) => (b.date > m ? b.date : m), '');
  return new Set(dated.filter(b => b.date === latest && b.volume > 0).map(b => b.name));
}
