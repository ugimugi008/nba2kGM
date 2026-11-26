import type { RoomState } from '../src/types/game.js';
import {
  type ActionResult,
  applyFinish,
  applyJoin,
  applyLineup,
  applyNextGame,
  applyPick,
  applySpin,
  applyStart,
  buildNewRoom,
  type CreateRoomParams,
  generateCode,
  isValidCode,
  normalizeCode,
} from './partyLogic.js';
import type { RoomStorage, StoredRoom } from './storage.js';

export interface ServiceResult {
  room?: RoomState;
  error?: string;
  status?: number;
}

const MAX_CAS_RETRIES = 8;

function decode(stored: StoredRoom): RoomState {
  const room = JSON.parse(stored.json) as RoomState;
  room.rev = stored.rev;
  return room;
}

function encode(room: RoomState): string {
  const { rev: _rev, ...rest } = room;
  return JSON.stringify(rest);
}

export function createPartyService(storage: RoomStorage) {
  const notFound = (code: string): ServiceResult => ({
    error: `Party code "${code}" not found or expired.`,
    status: 404,
  });

  /** Load → apply rule → compare-and-set, retrying if someone else wrote first. */
  async function mutate(
    rawCode: string,
    action: (room: RoomState) => ActionResult
  ): Promise<ServiceResult> {
    const code = normalizeCode(rawCode);
    if (!isValidCode(code)) return { error: 'Invalid party code.', status: 400 };

    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const stored = await storage.get(code);
      if (!stored) return notFound(code);
      const room = decode(stored);
      const result = action(room);
      if (result.error) return { error: result.error, status: result.status ?? 400 };
      if (result.changed === false) return { room: decode(stored) };

      const ok = await storage.compareAndSet(code, stored.rev, encode(room));
      if (ok) {
        room.rev = stored.rev + 1;
        return { room };
      }
      // Lost the race: small jittered back-off, then re-read and re-apply.
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
    }
    return { error: 'The party is busy, please try again.', status: 409 };
  }

  return {
    storageKind: storage.kind,

    async createRoom(params: CreateRoomParams): Promise<ServiceResult> {
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateCode();
        const built = buildNewRoom(code, params);
        if ('error' in built && built.error) {
          return { error: built.error, status: built.status ?? 400 };
        }
        const room = built as RoomState;
        if (await storage.create(code, encode(room))) {
          room.rev = 1;
          return { room };
        }
      }
      return { error: 'Could not allocate a party code. Try again.', status: 503 };
    },

    async getRoom(rawCode: string): Promise<ServiceResult> {
      const code = normalizeCode(rawCode);
      if (!isValidCode(code)) return { error: 'Invalid party code.', status: 400 };
      const stored = await storage.get(code);
      return stored ? { room: decode(stored) } : notFound(code);
    },

    async getRev(rawCode: string): Promise<number | null> {
      const code = normalizeCode(rawCode);
      if (!isValidCode(code)) return null;
      return storage.getRev(code);
    },

    joinRoom: (code: string, token: string, name?: string) =>
      mutate(code, (room) => applyJoin(room, token, name)),
    startDraft: (code: string, token: string, payload: Parameters<typeof applyStart>[2]) =>
      mutate(code, (room) => applyStart(room, token, payload)),
    spinReels: (code: string, token: string, spinState: Parameters<typeof applySpin>[2]) =>
      mutate(code, (room) => applySpin(room, token, spinState)),
    pickPlayer: (code: string, token: string, playerId: string) =>
      mutate(code, (room) => applyPick(room, token, playerId)),
    lockLineup: (code: string, token: string, lineup: unknown) =>
      mutate(code, (room) => applyLineup(room, token, lineup)),
    nextSeriesGame: (code: string, token: string, expectedGame: number, winner: 'A' | 'B') =>
      mutate(code, (room) => applyNextGame(room, token, expectedGame, winner)),
    finishRoom: (code: string, token: string) =>
      mutate(code, (room) => applyFinish(room, token)),
  };
}

export type PartyService = ReturnType<typeof createPartyService>;
