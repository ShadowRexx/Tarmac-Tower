import React from 'react';
import { Plane } from 'lucide-react';
import type { AircraftSnapshot } from '../types/atc';

interface FlightStripOverlayProps {
  aircraft: AircraftSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  stripRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export const FlightStripOverlay: React.FC<FlightStripOverlayProps> = ({
  aircraft,
  selectedId,
  onSelect,
  stripRefs,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {aircraft.map((ac) => {
        const isSelected = ac.id === selectedId;
        const needsAction = ac.validCommand !== null;

        return (
          <button
            key={ac.id}
            type="button"
            ref={(el) => {
              if (el) stripRefs.current.set(ac.id, el);
              else stripRefs.current.delete(ac.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(ac.id);
            }}
            style={{
              transform: 'translate3d(-9999px, -9999px, 0)',
              willChange: 'transform',
            }}
            aria-label={`Select flight ${ac.callsign}, status ${ac.displayStatus}`}
            className={`pointer-events-auto absolute top-0 left-0 cursor-pointer rounded-md px-2.5 py-1.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97748] ${
              isSelected
                ? 'z-30 bg-[#1e242b]/95 text-[#f7f5ef] shadow-[0_8px_22px_rgba(18,22,26,0.34)] ring-1 ring-[#d97748]/80'
                : 'z-20 bg-[#f7f5ef]/94 text-[#1e242b] shadow-[0_4px_14px_rgba(24,30,34,0.18)] ring-1 ring-[#1e242b]/12 hover:bg-[#ffffff]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: ac.liveryAccent }}
                  aria-hidden="true"
                />
                <span className="font-mono-tabular text-[12px] font-bold tracking-tight">
                  {ac.callsign}
                </span>
              </div>
              <span
                className={`font-mono-tabular text-[10px] font-semibold tracking-wide ${
                  isSelected
                    ? needsAction
                      ? 'text-[#f29563]'
                      : 'text-[#86efac]'
                    : needsAction
                      ? 'text-[#b8562b]'
                      : 'text-[#55606b]'
                }`}
              >
                {ac.displayStatus}
              </span>
            </div>

            <div
              className={`mt-0.5 flex items-center justify-between gap-3 text-[10px] whitespace-nowrap ${
                isSelected ? 'text-[#c9c6be]' : 'text-[#646b68]'
              }`}
            >
              <span className="font-mono-tabular">
                {ac.gateId ? `${ac.gateId} · ` : ''}
                {ac.aircraftType} → {ac.destination}
              </span>
              <Plane
                className={`h-2.5 w-2.5 shrink-0 ${
                  ac.status === 'TAKEOFF' ? '-rotate-45' : 'rotate-45'
                } ${isSelected ? 'text-[#f29563]' : 'text-[#7b8480]'}`}
                aria-hidden="true"
              />
            </div>

            {/* Crisp miniature pointer stem anchoring the strip directly to the aircraft */}
            <span
              className={`absolute left-1/2 -bottom-1.5 h-1.5 w-1.5 -translate-x-1/2 rotate-45 ${
                isSelected ? 'bg-[#1e242b]/95' : 'bg-[#f7f5ef]/94'
              }`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
};
