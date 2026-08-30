'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PartnerPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return <div className="min-h-screen bg-midnight-canvas" />;
}
