import { create } from 'zustand';

/**
 * Splash overlay visibility. Home uses this to play the 400–600 ms
 * lobby assemble once the brand moment lets go — content is already
 * mounted underneath.
 */
interface SplashState {
  visible: boolean;
  dismiss: () => void;
}

export const useSplashStore = create<SplashState>((set) => ({
  visible: true,
  dismiss: () => set({ visible: false }),
}));
