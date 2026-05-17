'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ShieldAlert, Activity } from 'lucide-react';import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Anti-fraud alerts.
 *
 * Heuristic patterns flagged by the backend in real-time. Each alert
 * links to the affected user's detail page where the admin can take
 * action (block, freeze withdrawals, adjust balance, etc.).
 */

interface Alert {
  id: string;
  type: 'huge_win' | 'rapid_bets' | 'multi_account_ip' | string;
  severity: 'info' | 'warn' | 'critical';
  userId: string;
  name: string;
  photoUrl: string | null;
  telegramId: number | null;
  message: string;
  at: number;
}

export default function AlertsPage() {
  const router = useRouter();
  const [data, setData] = useState<Alert[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/_x/alerts', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setData([]);
          return;
        }
        const j = await res.json();
        if (!cancelled) setData(j.alerts ?? []);
      } catch {
        if (!cancelled) setData([]);
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Подозрительные паттерны · {data?.length ?? 0}
          </span>
          <HelpButton title="Что такое алерты">
            <p>
              Бэкенд раз в 30 секунд анализирует недавнюю активность и
              ищет шаблоны, которые часто бывают у фрода. Сохраняем
              только список — без действий, чтобы вы решали сами.
            </p>
            <p>
              <strong>Huge win</strong> — выигрыш сильно превышает
              недавний депозит игрока (×10 и выше).<br />
              <strong>Rapid bets</strong> — больше 200 ставок за час с
              одного аккаунта; бывает у бот-аккаунтов или эксплоитеров.
            </p>
            <p>
              Кликните по алерту — попадёте в карточку игрока, где можно
              быстро заморозить счёт или снять ограничения.
            </p>
          </HelpButton>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Подозрительной активности не обнаружено.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((a) => (
              <button
                key={a.id}
                onClick={() => router.push(`/system/console/users/${a.userId}`)}
                className="w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
              >
                <SeverityIcon severity={a.severity} type={a.type} />
                <div className="min-w-0">
                  <div className="font-roobert text-[13px] text-frost-white truncate">
                    {a.name}
                    {a.telegramId !== null && (
                      <span className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                        {' '}
                        · #{a.telegramId}
                      </span>
                    )}
                  </div>
                  <div className="font-roobert text-[12px] text-whisper-gray truncate">
                    {a.message}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-roobert text-[10px] uppercase tracking-[0.18em] ${
                      a.severity === 'critical'
                        ? 'text-[#ff8a76]'
                        : a.severity === 'warn'
                        ? 'text-amber-200'
                        : 'text-whisper-gray'
                    }`}
                  >
                    {a.severity}
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                    {new Date(a.at).toLocaleTimeString('ru-RU')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SeverityIcon({
  severity,
  type,
}: {
  severity: 'info' | 'warn' | 'critical';
  type: string;
}) {
  const Icon =
    type === 'rapid_bets'
      ? Activity
      : severity === 'critical'
      ? ShieldAlert
      : AlertTriangle;
  const color =
    severity === 'critical'
      ? 'text-[#ff8a76]'
      : severity === 'warn'
      ? 'text-amber-300'
      : 'text-frost-white/65';
  return (
    <span
      className={`w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center ${color}`}
    >
      <Icon size={16} strokeWidth={1.7} />
    </span>
  );
}
