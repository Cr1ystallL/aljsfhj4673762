'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Power, CheckCircle, Trash2, Trophy, Users, Settings as SettingsIcon, X, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const GAME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'crash', label: 'Crash' },
  { value: 'mines', label: 'Mines' },
  { value: 'plinko', label: 'Plinko' },
  { value: 'coinflip', label: 'Coinflip' },
  { value: 'wheel', label: 'Wheel' },
  { value: 'bridges', label: 'Bridges' },
  { value: 'blackjack', label: 'Blackjack' },
];

function isoLocalNow(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Modal({ onClose, title, children, wide }: { onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight-canvas/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={cn("bg-[#13151A] border border-white/10 rounded-[20px] shadow-2xl overflow-hidden flex flex-col max-h-full", wide ? "w-full max-w-2xl" : "w-full max-w-md")}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 sticky top-0 bg-midnight-canvas/95 backdrop-blur-sm z-10">
          <span className="font-roobert text-[14px] text-frost-white">{title}</span>
          <button onClick={onClose} className="inline-flex items-center justify-center w-7 h-7 rounded-pill border border-white/15 hover:border-white/35"><X size={12} strokeWidth={1.8} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children, colSpan = 1 }: { label: string; children: React.ReactNode; colSpan?: 1 | 2 }) {
  return (
    <div className={cn('flex flex-col gap-1', colSpan === 2 && 'col-span-2')}>
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">{label}</span>
      {children}
    </div>
  );
}

function NumInput({ value, step, min, onChange }: { value: number; step: number; min?: number; onChange: (v: number) => void }) {
  return (
    <input type="number" step={step} min={min} value={value} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30" />
  );
}
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
  wagerMultiplier: number;
  startBalance: number;
  entryFee: number;
  rebuyFee: number;
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
  const [actionBusy, setActionBusy] = useState<'start' | 'end' | 'delete' | 'wager' | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const editBalance = async (userId: string, currentBalance: number) => {
    const val = prompt(`Введите новый баланс для пользователя:`, String(currentBalance));
    if (val === null) return;
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num < 0) return alert('Неверный баланс');
    const reason = prompt('Причина изменения баланса:');
    if (!reason || reason.trim().length < 3) return alert('Причина обязательна (мин 3 символа)');
    
    try {
      const res = await fetch(`/api/_x/tournaments/${id}/participants/${userId}/balance`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: num, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(()=>({}));
        alert(j.error || 'Ошибка');
      }
      await load();
    } catch {
      alert('Ошибка соединения');
    }
  };

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

  const editWager = async () => {
    if (!data) return;
    const val = prompt('Введите новый вейджер (множитель, 0 = без отыгрыша):', String(data.wagerMultiplier));
    if (val === null) return;
    const num = parseInt(val, 10);
    if (!Number.isFinite(num) || num < 0) return;

    setActionBusy('wager');
    try {
      await fetch(`/api/_x/tournaments/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wagerMultiplier: num }),
      });
      await load();
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
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.03] text-[12px]',
            data.cycleState === 'ended' && 'text-[#ffb199] border-[#ffb199]/50',
            data.cycleState === 'waiting' && 'text-[#ffac2e] border-[#ffac2e]/50'
          )}
        >
          {data.cycleState === 'ended' ? 'Цикл завершён' : data.cycleState === 'waiting' ? 'Ожидание' : data.active ? 'Активен' : 'Выключен'}
        </span>
        <button onClick={() => setEditOpen(true)} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-[12px] text-frost-white hover:border-white/30 transition-colors">
          <SettingsIcon size={14} /> Редактировать
        </button>
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

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-3 border-y border-white/10 mt-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-whisper-gray uppercase tracking-wider">Вейджер</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-frost-white tabular-nums">{data.wagerMultiplier > 0 ? `x${data.wagerMultiplier}` : 'Без вейджера'}</span>
              <button onClick={editWager} disabled={actionBusy === 'wager'} className="text-[10px] text-whisper-gray hover:text-frost-white underline">изм.</button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-whisper-gray uppercase tracking-wider">Тип</span>
            <span className="text-[12px] text-frost-white tabular-nums">{data.entryFee > 0 ? `Взнос ${data.entryFee} zł` : 'Бесплатно'}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-whisper-gray">Докупка баланса (Rebuy)</span>
            <span className="text-[12px] text-frost-white tabular-nums">{data.rebuyFee > 0 ? `${data.rebuyFee} zł` : '0 zł'}</span>
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
                <div className="flex items-center justify-end gap-1.5">
                  <span className="tabular-nums font-medium text-[#ffac2e]">{p.balance.toFixed(0)}</span>
                  <button onClick={() => editBalance(p.userId, p.balance)} className="text-whisper-gray hover:text-frost-white"><Edit2 size={12} /></button>
                </div>
                <span className="text-right tabular-nums text-whisper-gray text-[10px]">{new Date(p.joinedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <AnimatePresence>
        {editOpen && <TournamentEditModal data={data} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); void load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function TournamentEditModal({ data, onClose, onSaved }: { data: TournamentDetails; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description || '');
  const [bannerUrl, setBannerUrl] = useState(data.bannerUrl || '');
  const [gameType, setGameType] = useState(data.gameType);
  const [prizePool, setPrizePool] = useState(data.prizePool);
  const [prizeMode, setPrizeMode] = useState<'percent' | 'fixed'>(data.prizeMode);
  const [winnersCount, setWinnersCount] = useState(data.winnersCount);
  const [fixedPrize, setFixedPrize] = useState(data.fixedPrize || 0);
  const [wagerMultiplier, setWagerMultiplier] = useState(data.wagerMultiplier);
  const [startBalance, setStartBalance] = useState(data.startBalance);
  const [feeType, setFeeType] = useState<'free' | 'fee'>(data.entryFee > 0 ? 'fee' : 'free');
  const [entryFee, setEntryFee] = useState(data.entryFee);
  const [rebuyFee, setRebuyFee] = useState(data.rebuyFee);
  const [startAt, setStartAt] = useState(() => isoLocalNow(new Date(data.startAtGmt1).getTime()));
  const [durationHours, setDurationHours] = useState(data.durationHours);
  const [repeatType, setRepeatType] = useState<'daily' | 'once'>(data.repeatType as 'daily' | 'once');
  const [active, setActive] = useState(data.active);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (title.trim().length < 3) return setErr('Название слишком короткое');
    if (prizeMode === 'percent' && prizePool <= 0) return setErr('Укажите призовой пул');
    if (prizeMode === 'fixed' && fixedPrize <= 0) return setErr('Укажите сумму фикс. приза');
    if (durationHours < 1) return setErr('Длительность от 1 часа');

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/_x/tournaments/${data.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          bannerUrl: bannerUrl || null,
          gameType,
          prizePool: prizeMode === 'percent' ? Number(prizePool) : Number(fixedPrize) * Number(winnersCount),
          prizeMode,
          winnersCount: Number(winnersCount),
          fixedPrize: prizeMode === 'fixed' ? Number(fixedPrize) : null,
          wagerMultiplier: Number(wagerMultiplier),
          startBalance: Number(startBalance),
          entryFee: feeType === 'fee' ? Number(entryFee) : 0,
          rebuyFee: feeType === 'fee' ? Number(rebuyFee) : 0,
          startAtGmt1: new Date(startAt).getTime(),
          durationHours: Number(durationHours),
          repeatType,
          active,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || 'Ошибка');
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Редактировать турнир" wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Активность турнира" colSpan={2}>
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#a0e0ab] w-4 h-4 cursor-pointer" />
            <span className="text-[13px] text-frost-white font-roobert">Турнир включен (показывается игрокам)</span>
          </label>
        </Field>
        <Field label="Название" colSpan={2}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
        </Field>
        <Field label="Описание" colSpan={2}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
        </Field>
        <Field label="Баннер (Файл или ссылка)" colSpan={2}>
          <div className="flex gap-2">
            <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="flex-1 bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" placeholder="https://... или /uploads/..." />
          </div>
        </Field>
        <Field label="Игра">
          <select value={gameType} onChange={(e) => setGameType(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30">
            {GAME_OPTIONS.map((g) => (<option key={g.value} value={g.value} className="bg-midnight-canvas text-frost-white">{g.label}</option>))}
          </select>
        </Field>
        {prizeMode === 'percent' && (
          <Field label="Призовой пул (zł)">
            <NumInput value={prizePool} onChange={setPrizePool} step={10} />
          </Field>
        )}
        <Field label="Режим призов">
          <select value={prizeMode} onChange={(e) => setPrizeMode(e.target.value as 'percent' | 'fixed')} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30">
            <option value="percent">Проценты (топ-10)</option>
            <option value="fixed">Фикс всем</option>
          </select>
        </Field>
        <Field label="Победителей">
          <NumInput value={winnersCount} onChange={setWinnersCount} step={1} />
        </Field>
        {prizeMode === 'fixed' && (
          <>
            <Field label="Сумма приза каждому" colSpan={2}>
              <NumInput value={fixedPrize} onChange={setFixedPrize} step={10} />
            </Field>
            <Field label="Призовой пул" colSpan={2}>
              <div className="px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85">
                {(Number(winnersCount) * Number(fixedPrize || 0)).toFixed(2)} zł
              </div>
            </Field>
          </>
        )}
        <Field label="Вейджер">
          <NumInput value={wagerMultiplier} onChange={setWagerMultiplier} step={1} />
        </Field>
        <Field label="Стартовый баланс">
          <NumInput value={startBalance} onChange={setStartBalance} step={10} />
        </Field>
        <Field label="Тип участия">
          <div className="flex gap-2">
            <button type="button" onClick={() => setFeeType('free')} className={cn('px-3 py-2 rounded-pill border text-[12px] font-roobert', feeType === 'free' ? 'bg-frost-white text-midnight-canvas border-frost-white' : 'bg-white/[0.04] border-white/15 text-frost-white')}>Бесплатно</button>
            <button type="button" onClick={() => setFeeType('fee')} className={cn('px-3 py-2 rounded-pill border text-[12px] font-roobert', feeType === 'fee' ? 'bg-frost-white text-midnight-canvas border-frost-white' : 'bg-white/[0.04] border-white/15 text-frost-white')}>С взносом</button>
          </div>
        </Field>
        <Field label="Повтор">
          <select value={repeatType} onChange={(e) => setRepeatType(e.target.value as 'daily' | 'once')} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30">
            <option value="daily" className="bg-midnight-canvas text-frost-white">Ежедневный</option>
            <option value="once" className="bg-midnight-canvas text-frost-white">Единоразовый</option>
          </select>
        </Field>
        {feeType === 'fee' && (
          <>
            <Field label="Взнос (real)">
              <NumInput value={entryFee} onChange={setEntryFee} step={10} />
            </Field>
            <Field label="Rebuy Fee (real)">
              <NumInput value={rebuyFee} onChange={setRebuyFee} step={10} />
            </Field>
          </>
        )}
        <Field label="Старт (GMT+1)" colSpan={2}>
          {repeatType === 'daily' ? (
            <input type="time" value={startAt.includes('T') ? startAt.split('T')[1] : startAt} onChange={(e) => { const today = new Date().toISOString().split('T')[0]; setStartAt(`${today}T${e.target.value}`); }} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
          ) : (
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
          )}
        </Field>
        <Field label="Длительность (часы)">
          <NumInput value={durationHours} onChange={setDurationHours} step={1} />
        </Field>
      </div>
      {err && <div className="font-roobert text-[12px] text-[#ff8a76]">{err}</div>}
      <div className="flex items-center justify-end gap-2 pt-3">
        <button onClick={onClose} className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85">Отмена</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] disabled:opacity-50">{busy ? 'Сохранение…' : 'Сохранить'}</button>
      </div>
    </Modal>
  );
}
