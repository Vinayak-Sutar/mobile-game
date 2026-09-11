// Procedural texture generation.
//
// Everything here is drawn once into an offscreen canvas at boot and then used
// as a repeating fill pattern, so the per-frame cost is a single fillRect no
// matter how detailed the surface looks. Nothing ships as an image file.

import { TAU, clamp, lerp, rand, randInt } from './util.js';

// --- value noise -----------------------------------------------------------

/** Deterministic hash so a given seed always produces the same texture. */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Tileable value noise — sampling wraps at `period` so patterns seam cleanly. */
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v) => ((v % period) + period) % period;

  const v00 = hash2(w(xi), w(yi), seed);
  const v10 = hash2(w(xi + 1), w(yi), seed);
  const v01 = hash2(w(xi), w(yi + 1), seed);
  const v11 = hash2(w(xi + 1), w(yi + 1), seed);

  const sx = smooth(xf), sy = smooth(yf);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), lerp(v00, v01, sy) * 0 + sy);
}

/** Stacked octaves. `period` doubles per octave to stay tileable. */
function fbm(x, y, { octaves = 4, period = 8, seed = 1, gain = 0.5 } = {}) {
  let total = 0, amp = 1, norm = 0, per = period, freq = 1;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(x * freq, y * freq, per, seed + i * 97) * amp;
    norm += amp;
    amp *= gain;
    freq *= 2;
    per *= 2;
  }
  return total / norm;
}

// --- canvas helpers --------------------------------------------------------

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- textures --------------------------------------------------------------

/**
 * Cracked stone floor. Tiles seamlessly at `size`.
 * `hue` matches the room's palette so each chamber feels like a place.
 */
/**
 * One parameterised floor generator drives every biome. Four near-identical
 * copies of this function would drift apart the moment anyone tuned one.
 *
 *   veins   glowing seams — lava in Emberfall, fractures in Frostwake
 *   blotch  organic patches — moss
 *   speck   pinpoint sparkles — frost glitter, void stars
 */
export function biomeFloor({
  size = 256, hue = 250, sat = 0.19, light = 9, seed = 1,
  veins = null, blotch = null, speck = null, seams = 0.30,
} = {}) {
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // High frequency, low amplitude: reads as texture up close and as flat
      // tone across the room, so the tile repeat stays invisible.
      const n = fbm((x / size) * 16, (y / size) * 16, { octaves: 3, period: 16, seed });
      const grain = hash2(x, y, seed * 31);

      let l = light + (n - 0.5) * 3.2 + (grain - 0.5) * 2.6;
      let h = hue, sfinal = sat;

      if (blotch) {
        // Large soft patches of a second material sitting on the stone.
        const b = fbm((x / size) * 4, (y / size) * 4, { octaves: 3, period: 4, seed: seed + 77 });
        const k = clamp((b - blotch.threshold) * blotch.sharpness, 0, 1);
        if (k > 0) {
          h = lerp(h, blotch.hue, k);
          sfinal = lerp(sfinal, blotch.sat, k);
          l = lerp(l, blotch.light + (n - 0.5) * 3, k);
        }
      }

      const [r, g, bl] = hslToRgb(h / 360, clamp(sfinal, 0, 1), clamp(l, 2, 40) / 100);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = 255;
    }
  }

  // Ridged noise makes convincing cracks; additive so seams genuinely glow.
  if (veins) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = fbm((x / size) * veins.scale, (y / size) * veins.scale,
          { octaves: 3, period: veins.scale, seed: seed + 41 });
        const ridge = Math.pow(1 - Math.abs(v * 2 - 1), veins.sharpness);
        if (ridge < 0.05) continue;
        const k = clamp(ridge * veins.strength, 0, 1);
        const i = (y * size + x) * 4;
        d[i] = clamp(d[i] + veins.rgb[0] * k, 0, 255);
        d[i + 1] = clamp(d[i + 1] + veins.rgb[1] * k, 0, 255);
        d[i + 2] = clamp(d[i + 2] + veins.rgb[2] * k, 0, 255);
      }
    }
  }

  if (speck) {
    for (let i = 0; i < speck.count; i++) {
      const px = Math.floor(hash2(i, 5, seed) * size);
      const py = Math.floor(hash2(i, 11, seed) * size);
      const k = 0.4 + hash2(i, 19, seed) * 0.6;
      const o = (py * size + px) * 4;
      d[o] = clamp(d[o] + speck.rgb[0] * k, 0, 255);
      d[o + 1] = clamp(d[o + 1] + speck.rgb[1] * k, 0, 255);
      d[o + 2] = clamp(d[o + 2] + speck.rgb[2] * k, 0, 255);
    }
  }

  ctx.putImageData(img, 0, 0);

  // Slab seams. Four across the tile keeps the repeat hard to spot.
  const step = size / 4;
  ctx.strokeStyle = `rgba(0,0,0,${seams})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= size; i += step) {
    ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size);
    ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = `hsla(${hue},25%,60%,0.05)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= size; i += step) {
    ctx.moveTo(i + 2, 0); ctx.lineTo(i + 2, size);
    ctx.moveTo(0, i + 2); ctx.lineTo(size, i + 2);
  }
  ctx.stroke();

  // Chips off the seam grid, to break the regularity.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.10 + hash2(i, 23, seed) * 0.14})`;
    ctx.beginPath();
    ctx.arc(hash2(i, 3, seed) * size, hash2(i, 9, seed) * size, 1 + hash2(i, 17, seed) * 2.4, 0, TAU);
    ctx.fill();
  }
  return cv;
}

/** Backwards-compatible plain stone, used by the texture baker. */
export function stoneFloor(opts = {}) {
  return biomeFloor(opts);
}

/** Rough rock face for pillars and obstacles. */
export function rockTexture({ size = 96, hue = 250, sat = 0.16, light = 17, seed = 7 } = {}) {
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 6, v = (y / size) * 6;
      const n = fbm(u, v, { octaves: 4, period: 6, seed, gain: 0.5 });
      const facet = Math.floor(n * 4) / 4;      // quantised for a chiselled look
      const l = clamp(light + facet * 11 + hash2(x, y, seed * 7) * 3.5, 4, 42);
      const [r, g, b] = hslToRgb(hue / 360, sat, l / 100);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Soft radial particle sprite — cheaper than drawing gradients per particle. */
export function softDot({ size = 64, color = '#ffffff' } = {}) {
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const [r, g, b] = hexToRgb(color);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c + 0.5, y - c + 0.5) / c;
      const a = Math.pow(clamp(1 - dist, 0, 1), 2.2);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Tangent-space normal map derived from the same noise as a colour texture,
 * for when the project moves to a lit renderer.
 */
export function normalMap({ size = 128, seed = 1, strength = 2.4 } = {}) {
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = (x, y) => fbm((x / size) * 8, (y / size) * 8, { octaves: 4, period: 8, seed });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Central differences with wraparound keep the map tileable.
      const l = h((x - 1 + size) % size, y), r = h((x + 1) % size, y);
      const u = h(x, (y - 1 + size) % size), dn = h(x, (y + 1) % size);
      let nx = (l - r) * strength;
      let ny = (u - dn) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      d[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

// --- cache -----------------------------------------------------------------

const cache = new Map();

/** Built once per biome+depth-band and cached; rooms just ask for a pattern. */
export function getFloorPattern(ctx, biome, depth = 1) {
  // Deeper chambers darken slightly, so descent reads without changing biome.
  const band = Math.min(3, Math.floor((depth - 1) / 3));
  const key = `floor:${biome.id}:${band}`;
  let pat = cache.get(key);
  if (!pat) {
    const f = { ...biome.floor, light: biome.floor.light - band * 1.1, seed: biome.seed + band };
    pat = ctx.createPattern(biomeFloor(f), 'repeat');
    cache.set(key, pat);
  }
  return pat;
}

export function getRockPattern(ctx, biome) {
  const key = `rock:${biome.id}`;
  let pat = cache.get(key);
  if (!pat) {
    pat = ctx.createPattern(rockTexture({ ...biome.rock, seed: biome.seed + 3 }), 'repeat');
    cache.set(key, pat);
  }
  return pat;
}

/**
 * Small tile for the biome-select cards, as a data URL.
 * Returns a string rather than a canvas because OffscreenCanvas — which
 * makeCanvas prefers — has no toDataURL.
 */
export function biomeThumbnail(biome, size = 96) {
  const src = biomeFloor({ ...biome.floor, size, seed: biome.seed });
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    return src.toDataURL('image/png');
  }
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  out.getContext('2d').drawImage(src, 0, 0);
  return out.toDataURL('image/png');
}

export function clearTextureCache() { cache.clear(); }

/** Everything the sprite baker needs to write textures out as files. */
export const TEXTURE_RECIPES = {
  'floor-stone': (o) => stoneFloor(o),
  'floor-normal': (o) => normalMap(o),
  'rock': (o) => rockTexture(o),
  'particle-dot': (o) => softDot(o),
};
