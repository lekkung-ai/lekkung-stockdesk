import { unstable_cache } from 'next/cache';
import { parseHtmlTable } from '@/lib/parseHtmlTable';

// Shared scraping/caching helpers for the two SEC ASP.NET WebForms reports
// (r246 "acquisition/disposal of substantial shareholding" and r59 "insider
// trading disclosure"). Both forms use the same __VIEWSTATE postback pattern
// and the same "search by disclosure date, but the results table only ever
// carries a transaction-date column" quirk - see the 2026-07-14 investigation
// that root-caused the /r246 /r59 date-filter bug for the full writeup.

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function todayISOBangkok(): string {
  const now = new Date(Date.now() + BANGKOK_OFFSET_MS);
  return now.toISOString().slice(0, 10);
}

function extractToken(html: string, id: string): string {
  const m = html.match(new RegExp(`id="${id}"[^>]+value="([^"]+)"`));
  return m?.[1] ?? '';
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" (Gregorian - the form field accepts this as-is)
export function isoToSecDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" in Buddhist Era, for display next to the
// site's own BE-formatted transaction-date column.
export function isoToBELabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

// SEC's own "DD/MM/YYYY" (BE) date string -> "YYYY-MM-DD" (Gregorian ISO),
// for sorting/business-day math.
export function thaiDateToISO(thai: string): string | null {
  const m = thai.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const year = parseInt(m[3], 10) - 543;
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Business days strictly between two ISO dates (exclusive of `fromISO`,
// inclusive of `toISO`), counting Mon-Fri only. Deliberately does not
// exclude SET holidays - a same-week holiday would overcount by at most a
// day or two, an acceptable approximation for a "was this disclosed late"
// heuristic badge (not a legal/compliance calculation).
export function businessDaysBetween(fromISO: string, toISO: string): number {
  let d = new Date(fromISO + 'T00:00:00Z');
  const end = new Date(toISO + 'T00:00:00Z');
  let count = 0;
  while (d < end) {
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

const MAX_DAYS = 45;

// Enumerate ISO dates from fromISO to toISO inclusive, oldest first. Clamps
// to MAX_DAYS (keeping the most recent days) so a wide custom range picked
// via the date inputs can't fan out into an unbounded number of sequential
// requests against SEC.
export function enumerateDaysISO(fromISO: string, toISO: string): { days: string[]; truncated: boolean } {
  const start = new Date(fromISO + 'T00:00:00Z');
  const end = new Date(toISO + 'T00:00:00Z');
  const all: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    all.push(d.toISOString().slice(0, 10));
  }
  if (all.length <= MAX_DAYS) return { days: all, truncated: false };
  return { days: all.slice(all.length - MAX_DAYS), truncated: true };
}

// Fix garbled headers caused by <sup>N</sup> markers inside <th> opening tags
// (only observed on r246's form).
export function cleanSupHeader(h: string): string {
  const gtIdx = h.lastIndexOf('>');
  if (gtIdx >= 0) h = h.slice(gtIdx + 1);
  return h.replace(/\s*\d+\s*$/, '').trim();
}

export interface SecTableResult {
  found: boolean; // true = a table matching the expected header signature was located (rows may legitimately be empty for a quiet day)
  headers: string[];
  rows: Record<string, string>[];
}

// Pick the real results table out of the several <table> elements ASP.NET
// renders (layout/nav tables included) by matching against a small set of
// header names we know must all be present - NOT by row count. The old
// `rows.length > 2` heuristic silently discarded genuine 1-2 row result sets
// (the actual bug being fixed here); row count says nothing about whether a
// table is the right one.
export function selectResultTable(
  html: string,
  expectedHeaderSignature: string[],
  headerCleaner: (h: string) => string = h => h
): SecTableResult {
  for (let i = 0; i < 8; i++) {
    const { headers: rawHeaders, rows: rawRows } = parseHtmlTable(html, i);
    if (rawHeaders.length === 0) continue;
    const headers = rawHeaders.map(headerCleaner);
    const isMatch = expectedHeaderSignature.every(sig => headers.some(h => h.includes(sig)));
    if (!isMatch) continue;

    // Re-key rows with cleaned headers, capture the row's first <a href> (if
    // any) as __href for callers that need a stable per-item id, and drop
    // ASP.NET's "ไม่พบข้อมูล" (no data) placeholder row - it parses as a
    // single populated cell in an otherwise multi-column table, which is
    // structurally distinct from a genuine data row.
    const rowsHtml = extractRowsHtml(html, i);
    const rows: Record<string, string>[] = [];
    rawRows.forEach((row, idx) => {
      const values = rawHeaders.map(h => row[h] ?? '');
      if (values.filter(v => v.trim()).length <= 1 && values.some(v => v.includes('ไม่พบข้อมูล'))) return;
      const cleaned: Record<string, string> = {};
      rawHeaders.forEach((raw, colIdx) => { cleaned[headers[colIdx]] = row[raw] ?? ''; });
      const href = rowsHtml[idx]?.match(/<a[^>]+href="([^"]+)"/i)?.[1];
      if (href) cleaned['__href'] = href;
      rows.push(cleaned);
    });

    return { found: true, headers, rows };
  }
  return { found: false, headers: [], rows: [] };
}

// Re-extract raw <tr> HTML (with tags intact) for the same table index, so
// selectResultTable can pull hrefs out of the last column after parseHtmlTable
// has already stripped them from its own (text-only) row output.
function extractRowsHtml(html: string, tableIndex: number): string[] {
  const tableRe = /<table(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRe) ?? [];
  const tbl = tables[tableIndex];
  if (!tbl) return [];
  const rowRe = /<tr(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/tr>/gi;
  const allRows = tbl.match(rowRe) ?? [];
  // parseHtmlTable already skips header/empty rows (no <td>); mirror that here.
  return allRows.filter(r => /<td/i.test(r));
}

export interface FormFields {
  [key: string]: string;
}

// GET (acquire ASP.NET postback tokens + session) then POST (submit search)
// for a single day. Kept as a plain fetch pair rather than something
// `fetch()`'s own Data Cache could dedupe on, since both requests hit the
// same URL with only the POST body differing per day - Next's fetch cache
// keys on URL, not body, so day-level caching is handled one level up via
// unstable_cache instead (see getCachedSecDay).
export async function fetchSecDayHtml(basePath: string, extraFields: FormFields): Promise<string | null> {
  try {
    const page1 = await fetch(basePath, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'th-TH,th;q=0.9' },
      cache: 'no-store',
    });
    if (!page1.ok) return null;
    const html1 = await page1.text();
    const sessionCookie = (page1.headers.get('set-cookie') ?? '').split(';')[0];

    const body = new URLSearchParams({
      '__VIEWSTATE': extractToken(html1, '__VIEWSTATE'),
      '__VIEWSTATEGENERATOR': extractToken(html1, '__VIEWSTATEGENERATOR'),
      '__EVENTVALIDATION': extractToken(html1, '__EVENTVALIDATION'),
      ...extraFields,
    });

    const page2 = await fetch(basePath, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'th-TH,th;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: basePath,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: body.toString(),
      cache: 'no-store',
    });
    if (!page2.ok) return null;
    return await page2.text();
  } catch {
    return null;
  }
}

const PAST_DAY_REVALIDATE_SEC = 24 * 60 * 60; // a past day's disclosures never change - cache long
const TODAY_REVALIDATE_SEC = 300; // today can still get new filings intraday

// Cache one day's parsed result, keyed explicitly by (routeKey, dateISO) via
// unstable_cache's argument-based cache key - this sidesteps the same-URL
// different-body ambiguity a raw fetch() cache would have across days.
export async function getCachedSecDay(
  routeKey: string,
  basePath: string,
  buildFields: (secDateStr: string) => FormFields,
  expectedHeaderSignature: string[],
  headerCleaner: (h: string) => string,
  dateISO: string,
  isToday: boolean
): Promise<SecTableResult & { live: boolean }> {
  let live = false;
  const run = unstable_cache(
    async (): Promise<SecTableResult> => {
      live = true;
      const secDateStr = isoToSecDate(dateISO);
      const html = await fetchSecDayHtml(basePath, buildFields(secDateStr));
      if (!html) {
        console.log(`[sec:${routeKey}] FETCH_FAIL day=${dateISO}`);
        return { found: false, headers: [], rows: [] };
      }
      const table = selectResultTable(html, expectedHeaderSignature, headerCleaner);
      if (!table.found) {
        console.log(`[sec:${routeKey}] TABLE_NOT_FOUND day=${dateISO} (parse failure, not "no data")`);
      } else {
        console.log(`[sec:${routeKey}] OK day=${dateISO} rows=${table.rows.length}`);
      }
      return table;
    },
    ['sec-day', routeKey, dateISO],
    { revalidate: isToday ? TODAY_REVALIDATE_SEC : PAST_DAY_REVALIDATE_SEC }
  );
  const result = await run();
  return { ...result, live };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
