import type { NextRequest } from 'next/server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CAL_PAGE = 'https://www.settrade.com/th/equities/stock-calendar';
const CAL_API = (year: number, month: number) =>
  `https://www.settrade.com/api/set/stock-calendar/${year}/${month}/x-calendar?symbols=&caTypes=`;

// Settrade's stock-calendar API sits behind Incapsula bot-protection; a plain
// request gets a 403 challenge page. Visiting the HTML page first (like
// investor-type/route.ts does) picks up the session cookie that clears it.
async function getSessionCookie(): Promise<string> {
  try {
    const res = await fetch(CAL_PAGE, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

interface RawCA {
  symbol: string;
  name: string;
  caType: string;
  currency?: string;
  paymentDate?: string | null;
  dividendType?: string | null;
  tentativeDividend?: string | null;
  dividend?: number | null;
  dividendPayment?: string | null;
  ratio?: string | null;
  rightsFor?: string | null;
  price?: number | null;
  beginSubscription?: string | null;
  endSubscription?: string | null;
  meetingDate?: string | null;
  meetingType?: string | null;
  agenda?: string | null;
  venue?: string | null;
  returnAmount?: number | null;
  remark?: string | null;
  xdate: string;
}

interface CADayGroup { type: string; corporateActions: RawCA[] }
interface CADay { date: string; types: CADayGroup[] }

export interface CalendarRow {
  ticker: string;
  name: string;
  caType: string;   // raw SET code: XD/XR/XW/XM/XN/XB/XE/XI/XT
  bucket: 'XD' | 'XR' | 'XW' | 'XM' | 'XA'; // XA = everything outside the 4 main filter chips
  xDate: string;    // ISO date (yyyy-mm-dd)
  detail: string;
  payDate: string | null;
  // Structured fields for the unified /calendar view's richer badges (kept
  // alongside `detail` rather than replacing it, so existing consumers of
  // the plain-text `detail` string are unaffected). null when not
  // applicable to this row's caType or not present in the source data.
  dividendAmount: number | null;    // XD: baht/share
  ratio: string | null;             // XR/XW: e.g. "4:1"
  subscriptionPrice: number | null; // XR: baht/share
}

const KNOWN_BUCKETS = new Set(['XD', 'XR', 'XW', 'XM']);
function bucketOf(caType: string): CalendarRow['bucket'] {
  return KNOWN_BUCKETS.has(caType) ? (caType as CalendarRow['bucket']) : 'XA';
}

function toISODate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function parseNumeric(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatDetail(ca: RawCA): string {
  const currency = ca.currency ?? 'บาท';
  switch (ca.caType) {
    case 'XD': {
      const amount = ca.dividend ?? ca.tentativeDividend;
      if (ca.dividendPayment) return `${ca.dividendType ?? 'เงินปันผล'} ${ca.dividendPayment} ${currency}/หุ้น`;
      if (amount != null) return `${ca.dividendType ?? 'เงินปันผล'} ${amount} ${currency}/หุ้น`;
      return ca.dividendType ?? 'เงินปันผล';
    }
    case 'XR':
      return `สิทธิจองซื้อ${ca.rightsFor ? ` ${ca.rightsFor}` : ''}${ca.ratio ? ` อัตราส่วน ${ca.ratio}` : ''}${ca.price != null ? ` ราคา ${ca.price} ${currency}` : ''}`;
    case 'XW':
      return `${ca.rightsFor ?? 'ใบสำคัญแสดงสิทธิ'}${ca.ratio ? ` อัตราส่วน ${ca.ratio}` : ''}`;
    case 'XM':
      return `${ca.meetingType ?? 'ประชุมผู้ถือหุ้น'}${ca.agenda ? `: ${truncate(ca.agenda, 90)}` : ''}`;
    case 'XN':
      return `ลดทุน${ca.returnAmount != null ? ` คืนทุน ${ca.returnAmount} ${currency}/หุ้น` : ''}`;
    default:
      return ca.remark || ca.name || ca.caType;
  }
}

function payDateOf(ca: RawCA): string | null {
  if (ca.caType === 'XM') return toISODate(ca.meetingDate);
  if (ca.caType === 'XR' || ca.caType === 'XW') return toISODate(ca.endSubscription ?? ca.beginSubscription);
  return toISODate(ca.paymentDate);
}

function monthsInRange(from: string, to: string): { year: number; month: number }[] {
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const out: { year: number; month: number }[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMarker = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= endMarker) {
    out.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

async function fetchMonth(year: number, month: number, cookie: string): Promise<CADay[]> {
  try {
    const res = await fetch(CAL_API(year, month), {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: CAL_PAGE,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? (json as CADay[]) : [];
  } catch {
    return [];
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || todayISO();
  const toParam = req.nextUrl.searchParams.get('to');
  const to = toParam || (() => {
    const d = new Date(from + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const symbolFilter = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase();

  try {
    const cookie = await getSessionCookie();
    const months = monthsInRange(from, to);
    const monthResults = await Promise.all(months.map(m => fetchMonth(m.year, m.month, cookie)));

    const rows: CalendarRow[] = [];
    for (const days of monthResults) {
      for (const day of days) {
        for (const group of day.types) {
          for (const ca of group.corporateActions) {
            const xDate = toISODate(ca.xdate);
            if (!xDate || xDate < from || xDate > to) continue;
            if (symbolFilter && ca.symbol.toUpperCase() !== symbolFilter) continue;
            rows.push({
              ticker: ca.symbol,
              name: ca.name,
              caType: ca.caType,
              bucket: bucketOf(ca.caType),
              xDate,
              detail: formatDetail(ca),
              payDate: payDateOf(ca),
              dividendAmount: ca.caType === 'XD'
                ? (ca.dividend ?? parseNumeric(ca.dividendPayment) ?? parseNumeric(ca.tentativeDividend))
                : null,
              ratio: (ca.caType === 'XR' || ca.caType === 'XW') ? (ca.ratio ?? null) : null,
              subscriptionPrice: ca.caType === 'XR' ? (ca.price ?? null) : null,
            });
          }
        }
      }
    }

    rows.sort((a, b) => a.xDate.localeCompare(b.xDate) || a.ticker.localeCompare(b.ticker));

    return Response.json(
      { rows, from, to, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=300' } }
    );
  } catch {
    return Response.json({ rows: [], from, to, error: 'fetch_failed' }, { status: 500 });
  }
}
