import { useState } from 'react';
import { PlayerCard, Position } from '../types/game';
import { formatPlayerPositions } from '../data/positions';
import { PlayerAvatar } from './PlayerAvatar';
import { X, Save } from 'lucide-react';

interface PlayerDetailModalProps {
  player: PlayerCard | null;
  canEdit: boolean;
  onClose: () => void;
  onSaveCustom: (updated: PlayerCard) => void;
}

export function PlayerDetailModal({
  player,
  canEdit,
  onClose,
  onSaveCustom,
}: PlayerDetailModalProps) {
  const [draft, setDraft] = useState<PlayerCard | null>(player);

  if (!player || !draft) return null;

  const updateRating = (
    key: 'ovr' | 'inside' | 'shooting' | 'playmaking' | 'defense' | 'rebounding' | 'threePtTendency',
    value: number
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} ratings`}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="max-w-lg w-full bg-[#131A26] border border-white/15 rounded-xl p-5 md:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <PlayerAvatar player={draft} size="lg" />
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                {draft.name}
              </h2>
              <div className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span className="font-semibold text-white">{formatPlayerPositions(draft)}</span>
                <span aria-hidden="true">·</span>
                <span>{draft.editionLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{draft.teamAbbr}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close player modal"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#0B0F17] text-slate-300 hover:text-white border border-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-rating Sliders */}
        <div className="space-y-3">
          {(
            [
              { key: 'ovr', label: '2K Overall', min: 60, max: 99 },
              { key: 'inside', label: 'Inside Scoring', min: 40, max: 99 },
              { key: 'shooting', label: 'Shooting', min: 40, max: 99 },
              { key: 'playmaking', label: 'Playmaking', min: 40, max: 99 },
              { key: 'defense', label: 'Defense', min: 40, max: 99 },
              { key: 'rebounding', label: 'Rebounding', min: 40, max: 99 },
              { key: 'threePtTendency', label: '3PT Attempt Tendency', min: 0, max: 100 },
            ] as const
          ).map((item) => (
            <div key={item.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">{item.label}</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {draft[item.key]}
                </span>
              </div>
              <input
                type="range"
                aria-label={item.label}
                min={item.min}
                max={item.max}
                disabled={!canEdit}
                value={draft[item.key]}
                onChange={(e) => updateRating(item.key, Number(e.target.value))}
                className="w-full accent-orange-500"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="modal-pos" className="block text-xs text-slate-400 mb-1">
              Position
            </label>
            <select
              id="modal-pos"
              disabled={!canEdit}
              value={draft.pos}
              onChange={(e) => {
                const nextPos = e.target.value as Position;
                setDraft((p) =>
                  p
                    ? {
                        ...p,
                        pos: nextPos,
                        secondaryPositions: (p.secondaryPositions ?? []).filter(
                          (s) => s !== nextPos
                        ),
                      }
                    : null
                );
              }}
              className="w-full min-h-[40px] px-3 bg-[#0B0F17] border border-white/10 rounded-lg text-xs text-white"
            >
              {(['PG', 'SG', 'SF', 'PF', 'C'] as const).map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="modal-team" className="block text-xs text-slate-400 mb-1">
              Team Abbr
            </label>
            <input
              id="modal-team"
              type="text"
              maxLength={4}
              disabled={!canEdit}
              value={draft.teamAbbr}
              onChange={(e) =>
                setDraft((p) => (p ? { ...p, teamAbbr: e.target.value.toUpperCase() } : null))
              }
              className="w-full min-h-[40px] px-3 bg-[#0B0F17] border border-white/10 rounded-lg text-xs text-white uppercase"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-slate-400">Secondary Positions</div>
          <div className="flex flex-wrap items-center gap-2">
            {(['PG', 'SG', 'SF', 'PF', 'C'] as const)
              .filter((pos) => pos !== draft.pos)
              .map((pos) => {
                const active = Boolean(draft.secondaryPositions?.includes(pos));
                return (
                  <button
                    key={pos}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={active}
                    onClick={() =>
                      setDraft((prev) => {
                        if (!prev) return null;
                        const current = prev.secondaryPositions ?? [];
                        const next = current.includes(pos)
                          ? current.filter((p) => p !== pos)
                          : [...current, pos];
                        return { ...prev, secondaryPositions: next };
                      })
                    }
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
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
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 bg-[#0B0F17] hover:bg-[#1C2536] border border-white/10 text-xs font-semibold text-slate-300 rounded-lg"
          >
            Close
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                onSaveCustom({ ...draft, isCustom: true });
                onClose();
              }}
              className="min-h-[44px] px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Rating Override</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
