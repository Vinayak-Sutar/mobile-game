// Savi — a valley, a dying Banyan, and five Great Roots choked by the season.
//
// This runs on the Wilds' own machinery, because that is what makes the Wilds
// look like something:
//
//   terrain.js        paints the ground pixel by pixel - grass, moss, dirt,
//                     rock, snow, ash - with noise, grain and a relief light,
//                     baked in chunks as they come into view
//   grass.js          tufts that bend and rustle as she walks through them
//   wilds-water.js    a live wave surface: she wades it and it rings
//
// On top of that: one removable layer (leaves, snow, thorn, ash) held as a
// depth grid, and ONE BUTTON that acts on whatever is in front of her -
// sweeping leaves out, breaking a dam, burning thorn, digging snow. The button
// is the game. Walking is only how you get to it.
//
// The valley is walked in order. The tree names the root it wants next and the
// cold holds her back from the others, so the legend comes out in the order it
// happened.

import { world, view, camera, gfx, arena } from './state.js';
import { clamp, rand, TAU } from './util.js';
import { createTerrain, TT } from './terrain.js';
import { createGrass, grassMovers } from './grass.js';
import { createWildsWater } from './wilds-water.js';
import {
  sfx, initAudio, unlockAudio, setAmbientTheme, setMusicIntensity, setMusicActive, setMusicEnabled,
} from './audio.js';
import { rumble } from './gamepad.js';
import { initFullscreen, enterFullscreen, isFullscreen, touchLike } from './fullscreen.js';
import { BUILD, BUILT, latestBuild, hardRefresh } from './update.js';
import { themeById } from './music-regions.js';
import { ROOTS, CLIMAX } from './savi-story.js';
import { KEEPER, keeperStart, keeperFill } from './savi-keeper.js';
import {
  POOL, SHELF, ISLES, SLUICE, LEAVES, FERRY, CAPSTAN, onIsle, leafAt,
  GATE as SLUICE_GATE, stepShallows, windCapstan, gateOpen, gateLift,
  drawDeep, drawIsles, drawSluice, drawLeaves,
} from './savi-shallows.js';
import {
  initLitter, pushLitter, settleLitter, litterAt, breezeAt, drawLeafSprite, drawFallingLeaves,
} from './savi-litter.js';
import {
  drawBanyan, drawCanopy, drawRoot, drawSavi, drawWoman, drawFire, drawMural, drawTree, drawRock, drawVeil,
  drawYoungTree, drawBroom, drawShrine, drawGate, glow, clamp01,
} from './savi-art.js';
import { drawPortrait } from './savi-faces.js';

// --- the valley ---------------------------------------------------------------------------

const V = { w: 5200, h: 3400 };
const TREE = { x: 2600, y: 1560 };
const WOMAN = { x: 2456, y: 1790 };
const FIRE = { x: 2556, y: 1812 };
const START = { x: 2600, y: 3120 };
// The avenue: two rows of trees up to the shrine, and a torana over the road
// where she comes in. Everything else about the approach hangs off these.
const GATE = { x: 2600, y: 3230 };
const AVENUE = [];
for (let i = 0; i < 9; i++) {
  const y = 3140 - i * 150;
  const w = 168 + i * 5;
  AVENUE.push({ x: 2600 - w, y, s: 1.05 + (i % 3) * 0.16, seed: i * 2 });
  AVENUE.push({ x: 2600 + w, y, s: 1.05 + ((i + 1) % 3) * 0.16, seed: i * 2 + 1 });
}
// Leaves bank against the trunks and pool in the hollows, never in a square.
const DRIFTS = AVENUE.map((t, i) => ({ x: t.x + (i % 2 ? 34 : -34), y: t.y + 26, r: 74 + (i % 4) * 16, d: 0.42 + (i % 3) * 0.1 }))
  .concat([
    { x: 2470, y: 2960, r: 120, d: 0.55 },
    { x: 2735, y: 2790, r: 108, d: 0.5 },
    { x: 2520, y: 2620, r: 132, d: 0.6 },
  ]);

// Each root reaches out to its own trouble, and each is a different material.
const PLACES = {
  choice: { at: { x: 1160, y: 2340 }, patch: { x: 880, y: 2060, w: 620, h: 540 }, mat: 'leaves' },
  fall: { at: { x: 4500, y: 2212 }, patch: { x: 2900, y: 1420, w: 2300, h: 1560 }, mat: 'water' },
  pursuit: { at: { x: 760, y: 1120 }, patch: { x: 500, y: 880, w: 620, h: 520 }, mat: 'thorn' },
  steps: { at: { x: 4180, y: 760 }, patch: { x: 3840, y: 520, w: 720, h: 520 }, mat: 'snow' },
  boon: { at: { x: 2600, y: 420 }, patch: { x: 2250, y: 220, w: 700, h: 440 }, mat: 'ash' },
};
ROOTS.forEach((r, i) => Object.assign(r, PLACES[r.id], { seed: i * 5 + 3, order: i }));

// THE DROWNED HOLLOW. A place with a way across it, and the way is the level -
// see savi-shallows.js for the crossing itself. Here: the bowl it sits in, the
// stream that fills it, and whether it has let go yet.
//
// The coal has no business here. Dry wood wanted fire; a jam of wet driftwood
// in a sluice gate wants two hands and four good hauls, which is a thing a
// child can plainly do, and it is the same ACTION button she uses everywhere.
const POND = POOL;
const INFLOW = [[4640, 1180], [4560, 1430], [4470, 1620], [4400, 1740]];
let drained = false;                                        // the hollow has let go

const ROAD = [[2600, 3340], [2600, 2900], [2560, 2500], [2600, 2100], [2600, 1820]];
const SPURS = [
  [[2420, 2000], [2000, 2180], [1500, 2300], [1160, 2340]],
  [[2820, 1900], [3020, 1990], [3240, 2080]],
  [[2380, 1480], [1800, 1320], [1200, 1180], [760, 1120]],
  [[2820, 1420], [3400, 1120], [3900, 880], [4180, 760]],
  [[2600, 1320], [2600, 960], [2600, 600], [2600, 420]],
];
// Little fires along the roads, where a coal that has gone dim comes back to
// itself. The keeper's own dialogue promises these; there only used to be two,
// both on the north road, so the thorn in the WEST had none at all and a
// second coal meant a sixteen second walk back to her hearth for it.
const SHELTERS = [
  { x: 2600, y: 1080, r: 110 }, { x: 2600, y: 700, r: 110 },       // the north road
  { x: 1810, y: 1330, r: 110 }, { x: 1250, y: 1200, r: 110 },      // the west road
];
// The shrine: a low stone platform round the foot of the Banyan, with steps up
// to it, oil lamps at its corners and a bell hung on a post. Its courtyard is
// under a season of leaves, and sweeping it is the first thing anyone asks of
// her - which is what a broom is FOR, and how she learns what her hands do.
const SHRINE = { x: TREE.x, y: TREE.y + 150, r: 300 };
const COURT = { x: SHRINE.x - 270, y: SHRINE.y - 120, w: 540, h: 300 };
// The broom is a THING, left on the road out to the first root. She picks it
// up, and she can put it down again anywhere she likes.
// The broom leans against the shrine steps beside the old woman, where anyone
// would keep a broom, and where Savi can plainly see it. It used to be down at
// the gate behind one of the avenue trees. And wherever she puts it down, that
// is where it will be next time she wants it - nobody should have to go looking
// through a valley for a broom.
// Far enough from the keeper that their two radii do not overlap: the broom is
// picked up from 74 and she is spoken to from 104, so anything closer than 178
// means one of them silently eats the other's press.
const BROOM_HOME = { x: 2296, y: 1932 };
const broom = { x: BROOM_HOME.x, y: BROOM_HOME.y, held: false };
/** Young banyans, one per freed root, each with its beat carved into it. */
const YOUNG = [];

// --- what the ground is made of --------------------------------------------------------------

/** Distance from a point to a polyline, for streams and roads alike. */
function polyDist(x, y, pts) {
  let d = 1e9;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, seg(x, y, pts[i - 1], pts[i]));
  return d;
}

const seg = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
};
function roadDist(x, y) {
  let d = 1e9;
  for (let i = 1; i < ROAD.length; i++) d = Math.min(d, seg(x, y, ROAD[i - 1], ROAD[i]));
  for (const s of SPURS) for (let i = 1; i < s.length; i++) d = Math.min(d, seg(x, y, s[i - 1], s[i]));
  return d;
}

const vn = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
function smoothN(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = vn(xi, yi), b = vn(xi + 1, yi), c = vn(xi, yi + 1), d = vn(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 3; i++) { v += smoothN(x * f, y * f) * a; a *= 0.5; f *= 2.07; }
  return v;
}

/** The pond's edge, wandering: nothing in a valley is a rectangle. */
function pondK(x, y) {
  const a = Math.atan2(y - POND.y, x - POND.x);
  const wob = 1 + (fbm(Math.cos(a) * 1.7 + 11, Math.sin(a) * 1.7 + 7) - 0.5) * 0.55;
  return Math.hypot((x - POND.x) / (POND.rx * wob), (y - POND.y) / (POND.ry * wob));
}

function inSoft(x, y, r, soft) {
  const e = Math.min(Math.min(x - r.x, r.x + r.w - x), Math.min(y - r.y, r.y + r.h - y));
  return e >= 0 ? 1 : Math.max(0, 1 + e / soft);
}

/** The valley, classified. terrain.js paints whatever it is told - this is the picture. */
function classify(x, y) {
  // The stream in, always running.
  const inD = polyDist(x, y, INFLOW);
  if (inD < 26) return TT.WATER;
  if (inD < 46) return TT.SHALLOW;
  // The bowl. The near shore and the two sandbars are wadeable; the rest of it
  // is over her head. Once it has let go the whole bowl is a marsh.
  const k = pondK(x, y);
  if (k < 1.0) {
    const isle = onIsle(x, y);
    if (isle) return isle.kind === 'stone' ? TT.ROCK : TT.SAND;
    if (drained) return k < 0.55 ? TT.SHALLOW : TT.MUD;
    return k < SHELF ? TT.WATER : TT.SHALLOW;
  }
  const n = fbm(x * 0.0016, y * 0.0016);
  if (roadDist(x, y) < 46) return TT.DIRT;
  if (inSoft(x, y, PLACES.boon.patch, 280) > 0.34 + n * 0.3) return TT.ASH;
  if (inSoft(x, y, PLACES.steps.patch, 320) > 0.3 + n * 0.3) return TT.SNOW;
  const dt = Math.hypot(x - TREE.x, y - TREE.y);
  if (dt < 430 + n * 190) return TT.MOSS;
  const edge = Math.min(x, y, V.w - x, V.h - y);
  if (edge < 300 + n * 340) return n > 0.52 ? TT.ROCK : TT.GRAVEL;
  if (n > 0.62) return TT.TALL;
  if (n < 0.31) return TT.DIRT;
  return TT.GRASS;
}

// --- the removable layer ------------------------------------------------------------------

const CELL = 14;
const LITTER = 0.16;
/**
 * WHEN GROUND IS CLEAR, and there is exactly one of these numbers now.
 *
 * There used to be two, and they disagreed. The loose golden leaves stopped
 * being DRAWN below 0.30, and a cell only COUNTED as clear below 0.22. So
 * between those two figures a cell showed no leaf whatsoever and still told the
 * root it was buried: you swept until the gold was gone, stood on bare ground,
 * and nothing happened, with nothing left on screen to sweep. One number, used
 * by the drawing and by the counting, or the game is lying to your eyes.
 */
const CLEAR = 0.3;
const MAT = { none: 0, leaves: 1, snow: 2, thorn: 3, ash: 4 };
const MATS = [
  null,
  { drag: 0.42, heal: 0.03, col: ['#c9762c', '#e0a13f', '#a5551f', '#d98a30'] },
  { drag: 0.50, heal: 0.00, col: ['#e9eff5', '#d6dee8', '#f4f8fc', '#c6d0dc'] },
  { drag: 0.30, heal: 0.09, col: ['#2b2233', '#1c1626', '#372b40', '#241d2e'] },
  { drag: 0.20, heal: 0.04, col: ['#5a5550', '#484340', '#67615b', '#4f4a47'] },
];

const G = { w: 0, h: 0, mat: null, dep: null, base: null, orig: null, cv: null, cx: null, img: null };

function buildGround() {
  G.w = Math.ceil(V.w / CELL); G.h = Math.ceil(V.h / CELL);
  const n = G.w * G.h;
  G.mat = new Uint8Array(n); G.dep = new Float32Array(n);
  G.base = new Float32Array(n); G.orig = new Float32Array(n);
  const put = (rect, m, amt, soft) => {
    for (let j = 0; j < G.h; j++) {
      for (let i = 0; i < G.w; i++) {
        const x = i * CELL + 7, y = j * CELL + 7;
        let k = inSoft(x, y, rect, soft);
        if (k <= 0) continue;
        k *= 0.68 + 0.32 * fbm(x * 0.006, y * 0.006);
        const q = j * G.w + i, d = amt * clamp01(k);
        if (d <= G.base[q] || pondK(x, y) < 1.02) continue;
        G.base[q] = d; G.dep[q] = d; G.orig[q] = d; G.mat[q] = m;
      }
    }
  };
  put({ x: -200, y: -200, w: V.w + 400, h: V.h + 400 }, MAT.leaves, LITTER + 0.05, 1);
  // THE WAY IN. It was a rectangle of leaves, which is not a place. Now the
  // avenue up to the shrine is lined with trees, and the leaves lie where
  // leaves actually lie: banked against the trunks, pooled in the hollows on
  // the lee side of the path, thin in the middle where feet have been. She
  // never has to get through any of it - it just moves as she goes.
  for (const d of DRIFTS) {
    put({ x: d.x - d.r, y: d.y - d.r * 0.62, w: d.r * 2, h: d.r * 1.24 }, MAT.leaves, d.d, d.r * 0.85);
  }
  // The shrine's courtyard, under a season of it. This is the broom's work.
  put(COURT, MAT.leaves, 0.95, 150);
  for (const r of ROOTS) if (r.mat !== 'water') put(r.patch, MAT[r.mat], 1.0, r.mat === 'thorn' ? 90 : 190);
  G.cv = document.createElement('canvas');
  G.cv.width = G.w; G.cv.height = G.h;
  G.cx = G.cv.getContext('2d');
  G.img = G.cx.createImageData(G.w, G.h);
  paintLayerColours();
}

/**
 * The colour of every cell of the layer, once, for good.
 *
 * What is in a cell never changes - leaves stay leaves. Only HOW MUCH of it is
 * there changes, and that is the alpha. This used to be redone every frame,
 * three parseInt() calls and three String.slice() allocations per cell across
 * ninety thousand cells: a quarter of a million string parses at sixty frames
 * a second, which measured at twelve of the sixteen milliseconds a frame cost.
 * Now the frame writes one byte per cell and nothing else.
 */
function paintLayerColours() {
  const d = G.img.data;
  for (let j = 0, q = 0, p = 0; j < G.h; j++) {
    for (let i = 0; i < G.w; i++, q++, p += 4) {
      const m = G.mat[q];
      if (!m) continue;
      const col = MATS[m].col[(i * 5 + j * 3) & 3];
      const lit = 0.8 + vn(i * 0.7, j * 0.9) * 0.36;
      d[p] = Math.min(255, parseInt(col.slice(1, 3), 16) * lit);
      d[p + 1] = Math.min(255, parseInt(col.slice(3, 5), 16) * lit);
      d[p + 2] = Math.min(255, parseInt(col.slice(5, 7), 16) * lit);
    }
  }
}

function depAt(x, y) {
  const i = (x / CELL) | 0, j = (y / CELL) | 0;
  if (i < 0 || j < 0 || i >= G.w || j >= G.h) return { m: 0, d: 0 };
  const q = j * G.w + i;
  return { m: G.mat[q], d: G.dep[q] };
}

let healRow = 0;
function settle(dt) {
  const rows = 48;
  for (let k = 0; k < rows; k++) {
    const j = (healRow + k) % G.h;
    for (let i = 0; i < G.w; i++) {
      const q = j * G.w + i, m = G.mat[q];
      if (!m) continue;
      const h = MATS[m].heal;
      if (h) G.dep[q] += (G.base[q] - G.dep[q]) * Math.min(1, h * dt * (G.h / rows));
    }
  }
  healRow = (healRow + rows) % G.h;
}

/** How much of a root's burden is gone, measured against what was there at the start. */
/** How much of a rectangle has been cleared of one material, 0..1. */
function cleared(p, m) {
  const i0 = Math.max(0, (p.x / CELL) | 0), i1 = Math.min(G.w - 1, ((p.x + p.w) / CELL) | 0);
  const j0 = Math.max(0, (p.y / CELL) | 0), j1 = Math.min(G.h - 1, ((p.y + p.h) / CELL) | 0);
  let t = 0, o = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== m || G.orig[q] < 0.5) continue;
      t++;
      if (G.dep[q] < CLEAR) o++;
    }
  }
  return t ? o / t : 1;
}

/**
 * The ground the root itself is under. This - not the whole field - is what
 * has to come off it.
 *
 * Asking for half of a root's whole patch by area was the same mistake in two
 * places. A broom stroke lifts about two and a half cells of a 1645 cell field,
 * so freeing one root by area came to some 350 separate taps; the coal cuts a
 * corridor, so by area it was worse than that. Neither was finishable, and
 * neither was ever the point. She is uncovering a root, and the root is where
 * the root is.
 */
/** How much of the ground within `rad` of a point is clear of `m`. */
const GOAL = { rx: 126, ry: 78 };
function clearedNear(at, m) {
  const i0 = Math.max(0, ((at.x - GOAL.rx) / CELL) | 0), i1 = Math.min(G.w - 1, ((at.x + GOAL.rx) / CELL) | 0);
  const j0 = Math.max(0, ((at.y - GOAL.ry) / CELL) | 0), j1 = Math.min(G.h - 1, ((at.y + GOAL.ry) / CELL) | 0);
  let t = 0, o = 0;
  // Even cells only: drawLayer draws a loose leaf from every other cell, so
  // three counted cells in four never showed one. What is counted is now
  // exactly what she can see lying there.
  for (let j = j0 & ~1; j <= j1; j += 2) {
    for (let i = i0 & ~1; i <= i1; i += 2) {
      const q = j * G.w + i;
      if (G.mat[q] !== m || G.orig[q] < 0.5) continue;
      const dx = (i * CELL + 7 - at.x) / GOAL.rx, dy = (j * CELL + 7 - at.y) / GOAL.ry;
      if (dx * dx + dy * dy > 1) continue;
      t++;
      if (G.dep[q] < CLEAR) o++;
    }
  }
  return t ? o / t : 1;
}
// A circle, not a box: she sweeps in arcs, so the corners of a rectangle were
// ground she could never quite get to, and the last twenty per cent of the job
// was chasing them. This is "the ground within a couple of paces of the root".
const fraction = (r) => clearedNear(r.at, MAT[r.mat]);

// --- particles --------------------------------------------------------------------------------

const P = [];
function spark(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    const a = (o.angle === undefined ? rand(0, TAU) : o.angle) + rand(-(o.arc || TAU) / 2, (o.arc || TAU) / 2);
    const sp = rand(o.sp0 || 40, o.sp1 || 200);
    P.push({
      x: x + rand(-8, 8), y: y + rand(-8, 8),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0),
      life: rand(o.l0 || 0.5, o.l1 || 1.4), t: 0,
      s: rand(o.s0 || 3, o.s1 || 7), rot: rand(0, TAU), spin: rand(-6, 6),
      col: o.col[(Math.random() * o.col.length) | 0], kind: o.kind || 'flat', drag: o.drag || 1.8,
    });
    if (P.length > 900) P.shift();
  }
}
function stepParticles(dt) {
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.t += dt;
    if (p.t >= p.life) { P.splice(i, 1); continue; }
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy *= k;
    if (p.kind === 'ember') p.vy -= 30 * dt;
    if (p.kind === 'dust') p.vy -= 14 * dt;      // it hangs, and drifts up as it thins
    // A leaf is a flat plate. It sheds speed fast, wanders across its own path
    // as it turns, and settles rather than dropping.
    if (p.kind === 'leaf') {
      p.vx += Math.cos(p.rot * 1.6) * 34 * dt;
      p.vy += (26 - Math.sin(p.rot * 1.6) * 20) * dt;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
}
function drawParticles(c) {
  for (const p of P) {
    const a = 1 - p.t / p.life;
    c.globalAlpha = p.kind === 'ember' ? a : a * 0.9;
    c.fillStyle = p.col;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    if (p.kind === 'ember') { c.beginPath(); c.arc(0, 0, p.s * a * 0.6, 0, TAU); c.fill(); }
    else if (p.kind === 'drop') { c.beginPath(); c.ellipse(0, 0, p.s * 0.5, p.s, 0, 0, TAU); c.fill(); }
    else if (p.kind === 'leaf') drawLeafSprite(c, p.s * 0.8, p.rot * 1.6);
    else if (p.kind === 'dust') {
      c.globalAlpha = a * a * 0.5;
      c.beginPath(); c.arc(0, 0, p.s * (0.7 + (1 - a) * 1.5), 0, TAU); c.fill();
    }
    else { c.beginPath(); c.ellipse(0, 0, p.s * 0.6, p.s * 0.36, 0, 0, TAU); c.fill(); }
    c.restore();
  }
  c.globalAlpha = 1;
}

// --- Savi -------------------------------------------------------------------------------------

const S = {
  x: START.x, y: START.y, r: 12, vx: 0, vy: 0, face: -Math.PI / 2,
  phase: 0, speed: 0, act: 0, actA: 0, dead: false, lastStep: 0, dashing: false,
  z: 0, vz: 0, safeX: START.x, safeY: START.y,
};
const st = {
  t: 0, woken: {}, count: 0, step: 0, ember: 0, hasEmber: false,
  bloom: 0, bloomK: 0, warmth: 0, ended: false, started: false,
  talking: null, reading: null, metKeeper: false,
  nearWoman: false, lastBeat: '', asked: {}, told: 0, prompt: '', swept: false,
};

let ctx = null, cv = null, terrain = null, grass = null, water = null, overlay = null, rotateEl = null;

// --- a phone held the right way up ------------------------------------------------------
//
// The same two-part answer Ashfall settled on. On Android the fullscreen
// request carries an orientation lock, so the screen turns itself and there is
// nothing to ask for. Every iPhone browser refuses the lock, so there the
// prompt is the fallback - and it is raised on `screen.orientation`, never on
// innerWidth alone, because coming back from the background those numbers are
// still the shape the window had BEFORE and a prompt raised on them used to
// stick with nothing able to clear it.

const isTouch = touchLike;

function isPortraitTouch() {
  if (!isTouch()) return false;
  const type = screen.orientation && screen.orientation.type;
  const tall = window.innerHeight > window.innerWidth;
  if (!type) return tall;
  // Where the two disagree one of them is stale: whichever says landscape wins.
  return type.startsWith('portrait') && tall;
}

function checkOrientation() {
  if (!rotateEl) return;
  rotateEl.classList.toggle('on', st.started && isPortraitTouch());
}
const keys = new Set();
const touch = { on: false, id: -1, ring: false, ox: 0, oy: 0, x: 0, y: 0 };

// A controller, any controller. A DualSense, an Xbox pad and anything else
// that speaks the standard mapping all arrive here the same way: the left
// stick or the d-pad walks, and cross / square / either trigger acts.
// One button, one verb, and they are where a thumb expects them:
//   CROSS    jump          CIRCLE  dash
//   SQUARE   action        TRIANGLE  put the broom down
const pad = {
  on: false, mx: 0, my: 0,
  held: false, pressed: false,           // square / R2: the action
  upHeld: false, upPressed: false,       // and the stick, for choosing a reply
  downHeld: false, downPressed: false,
  jumpHeld: false, jumpPressed: false,   // cross
  dashHeld: false, dashPressed: false,   // circle
  dropHeld: false, dropPressed: false,   // triangle
};
function pollPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of list) if (g && g.connected) { gp = g; break; }
  pad.on = !!gp;
  if (!gp) { pad.mx = 0; pad.my = 0; pad.held = false; pad.pressed = false; pad.jumpHeld = false; pad.jumpPressed = false; return; }
  const dead = (v) => (Math.abs(v) < 0.24 ? 0 : (v - Math.sign(v) * 0.24) / 0.76);
  let mx = dead(gp.axes[0] || 0), my = dead(gp.axes[1] || 0);
  const b = gp.buttons;
  const down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.4));
  if (down(12)) my = -1;
  if (down(13)) my = 1;
  if (down(14)) mx = -1;
  if (down(15)) mx = 1;
  pad.mx = mx; pad.my = my;
  const act = down(2) || down(7);
  const jump = down(0);
  const dash = down(1) || down(5);
  // Up and down, edge triggered, for walking the list of things she can say.
  const up = my < -0.55, dn = my > 0.55;
  pad.upPressed = up && !pad.upHeld; pad.upHeld = up;
  pad.downPressed = dn && !pad.downHeld; pad.downHeld = dn;
  pad.jumpPressed = jump && !pad.jumpHeld;
  pad.jumpHeld = jump;
  pad.dashPressed = dash && !pad.dashHeld;
  pad.dashHeld = dash;
  pad.dropPressed = down(3) && !pad.dropHeld;
  pad.dropHeld = down(3);
  pad.pressed = act && !pad.held;
  pad.held = act;
}
let forceMove = null, holding = false, wasHolding = false, tapDone = false, actT = 0;
let drain = 0;                // the hollow emptying, once the sluice is open
let crackT = 0;            // the fire crackles on a slow clock, never per frame
let ripT = 0;              // and the water is only allowed a ring so often

// A little run, not a combat roll. Ashfall dashes 156 units in 0.17 s, which
// out here would put her across a drift in one press; hers goes about 90, and
// she has two of them back in a couple of seconds. It is for skipping a puddle
// and for the joy of the leaves going up behind her.
const DASH_TIME = 0.16, DASH_SPEED = 570, DASH_MAX = 2, DASH_BACK = 1.1;
let dashT = 0, dashDir = 0, dashStock = DASH_MAX, dashRecharge = 0, dashWant = false;

// THE JUMP. 350 up against 1180 of gravity is 0.59 s in the air and 52 high,
// which at her walking speed carries her 116 across - and with a dash out of
// the air, 207. Those two numbers ARE the water level: every channel over there
// is wider than 207 so she cannot skip it, and every gap between one leaf and
// the next is under 116 except the single one that teaches the dash.
// THE JUMP, with the affordances every platformer has and this one did not.
//
//   COYOTE TIME   you can still jump for a moment after walking off an edge
//   A BUFFER      a jump pressed just before landing fires on landing instead
//                 of being thrown away, which is what it used to do
//   VARIABLE      letting go early cuts the arc short
//   HEAVY FALL    she comes down faster than she goes up, which is what makes
//                 a jump feel weighted instead of floaty
//   APEX HANG     gravity eases at the top, so there is a beat of control there
//
// Between them these are most of "a few jumps are not possible": the gaps
// always measured fine, because the measurement pressed the button on the
// perfect frame and a person does not.
const JUMP_V = 350, GRAV_UP = 1180, GRAV_DOWN = 1600;
const COYOTE = 0.12, BUFFER = 0.14;
let jumpWant = 0, coyote = 0, held = false, wasHeld = false, onLeaf = null;

function startJump() {
  if (st.talking || st.reading) return;
  S.vz = JUMP_V;
  S.z = 0.6;
  jumpWant = 0; coyote = 0; wasHeld = true;
  sfx.click();
  // Whatever she is standing on pushes back.
  if (onLeaf) { onLeaf.sink = Math.min(1, onLeaf.sink + 0.14); water.splash(S.x, S.y + 6, 70, 1.1); }
  else if (water.wetAt(S.x, S.y + 6)) water.splash(S.x, S.y + 6, 90, 1.3);
  else {
    const u = depAt(S.x, S.y + 6);
    if (u.m && u.d > 0.12) spark(S.x, S.y + 6, 8, { col: MATS[u.m].col, sp0: 40, sp1: 160, l0: 0.5, l1: 1.2, s0: 4, s1: 9, lift: 40 });
  }
}

/** Deep water is a wall. A leaf on it, or being in the air, is not. */
// Deep water: inside the bowl, inside the shelf, and not standing on an island.
// The shelf is a wadeable rim all the way round the lake, so she can paddle its
// edge; the deep is a lens lying in the middle of it, and the only way over
// that is the leaves. savi/tools/check-level.mjs proves there is no way round.
const isDeep = (x, y) => !drained && pondK(x, y) < SHELF && !onIsle(x, y);
const supported = (x, y) => !isDeep(x, y) || !!leafAt(x, y);

/** In she goes - which costs her nothing but the walk back. */
function fallIn() {
  water.splash(S.x, S.y + 6, 220, 2.6);
  spark(S.x, S.y + 6, 26, { col: ['#bfe0e8', '#8fbcc8', '#dff0f4'], sp0: 60, sp1: 260, l0: 0.5, l1: 1.3, s0: 3, s1: 8, kind: 'drop', lift: 70 });
  sfx.splash();
  S.x = S.safeX; S.y = S.safeY;
  S.z = 0; S.vz = 0; onLeaf = null;
  camera.x = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
  camera.y = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
}

/**
 * THE CAPSTAN. She opens the sluice by walking the bar round, not by pressing a
 * button four times: it is something a child can plainly do, it gives back
 * something the whole way round, and stopping costs nothing.
 */
let lastTurn = 0;
function stepCapstan(dt) {
  if (drained) return;
  const moving = S.speed > 30 && S.z <= 0.5;
  const opened = windCapstan(S.x, S.y, moving);
  // A creak of rope for every eighth of a turn, so it sounds like work.
  if (CAPSTAN.turns > lastTurn + 0.125) {
    lastTurn = CAPSTAN.turns;
    sfx.clack(0.7);
    rumble(0.18, 0.1, 60);
    if (Math.random() < 0.5) {
      spark(SLUICE_GATE.x, SLUICE_GATE.y + rand(-30, 30), 1,
        { col: ['#bfe0e8', '#8fbcc8'], sp0: 20, sp1: 90, l0: 0.4, l1: 1, s0: 2, s1: 5, kind: 'drop' });
    }
  }
  if (CAPSTAN.turns < lastTurn) lastTurn = CAPSTAN.turns;
  if (!opened) return;
  // Open. The hollow empties down it, and the land itself changes.
  sfx.bossDown();
  drained = true;
  terrain.invalidate(POND.x - POND.rx - 300, POND.y - POND.ry - 300,
    POND.x + POND.rx + 300, POND.y + POND.ry + 300);
  terrain.warm(camera.x, camera.y, view.w, view.h);
  water.splash(SLUICE_GATE.x, SLUICE_GATE.y, 420, 4.4);
  spark(SLUICE_GATE.x, SLUICE_GATE.y, 110, { col: ['#bfe0e8', '#c6e2ea', '#8fbcc8'], sp0: 120, sp1: 460, l0: 0.9, l1: 2.1, s0: 4, s1: 10, kind: 'drop' });
  rumble(0.9, 0.6, 340);
}

function startDash() {
  if (dashT > 0 || dashStock <= 0 || st.talking || st.reading) return;
  const mv = moveVector();
  const m = Math.hypot(mv.x, mv.y);
  dashDir = m > 0.15 ? Math.atan2(mv.y, mv.x) : S.face;
  S.face = dashDir;
  dashT = DASH_TIME;
  dashStock--;
  if (dashRecharge <= 0) dashRecharge = DASH_BACK;
  sfx.dash();
  rumble(0.3, 0.2, 90);
  // Whatever she is standing in comes up behind her.
  const fx2 = groundFx(S.x, S.y + 6);
  if (water.wetAt(S.x, S.y + 6)) water.splash(S.x, S.y + 6, 120, 2);
  if (fx2) {
    spark(S.x, S.y + 6, fx2.kind === 'drop' ? 14 : 16, {
      col: fx2.col, angle: dashDir + Math.PI, arc: 1.7, sp0: 90, sp1: 300,
      l0: 0.5, l1: 1.4, s0: 4, s1: 10, lift: fx2.lift, drag: 1.3, kind: fx2.kind,
    });
    const u = depAt(S.x, S.y + 6);
    if (u.m === MAT.leaves && u.d > 0.2) pushLitter(S.x, S.y + 8, 58, Math.cos(dashDir), Math.sin(dashDir), 9);
  }
}
// Three rings in a controller's diamond, bottom right: ACTION on the left where
// square is, JUMP below where cross is, DASH on the right where circle is.
const ring = { x: 0, y: 0, r: 42 };
const jumpRing = { x: 0, y: 0, r: 38 };
const dashRing = { x: 0, y: 0, r: 38 };
const drop = { x: 0, y: 0, r: 30, on: false };

/**
 * The root the tree is reaching with. Only ever a suggestion - it is what is
 * lit, and what the keeper points at, and nothing more. It is the NEAREST
 * unfreed root, so it follows her about instead of marching her round a list.
 */
function current() {
  let best = null, bd = 1e9;
  for (const r of ROOTS) {
    if (st.woken[r.id]) continue;
    const d = Math.hypot(S.x - r.at.x, S.y - r.at.y);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
/** The window grass.js works in: what is on screen, and a margin. */
const win = () => ({ x: camera.x, y: camera.y, w: view.w, h: view.h });

// --- the one button, HELD ------------------------------------------------------------------
//
// Tapping was wrong twice over. It felt like clicking rather than doing, and it
// never explained how a child moves a drift of leaves or a dam of branches.
//
// So she HOLDS it, and she has a broom - the same one anyone sweeps a doorstep
// with. She plants her feet and sweeps in a rhythm, and the cone she clears
// swings with the broom head. Her strength is not muscle, it is that she does
// not stop: the dam gives to a long steady pull, the thorn draws back from a
// coal held patiently out to it. Nothing here happens in one press.

// A broom is STROKES. Held down it was a cone in front of her that leaves
// quietly vanished into - a vacuum cleaner, not a besom. So one press is one
// sweep: she winds up, swings across herself, and the leaves go where the
// stroke sent them. Press again for the next one, alternating sides.
//
// The coal is different and is still held: you hold a flame out at a thing.
// So is the dam, which gives to one long pull. Only the broom swings.

const STROKE = { wind: 0.07, work: 0.2, rest: 0.1 };    // seconds
const SWEEP_BITE = 16;                                  // depth a second while it bites
let stroke = null;                                      // { t, side, mat }
let strokeN = 0;                                        // so only every other one is heard

/**
 * One press: is this a stroke of the broom, or is it somebody else's job?
 *
 * This asked the wrong question and broke the game. There is a thin litter of
 * leaves over the WHOLE valley - depth 0.16 - and anything over 0.1 counted as
 * sweepable, so a press anywhere at all decided it was a sweep. Stood at the
 * dam with a coal in her hand, the answer came back "where did she leave the
 * broom?", and because that refusal ate the press the fire never ran. The water
 * could not be cleared at all.
 *
 * So the broom now claims a press only when it is plainly the broom's business:
 * not at the dam, not at anything that wants fire, and not for the ordinary
 * litter that lies everywhere - only a real DRIFT.
 */
function beginStroke() {
  if (stroke || st.talking || st.reading) return false;
  // The jam is hauled, never swept.
  if (!drained && Math.hypot(S.x - CAPSTAN.x, S.y - CAPSTAN.y) < CAPSTAN.r + 40) return false;
  // A BROOM IN HER HAND ALWAYS SWEEPS. It used to refuse unless it found
  // something worth its while within two point samples, so half the presses did
  // nothing at all - no swing, no sound, no answer of any kind - which is the
  // one thing a button must never do. The stroke always happens; what it finds
  // is a separate question, answered by the carve.
  if (!broom.held) return false;
  const a = S.face, fx = Math.cos(a), fy = Math.sin(a);
  let m = 0, deepest = 0, burny = 0;
  for (let d = 0; d <= 70; d += 14) {
    const c = depAt(S.x + fx * d, S.y + fy * d + 6);
    if (!c.m) continue;
    if (c.m === MAT.thorn || c.m === MAT.ash) { if (c.d > burny) burny = c.d; continue; }
    if (c.d > deepest) { deepest = c.d; m = c.m; }
  }
  // THE COAL BEATS THE BROOM at thorn and dead ground, and this one line is why
  // the thorn root could not be cleared at all. Holding the button repeats
  // strokes, a stroke blocks actHold for the whole 0.37s it lasts, and actHold
  // is the only thing that removes thorn - so with a broom in her hand the coal
  // worked at about one frame in twenty-two while the HUD cheerfully said HOLD.
  if (burny > 0.12) return false;
  stroke = { t: 0, side: (S.lastSide = -(S.lastSide || 1)), mat: m || MAT.leaves, dry: deepest < 0.24 };
  sfx.swish(stroke.dry ? 0.7 : 1);
  return true;
}

/** The stroke, frame by frame: wind up, bite across, and follow through. */
function stepStroke(dt) {
  if (!stroke) return;
  stroke.t += dt;
  const total = STROKE.wind + STROKE.work + STROKE.rest;
  const k = stroke.t / total;
  // The broom goes from one side of her to the other over the whole stroke.
  S.sweep = stroke.side * Math.cos(clamp01(k) * Math.PI) * 0.95;
  S.act = 1;
  const biting = stroke.t > STROKE.wind && stroke.t < STROKE.wind + STROKE.work;
  if (biting) {
    const a = S.face + S.sweep * 0.7;
    // A broom's width, not a semicircle of the parish. The head is about 60
    // across and it is out in front of her where she is looking.
    const took = carve(S.x + Math.cos(a) * 34, S.y + Math.sin(a) * 34 + 6, a, 62, 0.8, dt * SWEEP_BITE, stroke.mat);
    if (took > 0.0004) {
      // Thrown the way the broom is going, not sucked toward her.
      const out = a + stroke.side * 1.15;
      if (stroke.mat === MAT.leaves) {
        pushLitter(S.x + Math.cos(a) * 46, S.y + Math.sin(a) * 46 + 6, 52, Math.cos(out), Math.sin(out), dt * 70);
      }
      spark(S.x + Math.cos(a) * 62, S.y + Math.sin(a) * 62 + 6, 3, stroke.mat === MAT.snow
        ? { col: ['#ffffff', '#e4ecf4', '#cfdae6'], angle: out, arc: 0.7, sp0: 130, sp1: 300, l0: 0.4, l1: 1, s0: 3, s1: 7, lift: 56 }
        : { col: MATS[1].col, angle: out, arc: 0.8, sp0: 170, sp1: 420, l0: 0.7, l1: 1.7, s0: 5, s1: 12, lift: 46, drag: 1.2 });
      if (!stroke.sounded) {
        stroke.sounded = true;
        strokeN++;
        if (strokeN & 1) { stroke.mat === MAT.snow ? sfx.clack(1.6) : sfx.hiss(); }
        rumble(0.2, 0.12, 70);
      }
    }
  }
  if (stroke.t >= total) {
    stroke = null; S.act = 0; S.sweep = 0;
    // Holding the broom down keeps her sweeping, stroke after stroke, with the
    // rest beat between them. This is not the vacuum cleaner that got thrown
    // out - that was one continuous cone sucking everything in. This is the
    // same single stroke, repeating, at the pace a person actually sweeps.
    tapDone = false;
  }
}

/** Held down: the coal out at thorn or dead ground. */
function actHold(dt) {
  if (st.talking || st.reading || stroke) return;
  if (tapDone) return;
  const a = S.face, fx = Math.cos(a), fy = Math.sin(a);
  // WHAT IS IN FRONT OF HER, sampled the whole way along her reach.
  //
  // This used to probe exactly two points - the cell under her feet and the
  // cell 54 ahead - and burn only if one of them was deeper than 0.3. Thorn
  // stops her walking at 0.6. So a ridge of thorn twenty units in front of her,
  // with thinner stuff beyond it, was invisible to both: she could not walk
  // through it and the burn looked at 0.05 and 0.23 and decided there was
  // nothing worth burning. Stuck, with a lit coal in her hand and a wall of
  // thorn in her face. That is why the thorn could not be cleared.
  let m = 0, deepest = 0;
  for (let d = 0; d <= 60; d += 12) {
    const c = depAt(S.x + fx * d, S.y + fy * d + 6);
    if ((c.m === MAT.thorn || c.m === MAT.ash) && c.d > deepest) { deepest = c.d; m = c.m; }
  }
  if (!m || deepest < 0.12) { S.act = 0; return; }
  if (!(st.hasEmber && st.ember > 0.02)) {
    if (actT <= 0) {
      actT = 1.2;
      say(st.hasEmber
        ? [['keeper', `Your coal has gone out, child. There is a fire ${towardFire()} — stand at it a moment and it will come back to itself.`]]
        : [['keeper', 'This will not move for hands. The old woman keeps a fire — take a coal from it and hold it out.']], null);
    }
    return;
  }
  S.act = 1;
  S.sweep = Math.sin(st.t * 3) * 0.12;
  // Thorn DRAWS BACK from warmth - it is not being cut - so it goes faster than
  // dead ground, which has to be burned off.
  // Thorn DRAWS BACK from warmth rather than being cut, so it is worked close
  // and slowly: a narrow reach, and slower than she walks, so the wall gives
  // way at its own pace and she has to follow it in. Dead ground has to be
  // burned off, which is broader and faster.
  const thorny = m === MAT.thorn;
  // THE CONE STARTS AT HER FEET, and this is the other half of the thorn bug.
  // It used to start 34 in front of her, and a cone opening forward from a
  // point 34 ahead does not contain the ground between her and that point: the
  // angle from the origin back to her own feet is 180 degrees, well outside the
  // 57 the arc allows. So the one cell that stops her walking - the cell she is
  // about to step into - was the one cell the fire could never touch. Cells
  // only ever cleared while they were still far enough ahead to be inside the
  // cone, which works right up until one is not clear by the time she reaches
  // it, and then she is stuck against it for good with a lit coal in her hand.
  //
  // From her feet, the nearest ground gets the strongest heat, which is also
  // what the thorn drawing back from her ought to look like.
  // A short reach for the thorn, so what she opens is a PATH - a corridor about
  // three cells wide that she has to walk down - rather than a clearing that
  // melts away in front of her before she gets to it.
  const took = carve(S.x, S.y + 6, a, thorny ? 46 : 124, 1.0, dt * (thorny ? 1.1 : 3.0), m);
  // And a coal held out at nothing costs nothing. She used to be able to stand
  // in a corridor she had already cleared and burn a whole coal down to ash
  // against thin air, which is what makes this feel broken rather than slow.
  if (took <= 0.0006) { crackT = 0; S.act = 0; return; }
  st.ember = Math.max(0, st.ember - dt * 0.085);
  if (Math.random() < dt * 34) {
    spark(S.x + fx * 52 + rand(-26, 26), S.y + fy * 52 + rand(-26, 26), 1,
      { col: ['#ffb35e', '#ff7a2e', '#ffd9a0'], sp0: 10, sp1: 70, l0: 0.5, l1: 1.3, s0: 3, s1: 6, kind: 'ember', lift: 30 });
  }
  crackT -= dt; if (crackT <= 0) { crackT = 0.9 + Math.random() * 0.6; sfx.hiss(); }
}

/** Which way the nearest fire is, in words a child would use. */
function towardFire() {
  let best = FIRE, bd = Math.hypot(S.x - FIRE.x, S.y - FIRE.y);
  for (const h of SHELTERS) {
    const d = Math.hypot(S.x - h.x, S.y - h.y);
    if (d < bd) { bd = d; best = h; }
  }
  const dx = best.x - S.x, dy = best.y - S.y;
  const way = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  return bd < 420 ? `just ${way} of you` : `back ${way}`;
}

/**
 * WHAT FLIES UP WHEN SHE HITS THE GROUND HERE.
 *
 * Every dash and every landing threw golden leaves, everywhere in the valley,
 * because the whole valley has a thin scatter of litter on it (0.16) and the
 * test was `depth > 0.12`. So she kicked up autumn leaves in the middle of a
 * lake. A drift has to actually BE a drift to throw leaves, and everywhere
 * else throws whatever is really there.
 */
function groundFx(x, y) {
  const u = depAt(x, y);
  if (u.m && u.d > 0.34) {                      // a real drift, not the ambient litter
    if (u.m === MAT.leaves) return { col: MATS[1].col, kind: 'leaf', lift: 40 };
    if (u.m === MAT.snow) return { col: ['#ffffff', '#e8eff6', '#cfdae6'], kind: 'dust', lift: 30 };
    if (u.m === MAT.ash) return { col: ['#8a8378', '#6f6a62', '#a49c90'], kind: 'dust', lift: 22 };
    if (u.m === MAT.thorn) return null;          // nothing kicks up out of thorn
  }
  switch (terrain.typeAt(x, y)) {
    case TT.WATER: case TT.SHALLOW:
      return { col: ['#bfe0e8', '#8fbcc8', '#dff0f4'], kind: 'drop', lift: 54, wet: true };
    case TT.SNOW: case TT.ICE:
      return { col: ['#ffffff', '#e8eff6', '#cfdae6'], kind: 'dust', lift: 26 };
    case TT.MUD:
      return { col: ['#5a4b33', '#6b5a3e', '#463a28'], kind: 'dust', lift: 14 };
    case TT.ASH:
      return { col: ['#8a8378', '#6f6a62', '#a49c90'], kind: 'dust', lift: 24 };
    case TT.GRASS: case TT.TALL: case TT.MOSS:
      return { col: ['#6f8a3e', '#87a54c', '#55703a'], kind: 'leaf', lift: 26 };
    default:
      // Stone, gravel, sand, the road: dust, and not much of it.
      return { col: ['#9a8f7e', '#b0a695', '#877d6d'], kind: 'dust', lift: 18 };
  }
}

/** Take a bite out of the layer, in a cone in front of her. */
function carve(x, y, a, r, arc, power, m) {
  const i0 = Math.max(0, ((x - r) / CELL) | 0), i1 = Math.min(G.w - 1, ((x + r) / CELL) | 0);
  const j0 = Math.max(0, ((y - r) / CELL) | 0), j1 = Math.min(G.h - 1, ((y + r) / CELL) | 0);
  let took = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== m) continue;
      const dx = i * CELL + 7 - x, dy = j * CELL + 7 - y;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - a);
      if (da > Math.PI) da = TAU - da;
      if (da > arc) continue;
      const t = Math.min(G.dep[q], (0.45 + (1 - d / r) * (1 - da / arc)) * power);
      if (t <= 0) continue;
      G.dep[q] -= t;
      // What is carved stays carved. Thorn is held below the depth that blocks
      // her, or a corridor heals shut behind her and she is walled in.
      const floor = m === MAT.leaves ? LITTER : 0;
      let base = Math.max(floor, G.dep[q] + 0.05);
      if (m === MAT.thorn) base = Math.min(base, 0.5);
      G.base[q] = Math.min(G.base[q], base);
      took += t;
    }
  }
  return Math.min(3, took * 0.02);
}

// --- the loop -------------------------------------------------------------------------------------

function moveVector() {
  if (forceMove) return forceMove;
  let mx = 0, my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (touch.on) {
    const dx = touch.x - touch.ox, dy = touch.y - touch.oy, d = Math.hypot(dx, dy);
    if (d > 10) { mx += dx / Math.max(d, 54); my += dy / Math.max(d, 54); }
  }
  mx += pad.mx; my += pad.my;
  const m = Math.hypot(mx, my);
  return m > 1 ? { x: mx / m, y: my / m } : { x: mx, y: my };
}

function step(dt) {
  st.t += dt;
  world.runTime = st.t;
  pollPad();
  if (pad.pressed) { begin(); if (st.talking || st.reading) advance(); }
  // A CONVERSATION ON A CONTROLLER. The choices were pointer-only, so with a
  // pad in your hands the game simply stopped at the first thing she asks.
  if (st.talking && st.talking.keeper) {
    if (pad.upPressed) moveSel(-1);
    if (pad.downPressed) moveSel(1);
    if (pad.pressed || pad.jumpPressed) pickSel();
    return;
  }
  if (pad.jumpPressed) { begin(); if (st.talking || st.reading) advance(); else jumpWant = BUFFER; }
  held = pad.jumpHeld || keys.has(' ');
  if (pad.dropPressed) dropBroom();
  if (pad.dashPressed) { begin(); dashWant = true; }
  holding = keys.has('e') || touch.ring || pad.held;   // space is the jump now
  if (actT > 0) actT -= dt;
  if (S.act > 0) S.act -= dt;
  // ONE press, and this is who gets it. The order matters: the broom comes
  // before the keeper, or Savi cannot sweep the courtyard the keeper is
  // standing in the middle of - every press there would open her mouth instead.
  if (holding && !wasHolding) {
    tapDone = false;
    // WHO GETS THE PRESS, and the order is the whole of it. Reading a mural
    // used to sit AFTER the broom stroke, and since a broom in hand always
    // swings, a player carrying the broom could never read one.
    const busy = st.talking || st.reading;
    const yt = !busy && YOUNG.find((q) => q.grow >= 1 && Math.hypot(S.x - q.x, S.y - q.y) < 130);
    const atKeeper = !busy && Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 104;
    if (yt) {
      openReading(yt); tapDone = true;
    } else if (!busy && !broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74) {
      broom.held = true; tapDone = true; sfx.pickup();
    } else if (atKeeper) {
      talkTo(keeperStart(st.count, ROOTS.length, st.metKeeper));
      st.metKeeper = true;
      tapDone = true;
    } else if (!busy && beginStroke()) {
      tapDone = true;                           // one press, one sweep
    }
  }
  if (!holding) tapDone = false;
  wasHolding = holding;
  if (holding && !tapDone && !stroke) beginStroke();
  stepStroke(dt);
  if (holding) actHold(dt); else if (!stroke) S.act = 0;

  if (st.talking || st.reading) { stepParticles(dt); return; }

  stepCapstan(dt);
  // The leaves first, so a drifting one carries her with it.
  stepShallows(dt, st.t, drained ? null : onLeaf);
  if (onLeaf && !drained && S.z <= 0.5) { S.x += onLeaf.dx; S.y += onLeaf.dy; }

  // The jump, and the fall.
  const grounded = S.z <= 0.5;
  coyote = grounded ? COYOTE : Math.max(0, coyote - dt);
  jumpWant = Math.max(0, jumpWant - dt);
  if (jumpWant > 0 && (grounded || coyote > 0)) startJump();
  if (S.z > 0 || S.vz !== 0) {
    // Letting go early cuts it short - ONCE, on the frame she lets go. Applied
    // every frame instead, as it was, 0.45 compounds to nothing in a fifth of a
    // second and the jump dies on the spot.
    if (S.vz > 0 && wasHeld && !held) S.vz *= 0.45;
    wasHeld = held;
    const g = S.vz > 0 ? GRAV_UP : GRAV_DOWN;
    S.vz -= g * (Math.abs(S.vz) < 60 ? 0.62 : 1) * dt;
    S.z += S.vz * dt;
    if (S.z <= 0) {
      S.z = 0; S.vz = 0;
      onLeaf = leafAt(S.x, S.y);
      if (!onLeaf && isDeep(S.x, S.y)) {
        // Landing snap: a hand's breadth short of a leaf is on it, not in the
        // water. Every platformer does this and nobody notices it but the
        // player who would otherwise have fallen.
        for (const L of LEAVES) {
          if (L.sink >= 1) continue;
          const d = Math.hypot(S.x - L.x, S.y - (L.y + L.dip));
          if (d < L.r * 0.9 + 13) {
            const k = (L.r * 0.86) / d;
            S.x = L.x + (S.x - L.x) * k;
            S.y = L.y + L.dip + (S.y - L.y - L.dip) * k;
            onLeaf = L;
            break;
          }
        }
      }
      if (!supported(S.x, S.y)) fallIn();
      else if (onLeaf) { sfx.thud(); water.splash(S.x, S.y + 6, 90, 1.4); }
      else {
        // Landing throws whatever is down there outward in a ring.
        const g3 = groundFx(S.x, S.y + 6);
        if (g3 && g3.wet) { sfx.wade(1.4); water.splash(S.x, S.y + 6, 150, 2); }
        else sfx.thud();
        if (g3) {
          spark(S.x, S.y + 6, 9, {
            col: g3.col, sp0: 70, sp1: 210, l0: 0.7, l1: 1.6,
            s0: 4, s1: 9, lift: g3.lift + 20, drag: 2, kind: g3.kind,
          });
          const u3 = depAt(S.x, S.y + 6);
          if (u3.m === MAT.leaves && u3.d > 0.2) pushLitter(S.x, S.y + 8, 62, 0, 0, 7);
        }
      }
    }
  }

  // The dash, and the two charges coming back.
  if (dashWant) { dashWant = false; startDash(); }
  if (dashStock < DASH_MAX) {
    dashRecharge -= dt;
    if (dashRecharge <= 0) { dashStock++; dashRecharge = dashStock < DASH_MAX ? DASH_BACK : 0; }
  }

  const mv = moveVector();
  const under = depAt(S.x, S.y + 6);
  // In the air nothing underfoot slows her - she is not standing in it. Wading
  // out to the bank and then jumping used to carry her only 65, which is short
  // of every leaf in the hollow.
  const air = S.z > 0.5;
  const drag = air || !under.m ? 0 : MATS[under.m].drag * Math.min(1, under.d);
  const wet = !air && water.wetAt(S.x, S.y + 6) ? 0.34 : 0;
  const sp = 196 * (1 - Math.max(drag, wet)) * (S.act > 0 ? 0.42 : 1);
  S.vx = mv.x * sp; S.vy = mv.y * sp;
  if (dashT > 0) {
    dashT -= dt;
    S.vx = Math.cos(dashDir) * DASH_SPEED;
    S.vy = Math.sin(dashDir) * DASH_SPEED;
    S.dashing = true;
    if (Math.random() < dt * 40) {
      const u2 = depAt(S.x, S.y + 6);
      if (u2.m && u2.d > 0.1) spark(S.x, S.y + 6, 1, { col: MATS[u2.m].col, sp0: 30, sp1: 140, l0: 0.4, l1: 1, s0: 4, s1: 8, lift: 30 });
    }
  } else S.dashing = false;

  let nx = S.x + S.vx * dt, ny = S.y + S.vy * dt;
  const ah = depAt(nx, ny + 6);
  if (ah.m === MAT.thorn && ah.d > 0.6) { nx = S.x; ny = S.y; }
  // She will not walk into water that is over her head. In the air she can go
  // anywhere - that is what the jump is FOR - and one axis at a time, so she
  // slides along a bank instead of sticking to it.
  if (S.z <= 0.5 && !supported(nx, ny)) {
    if (supported(nx, S.y)) ny = S.y;
    else if (supported(S.x, ny)) nx = S.x;
    else { nx = S.x; ny = S.y; }
  }
  // NOTHING stands between her and any root. There was a cold that shoved her
  // back from the four the tree had not named, which is a hard gate with a
  // story pinned to it - it requires, where a soft gate should only encourage.
  // What guides her instead: the lit root leading back to the trunk, the
  // keeper pointing, and the tools. Thorn and dead ground want the coal from
  // the keeper's fire, leaves and snow want the broom at the gate. Those slow
  // her down without ever telling her no, and she can go anywhere from the
  // first minute.
  S.x = clamp(nx, 40, V.w - 40);
  S.y = clamp(ny, 40, V.h - 40);

  // What she is standing on now, and the last dry thing she stood on.
  if (S.z <= 0.5) {
    onLeaf = drained ? null : leafAt(S.x, S.y);
    if (onLeaf && onLeaf.sink >= 1) { onLeaf = null; if (!supported(S.x, S.y)) fallIn(); }
    if (!isDeep(S.x, S.y)) { S.safeX = S.x; S.safeY = S.y; }
  } else onLeaf = null;

  S.speed = Math.hypot(S.vx, S.vy);
  if (S.speed > 14) {
    S.face = Math.atan2(S.vy, S.vx);
    S.phase += dt * (6 + S.speed * 0.024);
    const k = Math.floor(S.phase / Math.PI);
    if (k !== S.lastStep) {
      S.lastStep = k;
      const gf = groundFx(S.x, S.y + 6);
      if (gf && gf.wet) {
        // Not sfx.splash(). A splash is a body going in; this is a foot in two
        // inches of water, and it happens twice a second while she wades. And
        // no ring from here either - wilds-water.js already puts one out for
        // every step, so this was making two of everything.
        sfx.wade();
        spark(S.x, S.y + 6, 4, { col: gf.col, sp0: 30, sp1: 120, l0: 0.3, l1: 0.7, s0: 2, s1: 5, kind: 'drop', lift: 44 });
      } else if (gf) {
        // Two or three kicked up on the step itself, thrown the way the foot
        // was going. Event-driven, like an animation notify - never a stream.
        // No sound: a tick on every footfall through a valley knee-deep in
        // leaves was a metronome, not an atmosphere.
        const deep = under.d > 0.3 && under.m;
        spark(S.x, S.y + 6, deep ? 2 + (k & 1) : 1, {
          col: gf.col, angle: S.face, arc: 1.5, sp0: 30, sp1: deep ? 130 : 70,
          l0: 0.5, l1: 1.2, s0: 3, s1: deep ? 8 : 5, lift: gf.lift, drag: 2.2, kind: gf.kind,
        });
        if (under.d > 0.5 && under.m === MAT.snow && (k & 1)) sfx.clack(1.4);
      }
    }
  }

  // Walking through deep litter shoves it aside and leaves a path. This is the
  // deformation map every game with snow or long grass keeps around the player;
  // it is what makes the ground remember her instead of twitching at her.
  if (S.speed > 14 && S.z <= 0.5) {
    const u2 = depAt(S.x, S.y + 6);
    if (u2.m === MAT.leaves && u2.d > 0.12) {
      const inv = 1 / S.speed;
      pushLitter(S.x, S.y + 8, 46 + S.speed * 0.08, S.vx * inv, S.vy * inv, dt * (S.dashing ? 170 : 90));
    }
  }
  settleLitter(dt);

  settle(dt);
  stepParticles(dt);
  water.update(dt, terrain);
  grass.update(dt, st.t, win(), grassMovers(), []);

  if (st.hasEmber) {
    const warmHere = SHELTERS.some((h) => Math.hypot(S.x - h.x, S.y - h.y) < h.r) || Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 170;
    st.ember = clamp(st.ember + (warmHere ? dt * 0.4 : -dt * 0.021), 0, 1);
    if (st.ember > 0.05 && Math.random() < 0.4) {
      spark(S.x + rand(-6, 6), S.y - 18, 1, { col: ['#ffb35e', '#ff8a3c'], sp0: 4, sp1: 20, l0: 0.6, l1: 1.4, s0: 2, s1: 4, kind: 'ember', lift: 28 });
    }
  }

  // What she can reach, and what the button would do about it.
  st.prompt = '';
  const nearBroom = !broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74;
  const nearYoung = YOUNG.find((yt) => yt.grow >= 1 && Math.hypot(S.x - yt.x, S.y - yt.y) < 130);
  const atCapstan = !drained && Math.hypot(S.x - CAPSTAN.x, S.y - CAPSTAN.y) < CAPSTAN.r + 40;
  const boon = ROOTS.find((r) => r.mat === 'ash');
  const atBoon = boon && !st.woken[boon.id] && Math.hypot(S.x - boon.at.x, S.y - boon.at.y) < 200;
  if (atBoon && !(st.hasEmber && st.ember > 0.02)) st.prompt = `the coal has gone out — there is a fire ${towardFire()}`;
  else if (atBoon) st.prompt = 'take it to the root and give it away';
  else if (Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 120) st.prompt = 'speak to her';
  else if (atCapstan) {
    st.prompt = CAPSTAN.turns < 0.08
      ? 'walk round the capstan to raise the gate'
      : `the gate is coming up — ${(CAPSTAN.need - CAPSTAN.turns).toFixed(1)} turns to go`;
  }
  else if (nearBroom) st.prompt = 'take the broom';
  else if (nearYoung) st.prompt = `read ${nearYoung.name}`;
  else if (onLeaf) st.prompt = 'jump';
  else if (broom.held) st.prompt = 'hold to sweep · Q puts the broom back';

  for (const yt of YOUNG) {
    if (yt.grow < 1) yt.grow = Math.min(1, yt.grow + dt * 0.42);
    // Grown, and the carving lit: NOW it tells what it remembers.
    else if (yt.pending && !st.talking && !st.reading) {
      yt.pending = false;
      sfx.chime();
      say(yt.lines, null, yt.mural);
    }
  }

  if (Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 80 && !st.hasEmber) {
    st.hasEmber = true; st.ember = 1;
    sfx.boon();
    say([['keeper', 'You lift a coal out of her fire. It sits in your palm and does not burn you.']], null);
  }

  if (drained && drain < 1) {
    drain = Math.min(1, drain + dt / 5);
    // It goes down the sluice for a few seconds, and hard.
    // ONE ring every third of a second, not one every frame. This line used to
    // put about three hundred expanding rings on the water in five seconds.
    ripT -= dt;
    if (ripT <= 0) { ripT = 0.34; water.splash(SLUICE_GATE.x + rand(-20, 20), SLUICE_GATE.y + rand(-30, 30), 110, 1.6); }
    if (Math.random() < dt * 30) {
      spark(SLUICE_GATE.x + rand(-20, 20), SLUICE_GATE.y + rand(-40, 40), 1,
        { col: ['#bfe0e8', '#8fbcc8', '#dff0f4'], angle: 0.1, arc: 1.2, sp0: 120, sp1: 340, l0: 0.5, l1: 1.2, s0: 3, s1: 7, kind: 'drop' });
    }
  }

  // The courtyard, swept. The lamps take it as thanks and light themselves.
  if (!st.swept && cleared(COURT, MAT.leaves) > 0.5) {
    st.swept = true;
    sfx.chime(); sfx.boon();
    spark(SHRINE.x, SHRINE.y - 40, 60, { col: ['#ffb35e', '#ffd9a0'], sp0: 30, sp1: 200, l0: 1, l1: 2.2, s0: 3, s1: 7, kind: 'ember' });
    say([['keeper', 'Look at that. Swept clean, the way it used to be kept.'],
      ['keeper', 'The lamps have taken it for a kindness. That is the first warm thing here in two winters.'],
      ['keeper', 'Now — the roots, child. Follow the lit one out and do for it what you did for my doorstep.']], null);
  }

  // Any root she frees wakes, whichever it is and whenever she gets to it.
  // Work is never wasted and nothing has to be done in an order.
  // WHAT COUNTS AS FREEING A ROOT depends on what is on it, and this is where
  // the thorn was broken. The broom throws leaves wide, so wading a drift until
  // half of it is gone is a thing that happens by itself. The coal cuts a
  // CORRIDOR - so asking for half of a 620x520 mat of thorn by area meant
  // walking the same patch back and forth about ten times, on a coal that only
  // lasts nine seconds, from a fire 1581 away. Measured: fifty-four seconds of
  // honest work and two whole coals got 10.4% of the way there.
  //
  // So for the two the coal is for, what counts is REACHING THE ROOT. Cut a way
  // in to it and the whole mat lets go at once, which is what it was always
  // meant to do. For dead ground she has to arrive with the coal still alight,
  // and she gives it away - and stands there in the dark until the tree blooms.
  for (const r of ROOTS) {
    if (st.woken[r.id]) continue;
    const near = Math.hypot(S.x - r.at.x, S.y - r.at.y) < 78;
    let done;
    if (r.mat === 'water') done = drained && drain >= 1;
    else if (r.mat === 'thorn') done = near;
    else if (r.mat === 'ash') done = near && st.hasEmber && st.ember > 0.02;
    else done = fraction(r) > 0.8;
    if (done) {
      if (r.mat === 'ash') { st.hasEmber = false; st.ember = 0; }
      wake(r);
    }
  }

  if (st.count >= ROOTS.length && !st.ended && Math.hypot(S.x - TREE.x, S.y - TREE.y) < 340) {
    st.ended = true;
    setAmbientTheme(themeById('durga'));
    say(CLIMAX, () => { st.bloom = 1; }, 'bloom');
  }

  st.bloomK += (st.bloom - st.bloomK) * Math.min(1, dt * 0.6);
  st.warmth = clamp01(0.2 + (st.count / ROOTS.length) * 0.58 + st.bloomK * 0.22);

  const tx = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
  const ty = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
  const f = 1 - Math.exp(-5 * dt);
  camera.x += (tx - camera.x) * f;
  camera.y += (ty - camera.y) * f;
}

/** The whole burden lets go at once. Used when she reaches a root under it. */
function wither(p, m) {
  const i0 = Math.max(0, (p.x / CELL) | 0), i1 = Math.min(G.w - 1, ((p.x + p.w) / CELL) | 0);
  const j0 = Math.max(0, (p.y / CELL) | 0), j1 = Math.min(G.h - 1, ((p.y + p.h) / CELL) | 0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== m) continue;
      if (G.dep[q] > 0.05 && Math.random() < 0.05) {
        spark(i * CELL, j * CELL, 1, { col: MATS[m].col, sp0: 20, sp1: 90, l0: 0.8, l1: 1.8, s0: 3, s1: 7, lift: 40 });
      }
      G.dep[q] = 0; G.base[q] = 0;
    }
  }
}

function wake(r) {
  st.woken[r.id] = true;
  // The last of it comes off the root and the whole burden lets go at once -
  // the drift, the mat, whatever was lying on it. The work is the uncovering.
  wither(r.mat === 'water' ? { x: 0, y: 0, w: 0, h: 0 } : r.patch, MAT[r.mat] || 0);
  st.count++;
  st.step++;
  // Whichever root she freed, the tree remembers the next thing it had
  // forgotten. Route is hers; the story is still Savitri's, in order.
  const beat = ROOTS[st.told] || ROOTS[ROOTS.length - 1];
  st.told++;
  // An aerial root comes down where the burden was, takes hold, and is a tree.
  YOUNG.push({ x: r.at.x + 86, y: r.at.y + 34, grow: 0, mural: beat.mural, name: beat.name, lines: beat.lines, pending: true });
  sfx.chime(); sfx.boon();
  spark(r.at.x, r.at.y, 90, { col: ['#ffb35e', '#ffd9a0', '#ff8a3c'], sp0: 40, sp1: 320, l0: 1, l1: 2.4, s0: 3, s1: 8, kind: 'ember' });
  st.lastBeat = beat.lines[beat.lines.length - 1][1];
}

// --- drawing ----------------------------------------------------------------------------------------

function drawLayer(c) {
  // How much is lying here, and nothing else. The colours were painted once.
  const d = G.img.data, dep = G.dep;
  for (let q = 0, p = 3, n = dep.length; q < n; q++, p += 4) {
    const v = dep[q];
    // Fading to nothing as a cell approaches clear, instead of sitting at two
    // fifths opaque at the exact depth that counts as cleared.
    d[p] = v < 0.06 ? 0 : (v > 0.98 ? 246 : ((v - 0.06) * 262) | 0);
  }
  G.cx.putImageData(G.img, 0, 0);
  c.drawImage(G.cv, 0, 0, V.w, V.h);

  // Loose leaves over the mass, so it reads as leaves and not as paint.
  //
  // `& ~1` is the whole flicker bug. These come from every other cell, and the
  // first index used to be `(camera.x / CELL) | 0` - so every 14 pixels of
  // walking, the parity of that index flipped and EVERY leaf on screen was
  // replaced by the leaves of the cells in between. Snapping the start to an
  // even cell in WORLD space means a given leaf is either always drawn or
  // never drawn, and the ground holds still.
  const i0 = Math.max(0, ((camera.x / CELL) | 0) & ~1), i1 = Math.min(G.w - 1, ((camera.x + view.w) / CELL) | 0);
  const j0 = Math.max(0, ((camera.y / CELL) | 0) & ~1), j1 = Math.min(G.h - 1, ((camera.y + view.h) / CELL) | 0);
  const f = FIELD;
  for (let j = j0; j <= j1; j += 2) {
    for (let i = i0; i <= i1; i += 2) {
      const q = j * G.w + i, m = G.mat[q];
      if (!m || G.dep[q] < CLEAR * 0.66) continue;
      const h = vn(i * 3.1, j * 7.7);
      const lx = i * CELL + h * CELL, ly = j * CELL + vn(i * 5.3, j * 2.9) * CELL;
      c.save();
      if (m === MAT.leaves) {
        // Shoved by whatever has walked through here, and stirred by the wind:
        // one wave crossing the ground, not a wobble of its own.
        litterAt(lx, ly, f);
        c.translate(lx + f.dx, ly + f.dy * 0.8);
        c.rotate(h * TAU + f.sp + breezeAt(st.t, lx, ly));
      } else {
        c.translate(lx, ly);
        c.rotate(h * TAU);
      }
      // Thinning out as the cell approaches clear, so the last of it goes
      // gradually and she can see she is nearly there.
      c.globalAlpha = Math.min(1, G.dep[q]) * clamp01((G.dep[q] - CLEAR * 0.66) / (CLEAR * 0.5));
      if (m === MAT.thorn) {
        c.strokeStyle = '#120d18'; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(-7, 4); c.lineTo(0, -9); c.lineTo(7, 3); c.stroke();
      } else if (m === MAT.leaves) {
        c.fillStyle = MATS[m].col[(i + j) & 3];
        // Lying flat until something lifts an edge of it.
        drawLeafSprite(c, 7, 1.15 + h * 0.5 + Math.hypot(f.dx, f.dy) * 0.07);
      } else {
        c.fillStyle = MATS[m].col[(i + j) & 3];
        c.beginPath();
        c.ellipse(0, 0, m === MAT.snow ? 4 : 7, m === MAT.snow ? 3 : 4, 0, 0, TAU);
        c.fill();
      }
      c.restore();
    }
  }
  c.globalAlpha = 1;
}
/** Scratch for litterAt, so drawing a thousand leaves allocates nothing. */
const FIELD = { dx: 0, dy: 0, sp: 0 };

const SCENERY = [];
function sowScenery() {
  // The avenue first, so it is always there and always in the same place.
  for (const t of AVENUE) SCENERY.push({ x: t.x, y: t.y, rock: false, s: t.s, seed: t.seed, dead: false, avenue: 1 });
  for (let i = 0; i < 760; i++) {
    const x = rand(60, V.w - 60), y = rand(60, V.h - 60);
    if ((pondK(x, y) < 1.15 && !onIsle(x, y)) || roadDist(x, y) < 72) continue;
    if (Math.hypot(x - TREE.x, y - TREE.y) < 500) continue;
    if (Math.abs(x - 2600) < 230 && y > 2300) continue;      // keep the avenue clear
    let onPatch = false;
    for (const r of ROOTS) if (inSoft(x, y, r.patch, 60) > 0) onPatch = true;
    if (onPatch && Math.random() < 0.72) continue;
    const t = classify(x, y);
    const rock = t === TT.ROCK || t === TT.GRAVEL || Math.random() < 0.16;
    SCENERY.push({ x, y, rock, s: rand(0.7, 1.45), seed: i, dead: t === TT.ASH || t === TT.SNOW });
  }
  SCENERY.sort((a, b) => a.y - b.y);
}

function render() {
  const s = view.dpr * view.scale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.fillStyle = '#14100e';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  terrain.draw(ctx, camera.x, camera.y, view.w, view.h);
  drawLayer(ctx);
  grass.draw(ctx, st.t, win());
  drawDeep(ctx, st.t, drained);
  water.draw(ctx);

  drawShrine(ctx, SHRINE, st.t, st.swept ? 1 : 0);
  for (const r of ROOTS) drawRoot(ctx, TREE, r, !!st.woken[r.id], st.t, r === current());
  drawRootProgress(ctx);

  drawHollow(ctx);
  drawIsles(ctx, st.t);
  drawSluice(ctx, st.t, drained);
  drawLeaves(ctx, st.t, drained);

  S.broom = broom.held;
  if (!broom.held) drawBroom(ctx, broom, st.t);
  for (const yt of YOUNG) drawYoungTree(ctx, yt, st.t);

  drawGate(ctx, GATE, st.t, st.warmth);
  const below = [], above = [];
  for (const o of SCENERY) {
    if (o.x < camera.x - 160 || o.x > camera.x + view.w + 160 || o.y < camera.y - 240 || o.y > camera.y + view.h + 200) continue;
    (o.y < S.y ? below : above).push(o);
  }
  for (const o of below) (o.rock ? drawRock : drawTree)(ctx, o, st.t, st.warmth);

  drawBanyan(ctx, TREE, st.bloomK, st.t);
  drawFire(ctx, FIRE, st.t, st.hasEmber ? 0.4 : 1);
  drawWoman(ctx, WOMAN, st.t);
  for (const h of SHELTERS) drawFire(ctx, { x: h.x, y: h.y }, st.t + h.x, 0.6);

  if (st.hasEmber && st.ember > 0.02) glow(ctx, S.x, S.y - 10, 190 * (0.45 + st.ember * 0.55), `rgba(255,150,60,${0.22 * st.ember + 0.05})`);
  drawSavi(ctx, S, st.t);
  for (const o of above) (o.rock ? drawRock : drawTree)(ctx, o, st.t, st.warmth);
  grass.drawFront(ctx, st.t, win());
  drawParticles(ctx);
  drawCanopy(ctx, TREE, st.bloomK, st.t);

  // Along the avenue the air is full of them.
  const onAvenue = Math.abs(S.x - 2600) < 420 && S.y > 2250;
  const n = (onAvenue ? 74 : 38) + Math.round(st.bloomK * 50);
  drawFallingLeaves(ctx, st.t, camera, view, n, MATS[1].col);
  ctx.restore();

  const vig = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.32, view.w / 2, view.h / 2, view.w * 0.74);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(20,28,48,${0.52 - st.warmth * 0.3})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, view.w, view.h);
  drawHud();
  if (st.talking) paintFace();
}

/** The boulders that make the neck, the reeds round the shore, the lily pads. */
function drawHollow(ctx) {
  // Reeds, standing where the water is shallow.
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU;
    const wob = 0.93 + vn(i * 3.1, 7) * 0.17;
    const x = POND.x + Math.cos(a) * POND.rx * wob, y = POND.y + Math.sin(a) * POND.ry * wob;
    if (x < camera.x - 60 || x > camera.x + view.w + 60 || y < camera.y - 90 || y > camera.y + view.h + 60) continue;
    const n = 3 + ((i * 7) % 4);
    for (let k = 0; k < n; k++) {
      const rx = x + (vn(i, k) - 0.5) * 34, ry = y + (vn(k, i) - 0.5) * 22;
      const h = 22 + vn(i * 2, k * 3) * 26;
      const lean = Math.sin(st.t * 0.9 + i + k) * 4;
      ctx.strokeStyle = drained ? '#7d7b46' : '#5f6b3e';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo(rx + lean * 0.5, ry - h * 0.6, rx + lean, ry - h);
      ctx.stroke();
      if ((i + k) % 5 === 0) {
        ctx.fillStyle = '#6b5a32';
        ctx.beginPath(); ctx.ellipse(rx + lean, ry - h - 3, 1.7, 4.4, 0, 0, TAU); ctx.fill();
      }
    }
  }
  // Lily pads, while there is water to float on.
  if (!drained) {
    for (let i = 0; i < 44; i++) {
      const a = vn(i, 1) * TAU, r = Math.sqrt(vn(i, 2)) * 0.74;
      const x = POND.x + Math.cos(a) * POND.rx * r, y = POND.y + Math.sin(a) * POND.ry * r;
      const drift = Math.sin(st.t * 0.4 + i) * 3;
      ctx.fillStyle = i % 4 ? '#3d6b46' : '#4b7a4e';
      ctx.beginPath();
      ctx.ellipse(x + drift, y, 16 + vn(i, 5) * 10, 12 + vn(i, 7) * 7, a, 0.5, TAU);
      ctx.fill();
      if (i % 6 === 0) {
        ctx.fillStyle = '#e8d8e4';
        ctx.beginPath(); ctx.arc(x + drift + 4, y - 3, 3.4, 0, TAU); ctx.fill();
      }
    }
  }
}

/**
 * HOW MUCH OF A ROOT IS FREE, drawn on the root itself.
 *
 * Only for the two the broom is for - the others announce themselves, since
 * walking towards a root through thorn, or hauling a jam apart, tell you where
 * you are without a dial. But sweeping a drift gave no sign of progress at all
 * until the instant it finished, so there was no way to tell "nearly" from
 * "this is not working", and no reason to keep going.
 */
function drawRootProgress(ctx) {
  for (const r of ROOTS) {
    if (st.woken[r.id]) continue;
    const d = Math.hypot(S.x - r.at.x, S.y - r.at.y);
    if (d > 460) continue;
    if (r.mat === 'thorn' || r.mat === 'ash') {
      // These two are not cleared, they are REACHED, so the mark is a target
      // and not a dial. They were the only roots with no readout at all, and
      // they are the ones whose goal is least obvious.
      const pulse = 0.5 + 0.5 * Math.sin(st.t * 2.2);
      ctx.save();
      ctx.strokeStyle = `rgba(255,190,110,${clamp01((460 - d) / 200) * (0.25 + pulse * 0.3)})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 12]);
      ctx.beginPath(); ctx.ellipse(r.at.x, r.at.y, 78, 48, 0, st.t * 0.3, st.t * 0.3 + TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      continue;
    }
    const k = clamp01(fraction(r) / 0.8);
    const a = clamp01((460 - d) / 160) * (0.35 + k * 0.5);
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(240,226,203,${a * 0.22})`;
    ctx.beginPath(); ctx.ellipse(r.at.x, r.at.y, GOAL.rx, GOAL.ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,${(180 + k * 60) | 0},${(94 + k * 90) | 0},${a})`;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(r.at.x, r.at.y, GOAL.rx, GOAL.ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // And the root itself glowing warmer the nearer it is to breathing.
    if (k > 0.04) glow(ctx, r.at.x, r.at.y, 90 + k * 90, `rgba(255,170,80,${0.05 + k * 0.16})`);
    ctx.restore();
  }
}

function drawHud() {
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(240,226,203,0.8)';
  ctx.fillText(`${st.count} of ${ROOTS.length} roots awake`, 22, 30);
  const cur = current();
  if (cur && !st.ended) {
    ctx.fillStyle = 'rgba(255,179,94,0.92)';
    const near = Math.hypot(S.x - cur.at.x, S.y - cur.at.y) < 460;
    const pc = near && (cur.mat === 'leaves' || cur.mat === 'snow')
      ? ` — ${Math.min(99, Math.round(clamp01(fraction(cur) / 0.8) * 100))}% uncovered` : '';
    ctx.fillText(`the tree is reaching — ${cur.hint}${pc}`, 22, 50);
  }
  // This bar is the COAL burning down, and nothing else. The broom never runs
  // out - it is a broom.
  if (st.hasEmber) {
    ctx.fillStyle = 'rgba(240,226,203,0.55)';
    ctx.font = '600 10px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText('COAL', 22, 66);
    ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,170,80,0.26)';
    ctx.fillRect(56, 59, 88, 7);
    ctx.fillStyle = `rgba(255,${(150 + st.ember * 70) | 0},${(60 + st.ember * 70) | 0},0.95)`;
    ctx.fillRect(56, 59, 88 * st.ember, 7);
  }

  if (toast) {
    toast.t += 1 / 60;
    if (toast.t > 3.4) toast = null;
    else {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, (3.4 - toast.t) * 1.6);
      ctx.fillStyle = 'rgba(240,226,203,0.9)';
      ctx.fillText(toast.text, view.w / 2, 76);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }
  if (st.prompt) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,214,170,0.92)';
    ctx.fillText(st.prompt, view.w / 2, view.h - 54);
    ctx.textAlign = 'left';
  }
  if (broom.held) {
    ctx.fillStyle = 'rgba(200,160,90,0.85)';
    ctx.fillText('broom in hand', 22, st.hasEmber ? 84 : 66);
  }

  // Putting it down, for a thumb and for a pad.
  drop.on = broom.held;
  if (drop.on) {
    drop.x = view.w - 116; drop.y = view.h - 202;
    ctx.beginPath(); ctx.arc(drop.x, drop.y, 28, 0, TAU);
    ctx.fillStyle = 'rgba(200,160,90,0.18)'; ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,90,0.65)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(230,205,160,0.9)';
    ctx.font = '600 10px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText('DROP', drop.x, drop.y + 3);
    ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.textAlign = 'left';
  }

  // The jump.
  jumpRing.x = view.w - 116; jumpRing.y = view.h - 44;
  ctx.beginPath(); ctx.arc(jumpRing.x, jumpRing.y, 32, 0, TAU);
  ctx.fillStyle = S.z > 0.5 ? 'rgba(198,226,196,0.4)' : 'rgba(198,226,196,0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,238,210,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(226,244,222,0.92)';
  ctx.font = '600 11px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillText('JUMP', jumpRing.x, jumpRing.y + 3);
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'left';

  // The dash, and how many she has left.
  dashRing.x = view.w - 52; dashRing.y = view.h - 104;
  ctx.beginPath(); ctx.arc(dashRing.x, dashRing.y, 32, 0, TAU);
  ctx.fillStyle = dashStock > 0 ? 'rgba(150,190,225,0.2)' : 'rgba(150,190,225,0.07)';
  ctx.fill();
  ctx.strokeStyle = dashStock > 0 ? 'rgba(180,215,245,0.7)' : 'rgba(180,215,245,0.25)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(214,236,255,0.9)';
  ctx.font = '600 11px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillText('DASH', dashRing.x, dashRing.y + 3);
  for (let i = 0; i < DASH_MAX; i++) {
    ctx.beginPath();
    ctx.arc(dashRing.x - 8 + i * 16, dashRing.y + 18, 3.2, 0, TAU);
    ctx.fillStyle = i < dashStock ? 'rgba(190,225,255,0.95)' : 'rgba(190,225,255,0.22)';
    ctx.fill();
  }
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'left';

  ring.x = view.w - 180; ring.y = view.h - 104;
  ctx.beginPath(); ctx.arc(ring.x, ring.y, 38, 0, TAU);
  ctx.fillStyle = holding ? 'rgba(255,179,94,0.45)' : 'rgba(255,179,94,0.24)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,190,120,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,224,186,0.95)';
  const label = st.prompt.startsWith('take') ? 'TAKE'
    : st.prompt.startsWith('read') ? 'READ'
      : st.prompt.startsWith('speak') ? 'TALK'
        : st.prompt.startsWith('haul') || st.prompt.startsWith('it ') ? 'HAUL'
          : st.hasEmber && st.ember > 0.08 ? 'HOLD' : 'SWEEP';
  ctx.font = '600 12px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillText(label, ring.x, ring.y + 4);
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillStyle = `rgba(240,226,203,${st.t < 16 ? 0.5 : 0.26})`;
  ctx.fillText(pad.on ? 'cross to jump · circle to dash · square to act' : 'space to jump · shift to dash · E or the ring to act', view.w / 2, view.h - 22);
  ctx.textAlign = 'left';
}

// --- what she is told, and what she can ask ------------------------------------------------
//
// Two shapes through one panel. A RECITAL is a run of lines she listens to (the
// legend, over its mural), advanced with a tap. A CONVERSATION is one line of
// the keeper's and two or three things a child might say back, which is what
// makes her someone rather than a sign.

function say(lines, onDone, mural) {
  st.talking = { lines: lines.slice(), i: 0, onDone, mural };
  paintTalk();
}

function talkTo(node) {
  keeperFill(st.count, ROOTS.length, st.lastBeat);
  st.talking = { keeper: node, who: 'The Keeper' };
  paintTalk();
}

function paintTalk() {
  const t = st.talking;
  if (!t) return;
  let body;
  if (t.keeper) {
    const n = KEEPER[t.keeper];
    st.asked[t.keeper] = true;
    // A question asked is a question answered: it does not come round again,
    // in this conversation or any later one. Hubs and the lines that change
    // with the valley are marked `repeat`, so there is always somewhere to go.
    const open = n.choices.filter((c) => c.to === 'leave' || (KEEPER[c.to] && KEEPER[c.to].repeat) || !st.asked[c.to]);
    // And there is always a way out. Without this you can walk in a circle
    // round her answers and never find the door.
    const list = open.some((c) => c.to === 'leave')
      ? open : [...open, { say: 'I should go.', to: 'leave' }];
    t.list = list;
    const cs = list.map((c, i) => `<button class="choice" data-i="${i}">${c.say}</button>`).join('');
    body = `<div class="saybar"><canvas class="face" width="220" height="300"></canvas>
      <div class="readtext"><div class="who">${t.who}</div><p>${n.text}</p>
      <div class="choices">${cs}</div></div></div>`;
    t.face = 'keeper';
  } else {
    const line = t.lines[t.i];
    const who = Array.isArray(line) ? line[0] : 'keeper';
    const text = Array.isArray(line) ? line[1] : line;
    const m = t.mural ? '<canvas id="mural" width="460" height="250"></canvas>' : '';
    body = `${m}<div class="saybar"><canvas class="face" width="220" height="300"></canvas>
      <div class="readtext"><div class="who">${WHO[who] || ''}</div><p>${text}</p>
      <div class="more">tap to go on</div></div></div>`;
    t.face = who;
  }
  overlay.innerHTML = `<div class="panel">${body}</div>`;
  overlay.classList.add('on');
  // The portrait is kept, not just drawn. It used to be painted once into a
  // dead canvas, so the speaker was a still photograph with a voice; Hades
  // leans its portraits into the words and breathes them between the lines.
  const fc = overlay.querySelector('.face');
  t.faceCtx = fc ? fc.getContext('2d') : null;
  t.muralCtx = t.mural ? document.getElementById('mural').getContext('2d') : null;
  if (t.shownAt === undefined) t.shownAt = st.t;
  t.lineAt = st.t;
  paintFace();
  if (t.keeper) {
    if (t.sel === undefined || t.sel >= t.list.length) t.sel = 0;
    overlay.querySelectorAll('.choice').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        choose(st.talking.list[+b.dataset.i].to);
      });
      // A finger or a mouse moving over one also moves the highlight, so the
      // two ways of choosing never disagree about what is selected.
      b.addEventListener('pointerenter', () => { st.talking.sel = +b.dataset.i; markSel(); });
    });
    markSel();
  }
}

/** Move the highlight up or down the list of things she could say. */
function moveSel(d) {
  const t = st.talking;
  if (!t || !t.list || !t.list.length) return;
  t.sel = ((t.sel || 0) + d + t.list.length) % t.list.length;
  markSel();
  sfx.tick();
}

/** Put the highlight on the right button. */
function markSel() {
  const t = st.talking;
  if (!t || !t.list) return;
  overlay.querySelectorAll('.choice').forEach((b, i) => b.classList.toggle('sel', i === (t.sel || 0)));
}

/** Say the highlighted one. */
function pickSel() {
  const t = st.talking;
  if (!t || !t.list || !t.list.length) return;
  choose(t.list[t.sel || 0].to);
}

function choose(to) {
  sfx.ui();
  if (to === 'leave') closeTalk();
  else { st.talking.keeper = to; st.talking.sel = 0; paintTalk(); }
}

/**
 * The speaker, every frame while she is speaking: the slide-in when she first
 * arrives, the breath between lines, and the lean into a new one.
 */
function paintFace() {
  const t = st.talking;
  if (!t || !t.faceCtx) return;
  const k = clamp01((st.t - (t.shownAt || st.t)) / 0.3);
  const emph = clamp01(1 - (st.t - (t.lineAt || st.t)) / 0.42);
  t.faceCtx.clearRect(0, 0, 220, 300);
  drawPortrait(t.faceCtx, t.face, 0, 0, 220, st.t, k, emph);
  if (t.muralCtx) drawMural(t.muralCtx, t.mural, 460, 250, st.t);
}

function closeTalk() {
  const t = st.talking;
  st.talking = null;
  overlay.classList.remove('on');
  overlay.innerHTML = '';
  if (t && t.onDone) t.onDone();
}

/** A tap anywhere: only a recital advances that way. A conversation waits. */
function advance() {
  if (st.reading) { stepReading(); return; }
  const t = st.talking;
  if (!t || t.keeper) return;
  t.i++;
  if (t.i < t.lines.length) { paintTalk(); sfx.ui(); return; }
  closeTalk();
}

/** She puts it down, and it goes back to its place by the old woman. */
function dropBroom() {
  if (!broom.held) return;
  broom.held = false;
  broom.x = BROOM_HOME.x;
  broom.y = BROOM_HOME.y;
  st.prompt = '';
  toast = { t: 0, text: 'left against the shrine steps, by the old woman' };
  sfx.ui();
}
let toast = null;

/** Standing at a young banyan and reading what is cut into it, full screen. */
function openReading(yt) {
  st.reading = { yt, i: 0 };
  sfx.chime();
  paintReading();
}
function paintReading() {
  const r = st.reading;
  if (!r) return;
  const [who, text] = r.yt.lines[r.i];
  overlay.innerHTML = `<div class="read">
      <canvas id="bigmural" width="880" height="470"></canvas>
      <div class="readbar">
        <canvas id="bigface" width="220" height="300"></canvas>
        <div class="readtext"><div class="who">${WHO[who] || ''}</div><p>${text}</p>
          <div class="more">${r.i + 1} / ${r.yt.lines.length} &nbsp;·&nbsp; tap to go on</div></div>
      </div>
    </div>`;
  overlay.classList.add('on', 'full');
  drawMural(document.getElementById('bigmural').getContext('2d'), r.yt.mural, 880, 470, st.t);
  drawPortrait(document.getElementById('bigface').getContext('2d'), who, 0, 0, 220, st.t, 1);
}
function stepReading() {
  const r = st.reading;
  if (!r) return;
  r.i++;
  if (r.i < r.yt.lines.length) { paintReading(); sfx.ui(); return; }
  st.reading = null;
  overlay.classList.remove('on', 'full');
  overlay.innerHTML = '';
}

const WHO = { keeper: 'The Keeper', savitri: 'Savitri', satyavan: 'Satyavan', yama: 'Yama, Lord of Death', narada: 'Narada' };

// --- boot --------------------------------------------------------------------------------------------

let lastW = -1, lastH = -1;
function resize() {
  const W2 = window.innerWidth, H2 = window.innerHeight;
  if (W2 < 2 || H2 < 2) return;
  lastW = W2; lastH = H2;
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.h = 720;
  view.w = Math.round(720 * (W2 / H2));
  view.scale = H2 / 720;
  view.cw = W2; view.ch = H2;
  cv.width = Math.round(W2 * view.dpr);
  cv.height = Math.round(H2 * view.dpr);
  cv.style.width = W2 + 'px';
  cv.style.height = H2 + 'px';
  arena.x = 0; arena.y = 0; arena.w = V.w; arena.h = V.h;
  checkOrientation();
}

function begin() {
  if (st.started) return;
  st.started = true;
  document.getElementById('title').classList.remove('on');
  // The tap that starts it is the gesture a phone needs: fullscreen, and with
  // it the landscape lock and the screen kept awake.
  if (isTouch() && !isFullscreen()) enterFullscreen().then(checkOrientation);
  checkOrientation();
  try {
    initAudio(); unlockAudio();
    setMusicEnabled(true); setMusicActive(true); setMusicIntensity(0);
    setAmbientTheme(themeById('bhupali'));
  } catch (e) { /* silence is survivable */ }
}

function main() {
  cv = document.getElementById('game');
  ctx = cv.getContext('2d');
  overlay = document.getElementById('overlay');
  rotateEl = document.getElementById('rotate');

  // Which build this phone is running, and whether it is the one on the server.
  // Pages caches every file for ten minutes, so "my change isn't there" is a
  // real thing and this is how you tell.
  const ver = document.getElementById('ver');
  if (ver) {
    ver.innerHTML = `build ${BUILD} &middot; ${BUILT}`;
    latestBuild().then((n) => {
      if (n === null) ver.innerHTML += ' &middot; <span class="dim">offline</span>';
      else if (n > BUILD) {
        ver.innerHTML += ` &middot; <b class="new">build ${n} is out</b> `
          + '<button id="refresh" class="mini">fetch it</button>';
        document.getElementById('refresh').addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          hardRefresh((msg) => { ver.textContent = msg; });
        });
      } else {
        ver.innerHTML += ' &middot; <span class="ok">up to date</span>'
          + ' <button id="refresh" class="mini">refetch</button>';
        document.getElementById('refresh').addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          hardRefresh((msg) => { ver.textContent = msg; });
        });
      }
    });
  }
  world.player = S;                 // grass.js and wilds-water.js both follow her
  world.overworld = true;
  world.enemies.length = 0;
  gfx.epoch = 0;

  buildGround();
  initLitter(V.w, V.h);
  terrain = createTerrain({ W: V.w, H: V.h, classify, roadDist });
  grass = createGrass(terrain, { W: V.w, H: V.h, x0: 0, y0: 0, blocked: (x, y) => pondK(x, y) < 1.05 && !onIsle(x, y) });
  water = createWildsWater();
  water.setCalm(2.6);          // a lake this wide has too much shore to lap at
  sowScenery();
  resize();
  camera.x = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
  camera.y = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
  terrain.warm(camera.x, camera.y, view.w, view.h);
  addEventListener('resize', resize);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (st.talking && st.talking.keeper) {
      if (k === 'arrowup' || k === 'w') { moveSel(-1); e.preventDefault(); return; }
      if (k === 'arrowdown' || k === 's') { moveSel(1); e.preventDefault(); return; }
      if (k === 'enter' || k === ' ' || k === 'e') { pickSel(); e.preventDefault(); return; }
    }
    if (k === 'q') dropBroom();
    if (k === 'shift' || k === 'x') { begin(); dashWant = true; e.preventDefault(); }
    if (k === ' ' || k === 'enter' || k === 'e') {
      begin();
      if (st.talking || st.reading) advance();
      else if (k === ' ') jumpWant = BUFFER;
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // The stick lives on ONE pointer, and it is let go by the WINDOW - lifting a
  // finger over the HUD, off the edge of the screen, or into a dialogue never
  // reached a listener on the canvas, and she would keep walking on her own.
  const letGo = (e) => {
    if (e && e.pointerId !== undefined && touch.id !== -1 && e.pointerId !== touch.id) return;
    touch.on = false; touch.ring = false; touch.id = -1;
  };
  cv.addEventListener('pointerdown', (e) => {
    begin();
    if (isTouch() && !isFullscreen()) enterFullscreen().then(checkOrientation);
    if (st.talking || st.reading) { advance(); return; }
    const sc = view.scale || 1;
    if (drop.on && Math.hypot(e.clientX / sc - drop.x, e.clientY / sc - drop.y) < drop.r) { dropBroom(); return; }
    if (Math.hypot(e.clientX / sc - jumpRing.x, e.clientY / sc - jumpRing.y) < jumpRing.r) { jumpWant = BUFFER; return; }
    if (Math.hypot(e.clientX / sc - dashRing.x, e.clientY / sc - dashRing.y) < dashRing.r) { dashWant = true; return; }
    if (Math.hypot(e.clientX / sc - ring.x, e.clientY / sc - ring.y) < ring.r) {
      touch.ring = true; touch.id = e.pointerId === undefined ? -1 : e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not every browser */ }
      return;
    }
    if (touch.on) return;                       // a second finger does not steer
    touch.on = true; touch.id = e.pointerId === undefined ? -1 : e.pointerId;
    touch.ox = e.clientX; touch.oy = e.clientY; touch.x = e.clientX; touch.y = e.clientY;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not every browser */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!touch.on || (touch.id !== -1 && e.pointerId !== touch.id)) return;
    touch.x = e.clientX; touch.y = e.clientY;
  });
  addEventListener('pointerup', letGo);
  addEventListener('pointercancel', letGo);
  cv.addEventListener('lostpointercapture', letGo);
  // Tabbing away with a key or a finger down used to leave it down for good.
  const allOff = () => { keys.clear(); touch.on = false; touch.ring = false; touch.id = -1; };
  addEventListener('blur', allOff);
  document.addEventListener('visibilitychange', () => { if (document.hidden) allOff(); });
  overlay.addEventListener('pointerdown', () => { begin(); advance(); });
  document.getElementById('title').addEventListener('pointerdown', begin);

  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) resize();
    // Nothing moves while the phone is being turned.
    if (st.started && !(rotateEl && rotateEl.classList.contains('on'))) step(dt);
    render();
  };
  requestAnimationFrame(frame);
}

main();
window.savi = {
  st, S, G, V, ROOTS, TREE, FIRE, WOMAN, CAPSTAN, SLUICE_GATE, SLUICE, ISLES, POND, LEAVES, FERRY, broom, YOUNG,
  render, resize, begin, say, advance, fraction, gateOpen, gateLift,
  jump() { jumpWant = BUFFER; step(1 / 60); },
  isDeep, supported, leafAt, get onLeaf() { return onLeaf; },
  litterAt: (x, y) => litterAt(x, y, { dx: 0, dy: 0, sp: 0 }), breezeAt,
  get terrain() { return terrain; }, get drained() { return drained; }, get drain() { return drain; },
  face: drawPortrait, openReading,
  run(n = 60) { for (let i = 0; i < n; i++) step(1 / 60); },
  walk(x, y, n = 60) { forceMove = { x, y }; for (let i = 0; i < n; i++) step(1 / 60); forceMove = null; },
  dash() { dashWant = true; step(1 / 60); for (let i = 0; i < 20; i++) step(1 / 60); },
  hold(sec = 1) { keys.add('e'); for (let i = 0; i < sec * 60; i++) step(1 / 60); keys.delete('e'); step(1 / 60); },
  sweep(n = 1) { for (let i = 0; i < n; i++) { keys.add('e'); step(1 / 60); keys.delete('e'); for (let j = 0; j < 34; j++) step(1 / 60); } },
  talkTo, KEEPER,
};
