import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

export interface BJOccupant {
  id: string;
  name: string;
  avatar?: string;
}

export interface BJSeat {
  id: number;
  occupant: BJOccupant | null;
}

export interface BJRoom {
  id: string;
  label: string;
  seats: BJSeat[];
}

const REDIS_KEY = 'blackjack:rooms';
const MAX_SEATS = 6;

function createEmptyRoom(index: number): BJRoom {
  return {
    id: `blackjack-${index}`,
    label: `Комната ${index}`,
    seats: Array.from({ length: MAX_SEATS }, (_, i) => ({ id: i + 1, occupant: null })),
  };
}

function sanitizeOccupant(raw: BJOccupant): BJOccupant {
  return {
    id: raw.id,
    name: raw.name.slice(0, 64),
    avatar: raw.avatar?.slice(0, 512),
  };
}

async function normalizeRoomId(roomId: string): Promise<string> {
  // allow numeric ids from old clients
  if (/^\d+$/.test(roomId)) {
    return `blackjack-${roomId}`;
  }
  return roomId;
}

async function loadRooms(): Promise<BJRoom[]> {
  const client = redisClient.getClient();
  try {
    const raw = await client.get(REDIS_KEY);
    if (!raw) return [createEmptyRoom(1)];
    const parsed = JSON.parse(raw) as BJRoom[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [createEmptyRoom(1)];
    return parsed.map((room, idx) => ({
      id: room.id || `blackjack-${idx + 1}`,
      label: room.label || `Комната ${idx + 1}`,
      seats: Array.isArray(room.seats)
        ? room.seats.map((s, i) => ({
            id: s?.id ?? i + 1,
            occupant: s?.occupant ? sanitizeOccupant(s.occupant) : null,
          }))
        : createEmptyRoom(idx + 1).seats,
    }));
  } catch (err) {
    logger.warn({ err }, 'Failed to load blackjack rooms, resetting');
    return [createEmptyRoom(1)];
  }
}

async function saveRooms(rooms: BJRoom[]): Promise<void> {
  const client = redisClient.getClient();
  await client.set(REDIS_KEY, JSON.stringify(rooms));
}

function countFilled(room: BJRoom): number {
  return room.seats.filter((s) => s.occupant !== null).length;
}

function ensureEmptySlotRoom(rooms: BJRoom[]): BJRoom[] {
  const hasEmpty = rooms.some((r) => countFilled(r) < MAX_SEATS);
  if (hasEmpty) return rooms;
  return [...rooms, createEmptyRoom(rooms.length + 1)];
}

function removeUserEverywhere(rooms: BJRoom[], userId: string): BJRoom[] {
  return rooms.map((room) => ({
    ...room,
    seats: room.seats.map((seat) =>
      seat.occupant?.id === userId ? { ...seat, occupant: null } : seat
    ),
  }));
}

export async function getBlackjackRooms(): Promise<BJRoom[]> {
  const rooms = await loadRooms();
  return ensureEmptySlotRoom(rooms);
}

export async function joinBlackjackSeat(
  roomIdRaw: string,
  seatId: number,
  occupant: BJOccupant
): Promise<BJRoom | null> {
  const roomId = await normalizeRoomId(roomIdRaw);
  if (seatId < 1 || seatId > MAX_SEATS) return null;
  let rooms = await loadRooms();

  const targetIndex = rooms.findIndex((r) => r.id === roomId);
  const room = targetIndex === -1 ? rooms[rooms.length - 1] : rooms[targetIndex];
  const resolvedRoom = room?.id === roomId ? room : createEmptyRoom(rooms.length + 1);

  // Remove user from all seats first
  rooms = removeUserEverywhere(rooms, occupant.id);

  // If room is now missing (because it was new), ensure it exists
  const idx = rooms.findIndex((r) => r.id === resolvedRoom.id);
  if (idx === -1) {
    rooms.push(resolvedRoom);
  }

  const currentRoom = rooms.find((r) => r.id === roomId) ?? rooms.find((r) => r.id === resolvedRoom.id)!;
  const seat = currentRoom.seats.find((s) => s.id === seatId);
  if (!seat) return null;
  seat.occupant = sanitizeOccupant(occupant);

  rooms = ensureEmptySlotRoom(rooms);
  await saveRooms(rooms);
  return currentRoom;
}

export async function leaveBlackjackRoom(roomId: string, userId: string): Promise<BJRoom | null> {
  let rooms = await loadRooms();
  let updatedRoom: BJRoom | null = null;
  rooms = rooms.map((room) => {
    if (room.id !== roomId) return room;
    const seats = room.seats.map((s) => (s.occupant?.id === userId ? { ...s, occupant: null } : s));
    updatedRoom = { ...room, seats };
    return updatedRoom;
  });
  rooms = ensureEmptySlotRoom(rooms);
  await saveRooms(rooms);
  return updatedRoom;
}

export function serializeRoom(room: BJRoom) {
  return {
    roomId: room.id,
    label: room.label,
    seats: room.seats.map((s) => ({ id: s.id, occupant: s.occupant })),
  };
}
