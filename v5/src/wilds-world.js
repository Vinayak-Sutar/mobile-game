// The Wilds: the big open world, built from wilds-layout.js and STREAMED.
//
// The world is 47,500 x 29,000 units - two islands in a sea, the main one
// 36,000 x 24,000 - so nothing here may cost in proportion to the whole of it:
//
//   - SECTORS (2048 square) hold the fine detail: trees, boulders, flowers,
//     reeds, bones, the grass field. They are grown from a fixed seed when you
//     come within one sector of them and let go at two, so the same tree is
//     always in the same place and nothing needs saving.
//   - Everything hand-placed (water, chasms, cliff faces, rims, rails) is
//     built once, but filed in a SPATIAL HASH of 512-unit cells.
//   - The level's obstacle list (world.room.obstacles - which the player, the
//     enemies, projectiles and spells all loop over) is only ever the ACTIVE
//     SET: what the hash holds within a couple of thousand units of you,
//     refreshed as you walk. Every existing collision loop keeps working,
//     unchanged, over a few hundred obstacles instead of tens of thousands.
//   - The ground's type map is classified lazily (terrain.js), and painted in
//     chunks as they come into view.
//   - The fog of war is one byte per 100-unit cell. As cells clear, the map
//     picture (wilds-map.js) is painted in, a cell at a time.

import { world, arena, camera, view } from './state.js';
import { TAU, clamp, dist, rand } from './util.js';
import { burst } from './fx.js';
import { createTerrain, TT, TERRAIN_RGB, fbm, vnoise, mulberry } from './terrain.js';
import { createGrass, grassMovers } from './grass.js';
import {
  WILDS, START, REGIONS, ROADS, LAKES, RIVERS, SEA, CHASMS, BRIDGES, PLATEAUS, RIMS, CLEARINGS, LAND, OFFSET,
} from './wilds-layout.js';
import { createWildsWater } from './wilds-water.js';

export { WILDS };
export const FOG = 100;                  // fog-of-war cell
export const SECTOR = 2048;              // streamed detail
const HASH = 512;                        // spatial hash cell
const TILE = 40;                         // water collision tiles
const ACTIVE_X = 2400, ACTIVE_Y = 1800;  // the active obstacle set's reach

// Kept for game.js, which still speaks to the old region's interface. The
// guardians' gates come back in later steps.
export const SITES = [];
export const FINALS = [];

let spawnFn = null;
export function bindOverworldSpawner(fn) { spawnFn = fn; }

let W = null;                            // the live world
/** The live world, for the drawing and the map (read only). */
export function wildsState() { return W; }

// --- where things are --------------------------------------------------------------

/** Which region a point belongs to. Borders wander with the noise. */
export function regionAt(x, y) {
  const wx = x + (vnoise(x * 0.00055, y * 0.00055) - 0.5) * 1800;
  const wy = y + (vnoise(x * 0.00055 + 9.1, y * 0.00055 + 4.7) - 0.5) * 1800;
  let best = REGIONS[0], bk = Infinity;
  for (const r of REGIONS) {
    const k = Math.hypot(wx - r.x, wy - r.y) / r.r;
    if (k < bk) { bk = k; best = r; }
  }
  return best;
}

const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Distance from a point to a segment. */
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

// Every road and river as a flat list of segments with their bounds, so a
// lookup can skip the far ones.
const segsOf = (lines, pad) => {
  const out = [];
  for (const L of lines) {
    const pts = L.pts || L;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      out.push({ ax, ay, bx, by, w: L.w || 0,
        x0: Math.min(ax, bx) - pad, y0: Math.min(ay, by) - pad, x1: Math.max(ax, bx) + pad, y1: Math.max(ay, by) + pad });
    }
  }
  return out;
};
const ROAD_SEGS = segsOf(ROADS, 0);
const RIVER_SEGS = segsOf(RIVERS, 200);

/** A function giving the distance to the nearest road, for points in a box. */
function roadDistIn(x0, y0, x1, y1) {
  const near = ROAD_SEGS.filter((s) => s.x1 + 300 > x0 && s.x0 - 300 < x1 && s.y1 + 300 > y0 && s.y0 - 300 < y1);
  return (x, y) => {
    let best = 999;
    for (const s of near) {
      const d = segDist(x, y, s.ax, s.ay, s.bx, s.by);
      if (d < best) best = d;
    }
    return best;
  };
}

// Bridges: wherever a road crosses a river, a stone span.
const RIVER_BRIDGES = [];
for (const r of RIVER_SEGS) {
  for (const s of ROAD_SEGS) {
    const d1x = r.bx - r.ax, d1y = r.by - r.ay, d2x = s.bx - s.ax, d2y = s.by - s.ay;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-6) continue;
    const t = ((s.ax - r.ax) * d2y - (s.ay - r.ay) * d2x) / den;
    const u = ((s.ax - r.ax) * d1y - (s.ay - r.ay) * d1x) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    RIVER_BRIDGES.push({ x: r.ax + d1x * t, y: r.ay + d1y * t, r: r.w * 0.5 + 60 });
  }
}
const onBridge = (x, y) => RIVER_BRIDGES.some((b) => Math.hypot(x - b.x, y - b.y) < b.r) || BRIDGES.some((b) => inRect(b, x, y));

const LAKE_BOX = LAKES.map((L) => ({ L, x0: L.x - L.rx * 1.2, x1: L.x + L.rx * 1.2, y0: L.y - L.ry * 1.2, y1: L.y + L.ry * 1.2 }));

function inLake(L, x, y) {
  const e = ((x - L.x) / L.rx) ** 2 + ((y - L.y) / L.ry) ** 2;
  // A shoreline that wanders in and out rather than a clean ellipse.
  if (e > 1 + (fbm(x * 0.0018 + L.x * 0.001, y * 0.0018) - 0.5) * 0.4) return false;
  if (L.holes) for (const h of L.holes) if (Math.hypot(x - h.x, y - h.y) < h.r * (1 + (vnoise(x * 0.008, y * 0.008) - 0.5) * 0.25)) return false;
  if (L.cuts) for (const c of L.cuts) if (inRect(c, x, y)) return false;
  return true;
}

// --- the land and the sea ------------------------------------------------------------
// The main island fills its authored rectangle, and its coast wanders out past
// it by anything up to about 1500 units - headlands and bays - so the sea
// laps a real shoreline. The second island is an ellipse with a ragged shore.
const M = LAND.main;
const COAST_MAX = 1550;                  // the furthest a headland reaches past the rectangle

function onLand(x, y) {
  const dx = Math.max(M.x - x, 0, x - (M.x + M.w)), dy = Math.max(M.y - y, 0, y - (M.y + M.h));
  if (dx === 0 && dy === 0) return true;
  const out = Math.hypot(dx, dy);
  if (out < 250 + fbm(x * 0.0009, y * 0.0009) * 1300) return true;
  for (const I of LAND.isles) {
    const e = ((x - I.x) / I.rx) ** 2 + ((y - I.y) / I.ry) ** 2;
    if (e < 1 + (fbm(x * 0.0016 + 5, y * 0.0016 + 9) - 0.5) * 0.55) return true;
  }
  return false;
}

/** Is there water here (lake, pool, river, the inlet or the open sea)? Bridges are dry. */
function waterAt(x, y) {
  if (BRIDGES.some((b) => inRect(b, x, y))) return false;
  if (!onLand(x, y)) return true;
  for (const b of LAKE_BOX) {
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
    if (inLake(b.L, x, y)) return true;
  }
  for (const s of RIVER_SEGS) {
    if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
    const wob = 1 + (vnoise(x * 0.006, y * 0.006) - 0.5) * 0.5;
    if (segDist(x, y, s.ax, s.ay, s.bx, s.by) < s.w * 0.5 * wob) return !onBridge(x, y);
  }
  if (y > SEA.y0 && y < SEA.y1) {
    // The inlet's coast: ragged, and bending in toward each end.
    const ends = Math.min(y - SEA.y0, SEA.y1 - y);
    const coast = SEA.x + (fbm(y * 0.002, 3.7) - 0.5) * SEA.jag - Math.max(0, 600 - ends) * 0.8;
    if (x < coast) return true;
  }
  return false;
}

// Round the edge of all water there is a band you can wade; only past it is
// the water deep enough to stop you.
// The sea shelves more gently than a lake, so its shallows are wider: you
// can wade along a beach.
const SHALLOW_BAND = 50, SEA_BAND = 140;
const seaDeep = (x, y) => !onLand(x, y) && !onLand(x + SEA_BAND, y) && !onLand(x - SEA_BAND, y)
  && !onLand(x, y + SEA_BAND) && !onLand(x, y - SEA_BAND);
function deepAt(x, y) {
  if (!waterAt(x, y)) return false;
  if (!onLand(x, y) && !seaDeep(x, y)) return false;
  return waterAt(x + SHALLOW_BAND, y) && waterAt(x - SHALLOW_BAND, y)
    && waterAt(x, y + SHALLOW_BAND) && waterAt(x, y - SHALLOW_BAND);
}

const inChasm = (x, y) => CHASMS.some((c) => inRect(c, x, y)) && !BRIDGES.some((b) => inRect(b, x, y));

// Most of the world is nowhere near water, and asking waterAt five times a
// cell (for the shore) is the dearest part of classifying the ground. So each
// 640-unit patch is checked once against the water's bounding boxes.
const WET = new Map();
function wetNear(x, y) {
  const k = Math.floor(y / 640) * 128 + Math.floor(x / 640);
  let v = WET.get(k);
  if (v === undefined) {
    const x0 = Math.floor(x / 640) * 640 - 120, y0 = Math.floor(y / 640) * 640 - 120, x1 = x0 + 880, y1 = y0 + 880;
    v = LAKE_BOX.some((b) => b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1)
      || RIVER_SEGS.some((s) => s.x1 > x0 && s.x0 < x1 && s.y1 > y0 && s.y0 < y1)
      || (x0 < SEA.x + SEA.jag && y1 > SEA.y0 && y0 < SEA.y1)
      // Near the coast: anywhere not wholly inside the main island's rectangle.
      || x0 < M.x + 200 || y0 < M.y + 200 || x1 > M.x + M.w - 200 || y1 > M.y + M.h - 200;
    WET.set(k, v);
  }
  return v;
}

// --- the raised ground --------------------------------------------------------------
// Each plateau: its top; its south face, broken by stairs, one-way (you can
// hop down it, not climb it); and gentle slopes on the other three sides, which
// are only paint - you walk up and down them freely.

const SLOPE = 60;

function buildRaised() {
  const R = { tops: [], faces: [], stairs: [], rims: [], slopes: [] };
  const walls = [];
  for (const [x, y, w, h, faceH, stairs] of PLATEAUS) {
    R.tops.push({ x, y, w, h });
    let cx = x;
    for (const [sx, sw] of [...stairs, [x + w, 0]]) {
      if (sx > cx) {
        const f = { x: cx, y: y + h, w: sx - cx, h: faceH };
        R.faces.push(f);
        walls.push({ x: f.x, y: f.y, w: f.w, h: f.h, kind: 'face', ledge: true, low: true });
      }
      if (sw) R.stairs.push({ x: sx, y: y + h - 8, w: sw, h: faceH + 8 });
      cx = sx + sw;
    }
    R.slopes.push({ x: x - SLOPE / 2, y, w: SLOPE, h: h + faceH, side: 'w' });
    R.slopes.push({ x: x + w - SLOPE / 2, y, w: SLOPE, h: h + faceH, side: 'e' });
    R.slopes.push({ x, y: y - SLOPE / 2, w, h: SLOPE, side: 'n' });
  }
  for (const r of RIMS) {
    const rr = { ...r, vertical: r.h > r.w };
    R.rims.push(rr);
    walls.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind: 'rim' });
  }
  return { R, walls };
}

/** File rectangles in 1024-unit buckets so a point finds its few quickly. */
function bucketRects(lists) {
  const B = 1024, out = new Map();
  const blank = () => ({ tops: [], faces: [], stairs: [], rims: [], slopes: [] });
  for (const [name, list] of Object.entries(lists)) {
    for (const r of list) {
      for (let j = Math.floor(r.y / B); j <= Math.floor((r.y + r.h) / B); j++) {
        for (let i = Math.floor(r.x / B); i <= Math.floor((r.x + r.w) / B); i++) {
          const k = j * 128 + i;
          if (!out.has(k)) out.set(k, blank());
          out.get(k)[name].push(r);
        }
      }
    }
  }
  const EMPTY = blank();
  const at = (x, y) => out.get(Math.floor(y / B) * 128 + Math.floor(x / B)) || EMPTY;
  const near = (x0, y0, x1, y1) => {
    const got = { tops: new Set(), faces: new Set(), stairs: new Set(), rims: new Set(), slopes: new Set() };
    for (let j = Math.floor(y0 / B); j <= Math.floor(y1 / B); j++) {
      for (let i = Math.floor(x0 / B); i <= Math.floor(x1 / B); i++) {
        const b = out.get(j * 128 + i);
        if (!b) continue;
        for (const k of Object.keys(got)) for (const r of b[k]) got[k].add(r);
      }
    }
    return { tops: [...got.tops], faces: [...got.faces], stairs: [...got.stairs], rims: [...got.rims], slopes: [...got.slopes] };
  };
  return { at, near };
}

// --- the spatial hash -----------------------------------------------------------------

function createHash() {
  const cells = new Map();
  let stamp = 1;
  const span = (o, fn) => {
    for (let j = Math.floor(o.y / HASH); j <= Math.floor((o.y + o.h) / HASH); j++) {
      for (let i = Math.floor(o.x / HASH); i <= Math.floor((o.x + o.w) / HASH); i++) fn(j * 128 + i);
    }
  };
  return {
    add(o) { span(o, (k) => { let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(o); }); },
    remove(o) {
      span(o, (k) => {
        const c = cells.get(k);
        if (!c) return;
        const i = c.indexOf(o);
        if (i >= 0) c.splice(i, 1);
      });
    },
    query(x0, y0, x1, y1, out = []) {
      stamp++;
      for (let j = Math.floor(y0 / HASH); j <= Math.floor(y1 / HASH); j++) {
        for (let i = Math.floor(x0 / HASH); i <= Math.floor(x1 / HASH); i++) {
          const c = cells.get(j * 128 + i);
          if (!c) continue;
          for (const o of c) {
            if (o._q === stamp) continue;
            o._q = stamp;
            if (o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0) out.push(o);
          }
        }
      }
      return out;
    },
  };
}

// --- the ground --------------------------------------------------------------------

function makeClassify(raised) {
  return (x, y) => {
    const b = raised.at(x, y);
    for (const r of b.stairs) if (inRect(r, x, y)) return TT.PAVE;
    for (const r of b.faces) if (inRect(r, x, y)) return TT.ROCK;
    for (const r of b.rims) if (inRect(r, x, y)) return TT.ROCK;
    if (BRIDGES.some((q) => inRect(q, x, y))) return TT.PAVE;
    if (inChasm(x, y)) return TT.CHASM;
    const reg = regionAt(x, y);
    if (wetNear(x, y)) {
      if (waterAt(x, y)) return deepAt(x, y) ? TT.WATER : TT.SHALLOW;
      if (RIVER_BRIDGES.some((q) => Math.hypot(x - q.x, y - q.y) < q.r)) return TT.PAVE;
      // A strip of sand or shingle along every shore (mud in the Mire); the
      // sea's beaches are wider.
      const sea = !onLand(x + 150, y) || !onLand(x - 150, y) || !onLand(x, y + 150) || !onLand(x, y - 150);
      if (sea || waterAt(x + 70, y) || waterAt(x - 70, y) || waterAt(x, y + 70) || waterAt(x, y - 70)) {
        return reg.id === 'mire' ? TT.MUD : sea && reg.id === 'echo' ? TT.GRAVEL : TT.SAND;
      }
    }
    // Region rules are written in the main island's own frame.
    const u = x - OFFSET.x, v = y - OFFSET.y;
    const m = fbm(x * 0.0035, y * 0.0035);
    const m2 = fbm(x * 0.0021 + 31, y * 0.0021 + 7);
    const onTop = b.tops.some((r) => inRect(r, x, y));
    switch (reg.id) {
      case 'heartland':
        if (Math.hypot(x - START.x, y - START.y) < 260) return TT.GRASS;
        if (m2 > 0.7) return TT.DIRT;
        return m > 0.56 ? TT.TALL : TT.GRASS;
      case 'webwood': return m > 0.64 ? TT.TALL : m < 0.3 ? TT.DIRT : TT.MOSS;
      case 'lake': return m > 0.6 ? TT.TALL : TT.GRASS;
      case 'gulch': return m > 0.6 ? TT.ROCK : m < 0.32 ? TT.SAND : m2 > 0.58 ? TT.DIRT : TT.GRAVEL;
      case 'mire': return m > 0.46 ? TT.MUD : m < 0.3 ? TT.TALL : TT.MOSS;
      case 'gilded': {
        if (onTop) return TT.MARBLE;
        // The palace's garden grid: marble walks between the lawns.
        const gx = Math.abs(((u - 26700) % 420 + 420) % 420 - 210), gy = Math.abs(((v - 17500) % 420 + 420) % 420 - 210);
        if (u > 25800 && u < 31000 && v > 16800 && v < 21400 && (gx < 34 || gy < 34)) return TT.MARBLE;
        return m > 0.6 ? TT.TALL : TT.GRASS;
      }
      case 'echo': return m > 0.62 ? TT.ROCK : m < 0.3 ? TT.DIRT : m2 > 0.6 ? TT.TALL : TT.GRASS;
      case 'sands': return onTop ? TT.PAVE : m > 0.74 ? TT.GRAVEL : TT.SAND;
      case 'isle': return m > 0.62 ? TT.TALL : m < 0.3 ? TT.SAND : TT.GRASS;
      // Volcanic: ash and black rock, all the way up.
      case 'peaks': return m > 0.58 ? TT.ROCK : m2 > 0.7 ? TT.GRAVEL : TT.ASH;
      case 'gorge': return m > 0.58 ? TT.ROCK : m < 0.34 ? TT.MOSS : TT.GRAVEL;
      case 'moors': {
        const lake = ((u - 6000) / 1300) ** 2 + ((v - 2400) / 800) ** 2;
        if (lake < 1 + (fbm(x * 0.003, y * 0.003) - 0.5) * 0.3) return TT.ICE;
        return m < 0.3 ? TT.ROCK : TT.SNOW;
      }
      // Green terraces in flower; snow only on the crown.
      case 'summit':
        if (v < 2300) return m > 0.6 ? TT.ROCK : TT.SNOW;
        if (v < 3300) return m > 0.6 ? TT.ROCK : m < 0.35 ? TT.SNOW : TT.GRASS;
        return m > 0.6 ? TT.TALL : m < 0.24 ? TT.ROCK : TT.GRASS;
      case 'bridge': return m > 0.55 ? TT.ROCK : TT.GRAVEL;
      // Pale marble courts on the mesa; frost below.
      case 'citadel': return onTop ? (m2 > 0.72 ? TT.PAVE : TT.MARBLE) : m > 0.6 ? TT.ROCK : TT.SNOW;
      default: return TT.GRASS;
    }
  };
}

// --- building ------------------------------------------------------------------------

function build() {
  const { R, walls } = buildRaised();
  const raised = bucketRects(R);
  const hash = createHash();

  // Deep water and the chasm, as collision: a 40-unit mask merged into runs
  // along each row. Only DEEP water blocks - the shallows are for wading. Far
  // out at sea it is deep everywhere, so only the coast needs testing.
  const tw = Math.ceil(WILDS.W / TILE), th = Math.ceil(WILDS.H / TILE);
  const mask = new Uint8Array(tw * th);
  const mark = (x0, y0, x1, y1) => {
    for (let j = Math.max(0, Math.floor(y0 / TILE)); j <= Math.min(th - 1, Math.floor(y1 / TILE)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / TILE)); i <= Math.min(tw - 1, Math.floor(x1 / TILE)); i++) {
        if (!mask[j * tw + i] && deepAt(i * TILE + TILE / 2, j * TILE + TILE / 2)) mask[j * tw + i] = 1;
      }
    }
  };
  for (const b of LAKE_BOX) mark(b.x0, b.y0, b.x1, b.y1);
  for (const s of RIVER_SEGS) mark(s.x0, s.y0, s.x1, s.y1);
  mark(0, SEA.y0, SEA.x + SEA.jag, SEA.y1);
  // The sea: everything round the main island's rectangle, tested only near
  // its coast and near the isles.
  const nearCoast = (x, y) => {
    const dx = Math.max(M.x - x, 0, x - (M.x + M.w)), dy = Math.max(M.y - y, 0, y - (M.y + M.h));
    if (Math.hypot(dx, dy) < COAST_MAX + 100) return true;
    return LAND.isles.some((I) => ((x - I.x) / (I.rx * 1.5)) ** 2 + ((y - I.y) / (I.ry * 1.5)) ** 2 < 1);
  };
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      const x = i * TILE + TILE / 2, y = j * TILE + TILE / 2;
      if (x > M.x + 200 && x < M.x + M.w - 200 && y > M.y + 200 && y < M.y + M.h - 200) { i = Math.floor((M.x + M.w - 200) / TILE); continue; }
      if (mask[j * tw + i]) continue;
      if (BRIDGES.some((q) => inRect(q, x, y))) continue;
      const deep = nearCoast(x, y) ? seaDeep(x, y) : !onLand(x, y);
      if (deep) mask[j * tw + i] = 1;
    }
  }
  const statics = [...walls];
  for (let j = 0; j < th; j++) {
    let run = -1;
    for (let i = 0; i <= tw; i++) {
      const wet = i < tw && mask[j * tw + i];
      if (wet && run < 0) run = i;
      if (!wet && run >= 0) {
        statics.push({ x: run * TILE, y: j * TILE, w: (i - run) * TILE, h: TILE, kind: 'water', low: true });
        run = -1;
      }
    }
  }
  // The chasm, less every bridge deck that crosses it.
  let chasm = CHASMS.map((q) => ({ ...q }));
  for (const d of BRIDGES) chasm = chasm.flatMap((q) => cutRect(q, d));
  for (const q of chasm) statics.push({ ...q, kind: 'chasm', low: true });
  // Railings along both sides of every bridge deck, whichever way it runs.
  for (const b of BRIDGES) {
    if (b.h >= b.w) {
      statics.push({ x: b.x - 16, y: b.y - 20, w: 16, h: b.h + 40, kind: 'rail' });
      statics.push({ x: b.x + b.w, y: b.y - 20, w: 16, h: b.h + 40, kind: 'rail' });
    } else {
      statics.push({ x: b.x - 20, y: b.y - 16, w: b.w + 40, h: 16, kind: 'rail' });
      statics.push({ x: b.x - 20, y: b.y + b.h, w: b.w + 40, h: 16, kind: 'rail' });
    }
  }
  for (const o of statics) hash.add(o);

  const classify = makeClassify(raised);
  const terrain = createTerrain({
    W: WILDS.W, H: WILDS.H,
    classify,
    roadDist: roadDistIn,
    shadowsNear: (x0, y0, x1, y1) => hash.query(x0, y0, x1, y1),
    raisedNear: raised.near,
  });

  const fogW = Math.ceil(WILDS.W / FOG), fogH = Math.ceil(WILDS.H / FOG);
  return {
    terrain, raised, hash, statics, classify,
    sectors: new Map(),
    room: { type: 'overworld', training: true, overworld: true, obstacles: [], waves: [], doors: [], doorsOpen: false, intro: 0 },
    ax: -1e9, ay: -1e9, activeDirty: true,
    fog: new Uint8Array(fogW * fogH), fogW, fogH,
    // The map's picture: two pixels per fog cell, painted in as the fog clears.
    mapCanvas: typeof document !== 'undefined' ? makeCanvas(fogW * 2, fogH * 2) : null,
    visited: new Set(),
    zone: null, respawn: { ...START },
    prints: [], stepT: 0, lastX: 0, lastY: 0, printX: 0, printY: 0,
    grade: [255, 228, 168, 0.05], leaves: [],
    water: createWildsWater(),
  };
}

/** A rectangle with another cut out of it: up to four pieces round the hole. */
function cutRect(r, h) {
  if (h.x >= r.x + r.w || h.x + h.w <= r.x || h.y >= r.y + r.h || h.y + h.h <= r.y) return [r];
  const out = [];
  const x0 = Math.max(r.x, h.x), x1 = Math.min(r.x + r.w, h.x + h.w);
  if (h.y > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: h.y - r.y });                                   // above
  if (h.y + h.h < r.y + r.h) out.push({ x: r.x, y: h.y + h.h, w: r.w, h: r.y + r.h - (h.y + h.h) });   // below
  const y0 = Math.max(r.y, h.y), y1 = Math.min(r.y + r.h, h.y + h.h);
  if (x0 > r.x) out.push({ x: r.x, y: y0, w: x0 - r.x, h: y1 - y0 });                                  // left
  if (x1 < r.x + r.w) out.push({ x: x1, y: y0, w: r.x + r.w - x1, h: y1 - y0 });                       // right
  return out;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// --- sectors: the fine detail, grown from the seed ----------------------------------------

const NO_TREES = new Set([TT.WATER, TT.SHALLOW, TT.CHASM, TT.ICE, TT.PAVE, TT.MARBLE]);

function inClearing(x, y) {
  if (Math.hypot(x - START.x, y - START.y) < 700) return true;
  return CLEARINGS.some((c) => Math.hypot(x - c.x, y - c.y) < c.r);
}

/** Is anything solid, wet or sheer within `pad` of this point? */
function blockedAt(x, y, pad) {
  const got = W.hash.query(x - pad, y - pad, x + pad, y + pad);
  if (got.length) return true;
  const b = W.raised.at(x, y);
  for (const r of b.stairs) if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true;
  return false;
}

function growSector(si, sj) {
  const rng = mulberry((WILDS.SEED ^ Math.imul(si + 1, 73856093) ^ Math.imul(sj + 1, 19349663)) | 0);
  const between = (a, b) => a + rng() * (b - a);
  const x0 = si * SECTOR, y0 = sj * SECTOR;
  const S = { si, sj, x0, y0, trees: [], rocks: [], decals: [], obs: [], grass: [], grassTodo: 4 };
  const T = W.terrain;
  const add = (o) => { S.obs.push(o); W.hash.add(o); };

  // Trees on a jittered grid, as thick as the region grows them.
  const STEP = 118;
  for (let gy = 0; gy < SECTOR; gy += STEP) {
    for (let gx = 0; gx < SECTOR; gx += STEP) {
      const x = x0 + gx + rng() * STEP, y = y0 + gy + rng() * STEP;
      const roll = rng();
      if (x < 60 || y < 60 || x > WILDS.W - 60 || y > WILDS.H - 60) continue;
      const reg = regionAt(x, y);
      if (roll > reg.trees) continue;
      const ground = T.typeAt(x, y);
      if (NO_TREES.has(ground) || T.roadAt(x, y) < 80 || inClearing(x, y) || blockedAt(x, y, 56)) continue;
      let kind = reg.tree;
      if (ground === TT.SNOW) kind = 'pine';
      else if (ground === TT.ASH) kind = 'dead';
      if (kind === 'cactus') {
        const o = { x: x - 8, y: y - 10, w: 16, h: 20, kind: 'cactus', arms: rng() > 0.4, h2: between(24, 40) };
        add(o);
        continue;
      }
      const t = { x, y, r: between(kind === 'dark' ? 40 : 32, kind === 'dark' ? 62 : 52), kind,
        sway: rng() * TAU, shade: between(-8, 8), snowy: ground === TT.SNOW };
      t.o = { x: x - 12, y: y - 8, w: 24, h: 20, kind: 'trunk' };
      add(t.o);
      S.trees.push(t);
    }
  }

  // Boulders, with a rough outline each.
  for (let gy = 0; gy < SECTOR; gy += 300) {
    for (let gx = 0; gx < SECTOR; gx += 300) {
      const x = x0 + gx + rng() * 300, y = y0 + gy + rng() * 300;
      const roll = rng();
      if (x < 60 || y < 60 || x > WILDS.W - 60 || y > WILDS.H - 60) continue;
      const reg = regionAt(x, y);
      if (roll > reg.rocks) continue;
      const ground = T.typeAt(x, y);
      if (ground === TT.WATER || ground === TT.SHALLOW || ground === TT.CHASM || T.roadAt(x, y) < 70 || inClearing(x, y) || blockedAt(x, y, 60)) continue;
      const w = between(44, 96), h = between(36, 70);
      const o = { x: x - w / 2, y: y - h / 2, w, h, kind: 'rock', shadow: true,
        snowy: ground === TT.SNOW || ground === TT.ICE, ashy: ground === TT.ASH, poly: [] };
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU;
        o.poly.push([Math.cos(a) * (w / 2) * between(0.86, 1.06), Math.sin(a) * (h / 2) * between(0.86, 1.06)]);
      }
      add(o);
    }
  }

  // Small things on the ground, by region.
  for (let k = 0; k < 90; k++) {
    const x = x0 + rng() * SECTOR, y = y0 + rng() * SECTOR;
    const reg = regionAt(x, y);
    const ground = T.typeAt(x, y);
    if (ground === TT.WATER || ground === TT.CHASM) continue;
    const near = rng();
    if (ground === TT.SHALLOW) {
      if (near > 0.6) S.decals.push({ t: 'reeds', x, y, ph: rng() * TAU });
      continue;
    }
    let d = null;
    switch (reg.id) {
      case 'heartland': case 'lake': case 'echo':
        if (ground === TT.GRASS || ground === TT.TALL) d = { t: 'flowers', c: ['230,140,60', '220,90,120', '240,230,180', '170,150,240'][(rng() * 4) | 0] };
        break;
      case 'summit':
        if (ground === TT.GRASS || ground === TT.TALL) d = { t: 'flowers', c: near > 0.5 ? '255,176,206' : '255,230,240' };
        break;
      case 'isle':
        d = ground === TT.SAND ? { t: 'shell', c: near > 0.5 ? '240,214,200' : '232,196,170' }
          : ground === TT.GRASS || ground === TT.TALL ? { t: 'flowers', c: '255,120,90' } : null;
        break;
      case 'gilded':
        if (ground === TT.GRASS || ground === TT.TALL) d = { t: 'flowers', c: near > 0.5 ? '120,200,230' : '240,200,90' };
        break;
      case 'mire': d = near > 0.5 ? { t: 'reeds' } : { t: 'stump' }; break;
      case 'webwood': case 'gorge': d = near > 0.55 ? { t: 'web' } : { t: 'shrooms' }; break;
      case 'gulch': case 'sands': d = near > 0.7 ? { t: 'skull' } : { t: 'pebbles' }; break;
      case 'peaks': d = near > 0.72 ? { t: 'fissure', len: 20 + rng() * 40, a: rng() * TAU } : near > 0.45 ? { t: 'ember' } : { t: 'pebbles' }; break;
      case 'moors': d = near > 0.6 ? { t: 'grave' } : { t: 'pebbles' }; break;
      case 'citadel': d = near > 0.8 ? { t: 'grave' } : null; break;
      default: break;
    }
    if (!d) continue;
    d.x = x; d.y = y; d.ph = rng() * TAU;
    S.decals.push(d);
  }
  return S;
}

/** A sector's grass grows a quarter at a time, one quarter a frame. */
function growGrass(S) {
  const q = 4 - S.grassTodo--, half = SECTOR / 2;
  S.grass.push(createGrass(W.terrain, {
    x0: S.x0 + (q % 2) * half, y0: S.y0 + Math.floor(q / 2) * half, W: half, H: half,
    blocked: (x, y) => blockedAt(x, y, 6) || Math.hypot(x - START.x, y - START.y) < 120,
  }));
}

function dropSector(key) {
  const S = W.sectors.get(key);
  for (const o of S.obs) W.hash.remove(o);
  W.sectors.delete(key);
  W.activeDirty = true;
}

const skey = (i, j) => j * 32 + i;
const SX = Math.ceil(WILDS.W / SECTOR), SY = Math.ceil(WILDS.H / SECTOR);

/**
 * Keep the sectors round the player grown and the far ones gone, within `ms`
 * milliseconds of work (Infinity when arriving somewhere). Whatever time is
 * left classifies the ground of the ring beyond, so that by the time you walk
 * into it the costly part is already done.
 */
function stream(p, ms) {
  const deadline = performance.now() + ms;
  let budget = ms === Infinity ? 999 : 1;
  const si = Math.floor(p.x / SECTOR), sj = Math.floor(p.y / SECTOR);
  // Nearest first: your own sector, then the ring round it.
  const want = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = si + di, j = sj + dj;
      if (i < 0 || j < 0 || i >= SX || j >= SY) continue;
      want.push([i, j, Math.abs(di) + Math.abs(dj)]);
    }
  }
  want.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of want) {
    if (budget <= 0) break;
    const k = skey(i, j);
    if (!W.sectors.has(k)) { W.sectors.set(k, growSector(i, j)); W.activeDirty = true; budget--; }
  }
  for (const [i, j] of want) {
    const S = W.sectors.get(skey(i, j));
    while (S && S.grassTodo > 0 && budget > 0) { growGrass(S); budget--; }
  }
  for (const [k, S] of W.sectors) {
    if (Math.max(Math.abs(S.si - si), Math.abs(S.sj - sj)) > 2) dropSector(k);
  }
  // Ahead of need: the ground two sectors out.
  if (ms !== Infinity) {
    const r = SECTOR * 2;
    W.terrain.prefill(p.x - r, p.y - r, p.x + r, p.y + r, deadline);
  }
}

/** The level's obstacle list is only what lies near you. */
function refreshActive(p) {
  if (!W.activeDirty && Math.abs(p.x - W.ax) < 256 && Math.abs(p.y - W.ay) < 256) return;
  W.ax = p.x; W.ay = p.y;
  W.activeDirty = false;
  W.room.obstacles = W.hash.query(p.x - ACTIVE_X, p.y - ACTIVE_Y, p.x + ACTIVE_X, p.y + ACTIVE_Y);
}

/** The sectors that overlap a rectangle (for drawing and the grass). */
export function sectorsIn(x0, y0, x1, y1) {
  const out = [];
  if (!W) return out;
  for (const S of W.sectors.values()) {
    if (S.x0 < x1 && S.x0 + SECTOR > x0 && S.y0 < y1 && S.y0 + SECTOR > y0) out.push(S);
  }
  return out;
}

/** The sector a point is in, if it is grown. */
export function sectorAt(x, y) {
  return W ? W.sectors.get(skey(Math.floor(x / SECTOR), Math.floor(y / SECTOR))) : null;
}

// --- fog of war and the map's picture ---------------------------------------------------

const ROAD_RGB = '150,128,96';

function paintMapCell(i, j) {
  const c = W.mapCanvas;
  if (!c) return;
  const g = c.getContext('2d');
  for (let v = 0; v < 2; v++) {
    for (let u = 0; u < 2; u++) {
      const x = i * FOG + 25 + u * 50, y = j * FOG + 25 + v * 50;
      const t = W.terrain.typeAt(x, y);
      const road = t !== TT.WATER && t !== TT.CHASM && W.terrain.roadAt(x, y) < 34;
      g.fillStyle = `rgb(${road ? ROAD_RGB : TERRAIN_RGB[t]})`;
      g.fillRect(i * 2 + u, j * 2 + v, 1, 1);
    }
  }
}

/** Clear the fog in a circle round a point. */
export function reveal(x, y, r) {
  const cx = Math.floor(x / FOG), cy = Math.floor(y / FOG), cr = Math.ceil(r / FOG);
  for (let j = Math.max(0, cy - cr); j <= Math.min(W.fogH - 1, cy + cr); j++) {
    for (let i = Math.max(0, cx - cr); i <= Math.min(W.fogW - 1, cx + cr); i++) {
      const k = j * W.fogW + i;
      if (W.fog[k]) continue;
      if (dist(i * FOG + FOG / 2, j * FOG + FOG / 2, x, y) > r) continue;
      W.fog[k] = 1;
      paintMapCell(i, j);
    }
  }
}

// --- the whole map, without the fog ------------------------------------------------------
// A setting (and a help while the world is being built): the map shows every
// land, not just where you have been. Clearing the real fog would classify
// the ground of the whole world - millions of cells, seconds on a phone - so
// instead a separate overview is CHARTED: one sample per 100-unit cell, taken
// straight from the classifier without filling its grid, a few rows a frame.
// It takes about a second, and the map shows it filling in.

/** Turn the fog on the map off (or back on). */
export function setMapFog(off) {
  if (!W) return;
  W.fogOff = off;
  if (off && !W.overview) {
    W.overview = { canvas: typeof document !== 'undefined' ? makeCanvas(W.fogW * 2, W.fogH * 2) : null, row: 0, done: false };
  }
}

/** Chart more of the overview, until the deadline (a performance.now() time). */
export function chartOverview(deadline) {
  const O = W && W.overview;
  if (!O || O.done || !W.fogOff) return;
  const g = O.canvas && O.canvas.getContext('2d');
  while (O.row < W.fogH) {
    const j = O.row, y = j * FOG + FOG / 2;
    const road = roadDistIn(0, y - 60, WILDS.W, y + 60);
    for (let i = 0; i < W.fogW; i++) {
      const x = i * FOG + FOG / 2;
      const t = W.classify(x, y);
      const isRoad = t !== TT.WATER && t !== TT.SHALLOW && t !== TT.CHASM && road(x, y) < 44;
      if (g) {
        g.fillStyle = `rgb(${isRoad ? ROAD_RGB : TERRAIN_RGB[t]})`;
        g.fillRect(i * 2, j * 2, 2, 2);
      }
    }
    O.row++;
    if (performance.now() > deadline) break;
  }
  if (O.row >= W.fogH) O.done = true;
}

/** How far the overview has got, 0..1 (1 when it is not being charted). */
export function chartProgress() {
  const O = W && W.overview;
  return O && W.fogOff ? O.row / W.fogH : 1;
}

// --- entering and leaving ------------------------------------------------------------

/** Set the arena to the whole world (after a resize too). */
export function applyOverworldBounds() {
  arena.x = 0; arena.y = 0; arena.w = WILDS.W; arena.h = WILDS.H;
}

/** A fresh world, or the same one coming back from a fight. Returns the room. */
export function enterOverworld(fresh) {
  if (fresh || !W) W = build();
  applyOverworldBounds();
  W.activeDirty = true;
  return W.room;
}

/** Arrive at a spot: grow everything round it at once, so nothing pops in. */
export function arriveAt(x, y) {
  if (!W) return;
  stream({ x, y }, Infinity);
  W.activeDirty = true;
  refreshActive({ x, y });
  reveal(x, y, 700);
  W.lastX = x; W.lastY = y;
}

export function overworldRespawn() { return W ? W.respawn : { ...START }; }

/** Back from a fight: where to stand. (The guardians' gates return in a later step.) */
export function overworldReturn() {
  return overworldRespawn();
}

/** For the pause screen: how much of the world you have walked. */
export function overworldProgress() {
  if (!W) return null;
  let seen = 0;
  for (let k = 0; k < W.fog.length; k++) seen += W.fog[k];
  return {
    regions: REGIONS.filter((r) => W.visited.has(r.id)).map((r) => r.name),
    regionsTotal: REGIONS.length,
    explored: seen / W.fog.length,
  };
}

// --- per frame -------------------------------------------------------------------------

const STEP_DUST = {
  [TT.SNOW]: '#eef3fa', [TT.SAND]: '#cdb68c', [TT.GRAVEL]: '#a2927a', [TT.ROCK]: '#9a948c', [TT.DIRT]: '#9a8266',
  [TT.ASH]: '#6a6462', [TT.MUD]: '#4a3e2e', [TT.ICE]: '#e6f2fa',
};
const GRADE_SNOW = [185, 210, 255, 0.12];

/**
 * The world's upkeep. Returns an action for game.js when one is needed:
 * { toast: [title, sub] } to show.
 */
export function updateOverworld(dt) {
  const p = world.player;
  if (!W || !p) return null;
  let action = null;

  // A ghost crosses sectors four times as fast, so it gets more time for them.
  stream(p, p.ghost ? 8 : 3);
  refreshActive(p);
  if (W.fogOff) chartOverview(performance.now() + 3);

  // The camera leads a little the way you aim.
  const lead = 60;
  const tx = clamp(p.x + Math.cos(p.aimAngle) * lead - view.w / 2, 0, Math.max(0, WILDS.W - view.w));
  const ty = clamp(p.y + Math.sin(p.aimAngle) * lead - view.h / 2, 0, Math.max(0, WILDS.H - view.h));
  const f = 1 - Math.exp(-6 * dt);
  camera.x += (tx - camera.x) * f;
  camera.y += (ty - camera.y) * f;

  // Higher ground sees further; stairs are slow going, and so is wading.
  const b = W.raised.at(p.x, p.y);
  let tiers = 0;
  for (const r of b.tops) if (inRect(r, p.x, p.y)) tiers++;
  reveal(p.x, p.y, 700 + tiers * 260);
  p.groundMult = b.stairs.some((r) => inRect(r, p.x, p.y)) ? 0.72 : 1;
  if (W.terrain.typeAt(p.x, p.y + p.r * 0.5) === TT.SHALLOW) p.groundMult *= 0.62;

  // The live water in view: clear, or green in the Mire.
  W.water.setTint(regionAt(camera.x + view.w / 2, camera.y + view.h / 2).id === 'mire' ? 'swamp' : 'clear');
  W.water.update(dt, W.terrain);

  // The grass in view: wind, everyone walking through it; your blows cut it.
  const vx0 = camera.x - 40, vy0 = camera.y - 40, vx1 = camera.x + view.w + 40, vy1 = camera.y + view.h + 40;
  const movers = grassMovers();
  const cutters = world.hitboxes.filter((h) => h.friendly);
  for (const S of sectorsIn(vx0, vy0, vx1, vy1)) {
    for (const g of S.grass) g.update(dt, world.runTime, { x: camera.x, y: camera.y, w: view.w, h: view.h }, movers, cutters);
  }
  groundFeel(p, dt);

  // Crossing into a region: its name, and it goes on the map.
  const z = regionAt(p.x, p.y);
  if (z !== W.zone) {
    W.zone = z;
    const first = !W.visited.has(z.id);
    W.visited.add(z.id);
    action = { toast: [z.name.toUpperCase(), first ? 'A new land' : 'The Wilds'] };
  }

  weather(z, dt);

  // Each land has its own light, eased so crossing a border is a slow turn.
  const ground = W.terrain.typeAt(p.x, p.y);
  const want = ground === TT.SNOW || ground === TT.ICE ? GRADE_SNOW : z.grade;
  const f2 = Math.min(1, dt * 1.2);
  for (let k = 0; k < 4; k++) W.grade[k] += (want[k] - W.grade[k]) * f2;
  return action;
}

/** Weather by region: leaves, snow, falling ash, dust, mist, petals, cloud. */
function weather(z, dt) {
  const kind = z.weather;
  const rate = kind === 'snow' || kind === 'ash' ? 60 : kind === 'cloud' ? 8 : 18;
  if (Math.random() < dt * rate) {
    const x = camera.x + rand(-40, view.w + 40), y = camera.y + rand(-60, view.h);
    const L = { x, y, t: 0, kind, rot: rand(0, TAU) };
    switch (kind) {
      case 'snow': Object.assign(L, { life: rand(3, 6), vx: rand(-8, 22), vy: rand(24, 48), s: rand(1, 2.4) }); break;
      case 'ash': Object.assign(L, { life: rand(3, 6), vx: rand(-14, 14), vy: rand(16, 34), s: rand(1, 2.2), ember: Math.random() < 0.12 }); break;
      case 'dust': Object.assign(L, { life: rand(2, 4), vx: rand(60, 110), vy: rand(-6, 10), s: rand(1, 2) }); break;
      case 'mist': Object.assign(L, { life: rand(4, 7), vx: rand(6, 16), vy: rand(-3, 3), s: rand(40, 90) }); break;
      case 'cloud': Object.assign(L, { life: rand(6, 9), vx: rand(20, 36), vy: 0, s: rand(90, 160) }); break;
      case 'petals': Object.assign(L, { life: rand(3, 5), vx: rand(16, 36), vy: rand(10, 22), c: Math.random() < 0.5 ? '#f4b8d0' : '#ffe0a0' }); break;
      case 'motes': Object.assign(L, { life: rand(3, 6), vx: rand(-6, 6), vy: rand(-10, -2), s: rand(1.2, 2.2) }); break;
      case 'wind': Object.assign(L, { life: rand(1.5, 3), vx: rand(120, 180), vy: rand(-8, 8), s: rand(30, 60) }); break;
      default: Object.assign(L, { life: rand(3, 5), vx: rand(20, 45), vy: rand(10, 25), c: z.id === 'heartland' ? '#c8a060' : '#8aa040' });
    }
    W.leaves.push(L);
  }
  for (let i = W.leaves.length - 1; i >= 0; i--) {
    const l = W.leaves[i];
    l.t += dt; l.x += (l.vx + Math.sin(l.t * 2) * 12) * dt; l.y += l.vy * dt; l.rot += dt * 2;
    if (l.t > l.life) W.leaves.splice(i, 1);
  }
  if (W.leaves.length > 180) W.leaves.splice(0, W.leaves.length - 180);
}

/** How the ground answers your feet: dust, powder, prints in the snow. */
function groundFeel(p, dt) {
  const moved = Math.hypot(p.x - W.lastX, p.y - W.lastY);
  W.lastX = p.x; W.lastY = p.y;
  if (p.dead || moved > 200) return;                     // a respawn, not a step
  const ground = W.terrain.typeAt(p.x, p.y + p.r * 0.6);
  const dust = STEP_DUST[ground];
  if (moved > 0.5) {
    W.stepT -= dt;
    if (W.stepT <= 0 && dust) {
      W.stepT = 0.26;
      burst(p.x, p.y + p.r * 0.7, { count: 2, color: dust, speed: 40, size: 3, life: 0.45, drag: 3, gravity: -10 });
    }
    if (p.dashing && dust && Math.random() < 0.7) {
      burst(p.x, p.y + p.r * 0.6, { count: 2, color: dust, speed: 90, size: 3.5, life: 0.5, drag: 3, gravity: -14 });
    }
  }
  // Soft prints through snow, ash and mud, slowly filling back in.
  if ((ground === TT.SNOW || ground === TT.ASH || ground === TT.MUD) && Math.hypot(p.x - W.printX, p.y - W.printY) > 13) {
    W.printX = p.x; W.printY = p.y;
    W.prints.push({ x: p.x, y: p.y + p.r * 0.6, t: world.runTime, big: p.dashing, dark: ground !== TT.SNOW });
    if (W.prints.length > 220) W.prints.shift();
  }
}
