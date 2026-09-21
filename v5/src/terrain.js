// The Wilds' ground: a terrain map and the painted texture baked from it.
//
// The region is classified into terrain types on a coarse grid (grass, tall
// grass, moss, dirt, rock, gravel, snow, sand, paving). The ground is then
// painted pixel by pixel, the way the Drowned Vault's floor is: layered value
// noise for patches and grain, a relief light from the upper left (the
// slopes of a noise height map, strong on rock and snow, soft on grass),
// soft contact shadows under walls and boulders, and roads worn in with
// wheel ruts. Borders between types are pushed about by noise so they come
// out ragged and natural rather than on the grid.
//
// Painting a whole region at once would cost a phone far too much memory, so
// it is baked in 256-unit chunks as they come into view, a couple per frame
// at most, and chunks far from the camera are dropped again.
//
// The type map itself is worked out LAZILY too: The Wilds are 36,000 x 24,000
// units, and classifying all of it up front would take seconds. The grid is
// filled in blocks of 16 x 16 cells the first time anything looks there, so
// only the land you actually walk through is ever classified - and prefill()
// lets the caller do it ahead of need, a few blocks a frame, so walking into
// new land never waits on it.

import { gfx } from './state.js';

export const TT = {
  GRASS: 0, TALL: 1, MOSS: 2, DIRT: 3, ROCK: 4, SNOW: 5, SAND: 6, PAVE: 7, GRAVEL: 8,
  // The big Wilds' own grounds: the Broken Peaks' ash, the Mire's mud, the
  // Moors' frozen lake, the palace's marble, open water and the chasm.
  ASH: 9, MUD: 10, ICE: 11, MARBLE: 12, WATER: 13, CHASM: 14,
  // The shallow edge of any water: you can wade it, slowly.
  SHALLOW: 15,
};
// An average colour per type, for the minimap.
export const TERRAIN_RGB = [
  '82,100,62', '70,96,54', '46,68,48', '112,94,70', '112,108,102', '222,228,238', '184,164,122', '104,100,98', '126,112,92',
  '76,70,68', '70,60,46', '178,204,222', '214,206,190', '36,70,92', '14,14,20', '70,126,132',
];
// How strongly each type catches the relief light.
const ROUGH = [0.35, 0.3, 0.3, 0.3, 1.1, 0.9, 0.45, 0.2, 0.6, 0.75, 0.25, 0.35, 0.12, 0.1, 0, 0.1];

/** A small seeded random-number generator (the same seed gives the same run). */
export function mulberry(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NS = 256;
const TABLE = new Float32Array(NS * NS);
{
  const r = mulberry(1337);
  for (let i = 0; i < TABLE.length; i++) TABLE[i] = r();
}

/** Smooth value noise, 0..1. */
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255, x1 = (xi + 1) & 255;
  const y0 = (yi & 255) * NS, y1 = ((yi + 1) & 255) * NS;
  const a = TABLE[y0 + x0], b = TABLE[y0 + x1], c = TABLE[y1 + x0], d = TABLE[y1 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Two octaves of value noise, 0..1. */
export function fbm(x, y) {
  return vnoise(x, y) * 0.62 + vnoise(x * 2.03 + 17.3, y * 2.03 + 31.1) * 0.38;
}

/** A per-pixel random number, 0..1. */
function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const CHUNK = 256;
const KEEP = 64;               // chunks kept baked
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * opts: { W, H, classify(x, y) -> TT, roadDist(x0, y0, x1, y1) -> a function
 * (x, y) -> units to the nearest road's centre line for points in that box
 * (or roadDist(x, y) directly), and, for soft shadows and the raised ground,
 * either the whole lists (obstacles, raised) or lookups by area
 * (shadowsNear(x0, y0, x1, y1), raisedNear(x0, y0, x1, y1)). }
 */
export function createTerrain(opts) {
  const { W, H } = opts;
  const CELL = 20;
  const gw = Math.ceil(W / CELL) + 1, gh = Math.ceil(H / CELL) + 1;
  const grid = new Uint8Array(gw * gh);
  // Distance to a road, in whole units, capped: nothing cares beyond 255.
  const road = new Uint8Array(gw * gh);
  const BLK = 16;
  const bw = Math.ceil(gw / BLK), bh = Math.ceil(gh / BLK);
  const done = new Uint8Array(bw * bh);

  /** Classify one block of cells, the first time it is needed. */
  function fill(bi, bj) {
    done[bj * bw + bi] = 1;
    const i0 = bi * BLK, j0 = bj * BLK;
    const i1 = Math.min(gw, i0 + BLK), j1 = Math.min(gh, j0 + BLK);
    // The road lookup can be narrowed to the roads near this block.
    const near = opts.roadDist.length === 4
      ? opts.roadDist(i0 * CELL - 300, j0 * CELL - 300, i1 * CELL + 300, j1 * CELL + 300)
      : opts.roadDist;
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        grid[j * gw + i] = opts.classify(i * CELL + CELL / 2, j * CELL + CELL / 2);
        road[j * gw + i] = Math.min(255, near(i * CELL, j * CELL));
      }
    }
  }
  const at = (i, j) => {
    const bi = (i / BLK) | 0, bj = (j / BLK) | 0;
    if (!done[bj * bw + bi]) fill(bi, bj);
    return j * gw + i;
  };

  /**
   * Classify the blocks under a rectangle until the deadline (a
   * performance.now() time) passes. True once all of them are done.
   */
  function prefill(x0, y0, x1, y1, deadline) {
    const bi0 = Math.max(0, Math.floor(x0 / CELL / BLK)), bi1 = Math.min(bw - 1, Math.floor(x1 / CELL / BLK));
    const bj0 = Math.max(0, Math.floor(y0 / CELL / BLK)), bj1 = Math.min(bh - 1, Math.floor(y1 / CELL / BLK));
    for (let bj = bj0; bj <= bj1; bj++) {
      for (let bi = bi0; bi <= bi1; bi++) {
        if (done[bj * bw + bi]) continue;
        if (performance.now() > deadline) return false;
        fill(bi, bj);
      }
    }
    return true;
  }

  function typeAt(x, y) {
    const i = Math.min(gw - 1, Math.max(0, Math.floor(x / CELL)));
    const j = Math.min(gh - 1, Math.max(0, Math.floor(y / CELL)));
    return grid[at(i, j)];
  }

  function roadAt(x, y) {
    const fx = Math.min(gw - 1.001, Math.max(0, x / CELL)), fy = Math.min(gh - 1.001, Math.max(0, y / CELL));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
    // All four corners must be classified (they can straddle a block edge).
    const k = at(i, j); at(i + 1, j); at(i, j + 1); at(i + 1, j + 1);
    const a = road[k], b = road[k + 1], c = road[k + gw], d = road[k + gw + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // --- painting one pixel -------------------------------------------------------------
  const out = [0, 0, 0];
  // The slow fields (border push, patches, relief, cracks) are worked out on
  // a coarse lattice per chunk and blended between (see startJob); only the
  // grain and the speckle are per pixel. Five times cheaper, same picture.
  function paint(wx, wy, shadowRects, jxo, jyo, m, relief, crackN, J) {
    const n = vnoise(wx * 0.11, wy * 0.11);          // grain
    const h = hash(wx, wy);                          // speckle
    // Raised ground (see paintRaised): cliff faces, stairs and rims are
    // painted whole; the land below a face lies in its shadow.
    let lift = 1;
    if (J.raised) {
      const rv = paintRaised(wx, wy, n, h, J);
      if (rv === true) return out;
      lift = rv;
    }
    // Ragged borders: look the type up a little way off, pushed by noise.
    const t = typeAt(wx + jxo, wy + jyo);
    let r, g, bl;
    switch (t) {
      case TT.GRASS:
      case TT.TALL: {
        const k = t === TT.TALL ? 0.84 : 1;
        r = (66 + m * 30 + n * 10) * k; g = (86 + m * 34 + n * 12) * k; bl = (50 + m * 14) * k;
        if (h < 0.16) { r *= 0.8; g *= 0.84; bl *= 0.8; }                 // blade shadows
        else if (h > 0.992) { r = 150; g = 146; bl = 132; }                 // a fleck of ash
        else if (h > 0.97) { r += 22; g += 24; bl += 8; }                   // a lit blade
        break;
      }
      case TT.MOSS:
        r = 40 + m * 18 + n * 8; g = 60 + m * 22 + n * 10; bl = 42 + m * 8;
        if (h < 0.035) { r = 112 + n * 30; g = 82 + n * 20; bl = 42; }    // leaf litter
        else if (h < 0.1) { r *= 0.8; g *= 0.85; bl *= 0.85; }
        break;
      case TT.DIRT:
        r = 100 + m * 26 + n * 12; g = 84 + m * 20 + n * 9; bl = 62 + m * 12;
        if (h < 0.05) { r += 30; g += 26; bl += 22; }
        break;
      case TT.ROCK: {
        r = 92 + m * 34 + n * 14; g = 88 + m * 32 + n * 13; bl = 84 + m * 28 + n * 12;
        // Cracks: where a second noise crosses its middle.
        const c = Math.abs(crackN - 0.5);
        if (c < 0.018) { r *= 0.6; g *= 0.6; bl *= 0.6; }
        else if (c < 0.03) { r *= 1.1; g *= 1.1; bl *= 1.1; }
        if (h < 0.08) { r *= 0.88; g *= 0.88; bl *= 0.88; }
        break;
      }
      case TT.GRAVEL:
        r = 118 + m * 22 + n * 16; g = 104 + m * 18 + n * 14; bl = 86 + m * 14 + n * 10;
        if (h < 0.18) { const s = h < 0.09 ? 1.25 : 0.72; r *= s; g *= s; bl *= s; }
        break;
      case TT.SNOW: {
        r = 208 + m * 26 + n * 8; g = 216 + m * 22 + n * 7; bl = 230 + m * 16 + n * 6;
        // Hollows go blue in their own shadow.
        const hollow = clamp01(-relief * 1.4);
        r -= hollow * 40; g -= hollow * 30; bl -= hollow * 8;
        if (h > 0.996) { r = 255; g = 255; bl = 255; }                      // a glint
        break;
      }
      case TT.SAND: {
        const rip = Math.sin((wx * 0.8 + wy * 0.35) * 0.22 + m * 9) * 7;
        r = 172 + m * 22 + rip; g = 152 + m * 20 + rip; bl = 112 + m * 14 + rip * 0.7;
        if (h < 0.04) { r -= 26; g -= 26; bl -= 22; }
        break;
      }
      case TT.PAVE: {
        // Flagstones, every other row offset, each its own tint; some gone.
        const row = Math.floor(wy / 30);
        const col = Math.floor((wx + (row & 1) * 15) / 30);
        const lx = (wx + (row & 1) * 15) - col * 30, ly = wy - row * 30;
        const th = hash(col * 7 + 3, row * 13 + 5);
        const edge = Math.min(lx, ly, 30 - lx, 30 - ly);
        if (th < 0.18) {                                                     // a lost stone: earth and moss
          r = 70 + n * 20; g = 76 + n * 22; bl = 52;
        } else if (edge < 1.6) {                                             // mortar, mossy
          r = 58 + n * 10; g = 66 + n * 12; bl = 50;
        } else {
          const tint = (th - 0.5) * 22;
          r = 100 + tint + m * 18 + n * 10; g = 96 + tint + m * 16 + n * 9; bl = 92 + tint + m * 14 + n * 8;
          if (edge < 4) { r *= 0.9; g *= 0.9; bl *= 0.9; }
        }
        break;
      }
      case TT.ASH: {
        // Volcanic ash: dark and soft, pocked, with the odd live ember in it.
        r = 66 + m * 22 + n * 12; g = 60 + m * 20 + n * 11; bl = 58 + m * 18 + n * 10;
        if (h < 0.06) { r *= 0.78; g *= 0.78; bl *= 0.78; }
        else if (h > 0.9975) { r = 236; g = 120; bl = 52; }
        else if (h > 0.985) { r += 28; g += 26; bl += 24; }
        break;
      }
      case TT.MUD: {
        // Swamp mud: brown-black, with wet sheens where the water stands.
        r = 60 + m * 20 + n * 10; g = 50 + m * 16 + n * 8; bl = 36 + m * 10 + n * 6;
        if (m > 0.66) { const k = (m - 0.66) * 3; r += (40 - r) * k; g += (58 - g) * k; bl += (60 - bl) * k; }
        if (h < 0.05) { r *= 0.8; g *= 0.8; bl *= 0.8; }
        break;
      }
      case TT.ICE: {
        // A frozen lake: pale and glassy, cracked, snow drifted across it.
        r = 170 + m * 30 + n * 8; g = 198 + m * 26 + n * 8; bl = 218 + m * 20 + n * 6;
        const c = Math.abs(crackN - 0.5);
        if (c < 0.014) { r = 238; g = 246; bl = 252; }
        else if (c < 0.03) { r *= 0.9; g *= 0.93; bl *= 0.96; }
        if (m > 0.7) { r += 24; g += 20; bl += 12; }
        break;
      }
      case TT.MARBLE: {
        // Palace marble: big pale slabs, gold inlay along every seam.
        const row = Math.floor(wy / 64), col = Math.floor(wx / 64);
        const lx = wx - col * 64, ly = wy - row * 64;
        const edge = Math.min(lx, ly, 64 - lx, 64 - ly);
        const th = hash(col * 5 + 1, row * 11 + 7);
        if (edge < 1.8) { r = 196; g = 160; bl = 82; }                             // the gold inlay
        else {
          const vein = Math.abs(vnoise(wx * 0.05 + th * 9, wy * 0.05) - 0.5) < 0.02 ? 0.88 : 1;
          const tint = (th - 0.5) * 16;
          r = (204 + tint + n * 10) * vein; g = (198 + tint + n * 10) * vein; bl = (186 + tint + n * 8) * vein;
        }
        break;
      }
      case TT.WATER: {
        // Deep water: dark and matt - the live water (wilds-water.js) adds
        // what light there is.
        r = 20 + m * 12 + n * 6; g = 48 + m * 16 + n * 8; bl = 68 + m * 20 + n * 8;
        break;
      }
      case TT.SHALLOW: {
        // Shallows: the bottom shows through - sand and pebbles under clear
        // water - with a line of foam where it meets the land.
        const foam = typeAt(wx + 18, wy) < TT.WATER || typeAt(wx - 18, wy) < TT.WATER
          || typeAt(wx, wy + 18) < TT.WATER || typeAt(wx, wy - 18) < TT.WATER;
        r = 58 + m * 26 + n * 12; g = 112 + m * 24 + n * 10; bl = 118 + m * 20 + n * 8;
        if (h < 0.05) { r -= 14; g -= 12; bl -= 10; }                     // a pebble
        if (foam && h > 0.4) { r = 214 + n * 30; g = 230 + n * 20; bl = 232 + n * 16; }
        break;
      }
      case TT.CHASM: {
        // Bottomless: black, a cold haze far down, a broken lip of rock at the edge.
        const lip = typeAt(wx, wy - 22) !== TT.CHASM || typeAt(wx - 22, wy) !== TT.CHASM || typeAt(wx + 22, wy) !== TT.CHASM;
        if (lip) { r = 70 + n * 20; g = 64 + n * 18; bl = 60 + n * 16; }
        else { r = 10 + m * 10; g = 10 + m * 10; bl = 16 + m * 16; }
        break;
      }
      default: r = g = bl = 60;
    }

    // Roads, worn into whatever they cross: two wheel ruts and a crown.
    // (Not across open water or a chasm: those are bridges, paved already.)
    const rd = t === TT.WATER || t === TT.CHASM || t === TT.SHALLOW ? 99 : roadAt(wx + (n - 0.5) * 8, wy + (m - 0.5) * 8);
    if (rd < 30) {
      const k = clamp01((30 - rd) / 9);
      let dr, dg, db;
      if (t === TT.SNOW) { dr = 176 + n * 14; dg = 184 + n * 14; db = 198 + n * 12; }   // trampled snow
      else { dr = 104 + m * 22 + n * 12; dg = 88 + m * 18 + n * 10; db = 66 + m * 12; }
      if (Math.abs(rd - 10) < 2.6) { dr *= 0.82; dg *= 0.82; db *= 0.82; }
      if (h < 0.03) { dr += 24; dg += 22; db += 18; }
      r += (dr - r) * k; g += (dg - g) * k; bl += (db - bl) * k;
    }

    // Light and contact shadows.
    let light = (1 + relief * ROUGH[t]) * lift;
    if (shadowRects.length) {
      // Shadows fall to the lower right, soft over ~24 units.
      const sx = wx - 7, sy = wy - 9;
      let d = 99;
      for (const o of shadowRects) {
        const dx = Math.max(o.x - sx, 0, sx - (o.x + o.w));
        const dy = Math.max(o.y - sy, 0, sy - (o.y + o.h));
        const dd = Math.hypot(dx, dy);
        if (dd < d) d = dd;
      }
      if (d < 24) light *= 1 - 0.34 * (1 - d / 24);
    }
    out[0] = r * light; out[1] = g * light; out[2] = bl * light;
    return out;
  }

  // --- raised ground: plateaus, cliff faces, stairs -----------------------------------
  // opts.raised = { tops, faces, stairs, rims }: rects. A face is the south
  // wall of higher ground, seen from the front in the 3/4 view: a lip of
  // whatever grows on top, rock strata going darker toward the foot, and a
  // shadow thrown on the land below. Stairs are cut into faces.
  const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  function paintRaised(wx, wy, n, h, J) {
    for (const s2 of J.stairs) {
      if (!inR(s2, wx, wy)) continue;
      const ly = wy - s2.y, step = Math.floor(ly / 9), f = ly - step * 9;
      const edge = Math.min(wx - s2.x, s2.x + s2.w - wx);
      const dim = 1 - (step / Math.max(1, s2.h / 9)) * 0.25;
      let r, g, b;
      if (edge < 6) { r = 74; g = 70; b = 66; if (edge < 1.5) { r = 50; g = 47; b = 45; } }
      else if (f < 3.4) { r = 158 + n * 14; g = 152 + n * 13; b = 142 + n * 12; }       // the tread, lit
      else { const k = 1 - (f - 3.4) / 12; r = 104 * k + n * 8; g = 98 * k + n * 8; b = 92 * k + n * 7; }
      if (h < 0.05) { r *= 0.85; g *= 0.85; b *= 0.85; }
      out[0] = r * dim; out[1] = g * dim; out[2] = b * dim;
      return true;
    }
    for (const f of J.faces) {
      if (!inR(f, wx, wy)) continue;
      const dy = wy - f.y, v = dy / f.h;
      const above = typeAt(wx, f.y - 8);
      // The lip: a ragged fringe of what grows on top, hanging over the edge.
      const lip = 4 + vnoise(wx * 0.18, f.y * 0.01) * 8 + (h < 0.2 ? 2 : 0);
      if (dy < lip) {
        if (above === TT.SNOW) { out[0] = 226 + n * 20; out[1] = 232 + n * 16; out[2] = 244 + n * 10; }
        else if (above === TT.GRASS || above === TT.TALL || above === TT.MOSS) {
          const k = dy > lip - 2 ? 0.7 : 1;
          out[0] = (78 + n * 22) * k; out[1] = (104 + n * 24) * k; out[2] = (58 + n * 10) * k;
        } else { out[0] = 150 + n * 16; out[1] = 144 + n * 14; out[2] = 134 + n * 12; }
        return true;
      }
      const snowy = above === TT.SNOW;
      const streak = vnoise(wx * 0.09, wy * 0.012);
      let r = (snowy ? 88 : 90) + streak * 34 + n * 10;
      let g = (snowy ? 92 : 84) + streak * 30 + n * 9;
      let b = (snowy ? 106 : 78) + streak * 28 + n * 8;
      // Strata, bending a little along the wall.
      if (Math.sin(wy * 0.6 + vnoise(wx * 0.02, wy * 0.05) * 7) > 0.82) { r *= 0.8; g *= 0.8; b *= 0.8; }
      // Vertical cracks.
      if (Math.abs(vnoise(wx * 0.06 + 11, 3.3) - 0.5) < 0.018) { r *= 0.62; g *= 0.62; b *= 0.62; }
      if (dy < lip + 2) { r *= 0.55; g *= 0.55; b *= 0.55; }             // under the overhang
      const k = (1.08 - v * 0.5) * (dy > f.h - 3 ? 0.6 : 1);              // darker to the foot
      out[0] = r * k; out[1] = g * k; out[2] = b * k;
      return true;
    }
    for (const r2 of J.rims) {
      if (!inR(r2, wx, wy)) continue;
      const e = r2.vertical ? wx - r2.x : wy - r2.y;
      const k = e < 2.5 ? 1.35 : 0.72 - (e / 14) * 0.2;
      out[0] = (100 + n * 16) * k; out[1] = (96 + n * 14) * k; out[2] = (90 + n * 12) * k;
      return true;
    }
    let lift = 1;
    for (const t2 of J.tops) if (inR(t2, wx, wy)) { lift = 1.08; break; }
    // The open sides of higher ground: a bank that falls away from the top,
    // lit where it faces the light (upper left) and shaded where it turns away.
    for (const sl of J.slopes) {
      if (!inR(sl, wx, wy)) continue;
      const u = sl.side === 'n' ? (wy - sl.y) / sl.h : (wx - sl.x) / sl.w;   // 0..1 across the bank
      const k = sl.side === 'w' ? 1 - u : u;                                 // 0 at the top edge, 1 at the foot
      const lit = sl.side === 'w' || sl.side === 'n' ? 1.12 : 0.8;
      lift *= 1 + (lit - 1) * Math.sin(Math.PI * Math.min(1, k * 1.2));
      if (k > 0.2 && k < 0.3 && h < 0.5) lift *= 0.9;                        // the break of the slope
    }
    // The cliff's shadow on the ground below it, and east of a plateau.
    for (const f of J.faces) {
      const below = wy - (f.y + f.h);
      if (below >= 0 && below < 36 && wx > f.x - 6 && wx < f.x + f.w + 16) {
        const k = 1 - below / 36;
        lift *= 1 - 0.42 * k * k;
      }
    }
    for (const r2 of J.rims) {
      if (!r2.vertical) continue;
      const east = wx - (r2.x + r2.w);
      if (east >= 0 && east < 22 && wy > r2.y && wy < r2.y + r2.h + 20) lift *= 1 - 0.3 * (1 - east / 22);
    }
    return lift;
  }

  // --- chunks -------------------------------------------------------------------------
  const cache = new Map();
  let epoch = -1;
  let tick = 0;

  const G = 6;                                  // the coarse lattice's spacing
  const NF = 5;                                 // fields on it

  function startJob(cx, cy) {
    const x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1;
    const S = CHUNK + 2;                        // a pixel of overlap each side: no seams
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const cc = c.getContext('2d');
    const img = cc.createImageData(S, S);
    const shadowRects = (opts.shadowsNear ? opts.shadowsNear(x0 - 30, y0 - 30, x0 + S + 30, y0 + S + 30) : (opts.obstacles || []))
      .filter((o) => o.shadow && o.x < x0 + S + 30 && o.x + o.w > x0 - 30 && o.y < y0 + S + 30 && o.y + o.h > y0 - 30);
    const P = Math.ceil(S / G) + 2;
    const F = new Float32Array(P * P * NF);
    for (let j = 0; j < P; j++) {
      for (let i = 0; i < P; i++) {
        const wx = x0 + i * G, wy = y0 + j * G, o = (j * P + i) * NF;
        F[o] = (vnoise(wx * 0.035, wy * 0.035) - 0.5) * 30;
        F[o + 1] = (vnoise(wx * 0.035 + 57, wy * 0.035 + 91) - 0.5) * 30;
        F[o + 2] = fbm(wx * 0.011, wy * 0.011);
        const a = wx * 0.018, b = wy * 0.018;
        F[o + 3] = (fbm(a - 0.06, b - 0.06) - fbm(a + 0.06, b + 0.06)) * 5;
        F[o + 4] = fbm(wx * 0.03 + 40, wy * 0.03 + 12);
      }
    }
    const R0 = opts.raisedNear ? opts.raisedNear(x0 - 40, y0 - 40, x0 + S + 40, y0 + S + 40)
      : opts.raised || { tops: [], faces: [], stairs: [], rims: [], slopes: [] };
    const near = (r) => r.x < x0 + S + 40 && r.x + r.w > x0 - 40 && r.y < y0 + S + 40 && r.y + r.h > y0 - 40;
    const J = {
      tops: R0.tops.filter(near), faces: R0.faces.filter(near), stairs: R0.stairs.filter(near), rims: R0.rims.filter(near),
      slopes: (R0.slopes || []).filter(near),
    };
    J.raised = J.tops.length + J.faces.length + J.stairs.length + J.rims.length + J.slopes.length > 0;
    return { key: cy * 1000 + cx, x0, y0, S, c, cc, img, shadowRects, F, P, J, row: 0 };
  }

  /** Paint rows until the chunk is done (true) or the deadline passes. */
  function stepJob(job, deadline) {
    const { S, P, F, x0, y0, shadowRects } = job;
    const d = job.img.data;
    const R = job.rowF || (job.rowF = new Float32Array(P * NF));
    while (job.row < S) {
      const y = job.row;
      const gy = y / G, j = gy | 0, v = gy - j;
      // This row's fields at each lattice column, then a straight blend along it.
      for (let q = 0, o = j * P * NF; q < P * NF; q++) R[q] = F[o + q] + (F[o + P * NF + q] - F[o + q]) * v;
      let k = y * S * 4;
      for (let x = 0; x < S; x++) {
        const gx = x / G, i = gx | 0, u = gx - i;
        const o = i * NF;
        const px = paint(x0 + x, y0 + y, shadowRects,
          R[o] + (R[o + NF] - R[o]) * u, R[o + 1] + (R[o + 1 + NF] - R[o + 1]) * u,
          R[o + 2] + (R[o + 2 + NF] - R[o + 2]) * u, R[o + 3] + (R[o + 3 + NF] - R[o + 3]) * u,
          R[o + 4] + (R[o + 4 + NF] - R[o + 4]) * u, job.J);
        d[k] = px[0]; d[k + 1] = px[1]; d[k + 2] = px[2]; d[k + 3] = 255;
        k += 4;
      }
      job.row++;
      if (deadline && (job.row & 3) === 0 && performance.now() > deadline) break;
    }
    if (job.row < S) return false;
    job.cc.putImageData(job.img, 0, 0);
    return true;
  }

  let pending = null;                           // a chunk being painted ahead of need

  function bake(cx, cy) {
    const key = cy * 1000 + cx;
    const job = pending && pending.key === key ? pending : startJob(cx, cy);
    if (job === pending) pending = null;
    stepJob(job, 0);
    return { c: job.c, used: tick };
  }

  function visibleRange(camX, camY, vw, vh, pad) {
    return {
      i0: Math.max(0, Math.floor((camX - pad) / CHUNK)),
      i1: Math.min(Math.ceil(W / CHUNK) - 1, Math.floor((camX + vw + pad) / CHUNK)),
      j0: Math.max(0, Math.floor((camY - pad) / CHUNK)),
      j1: Math.min(Math.ceil(H / CHUNK) - 1, Math.floor((camY + vh + pad) / CHUNK)),
    };
  }

  /** Bake everything in view now (entering the region). */
  function warm(camX, camY, vw, vh) {
    if (epoch !== gfx.epoch) { cache.clear(); epoch = gfx.epoch; }
    const r = visibleRange(camX, camY, vw, vh, 0);
    for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
      const key = j * 1000 + i;
      if (!cache.has(key)) cache.set(key, bake(i, j));
    }
  }

  function draw(ctx, camX, camY, vw, vh) {
    if (epoch !== gfx.epoch) { cache.clear(); pending = null; epoch = gfx.epoch; }
    tick++;
    // Anything in view is painted now (a jump: a respawn, a gate); walking,
    // the chunk ahead is ready already.
    const r = visibleRange(camX, camY, vw, vh, 0);
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const key = j * 1000 + i;
        let ch = cache.get(key);
        if (!ch) { ch = bake(i, j); cache.set(key, ch); }
        ch.used = tick;
        ctx.drawImage(ch.c, 1, 1, CHUNK, CHUNK, i * CHUNK, j * CHUNK, CHUNK, CHUNK);
      }
    }
    // Paint the ring just beyond the edge ahead of need, a few milliseconds
    // a frame, so walking never waits on a chunk.
    if (!pending) {
      const p = visibleRange(camX, camY, vw, vh, CHUNK);
      outer:
      for (let j = p.j0; j <= p.j1; j++) {
        for (let i = p.i0; i <= p.i1; i++) {
          if (!cache.has(j * 1000 + i)) { pending = startJob(i, j); break outer; }
        }
      }
    }
    if (pending && stepJob(pending, performance.now() + 3)) {
      cache.set(pending.key, { c: pending.c, used: tick });
      pending = null;
    }
    // Forget the chunks used longest ago.
    if (cache.size > KEEP) {
      const old = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
      const n = cache.size - KEEP;
      for (let k = 0; k < n; k++) cache.delete(old[k][0]);
    }
  }

  return { typeAt, roadAt, draw, warm, prefill, CELL };
}
