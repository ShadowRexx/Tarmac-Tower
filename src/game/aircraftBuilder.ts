import * as THREE from 'three';
import type { LiveryStyle } from '../types/atc';

export interface AircraftRig {
  root: THREE.Group;
  airframe: THREE.Group;
  landingGear: THREE.Group;
  selectionRing: THREE.Mesh;
  contactShadow: THREE.Mesh;
  beaconLight: THREE.Mesh;
  strobeLight: THREE.Mesh;
  hitbox: THREE.Mesh;
  tug: THREE.Group;
}

/**
 * Shared procedural geometries so multiple airliners stay ultra-lightweight on GPU/CPU.
 */
interface SharedAircraftGeometries {
  fuselage: THREE.BufferGeometry;
  wingLeft: THREE.BufferGeometry;
  wingRight: THREE.BufferGeometry;
  tailFin: THREE.BufferGeometry;
  hStabLeft: THREE.BufferGeometry;
  hStabRight: THREE.BufferGeometry;
  engineNacelle: THREE.BufferGeometry;
  engineRing: THREE.BufferGeometry;
  engineCore: THREE.BufferGeometry;
  hitbox: THREE.BoxGeometry;
  ring: THREE.RingGeometry;
}

let cachedGeoms: SharedAircraftGeometries | null = null;

function createSweptWingGeometry(side: 1 | -1): THREE.ExtrudeGeometry {
  // Wing shape in XZ plane (built in XY, rotated onto XZ).
  // side = +1 => Starboard (+Z), side = -1 => Port (-Z)
  const s = new THREE.Shape();
  s.moveTo(1.2, 0.28);
  s.lineTo(-1.1, 0.28);
  s.lineTo(-2.45, 3.65);
  s.lineTo(-1.85, 3.72);
  s.lineTo(0.35, 0.72);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 2,
  });

  // Rotate from XY plane into XZ plane
  if (side === 1) {
    geo.rotateX(Math.PI / 2);
  } else {
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.12, 0);
  }

  // Subtle upward wing dihedral
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    pos.setY(i, y + Math.abs(z) * 0.055);
  }
  geo.computeVertexNormals();
  return geo;
}

function createStabilizerGeometry(side: 1 | -1): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.45, 0.14);
  s.lineTo(-0.35, 0.14);
  s.lineTo(-0.98, 1.48);
  s.lineTo(-0.56, 1.52);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });

  if (side === 1) {
    geo.rotateX(Math.PI / 2);
  } else {
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.07, 0);
  }
  geo.computeVertexNormals();
  return geo;
}

function createTailFinGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.9, 0);
  s.lineTo(-0.75, 0);
  s.lineTo(-1.45, 1.82);
  s.lineTo(-0.78, 1.86);
  s.lineTo(0.28, 0.48);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.06);
  geo.computeVertexNormals();
  return geo;
}

function createFuselageGeometry(): THREE.BufferGeometry {
  // Smooth commercial airliner profile along Y (from tail -3.6 to nose +3.7), then rotated onto +X
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -3.55),
    new THREE.Vector2(0.11, -3.45),
    new THREE.Vector2(0.26, -2.85),
    new THREE.Vector2(0.44, -2.05),
    new THREE.Vector2(0.51, -1.25),
    new THREE.Vector2(0.52, 1.95),
    new THREE.Vector2(0.49, 2.55),
    new THREE.Vector2(0.39, 3.05),
    new THREE.Vector2(0.22, 3.45),
    new THREE.Vector2(0.08, 3.64),
    new THREE.Vector2(0.0, 3.7),
  ];
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.rotateZ(-Math.PI / 2); // Align nose along +X
  geo.scale(1, 1.06, 0.96); // Slight authentic vertical oval cross-section
  geo.computeVertexNormals();
  return geo;
}

function getSharedGeometries(): SharedAircraftGeometries {
  if (cachedGeoms) return cachedGeoms;

  cachedGeoms = {
    fuselage: createFuselageGeometry(),
    wingLeft: createSweptWingGeometry(-1),
    wingRight: createSweptWingGeometry(1),
    tailFin: createTailFinGeometry(),
    hStabLeft: createStabilizerGeometry(-1),
    hStabRight: createStabilizerGeometry(1),
    engineNacelle: new THREE.CylinderGeometry(0.23, 0.2, 0.95, 16),
    engineRing: new THREE.TorusGeometry(0.225, 0.032, 10, 18),
    engineCore: new THREE.CylinderGeometry(0.18, 0.14, 0.25, 14),
    hitbox: new THREE.BoxGeometry(8.2, 3.2, 8.2),
    ring: new THREE.RingGeometry(4.15, 4.55, 48),
  };

  cachedGeoms.engineNacelle.rotateZ(Math.PI / 2);
  cachedGeoms.engineRing.rotateY(Math.PI / 2);
  cachedGeoms.engineCore.rotateZ(Math.PI / 2);
  cachedGeoms.ring.rotateX(-Math.PI / 2);

  return cachedGeoms;
}

/**
 * Builds a sleek miniature pushback tractor (tug) that connects to the nose wheel during pushback.
 */
function createPushbackTug(): THREE.Group {
  const tug = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe6a832,
    roughness: 0.42,
    metalness: 0.12,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x262c33,
    roughness: 0.72,
    metalness: 0.15,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2c4254,
    roughness: 0.15,
    metalness: 0.65,
  });

  // Low-profile chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.38, 0.88), bodyMat);
  chassis.position.set(0, 0.29, 0);
  chassis.castShadow = true;
  tug.add(chassis);

  // Angled operator cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.34, 0.78), glassMat);
  cab.position.set(0.25, 0.58, 0);
  cab.castShadow = true;
  tug.add(cab);

  // Towbar connecting back toward aircraft nose wheel
  const towbar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.35, 8), darkMat);
  towbar.rotation.z = Math.PI / 2;
  towbar.position.set(-1.25, 0.22, 0);
  tug.add(towbar);

  // Four wheels
  const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelCoords: Array<[number, number]> = [
    [-0.48, 0.44],
    [-0.48, -0.44],
    [0.48, 0.44],
    [0.48, -0.44],
  ];
  for (const [wx, wz] of wheelCoords) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.16, wz);
    tug.add(wheel);
  }

  tug.position.set(4.55, 0, 0);
  tug.visible = false;
  return tug;
}

/**
 * Assembles a polished 12-part stylized 3D commercial airliner oriented with nose along +X
 * and grounded at bottom-center (Y = 0 at tire contact patch).
 */
export function buildAircraftModel(
  aircraftId: string,
  livery: LiveryStyle,
  contactShadowTex: THREE.CanvasTexture,
): AircraftRig {
  const geoms = getSharedGeometries();

  const root = new THREE.Group();
  root.userData.aircraftId = aircraftId;

  // Airframe group pivots slightly above gear for smooth rotation pitch on takeoff
  const airframe = new THREE.Group();
  airframe.position.y = 0.92;
  root.add(airframe);

  // Materials with deliberate roughness/metalness contrast
  const fuselageMat = new THREE.MeshStandardMaterial({
    color: livery.fuselageColor,
    roughness: 0.32,
    metalness: 0.08,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xe8e6e0,
    roughness: 0.38,
    metalness: 0.16,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: livery.tailColor,
    roughness: 0.34,
    metalness: 0.1,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: livery.accentColor,
    roughness: 0.3,
    metalness: 0.15,
  });
  const cockpitMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2634,
    roughness: 0.12,
    metalness: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const metalLipMat = new THREE.MeshStandardMaterial({
    color: 0xd0d6dc,
    roughness: 0.22,
    metalness: 0.85,
  });
  const darkCoreMat = new THREE.MeshStandardMaterial({
    color: 0x1b2026,
    roughness: 0.78,
    metalness: 0.2,
  });

  // 1. Primary Silhouette: Tapered Fuselage
  const fuselage = new THREE.Mesh(geoms.fuselage, fuselageMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  airframe.add(fuselage);

  // 2. Cockpit Windshield Band (Recessed sleek dark visor)
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.455, 16, 12, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.24, Math.PI * 0.2),
    cockpitMat,
  );
  cockpit.position.set(2.74, 0.14, 0);
  cockpit.scale.set(1.25, 0.85, 0.92);
  airframe.add(cockpit);

  // Subtle airline cheatline stripe along fuselage
  const cheatline = new THREE.Mesh(new THREE.CylinderGeometry(0.525, 0.525, 3.6, 20, 1, true), accentMat);
  cheatline.rotation.z = Math.PI / 2;
  cheatline.scale.set(1, 0.15, 0.975);
  cheatline.position.set(0.35, -0.02, 0);
  airframe.add(cheatline);

  // 3. Swept Main Wings (Port & Starboard)
  const wingLeft = new THREE.Mesh(geoms.wingLeft, wingMat);
  wingLeft.position.set(0.15, -0.18, 0);
  wingLeft.castShadow = true;
  wingLeft.receiveShadow = true;
  airframe.add(wingLeft);

  const wingRight = new THREE.Mesh(geoms.wingRight, wingMat);
  wingRight.position.set(0.15, -0.18, 0);
  wingRight.castShadow = true;
  wingRight.receiveShadow = true;
  airframe.add(wingRight);

  // 4. Sculpted Canted Winglets (in livery tail color)
  const wingletGeo = new THREE.BoxGeometry(0.42, 0.44, 0.06);
  const wingletL = new THREE.Mesh(wingletGeo, tailMat);
  wingletL.position.set(-2.0, 0.21, -3.72);
  wingletL.rotation.set(-0.24, 0.22, -0.22);
  wingletL.castShadow = true;
  airframe.add(wingletL);

  const wingletR = new THREE.Mesh(wingletGeo, tailMat);
  wingletR.position.set(-2.0, 0.21, 3.72);
  wingletR.rotation.set(0.24, -0.22, -0.22);
  wingletR.castShadow = true;
  airframe.add(wingletR);

  // 5. Vertical Tail Fin + Accent Stripe
  const tailFin = new THREE.Mesh(geoms.tailFin, tailMat);
  tailFin.position.set(-2.22, 0.34, 0);
  tailFin.castShadow = true;
  tailFin.receiveShadow = true;
  airframe.add(tailFin);

  // 6. Horizontal Stabilizers
  const hStabL = new THREE.Mesh(geoms.hStabLeft, wingMat);
  hStabL.position.set(-2.72, 0.16, 0);
  hStabL.castShadow = true;
  airframe.add(hStabL);

  const hStabR = new THREE.Mesh(geoms.hStabRight, wingMat);
  hStabR.position.set(-2.72, 0.16, 0);
  hStabR.castShadow = true;
  airframe.add(hStabR);

  // 7. Twin Under-Wing Turbofan Engines (Nacelle + Metallic Intake Lip + Dark Core + Pylon)
  for (const side of [-1, 1] as const) {
    const engineGroup = new THREE.Group();
    engineGroup.position.set(0.55, -0.34, side * 1.48);

    const nacelle = new THREE.Mesh(geoms.engineNacelle, fuselageMat);
    nacelle.castShadow = true;
    engineGroup.add(nacelle);

    const intakeRing = new THREE.Mesh(geoms.engineRing, metalLipMat);
    intakeRing.position.x = 0.47;
    engineGroup.add(intakeRing);

    const core = new THREE.Mesh(geoms.engineCore, darkCoreMat);
    core.position.x = 0.35;
    engineGroup.add(core);

    const exhaust = new THREE.Mesh(geoms.engineCore, metalLipMat);
    exhaust.scale.set(0.85, 0.72, 0.72);
    exhaust.position.x = -0.5;
    engineGroup.add(exhaust);

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.08), wingMat);
    pylon.position.set(-0.08, 0.22, 0);
    engineGroup.add(pylon);

    airframe.add(engineGroup);
  }

  // 8. Retractable Landing Gear (Nose strut + twin main gear struts & tires)
  const landingGear = new THREE.Group();
  const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.56, 8);
  const wheelGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12);
  wheelGeo.rotateX(Math.PI / 2);

  // Nose Gear
  const noseStrut = new THREE.Mesh(strutGeo, metalLipMat);
  noseStrut.position.set(2.38, -0.58, 0);
  landingGear.add(noseStrut);

  const noseWheel = new THREE.Mesh(wheelGeo, darkCoreMat);
  noseWheel.position.set(2.38, -0.8, 0);
  landingGear.add(noseWheel);

  // Main Gear (Port & Starboard)
  for (const side of [-1, 1] as const) {
    const mainStrut = new THREE.Mesh(strutGeo, metalLipMat);
    mainStrut.position.set(-0.18, -0.56, side * 0.72);
    landingGear.add(mainStrut);

    const mainWheel1 = new THREE.Mesh(wheelGeo, darkCoreMat);
    mainWheel1.position.set(-0.18, -0.78, side * 0.65);
    landingGear.add(mainWheel1);

    const mainWheel2 = new THREE.Mesh(wheelGeo, darkCoreMat);
    mainWheel2.position.set(-0.18, -0.78, side * 0.8);
    landingGear.add(mainWheel2);
  }
  airframe.add(landingGear);

  // 9. Navigation Lights: Port Red (-Z), Starboard Green (+Z), Dorsal Red Beacon, Tail White Strobe
  const navGeo = new THREE.SphereGeometry(0.085, 10, 10);

  const portLight = new THREE.Mesh(
    navGeo,
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  portLight.position.set(-1.95, 0.12, -3.76);
  airframe.add(portLight);

  const starboardLight = new THREE.Mesh(
    navGeo,
    new THREE.MeshBasicMaterial({ color: 0x34d399 }),
  );
  starboardLight.position.set(-1.95, 0.12, 3.76);
  airframe.add(starboardLight);

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff453a });
  const beaconLight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), beaconMat);
  beaconLight.position.set(0.3, 0.56, 0);
  airframe.add(beaconLight);

  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strobeLight = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), strobeMat);
  strobeLight.position.set(-3.55, 0.15, 0);
  airframe.add(strobeLight);

  // 10. Soft Contact Shadow Grounding Plane
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 8.6), shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.08;
  root.add(contactShadow);

  // 11. Subtle Architectural Selection Ring (visible only when aircraft is selected)
  const selectionRingMat = new THREE.MeshBasicMaterial({
    color: 0xd97748,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const selectionRing = new THREE.Mesh(geoms.ring, selectionRingMat);
  selectionRing.position.y = 0.11;
  selectionRing.visible = false;
  root.add(selectionRing);

  // 12. Pushback Tug (toggled visible during pushback state)
  const tug = createPushbackTug();
  root.add(tug);

  // Invisible generous raycast proxy box for effortless touch & click picking
  const hitbox = new THREE.Mesh(
    geoms.hitbox,
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.set(0, 1.35, 0);
  hitbox.userData.aircraftId = aircraftId;
  root.add(hitbox);

  // Tag all child meshes with aircraftId for direct mesh raycasting fallback
  root.traverse((obj) => {
    obj.userData.aircraftId = aircraftId;
  });

  return {
    root,
    airframe,
    landingGear,
    selectionRing,
    contactShadow,
    beaconLight,
    strobeLight,
    hitbox,
    tug,
  };
}
