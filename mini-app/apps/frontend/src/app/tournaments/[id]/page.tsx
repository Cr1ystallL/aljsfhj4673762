'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trophy, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Spinner, Empty } from '@/components/ui/feedback';

interface LeaderboardUser {
  place: number;
  userId: string;
  balance: number;
  prize: number;
}

interface Tournament {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  gameType: string;
  prizePool: number;
  prizeMode: 'percent' | 'fixed';
  winnersCount: number;
  fixedPrize: number | null;
  startBalance: number;
  entryFee: number;
  startsAt: number;
  endsAt: number;
  cycleState: string;
  repeatType: string;
  joined: boolean;
  tournamentBalance: number | null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'завершено';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return \`\${d} д \${h} ч\`;
  if (h > 0) return \`\${h} ч \${m} м \${s} с\`;
  return \`\${m} м \${s} с\`;
}

export default function TournamentPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [data, setData] = useState<{ leaderboard: LeaderboardUser[]; self: any; tournament: Tournament } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(\`/api/tournaments/\${id}/leaderboard\`, { credentials: 'include' });
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onJoin = async () => {
    setBusy(true);
    try {
      const res = await fetch(\`/api/tournaments/\${id}/join\`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const remainingMs = data ? Math.max(0, data.tournament.endsAt - now) : 0;
  const remaining = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-whisper-gray text-[12px] hover:text-frost-white w-fit">
          <ArrowLeft size={14} /> Назад
        </button>
        <Empty text="Турнир не найден" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-10"><Spinner /></div>;
  }

  const { tournament: t, leaderboard, self } = data;

  return (
    <div className="flex flex-col gap-5 pb-10 max-w-[800px] mx-auto w-full p-4 sm:p-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-whisper-gray text-[12px] hover:text-frost-white transition-colors w-fit">
        <ArrowLeft size={14} /> Назад к бонусам
      </button>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[24px] border border-white/10"
      >
        {t.bannerUrl && (
          <div
            aria-hidden
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage: \`url(\${t.bannerUrl})\`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.85) 100%)' }} />
        <div aria-hidden className="absolute inset-0 opacity-50 mix-blend-screen pointer-events-none" style={{ background: 'radial-gradient(110% 90% at 100% 100%, rgba(255, 172, 46, 0.20) 0%, rgba(160, 224, 171, 0.10) 50%, transparent 80%)' }} />
        
        <div className="relative px-6 py-8 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-[#ffac2e]" strokeWidth={1.7} />
            <span className="font-roobert text-[11px] uppercase tracking-[0.28em] text-frost-white">
              Публичный турнир · {t.gameType.charAt(0).toUpperCase() + t.gameType.slice(1)}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-2">
              <h1 className="font-roobert text-frost-white text-[28px] sm:text-[36px] leading-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {t.title}
              </h1>
              {t.description && (
                <p className="font-roobert text-[14px] text-whisper-gray max-w-[500px]">
                  {t.description}
                </p>
              )}
            </div>
            <div className="text-left sm:text-right shrink-0">
              <div className="font-roobert text-frost-white text-[28px] font-light leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {t.prizePool.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} <span className="text-[16px] text-whisper-gray">zł</span>
              </div>
              <div className="mt-1.5 font-roobert text-[12px] text-whisper-gray tabular-nums">
                {t.winnersCount} победителей
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-white/10 mt-2">
            <div className="flex flex-col gap-1">
              <span className="font-roobert text-[12px] text-whisper-gray tabular-nums">
                {t.cycleState === 'ended' ? 'до начала' : 'до конца'}
              </span>
              <span className="font-roobert text-[14px] text-frost-white tabular-nums">
                {remaining}
              </span>
            </div>
            {t.joined ? (
              <span className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill border border-[rgba(160,224,171,0.55)] bg-[rgba(160,224,171,0.10)] font-roobert text-[12px] uppercase tracking-[0.18em] text-frost-white">
                Участвую
              </span>
            ) : (
              <button
                onClick={onJoin}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-6 h-10 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.2em] active:scale-[0.97] transition-transform disabled:opacity-50"
              >
                Участвовать
                <ArrowRight size={14} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </motion.section>

      <div className="flex flex-col gap-4 mt-4">
        <h2 className="font-roobert text-[18px] text-frost-white">Таблица лидеров</h2>
        {self && (
          <div className="rounded-[16px] border border-[#a0e0ab]/30 bg-[#a0e0ab]/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-roobert text-[#a0e0ab]">#{self.place}</span>
              <span className="text-[14px] font-roobert text-frost-white">Вы (Ваш результат)</span>
            </div>
            <span className="text-[14px] font-roobert text-[#ffac2e] tabular-nums">{self.balance.toFixed(0)} TM</span>
          </div>
        )}
        
        {leaderboard.length === 0 ? (
          <Empty text="Пока никто не участвует" />
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.map((user) => (
              <div key={user.userId} className="flex items-center justify-between p-4 rounded-[16px] border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <span className={user.place <= 3 ? 'text-[16px] font-roobert text-[#ffac2e]' : 'text-[14px] font-roobert text-whisper-gray'}>
                    #{user.place}
                  </span>
                  <span className="text-[14px] font-roobert text-frost-white">Участник {user.userId.slice(0, 5)}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[14px] font-roobert text-[#ffac2e] tabular-nums">{user.balance.toFixed(0)} TM</span>
                  {user.prize > 0 && (
                    <span className="text-[11px] font-roobert text-[#a0e0ab] tabular-nums">+{user.prize} zł</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
