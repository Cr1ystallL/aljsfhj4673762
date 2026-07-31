'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  Copy,
  Check,
  History,
  Clock,
  RefreshCw,
  AlertTriangle,
  Zap,
  X,
  Coins,
} from 'lucide-react';
import { useBalanceStore } from '@/store/balance-store';
import { toast } from '@/store/toast-store';
import {
  Trc20Icon,
  TonIcon,
  Bep20Icon,
  CryptoBotIcon,
  DirectCryptoIcon,
  BankCardIcon,
} from '@/components/ui/crypto-networks';

type Tab = 'deposit' | 'withdraw';
type DepositMethod = 'crypto' | 'cryptobot' | 'card';
type CryptoNetwork = 'TRC20' | 'TON' | 'BEP20';
type WithdrawKind = 'blik' | 'card';

interface DirectCryptoDeposit {
  id: string;
  network: CryptoNetwork;
  requestedPln: number;
  uniqueUsdt: number;
  fxRate: number;
  depositAddress: string;
  status: string;
  expiresInSeconds: number;
  createdAt: string;
}

interface ActiveFoluxOrder {
  orderId: string;
  uniqueAmount: number;
  currency: string;
  type: string;
  card: string;
  details: string;
  expiresInMinutes: number;
}

export default function BalancePage() {
  const router = useRouter();
  const balance = useBalanceStore((s) => s.balance);
  const amountPln = balance?.amount ?? 0;

  const [tab, setTab] = useState<Tab>('deposit');
  const [method, setMethod] = useState<DepositMethod>('crypto');
  const [network, setNetwork] = useState<CryptoNetwork>('TRC20');

  // Exchange Rate
  const [fxRate, setFxRate] = useState<number>(3.9);

  useEffect(() => {
    async function fetchRate() {
      try {
        const res = await fetch('/api/crypto-deposit/rates');
        if (res.ok) {
          const j = await res.json();
          if (j.rate > 0) setFxRate(j.rate);
        }
      } catch {}
    }
    void fetchRate();
  }, []);

  // Deposit State
  const [depositAmountPln, setDepositAmountPln] = useState<string>('100');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showBankErrorModal, setShowBankErrorModal] = useState<boolean>(false);

  // Active Direct Crypto Deposit & Active Bank Order
  const [activeCryptoDeposit, setActiveCryptoDeposit] = useState<DirectCryptoDeposit | null>(null);
  const [activeFoluxOrder, setActiveFoluxOrder] = useState<ActiveFoluxOrder | null>(null);

  // Timers
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [foluxTimeLeftSec, setFoluxTimeLeftSec] = useState<number>(0);

  // Converted amount in USD
  const convertedUsd = useMemo(() => {
    const num = parseFloat(depositAmountPln);
    if (!Number.isFinite(num) || num <= 0) return '0.00';
    return (num / fxRate).toFixed(2);
  }, [depositAmountPln, fxRate]);

  // Load Active Deposits / Orders
  const checkActiveOrders = useCallback(async (isManualCheck = false) => {
    if (isManualCheck) setChecking(true);
    try {
      // 1. Direct Crypto
      const cryptoRes = await fetch('/api/crypto-deposit/active', { credentials: 'include' });
      if (cryptoRes.ok) {
        const j = await cryptoRes.json();
        if (j.activeDeposit) {
          setActiveCryptoDeposit(j.activeDeposit as DirectCryptoDeposit);
          setTimeLeftSec(j.activeDeposit.expiresInSeconds);
          if (isManualCheck) {
            toast.info('Транзакция пока не обнаружена в блокчейне. Ожидаем подтверждения сети...');
          }
          return;
        } else {
          setActiveCryptoDeposit(null);
        }
      }

      // 2. Folux / Bank / BLIK Order
      const foluxRes = await fetch('/api/foluxpay/active', { credentials: 'include' });
      if (foluxRes.ok) {
        const j = await foluxRes.json();
        if (j.activeOrder) {
          setActiveFoluxOrder(j.activeOrder as ActiveFoluxOrder);
          setFoluxTimeLeftSec((j.activeOrder.expiresInMinutes || 25) * 60);
          if (isManualCheck) {
            toast.info('Ожидается перевод по указанным банковским реквизитам...');
          }
        } else {
          setActiveFoluxOrder(null);
        }
      }
    } catch {
      if (isManualCheck) toast.error('Сетевая ошибка при проверке');
    } finally {
      if (isManualCheck) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkActiveOrders(false);
  }, [checkActiveOrders]);

  // Crypto Countdown Timer
  useEffect(() => {
    if (!activeCryptoDeposit || timeLeftSec <= 0) return;
    const interval = setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          void checkActiveOrders(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCryptoDeposit, timeLeftSec, checkActiveOrders]);

  // Folux Bank Countdown Timer
  useEffect(() => {
    if (!activeFoluxOrder || foluxTimeLeftSec <= 0) return;
    const interval = setInterval(() => {
      setFoluxTimeLeftSec((prev) => {
        if (prev <= 1) {
          void checkActiveOrders(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeFoluxOrder, foluxTimeLeftSec, checkActiveOrders]);

  // Poll status every 10s
  useEffect(() => {
    if (!activeCryptoDeposit && !activeFoluxOrder) return;
    const pollInterval = setInterval(() => {
      void checkActiveOrders(false);
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [activeCryptoDeposit, activeFoluxOrder, checkActiveOrders]);

  const startDirectCryptoDeposit = useCallback(async () => {
    const num = parseFloat(depositAmountPln);
    if (!Number.isFinite(num) || num < 10) {
      setError('Минимальная сумма пополнения — 10 PLN');
      toast.warn('Минимальная сумма пополнения — 10 PLN');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/crypto-deposit/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPln: num, network }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        const msg = j.error || 'Не удалось создать заявку';
        setError(msg);
        toast.error(msg);
      } else {
        setActiveCryptoDeposit(j.deposit as DirectCryptoDeposit);
        setTimeLeftSec(j.deposit.expiresInSeconds);
        toast.success('Заявка создана. Переведите указанную сумму.');
      }
    } catch {
      setError('Сетевая ошибка. Попробуйте позже.');
      toast.error('Сетевая ошибка. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  }, [depositAmountPln, network]);

  const startCardDeposit = useCallback(async () => {
    const num = parseFloat(depositAmountPln);
    if (!Number.isFinite(num) || num < 10) {
      setError('Минимальная сумма пополнения — 10 PLN');
      toast.warn('Минимальная сумма пополнения — 10 PLN');
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
      if (!res.ok || !j.ok) {
        // HTTP or API error from provider -> show recommendation modal
        setShowBankErrorModal(true);
      } else if (j.redirectUrl) {
        window.location.href = j.redirectUrl;
      } else if (j.orderId || j.card || j.details || j.uniqueAmount) {
        // SUCCESS: Requisites received! Show active order requisites
        const orderData: ActiveFoluxOrder = {
          orderId: j.orderId || `ord_${Date.now()}`,
          uniqueAmount: Number(j.uniqueAmount || num),
          currency: j.currency || 'PLN',
          type: j.type || 'bank',
          card: j.card || '',
          details: j.details || '',
          expiresInMinutes: j.expiresInMinutes || 25,
        };
        setActiveFoluxOrder(orderData);
        setFoluxTimeLeftSec((orderData.expiresInMinutes || 25) * 60);
        toast.success('Реквизиты для оплаты успешно получены!');
      } else {
        setShowBankErrorModal(true);
      }
    } catch {
      setShowBankErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [depositAmountPln]);

  const cancelDirectCryptoDeposit = useCallback(async () => {
    if (!activeCryptoDeposit) return;
    try {
      await fetch('/api/crypto-deposit/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositId: activeCryptoDeposit.id }),
      });
      toast.info('Заявка отменена');
    } catch {}
    setActiveCryptoDeposit(null);
  }, [activeCryptoDeposit]);

  // CryptoBot Handler
  const handleCryptoBotDeposit = useCallback(() => {
    toast.info('Переходим к пополнению через CryptoBot...');
    setTimeout(() => {
      window.open('https://t.me/MacvBet_bot?start=deposit_balance', '_blank');
    }, 600);
  }, []);

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success('Скопировано');
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }, []);

  // Crypto Timer & Segments
  const formattedTimer = useMemo(() => {
    const min = Math.floor(timeLeftSec / 60);
    const sec = timeLeftSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [timeLeftSec]);

  const activeSegments = useMemo(() => {
    const totalSec = 25 * 60;
    const ratio = Math.max(0, Math.min(1, timeLeftSec / totalSec));
    return Math.ceil(ratio * 12);
  }, [timeLeftSec]);

  // Folux Bank Timer & Segments
  const formattedFoluxTimer = useMemo(() => {
    const min = Math.floor(foluxTimeLeftSec / 60);
    const sec = foluxTimeLeftSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [foluxTimeLeftSec]);

  const activeFoluxSegments = useMemo(() => {
    const totalSec = 25 * 60;
    const ratio = Math.max(0, Math.min(1, foluxTimeLeftSec / totalSec));
    return Math.ceil(ratio * 12);
  }, [foluxTimeLeftSec]);

  // Support Username handle for payment assistance
  const supportUsername = useMemo(() => {
    if (activeFoluxOrder?.details) {
      const match = activeFoluxOrder.details.match(/(@[\w_]+)/);
      if (match && match[1] !== '@FoLuxPaySup_bot') return match[1];
    }
    return '@MacvBetSupport';
  }, [activeFoluxOrder]);

  // Withdraw State & Handlers
  const [wKind, setWKind] = useState<WithdrawKind>('blik');
  const [wAmount, setWAmount] = useState<string>('100');
  const [wPhone, setWPhone] = useState<string>('');
  const [wBank, setWBank] = useState<string>('');
  const [wHolder, setWHolder] = useState<string>('');
  const [wCard, setWCard] = useState<string>('');
  const [wSubmitting, setWSubmitting] = useState(false);
  const [wMsg, setWMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submitWithdraw = useCallback(async () => {
    const num = parseFloat(wAmount);
    if (!Number.isFinite(num) || num < 50) {
      const text = 'Минимальная сумма вывода — 50 PLN';
      setWMsg({ ok: false, text });
      toast.warn(text);
      return;
    }
    if (num > amountPln) {
      const text = 'Недостаточно средств на балансе';
      setWMsg({ ok: false, text });
      toast.warn(text);
      return;
    }

    setWSubmitting(true);
    setWMsg(null);

    try {
      const res = await fetch('/api/withdrawals/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: num,
          method: wKind,
          details: { phone: wPhone, bank: wBank, holder: wHolder, card: wCard },
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        const text = j.error || 'Ошибка создания заявки на вывод';
        setWMsg({ ok: false, text });
        toast.error(text);
      } else {
        setWMsg({ ok: true, text: 'Заявка на вывод отправлена!' });
        toast.success('Заявка отправлена!');
      }
    } catch {
      setWMsg({ ok: false, text: 'Сетевая ошибка.' });
    } finally {
      setWSubmitting(false);
    }
  }, [wAmount, amountPln, wKind, wPhone, wBank, wHolder, wCard]);

  const hasActiveRequisites = Boolean(activeCryptoDeposit || activeFoluxOrder);

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-zinc-100 flex flex-col items-center pb-24 font-sans select-none">
      {/* Global CSS keyframes for 5s coin spin */}
      <style jsx global>{`
        @keyframes spin5sKeyframes {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(360deg); }
          100% { transform: rotate(360deg); }
        }
        .coin-spin-5s {
          animation: spin5sKeyframes 5s ease-in-out infinite !important;
        }
      `}</style>

      {/* Header Bar */}
      <div className="w-full max-w-md px-4 py-4 flex items-center justify-center border-b border-white/10 bg-[#0A0B0E]/90 backdrop-blur-md sticky top-0 z-30">
        <span className="font-semibold text-sm tracking-wide text-zinc-100 uppercase text-center">
          Кошелек
        </span>
      </div>

      <div className="w-full max-w-md px-4 pt-4 flex flex-col gap-4">
        {/* Balance Card */}
        <div className="rounded-xl border border-white/10 bg-[#13151C] p-4 flex items-center justify-between shadow-md relative overflow-hidden">
          <div className="flex flex-col gap-1 z-10">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Баланс аккаунта
            </span>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold tracking-tight text-white">
                {amountPln.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-sm font-semibold text-zinc-400">PLN</span>
            </div>

            <div className="text-xs text-zinc-500 font-medium">
              ≈ {(amountPln / fxRate).toFixed(2)} USD ($)
            </div>
          </div>

          {/* Animated Semi-Transparent Silver Coin on Right Side (Rotates every 5s) */}
          <div className="flex items-center justify-center pr-2 pointer-events-none z-0">
            <Coins
              size={56}
              className="text-zinc-400/35 coin-spin-5s"
            />
          </div>
        </div>

        {/* Tab Switcher - Hidden when requisites are active */}
        {!hasActiveRequisites && (
          <div className="grid grid-cols-2 p-1 rounded-lg bg-[#13151C] border border-white/10">
            <button
              onClick={() => setTab('deposit')}
              className={`py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                tab === 'deposit'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowDownToLine size={14} />
              <span>Пополнение</span>
            </button>
            <button
              onClick={() => setTab('withdraw')}
              className={`py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                tab === 'withdraw'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowUpFromLine size={14} />
              <span>Вывод</span>
            </button>
          </div>
        )}

        {/* TAB 1: DEPOSIT */}
        {tab === 'deposit' && (
          <div className="flex flex-col gap-4">
            {/* Active Direct Crypto Requisites View */}
            {activeCryptoDeposit ? (
              <div className="rounded-xl border border-zinc-700 bg-[#13151C] p-4 flex flex-col gap-4">
                {/* Header Status Indicator */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        activeCryptoDeposit.status === 'paid'
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                          : 'bg-amber-400 animate-pulse shadow-sm shadow-amber-400/50'
                      }`}
                    />
                    <span className="text-xs font-semibold text-zinc-200">
                      {activeCryptoDeposit.status === 'paid' ? 'Оплата получена' : 'Ожидание перевода'}
                    </span>
                  </div>
                  
                  {/* Copyable Crypto Order ID */}
                  <button
                    onClick={() => copyText(activeCryptoDeposit.id, 'c_order_id')}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-300 hover:text-white active:scale-95 transition-all"
                    title="Скопировать ID заявки"
                  >
                    <span className="truncate max-w-[130px] font-bold">{activeCryptoDeposit.id}</span>
                    {copied === 'c_order_id' ? (
                      <Check size={12} className="text-emerald-400" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>

                {/* Prominent Large Timer & 12-Segment Progress Bar */}
                <div className="flex flex-col items-center justify-center py-2 px-3 rounded-lg bg-[#0A0B0E] border border-white/10">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">
                    Осталось времени на перевод
                  </div>
                  <div className="text-3xl font-extrabold font-mono tracking-wider text-zinc-100 my-0.5">
                    {formattedTimer}
                  </div>

                  {/* 12-Segment Digital Progress Bar */}
                  <div className="flex items-center gap-1 w-full max-w-[200px] mt-2">
                    {Array.from({ length: 12 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          idx < activeSegments
                            ? 'bg-zinc-200 shadow-sm shadow-white/30'
                            : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Clean QR Code Container */}
                <div className="flex flex-col items-center justify-center my-1 p-4 rounded-xl bg-[#0A0B0E] border border-white/10">
                  <div className="p-2.5 rounded-lg bg-[#13151C] border border-white/15 shadow-inner">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        activeCryptoDeposit.depositAddress
                      )}&color=ffffff&bgcolor=13151c`}
                      alt="QR Code"
                      className="w-44 h-44 rounded-md"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-2 font-medium">
                    Сканируйте QR-код для моментального ввода адреса
                  </span>
                </div>

                {/* Selected Network */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400 font-medium">Сеть:</span>
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-zinc-900 border border-white/10">
                    {activeCryptoDeposit.network === 'TRC20' && <Trc20Icon className="w-6 h-6" />}
                    {activeCryptoDeposit.network === 'TON' && <TonIcon className="w-6 h-6" />}
                    {activeCryptoDeposit.network === 'BEP20' && <Bep20Icon className="w-6 h-6" />}
                    <span className="font-semibold text-xs text-zinc-200">
                      {activeCryptoDeposit.network === 'TRC20' && 'TRON (USDT TRC-20)'}
                      {activeCryptoDeposit.network === 'TON' && 'TON (USDT TON / TON)'}
                      {activeCryptoDeposit.network === 'BEP20' && 'BNB Smart Chain (BEP-20)'}
                    </span>
                  </div>
                </div>

                {/* Exact USDT Amount */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-200 font-semibold">Точная сумма перевода:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-600">
                    <span className="font-mono text-sm font-bold text-white">
                      {activeCryptoDeposit.uniqueUsdt.toFixed(4)} USDT
                    </span>
                    <button
                      onClick={() => copyText(activeCryptoDeposit.uniqueUsdt.toFixed(4), 'amount')}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95"
                    >
                      {copied === 'amount' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400 font-medium">Адрес кошелька:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-white/10">
                    <span className="font-mono text-[11px] text-zinc-300 break-all pr-2 font-bold">
                      {activeCryptoDeposit.depositAddress}
                    </span>
                    <button
                      onClick={() => copyText(activeCryptoDeposit.depositAddress, 'address')}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95 flex-shrink-0"
                    >
                      {copied === 'address' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => void checkActiveOrders(true)}
                    disabled={checking}
                    className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
                    <span>{checking ? 'Проверка...' : 'Проверить статус'}</span>
                  </button>
                  <button
                    onClick={cancelDirectCryptoDeposit}
                    className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400 hover:text-white active:scale-95"
                  >
                    Отменить
                  </button>
                </div>
              </div>
            ) : activeFoluxOrder ? (
              /* Active Folux / Bank / BLIK Order Requisites View */
              <div className="rounded-xl border border-zinc-700 bg-[#13151C] p-4 flex flex-col gap-4">
                {/* Header Status Indicator with COPYABLE Order ID */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-sm shadow-amber-400/50" />
                    <span className="text-xs font-semibold text-zinc-200">
                      Ожидание перевода
                    </span>
                  </div>

                  {/* Copyable Order ID */}
                  <button
                    onClick={() => copyText(activeFoluxOrder.orderId, 'f_order_id')}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-300 hover:text-white active:scale-95 transition-all"
                    title="Скопировать ID заявки"
                  >
                    <span className="truncate max-w-[130px] font-bold">{activeFoluxOrder.orderId}</span>
                    {copied === 'f_order_id' ? (
                      <Check size={12} className="text-emerald-400" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>

                {/* Prominent Large Timer & 12-Segment Progress Bar */}
                <div className="flex flex-col items-center justify-center py-2 px-3 rounded-lg bg-[#0A0B0E] border border-white/10">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">
                    Осталось времени на перевод
                  </div>
                  <div className="text-3xl font-extrabold font-mono tracking-wider text-zinc-100 my-0.5">
                    {formattedFoluxTimer}
                  </div>

                  {/* 12-Segment Digital Progress Bar */}
                  <div className="flex items-center gap-1 w-full max-w-[200px] mt-2">
                    {Array.from({ length: 12 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          idx < activeFoluxSegments
                            ? 'bg-zinc-200 shadow-sm shadow-white/30'
                            : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Copyable Exact Amount */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-200 font-semibold">Точная сумма к оплате:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-600">
                    <span className="font-mono text-sm font-bold text-white">
                      {activeFoluxOrder.uniqueAmount.toFixed(2)} PLN
                    </span>
                    <button
                      onClick={() => copyText(activeFoluxOrder.uniqueAmount.toFixed(2), 'f_amount')}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95"
                      title="Скопировать сумму"
                    >
                      {copied === 'f_amount' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Copyable Requisites (Card / BLIK / Phone) */}
                {activeFoluxOrder.card && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400 font-medium">Реквизиты (Карта / BLIK / Счет):</span>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-white/10">
                      <span className="font-mono text-[11px] text-zinc-300 break-all pr-2 font-bold">
                        {activeFoluxOrder.card}
                      </span>
                      <button
                        onClick={() => copyText(activeFoluxOrder.card, 'f_card')}
                        className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95 flex-shrink-0"
                        title="Скопировать реквизиты"
                      >
                        {copied === 'f_card' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Tech Support Username Box */}
                {supportUsername && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400 font-medium">Тех. поддержка (при возникновении вопросов):</span>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-white/10">
                      <span className="font-mono text-xs font-bold text-sky-400 break-all pr-2">
                        {supportUsername}
                      </span>
                      <button
                        onClick={() => copyText(supportUsername, 'f_support_tag')}
                        className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95 flex-shrink-0"
                        title="Скопировать юзернейм тех. поддержки"
                      >
                        {copied === 'f_support_tag' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}


                {/* Actions */}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => void checkActiveOrders(true)}
                    disabled={checking}
                    className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
                    <span>{checking ? 'Проверка...' : 'Проверить статус'}</span>
                  </button>
                  <button
                    onClick={() => setActiveFoluxOrder(null)}
                    className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400 hover:text-white active:scale-95"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            ) : (
              /* Minimalist Deposit Selection Form */
              <div className="flex flex-col gap-4">
                {/* Method Selection */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Способ оплаты:
                  </span>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      onClick={() => setMethod('crypto')}
                      className={`py-4 px-2 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all min-h-[110px] ${
                        method === 'crypto'
                          ? 'border-zinc-400 bg-zinc-800 text-white shadow-lg'
                          : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <DirectCryptoIcon className="w-14 h-14" />
                      <span className="text-xs font-bold text-center leading-tight">
                        Криптовалюта
                        <span className="block text-[10px] font-mono text-zinc-400 font-semibold mt-0.5">(USDT)</span>
                      </span>
                    </button>

                    <button
                      onClick={() => setMethod('cryptobot')}
                      className={`py-4 px-2 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all min-h-[110px] ${
                        method === 'cryptobot'
                          ? 'border-zinc-400 bg-zinc-800 text-white shadow-lg'
                          : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <CryptoBotIcon className="w-14 h-14" />
                      <span className="text-xs font-bold text-center">CryptoBot</span>
                    </button>

                    <button
                      onClick={() => setMethod('card')}
                      className={`py-4 px-2 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all min-h-[110px] ${
                        method === 'card'
                          ? 'border-zinc-400 bg-zinc-800 text-white shadow-lg'
                          : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <BankCardIcon className="w-14 h-14 text-zinc-300" />
                      <span className="text-xs font-bold text-center">Карта / BLIK</span>
                    </button>
                  </div>
                </div>

                {/* Network Selection */}
                {method === 'crypto' && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Выберите сеть:
                    </span>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        onClick={() => setNetwork('TRC20')}
                        className={`py-3.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          network === 'TRC20'
                            ? 'border-zinc-400 bg-zinc-800 text-white shadow-md'
                            : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Trc20Icon className="w-10 h-10" />
                        <span className="text-xs font-extrabold">TRC-20</span>
                      </button>

                      <button
                        onClick={() => setNetwork('TON')}
                        className={`py-3.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          network === 'TON'
                            ? 'border-zinc-400 bg-zinc-800 text-white shadow-md'
                            : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <TonIcon className="w-10 h-10" />
                        <span className="text-xs font-extrabold">TON</span>
                      </button>

                      <button
                        onClick={() => setNetwork('BEP20')}
                        className={`py-3.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          network === 'BEP20'
                            ? 'border-zinc-400 bg-zinc-800 text-white shadow-md'
                            : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Bep20Icon className="w-10 h-10" />
                        <span className="text-xs font-extrabold">BEP-20</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Amount Input */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Сумма пополнения:
                  </span>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      value={depositAmountPln}
                      onChange={(e) => setDepositAmountPln(e.target.value)}
                      placeholder="100"
                      className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-3 text-base font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                    <span className="absolute right-3.5 font-semibold text-xs text-zinc-400">PLN</span>
                  </div>

                  {/* Real-time USD conversion */}
                  <div className="flex items-center justify-between text-xs text-zinc-400 px-1 mt-0.5">
                    <span>Конвертация в USD ($):</span>
                    <span className="font-mono font-semibold text-zinc-200">≈ {convertedUsd} USDT ($)</span>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {['50', '100', '250', '500'].map((val) => (
                      <button
                        key={val}
                        onClick={() => setDepositAmountPln(val)}
                        className="py-1.5 rounded-md bg-[#13151C] border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
                      >
                        {val} PLN
                      </button>
                    ))}
                  </div>
                </div>

                {error && <div className="text-xs text-rose-400 px-1 font-medium">{error}</div>}

                {/* Deposit Button */}
                <button
                  onClick={() => {
                    if (method === 'crypto') void startDirectCryptoDeposit();
                    else if (method === 'cryptobot') handleCryptoBotDeposit();
                    else if (method === 'card') void startCardDeposit();
                  }}
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs uppercase tracking-wider text-white shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>
                      {method === 'cryptobot' ? 'Перейти в CryptoBot' : 'Получить реквизиты'}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WITHDRAW */}
        {tab === 'withdraw' && !hasActiveRequisites && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Способ вывода:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setWKind('blik')}
                  className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                    wKind === 'blik'
                      ? 'border-zinc-500 bg-zinc-800 text-white'
                      : 'border-white/10 bg-[#13151C] text-zinc-400'
                  }`}
                >
                  <BankCardIcon className="w-5 h-5" />
                  <span className="text-xs font-semibold">BLIK / Телефон</span>
                </button>
                <button
                  onClick={() => setWKind('card')}
                  className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                    wKind === 'card'
                      ? 'border-zinc-500 bg-zinc-800 text-white'
                      : 'border-white/10 bg-[#13151C] text-zinc-400'
                  }`}
                >
                  <BankCardIcon className="w-5 h-5" />
                  <span className="text-xs font-semibold">Карта</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Сумма вывода (мин. 50 PLN):
              </span>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)}
                  placeholder="100"
                  className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-3 text-base font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <span className="absolute right-3.5 font-semibold text-xs text-zinc-400">PLN</span>
              </div>
            </div>

            {wKind === 'blik' ? (
              <div className="flex flex-col gap-2.5">
                <input
                  type="text"
                  value={wPhone}
                  onChange={(e) => setWPhone(e.target.value)}
                  placeholder="Номер телефона для BLIK"
                  className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <input
                  type="text"
                  value={wBank}
                  onChange={(e) => setWBank(e.target.value)}
                  placeholder="Название банка"
                  className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <input
                  type="text"
                  value={wHolder}
                  onChange={(e) => setWHolder(e.target.value)}
                  placeholder="Имя и Фамилия получателя"
                  className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <input
                  type="text"
                  value={wCard}
                  onChange={(e) => setWCard(e.target.value)}
                  placeholder="Номер карты"
                  className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <input
                  type="text"
                  value={wHolder}
                  onChange={(e) => setWHolder(e.target.value)}
                  placeholder="Имя и Фамилия получателя"
                  className="w-full bg-[#13151C] border border-white/15 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

            {wMsg && (
              <div className={`text-xs font-medium px-1 ${wMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {wMsg.text}
              </div>
            )}

            <button
              onClick={() => void submitWithdraw()}
              disabled={wSubmitting}
              className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs uppercase tracking-wider text-white shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
            >
              {wSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Отправить заявку на вывод</span>
              )}
            </button>
          </div>
        )}

        {/* History Navigation Button - Hidden when requisites are active */}
        {!hasActiveRequisites && (
          <button
            onClick={() => router.push('/balance/history')}
            className="w-full py-3 rounded-lg bg-[#13151C] hover:bg-zinc-800 border border-white/10 font-semibold text-xs text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-all active:scale-95 mt-2"
          >
            <History size={14} />
            <span>История транзакций</span>
          </button>
        )}
      </div>

      {/* Bank Error / Crypto Recommendation Modal */}
      {showBankErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#13151C] border border-white/10 p-6 flex flex-col items-center text-center gap-5 shadow-2xl relative">
            <button
              onClick={() => setShowBankErrorModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>

            {/* Warning Icon Badge */}
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg mt-1">
              <AlertTriangle size={28} />
            </div>

            {/* Title & Subtitle */}
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-extrabold text-white tracking-tight">
                Банковский платёж недоступен
              </h3>
              <p className="text-xs text-zinc-400 font-medium">
                Временный технический сбой банковского шлюза
              </p>
            </div>

            {/* Recommendation Box */}
            <div className="w-full rounded-xl bg-[#0A0B0E] border border-white/10 p-4 flex flex-col gap-2 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Zap size={15} />
                <span>Рекомендуем Криптовалюту (USDT)</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Оплата через банковские карты временно недоступна. Настоятельно рекомендуем воспользоваться <strong className="text-zinc-200">USDT</strong> — зачисление происходит автоматически 24/7 без задержек и дополнительных комиссий!
              </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2 mt-1">
              <button
                onClick={() => {
                  setShowBankErrorModal(false);
                  setMethod('crypto');
                }}
                className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs text-white uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Zap size={14} className="text-emerald-400" />
                <span>Перейти к Криптовалюте (USDT)</span>
              </button>
              <button
                onClick={() => setShowBankErrorModal(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-zinc-400 hover:text-white transition-all"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
