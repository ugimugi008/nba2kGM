import { AppView } from '../types/game';
import { Trophy, Users, Play, Database } from 'lucide-react';

interface HeaderNavProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  hasActiveSession: boolean;
  onStartQuickPractice: () => void;
  onLeaveRoom: () => void;
}

export function HeaderNav({
  activeView,
  onNavigate,
  hasActiveSession,
  onStartQuickPractice,
  onLeaveRoom,
}: HeaderNavProps) {
  const desktopLinks: { id: AppView; label: string }[] = [
    { id: 'arena', label: 'Arena' },
    { id: 'draft', label: hasActiveSession ? 'Match Room' : 'Practice' },
    { id: 'vault', label: 'Player Vault' },
    { id: 'rivalry', label: 'Rivalry' },
  ];

  const handleLinkClick = (id: AppView) => {
    if (id === 'draft' && activeView === 'lineup') {
      onNavigate('lineup');
      return;
    }
    if (id === 'draft' && activeView === 'simcast') {
      onNavigate('simcast');
      return;
    }
    onNavigate(id);
  };

  const isMatchActive =
    activeView === 'draft' || activeView === 'lineup' || activeView === 'simcast';

  return (
    <>
      {/* Desktop & Mobile Top Header (Strictly 3-zone contract) */}
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-[#0B0F17]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('arena')}
            className="font-display text-xl md:text-2xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-orange-400 transition-colors"
          >
            Hardwood GM
          </button>

          {/* Zone 2: 4 Single-line Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {desktopLinks.map((item) => {
              const active =
                item.id === 'draft' ? isMatchActive : activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleLinkClick(item.id)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? 'text-white border-orange-500'
                      : 'text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            {hasActiveSession ? (
              <button
                type="button"
                onClick={onLeaveRoom}
                className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#1A2333] hover:bg-[#233046] border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Exit Match
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartQuickPractice}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Quick Practice</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Tab Bar (kept <= 56px to stay well under 15% cap with top bar) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#0E1420]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-4 items-center"
      >
        <button
          type="button"
          onClick={() => onNavigate('arena')}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] ${
            activeView === 'arena' ? 'text-orange-400' : 'text-slate-400'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Arena</span>
        </button>
        <button
          type="button"
          onClick={() => handleLinkClick('draft')}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] ${
            isMatchActive ? 'text-orange-400' : 'text-slate-400'
          }`}
        >
          <Play className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Match</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('vault')}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] ${
            activeView === 'vault' ? 'text-orange-400' : 'text-slate-400'
          }`}
        >
          <Database className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Vault</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('rivalry')}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] ${
            activeView === 'rivalry' ? 'text-orange-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Rivalry</span>
        </button>
      </nav>
    </>
  );
}
