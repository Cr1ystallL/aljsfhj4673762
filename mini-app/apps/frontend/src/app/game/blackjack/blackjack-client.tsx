'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useTelegramAuth } from '@/hooks/use-telegram-auth';
import { cn } from '@/lib/utils';

interface Occupant {
  id: string;
  name: string;
  avatar?: string;
}

interface Seat {
  id: number;
  occupant?: Occupant;
}

interface Room {
  id: string;
  label: string;
  seats: Seat[];
}

const MODE_CARDS: Array<{
  key: 'solo' | 'multi';
  title: string;
  subtitle: string;
  image: string;
}> = [
  {
    key: 'solo',
    title: 'SOLO',
    subtitle: 'Тренируйся один за столом',
    image: '/BLACKJACK_SOLO.png',
  },
  {
    key: 'multi',
    title: 'MULTIPLAYER',
    subtitle: 'Комнаты до 6 игроков',
    image: '/BLACKJACK_MULTIPLAYER.png',
  },
];

function createRoom(id: number, filledBots = 0): Room {
  const seats: Seat[] = Array.from({ length: 6 }, (_, idx) => ({ id: idx + 1 }));
  for (let i = 0; i < Math.min(filledBots, seats.length); i++) {
    seats[i].occupant = {
      id: `guest-${id}-${i}`,
      name: `Игрок ${i + 1}`,
    };
  }
  return {
    id: `room-${id}`,
    label: `Комната ${id}`,
    seats,
  };
}

function countFilled(seats: Seat[]) {
  return seats.filter((s) => !!s.occupant).length;
}

function ensureEmptyRoom(rooms: Room[]): Room[] {
  const hasEmpty = rooms.some((r) => countFilled(r.seats) === 0);
  if (hasEmpty) return rooms;
  return [...rooms, createRoom(rooms.length + 1, 0)];
}

function Avatar({ occupant }: { occupant: Occupant }) {
  const initials = occupant.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-11 w-11 rounded-full border border-white/20 bg-white/5 overflow-hidden flex items-center justify-center text-sm font-semibold text-frost-white shadow-lg shadow-black/40">
      {occupant.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={occupant.avatar}
          alt={occupant.name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function SeatButton({
  seat,
  isYou,
  onSelect,
}: {
  seat: Seat;
  isYou: boolean;
  onSelect: () => void;
}) {
  const occupiedByOther = !!seat.occupant && !isYou;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={occupiedByOther}
      className={cn(
        'relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
        occupiedByOther
          ? 'border-white/10 bg-white/[0.03] text-white/60 cursor-not-allowed'
          : isYou
          ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-50'
          : 'border-white/15 bg-white/[0.05] hover:border-white/25 hover:bg-white/[0.08] text-white'
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.07] text-[13px] font-semibold text-white/80">
        Место {seat.id}
      </div>
      <div className="flex flex-1 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {seat.occupant ? (
            <Avatar occupant={seat.occupant} />
          ) : (
            <div className="h-11 w-11 rounded-full border border-dashed border-white/30 bg-white/[0.03]" />
          )}
          <div className="leading-tight">
            <p className="font-roobert text-[13px] text-white/85">
              {seat.occupant ? (isYou ? 'Вы сидите здесь' : seat.occupant.name) : 'Свободное место'}
            </p>
            <p className="text-[11px] text-white/60">
              {seat.occupant ? (isYou ? 'Можно менять ставку' : 'Занято') : 'Нажми, чтобы занять'}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function BetControls({ bet, onChange }: { bet: number; onChange: (value: number) => void }) {
  const fmt = (v: number) => v.toLocaleString('ru-RU');
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/70">Ставка</p>
        <span className="font-roobert text-lg text-white">{fmt(bet)} zł</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, bet - 10))}
          className="rounded-xl border border-white/15 bg-white/[0.04] py-2 text-sm text-white hover:border-white/25"
        >
          -10
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.max(1, Math.floor(bet / 2)))}
          className="rounded-xl border border-white/15 bg-white/[0.04] py-2 text-sm text-white hover:border-white/25"
        >
          1/2
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(1_000_000, bet * 2))}
          className="rounded-xl border border-white/15 bg-white/[0.04] py-2 text-sm text-white hover:border-white/25"
        >
          x2
        </button>
        <button
          type="button"
          onClick={() => onChange(bet + 10)}
          className="rounded-xl border border-white/15 bg-white/[0.04] py-2 text-sm text-white hover:border-white/25"
        >
          +10
        </button>
      </div>
    </div>
  );
}

export function BlackjackClient() {
  const { user } = useAuthStore();
  useTelegramAuth();

  const you: Occupant = useMemo(
    () => ({
      id: 'you',
      name: user?.firstName || 'Вы',
      avatar: user?.photoUrl,
    }),
    [user?.firstName, user?.photoUrl]
  );

  const [mode, setMode] = useState<'solo' | 'multi' | null>(null);
  const [bet, setBet] = useState(100);
  const [soloSeats, setSoloSeats] = useState<Seat[]>(() =>
    Array.from({ length: 6 }, (_, idx) => ({ id: idx + 1 }))
  );

  const [rooms, setRooms] = useState<Room[]>(() => ensureEmptyRoom([createRoom(1, 3)]));
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const currentSoloSeat = soloSeats.find((s) => s.occupant?.id === 'you')?.id ?? null;
  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  const handleSoloSeat = (seatId: number) => {
    setSoloSeats((prev) => {
      const next = prev.map((s) =>
        s.occupant?.id === 'you'
          ? { ...s, occupant: undefined }
          : s
      );
      const target = next.find((s) => s.id === seatId);
      if (!target) return prev;
      if (target.occupant && target.occupant.id !== 'you') return prev;
      target.occupant = you;
      return [...next];
    });
  };

  const handleRoomSeat = (seatId: number) => {
    if (!activeRoom) return;
    setRooms((prev) => {
      const nextRooms = prev.map((room) => {
        if (room.id !== activeRoom.id) return room;
        const seats = room.seats.map((s) =>
          s.occupant?.id === 'you' ? { ...s, occupant: undefined } : s
        );
        const target = seats.find((s) => s.id === seatId);
        if (!target) return room;
        if (target.occupant && target.occupant.id !== 'you') return room;
        target.occupant = you;
        return { ...room, seats };
      });
      return ensureEmptyRoom(nextRooms);
    });
  };

  const currentRoomSeatId = activeRoom?.seats.find((s) => s.occupant?.id === 'you')?.id ?? null;

  const renderModeSelection = () => (
    <div className="grid grid-cols-1 gap-4">
      {MODE_CARDS.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => {
            setMode(card.key);
            if (card.key === 'multi') setActiveRoomId(null);
          }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left shadow-xl"
        >
          <div className="relative aspect-[16/9] w-full">
            <Image
              src={card.image}
              alt={card.title}
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/65" />
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <p className="text-[12px] uppercase tracking-[0.12em] text-amber-200/80">Blackjack</p>
              <p className="font-roobert text-[20px] text-white">{card.title}</p>
              <p className="text-[13px] text-white/80">{card.subtitle}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderTable = (seats: Seat[], onSeat: (id: number) => void, activeSeatId: number | null) => (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0e101c] via-[#111527] to-[#0b0d1a] shadow-2xl">
      <div className="absolute inset-0">
        <Image src="/BJ_table.png" alt="Blackjack table" fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/65" />
      </div>
      <div className="relative z-10 space-y-4 p-4">
        <div className="flex items-center justify-between text-white/85">
          <div className="flex items-center gap-2 text-sm">
            <Users size={16} className="text-amber-300" />
            <span>Свободных мест: {6 - countFilled(seats)}/6</span>
          </div>
          {activeSeatId && <span className="text-[13px] text-emerald-200">Вы заняли место {activeSeatId}</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {seats.map((seat) => (
            <SeatButton
              key={seat.id}
              seat={seat}
              isYou={seat.occupant?.id === 'you'}
              onSelect={() => onSeat(seat.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderSolo = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setMode(null)}
        className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <ArrowLeft size={18} />
        Назад к выбору режима
      </button>
      <h1 className="font-roobert text-[22px] text-white">Blackjack — SOLO</h1>
      {renderTable(soloSeats, handleSoloSeat, currentSoloSeat)}
      <BetControls bet={bet} onChange={setBet} />
    </div>
  );

  const renderRoomList = () => (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setMode(null)}
        className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <ArrowLeft size={18} />
        Назад к выбору режима
      </button>
      <h1 className="font-roobert text-[22px] text-white">Blackjack — MULTIPLAYER</h1>
      <p className="text-[13px] text-white/65">
        В комнате до 6 игроков. Когда первая комната наполняется наполовину, появляется новая.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {rooms.map((room) => {
          const filled = countFilled(room.seats);
          return (
            <div
              key={room.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-roobert text-[16px] text-white">{room.label}</p>
                  <p className="text-[12px] text-white/60">Занято: {filled}/6</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className="rounded-xl border border-amber-300/60 bg-amber-300/15 px-3 py-2 text-sm font-medium text-amber-50 hover:border-amber-200"
                >
                  Войти
                </button>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {room.seats.map((seat) => (
                  <div
                    key={seat.id}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-lg border text-[12px]',
                      seat.occupant
                        ? 'border-white/15 bg-white/[0.05] text-white/80'
                        : 'border-dashed border-white/20 bg-white/[0.02] text-white/60'
                    )}
                  >
                    {seat.occupant ? seat.occupant.name : `Место ${seat.id}`}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderActiveRoom = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setActiveRoomId(null)}
        className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <ArrowLeft size={18} />
        Назад к списку комнат
      </button>
      <div className="flex items-center gap-2 text-white/80">
        <Users size={16} className="text-amber-300" />
        <span>{activeRoom?.label}</span>
      </div>
      {activeRoom ? renderTable(activeRoom.seats, handleRoomSeat, currentRoomSeatId) : null}
      <BetControls bet={bet} onChange={setBet} />
    </div>
  );

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5 px-4 py-6">
        {mode === null && renderModeSelection()}
        {mode === 'solo' && renderSolo()}
        {mode === 'multi' && activeRoomId === null && renderRoomList()}
        {mode === 'multi' && activeRoomId !== null && renderActiveRoom()}
      </div>
    </main>
  );
}
