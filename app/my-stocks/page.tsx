import WatchlistCard from '@/components/WatchlistCard';
import StockDetailCard from '@/components/StockDetailCard';

export default function MyStocksPage() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row gap-5 items-start">
        <div className="w-full md:flex-1 md:min-w-0">
          <WatchlistCard />
        </div>
        <div className="w-full md:w-[300px] md:flex-shrink-0">
          <StockDetailCard />
        </div>
      </div>
    </div>
  );
}
