import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { TEAM_META } from '../data/players';
import { formatPlayerPositions } from '../data/positions';
import { PlayerCard } from '../types/game';
import { SpinState } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import {
  playPickConfirm,
  playReelLockChime,
  playReelTick,
} from '../utils/soundFx';
import {
  Dices,
  Info,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';

interface SpinDraftRoomProps {
  allPlayers: PlayerCard[];
  playersMap: Record<string, PlayerCard>;
  draftOrder: ('A' | 'B')[];
  pickIndex: number;
  spinState: SpinState;
  teamARoster: string[];
  teamBRoster: string[];
  teamAName: string;
  teamBName: string;
  mySide: 'A' | 'B';
  includeHistoric: boolean;
  isPracticeMode: boolean;
  onSpinReels: (isReroll: boolean) => void;
  onPickPlayer: (playerId: string) => void;
  onAutoDraftRemaining?: () => void;
  onInspectPlayer: (player: PlayerCard) => void;
}

const SPIN_TEAM_ABBRS = Object.keys(TEAM_META);

const SPIN_YEARS_HISTORIC = [
  1965, 1967, 1971, 1972, 1983, 1986, 1987, 1989, 1991, 1993, 1994, 1995, 1996, 1997, 1998,
  1999, 2000, 2001, 2002, 2003, 2004, 2006, 2007, 2008, 2009, 2011, 2012, 2013, 2014, 2015,
  2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
];

const SPIN_YEARS_MODERN = [
  2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
];

export function SpinDraftRoom({
  playersMap,
  draftOrder,
  pickIndex,
  spinState,
  teamARoster,
  teamBRoster,
  teamAName,
  teamBName,
  mySide,
  includeHistoric,
  isPracticeMode,
  onSpinReels,
  onPickPlayer,
  onAutoDraftRemaining,
  onInspectPlayer,
}: SpinDraftRoomProps) {
  const prefersReducedMotion = useReducedMotion();
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [activeTabMobile, setActiveTabMobile] = useState<'SPIN' | 'ROSTERS'>('SPIN');

  // Reel visual states synced cleanly to spinState.spinNonce
  const [reelAnimState, setReelAnimState] = useState<'idle' | 'spinning' | 'team_locked' | 'locked'>(
    spinState.phase === 'spun' ? 'locked' : 'idle'
  );
  const [displayTeamIdx, setDisplayTeamIdx] = useState(0);
  const [displayYearIdx, setDisplayYearIdx] = useState(0);
  const lastHandledNonceRef = useRef<number>(spinState.spinNonce);

  const yearWheel = includeHistoric ? SPIN_YEARS_HISTORIC : SPIN_YEARS_MODERN;

  useEffect(() => {
    if (spinState.phase === 'ready') {
      setReelAnimState('idle');
      return;
    }

    // Only animate when a fresh spinNonce arrives
    if (spinState.spinNonce === lastHandledNonceRef.current) {
      setReelAnimState('locked');
      return;
    }
    lastHandledNonceRef.current = spinState.spinNonce;

    if (prefersReducedMotion) {
      setReelAnimState('locked');
      return;
    }

    setReelAnimState('spinning');
    let tickCount = 0;

    const teamTimer = window.setInterval(() => {
      tickCount += 1;
      setDisplayTeamIdx((i) => (i + 1) % SPIN_TEAM_ABBRS.length);
      playReelTick(mutedRef.current, 1 + (tickCount % 3) * 0.06);
    }, 75);

    const yearTimer = window.setInterval(() => {
      setDisplayYearIdx((i) => (i + 1) % yearWheel.length);
    }, 65);

    const lockTeamTimeout = window.setTimeout(() => {
      window.clearInterval(teamTimer);
      setReelAnimState('team_locked');
      playReelLockChime(mutedRef.current, false);
    }, 900);

    const lockYearTimeout = window.setTimeout(() => {
      window.clearInterval(yearTimer);
      setReelAnimState('locked');
      playReelLockChime(mutedRef.current, true);
    }, 1400);

    return () => {
      window.clearInterval(teamTimer);
      window.clearInterval(yearTimer);
      window.clearTimeout(lockTeamTimeout);
      window.clearTimeout(lockYearTimeout);
    };
  }, [spinState.phase, spinState.spinNonce, prefersReducedMotion, yearWheel.length]);

  const currentTurn = draftOrder[pickIndex] ?? null;
  const isMyTurn = currentTurn === mySide;
  const roundNum = Math.floor(pickIndex / 2) + 1;
  const myRerollsLeft = mySide === 'A' ? spinState.rerollsLeftA : spinState.rerollsLeftB;

  const pickedSet = useMemo(
    () => new Set([...teamARoster, ...teamBRoster]),
    [teamARoster, teamBRoster]
  );

  const myTeamPlayerNames = useMemo(() => {
    const myIds = mySide === 'A' ? teamARoster : teamBRoster;
    return new Set(
      myIds
        .map((id) => playersMap[id]?.name)
        .filter((n): n is string => Boolean(n))
    );
  }, [mySide, teamARoster, teamBRoster, playersMap]);

  const candidateCards = useMemo(() => {
    if (spinState.phase !== 'spun') return [];
    return spinState.candidateIds
      .map((id) => playersMap[id])
      .filter((p): p is PlayerCard => Boolean(p) && !pickedSet.has(p.id));
  }, [spinState.phase, spinState.candidateIds, playersMap, pickedSet]);

  const hasAnyUniquePick = useMemo(
    () => candidateCards.some((c) => !myTeamPlayerNames.has(c.name)),
    [candidateCards, myTeamPlayerNames]
  );

  // Determine what Team + Year appear inside the two drums right now
  const teamDrumLocked = reelAnimState === 'team_locked' || reelAnimState === 'locked';
  const yearDrumLocked = reelAnimState === 'locked';

  const shownTeamAbbr =
    spinState.phase === 'spun' && teamDrumLocked
      ? spinState.teamAbbr
      : reelAnimState === 'spinning'
        ? SPIN_TEAM_ABBRS[displayTeamIdx]
        : '';

  const shownYear =
    spinState.phase === 'spun' && yearDrumLocked
      ? spinState.year
      : reelAnimState === 'spinning' || reelAnimState === 'team_locked'
        ? yearWheel[displayYearIdx % yearWheel.length]
        : 0;

  const shownTeamMeta = shownTeamAbbr ? TEAM_META[shownTeamAbbr] : null;
  const activeTurnName = currentTurn === 'A' ? teamAName : teamBName;

  const isReelsSpinning = reelAnimState === 'spinning' || reelAnimState === 'team_locked';

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-24 md:pb-12 space-y-5">
      {/* Draft Status Header */}
      <section className="bg-[#131A26] border border-white/10 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-orange-400 font-bold">
              Pick {Math.min(pickIndex + 1, 26)} of 26
            </span>
            <span aria-hidden="true">·</span>
            <span>Round {Math.min(roundNum, 13)} of 13</span>
            <span aria-hidden="true">·</span>
            <span>1-by-1 Spin Draft</span>
            <span aria-hidden="true">·</span>
            <span>Historic: {includeHistoric ? 'ON' : 'OFF'}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white mt-0.5">
            {currentTurn === null
              ? 'Draft Complete — Preparing Lineups'
              : isMyTurn
                ? spinState.phase === 'ready'
                  ? `Your Turn (${mySide === 'A' ? teamAName : teamBName}) — Spin the Reels`
                  : isReelsSpinning
                    ? 'Spinning Franchise & Season...'
                    : `Draft 1 Player from ${shownTeamMeta?.city ?? ''} ${shownTeamMeta?.name ?? shownTeamAbbr} (${spinState.year})`
                : `${activeTurnName} is ${spinState.phase === 'ready' || isReelsSpinning ? 'spinning' : 'drafting'}...`}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label={muted ? 'Unmute spin sound effects' : 'Mute spin sound effects'}
            onClick={() => setMuted((m) => !m)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-[#0B0F17] hover:bg-[#1C2536] border border-white/10 text-slate-300 rounded-lg transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {isPracticeMode && onAutoDraftRemaining && currentTurn !== null && (
            <button
              type="button"
              onClick={onAutoDraftRemaining}
              className="min-h-[44px] px-4 py-2 bg-[#1C2536] hover:bg-[#253147] border border-white/10 text-xs font-semibold text-white rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5 text-orange-400" />
              <span>Auto-Draft Remaining</span>
            </button>
          )}
        </div>
      </section>

      {/* Mobile Switcher */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setActiveTabMobile('SPIN')}
          className={`min-h-[44px] py-2 text-xs font-semibold rounded-lg border transition-colors ${
            activeTabMobile === 'SPIN'
              ? 'bg-orange-600 border-orange-500 text-white'
              : 'bg-[#131A26] border-white/10 text-slate-300'
          }`}
        >
          Spin & Squad
        </button>
        <button
          type="button"
          onClick={() => setActiveTabMobile('ROSTERS')}
          className={`min-h-[44px] py-2 text-xs font-semibold rounded-lg border transition-colors ${
            activeTabMobile === 'ROSTERS'
              ? 'bg-orange-600 border-orange-500 text-white'
              : 'bg-[#131A26] border-white/10 text-slate-300'
          }`}
        >
          Rosters ({teamARoster.length}/13 · {teamBRoster.length}/13)
        </button>
      </div>

      {/* Main Split: Casino Spin Cabinet + Live Rosters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Casino Dual-Reel Cabinet & Spun Squad Picks */}
        <section
          className={`lg:col-span-7 space-y-5 ${
            activeTabMobile === 'SPIN' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Slot Machine Dual-Reel Console */}
          <div
            data-spin-phase={reelAnimState}
            className="bg-[#131A26] border border-white/10 rounded-xl p-4 md:p-6 space-y-4 md:space-y-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Franchise & Season Wheel
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Reel 1 lands a random NBA team; Reel 2 independently lands a random year.
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs text-slate-400">Re-Spins Left</span>
                <div className="font-mono text-base font-bold text-amber-400 tabular-nums">
                  {myRerollsLeft} / 2
                </div>
              </div>
            </div>

            {/* Dual Slot Drums */}
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {/* Reel 1: Random Franchise */}
              <div
                data-testid="spin-team-reel"
                className="relative overflow-hidden rounded-xl border border-white/15 bg-[#0B0F17] p-3.5 md:p-4 min-h-[126px] md:min-h-[156px] flex flex-col justify-between"
                style={
                  shownTeamMeta && teamDrumLocked
                    ? {
                        background: `linear-gradient(155deg, ${shownTeamMeta.bg}44 0%, #0B0F17 75%)`,
                        borderColor: `${shownTeamMeta.accent}66`,
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>Reel 1 · Team</span>
                  {teamDrumLocked && shownTeamAbbr && (
                    <span className="text-emerald-400 font-semibold">Locked</span>
                  )}
                </div>

                {shownTeamAbbr ? (
                  <motion.div
                    key={
                      teamDrumLocked
                        ? `team-locked-${spinState.spinNonce}-${shownTeamAbbr}`
                        : 'team-spinning'
                    }
                    initial={
                      teamDrumLocked && !prefersReducedMotion
                        ? { y: -12, scale: 0.96, opacity: 0.6 }
                        : false
                    }
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    className="my-1.5 md:my-2 text-center space-y-1"
                  >
                    <div
                      className="inline-flex items-center justify-center px-3 py-1 rounded-md font-mono text-xs font-bold tracking-wider text-white border border-white/15"
                      style={{
                        backgroundColor: shownTeamMeta?.bg ?? '#1C2536',
                      }}
                    >
                      {shownTeamAbbr}
                    </div>
                    <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-none truncate">
                      {shownTeamMeta?.name ?? shownTeamAbbr}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {shownTeamMeta?.city ?? 'NBA'}
                    </div>
                  </motion.div>
                ) : (
                  <div className="my-1.5 md:my-2 text-center space-y-1">
                    <div className="font-display text-3xl font-bold text-slate-500 tracking-wider">
                      NBA
                    </div>
                    <div className="text-xs text-slate-500">Press Spin to roll team</div>
                  </div>
                )}

                <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: teamDrumLocked ? '100%' : reelAnimState === 'spinning' ? '65%' : '0%',
                      backgroundColor: shownTeamMeta?.accent ?? '#EA580C',
                    }}
                  />
                </div>
              </div>

              {/* Reel 2: Random Year */}
              <div
                data-testid="spin-year-reel"
                className="relative overflow-hidden rounded-xl border border-white/15 bg-[#0B0F17] p-3.5 md:p-4 min-h-[126px] md:min-h-[156px] flex flex-col justify-between"
                style={
                  yearDrumLocked && spinState.year > 0
                    ? {
                        background:
                          spinState.year < 2015
                            ? 'linear-gradient(155deg, rgba(245, 158, 11, 0.22) 0%, #0B0F17 75%)'
                            : 'linear-gradient(155deg, rgba(234, 88, 12, 0.22) 0%, #0B0F17 75%)',
                        borderColor:
                          spinState.year < 2015
                            ? 'rgba(251, 191, 36, 0.45)'
                            : 'rgba(249, 115, 22, 0.45)',
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>Reel 2 · Year</span>
                  {yearDrumLocked && shownYear > 0 && (
                    <span className="text-emerald-400 font-semibold">Locked</span>
                  )}
                </div>

                {shownYear > 0 ? (
                  <motion.div
                    key={
                      yearDrumLocked
                        ? `year-locked-${spinState.spinNonce}-${shownYear}`
                        : 'year-spinning'
                    }
                    initial={
                      yearDrumLocked && !prefersReducedMotion
                        ? { y: -12, scale: 0.96, opacity: 0.6 }
                        : false
                    }
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    className="my-1.5 md:my-2 text-center space-y-1"
                  >
                    <div className="font-mono text-xs font-semibold text-amber-400">
                      {shownYear < 2015
                        ? `Classic '${String(shownYear).slice(2)}`
                        : `NBA 2K${String(shownYear).slice(2)}`}
                    </div>
                    <div className="font-display text-3xl sm:text-5xl font-bold text-white tabular-nums leading-none">
                      {shownYear}
                    </div>
                    <div className="text-xs text-slate-400">
                      {shownYear < 2015 ? 'Historic Era' : '2K Era Roster'}
                    </div>
                  </motion.div>
                ) : (
                  <div className="my-1.5 md:my-2 text-center space-y-1">
                    <div className="font-display text-3xl sm:text-4xl font-bold text-slate-500 tabular-nums">
                      ????
                    </div>
                    <div className="text-xs text-slate-500">Press Spin to roll year</div>
                  </div>
                )}

                <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      shownYear > 0 && shownYear < 2015 ? 'bg-amber-400' : 'bg-orange-500'
                    }`}
                    style={{
                      width: yearDrumLocked
                        ? '100%'
                        : reelAnimState === 'team_locked'
                          ? '80%'
                          : reelAnimState === 'spinning'
                            ? '45%'
                            : '0%',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Spin Controls */}
            {currentTurn !== null && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {spinState.phase === 'ready' ? (
                  <button
                    type="button"
                    disabled={!isMyTurn || isReelsSpinning}
                    onClick={() => onSpinReels(false)}
                    className="flex-1 min-h-[50px] px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Dices className="w-4 h-4" />
                    <span>
                      {isMyTurn
                        ? 'Spin Team + Year'
                        : `Waiting for ${activeTurnName} to Spin...`}
                    </span>
                  </button>
                ) : (
                  <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0B0F17] border border-white/10 rounded-lg px-4 py-3">
                    <div className="text-xs text-slate-300">
                      {isReelsSpinning ? (
                        <span>Reels spinning... wait for squad reveal.</span>
                      ) : isMyTurn ? (
                        <span>
                          Pick 1 player below from{' '}
                          <strong className="text-white">
                            {spinState.year} {shownTeamMeta?.name ?? spinState.teamAbbr}
                          </strong>
                          .
                        </span>
                      ) : (
                        <span>
                          {activeTurnName} is choosing from{' '}
                          <strong className="text-white">
                            {spinState.year} {shownTeamMeta?.name ?? spinState.teamAbbr}
                          </strong>
                          .
                        </span>
                      )}
                    </div>

                    {isMyTurn && !isReelsSpinning && (myRerollsLeft > 0 || !hasAnyUniquePick) && (
                      <button
                        type="button"
                        onClick={() => onSpinReels(hasAnyUniquePick)}
                        className="min-h-[40px] px-4 py-2 bg-[#1C2536] hover:bg-[#253147] border border-amber-400/40 text-amber-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>
                          {!hasAnyUniquePick
                            ? 'Free Re-Spin (Duplicates)'
                            : `Re-Spin (${myRerollsLeft} left)`}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Spun Team + Year Squad Candidates */}
          {spinState.phase === 'spun' && yearDrumLocked && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold text-white">
                  {spinState.year} {shownTeamMeta?.city ?? ''} {shownTeamMeta?.name ?? spinState.teamAbbr} Squad
                </h3>
                <span className="text-xs text-slate-400 tabular-nums">
                  {candidateCards.length} players available
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {candidateCards.map((player) => {
                    const alreadyOnMyRoster = myTeamPlayerNames.has(player.name);
                    return (
                      <motion.div
                        key={player.id}
                        layoutId={`player-card-${player.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        className="bg-[#131A26] border border-white/10 hover:border-white/25 rounded-xl p-3.5 flex flex-col gap-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar player={player} size="md" />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-white truncate">
                                {player.name}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                                <span className="font-semibold text-slate-200">{formatPlayerPositions(player)}</span>
                                <span aria-hidden="true">·</span>
                                <span className={player.isHistoric ? 'text-amber-400 font-medium' : ''}>
                                  {player.editionLabel}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{player.teamAbbr}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono text-2xl font-bold text-orange-400 tabular-nums leading-none">
                              {player.ovr}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">OVR</div>
                          </div>
                        </div>

                        {/* 5 Sub-Ratings */}
                        <div className="grid grid-cols-5 gap-1.5 text-center pt-2 border-t border-white/5">
                          {[
                            { k: 'INS', v: player.inside },
                            { k: 'SHT', v: player.shooting },
                            { k: 'PLY', v: player.playmaking },
                            { k: 'DEF', v: player.defense },
                            { k: 'REB', v: player.rebounding },
                          ].map((stat) => (
                            <div key={stat.k} className="bg-[#0B0F17] rounded-md py-1">
                              <div className="text-[10px] text-slate-400">{stat.k}</div>
                              <div className="font-mono text-xs font-bold text-white tabular-nums">
                                {stat.v}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!isMyTurn || alreadyOnMyRoster}
                            onClick={() => {
                              playPickConfirm(muted);
                              onPickPlayer(player.id);
                            }}
                            className="flex-1 min-h-[40px] py-2 px-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            {alreadyOnMyRoster
                              ? 'Already on Roster'
                              : isMyTurn
                                ? `Draft ${player.name.split(' ').slice(-1)[0]}`
                                : 'Opponent Pick'}
                          </button>
                          <button
                            type="button"
                            aria-label={`Inspect ${player.name} ratings`}
                            onClick={() => onInspectPlayer(player)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center bg-[#0B0F17] hover:bg-[#1C2536] border border-white/10 text-slate-300 rounded-lg transition-colors"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}
        </section>

        {/* Right: Live Animated 13-Man Rosters */}
        <aside
          className={`lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 ${
            activeTabMobile === 'ROSTERS' ? 'grid' : 'hidden lg:grid'
          }`}
        >
          {[
            { side: 'A' as const, title: teamAName, ids: teamARoster, active: currentTurn === 'A' },
            { side: 'B' as const, title: teamBName, ids: teamBRoster, active: currentTurn === 'B' },
          ].map((team) => (
            <div
              key={team.side}
              className={`bg-[#131A26] border rounded-xl p-4 space-y-3 ${
                team.active ? 'border-orange-500/70' : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold text-white">
                    {team.title}
                  </span>
                  {team.side === mySide && (
                    <span className="text-[11px] font-semibold text-orange-400">You</span>
                  )}
                </div>
                <span className="font-mono text-xs text-slate-300 tabular-nums">
                  {team.ids.length} / 13
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1.5 max-h-[290px] overflow-y-auto pr-1">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const pid = team.ids[idx];
                  const card = pid ? playersMap[pid] : null;
                  if (!card) {
                    return (
                      <div
                        key={`empty-${team.side}-${idx}`}
                        className="h-11 px-3 rounded-lg border border-dashed border-white/10 bg-[#0B0F17]/50 flex items-center justify-between text-xs text-slate-500"
                      >
                        <span>Slot {idx + 1}</span>
                        <span>Open</span>
                      </div>
                    );
                  }
                  return (
                    <motion.div
                      key={card.id}
                      layoutId={`player-card-${card.id}`}
                      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                      className="h-11 px-2.5 rounded-lg bg-[#0B0F17] border border-white/10 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar player={card} size="xs" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {card.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                            <span>{formatPlayerPositions(card)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{card.teamAbbr}</span>
                            <span aria-hidden="true">·</span>
                            <span>{card.year}</span>
                            {card.isHistoric && <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-bold text-orange-400 tabular-nums shrink-0">
                        {card.ovr}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
