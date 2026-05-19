'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelegramProvider } from './telegram-provider';
import { WebSocketProvider } from './websocket-provider';
import { BalanceSyncProvider } from './balance-sync-provider';
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
            <ToastHost />
            {children}
          </BalanceSyncProvider>
        </WebSocketProvider>
      </TelegramProvider>
    </QueryClientProvider>
  );
}
