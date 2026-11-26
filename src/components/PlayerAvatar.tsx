import { useState } from 'react';
import { getNbaHeadshotUrl, TEAM_COLORS } from '../data/players';
import { PlayerCard } from '../types/game';
import { useNbaCdnAvailable } from '../utils/headshotStatus';

interface PlayerAvatarProps {
  player: PlayerCard;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-9 h-9 text-xs',
  sm: 'w-11 h-11 text-xs',
  md: 'w-14 h-14 text-sm',
  lg: 'w-20 h-20 text-base',
};

export function PlayerAvatar({ player, size = 'md' }: PlayerAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const cdnAvailable = useNbaCdnAvailable();
  const url = cdnAvailable ? getNbaHeadshotUrl(player.nbaId) : null;
  const palette = TEAM_COLORS[player.teamAbbr] ?? { bg: '#1E293B', accent: '#F97316' };

  const initials = player.name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={`relative shrink-0 rounded-lg overflow-hidden border border-white/15 flex items-end justify-center select-none ${SIZE_CLASSES[size]}`}
      style={{
        background: `linear-gradient(160deg, ${palette.bg} 0%, #0F172A 100%)`,
      }}
    >
      {url && !imgFailed ? (
        <img
          src={url}
          alt={player.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover object-top"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center relative">
          <span
            className="font-display font-bold tracking-tight text-white leading-none"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
          >
            {initials}
          </span>
          <span
            className="font-mono text-[9px] font-bold leading-none mt-0.5 opacity-90"
            style={{ color: palette.accent }}
          >
            #{player.jersey || '0'}
          </span>
        </div>
      )}
      <span
        className="absolute bottom-0 inset-x-0 h-[2px]"
        style={{ backgroundColor: palette.accent }}
        aria-hidden="true"
      />
    </div>
  );
}
