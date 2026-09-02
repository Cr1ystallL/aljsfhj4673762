import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { authenticateWithTelegram } from '@/lib/auth/telegram-auth';

/**
 * Hook for Telegram Mini App authentication
 * 
 * SECURITY:
 * - Automatically authenticates when Telegram initData is available
 * - Sends initData to backend for server-side validation
 * - Stores user data (not token) in Zustand
 */
export function useTelegramAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth, setLoading } = useAuthStore();

  useEffect(() => {
    async function authenticate() {
      // Check if running in Telegram WebApp
      if (typeof window === 'undefined' || !window.Telegram?.WebApp) {
        console.log('[AUTH] Telegram WebApp not available');
        setLoading(false);
        return;
      }

      const tg = window.Telegram.WebApp;
      const initData = tg.initData;

      console.log('[AUTH] Telegram WebApp detected');
      console.log('[AUTH] initData length:', initData?.length || 0);
      console.log('[AUTH] initData (first 100 chars):', initData?.substring(0, 100) || 'EMPTY');
      console.log('[AUTH] platform:', tg.platform);
      console.log('[AUTH] version:', tg.version);

      if (!initData) {
        console.error('[AUTH] No Telegram initData available');
        setLoading(false);
        setError('No Telegram initData available');
        return;
      }

      setIsAuthenticating(true);
      setError(null);

      try {
        console.log('[AUTH] Sending initData to backend...');
        // Send initData to backend for validation
        const response = await authenticateWithTelegram(initData);

        console.log('[AUTH] Authentication successful:', response.user.username);

        // Get photo URL from Telegram WebApp if available
        const photoUrl = tg.initDataUnsafe?.user?.photo_url || undefined;
        console.log('[AUTH] Photo URL:', photoUrl);

        // Save token to localStorage for apiClient and fetchWithAuth fallback
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
            firstName: response.user.firstName,
            lastName: response.user.lastName,
            photoUrl: photoUrl, // Add photo URL from Telegram
            isPremium: response.user.isPremium,
            languageCode: undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          response.accessToken || '',
          response.sessionId // SessionId for WebSocket authentication
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
        console.error('[AUTH] Authentication failed:', errorMessage);
        setError(errorMessage);
        setLoading(false);
      } finally {
        setIsAuthenticating(false);
      }
    }

    authenticate();
  }, [setAuth, setLoading]);

  return {
    isAuthenticating,
    error,
  };
}
