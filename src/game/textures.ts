import * as THREE from 'three';
import { AIRPORT_LAYOUT, GATES, GATE_IDS } from './airportGraph';

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Muted sage-green architectural scale-model turf (#8fa38a) with gentle mowed strips
 * and subtle organic matte paper grain.
 */
export function createTerrainTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#8fa38a';
  ctx.fillRect(0, 0, size, size);

  // Subtle mowed airfield turf bands
  const stripeCount = 16;
  const stripeW = size / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 250, 240, 0.035)' : 'rgba(42, 58, 44, 0.035)';
    ctx.fillRect(i * stripeW, 0, stripeW, size);
  }

  // Fine matte architectural board speckle
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const light = Math.random() > 0.5;
    ctx.fillStyle = light ? 'rgba(235, 240, 226, 0.045)' : 'rgba(54, 70, 56, 0.045)';
    ctx.fillRect(x, y, 2, 2);
  }

  return finalizeColorTexture(canvas, anisotropy, 10, 10);
}

/**
 * Warm matte concrete apron texture with expansion joints, gate clearance boxes,
 * yellow painted lead-in lines, stop bars, and crisp stand labels G1 / G2 / G3.
 */
export function createApronTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 2048;
  const h = 768;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Base warm architectural concrete
  ctx.fillStyle = '#e5e1d8';
  ctx.fillRect(0, 0, w, h);

  // Subtle concrete slab grid
  const cols = 32;
  const rows = 12;
  const cw = w / cols;
  const rh = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shade = ((r * 7 + c * 13) % 5) - 2;
      ctx.fillStyle = shade > 0 ? 'rgba(255,252,246,0.035)' : 'rgba(90,84,74,0.025)';
      ctx.fillRect(c * cw, r * rh, cw, rh);
    }
  }

  ctx.strokeStyle = 'rgba(138, 132, 121, 0.24)';
  ctx.lineWidth = 2;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rh);
    ctx.lineTo(w, r * rh);
    ctx.stroke();
  }

  // Helper to convert world (x, z) into apron canvas pixels
  const apronLeft = AIRPORT_LAYOUT.apronCenterX - AIRPORT_LAYOUT.apronWidth / 2;
  const apronTop = AIRPORT_LAYOUT.apronCenterZ - AIRPORT_LAYOUT.apronDepth / 2;
  const toPxX = (wx: number) => ((wx - apronLeft) / AIRPORT_LAYOUT.apronWidth) * w;
  const toPxY = (wz: number) => ((wz - apronTop) / AIRPORT_LAYOUT.apronDepth) * h;

  // Service road behind stands (near terminal edge)
  const roadY = toPxY(-14.6);
  ctx.fillStyle = 'rgba(182, 178, 168, 0.45)';
  ctx.fillRect(0, roadY - 18, w, 36);
  ctx.strokeStyle = 'rgba(248, 246, 240, 0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(20, roadY);
  ctx.lineTo(w - 20, roadY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Outer perimeter edge markings (subtle double yellow/grey line)
  ctx.strokeStyle = 'rgba(220, 175, 62, 0.65)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Horizontal apron taxilane centerline connecting gates to Taxiway Alpha
  const laneY = toPxY(AIRPORT_LAYOUT.taxiwayZ);
  ctx.strokeStyle = '#d9a938';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, laneY);
  ctx.lineTo(w, laneY);
  ctx.stroke();

  // Draw Gate Stands G1, G2, G3
  for (const gateId of GATE_IDS) {
    const gate = GATES[gateId];
    const gx = toPxX(gate.x);
    const gz = toPxY(gate.z);
    const noseStopY = toPxY(gate.z - 2.2);

    // Subtle darkened oil/tire wear spot at gate center
    const wearGrad = ctx.createRadialGradient(gx, gz + 16, 6, gx, gz + 16, 110);
    wearGrad.addColorStop(0, 'rgba(62, 64, 66, 0.14)');
    wearGrad.addColorStop(1, 'rgba(62, 64, 66, 0)');
    ctx.fillStyle = wearGrad;
    ctx.beginPath();
    ctx.arc(gx, gz + 16, 110, 0, Math.PI * 2);
    ctx.fill();

    // Red-white safety clearance boundary polygon around stand
    const halfBoxW = (6.6 / AIRPORT_LAYOUT.apronWidth) * w;
    const boxTop = toPxY(gate.z - 4.0);
    const boxBot = toPxY(gate.z + 5.2);
    ctx.strokeStyle = 'rgba(196, 92, 68, 0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.strokeRect(gx - halfBoxW, boxTop, halfBoxW * 2, boxBot - boxTop);
    ctx.setLineDash([]);

    // Painted Yellow Lead-In Line sweeping smoothly from Taxiway Alpha into Stand
    ctx.strokeStyle = '#e0af38';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, noseStopY);
    ctx.lineTo(gx, gz + 75);
    ctx.quadraticCurveTo(gx, laneY, gx + 155, laneY);
    ctx.stroke();

    // Secondary entry arc from the other direction
    ctx.beginPath();
    ctx.moveTo(gx, gz + 75);
    ctx.quadraticCurveTo(gx, laneY, gx - 155, laneY);
    ctx.stroke();

    // Yellow nose-wheel stop bar ticks
    ctx.strokeStyle = '#e0af38';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(gx - 28, noseStopY);
    ctx.lineTo(gx + 28, noseStopY);
    ctx.moveTo(gx - 18, noseStopY + 26);
    ctx.lineTo(gx + 18, noseStopY + 26);
    ctx.stroke();

    // Crisp Stand Number Box (G1, G2, G3) painted on tarmac ahead of stand
    const badgeX = gx - 94;
    const badgeY = toPxY(gate.z - 2.6);
    ctx.fillStyle = '#252c34';
    ctx.fillRect(badgeX - 40, badgeY - 26, 80, 52);
    ctx.strokeStyle = '#e0af38';
    ctx.lineWidth = 3;
    ctx.strokeRect(badgeX - 40, badgeY - 26, 80, 52);

    ctx.fillStyle = '#f6f3ec';
    ctx.font = '700 32px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gateId, badgeX, badgeY + 1);
  }

  return finalizeColorTexture(canvas, anisotropy);
}

/**
 * Dark charcoal asphalt runway (#1e242b) with crisp white threshold stripes,
 * aiming blocks, rubber touchdown skid marks, yellow blast chevrons,
 * runway designations (28L / 10R), and dashed white centerline.
 */
export function createRunwayTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 2048;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep charcoal asphalt base
  ctx.fillStyle = '#1e242b';
  ctx.fillRect(0, 0, w, h);

  // Subtle asphalt aggregate texture
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle paved longitudinal seam & shoulder shading
  ctx.fillStyle = 'rgba(15, 19, 24, 0.45)';
  ctx.fillRect(0, 0, w, 16);
  ctx.fillRect(0, h - 16, w, 16);

  // Yellow blast-pad chevrons on far ends
  ctx.strokeStyle = '#d4a238';
  ctx.lineWidth = 6;
  for (let i = 0; i < 3; i++) {
    const lx = 26 + i * 32;
    ctx.beginPath();
    ctx.moveTo(lx + 24, 34);
    ctx.lineTo(lx, h / 2);
    ctx.lineTo(lx + 24, h - 34);
    ctx.stroke();

    const rx = w - 26 - i * 32;
    ctx.beginPath();
    ctx.moveTo(rx - 24, 34);
    ctx.lineTo(rx, h / 2);
    ctx.lineTo(rx - 24, h - 34);
    ctx.stroke();
  }

  // Crisp white runway edge lines
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(126, 22, w - 252, 6);
  ctx.fillRect(126, h - 28, w - 252, 6);

  // Threshold piano-key bars (both ends)
  const drawThreshold = (startX: number) => {
    const barCount = 8;
    const margin = 36;
    const span = h - margin * 2;
    const step = span / barCount;
    ctx.fillStyle = '#f5f3ed';
    for (let i = 0; i < barCount; i++) {
      if (i === 3 || i === 4) {
        // slightly wider gap at centerline
      }
      const y = margin + i * step + 3;
      ctx.fillRect(startX, y, 66, step - 9);
    }
  };
  drawThreshold(148);
  drawThreshold(w - 148 - 66);

  // Runway Numbers (28L on west departure end, 10R on east end)
  ctx.save();
  ctx.translate(262, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#f2f0ea';
  ctx.font = '700 48px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('28L', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(w - 262, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#f2f0ea';
  ctx.font = '700 48px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('10R', 0, 0);
  ctx.restore();

  // Touchdown aiming point blocks
  const drawAimBlocks = (cx: number) => {
    ctx.fillStyle = '#f0eee8';
    ctx.fillRect(cx - 42, 46, 84, 24);
    ctx.fillRect(cx - 42, h - 70, 84, 24);
  };
  drawAimBlocks(460);
  drawAimBlocks(w - 460);

  // Touchdown zone paired hash stripes
  const drawTDZ = (cx: number) => {
    ctx.fillStyle = 'rgba(242, 240, 234, 0.88)';
    for (let k = 0; k < 2; k++) {
      const yTop = 52 + k * 14;
      const yBot = h - 62 - k * 14;
      ctx.fillRect(cx - 22, yTop, 44, 7);
      ctx.fillRect(cx - 22, yBot, 44, 7);
    }
  };
  drawTDZ(610);
  drawTDZ(760);
  drawTDZ(w - 610);
  drawTDZ(w - 760);

  // Subtle dark rubber tire skid marks in touchdown zones
  const drawSkids = (cx: number) => {
    const grad = ctx.createRadialGradient(cx, h / 2, 10, cx, h / 2, 190);
    grad.addColorStop(0, 'rgba(10, 12, 16, 0.55)');
    grad.addColorStop(1, 'rgba(10, 12, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 200, 42, 400, h - 84);
  };
  drawSkids(520);
  drawSkids(w - 520);

  // Crisp dashed white centerline
  ctx.strokeStyle = '#f5f3ed';
  ctx.lineWidth = 7;
  ctx.setLineDash([46, 36]);
  ctx.beginPath();
  ctx.moveTo(315, h / 2);
  ctx.lineTo(w - 315, h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  return finalizeColorTexture(canvas, anisotropy);
}

/**
 * Light warm concrete taxiway surface with crisp yellow centerline & edge striping.
 */
export function createTaxiwayTexture(anisotropy: number, repeatX = 8): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#dedad0';
  ctx.fillRect(0, 0, w, h);

  // Subtle slab seams
  ctx.strokeStyle = 'rgba(130, 124, 114, 0.22)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Subtle concrete shoulder darkening
  ctx.fillStyle = 'rgba(116, 112, 104, 0.16)';
  ctx.fillRect(0, 0, w, 20);
  ctx.fillRect(0, h - 20, w, 20);

  // Yellow double edge lines (subtle)
  ctx.fillStyle = 'rgba(218, 174, 62, 0.55)';
  ctx.fillRect(0, 22, w, 4);
  ctx.fillRect(0, h - 26, w, 4);

  // Primary Taxiway Yellow Centerline with thin dark casing
  ctx.fillStyle = 'rgba(35, 39, 44, 0.35)';
  ctx.fillRect(0, h / 2 - 9, w, 18);
  ctx.fillStyle = '#e0af38';
  ctx.fillRect(0, h / 2 - 6, w, 12);

  return finalizeColorTexture(canvas, anisotropy, repeatX, 1);
}

/**
 * Runway Hold-Short Pattern (ICAO/FAA: two solid + two dashed yellow lines on dark casing).
 */
export function createHoldShortTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#252b32';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#eab53a';
  // Two solid lines on taxiway side (top)
  ctx.fillRect(0, 18, w, 14);
  ctx.fillRect(0, 44, w, 14);

  // Two dashed lines on runway side (bottom)
  for (let x = 14; x < w; x += 64) {
    ctx.fillRect(x, 72, 38, 14);
    ctx.fillRect(x, 98, 38, 14);
  }

  return finalizeColorTexture(canvas, anisotropy);
}

/**
 * Soft radial ground contact shadow texture for grounding aircraft and ground vehicles.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(20, 25, 30, 0.52)');
  grad.addColorStop(0.55, 'rgba(20, 25, 30, 0.22)');
  grad.addColorStop(1, 'rgba(20, 25, 30, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
