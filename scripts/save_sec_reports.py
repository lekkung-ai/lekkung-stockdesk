"""
save_sec_reports.py  –  Snapshot SEC form 59-2 and 246 (filtered by the date
the SEC office received / disclosed the filing) and save as static JSON so the
dashboard can paint instantly, then refresh live in the browser.

Usage:
    python -X utf8 save_sec_reports.py

Output:
    stockdesk/public/data/sec/r59.json
    stockdesk/public/data/sec/r246.json

Mirrors the logic in app/api/sec/r59/route.ts and r246/route.ts:
  - r59  : POST rblDateType=2  ("วันที่ สนง.รับเอกสาร")
  - r246 : POST rblDateType=2  ("วันที่เผยแพร่")
Default window = today -> today (matches the pages' default date picker).
"""

import json
import os
import re
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

R59_URL = "https://market.sec.or.th/public/idisc/th/r59"
R246_URL = "https://market.sec.or.th/public/idisc/th/r246"


# ── HTML helpers (same approach as save_biglot.py / parseHtmlTable.ts) ─────────

def inner_content(tag: str, html: str) -> list[str]:
    open_re = re.compile(rf"<{tag}(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", re.IGNORECASE)
    close = f"</{tag}>"
    results = []
    for m in open_re.finditer(html):
        start = m.end()
        end = html.lower().find(close.lower(), start)
        if end == -1:
            continue
        results.append(html[start:end])
    return results


def strip_tags(html: str) -> str:
    html = re.sub(r"<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    html = html.replace("&lt;", "<").replace("&gt;", ">")
    html = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), html)
    return re.sub(r"\s+", " ", html).strip()


def extract_token(html: str, token_id: str) -> str:
    m = re.search(rf'id="{token_id}"[^>]+value="([^"]+)"', html)
    return m.group(1) if m else ""


def parse_html_table(html: str, table_index: int):
    """Return (raw_headers, rows) for the given table index. rows keyed by header."""
    tables = inner_content("table", html)
    if table_index >= len(tables):
        return [], []
    tbl = tables[table_index]
    headers = [strip_tags(h) for h in inner_content("th", tbl)]
    rows = []
    for row_html in inner_content("tr", tbl):
        cells = [strip_tags(c) for c in inner_content("td", row_html)]
        if not cells:
            continue
        row = {}
        for i, c in enumerate(cells):
            key = headers[i] if i < len(headers) else f"col{i}"
            row[key] = c
        rows.append(row)
    return headers, rows


def clean_header(h: str) -> str:
    """Strip garbled <sup>N</sup> artifacts left inside r246 <th> tags."""
    gt = h.rfind(">")
    if gt >= 0:
        h = h[gt + 1:]
    return re.sub(r"\s*\d+\s*$", "", h).strip()


def thai_date_sort_key(thai: str) -> str:
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", thai)
    if not m:
        return "0000-00-00"
    return f"{int(m.group(3)) - 543}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"


# ── Fetch helpers ──────────────────────────────────────────────────────────────

def _get(url: str):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "th-TH,th;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        cookie = resp.headers.get("Set-Cookie", "")
        session_cookie = cookie.split(";")[0] if cookie else ""
        return resp.read().decode("utf-8", errors="replace"), session_cookie


def _post(url: str, fields: dict, session_cookie: str) -> str:
    body = urllib.parse.urlencode(fields).encode("utf-8")
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "th-TH,th;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": url,
    }
    if session_cookie:
        headers["Cookie"] = session_cookie
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _pick_table(html: str, header_signature: list[str], header_cleaner=lambda h: h):
    """Pick the real results table by header signature, not row count - a
    genuine 1-2 row result (a quiet day) is not distinguishable from a
    layout/nav table by count alone. Mirrors selectResultTable in
    lib/secScrape.ts."""
    for i in range(6):
        raw_headers, rows = parse_html_table(html, i)
        if not raw_headers:
            continue
        headers = [header_cleaner(h) for h in raw_headers]
        if all(any(sig in h for h in headers) for sig in header_signature):
            return raw_headers, rows
    return [], []


# ── Report fetchers ────────────────────────────────────────────────────────────

def fetch_r59(date_from: str, date_to: str):
    html1, cookie = _get(R59_URL)
    fields = {
        "__VIEWSTATE": extract_token(html1, "__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": extract_token(html1, "__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION": extract_token(html1, "__EVENTVALIDATION"),
        "ctl00$CPH$ddlCompany": "",
        "ctl00$CPH$rblDateType": "2",  # วันที่ สนง.รับเอกสาร
        "ctl00$CPH$BSDateFrom": date_from,
        "ctl00$CPH$BSDateTo": date_to,
        "ctl00$CPH$btSearch": "Search",
    }
    html2 = _post(R59_URL, fields, cookie)
    headers, rows = _pick_table(html2, ["ชื่อบริษัท", "ชื่อผู้บริหาร", "วันที่ได้มา/จำหน่าย", "วิธีการได้มา/จำหน่าย"])
    date_col = next((h for h in headers if "วันที่" in h), None)
    if date_col:
        rows.sort(key=lambda r: thai_date_sort_key(r.get(date_col, "")), reverse=True)
    return headers, rows


def fetch_r246(date_from: str, date_to: str):
    html1, cookie = _get(R246_URL)
    fields = {
        "__VIEWSTATE": extract_token(html1, "__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": extract_token(html1, "__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION": extract_token(html1, "__EVENTVALIDATION"),
        "ctl00$CPH$BsCompany": "",
        "ctl00$CPH$BsCompany_t": "",
        "ctl00$CPH$BsCompany_v": "",
        "ctl00$CPH$txtSearchPerson": "",
        "ctl00$CPH$rblDateType": "2",  # วันที่เผยแพร่
        "ctl00$CPH$BSDateFrom": date_from,
        "ctl00$CPH$BSDateTo": date_to,
        "ctl00$CPH$btSearch": "Search",
    }
    html2 = _post(R246_URL, fields, cookie)
    raw_headers, rows = _pick_table(html2, ["หลักทรัพย์", "วิธีการ", "วันที่ได้มา/จำหน่าย", "หมายเลข"], clean_header)
    if not raw_headers:
        return [], []
    headers = [clean_header(h) for h in raw_headers]
    cleaned_rows = []
    for row in rows:
        cr = {}
        for idx, raw in enumerate(raw_headers):
            cr[headers[idx]] = row.get(raw, "")
        cleaned_rows.append(cr)
    date_col = next((h for h in headers if "วันที่" in h), None)
    if date_col:
        cleaned_rows.sort(key=lambda r: thai_date_sort_key(r.get(date_col, "")), reverse=True)
    return headers, cleaned_rows


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    # Use UTC so the "date" field matches the client's todayISO()
    # (new Date().toISOString()), keeping the JSON snapshot in sync with the
    # live API's default query even across the UTC/ICT midnight boundary.
    now_utc = datetime.now(timezone.utc)
    today_iso = now_utc.strftime("%Y-%m-%d")
    today_sec = now_utc.strftime("%d/%m/%Y")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    stockdesk_dir = os.path.dirname(script_dir)
    out_dir = os.path.join(stockdesk_dir, "public", "data", "sec")
    os.makedirs(out_dir, exist_ok=True)

    jobs = [
        ("r59", fetch_r59, "วันที่ สนง.รับเอกสาร"),
        ("r246", fetch_r246, "วันที่เผยแพร่"),
    ]

    for name, fetcher, basis in jobs:
        print(f"  Fetching {name} for {today_iso} ({today_sec})...")
        try:
            headers, rows = fetcher(today_sec, today_sec)
        except Exception as e:  # noqa: BLE001
            print(f"    Warning: {name} failed: {e}")
            continue

        out_file = os.path.join(out_dir, f"{name}.json")

        # Empty snapshot drop guard
        if len(rows) == 0 and os.path.exists(out_file):
            try:
                with open(out_file, "r", encoding="utf-8") as f:
                    prev = json.load(f)
                if len(prev.get("rows", [])) > 0 and prev.get("date") == today_iso:
                    print(f"    [SEC-GUARD] Fetch returned 0 rows for {name}, preserving previous {len(prev['rows'])} rows snapshot for {today_iso}")
                    continue
            except Exception:
                pass

        payload = {
            "generatedAt": now_utc.isoformat(timespec="seconds"),
            "date": today_iso,
            "from": today_iso,
            "to": today_iso,
            "dateBasis": basis,
            "fetchDate": today_iso,
            "headers": headers,
            "rows": rows,
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        print(f"    {name.upper()}: {len(rows)} rows -> {out_file}")


if __name__ == "__main__":
    main()
