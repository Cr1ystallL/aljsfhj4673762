import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import {
  authenticateWithTelegram,
  getCurrentUser,
  refreshAccessToken,
} from '@/lib/auth/telegram-auth';

/**
 * Hook for Telegram Mini App authentication
 *
 * RESILIENCY:
 * - Automatically rehydrates persisted auth on client mount
 * - Pre-seeds user avatar and initials from Telegram WebApp SDK synchronously
 * - Validates initData with backend HMAC-SHA256
 * - Automatically recovers session via /api/auth/me or /api/auth/refresh
 *   if initData is expired, unavailable, or on WebView reload
 * - Keeps WebSocket sessionId and token intact
 */
export function useTelegramAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth, setLoading } = useAuthStore();

  useEffect(() => {
    async function authenticate() {
      // 1. Rehydrate persisted auth from localStorage on client
      if (typeof window !== 'undefined') {
        try {
          useAuthStore.persist.rehydrate();
        } catch {}
      }

      // Check if running in Telegram WebApp
      if (typeof window === 'undefined' || !window.Telegram?.WebApp) {
        console.log('[AUTH] Telegram WebApp not available — checking existing session');
        await attemptSessionRecovery();
        setLoading(false);
        return;
      }

      const tg = window.Telegram.WebApp;
      const initData = tg.initData;
      const unsafeUser = tg.initDataUnsafe?.user;

      // 2. Pre-seed basic user details immediately so avatar & initials never default to "U"
      if (unsafeUser && !useAuthStore.getState().user) {
        useAuthStore.setState((prev) => ({
          ...prev,
          user: prev.user || {
            id: String(unsafeUser.id),
            telegramId: unsafeUser.id,
            username: unsafeUser.username,
            firstName: unsafeUser.first_name || 'User',
            lastName: unsafeUser.last_name,
            photoUrl: unsafeUser.photo_url,
            isPremium: Boolean(unsafeUser.is_premium),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }));
      }

      setIsAuthenticating(true);
      setError(null);

      // 3. If initData is present, attempt primary Telegram auth
      if (initData) {
        try {
          console.log('[AUTH] Sending initData to backend...');
          const response = await authenticateWithTelegram(initData);
          console.log('[AUTH] Authentication successful:', response.user.username);

          const photoUrl = tg.initDataUnsafe?.user?.photo_url || response.user.photoUrl || undefined;

          if (typeof window !== 'undefined') {
            try {
              if (response.accessToken) {
                localStorage.setItem('macvbet_token', response.accessToken);
              }
              if (response.sessionId) {
                localStorage.setItem('macvbet_sessionId', response.sessionId);
              }
            } catch {}
          }

          setAuth(
            {
              id: response.user.id,
              telegramId: Number(response.user.telegramId),
              username: response.user.username,
              firstName: response.user.firstName || unsafeUser?.first_name || 'User',
              lastName: response.user.lastName || unsafeUser?.last_name,
              photoUrl: photoUrl,
              isPremium: response.user.isPremium,
              languageCode: undefined,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            response.accessToken || '',
            response.sessionId
          );
          setIsAuthenticating(false);
          return;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
          console.warn('[AUTH] Primary initData auth failed, falling back to session recovery:', errorMessage);
        }
      }

      // 4. Fallback: Recover existing session via /api/auth/me or token refresh
      const recovered = await attemptSessionRecovery(unsafeUser);
      if (!recovered) {
        setError('Authentication required');
        setLoading(false);
      }
      setIsAuthenticating(false);
    }

    async function attemptSessionRecovery(unsafeUser?: NonNullable<Window['Telegram']>['WebApp']['initDataUnsafe']['user']): Promise<boolean> {
      try {
        const me = await getCurrentUser();
        if (me?.user) {
          const existingToken =
            (typeof window !== 'undefined' ? localStorage.getItem('macvbet_token') : null) ||
            useAuthStore.getState().token ||
            '';
          const existingSessionId =
            me.sessionId ||
            (typeof window !== 'undefined' ? localStorage.getItem('macvbet_sessionId') : null) ||
            useAuthStore.getState().sessionId ||
            '';

          if (typeof window !== 'undefined' && existingSessionId) {
            try {
              localStorage.setItem('macvbet_sessionId', existingSessionId);
            } catch {}
          }

          setAuth(
            {
              id: me.user.id,
              telegramId: Number(me.user.telegramId),
              username: me.user.username,
              firstName: me.user.firstName || unsafeUser?.first_name || 'User',
              lastName: me.user.lastName || unsafeUser?.last_name,
              photoUrl: unsafeUser?.photo_url || me.user.photoUrl || undefined,
              isPremium: me.user.isPremium,
              languageCode: me.user.languageCode,
              createdAt: new Date(me.user.createdAt || Date.now()),
              updatedAt: new Date(),
            },
            existingToken,
            existingSessionId
          );
          console.log('[AUTH] Recovered session via /api/auth/me successfully');
          return true;
        }
      } catch {
        // Try refresh token cookie
        try {
          const refreshed = await refreshAccessToken();
          if (refreshed.success) {
            const me = await getCurrentUser();
            if (me?.user) {
              const existingToken =
                (typeof window !== 'undefined' ? localStorage.getItem('macvbet_token') : null) ||
                useAuthStore.getState().token ||
                '';
              const existingSessionId =
                me.sessionId ||
                (typeof window !== 'undefined' ? localStorage.getItem('macvbet_sessionId') : null) ||
                useAuthStore.getState().sessionId ||
                '';

              setAuth(
                {
                  id: me.user.id,
                  telegramId: Number(me.user.telegramId),
                  username: me.user.username,
                  firstName: me.user.firstName || unsafeUser?.first_name || 'User',
                  lastName: me.user.lastName || unsafeUser?.last_name,
                  photoUrl: unsafeUser?.photo_url || me.user.photoUrl || undefined,
                  isPremium: me.user.isPremium,
                  languageCode: me.user.languageCode,
                  createdAt: new Date(me.user.createdAt || Date.now()),
                  updatedAt: new Date(),
                },
                existingToken,
                existingSessionId
              );
              console.log('[AUTH] Recovered session via token refresh successfully');
              return true;
            }
          }
        } catch {}
      }
      return false;
    }

    authenticate();
  }, [setAuth, setLoading]);

  return {
    isAuthenticating,
    error,
  };
}
