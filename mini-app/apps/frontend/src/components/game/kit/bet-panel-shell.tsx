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
        'rounded-[20px] border border-white/12 bg-[#101216] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
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
