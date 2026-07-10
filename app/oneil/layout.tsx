import type { Metadata } from 'next';

export const metadata: Metadata = { title: "CAN SLIM (O'Neil)" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
