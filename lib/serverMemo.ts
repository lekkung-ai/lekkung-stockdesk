// In-instance memo helpers for Route Handlers. State lives in module scope, so it
// survives between requests only while the serverless instance stays warm - a cold
// instance simply starts empty and does the full upstream round trip, same as before.
// Nothing here is a freshness guarantee on its own: every caller passes the max age it
// is allowed to serve, and only values the caller marks as good are ever stored, so an
// upstream failure is never remembered.

interface Timed<T> {
  value: T;
  ts: number;
}

export interface Memo<T> {
  /** Entry younger than `maxAgeMs` (or any age when omitted). */
  get(key: string, maxAgeMs?: number): Timed<T> | null;
  set(key: string, value: T): void;
  delete(key: string): void;
}

export function createMemo<T>(maxEntries = 24): Memo<T> {
  const map = new Map<string, Timed<T>>();
  return {
    get(key, maxAgeMs) {
      const e = map.get(key);
      if (!e) return null;
      if (maxAgeMs != null && Date.now() - e.ts > maxAgeMs) return null;
      return e;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, { value, ts: Date.now() });
      while (map.size > maxEntries) map.delete(map.keys().next().value as string);
    },
    delete(key) {
      map.delete(key);
    },
  };
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Fresh memo entry if there is one, else run `load` (concurrent callers share one run).
 * `load` returns null for "failed / nothing usable" - that is returned as null and not stored.
 */
export async function memoized<T>(
  memo: Memo<T>,
  key: string,
  maxAgeMs: number,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = memo.get(key, maxAgeMs);
  if (hit) return hit.value;
  const flightKey = `${key}@${maxAgeMs}`;
  let p = inflight.get(flightKey) as Promise<T | null> | undefined;
  if (!p) {
    p = load()
      .then(v => {
        if (v != null) memo.set(key, v);
        return v;
      })
      .finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, p);
  }
  return p;
}

// Session cookies from the Settrade pages (Incapsula): the page fetch that issues them costs
// ~0.8 s, while the cookie itself is accepted for far longer than one request.
const cookieMemo = createMemo<string>(8);
const COOKIE_TTL_MS = 10 * 60 * 1000;

export function sharedCookie(key: string, fetchCookie: () => Promise<string>): Promise<string> {
  return memoized(cookieMemo, key, COOKIE_TTL_MS, async () => (await fetchCookie()) || null).then(v => v ?? '');
}

/** True if a cookie for `key` is currently stored (i.e. the next sharedCookie call will reuse it). */
export function hasSharedCookie(key: string): boolean {
  return cookieMemo.get(key, COOKIE_TTL_MS) !== null;
}

export function dropSharedCookie(key: string): void {
  cookieMemo.delete(key);
}

/**
 * Waits for all of `promises`, except that once only `maxStragglers` or fewer are still pending it
 * gives them `graceMs` more and then moves on, using `fallback` for whatever has not settled. Built
 * for a batch of feeds where one permanently dead source would otherwise hold the whole response
 * for its full timeout: the cut-off is relative to how fast the healthy ones were, so it needs no
 * per-source state. The pending requests are not cancelled; they finish (or time out) on their own.
 */
export function settleExceptStragglers<T>(
  promises: Promise<T>[],
  { maxStragglers, graceMs }: { maxStragglers: number; graceMs: number },
  fallback: T,
): Promise<T[]> {
  return new Promise<T[]>(resolve => {
    const results = promises.map(() => fallback);
    let pending = promises.length;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      resolve([...results]);
    };
    if (pending === 0) return finish();
    promises.forEach((p, i) => {
      const settle = (v: T) => {
        results[i] = v;
        pending--;
        if (pending === 0) finish();
        else if (pending <= maxStragglers && !timer) timer = setTimeout(finish, graceMs);
      };
      p.then(settle, () => settle(fallback));
    });
  });
}
