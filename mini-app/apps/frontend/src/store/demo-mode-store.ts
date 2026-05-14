import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Demo Mode Store
 * Manages demo/real mode state across the application
 * 
 * RULES:
 * - Demo mode persists across sessions
 * - Cannot switch mode during active real-money bets
 * - Mode is visible in all game UIs
 */

interface DemoModeState {
  isDemoMode: boolean;
  hasActiveBet: boolean;
  canSwitchMode: boolean;
  
  setDemoMode: (enabled: boolean) => void;
  setActiveBet: (active: boolean) => void;
  toggleDemoMode: () => boolean;
}

export const useDemoMode = create<DemoModeState>()(
  persist(
    (set, get) => ({
      isDemoMode: false, // Default to REAL mode - sync with bot balance
      hasActiveBet: false,
      canSwitchMode: true,
      
      setDemoMode: (enabled: boolean) => {
        const { hasActiveBet } = get();
        
        // Prevent switching during active real-money bets
        if (hasActiveBet && !enabled) {
          console.warn('Cannot switch to real mode during active bet');
          return;
        }
        
        set({ isDemoMode: enabled });
      },
      
      setActiveBet: (active: boolean) => {
        set({ 
          hasActiveBet: active,
          canSwitchMode: !active,
        });
      },
      
      toggleDemoMode: () => {
        const { isDemoMode, hasActiveBet } = get();
        
        // Prevent switching during active real-money bets
        if (hasActiveBet && isDemoMode) {
          console.warn('Cannot switch to real mode during active bet');
          return false;
        }
        
        const newMode = !isDemoMode;
        set({ isDemoMode: newMode });
        return true;
      },
    }),
    {
      name: 'demo-mode-storage',
      partialize: (state) => ({ isDemoMode: state.isDemoMode }),
    }
  )
);
