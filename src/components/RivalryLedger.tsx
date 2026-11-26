import { useMemo, useState } from 'react';
import { MatchRecord } from '../types/game';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';

interface RivalryLedgerProps {
  matches: MatchRecord[];
  onStartQuickMatch: () => void;
}

export function RivalryLedger({ matches, onStartQuickMatch }: RivalryLedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(matches[0]?.id ?? null);

  const summary = useMemo(() => {
    let winsA = 0;
    let winsB = 0;
    let totalPts = 0;
    let bestGamePts = 0;
    let bestScorer = '—';

    for (const m of matches) {
      if (m.winner === 'A') winsA += 1;
      else winsB += 1;
      totalPts += m.teamAScore + m.teamBScore;
      for (const st of m.playerStats) {
        if (st.pts > bestGamePts) {
          bestGamePts = st.pts;
          bestScorer = `${st.name} (${st.pts}p)`;
        }
      }
    }
    return {
      games: matches.length,
      winsA,
      winsB,
      avgTotal: matches.length ? Math.round(totalPts / matches.length) : 0,
      bestScorer,
    };
  }, [matches]);

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-24 md:pb-12 space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">
            Head-to-Head Rivalry Ledger
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulated series history, MVP performances, and full game box scores.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartQuickMatch}
          className="min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          New Matchup Draft
        </button>
      </section>

      {/* Summary KPI Row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Games Played', val: String(summary.games) },
          { label: 'Host vs Challenger', val: `${summary.winsA} – ${summary.winsB}` },
          { label: 'Avg Combined Score', val: String(summary.avgTotal) },
          { label: 'Scoring Record', val: summary.bestScorer },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#131A26] border border-white/10 rounded-xl p-4"
          >
            <div className="text-xs text-slate-400">{kpi.label}</div>
            <div className="font-mono text-xl md:text-2xl font-bold text-white tabular-nums mt-1 truncate">
              {kpi.val}
            </div>
          </div>
        ))}
      </section>

      {matches.length === 0 ? (
        <section className="bg-[#131A26] border border-white/10 rounded-xl p-8 text-center space-y-3">
          <Trophy className="w-8 h-8 text-orange-400 mx-auto" />
          <h2 className="font-display text-2xl font-bold text-white">
            No Completed Games Yet
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Draft a 13-man squad with your friend or test against the CPU GM to start tracking box scores and rivalry stats.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {matches.map((m) => {
            const expanded = expandedId === m.id;
            return (
              <div
                key={m.id}
                className="bg-[#131A26] border border-white/10 rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : m.id)}
                  className="w-full p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">
                      Room {m.roomId} · MVP: {m.mvpName} ({m.mvpLine})
                    </div>
                    <div className="font-display text-xl font-bold text-white">
                      {m.hostName} {m.teamAScore} – {m.teamBScore} {m.guestName}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-orange-400 font-semibold">
                      {m.winner === 'A' ? m.hostName : m.guestName} Won
                    </span>
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-white/10 p-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-[11px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Player</th>
                          <th className="py-2 px-2 font-medium">Team</th>
                          <th className="py-2 px-2 text-right font-medium">PTS</th>
                          <th className="py-2 px-2 text-right font-medium">REB</th>
                          <th className="py-2 px-2 text-right font-medium">AST</th>
                          <th className="py-2 px-2 text-right font-medium">FG</th>
                          <th className="py-2 pl-2 text-right font-medium">3PT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {m.playerStats
                          .slice()
                          .sort((a, b) => b.pts - a.pts)
                          .slice(0, 12)
                          .map((st) => (
                            <tr key={`${m.id}-${st.playerId}`}>
                              <td className="py-2 pr-3 font-medium text-white">
                                {st.name}
                              </td>
                              <td className="py-2 px-2 text-slate-400">
                                {st.team === 'A' ? m.hostName : m.guestName}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-white">
                                {st.pts}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                                {st.reb}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                                {st.ast}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                                {st.fgm}-{st.fga}
                              </td>
                              <td className="py-2 pl-2 text-right font-mono tabular-nums text-slate-300">
                                {st.tpm}-{st.tpa}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
