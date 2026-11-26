import test from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABLE_2K_YEARS, BASE_PLAYERS, TEAM_META } from '../data/players';
import {
  getEligibleSquads,
  groupPlayerSquads,
  pickBestCandidateForCpu,
  spinTeamAndYear,
} from './spinDraft';

test('BASE_PLAYERS has zero duplicate IDs, zero 1-card squads, and covers all 32 franchises', () => {
  const seenIds = new Set<string>();
  for (const card of BASE_PLAYERS) {
    assert.equal(seenIds.has(card.id), false, `Duplicate card id found: ${card.id}`);
    seenIds.add(card.id);
  }

  const allSquadsOnePlus = groupPlayerSquads(BASE_PLAYERS, 1);
  const multiSquads = groupPlayerSquads(BASE_PLAYERS, 2);
  assert.equal(
    allSquadsOnePlus.length,
    multiSquads.length,
    'Every (Team, Year) squad should have at least 2 players'
  );
  assert.ok(multiSquads.length >= 100, `Expected >= 100 multi-player squads, got ${multiSquads.length}`);

  const activeTeams = new Set(multiSquads.map((s) => s.teamAbbr));
  for (const abbr of Object.keys(TEAM_META)) {
    assert.ok(activeTeams.has(abbr), `Franchise ${abbr} missing multi-player Spin Draft squad`);
  }
});

test('iconic historic squads & stars (Russell, Wilt, West, Moses, Dirk, Wade, Bosh, Carmelo) are present', () => {
  const squads = groupPlayerSquads(BASE_PLAYERS, 2);
  const requiredSquads: Array<[string, number, string]> = [
    ['BOS', 1965, 'Bill Russell Celtics'],
    ['PHI', 1967, 'Wilt Chamberlain 76ers'],
    ['MIL', 1971, 'Kareem & Oscar Bucks'],
    ['LAL', 1972, 'West & Wilt Lakers'],
    ['PHI', 1983, 'Moses Malone & Dr. J 76ers'],
    ['BOS', 1986, '1985-86 Larry Bird Celtics'],
    ['LAL', 1987, 'Showtime Magic Lakers'],
    ['DAL', 2011, 'Dirk Nowitzki Mavericks'],
    ['MIA', 2006, 'Dwyane Wade & Shaq Heat'],
    ['MIA', 2013, 'LeBron, Wade & Bosh Heat'],
    ['NYK', 2015, 'Carmelo Anthony Knicks'],
  ];

  for (const [abbr, yr, label] of requiredSquads) {
    assert.ok(
      squads.some((s) => s.teamAbbr === abbr && s.year === yr && s.playerIds.length >= 3),
      `${label} (${abbr} ${yr}) should be present with >= 3 players`
    );
  }

  const names = new Set(BASE_PLAYERS.map((p) => p.name));
  for (const star of [
    'Bill Russell',
    'Wilt Chamberlain',
    'Jerry West',
    'Moses Malone',
    'Julius Erving',
    'Dirk Nowitzki',
    'Dwyane Wade',
    'Chris Bosh',
    'Carmelo Anthony',
  ]) {
    assert.ok(names.has(star), `${star} must be present in BASE_PLAYERS`);
  }
});

test('getEligibleSquads strictly excludes historic squads when includeHistoric is false', () => {
  const eligible = getEligibleSquads(
    BASE_PLAYERS,
    false,
    [...AVAILABLE_2K_YEARS],
    new Set(),
    new Set()
  );
  assert.ok(eligible.length >= 45);
  assert.equal(
    eligible.some((s) => s.isHistoric),
    false,
    'No historic squads should appear when includeHistoric is false'
  );
});

test('spinTeamAndYear returns cards strictly belonging to the spun Team and Year', () => {
  const playersMap = Object.fromEntries(BASE_PLAYERS.map((p) => [p.id, p]));
  let step = 0;
  const fakeRng = () => {
    step += 1;
    return (step * 0.37) % 1;
  };

  for (let i = 0; i < 15; i++) {
    const outcome = spinTeamAndYear(
      BASE_PLAYERS,
      true,
      [...AVAILABLE_2K_YEARS],
      new Set(),
      new Set(),
      fakeRng
    );
    assert.ok(outcome !== null);
    assert.ok(outcome.candidateIds.length >= 2);
    for (const id of outcome.candidateIds) {
      const card = playersMap[id];
      assert.equal(card.teamAbbr, outcome.teamAbbr);
      assert.equal(card.year, outcome.year);
    }
  }
});

test('spinTeamAndYear prevents recent team repeats on turns and re-spins', () => {
  const playersMap = Object.fromEntries(BASE_PLAYERS.map((p) => [p.id, p]));
  const recentTeams: string[] = [];

  // Run 8 consecutive spins with rng returning 0 every time — recentTeams anti-repeat must rotate 8 distinct teams
  for (let i = 0; i < 8; i++) {
    const spin = spinTeamAndYear(
      BASE_PLAYERS,
      true,
      [...AVAILABLE_2K_YEARS],
      new Set(),
      new Set(),
      () => 0,
      undefined,
      recentTeams
    );
    assert.ok(spin);
    assert.equal(
      recentTeams.includes(spin.teamAbbr),
      false,
      `Expected no repeat team during spin #${i + 1}, got ${spin.teamAbbr}`
    );
    recentTeams.push(spin.teamAbbr);
  }

  // Re-spin with excludeTeamAbbr avoids landing on the same franchise even across another year
  const first = recentTeams[0];
  const reroll = spinTeamAndYear(
    BASE_PLAYERS,
    true,
    [...AVAILABLE_2K_YEARS],
    new Set(),
    new Set(),
    () => 0,
    `${first}_2015`,
    [],
    first
  );
  assert.ok(reroll);
  assert.notEqual(reroll.teamAbbr, first, 'Re-spin must change franchise when other teams exist');

  // CPU already has Kobe Bryant ('kobe_02'), should pick another LAL 2008 card (not kobe_08)
  const lal08Ids = ['kobe_08', 'pgasol_08', 'odom_08', 'bynum_08'];
  const cpuPick = pickBestCandidateForCpu(lal08Ids, playersMap, ['kobe_02']);
  assert.ok(cpuPick);
  assert.notEqual(cpuPick.name, 'Kobe Bryant');
});
