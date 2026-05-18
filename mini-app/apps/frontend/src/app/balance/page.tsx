'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Building2,
  Smartphone,
  CreditCard,
  Copy,
  Check,
  History,
  X,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useBalanceStore } from '@/store/balance-store';
import { BrandLockup } from '@/components/ui/brand-mark';

/**
 * Balance Management — Monopo Saigon Style
 *
 * Deposit  → Banking transfer to a BLIK number (single live method).
 * Withdraw → BLIK (phone + bank) and Bank card (manual review by admins).
 *
 * Design rules followed here:
 *  - No mentions of provider name in the user UI.
 *  - Full order ID is shown verbatim (selectable, copyable).
 *  - Bright warning on the withdraw flow about wrong details.
 *  - "Coming soon" placeholder methods are removed entirely.
 *  - All animations are GPU-friendly (transform / opacity only, no
 *    layout animation).
 */

type Tab = 'deposit' | 'withdraw';
type WithdrawKind = 'blik' | 'card';

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

  // -------- Deposit state ---------------------------------------------------
  const [depositAmount, setDepositAmount] = useState<string>('100');
  const [order, setOrder] = useState<MacvPayOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // -------- Withdraw state --------------------------------------------------
  const [wKind, setWKind] = useState<WithdrawKind>('blik');
  const [wAmount, setWAmount] = useState<string>('100');
  const [wPhone, setWPhone] = useState<string>('');
  const [wBank, setWBank] = useState<string>('');
  const [wHolder, setWHolder] = useState<string>('');
  const [wCard, setWCard] = useState<string>('');
  const [wSubmitting, setWSubmitting] = useState(false);
  const [wMsg, setWMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // -------- Deposit handlers ------------------------------------------------

  const startDeposit = useCallback(async () => {
    const num = parseFloat(depositAmount);
    if (!Number.isFinite(num) || num < 10) {
      setError('Минимальная сумма 10 zł');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/macvpay/deposit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, type: 'bank' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? 'Не удалось создать заявку');
      } else {
        setOrder(j as MacvPayOrder);
      }
    } catch {
      setError('Сетевая ошибка. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }, [depositAmount]);

  const cancelDeposit = useCallback(async () => {
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
  }, [order]);

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }, []);

  // -------- Withdraw handlers -----------------------------------------------

  const submitWithdraw = useCallback(async () => {
    const num = parseFloat(wAmount);
    if (!Number.isFinite(num) || num < 50) {
      setWMsg({ ok: false, text: 'Минимальная сумма для вывода — 50 zł' });
      return;
    }
    if (num > amount) {
      setWMsg({ ok: false, text: 'Недостаточно средств на балансе' });
      return;
    }
    if (wKind === 'blik') {
      if (!wPhone.trim() || !wBank.trim() || !wHolder.trim()) {
        setWMsg({ ok: false, text: 'Заполните номер телефона, банк и имя получателя' });
        return;
      }
    } else if (wKind === 'card') {
      if (!wCard.trim() || !wHolder.trim()) {
        setWMsg({ ok: false, text: 'Заполните номер карты и имя получателя' });
        return;
      }
    }
    setWSubmitting(true);
    setWMsg(null);
    try {
      const body =
        wKind === 'blik'
          ? {
              method: 'blik',
              amount: num,
              phone: wPhone.trim(),
              bank: wBank.trim(),
              holder: wHolder.trim(),
            }
          : {
              method: 'card',
              amount: num,
              card: wCard.trim(),
              holder: wHolder.trim(),
            };
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setWMsg({ ok: false, text: j.error ?? 'Не удалось отправить заявку' });
      } else {
        setWMsg({
          ok: true,
          text: 'Заявка принята. Обработка занимает до 24 часов.',
        });
        setWAmount('100');
        setWPhone('');
        setWBank('');
        setWCard('');
        setWHolder('');
      }
    } catch {
      setWMsg({ ok: false, text: 'Сетевая ошибка. Попробуйте позже.' });
    } finally {
      setWSubmitting(false);
    }
  }, [wKind, wAmount, amount, wPhone, wBank, wHolder, wCard]);

  // -------- Render ----------------------------------------------------------

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray">
            Кошелёк
          </span>
          <span className="w-11 h-11" />
        </header>

        {/* Balance plate */}
        <BalancePlate amount={amount} />

        {/* History link */}
        <button
          onClick={() => router.push('/balance/history')}
          className="rounded-card border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] transition-all px-4 py-3 flex items-center gap-3 text-left"
        >
          <span className="w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/85">
            <History size={15} strokeWidth={1.7} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-roobert text-[14px] leading-tight text-frost-white">
              История платежей
            </div>
            <div className="mt-0.5 font-roobert text-[11px] text-whisper-gray">
              Пополнения, выводы и их статусы
            </div>
          </div>
          <ChevronRight size={14} className="text-frost-white/55" strokeWidth={1.7} />
        </button>

        {/* Order overrides everything else */}
        <AnimatePresence mode="wait">
          {order ? (
            <PaymentDetails
              key="order"
              order={order}
              copied={copied}
              onCopy={copyText}
              onCancel={cancelDeposit}
            />
          ) : (
            <motion.div
              key="forms"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-5"
            >
              <Tabs tab={tab} onChange={setTab} />

              {tab === 'deposit' ? (
                <DepositForm
                  amount={depositAmount}
                  onAmountChange={(v) => {
                    setDepositAmount(v);
                    setError(null);
                  }}
                  onSubmit={startDeposit}
                  loading={loading}
                  error={error}
                />
              ) : (
                <WithdrawForm
                  kind={wKind}
                  onKindChange={setWKind}
                  amount={wAmount}
                  onAmountChange={(v) => {
                    setWAmount(v);
                    setWMsg(null);
                  }}
                  phone={wPhone}
                  onPhoneChange={setWPhone}
                  bank={wBank}
                  onBankChange={setWBank}
                  card={wCard}
                  onCardChange={setWCard}
                  holder={wHolder}
                  onHolderChange={setWHolder}
                  submitting={wSubmitting}
                  onSubmit={submitWithdraw}
                  message={wMsg}
                  balance={amount}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2 flex items-center justify-center">
          <BrandLockup size={56} />
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function BalancePlate({ amount }: { amount: number }) {
  // Memoize the formatted number so repeated re-renders don't redo Intl work.
  const formatted = useMemo(
    () => amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 }),
    [amount]
  );
  return (
    <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60 pointer-events-none"
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
            {formatted}
          </span>
          <span className="font-roobert text-[18px] text-whisper-gray">zł</span>
        </div>
      </div>
    </section>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-2">
      <TabButton
        active={tab === 'deposit'}
        onClick={() => onChange('deposit')}
        icon={<ArrowDownToLine size={14} strokeWidth={1.8} />}
        label="Пополнение"
      />
      <TabButton
        active={tab === 'withdraw'}
        onClick={() => onChange('withdraw')}
        icon={<ArrowUpFromLine size={14} strokeWidth={1.8} />}
        label="Вывод"
      />
    </div>
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
      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-pill border transition-colors active:scale-[0.99] ${
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

/* ------------------------------ DepositForm ------------------------------- */

function DepositForm({
  amount,
  onAmountChange,
  onSubmit,
  loading,
  error,
}: {
  amount: string;
  onAmountChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          Сумма пополнения, zł
        </span>
        <input
          type="number"
          step={10}
          min={10}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[18px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
        />
        {error && (
          <span className="font-roobert text-[12px] text-[#ff8a76]">{error}</span>
        )}
      </div>

      {/* Single live method */}
      <button
        onClick={onSubmit}
        disabled={loading}
        className="relative overflow-hidden text-left rounded-card border border-white/15 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/25 px-4 py-4 flex items-center gap-4 transition-colors active:scale-[0.99] disabled:opacity-60"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background:
              'radial-gradient(80% 100% at 100% 0%, rgba(160,224,171,0.18), transparent 60%)',
          }}
        />
        <span className="relative w-12 h-12 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/85 shrink-0">
          <Building2 size={22} strokeWidth={1.6} />
        </span>
        <div className="relative flex-1 min-w-0">
          <div className="font-roobert text-[15px] leading-tight text-frost-white">
            Банковский перевод
          </div>
          <div className="mt-1 font-roobert text-[12px] text-whisper-gray">
            Перевод на номер BLIK
          </div>
        </div>
        <div className="relative">
          {loading ? (
            <div className="w-4 h-4 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          ) : (
            <Sparkles size={14} className="text-frost-white/70" strokeWidth={1.6} />
          )}
        </div>
      </button>

      <p className="font-roobert text-[11px] text-whisper-gray text-center px-4 leading-relaxed">
        Заявка действует 30 минут. Сумма уникальна — переводите ровно столько,
        сколько указано на следующем экране.
      </p>
    </div>
  );
}

/* ----------------------------- PaymentDetails ----------------------------- */

function PaymentDetails({
  order,
  copied,
  onCopy,
  onCancel,
}: {
  order: MacvPayOrder;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onCancel: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-card border border-white/15 bg-white/[0.04]"
      style={{
        background:
          'linear-gradient(135deg, rgba(160,224,171,0.10), rgba(255,172,46,0.08) 60%, rgba(165,45,37,0.08))',
      }}
    >
      <div className="px-5 py-5 flex flex-col gap-4">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
              Реквизиты для оплаты
            </span>
            <span className="font-roobert text-[16px] text-frost-white mt-0.5">
              Банковский перевод
            </span>
          </div>
          <button
            onClick={onCancel}
            aria-label="Закрыть заявку"
            className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white active:scale-95 transition-transform"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Unique amount */}
        <div className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-4">
          <div className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray mb-1.5">
            Переведите ТОЧНО эту сумму
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-roobert text-[32px] font-light tabular-nums text-frost-white leading-none">
              {order.uniqueAmount.toFixed(2)}{' '}
              <span className="text-[20px] text-whisper-gray">{order.currency}</span>
            </span>
            <button
              onClick={() => onCopy(order.uniqueAmount.toFixed(2), 'amount')}
              aria-label="Скопировать сумму"
              className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform"
            >
              {copied === 'amount' ? (
                <Check size={16} strokeWidth={2} />
              ) : (
                <Copy size={16} strokeWidth={1.7} />
              )}
            </button>
          </div>
          <p className="mt-2 font-roobert text-[11px] text-[#ff8a76]/95 leading-snug">
            Сумма уникальна — другая сумма НЕ будет зачтена
          </p>
        </div>

        {/* Account / phone — provider-issued banking details */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 flex flex-col gap-3">
          <CopyRow
            label={order.type === 'bank' ? 'Номер счёта / BLIK' : 'Телефон'}
            value={order.card}
            keyId="card"
            copied={copied}
            onCopy={onCopy}
          />
        </div>

        {/* Countdown timer — animated, GPU-friendly */}
        <CountdownTimer minutes={order.expiresInMinutes} />

        {/* Help block with FULL order id */}
        <div className="rounded-card border border-white/10 bg-white/[0.02] px-4 py-3 flex flex-col gap-1.5">
          <div className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            ID заявки
          </div>
          <div className="flex items-center justify-between gap-2">
            <code
              className="font-mono text-[12px] text-frost-white/90 break-all select-all leading-snug"
              style={{ wordBreak: 'break-all' }}
            >
              {order.orderId}
            </code>
            <button
              onClick={() => onCopy(order.orderId, 'orderid')}
              aria-label="Скопировать ID заявки"
              className="w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform shrink-0"
            >
              {copied === 'orderid' ? (
                <Check size={14} strokeWidth={2} />
              ) : (
                <Copy size={14} strokeWidth={1.7} />
              )}
            </button>
          </div>
          <p className="font-roobert text-[11px] text-whisper-gray leading-relaxed">
            После перевода баланс пополнится автоматически в течение нескольких
            минут. Если зачисление задерживается — обратитесь в поддержку и
            пришлите ID заявки.
          </p>
        </div>
      </div>
    </motion.section>
  );
}

function CopyRow({
  label,
  value,
  keyId,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  keyId: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray">
          {label}
        </div>
        <div className="font-roobert text-[14px] text-frost-white tabular-nums break-all leading-snug">
          {value}
        </div>
      </div>
      <button
        onClick={() => onCopy(value, keyId)}
        aria-label={`Скопировать ${label}`}
        className="w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform shrink-0"
      >
        {copied === keyId ? (
          <Check size={14} strokeWidth={2} />
        ) : (
          <Copy size={14} strokeWidth={1.7} />
        )}
      </button>
    </div>
  );
}

/* ---------------------------- CountdownTimer ---------------------------- */
/**
 * Big legible MM:SS counter with a circular progress ring around it.
 * Counts down from the full window — when it hits zero we keep showing
 * 00:00 and rely on the parent to pick up the cancelled / expired
 * transition via REST. Pure CSS animation: a stroke-dasharray on an
 * SVG circle, redrawn on each one-second tick. The ring uses the
 * brand Deep Ocean gradient so it stays on-brand without any heavy
 * effects.
 */
function CountdownTimer({ minutes }: { minutes: number }) {
  const total = Math.max(60, Math.floor(minutes * 60)); // seconds
  const [endsAt] = useState(() => Date.now() + total * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.floor((endsAt - now) / 1000));
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const frac = total > 0 ? remaining / total : 0;

  // Ring geometry
  const size = 100;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * frac;

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-4 flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
        >
          <defs>
            <linearGradient id="cd-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(160, 224, 171)" />
              <stop offset="50%" stopColor="rgb(255, 172, 46)" />
              <stop offset="100%" stopColor="rgb(165, 45, 37)" />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={stroke}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#cd-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.5s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-roobert text-[20px] font-light tabular-nums text-frost-white leading-none">
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </span>
          <span className="mt-0.5 font-roobert text-[8px] uppercase tracking-[0.22em] text-whisper-gray">
            осталось
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          Время на оплату
        </div>
        <p className="mt-1 font-roobert text-[12px] text-frost-white/85 leading-relaxed">
          После перевода баланс пополнится автоматически. Если время
          истекло — заявка закроется, средства не спишутся.
        </p>
      </div>
    </div>
  );
}

function _CopyRow_unused() {
  // Removed in favour of the inlined CopyRow above. Retained as a
  // no-op placeholder so the linter doesn't flag a dangling import
  // during the transition; will be deleted in a follow-up.
  return null;
}

/* ------------------------------ WithdrawForm ------------------------------ */

function WithdrawForm({
  kind,
  onKindChange,
  amount,
  onAmountChange,
  phone,
  onPhoneChange,
  bank,
  onBankChange,
  card,
  onCardChange,
  holder,
  onHolderChange,
  submitting,
  onSubmit,
  message,
  balance,
}: {
  kind: WithdrawKind;
  onKindChange: (k: WithdrawKind) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  bank: string;
  onBankChange: (v: string) => void;
  card: string;
  onCardChange: (v: string) => void;
  holder: string;
  onHolderChange: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  message: { ok: boolean; text: string } | null;
  balance: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Warning */}
      <div className="rounded-card border border-[#ff8a76]/40 bg-[#ff8a76]/10 px-4 py-3 flex items-start gap-3">
        <AlertTriangle
          size={16}
          strokeWidth={1.8}
          className="text-[#ff8a76] mt-0.5 shrink-0"
        />
        <p className="font-roobert text-[12px] text-frost-white/90 leading-relaxed">
          Если реквизиты указаны неверно — деньги могут быть утеряны и возврату
          не подлежат. Перепроверьте каждое поле перед отправкой заявки.
        </p>
      </div>

      {/* Method picker */}
      <div className="grid grid-cols-2 gap-2">
        <MethodChip
          active={kind === 'blik'}
          onClick={() => onKindChange('blik')}
          icon={<Smartphone size={18} strokeWidth={1.6} />}
          label="BLIK"
          hint="По номеру телефона"
        />
        <MethodChip
          active={kind === 'card'}
          onClick={() => onKindChange('card')}
          icon={<CreditCard size={18} strokeWidth={1.6} />}
          label="Карта"
          hint="Польский банк"
        />
      </div>

      {/* Amount */}
      <Field label="Сумма вывода, zł">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={10}
            min={50}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            className="flex-1 bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[16px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
          />
          <button
            onClick={() => onAmountChange(String(Math.floor(balance)))}
            className="px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 font-roobert text-[12px] text-frost-white/85 transition-colors"
          >
            Всё
          </button>
        </div>
      </Field>

      {/* Method-specific fields */}
      {kind === 'blik' ? (
        <>
          <Field label="Номер телефона (BLIK)">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+48 600 000 000"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[15px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Банк получателя">
            <input
              type="text"
              inputMode="text"
              placeholder="Например: PKO BP, mBank, Santander"
              value={bank}
              onChange={(e) => onBankChange(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[15px] text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Имя владельца счёта">
            <input
              type="text"
              inputMode="text"
              autoComplete="name"
              placeholder="Имя и фамилия как в банке"
              value={holder}
              onChange={(e) => onHolderChange(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[15px] text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Номер карты">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={card}
              onChange={(e) => onCardChange(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[15px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Имя владельца">
            <input
              type="text"
              inputMode="text"
              autoComplete="cc-name"
              placeholder="Как указано на карте"
              value={holder}
              onChange={(e) => onHolderChange(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-4 py-2.5 font-roobert text-[15px] text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
        </>
      )}

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="relative overflow-hidden rounded-pill border border-white/20 px-4 py-3 font-roobert text-[14px] text-frost-white active:scale-[0.99] disabled:opacity-60 transition-transform"
        style={{
          background:
            'linear-gradient(90deg, rgba(160,224,171,0.85) 0%, rgba(255,172,46,0.85) 50%, rgba(165,45,37,0.85) 100%)',
        }}
      >
        {submitting ? 'Отправка…' : 'Отправить заявку'}
      </button>

      {message && (
        <div
          className={`rounded-card border px-4 py-3 font-roobert text-[12px] leading-relaxed ${
            message.ok
              ? 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-frost-white'
              : 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-frost-white'
          }`}
        >
          {message.text}
        </div>
      )}

      <p className="font-roobert text-[11px] text-whisper-gray text-center px-2 leading-relaxed">
        Заявки на вывод обрабатываются вручную операторами. Среднее время —
        до 24 часов.
      </p>
    </div>
  );
}

function MethodChip({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-card border px-4 py-3 flex flex-col gap-2 transition-colors active:scale-[0.99] ${
        active
          ? 'border-white/30 bg-white/[0.06]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20'
      }`}
    >
      <span className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/85">
        {icon}
      </span>
      <div>
        <div className="font-roobert text-[14px] leading-tight text-frost-white">
          {label}
        </div>
        <div className="mt-0.5 font-roobert text-[11px] text-whisper-gray">
          {hint}
        </div>
      </div>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </span>
      {children}
    </label>
  );
}
