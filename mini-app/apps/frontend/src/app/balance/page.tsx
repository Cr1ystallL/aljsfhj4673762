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
  ShieldCheck,
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
type DepositMethod = 'crypto' | 'cryptobot' | 'card';
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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Active orders
  const [activeFoluxOrder, setActiveFoluxOrder] = useState<FoluxPayOrder | null>(null);
  const [activeCryptoDeposit, setActiveCryptoDeposit] = useState<DirectCryptoDeposit | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);

  // Converted amount in USD
  const convertedUsd = useMemo(() => {
    const num = parseFloat(depositAmountPln);
    if (!Number.isFinite(num) || num <= 0) return '0.00';
    return (num / fxRate).toFixed(2);
  }, [depositAmountPln, fxRate]);

  // Load Active Orders
  const checkActiveOrders = useCallback(async () => {
    try {
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

  // Countdown Timer
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

  // Poll status every 10s
  useEffect(() => {
    if (!activeCryptoDeposit) return;
    const pollInterval = setInterval(() => {
      void checkActiveOrders();
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [activeCryptoDeposit, checkActiveOrders]);

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

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success('Скопировано');
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }, []);

  const formattedTimer = useMemo(() => {
    const min = Math.floor(timeLeftSec / 60);
    const sec = timeLeftSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [timeLeftSec]);

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

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-zinc-100 flex flex-col items-center pb-24 font-sans select-none">
      {/* Top Bar */}
      <div className="w-full max-w-md px-4 py-4 flex items-center justify-between border-b border-white/10 bg-[#0A0B0E]/90 backdrop-blur-md sticky top-0 z-30">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 active:scale-95 transition-transform"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-sm tracking-wide text-zinc-100 uppercase">
          Кошелек
        </span>
        <button
          onClick={() => router.push('/balance/history')}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 active:scale-95 transition-transform"
        >
          <History size={16} />
        </button>
      </div>

      <div className="w-full max-w-md px-4 pt-4 flex flex-col gap-4">
        {/* Minimalist Matte Balance Card */}
        <div className="rounded-xl border border-white/10 bg-[#13151C] p-4 flex flex-col gap-1 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Баланс аккаунта
            </span>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300">
              <ShieldCheck size={11} />
              <span>Безопасно</span>
            </div>
          </div>

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

        {/* Tab Switcher */}
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

        {/* TAB 1: DEPOSIT */}
        {tab === 'deposit' && (
          <div className="flex flex-col gap-4">
            {/* Active Direct Crypto View */}
            {activeCryptoDeposit ? (
              <div className="rounded-xl border border-zinc-700 bg-[#13151C] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-zinc-200">
                      Ожидание перевода
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs font-mono text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                    <Clock size={12} />
                    <span>{formattedTimer}</span>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400">
                  ID транзакции: <span className="font-mono text-zinc-200 font-semibold">{activeCryptoDeposit.id}</span>
                </div>

                {/* Clean QR Code */}
                <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-[#0A0B0E] border border-white/10">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      activeCryptoDeposit.depositAddress
                    )}`}
                    alt="QR Code"
                    className="w-36 h-36 rounded-md border border-white/10"
                  />
                  <span className="text-[10px] text-zinc-500 mt-2">Сканируйте в кошельке</span>
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
                  <span className="text-[11px] text-zinc-300 font-semibold">Точная сумма перевода:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-700">
                    <span className="font-mono text-sm font-bold text-white">
                      {activeCryptoDeposit.uniqueUsdt.toFixed(4)} USDT
                    </span>
                    <button
                      onClick={() => copyText(activeCryptoDeposit.uniqueUsdt.toFixed(4), 'amount')}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95"
                    >
                      {copied === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400 font-medium">Адрес кошелька:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-white/10">
                    <span className="font-mono text-[11px] text-zinc-300 break-all pr-2">
                      {activeCryptoDeposit.depositAddress}
                    </span>
                    <button
                      onClick={() => copyText(activeCryptoDeposit.depositAddress, 'address')}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white active:scale-95 flex-shrink-0"
                    >
                      {copied === 'address' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={checkActiveOrders}
                    className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs text-white flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <RefreshCw size={13} />
                    <span>Проверить статус</span>
                  </button>
                  <button
                    onClick={cancelDirectCryptoDeposit}
                    className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400 hover:text-white active:scale-95"
                  >
                    Отменить
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
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setMethod('crypto')}
                      className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                        method === 'crypto'
                          ? 'border-zinc-500 bg-zinc-800/80 text-white'
                          : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <DirectCryptoIcon className="w-6 h-6" />
                      <span className="text-[11px] font-semibold">Крипта</span>
                    </button>

                    <button
                      onClick={() => setMethod('cryptobot')}
                      className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                        method === 'cryptobot'
                          ? 'border-zinc-500 bg-zinc-800/80 text-white'
                          : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <CryptoBotIcon className="w-6 h-6" />
                      <span className="text-[11px] font-semibold">CryptoBot</span>
                    </button>

                    <button
                      onClick={() => setMethod('card')}
                      className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                        method === 'card'
                          ? 'border-zinc-500 bg-zinc-800/80 text-white'
                          : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <BankCardIcon className="w-6 h-6 text-zinc-300" />
                      <span className="text-[11px] font-semibold">Карта / BLIK</span>
                    </button>
                  </div>
                </div>

                {/* Network Selection */}
                {method === 'crypto' && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Выберите сеть:
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setNetwork('TRC20')}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                          network === 'TRC20'
                            ? 'border-zinc-500 bg-zinc-800/80 text-white'
                            : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Trc20Icon className="w-6 h-6" />
                        <span className="text-[11px] font-semibold">TRC-20</span>
                      </button>

                      <button
                        onClick={() => setNetwork('TON')}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                          network === 'TON'
                            ? 'border-zinc-500 bg-zinc-800/80 text-white'
                            : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <TonIcon className="w-6 h-6" />
                        <span className="text-[11px] font-semibold">TON</span>
                      </button>

                      <button
                        onClick={() => setNetwork('BEP20')}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                          network === 'BEP20'
                            ? 'border-zinc-500 bg-zinc-800/80 text-white'
                            : 'border-white/10 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Bep20Icon className="w-6 h-6" />
                        <span className="text-[11px] font-semibold">BEP-20</span>
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
                    else if (method === 'cryptobot') router.push('/balance');
                  }}
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs uppercase tracking-wider text-white shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Получить реквизиты</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WITHDRAW */}
        {tab === 'withdraw' && (
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
      </div>
    </div>
  );
}
