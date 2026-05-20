'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelegramProvider } from './telegram-provider';
import { WebSocketProvider } from './websocket-provider';
import { BalanceSyncProvider } from './balance-sync-provider';
import { BlockedGuard } from './blocked-guard';
import { ToastHost } from '@/components/ui/toast-host';
import { useState } from 'react';

/**
 * Root providers wrapper
 * Combines all context providers for the app
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramProvider>
        <WebSocketProvider>
          <BalanceSyncProvider>
            <BlockedGuard>
              <SplashGate>
                <ToastHost />
                {children}
              </SplashGate>
            </BlockedGuard>
          </BalanceSyncProvider>
        </WebSocketProvider>
      </TelegramProvider>
    </QueryClientProvider>
  );
}

/**
 * SplashGate — overlays the brand splash for the first ~1.5–2.5s of
 * the session. The hidden flag flips when:
 *   - the auth store has either confirmed the user OR returned an
 *     error (so we don't sit on the splash if the bridge is broken)
 *   - and we've been mounted for at least 1.2s
 *
 * The actual splash component adds an extra 2-second post-ready hold
 * inside its own state so the brand moment is always visible long
 * enough to read.
 */
import { SplashScreen } from '@/components/loading/splash-screen';
import { useEffect, useState as useReactState } from 'react';
import { useAuthStore } from '@/store/auth-store';

function SplashGate({ children }: { children: React.ReactNode }) {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useReactState(false);

  useEffect(() => {
    // Either auth completed or we've been waiting > 4s — flip ready.
    if (!isLoading) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(t);
  }, [isLoading, isAuthenticated]);

  return (
    <>
      <SplashScreen ready={ready} />
      {children}
    </>
  );
}
