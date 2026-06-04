'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useTelegramAuth } from '@/hooks/use-telegram-auth';
import { cn } from '@/lib/utils';
import { createAuthenticatedWebSocket } from '@/lib/websocket/authenticated-client';
import type { WSMessage, ServerBlackjackSeatUpdateEvent, ServerBlackjackStateEvent } from '@casino/shared';

interface Occupant {
  id: string;
  name: string;
  avatar?: string;
}

interface Seat {
  id: number;
  occupant?: Occupant | null;
}

interface Room {
  id: string;
  label: string;
  seats: Seat[];
}

const SEAT_POSITIONS: Record<number, { left: string; top: string }> = {
  1: { left: '14%', top: '62%' },
  2: { left: '30%', top: '72%' },
  3: { left: '46%', top: '79%' },
  4: { left: '60%', top: '79%' },
  5: { left: '74%', top: '72%' },
  6: { left: '88%', top: '62%' },
};

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

const roomIdFromIndex = (idx: number) => `blackjack-${idx}`;

function createRoom(id: number): Room {
  const seats: Seat[] = Array.from({ length: 6 }, (_, idx) => ({ id: idx + 1 }));
  return {
    id: roomIdFromIndex(id),
    label: `Комната ${id}`,
    seats,
  };
}

function countFilled(seats: Seat[]) {
  return seats.filter((s) => !!s.occupant).length;
}

function ensureEmptyRoom(rooms: Room[]): Room[] {
  // Новая комната появляется, только когда ВСЕ текущие заполнены наполовину или более (>= 3 из 6)
  const hasAvailableRoom = rooms.some((r) => countFilled(r.seats) < 3);
  if (hasAvailableRoom) return rooms;
  return [...rooms, createRoom(rooms.length + 1)];
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

function InlineBetControls({ bet, onChange }: { bet: number; onChange: (value: number) => void }) {
  const fmt = (v: number) => v.toLocaleString('ru-RU');
  const controls = [
    { label: '-10', fn: () => onChange(Math.max(1, bet - 10)) },
    { label: '1/2', fn: () => onChange(Math.max(1, Math.floor(bet / 2))) },
    { label: 'x2', fn: () => onChange(Math.min(1_000_000, bet * 2)) },
    { label: '+10', fn: () => onChange(Math.min(1_000_000, bet + 10)) },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[12px] font-semibold text-white shadow-lg shadow-black/40 backdrop-blur">
        {fmt(bet)} zł
      </div>
      <div className="flex items-center gap-1">
        {controls.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={c.fn}
            className="h-9 w-9 rounded-full border border-white/15 bg-white/[0.08] text-[11px] text-white transition hover:border-white/30 hover:bg-white/[0.14]"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SeatSpot({
  seat,
  position,
  isYou,
  onSelect,
  bet,
  onBetChange,
}: {
  seat: Seat;
  position: { left: string; top: string };
  isYou: boolean;
  onSelect: () => void;
  bet: number;
  onBetChange: (value: number) => void;
}) {
  const occupiedByOther = !!seat.occupant && !isYou;

  return (
    <div
      className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
      style={{ left: position.left, top: position.top }}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={occupiedByOther}
        className={cn(
          'relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all shadow-lg shadow-black/50 backdrop-blur',
          occupiedByOther
            ? 'cursor-not-allowed border-white/20 bg-white/[0.08]'
            : isYou
            ? 'border-emerald-300/80 bg-emerald-300/10 hover:border-emerald-200'
            : 'border-amber-300/60 bg-black/70 hover:border-amber-200/70'
        )}
      >
        {seat.occupant ? (
          <Avatar occupant={seat.occupant} />
        ) : (
          <div className="h-10 w-10 rounded-full border border-dashed border-amber-200/60 bg-transparent" />
        )}
        <div className="absolute -top-2 -right-2 h-4 w-4 rounded-md border border-amber-200/60 bg-white/10" />
      </button>
      <div className="flex items-center gap-2 text-[11px] text-white/75">
        <span className="rounded-full border border-white/10 bg-black/60 px-2 py-1 backdrop-blur">
          Место {seat.id}
        </span>
        {occupiedByOther && <span className="text-white/50">Занято</span>}
      </div>
      {isYou ? (
        <InlineBetControls bet={bet} onChange={onBetChange} />
      ) : seat.occupant ? (
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] text-white/85 shadow-sm">
          {seat.occupant.name}
        </div>
      ) : null}
    </div>
  );
}

export function BlackjackClient() {
  const { user } = useAuthStore();
  useTelegramAuth();

  const you: Occupant = useMemo(
    () => ({
      id: user?.id ?? 'you',
      name: user?.firstName || 'Вы',
      avatar: user?.photoUrl,
    }),
    [user?.firstName, user?.photoUrl, user?.id]
  );

  const [mode, setMode] = useState<'solo' | 'multi' | null>(null);
  const [bet, setBet] = useState(100);
  const [soloSeats, setSoloSeats] = useState<Seat[]>(() =>
    Array.from({ length: 6 }, (_, idx) => ({ id: idx + 1 }))
  );

  const [rooms, setRooms] = useState<Room[]>(() => ensureEmptyRoom([createRoom(1)]));
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const wsRef = useRef<ReturnType<typeof createAuthenticatedWebSocket> | null>(null);

  const sessionId = useAuthStore((s) => s.sessionId);

  const currentSoloSeat = soloSeats.find((s) => s.occupant?.id === you.id)?.id ?? null;
  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  const handleSoloSeat = (seatId: number) => {
    setSoloSeats((prev) => {
      const next = prev.map((s) =>
        s.occupant?.id === you.id
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
          s.occupant?.id === you.id ? { ...s, occupant: undefined } : s
        );
        const target = seats.find((s) => s.id === seatId);
        if (!target) return room;
        if (target.occupant && target.occupant.id !== you.id) return room;
        target.occupant = you;
        return { ...room, seats };
      });
      return ensureEmptyRoom(nextRooms);
    });

    if (wsRef.current && sessionId) {
      wsRef.current.send({
        type: 'bj:seat',
        payload: { roomId: activeRoom.id, seatId, name: you.name, avatar: you.avatar },
        timestamp: Date.now(),
      });
    }
  };

  const currentRoomSeatId = activeRoom?.seats.find((s) => s.occupant?.id === you.id)?.id ?? null;

  // --- WebSocket handlers for multiplayer ---
  useEffect(() => {
    if (!sessionId || !mode) return;

    // если нет комнат, создаем первую локально с корректным id
    setRooms((prev) => (prev.length === 0 ? [createRoom(1)] : prev));

    if (!activeRoomId) return;

    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
    const base = /\/ws$/.test(baseRaw) ? baseRaw : `${baseRaw.replace(/\/$/, '')}/ws`;
    const ws = createAuthenticatedWebSocket(base);
    wsRef.current = ws;

    let unsub: (() => void) | null = null;

    const connect = async () => {
      await ws.connectAuthenticated(sessionId);
      // Join room
      ws.send({ type: 'game:join', payload: { roomId: activeRoomId }, timestamp: Date.now() });
      // Subscribe to messages
      unsub = ws.onMessage((msg: WSMessage) => {
        if (msg.type === 'bj:state') {
          const { roomId, seats, label } = (msg as ServerBlackjackStateEvent).payload;
          setRooms((prev) => {
            const next = prev.map((r) => (r.id === roomId ? { ...r, seats, label } : r));
            // ensure exists
            if (!next.find((r) => r.id === roomId)) next.push({ id: roomId, label, seats });
            return next;
          });
        }
        if (msg.type === 'bj:seat_update') {
          const { roomId, seats } = (msg as ServerBlackjackSeatUpdateEvent).payload;
          setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, seats } : r)));
        }
      });

      ws.onDisconnect(() => {
        setTimeout(() => {
          connect().catch(() => {});
        }, 1000);
      });
    };

    connect().catch(() => {});

    return () => {
      if (wsRef.current && activeRoomId) {
        wsRef.current.send({
          type: 'game:leave',
          payload: { roomId: activeRoomId },
          timestamp: Date.now(),
        });
      }
      if (unsub) unsub();
      ws.disconnect();
      wsRef.current = null;
    };
  }, [activeRoomId, mode, sessionId]);

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

  const renderTable = (
    seats: Seat[],
    onSeat: (id: number) => void,
    activeSeatId: number | null
  ) => (
    <div className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-3xl border border-white/10 bg-[#05060c] shadow-2xl">
      <div className="relative aspect-[16/9]">
        <Image src="/BJ_table.png" alt="Blackjack table" fill className="object-contain" priority />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/40 to-black/65" />

        <div className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
          <Users size={16} className="text-amber-300" />
          <span>Свободных мест: {6 - countFilled(seats)}/6</span>
          {activeSeatId && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-50 border border-emerald-300/30">
              Вы на месте {activeSeatId}
            </span>
          )}
        </div>

        {Object.entries(SEAT_POSITIONS).map(([id, position]) => {
          const seat = seats.find((s) => s.id === Number(id));
          if (!seat) return null;
          const isYou = seat.occupant?.id === you.id;
          return (
            <SeatSpot
              key={seat.id}
              seat={seat}
              position={position}
              isYou={isYou}
              onSelect={() => onSeat(seat.id)}
              bet={bet}
              onBetChange={setBet}
            />
          );
        })}
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
        onClick={() => {
          if (wsRef.current && activeRoomId) {
            wsRef.current.send({
              type: 'game:leave',
              payload: { roomId: activeRoomId },
              timestamp: Date.now(),
            });
          }
          // очистить локально свое место
          setRooms((prev) =>
            prev.map((room) =>
              room.id === activeRoomId
                ? {
                    ...room,
                    seats: room.seats.map((s) =>
                      s.occupant?.id === you.id ? { ...s, occupant: undefined } : s
                    ),
                  }
                : room
            )
          );
          setActiveRoomId(null);
        }}
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
    </div>
  );

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-6">
        {mode === null && renderModeSelection()}
        {mode === 'solo' && renderSolo()}
        {mode === 'multi' && activeRoomId === null && renderRoomList()}
        {mode === 'multi' && activeRoomId !== null && renderActiveRoom()}
      </div>
    </main>
  );
}
