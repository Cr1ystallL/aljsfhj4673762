import { create } from 'zustand';

/**
 * Splash overlay visibility. Home uses this to play a short opacity
 * cascade once the brand beat lets go — content is already mounted
 * underneath, so the splash must not outlast the first data load.
 */
interface SplashState {
  visible: boolean;
  dismiss: () => void;
}

export const useSplashStore = create<SplashState>((set) => ({
  visible: true,
  dismiss: () => set({ visible: false }),
}));
