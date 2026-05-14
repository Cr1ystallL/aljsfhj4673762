'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Home Page - Redirects to Crash Game
 * 
 * Main screen shows Crash game directly as requested.
 * Users see the game immediately when opening the mini app.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to Crash game on mount
    router.replace('/game/crash');
  }, [router]);

  // Show minimal loading state during redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-black via-gray-900 to-black">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60 text-sm">Loading...</p>
      </div>
    </div>
  );
}
