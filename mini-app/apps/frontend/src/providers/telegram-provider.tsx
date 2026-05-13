'use client';

import { useEffect, useState } from 'react';
import { SDKProvider } from '@telegram-apps/sdk-react';

/**
 * Telegram Mini Apps SDK Provider
 * Initializes Telegram WebApp SDK and provides context
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Prevent SSR issues
  if (!isMounted) {
    return <>{children}</>;
  }

  return (
    <SDKProvider acceptCustomStyles>
      <TelegramInitializer>{children}</TelegramInitializer>
    </SDKProvider>
  );
}

/**
 * Initialize Telegram WebApp features
 */
function TelegramInitializer({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      
      // Expand to full height
      tg.expand();
      
      // Enable closing confirmation
      tg.enableClosingConfirmation();
      
      // Set header color
      tg.setHeaderColor('#000000');
      tg.setBackgroundColor('#000000');
      
      setIsReady(true);
    } else {
      // Development mode without Telegram
      if (process.env.NODE_ENV === 'development') {
        console.warn('Telegram WebApp not available - running in development mode');
      }
      setIsReady(true);
    }
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}

// Extend Window interface for Telegram WebApp
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
