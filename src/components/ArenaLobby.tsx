import { useState } from 'react';
import { AVAILABLE_2K_YEARS } from '../data/players';
import { DraftMode, RoomState, SeriesMode } from '../types/game';
import { Copy, Check, Users, Play, Shuffle, Sparkles, Dices } from 'lucide-react';

interface ArenaLobbyProps {
  playerToken: string;
  partyName: string;
  onChangePartyName: (name: string) => void;
  activeRoom: RoomState | null;
  draftMode: DraftMode;
  onChangeDraftMode: (mode: DraftMode) => void;
  includeHistoric: boolean;
  onToggleHistoric: (val: boolean) => void;
  selectedYears: number[];
  onToggleYear: (year: number) => void;
  onSelectAllYears: () => void;
  seriesMode: SeriesMode;
  onChangeSeriesMode: (mode: SeriesMode) => void;
  randomizePool: boolean;
  onToggleRandomizePool: (val: boolean) => void;
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (code: string) => Promise<void>;
  onStartRoomDraft: () => Promise<void>;
  onStartPracticeDraft: () => void;
  initialJoinCode?: string;
  roomError: string | null;
  isBusy: boolean;
}

export function ArenaLobby({
  playerToken,
  partyName,
  onChangePartyName,
  activeRoom,
  draftMode,
  onChangeDraftMode,
  includeHistoric,
  onToggleHistoric,
  selectedYears,
  onToggleYear,
  onSelectAllYears,
  seriesMode,
  onChangeSeriesMode,
  randomizePool,
  onToggleRandomizePool,
  onCreateRoom,
  onJoinRoom,
  onStartRoomDraft,
  onStartPracticeDraft,
  initialJoinCode = '',
  roomError,
  isBusy,
}: ArenaLobbyProps) {
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const isHost = Boolean(activeRoom && activeRoom.hostUid === playerToken);
  const shareUrl =
    activeRoom && typeof window !== 'undefined'
      ? `${window.location.origin}?party=${activeRoom.id}`
      : '';

  const copyRoomInvite = async () => {
    if (!activeRoom) return;
    try {
      await navigator.clipboard.writeText(shareUrl || activeRoom.id);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const copyRoomCodeOnly = async () => {
    if (!activeRoom) return;
    try {
      await navigator.clipboard.writeText(activeRoom.id);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 pt-6 pb-24 md:pb-12 space-y-8">
      {/* Broadcast Split Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-[#131A26] border border-white/10 rounded-xl p-6 md:p-8 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-orange-400">
              <span>Plug &amp; Play Party Code</span>
              <span aria-hidden="true">·</span>
              <span>No Sign-In Needed</span>
              <span aria-hidden="true">·</span>
              <span>13-Man Spin Draft</span>
            </div>

            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-white leading-[1.02] text-balance">
              Spin a Franchise &amp; Season. Play Head-to-Head.
            </h1>

            <p className="text-sm md:text-base text-slate-300 max-w-2xl leading-relaxed">
              Spin the dual reels to land a random NBA franchise and year (like 1965 Celtics, 1986 Celtics, Showtime Lakers, 2002 Kings, or 2025 Thunder), draft 1-by-1 from that exact roster, set your multi-position chemistry, and watch SimCast Live play out.
            </p>
          </div>

          {/* Primary Actions */}
          {!activeRoom ? (
            <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
              <div>
                <label htmlFor="coach-name-input" className="block text-xs text-slate-400 mb-1.5">
                  Your Team / Coach Name (optional)
                </label>
                <input
                  id="coach-name-input"
                  type="text"
                  maxLength={28}
                  value={partyName}
                  onChange={(e) => onChangePartyName(e.target.value)}
                  placeholder="Player 1"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#0B0F17] border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onCreateRoom}
                  className="min-h-[48px] px-5 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Users className="w-4 h-4" />
                  <span>{isBusy ? 'Creating Party...' : 'Create Party Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={onStartPracticeDraft}
                  className="min-h-[48px] px-5 py-3 bg-[#1C2536] hover:bg-[#253147] border border-white/10 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Play className="w-4 h-4 text-orange-400" />
                  <span>Practice vs CPU GM</span>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (joinCode.trim()) onJoinRoom(joinCode.trim().toUpperCase());
                }}
                className="flex items-center gap-2"
              >
                <label htmlFor="join-room-input" className="sr-only">
                  Party code
                </label>
                <input
                  id="join-room-input"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-letter party code"
                  maxLength={12}
                  className="flex-1 min-h-[44px] px-3.5 py-2 bg-[#0B0F17] border border-white/10 rounded-lg text-sm font-mono uppercase tracking-wider text-white placeholder:text-slate-500 placeholder:normal-case placeholder:font-sans focus:outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={isBusy || joinCode.trim().length < 4}
                  className="min-h-[44px] px-5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  Join Party
                </button>
              </form>

              {roomError && (
                <p role="alert" className="text-xs font-medium text-rose-400">
                  {roomError}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Share This Party Code</div>
                  <div
                    data-testid="active-party-code"
                    className="font-mono text-4xl font-bold tracking-widest text-orange-400 tabular-nums"
                  >
                    {activeRoom.id}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyRoomCodeOnly}
                    className="min-h-[44px] px-3.5 py-2 bg-[#0B0F17] hover:bg-[#1C2536] border border-white/10 text-xs font-semibold text-white rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode ? 'Code Copied' : 'Copy Code'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyRoomInvite}
                    className="min-h-[44px] px-4 py-2 bg-[#1C2536] hover:bg-[#263248] border border-white/10 text-xs font-semibold text-white rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Link Copied' : 'Copy Invite Link'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="bg-[#0B0F17] border border-white/10 rounded-lg px-4 py-3">
                  <div className="text-xs text-slate-400">Team A (Host)</div>
                  <div className="font-semibold text-white mt-0.5 truncate">
                    {activeRoom.hostName}
                  </div>
                </div>
                <div className="bg-[#0B0F17] border border-white/10 rounded-lg px-4 py-3">
                  <div className="text-xs text-slate-400">Team B (Friend)</div>
                  <div className="font-semibold text-white mt-0.5 truncate">
                    {activeRoom.guestName || 'Waiting for friend to enter code...'}
                  </div>
                </div>
              </div>

              {isHost ? (
                <button
                  type="button"
                  disabled={isBusy || !activeRoom.guestUid}
                  onClick={onStartRoomDraft}
                  className="w-full min-h-[48px] px-5 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-45 text-white font-semibold text-sm rounded-lg transition-colors whitespace-nowrap"
                >
                  {activeRoom.guestUid
                    ? 'Start 13-Man Draft'
                    : 'Waiting for Friend to Join Party Code...'}
                </button>
              ) : (
                <div className="text-xs text-slate-300 bg-[#0B0F17] border border-white/10 rounded-lg px-4 py-3">
                  Joined <span className="font-mono font-bold text-orange-400">{activeRoom.id}</span> as{' '}
                  <span className="font-semibold text-white">{activeRoom.guestName}</span>. Waiting for {activeRoom.hostName} to start the draft.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visual Arena Anchor */}
        <div className="lg:col-span-5 relative rounded-xl overflow-hidden border border-white/10 bg-[#131A26] min-h-[260px] flex flex-col justify-end">
          <img
            src="/src/assets/images/arena_hardwood_court_1795580442635.jpg"
            alt="Neutral championship hardwood basketball arena"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/55 to-transparent"
            aria-hidden="true"
          />
          <div className="relative p-6 flex items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs text-slate-300">
                Neutral Floor Rules · No Home-Court Advantage
              </div>
              <div className="font-display text-2xl font-bold text-white">
                5 Core Ratings + Real Chemistry
              </div>
              <p className="text-xs text-slate-300">
                Inside, Shooting, Playmaking, Defense, Rebounding, plus 3PT era discipline and fatigue curves.
              </p>
            </div>
            <img
              src="/src/assets/images/gm_trophy_emblem_1795580443520.jpg"
              alt="Championship trophy emblem"
              className="w-16 h-16 rounded-lg object-cover border border-white/15 shrink-0"
            />
          </div>
        </div>
      </section>

      {/* Draft & Era Pool Configuration */}
      <section className="bg-[#131A26] border border-white/10 rounded-xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Draft Pool & Match Rules
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose which NBA 2K editions (2015–2026) and historic legends enter the draft pool.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Draft Format: Spin vs Open Pool */}
            <div className="flex items-center p-1 bg-[#0B0F17] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeDraftMode('spin')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  draftMode === 'spin'
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Dices className="w-3.5 h-3.5" />
                <span>Team + Year Spin</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeDraftMode('open')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  draftMode === 'open'
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Open Pool
              </button>
            </div>

            {/* Historic Toggle ON / OFF */}
            <button
              type="button"
              role="switch"
              aria-checked={includeHistoric}
              onClick={() => onToggleHistoric(!includeHistoric)}
              className={`min-h-[44px] px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                includeHistoric
                  ? 'bg-orange-600/20 border-orange-500/60 text-orange-300'
                  : 'bg-[#0B0F17] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Historic Legends: {includeHistoric ? 'ON' : 'OFF'}</span>
            </button>

            {/* Random Pool vs Full Vault (relevant for Open Pool) */}
            {draftMode === 'open' && (
              <button
                type="button"
                role="switch"
                aria-checked={randomizePool}
                onClick={() => onToggleRandomizePool(!randomizePool)}
                className={`min-h-[44px] px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  randomizePool
                    ? 'bg-sky-500/15 border-sky-400/50 text-sky-300'
                    : 'bg-[#0B0F17] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{randomizePool ? 'Random 44-Player Pool' : 'Full Active Pool'}</span>
              </button>
            )}

            {/* Series Format */}
            <div className="flex items-center p-1 bg-[#0B0F17] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeSeriesMode('single')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  seriesMode === 'single'
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Single Game
              </button>
              <button
                type="button"
                onClick={() => onChangeSeriesMode('bo7')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  seriesMode === 'bo7'
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Best of 7
              </button>
            </div>
          </div>
        </div>

        {/* 2K15 - 2K26 Year Chips */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              Active 2K Editions ({selectedYears.length} of 12 selected)
            </span>
            <button
              type="button"
              onClick={onSelectAllYears}
              className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors"
            >
              Select All 2015–2026
            </button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
            {AVAILABLE_2K_YEARS.map((yr) => {
              const active = selectedYears.includes(yr);
              return (
                <button
                  key={yr}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggleYear(yr)}
                  className={`min-h-[40px] py-2 px-2 rounded-lg font-mono text-xs font-bold tabular-nums border transition-colors ${
                    active
                      ? 'bg-[#1D283B] border-orange-500/70 text-white'
                      : 'bg-[#0B0F17] border-white/10 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  2K{String(yr).slice(2)}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
