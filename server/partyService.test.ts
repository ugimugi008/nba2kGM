import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartyService } from './partyService.js';
import { handlePartyRequest } from './partyHandler.js';
import {
  createMemoryStorage,
  createTcpRedisStorage,
  createUpstashStorage,
  type RoomStorage,
} from './storage.js';

const backends: { name: string; make: () => Promise<RoomStorage> }[] = [
  { name: 'memory', make: async () => createMemoryStorage() },
];
if (process.env.TEST_REDIS_URL) {
  backends.push({ name: 'redis', make: () => createTcpRedisStorage(process.env.TEST_REDIS_URL!) });
}
if (process.env.TEST_UPSTASH_URL) {
  backends.push({
    name: 'upstash',
    make: () => createUpstashStorage(process.env.TEST_UPSTASH_URL!, process.env.TEST_UPSTASH_TOKEN || 'test'),
  });
}

const HOST = 'token_host_1';
const GUEST = 'token_guest_2';
const spin = (nonce: number, ids: string[], extra: Record<string, unknown> = {}) => ({
  phase: 'spun' as const,
  teamAbbr: 'BOS',
  year: 1986,
  candidateIds: ids,
  spinNonce: nonce,
  rerollsLeftA: 2,
  rerollsLeftB: 2,
  ...extra,
});

for (const backend of backends) {
  test(`[${backend.name}] full party flow: create → join → draft → lineup → series`, async () => {
    const svc = createPartyService(await backend.make());

    const created = await svc.createRoom({
      hostToken: HOST,
      hostName: 'Dimash',
      draftMode: 'spin',
      includeHistoric: true,
      selectedYears: [2016, 2025],
      seriesMode: 'bo7',
    });
    assert.ok(created.room);
    const code = created.room.id;
    assert.equal(code.length, 6);
    assert.equal(created.room.rev, 1);
    assert.equal(created.room.status, 'lobby');

    const startPayload = {
      draftMode: 'spin' as const,
      includeHistoric: true,
      selectedYears: [2016, 2025],
      seriesMode: 'bo7' as const,
      poolIds: [],
      draftOrder: ['A', 'B'] as ('A' | 'B')[],
    };
    assert.equal((await svc.startDraft(code, HOST, startPayload)).status, 400, 'cannot start alone');

    // lower-case code works too
    const joined = await svc.joinRoom(code.toLowerCase(), GUEST, 'Alex');
    assert.equal(joined.room?.guestName, 'Alex');
    assert.equal(joined.room?.rev, 2);

    // re-join (refresh) is a no-op, third player is rejected
    assert.equal((await svc.joinRoom(code, GUEST, 'Alex')).room?.rev, 2);
    assert.equal((await svc.joinRoom(code, 'token_intruder_3', 'X')).status, 409);
    assert.equal((await svc.startDraft(code, GUEST, startPayload)).status, 403, 'guest cannot start');

    assert.equal((await svc.startDraft(code, HOST, startPayload)).room?.status, 'drafting');

    assert.equal((await svc.spinReels(code, GUEST, spin(1, ['bird_86']))).status, 403, 'wrong turn');
    assert.equal((await svc.pickPlayer(code, HOST, 'bird_86')).status, 400, 'must spin first');
    assert.equal((await svc.spinReels(code, HOST, spin(5, ['bird_86']))).status, 409, 'stale nonce');

    const s1 = await svc.spinReels(code, HOST, spin(1, ['bird_86', 'mchale_86']));
    assert.equal(s1.room?.spinState.teamAbbr, 'BOS');
    // re-spin consumes a reroll even if the client lies about it
    const s2 = await svc.spinReels(code, HOST, spin(2, ['bird_86', 'mchale_86'], { rerollsLeftA: 2 }));
    assert.equal(s2.room?.spinState.rerollsLeftA, 1);

    assert.equal((await svc.pickPlayer(code, HOST, 'not_on_roster')).status, 400);
    const p1 = await svc.pickPlayer(code, HOST, 'bird_86');
    assert.deepEqual(p1.room?.teamARoster, ['bird_86']);

    await svc.spinReels(code, GUEST, spin(3, ['magic_87'], { teamAbbr: 'LAL' }));
    const p2 = await svc.pickPlayer(code, GUEST, 'magic_87');
    assert.equal(p2.room?.status, 'lineup');

    // Both lock lineups AT THE SAME TIME — neither lock may be lost.
    const [lockA, lockB] = await Promise.all([
      svc.lockLineup(code, HOST, { starters: ['bird_86'], bench: [], minutes: { bird_86: 240 }, locked: true }),
      svc.lockLineup(code, GUEST, { starters: ['magic_87'], bench: [], minutes: { magic_87: 240 }, locked: true }),
    ]);
    assert.ok(lockA.room && lockB.room);
    const afterLock = (await svc.getRoom(code)).room!;
    assert.equal(afterLock.status, 'simulating');
    assert.ok(afterLock.teamALineup.locked && afterLock.teamBLineup.locked);
    assert.ok(afterLock.simSeed >= 100_000);

    // Both click Next Game simultaneously — only one win is counted.
    const [g2a, g2b] = await Promise.all([
      svc.nextSeriesGame(code, HOST, 1, 'A'),
      svc.nextSeriesGame(code, GUEST, 1, 'A'),
    ]);
    assert.ok(g2a.room && g2b.room);
    const afterNext = (await svc.getRoom(code)).room!;
    assert.equal(afterNext.teamAWins, 1);
    assert.equal(afterNext.gameNumber, 2);
    assert.equal(afterNext.status, 'lineup');

    // Polling: unchanged rev → 204, changed → room
    const rev = afterNext.rev!;
    const same = await handlePartyRequest({ method: 'GET', segments: [code], body: null, query: { since: String(rev) } }, svc);
    assert.equal(same.status, 204);
    const older = await handlePartyRequest({ method: 'GET', segments: [code], body: null, query: { since: String(rev - 1) } }, svc);
    assert.equal(older.status, 200);

    // Leaving ends the party; nobody else can join afterwards
    assert.equal((await svc.finishRoom(code, 'stranger')).status, 403);
    assert.equal((await svc.finishRoom(code, GUEST)).room?.status, 'finished');
    assert.equal((await svc.joinRoom(code, 'late', 'Late')).status, 410);
  });

  test(`[${backend.name}] unknown and malformed codes`, async () => {
    const svc = createPartyService(await backend.make());
    assert.equal((await svc.joinRoom('ZZZZZZ', GUEST)).status, 404);
    assert.equal((await svc.getRoom('no')).status, 400);
    const r = await handlePartyRequest({ method: 'GET', segments: ['ZZZZZZ'], body: null, query: { since: '3' } }, svc);
    assert.equal(r.status, 404);
  });
}
