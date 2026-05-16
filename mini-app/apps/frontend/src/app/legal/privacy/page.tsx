'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray">
            Политика конфиденциальности
          </span>
          <span className="w-10 h-10" />
        </header>

        <section className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-5 font-roobert text-[13px] text-whisper-gray leading-relaxed">
          <p>
            Macvbet обрабатывает только те данные, которые необходимы для
            работы Telegram Mini App: идентификатор Telegram, баланс,
            история ставок и игровые сессии. Мы не передаём данные
            третьим лицам и не используем их для рекламы.
          </p>
          <p className="mt-3">
            Полный текст политики опубликуем после релиза. По вопросам
            обработки данных пишите в поддержку через меню.
          </p>
        </section>
      </div>
    </main>
  );
}
