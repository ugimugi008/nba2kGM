import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_PLAYERS } from '../data/players';
import { canPlayPosition, formatPlayerPositions } from '../data/positions';
import { PlayerCard, TeamLineup } from '../types/game';
import {
  buildDefaultLineup,
  computeTeamChemistry,
  generateAlternatingDraftOrder,
  generateSnakeDraftOrder,
  simulateMatchup,
} from './simEngine';

const playersMap: Record<string, PlayerCard> = Object.fromEntries(
  BASE_PLAYERS.map((p) => [p.id, p])
);

test('1-by-1 alternating draft order yields strict A, B, A, B picks (13 per team)', () => {
  const order = generateAlternatingDraftOrder('A', 26);
  assert.equal(order.length, 26);
  assert.equal(order.filter((t) => t === 'A').length, 13);
  assert.equal(order.filter((t) => t === 'B').length, 13);
  assert.deepEqual(order.slice(0, 6), ['A', 'B', 'A', 'B', 'A', 'B']);
});

test('snake draft order helper remains balanced (13 per team)', () => {
  const order = generateSnakeDraftOrder('A', 26);
  assert.equal(order.length, 26);
  assert.equal(order.filter((t) => t === 'A').length, 13);
  assert.equal(order.filter((t) => t === 'B').length, 13);
  assert.deepEqual(order.slice(0, 4), ['A', 'B', 'B', 'A']);
});

test('buildDefaultLineup assigns 5 starters, 8 bench, and 240 total minutes', () => {
  const rosterIds = BASE_PLAYERS.slice(0, 13).map((p) => p.id);
  const lineup = buildDefaultLineup(rosterIds, playersMap);
  assert.equal(lineup.starters.length, 5);
  assert.equal(lineup.bench.length, 8);
  const totalMin = Object.values(lineup.minutes).reduce((a, b) => a + b, 0);
  assert.equal(totalMin, 240);
});

test('computeTeamChemistry rewards balanced floor-spacing & playmaking over iso-heavy squads', () => {
  const balancedIds = [
    'curry_2k16',
    'klay_2k16',
    'kawhi_2k19',
    'draymond_2k16',
    'jokic_2k25',
    ...BASE_PLAYERS.slice(10, 18).map((p) => p.id),
  ];
  const balancedLineup = buildDefaultLineup(balancedIds, playersMap);
  const balancedChem = computeTeamChemistry(balancedLineup, playersMap);

  const cloggedRoster = [
    'shaq_01',
    'ben_wallace_04',
    'rodman_96',
    'gobert_2k20',
    'wilt_67',
    ...BASE_PLAYERS.slice(20, 28).map((p) => p.id),
  ];
  const cloggedLineup: TeamLineup = {
    starters: cloggedRoster.slice(0, 5),
    bench: cloggedRoster.slice(5, 13),
    minutes: {
      shaq_01: 44,
      ben_wallace_04: 44,
      rodman_96: 44,
      gobert_2k20: 44,
      wilt_67: 44,
      ...Object.fromEntries(cloggedRoster.slice(5, 13).map((id, i) => [id, i === 0 ? 20 : 0])),
    },
    locked: false,
  };
  const cloggedChem = computeTeamChemistry(cloggedLineup, playersMap);

  assert.ok(
    balancedChem.chemistryScore > cloggedChem.chemistryScore + 15,
    `Expected balanced (${balancedChem.chemistryScore}) > clogged (${cloggedChem.chemistryScore})`
  );
});

test('non-3PT historic bigs (Shaq, Wilt, Russell, Gobert) attempt 0 three-pointers', () => {
  const teamA = [
    'cp3_2k15',
    'jordan_96',
    'pippen_96',
    'duncan_03',
    'shaq_01',
    'wilt_67',
    'russell_65',
    'gobert_2k20',
    'kidd_02',
    'allen_06',
    'pierce_08',
    'garnett_04',
    'ben_wallace_04',
  ];
  const teamB = [
    'curry_2k16',
    'klay_2k16',
    'lebron_2k18',
    'giannis_2k25',
    'jokic_2k25',
    'durant_2k18',
    'kawhi_2k19',
    'sga_2k26',
    'luka_2k25',
    'tatum_2k25',
    'edwards_2k26',
    'ad_2k24',
    'wembanyama_2k26',
  ];

  const lineupA = buildDefaultLineup(teamA, playersMap);
  const lineupB = buildDefaultLineup(teamB, playersMap);

  const result = simulateMatchup(teamA, lineupA, teamB, lineupB, playersMap, 123456);
  const shaqStats = result.finalBoxScores.find((b) => b.playerId === 'shaq_01');
  const duncanStats = result.finalBoxScores.find((b) => b.playerId === 'duncan_03');
  assert.ok(shaqStats, 'Shaq should appear in box score');
  assert.equal(shaqStats!.tpa, 0, 'Shaq must never attempt 3-pointers');
  assert.ok((duncanStats?.tpa ?? 0) <= 1, 'Duncan should barely ever shoot 3s');
});

test('simulateMatchup is 100% deterministic for a given seed across devices', () => {
  const teamA = BASE_PLAYERS.slice(0, 13).map((p) => p.id);
  const teamB = BASE_PLAYERS.slice(13, 26).map((p) => p.id);
  const lineupA = buildDefaultLineup(teamA, playersMap);
  const lineupB = buildDefaultLineup(teamB, playersMap);

  const run1 = simulateMatchup(teamA, lineupA, teamB, lineupB, playersMap, 987654321);
  const run2 = simulateMatchup(teamA, lineupA, teamB, lineupB, playersMap, 987654321);

  assert.equal(run1.finalScoreA, run2.finalScoreA);
  assert.equal(run1.finalScoreB, run2.finalScoreB);
  assert.equal(run1.events.length, run2.events.length);
  assert.equal(run1.mvp.playerId, run2.mvp.playerId);
  assert.notEqual(run1.finalScoreA, run1.finalScoreB, 'Tiebreaker guarantees clear winner');
});

test('elite defense lowers opponent shooting efficiency compared to weak defense', () => {
  const eliteOffense = [
    'curry_2k16',
    'harden_2k19',
    'durant_2k18',
    'dirk_11',
    'jokic_2k25',
    ...BASE_PLAYERS.slice(0, 8).map((p) => p.id),
  ];
  const lockDefense = [
    'payton_96',
    'jordan_96',
    'kawhi_2k17',
    'duncan_03',
    'hakeem_94',
    'pippen_96',
    'garnett_04',
    'ben_wallace_04',
    'jrue_2k21',
    'dwhite_2k25',
    'ad_2k20',
    'gobert_2k20',
    'russell_65',
  ];
  const weakDefense = [
    'nash_07',
    'lillard_2k20',
    'carmelo_2k15',
    'dirk_11',
    'cousins_2k16',
    'kyrie_2k18',
    'maxey_2k25',
    'haliburton_2k24',
    'morant_2k22',
    'brunson_2k24',
    'harden_2k19',
    'luka_2k22',
    'mitchell_2k23',
  ];

  const offLineup = buildDefaultLineup(eliteOffense, playersMap);
  const lockLineup = buildDefaultLineup(lockDefense, playersMap);
  const weakLineup = buildDefaultLineup(weakDefense, playersMap);

  let ptsVsLock = 0;
  let ptsVsWeak = 0;
  for (let s = 1; s <= 5; s++) {
    ptsVsLock += simulateMatchup(eliteOffense, offLineup, lockDefense, lockLineup, playersMap, s * 101).finalScoreA;
    ptsVsWeak += simulateMatchup(eliteOffense, offLineup, weakDefense, weakLineup, playersMap, s * 101).finalScoreA;
  }

  assert.ok(
    ptsVsWeak > ptsVsLock,
    `Expected offense to score more vs weak D (${ptsVsWeak}) than lockdown D (${ptsVsLock})`
  );
});

test('secondary positions support versatile stars across LineupLab & Chemistry', () => {
  const lebron = playersMap['lebron_2k16'];
  const magic = playersMap['magic_87'];
  const kyrie = playersMap['kyrie_2k18'];

  assert.ok(canPlayPosition(lebron, 'PG') && canPlayPosition(lebron, 'PF'));
  assert.ok(canPlayPosition(magic, 'PF') && canPlayPosition(magic, 'C'));
  assert.ok(canPlayPosition(kyrie, 'SG'));
  assert.ok(formatPlayerPositions(kyrie).includes('SG'));

  // Roster without a primary PG should slot Magic or LeBron into PG cleanly without Out-of-Position Friction
  const noNaturalPgIds = [
    'lebron_2k16', // SF / PG·SG·PF
    'jordan_96',   // SG
    'bird_86',     // SF
    'dirk_11',     // PF
    'russell_65',  // C
    'kobe_08',
    'wade_09',
    'bosh_13',
    'carmelo_2k15',
    'pippen_96',
    'mchale_86',
    'garnett_04',
    'moses_83',
  ];
  const lineup = buildDefaultLineup(noNaturalPgIds, playersMap);
  const chem = computeTeamChemistry(lineup, playersMap);
  assert.equal(
    chem.modifiers.some((m) => m.label === 'Out-of-Position Friction'),
    false,
    'Versatile LeBron/Jordan/Bird/Dirk/Russell lineup should not trigger Out-of-Position Friction'
  );
});
