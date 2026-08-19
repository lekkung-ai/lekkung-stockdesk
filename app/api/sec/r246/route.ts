import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  cleanSupHeader,
  enumerateDaysISO,
  getCachedSecDay,
  isoToBELabel,
  sleep,
  thaiDateToISO,
  businessDaysBetween,
  todayISOBangkok,
} from '@/lib/secScrape';

export const maxDuration = 60;

const BASE = 'https://market.sec.or.th/public/idisc/th/r246';
const ROUTE_KEY = 'r246';
const TX_COL = 'วันที่ได้มา/จำหน่าย'; // transaction date - the only date column SEC's own table exposes
const PUBLISH_COL = 'วันที่เผยแพร่'; // disclosure date - the field we actually filter by (rblDateType=2), reconstructed per-day since SEC never returns it as a column
const REPORT_NO_COL = 'หมายเลข';
const HEADER_SIGNATURE = ['หลักทรัพย์', 'วิธีการ', TX_COL, REPORT_NO_COL];
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
    'ctl00$CPH$BsCompany': '',
    'ctl00$CPH$BsCompany_t': '',
    'ctl00$CPH$BsCompany_v': '',
    'ctl00$CPH$txtSearchPerson': '',
    // rblDateType 2 = "วันที่เผยแพร่" (disclosure/publish date)
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

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const dateParam = req.nextUrl.searchParams.get('date');
  const toISO = dateParam || toParam || todayISOBangkok();
  const fromISO = dateParam || fromParam || daysAgoISO(6); // default: last 7 days (inclusive) by publish date

  try {
    const { days, truncated } = enumerateDaysISO(fromISO, toISO);
    const todayISOStr = todayISOBangkok();
    const allRows: Record<string, string>[] = [];
    let anyParseFailure = false;

    for (const dayISO of days) {
      const staticDay = readStaticDay(dayISO, 'r246.json');
      let dayRows: Record<string, string>[] = [];

      if (staticDay) {
        dayRows = staticDay.rows ?? [];
      } else {
        const isToday = dayISO === todayISOStr;
        const result = await getCachedSecDay(ROUTE_KEY, BASE, buildFields, HEADER_SIGNATURE, cleanSupHeader, dayISO, isToday);
        if (!result.found) { anyParseFailure = true; continue; }
        dayRows = result.rows;
        if (result.live) await sleep(LIVE_FETCH_DELAY_MS);
      }

      const beLabel = isoToBELabel(dayISO);
      for (const rawRow of dayRows) {
        if (rawRow['หลักทรัพย์'] === 'ไม่พบข้อมูล') continue;
        const row = { ...rawRow };
        const txISO = thaiDateToISO(row[TX_COL]);
        row[PUBLISH_COL] = beLabel;
        row['__publishISO'] = dayISO;
        row['__txISO'] = txISO ?? '';
        row['__retroactive'] = txISO && businessDaysBetween(txISO, dayISO) > 2 ? '1' : '';
        allRows.push(row);
      }
    }

    // Dedupe by report number - a filing can be resubmitted/corrected and
    // reappear under a later disclosure date; keep the most recently
    // published version.
    const byKey = new Map<string, Record<string, string>>();
    for (const row of allRows) {
      const key = row[REPORT_NO_COL] || `${row['หลักทรัพย์']}|${row['ชื่อผู้ได้มา/จำหน่าย']}|${row[TX_COL]}`;
      const existing = byKey.get(key);
      if (!existing || row['__publishISO'] > existing['__publishISO']) byKey.set(key, row);
    }
    const rows = [...byKey.values()].sort((a, b) => b['__publishISO'].localeCompare(a['__publishISO']));

    const headers = rows.length > 0
      ? Object.keys(rows[0]).filter(h => !h.startsWith('__'))
      : ['หลักทรัพย์', 'ชื่อผู้ได้มา/จำหน่าย', 'วิธีการ', PUBLISH_COL, TX_COL];

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
