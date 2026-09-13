'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupportStore } from '@/store/support-store';

export default function SupportPage() {
  const router = useRouter();
  const openSupport = useSupportStore((s) => s.open);

  useEffect(() => {
    openSupport();
    router.replace('/?support=true');
  }, [openSupport, router]);

  return (
    <div className="min-h-screen bg-[#07090E] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-zinc-400 text-xs text-center">
        <div className="w-9 h-9 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin" />
        <span className="font-medium text-zinc-300">Переход в чат поддержки...</span>
        <span className="text-[11px] text-zinc-500">Открываем диалог со специалистом</span>
      </div>
    </div>
  );
}
