'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Save } from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Wallet config.
 *
 * Edit crypto addresses, payment-provider API keys, limits and
 * commissions. Secrets render masked by default; the «Раскрыть»
 * button does a fresh fetch with `reveal=1` after a confirmation.
 */

interface WalletCfg {
  cryptoUsdtTrc20: string;
  cryptoBtc: string;
  cryptoEth: string;
  piastrixApiKey: string;
  freekassaApiKey: string;
  fkWalletApiKey: string;
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  wagerMultiplier: number;
  cryptoFee: number;
  cardFee: number;
}

export default function WalletPage() {
  const [cfg, setCfg] = useState<WalletCfg | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async (reveal = false) => {
    try {
      const res = await fetch(
        `/api/_x/wallet-config${reveal ? '?reveal=1' : ''}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!res.ok) return;
      const j = await res.json();
      setCfg(j.config);
      setRevealed(reveal);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const update = (field: keyof WalletCfg, v: string | number) => {
    setCfg((c) => (c ? { ...c, [field]: v } : c));
  };

  const reveal = async () => {
    if (
      !confirm(
        'Раскрыть API-ключи в открытом виде? Это действие будет видно в аудите.'
      )
    ) {
      return;
    }
    await load(true);
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
        await load(false);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return (
      <AdminShell title="Кошелёк">
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Кошелёк">
      <div className="flex flex-col gap-5">
        {/* Crypto addresses */}
        <Section
          title="Крипто-адреса"
          help={{
            title: 'Куда поступают крипто-депозиты',
            body: (
              <>
                <p>
                  Адреса вашего казино для приёма USDT (TRC20), BTC, ETH.
                  Игроки переводят сюда; мы детектируем входящие
                  транзакции и зачисляем баланс.
                </p>
                <p>
                  Меняйте только если меняете рабочий кошелёк.{' '}
                  <strong>Любая смена адреса — критическая операция</strong>:
                  если вы поставите чужой адрес, депозиты уйдут не туда.
                </p>
              </>
            ),
          }}
        >
          <Field
            label="USDT (TRC20)"
            value={cfg.cryptoUsdtTrc20}
            onChange={(v) => update('cryptoUsdtTrc20', v)}
            placeholder="Tx..."
          />
          <Field
            label="BTC"
            value={cfg.cryptoBtc}
            onChange={(v) => update('cryptoBtc', v)}
            placeholder="bc1..."
          />
          <Field
            label="ETH"
            value={cfg.cryptoEth}
            onChange={(v) => update('cryptoEth', v)}
            placeholder="0x..."
          />
        </Section>

        {/* Provider API keys */}
        <Section
          title="API-ключи провайдеров"
          help={{
            title: 'Зачем эти ключи',
            body: (
              <>
                <p>
                  Нужны для интеграции с платёжными провайдерами:{' '}
                  <strong>Piastrix</strong>, <strong>FreeKassa</strong>,{' '}
                  <strong>FK Wallet</strong>. Через них принимаются
                  карточные депозиты и выводы на электронные кошельки.
                </p>
                <p>
                  По умолчанию ключи показаны замаскированно
                  (••••XXXX). Если оставить поле пустым при сохранении —
                  ключ <strong>не изменится</strong>. Чтобы увидеть
                  настоящие значения — нажмите «Раскрыть» (это запишется
                  в аудит).
                </p>
                <p>
                  При компрометации ключа: смените значение в кабинете
                  провайдера → вставьте новое сюда → сохраните. Старый
                  ключ перестанет работать после следующего HTTP-запроса
                  к провайдеру.
                </p>
              </>
            ),
            extra: (
              <button
                onClick={reveal}
                className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 text-frost-white/85 transition-colors font-roobert text-[10px]"
              >
                {revealed ? (
                  <EyeOff size={10} strokeWidth={1.7} />
                ) : (
                  <Eye size={10} strokeWidth={1.7} />
                )}
                {revealed ? 'Скрыть' : 'Раскрыть'}
              </button>
            ),
          }}
        >
          <Field
            label="Piastrix"
            value={cfg.piastrixApiKey}
            onChange={(v) => update('piastrixApiKey', v)}
            placeholder={revealed ? '' : '(не изменять)'}
            secret
          />
          <Field
            label="FreeKassa"
            value={cfg.freekassaApiKey}
            onChange={(v) => update('freekassaApiKey', v)}
            placeholder={revealed ? '' : '(не изменять)'}
            secret
          />
          <Field
            label="FK Wallet"
            value={cfg.fkWalletApiKey}
            onChange={(v) => update('fkWalletApiKey', v)}
            placeholder={revealed ? '' : '(не изменять)'}
            secret
          />
        </Section>

        {/* Limits */}
        <Section
          title="Лимиты"
          help={{
            title: 'Лимиты на одну операцию',
            body: (
              <>
                <p>
                  Защита от фрода и от случайных огромных переводов.
                  Минимум — фильтрует «пыль» (мелкие транзакции, на
                  которых только комиссия съедает прибыль). Максимум —
                  кап на одну операцию; для крупных сумм используйте
                  несколько транзакций или ручную обработку.
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
                  ставках перед тем как сможет вывести. Стандартное
                  значение 1× — депозит ровно один раз должен пройти
                  через игры.
                </p>
                <p>
                  Защищает от схемы «занёс → сразу вывел» — она ломает
                  экономику казино, потому что между депозитом и выводом
                  не остаётся места для комиссии и edge.
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

        {/* Commissions */}
        <Section
          title="Комиссии"
          help={{
            title: 'Комиссии при операциях',
            body: (
              <>
                <p>
                  Дополнительный сбор сверх провайдерской комиссии. Идёт
                  в карман казино. Указывается в долях единицы:
                  <code> 0.025 = 2.5%</code>. Хардкап на стороне сервера: 50%.
                </p>
                <p>
                  Эту комиссию игрок видит на этапе выбора метода
                  пополнения / вывода — в виде «к получению Y zł, итого Z».
                </p>
              </>
            ),
          }}
        >
          <NumField
            label="Крипто, доля"
            value={cfg.cryptoFee}
            step={0.005}
            onChange={(v) => update('cryptoFee', v)}
          />
          <NumField
            label="Карта, доля"
            value={cfg.cardFee}
            step={0.005}
            onChange={(v) => update('cardFee', v)}
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
            placeholder="Например: «Меняем USDT-адрес на новый кошелёк»"
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
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50"
            >
              <Save size={13} strokeWidth={1.8} />
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: { title: string; body: React.ReactNode; extra?: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          {title}
        </span>
        <div className="flex items-center gap-1">
          {help.extra}
          <HelpButton title={help.title} size={12}>
            {help.body}
          </HelpButton>
        </div>
      </div>
      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={`bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30 ${
          secret ? 'font-mono' : ''
        }`}
      />
    </label>
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
