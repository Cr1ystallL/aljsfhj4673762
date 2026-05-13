'use client';

import { motion } from 'framer-motion';
import { Gamepad2, DollarSign } from 'lucide-react';
import { useDemoMode } from '@/store/demo-mode-store';
import { Caption } from './typography';

/**
 * Demo Mode Toggle Component
 * Allows switching between demo and real money modes
 * 
 * FEATURES:
 * - Visual indicator of current mode
 * - Prevents switching during active bets
 * - Persistent across sessions
 */

export function DemoModeToggle() {
  const { isDemoMode, canSwitchMode, toggleDemoMode } = useDemoMode();

  const handleToggle = () => {
    const success = toggleDemoMode();
    if (!success) {
      // Could show toast notification here
      console.warn('Cannot switch mode during active bet');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Caption className="text-white/60">Mode:</Caption>
      
      <button
        onClick={handleToggle}
        disabled={!canSwitchMode}
        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
          canSwitchMode
            ? 'cursor-pointer hover:scale-105'
            : 'cursor-not-allowed opacity-50'
        } ${
          isDemoMode
            ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
            : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
        }`}
      >
        <motion.div
          animate={{ rotate: isDemoMode ? 0 : 360 }}
          transition={{ duration: 0.3 }}
        >
          {isDemoMode ? (
            <Gamepad2 className="h-4 w-4" />
          ) : (
            <DollarSign className="h-4 w-4" />
          )}
        </motion.div>
        
        <span className="text-sm font-medium">
          {isDemoMode ? 'Demo' : 'Real'}
        </span>
      </button>
      
      {!canSwitchMode && (
        <Caption className="text-yellow-400">
          Cannot switch during active bet
        </Caption>
      )}
    </div>
  );
}
