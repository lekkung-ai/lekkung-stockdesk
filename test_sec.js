const stripTags = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
function extractTagContents(tagName, html) {
  const closeTag = '</' + tagName + '>';
  const openRe = new RegExp('<' + tagName + '(?:[^>"\']|"[^"]*"|\'[^\']*\')*>', 'gi');
  const results = [];
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const contentStart = m.index + m[0].length;
    const closeIdx = html.indexOf(closeTag, contentStart);
    if (closeIdx === -1) continue;
    results.push(html.slice(contentStart, closeIdx));
    openRe.lastIndex = closeIdx + closeTag.length;
  }
  return results;
}
async function check() {
  const r59 = await fetch('https://market.sec.or.th/public/idisc/th/r59', { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r=>r.text());
  const tbls59 = extractTagContents('table', r59);
  for(let tbl of tbls59) {
    const ths = extractTagContents('th', tbl).map(stripTags);
    if(ths.length > 2) console.log('R59:', ths);
  }
  const r246 = await fetch('https://market.sec.or.th/public/idisc/th/r246', { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r=>r.text());
  const tbls246 = extractTagContents('table', r246);
  for(let tbl of tbls246) {
    const ths = extractTagContents('th', tbl).map(stripTags);
    if(ths.length > 2) console.log('R246:', ths);
  }
}
check();
