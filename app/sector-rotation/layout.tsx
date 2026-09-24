import type { Metadata } from 'next';

// Rendered as "Sector Rotation · StockDesk" via the root layout's title template.
export const metadata: Metadata = { title: 'Sector Rotation' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
