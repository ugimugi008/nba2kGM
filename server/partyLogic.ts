/**
 * Pure party-room rules. Every function receives a mutable copy of the room
 * and either mutates it (success) or returns an error. Storage and transport
 * live elsewhere so the same rules run on Express, Vercel, and in tests.
 */
import type {
  DraftMode,
  RoomState,
  SeriesMode,
  SpinState,
  TeamLineup,
} from '../src/types/game.js';

export interface ActionResult {
  error?: string;
  status?: number;
  /** false when the action was a no-op (nothing to persist). */
  changed?: boolean;
}

export const ROOM_TTL_SECONDS = 6 * 60 * 60;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const MAX_ROSTER = 13;

export function normalizeCode(raw: string | undefined | null): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9_-]{4,12}$/.test(code);
}

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function makeInitialSpinState(): SpinState {
  return {
    phase: 'ready',
    teamAbbr: '',
    year: 0,
    candidateIds: [],
    spinNonce: 0,
    rerollsLeftA: 2,
    rerollsLeftB: 2,
  };
}

function emptyLineup(): TeamLineup {
  return { starters: [], bench: [], minutes: {}, locked: false };
}

function cleanName(raw: unknown, fallback: string): string {
  const trimmed = String(raw ?? '').trim().slice(0, 32);
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanYears(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_YEARS];
  const years = raw
    .map((y) => Number(y))
    .filter((y) => Number.isInteger(y) && y >= 1946 && y <= 2100)
    .slice(0, 40);
  return years.length > 0 ? years : [...DEFAULT_YEARS];
}

function cleanIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v) => typeof v === 'string' && v.length > 0 && v.length <= 80)
    .slice(0, max) as string[];
}

function cleanLineup(raw: unknown): TeamLineup | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Partial<TeamLineup>;
  const starters = cleanIdList(l.starters, 5);
  const bench = cleanIdList(l.bench, 8);
  const minutes: Record<string, number> = {};
  if (l.minutes && typeof l.minutes === 'object') {
    for (const [id, mins] of Object.entries(l.minutes)) {
      const n = Number(mins);
      if (Number.isFinite(n)) minutes[id.slice(0, 80)] = Math.max(0, Math.min(240, n));
    }
  }
  return { starters, bench, minutes, locked: Boolean(l.locked) };
}

export interface CreateRoomParams {
  hostToken?: string;
  hostName?: string;
  draftMode?: DraftMode;
  includeHistoric?: boolean;
  selectedYears?: number[];
  seriesMode?: SeriesMode;
}

export function buildNewRoom(code: string, params: CreateRoomParams): RoomState | ActionResult {
  const hostToken = String(params.hostToken ?? '');
  if (hostToken.length < 4 || hostToken.length > 128) {
    return { error: 'Missing player session token.', status: 400 };
  }
  return {
    id: code,
    rev: 1,
    hostUid: hostToken,
    hostName: cleanName(params.hostName, 'Player 1'),
    guestUid: '',
    guestName: '',
    status: 'lobby',
    draftMode: params.draftMode === 'open' ? 'open' : 'spin',
    includeHistoric: Boolean(params.includeHistoric),
    selectedYears: cleanYears(params.selectedYears),
    poolIds: [],
    draftOrder: [],
    pickIndex: 0,
    spinState: makeInitialSpinState(),
    teamARoster: [],
    teamBRoster: [],
    teamALineup: emptyLineup(),
    teamBLineup: emptyLineup(),
    seriesMode: params.seriesMode === 'bo7' ? 'bo7' : 'single',
    teamAWins: 0,
    teamBWins: 0,
    gameNumber: 1,
    simSeed: 0,
    simStartedAt: 0,
  };
}

function isMember(room: RoomState, token: string): boolean {
  return token.length > 0 && (token === room.hostUid || token === room.guestUid);
}

export function applyJoin(room: RoomState, guestToken: string, guestName?: string): ActionResult {
  if (!guestToken || guestToken.length < 4 || guestToken.length > 128) {
    return { error: 'Missing player session token.', status: 400 };
  }
  // Re-joining your own room (e.g. after a refresh) is a harmless no-op.
  if (isMember(room, guestToken)) return { changed: false };
  if (room.status === 'finished') {
    return { error: 'This party has already ended.', status: 410 };
  }
  if (room.guestUid) {
    return { error: 'This party room already has two players.', status: 409 };
  }
  if (room.status !== 'lobby') {
    return { error: 'This match has already started.', status: 409 };
  }
  room.guestUid = guestToken;
  room.guestName = cleanName(guestName, 'Player 2');
  return {};
}

export interface StartDraftPayload {
  draftMode?: DraftMode;
  includeHistoric?: boolean;
  selectedYears?: number[];
  seriesMode?: SeriesMode;
  poolIds?: string[];
  draftOrder?: ('A' | 'B')[];
}

export function applyStart(room: RoomState, token: string, payload: StartDraftPayload): ActionResult {
  if (room.hostUid !== token) {
    return { error: 'Only the party host can start the draft.', status: 403 };
  }
  if (!room.guestUid) {
    return { error: 'Waiting for your friend to join the party code first.', status: 400 };
  }
  if (room.status !== 'lobby') {
    return { error: 'Draft already started.', status: 409 };
  }
  const draftOrder = Array.isArray(payload.draftOrder)
    ? payload.draftOrder.filter((s) => s === 'A' || s === 'B').slice(0, MAX_ROSTER * 2)
    : [];
  if (draftOrder.length === 0) {
    return { error: 'Draft order is missing.', status: 400 };
  }

  room.status = 'drafting';
  room.draftMode = payload.draftMode === 'open' ? 'open' : 'spin';
  room.includeHistoric = Boolean(payload.includeHistoric);
  room.selectedYears = cleanYears(payload.selectedYears);
  room.seriesMode = payload.seriesMode === 'bo7' ? 'bo7' : 'single';
  room.poolIds = cleanIdList(payload.poolIds, 500);
  room.draftOrder = draftOrder;
  room.pickIndex = 0;
  room.spinState = makeInitialSpinState();
  room.teamARoster = [];
  room.teamBRoster = [];
  return {};
}

function currentTurnToken(room: RoomState): string {
  const turn = room.draftOrder[room.pickIndex];
  return turn === 'A' ? room.hostUid : turn === 'B' ? room.guestUid : '';
}

export function applySpin(room: RoomState, token: string, next: Partial<SpinState> | undefined): ActionResult {
  if (room.status !== 'drafting' || room.draftMode !== 'spin') {
    return { error: 'Spinning is only allowed during a Spin Draft.', status: 400 };
  }
  if (!token || token !== currentTurnToken(room)) {
    return { error: 'Wait for your turn to spin.', status: 403 };
  }
  if (!next || Number(next.spinNonce) !== room.spinState.spinNonce + 1) {
    return { error: 'Out-of-date spin. Syncing…', status: 409 };
  }

  const side = room.draftOrder[room.pickIndex];
  const prev = room.spinState;
  const isReroll = prev.phase === 'spun';
  let rerollsLeftA = prev.rerollsLeftA;
  let rerollsLeftB = prev.rerollsLeftB;
  if (isReroll) {
    const left = side === 'A' ? rerollsLeftA : rerollsLeftB;
    if (left <= 0) return { error: 'No re-spins left.', status: 400 };
    if (side === 'A') rerollsLeftA -= 1;
    else rerollsLeftB -= 1;
  }

  const candidateIds = cleanIdList(next.candidateIds, 15);
  if (candidateIds.length === 0) {
    return { error: 'Spin landed on an empty squad.', status: 400 };
  }

  room.spinState = {
    phase: 'spun',
    teamAbbr: String(next.teamAbbr ?? '').slice(0, 5),
    year: Number(next.year) || 0,
    candidateIds,
    spinNonce: prev.spinNonce + 1,
    rerollsLeftA,
    rerollsLeftB,
  };
  return {};
}

export function applyPick(room: RoomState, token: string, playerId: string): ActionResult {
  if (room.status !== 'drafting') {
    return { error: 'Draft is not active.', status: 400 };
  }
  if (!token || token !== currentTurnToken(room)) {
    return { error: 'Not your turn to draft.', status: 403 };
  }
  if (!playerId) return { error: 'Missing playerId.', status: 400 };
  if (room.teamARoster.includes(playerId) || room.teamBRoster.includes(playerId)) {
    return { error: 'Player already drafted.', status: 409 };
  }
  if (room.draftMode === 'spin') {
    if (room.spinState.phase !== 'spun') {
      return { error: 'Spin the reels before drafting.', status: 400 };
    }
    if (!room.spinState.candidateIds.includes(playerId)) {
      return { error: 'That player is not on the spun roster.', status: 400 };
    }
  } else if (room.poolIds.length > 0 && !room.poolIds.includes(playerId)) {
    return { error: 'That player is not in this draft pool.', status: 400 };
  }

  const turn = room.draftOrder[room.pickIndex];
  if (turn === 'A') room.teamARoster.push(playerId);
  else room.teamBRoster.push(playerId);

  room.pickIndex += 1;
  room.spinState = {
    ...room.spinState,
    phase: 'ready',
    teamAbbr: '',
    year: 0,
    candidateIds: [],
  };
  if (room.pickIndex >= room.draftOrder.length) {
    room.status = 'lineup';
  }
  return {};
}

export function applyLineup(room: RoomState, token: string, rawLineup: unknown): ActionResult {
  if (room.status !== 'lineup') {
    return { error: 'Lineup phase is not active.', status: 400 };
  }
  const lineup = cleanLineup(rawLineup);
  if (!lineup) return { error: 'Invalid lineup.', status: 400 };

  if (token === room.hostUid) {
    room.teamALineup = lineup;
  } else if (token === room.guestUid && token) {
    room.teamBLineup = lineup;
  } else {
    return { error: 'You are not part of this party room.', status: 403 };
  }

  if (room.teamALineup.locked && room.teamBLineup.locked) {
    room.status = 'simulating';
    room.simSeed = Math.floor(Math.random() * 900_000_000) + 100_000;
    room.simStartedAt = Date.now();
  }
  return {};
}

export function applyNextGame(
  room: RoomState,
  token: string,
  expectedGameNumber: number,
  winner: 'A' | 'B'
): ActionResult {
  if (!isMember(room, token)) {
    return { error: 'You are not part of this party room.', status: 403 };
  }
  // Idempotent: if both players click "Next Game", only the first one counts.
  if (room.status !== 'simulating' || room.gameNumber !== expectedGameNumber) {
    return { changed: false };
  }
  if (winner === 'A') room.teamAWins += 1;
  else room.teamBWins += 1;
  room.gameNumber += 1;
  room.status = 'lineup';
  room.simSeed = 0;
  room.teamALineup = { ...room.teamALineup, locked: false };
  room.teamBLineup = { ...room.teamBLineup, locked: false };
  return {};
}

export function applyFinish(room: RoomState, token: string): ActionResult {
  if (!isMember(room, token)) {
    return { error: 'You are not part of this party room.', status: 403 };
  }
  if (room.status === 'finished') return { changed: false };
  room.status = 'finished';
  return {};
}
