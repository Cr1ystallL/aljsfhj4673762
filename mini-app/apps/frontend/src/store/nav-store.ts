import { create } from 'zustand';

/**
 * Bottom navigation visibility store.
 *
 * The home screen always shows the nav. Inside a game we hide it by
 * default — players want every pixel of vertical real estate when the
 * board / curve is on screen — and surface a small grip handle at the
 * bottom that pulls it back up.
 *
 * Pages set `setHideable(true)` in an effect while they're mounted; the
 * hook resets to `false` (always-visible) when they unmount.
 */
interface NavState {
  /** True if the page allows the nav to collapse. */
  hideable: boolean;
  /** True when the user has dismissed the nav. */
  collapsed: boolean;
  setHideable: (h: boolean) => void;
  setCollapsed: (c: boolean) => void;
  toggle: () => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  hideable: false,
  collapsed: false,
  setHideable: (h) =>
    set(() => ({
      hideable: h,
      // Auto-collapse when entering a hideable page so the player gets
      // an unobstructed view immediately. Auto-show when the page goes
      // back to non-hideable so home / balance never start collapsed.
      collapsed: h,
    })),
  setCollapsed: (c) => set({ collapsed: c }),
  toggle: () => set({ collapsed: !get().collapsed }),
}));
