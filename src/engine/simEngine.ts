import {
  ChemistryReport,
  PlayerBoxScore,
  PlayerCard,
  Position,
  SimGameResult,
  SimPlayEvent,
  TeamLineup,
} from '../types/game';
import { canPlayPosition } from '../data/positions';

/**
 * Deterministic 32-bit PRNG (Mulberry32) so both connected devices
 * replay the exact same SimCast sequence from a shared room seed.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateAlternatingDraftOrder(
  firstTeam: 'A' | 'B' = 'A',
  totalPicks = 26
): ('A' | 'B')[] {
  const order: ('A' | 'B')[] = [];
  const secondTeam: 'A' | 'B' = firstTeam === 'A' ? 'B' : 'A';
  for (let i = 0; i < totalPicks; i++) {
    order.push(i % 2 === 0 ? firstTeam : secondTeam);
  }
  return order;
}

export function generateSnakeDraftOrder(firstTeam: 'A' | 'B' = 'A', totalPicks = 26): ('A' | 'B')[] {
  const order: ('A' | 'B')[] = [];
  const secondTeam: 'A' | 'B' = firstTeam === 'A' ? 'B' : 'A';
  for (let i = 0; i < totalPicks; i++) {
    const round = Math.floor(i / 2);
    const pickInRound = i % 2;
    if (round % 2 === 0) {
      order.push(pickInRound === 0 ? firstTeam : secondTeam);
    } else {
      order.push(pickInRound === 0 ? secondTeam : firstTeam);
    }
  }
  return order;
}

export function buildDefaultLineup(
  rosterIds: string[],
  playersMap: Record<string, PlayerCard>
): TeamLineup {
  const cards = rosterIds
    .map((id) => playersMap[id])
    .filter((c): c is PlayerCard => Boolean(c));

  const positionsOrder: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const used = new Set<string>();
  const starters: string[] = [];

  // Fill each starting slot with primary natural fit first, then secondary position fit, then OVR fallback
  for (const targetPos of positionsOrder) {
    const primaryCandidates = cards
      .filter((c) => !used.has(c.id) && c.pos === targetPos)
      .sort((a, b) => b.ovr - a.ovr);
    if (primaryCandidates.length > 0) {
      starters.push(primaryCandidates[0].id);
      used.add(primaryCandidates[0].id);
      continue;
    }

    const secondaryCandidates = cards
      .filter((c) => !used.has(c.id) && canPlayPosition(c, targetPos))
      .sort((a, b) => b.ovr - a.ovr);
    if (secondaryCandidates.length > 0) {
      starters.push(secondaryCandidates[0].id);
      used.add(secondaryCandidates[0].id);
      continue;
    }

    const fallback = cards
      .filter((c) => !used.has(c.id))
      .sort((a, b) => b.ovr - a.ovr);
    if (fallback.length > 0) {
      starters.push(fallback[0].id);
      used.add(fallback[0].id);
    }
  }

  const bench = cards
    .filter((c) => !used.has(c.id))
    .sort((a, b) => b.ovr - a.ovr)
    .map((c) => c.id);

  const minutes: Record<string, number> = {};
  const starterMinTargets = [35, 34, 34, 33, 32]; // 168 min
  starters.forEach((id, idx) => {
    minutes[id] = starterMinTargets[idx] ?? 32;
  });

  // Remaining 72 minutes spread across top 4-5 bench players, deep reserves get 0-4
  const benchMinTargets = [20, 18, 16, 12, 6, 0, 0, 0];
  bench.forEach((id, idx) => {
    minutes[id] = benchMinTargets[idx] ?? 0;
  });

  // Ensure exact 240 total even if roster < 13
  normalizeMinutesTo240(minutes, [...starters, ...bench]);

  return {
    starters,
    bench,
    minutes,
    locked: false,
  };
}

export function normalizeMinutesTo240(
  minutes: Record<string, number>,
  orderedIds: string[]
): Record<string, number> {
  if (orderedIds.length === 0) return minutes;
  let sum = orderedIds.reduce((acc, id) => acc + Math.max(0, Math.round(minutes[id] ?? 0)), 0);
  if (sum === 240) return minutes;

  let idx = 0;
  let guard = 0;
  while (sum !== 240 && guard < 1000) {
    const id = orderedIds[idx % orderedIds.length];
    const current = minutes[id] ?? 0;
    if (sum < 240 && current < 46) {
      minutes[id] = current + 1;
      sum += 1;
    } else if (sum > 240 && current > 0) {
      minutes[id] = current - 1;
      sum -= 1;
    }
    idx += 1;
    guard += 1;
  }
  return minutes;
}

export function computeTeamChemistry(
  lineup: TeamLineup,
  playersMap: Record<string, PlayerCard>
): ChemistryReport {
  const starterCards = lineup.starters
    .map((id) => playersMap[id])
    .filter((c): c is PlayerCard => Boolean(c));
  const allCards = [...lineup.starters, ...lineup.bench]
    .map((id) => playersMap[id])
    .filter((c): c is PlayerCard => Boolean(c));

  if (starterCards.length === 0) {
    return {
      chemistryScore: 50,
      offenseRating: 70,
      defenseRating: 70,
      insideRating: 70,
      shootingRating: 70,
      playmakingRating: 70,
      reboundingRating: 70,
      modifiers: [],
    };
  }

  // Weighted averages by allocated minutes
  let totalWeight = 0;
  let wInside = 0;
  let wShooting = 0;
  let wPlaymaking = 0;
  let wDefense = 0;
  let wRebounding = 0;

  for (const card of allCards) {
    const w = Math.max(1, lineup.minutes[card.id] ?? 0);
    totalWeight += w;
    wInside += card.inside * w;
    wShooting += card.shooting * w;
    wPlaymaking += card.playmaking * w;
    wDefense += card.defense * w;
    wRebounding += card.rebounding * w;
  }

  const insideRating = Math.round(wInside / totalWeight);
  const shootingRating = Math.round(wShooting / totalWeight);
  const playmakingRating = Math.round(wPlaymaking / totalWeight);
  const defenseRating = Math.round(wDefense / totalWeight);
  const reboundingRating = Math.round(wRebounding / totalWeight);
  const offenseRating = Math.round(insideRating * 0.36 + shootingRating * 0.4 + playmakingRating * 0.24);

  let chem = 74;
  const modifiers: ChemistryReport['modifiers'] = [];

  // 1. Playmaking hub check
  const maxStarterPlaymaking = Math.max(...starterCards.map((c) => c.playmaking));
  if (maxStarterPlaymaking >= 88) {
    chem += 8;
    modifiers.push({
      label: 'Floor General Orchestration',
      impact: 'positive',
      detail: 'Elite primary playmaker unlocks cleaner looks (+4% AST, -2% TOV).',
    });
  } else if (maxStarterPlaymaking < 78) {
    chem -= 10;
    modifiers.push({
      label: 'No Primary Facilitator',
      impact: 'negative',
      detail: 'Starters lack a high-IQ ball-handler, increasing iso friction.',
    });
  }

  // 2. Floor spacing (3PT shooters among starters)
  const shooters = starterCards.filter((c) => c.shooting >= 82 && c.threePtTendency >= 45);
  if (shooters.length >= 3) {
    chem += 7;
    modifiers.push({
      label: 'Five-Out Spacing',
      impact: 'positive',
      detail: `${shooters.length} perimeter threats keep driving lanes open.`,
    });
  } else if (shooters.length <= 1) {
    chem -= 9;
    modifiers.push({
      label: 'Crowded Paint',
      impact: 'negative',
      detail: 'Limited 3PT gravity lets defenses pack the paint.',
    });
  }

  // 3. Defensive anchor & glass protection
  const anchors = starterCards.filter((c) => c.defense >= 88);
  if (anchors.length >= 2 && reboundingRating >= 75) {
    chem += 7;
    modifiers.push({
      label: 'Defensive Spine',
      impact: 'positive',
      detail: 'Multiple stoppers and strong rebounding anchor transition defense.',
    });
  } else if (anchors.length === 0) {
    chem -= 8;
    modifiers.push({
      label: 'Porous Point-of-Attack',
      impact: 'negative',
      detail: 'No elite stopper in the starting unit to slow hot scorers.',
    });
  }

  // 4. Ball-dominant overlap check (many high-OVR low-playmaking/low-defense scorers)
  const isoHeavy = starterCards.filter((c) => c.ovr >= 92 && c.playmaking < 80 && c.defense < 82);
  if (isoHeavy.length >= 3) {
    chem -= 7;
    modifiers.push({
      label: 'Usage Overlap',
      impact: 'negative',
      detail: 'Too many ball-dominant finishers competing for one basketball.',
    });
  }

  // 5. Bench rotation balance (fatigue resilience)
  const activeBenchCount = lineup.bench.filter((id) => (lineup.minutes[id] ?? 0) >= 10).length;
  if (activeBenchCount >= 3) {
    chem += 4;
    modifiers.push({
      label: 'Deep Rotation',
      impact: 'positive',
      detail: `${activeBenchCount} trusted reserves keep fourth-quarter legs fresh.`,
    });
  } else {
    chem -= 6;
    modifiers.push({
      label: 'Short Bench Risk',
      impact: 'negative',
      detail: 'Heavy starter workload increases late-game fatigue penalties.',
    });
  }

  // 6. Positional slot fit (respecting primary & secondary positions)
  const starterSlots: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const outOfPosCount = starterCards.filter((card, idx) => {
    const slotPos = starterSlots[idx];
    return slotPos ? !canPlayPosition(card, slotPos) : false;
  }).length;
  if (outOfPosCount >= 2) {
    chem -= 6;
    modifiers.push({
      label: 'Out-of-Position Friction',
      impact: 'negative',
      detail: `${outOfPosCount} starters are outside their primary or secondary positions.`,
    });
  }

  chem = Math.max(35, Math.min(99, chem));

  return {
    chemistryScore: chem,
    offenseRating,
    defenseRating,
    insideRating,
    shootingRating,
    playmakingRating,
    reboundingRating,
    modifiers,
  };
}

function createInitialBox(
  player: PlayerCard,
  team: 'A' | 'B'
): PlayerBoxScore {
  return {
    playerId: player.id,
    name: player.name,
    pos: player.pos,
    editionLabel: player.editionLabel,
    team,
    minutes: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    plusMinus: 0,
    stamina: 100,
    heat: 0,
  };
}

function cloneBoxMap(map: Record<string, PlayerBoxScore>): Record<string, PlayerBoxScore> {
  const copy: Record<string, PlayerBoxScore> = {};
  for (const key of Object.keys(map)) {
    copy[key] = { ...map[key] };
  }
  return copy;
}

function pickWeightedIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + Math.max(0.01, b), 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0.01, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function selectActiveFive(
  lineup: TeamLineup,
  boxMap: Record<string, PlayerBoxScore>,
  staminaMap: Record<string, number>,
  quarter: number,
  clockSeconds: number
): string[] {
  const allIds = [...lineup.starters, ...lineup.bench];
  if (allIds.length <= 5) return allIds;

  // Crunch time (Q4 under 4:00): lean heavily on starters unless exhausted (< 38% stamina)
  const isCrunch = quarter === 4 && clockSeconds <= 240;

  const scored = allIds.map((id) => {
    const targetMin = lineup.minutes[id] ?? 0;
    const playedMin = boxMap[id]?.minutes ?? 0;
    const stamina = staminaMap[id] ?? 100;
    const isStarter = lineup.starters.includes(id);

    if (targetMin === 0 && allIds.filter((x) => (lineup.minutes[x] ?? 0) > 0).length >= 5) {
      return { id, priority: -999 };
    }

    const minutesRemainingRatio = targetMin > 0 ? (targetMin - playedMin) / Math.max(1, targetMin) : -0.5;
    let priority = minutesRemainingRatio * 55 + (stamina - 50) * 0.55;
    if (isStarter) priority += isCrunch ? 45 : 10;
    if (stamina < 48) priority -= 35;
    if (playedMin >= targetMin + 4 && !isCrunch) priority -= 30;
    return { id, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, 5).map((s) => s.id);
}

/**
 * Runs a full deterministic 4-quarter possession-by-possession NBA 2K GM simulation.
 * Models: 5 sub-ratings, team chemistry, 3PT tendency era fidelity, offense-vs-defense
 * clash friction, fatigue curves, and hot/cold player momentum streaks.
 */
export function simulateMatchup(
  teamAIds: string[],
  teamALineup: TeamLineup,
  teamBIds: string[],
  teamBLineup: TeamLineup,
  playersMap: Record<string, PlayerCard>,
  seed: number
): SimGameResult {
  const rng = createSeededRng(seed);
  const chemistryA = computeTeamChemistry(teamALineup, playersMap);
  const chemistryB = computeTeamChemistry(teamBLineup, playersMap);

  const boxMap: Record<string, PlayerBoxScore> = {};
  const staminaMap: Record<string, number> = {};
  const heatMap: Record<string, number> = {};

  for (const id of teamAIds) {
    const card = playersMap[id];
    if (card) {
      boxMap[id] = createInitialBox(card, 'A');
      staminaMap[id] = 100;
      heatMap[id] = 0;
    }
  }
  for (const id of teamBIds) {
    const card = playersMap[id];
    if (card) {
      boxMap[id] = createInitialBox(card, 'B');
      staminaMap[id] = 100;
      heatMap[id] = 0;
    }
  }

  let onCourtA = teamALineup.starters.slice(0, 5);
  let onCourtB = teamBLineup.starters.slice(0, 5);
  let scoreA = 0;
  let scoreB = 0;
  let momentum = 0; // -100..100
  const quarterScoresA: [number, number, number, number] = [0, 0, 0, 0];
  const quarterScoresB: [number, number, number, number] = [0, 0, 0, 0];

  const events: SimPlayEvent[] = [];
  let eventId = 1;

  const emitEvent = (
    quarter: number,
    clockSeconds: number,
    team: 'A' | 'B' | 'NEUTRAL',
    tag: SimPlayEvent['tag'],
    headline: string,
    subtext: string
  ) => {
    for (const id of Object.keys(boxMap)) {
      boxMap[id].stamina = Math.round(staminaMap[id] ?? 100);
      boxMap[id].heat = heatMap[id] ?? 0;
    }
    events.push({
      id: eventId++,
      quarter,
      clockSeconds,
      scoreA,
      scoreB,
      momentum: Math.round(momentum),
      headline,
      subtext,
      team,
      tag,
      onCourtA: [...onCourtA],
      onCourtB: [...onCourtB],
      staminaMap: { ...staminaMap },
      heatMap: { ...heatMap },
      boxScores: cloneBoxMap(boxMap),
    });
  };

  // Tip-off event
  emitEvent(
    1,
    720,
    'NEUTRAL',
    'quarter',
    'Tip-Off at Neutral Hardwood',
    `Chemistry Check: Team A (${chemistryA.chemistryScore}) vs Team B (${chemistryB.chemistryScore})`
  );

  // 4 Quarters x 48 possessions (~24 per team per quarter = 192 possessions total)
  const possessionsPerQuarter = 48;
  const secondsPerPossession = 720 / possessionsPerQuarter; // 15s average

  for (let quarter = 1; quarter <= 4; quarter++) {
    onCourtA = quarter === 1 ? teamALineup.starters.slice(0, 5) : selectActiveFive(teamALineup, boxMap, staminaMap, quarter, 720);
    onCourtB = quarter === 1 ? teamBLineup.starters.slice(0, 5) : selectActiveFive(teamBLineup, boxMap, staminaMap, quarter, 720);

    // Quarter break stamina recovery
    if (quarter > 1) {
      for (const id of Object.keys(staminaMap)) {
        staminaMap[id] = Math.min(100, staminaMap[id] + (quarter === 3 ? 22 : 9));
      }
      emitEvent(
        quarter,
        720,
        'NEUTRAL',
        'quarter',
        `Start of Q${quarter}`,
        quarter === 3 ? 'Halftime reset — starters regain energy.' : `Q${quarter} underway.`
      );
    }

    for (let p = 0; p < possessionsPerQuarter; p++) {
      const clockSeconds = Math.max(0, Math.round(720 - (p + 1) * secondsPerPossession));
      const offTeam: 'A' | 'B' = p % 2 === (quarter % 2 === 1 ? 0 : 1) ? 'A' : 'B';
      const defTeam: 'A' | 'B' = offTeam === 'A' ? 'B' : 'A';

      // Periodic substitutions every 8 possessions (~2 game minutes)
      if (p > 0 && p % 8 === 0) {
        onCourtA = selectActiveFive(teamALineup, boxMap, staminaMap, quarter, clockSeconds);
        onCourtB = selectActiveFive(teamBLineup, boxMap, staminaMap, quarter, clockSeconds);
      }

      const offCourtIds = offTeam === 'A' ? onCourtA : onCourtB;
      const defCourtIds = defTeam === 'A' ? onCourtA : onCourtB;
      const offChem = offTeam === 'A' ? chemistryA.chemistryScore : chemistryB.chemistryScore;
      const defChem = defTeam === 'A' ? chemistryA.chemistryScore : chemistryB.chemistryScore;

      // Update played minutes & stamina for all players (0.25 min per possession)
      const allActive = new Set([...onCourtA, ...onCourtB]);
      for (const id of Object.keys(boxMap)) {
        if (allActive.has(id)) {
          boxMap[id].minutes = Number((boxMap[id].minutes + 0.25).toFixed(2));
          // High-motor players drain slightly slower; intense defense drains slightly faster
          staminaMap[id] = Math.max(18, staminaMap[id] - 1.55);
        } else {
          staminaMap[id] = Math.min(100, staminaMap[id] + 2.9);
        }
      }

      const offCards = offCourtIds.map((id) => playersMap[id]).filter(Boolean);
      const defCards = defCourtIds.map((id) => playersMap[id]).filter(Boolean);
      if (offCards.length === 0 || defCards.length === 0) continue;

      // Pick primary shooter weighted by OVR, heat, stamina, and offensive role
      const shooterWeights = offCards.map((c) => {
        const stam = staminaMap[c.id] ?? 100;
        const heat = heatMap[c.id] ?? 0;
        return (
          Math.pow(Math.max(1, c.ovr - 62), 1.35) *
          (1 + heat * 0.12) *
          (stam < 50 ? 0.8 : 1.0)
        );
      });
      const shooterIdx = pickWeightedIndex(shooterWeights, rng);
      const shooter = offCards[shooterIdx];
      const primaryDefender =
        defCards.find((d) => d.pos === shooter.pos) ??
        defCards.find((d) => canPlayPosition(d, shooter.pos)) ??
        defCards[Math.min(shooterIdx, defCards.length - 1)];

      const shooterStam = staminaMap[shooter.id] ?? 100;
      const defStam = staminaMap[primaryDefender.id] ?? 100;
      const shooterHeat = heatMap[shooter.id] ?? 0;

      // Unit averages for Clash calculation
      const avgOffPlaymaking =
        offCards.reduce((s, c) => s + c.playmaking, 0) / offCards.length;
      const avgDefDefense =
        defCards.reduce((s, c) => s + c.defense * ((staminaMap[c.id] ?? 100) < 55 ? 0.88 : 1), 0) /
        defCards.length;
      const avgDefReb =
        defCards.reduce((s, c) => s + c.rebounding, 0) / defCards.length;
      const avgOffReb =
        offCards.reduce((s, c) => s + c.rebounding, 0) / offCards.length;

      // Fatigue factor: below 65 stamina hurts legs & decision-making
      const shooterFatiguePenalty =
        shooterStam < 65 ? (65 - shooterStam) * 0.0028 : 0;
      const defenderFatigueBonus =
        defStam < 65 ? (65 - defStam) * 0.002 : 0;

      // Offense vs Defense Clash friction:
      // When elite offense (>= 88) clashes with elite defense (>= 88),
      // both turnover pressure and contested shot difficulty spike realistically.
      const shooterOffRating = (shooter.inside + shooter.shooting) / 2;
      const isHeavyClash = shooterOffRating >= 86 && avgDefDefense >= 86;
      const clashFriction = isHeavyClash
        ? 0.045 + Math.max(0, avgDefDefense - 86) * 0.004
        : 0;

      // 1. Turnover Check
      const tovProb = Math.max(
        0.06,
        Math.min(
          0.22,
          0.115 +
            (avgDefDefense - avgOffPlaymaking) * 0.0018 +
            (75 - offChem) * 0.001 +
            (isHeavyClash ? 0.018 : 0) +
            shooterFatiguePenalty * 0.4
        )
      );

      if (rng() < tovProb) {
        boxMap[shooter.id].tov += 1;
        // Steal attribution
        if (rng() < 0.62) {
          const stealerWeights = defCards.map((d) => d.defense);
          const stealer = defCards[pickWeightedIndex(stealerWeights, rng)];
          boxMap[stealer.id].stl += 1;
          momentum = Math.max(-100, Math.min(100, momentum + (defTeam === 'A' ? 8 : -8)));
          if (isHeavyClash || rng() < 0.28) {
            emitEvent(
              quarter,
              clockSeconds,
              defTeam,
              'clash',
              `${stealer.name} strips ${shooter.name}!`,
              `Defensive Clash: ${stealer.editionLabel} (${stealer.defense} DEF) disrupts the lane.`
            );
          }
        }
        continue;
      }

      // 2. Shot Selection: 3PT vs 2PT strictly governed by 3PT Tendency
      // Players who never shot 3s (tendency <= 3) NEVER take 3PT attempts.
      const threeShare =
        shooter.threePtTendency <= 3 ? 0 : Math.min(0.62, shooter.threePtTendency / 155);
      const isThree = rng() < threeShare;

      // Shooting foul check (more common inside)
      const foulProb = isThree ? 0.035 : 0.145 + (shooter.inside - 75) * 0.0015;
      if (rng() < foulProb) {
        const numFT = isThree ? 3 : 2;
        const ftPct = Math.max(0.5, Math.min(0.93, 0.56 + (shooter.shooting - 50) * 0.0075 - shooterFatiguePenalty));
        let madeFT = 0;
        for (let f = 0; f < numFT; f++) {
          boxMap[shooter.id].fta += 1;
          if (rng() < ftPct) {
            boxMap[shooter.id].ftm += 1;
            madeFT += 1;
          }
        }
        if (madeFT > 0) {
          boxMap[shooter.id].pts += madeFT;
          if (offTeam === 'A') {
            scoreA += madeFT;
            quarterScoresA[quarter - 1] += madeFT;
          } else {
            scoreB += madeFT;
            quarterScoresB[quarter - 1] += madeFT;
          }
          for (const id of offCourtIds) boxMap[id].plusMinus += madeFT;
          for (const id of defCourtIds) boxMap[id].plusMinus -= madeFT;
        }
        continue;
      }

      // 3. Field Goal Make Probability
      const attackSkill = isThree ? shooter.shooting : shooter.inside * 0.65 + shooter.shooting * 0.35;
      const baseMake = isThree ? 0.345 : 0.495;
      const skillDelta = (attackSkill - 80) * 0.0042;
      const defenseDelta = (avgDefDefense * 0.55 + primaryDefender.defense * 0.45 - 80) * 0.0036;
      const chemDelta = (offChem - defChem) * 0.0012;
      const heatDelta = shooterHeat * 0.022;

      const makeProb = Math.max(
        0.16,
        Math.min(
          0.74,
          baseMake +
            skillDelta -
            defenseDelta +
            chemDelta +
            heatDelta -
            shooterFatiguePenalty +
            defenderFatigueBonus -
            clashFriction
        )
      );

      boxMap[shooter.id].fga += 1;
      if (isThree) boxMap[shooter.id].tpa += 1;

      const madeShot = rng() < makeProb;

      if (madeShot) {
        const pts = isThree ? 3 : 2;
        boxMap[shooter.id].fgm += 1;
        if (isThree) boxMap[shooter.id].tpm += 1;
        boxMap[shooter.id].pts += pts;

        if (offTeam === 'A') {
          scoreA += pts;
          quarterScoresA[quarter - 1] += pts;
          momentum = Math.min(100, momentum + (isThree ? 11 : 7));
        } else {
          scoreB += pts;
          quarterScoresB[quarter - 1] += pts;
          momentum = Math.max(-100, momentum - (isThree ? 11 : 7));
        }
        for (const id of offCourtIds) boxMap[id].plusMinus += pts;
        for (const id of defCourtIds) boxMap[id].plusMinus -= pts;

        // Assist chance scaled by team playmaking & chemistry
        const teammates = offCards.filter((c) => c.id !== shooter.id);
        const astChance = Math.min(0.76, 0.45 + (avgOffPlaymaking - 75) * 0.008 + (offChem - 70) * 0.003);
        let passerName = '';
        if (teammates.length > 0 && rng() < astChance) {
          const astWeights = teammates.map((t) => Math.pow(t.playmaking, 1.4));
          const passer = teammates[pickWeightedIndex(astWeights, rng)];
          boxMap[passer.id].ast += 1;
          passerName = passer.name;
        }

        // Update streak heat
        const prevHeat = heatMap[shooter.id] ?? 0;
        heatMap[shooter.id] = Math.min(3, prevHeat + 1);

        const justHeatedUp = prevHeat === 1 && heatMap[shooter.id] === 2;
        if (justHeatedUp) {
          emitEvent(
            quarter,
            clockSeconds,
            offTeam,
            'hot',
            `${shooter.name} is HEATING UP!`,
            `${shooter.editionLabel} catches fire${passerName ? ` off a feed from ${passerName}` : ''}.`
          );
        } else if (shooterStam < 42 && rng() < 0.35) {
          emitEvent(
            quarter,
            clockSeconds,
            offTeam,
            'fatigue',
            `${shooter.name} battles through fatigue (${Math.round(shooterStam)}%)`,
            `Drains the ${isThree ? 'deep 3PT' : 'contested bucket'} despite heavy minutes.`
          );
        } else if (isThree || rng() < 0.42) {
          emitEvent(
            quarter,
            clockSeconds,
            offTeam,
            'score',
            `${shooter.name} ${isThree ? 'drills a 3-pointer' : 'finishes inside'} (+${pts})`,
            passerName
              ? `Assisted by ${passerName} · ${shooter.editionLabel}`
              : `${shooter.editionLabel} creates off the dribble.`
          );
        }
      } else {
        // Missed shot -> possible block, heat cool-down, rebound
        const prevHeat = heatMap[shooter.id] ?? 0;
        heatMap[shooter.id] = Math.max(-3, prevHeat - 1);

        const blockChance = !isThree
          ? Math.max(0.03, Math.min(0.16, 0.05 + (avgDefDefense - 80) * 0.0035))
          : 0.015;
        let blockedBy: PlayerCard | null = null;
        if (rng() < blockChance) {
          const blkWeights = defCards.map(
            (d) => d.defense + (canPlayPosition(d, 'C') || canPlayPosition(d, 'PF') ? 20 : 0)
          );
          blockedBy = defCards[pickWeightedIndex(blkWeights, rng)];
          boxMap[blockedBy.id].blk += 1;
        }

        // Rebound battle
        const offRebProb = Math.max(0.16, Math.min(0.32, 0.23 + (avgOffReb - avgDefReb) * 0.003));
        const isOffReb = rng() < offRebProb;
        const rebPool = isOffReb ? offCards : defCards;
        const rebWeights = rebPool.map((c) => Math.pow(c.rebounding, 1.5));
        const rebounder = rebPool[pickWeightedIndex(rebWeights, rng)];
        boxMap[rebounder.id].reb += 1;

        const justWentCold = prevHeat === -1 && heatMap[shooter.id] === -2;
        if (blockedBy) {
          momentum = Math.max(-100, Math.min(100, momentum + (defTeam === 'A' ? 7 : -7)));
          emitEvent(
            quarter,
            clockSeconds,
            defTeam,
            'clash',
            `${blockedBy.name} rejects ${shooter.name}!`,
            `${blockedBy.editionLabel} (${blockedBy.defense} DEF) wins the rim clash.`
          );
        } else if (justWentCold) {
          emitEvent(
            quarter,
            clockSeconds,
            defTeam,
            'cold',
            `${shooter.name} goes ICE COLD`,
            `${primaryDefender.name}'s pressure forces another miss; ${rebounder.name} boards.`
          );
        } else if (isHeavyClash && rng() < 0.3) {
          emitEvent(
            quarter,
            clockSeconds,
            defTeam,
            'clash',
            `Lockdown stop by ${primaryDefender.name}`,
            `Elite defense forces tough ${isThree ? 'contested 3PT' : 'contested look'} — ${rebounder.name} clears.`
          );
        }
      }
    }
  }

  // Tiebreaker clutch possession if tied after Q4
  if (scoreA === scoreB) {
    const winnerTeam: 'A' | 'B' = rng() < 0.5 ? 'A' : 'B';
    const clutchUnit = winnerTeam === 'A' ? onCourtA : onCourtB;
    const clutchCard =
      clutchUnit.map((id) => playersMap[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr)[0];
    if (clutchCard) {
      boxMap[clutchCard.id].fga += 1;
      boxMap[clutchCard.id].fgm += 1;
      boxMap[clutchCard.id].pts += 2;
    }
    if (winnerTeam === 'A') {
      scoreA += 2;
      quarterScoresA[3] += 2;
    } else {
      scoreB += 2;
      quarterScoresB[3] += 2;
    }
    emitEvent(
      4,
      0,
      winnerTeam,
      'score',
      `BUZZER-BEATER! ${clutchCard?.name ?? 'Star'} seals it (+2)`,
      'Clutch final possession breaks the deadlock!'
    );
  }

  emitEvent(
    4,
    0,
    scoreA > scoreB ? 'A' : 'B',
    'quarter',
    `FINAL: Team A ${scoreA} – Team B ${scoreB}`,
    `Team ${scoreA > scoreB ? 'A' : 'B'} takes the neutral-floor victory.`
  );

  // Round minutes cleanly for box score display
  const finalBoxScores = Object.values(boxMap).map((b) => ({
    ...b,
    minutes: Math.round(b.minutes),
  }));

  const winner: 'A' | 'B' = scoreA > scoreB ? 'A' : 'B';
  const winnerStats = finalBoxScores.filter((b) => b.team === winner);
  const mvp =
    winnerStats.sort(
      (a, b) =>
        b.pts + b.reb * 1.2 + b.ast * 1.4 + b.stl * 2 + b.blk * 2 -
        (a.pts + a.reb * 1.2 + a.ast * 1.4 + a.stl * 2 + a.blk * 2)
    )[0] ?? finalBoxScores[0];

  return {
    seed,
    finalScoreA: scoreA,
    finalScoreB: scoreB,
    quarterScoresA,
    quarterScoresB,
    winner,
    mvp,
    events,
    finalBoxScores,
    chemistryA,
    chemistryB,
  };
}
