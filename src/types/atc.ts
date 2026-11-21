export type GateId = 'G1' | 'G2' | 'G3';

export type AircraftStatus =
  | 'PARKED'
  | 'PUSHBACK'
  | 'READY_TAXI'
  | 'TAXIING'
  | 'HOLDING'
  | 'LINING_UP'
  | 'LINED_UP'
  | 'TAKEOFF';

export type ATCCommand = 'PUSHBACK' | 'TAXI' | 'LINE_UP' | 'TAKEOFF';

export type CameraPreset = 'APRON' | 'TOWER' | 'RADAR';

export type TimeSpeed = 0 | 1 | 2;

export interface LiveryStyle {
  id: string;
  airline: string;
  code: string;
  fuselageColor: number;
  tailColor: number;
  accentColor: number;
  bellyColor: number;
  uiAccent: string;
}

export interface AircraftSnapshot {
  id: string;
  callsign: string;
  aircraftType: string;
  destination: string;
  gateId: GateId | null;
  status: AircraftStatus;
  displayStatus: string;
  validCommand: ATCCommand | null;
  liveryAccent: string;
  waitingReason?: string;
}

export interface ProjectedStripPosition {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  scale: number;
}

export interface HudToast {
  id: number;
  message: string;
  tone: 'neutral' | 'positive' | 'caution';
}

export interface AirportHudSnapshot {
  day: number;
  clockMinutes: number; // minutes since 00:00 (starts at 8:45 AM = 525)
  score: number;
  departures: number;
  speed: TimeSpeed;
  cameraPreset: CameraPreset;
  selectedAircraftId: string | null;
  aircraft: AircraftSnapshot[];
  runwayOccupiedBy: string | null;
}
