'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { checkIsAdmin, useIsAdmin } from '@/lib/admin-probe';
import { Wrench } from 'lucide-react';

interface MaintenanceContextType {
  enabled: boolean;
  message: string | null;
}

const MaintenanceContext = createContext<MaintenanceContextType>({
  enabled: false,
  message: null,
});

export function useMaintenance() {
  return useContext(MaintenanceContext);
}

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isAdmin = useIsAdmin();
  const pathname = usePathname();

  useEffect(() => {
    let active = true;

    const checkMaint = async () => {
      try {
        const res = await fetch('/api/maintenance/status', { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          if (active) {
            setEnabled(Boolean(j.enabled));
            setMessage(j.message ?? null);
          }
        }
      } catch {
        // ignore
      }
    };

    void checkMaint();
    const interval = setInterval(checkMaint, 15_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Rules:
  // 1. If we are in the system console area, never block (so admins can fix things)
  // 2. If the user is an admin, never block
  const isConsolePath = pathname?.startsWith('/system/console');
  // If the user is an admin (isAdmin === true) or loading (null), we do not block.
  // If they are explicitly not an admin (isAdmin === false), we block.
  const shouldBlock = enabled && !isConsolePath && isAdmin === false;

  if (shouldBlock) {
    return (
      <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-black px-6 text-center">
        {/* Monopo Saigon / Cyberpunk aesthetics */}
        <div className="relative flex flex-col items-center max-w-[380px] p-6 rounded-card border border-white/10 bg-white/[0.02]">
          <div className="flex h-16 w-16 items-center justify-center rounded-pill border border-amber-500/20 bg-amber-500/10 text-amber-400 mb-6">
            <Wrench size={28} strokeWidth={1.7} />
          </div>

          <h1 className="font-roobert text-[20px] text-frost-white uppercase tracking-wider font-semibold mb-3">
            Технические работы
          </h1>

          <p className="font-roobert text-[13px] text-whisper-gray leading-relaxed mb-6">
            {message ||
              'В данный момент мы проводим техническое обслуживание платформы для повышения её стабильности и скорости. Скоро всё заработает!'}
          </p>

          <div className="w-full h-1 bg-white/5 rounded overflow-hidden">
            <div className="h-full bg-amber-500 animate-pulse" style={{ width: '45%' }} />
          </div>

          <span className="font-roobert text-[10px] text-whisper-gray/40 uppercase tracking-[0.2em] mt-4">
            MACVBET PLATFORM
          </span>
        </div>
      </div>
    );
  }

  return (
    <MaintenanceContext.Provider value={{ enabled, message }}>
      {children}
    </MaintenanceContext.Provider>
  );
}
