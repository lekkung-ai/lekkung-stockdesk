"""
scan_setups.py  –  the ONE place that decides where a "ไม้" (setup) starts and ends.

Used by compute_scan_days.py (DAYS), compute_scan_history.py (setupStarts for
the chart markers) and calculate_report_card.py (setup rows). The web reads the
results from those files - it never re-derives setups itself.

Rule (applies to sepa / kell / breakout / lekkung / ppbp / oneil):
  * A setup starts on the first day the ticker is in the scan.
  * It ends once the ticker has been OUT of the scan for SETUP_GAP_DAYS (5)
    scan days in a row. Only scan days count (calendar = days the scan really
    produced a file, weekends/holidays/pipeline-missing days are not days).
  * Out 1-4 days -> the setup is still running ("pending", หลุดมา N วัน).
  * In the scan again after it ended -> a new setup (seq + 1).
  * Decided only from data up to `latest` - a closed setup never re-opens when
    later days arrive.
"""

import os
from datetime import datetime

from scan_calendar import valid_dates

SETUP_GAP_DAYS = 5

# Scans that use this rule (page/scan_days key -> history file name). The other
# scans (lekkung_daytrade, market-stage, stage-analysis) keep their old rules.
SETUP_RULE_SCANS = {"lekkung", "oneil", "sepa", "oliver_kell", "breakout", "ppbp"}


def _is_weekday(dstr: str) -> bool:
    try:
        return datetime.fromisoformat(dstr).weekday() < 5
    except ValueError:
        return False


def history_dates(hist_dir: str) -> list:
    """Weekday snapshot folders under data/history, ascending. Weekend folders can
    hold stale catch-up files and are never scan days."""
    return sorted(
        d for d in os.listdir(hist_dir)
        if os.path.isdir(os.path.join(hist_dir, d)) and d[:1].isdigit() and _is_weekday(d)
    )


def scan_calendar(hist_dir: str, fname: str, dates=None, exclude=()) -> list:
    """Scan days of one scan: weekday, the scan's file exists (even if []), not in `exclude`."""
    if dates is None:
        dates = history_dates(hist_dir)
    ex = set(exclude)
    return [d for d in valid_dates(hist_dir, fname, dates) if _is_weekday(d) and d not in ex]


def split_setups(hit_dates, calendar, latest=None, gap=SETUP_GAP_DAYS) -> list:
    """Split one ticker's scan hits into setups.

    hit_dates: ISO dates the ticker was in the scan (any order; dates not in
               `calendar` or after `latest` are ignored).
    calendar:  ISO scan days (ascending) - the only days that count.
    latest:    last day of data to use (default: calendar[-1]).

    Returns [{seq, start, last_hit, status, days_out, closed_on, n_hits, days}]
      status    "open"    in the scan on `latest`
                "pending" out 1..gap-1 days (setup not over yet)
                "closed"  out `gap` days in a row
      days_out  scan days after last_hit up to `latest` (for closed: = gap)
      closed_on the scan day the setup was confirmed over (the gap-th out day), else None
      days      scan days from start to latest (open/pending) or to last_hit (closed)
    """
    cal = sorted(set(calendar))
    if latest is not None:
        cal = [d for d in cal if d <= latest]
    if not cal:
        return []
    latest = cal[-1]
    pos = {d: i for i, d in enumerate(cal)}
    hits = sorted({d for d in hit_dates if d in pos})
    if not hits:
        return []

    groups = []
    cur = [hits[0]]
    for h in hits[1:]:
        out_between = pos[h] - pos[cur[-1]] - 1
        if out_between >= gap:
            groups.append(cur)
            cur = [h]
        else:
            cur.append(h)
    groups.append(cur)

    last_pos = pos[latest]
    out = []
    for seq, g in enumerate(groups, start=1):
        start, last_hit = g[0], g[-1]
        days_out = last_pos - pos[last_hit]
        if days_out >= gap:
            status = "closed"
            closed_on = cal[pos[last_hit] + gap]
            days_out = gap
            days = pos[last_hit] - pos[start] + 1
        else:
            status = "open" if days_out == 0 else "pending"
            closed_on = None
            days = last_pos - pos[start] + 1
        out.append({
            "seq": seq,
            "start": start,
            "last_hit": last_hit,
            "status": status,
            "days_out": days_out,
            "closed_on": closed_on,
            "n_hits": len(g),
            "days": days,
        })
    return out


def current_setup(hit_dates, calendar, latest=None, gap=SETUP_GAP_DAYS):
    """The setup still running on `latest` (open or pending), or None."""
    s = split_setups(hit_dates, calendar, latest, gap)
    if s and s[-1]["status"] != "closed":
        return s[-1]
    return None
