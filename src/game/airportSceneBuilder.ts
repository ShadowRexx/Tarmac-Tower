import * as THREE from 'three';
import { AIRPORT_LAYOUT, GATES, GATE_IDS } from './airportGraph';
import {
  createApronTexture,
  createHoldShortTexture,
  createRunwayTexture,
  createTaxiwayTexture,
  createTerrainTexture,
} from './textures';
import type { GateId } from '../types/atc';

export interface JetbridgeHandle {
  gateId: GateId;
  tunnelGroup: THREE.Group;
  cabGroup: THREE.Group;
  /** 1 = docked at aircraft door, 0 = retracted toward terminal */
  extension: number;
  targetExtension: number;
  dockedZ: number;
  retractedZ: number;
}

export interface AirportSceneArtifacts {
  root: THREE.Group;
  jetbridges: Record<GateId, JetbridgeHandle>;
  towerBeacon: THREE.Group;
  radarDome: THREE.Mesh;
  guardLights: THREE.Mesh[];
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Builds the complete architectural scale-model 3D airport diorama:
 * - Sage-green terrain extending into horizon fog
 * - Concrete apron with stands G1/G2/G3, yellow lead-in lines
 * - Connected taxiway network with fillets & hold-short bars
 * - Dark charcoal asphalt runway 28L/10R with edge & threshold lights
 * - Matte warm off-white stepped Terminal with glass curtain walls & animated jetbridges
 * - Architectural Control Tower with flared glazed cab & rotating beacon
 * - Miniature scale-model trees, hangars, service vehicles, and landside parking
 */
export function buildAirportScene(
  anisotropy: number,
  isSoftwareGl: boolean,
): AirportSceneArtifacts {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // --- Shared Architectural Materials ---
  const wallWhiteMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  const roofWarmMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xebe6dc,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  const trimStoneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd5cfc2,
      roughness: 0.7,
      metalness: 0.05,
    }),
  );
  const darkMetalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38414a,
      roughness: 0.42,
      metalness: 0.6,
    }),
  );
  const architecturalGlassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x2c4252,
      roughness: 0.12,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: isSoftwareGl ? 0.72 : 0.82,
    }),
  );
  const jetbridgeGlassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x9bb8c7,
      roughness: 0.14,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.45,
      thickness: 0.4,
      transparent: true,
      opacity: isSoftwareGl ? 0.55 : 0.75,
      clearcoat: 0.9,
    }),
  );

  // =========================================================================
  // 1. EXTENDED SAGE-GREEN TERRAIN (#8fa38a)
  // =========================================================================
  const terrainTex = track(createTerrainTexture(anisotropy));
  const terrainGeo = track(
    new THREE.PlaneGeometry(AIRPORT_LAYOUT.terrainSize, AIRPORT_LAYOUT.terrainSize),
  );
  const terrainMat = track(
    new THREE.MeshStandardMaterial({
      map: terrainTex,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = 0;
  terrain.receiveShadow = true;
  root.add(terrain);

  // =========================================================================
  // 2. CONCRETE APRON SLAB (G1, G2, G3)
  // =========================================================================
  const apronTex = track(createApronTexture(anisotropy));
  const apronGeo = track(
    new THREE.BoxGeometry(AIRPORT_LAYOUT.apronWidth, 0.08, AIRPORT_LAYOUT.apronDepth),
  );
  const apronSideMat = track(
    new THREE.MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.9 }),
  );
  const apronTopMat = track(
    new THREE.MeshStandardMaterial({
      map: apronTex,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  const apronMesh = new THREE.Mesh(apronGeo, [
    apronSideMat,
    apronSideMat,
    apronTopMat,
    apronSideMat,
    apronSideMat,
    apronSideMat,
  ]);
  apronMesh.position.set(AIRPORT_LAYOUT.apronCenterX, 0.01, AIRPORT_LAYOUT.apronCenterZ);
  apronMesh.receiveShadow = true;
  root.add(apronMesh);

  // =========================================================================
  // 3. CONNECTED TAXIWAY NETWORK (ALPHA + CONNECTORS A1, A2, A3 + FILLETS)
  // =========================================================================
  const taxiLongTex = track(createTaxiwayTexture(anisotropy, 12));
  const taxiShortTex = track(createTaxiwayTexture(anisotropy, 2));
  const taxiLongMat = track(
    new THREE.MeshStandardMaterial({
      map: taxiLongTex,
      roughness: 0.86,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const taxiShortMat = track(
    new THREE.MeshStandardMaterial({
      map: taxiShortTex,
      roughness: 0.86,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const concreteFillMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdedad0,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );

  // Parallel Taxiway Alpha (East-West)
  const taxiAlphaLength = 102;
  const taxiAlpha = new THREE.Mesh(
    track(new THREE.PlaneGeometry(taxiAlphaLength, AIRPORT_LAYOUT.taxiwayWidth)),
    taxiLongMat,
  );
  taxiAlpha.rotation.x = -Math.PI / 2;
  taxiAlpha.position.set(0, 0.055, AIRPORT_LAYOUT.taxiwayZ);
  taxiAlpha.receiveShadow = true;
  root.add(taxiAlpha);

  // Three connectors linking Taxiway Alpha (Z = 3.5) to Runway 28L (Z = 18)
  const connectorLength = AIRPORT_LAYOUT.runwayZ - AIRPORT_LAYOUT.taxiwayZ - 2.5;
  const connectorCenterZ = (AIRPORT_LAYOUT.taxiwayZ + AIRPORT_LAYOUT.runwayZ) * 0.5 - 0.5;
  const connectorXs = [
    AIRPORT_LAYOUT.entryConnectorX,
    AIRPORT_LAYOUT.midConnectorX,
    AIRPORT_LAYOUT.eastConnectorX,
  ];

  const filletGeo = track(new THREE.CircleGeometry(4.2, 20));
  for (const cx of connectorXs) {
    const conn = new THREE.Mesh(
      track(new THREE.PlaneGeometry(connectorLength, AIRPORT_LAYOUT.taxiwayWidth)),
      taxiShortMat,
    );
    conn.rotation.x = -Math.PI / 2;
    conn.rotation.z = Math.PI / 2;
    conn.position.set(cx, 0.052, connectorCenterZ);
    conn.receiveShadow = true;
    root.add(conn);

    // Sweeping concrete intersection pads at Taxiway A & Runway junctions
    const padTop = new THREE.Mesh(filletGeo, concreteFillMat);
    padTop.rotation.x = -Math.PI / 2;
    padTop.position.set(cx, 0.045, AIRPORT_LAYOUT.taxiwayZ + 0.8);
    padTop.receiveShadow = true;
    root.add(padTop);

    const padBot = new THREE.Mesh(filletGeo, concreteFillMat);
    padBot.rotation.x = -Math.PI / 2;
    padBot.position.set(cx, 0.045, AIRPORT_LAYOUT.runwayZ - AIRPORT_LAYOUT.runwayWidth * 0.5);
    padBot.receiveShadow = true;
    root.add(padBot);
  }

  // Painted curved yellow turn-in line at A1 (Taxiway Alpha -> Connector A1)
  const yellowLineMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xe0af38,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const curveA1 = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(AIRPORT_LAYOUT.entryConnectorX + 5.2, 0.068, AIRPORT_LAYOUT.taxiwayZ),
    new THREE.Vector3(AIRPORT_LAYOUT.entryConnectorX, 0.068, AIRPORT_LAYOUT.taxiwayZ),
    new THREE.Vector3(AIRPORT_LAYOUT.entryConnectorX, 0.068, AIRPORT_LAYOUT.taxiwayZ + 5.2),
  );
  const curveA1Geo = track(new THREE.TubeGeometry(curveA1, 18, 0.12, 6, false));
  curveA1Geo.scale(1, 0.15, 1);
  root.add(new THREE.Mesh(curveA1Geo, yellowLineMat));

  // Painted curved yellow entry line at Runway 28L threshold
  const curveRwy = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(AIRPORT_LAYOUT.entryConnectorX, 0.072, AIRPORT_LAYOUT.runwayZ - 5.8),
    new THREE.Vector3(AIRPORT_LAYOUT.entryConnectorX, 0.072, AIRPORT_LAYOUT.runwayZ),
    new THREE.Vector3(AIRPORT_LAYOUT.entryConnectorX + 6.5, 0.072, AIRPORT_LAYOUT.runwayZ),
  );
  const curveRwyGeo = track(new THREE.TubeGeometry(curveRwy, 18, 0.12, 6, false));
  curveRwyGeo.scale(1, 0.15, 1);
  root.add(new THREE.Mesh(curveRwyGeo, yellowLineMat));

  // Holding-Point Markings (Hold-Short Bars) on all 3 connectors
  const holdShortTex = track(createHoldShortTexture(anisotropy));
  const holdShortMat = track(
    new THREE.MeshStandardMaterial({
      map: holdShortTex,
      roughness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const holdShortGeo = track(new THREE.PlaneGeometry(AIRPORT_LAYOUT.taxiwayWidth + 0.3, 1.35));
  const guardLights: THREE.Mesh[] = [];
  const guardBulbGeo = track(new THREE.SphereGeometry(0.14, 10, 10));
  const signPostMat = track(new THREE.MeshStandardMaterial({ color: 0xb8382c, roughness: 0.45 }));

  for (const cx of connectorXs) {
    const hs = new THREE.Mesh(holdShortGeo, holdShortMat);
    hs.rotation.x = -Math.PI / 2;
    hs.position.set(cx, 0.068, AIRPORT_LAYOUT.holdShortZ + 1.45);
    hs.receiveShadow = true;
    root.add(hs);

    // Pair of amber runway guard lights ("wig-wags") flanking A1 hold-short
    for (const side of [-1, 1] as const) {
      const post = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.32, 0.55, 0.25)),
        darkMetalMat,
      );
      post.position.set(cx + side * 3.15, 0.28, AIRPORT_LAYOUT.holdShortZ + 1.45);
      post.castShadow = true;
      root.add(post);

      const bulb = new THREE.Mesh(
        guardBulbGeo,
        track(new THREE.MeshBasicMaterial({ color: 0xf59e0b })),
      );
      bulb.position.set(cx + side * 3.15, 0.62, AIRPORT_LAYOUT.holdShortZ + 1.45);
      root.add(bulb);
      guardLights.push(bulb);
    }

    // Miniature red/white runway holding sign ("28L")
    const signBox = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.1, 0.42, 0.18)),
      signPostMat,
    );
    signBox.position.set(cx - 3.65, 0.36, AIRPORT_LAYOUT.holdShortZ + 0.7);
    signBox.castShadow = true;
    root.add(signBox);
  }

  // =========================================================================
  // 4. DARK CHARCOAL ASPHALT RUNWAY 28L (#1e242b) + EDGE LIGHTS
  // =========================================================================
  const runwayTex = track(createRunwayTexture(anisotropy));
  const runwayGeo = track(
    new THREE.BoxGeometry(AIRPORT_LAYOUT.runwayLength, 0.1, AIRPORT_LAYOUT.runwayWidth),
  );
  const runwaySideMat = track(
    new THREE.MeshStandardMaterial({ color: 0x181d22, roughness: 0.92 }),
  );
  const runwayTopMat = track(
    new THREE.MeshStandardMaterial({
      map: runwayTex,
      roughness: 0.82,
      metalness: 0.04,
    }),
  );
  const runwayMesh = new THREE.Mesh(runwayGeo, [
    runwaySideMat,
    runwaySideMat,
    runwayTopMat,
    runwaySideMat,
    runwaySideMat,
    runwaySideMat,
  ]);
  runwayMesh.position.set(0, 0.02, AIRPORT_LAYOUT.runwayZ);
  runwayMesh.receiveShadow = true;
  root.add(runwayMesh);

  // Subtle paved asphalt shoulder border around runway
  const shoulderMesh = new THREE.Mesh(
    track(
      new THREE.PlaneGeometry(AIRPORT_LAYOUT.runwayLength + 2.8, AIRPORT_LAYOUT.runwayWidth + 2.6),
    ),
    track(new THREE.MeshStandardMaterial({ color: 0x353c43, roughness: 0.94 })),
  );
  shoulderMesh.rotation.x = -Math.PI / 2;
  shoulderMesh.position.set(0, 0.032, AIRPORT_LAYOUT.runwayZ);
  shoulderMesh.receiveShadow = true;
  root.add(shoulderMesh);

  // Instanced Runway Edge Lights (crisp warm-white architectural pins)
  const edgeLightCount = 36;
  const edgeLightGeo = track(new THREE.CylinderGeometry(0.08, 0.1, 0.24, 8));
  const edgeLightMat = track(new THREE.MeshBasicMaterial({ color: 0xfff3d4 }));
  const edgeLights = new THREE.InstancedMesh(edgeLightGeo, edgeLightMat, edgeLightCount);
  const dummy = new THREE.Object3D();
  let lIdx = 0;
  for (let i = 0; i < 18; i++) {
    const lx = -58 + (i / 17) * 116;
    for (const side of [-1, 1] as const) {
      dummy.position.set(lx, 0.14, AIRPORT_LAYOUT.runwayZ + side * (AIRPORT_LAYOUT.runwayWidth * 0.5 + 0.45));
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      edgeLights.setMatrixAt(lIdx++, dummy.matrix);
    }
  }
  edgeLights.instanceMatrix.needsUpdate = true;
  edgeLights.computeBoundingSphere();
  root.add(edgeLights);

  // Threshold Green/Red End Light Bars
  const greenMat = track(new THREE.MeshBasicMaterial({ color: 0x34d399 }));
  const redMat = track(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  for (let i = 0; i < 6; i++) {
    const lz = AIRPORT_LAYOUT.runwayZ - 4.2 + (i / 5) * 8.4;
    const gDot = new THREE.Mesh(edgeLightGeo, greenMat);
    gDot.position.set(-59.2, 0.14, lz);
    root.add(gDot);

    const rDot = new THREE.Mesh(edgeLightGeo, redMat);
    rDot.position.set(59.2, 0.14, lz);
    root.add(rDot);
  }

  // =========================================================================
  // 5. ARCHITECTURAL TERMINAL BUILDING (#f4f1ea) + STEPPED VOLUMES
  // =========================================================================
  const terminalGroup = new THREE.Group();
  terminalGroup.position.set(0, 0, AIRPORT_LAYOUT.terminalZ);
  root.add(terminalGroup);

  // Raised concrete podium plaza under terminal
  const podium = new THREE.Mesh(
    track(new THREE.BoxGeometry(66, 0.35, 16)),
    trimStoneMat,
  );
  podium.position.set(0, 0.175, 0);
  podium.receiveShadow = true;
  podium.castShadow = true;
  terminalGroup.add(podium);

  // Main long concourse pier (east-west, spanning G1 -> G3)
  const concourseMain = new THREE.Mesh(
    track(new THREE.BoxGeometry(58, 4.1, 7.6)),
    wallWhiteMat,
  );
  concourseMain.position.set(0, 2.35, 1.4);
  concourseMain.castShadow = true;
  concourseMain.receiveShadow = true;
  terminalGroup.add(concourseMain);

  // Subtle recessed roof parapet cap
  const concourseRoof = new THREE.Mesh(
    track(new THREE.BoxGeometry(56.6, 0.32, 6.2)),
    roofWarmMat,
  );
  concourseRoof.position.set(0, 4.46, 1.4);
  concourseRoof.receiveShadow = true;
  terminalGroup.add(concourseRoof);

  // Airside continuous glass curtain wall facing the apron (+Z)
  const concourseGlass = new THREE.Mesh(
    track(new THREE.BoxGeometry(54.5, 2.15, 0.25)),
    architecturalGlassMat,
  );
  concourseGlass.position.set(0, 2.35, 5.18);
  terminalGroup.add(concourseGlass);

  // Vertical architectural mullions along curtain wall
  const mullionGeo = track(new THREE.BoxGeometry(0.16, 2.25, 0.32));
  for (let x = -26; x <= 26; x += 4) {
    const mullion = new THREE.Mesh(mullionGeo, wallWhiteMat);
    mullion.position.set(x, 2.35, 5.2);
    terminalGroup.add(mullion);
  }

  // Elevated Central Departure Hall (stepped modernist volume behind concourse)
  const centralHall = new THREE.Mesh(
    track(new THREE.BoxGeometry(24, 6.4, 9.2)),
    wallWhiteMat,
  );
  centralHall.position.set(-2, 3.5, -2.6);
  centralHall.castShadow = true;
  centralHall.receiveShadow = true;
  terminalGroup.add(centralHall);

  // Central Hall clerestory skylight band
  const clerestoryGlass = new THREE.Mesh(
    track(new THREE.BoxGeometry(22.6, 1.15, 9.4)),
    architecturalGlassMat,
  );
  clerestoryGlass.position.set(-2, 5.5, -2.6);
  terminalGroup.add(clerestoryGlass);

  // Cantilevered floating roof slab over Central Hall
  const centralRoof = new THREE.Mesh(
    track(new THREE.BoxGeometry(26.4, 0.55, 11.4)),
    wallWhiteMat,
  );
  centralRoof.position.set(-2, 6.85, -2.6);
  centralRoof.castShadow = true;
  centralRoof.receiveShadow = true;
  terminalGroup.add(centralRoof);

  // Secondary West Wing & East Lounge architectural blocks (stepped diorama massing)
  const westWing = new THREE.Mesh(
    track(new THREE.BoxGeometry(15, 4.9, 7.4)),
    wallWhiteMat,
  );
  westWing.position.set(-19.5, 2.75, -2.8);
  westWing.castShadow = true;
  westWing.receiveShadow = true;
  terminalGroup.add(westWing);

  const eastWing = new THREE.Mesh(
    track(new THREE.BoxGeometry(14, 5.2, 6.8)),
    wallWhiteMat,
  );
  eastWing.position.set(17.5, 2.9, -2.2);
  eastWing.castShadow = true;
  eastWing.receiveShadow = true;
  terminalGroup.add(eastWing);

  // Landside drop-off canopy behind terminal (-Z)
  const canopy = new THREE.Mesh(
    track(new THREE.BoxGeometry(22, 0.28, 3.8)),
    wallWhiteMat,
  );
  canopy.position.set(-2, 3.3, -8.4);
  canopy.castShadow = true;
  terminalGroup.add(canopy);

  const pillarGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 10));
  for (const px of [-11, -5, 1, 7]) {
    const pillar = new THREE.Mesh(pillarGeo, trimStoneMat);
    pillar.position.set(px, 1.65, -9.8);
    pillar.castShadow = true;
    terminalGroup.add(pillar);
  }

  // Rooftop architectural HVAC units & skylight louvers
  const hvacBoxes: Array<[number, number, number, number, number, number]> = [
    [-20, 5.45, -2.8, 3.2, 0.65, 2.1],
    [-16, 5.45, -2.8, 1.8, 0.55, 1.8],
    [16.5, 5.75, -2.2, 3.4, 0.6, 2.2],
    [22, 4.68, 1.4, 2.4, 0.45, 1.6],
    [-11, 4.68, 1.4, 2.6, 0.45, 1.6],
    [-4, 7.35, -2.6, 4.6, 0.42, 2.6],
  ];
  for (const [hx, hy, hz, w, h, d] of hvacBoxes) {
    const unit = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), trimStoneMat);
    unit.position.set(hx, hy, hz);
    unit.castShadow = true;
    unit.receiveShadow = true;
    terminalGroup.add(unit);
  }

  // =========================================================================
  // 6. ARTICULATED GLASS JETBRIDGES (G1, G2, G3)
  // =========================================================================
  const jetbridges = {} as Record<GateId, JetbridgeHandle>;

  for (const gateId of GATE_IDS) {
    const gate = GATES[gateId];
    const [bx, bzStart] = gate.bridgeStart;
    const [, bzEnd] = gate.bridgeEnd;

    const bridgeBase = new THREE.Group();
    bridgeBase.position.set(bx, 0, bzStart);
    root.add(bridgeBase);

    // Terminal Rotunda Connector
    const rotunda = new THREE.Mesh(
      track(new THREE.CylinderGeometry(1.05, 1.05, 3.1, 16)),
      wallWhiteMat,
    );
    rotunda.position.set(0, 1.55, 0.25);
    rotunda.castShadow = true;
    bridgeBase.add(rotunda);

    // Fixed Outer Bridge Sleeve
    const outerSleeve = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.28, 1.38, 2.1)),
      wallWhiteMat,
    );
    outerSleeve.position.set(0, 2.05, 1.35);
    outerSleeve.castShadow = true;
    bridgeBase.add(outerSleeve);

    // Telescoping Glass Tunnel Group (animates along Z)
    const tunnelGroup = new THREE.Group();
    const dockedZ = bzEnd - bzStart; // ~4.2
    const retractedZ = 1.9;
    tunnelGroup.position.set(0, 0, dockedZ);
    bridgeBase.add(tunnelGroup);

    // Glass passenger corridor
    const glassTunnel = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.05, 1.24, 3.4)),
      jetbridgeGlassMat,
    );
    glassTunnel.position.set(0, 2.02, -1.7);
    tunnelGroup.add(glassTunnel);

    // Crisp top & bottom tunnel frames
    const frameRoof = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.14, 0.16, 3.5)),
      wallWhiteMat,
    );
    frameRoof.position.set(0, 2.68, -1.7);
    frameRoof.castShadow = true;
    tunnelGroup.add(frameRoof);

    const frameFloor = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.14, 0.18, 3.5)),
      trimStoneMat,
    );
    frameFloor.position.set(0, 1.36, -1.7);
    frameFloor.castShadow = true;
    tunnelGroup.add(frameFloor);

    // Support drive-column + dual bogie wheels grounded on apron
    const supportLeg = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.14, 0.18, 1.35, 10)),
      darkMetalMat,
    );
    supportLeg.position.set(0, 0.68, -0.55);
    supportLeg.castShadow = true;
    tunnelGroup.add(supportLeg);

    const axle = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.22, 0.42)), darkMetalMat);
    axle.position.set(0, 0.16, -0.55);
    tunnelGroup.add(axle);

    // Flexible rubber bellows docking cab angled slightly toward aircraft port door
    const cabGroup = new THREE.Group();
    cabGroup.position.set(0.55, 2.02, 0.05);
    cabGroup.rotation.y = 0.42;
    tunnelGroup.add(cabGroup);

    const cab = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.15, 1.28, 1.1)),
      wallWhiteMat,
    );
    cab.castShadow = true;
    cabGroup.add(cab);

    const bellows = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.32, 1.18, 0.92)),
      darkMetalMat,
    );
    bellows.position.set(0.62, 0, 0);
    cabGroup.add(bellows);

    jetbridges[gateId] = {
      gateId,
      tunnelGroup,
      cabGroup,
      extension: 1,
      targetExtension: 1,
      dockedZ,
      retractedZ,
    };
  }

  // =========================================================================
  // 7. ARCHITECTURAL CONTROL TOWER (West of Terminal, overlooking Apron + RWY)
  // =========================================================================
  const towerGroup = new THREE.Group();
  towerGroup.position.set(AIRPORT_LAYOUT.towerX, 0, AIRPORT_LAYOUT.towerZ);
  root.add(towerGroup);

  // Two-story technical podium base
  const towerBase = new THREE.Mesh(
    track(new THREE.BoxGeometry(7.2, 2.5, 6.2)),
    wallWhiteMat,
  );
  towerBase.position.y = 1.25;
  towerBase.castShadow = true;
  towerBase.receiveShadow = true;
  towerGroup.add(towerBase);

  // Sleek tapered architectural concrete shaft
  const shaft = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1.65, 2.35, 9.2, 8)),
    wallWhiteMat,
  );
  shaft.rotation.y = Math.PI / 8;
  shaft.position.y = 6.9;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  towerGroup.add(shaft);

  // Recessed vertical window slit on shaft
  const shaftGlaze = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.55, 7.6, 3.85)),
    architecturalGlassMat,
  );
  shaftGlaze.position.y = 6.9;
  towerGroup.add(shaftGlaze);

  // Observation deck mechanical collar
  const collar = new THREE.Mesh(
    track(new THREE.CylinderGeometry(3.25, 2.15, 1.15, 8)),
    trimStoneMat,
  );
  collar.rotation.y = Math.PI / 8;
  collar.position.y = 12.0;
  collar.castShadow = true;
  towerGroup.add(collar);

  // Flared Canted Glass Observation Cab (classic ATC outward-leaning glass)
  const cabGlass = new THREE.Mesh(
    track(new THREE.CylinderGeometry(3.75, 3.15, 2.1, 8)),
    architecturalGlassMat,
  );
  cabGlass.rotation.y = Math.PI / 8;
  cabGlass.position.y = 13.55;
  towerGroup.add(cabGlass);

  // Interior console core inside glass cab so it looks architectural, not empty
  const cabCore = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1.7, 1.7, 1.5, 8)),
    trimStoneMat,
  );
  cabCore.position.y = 13.3;
  towerGroup.add(cabCore);

  // Thin structural mullions on observation cab corners
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const pillar = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6)),
      darkMetalMat,
    );
    pillar.position.set(Math.cos(angle) * 3.35, 13.55, Math.sin(angle) * 3.35);
    pillar.rotation.z = -Math.cos(angle) * 0.22;
    pillar.rotation.x = Math.sin(angle) * 0.22;
    towerGroup.add(pillar);
  }

  // Cantilevered flat modernist tower roof
  const towerRoof = new THREE.Mesh(
    track(new THREE.CylinderGeometry(4.35, 4.1, 0.52, 8)),
    wallWhiteMat,
  );
  towerRoof.rotation.y = Math.PI / 8;
  towerRoof.position.y = 14.85;
  towerRoof.castShadow = true;
  towerRoof.receiveShadow = true;
  towerGroup.add(towerRoof);

  // Fiberglass ASR Radar Radome on tower roof
  const radarDome = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.95, 18, 14)),
    wallWhiteMat,
  );
  radarDome.position.set(-1.1, 15.85, -0.6);
  radarDome.castShadow = true;
  towerGroup.add(radarDome);

  // Communications antenna spire
  const spire = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.05, 0.1, 3.2, 8)),
    darkMetalMat,
  );
  spire.position.set(1.4, 16.6, 0.8);
  towerGroup.add(spire);

  // Rotating airport beacon (warm-white & green double lens)
  const towerBeacon = new THREE.Group();
  towerBeacon.position.set(0.6, 15.6, -1.2);
  const beaconHousing = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.58, 0.28, 0.34)),
    darkMetalMat,
  );
  towerBeacon.add(beaconHousing);

  const lensA = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.14, 10, 10)),
    track(new THREE.MeshBasicMaterial({ color: 0xfff3c4 })),
  );
  lensA.position.x = 0.28;
  towerBeacon.add(lensA);

  const lensB = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.14, 10, 10)),
    track(new THREE.MeshBasicMaterial({ color: 0x34d399 })),
  );
  lensB.position.x = -0.28;
  towerBeacon.add(lensB);
  towerGroup.add(towerBeacon);

  // =========================================================================
  // 8. AUXILIARY BUILDINGS, HANGARS & LANDSIDE PARKING LOT (Diorama Richness)
  // =========================================================================
  const auxBuildings: Array<{ x: number; z: number; w: number; h: number; d: number; rot?: number }> = [
    // Cargo & Fire station complex on far west
    { x: -49, z: -18, w: 12, h: 4.2, d: 9 },
    { x: -46, z: -31, w: 9, h: 3.1, d: 6.5 },
    // Technical hangars on east side
    { x: 43, z: -16, w: 13, h: 4.8, d: 10 },
    { x: 47, z: -29, w: 8.5, h: 3.2, d: 6 },
    // Landside administration pavilions behind parking
    { x: -18, z: -43, w: 11, h: 3.4, d: 7 },
    { x: 16, z: -42, w: 14, h: 3.8, d: 7.5 },
  ];

  for (const b of auxBuildings) {
    const bGroup = new THREE.Group();
    bGroup.position.set(b.x, 0, b.z);
    if (b.rot) bGroup.rotation.y = b.rot;

    const body = new THREE.Mesh(track(new THREE.BoxGeometry(b.w, b.h, b.d)), wallWhiteMat);
    body.position.y = b.h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    bGroup.add(body);

    const cap = new THREE.Mesh(
      track(new THREE.BoxGeometry(b.w - 0.8, 0.25, b.d - 0.8)),
      roofWarmMat,
    );
    cap.position.y = b.h + 0.12;
    bGroup.add(cap);

    const band = new THREE.Mesh(
      track(new THREE.BoxGeometry(b.w * 0.72, b.h * 0.35, 0.18)),
      architecturalGlassMat,
    );
    band.position.set(0, b.h * 0.58, b.d * 0.5 + 0.02);
    bGroup.add(band);

    root.add(bGroup);
  }

  // Landside Access Road & Parking Lot behind Terminal (Z = -34)
  const parkingLot = new THREE.Mesh(
    track(new THREE.PlaneGeometry(54, 11.5)),
    track(new THREE.MeshStandardMaterial({ color: 0x3b4249, roughness: 0.9 })),
  );
  parkingLot.rotation.x = -Math.PI / 2;
  parkingLot.position.set(0, 0.035, -34.5);
  parkingLot.receiveShadow = true;
  root.add(parkingLot);

  // Instanced miniature parked cars (architectural white/slate/amber blocks)
  const carGeo = track(new THREE.BoxGeometry(1.15, 0.45, 0.58));
  const carMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }));
  const carPositions: Array<[number, number]> = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 15; col++) {
      if ((row * 7 + col * 3) % 4 === 0) continue; // natural empty spaces
      carPositions.push([-22 + col * 3.1, -32.2 - row * 4.4]);
    }
  }
  const cars = new THREE.InstancedMesh(carGeo, carMat, carPositions.length);
  const carPalette = [
    new THREE.Color(0xf4f1ea),
    new THREE.Color(0xd5d2cb),
    new THREE.Color(0x52606d),
    new THREE.Color(0x3a4958),
    new THREE.Color(0xb86644),
  ];
  carPositions.forEach(([cx, cz], idx) => {
    dummy.position.set(cx, 0.25, cz);
    dummy.rotation.set(0, Math.PI / 2 + ((idx % 3) - 1) * 0.04, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    cars.setMatrixAt(idx, dummy.matrix);
    cars.setColorAt(idx, carPalette[idx % carPalette.length]);
  });
  cars.instanceMatrix.needsUpdate = true;
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  cars.castShadow = true;
  cars.receiveShadow = true;
  cars.computeBoundingSphere();
  root.add(cars);

  // Miniature Ground Service Equipment parked along apron edges (adds diorama life)
  const gseAmberMat = track(new THREE.MeshStandardMaterial({ color: 0xdfa234, roughness: 0.48 }));
  const gseWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.52 }));
  const gseSpots: Array<[number, number, number, boolean]> = [
    [-25.5, -13.2, 0.2, true],
    [-8.5, -13.4, -0.1, false],
    [8.5, -13.3, 0.15, true],
    [25.5, -13.2, -0.25, false],
  ];
  for (const [gx, gz, rot, isAmber] of gseSpots) {
    const cart = new THREE.Group();
    cart.position.set(gx, 0.06, gz);
    cart.rotation.y = rot;
    const base = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.5, 0.52, 0.82)),
      isAmber ? gseAmberMat : gseWhiteMat,
    );
    base.position.y = 0.34;
    base.castShadow = true;
    cart.add(base);
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(0.75, 0.32, 0.72)), darkMetalMat);
    roof.position.set(0.25, 0.72, 0);
    cart.add(roof);
    root.add(cart);
  }

  // =========================================================================
  // 9. INSTANCED ARCHITECTURAL SCALE-MODEL TREES (Perimeter & Groves)
  // =========================================================================
  const treeCoords: Array<[number, number]> = [
    // Around tower & west lawn
    [-41, -7], [-43, -10], [-39, -23], [-42, -26], [-36, -28], [-54, -8],
    [-57, -14], [-55, -24], [-60, -18], [-32, -33], [-36, -38], [-29, -40],
    // Behind landside parking & north groves
    [-24, -46], [-11, -45], [-6, -48], [2, -45], [8, -47], [24, -44],
    [29, -39], [34, -33], [32, -26], [35, -19], [38, -28], [41, -36],
    [52, -12], [56, -18], [55, -26], [61, -22], [58, -8], [48, -37],
    // Small architectural accent trees along apron-grass borders (well clear of wings!)
    [-33, -2], [-35, 1], [37, -6], [39, -3], [41, -9],
    // Far south lawn beyond runway (creates natural diorama depth)
    [-54, 32], [-42, 34], [-28, 36], [-14, 33], [6, 35], [22, 34], [38, 36], [54, 33],
    [-48, 42], [-22, 44], [12, 43], [34, 45], [60, 41],
    [-64, 10], [-66, 2], [-63, -4], [62, 4], [65, 12], [63, -4],
  ];

  const trunkGeo = track(new THREE.CylinderGeometry(0.14, 0.22, 1.25, 7));
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x6f5b48, roughness: 0.92 }));
  const canopyGeo = track(new THREE.DodecahedronGeometry(1.15, 1));
  const canopyMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }));

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCoords.length);

  const treePalette = [
    new THREE.Color(0x556b50),
    new THREE.Color(0x637a5b),
    new THREE.Color(0x4b6048),
    new THREE.Color(0x6d8262),
    new THREE.Color(0x5c7253),
  ];

  treeCoords.forEach(([tx, tz], i) => {
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const scale = 0.85 + frac * 0.34; // ±15% natural scale variation

    dummy.position.set(tx, 0.62 * scale, tz);
    dummy.rotation.set(0, frac * Math.PI * 2, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, 1.85 * scale, tz);
    dummy.rotation.set(frac * 0.3, frac * Math.PI * 2, frac * 0.2);
    dummy.scale.set(scale * 1.05, scale * 1.22, scale * 1.05);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
    canopies.setColorAt(i, treePalette[i % treePalette.length]);
  });

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.castShadow = true;
  canopies.castShadow = true;
  canopies.receiveShadow = true;
  trunks.computeBoundingSphere();
  canopies.computeBoundingSphere();
  root.add(trunks);
  root.add(canopies);

  return {
    root,
    jetbridges,
    towerBeacon,
    radarDome,
    guardLights,
    disposables,
  };
}
