'use client';

import { useState } from 'react';
import { PageTransition } from '@/components/ui/page-transition';
import { GlassCard } from '@/components/ui/glass-card';
import { GameCard } from '@/components/ui/game-card';
import { BalanceDisplay } from '@/components/ui/balance-display';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <PageTransition>
      <div className="min-h-screen flex flex-col pb-32 pt-safe px-safe">
        {/* Header */}
        <header className="p-6">
          <motion.h1
            className="text-4xl font-bold text-white mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Casino
          </motion.h1>
          
          {/* Balance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <BalanceDisplay amount={10000} demoMode />
          </motion.div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 space-y-6">
          {/* Featured Games */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="text-xl font-bold text-white mb-4">Featured</h3>
            <div className="grid grid-cols-2 gap-4">
              <GameCard
                id="crash"
                name="Crash"
                icon="🚀"
                description="Multiplayer"
                players={42}
                onClick={() => router.push('/game/crash')}
              />
              
              <GameCard
                id="plinko"
                name="Plinko"
                icon="🎯"
                description="Classic"
                onClick={() => router.push('/game/plinko')}
              />
            </div>
          </motion.div>

          {/* All Games */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-xl font-bold text-white mb-4">All Games</h3>
            <div className="grid grid-cols-2 gap-4">
              <GameCard
                id="mines"
                name="Mines"
                icon="💣"
                onClick={() => router.push('/game/mines')}
              />
              <GameCard
                id="cookies"
                name="Cookies"
                icon="🍪"
                onClick={() => router.push('/game/cookies')}
              />
              <GameCard
                id="nuts"
                name="Nuts"
                icon="🥜"
                onClick={() => router.push('/game/nuts')}
              />
              <GameCard
                id="keno"
                name="Keno"
                icon="🎱"
                onClick={() => router.push('/game/keno')}
              />
            </div>
          </motion.div>
        </main>
      </div>
    </PageTransition>
  );
}
