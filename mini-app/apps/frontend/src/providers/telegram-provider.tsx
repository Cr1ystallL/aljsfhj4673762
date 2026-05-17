'use client';

import { useEffect, useState } from 'react';
import { SDKProvider } from '@telegram-apps/sdk-react';
import { useTelegramAuth } from '@/hooks/use-telegram-auth';

/**
 * Telegram Mini Apps SDK Provider
 *
 * Initialises the Telegram WebApp SDK and propagates auth state through
 * `useTelegramAuth`. We deliberately render children immediately on the
 * server pass and rely on the SDK to attach on the client — the previous
 * implementation gated the entire tree on a "mounted" flag which caused
 * a visible flash of "Loading..." even on a warm cache.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  return (
    <SDKProvider acceptCustomStyles>
      <TelegramInitializer>{children}</TelegramInitializer>
    </SDKProvider>
  );
}

function TelegramInitializer({ children }: { children: React.ReactNode }) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const { isAuthenticating, error: authError } = useTelegramAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.expand();
        tg.enableClosingConfirmation();
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
        tg.ready?.();
      } catch {
        // SDK methods occasionally throw on older clients — swallow
        // because failure to enable closing confirmation should not
        // gate the UI.
      }
    } else if (process.env.NODE_ENV === 'development') {
      // Dev outside Telegram — keep going.
      console.warn(
        'Telegram WebApp not available — running without the SDK'
      );
    }
    setBootstrapped(true);
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2">
        <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        {authError && (
          <div className="text-red-500 text-xs">{authError}</div>
        )}
        {isAuthenticating && (
          <div className="text-whisper-gray text-xs">Authenticating…</div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: Record<string, any>;
        version: string;
        platform: string;
        colorScheme: 'light' | 'dark';
        themeParams: Record<string, string>;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        isClosingConfirmationEnabled: boolean;
        BackButton: any;
        MainButton: any;
        HapticFeedback: any;
        expand: () => void;
        close: () => void;
        ready: () => void;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        onEvent: (eventType: string, callback: () => void) => void;
        offEvent: (eventType: string, callback: () => void) => void;
      };
    };
  }
}
