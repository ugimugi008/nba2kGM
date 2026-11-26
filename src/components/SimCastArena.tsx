import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PlayerBoxScore,
  PlayerCard,
  SeriesMode,
  SimGameResult,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import {
  Play,
  Pause,
  FastForward,
  Flame,
  Snowflake,
  ShieldAlert,
  Trophy,
} from 'lucide-react';

interface SimCastArenaProps {
  simResult: SimGameResult;
  playersMap: Record<string, PlayerCard>;
  teamAName: string;
  teamBName: string;
  seriesMode: SeriesMode;
  teamAWins: number;
  teamBWins: number;
  gameNumber: number;
  onGameCompleteSaved?: (result: SimGameResult) => void;
  onNextSeriesGame?: () => void;
  onFinishToLobby: () => void;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SimCastArena({
  simResult,
  playersMap,
  teamAName,
  teamBName,
  seriesMode,
  teamAWins,
  teamBWins,
  gameNumber,
  onGameCompleteSaved,
  onNextSeriesGame,
  onFinishToLobby,
}: SimCastArenaProps) {
  const [eventCursor, setEventCursor] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 4 | 16>(4);
  const [boxTab, setBoxTab] = useState<'A' | 'B'>('A');
  const [hasNotifiedFinish, setHasNotifiedFinish] = useState(false);

  const totalEvents = simResult.events.length;
  const currentEvent = simResult.events[Math.min(eventCursor, totalEvents - 1)];
  const isFinished = eventCursor >= totalEvents - 1;

  // Reset cursor when a new simulation seed arrives
  useEffect(() => {
    setEventCursor(0);
    setIsPlaying(true);
    setHasNotifiedFinish(false);
  }, [simResult.seed]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying || isFinished) return;
    const delayMs = speed === 1 ? 520 : speed === 4 ? 165 : 42;
    const timer = window.setTimeout(() => {
      setEventCursor((prev) => Math.min(totalEvents - 1, prev + 1));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, isFinished, speed, eventCursor, totalEvents]);

  // Trigger completion callback once when simulation reaches final buzzer
  useEffect(() => {
    if (isFinished && !hasNotifiedFinish) {
      setHasNotifiedFinish(true);
      onGameCompleteSaved?.(simResult);
    }
  }, [isFinished, hasNotifiedFinish, onGameCompleteSaved, simResult]);

  // Compute partial quarter scores up to currentEvent
  const quarterScores = useMemo(() => {
    const qA = [0, 0, 0, 0];
    const qB = [0, 0, 0, 0];
    const prevEndA = [0, 0, 0, 0];
    const prevEndB = [0, 0, 0, 0];

    for (let i = 0; i <= Math.min(eventCursor, totalEvents - 1); i++) {
      const ev = simResult.events[i];
      const qIdx = Math.min(3, Math.max(0, ev.quarter - 1));
      const baseA = qIdx === 0 ? 0 : prevEndA[qIdx - 1];
      const baseB = qIdx === 0 ? 0 : prevEndB[qIdx - 1];
      qA[qIdx] = Math.max(0, ev.scoreA - baseA);
      qB[qIdx] = Math.max(0, ev.scoreB - baseB);
      prevEndA[qIdx] = ev.scoreA;
      prevEndB[qIdx] = ev.scoreB;
    }
    return { qA, qB };
  }, [eventCursor, simResult.events, totalEvents]);

  const recentFeed = useMemo(() => {
    const start = Math.max(0, eventCursor - 10);
    return simResult.events.slice(start, eventCursor + 1).reverse();
  }, [eventCursor, simResult.events]);

  const currentBoxList = useMemo(() => {
    const list: PlayerBoxScore[] = Object.values(currentEvent.boxScores).filter(
      (b) => b.team === boxTab
    );
    return list.sort((a, b) => b.pts - a.pts || b.minutes - a.minutes);
  }, [currentEvent.boxScores, boxTab]);

  const projectedWinsA =
    isFinished && simResult.winner === 'A' ? teamAWins + 1 : teamAWins;
  const projectedWinsB =
    isFinished && simResult.winner === 'B' ? teamBWins + 1 : teamBWins;
  const seriesOver =
    seriesMode === 'single'
      ? isFinished
      : projectedWinsA >= 4 || projectedWinsB >= 4;

  const momentumPct = 50 + currentEvent.momentum * 0.45; // 5..95

  return (
    <main
      className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-24 md:pb-12 space-y-6"
      data-sim-state={isFinished ? 'finished' : 'running'}
    >
      {/* Broadcast Scoreboard Header */}
      <section className="relative rounded-xl overflow-hidden border border-white/10 bg-[#131A26]">
        <img
          src="/src/assets/images/arena_hardwood_court_1795580442635.jpg"
          alt="SimCast Live Arena"
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="relative p-5 md:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-orange-400">SimCast Live</span>
              <span aria-hidden="true">·</span>
              <span>
                {seriesMode === 'bo7'
                  ? `Game ${gameNumber} (Best of 7 · ${projectedWinsA}–${projectedWinsB})`
                  : 'Single Matchup · Neutral Court'}
              </span>
            </div>
            <div className="font-mono font-bold text-white tabular-nums">
              {isFinished
                ? 'FINAL'
                : `Q${currentEvent.quarter} · ${formatClock(currentEvent.clockSeconds)}`}
            </div>
          </div>

          {/* Main Rising Scoreboard */}
          <div className="grid grid-cols-11 items-center gap-2 md:gap-4">
            <div className="col-span-4 text-left">
              <div className="text-xs text-slate-400">Team A</div>
              <div className="font-display text-xl md:text-3xl font-bold text-white truncate">
                {teamAName}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                Chem {simResult.chemistryA.chemistryScore} · OFF {simResult.chemistryA.offenseRating} · DEF {simResult.chemistryA.defenseRating}
              </div>
            </div>

            <div className="col-span-3 flex items-center justify-center gap-3 md:gap-5">
              <motion.span
                key={`scoreA-${currentEvent.scoreA}`}
                initial={{ scale: 1.14, color: '#FB923C' }}
                animate={{ scale: 1, color: '#FFFFFF' }}
                transition={{ duration: 0.2 }}
                data-testid="score-team-a"
                className="font-mono text-4xl md:text-6xl font-bold tabular-nums"
              >
                {currentEvent.scoreA}
              </motion.span>
              <span className="font-mono text-xl text-slate-500">–</span>
              <motion.span
                key={`scoreB-${currentEvent.scoreB}`}
                initial={{ scale: 1.14, color: '#38BDF8' }}
                animate={{ scale: 1, color: '#FFFFFF' }}
                transition={{ duration: 0.2 }}
                data-testid="score-team-b"
                className="font-mono text-4xl md:text-6xl font-bold tabular-nums"
              >
                {currentEvent.scoreB}
              </motion.span>
            </div>

            <div className="col-span-4 text-right">
              <div className="text-xs text-slate-400">Team B</div>
              <div className="font-display text-xl md:text-3xl font-bold text-white truncate">
                {teamBName}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                Chem {simResult.chemistryB.chemistryScore} · OFF {simResult.chemistryB.offenseRating} · DEF {simResult.chemistryB.defenseRating}
              </div>
            </div>
          </div>

          {/* Momentum Tug-of-War Bar & Quarter Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-2 border-t border-white/10">
            <div className="md:col-span-5 space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{teamAName} Momentum</span>
                <span>{teamBName} Momentum</span>
              </div>
              <div className="h-2 bg-[#0B0F17] rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${momentumPct}%` }}
                />
                <div className="h-full bg-sky-500 flex-1" />
              </div>
            </div>

            <div className="md:col-span-4">
              <div className="grid grid-cols-5 text-center font-mono text-xs tabular-nums bg-[#0B0F17]/80 border border-white/10 rounded-lg py-1.5 px-2">
                <div className="text-slate-400">TEAM</div>
                <div>Q1</div>
                <div>Q2</div>
                <div>Q3</div>
                <div>Q4</div>
                <div className="text-orange-400 font-bold">A</div>
                {quarterScores.qA.map((pts, i) => (
                  <div key={`qa-${i}`}>{pts}</div>
                ))}
                <div className="text-sky-400 font-bold">B</div>
                {quarterScores.qB.map((pts, i) => (
                  <div key={`qb-${i}`}>{pts}</div>
                ))}
              </div>
            </div>

            {/* Playback Speed Controls */}
            <div className="md:col-span-3 flex items-center justify-end gap-1.5">
              {!isFinished && (
                <>
                  <button
                    type="button"
                    aria-label={isPlaying ? 'Pause simulation' : 'Resume simulation'}
                    onClick={() => setIsPlaying((p) => !p)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center bg-[#0B0F17] hover:bg-[#1D283B] border border-white/10 rounded-lg text-white transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  {([1, 4, 16] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`min-h-[40px] px-2.5 text-xs font-mono font-bold rounded-lg border transition-colors ${
                        speed === s
                          ? 'bg-orange-600 border-orange-500 text-white'
                          : 'bg-[#0B0F17] border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setEventCursor(totalEvents - 1);
                    }}
                    className="min-h-[40px] px-3 text-xs font-semibold bg-[#1C2536] hover:bg-[#263248] border border-white/10 text-white rounded-lg flex items-center gap-1 whitespace-nowrap transition-colors"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Final</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Post-Game MVP & Series Actions Banner */}
      {isFinished && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#131A26] border border-orange-500/50 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-orange-400">
                Game {gameNumber} Winner: {simResult.winner === 'A' ? teamAName : teamBName}
              </div>
              <div className="font-display text-2xl font-bold text-white">
                MVP: {simResult.mvp.name} ({simResult.mvp.editionLabel})
              </div>
              <div className="font-mono text-xs text-slate-300 tabular-nums">
                {simResult.mvp.pts} PTS · {simResult.mvp.reb} REB · {simResult.mvp.ast} AST ·{' '}
                {simResult.mvp.fgm}/{simResult.mvp.fga} FG
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!seriesOver && onNextSeriesGame && (
              <button
                type="button"
                onClick={onNextSeriesGame}
                className="min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Adjust Lineup for Game {gameNumber + 1}
              </button>
            )}
            <button
              type="button"
              onClick={onFinishToLobby}
              className="min-h-[44px] px-5 py-2.5 bg-[#1C2536] hover:bg-[#253147] border border-white/10 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {seriesOver ? 'Return to Arena' : 'Exit Series'}
            </button>
          </div>
        </motion.section>
      )}

      {/* Live On-Court 5v5 Stamina & Hot/Cold Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { label: teamAName, ids: currentEvent.onCourtA, accent: 'text-orange-400' },
          { label: teamBName, ids: currentEvent.onCourtB, accent: 'text-sky-400' },
        ].map((unit) => (
          <div
            key={unit.label}
            className="bg-[#131A26] border border-white/10 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className={`font-display text-lg font-bold ${unit.accent}`}>
                {unit.label} — On Floor
              </h2>
              <span className="text-[11px] text-slate-400">Stamina & Streak</span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {unit.ids.map((pid) => {
                const card = playersMap[pid];
                if (!card) return null;
                const stam = Math.round(currentEvent.staminaMap[pid] ?? 100);
                const heat = currentEvent.heatMap[pid] ?? 0;
                const box = currentEvent.boxScores[pid];
                const isHot = heat >= 2;
                const isCold = heat <= -2;

                return (
                  <motion.div
                    key={pid}
                    layout
                    className="bg-[#0B0F17] border border-white/10 rounded-lg p-2 flex flex-col items-center text-center gap-1.5"
                  >
                    <div className="relative">
                      <PlayerAvatar player={card} size="sm" />
                      {isHot && (
                        <span
                          title="Hot Hand"
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-600 flex items-center justify-center"
                        >
                          <Flame className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      {isCold && (
                        <span
                          title="Ice Cold"
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sky-600 flex items-center justify-center"
                        >
                          <Snowflake className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-semibold text-white truncate w-full">
                      {card.name.includes('Gilgeous')
                        ? 'Shai G-A'
                        : card.name.includes('Antetokounmpo')
                          ? 'Giannis'
                          : card.name.split(' ').slice(-1)[0]}
                    </div>
                    <div className="font-mono text-[10px] text-slate-300 tabular-nums">
                      {box?.pts ?? 0}p · {box?.ast ?? 0}a
                    </div>
                    {/* Fatigue bar */}
                    <div className="w-full space-y-0.5">
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            stam < 45
                              ? 'bg-rose-500'
                              : stam < 68
                                ? 'bg-amber-400'
                                : 'bg-emerald-500'
                          }`}
                          style={{ width: `${stam}%` }}
                        />
                      </div>
                      <div className="font-mono text-[9px] text-slate-400 tabular-nums">
                        {stam}% STM
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Clash Feed & Live Box Score */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Live Clash & Play Feed */}
        <section className="lg:col-span-4 bg-[#131A26] border border-white/10 rounded-xl p-4 space-y-3">
          <h2 className="font-display text-xl font-bold text-white">
            Clash & Momentum Feed
          </h2>
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {recentFeed.map((ev) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#0B0F17] border border-white/10 rounded-lg p-3 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-slate-400 tabular-nums">
                      Q{ev.quarter} {formatClock(ev.clockSeconds)} · {ev.scoreA}–{ev.scoreB}
                    </span>
                    {ev.tag === 'clash' && (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Clash
                      </span>
                    )}
                    {ev.tag === 'hot' && (
                      <span className="text-orange-400 font-semibold flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Hot
                      </span>
                    )}
                    {ev.tag === 'cold' && (
                      <span className="text-sky-400 font-semibold flex items-center gap-1">
                        <Snowflake className="w-3 h-3" /> Cold
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-white">{ev.headline}</div>
                  <div className="text-[11px] text-slate-400">{ev.subtext}</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        {/* Live 13-Man Box Score Table */}
        <section className="lg:col-span-8 bg-[#131A26] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-white">
              Live 13-Man Box Score
            </h2>
            <div className="flex items-center p-1 bg-[#0B0F17] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => setBoxTab('A')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  boxTab === 'A' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {teamAName}
              </button>
              <button
                type="button"
                onClick={() => setBoxTab('B')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  boxTab === 'B' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {teamBName}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-slate-400">
                  <th className="py-2 pr-3 font-medium">Player</th>
                  <th className="py-2 px-2 text-right font-medium">MIN</th>
                  <th className="py-2 px-2 text-right font-medium">PTS</th>
                  <th className="py-2 px-2 text-right font-medium">REB</th>
                  <th className="py-2 px-2 text-right font-medium">AST</th>
                  <th className="py-2 px-2 text-right font-medium">STL</th>
                  <th className="py-2 px-2 text-right font-medium">BLK</th>
                  <th className="py-2 px-2 text-right font-medium">TOV</th>
                  <th className="py-2 px-2 text-right font-medium">FG</th>
                  <th className="py-2 px-2 text-right font-medium">3PT</th>
                  <th className="py-2 pl-2 text-right font-medium">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {currentBoxList.map((row) => (
                  <tr key={row.playerId} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <div className="font-semibold text-white">{row.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {row.pos} · {row.editionLabel}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {Math.round(row.minutes)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-white">
                      {row.pts}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {row.reb}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {row.ast}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {row.stl}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {row.blk}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-400">
                      {row.tov}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {row.fgm}-{row.fga}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {row.tpm}-{row.tpa}
                    </td>
                    <td
                      className={`py-2.5 pl-2 text-right font-mono tabular-nums font-semibold ${
                        row.plusMinus > 0
                          ? 'text-emerald-400'
                          : row.plusMinus < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
