import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  enumerateDaysISO,
  getCachedSecDay,
  isoToBELabel,
  sleep,
  thaiDateToISO,
  businessDaysBetween,
  todayISOBangkok,
} from '@/lib/secScrape';

const BASE = 'https://market.sec.or.th/public/idisc/th/r59';
const ROUTE_KEY = 'r59';
const TX_COL = 'วันที่ได้มา/จำหน่าย'; // transaction date - the only date column SEC's own table exposes
// Form 59 has no "วันที่เผยแพร่" radio option like r246 - its closest analog is
// "วันที่ สนง.รับเอกสาร" (date the SEC office received the document), which is
// what rblDateType=2 actually means here (confirmed live against the form's
// own radio labels 2026-07-14).
const PUBLISH_COL = 'วันที่ สนง.รับเอกสาร';
const HEADER_SIGNATURE = ['ชื่อบริษัท', 'ชื่อผู้บริหาร', TX_COL, 'วิธีการได้มา/จำหน่าย'];
const LIVE_FETCH_DELAY_MS = 350;

interface StaticDayPayload {
  headers?: string[];
  rows?: Record<string, string>[];
  date?: string;
  dateBasis?: string;
}

function readStaticDay(date: string, fname: string): StaticDayPayload | null {
  try {
    const p = path.join(process.cwd(), 'data', 'history', date, fname);
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(d?.rows)) return d;
    }
  } catch {}
  return null;
}

function buildFields(secDateStr: string) {
  return {
    'ctl00$CPH$ddlCompany': '',
    'ctl00$CPH$rblDateType': '2',
    'ctl00$CPH$BSDateFrom': secDateStr,
    'ctl00$CPH$BSDateTo': secDateStr,
    'ctl00$CPH$btSearch': 'Search',
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// r59's table has no explicit report-number column (unlike r246's "หมายเลข")
// - the closest thing to a stable per-filing id is the batchNo+transId pair
// embedded in the row's "Link" href (e.g.
// .../report?batchNo=592002292607&transId=163740_2_1&...).
function reportKeyFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const batch = href.match(/batchNo=([^&]+)/)?.[1];
  const trans = href.match(/transId=([^&]+)/)?.[1];
  return batch && trans ? `${batch}_${trans}` : null;
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const dateParam = req.nextUrl.searchParams.get('date');
  const toISO = dateParam || toParam || todayISOBangkok();
  const fromISO = dateParam || fromParam || daysAgoISO(6); // default: last 7 days (inclusive) by receive date

  try {
    const { days, truncated } = enumerateDaysISO(fromISO, toISO);
    const todayISOStr = todayISOBangkok();
    const allRows: Record<string, string>[] = [];
    let anyParseFailure = false;

    for (const dayISO of days) {
      const staticDay = readStaticDay(dayISO, 'r59.json');
      let dayRows: Record<string, string>[] = [];

      if (staticDay) {
        dayRows = staticDay.rows ?? [];
      } else {
        const isToday = dayISO === todayISOStr;
        const result = await getCachedSecDay(ROUTE_KEY, BASE, buildFields, HEADER_SIGNATURE, h => h, dayISO, isToday);
        if (!result.found) { anyParseFailure = true; continue; }
        dayRows = result.rows;
        if (result.live) await sleep(LIVE_FETCH_DELAY_MS);
      }

      const beLabel = isoToBELabel(dayISO);
      for (const rawRow of dayRows) {
        if (rawRow['ชื่อบริษัท'] === 'ไม่พบข้อมูล') continue;
        const row = { ...rawRow };
        const txISO = thaiDateToISO(row[TX_COL]);
        row[PUBLISH_COL] = beLabel;
        row['__publishISO'] = dayISO;
        row['__txISO'] = txISO ?? '';
        row['__retroactive'] = txISO && businessDaysBetween(txISO, dayISO) > 2 ? '1' : '';
        allRows.push(row);
      }
    }

    // Dedupe by batchNo+transId (from the row's link) - falls back to a
    // composite key if a row somehow has no link. Keep the most recently
    // received version on conflict.
    const byKey = new Map<string, Record<string, string>>();
    for (const row of allRows) {
      const key = reportKeyFromHref(row['__href'])
        || `${row['ชื่อบริษัท']}|${row['ชื่อผู้บริหาร']}|${row[TX_COL]}|${row['จำนวน']}|${row['วิธีการได้มา/จำหน่าย']}`;
      const existing = byKey.get(key);
      if (!existing || row['__publishISO'] > existing['__publishISO']) byKey.set(key, row);
    }
    const rows = [...byKey.values()].sort((a, b) => b['__publishISO'].localeCompare(a['__publishISO']));
    // __href was only needed for dedupe keying - strip it before returning.
    rows.forEach(r => { delete r['__href']; });

    const headers = rows.length > 0
      ? Object.keys(rows[0]).filter(h => !h.startsWith('__'))
      : ['ชื่อบริษัท', 'ชื่อผู้บริหาร', 'วิธีการได้มา/จำหน่าย', PUBLISH_COL, TX_COL];

    const fetchDate = new Date().toISOString().slice(0, 10);
    return Response.json(
      {
        headers,
        rows,
        fetchDate,
        dateBasis: PUBLISH_COL,
        from: fromISO,
        to: toISO,
        truncated,
        ...(anyParseFailure ? { partial: true } : {}),
      },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch {
    return Response.json({ headers: [], rows: [], error: 'fetch_failed' });
  }
}
