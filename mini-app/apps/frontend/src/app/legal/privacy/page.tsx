'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Shield, Lock, Eye, MessageCircle } from 'lucide-react';

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-[#06080f] via-[#0a0d18] to-[#05060c] text-frost-white">
      <div className="mx-auto w-full max-w-[900px] px-4 pt-6 pb-24 flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:border-white/25 transition"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span className="font-roobert text-[13px] uppercase tracking-[0.32em] text-whisper-gray">
            Политика конфиденциальности
          </span>
          <span className="w-10 h-10" />
        </header>

        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-5 md:px-8 py-8">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              background:
                'radial-gradient(120% 90% at 80% 10%, rgba(77, 136, 255, 0.16), transparent 55%), radial-gradient(90% 120% at 0% 100%, rgba(255, 138, 118, 0.18), transparent 55%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl border border-white/15 bg-white/[0.06] flex items-center justify-center text-ice-blue">
                <Shield size={22} strokeWidth={1.8} />
              </div>
              <div>
                <div className="font-roobert text-[20px] text-frost-white leading-tight">Мы бережно храним ваши данные</div>
                <div className="font-roobert text-[12px] text-whisper-gray">Минимум данных, никаких продаж третьим лицам</div>
              </div>
            </div>
            <div className="flex-1" />
            <div className="relative font-roobert text-[12px] text-whisper-gray bg-white/[0.05] border border-white/10 rounded-pill px-3 py-1 inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Совместимо с Telegram WebApp API
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'Что мы храним',
              icon: <Lock size={16} strokeWidth={1.8} />,
              body:
                'Телеграм ID, имя/юзернейм, язык, премиум-статус, баланс, ставки и игровые сессии. Никаких лишних полей.',
            },
            {
              title: 'Зачем это нужно',
              icon: <Eye size={16} strokeWidth={1.8} />,
              body:
                'Авторизация, расчёт ставок, защита от фрода, аналитика работы игр. Без данных — не будет ни баланса, ни ставок.',
            },
            {
              title: 'С кем делимся',
              icon: <Shield size={16} strokeWidth={1.8} />,
              body:
                'Ни с кем. Данные не продаём, не отдаём рекламным сетям. Передача возможна только по закону или для антифрода.',
            },
          ].map((card) => (
            <section
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-frost-white">
                <span className="w-8 h-8 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-ice-blue">
                  {card.icon}
                </span>
                <span className="font-roobert text-[14px]">{card.title}</span>
              </div>
              <p className="font-roobert text-[12px] text-whisper-gray leading-relaxed">{card.body}</p>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-frost-white">
            <MessageCircle size={16} strokeWidth={1.8} />
            <span className="font-roobert text-[14px]">Полный текст политики</span>
          </div>
          <p className="font-roobert text-[12px] text-whisper-gray leading-relaxed">
            Полный текст политики будет опубликован после релиза. Мы придерживаемся принципов минимизации данных, прозрачности и права на удаление по запросу.
          </p>
          <p className="font-roobert text-[12px] text-whisper-gray leading-relaxed">
            Любые вопросы — пишите в поддержку в Telegram, мы ответим и удалим данные по запросу.
          </p>
        </section>
      </div>
    </main>
  );
}
