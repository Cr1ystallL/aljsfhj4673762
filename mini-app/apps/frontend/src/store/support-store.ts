import { create } from 'zustand';

interface SupportStoreState {
  isOpen: boolean;
  unreadCount: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setUnreadCount: (count: number) => void;
}

export const useSupportStore = create<SupportStoreState>((set, get) => ({
  isOpen: false,
  unreadCount: 0,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set({ isOpen: !get().isOpen }),
  setUnreadCount: (count) => set({ unreadCount: count }),
}));
