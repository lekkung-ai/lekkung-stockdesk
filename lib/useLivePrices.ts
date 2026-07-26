import { useState, useEffect, useRef } from 'react';
import { formatSymbolsQuery } from './utils';

export function useLivePrices(tickers: string[]): {
  priceMap: Record<string, number>;
  changePctMap: Record<string, number>;
  fetchDone: boolean;
} {
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [changePctMap, setChangePctMap] = useState<Record<string, number>>({});
  const [fetchDone, setFetchDone] = useState(false);
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
        }
      })
      .catch(() => {})
      .finally(() => setFetchDone(true));
  }, []);

  return { priceMap, changePctMap, fetchDone };
}
