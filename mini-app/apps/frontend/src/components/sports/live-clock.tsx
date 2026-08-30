'use client';

import { useEffect, useState } from 'react';
import type { SportEvent } from '@/types/sports';
import { formatEventClock } from '@/lib/sports-clock';
import { cn } from '@/lib/utils';

export function LiveClock({
  event,
  className,
}: {
  event: SportEvent;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!event.isLive || event.clockSeconds == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [event.isLive, event.clockSeconds, event.clockSyncedAt]);

  return (
    <span className={cn('tabular-nums', className)}>
      {event.isLive ? formatEventClock(event, now) : event.liveTime || 'LIVE'}
    </span>
  );
}
