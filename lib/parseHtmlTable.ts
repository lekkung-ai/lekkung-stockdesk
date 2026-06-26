function stripTags(html: string): string {
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

// Matches an opening HTML tag, handling attribute values that may contain `>`
// Handles: <tag>, <tag attr="val>ue">, <tag attr='val>ue'>
const OPEN_TAG = String.raw`<([a-zA-Z][a-zA-Z0-9]*)(?:[^>"']|"[^"]*"|'[^']*')*>`;
const openTagRe = new RegExp(OPEN_TAG, 'i');

function matchTag(tagName: string, html: string, offset: number): { start: number; end: number } | null {
  const re = new RegExp(`<${tagName}(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  re.lastIndex = offset;
  const m = re.exec(html);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

// Extract inner content between opening and closing tags, robust to attr values with `>`
function extractTagContents(tagName: string, html: string): string[] {
  const closeTag = `</${tagName}>`;
  const openRe = new RegExp(`<${tagName}(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html)) !== null) {
    const contentStart = m.index + m[0].length;
    const closeIdx = html.indexOf(closeTag, contentStart);
    if (closeIdx === -1) continue;
    results.push(html.slice(contentStart, closeIdx));
    // advance past the close tag
    openRe.lastIndex = closeIdx + closeTag.length;
  }
  return results;
}

export interface TableData {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseHtmlTable(html: string, tableIndex: number): TableData {
  // Extract tables using robust method
  const tableContents = extractTagContents('table', html);
  if (tableIndex >= tableContents.length) return { headers: [], rows: [] };
  const tbl = tableContents[tableIndex];

  // Extract headers
  const headers = extractTagContents('th', tbl).map(stripTags);

  // Extract rows
  const rows: Record<string, string>[] = [];
  const rowContents = extractTagContents('tr', tbl);
  for (const rowHtml of rowContents) {
    const cells = extractTagContents('td', rowHtml).map(stripTags);
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    cells.forEach((c, i) => { row[headers[i] ?? `col${i}`] = c; });
    rows.push(row);
  }
  return { headers, rows };
}

// suppress unused import warning
void openTagRe;
