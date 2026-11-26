import { PlayerCard, Position, SpinSquad } from '../types/game';
import { canPlayPosition } from '../data/positions';

/**
 * Groups player cards into (Team, Year) squads.
 * Prioritizes squads with >= 2 players so every Spin Draft turn gives real choice.
 */
export function groupPlayerSquads(
  players: PlayerCard[],
  minPlayersPerSquad = 2
): SpinSquad[] {
  const byKey = new Map<string, PlayerCard[]>();

  for (const p of players) {
    const key = `${p.teamAbbr}_${p.year}`;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }

  const squads: SpinSquad[] = [];
  for (const [key, list] of byKey.entries()) {
    if (list.length < minPlayersPerSquad) continue;
    const sorted = [...list].sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
    const head = sorted[0];
    squads.push({
      key,
      teamAbbr: head.teamAbbr,
      year: head.year,
      editionLabel: head.editionLabel,
      isHistoric: head.isHistoric,
      playerIds: sorted.map((c) => c.id),
    });
  }

  return squads.sort((a, b) => a.year - b.year || a.teamAbbr.localeCompare(b.teamAbbr));
}

export function getEligibleSquads(
  allPlayers: PlayerCard[],
  includeHistoric: boolean,
  selectedYears: number[],
  pickedIds: Set<string>,
  myRosterNames: Set<string>,
  excludeKey?: string
): SpinSquad[] {
  const allSquads = groupPlayerSquads(allPlayers, 2);
  const yearSet = new Set(selectedYears);

  const hasAvailableCard = (sq: SpinSquad, playersMap: Record<string, PlayerCard>) =>
    sq.playerIds.some((id) => {
      const card = playersMap[id];
      return Boolean(card) && !pickedIds.has(id) && !myRosterNames.has(card.name);
    });

  const playersMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  // Primary filter: honors both Historic toggle and selectedYears
  let eligible = allSquads.filter((sq) => {
    if (sq.isHistoric && !includeHistoric) return false;
    if (!sq.isHistoric && !yearSet.has(sq.year)) return false;
    return hasAvailableCard(sq, playersMap);
  });

  // Safety fallback if a user picked only 1-2 years and depleted them mid-draft
  if (eligible.length === 0) {
    eligible = allSquads.filter((sq) => {
      if (sq.isHistoric && !includeHistoric) return false;
      return hasAvailableCard(sq, playersMap);
    });
  }

  // Last-resort fallback across any squad with available cards
  if (eligible.length === 0) {
    eligible = allSquads.filter((sq) => hasAvailableCard(sq, playersMap));
  }

  if (excludeKey && eligible.length > 1) {
    const withoutExcluded = eligible.filter((sq) => sq.key !== excludeKey);
    if (withoutExcluded.length > 0) return withoutExcluded;
  }

  return eligible;
}

export interface SpinOutcome {
  teamAbbr: string;
  year: number;
  editionLabel: string;
  isHistoric: boolean;
  candidateIds: string[];
}

/**
 * Separately rolls a random NBA franchise from eligible teams, then rolls
 * a random season/year for that franchise, returning that exact squad's cards.
 * Filters out recently spun/drafted franchises and excludeTeamAbbr to prevent repeats.
 */
export function spinTeamAndYear(
  allPlayers: PlayerCard[],
  includeHistoric: boolean,
  selectedYears: number[],
  pickedIds: Set<string>,
  myRosterNames: Set<string>,
  rng: () => number = Math.random,
  excludeKey?: string,
  recentTeams: string[] = [],
  excludeTeamAbbr?: string
): SpinOutcome | null {
  const eligible = getEligibleSquads(
    allPlayers,
    includeHistoric,
    selectedYears,
    pickedIds,
    myRosterNames,
    excludeKey
  );

  if (eligible.length === 0) return null;

  // Step 1: Roll random franchise uniformly while avoiding repeats
  const byTeam = new Map<string, SpinSquad[]>();
  for (const sq of eligible) {
    const list = byTeam.get(sq.teamAbbr) ?? [];
    list.push(sq);
    byTeam.set(sq.teamAbbr, list);
  }

  let candidateTeams = Array.from(byTeam.keys());
  if (excludeTeamAbbr && candidateTeams.length > 1) {
    const withoutExactTeam = candidateTeams.filter((t) => t !== excludeTeamAbbr);
    if (withoutExactTeam.length > 0) candidateTeams = withoutExactTeam;
  }

  // Apply recentTeams cooldown (relaxing oldest-first only if pool is super small)
  if (recentTeams.length > 0 && candidateTeams.length > 1) {
    const recentTail = recentTeams.slice(-8);
    let filtered = candidateTeams.filter((t) => !recentTail.includes(t));
    if (filtered.length === 0) {
      // Relax to at least avoid the last 3 teams
      const lastThree = recentTeams.slice(-3);
      filtered = candidateTeams.filter((t) => !lastThree.includes(t));
    }
    if (filtered.length === 0) {
      const lastOne = recentTeams[recentTeams.length - 1];
      filtered = candidateTeams.filter((t) => t !== lastOne);
    }
    if (filtered.length > 0) candidateTeams = filtered;
  }

  const chosenTeam = candidateTeams[Math.floor(rng() * candidateTeams.length) % candidateTeams.length];

  // Step 2: Separately roll random season/year from that franchise's eligible squads
  const teamSquads = byTeam.get(chosenTeam)!;
  const chosenSquad = teamSquads[Math.floor(rng() * teamSquads.length) % teamSquads.length];

  // Filter out cards already picked globally, keeping order by OVR desc
  const candidateIds = chosenSquad.playerIds.filter((id) => !pickedIds.has(id));
  if (candidateIds.length === 0) return null;

  return {
    teamAbbr: chosenSquad.teamAbbr,
    year: chosenSquad.year,
    editionLabel: chosenSquad.editionLabel,
    isHistoric: chosenSquad.isHistoric,
    candidateIds,
  };
}

export function pickBestCandidateForCpu(
  candidateIds: string[],
  playersMap: Record<string, PlayerCard>,
  cpuRosterIds: string[]
): PlayerCard | null {
  const cpuNames = new Set(
    cpuRosterIds.map((id) => playersMap[id]?.name).filter(Boolean)
  );
  const posCounts: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of cpuRosterIds) {
    const card = playersMap[id];
    if (card) posCounts[card.pos] += 1;
  }

  const valid = candidateIds
    .map((id) => playersMap[id])
    .filter((p): p is PlayerCard => Boolean(p) && !cpuNames.has(p.name));

  if (valid.length === 0) return null;

  const slots: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const neededPosPenalty = (p: PlayerCard) => {
    const playable = slots.filter((s) => canPlayPosition(p, s));
    // Penalty matches the least-crowded position the player can legitimately cover
    return Math.min(...playable.map((s) => posCounts[s]));
  };

  return [...valid].sort((a, b) => {
    const scoreA = a.ovr - neededPosPenalty(a) * 4;
    const scoreB = b.ovr - neededPosPenalty(b) * 4;
    return scoreB - scoreA;
  })[0];
}
