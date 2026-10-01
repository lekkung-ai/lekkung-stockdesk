'use client';

import { createContext, useContext, useState } from 'react';

export type Market = 'SET' | 'US' | 'HK';

// TH SET / US / HK switcher in the top bar. false = buttons hidden and the market is always SET
// (any other value is ignored), while the US/HK code paths stay in place - set true to bring it back.
export const SHOW_MARKET_SWITCH = false;

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
  const [chosenMarket, setSelectedMarket] = useState<Market>('SET');
  const selectedMarket: Market = SHOW_MARKET_SWITCH ? chosenMarket : 'SET';
  return (
    <StockContext.Provider value={{ selectedSymbol, setSelectedSymbol, selectedMarket, setSelectedMarket }}>
      {children}
    </StockContext.Provider>
  );
}

export const useStock = () => useContext(StockContext);
