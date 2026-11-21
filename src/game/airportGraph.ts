import * as THREE from 'three';
import type { GateId, LiveryStyle } from '../types/atc';

export interface GateSpec {
  id: GateId;
  x: number;
  z: number;
  /** Heading in radians (0 = +X, PI/2 = -Z toward terminal) */
  parkedYaw: number;
  /** Jetbridge root attachment at terminal facade */
  bridgeStart: [number, number];
  /** Jetbridge docked nose-left door target */
  bridgeEnd: [number, number];
}

export const AIRPORT_LAYOUT = {
  // Ground plane dimensions
  terrainSize: 360,

  // Runway 28L (runs East-West along X; departures roll from -X toward +X)
  runwayZ: 18,
  runwayWidth: 11.5,
  runwayLength: 136,
  runwayStartX: -68,
  runwayEndX: 68,
  runwayLineupX: -48,
  runwayRotateX: 16,
  runwayLiftoffX: 30,

  // Parallel Taxiway Alpha
  taxiwayZ: 3.5,
  taxiwayWidth: 4.8,
  taxiwayWestX: -46,
  taxiwayEastX: 46,

  // Connectors between Taxiway A and Runway 28L
  entryConnectorX: -46, // A1 (departure entry)
  midConnectorX: 2, // A2 (mid-field crossing / rapid exit)
  eastConnectorX: 46, // A3 (end exit)

  // Holding point short of runway on connector A1
  holdShortX: -46,
  holdShortZ: 9.6,

  // Apron slab
  apronCenterX: 0,
  apronCenterZ: -5.5,
  apronWidth: 74,
  apronDepth: 22,

  // Terminal building
  terminalZ: -20.5,

  // Control tower
  towerX: -35,
  towerZ: -13.5,
} as const;

export const GATES: Record<GateId, GateSpec> = {
  G1: {
    id: 'G1',
    x: -17,
    z: -9.8,
    parkedYaw: Math.PI / 2, // nose facing -Z (terminal)
    bridgeStart: [-19.4, -15.6],
    bridgeEnd: [-18.3, -11.4],
  },
  G2: {
    id: 'G2',
    x: 0,
    z: -9.8,
    parkedYaw: Math.PI / 2,
    bridgeStart: [-2.4, -15.6],
    bridgeEnd: [-1.3, -11.4],
  },
  G3: {
    id: 'G3',
    x: 17,
    z: -9.8,
    parkedYaw: Math.PI / 2,
    bridgeStart: [14.6, -15.6],
    bridgeEnd: [15.7, -11.4],
  },
};

export const GATE_IDS: GateId[] = ['G1', 'G2', 'G3'];

export const LIVERIES: LiveryStyle[] = [
  {
    id: 'meridian',
    airline: 'Meridian Air',
    code: 'AA',
    fuselageColor: 0xf7f6f2,
    tailColor: 0x203a62,
    accentColor: 0xc94a38,
    bellyColor: 0xd8dce0,
    uiAccent: '#254270',
  },
  {
    id: 'solstice',
    airline: 'Solstice Lines',
    code: 'DL',
    fuselageColor: 0xf8f4ee,
    tailColor: 0xb85735,
    accentColor: 0xd98a4a,
    bellyColor: 0xd7cdc2,
    uiAccent: '#b85735',
  },
  {
    id: 'nordic',
    airline: 'Nordic Sky',
    code: 'UA',
    fuselageColor: 0xf6f7f9,
    tailColor: 0x3b6388,
    accentColor: 0x5c8db8,
    bellyColor: 0xd6dde4,
    uiAccent: '#3b6388',
  },
  {
    id: 'terracotta-full',
    airline: 'Canyon Express',
    code: 'SW',
    fuselageColor: 0xc2613b,
    tailColor: 0x2a3746,
    accentColor: 0xf2e8dc,
    bellyColor: 0xa44f2e,
    uiAccent: '#c2613b',
  },
  {
    id: 'alpine',
    airline: 'Alpine Wings',
    code: 'LH',
    fuselageColor: 0xf8f7f3,
    tailColor: 0x273545,
    accentColor: 0xd99b38,
    bellyColor: 0xd9dde0,
    uiAccent: '#273545',
  },
];

export const DESTINATIONS = ['SFO', 'JFK', 'LHR', 'HND', 'ORD', 'CDG', 'ZRH', 'YVR', 'SEA', 'AMS'];
export const AIRCRAFT_TYPES = ['A320', 'B738', 'A220', 'A321', 'E195'];

/**
 * Samples a smooth curve through control points into evenly spaced Vector3 waypoints.
 */
export function sampleSmoothPath(
  controlPoints: Array<[number, number]>,
  samplesPerSegment = 14,
  y = 0,
): THREE.Vector3[] {
  if (controlPoints.length < 2) {
    return controlPoints.map(([x, z]) => new THREE.Vector3(x, y, z));
  }
  const vecs = controlPoints.map(([x, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(vecs, false, 'centripetal', 0.45);
  const totalSamples = Math.max(12, (controlPoints.length - 1) * samplesPerSegment);
  return curve.getSpacedPoints(totalSamples);
}

/**
 * Pushback curve: moves backward from the parked gate position onto Taxiway Alpha
 * while smoothly pivoting the nose toward -X (so the plane ends up nose-west on the taxiway).
 */
export function buildPushbackPath(gateId: GateId): THREE.Vector3[] {
  const gate = GATES[gateId];
  const tz = AIRPORT_LAYOUT.taxiwayZ;
  // Back out straight first, then swing tail toward +X so nose faces -X on Taxiway A
  return sampleSmoothPath(
    [
      [gate.x, gate.z],
      [gate.x, gate.z + 4.4],
      [gate.x + 2.2, gate.z + 9.2],
      [gate.x + 6.8, tz - 1.2],
      [gate.x + 11.2, tz],
    ],
    14,
    0,
  );
}

/**
 * Taxi curve from any point on Taxiway Alpha down to Holding Point A1 short of Runway 28L.
 */
export function buildTaxiToHoldPath(startX: number, startZ: number): THREE.Vector3[] {
  const tz = AIRPORT_LAYOUT.taxiwayZ;
  const ex = AIRPORT_LAYOUT.entryConnectorX;
  const hz = AIRPORT_LAYOUT.holdShortZ;

  const pts: Array<[number, number]> = [[startX, startZ]];

  // Ensure smooth entry onto taxiway centerline if slightly off
  if (Math.abs(startZ - tz) > 0.4) {
    pts.push([startX - 5, tz]);
  }

  // Straight segment along Taxiway A toward west connector A1
  if (startX > ex + 14) {
    const midX = (startX + (ex + 8)) * 0.5;
    pts.push([midX, tz]);
  }
  if (startX > ex + 9) {
    pts.push([ex + 8.5, tz]);
  }

  // Smooth 90-degree left turn onto connector A1 toward Runway 28L
  pts.push([ex + 3.2, tz + 0.9]);
  pts.push([ex + 0.6, tz + 3.1]);
  pts.push([ex, tz + 5.0]);
  pts.push([ex, hz]);

  return sampleSmoothPath(pts, 12, 0);
}

/**
 * Line Up curve from Holding Point A1 onto Runway 28L centerline facing +X.
 */
export function buildLineUpPath(startX: number, startZ: number): THREE.Vector3[] {
  const ex = AIRPORT_LAYOUT.entryConnectorX;
  const rz = AIRPORT_LAYOUT.runwayZ;
  return sampleSmoothPath(
    [
      [startX, startZ],
      [ex, rz - 4.8],
      [ex + 1.0, rz - 1.6],
      [ex + 3.8, rz - 0.3],
      [ex + 8.5, rz],
    ],
    12,
    0,
  );
}

/**
 * Takeoff rollout & climb reference waypoints along Runway 28L (+X).
 */
export function buildTakeoffPreviewPath(startX: number): THREE.Vector3[] {
  const rz = AIRPORT_LAYOUT.runwayZ;
  return [
    new THREE.Vector3(startX, 0, rz),
    new THREE.Vector3(0, 0, rz),
    new THREE.Vector3(36, 0, rz),
    new THREE.Vector3(64, 0, rz),
  ];
}
