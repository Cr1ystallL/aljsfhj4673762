'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Wallet config.
 *
 * Edit the operational knobs that the casino actually uses today —
 * deposit / withdrawal limits and the wager (turnover) requirement.
 *
 * The legacy sections — crypto receive addresses, provider API keys,
 * per-method commissions — were removed at the operator's request.
 * Their server-side fields are no longer accepted; payment provider
 * credentials live in the .env file (or a secret manager) and are not
 * editable from the admin UI.
 */

interface WalletCfg {
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  wagerMultiplier: number;
  walletTrc20?: string;
  walletTon?: string;
  walletBep20?: string;
}

export default function WalletPage() {
  const [cfg, setCfg] = useState<WalletCfg | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/wallet-config', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = await res.json();
      setCfg(j.config);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (field: keyof WalletCfg, v: number) => {
    setCfg((c) => (c ? { ...c, [field]: v } : c));
  };

  const save = async () => {
    if (!cfg) return;
    if (reason.trim().length < 3) {
      alert('Причина обязательна');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/_x/wallet-config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось сохранить');
      } else {
        setReason('');
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return (
      <>
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Limits */}
        <Section
          title="Лимиты"
          help={{
            title: 'Лимиты на одну операцию',
            body: (
              <>
                <p>
                  Защита от фрода и от случайных огромных переводов.
                  Минимум фильтрует «пыль» — мелкие транзакции, на
                  которых только комиссия съедает всю прибыль.
                  Максимум — кап на одну операцию: для крупных сумм
                  оператор может разбить выплату на несколько заявок
                  или подтвердить вручную.
                </p>
              </>
            ),
          }}
        >
          <NumField
            label="Мин. депозит, zł"
            value={cfg.minDeposit}
            step={1}
            onChange={(v) => update('minDeposit', v)}
          />
          <NumField
            label="Макс. депозит, zł"
            value={cfg.maxDeposit}
            step={100}
            onChange={(v) => update('maxDeposit', v)}
          />
          <NumField
            label="Мин. вывод, zł"
            value={cfg.minWithdrawal}
            step={1}
            onChange={(v) => update('minWithdrawal', v)}
          />
          <NumField
            label="Макс. вывод, zł"
            value={cfg.maxWithdrawal}
            step={100}
            onChange={(v) => update('maxWithdrawal', v)}
          />
        </Section>

        {/* Wager */}
        <Section
          title="Вейджер"
          help={{
            title: 'Минимальный оборот для вывода',
            body: (
              <>
                <p>
                  Множитель депозита, который игрок должен прокрутить в
                  ставках перед тем, как сможет вывести. Стандартное
                  значение 1× — депозит ровно один раз должен пройти
                  через игры.
                </p>
                <p>
                  Защищает от схемы «занёс → сразу вывел»: между
                  депозитом и выводом не остаётся места для комиссии и
                  edge, что ломает экономику казино.
                </p>
                <p>
                  Большие значения (3×–5×) превращают сумму в чистый
                  бонусный депозит — игрок физически не сможет вывести
                  без длительной игры.
                </p>
              </>
            ),
          }}
        >
          <NumField
            label="Множитель оборота"
            value={cfg.wagerMultiplier}
            step={0.5}
            onChange={(v) => update('wagerMultiplier', v)}
            suffix="×"
          />
        </Section>

        {/* Crypto Deposit Addresses */}
        <Section
          title="Адреса кошельков для прямого пополнения"
          help={{
            title: 'Адреса для приема криптовалют',
            body: (
              <>
                <p>
                  На эти адреса пользователи переводят криптовалюту напрямую.
                  Система автоматически проверяет входящие переводы в блокчейне каждые 10–15 секунд.
                </p>
                <p>
                  Изменения сохраняются в базе данных и действуют сразу после сохранения без перезагрузки сервера.
                </p>
              </>
            ),
          }}
        >
          <TextField
            label="TRON (USDT TRC-20)"
            value={cfg.walletTrc20 || ''}
            placeholder="TYDny76y8Z423hX7hZ48g8273648hG823j"
            onChange={(v) => setCfg((c) => c ? { ...c, walletTrc20: v } : c)}
          />
          <TextField
            label="TON (USDT TON / TON)"
            value={cfg.walletTon || ''}
            placeholder="UQAZ83748293748923748923748923748923748923748"
            onChange={(v) => setCfg((c) => c ? { ...c, walletTon: v } : c)}
          />
          <TextField
            label="BNB Smart Chain (USDT BEP-20)"
            value={cfg.walletBep20 || ''}
            placeholder="0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
            onChange={(v) => setCfg((c) => c ? { ...c, walletBep20: v } : c)}
          />
        </Section>

        {/* Save */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col gap-2.5">
          <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            Причина изменения (обязательно)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: «Поднимаем минимум депозита до 20 zł»"
            inputMode="text"
            className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
          <div className="flex items-center justify-between gap-2">
            {savedFlash && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-pill border border-emerald-400/40 bg-emerald-400/10 font-roobert text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                Сохранено
              </span>
            )}
            <button
              onClick={save}
              disabled={busy || reason.trim().length < 3}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50 active:scale-95 transition-transform"
            >
              <Save size={13} strokeWidth={1.8} />
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: { title: string; body: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          {title}
        </span>
        <HelpButton title={help.title} size={12}>
          {help.body}
        </HelpButton>
      </div>
      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children}
      </div>
    </section>
  );
}

function NumField({
  label,
  value,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="flex-1 bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
        />
        {suffix && (
          <span className="font-roobert text-[12px] text-whisper-gray">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 col-span-1 sm:col-span-2">
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3.5 py-2 font-mono text-[12px] text-frost-white focus:outline-none focus:border-white/30"
      />
    </label>
  );
}
