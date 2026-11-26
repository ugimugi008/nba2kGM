export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerCard {
  id: string;
  name: string;
  pos: Position;
  secondaryPositions?: Position[];
  year: number; // 2015..2026 for 2K editions, or classic season year for historic
  editionLabel: string; // e.g., "2K16", "2K25", "Classic '96"
  isHistoric: boolean;
  teamAbbr: string;
  ovr: number;
  inside: number;
  shooting: number;
  playmaking: number;
  defense: number;
  rebounding: number;
  threePtTendency: number; // 0..100 (controls 3PA share; classic non-shooters stay near 0-10)
  nbaId: string; // NBA CDN personId for real headshot (empty/fallback if unavailable)
  jersey: string;
  isCustom?: boolean;
}

export interface TeamLineup {
  starters: string[]; // 5 player IDs (PG, SG, SF, PF, C order)
  bench: string[]; // 8 player IDs
  minutes: Record<string, number>; // target minutes per player (sum = 240)
  locked: boolean;
}

export interface ChemistryReport {
  chemistryScore: number; // 0..100
  offenseRating: number;
  defenseRating: number;
  insideRating: number;
  shootingRating: number;
  playmakingRating: number;
  reboundingRating: number;
  modifiers: {
    label: string;
    impact: 'positive' | 'negative' | 'neutral';
    detail: string;
  }[];
}

export interface PlayerBoxScore {
  playerId: string;
  name: string;
  pos: Position;
  editionLabel: string;
  team: 'A' | 'B';
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  plusMinus: number;
  stamina: number; // 0..100 remaining
  heat: number; // -3..+3 streak state
}

export interface SimPlayEvent {
  id: number;
  quarter: number; // 1..4
  clockSeconds: number; // 720 down to 0
  scoreA: number;
  scoreB: number;
  momentum: number; // -100 (Team B) to +100 (Team A)
  headline: string;
  subtext: string;
  team: 'A' | 'B' | 'NEUTRAL';
  tag: 'score' | 'clash' | 'hot' | 'cold' | 'fatigue' | 'quarter';
  onCourtA: string[];
  onCourtB: string[];
  staminaMap: Record<string, number>;
  heatMap: Record<string, number>;
  boxScores: Record<string, PlayerBoxScore>;
}

export interface SimGameResult {
  seed: number;
  finalScoreA: number;
  finalScoreB: number;
  quarterScoresA: [number, number, number, number];
  quarterScoresB: [number, number, number, number];
  winner: 'A' | 'B';
  mvp: PlayerBoxScore;
  events: SimPlayEvent[];
  finalBoxScores: PlayerBoxScore[];
  chemistryA: ChemistryReport;
  chemistryB: ChemistryReport;
}

export type RoomStatus = 'lobby' | 'drafting' | 'lineup' | 'simulating' | 'finished';
export type SeriesMode = 'single' | 'bo7';
export type DraftMode = 'spin' | 'open';

export interface SpinState {
  phase: 'ready' | 'spun';
  teamAbbr: string;
  year: number;
  candidateIds: string[];
  spinNonce: number;
  rerollsLeftA: number;
  rerollsLeftB: number;
}

export interface SpinSquad {
  key: string; // e.g. "LAL_2002"
  teamAbbr: string;
  year: number;
  editionLabel: string;
  isHistoric: boolean;
  playerIds: string[];
}

export interface RoomState {
  id: string;
  /** Server revision, bumped on every change. Used to ignore stale updates. */
  rev?: number;
  hostUid: string;
  hostName: string;
  guestUid: string;
  guestName: string;
  status: RoomStatus;
  draftMode: DraftMode;
  includeHistoric: boolean;
  selectedYears: number[];
  poolIds: string[];
  draftOrder: ('A' | 'B')[];
  pickIndex: number;
  spinState: SpinState;
  teamARoster: string[];
  teamBRoster: string[];
  teamALineup: TeamLineup;
  teamBLineup: TeamLineup;
  seriesMode: SeriesMode;
  teamAWins: number;
  teamBWins: number;
  gameNumber: number;
  simSeed: number;
  simStartedAt: number;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  participantUids: string[];
  hostUid: string;
  hostName: string;
  guestName: string;
  teamAScore: number;
  teamBScore: number;
  winner: 'A' | 'B';
  mvpName: string;
  mvpLine: string;
  quarterScoresA: [number, number, number, number];
  quarterScoresB: [number, number, number, number];
  playerStats: PlayerBoxScore[];
  createdAtMs: number;
}

export type AppView = 'arena' | 'draft' | 'lineup' | 'simcast' | 'vault' | 'rivalry';
