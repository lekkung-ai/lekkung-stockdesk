import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Lekkung Growth' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
