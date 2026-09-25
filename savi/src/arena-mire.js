// The Mire: Mawgrim's arena, a flooded hall of black swamp water.
//
// Built on the water engine (water-engine.js): a live wave simulation across
// the whole floor that the player, every enemy and the crocodile's dives,
// rolls and eruptions disturb. This file is only what makes it a swamp - the
// colour of the water, the reeds and mangrove roots, the fireflies, the mist,
// the drips, and two lily pads (more were a distraction).
//
// Purely cosmetic: nothing here changes how the fight plays.

import { TAU } from './util.js';
import { createWaterArena } from './water-engine.js';

/** Reeds, cattails and mangrove roots around the edges, drawn once. */
function makeReeds(b) {
  const pad = 26;
  const c = document.createElement('canvas');
  c.width = Math.ceil(b.r - b.l + pad * 2);
  c.height = Math.ceil(b.b - b.t + pad * 2);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;

  // Mangrove roots arching out of the corners.
  g.lineCap = 'round';
  const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    for (let k = 0; k < 6; k++) {
      const len = 60 + Math.random() * 90;
      const a = Math.atan2(sy, sx) + (Math.random() - 0.5) * 1.3;
      const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      g.strokeStyle = k % 2 ? '#1b140f' : '#2a2016';
      g.lineWidth = 5 + Math.random() * 6;
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(a + 0.5) * len * 0.6, cy + Math.sin(a + 0.5) * len * 0.6, ex, ey);
      g.stroke();
    }
  }

  // Reed tufts along every wall, leaning into the water.
  const tuft = (x, y, lean) => {
    const n = 4 + ((Math.random() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const a = lean + (Math.random() - 0.5) * 1.2;
      const len = 14 + Math.random() * 22;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      g.strokeStyle = Math.random() < 0.5 ? '#2f4a1f' : '#3e5e27';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a - 0.3) * len * 0.5, y + Math.sin(a - 0.3) * len * 0.5, ex, ey);
      g.stroke();
      if (Math.random() < 0.18) {
        g.fillStyle = '#5a3a22';
        g.beginPath();
        g.ellipse(ex, ey, 2.4, 5, a + Math.PI / 2, 0, TAU);
        g.fill();
      }
    }
  };
  for (let x = 20; x < W - 20; x += 26 + Math.random() * 30) {
    tuft(x, pad - 2, Math.PI / 2);
    tuft(x, H - pad + 2, -Math.PI / 2);
  }
  for (let y = 20; y < H - 20; y += 26 + Math.random() * 30) {
    tuft(pad - 2, y, 0);
    tuft(W - pad + 2, y, Math.PI);
  }
  return { canvas: c, pad };
}

/** Black-green swamp water: opaque, lit by its own slopes. */
function shadeMire(d, p, t, l, lap, x, y, time, solid) {
  let r = 10 + t * 24, g = 27 + t * 34, b = 28 + t * 18;
  if (solid) { d[p] = r * 0.5; d[p + 1] = g * 0.5; d[p + 2] = b * 0.5; d[p + 3] = 255; return; }
  if (l > 0) {
    // Soft, capped glints tinted with the swamp, as in the Drowned Vault:
    // white crests read as attacks.
    const q = Math.min(l, 0.7);
    r += q * 28; g += q * 54; b += q * 44;
  } else {
    const k = 1 + l * 0.5;
    r *= k; g *= k; b *= k;
  }
  d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
}

const MIRE = createWaterArena({
  shade: shadeMire,
  deco: makeReeds,
  pads: 2,
  flies: 14,
  mists: 5,
  drip: { min: 0.18, max: 0.5, amt: -0.5 },
  sheen: '180,230,220',
  light: 0.8,
  rippleAlpha: 0.4,
  rippleColor: '#8fc4a8',
});

/** Hooks for the crocodile's spec: `drawArena` and `arenaTick`. */
export const MIRE_ARENA = { draw: MIRE.draw, tick: MIRE.tick };
export const mireSplash = MIRE.splash;
export const mireRing = MIRE.ring;
export const mireWake = MIRE.wake;
export const mireBubble = MIRE.bubble;
