import { useState, useEffect, useRef } from 'react';
import { formatSymbolsQuery } from './utils';

export function useLivePrices(tickers: string[]): {
  priceMap: Record<string, number>;
  changePctMap: Record<string, number>;
  fetchDone: boolean;
  fetchedAt: string | null; // ISO time the prices arrived (null = not loaded / failed)
} {
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [changePctMap, setChangePctMap] = useState<Record<string, number>>({});
  const [fetchDone, setFetchDone] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const symbols = useRef(formatSymbolsQuery(tickers));

  useEffect(() => {
    if (!symbols.current) {
      setFetchDone(true);
      return;
    }
    fetch(`/api/prices?symbols=${symbols.current}`)
      .then(r => r.json())
      .then(json => {
        if (json.prices) {
          const pm: Record<string, number> = {};
          const cm: Record<string, number> = {};
          for (const [k, v] of Object.entries(
            json.prices as Record<string, { price: number; changePercent: number }>
          )) {
            pm[k] = v.price;
            if (v.changePercent != null) cm[k] = v.changePercent;
          }
          setPriceMap(pm);
          setChangePctMap(cm);
          setFetchedAt(new Date().toISOString());
        }
      })
      .catch(() => {})
      .finally(() => setFetchDone(true));
  }, []);

  return { priceMap, changePctMap, fetchDone, fetchedAt };
}
