import type { NextRequest } from 'next/server';

const MARKET_URLS: Record<string, string> = {
  set: 'https://www.settrade.com/th/equities/market-data/biglot',
  mai: 'https://www.settrade.com/th/mai/market-data/biglot',
};

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

function innerContent(tag: string, html: string): string[] {
  const re = new RegExp(`<${tag}(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  const close = `</${tag}>`;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const start = m.index + m[0].length;
    const end = html.toLowerCase().indexOf(close.toLowerCase(), start);
    if (end === -1) continue;
    out.push(html.slice(start, end));
    re.lastIndex = end + close.length;
  }
  return out;
}

function parseSettradeBiglot(html: string): { headers: string[]; rows: Record<string, string>[] } {
  const tables = innerContent('table', html);

  for (const tbl of tables) {
    // Extract headers ONLY from <thead> to avoid duplicate <th> from nested content
    const theadArr = innerContent('thead', tbl);
    if (!theadArr.length) continue;

    const rawHeaders = innerContent('th', theadArr[0]).map(h =>
      strip(h).replace(/\s*\(Click to sort[^)]*\)/gi, '').trim()
    );

    // Deduplicate headers: keep first occurrence, rename subsequent ones
    const seen: Record<string, number> = {};
    const headers = rawHeaders
      .filter(h => h.length > 0)
      .map(h => {
        if (seen[h] === undefined) { seen[h] = 0; return h; }
        seen[h]++;
        return `${h}_${seen[h]}`;
      });

    if (headers.length === 0) continue;

    // Extract rows from <tbody>
    const tbodyArr = innerContent('tbody', tbl);
    const bodyHtml = tbodyArr.join('');
    const rowHtmls = innerContent('tr', bodyHtml);

    const rows: Record<string, string>[] = [];
    for (const rowHtml of rowHtmls) {
      const cells = innerContent('td', rowHtml).map(strip);
      if (cells.length === 0 || cells.every(c => !c)) continue;
      const row: Record<string, string> = {};
      cells.forEach((c, i) => { if (headers[i]) row[headers[i]] = c; });
      rows.push(row);
    }

    if (rows.length > 2) {
      return { headers, rows };
    }
  }

  return { headers: [], rows: [] };
}

export async function GET(req: NextRequest) {
  const market = (req.nextUrl.searchParams.get('market') ?? 'set').toLowerCase();
  const url = MARKET_URLS[market] ?? MARKET_URLS.set;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://www.settrade.com',
      },
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ headers: [], rows: [] });
    const html = await res.text();
    const { headers, rows } = parseSettradeBiglot(html);
    console.log(`[biglot] market=${market} status=${res.status} headers=${headers.length} rows=${rows.length}`);
    return Response.json(
      { headers, rows },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json({ headers: [], rows: [] });
  }
}
