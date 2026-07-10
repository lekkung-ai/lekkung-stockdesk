import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Big Lot' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
