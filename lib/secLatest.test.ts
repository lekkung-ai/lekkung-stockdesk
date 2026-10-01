import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { findLatestSecDay, hasRealRows } from './secLatest';

const EMPTY = { rows: [{ 'ชื่อบริษัท': 'ไม่พบข้อมูล' }] };
const REAL = { rows: [{ 'ชื่อบริษัท': 'X (ABC)' }] };

let dir = '';
const put = (date: string, body: unknown, fname = 'r59.json') => {
  fs.mkdirSync(path.join(dir, date), { recursive: true });
  fs.writeFileSync(path.join(dir, date, fname), typeof body === 'string' ? body : JSON.stringify(body));
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seclatest-'));
  put('2026-09-25', REAL);
  put('2026-09-26', EMPTY);           // weekend placeholder
  put('2026-09-29', REAL);
  put('2026-09-30', EMPTY);           // no filings that day
  put('2026-09-28', '{not json');     // corrupt → skipped
  fs.mkdirSync(path.join(dir, '2026-10-01')); // today: folder, no r59 yet
  fs.mkdirSync(path.join(dir, 'notes'));
  put('2026-10-02', REAL);            // future → ignored
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('hasRealRows', () => {
  it('ignores the ไม่พบข้อมูล placeholder and missing rows', () => {
    expect(hasRealRows(REAL, 'ชื่อบริษัท')).toBe(true);
    expect(hasRealRows(EMPTY, 'ชื่อบริษัท')).toBe(false);
    expect(hasRealRows({ rows: [] }, 'ชื่อบริษัท')).toBe(false);
    expect(hasRealRows({}, 'ชื่อบริษัท')).toBe(false);
    expect(hasRealRows(null, 'ชื่อบริษัท')).toBe(false);
  });
});

describe('findLatestSecDay', () => {
  it('skips empty / corrupt / future days and reports whether today has a snapshot', () => {
    expect(findLatestSecDay(dir, 'r59.json', 'ชื่อบริษัท', '2026-10-01')).toEqual({ latest: '2026-09-29', todaySnapshot: false });
    expect(findLatestSecDay(dir, 'r59.json', 'ชื่อบริษัท', '2026-09-30')).toEqual({ latest: '2026-09-29', todaySnapshot: true });
    expect(findLatestSecDay(dir, 'r59.json', 'ชื่อบริษัท', '2026-09-29')).toEqual({ latest: '2026-09-29', todaySnapshot: true });
    expect(findLatestSecDay(dir, 'r59.json', 'ชื่อบริษัท', '2026-10-02').latest).toBe('2026-10-02');
  });
  it('null when nothing usable (other file name, missing dir, maxDays window)', () => {
    expect(findLatestSecDay(dir, 'r246.json', 'หลักทรัพย์', '2026-10-01')).toEqual({ latest: null, todaySnapshot: false });
    expect(findLatestSecDay(path.join(dir, 'nope'), 'r59.json', 'ชื่อบริษัท', '2026-10-01')).toEqual({ latest: null, todaySnapshot: false });
    expect(findLatestSecDay(dir, 'r59.json', 'ชื่อบริษัท', '2026-10-01', 2).latest).toBeNull();
  });
});
