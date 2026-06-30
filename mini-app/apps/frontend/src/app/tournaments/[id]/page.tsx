'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trophy, ArrowLeft, ArrowRight, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeaderboardUser {
  place: number;
  userId: string;
  user: { username?: string | null; firstName?: string | null; photoUrl?: string | null } | null;
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
  rebuyFee: number;
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
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} м ${s} с`;
  return `${m} м ${s} с`;
}

export default function TournamentPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [data, setData] = useState<{ leaderboard: LeaderboardUser[]; self: any; tournament: Tournament; isPreviousCycle?: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}/leaderboard`, { credentials: 'include' });
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
      const res = await fetch(`/api/tournaments/${id}/join`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (!confirm('Вы уверены, что хотите покинуть турнир? Ваш турнирный баланс будет обнулён.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tournaments/${id}/leave`, { method: 'POST', credentials: 'include' });
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

  const [showRebuyModal, setShowRebuyModal] = useState(false);

  useEffect(() => {
    if (data?.self && data.self.balance === 0 && data.tournament.rebuyFee >= 0) {
      setShowRebuyModal(true);
    } else {
      setShowRebuyModal(false);
    }
  }, [data?.self?.balance, data?.tournament?.rebuyFee]);

  const onRebuy = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tournaments/${id}/refresh`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setShowRebuyModal(false);
        await load();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error || 'Ошибка при докупке баланса');
      }
    } finally {
      setBusy(false);
    }
  };

  const isWaiting = data?.tournament.cycleState === 'waiting';
  const remainingMs = data ? Math.max(0, isWaiting ? data.tournament.startsAt - now : data.tournament.endsAt - now) : 0;
  const remaining = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-whisper-gray text-[12px] hover:text-frost-white w-fit">
          <ArrowLeft size={14} /> Назад
        </button>
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-8 text-center font-roobert text-[12px] text-whisper-gray">
          Турнир не найден
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border border-white/20 border-t-frost-white animate-spin" />
      </div>
    );
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
              backgroundImage: `url(${t.bannerUrl})`,
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
                {t.cycleState === 'ended' ? 'завершено' : isWaiting ? 'до начала' : 'до конца'}
              </span>
              <span className="font-roobert text-[14px] text-frost-white tabular-nums">
                {t.cycleState === 'ended' ? '—' : remaining}
              </span>
            </div>
            {t.cycleState === 'ended' ? (
              <span className="inline-flex items-center gap-1.5 px-6 h-12 rounded-pill bg-white/5 text-whisper-gray font-roobert text-[14px] uppercase tracking-[0.2em]">
                Завершен
              </span>
            ) : isWaiting ? (
              <span className="inline-flex items-center gap-1.5 px-6 h-12 rounded-pill bg-[rgba(255,172,46,0.15)] text-[#ffac2e] font-roobert text-[14px] uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(255,172,46,0.2)]">
                Ожидание турнира
              </span>
            ) : t.joined ? (
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="flex items-center gap-2 p-1.5 rounded-pill bg-white/5 border border-white/5 shadow-inner">
                  <span className="inline-flex items-center gap-2 px-6 h-12 rounded-pill bg-[rgba(160,224,171,0.15)] text-[rgba(160,224,171,0.9)] font-roobert text-[14px] uppercase tracking-[0.15em]">
                    Участвую
                  </span>
                  <button
                    onClick={onLeave}
                    disabled={busy}
                    title="Покинуть турнир"
                    className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-transparent hover:bg-[rgba(255,110,110,0.15)] text-whisper-gray hover:text-[#ff6e6e] transition-colors disabled:opacity-50"
                  >
                    <LogOut size={18} strokeWidth={2} />
                  </button>
                </div>
                {self && self.balance <= 0 && (
                  <button
                    onClick={onRebuy}
                    disabled={busy}
                    className="inline-flex items-center justify-center h-12 px-6 rounded-pill bg-gradient-to-r from-[#ffac2e] to-[#ff7e2e] text-[#1a1a1a] font-roobert font-bold text-[13px] uppercase tracking-wider hover:shadow-[0_0_20px_rgba(255,172,46,0.4)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50"
                  >
                    Докупить баланс ({t.rebuyFee > 0 ? `${t.rebuyFee} zł` : 'Бесплатно'})
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={onJoin}
                disabled={busy}
                className="relative overflow-hidden group inline-flex items-center gap-2 px-8 h-12 rounded-pill bg-gradient-to-r from-[#a0e0ab] to-[#60d075] text-[#0a1a0f] font-roobert font-bold text-[14px] uppercase tracking-[0.2em] hover:shadow-[0_0_25px_rgba(160,224,171,0.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                <span className="relative z-10 flex items-center gap-2">
                  Участвовать
                  <ArrowRight size={16} strokeWidth={2.5} />
                </span>
              </button>
            )}
          </div>
        </div>
      </motion.section>

      <div className="flex flex-col gap-4 mt-4">
        <h2 className="font-roobert text-[18px] text-frost-white">
          {data.isPreviousCycle ? 'Результаты прошлого турнира' : 'Таблица лидеров'}
        </h2>
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
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Пока никто не участвует
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.map((user) => {
              const uName = user.user?.firstName || user.user?.username || `Участник ${user.userId.slice(0, 5)}`;
              return (
                <div key={user.userId} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-3 rounded-[16px] border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <span className={user.place <= 3 ? 'w-6 text-center text-[16px] font-roobert text-[#ffac2e]' : 'w-6 text-center text-[14px] font-roobert text-whisper-gray'}>
                      #{user.place}
                    </span>
                    {user.user?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.user.photoUrl} alt={uName} className="w-10 h-10 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center font-roobert text-[14px] text-frost-white">
                        {uName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[14px] font-roobert text-frost-white max-w-[120px] sm:max-w-[200px] truncate">{uName}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[14px] font-roobert text-[#ffac2e] tabular-nums flex items-center gap-1">
                      {user.balance.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} <Trophy size={11} className="text-[#ffac2e]/70" />
                    </span>
                    {user.prize > 0 && (
                      <span className="text-[11px] font-roobert text-[#a0e0ab] tabular-nums">+{user.prize} zł</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showRebuyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowRebuyModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[400px] bg-midnight-canvas border border-white/15 rounded-[24px] overflow-hidden shadow-2xl flex flex-col items-center text-center p-6 sm:p-8"
            >
              <button
                onClick={() => setShowRebuyModal(false)}
                className="absolute top-4 right-4 text-whisper-gray hover:text-frost-white transition-colors"
              >
                <LogOut size={20} className="rotate-45" />
              </button>
              <div className="w-16 h-16 rounded-full bg-[#ffac2e]/20 flex items-center justify-center text-[#ffac2e] mb-4">
                <Trophy size={32} />
              </div>
              <h2 className="font-roobert text-[20px] text-frost-white mb-2">Кончился турнирный баланс?</h2>
              <p className="font-roobert text-[14px] text-whisper-gray mb-6 leading-relaxed">
                Не беда! Вы можете докупить его за {t.rebuyFee > 0 ? <strong className="text-frost-white">{t.rebuyFee} zł</strong> : 'бесплатно'} и продолжить соревнование.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setShowRebuyModal(false)}
                  className="flex-1 h-12 rounded-pill border border-white/15 bg-white/5 font-roobert text-[14px] text-frost-white hover:bg-white/10 transition-colors"
                >
                  Закрыть
                </button>
                <button
                  onClick={onRebuy}
                  disabled={busy}
                  className="flex-1 h-12 rounded-pill bg-[#ffac2e] text-black font-roobert text-[14px] font-medium hover:bg-[#e09828] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {busy ? 'Покупка...' : 'К Турниру'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
