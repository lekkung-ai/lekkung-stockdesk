import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Oliver Kell EMAC' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
