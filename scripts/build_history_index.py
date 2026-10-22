"""
build_history_index.py  –  Rebuild public/data/history/index.json from the folders on disk.

    public/data/history/index.json = every YYYY-MM-DD folder that holds a usable biglot.json,
    sorted ascending. The only reader is the Big Lot page (/data/history/index.json), which
    picks its "15 days" chart dates from it - so the index lists Big Lot days only, not every
    folder: news.json is saved on weekends / holidays too (by design) and those folders have
    no biglot.json. (data/history/index.json - the scan snapshots - is a different file,
    written by daily-scan.yml / update_stockdesk.bat.)

The index is derived data: it is always recomputed from the folders, never appended to, so it
can't drift. Called at the end of save_biglot.py (both pipeline writers run that script) -
nothing hand-edits it any more. It used to be written once by hand on 2026-07-02 and then
went stale (last entry 2026-07-01) while the folders kept growing.

Usage:
    python build_history_index.py              # rebuild the real index
    python build_history_index.py --dry-run    # print what would change, write nothing
    python build_history_index.py --out <dir>  # use <dir> as the history root (testing)
"""

import argparse
import json
import os
import re
import sys

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def default_history_root() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data", "history")


def has_biglot(day_dir: str) -> bool:
    """A readable biglot.json with rows (current format) or set/mai tables (legacy archive)."""
    try:
        with open(os.path.join(day_dir, "biglot.json"), "r", encoding="utf-8") as f:
            j = json.load(f)
    except (OSError, ValueError):
        return False
    if not isinstance(j, dict):
        return False
    return bool(j.get("rows")) or bool(j.get("set")) or bool(j.get("mai"))


def biglot_dates(history_root: str) -> list[str]:
    return sorted(
        d for d in os.listdir(history_root)
        if DATE_RE.match(d) and os.path.isdir(os.path.join(history_root, d)) and has_biglot(os.path.join(history_root, d))
    )


def rebuild(history_root: str, dry_run: bool = False) -> bool:
    """Write history_root/index.json if it differs. True if it changed."""
    dates = biglot_dates(history_root)
    text = json.dumps(dates, allow_nan=False)  # same one-line format the file always had
    idx_file = os.path.join(history_root, "index.json")
    try:
        with open(idx_file, "r", encoding="utf-8") as f:
            current = f.read()
    except OSError:
        current = None
    span = f"{dates[0]} .. {dates[-1]}" if dates else "empty"
    if current == text:
        print(f"  index.json up to date ({len(dates)} Big Lot days, {span})")
        return False
    if dry_run:
        print(f"  (dry-run) index.json would change -> {len(dates)} Big Lot days, {span}")
        return True
    with open(idx_file, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  index.json rebuilt: {len(dates)} Big Lot days, {span}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print what would change, write nothing")
    parser.add_argument("--out", default=None, help="history root to use instead of public/data/history (testing)")
    args = parser.parse_args()
    rebuild(args.out or default_history_root(), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
