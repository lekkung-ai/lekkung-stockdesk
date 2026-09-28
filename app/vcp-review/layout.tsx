import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'VCP Review' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
