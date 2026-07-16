"""
write_pipeline_status.py - Records this pipeline run's outcome to
public/data/pipeline_status.json (merged with the existing file, so a failed
run doesn't erase the last known-good last_success_at). Called at the very
end of every pipeline run - update_stockdesk.bat and daily-scan.yml - success
or failure, so the "is the pipeline actually alive" question never again
depends on someone noticing a stale generated_at by hand.

Usage:
    python scripts/write_pipeline_status.py --status success --source local
    python scripts/write_pipeline_status.py --status failure --failed-step "run_all.py scan" --source cloud

Output: public/data/pipeline_status.json
    {
      "last_run_at": "2026-07-16T18:11:00+07:00",
      "last_success_at": "2026-07-15T09:53:00+07:00",
      "status": "failure",
      "failed_step": "run_all.py scan",
      "source": "cloud"
    }
"""

import argparse
import json
import os
from datetime import datetime, timezone, timedelta

BANGKOK_TZ = timezone(timedelta(hours=7))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(SCRIPT_DIR, '..', 'public', 'data', 'pipeline_status.json')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--status', required=True, choices=['success', 'failure'])
    parser.add_argument('--failed-step', default=None)
    parser.add_argument('--source', required=True, choices=['local', 'cloud'])
    args = parser.parse_args()

    now = datetime.now(BANGKOK_TZ).strftime('%Y-%m-%dT%H:%M:%S+07:00')

    existing = {}
    if os.path.exists(OUT_PATH):
        try:
            with open(OUT_PATH, encoding='utf-8') as f:
                existing = json.load(f)
        except Exception:
            existing = {}

    result = {
        'last_run_at': now,
        'last_success_at': now if args.status == 'success' else existing.get('last_success_at'),
        'status': args.status,
        'failed_step': args.failed_step if args.status == 'failure' else None,
        'source': args.source,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"pipeline_status.json written: {result}")


if __name__ == '__main__':
    main()
