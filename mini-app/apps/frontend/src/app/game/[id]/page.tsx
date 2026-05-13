'use client';

import { use } from 'react';
import { PageTransition } from '@/components/ui/page-transition';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

const gameInfo: Record<string, { name: string; icon: string; description: string }> = {
  crash: { name: 'Crash', icon: '🚀', description: 'Multiplayer crash game' },
  plinko: { name: 'Plinko', icon: '🎯', description: 'Classic plinko' },
  mines: { name: 'Mines', icon: '💣', description: 'Find the safe tiles' },
  cookies: { name: 'Cookies', icon: '🍪', description: 'Cookie game' },
  nuts: { name: 'Nuts', icon: '🥜', description: 'Nuts game' },
  keno: { name: 'Keno', icon: '🎱', description: 'Number selection' },
  coinflip: { name: 'Coinflip', icon: '🪙', description: 'Heads or tails' },
};

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const game = gameInfo[id] || { name: 'Unknown', icon: '❓', description: 'Game not found' };

  return (
    <PageTransition>
      <div className="min-h-screen pb-32 pt-safe px-safe">
        {/* Header */}
        <header className="p-6 flex items-center gap-4">
          <motion.button
            onClick={() => router.back()}
            className="text-white/60 hover:text-white transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft size={24} />
          </motion.button>
          <div>
            <h1 className="text-4xl font-bold text-white">{game.name}</h1>
            <p className="text-white/60">{game.description}</p>
          </div>
        </header>

        {/* Game Content */}
        <main className="px-6 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard className="p-8">
              <div className="text-center space-y-6">
                <div className="text-8xl">{game.icon}</div>
                <h2 className="text-2xl font-bold text-white">
                  Game Coming Soon
                </h2>
                <p className="text-white/60">
                  This game will be implemented in Phase 5
                </p>
                <Button variant="secondary" onClick={() => router.back()}>
                  Back to Games
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </main>
      </div>
    </PageTransition>
  );
}
