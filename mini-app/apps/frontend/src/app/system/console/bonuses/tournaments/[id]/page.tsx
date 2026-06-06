'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Power, CheckCircle, Trash2, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
interface TournamentParticipant {
  id: string;
  userId: string;
  username?: string;
  firstName?: string;
  balance: number;
  joinedAt: number;
}

interface TournamentDetails {
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
  startAtGmt1: string;
  durationHours: number;
  startsAt: number;
  endsAt: number;
  cycleState?: string;
  repeatType: string;
  active: boolean;
  participants: TournamentParticipant[];
}

export default function AdminTournamentPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [data, setData] = useState<TournamentDetails | null>(null);
  const [error, setError] = useState(false);
  const [actionBusy, setActionBusy] = useState<'start' | 'end' | 'delete' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/_x/tournaments/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setData(json.tournament);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const forceAction = async (mode: 'start' | 'end') => {
    setActionBusy(mode);
    try {
      await fetch(`/api/_x/tournaments/${id}/force-${mode}`, {
        method: 'POST',
        credentials: 'include',
      });
      await load();
    } finally {
      setActionBusy(null);
    }
  };

  const removeTournament = async () => {
    if (!confirm('Удалить турнир? Все циклы и участники исчезнут навсегда!')) return;
    setActionBusy('delete');
    try {
      const res = await fetch(`/api/_x/tournaments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        router.push('/system/console/bonuses?tab=tournaments');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('ru-RU', {
      timeZone: 'Europe/Warsaw',
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4">
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
      <div className="rounded-card border border-white/10 bg-white/[0.03] py-10 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border border-white/20 border-t-frost-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-whisper-gray text-[12px] hover:text-frost-white transition-colors">
          <ArrowLeft size={14} /> Назад
        </button>
        <span className={cn('px-2 py-1 rounded-pill text-[10px] uppercase tracking-wider border', data.cycleState === 'ended' ? 'text-[#ffb199] border-[#ffb199]/50 bg-[#ffb199]/10' : data.active ? 'text-[#a0e0ab] border-[#a0e0ab]/50 bg-[#a0e0ab]/10' : 'text-whisper-gray border-white/20')}>
          {data.cycleState === 'ended' ? 'Цикл завершён' : data.active ? 'Активен' : 'Выключен'}
        </span>
      </div>

      <div className="rounded-card border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="inline-flex items-center gap-1.5 text-[#ffac2e] text-[12px] uppercase tracking-[0.2em] font-roobert">
              <Trophy size={14} /> {data.gameType}
            </div>
            <h1 className="text-[20px] sm:text-[24px] font-roobert text-frost-white leading-tight">{data.title}</h1>
            {data.description && <p className="text-[12px] text-whisper-gray mt-1">{data.description}</p>}
          </div>
          <div className="flex flex-col items-end text-right">
            <span className="text-[20px] font-roobert text-frost-white leading-none">
              {data.prizeMode === 'percent' ? data.prizePool.toFixed(0) : (data.fixedPrize! * data.winnersCount).toFixed(0)} <span className="text-[14px] text-whisper-gray">zł</span>
            </span>
            <span className="text-[11px] text-whisper-gray mt-1">Победителей: {data.winnersCount}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-white/10 mt-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-whisper-gray uppercase tracking-wider">Тип</span>
            <span className="text-[12px] text-frost-white tabular-nums">{data.entryFee > 0 ? `Взнос ${data.entryFee} zł` : 'Бесплатно'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-whisper-gray uppercase tracking-wider">Повтор</span>
            <span className="text-[12px] text-frost-white tabular-nums">{data.repeatType === 'once' ? 'Единоразовый' : 'Ежедневный'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-whisper-gray uppercase tracking-wider">Начало</span>
            <span className="text-[12px] text-frost-white tabular-nums">{formatDate(data.startsAt)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-whisper-gray uppercase tracking-wider">Конец</span>
            <span className="text-[12px] text-frost-white tabular-nums">{formatDate(data.endsAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            onClick={() => forceAction('start')}
            disabled={actionBusy === 'start'}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-[12px] text-frost-white transition-colors disabled:opacity-50"
          >
            <Power size={14} />
            {actionBusy === 'start' ? 'Стартуем…' : 'Стартовать сейчас'}
          </button>
          <button
            onClick={() => forceAction('end')}
            disabled={actionBusy === 'end'}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-[12px] text-frost-white transition-colors disabled:opacity-50"
          >
            <CheckCircle size={14} />
            {actionBusy === 'end' ? 'Завершаем…' : 'Завершить и выплатить'}
          </button>
          <button
            onClick={removeTournament}
            disabled={actionBusy === 'delete'}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill border border-[#ff8a76]/30 bg-[#ff8a76]/10 hover:bg-[#ff8a76]/20 text-[12px] text-[#ff8a76] transition-colors disabled:opacity-50 ml-auto"
          >
            <Trash2 size={14} />
            {actionBusy === 'delete' ? 'Удаляем…' : 'Удалить'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1 text-whisper-gray">
          <Users size={14} />
          <span className="font-roobert text-[12px] uppercase tracking-wider">Участники текущего цикла ({data.participants.length})</span>
        </div>
        {data.participants.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Пока нет участников
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="grid grid-cols-[30px_1fr_100px_100px] gap-2 px-4 py-2 border-b border-white/10 text-[10px] text-whisper-gray uppercase tracking-wider">
              <span>#</span>
              <span>Игрок</span>
              <span className="text-right">Баланс (TM)</span>
              <span className="text-right">Вступил</span>
            </div>
            {data.participants.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-[30px_1fr_100px_100px] gap-2 px-4 py-3 border-b border-white/5 last:border-0 text-[12px] text-frost-white items-center hover:bg-white/[0.02]">
                <span className="text-whisper-gray">{idx + 1}</span>
                <span className="truncate">{p.username ? `@${p.username}` : p.firstName || p.userId}</span>
                <span className="text-right tabular-nums font-medium text-[#ffac2e]">{p.balance.toFixed(0)}</span>
                <span className="text-right tabular-nums text-whisper-gray text-[10px]">{new Date(p.joinedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
