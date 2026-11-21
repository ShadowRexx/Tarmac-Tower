import React from 'react';

interface RadarOverlayProps {
  visible: boolean;
  runwayOccupiedBy: string | null;
}

export const RadarOverlay: React.FC<RadarOverlayProps> = ({
  visible,
  runwayOccupiedBy,
}) => {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 overflow-hidden transition-opacity duration-300"
      aria-hidden="true"
    >
      {/* Subtle dark tactical vignette rim that frames the top-down orthographic airfield */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(20, 32, 26, 0) 42%, rgba(20, 30, 26, 0.42) 100%)',
        }}
      />

      {/* Concentric SVG Range Rings & Compass Rose */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <g stroke="rgba(244, 241, 234, 0.28)" fill="none">
          {/* Concentric range rings */}
          <circle cx="500" cy="500" r="140" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="500" cy="500" r="275" strokeWidth="1.2" />
          <circle cx="500" cy="500" r="410" strokeWidth="1" strokeDasharray="6 8" />

          {/* Crosshair axes */}
          <line x1="500" y1="75" x2="500" y2="925" strokeWidth="0.9" strokeDasharray="3 9" />
          <line x1="75" y1="500" x2="925" y2="500" strokeWidth="0.9" strokeDasharray="3 9" />

          {/* 30-degree bearing ticks around outer ring */}
          {Array.from({ length: 12 }).map((_, idx) => {
            const deg = idx * 30;
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 500 + Math.cos(rad) * 398;
            const y1 = 500 + Math.sin(rad) * 398;
            const x2 = 500 + Math.cos(rad) * 412;
            const y2 = 500 + Math.sin(rad) * 412;
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.4" />;
          })}
        </g>

        {/* Rotating radar sweep arm */}
        <g style={{ transformOrigin: '500px 500px' }} className="animate-radar-sweep">
          <defs>
            <linearGradient id="radarSweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(74, 222, 128, 0.0)" />
              <stop offset="100%" stopColor="rgba(74, 222, 128, 0.24)" />
            </linearGradient>
          </defs>
          <path
            d="M 500 500 L 500 90 A 410 410 0 0 1 650 118 Z"
            fill="url(#radarSweepGrad)"
          />
          <line
            x1="500"
            y1="500"
            x2="500"
            y2="90"
            stroke="rgba(134, 239, 172, 0.55)"
            strokeWidth="1.5"
          />
        </g>

        {/* Cardinal Labels */}
        <g
          fill="rgba(244, 241, 234, 0.72)"
          fontSize="11"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="600"
          textAnchor="middle"
        >
          <text x="500" y="70">N · 360</text>
          <text x="500" y="942">S · 180</text>
          <text x="938" y="504">E · 090</text>
          <text x="62" y="504">W · 270</text>
          <text x="645" y="494" fontSize="10" fill="rgba(244, 241, 234, 0.55)">0.5 NM</text>
          <text x="780" y="494" fontSize="10" fill="rgba(244, 241, 234, 0.55)">1.0 NM</text>
        </g>
      </svg>

      {/* Quiet Runway Tactical Legend in lower-left corner above bottom dock */}
      <div className="absolute bottom-24 left-4 hidden sm:flex items-center gap-3 rounded-lg bg-[#1e242b]/85 px-3 py-1.5 text-[11px] font-mono-tabular text-[#f4f1ea] border border-white/10">
        <span>RWY 28L / 10R</span>
        <span className="text-white/30" aria-hidden="true">|</span>
        <span className={runwayOccupiedBy ? 'text-[#f59e0b]' : 'text-[#86efac]'}>
          {runwayOccupiedBy ? `ACTIVE: ${runwayOccupiedBy}` : 'RUNWAY CLEAR'}
        </span>
      </div>
    </div>
  );
};
