import { useMemo, useState } from 'react';
import { AVAILABLE_2K_YEARS } from '../data/players';
import { canPlayPosition, formatPlayerPositions } from '../data/positions';
import { PlayerCard, Position } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';

interface PlayerVaultProps {
  players: PlayerCard[];
  includeHistoric: boolean;
  onToggleHistoric: (val: boolean) => void;
  onInspectPlayer: (player: PlayerCard) => void;
  onCreateCustomPlayer: (player: PlayerCard) => void;
}

export function PlayerVault({
  players,
  includeHistoric,
  onToggleHistoric,
  onInspectPlayer,
  onCreateCustomPlayer,
}: PlayerVaultProps) {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<'ALL' | 'HISTORIC' | number>('ALL');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // New custom player form state
  const [newName, setNewName] = useState('');
  const [newPos, setNewPos] = useState<Position>('PG');
  const [newSecondaryPos, setNewSecondaryPos] = useState<Position[]>([]);
  const [newYear, setNewYear] = useState(2026);
  const [newTeam, setNewTeam] = useState('LAL');
  const [newOvr, setNewOvr] = useState(90);
  const [newInside, setNewInside] = useState(85);
  const [newShooting, setNewShooting] = useState(86);
  const [newPlaymaking, setNewPlaymaking] = useState(84);
  const [newDefense, setNewDefense] = useState(80);
  const [newRebounding, setNewRebounding] = useState(70);
  const [newThreeTendency, setNewThreeTendency] = useState(65);

  const filtered = useMemo(() => {
    return players
      .filter((p) => (includeHistoric ? true : !p.isHistoric))
      .filter((p) => (posFilter === 'ALL' ? true : canPlayPosition(p, posFilter)))
      .filter((p) => {
        if (yearFilter === 'ALL') return true;
        if (yearFilter === 'HISTORIC') return p.isHistoric;
        return !p.isHistoric && p.year === yearFilter;
      })
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.editionLabel.toLowerCase().includes(q) ||
          p.teamAbbr.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.ovr - a.ovr || b.year - a.year);
  }, [players, includeHistoric, posFilter, yearFilter, search]);

  const handleToggleSecondary = (pos: Position) => {
    setNewSecondaryPos((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `custom_${Date.now()}`;
    onCreateCustomPlayer({
      id,
      name: newName.trim(),
      pos: newPos,
      secondaryPositions: newSecondaryPos.filter((p) => p !== newPos),
      year: newYear,
      editionLabel: `2K${String(newYear).slice(2)}`,
      isHistoric: false,
      teamAbbr: newTeam.trim().toUpperCase() || 'NBA',
      ovr: newOvr,
      inside: newInside,
      shooting: newShooting,
      playmaking: newPlaymaking,
      defense: newDefense,
      rebounding: newRebounding,
      threePtTendency: newThreeTendency,
      nbaId: '',
      jersey: '1',
      isCustom: true,
    });
    setNewName('');
    setNewSecondaryPos([]);
    setShowCreateForm(false);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-24 md:pb-12 space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">
            2K15–2K26 Player Vault
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect year-by-year 2K editions, customize sub-ratings, or add custom players.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={includeHistoric}
            onClick={() => onToggleHistoric(!includeHistoric)}
            className={`min-h-[44px] px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              includeHistoric
                ? 'bg-orange-600/20 border-orange-500/60 text-orange-300'
                : 'bg-[#131A26] border-white/10 text-slate-400'
            }`}
          >
            Historic: {includeHistoric ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="min-h-[44px] px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Player</span>
          </button>
        </div>
      </section>

      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-[#131A26] border border-orange-500/40 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-display text-xl font-bold text-white">
            Create Custom 2K Card
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="cp-name" className="block text-xs text-slate-400 mb-1">
                Player Name
              </label>
              <input
                id="cp-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Derrick Rose (2K15)"
                className="w-full min-h-[40px] px-3 bg-[#0B0F17] border border-white/10 rounded-lg text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="cp-pos" className="block text-xs text-slate-400 mb-1">
                Position
              </label>
              <select
                id="cp-pos"
                value={newPos}
                onChange={(e) => {
                  const next = e.target.value as Position;
                  setNewPos(next);
                  setNewSecondaryPos((prev) => prev.filter((p) => p !== next));
                }}
                className="w-full min-h-[40px] px-3 bg-[#0B0F17] border border-white/10 rounded-lg text-sm text-white"
              >
                {(['PG', 'SG', 'SF', 'PF', 'C'] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="cp-year" className="block text-xs text-slate-400 mb-1">
                  2K Year
                </label>
                <select
                  id="cp-year"
                  value={newYear}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                  className="w-full min-h-[40px] px-2 bg-[#0B0F17] border border-white/10 rounded-lg text-xs text-white"
                >
                  {AVAILABLE_2K_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cp-team" className="block text-xs text-slate-400 mb-1">
                  Team
                </label>
                <input
                  id="cp-team"
                  type="text"
                  maxLength={4}
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value.toUpperCase())}
                  className="w-full min-h-[40px] px-2 bg-[#0B0F17] border border-white/10 rounded-lg text-xs text-white uppercase"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Secondary Positions:</span>
            {(['PG', 'SG', 'SF', 'PF', 'C'] as const)
              .filter((p) => p !== newPos)
              .map((pos) => {
                const active = newSecondaryPos.includes(pos);
                return (
                  <button
                    key={pos}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleToggleSecondary(pos)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                      active
                        ? 'bg-orange-600 border-orange-500 text-white'
                        : 'bg-[#0B0F17] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                );
              })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {[
              { label: 'OVR', val: newOvr, set: setNewOvr },
              { label: 'Inside', val: newInside, set: setNewInside },
              { label: 'Shooting', val: newShooting, set: setNewShooting },
              { label: 'Playmaking', val: newPlaymaking, set: setNewPlaymaking },
              { label: 'Defense', val: newDefense, set: setNewDefense },
              { label: 'Rebounding', val: newRebounding, set: setNewRebounding },
              { label: '3PT Tend', val: newThreeTendency, set: setNewThreeTendency },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-xs text-slate-400 mb-1">
                  {field.label} ({field.val})
                </label>
                <input
                  type="range"
                  min={field.label === '3PT Tend' ? 0 : 50}
                  max={99}
                  value={field.val}
                  onChange={(e) => field.set(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-300 bg-[#0B0F17] rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg"
            >
              Save to Vault
            </button>
          </div>
        </form>
      )}

      {/* Search & Year Filter */}
      <section className="bg-[#131A26] border border-white/10 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="vault-search" className="sr-only">
            Search vault
          </label>
          <input
            id="vault-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player name, team, or 2K edition..."
            className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-[#0B0F17] border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by 2K edition"
            value={String(yearFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setYearFilter(v === 'ALL' || v === 'HISTORIC' ? v : Number(v));
            }}
            className="min-h-[44px] px-3 bg-[#0B0F17] border border-white/10 rounded-lg text-xs font-semibold text-white"
          >
            <option value="ALL">All Editions</option>
            {includeHistoric && <option value="HISTORIC">Historic Legends</option>}
            {AVAILABLE_2K_YEARS.map((y) => (
              <option key={y} value={y}>
                NBA 2K{String(y).slice(2)} ({y})
              </option>
            ))}
          </select>

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
        </div>
      </section>

      {/* Player Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filtered.map((player) => (
          <div
            key={player.id}
            className="bg-[#131A26] border border-white/10 rounded-xl p-4 flex flex-col gap-3"
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
                    <span className={player.isHistoric ? 'text-amber-400' : ''}>
                      {player.editionLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{player.teamAbbr}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-bold text-orange-400 tabular-nums leading-none">
                  {player.ovr}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">OVR</div>
              </div>
            </div>

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

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400 tabular-nums">
                3PT Tendency: {player.threePtTendency}
              </span>
              <button
                type="button"
                onClick={() => onInspectPlayer(player)}
                className="min-h-[36px] px-3 py-1 bg-[#0B0F17] hover:bg-[#1C2536] border border-white/10 text-xs font-semibold text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Edit Ratings</span>
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
