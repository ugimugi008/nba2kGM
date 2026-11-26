import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AVAILABLE_2K_YEARS, BASE_PLAYERS } from './data/players';
import {
  buildDefaultLineup,
  generateAlternatingDraftOrder,
  simulateMatchup,
} from './engine/simEngine';
import {
  pickBestCandidateForCpu,
  spinTeamAndYear,
} from './engine/spinDraft';
import {
  AppView,
  DraftMode,
  MatchRecord,
  PlayerCard,
  RoomState,
  SeriesMode,
  SimGameResult,
  SpinState,
  TeamLineup,
} from './types/game';
import { HeaderNav } from './components/HeaderNav';
import { ArenaLobby } from './components/ArenaLobby';
import { DraftRoom } from './components/DraftRoom';
import { SpinDraftRoom } from './components/SpinDraftRoom';
import { LineupLab } from './components/LineupLab';
import { SimCastArena } from './components/SimCastArena';
import { PlayerVault } from './components/PlayerVault';
import { RivalryLedger } from './components/RivalryLedger';
import { PlayerDetailModal } from './components/PlayerDetailModal';

const EMPTY_LINEUP: TeamLineup = {
  starters: [],
  bench: [],
  minutes: {},
  locked: false,
};

const INITIAL_SPIN_STATE: SpinState = {
  phase: 'ready',
  teamAbbr: '',
  year: 0,
  candidateIds: [],
  spinNonce: 0,
  rerollsLeftA: 2,
  rerollsLeftB: 2,
};

function getOrCreatePlayerToken(): string {
  if (typeof window === 'undefined') return 'ssr_player';
  try {
    const existing = window.sessionStorage.getItem('hwgm_party_token');
    if (existing && existing.length >= 8) return existing;
    const token =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `gm_${crypto.randomUUID()}`
        : `gm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.sessionStorage.setItem('hwgm_party_token', token);
    return token;
  } catch {
    return `gm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

const ACTIVE_PARTY_KEY = 'hwgm_active_party';

function readSavedPartyCode(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_PARTY_KEY);
  } catch {
    return null;
  }
}

function savePartyCode(code: string | null) {
  try {
    if (code) window.sessionStorage.setItem(ACTIVE_PARTY_KEY, code);
    else window.sessionStorage.removeItem(ACTIVE_PARTY_KEY);
  } catch {
    // Storage unavailable (private mode etc.) — resume-on-refresh just won't work.
  }
}

async function postPartyApi<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 404
          ? 'Party server not reachable. Check that the API is deployed.'
          : 'Party connection error.')
    );
  }
  return data;
}

function getRecentTeamAbbrs(
  teamARoster: string[],
  teamBRoster: string[],
  playersMap: Record<string, PlayerCard>,
  limit = 8
): string[] {
  const interleaved: string[] = [];
  const maxLen = Math.max(teamARoster.length, teamBRoster.length);
  for (let i = 0; i < maxLen; i++) {
    if (teamARoster[i]) interleaved.push(teamARoster[i]);
    if (teamBRoster[i]) interleaved.push(teamBRoster[i]);
  }
  return interleaved
    .slice(-limit)
    .map((id) => playersMap[id]?.teamAbbr)
    .filter((abbr): abbr is string => Boolean(abbr));
}

export default function App() {
  const playerToken = useMemo(() => getOrCreatePlayerToken(), []);
  const [partyName, setPartyName] = useState(() => {
    try {
      return window.localStorage.getItem('hwgm_coach_name') ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('hwgm_coach_name', partyName);
    } catch {
      // ignore
    }
  }, [partyName]);

  // Pool & Match Config
  const [draftMode, setDraftMode] = useState<DraftMode>('spin');
  const [includeHistoric, setIncludeHistoric] = useState(true);
  const [selectedYears, setSelectedYears] = useState<number[]>([...AVAILABLE_2K_YEARS]);
  const [seriesMode, setSeriesMode] = useState<SeriesMode>('single');
  const [randomizePool, setRandomizePool] = useState(false);

  // Player Vault + Custom Overrides + Session Rivalry Ledger
  const [customPlayers, setCustomPlayers] = useState<PlayerCard[]>([]);
  const [localMatchHistory, setLocalMatchHistory] = useState<MatchRecord[]>([]);
  const [inspectedPlayer, setInspectedPlayer] = useState<PlayerCard | null>(null);

  // Navigation & Active Sessions
  const [activeView, setActiveView] = useState<AppView>('arena');
  const [activePartyCode, setActivePartyCode] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readSavedPartyCode()
  );
  const [partyRoom, setPartyRoom] = useState<RoomState | null>(null);
  const [practiceRoom, setPracticeRoom] = useState<RoomState | null>(null);
  const [localLineupDraft, setLocalLineupDraft] = useState<TeamLineup | null>(null);

  const [roomError, setRoomError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Prevents double-clicks from sending two spins/picks before the server answers.
  const actionInFlightRef = useRef(false);

  const sendPartyAction = useCallback(
    async (roomId: string, action: string, body: Record<string, unknown>, fallbackError: string) => {
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      try {
        const { room } = await postPartyApi<{ room: RoomState }>(
          `/api/party/${encodeURIComponent(roomId)}/${action}`,
          { playerToken, ...body }
        );
        setRoomError(null);
        applyPartyRoomUpdateRef.current?.(room);
      } catch (err) {
        setRoomError(err instanceof Error ? err.message : fallbackError);
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [playerToken]
  );
  const applyPartyRoomUpdateRef = useRef<((room: RoomState) => void) | null>(null);

  // Read URL params (?party=CODE, ?room=CODE, or ?autostart=1)
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const initialRoomParam = (
    urlParams.get('party') ||
    urlParams.get('room') ||
    ''
  )
    .trim()
    .toUpperCase();

  // Combined player map (custom overrides replace base cards by ID or add new ones)
  const allPlayers = useMemo(() => {
    const map = new Map<string, PlayerCard>();
    for (const p of BASE_PLAYERS) map.set(p.id, p);
    for (const c of customPlayers) map.set(c.id, c);
    return Array.from(map.values());
  }, [customPlayers]);

  const playersMap = useMemo(
    () => Object.fromEntries(allPlayers.map((p) => [p.id, p])),
    [allPlayers]
  );

  const allMatches = useMemo(() => {
    return [...localMatchHistory].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [localMatchHistory]);

  const roomRevRef = useRef(0);
  const partyCodeRef = useRef<string | null>(activePartyCode);

  const clearParty = useCallback(() => {
    partyCodeRef.current = null;
    roomRevRef.current = 0;
    savePartyCode(null);
    setActivePartyCode(null);
    setPartyRoom(null);
  }, []);

  const applyPartyRoomUpdate = useCallback(
    (nextRoom: RoomState) => {
      // Drop responses for a party we already left, or that arrive out of order.
      if (partyCodeRef.current && nextRoom.id !== partyCodeRef.current) return;
      const rev = nextRoom.rev ?? 0;
      if (rev > 0 && rev < roomRevRef.current) return;
      if (nextRoom.hostUid !== playerToken && nextRoom.guestUid !== playerToken) {
        clearParty();
        setRoomError('You are not a member of that party anymore.');
        return;
      }
      roomRevRef.current = rev;
      setPartyRoom(nextRoom);
      if (nextRoom.status === 'drafting') setActiveView('draft');
      else if (nextRoom.status === 'lineup') setActiveView('lineup');
      else if (nextRoom.status === 'simulating') setActiveView('simcast');
    },
    [clearParty, playerToken]
  );
  applyPartyRoomUpdateRef.current = applyPartyRoomUpdate;

  const joinParty = useCallback(
    (room: RoomState) => {
      partyCodeRef.current = room.id;
      roomRevRef.current = 0;
      savePartyCode(room.id);
      setPracticeRoom(null);
      applyPartyRoomUpdate(room);
      setActivePartyCode(room.id);
    },
    [applyPartyRoomUpdate]
  );

  // Live sync: lightweight polling (works on serverless hosts like Vercel).
  // The server answers 204 when nothing changed since our revision.
  const [syncTrouble, setSyncTrouble] = useState(false);
  useEffect(() => {
    if (!activePartyCode) {
      setPartyRoom(null);
      setSyncTrouble(false);
      return;
    }
    const code = activePartyCode.trim().toUpperCase();
    partyCodeRef.current = code;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/party/${encodeURIComponent(code)}?since=${roomRevRef.current}`,
          { cache: 'no-store' }
        );
        if (cancelled) return;
        if (res.status === 404) {
          clearParty();
          setActiveView('arena');
          setRoomError(`Party code "${code}" expired or was closed.`);
          return;
        }
        if (res.status === 200) {
          const data = (await res.json()) as { room?: RoomState };
          if (!cancelled && data.room) applyPartyRoomUpdate(data.room);
        } else if (res.status >= 500) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Server error ${res.status}`);
        }
        failures = 0;
        setSyncTrouble(false);
      } catch (err) {
        if (cancelled) return;
        failures += 1;
        if (failures >= 3) {
          setSyncTrouble(true);
          if (err instanceof Error && /storage/i.test(err.message)) setRoomError(err.message);
        }
      } finally {
        if (!cancelled) {
          const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          const delay = hidden ? 5000 : failures > 0 ? Math.min(8000, 1000 * 2 ** failures) : 1000;
          timer = window.setTimeout(tick, delay);
        }
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activePartyCode, applyPartyRoomUpdate, clearParty]);

  // In-game sync errors are transient; fade them out after a few seconds.
  useEffect(() => {
    if (!roomError || activeView === 'arena') return;
    const t = window.setTimeout(() => setRoomError(null), 6000);
    return () => window.clearTimeout(t);
  }, [roomError, activeView]);

  // If the other GM leaves, bring this player back to the lobby with a note.
  // (During SimCast we let the current game finish playing first.)
  useEffect(() => {
    if (partyRoom?.status !== 'finished' || activeView === 'simcast') return;
    clearParty();
    setActiveView('arena');
    setRoomError('Your friend left the party. Create a new code to play again.');
  }, [partyRoom?.status, activeView, clearParty]);

  const activeSession = partyRoom ?? practiceRoom;
  const isPracticeMode = Boolean(practiceRoom && !partyRoom);
  const mySide: 'A' | 'B' =
    partyRoom && partyRoom.guestUid === playerToken ? 'B' : 'A';

  // Ensure localLineupDraft initializes whenever entering lineup phase
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'lineup') {
      setLocalLineupDraft(null);
      return;
    }
    const myRoster = mySide === 'A' ? activeSession.teamARoster : activeSession.teamBRoster;
    const savedLineup = mySide === 'A' ? activeSession.teamALineup : activeSession.teamBLineup;

    if (savedLineup.starters.length === 5) {
      setLocalLineupDraft(savedLineup);
    } else if (myRoster.length >= 5) {
      setLocalLineupDraft(buildDefaultLineup(myRoster, playersMap));
    }
  }, [activeSession?.status, activeSession?.gameNumber, mySide, playersMap]);

  // Build draft pool respecting Historic toggle & selected 2K years (guarantee >= 30 unique names)
  const buildDraftPoolIds = useCallback(() => {
    const yearSet = new Set(selectedYears);
    let candidates = allPlayers.filter((p) => {
      if (p.isHistoric) return includeHistoric;
      return yearSet.has(p.year);
    });

    const uniqueNamesCount = () => new Set(candidates.map((c) => c.name)).size;
    if (uniqueNamesCount() < 30) {
      const existingIds = new Set(candidates.map((c) => c.id));
      const extras = allPlayers.filter(
        (p) => !existingIds.has(p.id) && (includeHistoric || !p.isHistoric)
      );
      candidates = [...candidates, ...extras];
    }

    if (randomizePool && candidates.length > 44) {
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      // Ensure at least 30 distinct names in random slice
      const seenNames = new Set<string>();
      const primary: PlayerCard[] = [];
      const overflow: PlayerCard[] = [];
      for (const c of shuffled) {
        if (!seenNames.has(c.name) && primary.length < 36) {
          seenNames.add(c.name);
          primary.push(c);
        } else {
          overflow.push(c);
        }
      }
      candidates = [...primary, ...overflow].slice(0, 44);
    }

    return candidates.slice(0, 480).map((c) => c.id);
  }, [allPlayers, includeHistoric, selectedYears, randomizePool]);

  // Practice Mode: Start immediately (also triggered by ?autostart=1)
  const handleStartPracticeDraft = useCallback(() => {
    clearParty();
    setRoomError(null);
    const poolIds = draftMode === 'open' ? buildDraftPoolIds() : [];
    const order = generateAlternatingDraftOrder('A', 26);
    setPracticeRoom({
      id: 'PRACTICE',
      hostUid: 'local',
      hostName: partyName.trim() || 'Your Squad',
      guestUid: 'cpu',
      guestName: 'CPU GM',
      status: 'drafting',
      draftMode,
      includeHistoric,
      selectedYears,
      poolIds,
      draftOrder: order,
      pickIndex: 0,
      spinState: { ...INITIAL_SPIN_STATE },
      teamARoster: [],
      teamBRoster: [],
      teamALineup: EMPTY_LINEUP,
      teamBLineup: EMPTY_LINEUP,
      seriesMode,
      teamAWins: 0,
      teamBWins: 0,
      gameNumber: 1,
      simSeed: 0,
      simStartedAt: 0,
    });
    setActiveView('draft');
  }, [buildDraftPoolIds, clearParty, draftMode, includeHistoric, partyName, selectedYears, seriesMode]);

  useEffect(() => {
    if (urlParams.get('autostart') === '1' && !practiceRoom && !partyRoom) {
      handleStartPracticeDraft();
    }
  }, [urlParams, practiceRoom, partyRoom, handleStartPracticeDraft]);

  // CPU GM auto-spin & auto-pick in Practice Mode
  useEffect(() => {
    if (!practiceRoom || practiceRoom.status !== 'drafting') return;
    const turn = practiceRoom.draftOrder[practiceRoom.pickIndex];
    if (turn !== 'B') return;

    // Spin Draft CPU Turn: Stage 1 (spin reels), Stage 2 (pick from spun squad)
    if (practiceRoom.draftMode === 'spin') {
      if (practiceRoom.spinState.phase === 'ready') {
        const spinTimer = window.setTimeout(() => {
          const picked = new Set([...practiceRoom.teamARoster, ...practiceRoom.teamBRoster]);
          const cpuNames = new Set(
            practiceRoom.teamBRoster.map((id) => playersMap[id]?.name).filter(Boolean)
          );
          const recentTeams = getRecentTeamAbbrs(
            practiceRoom.teamARoster,
            practiceRoom.teamBRoster,
            playersMap
          );
          const outcome = spinTeamAndYear(
            allPlayers,
            practiceRoom.includeHistoric,
            practiceRoom.selectedYears,
            picked,
            cpuNames,
            Math.random,
            undefined,
            recentTeams
          );
          if (!outcome) return;

          setPracticeRoom((prev) =>
            prev
              ? {
                  ...prev,
                  spinState: {
                    ...prev.spinState,
                    phase: 'spun',
                    teamAbbr: outcome.teamAbbr,
                    year: outcome.year,
                    candidateIds: outcome.candidateIds,
                    spinNonce: prev.spinState.spinNonce + 1,
                  },
                }
              : null
          );
        }, 220);
        return () => window.clearTimeout(spinTimer);
      }

      const pickTimer = window.setTimeout(() => {
        const chosen = pickBestCandidateForCpu(
          practiceRoom.spinState.candidateIds,
          playersMap,
          practiceRoom.teamBRoster
        );
        if (!chosen) return;
        const nextPickIdx = practiceRoom.pickIndex + 1;
        const nextBRoster = [...practiceRoom.teamBRoster, chosen.id];
        const done = nextPickIdx >= practiceRoom.draftOrder.length;

        setPracticeRoom((prev) =>
          prev
            ? {
                ...prev,
                teamBRoster: nextBRoster,
                pickIndex: nextPickIdx,
                status: done ? 'lineup' : 'drafting',
                spinState: {
                  ...prev.spinState,
                  phase: 'ready',
                  teamAbbr: '',
                  year: 0,
                  candidateIds: [],
                },
                teamBLineup: done ? buildDefaultLineup(nextBRoster, playersMap) : prev.teamBLineup,
              }
            : null
        );
        if (done) setActiveView('lineup');
      }, 1550);

      return () => window.clearTimeout(pickTimer);
    }

    // Open Pool CPU Turn
    const timer = window.setTimeout(() => {
      const picked = new Set([...practiceRoom.teamARoster, ...practiceRoom.teamBRoster]);
      const cpuNames = new Set(
        practiceRoom.teamBRoster.map((id) => playersMap[id]?.name).filter(Boolean)
      );
      const avail = practiceRoom.poolIds
        .map((id) => playersMap[id])
        .filter((p): p is PlayerCard => Boolean(p) && !picked.has(p.id) && !cpuNames.has(p.name));
      if (avail.length === 0) return;

      const chosen = pickBestCandidateForCpu(
        avail.map((p) => p.id),
        playersMap,
        practiceRoom.teamBRoster
      );
      if (!chosen) return;
      const nextPickIdx = practiceRoom.pickIndex + 1;
      const nextBRoster = [...practiceRoom.teamBRoster, chosen.id];
      const done = nextPickIdx >= practiceRoom.draftOrder.length;

      setPracticeRoom((prev) =>
        prev
          ? {
              ...prev,
              teamBRoster: nextBRoster,
              pickIndex: nextPickIdx,
              status: done ? 'lineup' : 'drafting',
              teamBLineup: done ? buildDefaultLineup(nextBRoster, playersMap) : prev.teamBLineup,
            }
          : null
      );
      if (done) setActiveView('lineup');
    }, 340);

    return () => window.clearTimeout(timer);
  }, [practiceRoom, playersMap, allPlayers]);

  // --- Plug-and-Play Party Code Actions (No Sign-In Required) ---
  const handleCreateRoom = async () => {
    setRoomError(null);
    setIsBusy(true);
    try {
      const { room } = await postPartyApi<{ room: RoomState }>('/api/party', {
        hostToken: playerToken,
        hostName: partyName.trim() || 'Player 1',
        draftMode,
        includeHistoric,
        selectedYears: selectedYears.length > 0 ? selectedYears : [...AVAILABLE_2K_YEARS],
        seriesMode,
      });
      joinParty(room);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Could not create party code.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoom = async (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,12}$/.test(cleanCode)) {
      setRoomError('Party code must be 4–12 letters or numbers.');
      return;
    }
    setRoomError(null);
    setIsBusy(true);
    try {
      const { room } = await postPartyApi<{ room: RoomState }>(
        `/api/party/${encodeURIComponent(cleanCode)}/join`,
        {
          guestToken: playerToken,
          guestName: partyName.trim() || 'Player 2',
        }
      );
      joinParty(room);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to join party.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartRoomDraft = async () => {
    if (!partyRoom || partyRoom.hostUid !== playerToken || !partyRoom.guestUid) return;
    setRoomError(null);
    setIsBusy(true);
    try {
      const poolIds = draftMode === 'open' ? buildDraftPoolIds() : [];
      const draftOrder = generateAlternatingDraftOrder('A', 26);
      const { room } = await postPartyApi<{ room: RoomState }>(
        `/api/party/${encodeURIComponent(partyRoom.id)}/start`,
        {
          playerToken,
          draftMode,
          includeHistoric,
          selectedYears: selectedYears.length > 0 ? selectedYears : [...AVAILABLE_2K_YEARS],
          seriesMode,
          poolIds,
          draftOrder,
        }
      );
      applyPartyRoomUpdate(room);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to start draft.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSpinReels = async (consumeReroll: boolean) => {
    if (!activeSession || activeSession.status !== 'drafting' || activeSession.draftMode !== 'spin') {
      return;
    }
    const turn = activeSession.draftOrder[activeSession.pickIndex];
    if (turn !== mySide) return;

    const myRerolls =
      mySide === 'A' ? activeSession.spinState.rerollsLeftA : activeSession.spinState.rerollsLeftB;
    if (consumeReroll && myRerolls <= 0) return;

    const picked = new Set([...activeSession.teamARoster, ...activeSession.teamBRoster]);
    const myRoster = mySide === 'A' ? activeSession.teamARoster : activeSession.teamBRoster;
    const myNames = new Set(myRoster.map((id) => playersMap[id]?.name).filter(Boolean));
    const excludeKey =
      activeSession.spinState.phase === 'spun' && activeSession.spinState.teamAbbr
        ? `${activeSession.spinState.teamAbbr}_${activeSession.spinState.year}`
        : undefined;
    const excludeTeamAbbr =
      activeSession.spinState.phase === 'spun' && activeSession.spinState.teamAbbr
        ? activeSession.spinState.teamAbbr
        : undefined;
    const recentTeams = getRecentTeamAbbrs(
      activeSession.teamARoster,
      activeSession.teamBRoster,
      playersMap
    );

    const outcome = spinTeamAndYear(
      allPlayers,
      activeSession.includeHistoric,
      activeSession.selectedYears,
      picked,
      myNames,
      Math.random,
      excludeKey,
      recentTeams,
      excludeTeamAbbr
    );
    if (!outcome) return;

    const nextSpinState: SpinState = {
      phase: 'spun',
      teamAbbr: outcome.teamAbbr,
      year: outcome.year,
      candidateIds: outcome.candidateIds,
      spinNonce: activeSession.spinState.spinNonce + 1,
      rerollsLeftA:
        consumeReroll && mySide === 'A'
          ? Math.max(0, activeSession.spinState.rerollsLeftA - 1)
          : activeSession.spinState.rerollsLeftA,
      rerollsLeftB:
        consumeReroll && mySide === 'B'
          ? Math.max(0, activeSession.spinState.rerollsLeftB - 1)
          : activeSession.spinState.rerollsLeftB,
    };

    if (isPracticeMode) {
      setPracticeRoom((prev) => (prev ? { ...prev, spinState: nextSpinState } : null));
      return;
    }

    if (partyRoom) {
      await sendPartyAction(partyRoom.id, 'spin', { spinState: nextSpinState }, 'Spin sync error.');
    }
  };

  const handlePickPlayer = async (playerId: string) => {
    if (!activeSession || activeSession.status !== 'drafting') return;
    const turn = activeSession.draftOrder[activeSession.pickIndex];
    if (turn !== mySide) return;

    const nextPickIndex = activeSession.pickIndex + 1;
    const nextARoster =
      turn === 'A' ? [...activeSession.teamARoster, playerId] : activeSession.teamARoster;
    const nextBRoster =
      turn === 'B' ? [...activeSession.teamBRoster, playerId] : activeSession.teamBRoster;
    const done = nextPickIndex >= activeSession.draftOrder.length;

    const resetSpinState: SpinState = {
      ...activeSession.spinState,
      phase: 'ready',
      teamAbbr: '',
      year: 0,
      candidateIds: [],
    };

    if (isPracticeMode) {
      setPracticeRoom((prev) =>
        prev
          ? {
              ...prev,
              teamARoster: nextARoster,
              teamBRoster: nextBRoster,
              pickIndex: nextPickIndex,
              spinState: resetSpinState,
              status: done ? 'lineup' : 'drafting',
            }
          : null
      );
      if (done) setActiveView('lineup');
      return;
    }

    if (partyRoom) {
      await sendPartyAction(partyRoom.id, 'pick', { playerId }, 'Draft pick sync error.');
    }
  };

  const handleAutoDraftRemaining = () => {
    if (!practiceRoom || practiceRoom.status !== 'drafting') return;
    const picked = new Set([...practiceRoom.teamARoster, ...practiceRoom.teamBRoster]);
    const nextA = [...practiceRoom.teamARoster];
    const nextB = [...practiceRoom.teamBRoster];
    const namesA = new Set(nextA.map((id) => playersMap[id]?.name).filter(Boolean));
    const namesB = new Set(nextB.map((id) => playersMap[id]?.name).filter(Boolean));
    let idx = practiceRoom.pickIndex;

    if (practiceRoom.draftMode === 'spin') {
      while (idx < practiceRoom.draftOrder.length) {
        const turn = practiceRoom.draftOrder[idx];
        const teamRoster = turn === 'A' ? nextA : nextB;
        const teamNames = turn === 'A' ? namesA : namesB;

        const useCurrentSpun =
          idx === practiceRoom.pickIndex &&
          practiceRoom.spinState.phase === 'spun' &&
          practiceRoom.spinState.candidateIds.length > 0;

        const recentTeams = getRecentTeamAbbrs(nextA, nextB, playersMap);
        const candidates = useCurrentSpun
          ? practiceRoom.spinState.candidateIds.filter((id) => !picked.has(id))
          : (spinTeamAndYear(
              allPlayers,
              practiceRoom.includeHistoric,
              practiceRoom.selectedYears,
              picked,
              teamNames,
              Math.random,
              undefined,
              recentTeams
            )?.candidateIds ?? []);

        const chosen = pickBestCandidateForCpu(candidates, playersMap, teamRoster);
        if (!chosen) break;
        picked.add(chosen.id);
        teamNames.add(chosen.name);
        teamRoster.push(chosen.id);
        idx += 1;
      }
    } else {
      const avail = practiceRoom.poolIds
        .map((id) => playersMap[id])
        .filter((p): p is PlayerCard => Boolean(p) && !picked.has(p.id))
        .sort((a, b) => b.ovr - a.ovr);

      while (idx < practiceRoom.draftOrder.length) {
        const turn = practiceRoom.draftOrder[idx];
        const teamNames = turn === 'A' ? namesA : namesB;
        const chosenIdx = avail.findIndex(
          (c) => !picked.has(c.id) && !teamNames.has(c.name)
        );
        if (chosenIdx === -1) break;
        const chosen = avail[chosenIdx];
        picked.add(chosen.id);
        teamNames.add(chosen.name);
        if (turn === 'A') nextA.push(chosen.id);
        else nextB.push(chosen.id);
        idx += 1;
      }
    }

    setPracticeRoom((prev) =>
      prev
        ? {
            ...prev,
            teamARoster: nextA,
            teamBRoster: nextB,
            pickIndex: idx,
            spinState: {
              ...prev.spinState,
              phase: 'ready',
              teamAbbr: '',
              year: 0,
              candidateIds: [],
            },
            status: 'lineup',
            teamBLineup: buildDefaultLineup(nextB, playersMap),
          }
        : null
    );
    setActiveView('lineup');
  };

  const handleLockLineup = async (finalLineup: TeamLineup) => {
    if (!activeSession) return;

    if (isPracticeMode) {
      const seed = Math.floor(Math.random() * 900_000_000) + 100_000;
      setPracticeRoom((prev) =>
        prev
          ? {
              ...prev,
              teamALineup: finalLineup,
              teamBLineup:
                prev.teamBLineup.starters.length === 5
                  ? { ...prev.teamBLineup, locked: true }
                  : { ...buildDefaultLineup(prev.teamBRoster, playersMap), locked: true },
              status: 'simulating',
              simSeed: seed,
              simStartedAt: Date.now(),
            }
          : null
      );
      setActiveView('simcast');
      return;
    }

    if (partyRoom) {
      await sendPartyAction(partyRoom.id, 'lineup', { lineup: finalLineup }, 'Unable to lock lineup.');
    }
  };

  // Compute deterministic SimCast result when in simulating state
  const activeSimResult = useMemo<SimGameResult | null>(() => {
    if (!activeSession || activeSession.status !== 'simulating' || !activeSession.simSeed) {
      return null;
    }
    return simulateMatchup(
      activeSession.teamARoster,
      activeSession.teamALineup,
      activeSession.teamBRoster,
      activeSession.teamBLineup,
      playersMap,
      activeSession.simSeed
    );
  }, [activeSession, playersMap]);

  const handleSaveCompletedGame = useCallback(
    async (result: SimGameResult) => {
      if (!activeSession) return;
      const matchId = `${activeSession.id}_G${activeSession.gameNumber}_${result.seed}`;

      setLocalMatchHistory((prev) => {
        if (prev.some((m) => m.id === matchId)) return prev;
        const record: MatchRecord = {
          id: matchId,
          roomId: activeSession.id,
          participantUids: [activeSession.hostUid, activeSession.guestUid].filter(Boolean),
          hostUid: activeSession.hostUid,
          hostName: activeSession.hostName,
          guestName: activeSession.guestName || 'Challenger',
          teamAScore: result.finalScoreA,
          teamBScore: result.finalScoreB,
          winner: result.winner,
          mvpName: result.mvp.name,
          mvpLine: `${result.mvp.pts}p/${result.mvp.reb}r/${result.mvp.ast}a`,
          quarterScoresA: result.quarterScoresA,
          quarterScoresB: result.quarterScoresB,
          playerStats: result.finalBoxScores,
          createdAtMs: Date.now(),
        };
        return [record, ...prev];
      });
    },
    [activeSession]
  );

  const handleNextSeriesGame = async () => {
    if (!activeSession || !activeSimResult) return;
    const nextAWins =
      activeSession.teamAWins + (activeSimResult.winner === 'A' ? 1 : 0);
    const nextBWins =
      activeSession.teamBWins + (activeSimResult.winner === 'B' ? 1 : 0);
    const nextGame = activeSession.gameNumber + 1;

    if (isPracticeMode) {
      setPracticeRoom((prev) =>
        prev
          ? {
              ...prev,
              teamAWins: nextAWins,
              teamBWins: nextBWins,
              gameNumber: nextGame,
              status: 'lineup',
              teamALineup: { ...prev.teamALineup, locked: false },
              teamBLineup: { ...prev.teamBLineup, locked: false },
            }
          : null
      );
      setActiveView('lineup');
      return;
    }

    if (partyRoom) {
      if (partyRoom.status === 'finished') {
        clearParty();
        setActiveView('arena');
        setRoomError('Your friend left the party. Create a new code to play again.');
        return;
      }
      try {
        const { room } = await postPartyApi<{ room: RoomState }>(
          `/api/party/${encodeURIComponent(partyRoom.id)}/next-game`,
          {
            playerToken,
            expectedGameNumber: partyRoom.gameNumber,
            winner: activeSimResult.winner,
          }
        );
        applyPartyRoomUpdate(room);
      } catch (err) {
        setRoomError(err instanceof Error ? err.message : 'Unable to start next game.');
      }
    }
  };

  const handleLeaveOrFinish = async () => {
    const leaving = partyRoom;
    clearParty();
    setPracticeRoom(null);
    setRoomError(null);
    setActiveView('arena');
    if (leaving && leaving.status !== 'finished') {
      // Fire-and-forget so the friend's screen learns we left.
      postPartyApi(`/api/party/${encodeURIComponent(leaving.id)}/finish`, { playerToken }).catch(
        () => undefined
      );
    }
  };

  const handleSaveCustomPlayer = async (card: PlayerCard) => {
    setCustomPlayers((prev) => {
      const idx = prev.findIndex((p) => p.id === card.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = card;
        return copy;
      }
      return [card, ...prev];
    });
  };

  const handleToggleYear = (year: number) => {
    setSelectedYears((prev) => {
      if (prev.includes(year)) {
        return prev.length > 1 ? prev.filter((y) => y !== year) : prev;
      }
      return [...prev, year].sort((a, b) => a - b);
    });
  };

  const poolPlayersForDraft = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.poolIds
      .map((id) => playersMap[id])
      .filter((p): p is PlayerCard => Boolean(p));
  }, [activeSession, playersMap]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      <HeaderNav
        activeView={activeView}
        onNavigate={(view) => {
          if ((view === 'draft' || view === 'lineup' || view === 'simcast') && !activeSession) {
            handleStartPracticeDraft();
            return;
          }
          setActiveView(view);
        }}
        hasActiveSession={Boolean(activeSession)}
        onStartQuickPractice={handleStartPracticeDraft}
        onLeaveRoom={handleLeaveOrFinish}
      />

      {(syncTrouble || (roomError && activeView !== 'arena')) && (
        <div
          role="status"
          className="max-w-7xl mx-auto px-4 md:px-6 pt-3"
        >
          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
            <span>
              {syncTrouble
                ? 'Connection to the party is unstable — reconnecting…'
                : roomError}
            </span>
            {!syncTrouble && (
              <button
                type="button"
                onClick={() => setRoomError(null)}
                className="shrink-0 text-amber-300 hover:text-white"
                aria-label="Dismiss"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {activeView === 'arena' && (
        <ArenaLobby
          playerToken={playerToken}
          partyName={partyName}
          onChangePartyName={setPartyName}
          activeRoom={partyRoom}
          draftMode={draftMode}
          onChangeDraftMode={setDraftMode}
          includeHistoric={includeHistoric}
          onToggleHistoric={setIncludeHistoric}
          selectedYears={selectedYears}
          onToggleYear={handleToggleYear}
          onSelectAllYears={() => setSelectedYears([...AVAILABLE_2K_YEARS])}
          seriesMode={seriesMode}
          onChangeSeriesMode={setSeriesMode}
          randomizePool={randomizePool}
          onToggleRandomizePool={setRandomizePool}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartRoomDraft={handleStartRoomDraft}
          onStartPracticeDraft={handleStartPracticeDraft}
          initialJoinCode={initialRoomParam}
          roomError={roomError}
          isBusy={isBusy}
        />
      )}

      {activeView === 'draft' && activeSession && activeSession.draftMode === 'spin' && (
        <SpinDraftRoom
          allPlayers={allPlayers}
          playersMap={playersMap}
          draftOrder={activeSession.draftOrder}
          pickIndex={activeSession.pickIndex}
          spinState={activeSession.spinState}
          teamARoster={activeSession.teamARoster}
          teamBRoster={activeSession.teamBRoster}
          teamAName={activeSession.hostName}
          teamBName={activeSession.guestName || 'Challenger'}
          mySide={mySide}
          includeHistoric={activeSession.includeHistoric}
          isPracticeMode={isPracticeMode}
          onSpinReels={handleSpinReels}
          onPickPlayer={handlePickPlayer}
          onAutoDraftRemaining={isPracticeMode ? handleAutoDraftRemaining : undefined}
          onInspectPlayer={setInspectedPlayer}
        />
      )}

      {activeView === 'draft' && activeSession && activeSession.draftMode === 'open' && (
        <DraftRoom
          poolPlayers={poolPlayersForDraft}
          playersMap={playersMap}
          draftOrder={activeSession.draftOrder}
          pickIndex={activeSession.pickIndex}
          teamARoster={activeSession.teamARoster}
          teamBRoster={activeSession.teamBRoster}
          teamAName={activeSession.hostName}
          teamBName={activeSession.guestName || 'Challenger'}
          mySide={mySide}
          includeHistoric={activeSession.includeHistoric}
          isPracticeMode={isPracticeMode}
          onPickPlayer={handlePickPlayer}
          onAutoDraftRemaining={isPracticeMode ? handleAutoDraftRemaining : undefined}
          onInspectPlayer={setInspectedPlayer}
        />
      )}

      {activeView === 'lineup' && activeSession && localLineupDraft && (
        <LineupLab
          mySide={mySide}
          myTeamName={mySide === 'A' ? activeSession.hostName : activeSession.guestName}
          opponentTeamName={mySide === 'A' ? activeSession.guestName : activeSession.hostName}
          rosterIds={mySide === 'A' ? activeSession.teamARoster : activeSession.teamBRoster}
          lineup={localLineupDraft}
          opponentLocked={
            mySide === 'A'
              ? activeSession.teamBLineup.locked
              : activeSession.teamALineup.locked
          }
          playersMap={playersMap}
          onUpdateLineup={setLocalLineupDraft}
          onLockLineup={handleLockLineup}
        />
      )}

      {activeView === 'simcast' && activeSession && activeSimResult && (
        <SimCastArena
          simResult={activeSimResult}
          playersMap={playersMap}
          teamAName={activeSession.hostName}
          teamBName={activeSession.guestName || 'Challenger'}
          seriesMode={activeSession.seriesMode}
          teamAWins={activeSession.teamAWins}
          teamBWins={activeSession.teamBWins}
          gameNumber={activeSession.gameNumber}
          onGameCompleteSaved={handleSaveCompletedGame}
          onNextSeriesGame={handleNextSeriesGame}
          onFinishToLobby={handleLeaveOrFinish}
        />
      )}

      {activeView === 'vault' && (
        <PlayerVault
          players={allPlayers}
          includeHistoric={includeHistoric}
          onToggleHistoric={setIncludeHistoric}
          onInspectPlayer={setInspectedPlayer}
          onCreateCustomPlayer={handleSaveCustomPlayer}
        />
      )}

      {activeView === 'rivalry' && (
        <RivalryLedger
          matches={allMatches}
          onStartQuickMatch={handleStartPracticeDraft}
        />
      )}

      <PlayerDetailModal
        key={inspectedPlayer?.id ?? 'closed'}
        player={inspectedPlayer}
        canEdit={true}
        onClose={() => setInspectedPlayer(null)}
        onSaveCustom={handleSaveCustomPlayer}
      />
    </div>
  );
}
