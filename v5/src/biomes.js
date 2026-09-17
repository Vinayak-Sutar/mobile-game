// Biomes: the terrain, palette and atmosphere a run takes place in.
//
// Each biome supplies parameters rather than its own draw code, so adding a
// fifth is a data change. Three layers give each one its identity:
//
//   floor    parameters for the procedural floor texture
//   rock     parameters for obstacles, plus how they're capped
//   ambient  a drifting mote field that sells the air of the place
//
// These are purely cosmetic right now. Nothing here touches damage, spawn
// tables or pacing — the balance pass was measured against a fixed set of
// numbers and I did not want biome choice quietly undoing it.

import { arenaBounds } from './state.js';
import { TAU, rand, clamp, lerp } from './util.js';

export const BIOMES = [
  {
    id: 'ember',
    name: 'Emberfall',
    tagline: 'Basalt and slow lava. The air tastes of iron.',
    seed: 11,
    accent: '#ff8a3d',
    wallTint: 'hsla(20,55%,55%,0.55)',
    fog: 'rgba(16,5,2,0.52)',
    floor: {
      hue: 18, sat: 0.30, light: 7, seams: 0.34,
      // Ridged noise glowing through the cracks reads as cooling magma.
      veins: { rgb: [140, 46, 8], scale: 6, sharpness: 13, strength: 0.5 },
    },
    rock: { hue: 16, sat: 0.24, light: 13 },
    rockCap: { color: 'hsla(24,70%,52%,0.30)', radius: 4 },
    ambient: {
      count: 46, color: '#ff9a4d', size: [1.1, 2.6],
      driftX: 8, driftY: -26, jitter: 12, twinkle: 3.2, alpha: 0.55,
    },
  },
  {
    id: 'verdant',
    name: 'The Sunken Grove',
    tagline: 'Moss over old stone. Something is still growing here.',
    seed: 29,
    accent: '#7dff9c',
    wallTint: 'hsla(120,40%,52%,0.5)',
    fog: 'rgba(5,16,9,0.46)',
    floor: {
      hue: 116, sat: 0.20, light: 9, seams: 0.26,
      // Soft patches of a second material creeping over the slabs.
      blotch: { hue: 104, sat: 0.36, light: 13, threshold: 0.50, sharpness: 4.2 },
    },
    rock: { hue: 112, sat: 0.18, light: 14 },
    rockCap: { color: 'hsla(108,45%,45%,0.42)', radius: 12 },
    ambient: {
      count: 38, color: '#a8ffb8', size: [1.4, 3.0],
      driftX: -10, driftY: -6, jitter: 18, twinkle: 1.4, alpha: 0.42,
    },
  },
  {
    id: 'frost',
    name: 'Frostwake',
    tagline: 'Blue ice over black water. Every step echoes.',
    seed: 47,
    accent: '#9fe8ff',
    wallTint: 'hsla(200,60%,70%,0.5)',
    fog: 'rgba(6,14,24,0.44)',
    floor: {
      hue: 202, sat: 0.22, light: 12, seams: 0.22,
      veins: { rgb: [58, 104, 136], scale: 8, sharpness: 12, strength: 0.45 },
      speck: { rgb: [170, 220, 255], count: 200 },
    },
    rock: { hue: 200, sat: 0.20, light: 18 },
    rockCap: { color: 'hsla(196,70%,80%,0.34)', radius: 3 },
    ambient: {
      count: 54, color: '#dff4ff', size: [1.0, 2.4],
      driftX: -22, driftY: 18, jitter: 10, twinkle: 0.8, alpha: 0.5,
    },
  },
  {
    id: 'umbral',
    name: 'The Umbral Deep',
    tagline: 'No floor you can name. The dark is watching back.',
    seed: 83,
    accent: '#c07bff',
    wallTint: 'hsla(272,55%,64%,0.5)',
    fog: 'rgba(8,3,18,0.5)',
    floor: {
      hue: 272, sat: 0.28, light: 6, seams: 0.18,
      speck: { rgb: [140, 100, 210], count: 380 },
    },
    rock: { hue: 270, sat: 0.26, light: 11 },
    rockCap: { color: 'hsla(276,60%,60%,0.34)', radius: 2 },
    ambient: {
      count: 44, color: '#c9a6ff', size: [1.0, 2.8],
      driftX: 6, driftY: 4, jitter: 8, twinkle: 2.4, alpha: 0.5,
    },
  },
];

export function getBiome(id) {
  return BIOMES.find((b) => b.id === id) || BIOMES[0];
}

// --- ambient motes ---------------------------------------------------------
//
// A fixed pool that wraps at the arena edges. No spawning or despawning, so
// the cost is constant and it never competes with the combat particle budget.

let motes = [];
let current = null;

function reseed(m, biome, anywhere) {
  const b = arenaBounds();
  const w = b.r - b.l, h = b.b - b.t;
  const a = biome.ambient;

  if (anywhere) {
    m.x = b.l + Math.random() * w;
    m.y = b.t + Math.random() * h;
  } else {
    // Re-enter from whichever edge the drift is coming from.
    if (Math.abs(a.driftX) > Math.abs(a.driftY)) {
      m.x = a.driftX > 0 ? b.l - 8 : b.r + 8;
      m.y = b.t + Math.random() * h;
    } else {
      m.x = b.l + Math.random() * w;
      m.y = a.driftY > 0 ? b.t - 8 : b.b + 8;
    }
  }
  m.size = rand(a.size[0], a.size[1]);
  m.vx = rand(-a.jitter, a.jitter);
  m.vy = rand(-a.jitter, a.jitter);
  m.phase = rand(0, TAU);
  m.rate = rand(0.5, 1.5) * a.twinkle;
  m.depth = rand(0.5, 1);       // parallax: nearer motes drift faster
}

export function initAmbient(biome) {
  current = biome;
  motes = [];
  for (let i = 0; i < biome.ambient.count; i++) {
    const m = {};
    reseed(m, biome, true);
    motes.push(m);
  }
}

export function updateAmbient(dt, biome = current) {
  if (!biome || motes.length === 0) return;
  const a = biome.ambient;
  const b = arenaBounds();
  const pad = 14;

  for (const m of motes) {
    m.x += (a.driftX + m.vx) * m.depth * dt;
    m.y += (a.driftY + m.vy) * m.depth * dt;
    m.phase += m.rate * dt;
    // Gentle sway keeps the field from looking like it's on rails.
    m.x += Math.sin(m.phase * 0.6) * 6 * dt;

    if (m.x < b.l - pad || m.x > b.r + pad || m.y < b.t - pad || m.y > b.b + pad) {
      reseed(m, biome, false);
    }
  }
}

export function drawAmbient(ctx, biome = current) {
  if (!biome || motes.length === 0) return;
  const a = biome.ambient;
  ctx.fillStyle = a.color;
  for (const m of motes) {
    const twinkle = 0.55 + Math.sin(m.phase) * 0.45;
    ctx.globalAlpha = a.alpha * twinkle * m.depth;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size * m.depth, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function clearAmbient() {
  motes = [];
  current = null;
}
