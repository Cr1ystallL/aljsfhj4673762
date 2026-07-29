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
import { toast } from '@/store/toast-store';
import { reportApiError } from '@/lib/api/errors';
import { GameTopBar } from '@/components/game/game-top-bar';

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

interface FoluxPayOrder {
  orderId: string;
  uniqueAmount: number;
  type: 'bank' | 'revolut' | string;
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
  const [order, setOrder] = useState<FoluxPayOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [depositDisabledModal, setDepositDisabledModal] = useState(false);

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
      toast.warn('Минимальная сумма пополнения — 10 zł');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/foluxpay/deposit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, type: 'bank' }),
      });
      const j = await res.json();
      if (res.status === 403) {
        setDepositDisabledModal(true);
        setLoading(false);
        return;
      }
      if (!res.ok || !j.ok) {
        const msg = reportApiError(res, j, 'Не удалось создать заявку');
        setError(msg);
      } else {
        setOrder(j as FoluxPayOrder);
        toast.success('Заявка создана. Переведите указанную сумму.');
      }
    } catch {
      setError('Сетевая ошибка. Попробуйте позже.');
      toast.error('Сетевая ошибка. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  }, [depositAmount]);

  const cancelDeposit = useCallback(async () => {
    if (!order) return;
    try {
      await fetch('/api/foluxpay/cancel', {
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
      const text = 'Минимальная сумма для вывода — 50 zł';
      setWMsg({ ok: false, text });
      toast.warn(text);
      return;
    }
    if (num > amount) {
      const text = 'Недостаточно средств на балансе';
      setWMsg({ ok: false, text });
      toast.warn(text);
      return;
    }
    if (wKind === 'blik') {
      if (!wPhone.trim() || !wBank.trim() || !wHolder.trim()) {
        const text = 'Заполните номер телефона, банк и имя получателя';
        setWMsg({ ok: false, text });
        toast.warn(text);
        return;
      }
    } else if (wKind === 'card') {
      if (!wCard.trim() || !wHolder.trim()) {
        const text = 'Заполните номер карты и имя получателя';
        setWMsg({ ok: false, text });
        toast.warn(text);
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
        const msg = reportApiError(res, j, 'Не удалось отправить заявку');
        setWMsg({ ok: false, text: msg });
      } else {
        const ok = 'Заявка принята. Обработка занимает до 24 часов.';
        setWMsg({ ok: true, text: ok });
        toast.success(ok, { title: 'Заявка отправлена' });
        setWAmount('100');
        setWPhone('');
        setWBank('');
        setWCard('');
        setWHolder('');
      }
    } catch {
      const text = 'Сетевая ошибка. Попробуйте позже.';
      setWMsg({ ok: false, text });
      toast.error(text);
    } finally {
      setWSubmitting(false);
    }
  }, [wKind, wAmount, amount, wPhone, wBank, wHolder, wCard]);

  // -------- Render ----------------------------------------------------------

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white flex flex-col">
      <GameTopBar title="Кошелёк" />
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">

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

      {/* Deposit Disabled Modal */}
      <AnimatePresence>
        {depositDisabledModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-[320px] rounded-[24px] border border-white/10 bg-midnight-canvas p-6 flex flex-col items-center text-center shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <AlertTriangle className="text-red-400" size={32} />
              </div>
              <h3 className="font-roobert text-[18px] text-frost-white mb-2">
                Пополнения недоступны
              </h3>
              <p className="font-roobert text-[13px] text-whisper-gray leading-relaxed mb-6">
                В данный момент пополнения временно отключены по техническим причинам. Пожалуйста, попробуйте позже.
              </p>
              <button
                onClick={() => setDepositDisabledModal(false)}
                className="w-full bg-white/10 hover:bg-white/15 active:bg-white/20 text-frost-white font-roobert text-[14px] px-6 py-3 rounded-pill transition-colors"
              >
                Понятно
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
  order: FoluxPayOrder;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onCancel: () => void;
}) {
  const isCard = /^[0-9\s-]+$/.test(order.card || '');

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -12 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-[24px] border border-white/15 bg-gradient-to-b from-white/[0.07] to-white/[0.02] backdrop-blur-xl shadow-2xl"
    >
      {/* Ambient background glow */}
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(160, 224, 171, 0.6) 0%, rgba(255, 172, 46, 0.4) 50%, transparent 70%)',
        }}
      />

      <div className="relative p-5 sm:p-6 flex flex-col gap-5">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div>
              <span className="font-roobert text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-400/90 block">
                Ожидает оплаты
              </span>
              <span className="font-roobert text-[15px] font-medium text-frost-white leading-tight">
                Банковский перевод (PLN)
              </span>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Отменить заявку"
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] active:scale-95 transition-all text-whisper-gray hover:text-frost-white"
          >
            <span className="font-roobert text-[12px]">Отменить</span>
            <X size={14} className="group-hover:rotate-90 transition-transform duration-200" strokeWidth={2} />
          </button>
        </div>

        {/* Big countdown timer block */}
        <CountdownTimer minutes={order.expiresInMinutes} />

        {/* Unique amount highlight card */}
        <div className="relative overflow-hidden rounded-[20px] border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-white/[0.04] to-transparent p-4.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle size={15} strokeWidth={2} />
              <span className="font-roobert text-[11px] uppercase tracking-[0.18em] font-semibold">
                Переведите ТОЧНУЮ сумму
              </span>
            </div>
            <span className="font-roobert text-[10px] uppercase tracking-wider text-amber-200/80 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 font-medium">
              До копеек
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 bg-black/30 rounded-[14px] p-3.5 border border-white/10">
            <div className="flex items-baseline gap-2">
              <span className="font-roobert text-[34px] sm:text-[38px] font-bold tabular-nums text-frost-white leading-none tracking-tight">
                {Number(order.uniqueAmount).toFixed(2)}
              </span>
              <span className="font-roobert text-[20px] font-medium text-whisper-gray">
                {order.currency || 'PLN'}
              </span>
            </div>

            <button
              onClick={() => onCopy(Number(order.uniqueAmount).toFixed(2), 'amount')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-pill border border-amber-400/30 bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 transition-all text-amber-200 font-roobert text-[13px] font-medium shrink-0"
            >
              {copied === 'amount' ? (
                <>
                  <Check size={15} strokeWidth={2.5} className="text-emerald-400" />
                  <span className="text-emerald-300">Скопировано</span>
                </>
              ) : (
                <>
                  <Copy size={15} strokeWidth={1.8} />
                  <span>Копировать</span>
                </>
              )}
            </button>
          </div>

          <p className="font-roobert text-[11px] text-whisper-gray/90 leading-snug">
            💡 Сумма уникальна для автоматического поиска вашей транзакции. При отправке другой суммы зачисление не произойдет.
          </p>
        </div>

        {/* Requisites row */}
        {order.card && (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2.5">
            <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
              {isCard ? 'Номер карты / Счет' : 'Реквизиты для перевода (Revtag/Phone)'}
            </span>
            <div className="flex items-center justify-between gap-3 bg-black/20 rounded-[12px] p-3 border border-white/5">
              <span className="font-mono text-[16px] sm:text-[18px] font-semibold text-frost-white tabular-nums tracking-wide break-all">
                {order.card}
              </span>
              <button
                onClick={() => onCopy(order.card, 'card')}
                aria-label="Скопировать реквизиты"
                className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-frost-white/90 active:scale-95 transition-all shrink-0"
              >
                {copied === 'card' ? (
                  <Check size={16} strokeWidth={2.5} className="text-emerald-400" />
                ) : (
                  <Copy size={16} strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Order metadata & help */}
        <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
              Идентификатор заявки
            </span>
            <button
              onClick={() => onCopy(order.orderId, 'orderid')}
              className="flex items-center gap-1 text-whisper-gray hover:text-frost-white font-mono text-[11px] transition-colors"
            >
              {copied === 'orderid' ? (
                <span className="text-emerald-400 font-roobert">Скопировано</span>
              ) : (
                <>
                  <Copy size={12} />
                  <span>Скопировать ID</span>
                </>
              )}
            </button>
          </div>
          <code className="font-mono text-[12px] text-frost-white/80 bg-black/30 p-2.5 rounded-[10px] border border-white/5 break-all select-all">
            {order.orderId}
          </code>
          <p className="font-roobert text-[11px] text-whisper-gray leading-relaxed pt-1">
            После подтверждения банком баланс пополнится в течение 1–5 минут. Сохраните ID заявки на случай обращения в поддержку.
          </p>
        </div>
      </div>
    </motion.section>
  );
}

/* ---------------------------- CountdownTimer ---------------------------- */
function CountdownTimer({ minutes }: { minutes: number }) {
  const total = Math.max(60, Math.floor(minutes * 60));
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
  const isWarning = remaining < 300; // less than 5 minutes

  // Ring dimensions
  const size = 110;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * frac;

  return (
    <div className="rounded-[20px] border border-white/10 bg-black/30 p-4.5 flex items-center gap-5">
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90 drop-shadow-md"
          aria-hidden
        >
          <defs>
            <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              {isWarning ? (
                <>
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#a855f7" />
                </>
              )}
            </linearGradient>
          </defs>
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={stroke}
          />
          {/* Animated progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#timer-gradient)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ transition: 'stroke-dasharray 0.5s ease-out' }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-roobert text-[22px] font-bold tabular-nums leading-none ${isWarning ? 'text-rose-400 animate-pulse' : 'text-frost-white'}`}>
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </span>
          <span className="mt-1 font-roobert text-[9px] uppercase tracking-[0.2em] text-whisper-gray font-medium">
            таймер
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-frost-white font-roobert text-[14px] font-semibold">
          <Sparkles size={15} className="text-amber-400" />
          <span>Время на совершение перевода</span>
        </div>
        <p className="font-roobert text-[12px] text-whisper-gray leading-relaxed">
          Заявка закроется автоматически при истечении таймера. Пожалуйста, успейте выполнить перевод до конца отсчета.
        </p>
      </div>
    </div>
  );
}

function _CopyRow_unused() {
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
