import type { Metadata } from 'next';
import MyStocks from '@/components/MyStocks';

export const metadata: Metadata = { title: 'My Stocks' };

export default function MyStocksPage() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <MyStocks />
    </div>
  );
}
