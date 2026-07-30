'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  Copy,
  Check,
  History,
  X,
  AlertTriangle,
  Clock,
  RefreshCw,
  Zap,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useBalanceStore } from '@/store/balance-store';
import { toast } from '@/store/toast-store';
import { reportApiError } from '@/lib/api/errors';
import {
  Trc20Icon,
  TonIcon,
  Bep20Icon,
  UsdtIcon,
  CryptoBotIcon,
  DirectCryptoIcon,
  BankCardIcon,
} from '@/components/ui/crypto-networks';

type Tab = 'deposit' | 'withdraw';
type DepositMethod = 'card' | 'cryptobot' | 'crypto';
type CryptoNetwork = 'TRC20' | 'TON' | 'BEP20';
type WithdrawKind = 'blik' | 'card';

interface FoluxPayOrder {
  orderId: string;
  uniqueAmount: number;
  type: string;
  card: string;
  recipient: string;
  details: string;
  expiresInMinutes: number;
}

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

export default function BalancePage() {
  const router = useRouter();
  const balance = useBalanceStore((s) => s.balance);
  const amountPln = balance?.amount ?? 0;

  const [tab, setTab] = useState<Tab>('deposit');
  const [method, setMethod] = useState<DepositMethod>('crypto');
  const [network, setNetwork] = useState<CryptoNetwork>('TRC20');

  // -------- Exchange Rate ----------------------------------------------------
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

  // -------- Deposit State ---------------------------------------------------
  const [depositAmountPln, setDepositAmountPln] = useState<string>('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [depositDisabledModal, setDepositDisabledModal] = useState(false);

  // Active orders
  const [activeFoluxOrder, setActiveFoluxOrder] = useState<FoluxPayOrder | null>(null);
  const [activeCryptoDeposit, setActiveCryptoDeposit] = useState<DirectCryptoDeposit | null>(null);

  // Countdown timer for active direct crypto deposit
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);

  // Calculated converted amount in USD ($)
  const convertedUsd = useMemo(() => {
    const num = parseFloat(depositAmountPln);
    if (!Number.isFinite(num) || num <= 0) return '0.00';
    return (num / fxRate).toFixed(2);
  }, [depositAmountPln, fxRate]);

  // -------- Load Active Orders ----------------------------------------------
  const checkActiveOrders = useCallback(async () => {
    try {
      // Check active direct crypto deposit
      const cryptoRes = await fetch('/api/crypto-deposit/active', { credentials: 'include' });
      if (cryptoRes.ok) {
        const j = await cryptoRes.json();
        if (j.activeDeposit) {
          setActiveCryptoDeposit(j.activeDeposit as DirectCryptoDeposit);
          setTimeLeftSec(j.activeDeposit.expiresInSeconds);
        } else {
          setActiveCryptoDeposit(null);
        }
      }
    } catch {}

    try {
      // Check active FoluxPay order
      const foluxRes = await fetch('/api/foluxpay/active', { credentials: 'include' });
      if (foluxRes.ok) {
        const j = await foluxRes.json();
        if (j.activeOrder) {
          setActiveFoluxOrder(j.activeOrder as FoluxPayOrder);
        } else {
          setActiveFoluxOrder(null);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    void checkActiveOrders();
  }, [checkActiveOrders]);

  // Live timer tick for active direct crypto deposit
  useEffect(() => {
    if (!activeCryptoDeposit || timeLeftSec <= 0) return;
    const interval = setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          void checkActiveOrders();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCryptoDeposit, timeLeftSec, checkActiveOrders]);

  // Polling active deposit status every 10 seconds
  useEffect(() => {
    if (!activeCryptoDeposit) return;
    const pollInterval = setInterval(() => {
      void checkActiveOrders();
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [activeCryptoDeposit, checkActiveOrders]);

  // -------- Deposit Handlers ------------------------------------------------

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
        toast.success('Заявка создана. Переведите точную сумму на указанный адрес.');
      }
    } catch {
      setError('Сетевая ошибка. Попробуйте позже.');
      toast.error('Сетевая ошибка. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  }, [depositAmountPln, network]);

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

  const startFoluxDeposit = useCallback(async () => {
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
      if (res.status === 403) {
        setDepositDisabledModal(true);
        setLoading(false);
        return;
      }
      if (!res.ok || !j.ok) {
        const msg = reportApiError(res, j, 'Не удалось создать заявку');
        setError(msg);
      } else {
        setActiveFoluxOrder(j as FoluxPayOrder);
        toast.success('Заявка создана.');
      }
    } catch {
      setError('Сетевая ошибка.');
      toast.error('Сетевая ошибка.');
    } finally {
      setLoading(false);
    }
  }, [depositAmountPln]);

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success('Скопировано в буфер обмена');
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }, []);

  // Format timer MM:SS
  const formattedTimer = useMemo(() => {
    const min = Math.floor(timeLeftSec / 60);
    const sec = timeLeftSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [timeLeftSec]);

  // -------- Withdraw State & Handlers ----------------------------------------
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
        setWMsg({ ok: true, text: 'Заявка на вывод отправлена на рассмотрение!' });
        toast.success('Заявка на вывод отправлена!');
      }
    } catch {
      setWMsg({ ok: false, text: 'Сетевая ошибка. Попробуйте позже.' });
    } finally {
      setWSubmitting(false);
    }
  }, [wAmount, amountPln, wKind, wPhone, wBank, wHolder, wCard]);

  return (
    <div className="min-h-screen bg-[#0A0B10] text-white flex flex-col items-center pb-24 font-sans select-none">
      {/* Header Bar */}
      <div className="w-full max-w-md px-4 py-4 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-30">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 active:scale-95 transition-transform"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="font-bold text-base tracking-wide bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent uppercase">
          Кошелек
        </span>
        <button
          onClick={() => router.push('/balance/history')}
          className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 active:scale-95 transition-transform"
        >
          <History size={18} />
        </button>
      </div>

      <div className="w-full max-w-md px-4 pt-4 flex flex-col gap-5">
        {/* Balance Card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 via-white/[0.04] to-black/60 p-5 shadow-2xl backdrop-blur-xl">
          <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-widest text-white/50 font-medium">Ваш баланс</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400">
              <ShieldCheck size={12} />
              <span>Защищено</span>
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">
              {amountPln.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-lg font-bold text-white/60">PLN</span>
          </div>

          <div className="mt-1 text-xs text-white/40 font-medium">
            ≈ {(amountPln / fxRate).toFixed(2)} USD ($)
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setTab('deposit')}
            className={`py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              tab === 'deposit'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <ArrowDownToLine size={15} />
            <span>Пополнение</span>
          </button>
          <button
            onClick={() => setTab('withdraw')}
            className={`py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              tab === 'withdraw'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <ArrowUpFromLine size={15} />
            <span>Вывод средств</span>
          </button>
        </div>

        {/* TAB 1: DEPOSIT */}
        {tab === 'deposit' && (
          <div className="flex flex-col gap-5">
            {/* Active Direct Crypto Deposit View */}
            {activeCryptoDeposit ? (
              <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5 backdrop-blur-xl flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Ожидание оплаты
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-full">
                    <Clock size={13} />
                    <span>{formattedTimer}</span>
                  </div>
                </div>

                <div className="text-xs text-white/60">
                  Заявка: <span className="font-mono font-bold text-white">{activeCryptoDeposit.id}</span>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center justify-center my-2 p-3 rounded-xl bg-white/5 border border-white/10">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                      activeCryptoDeposit.depositAddress
                    )}`}
                    alt="QR Code"
                    className="w-40 h-40 rounded-lg shadow-md border border-white/20"
                  />
                  <span className="text-[11px] text-white/50 mt-2">Сканируйте для оплаты</span>
                </div>

                {/* Network & Exact Amount */}
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                    Сеть перевода:
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                    {activeCryptoDeposit.network === 'TRC20' && <Trc20Icon className="w-6 h-6" />}
                    {activeCryptoDeposit.network === 'TON' && <TonIcon className="w-6 h-6" />}
                    {activeCryptoDeposit.network === 'BEP20' && <Bep20Icon className="w-6 h-6" />}
                    <span className="font-bold text-sm text-white">
                      {activeCryptoDeposit.network === 'TRC20' && 'TRON (USDT TRC-20)'}
                      {activeCryptoDeposit.network === 'TON' && 'TON (USDT TON / TON)'}
                      {activeCryptoDeposit.network === 'BEP20' && 'BNB Smart Chain (BEP-20)'}
                    </span>
                  </div>
                </div>

                {/* Exact USDT Amount */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs text-amber-400/90 font-bold uppercase tracking-wider">
                    Отправьте ТОЧНУЮ сумму:
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-400/10 border border-amber-400/30">
                    <span className="font-mono text-lg font-extrabold text-amber-300">
                      {activeCryptoDeposit.uniqueUsdt.toFixed(4)} USDT
                    </span>
                    <button
                      onClick={() =>
                        copyText(activeCryptoDeposit.uniqueUsdt.toFixed(4), 'usdt_amount')
                      }
                      className="p-2 rounded-lg bg-amber-400/20 text-amber-200 active:scale-95"
                    >
                      {copied === 'usdt_amount' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                    Адрес кошелька:
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <span className="font-mono text-xs text-white/90 break-all select-all pr-2">
                      {activeCryptoDeposit.depositAddress}
                    </span>
                    <button
                      onClick={() => copyText(activeCryptoDeposit.depositAddress, 'wallet_addr')}
                      className="p-2 rounded-lg bg-white/10 text-white active:scale-95 flex-shrink-0"
                    >
                      {copied === 'wallet_addr' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={checkActiveOrders}
                    className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-xs uppercase tracking-wider text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-purple-600/30"
                  >
                    <RefreshCw size={14} />
                    <span>Проверить статус</span>
                  </button>
                  <button
                    onClick={cancelDirectCryptoDeposit}
                    className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-xs uppercase tracking-wider text-white/60 hover:text-white active:scale-95 transition-all"
                  >
                    Отменить
                  </button>
                </div>
              </div>
            ) : (
              /* Deposit Form */
              <div className="flex flex-col gap-5">
                {/* Method Selector */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Способ пополнения:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setMethod('crypto')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                        method === 'crypto'
                          ? 'border-purple-500 bg-purple-500/15 shadow-lg shadow-purple-500/20'
                          : 'border-white/10 bg-white/[0.03] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <DirectCryptoIcon className="w-7 h-7" />
                      <span className="text-[11px] font-bold text-white">Крипта</span>
                    </button>

                    <button
                      onClick={() => setMethod('cryptobot')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                        method === 'cryptobot'
                          ? 'border-cyan-500 bg-cyan-500/15 shadow-lg shadow-cyan-500/20'
                          : 'border-white/10 bg-white/[0.03] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <CryptoBotIcon className="w-7 h-7" />
                      <span className="text-[11px] font-bold text-white">CryptoBot</span>
                    </button>

                    <button
                      onClick={() => setMethod('card')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                        method === 'card'
                          ? 'border-blue-500 bg-blue-500/15 shadow-lg shadow-blue-500/20'
                          : 'border-white/10 bg-white/[0.03] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <BankCardIcon className="w-7 h-7" />
                      <span className="text-[11px] font-bold text-white">Карта / BLIK</span>
                    </button>
                  </div>
                </div>

                {/* Network Selection (If Direct Crypto selected) */}
                {method === 'crypto' && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Выберите крипто-сеть:
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setNetwork('TRC20')}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                          network === 'TRC20'
                            ? 'border-red-500 bg-red-500/15 shadow-lg shadow-red-500/20'
                            : 'border-white/10 bg-white/[0.03] opacity-60 hover:opacity-100'
                        }`}
                      >
                        <Trc20Icon className="w-7 h-7" />
                        <span className="text-[11px] font-bold text-white">TRC-20</span>
                      </button>

                      <button
                        onClick={() => setNetwork('TON')}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                          network === 'TON'
                            ? 'border-sky-500 bg-sky-500/15 shadow-lg shadow-sky-500/20'
                            : 'border-white/10 bg-white/[0.03] opacity-60 hover:opacity-100'
                        }`}
                      >
                        <TonIcon className="w-7 h-7" />
                        <span className="text-[11px] font-bold text-white">TON</span>
                      </button>

                      <button
                        onClick={() => setNetwork('BEP20')}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                          network === 'BEP20'
                            ? 'border-amber-500 bg-amber-500/15 shadow-lg shadow-amber-500/20'
                            : 'border-white/10 bg-white/[0.03] opacity-60 hover:opacity-100'
                        }`}
                      >
                        <Bep20Icon className="w-7 h-7" />
                        <span className="text-[11px] font-bold text-white">BEP-20</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Amount Input with Live PLN -> USD Conversion */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Сумма пополнения:
                  </span>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      value={depositAmountPln}
                      onChange={(e) => setDepositAmountPln(e.target.value)}
                      placeholder="100"
                      className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3.5 text-lg font-bold text-white placeholder-white/20 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <span className="absolute right-4 font-bold text-sm text-white/60">PLN</span>
                  </div>

                  {/* Real-time USD conversion badge */}
                  <div className="flex items-center justify-between px-1 text-xs text-white/60">
                    <span>Конвертация в USD ($):</span>
                    <span className="font-mono font-bold text-emerald-400">≈ {convertedUsd} USDT ($)</span>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {['50', '100', '250', '500'].map((val) => (
                      <button
                        key={val}
                        onClick={() => setDepositAmountPln(val)}
                        className="py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                      >
                        {val} PLN
                      </button>
                    ))}
                  </div>
                </div>

                {error && <div className="text-xs font-semibold text-rose-400 px-1">{error}</div>}

                {/* Submit Deposit Button */}
                <button
                  onClick={() => {
                    if (method === 'crypto') void startDirectCryptoDeposit();
                    else if (method === 'card') void startFoluxDeposit();
                    else if (method === 'cryptobot') router.push('/balance'); // CryptoBot instructions
                  }}
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 font-bold text-sm uppercase tracking-wider text-white shadow-xl shadow-purple-600/30 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>Получить реквизиты для оплаты</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WITHDRAW */}
        {tab === 'withdraw' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                Способ вывода:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setWKind('blik')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    wKind === 'blik'
                      ? 'border-purple-500 bg-purple-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/50'
                  }`}
                >
                  <BankCardIcon className="w-5 h-5" />
                  <span className="text-xs font-bold">BLIK / Телефон</span>
                </button>
                <button
                  onClick={() => setWKind('card')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    wKind === 'card'
                      ? 'border-purple-500 bg-purple-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/50'
                  }`}
                >
                  <BankCardIcon className="w-5 h-5" />
                  <span className="text-xs font-bold">Карта</span>
                </button>
              </div>
            </div>

            {/* Withdraw Amount */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                Сумма вывода (мин. 50 PLN):
              </span>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)}
                  placeholder="100"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3.5 text-lg font-bold text-white placeholder-white/20 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <span className="absolute right-4 font-bold text-sm text-white/60">PLN</span>
              </div>
            </div>

            {/* Requisites Inputs */}
            {wKind === 'blik' ? (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={wPhone}
                  onChange={(e) => setWPhone(e.target.value)}
                  placeholder="Номер телефона для BLIK"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={wBank}
                  onChange={(e) => setWBank(e.target.value)}
                  placeholder="Название банка"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={wHolder}
                  onChange={(e) => setWHolder(e.target.value)}
                  placeholder="Имя и Фамилия получателя"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={wCard}
                  onChange={(e) => setWCard(e.target.value)}
                  placeholder="Номер карты"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={wHolder}
                  onChange={(e) => setWHolder(e.target.value)}
                  placeholder="Имя и Фамилия получателя"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            )}

            {wMsg && (
              <div
                className={`text-xs font-semibold px-1 ${
                  wMsg.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {wMsg.text}
              </div>
            )}

            <button
              onClick={() => void submitWithdraw()}
              disabled={wSubmitting}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-bold text-sm uppercase tracking-wider text-white shadow-xl shadow-purple-600/30 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {wSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Отправить заявку на вывод</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
