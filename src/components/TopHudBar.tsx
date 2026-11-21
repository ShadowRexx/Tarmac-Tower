import React from 'react';
import { Pause, Play, FastForward, Volume2, VolumeX } from 'lucide-react';
import type { TimeSpeed } from '../types/atc';

interface TopHudBarProps {
  day: number;
  clockMinutes: number;
  score: number;
  speed: TimeSpeed;
  muted: boolean;
  onSetSpeed: (speed: TimeSpeed) => void;
  onToggleMute: () => void;
}

function formatGameClock(totalMinutes: number): string {
  const minsInDay = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(minsInDay / 60);
  const m = minsInDay % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

export const TopHudBar: React.FC<TopHudBarProps> = ({
  day,
  clockMinutes,
  score,
  speed,
  muted,
  onSetSpeed,
  onToggleMute,
}) => {
  const formattedClock = formatGameClock(clockMinutes);

  return (
    <header className="pointer-events-none fixed top-3 inset-x-0 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-4 rounded-full bg-[#f5f2eb]/94 px-3.5 sm:px-4 py-1.5 text-[#1e242b] shadow-[0_6px_22px_rgba(24,30,28,0.16)] ring-1 ring-[#1e242b]/10">
        {/* Minimal Title + Day & Game Clock */}
        <div className="flex items-center gap-2 text-xs font-semibold whitespace-nowrap shrink-0">
          <span className="hidden md:inline tracking-tight text-[#1e242b]">
            Tarmac &amp; Tower
          </span>
          <span className="hidden md:inline text-[#1e242b]/25" aria-hidden="true">
            ·
          </span>
          <span className="font-mono-tabular text-[#535c59]">Day {day}</span>
          <span className="text-[#1e242b]/25" aria-hidden="true">
            ·
          </span>
          <span className="font-mono-tabular font-semibold text-[#1e242b]">
            {formattedClock}
          </span>
        </div>

        <span className="h-4 w-px bg-[#1e242b]/14 shrink-0" aria-hidden="true" />

        {/* Score */}
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0">
          <span className="text-[#646d68] font-medium">Score</span>
          <span className="font-mono-tabular font-bold text-[#1e242b]">
            {score.toLocaleString()}
          </span>
        </div>

        <span className="h-4 w-px bg-[#1e242b]/14 shrink-0" aria-hidden="true" />

        {/* Time Speed Controls (Pause, 1x, 2x) */}
        <div
          className="flex items-center gap-0.5 rounded-full bg-[#e6e2d7] p-0.5 shrink-0"
          role="group"
          aria-label="Simulation speed"
        >
          <button
            type="button"
            onClick={() => onSetSpeed(0)}
            aria-label="Pause simulation"
            aria-pressed={speed === 0}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#d97748] ${
              speed === 0
                ? 'bg-[#1e242b] text-[#f5f2eb] shadow-xs'
                : 'text-[#4e5754] hover:text-[#1e242b]'
            }`}
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSetSpeed(1)}
            aria-label="Normal 1x speed"
            aria-pressed={speed === 1}
            className={`flex h-7 items-center gap-0.5 rounded-full px-2 font-mono-tabular text-[11px] font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d97748] ${
              speed === 1
                ? 'bg-[#1e242b] text-[#f5f2eb] shadow-xs'
                : 'text-[#4e5754] hover:text-[#1e242b]'
            }`}
          >
            <Play className="h-3 w-3" />
            <span>1x</span>
          </button>
          <button
            type="button"
            onClick={() => onSetSpeed(2)}
            aria-label="Fast 2x speed"
            aria-pressed={speed === 2}
            className={`flex h-7 items-center gap-0.5 rounded-full px-2 font-mono-tabular text-[11px] font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d97748] ${
              speed === 2
                ? 'bg-[#1e242b] text-[#f5f2eb] shadow-xs'
                : 'text-[#4e5754] hover:text-[#1e242b]'
            }`}
          >
            <FastForward className="h-3 w-3" />
            <span>2x</span>
          </button>
        </div>

        {/* Audio Mute Toggle */}
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          title={muted ? 'Unmute audio' : 'Mute audio'}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#4e5754] hover:bg-[#e6e2d7] hover:text-[#1e242b] transition-colors duration-150 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#d97748]"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </header>
  );
};
