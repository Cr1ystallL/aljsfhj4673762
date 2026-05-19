import { create } from 'zustand';

/**
 * Toast notification store.
 *
 * In-app notifications shown as a stack at the top of the viewport.
 * Independent of Telegram's native popup — those interrupt the flow
 * and feel heavy for things like "insufficient balance". Toasts are
 * lightweight, dismiss themselves after a TTL, and stack vertically
 * when several events fire close together.
 */

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  /** Optional short heading. Falls back to a sensible default per kind. */
  title?: string;
  /** Body text. */
  message: string;
  /** Time-to-live in ms. Defaults to 4000. */
  ttl?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Imperative helper — usable from anywhere (event handlers, async
 * callbacks, websocket message handlers). Does not require a hook
 * subscription.
 *
 *   toast.error('Insufficient balance for this bet');
 *   toast.success('Request accepted', { title: 'Done' });
 */
export const toast = {
  show(message: string, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
    return useToastStore.getState().push({
      kind: opts.kind ?? 'info',
      title: opts.title,
      message,
      ttl: opts.ttl,
    });
  },
  info(message: string, opts: Partial<Omit<Toast, 'id' | 'message' | 'kind'>> = {}) {
    return useToastStore.getState().push({ kind: 'info', message, ...opts });
  },
  success(message: string, opts: Partial<Omit<Toast, 'id' | 'message' | 'kind'>> = {}) {
    return useToastStore.getState().push({ kind: 'success', message, ...opts });
  },
  warn(message: string, opts: Partial<Omit<Toast, 'id' | 'message' | 'kind'>> = {}) {
    return useToastStore.getState().push({ kind: 'warn', message, ...opts });
  },
  error(message: string, opts: Partial<Omit<Toast, 'id' | 'message' | 'kind'>> = {}) {
    return useToastStore.getState().push({ kind: 'error', message, ...opts });
  },
  dismiss(id: string) {
    useToastStore.getState().dismiss(id);
  },
  clear() {
    useToastStore.getState().clear();
  },
};
