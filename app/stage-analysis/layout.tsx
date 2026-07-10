import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Stage Analysis' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
