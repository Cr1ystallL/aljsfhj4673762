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
} from 'lucide-react';
import { useBalanceStore } from '@/store/balance-store';
import { BrandLockup } from '@/components/ui/brand-mark';

/**
 * Balance Management — Monopo Saigon Style
 *
 * Two-tab plate (Пополнение / Вывод) with a grid of payment-method
 * placeholders. Methods are intentionally inert for now — when the
 * payment integrations land, each tile will route to its own flow.
 *
 * The layout mirrors the spirit of typical casino "cashier" screens
 * (top balance pill, tabs, method grid, footer note) but rebuilt under
 * the brand's quiet aesthetic: frosted surfaces, hairline dividers,
 * Deep Ocean accents only on the active tab.
 */

type Tab = 'deposit' | 'withdraw';

interface PaymentMethod {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

const depositMethods: PaymentMethod[] = [
  {
    id: 'card',
    label: 'Банковская карта',
    hint: 'Visa · Mastercard · МИР',
    icon: <CreditCard size={20} strokeWidth={1.6} />,
  },
  {
    id: 'crypto',
    label: 'Криптовалюта',
    hint: 'USDT · BTC · ETH · TRX',
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
  {
    id: 'bank-transfer',
    label: 'Банковский перевод',
    hint: 'Расчётный счёт',
    icon: <Building2 size={20} strokeWidth={1.6} />,
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

export default function BalancePage() {
  const router = useRouter();
  const balance = useBalanceStore((s) => s.balance);
  const amount = balance?.amount ?? 0;
  const [tab, setTab] = useState<Tab>('deposit');

  const methods = tab === 'deposit' ? depositMethods : withdrawMethods;

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

        {/* Tabs */}
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
                disabled
                className="text-left rounded-card border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col gap-3 opacity-90 cursor-not-allowed"
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
                <div className="mt-auto inline-flex items-center px-2 py-0.5 rounded-pill border border-white/10 self-start">
                  <span className="font-roobert text-[9px] uppercase tracking-[0.22em] text-whisper-gray">
                    Скоро
                  </span>
                </div>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>

        <p className="font-roobert text-[11px] text-whisper-gray text-center px-4 leading-relaxed">
          Способы оплаты появятся в ближайшее время. Лимиты, комиссии и
          подтверждение операций будут отображаться здесь.
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
