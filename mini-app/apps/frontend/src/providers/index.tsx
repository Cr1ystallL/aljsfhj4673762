'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelegramProvider } from './telegram-provider';
import { WebSocketProvider } from './websocket-provider';
import { BalanceSyncProvider } from './balance-sync-provider';
import { PresenceProvider } from './presence-provider';
import { BlockedGuard } from './blocked-guard';
import { MaintenanceGuard } from './maintenance-guard';
import { ToastHost } from '@/components/ui/toast-host';
import { LocaleSync } from './locale-sync';
import { TournamentRebuyGlobalModal } from '@/components/tournament/tournament-rebuy-global-modal';
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
            <PresenceProvider>
              <BlockedGuard>
                <MaintenanceGuard>
                  <SplashGate>
                    <LocaleSync />
                    <ToastHost />
                    <TournamentRebuyGlobalModal />
                    {children}
                  </SplashGate>
                </MaintenanceGuard>
              </BlockedGuard>
            </PresenceProvider>
          </BalanceSyncProvider>
        </WebSocketProvider>
      </TelegramProvider>
    </QueryClientProvider>
  );
}

/**
 * SplashGate — overlays the brand splash until auth has settled
 * (or 4s, so a broken Telegram bridge cannot pin the overlay).
 * SplashScreen then holds a short brand beat and fades on opacity.
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
