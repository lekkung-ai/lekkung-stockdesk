'use client';

import dynamic from 'next/dynamic';

// คำตอบอยู่ใน localStorage → render ฝั่ง client อย่างเดียว กัน hydration mismatch
const VcpReview = dynamic(() => import('./VcpReview'), {
  ssr: false,
  loading: () => <p className="text-[12px] text-white/30 animate-pulse">กำลังโหลด...</p>,
});

export default function Page() {
  return <VcpReview />;
}
