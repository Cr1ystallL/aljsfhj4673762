import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/providers';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: 'Casino Mini App',
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
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <AnimatedBackground />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
