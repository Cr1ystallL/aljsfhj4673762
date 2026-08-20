import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BetPanelShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-white/10 bg-white/[0.04] overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

export function BetPanelCtaRow({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-3 pt-1 border-t border-white/10">{children}</div>;
}
