import React from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
  Radar,
} from 'lucide-react';
import type {
  ATCCommand,
  AircraftSnapshot,
  CameraPreset,
  HudToast,
} from '../types/atc';

interface CommandDockProps {
  selectedAircraft: AircraftSnapshot | null;
  cameraPreset: CameraPreset;
  collapsed: boolean;
  toast: HudToast | null;
  onIssueCommand: (cmd: ATCCommand) => void;
  onSelectCamera: (preset: CameraPreset) => void;
  onToggleCollapse: () => void;
}

const COMMANDS: Array<{ id: ATCCommand; label: string }> = [
  { id: 'PUSHBACK', label: 'Pushback' },
  { id: 'TAXI', label: 'Taxi' },
  { id: 'LINE_UP', label: 'Line Up' },
  { id: 'TAKEOFF', label: 'Takeoff' },
];

const CAMERAS: Array<{
  id: CameraPreset;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'APRON', label: 'Apron', Icon: Layers },
  { id: 'TOWER', label: 'Tower', Icon: Building2 },
  { id: 'RADAR', label: 'Radar', Icon: Radar },
];

export const CommandDock: React.FC<CommandDockProps> = ({
  selectedAircraft,
  cameraPreset,
  collapsed,
  toast,
  onIssueCommand,
  onSelectCamera,
  onToggleCollapse,
}) => {
  const validCommand = selectedAircraft?.validCommand ?? null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center px-3 pb-3 sm:pb-4">
      {/* Quiet contextual clearance feedback toast (sits cleanly above dock) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-2 rounded-lg px-3.5 py-1.5 text-xs font-medium shadow-[0_6px_18px_rgba(20,25,28,0.18)] transition-opacity duration-200 ${
            toast.tone === 'positive'
              ? 'bg-[#1e242b]/94 text-[#86efac] ring-1 ring-[#4ade80]/30'
              : toast.tone === 'caution'
                ? 'bg-[#2c221d]/95 text-[#fdba74] ring-1 ring-[#f59e0b]/40'
                : 'bg-[#1e242b]/92 text-[#f4f1ea] ring-1 ring-white/10'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Collapse / Expand Cinema Mode Toggle Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Show ATC controls' : 'Hide ATC controls'}
        className="pointer-events-auto mb-1.5 flex items-center gap-1 rounded-full bg-[#f4f1ea]/92 px-3 py-1 text-[11px] font-semibold text-[#47504d] shadow-xs ring-1 ring-[#1e242b]/10 hover:bg-[#ffffff] hover:text-[#1e242b] transition-colors cursor-pointer whitespace-nowrap"
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            <span>
              {selectedAircraft
                ? `${selectedAircraft.callsign} · ${selectedAircraft.displayStatus}`
                : 'Select an aircraft'}
            </span>
          </>
        )}
      </button>

      {/* Main Tactile Bottom Dock (ATC Commands + Camera Presets) */}
      <div
        className={`pointer-events-auto w-full max-w-[820px] transition-all duration-200 ease-out ${
          collapsed
            ? 'translate-y-6 opacity-0 pointer-events-none h-0 overflow-hidden'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-2xl bg-[#f4f1ea]/96 p-2 shadow-[0_12px_34px_rgba(20,26,24,0.22)] ring-1 ring-[#1e242b]/12">
          {/* Thumb-Friendly Tactile ATC Command Buttons */}
          <div
            className="grid grid-cols-4 gap-1.5 flex-1"
            role="group"
            aria-label="Air traffic control commands"
          >
            {COMMANDS.map((cmd) => {
              const isValid = validCommand === cmd.id;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  disabled={!isValid}
                  onClick={() => onIssueCommand(cmd.id)}
                  className={`min-h-[44px] rounded-xl px-2 sm:px-4 text-xs sm:text-[13px] font-bold tracking-wide uppercase transition-all duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97748] ${
                    isValid
                      ? 'bg-[#d97748] text-white shadow-[0_4px_12px_rgba(217,119,72,0.38)] hover:bg-[#c8673a] active:scale-[0.98] cursor-pointer'
                      : 'bg-[#e3dfd4] text-[#8b908b] cursor-not-allowed'
                  }`}
                >
                  {cmd.label}
                </button>
              );
            })}
          </div>

          <div
            className="hidden sm:block h-8 w-px bg-[#1e242b]/12 shrink-0"
            aria-hidden="true"
          />

          {/* Camera Preset Switcher (APRON / TOWER / RADAR) */}
          <div
            className="grid grid-cols-3 sm:flex items-center gap-1 rounded-xl bg-[#e6e2d7] p-1 shrink-0"
            role="group"
            aria-label="Camera views"
          >
            {CAMERAS.map(({ id, label, Icon }) => {
              const active = cameraPreset === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectCamera(id)}
                  aria-pressed={active}
                  className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 text-[11px] font-bold tracking-wide uppercase transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d97748] ${
                    active
                      ? 'bg-[#1e242b] text-[#f5f2eb] shadow-xs'
                      : 'text-[#515a57] hover:text-[#1e242b] hover:bg-[#efece3]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
