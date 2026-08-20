import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers } from '@/providers';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { AppShell } from '@/components/layout/app-shell';
import { DynamicTitle } from '@/components/loading/dynamic-title';

export const metadata: Metadata = {
  title: 'MacvBet',
  description: 'Premium Telegram Casino Mini App',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Telegram WebApp SDK - REQUIRED for Mini Apps */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <DynamicTitle />
          <AnimatedBackground />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
