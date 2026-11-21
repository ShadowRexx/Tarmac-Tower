import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AIRCRAFT_TYPES,
  AIRPORT_LAYOUT,
  DESTINATIONS,
  GATES,
  GATE_IDS,
  LIVERIES,
  buildLineUpPath,
  buildPushbackPath,
  buildTakeoffPreviewPath,
  buildTaxiToHoldPath,
} from './airportGraph';
import { buildAircraftModel, type AircraftRig } from './aircraftBuilder';
import { buildAirportScene, type AirportSceneArtifacts } from './airportSceneBuilder';
import { SoundEngine } from './soundEngine';
import { createContactShadowTexture } from './textures';
import type {
  ATCCommand,
  AircraftSnapshot,
  AircraftStatus,
  AirportHudSnapshot,
  CameraPreset,
  GateId,
  LiveryStyle,
  ProjectedStripPosition,
  TimeSpeed,
} from '../types/atc';

interface AircraftEntity {
  id: string;
  callsign: string;
  aircraftType: string;
  destination: string;
  gateId: GateId | null;
  livery: LiveryStyle;
  status: AircraftStatus;
  waitingReason?: string;
  rig: AircraftRig;

  // Spatial state
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  altitude: number;

  // Path following
  path: THREE.Vector3[];
  pathIndex: number;
  reverseMode: boolean;

  // Takeoff state
  liftoffScored: boolean;
  takeoffElapsed: number;

  // Visual helpers
  activeRouteLine: THREE.Mesh | null;
}

interface EngineCallbacks {
  onHudUpdate: (snapshot: AirportHudSnapshot) => void;
  onStripsUpdate: (positions: ProjectedStripPosition[]) => void;
  onToast: (message: string, tone: 'neutral' | 'positive' | 'caution') => void;
  onContextLost: (lost: boolean) => void;
}

// Module-level reusable math helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function createFlowTexture(hexColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 32);

  // Soft glowing core strip + directional chevron dashes
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.28, hexColor);
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(0.72, hexColor);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 32);

  // Subtle flowing segment gaps
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x + 6, 0);
    ctx.lineTo(x + 42, 0);
    ctx.lineTo(x + 52, 16);
    ctx.lineTo(x + 42, 32);
    ctx.lineTo(x + 6, 32);
    ctx.lineTo(x + 16, 16);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildRibbonMesh(
  points: THREE.Vector3[],
  width: number,
  material: THREE.MeshBasicMaterial,
  yOffset = 0.14,
): THREE.Mesh | null {
  if (points.length < 2) return null;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let accumDist = 0;
  const halfW = width * 0.5;

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    if (i > 0) accumDist += curr.distanceTo(points[i - 1]);

    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    // Perpendicular vector in XZ plane
    const px = -tz / len;
    const pz = tx / len;

    positions.push(curr.x + px * halfW, yOffset, curr.z + pz * halfW);
    positions.push(curr.x - px * halfW, yOffset, curr.z - pz * halfW);

    const u = accumDist * 0.16;
    uvs.push(u, 0, u, 1);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  return mesh;
}

export class AirportEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private perspCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.Camera;
  private controls: OrbitControls;

  private airportArtifacts: AirportSceneArtifacts;
  private contactShadowTex: THREE.CanvasTexture;
  private activePathTex: THREE.CanvasTexture;
  private previewPathTex: THREE.CanvasTexture;
  private activePathMat: THREE.MeshBasicMaterial;
  private previewPathMat: THREE.MeshBasicMaterial;
  private previewRouteMesh: THREE.Mesh | null = null;
  private previewRouteSignature = '';

  private sound = new SoundEngine();

  // Simulation state
  private aircraft = new Map<string, AircraftEntity>();
  private flightCounter = 1;
  private gateRespawnTimers: Record<GateId, number> = { G1: 0, G2: 0, G3: 0 };
  private selectedAircraftId: string | null = null;
  private cameraPreset: CameraPreset = 'APRON';
  private speed: TimeSpeed = 1;
  private day = 1;
  private clockMinutes = 8 * 60 + 45; // 08:45 AM
  private score = 0;
  private departures = 0;
  private simTime = 0;

  // Camera transition damping
  private cameraTransitionActive = false;
  private targetCamPos = new THREE.Vector3(-25, 35, 45);
  private targetLookAt = new THREE.Vector3(1, 0, 2);
  private orthoFrustumSize = 116;

  // Raycasting & Pointer tracking
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private isPointerDown = false;
  private lastHoverCheck = 0;

  // Loop & lifecycle
  private frameId = 0;
  private lastTimestamp = 0;
  private disposed = false;
  private hudDirty = true;
  private lastHudClockMinute = -1;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;

    // 1. Renderer setup (Three.js r160+ PBR pipeline + software WebGL guard)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Atmosphere & Studio Environment Reflection (RoomEnvironment)
    this.scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0x96a991);
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.FogExp2(0x96a991, 0.0048);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // 3. Cameras (Perspective for APRON/TOWER, Orthographic for RADAR)
    this.perspCamera = new THREE.PerspectiveCamera(36, aspect, 0.5, 450);
    this.perspCamera.position.set(-25, 35, 45);

    this.orthoCamera = new THREE.OrthographicCamera(
      (-this.orthoFrustumSize * aspect) / 2,
      (this.orthoFrustumSize * aspect) / 2,
      this.orthoFrustumSize / 2,
      -this.orthoFrustumSize / 2,
      1,
      300,
    );
    this.orthoCamera.position.set(0, 95, 0.01);
    this.orthoCamera.lookAt(0, 0, 2);
    this.activeCamera = this.perspCamera;

    // 4. OrbitControls (smooth touch + mouse, constrained above ground)
    this.controls = new OrbitControls(this.perspCamera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.screenSpacePanning = false;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 128;
    this.controls.target.set(1, 0, 2);
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
    });

    // 5. Morning Sunlight & Architectural Studio 3-Point Rig
    const hemiLight = new THREE.HemisphereLight(0xe4eff7, 0x73846d, 0.95);
    hemiLight.position.set(0, 80, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
    sunLight.position.set(-54, 58, -26);
    sunLight.castShadow = !this.isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const shadowBound = 68;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 190;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.03;
    sunLight.shadow.radius = 2.8;
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xdce8f4, 0.48);
    fillLight.position.set(48, 30, 44);
    this.scene.add(fillLight);

    // 6. Build Architectural Airport Scene
    const maxAnisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 16);
    this.airportArtifacts = buildAirportScene(maxAnisotropy, this.isSoftwareGl);
    this.scene.add(this.airportArtifacts.root);

    // 7. Shared Dynamic Path Materials & Contact Shadow Texture
    this.contactShadowTex = createContactShadowTexture();
    this.activePathTex = createFlowTexture('#4ade80');
    this.previewPathTex = createFlowTexture('#f59e0b');

    this.activePathMat = new THREE.MeshBasicMaterial({
      map: this.activePathTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.previewPathMat = new THREE.MeshBasicMaterial({
      map: this.previewPathTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 8. Spawn Initial Sprint 1 Fleet
    this.spawnInitialFleet();

    // 9. Bind Events & Resize Observer
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.activeCamera);
    }

    // Emit initial HUD snapshot and start animation loop
    this.emitHudSnapshot();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  private spawnInitialFleet(): void {
    // 3 parked airliners at G1, G2, G3 matching the architectural reference diorama
    const g1 = this.createGateAircraft('G1', 'AA-142', 'A320', 'SFO', LIVERIES[0]);
    this.createGateAircraft('G2', 'DL-408', 'B738', 'JFK', LIVERIES[1]);
    this.createGateAircraft('G3', 'UA-815', 'A321', 'LHR', LIVERIES[2]);

    // 4th airliner actively taxiing along Taxiway Alpha toward Holding Point A1
    const taxiPlane = this.createTaxiingAircraft('SW-209', 'A220', 'SEA', LIVERIES[3], -22, AIRPORT_LAYOUT.taxiwayZ);
    taxiPlane.path = buildTaxiToHoldPath(-22, AIRPORT_LAYOUT.taxiwayZ);
    taxiPlane.pathIndex = 0;
    taxiPlane.status = 'TAXIING';
    this.rebuildActiveRouteRibbon(taxiPlane);

    // Pre-select G1 (AA-142) so player immediately sees the command workflow
    this.selectAircraft(g1.id, true);
  }

  private createGateAircraft(
    gateId: GateId,
    callsign: string,
    aircraftType: string,
    destination: string,
    livery: LiveryStyle,
  ): AircraftEntity {
    const gate = GATES[gateId];
    const id = `ac-${this.flightCounter++}`;
    const rig = buildAircraftModel(id, livery, this.contactShadowTex);

    const entity: AircraftEntity = {
      id,
      callsign,
      aircraftType,
      destination,
      gateId,
      livery,
      status: 'PARKED',
      rig,
      position: new THREE.Vector3(gate.x, 0, gate.z),
      yaw: gate.parkedYaw,
      pitch: 0,
      roll: 0,
      speed: 0,
      altitude: 0,
      path: [],
      pathIndex: 0,
      reverseMode: false,
      liftoffScored: false,
      takeoffElapsed: 0,
      activeRouteLine: null,
    };

    this.syncAircraftTransform(entity);
    this.scene.add(rig.root);
    this.aircraft.set(id, entity);

    // Dock jetbridge cleanly
    const jb = this.airportArtifacts.jetbridges[gateId];
    jb.targetExtension = 1;
    jb.extension = 1;
    jb.tunnelGroup.position.z = jb.dockedZ;

    this.hudDirty = true;
    return entity;
  }

  private createTaxiingAircraft(
    callsign: string,
    aircraftType: string,
    destination: string,
    livery: LiveryStyle,
    startX: number,
    startZ: number,
  ): AircraftEntity {
    const id = `ac-${this.flightCounter++}`;
    const rig = buildAircraftModel(id, livery, this.contactShadowTex);

    const entity: AircraftEntity = {
      id,
      callsign,
      aircraftType,
      destination,
      gateId: null,
      livery,
      status: 'TAXIING',
      rig,
      position: new THREE.Vector3(startX, 0, startZ),
      yaw: Math.PI, // nose facing -X down Taxiway Alpha
      pitch: 0,
      roll: 0,
      speed: 4.5,
      altitude: 0,
      path: [],
      pathIndex: 0,
      reverseMode: false,
      liftoffScored: false,
      takeoffElapsed: 0,
      activeRouteLine: null,
    };

    this.syncAircraftTransform(entity);
    this.scene.add(rig.root);
    this.aircraft.set(id, entity);
    this.hudDirty = true;
    return entity;
  }

  private spawnReplacementAtGate(gateId: GateId): void {
    const livery = LIVERIES[this.flightCounter % LIVERIES.length];
    const num = 100 + ((this.flightCounter * 73) % 880);
    const callsign = `${livery.code}-${num}`;
    const aircraftType = AIRCRAFT_TYPES[this.flightCounter % AIRCRAFT_TYPES.length];
    const destination = DESTINATIONS[this.flightCounter % DESTINATIONS.length];

    const entity = this.createGateAircraft(gateId, callsign, aircraftType, destination, livery);
    // Smoothly extend jetbridge from retracted to docked
    const jb = this.airportArtifacts.jetbridges[gateId];
    jb.extension = 0;
    jb.tunnelGroup.position.z = jb.retractedZ;
    jb.targetExtension = 1;

    this.callbacks.onToast(`${entity.callsign} ready at Gate ${gateId} (${destination})`, 'neutral');
    this.hudDirty = true;
  }

  // =========================================================================
  // PUBLIC CONTROLS FOR REACT HUD
  // =========================================================================

  public setSpeed(speed: TimeSpeed): void {
    this.speed = speed;
    this.sound.playSelect();
    this.hudDirty = true;
    this.emitHudSnapshot();
  }

  public setMuted(muted: boolean): void {
    this.sound.setMuted(muted);
  }

  public setCameraPreset(preset: CameraPreset): void {
    if (this.cameraPreset === preset && !this.cameraTransitionActive) return;
    const prevPreset = this.cameraPreset;
    this.cameraPreset = preset;
    this.sound.playSelect();

    if (preset === 'RADAR') {
      // Switch to Orthographic top-down tactical camera
      this.orthoCamera.position.set(0, 95, 0.01);
      this.orthoCamera.zoom = 1;
      this.orthoCamera.updateProjectionMatrix();
      this.activeCamera = this.orthoCamera;
      this.controls.object = this.orthoCamera;
      this.controls.target.set(0, 0, 2);
      this.controls.enableRotate = false;
      this.controls.minZoom = 0.65;
      this.controls.maxZoom = 2.6;
      this.controls.update();
      this.cameraTransitionActive = false;
    } else {
      // Restore Perspective camera if coming from RADAR
      if (prevPreset === 'RADAR') {
        this.perspCamera.position.set(0, 72, 24);
        this.activeCamera = this.perspCamera;
        this.controls.object = this.perspCamera;
        this.controls.enableRotate = true;
      }

      if (preset === 'APRON') {
        this.targetCamPos.set(-25, 35, 45);
        this.targetLookAt.set(1, 0, 2);
      } else if (preset === 'TOWER') {
        // Elevated view looking out from the Control Tower observation deck across apron & runway
        this.targetCamPos.set(
          AIRPORT_LAYOUT.towerX + 4.4,
          14.0,
          AIRPORT_LAYOUT.towerZ + 3.2,
        );
        this.targetLookAt.set(8, 1.2, 12.5);
      }
      this.cameraTransitionActive = true;
    }

    this.hudDirty = true;
    this.emitHudSnapshot();
  }

  public selectAircraft(aircraftId: string | null, silent = false): void {
    if (aircraftId && !this.aircraft.has(aircraftId)) {
      aircraftId = null;
    }
    this.selectedAircraftId = aircraftId;

    for (const ac of this.aircraft.values()) {
      ac.rig.selectionRing.visible = ac.id === aircraftId;
    }

    if (!silent && aircraftId) {
      this.sound.playSelect();
    }

    this.updatePreviewRouteRibbon();
    this.hudDirty = true;
    this.emitHudSnapshot();
  }

  public issueCommand(command: ATCCommand): void {
    if (!this.selectedAircraftId) return;
    const ac = this.aircraft.get(this.selectedAircraftId);
    if (!ac) return;

    const valid = this.getValidCommand(ac);
    if (valid !== command) {
      this.sound.playCaution();
      return;
    }

    switch (command) {
      case 'PUSHBACK': {
        if (!ac.gateId) return;
        const gateId = ac.gateId;
        // Retract jetbridge
        this.airportArtifacts.jetbridges[gateId].targetExtension = 0;

        ac.status = 'PUSHBACK';
        ac.waitingReason = undefined;
        ac.reverseMode = true;
        ac.path = buildPushbackPath(gateId);
        ac.pathIndex = 0;
        ac.rig.tug.visible = true;
        ac.gateId = null;
        this.gateRespawnTimers[gateId] = 16; // Schedule next arrival at this gate
        this.score += 25;

        this.rebuildActiveRouteRibbon(ac);
        this.sound.playClearance();
        this.callbacks.onToast(`${ac.callsign} cleared for pushback from ${gateId}`, 'neutral');
        break;
      }

      case 'TAXI': {
        ac.status = 'TAXIING';
        ac.waitingReason = undefined;
        ac.reverseMode = false;
        ac.rig.tug.visible = false;
        ac.path = buildTaxiToHoldPath(ac.position.x, ac.position.z);
        ac.pathIndex = 0;
        this.score += 25;

        this.rebuildActiveRouteRibbon(ac);
        this.sound.playClearance();
        this.callbacks.onToast(`${ac.callsign} taxi via Alpha, hold short Runway 28L`, 'neutral');
        break;
      }

      case 'LINE_UP': {
        const occupied = this.getRunwayOccupant(ac.id);
        if (occupied) {
          this.sound.playCaution();
          this.callbacks.onToast(
            `Hold short — Runway 28L occupied by ${occupied.callsign}`,
            'caution',
          );
          return;
        }

        ac.status = 'LINING_UP';
        ac.waitingReason = undefined;
        ac.reverseMode = false;
        ac.path = buildLineUpPath(ac.position.x, ac.position.z);
        ac.pathIndex = 0;
        this.score += 30;

        this.rebuildActiveRouteRibbon(ac);
        this.sound.playClearance();
        this.callbacks.onToast(`${ac.callsign} line up and wait Runway 28L`, 'neutral');
        break;
      }

      case 'TAKEOFF': {
        const occupied = this.getRunwayOccupant(ac.id);
        if (occupied) {
          this.sound.playCaution();
          this.callbacks.onToast(
            `Unable takeoff — Runway 28L occupied by ${occupied.callsign}`,
            'caution',
          );
          return;
        }

        ac.status = 'TAKEOFF';
        ac.waitingReason = undefined;
        ac.reverseMode = false;
        ac.path = buildTakeoffPreviewPath(ac.position.x);
        ac.pathIndex = 0;
        ac.takeoffElapsed = 0;

        this.rebuildActiveRouteRibbon(ac);
        this.sound.playTakeoffSpool();
        this.callbacks.onToast(`${ac.callsign} cleared for takeoff Runway 28L`, 'positive');
        break;
      }
    }

    this.updatePreviewRouteRibbon();
    this.hudDirty = true;
    this.emitHudSnapshot();
  }

  // =========================================================================
  // INTERNAL SIMULATION & KINEMATICS
  // =========================================================================

  private getValidCommand(ac: AircraftEntity): ATCCommand | null {
    switch (ac.status) {
      case 'PARKED':
        return 'PUSHBACK';
      case 'READY_TAXI':
        return 'TAXI';
      case 'HOLDING':
        return 'LINE_UP';
      case 'LINED_UP':
        return 'TAKEOFF';
      default:
        return null;
    }
  }

  private getDisplayStatus(ac: AircraftEntity): string {
    switch (ac.status) {
      case 'PARKED':
        return 'PARKED';
      case 'PUSHBACK':
        return 'PUSHBACK';
      case 'READY_TAXI':
        return 'READY';
      case 'TAXIING':
        return ac.waitingReason ? 'HOLDING' : 'TAXIING';
      case 'HOLDING':
        return 'HOLDING';
      case 'LINING_UP':
        return 'LINING UP';
      case 'LINED_UP':
        return 'LINED UP';
      case 'TAKEOFF':
        return 'TAKEOFF';
    }
  }

  private getRunwayOccupant(excludeId?: string): AircraftEntity | null {
    for (const ac of this.aircraft.values()) {
      if (ac.id === excludeId) continue;
      if (ac.status === 'LINING_UP' || ac.status === 'LINED_UP') return ac;
      if (ac.status === 'TAKEOFF' && ac.altitude < 7.5) return ac;
    }
    return null;
  }

  private clearActiveRouteRibbon(ac: AircraftEntity): void {
    if (ac.activeRouteLine) {
      this.scene.remove(ac.activeRouteLine);
      ac.activeRouteLine.geometry.dispose();
      ac.activeRouteLine = null;
    }
  }

  private rebuildActiveRouteRibbon(ac: AircraftEntity): void {
    this.clearActiveRouteRibbon(ac);
    if (ac.path.length < 2) return;
    const width = ac.status === 'TAKEOFF' ? 1.55 : 0.95;
    const ribbon = buildRibbonMesh(ac.path, width, this.activePathMat, 0.14);
    if (ribbon) {
      this.scene.add(ribbon);
      ac.activeRouteLine = ribbon;
    }
  }

  private updatePreviewRouteRibbon(): void {
    const ac = this.selectedAircraftId ? this.aircraft.get(this.selectedAircraftId) : null;
    const valid = ac ? this.getValidCommand(ac) : null;
    const sig = ac && valid ? `${ac.id}:${ac.status}:${valid}` : '';
    if (sig === this.previewRouteSignature) return;
    this.previewRouteSignature = sig;

    if (this.previewRouteMesh) {
      this.scene.remove(this.previewRouteMesh);
      this.previewRouteMesh.geometry.dispose();
      this.previewRouteMesh = null;
    }

    if (!ac || !valid) return;

    let pts: THREE.Vector3[] = [];
    if (valid === 'PUSHBACK' && ac.gateId) {
      pts = buildPushbackPath(ac.gateId);
    } else if (valid === 'TAXI') {
      pts = buildTaxiToHoldPath(ac.position.x, ac.position.z);
    } else if (valid === 'LINE_UP') {
      pts = buildLineUpPath(ac.position.x, ac.position.z);
    } else if (valid === 'TAKEOFF') {
      pts = buildTakeoffPreviewPath(ac.position.x);
    }

    if (pts.length >= 2) {
      const width = valid === 'TAKEOFF' ? 1.35 : 0.78;
      this.previewRouteMesh = buildRibbonMesh(pts, width, this.previewPathMat, 0.125);
      if (this.previewRouteMesh) {
        this.scene.add(this.previewRouteMesh);
      }
    }
  }

  private stepSimulation(dt: number): void {
    const simDt = dt * this.speed;
    this.simTime += simDt;

    // 1. Advance Game Clock (1 real second = 1 game minute at 1x)
    if (simDt > 0) {
      this.clockMinutes += simDt * 0.65;
      if (this.clockMinutes >= 24 * 60) {
        this.clockMinutes -= 24 * 60;
        this.day += 1;
      }
      const wholeMin = Math.floor(this.clockMinutes);
      if (wholeMin !== this.lastHudClockMinute) {
        this.lastHudClockMinute = wholeMin;
        this.hudDirty = true;
      }
    }

    // 2. Animate environmental airport details (tower beacon, guard lights, jetbridges, route flow)
    this.airportArtifacts.towerBeacon.rotation.y += dt * 1.45;
    this.activePathTex.offset.x -= dt * 0.85;
    this.previewPathTex.offset.x -= dt * 0.55;

    // Alternating wig-wag runway guard lights
    const wigState = Math.floor(performance.now() / 480) % 2;
    this.airportArtifacts.guardLights.forEach((bulb, idx) => {
      const mat = bulb.material as THREE.MeshBasicMaterial;
      mat.color.setHex((idx + wigState) % 2 === 0 ? 0xfbbf24 : 0x5c3c0a);
    });

    // Smoothly retract/extend glass jetbridges
    for (const gateId of GATE_IDS) {
      const jb = this.airportArtifacts.jetbridges[gateId];
      if (Math.abs(jb.extension - jb.targetExtension) > 0.002) {
        jb.extension = THREE.MathUtils.damp(jb.extension, jb.targetExtension, 3.5, dt);
        jb.tunnelGroup.position.z = THREE.MathUtils.lerp(
          jb.retractedZ,
          jb.dockedZ,
          jb.extension,
        );
      }
    }

    // 3. Auto-spawn replacement flights at empty gates so gameplay stays lively
    if (simDt > 0) {
      for (const gateId of GATE_IDS) {
        if (this.gateRespawnTimers[gateId] > 0) {
          this.gateRespawnTimers[gateId] -= simDt;
          if (this.gateRespawnTimers[gateId] <= 0) {
            // Check that no aircraft is physically near that gate before spawning
            const gate = GATES[gateId];
            let gateClear = true;
            for (const ac of this.aircraft.values()) {
              if (Math.hypot(ac.position.x - gate.x, ac.position.z - gate.z) < 11) {
                gateClear = false;
                break;
              }
            }
            if (gateClear) {
              this.spawnReplacementAtGate(gateId);
            } else {
              this.gateRespawnTimers[gateId] = 4;
            }
          }
        }
      }
    }

    // 4. Update every aircraft
    const toRemove: string[] = [];
    const blinkPhase = this.simTime;

    for (const ac of this.aircraft.values()) {
      // Subtle realistic aircraft beacon & strobe flash
      const beaconOn = Math.sin(blinkPhase * 4.2 + ac.position.x * 0.3) > 0.78;
      const strobeOn = Math.sin(blinkPhase * 7.5 + ac.position.z * 0.5) > 0.9;
      ac.rig.beaconLight.visible = ac.status !== 'PARKED' && beaconOn;
      ac.rig.strobeLight.visible =
        (ac.status === 'LINING_UP' || ac.status === 'LINED_UP' || ac.status === 'TAKEOFF') &&
        strobeOn;

      // Subtle slow rotation on selection ring when selected
      if (ac.rig.selectionRing.visible) {
        ac.rig.selectionRing.rotation.z += dt * 0.6;
      }

      if (simDt <= 0) continue;

      if (ac.status === 'PUSHBACK' || ac.status === 'TAXIING' || ac.status === 'LINING_UP') {
        this.stepGroundPath(ac, simDt);
      } else if (ac.status === 'TAKEOFF') {
        const done = this.stepTakeoff(ac, simDt);
        if (done) toRemove.push(ac.id);
      }
    }

    // Clean up departed aircraft
    for (const id of toRemove) {
      const ac = this.aircraft.get(id);
      if (!ac) continue;
      this.clearActiveRouteRibbon(ac);
      this.scene.remove(ac.rig.root);
      this.aircraft.delete(id);
      if (this.selectedAircraftId === id) {
        this.selectedAircraftId = null;
        this.updatePreviewRouteRibbon();
      }
      this.hudDirty = true;
    }

    if (this.hudDirty) {
      this.updatePreviewRouteRibbon();
      this.emitHudSnapshot();
      this.hudDirty = false;
    }
  }

  private hasTrafficAhead(ac: AircraftEntity): boolean {
    if (ac.status !== 'TAXIING') return false;
    const fx = Math.cos(ac.yaw);
    const fz = -Math.sin(ac.yaw);

    for (const other of this.aircraft.values()) {
      if (other.id === ac.id || other.altitude > 1) continue;
      const dx = other.position.x - ac.position.x;
      const dz = other.position.z - ac.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 13.5 || dist < 0.01) continue;
      const forwardDot = (dx * fx + dz * fz) / dist;
      if (forwardDot > 0.55) {
        return true;
      }
    }
    return false;
  }

  private stepGroundPath(ac: AircraftEntity, dt: number): void {
    if (ac.pathIndex >= ac.path.length) return;

    const blocked = this.hasTrafficAhead(ac);
    const prevWaiting = ac.waitingReason;
    ac.waitingReason = blocked ? 'SPACING' : undefined;
    if (prevWaiting !== ac.waitingReason) {
      this.hudDirty = true;
    }

    let maxSpeed = 6.4;
    if (ac.status === 'PUSHBACK') maxSpeed = 3.2;
    else if (ac.status === 'LINING_UP') maxSpeed = 5.4;

    // Decelerate smoothly near final waypoint
    const finalPt = ac.path[ac.path.length - 1];
    const distToEnd = Math.hypot(finalPt.x - ac.position.x, finalPt.z - ac.position.z);
    let desiredSpeed = blocked ? 0 : maxSpeed;
    if (!blocked && distToEnd < 6.5) {
      desiredSpeed = Math.max(1.3, maxSpeed * (distToEnd / 6.5));
    }

    ac.speed = THREE.MathUtils.damp(ac.speed, desiredSpeed, blocked ? 5.5 : 3.2, dt);

    let stepDist = ac.speed * dt;
    while (stepDist > 0 && ac.pathIndex < ac.path.length) {
      const target = ac.path[ac.pathIndex];
      const dx = target.x - ac.position.x;
      const dz = target.z - ac.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= stepDist + 0.12) {
        ac.position.x = target.x;
        ac.position.z = target.z;
        stepDist -= dist;
        ac.pathIndex += 1;
      } else {
        const inv = 1 / dist;
        ac.position.x += dx * inv * stepDist;
        ac.position.z += dz * inv * stepDist;

        // Desired yaw along travel vector (inverted when pushing backward)
        let desiredYaw = Math.atan2(-dz, dx);
        if (ac.reverseMode) {
          desiredYaw = normalizeAngle(desiredYaw + Math.PI);
        }
        const diff = normalizeAngle(desiredYaw - ac.yaw);
        ac.yaw = normalizeAngle(ac.yaw + diff * Math.min(1, dt * 5.2));
        stepDist = 0;
      }
    }

    this.syncAircraftTransform(ac);

    // Check arrival at end of path
    if (ac.pathIndex >= ac.path.length) {
      ac.speed = 0;
      this.clearActiveRouteRibbon(ac);

      if (ac.status === 'PUSHBACK') {
        ac.status = 'READY_TAXI';
        ac.reverseMode = false;
        ac.rig.tug.visible = false;
        ac.yaw = Math.PI; // Facing cleanly West (-X) along Taxiway Alpha
        this.syncAircraftTransform(ac);
        this.callbacks.onToast(`${ac.callsign} pushback complete — ready to taxi`, 'neutral');
      } else if (ac.status === 'TAXIING') {
        ac.status = 'HOLDING';
        ac.waitingReason = undefined;
        ac.yaw = -Math.PI / 2; // Facing +Z toward Runway 28L hold-short line
        this.syncAircraftTransform(ac);
        this.callbacks.onToast(`${ac.callsign} holding short Runway 28L`, 'neutral');
      } else if (ac.status === 'LINING_UP') {
        ac.status = 'LINED_UP';
        ac.yaw = 0; // Aligned dead-center on Runway 28L facing +X
        this.syncAircraftTransform(ac);
        this.callbacks.onToast(`${ac.callsign} lined up on Runway 28L — ready for takeoff`, 'neutral');
      }

      this.hudDirty = true;
    }
  }

  private stepTakeoff(ac: AircraftEntity, dt: number): boolean {
    ac.takeoffElapsed += dt;

    // Realistic jet acceleration profile (spool up then rapid acceleration)
    const accel = ac.takeoffElapsed < 1.2 ? 4.8 : 9.4;
    ac.speed = Math.min(34, ac.speed + accel * dt);

    // Maintain centerline heading (+X) with gentle departure bank once airborne
    ac.yaw = THREE.MathUtils.damp(ac.yaw, 0, 5, dt);
    ac.position.x += Math.cos(ac.yaw) * ac.speed * dt;
    ac.position.z += -Math.sin(ac.yaw) * ac.speed * dt;

    // Rotation (VR) and Liftoff kinematics
    if (ac.position.x >= AIRPORT_LAYOUT.runwayRotateX) {
      const climbProgress = THREE.MathUtils.clamp(
        (ac.position.x - AIRPORT_LAYOUT.runwayRotateX) / 28,
        0,
        1,
      );
      const targetPitch = 0.23 * Math.min(1, climbProgress * 1.45); // ~13 degrees nose-up
      ac.pitch = THREE.MathUtils.damp(ac.pitch, targetPitch, 3.6, dt);

      // Vertical climb velocity once pitched up
      if (ac.pitch > 0.04) {
        const climbRate = ac.speed * Math.sin(ac.pitch) * 1.12;
        ac.altitude += climbRate * dt;
      }

      // Score upon clean liftoff
      if (!ac.liftoffScored && ac.altitude > 1.4) {
        ac.liftoffScored = true;
        this.score += 150;
        this.departures += 1;
        this.clearActiveRouteRibbon(ac);
        this.sound.playDepartureScore();
        this.callbacks.onToast(`${ac.callsign} airborne for ${ac.destination}  +150`, 'positive');
        this.hudDirty = true;
      }

      // Smoothly retract landing gear & fade ground shadow as plane climbs
      if (ac.altitude > 2.5) {
        ac.rig.landingGear.scale.y = THREE.MathUtils.damp(ac.rig.landingGear.scale.y, 0.01, 4.5, dt);
        if (ac.rig.landingGear.scale.y < 0.08) {
          ac.rig.landingGear.visible = false;
        }
      }

      // Gentle right bank during initial climbout
      if (ac.altitude > 5.0) {
        ac.roll = THREE.MathUtils.damp(ac.roll, -0.14, 1.8, dt);
      }
    }

    this.syncAircraftTransform(ac);

    // Despawn cleanly once high and past the horizon fog
    return ac.position.x > 165 || ac.altitude > 48;
  }

  private syncAircraftTransform(ac: AircraftEntity): void {
    ac.rig.root.position.set(ac.position.x, 0, ac.position.z);
    ac.rig.root.rotation.y = ac.yaw;

    ac.rig.airframe.position.y = 0.92 + ac.altitude;
    ac.rig.airframe.rotation.z = ac.pitch; // Nose along +X: +Z rotation pitches nose UP!
    ac.rig.airframe.rotation.x = ac.roll;

    // Ground shadow fades & spreads softly with altitude
    const shadowFade = THREE.MathUtils.clamp(1 - ac.altitude / 18, 0, 1);
    const shadowMat = ac.rig.contactShadow.material as THREE.MeshBasicMaterial;
    shadowMat.opacity = 0.5 * shadowFade;
    const shadowScale = 1 + ac.altitude * 0.04;
    ac.rig.contactShadow.scale.set(shadowScale, shadowScale, 1);
    ac.rig.selectionRing.visible = ac.id === this.selectedAircraftId && ac.altitude < 2;
  }

  // =========================================================================
  // 3D -> 2D SCREEN PROJECTION FOR FLIGHT STRIPS
  // =========================================================================

  private projectFlightStrips(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const results: ProjectedStripPosition[] = [];
    for (const ac of this.aircraft.values()) {
      _ndc.set(ac.position.x, 3.1 + ac.altitude, ac.position.z);
      _ndc.project(this.activeCamera);

      const inFront = _ndc.z >= -1 && _ndc.z <= 1;
      const sx = ((_ndc.x + 1) * 0.5) * width;
      const sy = ((-_ndc.y + 1) * 0.5) * height;
      const onScreen = inFront && sx > -90 && sx < width + 90 && sy > -50 && sy < height + 50;

      // Subtle distance scale in perspective mode so strips feel anchored in 3D space
      let scale = 1;
      if (this.activeCamera === this.perspCamera) {
        _vec3A.set(ac.position.x, ac.altitude, ac.position.z);
        const dist = this.perspCamera.position.distanceTo(_vec3A);
        scale = THREE.MathUtils.clamp(68 / Math.max(dist, 26), 0.84, 1.06);
      }

      results.push({
        id: ac.id,
        x: sx,
        y: sy,
        visible: onScreen,
        scale,
      });
    }

    this.callbacks.onStripsUpdate(results);
  }

  private emitHudSnapshot(): void {
    const list: AircraftSnapshot[] = [];
    for (const ac of this.aircraft.values()) {
      list.push({
        id: ac.id,
        callsign: ac.callsign,
        aircraftType: ac.aircraftType,
        destination: ac.destination,
        gateId: ac.gateId,
        status: ac.status,
        displayStatus: this.getDisplayStatus(ac),
        validCommand: this.getValidCommand(ac),
        liveryAccent: ac.livery.uiAccent,
        waitingReason: ac.waitingReason,
      });
    }

    const occ = this.getRunwayOccupant();
    this.callbacks.onHudUpdate({
      day: this.day,
      clockMinutes: this.clockMinutes,
      score: this.score,
      departures: this.departures,
      speed: this.speed,
      cameraPreset: this.cameraPreset,
      selectedAircraftId: this.selectedAircraftId,
      aircraft: list,
      runwayOccupiedBy: occ ? occ.callsign : null,
    });
  }

  // =========================================================================
  // RENDER LOOP (GPU rAF + Software WebGL Fence-Synced Pacing)
  // =========================================================================

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private loop = (timestamp: number): void => {
    if (this.disposed) return;

    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.1);

    // Smooth camera preset damping (stops automatically on arrival or user orbit)
    if (this.cameraTransitionActive && this.activeCamera === this.perspCamera) {
      const lambda = 4.6;
      this.perspCamera.position.x = THREE.MathUtils.damp(
        this.perspCamera.position.x,
        this.targetCamPos.x,
        lambda,
        dt,
      );
      this.perspCamera.position.y = THREE.MathUtils.damp(
        this.perspCamera.position.y,
        this.targetCamPos.y,
        lambda,
        dt,
      );
      this.perspCamera.position.z = THREE.MathUtils.damp(
        this.perspCamera.position.z,
        this.targetCamPos.z,
        lambda,
        dt,
      );

      this.controls.target.x = THREE.MathUtils.damp(
        this.controls.target.x,
        this.targetLookAt.x,
        lambda,
        dt,
      );
      this.controls.target.y = THREE.MathUtils.damp(
        this.controls.target.y,
        this.targetLookAt.y,
        lambda,
        dt,
      );
      this.controls.target.z = THREE.MathUtils.damp(
        this.controls.target.z,
        this.targetLookAt.z,
        lambda,
        dt,
      );

      _vec3A.copy(this.perspCamera.position).sub(this.targetCamPos);
      _vec3B.copy(this.controls.target).sub(this.targetLookAt);
      if (_vec3A.lengthSq() < 0.015 && _vec3B.lengthSq() < 0.015) {
        this.cameraTransitionActive = false;
      }
    }

    // Constrain pan target inside airport bounds so users never get lost in the fog
    this.controls.target.x = THREE.MathUtils.clamp(this.controls.target.x, -62, 62);
    this.controls.target.z = THREE.MathUtils.clamp(this.controls.target.z, -44, 42);
    if (this.cameraPreset !== 'TOWER') {
      this.controls.target.y = THREE.MathUtils.clamp(this.controls.target.y, 0, 8);
    }
    this.controls.update();

    this.stepSimulation(dt);
    this.renderer.render(this.scene, this.activeCamera);
    this.projectFlightStrips();

    if (this.isSoftwareGl) {
      this.afterDraw(() => this.loop(performance.now()));
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  // =========================================================================
  // POINTER PICKING, HOVER & RESIZE
  // =========================================================================

  private getRaycastHitAircraft(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(_pointerNdc, this.activeCamera);
    const hitboxes: THREE.Object3D[] = [];
    for (const ac of this.aircraft.values()) {
      hitboxes.push(ac.rig.hitbox);
    }
    const hits = this.raycaster.intersectObjects(hitboxes, false);
    if (hits.length > 0) {
      return (hits[0].object.userData.aircraftId as string) || null;
    }
    return null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.isPointerDown = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    // Only treat as tap/click if user did not drag/orbit
    if (dist < 7) {
      const hitId = this.getRaycastHitAircraft(e.clientX, e.clientY);
      if (hitId) {
        this.selectAircraft(hitId);
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isPointerDown) return;
    const now = performance.now();
    if (now - this.lastHoverCheck < 70) return;
    this.lastHoverCheck = now;

    const hitId = this.getRaycastHitAircraft(e.clientX, e.clientY);
    this.renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private handleResize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;

    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();

    // Scale frustum smoothly on narrow/portrait mobile viewports so the full airport fits
    const frustum = aspect < 0.85 ? 128 : 112;
    this.orthoFrustumSize = frustum;
    this.orthoCamera.left = (-frustum * aspect) / 2;
    this.orthoCamera.right = (frustum * aspect) / 2;
    this.orthoCamera.top = frustum / 2;
    this.orthoCamera.bottom = -frustum / 2;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    this.resizeObserver.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.controls.dispose();
    this.sound.dispose();

    for (const ac of this.aircraft.values()) {
      this.clearActiveRouteRibbon(ac);
    }
    if (this.previewRouteMesh) {
      this.previewRouteMesh.geometry.dispose();
    }
    this.contactShadowTex.dispose();
    this.activePathTex.dispose();
    this.previewPathTex.dispose();
    this.activePathMat.dispose();
    this.previewPathMat.dispose();

    for (const d of this.airportArtifacts.disposables) {
      d.dispose();
    }

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
