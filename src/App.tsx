import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AirportEngine } from './game/AirportEngine';
import { CommandDock } from './components/CommandDock';
import { FlightStripOverlay } from './components/FlightStripOverlay';
import { RadarOverlay } from './components/RadarOverlay';
import { TopHudBar } from './components/TopHudBar';
import type {
  ATCCommand,
  AirportHudSnapshot,
  CameraPreset,
  HudToast,
  ProjectedStripPosition,
  TimeSpeed,
} from './types/atc';

const INITIAL_HUD: AirportHudSnapshot = {
  day: 1,
  clockMinutes: 8 * 60 + 45,
  score: 0,
  departures: 0,
  speed: 1,
  cameraPreset: 'APRON',
  selectedAircraftId: null,
  aircraft: [],
  runwayOccupiedBy: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AirportEngine | null>(null);
  const stripRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const toastTimerRef = useRef<number | null>(null);

  const [hud, setHud] = useState<AirportHudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [toast, setToast] = useState<HudToast | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const showToast = useCallback(
    (message: string, tone: 'neutral' | 'positive' | 'caution') => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({ id: Date.now(), message, tone });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 3400);
    },
    [],
  );

  // Direct DOM transform updates for 3D-tracked Flight Strips (zero React re-renders per frame)
  const handleStripsUpdate = useCallback((positions: ProjectedStripPosition[]) => {
    const map = stripRefs.current;
    for (const pos of positions) {
      const el = map.get(pos.id);
      if (!el) continue;
      if (!pos.visible) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      } else {
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
        el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -115%) scale(${pos.scale.toFixed(3)})`;
      }
    }
  }, []);

  // Mount Three.js AirportEngine once in dedicated isolated canvas container
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new AirportEngine(container, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onStripsUpdate: handleStripsUpdate,
      onToast: showToast,
      onContextLost: (lost) => setContextLost(lost),
    });
    engineRef.current = engine;

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, [handleStripsUpdate, showToast]);

  // Helpful desktop keyboard shortcuts (1/2/3 cameras, Space pause, H hide controls)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const engine = engineRef.current;
      if (!engine) return;

      if (e.key === '1') engine.setCameraPreset('APRON');
      else if (e.key === '2') engine.setCameraPreset('TOWER');
      else if (e.key === '3') engine.setCameraPreset('RADAR');
      else if (e.key === 'h' || e.key === 'H') setDockCollapsed((c) => !c);
      else if (e.code === 'Space') {
        e.preventDefault();
        setHud((prev) => {
          const nextSpeed: TimeSpeed = prev.speed === 0 ? 1 : 0;
          engine.setSpeed(nextSpeed);
          return prev;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedAircraft = useMemo(
    () => hud.aircraft.find((a) => a.id === hud.selectedAircraftId) ?? null,
    [hud.aircraft, hud.selectedAircraftId],
  );

  const handleSetSpeed = useCallback((speed: TimeSpeed) => {
    engineRef.current?.setSpeed(speed);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleSelectAircraft = useCallback((id: string) => {
    engineRef.current?.selectAircraft(id);
  }, []);

  const handleIssueCommand = useCallback((cmd: ATCCommand) => {
    engineRef.current?.issueCommand(cmd);
  }, []);

  const handleSelectCamera = useCallback((preset: CameraPreset) => {
    engineRef.current?.setCameraPreset(preset);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#8fa38a]">
      {/* Isolated WebGL 3D Viewport Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Tarmac and Tower 3D Airport Viewport"
      />

      {/* Tactical SVG Range Ring Overlay (visible in RADAR view) */}
      <RadarOverlay
        visible={hud.cameraPreset === 'RADAR'}
        runwayOccupiedBy={hud.runwayOccupiedBy}
      />

      {/* Floating 3D-Tracked Aircraft Flight Strip Tags */}
      <FlightStripOverlay
        aircraft={hud.aircraft}
        selectedId={hud.selectedAircraftId}
        onSelect={handleSelectAircraft}
        stripRefs={stripRefs}
      />

      {/* Top Minimal Floating Pill HUD */}
      <TopHudBar
        day={hud.day}
        clockMinutes={hud.clockMinutes}
        score={hud.score}
        speed={hud.speed}
        muted={muted}
        onSetSpeed={handleSetSpeed}
        onToggleMute={handleToggleMute}
      />

      {/* Bottom Thumb-Friendly ATC Command Bar & Camera Preset Switcher */}
      <CommandDock
        selectedAircraft={selectedAircraft}
        cameraPreset={hud.cameraPreset}
        collapsed={dockCollapsed}
        toast={toast}
        onIssueCommand={handleIssueCommand}
        onSelectCamera={handleSelectCamera}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
      />

      {/* Graceful WebGL Context-Lost Recovery Banner */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#8fa38a]/95 p-6 text-center">
          <div className="max-w-sm rounded-2xl bg-[#f4f1ea] p-6 shadow-xl ring-1 ring-[#1e242b]/12">
            <h2 className="text-base font-bold text-[#1e242b]">
              Graphics Context Paused
            </h2>
            <p className="mt-2 text-sm text-[#555e5a]">
              The 3D airfield renderer was interrupted by the browser. Reloading restores your tower view.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-[#1e242b] px-4 py-2 text-xs font-semibold text-[#f4f1ea] hover:bg-[#2c343d] cursor-pointer"
            >
              Restore Airfield
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
