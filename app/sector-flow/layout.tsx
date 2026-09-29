import type { Metadata } from 'next';

// Rendered as "Sector Flow · StockDesk" via the root layout's title template.
export const metadata: Metadata = { title: 'Sector Flow' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
