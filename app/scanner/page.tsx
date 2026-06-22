import { Suspense } from 'react';
import { scanData } from '@/lib/scanData';
import ScannerTable from '@/components/ScannerTable';

export default function ScannerPage() {
  return (
    <Suspense>
      <ScannerTable data={scanData} />
    </Suspense>
  );
}
