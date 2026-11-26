import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { PlayerCard, Position, TeamLineup } from '../types/game';
import {
  buildDefaultLineup,
  computeTeamChemistry,
  normalizeMinutesTo240,
} from '../engine/simEngine';
import { canPlayPosition, formatPlayerPositions } from '../data/positions';
import { PlayerAvatar } from './PlayerAvatar';
import { Lock, RotateCcw, ArrowLeftRight, CheckCircle2 } from 'lucide-react';

interface LineupLabProps {
  mySide: 'A' | 'B';
  myTeamName: string;
  opponentTeamName: string;
  rosterIds: string[];
  lineup: TeamLineup;
  opponentLocked: boolean;
  playersMap: Record<string, PlayerCard>;
  onUpdateLineup: (next: TeamLineup) => void;
  onLockLineup: (finalLineup: TeamLineup) => void;
}

const STARTER_SLOTS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function LineupLab({
  myTeamName,
  opponentTeamName,
  rosterIds,
  lineup,
  opponentLocked,
  playersMap,
  onUpdateLineup,
  onLockLineup,
}: LineupLabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const chemistry = useMemo(
    () => computeTeamChemistry(lineup, playersMap),
    [lineup, playersMap]
  );

  const totalMinutes = useMemo(
    () =>
      [...lineup.starters, ...lineup.bench].reduce(
        (sum, id) => sum + (lineup.minutes[id] ?? 0),
        0
      ),
    [lineup]
  );

  const handleSlotTap = (targetId: string) => {
    if (lineup.locked) return;
    if (!selectedId) {
      setSelectedId(targetId);
      return;
    }
    if (selectedId === targetId) {
      setSelectedId(null);
      return;
    }

    const nextStarters = [...lineup.starters];
    const nextBench = [...lineup.bench];

    const idxAStarter = nextStarters.indexOf(selectedId);
    const idxABench = nextBench.indexOf(selectedId);
    const idxBStarter = nextStarters.indexOf(targetId);
    const idxBBench = nextBench.indexOf(targetId);

    if (idxAStarter !== -1 && idxBStarter !== -1) {
      [nextStarters[idxAStarter], nextStarters[idxBStarter]] = [
        nextStarters[idxBStarter],
        nextStarters[idxAStarter],
      ];
    } else if (idxAStarter !== -1 && idxBBench !== -1) {
      nextStarters[idxAStarter] = targetId;
      nextBench[idxBBench] = selectedId;
    } else if (idxABench !== -1 && idxBStarter !== -1) {
      nextBench[idxABench] = targetId;
      nextStarters[idxBStarter] = selectedId;
    } else if (idxABench !== -1 && idxBBench !== -1) {
      [nextBench[idxABench], nextBench[idxBBench]] = [
        nextBench[idxBBench],
        nextBench[idxABench],
      ];
    }

    // Also swap minutes smoothly if swapping starter and bench so total stays 240
    const nextMinutes = { ...lineup.minutes };
    const swappedStarterBench =
      (idxAStarter !== -1 && idxBBench !== -1) || (idxABench !== -1 && idxBStarter !== -1);
    if (swappedStarterBench) {
      const m1 = nextMinutes[selectedId] ?? 20;
      const m2 = nextMinutes[targetId] ?? 20;
      nextMinutes[selectedId] = m2;
      nextMinutes[targetId] = m1;
    }

    onUpdateLineup({
      ...lineup,
      starters: nextStarters,
      bench: nextBench,
      minutes: nextMinutes,
    });
    setSelectedId(null);
  };

  const handleMinuteChange = (playerId: string, val: number) => {
    if (lineup.locked) return;
    const clamped = Math.max(0, Math.min(46, val));
    const nextMinutes = { ...lineup.minutes, [playerId]: clamped };
    onUpdateLineup({ ...lineup, minutes: nextMinutes });
  };

  const handleAutoBalance = () => {
    if (lineup.locked) return;
    const balanced = normalizeMinutesTo240(
      { ...lineup.minutes },
      [...lineup.starters, ...lineup.bench]
    );
    onUpdateLineup({ ...lineup, minutes: balanced });
  };

  const handleResetOptimal = () => {
    if (lineup.locked) return;
    onUpdateLineup(buildDefaultLineup(rosterIds, playersMap));
    setSelectedId(null);
  };

  const handleLock = () => {
    const normalized = normalizeMinutesTo240(
      { ...lineup.minutes },
      [...lineup.starters, ...lineup.bench]
    );
    onLockLineup({ ...lineup, minutes: normalized, locked: true });
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-24 md:pb-12 space-y-6">
      {/* Header Strip */}
      <section className="bg-[#131A26] border border-white/10 rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">
            Pre-Game Rotation · Tap two players to swap spots with animated movement
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white mt-0.5">
            {myTeamName} — 13-Man Lineup & Chemistry
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={lineup.locked}
            onClick={handleResetOptimal}
            className="min-h-[44px] px-3.5 py-2 bg-[#0B0F17] hover:bg-[#1C2536] disabled:opacity-40 border border-white/10 text-xs font-semibold text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Auto-Lineup</span>
          </button>

          <button
            type="button"
            disabled={lineup.locked}
            onClick={handleLock}
            className="min-h-[44px] px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {lineup.locked ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Lineup Locked</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Lock Lineup & Tip Off</span>
              </>
            )}
          </button>
        </div>
      </section>

      {lineup.locked && !opponentLocked && (
        <div className="bg-[#131A26] border border-orange-500/40 rounded-xl px-4 py-3 text-xs text-slate-200">
          Your rotation is locked secretly. Waiting for <span className="font-semibold text-white">{opponentTeamName}</span> to lock their 13-man lineup to launch SimCast Live.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Starters & Bench Interactive Slots */}
        <section className="lg:col-span-8 space-y-6">
          {/* 5 Starters Court Row */}
          <div className="bg-[#131A26] border border-white/10 rounded-xl p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Starting Five
              </h2>
              <span className="text-xs text-slate-400">
                {selectedId ? 'Tap another player to swap' : 'Tap any player to move'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {lineup.starters.map((pid, idx) => {
                const card = playersMap[pid];
                if (!card) return null;
                const isSelected = selectedId === pid;
                const mins = lineup.minutes[pid] ?? 32;
                const slotPos = STARTER_SLOTS[idx];
                const slotFits = slotPos ? canPlayPosition(card, slotPos) : true;

                return (
                  <motion.div
                    key={pid}
                    layoutId={`lineup-slot-${pid}`}
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    className={`rounded-xl border p-3 flex flex-col gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-orange-600/15 border-orange-500'
                        : 'bg-[#0B0F17] border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSlotTap(pid)}
                      className="text-left w-full flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-orange-400">
                            {slotPos}
                          </span>
                          {!slotFits && (
                            <span className="text-[10px] font-semibold text-amber-400">
                              Out of Pos
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-sm font-bold text-white tabular-nums">
                          {card.ovr}
                        </span>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-start gap-2.5 w-full min-w-0">
                        <PlayerAvatar player={card} size="md" />
                        <div className="min-w-0 w-full">
                          <div className="text-xs font-semibold text-white truncate">
                            {card.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {formatPlayerPositions(card)} · {card.editionLabel}
                          </div>
                        </div>
                      </div>
                    </button>

                    <div className="pt-2 border-t border-white/10 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Minutes</span>
                        <span className="font-mono font-bold text-white tabular-nums">
                          {mins}m
                        </span>
                      </div>
                      <input
                        aria-label={`Minutes for ${card.name}`}
                        type="range"
                        min={0}
                        max={46}
                        value={mins}
                        disabled={lineup.locked}
                        onChange={(e) => handleMinuteChange(pid, Number(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* 8-Man Bench */}
          <div className="bg-[#131A26] border border-white/10 rounded-xl p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Bench Rotation (8 Players)
              </h2>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${
                    totalMinutes === 240 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {totalMinutes} / 240 MIN
                </span>
                {totalMinutes !== 240 && !lineup.locked && (
                  <button
                    type="button"
                    onClick={handleAutoBalance}
                    className="text-xs font-semibold text-orange-400 hover:text-orange-300"
                  >
                    Balance to 240
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {lineup.bench.map((pid, idx) => {
                const card = playersMap[pid];
                if (!card) return null;
                const isSelected = selectedId === pid;
                const mins = lineup.minutes[pid] ?? 0;

                return (
                  <motion.div
                    key={pid}
                    layoutId={`lineup-slot-${pid}`}
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-orange-600/15 border-orange-500'
                        : 'bg-[#0B0F17] border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSlotTap(pid)}
                      className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                    >
                      <PlayerAvatar player={card} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {card.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          Bench #{idx + 1} · {formatPlayerPositions(card)} · {card.ovr} OVR
                        </div>
                      </div>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-auto" />
                    </button>

                    <div className="w-24 shrink-0 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">MIN</span>
                        <span className="font-mono font-bold text-white tabular-nums">
                          {mins}m
                        </span>
                      </div>
                      <input
                        aria-label={`Minutes for ${card.name}`}
                        type="range"
                        min={0}
                        max={40}
                        value={mins}
                        disabled={lineup.locked}
                        onChange={(e) => handleMinuteChange(pid, Number(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right: Chemistry & 5-Rating Identity Readout */}
        <aside className="lg:col-span-4 bg-[#131A26] border border-white/10 rounded-xl p-5 space-y-5">
          <div className="flex items-end justify-between border-b border-white/10 pb-4">
            <div>
              <div className="text-xs text-slate-400">Unit Synergy</div>
              <h2 className="font-display text-2xl font-bold text-white">
                Team Chemistry
              </h2>
            </div>
            <div className="font-mono text-4xl font-bold text-orange-400 tabular-nums leading-none">
              {chemistry.chemistryScore}
            </div>
          </div>

          {/* 5 Core Ratings */}
          <div className="space-y-3">
            {[
              { label: 'Inside Scoring', val: chemistry.insideRating },
              { label: 'Perimeter Shooting', val: chemistry.shootingRating },
              { label: 'Playmaking', val: chemistry.playmakingRating },
              { label: 'Team Defense', val: chemistry.defenseRating },
              { label: 'Rebounding', val: chemistry.reboundingRating },
            ].map((metric) => (
              <div key={metric.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{metric.label}</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {metric.val}
                  </span>
                </div>
                <div className="h-1.5 bg-[#0B0F17] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all"
                    style={{ width: `${metric.val}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Chemistry Fit Modifiers */}
          <div className="pt-3 border-t border-white/10 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300">
              Tactical Fit Readout
            </div>
            {chemistry.modifiers.map((mod) => (
              <div
                key={mod.label}
                className="bg-[#0B0F17] border border-white/10 rounded-lg p-3 space-y-1"
              >
                <div
                  className={`text-xs font-semibold ${
                    mod.impact === 'positive'
                      ? 'text-emerald-400'
                      : mod.impact === 'negative'
                        ? 'text-amber-400'
                        : 'text-slate-300'
                  }`}
                >
                  {mod.label}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{mod.detail}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
