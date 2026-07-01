'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Shield, CheckCircle2, HelpCircle, Scale } from 'lucide-react';
import { ProvablyFairCalculator } from '@/components/info/provably-fair-calculator';

export default function InfoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'rules' | 'privacy' | 'faq' | 'fairness'>('rules');

  const tabs = [
    { id: 'rules', label: 'Правила', icon: Shield },
    { id: 'privacy', label: 'Политика', icon: CheckCircle2 },
    { id: 'faq', label: 'FAQ', icon: HelpCircle },
    { id: 'fairness', label: 'Честная игра', icon: Scale },
  ] as const;

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white flex flex-col pb-safe">
      <header className="sticky top-0 z-50 bg-midnight-canvas/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} className="text-frost-white/80" />
          </button>
          <h1 className="font-roobert font-bold text-xl tracking-wide uppercase">
            Информация
          </h1>
        </div>
        
        {/* Scrollable tabs */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-pill whitespace-nowrap transition-colors border ${
                activeTab === t.id
                  ? 'bg-macvbet-red/20 border-macvbet-red text-macvbet-red'
                  : 'bg-white/5 border-white/10 text-frost-white/60 hover:text-frost-white/90'
              }`}
            >
              <t.icon size={14} />
              <span className="font-roobert text-sm tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {activeTab === 'rules' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold font-roobert text-macvbet-red">Пользовательское соглашение</h2>
            <div className="text-frost-white/80 space-y-4 text-sm leading-relaxed">
              <p>Добро пожаловать в MACVBET. Пользуясь нашей платформой, вы соглашаетесь со следующими правилами.</p>
              <h3 className="text-lg font-semibold text-frost-white mt-4">1. Возрастные ограничения</h3>
              <p>Пользоваться платформой могут только лица, достигшие 18 лет.</p>
              <h3 className="text-lg font-semibold text-frost-white mt-4">2. Риски</h3>
              <p>Участие в играх несет финансовые риски. Вы играете на свой страх и риск и обязуетесь не использовать средства, потерю которых вы не можете себе позволить.</p>
              <h3 className="text-lg font-semibold text-frost-white mt-4">3. Ответственность</h3>
              <p>Платформа предоставляет развлекательные услуги "как есть". Мы не несем ответственности за технические сбои на стороне пользователя.</p>
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold font-roobert text-macvbet-red">Политика конфиденциальности</h2>
            <div className="text-frost-white/80 space-y-4 text-sm leading-relaxed">
              <p>Мы ценим вашу конфиденциальность и защищаем ваши персональные данные.</p>
              <h3 className="text-lg font-semibold text-frost-white mt-4">1. Сбор данных</h3>
              <p>Мы собираем только ту информацию, которая необходима для работы сервиса: ваш ID Telegram, публичное имя и аватар.</p>
              <h3 className="text-lg font-semibold text-frost-white mt-4">2. Использование данных</h3>
              <p>Ваши данные используются исключительно для аутентификации и отображения в таблицах лидеров.</p>
              <h3 className="text-lg font-semibold text-frost-white mt-4">3. Передача третьим лицам</h3>
              <p>Мы не передаем ваши личные данные третьим лицам, за исключением случаев, предусмотренных законодательством.</p>
            </div>
          </div>
        )}

        {activeTab === 'faq' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold font-roobert text-macvbet-red">Часто задаваемые вопросы (FAQ)</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-semibold text-frost-white">Как пополнить баланс?</h4>
                <p className="text-sm text-frost-white/70 mt-2">Вы можете пополнить баланс в разделе "Кошелёк", используя доступные методы оплаты, включая криптовалюты и банковские карты.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-semibold text-frost-white">Как долго обрабатывается вывод средств?</h4>
                <p className="text-sm text-frost-white/70 mt-2">Выводы в криптовалюте обычно обрабатываются в течение 10-15 минут. Выводы на карты могут занимать от 1 до 24 часов.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-semibold text-frost-white">Что такое Provably Fair?</h4>
                <p className="text-sm text-frost-white/70 mt-2">Это криптографическая система, которая доказывает, что казино не может вмешаться в результат игры. Вы можете проверить любую ставку во вкладке "Честная игра".</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-semibold text-frost-white">Можно ли иметь несколько аккаунтов?</h4>
                <p className="text-sm text-frost-white/70 mt-2">Нет, создание мультиаккаунтов строго запрещено и может привести к блокировке всех связанных учетных записей.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fairness' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold font-roobert text-macvbet-red">Честная игра (Provably Fair)</h2>
            <div className="text-frost-white/80 space-y-4 text-sm leading-relaxed mb-8">
              <p>На нашей платформе используется система <strong>Provably Fair</strong>. Это значит, что результат каждой игры генерируется заранее и мы не можем его изменить после вашей ставки.</p>
              
              <h3 className="text-lg font-semibold text-frost-white mt-4">Как это работает?</h3>
              <ol className="list-decimal pl-4 space-y-2">
                <li>Сервер генерирует случайный <strong>Server Seed</strong>, но показывает вам только его зашифрованный хэш (SHA256).</li>
                <li>Ваше устройство отправляет свой случайный <strong>Client Seed</strong>.</li>
                <li>Оба Seed-а объединяются с номером раунда (<strong>Nonce</strong>) с использованием HMAC-SHA256, чтобы создать финальный результат.</li>
              </ol>
              
              <p>Вы можете проверить любой прошедший раунд с помощью нашего калькулятора ниже, вставив незашифрованный Server Seed, Client Seed и Nonce.</p>
            </div>

            <ProvablyFairCalculator />
          </div>
        )}
      </div>
    </main>
  );
}
