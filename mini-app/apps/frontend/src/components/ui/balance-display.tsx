'use client';

import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { GlassCard } from './glass-card';

interface BalanceDisplayProps {
  amount: number;
  currency?: string;
  demoMode?: boolean;
}

/**
 * Balance display with animated updates
 * Shows demo mode indicator
 */
export function BalanceDisplay({ 
  amount, 
  currency = 'PLN',
  demoMode = false 
}: BalanceDisplayProps) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <Wallet size={20} className="text-white" />
          </div>
          <div>
            <div className="text-xs text-white/60">
              {demoMode ? 'Demo Balance' : 'Balance'}
            </div>
            <motion.div
              key={amount}
              className="text-xl font-bold text-white"
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {amount.toFixed(2)} {currency === 'PLN' ? 'zł' : currency}
            </motion.div>
          </div>
        </div>
        
        {demoMode && (
          <div className="px-3 py-1 rounded-pill bg-accent-orange/20 text-accent-orange text-xs font-medium">
            DEMO
          </div>
        )}
      </div>
    </GlassCard>
  );
}
