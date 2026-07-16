"""
safe_push.py - Shared, conflict-resilient git add+commit+push, used by every
writer of this repo (update_stockdesk.bat, daily-scan.yml,
iaa-research-morning.yml, news-fetch.yml) instead of each hand-rolling its
own `git add -A && git commit && git pull --rebase && git push`.

Why this exists: multiple independent processes write into this repo close
together in time (this machine's local Task Scheduler job, and up to three
separate GitHub Actions workflows). They most often collide on
public/data/history/<date>/news.json, since several of them touch that file
via save_news.py. A plain `git pull --rebase` conflict there used to require
a human to resolve it (see the 2026-07-13/07-14 incidents) - while every
writer was down waiting, no scan data reached production either, since a
repo stuck mid-rebase rejects the next push too.

Resolution strategy on a rebase conflict:
    - If EVERY conflicted file is a public/data/history/*/news.json (or
      data/history/*/news.json), auto-resolve each one by union-merging both
      sides with save_news.merge_news_items() - the same dedupe-by-link
      logic that already makes two independent fetches converge to the same
      superset at the application level. Stage the merged file and continue
      the rebase.
    - If ANY other file is conflicted, abort the rebase immediately and fail
      loudly - this script does not attempt to resolve unknown conflict
      shapes, since a wrong auto-resolution silently corrupting data is far
      worse than a failed push a human can look at.

On a rejected push (someone else pushed in the meantime), retries the whole
fetch/rebase/push cycle up to --max-retries times before giving up.

Usage as a CLI (what the .bat and workflows call):
    python safe_push.py --repo <dir> --message "<msg>" --add <path> [<path> ...]
    python safe_push.py --repo <dir> --message "<msg>" --add-all

Usage as a library:
    from safe_push import safe_push
    ok = safe_push(repo_dir, message, add_paths=['public/data/history'])
    ok = safe_push(repo_dir, message, add_all=True)

Exit code 0 = pushed (or nothing to push). Exit code 1 = failed - check
stderr for which file/step, never leaves the repo mid-rebase (aborts on any
unresolvable conflict before returning).
"""

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
NEWS_JSON_PATTERN = re.compile(r'(^|/)((public/)?data/history/\d{4}-\d{2}-\d{2}/news\.json)$')
MAX_RETRIES_DEFAULT = 3


def _run(args, cwd, check=True):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, args, result.stdout, result.stderr)
    return result


def _git(repo_dir, *args, check=True):
    return _run(['git', *args], cwd=repo_dir, check=check)


def abort_stuck_rebase_if_any(repo_dir):
    """Call before starting any new work in this repo. If a previous run
    left the repo mid-rebase (crashed, was killed, hit an unresolvable
    conflict some other way), abort it and start clean rather than letting
    every subsequent run in this repo fail forever on a stale conflict."""
    git_dir = Path(repo_dir) / '.git'
    if not (git_dir / 'rebase-merge').exists() and not (git_dir / 'rebase-apply').exists():
        return False
    print('=' * 70)
    print(f'WARNING: {repo_dir} was left mid-rebase from a previous run - aborting it now.')
    print('=' * 70)
    _git(repo_dir, 'rebase', '--abort', check=False)
    return True


def _merge_news_conflict(repo_dir, relpath):
    sys.path.insert(0, str(SCRIPT_DIR))
    from save_news import merge_news_items  # import, never copy - see save_news.py

    import json

    def read_stage(stage):
        result = _run(['git', 'show', f':{stage}:{relpath}'], cwd=repo_dir, check=False)
        if result.returncode != 0 or not result.stdout.strip():
            return []
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return []

    ours = read_stage(2)
    theirs = read_stage(3)
    merged, added = merge_news_items(ours, theirs)

    abs_path = Path(repo_dir) / relpath
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    with open(abs_path, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    _git(repo_dir, 'add', relpath)
    print(f'  Auto-resolved {relpath}: merged {len(ours)} + {len(theirs)} -> {len(merged)} items ({added} new from theirs)')


def _resolve_rebase_conflicts(repo_dir):
    """Returns True if all conflicts were auto-resolved and the rebase was
    continued; False if an unresolvable conflict was found (rebase aborted,
    caller should treat this as a hard failure)."""
    status = _git(repo_dir, 'status', '--porcelain', check=False)
    conflicted = [line[3:] for line in status.stdout.splitlines() if line[:2] in ('UU', 'AA', 'DU', 'UD')]

    if not conflicted:
        return True  # nothing conflicted - shouldn't normally be called in this case

    unresolvable = [f for f in conflicted if not NEWS_JSON_PATTERN.search(f)]
    if unresolvable:
        print('=' * 70, file=sys.stderr)
        print('ERROR: rebase conflict on file(s) this script does not know how to auto-resolve:', file=sys.stderr)
        for f in unresolvable:
            print(f'  - {f}', file=sys.stderr)
        print('Aborting rebase - resolve manually.', file=sys.stderr)
        print('=' * 70, file=sys.stderr)
        _git(repo_dir, 'rebase', '--abort', check=False)
        return False

    for f in conflicted:
        _merge_news_conflict(repo_dir, f)

    continue_result = _git(repo_dir, 'rebase', '--continue', check=False)
    if continue_result.returncode != 0:
        # Rebase --continue can itself hit a further conflict on a later
        # commit in the same rebase - recurse to handle it, bounded by the
        # outer retry loop's own iteration limit so this can't spin forever.
        status2 = _git(repo_dir, 'status', '--porcelain', check=False)
        still_conflicted = any(line[:2] in ('UU', 'AA', 'DU', 'UD') for line in status2.stdout.splitlines())
        if still_conflicted:
            return _resolve_rebase_conflicts(repo_dir)
        print('ERROR: rebase --continue failed with no conflict markers left - unexpected state.', file=sys.stderr)
        print(continue_result.stdout, continue_result.stderr, file=sys.stderr)
        _git(repo_dir, 'rebase', '--abort', check=False)
        return False

    return True


def safe_push(repo_dir, message, add_paths=None, add_all=False, max_retries=MAX_RETRIES_DEFAULT):
    repo_dir = str(repo_dir)
    abort_stuck_rebase_if_any(repo_dir)

    if add_all:
        _git(repo_dir, 'add', '-A')
    else:
        for p in (add_paths or []):
            _git(repo_dir, 'add', p)

    diff = _git(repo_dir, 'diff', '--cached', '--quiet', check=False)
    has_staged_changes = diff.returncode != 0
    if has_staged_changes:
        _git(repo_dir, 'commit', '-m', message)
    else:
        # Nothing newly staged - but a previous run may have committed and
        # then failed before pushing (crash, killed process). Check for
        # local commits already ahead of upstream before giving up, so
        # those don't get silently stranded forever.
        ahead = _git(repo_dir, 'rev-list', '--count', '@{u}..HEAD', check=False)
        if ahead.returncode != 0 or ahead.stdout.strip() in ('', '0'):
            print('Nothing staged and no local commits ahead of upstream - nothing to push.')
            return True
        print(f'Nothing newly staged, but {ahead.stdout.strip()} local commit(s) ahead of upstream - pushing those.')

    for attempt in range(1, max_retries + 1):
        _git(repo_dir, 'fetch', 'origin', check=False)
        rebase = _git(repo_dir, 'rebase', 'origin/HEAD', check=False)

        if rebase.returncode != 0:
            if 'CONFLICT' in rebase.stdout or 'CONFLICT' in rebase.stderr or 'conflict' in (rebase.stdout + rebase.stderr).lower():
                resolved = _resolve_rebase_conflicts(repo_dir)
                if not resolved:
                    return False
            else:
                print(f'ERROR: git rebase failed (not a conflict): {rebase.stdout}\n{rebase.stderr}', file=sys.stderr)
                _git(repo_dir, 'rebase', '--abort', check=False)
                return False

        push = _git(repo_dir, 'push', 'origin', 'HEAD', check=False)
        if push.returncode == 0:
            print(f'Pushed successfully (attempt {attempt}/{max_retries}).')
            return True

        print(f'  Push rejected (attempt {attempt}/{max_retries}) - retrying: {push.stderr.strip()[-300:]}')
        time.sleep(2 * attempt)

    print(f'ERROR: push still failing after {max_retries} attempts - giving up.', file=sys.stderr)
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True, help='path to the git repo to commit+push in')
    parser.add_argument('--message', required=True, help='commit message')
    parser.add_argument('--add', nargs='*', default=None, help='path(s) to git add')
    parser.add_argument('--add-all', action='store_true', help='git add -A instead of specific paths')
    parser.add_argument('--max-retries', type=int, default=MAX_RETRIES_DEFAULT)
    args = parser.parse_args()

    if not args.add_all and not args.add:
        parser.error('must pass either --add <paths...> or --add-all')

    ok = safe_push(args.repo, args.message, add_paths=args.add, add_all=args.add_all, max_retries=args.max_retries)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
