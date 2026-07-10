import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Market Stage' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
