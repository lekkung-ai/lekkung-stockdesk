import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Martin Luk' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
