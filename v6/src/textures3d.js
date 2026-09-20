// Surfaces, generated rather than loaded.
//
// The project has never shipped an image file: every texture here is drawn at
// start-up into an offscreen canvas and handed to the GPU. Each material gets
// three of them - colour, a normal map so the light catches real bumps, and a
// roughness map so wet stone shines where moss does not - which is what lifts
// flat-shaded blocks into something that looks lit rather than painted.
//
// They tile, so one 256px sheet covers a whole meadow, and they are generated
// from the same value noise the 2D game paints its ground with, so the two
// versions keep the same character.

import * as THREE from '../vendor/three.module.js';

const SIZE = 256;
const cache = new Map();

/** Deterministic value noise, so a texture looks the same every run. */
function makeNoise(seed) {
  const n = 64;
  const table = new Float32Array(n * n);
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 8) & 0xffffff) / 0xffffff;
  };
  for (let i = 0; i < table.length; i++) table[i] = rnd();
  const at = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const i0 = (yi & 63) * n, i1 = ((yi + 1) & 63) * n;
    const x0 = xi & 63, x1 = (xi + 1) & 63;
    const a = table[i0 + x0], b = table[i0 + x1], c = table[i1 + x0], d = table[i1 + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, octaves = 3) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += at(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum * 1.6;
  };
}

function canvas2d(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return { c, g: c.getContext('2d') };
}

function toTexture(canvas, repeat, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A height field turned into a tangent-space normal map: the classic Sobel of
 * the neighbouring heights, so the light rakes across bumps at grazing angles.
 */
function normalFromHeight(height, strength = 2.2) {
  const { c, g } = canvas2d();
  const img = g.createImageData(SIZE, SIZE);
  const d = img.data;
  const at = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      d[i] = ((dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * One surface. `paint(x, y, noise)` returns [r, g, b, height, rough] for a
 * pixel, all 0..1. Everything else - the three maps, the wrapping, the
 * anisotropy - is the same for every surface.
 */
function surface(key, seed, repeat, paint, normalStrength = 2.2) {
  if (cache.has(key)) return cache.get(key);
  const noise = makeNoise(seed);
  const { c: albedo, g: ag } = canvas2d();
  const { c: rough, g: rg } = canvas2d();
  const aImg = ag.createImageData(SIZE, SIZE);
  const rImg = rg.createImageData(SIZE, SIZE);
  const height = new Float32Array(SIZE * SIZE);
  const out = [0, 0, 0, 0, 0];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      paint(x, y, noise, out);
      const i = (y * SIZE + x) * 4;
      aImg.data[i] = out[0] * 255;
      aImg.data[i + 1] = out[1] * 255;
      aImg.data[i + 2] = out[2] * 255;
      aImg.data[i + 3] = 255;
      height[y * SIZE + x] = out[3];
      const r = out[4] * 255;
      rImg.data[i] = r;
      rImg.data[i + 1] = r;
      rImg.data[i + 2] = r;
      rImg.data[i + 3] = 255;
    }
  }
  ag.putImageData(aImg, 0, 0);
  rg.putImageData(rImg, 0, 0);
  const set = {
    map: toTexture(albedo, repeat, true),
    normalMap: toTexture(normalFromHeight(height, normalStrength), repeat, false),
    roughnessMap: toTexture(rough, repeat, false),
  };
  cache.set(key, set);
  return set;
}

const mix = (a, b, t) => a + (b - a) * t;

// --- the surfaces -----------------------------------------------------------

export const TEX = {
  /** Meadow grass: clumps, a few dry blades, dark between the tufts. */
  grass: () => surface('grass', 7, 1, (x, y, n, out) => {
    const clump = n(x / 26, y / 26, 3);
    const fine = n(x / 5 + 40, y / 5, 2);
    const blade = n(x / 2.2, y / 9 + 11, 1);
    const dry = clump > 0.72 && fine > 0.58;
    const g = mix(0.34, 0.5, clump) * mix(0.84, 1.08, blade);
    out[0] = dry ? g * 1.06 : g * 0.6;
    out[1] = dry ? g * 1.02 : g;
    out[2] = g * (dry ? 0.5 : 0.44);
    out[3] = blade * 0.7 + clump * 0.3;
    out[4] = 0.82 + fine * 0.14;
  }, 1.5),

  /** Rock: cracked, angular, with lighter chipped faces. */
  rock: () => surface('rock', 19, 1, (x, y, n, out) => {
    const base = n(x / 18, y / 18, 4);
    const grain = n(x / 3.5 + 7, y / 3.5, 2);
    const crack = Math.abs(n(x / 30 + 3, y / 30 + 9, 2) - 0.5);
    const v = mix(0.34, 0.62, base) * mix(0.86, 1.1, grain);
    const dark = crack < 0.03 ? 0.45 : 1;
    out[0] = v * dark * 1.02;
    out[1] = v * dark * 0.98;
    out[2] = v * dark * 0.94;
    out[3] = base * 0.6 + grain * 0.25 + (crack < 0.03 ? -0.35 : 0);
    out[4] = 0.72 + grain * 0.2;
  }, 3),

  /** Snow: soft drifts, a sparkle of ice, blue in the hollows. */
  snow: () => surface('snow', 23, 1, (x, y, n, out) => {
    const drift = n(x / 22, y / 22, 3);
    const spark = n(x / 1.6 + 60, y / 1.6, 1);
    const v = mix(0.82, 1.0, drift);
    const ice = spark > 0.93 ? 0.12 : 0;
    out[0] = Math.min(1, v * 0.96 + ice);
    out[1] = Math.min(1, v * 0.98 + ice);
    out[2] = Math.min(1, v + ice);
    out[3] = drift;
    out[4] = 0.55 + drift * 0.3;
  }, 1.2),

  /** Sand and shore: fine grain with wind ripples. */
  sand: () => surface('sand', 31, 1, (x, y, n, out) => {
    const ripple = Math.sin((x * 0.6 + y * 0.22) * 0.5 + n(x / 30, y / 30, 2) * 6) * 0.5 + 0.5;
    const grain = n(x / 2.4, y / 2.4, 2);
    const v = mix(0.62, 0.78, ripple) * mix(0.9, 1.08, grain);
    out[0] = v * 1.06;
    out[1] = v * 0.94;
    out[2] = v * 0.68;
    out[3] = ripple * 0.7 + grain * 0.3;
    out[4] = 0.88;
  }, 1.6),

  /** Bare earth and the worn road. */
  dirt: () => surface('dirt', 37, 1, (x, y, n, out) => {
    const lump = n(x / 16, y / 16, 3);
    const grit = n(x / 3 + 20, y / 3, 2);
    const pebble = grit > 0.78 ? 0.18 : 0;
    const v = mix(0.32, 0.5, lump) * mix(0.88, 1.06, grit);
    out[0] = v * 1.15 + pebble;
    out[1] = v * 0.94 + pebble;
    out[2] = v * 0.7 + pebble;
    out[3] = lump * 0.6 + grit * 0.4;
    out[4] = 0.86 - pebble;
  }, 2),

  /** Moss on the forest floor. */
  moss: () => surface('moss', 41, 1, (x, y, n, out) => {
    const patch = n(x / 20, y / 20, 3);
    const fuzz = n(x / 2.6, y / 2.6, 2);
    const v = mix(0.2, 0.36, patch) * mix(0.85, 1.15, fuzz);
    const leaf = patch > 0.7 && fuzz > 0.72;
    out[0] = leaf ? v * 2.1 : v * 0.62;
    out[1] = leaf ? v * 1.5 : v;
    out[2] = leaf ? v * 0.7 : v * 0.5;
    out[3] = fuzz;
    out[4] = 0.9;
  }, 1.4),

  /** Cut flagstones, mossy in the joints. */
  stone: () => surface('stone', 53, 1, (x, y, n, out) => {
    const tile = 64;
    const row = Math.floor(y / tile);
    const ox = (row & 1) * tile * 0.5;
    const lx = (x + ox) % tile, ly = y % tile;
    const edge = Math.min(lx, ly, tile - lx, tile - ly);
    const grain = n(x / 4, y / 4, 2);
    const shade = n(Math.floor((x + ox) / tile) * 3.3, row * 7.1, 1);
    if (edge < 3) {
      const m = grain > 0.55 ? 1 : 0.6;
      out[0] = 0.18 * m; out[1] = 0.22 * m; out[2] = 0.15 * m;
      out[3] = 0.1;
      out[4] = 0.95;
    } else {
      const v = mix(0.36, 0.52, shade) * mix(0.9, 1.08, grain);
      out[0] = v; out[1] = v * 0.99; out[2] = v * 0.95;
      out[3] = 0.55 + grain * 0.3 + (edge < 6 ? -0.2 : 0);
      out[4] = 0.74 + grain * 0.18;
    }
  }, 2.6),

  /** Loose quarry gravel. */
  gravel: () => surface('gravel', 61, 1, (x, y, n, out) => {
    const s = n(x / 3.2, y / 3.2, 2);
    const big = n(x / 9 + 12, y / 9, 2);
    const v = mix(0.34, 0.6, big) * mix(0.8, 1.2, s);
    out[0] = v * 1.05; out[1] = v * 0.98; out[2] = v * 0.86;
    out[3] = s * 0.7 + big * 0.3;
    out[4] = 0.8;
  }, 3.2),

  /** Tree bark: long vertical fibres. */
  bark: () => surface('bark', 71, 1, (x, y, n, out) => {
    const fibre = n(x / 2.2, y / 26, 3);
    const knot = n(x / 20, y / 20, 2);
    const v = mix(0.16, 0.34, fibre) * mix(0.85, 1.1, knot);
    out[0] = v * 1.25; out[1] = v * 0.95; out[2] = v * 0.72;
    out[3] = fibre;
    out[4] = 0.92;
  }, 3.4),

  /** Leaf canopy: dappled clusters. */
  leaf: () => surface('leaf', 83, 1, (x, y, n, out) => {
    const cluster = n(x / 12, y / 12, 3);
    const fine = n(x / 3, y / 3 + 5, 2);
    const v = mix(0.18, 0.42, cluster) * mix(0.8, 1.2, fine);
    out[0] = v * 0.72; out[1] = v * 1.15; out[2] = v * 0.5;
    out[3] = cluster * 0.6 + fine * 0.4;
    out[4] = 0.88;
  }, 2),

  /** Woven cloth, for the coat and the scarf. */
  cloth: () => surface('cloth', 97, 1, (x, y, n, out) => {
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
    const wear = n(x / 14, y / 14, 3);
    const v = mix(0.8, 1.05, weave) * mix(0.88, 1.06, wear);
    out[0] = v; out[1] = v; out[2] = v;
    out[3] = weave * 0.6 + wear * 0.4;
    out[4] = 0.88;
  }, 1.2),

  /** Plaited straw, for the hat. */
  straw: () => surface('straw', 101, 1, (x, y, n, out) => {
    const plait = (Math.sin((x + y) * 0.5) * 0.5 + 0.5) * (n(x / 6, y / 6, 2) * 0.5 + 0.6);
    const v = mix(0.7, 1.05, plait);
    out[0] = v; out[1] = v * 0.92; out[2] = v * 0.62;
    out[3] = plait;
    out[4] = 0.8;
  }, 1.8),
};

/** A soft round blob, for contact shadows and glows. */
export function blobTexture() {
  if (cache.has('blob')) return cache.get('blob');
  const { c, g } = canvas2d(128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  cache.set('blob', t);
  return t;
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v.map) { v.map.dispose(); v.normalMap.dispose(); v.roughnessMap.dispose(); } else v.dispose();
  }
  cache.clear();
}
