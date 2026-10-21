import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemo, dropSharedCookie, memoized, settleExceptStragglers, sharedCookie } from './serverMemo';

afterEach(() => vi.useRealTimers());

describe('memoized', () => {
  it('stores a good value and serves it until maxAge', async () => {
    vi.useFakeTimers();
    const memo = createMemo<number>();
    const load = vi.fn(async () => 7);
    expect(await memoized(memo, 'k', 1000, load)).toBe(7);
    expect(await memoized(memo, 'k', 1000, load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await memoized(memo, 'k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never stores a failure (null) and retries next time', async () => {
    const memo = createMemo<number>();
    const load = vi.fn<() => Promise<number | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(5);
    expect(await memoized(memo, 'k', 1000, load)).toBeNull();
    expect(await memoized(memo, 'k', 1000, load)).toBe(5);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers share one load', async () => {
    const memo = createMemo<number>();
    const load = vi.fn(async () => 1);
    await Promise.all([memoized(memo, 'k', 1000, load), memoized(memo, 'k', 1000, load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('createMemo', () => {
  it('keeps at most maxEntries, dropping the oldest', () => {
    const memo = createMemo<number>(2);
    memo.set('a', 1); memo.set('b', 2); memo.set('c', 3);
    expect(memo.get('a')).toBeNull();
    expect(memo.get('b')?.value).toBe(2);
    expect(memo.get('c')?.value).toBe(3);
  });
});

describe('sharedCookie', () => {
  it('reuses a cookie, re-issues after drop, and does not keep an empty one', async () => {
    const fetchCookie = vi.fn<() => Promise<string>>().mockResolvedValueOnce('').mockResolvedValue('a=1');
    expect(await sharedCookie('t-cookie', fetchCookie)).toBe('');
    expect(await sharedCookie('t-cookie', fetchCookie)).toBe('a=1');
    expect(await sharedCookie('t-cookie', fetchCookie)).toBe('a=1');
    expect(fetchCookie).toHaveBeenCalledTimes(2);
    dropSharedCookie('t-cookie');
    await sharedCookie('t-cookie', fetchCookie);
    expect(fetchCookie).toHaveBeenCalledTimes(3);
  });
});

describe('settleExceptStragglers', () => {
  const later = <T,>(ms: number, v: T) => new Promise<T>(r => setTimeout(() => r(v), ms));

  it('returns as soon as everything settles', async () => {
    vi.useFakeTimers();
    const p = settleExceptStragglers([later(10, 'a'), later(20, 'b')], { maxStragglers: 1, graceMs: 500 }, 'x');
    await vi.advanceTimersByTimeAsync(20);
    expect(await p).toEqual(['a', 'b']);
  });

  it('cuts a dead straggler graceMs after the rest are done', async () => {
    vi.useFakeTimers();
    const p = settleExceptStragglers([later(100, 'a'), later(150, 'b'), later(3000, 'dead')], { maxStragglers: 1, graceMs: 350 }, 'x');
    await vi.advanceTimersByTimeAsync(150 + 349);
    let done = false;
    p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual(['a', 'b', 'x']);
  });

  it('a straggler that makes it inside the grace window is kept', async () => {
    vi.useFakeTimers();
    const p = settleExceptStragglers([later(100, 'a'), later(300, 'slow')], { maxStragglers: 1, graceMs: 350 }, 'x');
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toEqual(['a', 'slow']);
  });

  it('a rejection counts as the fallback', async () => {
    const p = settleExceptStragglers([Promise.reject(new Error('no')), Promise.resolve('b')], { maxStragglers: 1, graceMs: 50 }, 'x');
    expect(await p).toEqual(['x', 'b']);
  });
});
