'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Shield, CheckCircle2, HelpCircle, Scale, ChevronDown } from 'lucide-react';
import { ProvablyFairCalculator } from '@/components/info/provably-fair-calculator';

function Accordion({ question, answer }: { question: string, answer: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-white/5 rounded-2xl bg-white/[0.02] overflow-hidden transition-all duration-300 hover:bg-white/[0.04]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
      >
        <h4 className="font-semibold text-frost-white text-sm sm:text-base pr-4">{question}</h4>
        <ChevronDown size={18} className={`text-frost-white/50 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-180 text-macvbet-red' : ''}`} />
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out`}
        style={{ maxHeight: isOpen ? '1000px' : '0px', opacity: isOpen ? 1 : 0 }}
      >
        <div className="p-5 pt-0 text-sm text-frost-white/70 leading-relaxed border-t border-white/5 mt-1">
          {answer}
        </div>
      </div>
    </div>
  );
}

export default function InfoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'rules' | 'privacy' | 'faq' | 'fairness'>('rules');

  const tabs = [
    { id: 'rules', label: 'Соглашение', icon: Shield },
    { id: 'privacy', label: 'Политика', icon: CheckCircle2 },
    { id: 'faq', label: 'FAQ', icon: HelpCircle },
    { id: 'fairness', label: 'Честная игра', icon: Scale },
  ] as const;

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white flex flex-col pb-safe selection:bg-macvbet-red/30">
      <header className="sticky top-0 z-50 bg-midnight-canvas/90 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex flex-col gap-4 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 transition-all active:scale-95 text-frost-white/80 hover:text-white"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="font-roobert font-bold text-xl tracking-wide uppercase bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Информация
          </h1>
        </div>
        
        {/* Scrollable tabs */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1 mask-linear-fade">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl whitespace-nowrap transition-all duration-300 border ${
                activeTab === t.id
                  ? 'bg-macvbet-red/10 border-macvbet-red/30 text-macvbet-red shadow-[0_0_15px_rgba(255,42,76,0.15)]'
                  : 'bg-white/5 border-transparent text-frost-white/60 hover:bg-white/10 hover:text-frost-white/90'
              }`}
            >
              <t.icon size={16} className={activeTab === t.id ? 'drop-shadow-glow' : ''} />
              <span className="font-roobert text-sm font-medium tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-32">
        <div className="max-w-2xl mx-auto">
          
          {/* TAB: RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-3 mb-8">
                <div className="w-16 h-16 rounded-full bg-macvbet-red/10 flex items-center justify-center mx-auto mb-4 border border-macvbet-red/20">
                  <Shield size={32} className="text-macvbet-red" />
                </div>
                <h2 className="text-2xl font-bold font-roobert text-white tracking-wide">ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ И ПРАВИЛА ИГРОВОЙ ПЛАТФОРМЫ MACVBET</h2>
                <p className="text-xs text-frost-white/40 uppercase tracking-widest font-mono">MacvBet | Редакция от 1 Июня 2026</p>
              </div>

              <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90 text-sm flex gap-3 items-start">
                <span className="text-xl">⚠️</span>
                <p>Регистрация, запуск бота и участие в играх в интерфейсе Telegram Web App означают автоматическое и безоговорочное согласие Пользователя со всеми пунктами данного Соглашения. Если вы не согласны с условиями — немедленно прекратите использование Платформы.</p>
              </div>

              <div className="text-frost-white/80 space-y-6 text-sm leading-relaxed">
                <section className="space-y-3">
                  <h3 className="text-lg font-bold text-macvbet-red font-roobert uppercase tracking-wide">1. Специфика использования Telegram Web App (TWA)</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-white">1.1. Жёсткая привязка к Telegram ID</h4>
                      <p>Учётная запись Пользователя на Платформе неразрывно связана с его уникальным цифровым идентификатором Telegram ID. Любые действия, совершённые через данный аккаунт Telegram, признаются действиями самого Пользователя. Перепривязка игрового профиля на другой Telegram ID не допускается ни при каких обстоятельствах.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">1.2. Противодействие Telegram-фермам</h4>
                      <p>Категорически запрещено использование аккаунтов Telegram, зарегистрированных на виртуальные, временные или арендованные номера телефонов, а также оформленных на подставных лиц (дропов). При обнаружении признаков массовой регистрации или управления сетью аккаунтов вся сеть блокируется навсегда без права вывода средств.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">1.3. Ответственность за безопасность профиля</h4>
                      <p>Компания не несёт ответственности за сохранность личного Telegram-аккаунта Пользователя. В случае угона, утери, удаления или блокировки аккаунта мессенджером Telegram доступ к игровому балансу теряется безвозвратно.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">1.4. Запрет на парсинг и эмуляцию</h4>
                      <p>Взаимодействие с Платформой разрешено исключительно через официальный интерфейс Telegram Web App. Использование сторонних клиентов, эмуляторов, скриптов автоматизации, а также прямых API-запросов признаётся несанкционированным доступом. Аккаунт нарушителя ликвидируется мгновенно.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-bold text-macvbet-red font-roobert uppercase tracking-wide">2. Мультиаккаунтинг, верификация (KYC) и борьба с ИИ</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-white">2.1. Правило одного аккаунта</h4>
                      <p>Одно физическое лицо имеет право владеть только одним игровым счётом. Данное правило распространяется на один IP-адрес/подсеть, одно физическое устройство и одну платёжную карту/кошелёк.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">2.2. Процедура верификации (KYC)</h4>
                      <p>Компания имеет право в любой момент заморозить вывод средств и потребовать от Пользователя подтверждения личности (фото документов, селфи, видеоинтервью). До успешного завершения верификации все финансовые операции приостанавливаются.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">2.3. Запрет на автоматизацию и ИИ</h4>
                      <p>Запрещено использование любых подсказчиков, ботов, ИИ-алгоритмов или кликеров. Компания использует внутренние поведенческие маркеры. Любая аномальная сессионная активность ведёт к блокировке.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">2.4. Возраст Пользователя</h4>
                      <p>Платформа предназначена исключительно для лиц, достигших 18 лет. При обнаружении нарушения аккаунт блокируется, средства замораживаются.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-bold text-macvbet-red font-roobert uppercase tracking-wide">3. Бонусная политика и технические сбои</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-white">3.1. Злоупотребление бонусами</h4>
                      <p>Запрещены любые стратегии отыгрыша бонусных средств с минимальным риском. Все выигрыши, полученные с использованием уязвимостей бонусной механики, признаются недействительными.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">3.2. Технические сбои («Palpable Errors»)</h4>
                      <p>В случае программных ошибок, сбоёв ГСЧ, задержек передачи данных или трансляции неверных коэффициентов все затронутые ставки аннулируются с возвратом суммы исходной ставки.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">3.3. Ограничения выплат</h4>
                      <p>Компания устанавливает максимальные лимиты единовременного вывода. При выигрышах, превышающих стандартные лимиты, проводится дополнительная проверка.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-bold text-macvbet-red font-roobert uppercase tracking-wide">4. Финансовые правила</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-white">4.1. Принципиальный отказ от чарджбэков</h4>
                      <p>В случае инициации возврата платежей (Chargeback) Платформа немедленно блокирует аккаунт, аннулирует баланс и вправе передать данные в антифрод-системы.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">4.2. Запрет платёжных средств третьих лиц</h4>
                      <p>Использование карт и кошельков, принадлежащих третьим лицам, категорически запрещено.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-bold text-macvbet-red font-roobert uppercase tracking-wide">5. Абсолютное дискреционное право</h3>
                  <p>Компания оставляет за собой право изменять правила без уведомления, а также закрыть учётную запись любого Пользователя по собственному усмотрению (с возвратом остатка реального депозита, если нет нарушений).</p>
                </section>
                
                <section className="space-y-3">
                  <h3 className="text-lg font-bold text-macvbet-red font-roobert uppercase tracking-wide">6. Интеллектуальная собственность</h3>
                  <p>Все объекты интеллектуальной собственности Платформы — торговая марка MacvBet, программный код, дизайн, контент и игровые механики — являются собственностью Компании. Использование без разрешения запрещено.</p>
                </section>

              </div>
            </div>
          )}

          {/* TAB: PRIVACY */}
          {activeTab === 'privacy' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-3 mb-8">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                  <CheckCircle2 size={32} className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold font-roobert text-white tracking-wide">Политика Конфиденциальности</h2>
              </div>

              <div className="text-frost-white/80 space-y-6 text-sm leading-relaxed bg-white/[0.02] p-6 rounded-3xl border border-white/5">
                <p>Мы в MACVBET серьезно относимся к защите ваших персональных данных. Данная политика описывает, как мы собираем, используем и защищаем вашу информацию в рамках Telegram Web App.</p>
                
                <h3 className="text-lg font-semibold text-white mt-6 mb-3">1. Какую информацию мы собираем?</h3>
                <ul className="list-disc pl-5 space-y-2 text-frost-white/70">
                  <li><strong>Данные профиля Telegram:</strong> Ваш уникальный Telegram ID, публичное имя (First Name / Last Name), username и URL аватара. Эти данные передаются нам самим мессенджером при запуске бота.</li>
                  <li><strong>Финансовая информация:</strong> История транзакций, депозитов, выводов и игровых ставок, совершенных на платформе. Реквизиты банковских карт мы не храним — все платежи обрабатываются через защищенные шлюзы партнеров.</li>
                  <li><strong>Технические данные:</strong> IP-адреса, метаданные устройства, User-Agent и история сессий в целях предотвращения мошенничества и мультиаккаунтинга.</li>
                </ul>

                <h3 className="text-lg font-semibold text-white mt-6 mb-3">2. Как мы используем ваши данные?</h3>
                <ul className="list-disc pl-5 space-y-2 text-frost-white/70">
                  <li>Для создания и управления вашей игровой учетной записью.</li>
                  <li>Для проведения платежей и вывода выигрышей.</li>
                  <li>Для обеспечения безопасности платформы: выявления ботов, ферм и нарушений пользовательского соглашения.</li>
                  <li>Для составления публичных таблиц лидеров (в публичном доступе может отображаться ваше имя Telegram и часть баланса/выигрыша).</li>
                </ul>

                <h3 className="text-lg font-semibold text-white mt-6 mb-3">3. Передача данных третьим лицам</h3>
                <p>Мы не продаем и не передаем ваши данные третьим лицам в маркетинговых целях. Данные могут быть раскрыты только по официальному запросу правоохранительных органов или переданы провайдерам антифрод-защиты для проверки платежей.</p>

                <h3 className="text-lg font-semibold text-white mt-6 mb-3">4. Хранение и безопасность</h3>
                <p>Все данные передаются по защищенному протоколу TLS и хранятся в зашифрованных базах данных с ограниченным доступом сотрудников. В случае прекращения использования сервиса, мы храним финансовую историю в течение 5 лет в соответствии с правилами AML (противодействие отмыванию денег).</p>
              </div>
            </div>
          )}

          {/* TAB: FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-3 mb-8">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                  <HelpCircle size={32} className="text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold font-roobert text-white tracking-wide">База Знаний & FAQ</h2>
                <p className="text-sm text-frost-white/50">Ответы на все ваши вопросы об играх и платформе.</p>
              </div>

              <div className="space-y-3">
                <h3 className="font-roobert font-bold text-macvbet-red uppercase tracking-wider text-sm mt-8 mb-4 px-2">Общие вопросы и Аккаунт</h3>
                <Accordion 
                  question="Как пополнить баланс и как долго идет вывод?" 
                  answer="Вы можете пополнить баланс в разделе &quot;Кошелёк&quot;. Мы поддерживаем криптовалюты и банковские карты. Пополнение криптой происходит после 1-го подтверждения сети. Выводы в криптовалюте автоматизированы и занимают 5-15 минут. Выводы на банковские карты могут занимать от нескольких часов до 1 суток." 
                />
                <Accordion 
                  question="Разрешено ли создавать несколько аккаунтов (мультиаккаунты)?" 
                  answer="Категорически нет. Это прямое нарушение Пользовательского соглашения. Наша антифрод-система анализирует IP-адреса, отпечатки устройств и поведенческие факторы. При обнаружении фермы или мультиаккаунта все средства конфискуются, а профили блокируются." 
                />
                <Accordion 
                  question="Можно ли удалить аккаунт?" 
                  answer="Да, вы можете отправить запрос в службу поддержки. Однако по правилам AML мы обязаны хранить историю финансовых транзакций в течение 5 лет." 
                />
                <Accordion 
                  question="Могу ли я передать аккаунт другу?" 
                  answer="Нет. Передача аккаунта третьим лицам строго запрещена и приравнивается к мошенничеству." 
                />
                <Accordion 
                  question="Что делать, если я забыл пароль?" 
                  answer="Ваш аккаунт жестко привязан к вашему Telegram ID. У нас нет паролей. Пока у вас есть доступ к вашему Telegram, у вас есть доступ к профилю." 
                />
                <Accordion 
                  question="Есть ли у вас мобильное приложение?" 
                  answer="MacvBet работает как Telegram Web App, что позволяет вам играть прямо из мессенджера на любом устройстве без необходимости скачивать отдельные приложения." 
                />
                <Accordion 
                  question="Как связаться со службой поддержки?" 
                  answer="Вы можете обратиться в саппорт через главное меню бота, выбрав раздел &quot;Поддержка&quot;. Мы работаем 24/7." 
                />
                <Accordion 
                  question="Нужно ли проходить верификацию (KYC)?" 
                  answer="Мы можем запросить KYC (фото документа, селфи) в любой момент при подозрительной активности или при выводе крупных сумм." 
                />
                <Accordion 
                  question="Можно ли поменять валюту счета?" 
                  answer="На данный момент валюта счета устанавливается при регистрации автоматически. Основная валюта платформы - PLN/RUB/USD в зависимости от региона." 
                />
                <Accordion 
                  question="Защищены ли мои персональные данные?" 
                  answer="Да, все данные передаются по защищенному протоколу TLS и хранятся в зашифрованных базах данных с ограниченным доступом." 
                />
                <h3 className="font-roobert font-bold text-macvbet-red uppercase tracking-wider text-sm mt-8 mb-4 px-2">Финансы: Пополнение и Вывод</h3>
                <Accordion 
                  question="Взимается ли комиссия за вывод средств?" 
                  answer="Платформа не берет свою комиссию, однако комиссия сети блокчейна или банка-эмитента вычитается из суммы вывода." 
                />
                <Accordion 
                  question="Какая минимальная сумма депозита?" 
                  answer="Минимальная сумма депозита зависит от выбранного метода оплаты. Для криптовалют это обычно эквивалент $1-5." 
                />
                <Accordion 
                  question="Какая минимальная сумма на вывод?" 
                  answer="Минимальный вывод также зависит от метода. Актуальные лимиты всегда отображаются в разделе кассы перед созданием заявки." 
                />
                <Accordion 
                  question="Можно ли вывести средства на чужую карту?" 
                  answer="Категорически запрещено. Использование платёжных средств, принадлежащих третьим лицам, ведёт к блокировке." 
                />
                <Accordion 
                  question="Что такое Чарджбэк (Chargeback)?" 
                  answer="Это отзыв платежа через банк. В случае инициации чарджбэка аккаунт немедленно блокируется." 
                />
                <Accordion 
                  question="Мой депозит не пришел, что делать?" 
                  answer="Подождите 15-30 минут. Для крипты проверьте количество подтверждений сети. Если деньги не поступили, обратитесь в поддержку, предоставив TXID или чек." 
                />
                <Accordion 
                  question="Почему мой вывод отменен?" 
                  answer="Возможно, вы не отыграли обязательный вейджер на депозит, или служба безопасности запросила верификацию. Проверьте уведомления от бота." 
                />
                <Accordion 
                  question="Можно ли отменить заявку на вывод?" 
                  answer="Пока заявка находится в статусе &quot;В обработке&quot;, вы можете отменить её через личный кабинет." 
                />
                <Accordion 
                  question="Сколько подтверждений сети нужно для крипты?" 
                  answer="Обычно достаточно 1 подтверждения для большинства сетей (TRC20, BEP20, Polygon)." 
                />
                <Accordion 
                  question="Нужно ли отыгрывать депозит перед выводом?" 
                  answer="Да, в целях противодействия отмыванию денег (AML) любой депозит должен быть проставлен с вейджером x1 перед выводом." 
                />
                <h3 className="font-roobert font-bold text-macvbet-red uppercase tracking-wider text-sm mt-8 mb-4 px-2">Бонусы и Промоакции</h3>
                <Accordion 
                  question="Как работают бонусы?" 
                  answer="Бонусы зачисляются на бонусный счет и имеют требование по отыгрышу (вейджеру). Пока вейджер не выполнен, вывод бонусных средств невозможен." 
                />
                <Accordion 
                  question="Что такое вейджер (Wager)?" 
                  answer="Вейджер — это сумма ставок, которую необходимо сделать, чтобы бонусные деньги перешли на реальный баланс (например, x30 от суммы бонуса)." 
                />
                <Accordion 
                  question="Где найти промокоды?" 
                  answer="Мы регулярно публикуем промокоды в нашем официальном Telegram-канале." 
                />
                <Accordion 
                  question="Как активировать промокод?" 
                  answer="Перейдите в раздел &quot;Бонусы&quot; или &quot;Профиль&quot; и введите код в соответствующее поле." 
                />
                <Accordion 
                  question="Можно ли вывести бездепозитный бонус?" 
                  answer="Только после выполнения условий отыгрыша (вейджера) и, в некоторых случаях, минимального депозита для привязки платежного метода." 
                />
                <Accordion 
                  question="Есть ли кэшбэк (Cashback)?" 
                  answer="Да, кэшбэк начисляется еженедельно или ежедневно в зависимости от вашего VIP-уровня." 
                />
                <Accordion 
                  question="Могу ли я отменить бонус?" 
                  answer="Вы можете отменить активный бонус, но при этом сгорят все бонусные средства и выигрыши с них." 
                />
                <Accordion 
                  question="Что такое рейкбек (Rakeback)?" 
                  answer="Это возврат части преимущества казино с каждой вашей ставки, независимо от того, выиграла она или проиграла." 
                />
                <Accordion 
                  question="Учитываются ли все игры в отыгрыше бонуса?" 
                  answer="Нет, некоторые игры (например, рулетка или карточные игры) могут давать меньший процент в зачет вейджера по сравнению со слотами." 
                />
                <Accordion 
                  question="Можно ли злоупотреблять бонусами?" 
                  answer="Любые стратегии игры с минимальным риском на бонусные деньги признаются абузом. Выигрыши будут аннулированы." 
                />
                <h3 className="font-roobert font-bold text-macvbet-red uppercase tracking-wider text-sm mt-8 mb-4 px-2">Безопасность и Честность (Provably Fair)</h3>
                <Accordion 
                  question="Что такое Provably Fair (Доказуемая Честность)?" 
                  answer="Это криптографическая система (HMAC-SHA256), гарантирующая честность каждого раунда. Исход формируется до вашей ставки и объединяет Server Seed и Client Seed." 
                />
                <Accordion 
                  question="Как проверить раунд?" 
                  answer="Скопируйте Server Seed, Client Seed и Nonce из инспектора ставок и вставьте их в наш Калькулятор Честности на странице Инфо." 
                />
                <Accordion 
                  question="Может ли казино изменить результат игры?" 
                  answer="Исключено. Мы отдаем вам зашифрованный хэш (Server Seed Hash) до начала раунда. Поменять результат незаметно математически невозможно." 
                />
                <Accordion 
                  question="Что такое Server Seed?" 
                  answer="Это секретная строка, генерируемая сервером для каждого пула раундов. Она скрыта до окончания игры." 
                />
                <Accordion 
                  question="Что такое Client Seed?" 
                  answer="Это ваша публичная строка. Вы можете изменить её в любой момент, чтобы влиять на генерацию случайных чисел." 
                />
                <Accordion 
                  question="Что такое Nonce?" 
                  answer="Это номер раунда, который увеличивается на 1 с каждой вашей ставкой, гарантируя уникальность каждого исхода." 
                />
                <Accordion 
                  question="Используется ли Provably Fair во всех играх?" 
                  answer="Да, все наши фирменные (In-House) игры (MacvJet, Mines, Plinko и др.) работают на алгоритме Provably Fair." 
                />
                <Accordion 
                  question="Как работает ГСЧ (Генератор Случайных Чисел)?" 
                  answer="ГСЧ берет хэш от Seed-ов и конвертирует первые байты в число от 0 до 1, которое затем масштабируется под правила конкретной игры." 
                />
                <Accordion 
                  question="Что делать, если я нашел ошибку/баг?" 
                  answer="Сообщите в поддержку. У нас действует программа Bug Bounty — за критические уязвимости мы выплачиваем вознаграждение." 
                />
                <Accordion 
                  question="Могут ли другие игроки повлиять на мой результат?" 
                  answer="Нет, в одиночных играх (Mines, Plinko) ваш Client Seed влияет только на вас. В многопользовательских (MacvJet) Client Seed формируется из хэша первого сделавшего ставку игрока." 
                />
                <h3 className="font-roobert font-bold text-macvbet-red uppercase tracking-wider text-sm mt-8 mb-4 px-2">Правила Игр (In-House)</h3>
                <Accordion 
                  question="🚀 Как играть в MacvJet (Crash)?" 
                  answer="MacvJet — наша фирменная краш-игра. Ракета взлетает, и множитель начинает расти от 1.00x. Ваша задача — нажать кнопку &quot;Забрать&quot;, прежде чем ракета улетит. Если вы успеете, ставка умножится на коэффициент. Если нет — сгорает." 
                />
                <Accordion 
                  question="🚀 Есть ли авто-кэшаут в MacvJet?" 
                  answer="Да, вы можете заранее установить желаемый множитель в поле Auto Cashout. Если ракета достигнет этого значения, выигрыш заберется автоматически." 
                />
                <Accordion 
                  question="💣 В чем суть игры Mines?" 
                  answer="Перед вами поле 5x5. Под некоторыми ячейками спрятаны мины (от 1 до 24). Открывая алмазы, ваш множитель растет. Вы можете забрать выигрыш в любой момент. Если попадаете на мину — раунд окончен, ставка проиграна." 
                />
                <Accordion 
                  question="💣 Что будет, если я открою все алмазы в Mines?" 
                  answer="Вы получите максимальный джекпот для данного количества мин и раунд автоматически завершится победой." 
                />
                <Accordion 
                  question="🔺 Как работает Plinko?" 
                  answer="Вы запускаете шарик сверху пирамиды. Он падает сквозь колышки, отскакивая влево/вправо (50/50). Внизу ячейки с множителями (по краям — высокие, в центре — низкие). Вы можете менять уровень риска и количество рядов." 
                />
                <Accordion 
                  question="🔺 Что означает уровень риска в Plinko?" 
                  answer="Низкий риск дает частые мелкие выигрыши (редко < 0.5x, но макс. ~10x). Высокий риск дает много проигрышей (0.2x), но по краям стоят огромные множители (вплоть до 1000x)." 
                />
                <Accordion 
                  question="🪙 Правила игры Coinflip?" 
                  answer="Классический бросок монеты. Вы выбираете Орла (Heads) или Решку (Tails). Шанс выигрыша 50%. В случае победы ставка удваивается (с учетом минимальной комиссии платформы 1-4%)." 
                />
                <Accordion 
                  question="🎡 Что такое Wheel (Колесо)?" 
                  answer="Колесо фортуны, разделенное на цветные сектора с разными множителями. Вы выбираете уровень риска. Чем выше риск, тем выше потенциальные множители, но меньше шансов на их выпадение." 
                />
                <Accordion 
                  question="🌉 Как проходить Bridges?" 
                  answer="Вы должны перебраться на другую сторону моста. На каждом шаге вам предлагается несколько блоков. Часть из них безопасна, часть — рушится. Чем дальше пройдете, тем выше награда." 
                />
                <Accordion 
                  question="🃏 Как играть в Hi Lo?" 
                  answer="В Hi Lo вам предстоит угадать, будет ли следующая карта старше (Hi) или младше (Lo) текущей. Чем меньше вероятность события, тем выше множитель выигрыша. Вы можете забрать выигрыш после любого успешного шага!" 
                />
                <h3 className="font-roobert font-bold text-macvbet-red uppercase tracking-wider text-sm mt-8 mb-4 px-2">Технические Вопросы</h3>
                <Accordion 
                  question="Почему игра тормозит?" 
                  answer="Убедитесь, что у вас стабильное интернет-соединение. Если проблема сохраняется, попробуйте очистить кэш Telegram или перезапустить приложение." 
                />
                <Accordion 
                  question="Что произойдет, если оборвется связь во время ставки?" 
                  answer="В одиночных играх (Mines, Plinko) результат генерируется сразу, деньги зачисляются на баланс автоматически при выигрыше. В MacvJet, если вы не успели нажать &quot;Кэшаут&quot; до обрыва связи и не настроили авто-вывод, ставка проиграет, если ракета взорвется до вашего переподключения." 
                />
                <Accordion 
                  question="Бот не открывает приложение (Web App), что делать?" 
                  answer="Убедитесь, что вы используете последнюю версию Telegram. Также попробуйте зайти с другого устройства (ПК/телефон)." 
                />
                <Accordion 
                  question="Куда пропадают деньги с баланса?" 
                  answer="Вся история ваших транзакций и ставок доступна в профиле. Если вы считаете, что произошла ошибка, напишите в службу поддержки с указанием примерного времени." 
                />
                <Accordion 
                  question="Как обновить приложение до последней версии?" 
                  answer="Telegram Web App обновляется автоматически. Достаточно закрыть его свайпом вниз и открыть заново из меню бота." 
                />
              </div>
            </div>
          )}

          {/* TAB: FAIRNESS */}
          {activeTab === 'fairness' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-3 mb-8">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                  <Scale size={32} className="text-green-400" />
                </div>
                <h2 className="text-2xl font-bold font-roobert text-white tracking-wide">Provably Fair</h2>
                <p className="text-sm text-frost-white/50 max-w-md mx-auto">Абсолютная прозрачность. Вы можете лично верифицировать исход каждого сыгранного раунда.</p>
              </div>

              <div className="text-frost-white/80 space-y-4 text-sm leading-relaxed bg-white/[0.02] p-6 rounded-3xl border border-white/5 shadow-inner">
                <p>Наша система <strong>Provably Fair (Доказуемая Честность)</strong> построена на криптографическом алгоритме HMAC-SHA256.</p>
                
                <h3 className="text-base font-semibold text-white mt-4 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-xs">1</span>
                  Генерация
                </h3>
                <p className="pl-8 text-frost-white/60">Сервер генерирует случайный <strong>Server Seed</strong> и сразу выдает вам его зашифрованный хэш. Таким образом, мы обязуемся не менять результат, а вы не знаете его до окончания игры.</p>

                <h3 className="text-base font-semibold text-white mt-4 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-xs">2</span>
                  Участие клиента
                </h3>
                <p className="pl-8 text-frost-white/60">Ваш браузер или вы сами задаете <strong>Client Seed</strong>. Это гарантирует, что мы не можем подстроить Server Seed под ваш стиль игры.</p>

                <h3 className="text-base font-semibold text-white mt-4 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-xs">3</span>
                  Результат
                </h3>
                <p className="pl-8 text-frost-white/60">Seeds и номер раунда (Nonce) объединяются. Полученный хэш конвертируется в число, определяющее множитель или выпавший сектор.</p>
              </div>

              <ProvablyFairCalculator />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
