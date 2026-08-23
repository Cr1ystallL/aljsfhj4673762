'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsAdmin } from '@/lib/admin-probe';
import { BlackjackMultiplayer } from '@/components/game/blackjack/blackjack-multiplayer';

export default function BlackjackPage() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  useEffect(() => {
    if (isAdmin === false) {
      router.replace('/');
    }
  }, [isAdmin, router]);

  if (isAdmin === false) {
    return null;
  }

  return <BlackjackMultiplayer />;
}
