'use client';

import { createContext, useContext, useState } from 'react';

export type Market = 'SET' | 'US' | 'HK';

interface StockCtx {
  selectedSymbol: string;
  setSelectedSymbol: (s: string) => void;
  selectedMarket: Market;
  setSelectedMarket: (m: Market) => void;
}

const StockContext = createContext<StockCtx>({
  selectedSymbol: 'DELTA',
  setSelectedSymbol: () => {},
  selectedMarket: 'SET',
  setSelectedMarket: () => {},
});

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [selectedSymbol, setSelectedSymbol] = useState('DELTA');
  const [selectedMarket, setSelectedMarket] = useState<Market>('SET');
  return (
    <StockContext.Provider value={{ selectedSymbol, setSelectedSymbol, selectedMarket, setSelectedMarket }}>
      {children}
    </StockContext.Provider>
  );
}

export const useStock = () => useContext(StockContext);
