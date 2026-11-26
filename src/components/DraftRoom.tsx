import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayerCard, Position } from '../types/game';
import { canPlayPosition, formatPlayerPositions } from '../data/positions';
import { PlayerAvatar } from './PlayerAvatar';
import { Search, Sparkles, Zap, Info } from 'lucide-react';

interface DraftRoomProps {
  poolPlayers: PlayerCard[];
  playersMap: Record<string, PlayerCard>;
  draftOrder: ('A' | 'B')[];
  pickIndex: number;
  teamARoster: string[];
  teamBRoster: string[];
  teamAName: string;
  teamBName: string;
  mySide: 'A' | 'B';
  includeHistoric: boolean;
  isPracticeMode: boolean;
  onPickPlayer: (playerId: string) => void;
  onAutoDraftRemaining?: () => void;
  onInspectPlayer: (player: PlayerCard) => void;
}

type SortKey = 'ovr' | 'inside' | 'shooting' | 'playmaking' | 'defense' | 'rebounding';

export function DraftRoom({
  poolPlayers,
  playersMap,
  draftOrder,
  pickIndex,
  teamARoster,
  teamBRoster,
  teamAName,
  teamBName,
  mySide,
  includeHistoric,
  isPracticeMode,
  onPickPlayer,
  onAutoDraftRemaining,
  onInspectPlayer,
}: DraftRoomProps) {
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [eraFilter, setEraFilter] = useState<'ALL' | 'CURRENT' | 'HISTORIC'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('ovr');
  const [activeTabMobile, setActiveTabMobile] = useState<'POOL' | 'ROSTERS'>('POOL');

  const currentTurn = draftOrder[pickIndex] ?? null;
  const isMyTurn = currentTurn === mySide;
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

  const availablePlayers = useMemo(() => {
    return poolPlayers
      .filter((p) => !pickedSet.has(p.id))
      .filter((p) => !myTeamPlayerNames.has(p.name))
      .filter((p) => (posFilter === 'ALL' ? true : canPlayPosition(p, posFilter)))
      .filter((p) => {
        if (eraFilter === 'CURRENT') return !p.isHistoric;
        if (eraFilter === 'HISTORIC') return p.isHistoric;
        return true;
      })
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.editionLabel.toLowerCase().includes(q) ||
          p.teamAbbr.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b[sortBy] - a[sortBy] || b.ovr - a.ovr);
  }, [poolPlayers, pickedSet, myTeamPlayerNames, posFilter, eraFilter, searchQuery, sortBy]);

  const roundNum = Math.floor(pickIndex / 2) + 1;

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-24 md:pb-12 space-y-5">
      {/* Draft Status Banner */}
      <section className="bg-[#131A26] border border-white/10 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-orange-400 font-bold">
              Pick {Math.min(pickIndex + 1, 26)} of 26
            </span>
            <span aria-hidden="true">·</span>
            <span>Round {Math.min(roundNum, 13)} of 13</span>
            <span aria-hidden="true">·</span>
            <span>Historic Legends: {includeHistoric ? 'ON' : 'OFF'}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white mt-0.5">
            {currentTurn === null
              ? 'Draft Complete — Locking Rosters'
              : isMyTurn
                ? `Your Pick (${mySide === 'A' ? teamAName : teamBName})`
                : `Waiting for ${currentTurn === 'A' ? teamAName : teamBName}...`}
          </h1>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Mobile Pool / Rosters Switcher */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setActiveTabMobile('POOL')}
          className={`min-h-[44px] py-2 text-xs font-semibold rounded-lg border transition-colors ${
            activeTabMobile === 'POOL'
              ? 'bg-orange-600 border-orange-500 text-white'
              : 'bg-[#131A26] border-white/10 text-slate-300'
          }`}
        >
          Draft Pool ({availablePlayers.length})
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
          13-Man Rosters ({teamARoster.length}/13 · {teamBRoster.length}/13)
        </button>
      </div>

      {/* Main Split: Available Pool + Live Animated 13-Man Rosters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Draft Pool */}
        <section
          className={`lg:col-span-7 space-y-4 ${
            activeTabMobile === 'POOL' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Filter Controls */}
          <div className="bg-[#131A26] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <label htmlFor="draft-search" className="sr-only">
                  Search players
                </label>
                <input
                  id="draft-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search player, 2K year, or team..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-[#0B0F17] border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <label htmlFor="draft-sort" className="sr-only">
                Sort attribute
              </label>
              <select
                id="draft-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="min-h-[44px] px-3 py-2 bg-[#0B0F17] border border-white/10 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-orange-500"
              >
                <option value="ovr">Sort: 2K OVR</option>
                <option value="inside">Sort: Inside</option>
                <option value="shooting">Sort: Shooting</option>
                <option value="playmaking">Sort: Playmaking</option>
                <option value="defense">Sort: Defense</option>
                <option value="rebounding">Sort: Rebounding</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg">
                {(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPosFilter(pos)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      posFilter === pos
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              {includeHistoric && (
                <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg">
                  {(['ALL', 'CURRENT', 'HISTORIC'] as const).map((era) => (
                    <button
                      key={era}
                      type="button"
                      onClick={() => setEraFilter(era)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        eraFilter === era
                          ? 'bg-[#253147] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {era === 'ALL' ? 'All Eras' : era === 'CURRENT' ? '2K15–26' : 'Historic'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Draft Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[680px] overflow-y-auto pr-1">
            <AnimatePresence mode="popLayout">
              {availablePlayers.map((player) => (
                <motion.div
                  key={player.id}
                  layoutId={`player-card-${player.id}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
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

                  {/* 5 Quick Sub-Ratings */}
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
                      disabled={!isMyTurn}
                      onClick={() => onPickPlayer(player.id)}
                      className="flex-1 min-h-[40px] py-2 px-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {isMyTurn ? `Draft ${player.name.split(' ').slice(-1)[0]}` : 'Opponent Pick'}
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
              ))}
            </AnimatePresence>
          </div>
        </section>

        {/* Live Animated 13-Man Rosters */}
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
                            <span>{card.editionLabel}</span>
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
