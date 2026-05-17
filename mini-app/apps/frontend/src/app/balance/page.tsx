'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  CreditCard,
  Bitcoin,
  Wallet as WalletIcon,
  Building2,
  Smartphone,
  Banknote,
  Copy,
  Check,
  Clock,
  X,
} from 'lucide-react';
import { useBalanceStore } from '@/store/balance-store';
import { BrandLockup } from '@/components/ui/brand-mark';

/**
 * Balance Management — Monopo Saigon Style
 *
 * Deposit tab: Bank (MacvPay) and Revolut (MacvPay) are live.
 * Other methods show a "Скоро" placeholder.
 *
 * Deposit flow:
 *   1. User picks amount.
 *   2. POST /api/macvpay/deposit → backend creates MacvPay order.
 *   3. We show the unique amount + bank account to transfer to.
 *   4. User transfers; MacvPay webhook credits the balance.
 *   5. User can cancel the order (closes the payment window).
 */

type Tab = 'deposit' | 'withdraw';

interface PaymentMethod {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  live?: boolean;
  macvpayType?: 'bank' | 'revolut';
}

const depositMethods: PaymentMethod[] = [
  {
    id: 'bank',
    label: 'Банковский перевод',
    hint: 'Польский банк · MacvPay',
    icon: <Building2 size={20} strokeWidth={1.6} />,
    live: true,
    macvpayType: 'bank',
  },
  {
    id: 'revolut',
    label: 'Revolut',
    hint: 'По номеру телефона · MacvPay',
    icon: <Smartphone size={20} strokeWidth={1.6} />,
    live: true,
    macvpayType: 'revolut',
  },
  {
    id: 'crypto',
    label: 'Криптовалюта',
    hint: 'USDT · BTC · ETH · TRX',
    icon: <Bitcoin size={20} strokeWidth={1.6} />,
  },
  {
    id: 'card',
    label: 'Банковская карта',
    hint: 'Visa · Mastercard · МИР',
    icon: <CreditCard size={20} strokeWidth={1.6} />,
  },
  {
    id: 'wallet',
    label: 'Электронный кошелёк',
    hint: 'YooMoney · Qiwi',
    icon: <WalletIcon size={20} strokeWidth={1.6} />,
  },
  {
    id: 'cash',
    label: 'Наличные',
    hint: 'Через терминалы партнёров',
    icon: <Banknote size={20} strokeWidth={1.6} />,
  },
];

const withdrawMethods: PaymentMethod[] = [
  {
    id: 'card',
    label: 'Банковская карта',
    hint: 'На карту получателя',
    icon: <CreditCard size={20} strokeWidth={1.6} />,
  },
  {
    id: 'crypto',
    label: 'Криптовалюта',
    hint: 'USDT TRC20 · BTC · ETH',
    icon: <Bitcoin size={20} strokeWidth={1.6} />,
  },
  {
    id: 'sbp',
    label: 'СБП',
    hint: 'По номеру телефона',
    icon: <Smartphone size={20} strokeWidth={1.6} />,
  },
  {
    id: 'wallet',
    label: 'Электронный кошелёк',
    hint: 'YooMoney · Qiwi',
    icon: <WalletIcon size={20} strokeWidth={1.6} />,
  },
];

interface MacvPayOrder {
  orderId: string;
  uniqueAmount: number;
  currency: string;
  type: 'bank' | 'revolut';
  card: string;
  recipient: string;
  details: string;
  expiresInMinutes: number;
}

export default function BalancePage() {
  const router = useRouter();
  const balance = useBalanceStore((s) => s.balance);
  const amount = balance?.amount ?? 0;
  const [tab, setTab] = useState<Tab>('deposit');

  // MacvPay deposit flow state
  const [depositAmount, setDepositAmount] = useState<string>('100');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [order, setOrder] = useState<MacvPayOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const methods = tab === 'deposit' ? depositMethods : withdrawMethods;

  const startDeposit = async (method: PaymentMethod) => {
    if (!method.live || !method.macvpayType) return;
    const num = parseFloat(depositAmount);
    if (!Number.isFinite(num) || num < 10) {
      setError('Минимальная сумма 10 PLN');
      return;
    }
    setError(null);
    setLoading(true);
    setSelectedMethod(method);
    try {
      const res = await fetch('/api/macvpay/deposit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, type: method.macvpayType }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? 'Ошибка создания заявки');
        setSelectedMethod(null);
      } else {
        setOrder(j as MacvPayOrder);
      }
    } catch {
      setError('Сетевая ошибка. Попробуйте позже.');
      setSelectedMethod(null);
    } finally {
      setLoading(false);
    }
  };

  const cancelDeposit = async () => {
    if (!order) return;
    try {
      await fetch('/api/macvpay/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.orderId }),
      });
    } catch {
      // best-effort
    }
    setOrder(null);
    setSelectedMethod(null);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray">
            Кошелёк
          </span>
          <span className="w-10 h-10" />
        </header>

        {/* Balance plate */}
        <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              background:
                'radial-gradient(120% 110% at 80% 110%, rgba(160, 224, 171, 0.20) 0%, rgba(255, 172, 46, 0.12) 45%, transparent 80%)',
            }}
          />
          <div className="relative px-5 py-6 flex flex-col gap-1.5">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Текущий баланс
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-roobert text-[44px] font-light leading-none tabular-nums text-frost-white">
                {amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
              </span>
              <span className="font-roobert text-[18px] text-whisper-gray">zł</span>
            </div>
          </div>
        </section>

        {/* MacvPay order — payment instructions */}
        <AnimatePresence>
          {order && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="relative overflow-hidden rounded-card border border-white/15 bg-white/[0.04]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(160,224,171,0.08), rgba(255,172,46,0.06))',
              }}
            >
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
                    Реквизиты для оплаты
                  </span>
                  <button
                    onClick={cancelDeposit}
                    className="w-7 h-7 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white"
                  >
                    <X size={12} strokeWidth={1.8} />
                  </button>
                </div>

                {/* Unique amount — most important */}
                <div className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-3">
                  <div className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray mb-1">
                    Переведите ТОЧНО эту сумму
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-roobert text-[28px] font-light tabular-nums text-frost-white">
                      {order.uniqueAmount.toFixed(2)}{' '}
                      <span className="text-[18px] text-whisper-gray">
                        {order.currency}
                      </span>
                    </span>
                    <button
                      onClick={() =>
                        copyText(order.uniqueAmount.toFixed(2), 'amount')
                      }
                      className="w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80"
                    >
                      {copied === 'amount' ? (
                        <Check size={13} strokeWidth={2} />
                      ) : (
                        <Copy size={13} strokeWidth={1.7} />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 font-roobert text-[11px] text-[#ff8a76]/90">
                    Сумма уникальна — другая сумма не будет зачтена
                  </p>
                </div>

                {/* Account / phone */}
                <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 flex flex-col gap-2">
                  <Row
                    label={order.type === 'bank' ? 'Номер счёта' : 'Телефон'}
                    value={order.card}
                    onCopy={() => copyText(order.card, 'card')}
                    copied={copied === 'card'}
                  />
                  <Row
                    label="Получатель"
                    value={order.recipient}
                    onCopy={() => copyText(order.recipient, 'recipient')}
                    copied={copied === 'recipient'}
                  />
                </div>

                {/* Timer */}
                <div className="inline-flex items-center gap-1.5 font-roobert text-[11px] text-whisper-gray">
                  <Clock size={12} strokeWidth={1.7} />
                  Заявка действует {order.expiresInMinutes} минут
                </div>

                <p className="font-roobert text-[11px] text-whisper-gray leading-relaxed">
                  После перевода баланс пополнится автоматически в течение
                  нескольких минут. Если не пришло — обратитесь в поддержку
                  с ID заявки: <span className="tabular-nums">{order.orderId.slice(0, 12)}…</span>
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Tabs */}
        {!order && (
          <>
            <div className="flex items-center gap-2">
              <TabButton
                active={tab === 'deposit'}
                onClick={() => setTab('deposit')}
                icon={<ArrowDownToLine size={14} strokeWidth={1.8} />}
                label="Пополнение"
              />
              <TabButton
                active={tab === 'withdraw'}
                onClick={() => setTab('withdraw')}
                icon={<ArrowUpFromLine size={14} strokeWidth={1.8} />}
                label="Вывод"
              />
            </div>

            {/* Amount input — only for deposit */}
            {tab === 'deposit' && (
              <div className="flex flex-col gap-1.5">
                <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                  Сумма пополнения, zł
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={10}
                    min={10}
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setError(null);
                    }}
                    className="flex-1 bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[18px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
                  />
                  {[50, 100, 200, 500].map((v) => (
                    <button
                      key={v}
                      onClick={() => setDepositAmount(String(v))}
                      className="px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 font-roobert text-[12px] text-frost-white/85 transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {error && (
                  <span className="font-roobert text-[12px] text-[#ff8a76]">
                    {error}
                  </span>
                )}
              </div>
            )}

            {/* Methods grid */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="grid grid-cols-2 gap-3"
              >
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (m.live && tab === 'deposit') {
                        void startDeposit(m);
                      }
                    }}
                    disabled={loading && selectedMethod?.id === m.id}
                    className={`text-left rounded-card border px-4 py-4 flex flex-col gap-3 transition-colors ${
                      m.live && tab === 'deposit'
                        ? 'border-white/15 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/25 cursor-pointer'
                        : 'border-white/10 bg-white/[0.03] opacity-90 cursor-not-allowed'
                    }`}
                  >
                    <span className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/85">
                      {m.icon}
                    </span>
                    <div>
                      <div className="font-roobert text-[14px] leading-tight text-frost-white">
                        {m.label}
                      </div>
                      <div className="mt-1 font-roobert text-[11px] text-whisper-gray">
                        {m.hint}
                      </div>
                    </div>
                    {!m.live && (
                      <div className="mt-auto inline-flex items-center px-2 py-0.5 rounded-pill border border-white/10 self-start">
                        <span className="font-roobert text-[9px] uppercase tracking-[0.22em] text-whisper-gray">
                          Скоро
                        </span>
                      </div>
                    )}
                    {m.live && loading && selectedMethod?.id === m.id && (
                      <div className="mt-auto inline-flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full border border-white/20 border-t-frost-white animate-spin" />
                        <span className="font-roobert text-[10px] text-whisper-gray">
                          Создание заявки…
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
          </>
        )}

        <p className="font-roobert text-[11px] text-whisper-gray text-center px-4 leading-relaxed">
          {tab === 'deposit'
            ? 'Выберите способ пополнения. Банковский перевод и Revolut доступны прямо сейчас.'
            : 'Способы вывода появятся в ближайшее время.'}
        </p>

        <div className="pt-2 flex items-center justify-center">
          <BrandLockup size={56} />
        </div>
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-pill border transition-colors ${
        active
          ? 'border-white/25 text-frost-white'
          : 'border-white/10 text-frost-white/60 hover:text-frost-white hover:border-white/20'
      }`}
      style={
        active
          ? {
              background:
                'linear-gradient(135deg, rgba(160, 224, 171, 0.18), rgba(255, 172, 46, 0.18) 50%, rgba(165, 45, 37, 0.18))',
            }
          : { background: 'rgba(255, 255, 255, 0.03)' }
      }
    >
      {icon}
      <span className="font-roobert text-[13px]">{label}</span>
    </button>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray">
          {label}
        </div>
        <div className="font-roobert text-[14px] text-frost-white tabular-nums truncate">
          {value}
        </div>
      </div>
      <button
        onClick={onCopy}
        className="w-8 h-8 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white shrink-0"
      >
        {copied ? (
          <Check size={12} strokeWidth={2} />
        ) : (
          <Copy size={12} strokeWidth={1.7} />
        )}
      </button>
    </div>
  );
}
