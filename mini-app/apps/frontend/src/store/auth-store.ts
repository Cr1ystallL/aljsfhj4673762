import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@casino/shared';

/**
 * Authentication state store
 * Manages user session and JWT token
 */

interface AuthState {
  user: User | null;
  token: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once any API hit has come back with `code: 'BLOCKED'`. The
   *  layout uses this to hide the entire UI without ever surfacing a
   *  textual reason. */
  blocked: boolean;

  // Actions
  setAuth: (user: User, token: string, sessionId: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  markBlocked: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      sessionId: null,
      isAuthenticated: false,
      isLoading: true,
      blocked: false,

      setAuth: (user, token, sessionId) =>
        set({
          user,
          token,
          sessionId,
          isAuthenticated: true,
          isLoading: false,
        }),

      clearAuth: () =>
        set({
          user: null,
          token: null,
          sessionId: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (loading) =>
        set({ isLoading: loading }),

      markBlocked: () => set({ blocked: true }),
    }),
    {
      name: 'auth-storage',
      // SECURITY: Only persist user data, NOT the token or sessionId
      // Token and sessionId should be stored in httpOnly cookie (Phase 2)
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Skip hydration on server to prevent SSR mismatch
      skipHydration: true,
    }
  )
);
