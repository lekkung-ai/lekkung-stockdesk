'use client';

import { useEffect, useState } from 'react';
import type { MarketQuote } from '@/app/api/market-quotes/route';

export type QuotesState = {
  status: 'loading' | 'ok' | 'error';
  quotes: Record<string, MarketQuote>;
  fetchedAt: string | null; // ISO time the server cache pulled the data
};

const EMPTY: Record<string, MarketQuote> = {};

// Live price / %chg / market cap for every sector_map ticker (one request,
// server-cached 60s). On failure `status` is 'error' and callers show
// "ไม่มีข้อมูลราคาสด" while the rest of the page keeps working.
export function useMarketQuotes(): QuotesState {
  const [state, setState] = useState<QuotesState>({ status: 'loading', quotes: EMPTY, fetchedAt: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/market-quotes')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(json => {
        if (cancelled) return;
        const quotes = (json?.quotes ?? EMPTY) as Record<string, MarketQuote>;
        const fetchedAt = typeof json?.fetchedAt === 'number' ? new Date(json.fetchedAt).toISOString() : null;
        setState(Object.keys(quotes).length > 0 ? { status: 'ok', quotes, fetchedAt } : { status: 'error', quotes: EMPTY, fetchedAt: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', quotes: EMPTY, fetchedAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
