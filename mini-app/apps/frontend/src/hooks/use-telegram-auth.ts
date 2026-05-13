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
        setLoading(false);
        return;
      }

      const tg = window.Telegram.WebApp;
      const initData = tg.initData;

      if (!initData) {
        setLoading(false);
        setError('No Telegram initData available');
        return;
      }

      setIsAuthenticating(true);
      setError(null);

      try {
        // Send initData to backend for validation
        const response = await authenticateWithTelegram(initData);

        // Store user data and sessionId in Zustand (token is in httpOnly cookie)
        setAuth(
          {
            id: response.user.id,
            telegramId: Number(response.user.telegramId),
            username: response.user.username,
            firstName: response.user.firstName,
            lastName: response.user.lastName,
            isPremium: response.user.isPremium,
            languageCode: undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          '', // Token is in httpOnly cookie, not stored in state
          response.sessionId // SessionId for WebSocket authentication
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
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
