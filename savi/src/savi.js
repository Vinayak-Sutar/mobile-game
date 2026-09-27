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
import {
  keys, kdown, actionFor, keyLabel, keyLabels, loadKeys, setPadStyle, padName,
} from './savi-keys.js';
import { stepTeach, teachText, noteJump, noteDash } from './savi-teach.js';
import {
  initMenu, openMenu, closeMenu, menuOn, menuKey, menuPad, menuPointer, stepMenu, drawMenu, loadSound,
} from './savi-menu.js';
import { ROOTS, CLIMAX } from './savi-story.js';
import { KEEPER, keeperStart, keeperFill } from './savi-keeper.js';
import { stage, has, objective, brief, rootDone } from './savi-quest.js';
import { startCinema, updateCinema, drawCinema, pressCinema, cinemaOn } from './cinema.js';
import { openingFilm } from './savi-open.js';
import { preload, PORTRAITS, MURALS, keeperMood } from './savi-assets.js';
import {
  COURSE_LEN, PLATFORMS, CAPSTAN, ROOT_AT, atRiver, riverAt, widthAt, capstanGrip, easeCapstan,
  inWall, inShallow, onSolid, leafAt, stepShallows,
  GATE as SLUICE_GATE, windCapstan, gateOpen, gateLift,
  drawCurrent, drawRootBed, drawPlatforms, drawSluice, drawCliffs, inGorge, MOUTH_AT,
} from './savi-shallows.js';
import {
  initLitter, pushLitter, settleLitter, litterAt, breezeAt, drawLeafSprite, drawFallingLeaves,
} from './savi-litter.js';
import {
  drawBanyan, drawCanopy, drawRoot, drawSavi, drawBreath, drawWoman, drawFire, drawMural, drawMuralPanel,
  drawTree, drawRock, drawStone, drawToolIcon, drawVeil,
  mixHex,
  drawYoungTree, drawBroom, drawShrine, drawGate, glow, clamp01,
} from './savi-art.js';
import { drawPortrait } from './savi-faces.js';
import { inTarn, throwSpeed, THROW } from './savi-spring.js';
import { initFauna, stepFauna, drawFauna, drawSkyFauna } from './savi-fauna.js';

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
  fall: { at: { x: ROOT_AT[0], y: ROOT_AT[1] }, patch: { x: 2800, y: 1300, w: 2400, h: 1900 }, mat: 'water' },
  pursuit: { at: { x: 760, y: 1120 }, patch: { x: 500, y: 880, w: 620, h: 520 }, mat: 'thorn' },
  steps: { at: { x: 4180, y: 760 }, patch: { x: 3840, y: 520, w: 720, h: 520 }, mat: 'snow' },
  // The stone fall. `mat: 'ash'` is the GRIT under the stones - the layer is
  // already the right grey - and it is swept, not burned, now.
  boon: { at: { x: 2600, y: 440 }, patch: { x: 2250, y: 300, w: 700, h: 400 }, mat: 'ash' },
};
ROOTS.forEach((r, i) => Object.assign(r, PLACES[r.id], { seed: i * 5 + 3, order: i }));

// THE DROWNED HOLLOW. A place with a way across it, and the way is the level -
// see savi-shallows.js for the crossing itself. Here: the bowl it sits in, the
// stream that fills it, and whether it has let go yet.
//
// The coal has no business here. Dry wood wanted fire; a jam of wet driftwood
// in a sluice gate wants two hands and four good hauls, which is a thing a
// child can plainly do, and it is the same ACTION button she uses everywhere.
/**
 * The river, for everything outside savi-shallows.js that needs to know where
 * the water is. It replaced a lake, twice, because a lake has a rim you can
 * walk round and is crossed in three jumps.
 */
const inRiver = (x, y) => { const r = riverAt(x, y); return r.d < widthAt(r.s); };
const nearRiver = (x, y, pad) => { const r = riverAt(x, y); return r.d < widthAt(r.s) + pad; };
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
  // THE NORTH-EAST ROAD had none, and it is the one road where the coal runs
  // out fastest: snow drinks it half again as quick as thorn does. Walking
  // back to the shrine from the drift is the longest walk in the valley.
  { x: 3220, y: 1210, r: 110 }, { x: 3640, y: 1005, r: 110 },      // out to the snow
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
/** What she calls each of them when she hands it over. */
const TOOLNAME = { broom: 'her broom', crank: 'the iron crank', lamp: 'her lamp' };
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

function inSoft(x, y, r, soft) {
  const e = Math.min(Math.min(x - r.x, r.x + r.w - x), Math.min(y - r.y, r.y + r.h - y));
  return e >= 0 ? 1 : Math.max(0, 1 + e / soft);
}

/**
 * A THICKET, WHICH IS NOT A PLOT OF LAND.
 *
 * The thorn was laid down with inSoft, so it was a 620x520 RECTANGLE with its
 * corners rounded off, and it read as exactly that: somebody had marked out a
 * field and planted thorn in it. Nothing in a valley has a straight edge.
 *
 * This is the same patch as a lumpy near-circle instead. The rim is a circle
 * with three harmonics of wobble ridden on it - a slow lobe, a medium one and
 * a fine one - which is enough to stop the eye finding the compass, and a
 * turn of the valley's own fbm on top of that so the edge is ragged rather
 * than merely wavy. Then six OUTLIERS: clumps that have seeded themselves
 * clear of the main mass, because that is what a thicket does at its margin,
 * and because a few thorns standing on their own out in the grass say "this
 * is spreading" better than any amount of solid black.
 */
const CLUMPS = [
  [-0.98, -0.52, 0.30], [0.86, -0.74, 0.25], [1.04, 0.40, 0.27],
  [-0.70, 0.94, 0.23], [0.14, 1.12, 0.26], [-1.16, 0.20, 0.21],
];
function thicket(x, y, p) {
  const rx = p.w / 2, ry = p.h / 2;
  const dx = (x - (p.x + rx)) / rx, dy = (y - (p.y + ry)) / ry;
  const n = (fbm(x * 0.0085, y * 0.0085) - 0.5) * 0.46;
  const a = Math.atan2(dy, dx);
  const rim = 1
    + Math.sin(a * 3 + 0.8) * 0.15
    + Math.sin(a * 5 - 1.9) * 0.09
    + Math.sin(a * 9 + 2.4) * 0.055;
  let k = clamp01((rim + n - Math.hypot(dx, dy)) / 0.26);
  for (const [ox, oy, r] of CLUMPS) {
    const d = Math.hypot(dx - ox, dy - oy);
    k = Math.max(k, clamp01((r + n * 0.6 - d) / 0.17) * 0.92);
  }
  return k;
}

/** The valley, classified. terrain.js paints whatever it is told - this is the picture. */
function classify(x, y) {
  // The stream in, always running.
  const inD = polyDist(x, y, INFLOW);
  if (inD < 26) return TT.WATER;
  if (inD < 46) return TT.SHALLOW;
  // The spring at the head of it, with a wadeable lip round the edge.
  if (inTarn(x, y)) return TT.WATER;
  if (inTarn(x, y, 32)) return TT.SHALLOW;
  // The bowl. The near shore and the two sandbars are wadeable; the rest of it
  // is over her head. Once it has let go the whole bowl is a marsh.
  // THE RIVER: water in the channel, rock walls either side of it. The walls
  // are what make it a river and not a lake - there is one way in and one way
  // up, and you cannot walk round the outside of it.
  if (onSolid(x, y)) return TT.ROCK;
  const rv = riverAt(x, y);
  const rw = widthAt(rv.s);
  if (rv.d < rw) {
    if (drained) return rv.d < rw * 0.55 ? TT.MUD : TT.SHALLOW;
    return inShallow(x, y) ? TT.SHALLOW : TT.WATER;
  }
  if (inWall(x, y)) return TT.ROCK;
  const n = fbm(x * 0.0016, y * 0.0016);
  if (roadDist(x, y) < 46) return TT.DIRT;
  if (inSoft(x, y, PLACES.boon.patch, 280) > 0.34 + n * 0.3) return TT.GRAVEL;
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
// What comes off a broom on ground that has nothing on it: a little dry
// earth, not a handful of autumn.
const DUST = ['#9b8b71', '#877963', '#b0a287', '#7a6d59'];
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
/**
 * THE TWO THINGS THE LAMP IS FOR, and how far each of them gives way, in ONE
 * table - because the fire is DRAWN as well as carved, and a cone drawn wider
 * than the cone that clears would promise reach she does not have. The first
 * thorn just inside the glow that refused to move would read as a bug. Both
 * the carve and the drawing take the same object out of here.
 *
 *   THORN  draws back ahead of her: a narrow reach, worked slowly, so what
 *          opens is a corridor she has to follow in
 *   SNOW   melts: a broad round pool opening out from where she stands, and it
 *          costs more heat, because melting a thing is not the same as
 *          frightening it
 *
 * There used to be a third. The last root was dead ground burned off with the
 * lamp, which was the lamp's third outing and its least interesting - the
 * same verb a third time, on the beat where the story is Savitri ASKING FOR
 * SOMETHING BACK. It is a fall of stones now, carried off one at a time, and
 * the grit under them is swept like any other mess.
 */
const BURN = {
  2: { reach: 104, arc: 1.45, rate: 3.4, drain: 0.13, steam: true },    // snow
  3: { reach: 68, arc: 1.0, rate: 2.4, drain: 0.085, steam: false },    // thorn
};
/** The three the lamp is for. The broom will not claim any of them. */
const BURNS = BURN;

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
        if (d <= G.base[q] || nearRiver(x, y, 40)) continue;
        G.base[q] = d; G.dep[q] = d; G.orig[q] = d; G.mat[q] = m;
      }
    }
  };
  // The thorn is the one that is a shape rather than a rectangle. It is laid
  // over a box a third again as wide as the patch, because the outlying
  // clumps sit outside the patch itself.
  const blob = (rect, m, amt) => {
    const gx = rect.w * 0.42, gy = rect.h * 0.42;
    const i0 = Math.max(0, ((rect.x - gx) / CELL) | 0), i1 = Math.min(G.w - 1, ((rect.x + rect.w + gx) / CELL) | 0);
    const j0 = Math.max(0, ((rect.y - gy) / CELL) | 0), j1 = Math.min(G.h - 1, ((rect.y + rect.h + gy) / CELL) | 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL + 7, y = j * CELL + 7;
        const k = thicket(x, y, rect);
        if (k <= 0.02) continue;
        const q = j * G.w + i, d = amt * (0.62 + 0.38 * k) * clamp01(k * 1.35);
        if (d <= G.base[q] || nearRiver(x, y, 40)) continue;
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
  for (const r of ROOTS) {
    if (r.mat === 'water') continue;
    // ALL FOUR ARE SHAPES, not plots of land. A rectangle of anything reads
    // as somewhere a surveyor has been, and the leaves and the snow were the
    // last two still square.
    blob(r.patch, MAT[r.mat], 1.0);
  }
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
  // The apprenticeship: how many roots are awake, and whether she has been
  // told about the next one and handed the tool for it. See savi-quest.js.
  done: 0, briefed: false, tools: {}, sawOpening: false,
  lastRoot: '', think: null,
  // The end, in three beats: she is sent, she reads the sixth panel and the
  // tree blooms, she comes back and is told what she has become. Then the
  // titles, and then the valley is hers to walk in.
  sent: false, blessed: false, after: false, credits: false,
  // WHAT IS IN HER HANDS, and the belt she changes it from. `tools` is what
  // she has been GIVEN and never loses; `equip` is the one thing she is
  // actually holding, which used to be "all of them at once, for ever".
  equip: null, stowed: null, wheel: null,
  // SHE STANDS AND WATCHES THE WATER GO. From the moment the gate lifts to
  // the moment the tree has something to tell her, the valley is doing the
  // work and she is not: no walking, no jumping, no sweeping. It is the one
  // thing in the game she has set off and cannot help with, and wandering
  // away mid-flood threw the whole beat away.
  watching: false, watchT: 0,
  talking: null, reading: null, metKeeper: false,
  nearWoman: false, asked: {}, told: 0, prompt: '', cue: '', swept: false,
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

// `?touch=1` forces the phone's controls on, so the layout can be looked at
// on a desktop without guessing at it.
const forceTouch = typeof location !== 'undefined' && /[?&]touch=1/.test(location.search);
const isTouch = () => forceTouch || touchLike();

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
/**
 * TOUCH, AND WHY IT WAS BROKEN.
 *
 * There was ONE pointer id for the whole game - the steering thumb and the
 * action ring shared it. Press the ring, then put a second thumb down to
 * walk, and the stick overwrites `touch.id`; lift the ring finger and the
 * release is ignored because its id no longer matches, so `touch.ring` stays
 * down FOR EVER. From that moment she sweeps without stopping and is held at
 * forty-two per cent speed by her own broom. That is the "we are sweeping,
 * we cannot move" - it was not a feel problem, it was one shared variable.
 *
 * Now the stick owns one finger and every button owns its own, and a release
 * is routed to whichever of them that finger belongs to.
 */
const touch = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
const STICK_MAX = 62;              // how far the knob travels before it drags

// A controller, any controller. A DualSense, an Xbox pad and anything else
// that speaks the standard mapping all arrive here the same way: the left
// stick or the d-pad walks, and cross / square / either trigger acts.
// One button, one verb, and they are where a thumb expects them:
//   CROSS    jump          CIRCLE  dash
//   SQUARE   action        L1        her belt
const pad = {
  on: false, mx: 0, my: 0, id: '',
  held: false, pressed: false,           // square / R2: the action
  upHeld: false, upPressed: false,       // and the stick, for choosing a reply
  downHeld: false, downPressed: false,
  leftHeld: false, leftPressed: false,   // and across, for a volume in the menu
  rightHeld: false, rightPressed: false,
  menuHeld: false, menuPressed: false,   // options / start: the pause screen
  thinkHeld: false, thinkPressed: false, // triangle / Y: put her thought down
  jumpHeld: false, jumpPressed: false,   // cross
  dashHeld: false, dashPressed: false,   // circle
  beltHeld: false, beltPressed: false,   // L1: the belt
};
function pollPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of list) if (g && g.connected) { gp = g; break; }
  pad.on = !!gp;
  // WHAT IT IS CALLED. The numbers are the same on every standard pad; the
  // words printed on the buttons are not, and telling an Xbox player to press
  // circle tells them nothing.
  if (gp && gp.id !== pad.id) { pad.id = gp.id; setPadStyle(gp.id); }
  if (!gp) {
    // EVERY flag, not four of them. A pad that went away mid-press used to
    // leave dashPressed or beltPressed stuck true, and the game would dash,
    // or open her belt, on every frame for the rest of the session. That is
    // the "controller is inconsistent".
    pad.mx = 0; pad.my = 0;
    pad.held = pad.pressed = false;
    pad.jumpHeld = pad.jumpPressed = false;
    pad.dashHeld = pad.dashPressed = false;
    pad.beltHeld = pad.beltPressed = false;
    pad.upHeld = pad.upPressed = pad.downHeld = pad.downPressed = false;
    pad.leftHeld = pad.leftPressed = pad.rightHeld = pad.rightPressed = false;
    pad.menuHeld = pad.menuPressed = false;
    pad.thinkHeld = pad.thinkPressed = false;
    return;
  }
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
  const lf = mx < -0.55, rt = mx > 0.55;
  pad.leftPressed = lf && !pad.leftHeld; pad.leftHeld = lf;
  pad.rightPressed = rt && !pad.rightHeld; pad.rightHeld = rt;
  // OPTIONS on a DualSense, START on an Xbox pad: the ninth button, and it was
  // the only one on a standard pad the game was not already listening to.
  pad.menuPressed = down(9) && !pad.menuHeld;
  pad.menuHeld = down(9);
  // 3 is triangle on a DualSense and Y on an Xbox pad, and it is the only
  // face button this game was not already using.
  pad.thinkPressed = down(3) && !pad.thinkHeld;
  pad.thinkHeld = down(3);
  pad.jumpPressed = jump && !pad.jumpHeld;
  pad.jumpHeld = jump;
  pad.dashPressed = dash && !pad.dashHeld;
  pad.dashHeld = dash;
  pad.beltPressed = down(4) && !pad.beltHeld;
  pad.beltHeld = down(4);
  pad.pressed = act && !pad.held;
  pad.held = act;
}
let forceMove = null, holding = false, wasHolding = false, tapDone = false, actT = 0;
let beltAxis = false;         // the stick has to come back to centre between picks
let readAxis = false;         // and the same, turning the pages of a reading
let drain = 0;                // the hollow emptying, once the sluice is open
let crackT = 0;            // the fire crackles on a slow clock, never per frame
let canopySee = 1;         // how much of the Banyan's crown is showing
/** What the quest needs to know about the river: its one way in. */
const GORGE = { inside: inGorge, mouth: MOUTH_AT, where: 'south-west, at the foot of the water' };
let dtSeen = 1 / 60;       // the last frame's length, for the fades in render()
let warmedArt = false;     // the rest of the painted art, asked for once
let ripT = 0;              // and the water is only allowed a ring so often
let taughtX = START.x, taughtY = START.y;   // where she was last frame, for the teaching

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
/**
 * The last thing she actually stood on - a leaf, or an island. Missing a jump
 * used to send her back to the last DRY ground, which halfway across meant the
 * shore, and losing four hops for one miss is not a cozy game. She goes back to
 * the leaf she jumped from now, and the crossing costs a couple of seconds.
 */
let footing = null;

function startJump() {
  noteJump();
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
const isDeep = (x, y) => !drained && inRiver(x, y) && !inShallow(x, y) && !onSolid(x, y);
const supported = (x, y) => !isDeep(x, y) || !!leafAt(x, y);

/** In she goes - which costs her a moment and nothing else. */
function fallIn() {
  water.splash(S.x, S.y + 6, 220, 2.6);
  spark(S.x, S.y + 6, 26, { col: ['#bfe0e8', '#8fbcc8', '#dff0f4'], sp0: 60, sp1: 260, l0: 0.5, l1: 1.3, s0: 3, s1: 8, kind: 'drop', lift: 70 });
  sfx.splash();
  // Back onto the leaf she left, if it is still up - not all the way to the
  // shore. One miss should cost one hop.
  if (footing && footing.sink !== undefined && footing.sink < 0.9) {
    S.x = footing.x; S.y = footing.y + (footing.dip || 0);
  } else if (footing) {
    S.x = footing.x; S.y = footing.y;
  } else { S.x = S.safeX; S.y = S.safeY; }
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
  if (drained) { S.crank = null; return; }
  easeCapstan(dt);
  // No handle, no capstan. The bar was taken off so the hill folk could not
  // flood the road with it, and the keeper has it. What she is told about that
  // is set with every other prompt, further down - said here it was wiped a
  // few hundred lines later by the line that clears the prompt each frame,
  // which is why nobody ever saw it.
  if (!has(st, 'crank')) return;
  const moving = S.speed > 30 && S.z <= 0.5;
  const opened = windCapstan(S.x, S.y, moving);
  // BOTH HANDS ON THE BAR. She used to walk round the capstan with her arms
  // by her sides and the thing turned by itself behind her, which read as a
  // girl jogging in a circle near some machinery. Now the grip is under her
  // hands and she is drawn leaning into it.
  if (CAPSTAN.gripping) {
    const g = capstanGrip(S.x, S.y);
    S.crank = { dx: g[0] - S.x, dy: g[1] - S.y };
  } else S.crank = null;
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
  st.watching = true; st.watchT = 0;
  terrain.invalidate(2700, 1200, 5200, 3200);
  terrain.warm(camera.x, camera.y, view.w, view.h);
  water.splash(SLUICE_GATE.x, SLUICE_GATE.y, 420, 4.4);
  spark(SLUICE_GATE.x, SLUICE_GATE.y, 110, { col: ['#bfe0e8', '#c6e2ea', '#8fbcc8'], sp0: 120, sp1: 460, l0: 0.9, l1: 2.1, s0: 4, s1: 10, kind: 'drop' });
  rumble(0.9, 0.6, 340);
}

function startDash() {
  noteDash();
  if (dashT > 0 || dashStock <= 0 || st.talking || st.reading || carried || st.watching) return;
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
/**
 * THE ON-SCREEN CONTROLS, in a controller's diamond bottom right: ACTION
 * where square is, JUMP below at cross, DASH above at circle, and her belt
 * off on the left.
 *
 * Laid out from the viewport every frame rather than from four hard-coded
 * offsets, and BIGGER ON A TOUCH SCREEN - the old ones were thirty-two
 * pixels across on a phone, which is under half what a thumb needs, and they
 * sat in fixed pixel positions that crowded the corner on a small screen and
 * floated in the middle of nowhere on a large one.
 */
const BTN = {
  act: { r: 0, x: 0, y: 0, id: -1, on: false },
  jump: { r: 0, x: 0, y: 0, id: -1, on: false },
  dash: { r: 0, x: 0, y: 0, id: -1, on: false },
  belt: { r: 0, x: 0, y: 0, id: -1, on: false, off: true },
  // The pause button, top right, and only on a phone: a keyboard has escape
  // and a pad has start, and neither wants a target drawn over the valley.
  menu: { r: 0, x: 0, y: 0, id: -1, on: false, off: true },
};
function layoutButtons() {
  const t = isTouch();
  // A thumb is about nine millimetres of certainty. On a phone that is
  // forty-odd CSS pixels of radius, and it does not get smaller because the
  // window did - it scales with the short side and stops.
  const s = t ? clamp(view.h / 400, 1, 1.55) : 1;
  // A margin that is a fraction of the screen, not a fixed number of view
  // units: thirty of those is fifteen real pixels on a phone, which is
  // underneath the notch on half of them.
  const m = t ? Math.max(34, view.w * 0.04) : 22;
  BTN.act.r = (t ? 44 : 38) * s;
  BTN.jump.r = (t ? 35 : 32) * s;
  BTN.dash.r = (t ? 33 : 32) * s;
  BTN.belt.r = (t ? 32 : 27) * s;
  const right = view.w - m, bottom = view.h - m;
  BTN.jump.x = right - BTN.jump.r;
  BTN.jump.y = bottom - BTN.jump.r;
  BTN.act.x = BTN.jump.x - BTN.jump.r - BTN.act.r - 8;
  BTN.act.y = bottom - BTN.act.r - BTN.jump.r * 0.55;
  BTN.dash.x = right - BTN.dash.r;
  BTN.dash.y = BTN.jump.y - BTN.jump.r - BTN.dash.r - 14;
  BTN.belt.x = m + BTN.belt.r;
  BTN.belt.y = bottom - BTN.belt.r;
  BTN.belt.off = belt().length < 2;
  BTN.menu.r = 24 * s;
  BTN.menu.x = right - BTN.menu.r;
  BTN.menu.y = m + BTN.menu.r;
  BTN.menu.off = !t;
}
/** Which button a finger landed on, if any. The nearest hit wins. */
function hitButton(px, py) {
  let best = null, bd = 1e9;
  for (const k of Object.keys(BTN)) {
    const b = BTN[k];
    if (b.off) continue;
    const d = Math.hypot(px - b.x, py - b.y);
    // A generous skirt round each one: a thumb that lands a few pixels wide
    // of a button meant that button, not a walk.
    if (d < b.r * 1.22 && d < bd) { bd = d; best = k; }
  }
  return best;
}
function releaseButton(id) {
  for (const k of Object.keys(BTN)) {
    const b = BTN[k];
    if (b.id === id) { b.id = -1; b.on = false; return k; }
  }
  return null;
}
let beltSlots = [];

/**
 * The root the tree is reaching with. Only ever a suggestion - it is what is
 * lit, and what the keeper points at, and nothing more. It is the NEAREST
 * unfreed root, so it follows her about instead of marching her round a list.
 */
function current() {
  // The lit root is the one she has been SENT to, not whichever is nearest.
  const s2 = stage(st);
  if (!s2) return null;
  return ROOTS.find((r) => r.id === s2.root && !st.woken[r.id]) || null;
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
  if (stroke || st.talking || st.reading || st.watching) return false;
  // The jam is hauled, never swept.
  if (!drained && Math.hypot(S.x - CAPSTAN.x, S.y - CAPSTAN.y) < CAPSTAN.r + 40) return false;
  // A BROOM IN HER HAND ALWAYS SWEEPS. It used to refuse unless it found
  // something worth its while within two point samples, so half the presses did
  // nothing at all - no swing, no sound, no answer of any kind - which is the
  // one thing a button must never do. The stroke always happens; what it finds
  // is a separate question, answered by the carve.
  if (st.equip !== 'broom') return false;
  const a = S.face, fx = Math.cos(a), fy = Math.sin(a);
  let m = 0, deepest = 0, burny = 0;
  for (let d = 0; d <= 70; d += 14) {
    const c = depAt(S.x + fx * d, S.y + fy * d + 6);
    if (!c.m) continue;
    if (BURNS[c.m]) { if (c.d > burny) burny = c.d; continue; }
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
  S.act = total - stroke.t + 0.04;
  const biting = stroke.t > STROKE.wind && stroke.t < STROKE.wind + STROKE.work;
  if (biting) {
    const a = S.face + S.sweep * 0.7;
    // A broom's width, not a semicircle of the parish. The head is about 60
    // across and it is out in front of her where she is looking.
    const took = carve(S.x + Math.cos(a) * 34, S.y + Math.sin(a) * 34 + 6, a, 62, 0.8, dt * SWEEP_BITE, stroke.mat);
    // Thrown the way the broom is going, not sucked toward her.
    const out = a + stroke.side * 1.15;

    // GOLD OFF GROUND WITH NO GOLD ON IT.
    //
    // Three things were wrong and they compounded. The spark colour was the
    // LEAF palette for everything that was not snow, so sweeping the grit in
    // the stone fall threw autumn off it. `took` was the only test, and took
    // is not "there was something there" - leaves never carve below LITTER
    // and heal back up to it, so ground she had already swept clean still
    // returned a take on every stroke and kept flinging gold at nothing. And
    // where there was genuinely nothing, the broom went by in silence with no
    // effect of any kind, which reads as a broken button.
    //
    // So: what is UNDER the head decides, each thing throws its own colour,
    // and bare ground gets a puff of dry earth, which is what a broom on bare
    // ground actually does.
    //
    // THE BAR IS THE ONE THE GROUND IS DRAWN WITH. drawLayer skips a cell
    // below CLEAR * 0.66 entirely, so that number IS "you can see something
    // there". A threshold picked by hand would drift away from it the first
    // time either was tuned.
    const at = depAt(S.x + Math.cos(a) * 40, S.y + Math.sin(a) * 40 + 6);
    const real = at.m === stroke.mat && at.d > CLEAR * 0.66 && took > 0.0004;

    if (real) {
      if (stroke.mat === MAT.leaves) {
        pushLitter(S.x + Math.cos(a) * 46, S.y + Math.sin(a) * 46 + 6, 52, Math.cos(out), Math.sin(out), dt * 70);
      }
      spark(S.x + Math.cos(a) * 62, S.y + Math.sin(a) * 62 + 6, 3, stroke.mat === MAT.snow
        ? { col: ['#ffffff', '#e4ecf4', '#cfdae6'], angle: out, arc: 0.7, sp0: 130, sp1: 300, l0: 0.4, l1: 1, s0: 3, s1: 7, lift: 56 }
        : { col: MATS[stroke.mat].col, angle: out, arc: 0.8, sp0: 170, sp1: 420, l0: 0.7, l1: 1.7, s0: 5, s1: 12, lift: 46, drag: 1.2 });
      if (!stroke.sounded) {
        stroke.sounded = true;
        strokeN++;
        if (strokeN & 1) { stroke.mat === MAT.snow ? sfx.clack(1.6) : sfx.hiss(); }
        rumble(0.2, 0.12, 70);
      }
    } else if (!stroke.dusted) {
      // One puff per stroke, not per frame: a broom raises dust when it goes
      // past, and twenty-two frames of it is a dust storm.
      stroke.dusted = true;
      spark(S.x + Math.cos(a) * 54, S.y + Math.sin(a) * 54 + 6, 5, {
        col: DUST, angle: out, arc: 1.3, sp0: 30, sp1: 120, l0: 0.35, l1: 0.85,
        s0: 2, s1: 5, lift: 14, drag: 2.6,
      });
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
  if (st.talking || st.reading || stroke || st.watching) return;
  if (tapDone) return;
  if (st.equip !== 'lamp') return;            // it is on her belt, not in her hand
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
    if (BURNS[c.m] && c.d > deepest) { deepest = c.d; m = c.m; }
  }
  if (!m || deepest < 0.12) { S.act = 0; return; }
  if (!(st.hasEmber && st.ember > 0.02)) {
    if (actT <= 0) {
      actT = 1.2;
      say(st.hasEmber
        ? [['keeper', `Your coal has gone out, child. There is a fire ${towardFire()}. Stand at it a moment and it will fill again.`]]
        : [['keeper', 'This will not move for hands. The old woman keeps a fire. Take a coal from it and hold it out.']], null);
    }
    return;
  }
  S.act = 0.14;
  S.sweep = Math.sin(st.t * 3) * 0.12;
  // Thorn DRAWS BACK from warmth - it is not being cut - so it goes faster than
  // dead ground, which has to be burned off.
  // Thorn DRAWS BACK from warmth rather than being cut, so it is worked close
  // and slowly: a narrow reach, and slower than she walks, so the wall gives
  // way at its own pace and she has to follow it in. Dead ground has to be
  // burned off, which is broader and faster.
  const b = BURN[m];
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
  const took = carve(S.x, S.y + 6, a, b.reach, b.arc, dt * b.rate, m);
  // And a coal held out at nothing costs nothing. She used to be able to stand
  // in a corridor she had already cleared and burn a whole coal down to ash
  // against thin air, which is what makes this feel broken rather than slow.
  if (took <= 0.0006) { crackT = 0; S.act = 0; return; }
  // The fire is real now, so the frame that draws it is told what it is doing.
  S.burn = b;
  st.ember = Math.max(0, st.ember - dt * b.drain);
  // What comes off it LEAVES THE LAMP and streams down the cone, instead of
  // appearing anywhere inside a box drawn round her. Steam off the snow,
  // embers off everything else.
  if (Math.random() < dt * (b.steam ? 48 : 40)) {
    const mx = S.x + fx * 16, my = S.y - 11 + fy * 9;
    spark(mx, my, 1, b.steam
      ? { col: ['#e8f2f6', '#cfe0e8', '#ffffff'], sp0: 50, sp1: 150, l0: 0.9, l1: 2, s0: 7, s1: 15, kind: 'dust', lift: 44, angle: a, arc: b.arc, drag: 2.6 }
      : { col: ['#ffb35e', '#ff7a2e', '#ffd9a0'], sp0: 110, sp1: 280, l0: 0.34, l1: 0.8, s0: 3, s1: 6, kind: 'ember', lift: 22, angle: a, arc: b.arc, drag: 3.2 });
  }
  crackT -= dt; if (crackT <= 0) { crackT = 0.9 + Math.random() * 0.6; sfx.hiss(); }
}

// --- THE BELT -------------------------------------------------------------------
//
// She was handed a broom, and then a lantern, and from that moment she was
// holding both of them for ever with no way to put either down. The broom had
// a Q key that stood it back against the shrine steps two thousand units
// away; the lantern had nothing at all.
//
// So: one press opens a belt - TAB, the left bumper, or the ring on the
// screen - and she picks what is in her hands out of it, empty hands
// included. The world stops while it is open, which on a phone is the
// difference between choosing a tool and fumbling one.

const TOOLS = [
  { id: null, name: 'empty hands', note: 'nothing in them' },
  { id: 'broom', name: 'the broom', note: 'sweep what is lying on a root' },
  { id: 'lamp', name: 'the lantern', note: 'hold the fire out at what will not move' },
];

/** The ones she has, in belt order. Empty hands is always there. */
function belt() {
  return TOOLS.filter((t) => t.id === null || (t.id === 'broom' ? broom.held || has(st, 'broom') : has(st, t.id)));
}

function openBelt() {
  if (st.talking || st.reading || st.watching || cinemaOn()) return;
  const b = belt();
  if (b.length < 2) return;                   // nothing to choose between yet
  const i = b.findIndex((t) => t.id === st.equip);
  st.wheel = { sel: i < 0 ? 0 : i, t: 0 };
  sfx.ui();
}

function closeBelt(take) {
  const w = st.wheel;
  st.wheel = null;
  if (!take || !w) return;
  const b = belt();
  const pick = b[Math.max(0, Math.min(b.length - 1, w.sel))];
  equipTool(pick ? pick.id : null);
}

function equipTool(id) {
  if (st.equip === id) { sfx.click(); return; }
  st.equip = id;
  // Taking the broom out means fetching it off the shrine steps; putting it
  // away does NOT send it back there - the belt holds it now.
  if (id === 'broom') broom.held = true;
  sfx.pickup();
  const t = TOOLS.find((q) => q.id === id);
  toast = { t: 0, text: id ? `she takes ${t.name}` : 'her hands are empty' };
}

/** One press of left or right, from whichever thing pressed it. */
function beltMove(d) {
  const b = belt();
  st.wheel.sel = (st.wheel.sel + d + b.length) % b.length;
  sfx.tick();
}

// --- THE SIXTH PANEL ------------------------------------------------------------
//
// Five come up on the saplings. The last one is on the Great Banyan itself,
// low on the braid of the trunk, and it is the end of the story - so the
// ending stops being one sudden beat under a tree and becomes three: she is
// sent, she reads it and the tree blooms, she comes back and is told what
// she has become.

const FINAL = { x: TREE.x - 6, y: TREE.y + 8, mural: 'bloom', name: 'The Boon Granted' };
const finalRead = () => ({ mural: FINAL.mural, name: FINAL.name, lines: CLIMAX });
/** Lit only once the five are awake and she has been sent to look for it. */
const finalUp = () => st.count >= ROOTS.length && st.sent && !(st.bloom >= 1);

/** The sapling whose panel nobody has read yet, if there is one. */
function unreadMural() {
  for (const yt of YOUNG) if (yt.pending && yt.grow >= 1) return yt;
  return null;
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
      // The grit under a stone stays put until the stone is gone.
      if (m === MAT.ash && underStone(i * CELL + 7, j * CELL + 7)) continue;
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
  if (st.watching) return { x: 0, y: 0 };
  let mx = 0, my = 0;
  if (kdown('up')) my -= 1;
  if (kdown('down')) my += 1;
  if (kdown('left')) mx -= 1;
  if (kdown('right')) mx += 1;
  if (touch.on) {
    // THE RING YOU SEE IS THE THROTTLE. It used to divide by a flat fifty-four
    // CLIENT pixels while the ring is drawn at STICK_MAX in VIEW units, so on
    // a phone the knob sat on the rim - which looks like full tilt - at about
    // sixty per cent of her speed. Same number, same units, both ends.
    const dx = touch.x - touch.ox, dy = touch.y - touch.oy, d = Math.hypot(dx, dy);
    const lim = STICK_MAX * (view.scale || 1);
    if (d > lim * 0.12) { mx += dx / Math.max(d, lim); my += dy / Math.max(d, lim); }
  }
  mx += pad.mx; my += pad.my;
  const m = Math.hypot(mx, my);
  return m > 1 ? { x: mx / m, y: my / m } : { x: mx, y: my };
}

function step(dt) {
  st.t += dt;
  dtSeen = dt;
  world.runTime = st.t;
  pollPad();
  // THE PAUSE SCREEN STOPS EVERYTHING, the way the belt does - and for the
  // same reason: a button held down to pick a row must not also swing a broom
  // on the way out. It cannot be opened over a dialogue, because a dialogue
  // already has its own way out and its panel is HTML sitting above this
  // canvas, so the menu would be drawn underneath it.
  // Triangle on a DualSense, Y on an Xbox pad: put her thought down.
  if (pad.thinkPressed && st.think) dropThought();
  if (pad.menuPressed) {
    begin();
    if (menuOn()) closeMenu();
    else if (!st.talking && !st.reading && !st.wheel && !st.credits) openMenu();
  }
  if (menuOn()) {
    menuPad(pad);
    stepMenu(dt);
    stepParticles(dt);
    holding = false; wasHolding = true; tapDone = true;
    return;
  }
  if (pad.pressed) { begin(); if (st.talking || st.reading) advance(); }
  // LEFT AND RIGHT THROUGH A READING, on the d-pad or the stick. The stick
  // has to come back to the middle between pages or one flick runs the whole
  // legend past her.
  const page = st.reading ? stepReading : (st.talking && !st.talking.keeper ? stepTalk : null);
  if (page) {
    if (pad.mx < -0.55 && !readAxis) { page(-1); readAxis = true; }
    else if (pad.mx > 0.55 && !readAxis) { page(1); readAxis = true; }
    else if (Math.abs(pad.mx) < 0.3) readAxis = false;
  } else readAxis = false;
  // A CONVERSATION ON A CONTROLLER. The choices were pointer-only, so with a
  // pad in your hands the game simply stopped at the first thing she asks.
  if (st.talking && st.talking.keeper) {
    if (pad.upPressed) moveSel(-1);
    if (pad.downPressed) moveSel(1);
    if (pad.pressed || pad.jumpPressed) pickSel();
    if (pad.dashPressed) closeTalk();          // circle backs out
    return;
  }
  // THE BELT STOPS THE WORLD. Everything below this - the press dispatch, the
  // walking, the stones, the fire - is skipped while it is open, so a button
  // held down to choose a tool cannot also swing a broom on the way out.
  if (st.credits && (pad.pressed || pad.jumpPressed || pad.dashPressed) && creditsEnd) creditsEnd();
  if (pad.beltPressed) { begin(); if (st.wheel) closeBelt(false); else openBelt(); }
  if (st.wheel) {
    st.wheel.t += dt;
    const ax = pad.mx;
    if (ax < -0.55 && !beltAxis) { beltMove(-1); beltAxis = true; }
    else if (ax > 0.55 && !beltAxis) { beltMove(1); beltAxis = true; }
    else if (Math.abs(ax) < 0.3) beltAxis = false;
    if (pad.pressed || pad.jumpPressed) closeBelt(true);
    holding = false; wasHolding = true; tapDone = true;
    stepParticles(dt);
    return;
  }
  beltAxis = false;
  if (pad.jumpPressed) { begin(); if (st.talking || st.reading) advance(); else jumpWant = BUFFER; }
  if (cinemaOn() && (pad.pressed || pad.jumpPressed || pad.dashPressed)) pressCinema();
  held = pad.jumpHeld || kdown('jump');
  if (pad.dashPressed) { begin(); dashWant = true; }
  // TWO ACTIONS, NOT ONE.
  //
  // One button used to do a verb and a noun at the same time: E swept, held
  // the lantern out, talked to the keeper, read a mural, picked the broom up,
  // lifted a stone and threw it. On a phone that is unavoidable and right -
  // there is room for one ring, a tap means "the thing in front of me" and a
  // hold means "the thing in my hand". On a keyboard there is no reason for
  // it, and it is why holding the broom made the keeper unreachable until the
  // order of the dispatch was fussed over.
  //
  //   INTERACT  a PRESS: talk, read, take, lift, throw          E
  //   USE       a HOLD: sweep, raise the lantern                left click
  //
  // The ACT ring and the pad's square are both, exactly as before, because a
  // thumb has one button and it is the tap-or-hold that says which one is
  // meant.
  holding = kdown('use') || BTN.act.on || pad.held;
  const acting = kdown('interact') || BTN.act.on || pad.held;
  if (actT > 0) actT -= dt;
  if (S.act > 0) S.act -= dt;
  // ONE press, and this is who gets it. The order matters: the broom comes
  // before the keeper, or Savi cannot sweep the courtyard the keeper is
  // standing in the middle of - every press there would open her mouth instead.
  if (acting && !wasHolding) {
    tapDone = false;
    // WHO GETS THE PRESS, and the order is the whole of it. Reading a mural
    // used to sit AFTER the broom stroke, and since a broom in hand always
    // swings, a player carrying the broom could never read one.
    const busy = st.talking || st.reading || st.watching;
    const yt = !busy && YOUNG.find((q) => q.grow >= 1 && Math.hypot(S.x - q.x, S.y - q.y) < 130);
    const fin = !busy && !yt && finalUp() && Math.hypot(S.x - FINAL.x, S.y - FINAL.y) < 150;
    const atKeeper = !busy && Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 104;
    if (fin) {
      // The end of it, off the trunk of the tree it happened under.
      openReading(finalRead(), () => {
        st.ended = true;
        st.bloom = 1;
        setAmbientTheme(themeById('durga'));
        sfx.boon();
        spark(TREE.x, TREE.y - 40, 120, { col: ['#ffb35e', '#ffd9a0', '#eef0d8'], sp0: 40, sp1: 340, l0: 1.2, l1: 2.8, s0: 3, s1: 9, kind: 'ember' });
      });
      tapDone = true;
    } else if (yt) {
      openReading(yt); tapDone = true;
    } else if (!busy && has(st, 'broom') && !broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74) {
      broom.held = true; st.equip = 'broom'; tapDone = true; sfx.pickup();
    } else if (atKeeper) {
      talkTo(keeperStart(st, ROOTS.length));
      st.metKeeper = true;
      tapDone = true;
    } else if (!busy && carried) {
      hurlStone(); tapDone = true;
    } else if (!busy && !carried && reachStone()) {
      takeStone(reachStone()); tapDone = true;
    }
  }
  // `tapDone` is the press saying "that one was mine". It is what stops a tap
  // of the ring beside a stone from ALSO starting a broom stroke, and it lasts
  // as long as the finger does.
  if (!acting) tapDone = false;
  wasHolding = acting;
  if (holding && !tapDone && !stroke) beginStroke();
  stepStroke(dt);
  S.burn = null;
  if (holding) actHold(dt); else if (!stroke) S.act = 0;

  if (st.talking || st.reading || st.credits) { stepParticles(dt); return; }

  if (!warmedArt && st.t > 3) {
    warmedArt = true;
    preload(PORTRAITS);
    preload(MURALS);
  }
  stepCapstan(dt);
  // The leaves first, so a drifting one carries her with it.
  stepShallows(dt, st.t, drained ? null : onLeaf);
  if (onLeaf && !drained && S.z <= 0.5) { S.x += onLeaf.dx; S.y += onLeaf.dy; }

  // The jump, and the fall.
  const grounded = S.z <= 0.5;
  coyote = grounded ? COYOTE : Math.max(0, coyote - dt);
  jumpWant = Math.max(0, jumpWant - dt);
  // Both hands are full. A stone is a real thing to be holding.
  if (carried || st.watching) jumpWant = 0;
  if (jumpWant > 0 && (grounded || coyote > 0)) startJump();
  if (S.z > 0 || S.vz !== 0) {
    // Letting go early cuts it short - ONCE, on the frame she lets go. Applied
    // every frame instead, as it was, 0.45 compounds to nothing in a fifth of a
    // second and the jump dies on the spot.
    if (S.vz > 0 && wasHeld && !held) S.vz *= 0.8;
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
        for (const L of PLATFORMS) {
          if (L.solid || L.sink >= 1) continue;
          const d = Math.hypot(S.x - L.x, S.y - (L.y + L.dip));
          if (d < L.r * 0.96 + 30) {
            const k = (L.r * 0.9) / d;
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
  // SWEEPING SLOWS HER, IT DOES NOT ANCHOR HER. `S.act` used to be set to 1
  // and counted down at one a second, so a stroke that lasts under four
  // tenths held her at forty-two per cent for a WHOLE SECOND - and since
  // holding the button repeats the stroke, that was for ever. It is set to
  // the length of the thing it is timing now, and the brake is lighter.
  // A capstan is not a thing you stroll round. Slower, and the three turns
  // become a piece of work rather than a lap.
  const sp = 196 * (1 - Math.max(drag, wet)) * (S.act > 0 ? 0.58 : 1)
    * (carried ? 0.62 : 1) * (S.crank ? 0.66 : 1);
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
  // The gorge wall. This is the whole reason the river is a river: without it
  // she walks up the bank and the leaves are decoration. One axis at a time so
  // she slides along it rather than sticking to it.
  // The spring is over her head and she is not going in it. One axis at a
  // time, so she walks round the lip rather than sticking to it.
  if (inTarn(nx, ny)) {
    if (!inTarn(nx, S.y)) ny = S.y;
    else if (!inTarn(S.x, ny)) nx = S.x;
    else { nx = S.x; ny = S.y; }
  }
  if (inWall(nx, ny)) {
    if (!inWall(nx, S.y)) ny = S.y;
    else if (!inWall(S.x, ny)) nx = S.x;
    else { nx = S.x; ny = S.y; }
  }
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
    if (onLeaf) footing = onLeaf;
    if (!isDeep(S.x, S.y)) {
      S.safeX = S.x; S.safeY = S.y;
      footing = onSolid(S.x, S.y) ? { x: S.x, y: S.y } : null;
    }
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
    // THE EMBERS COME OFF THE LANTERN, so they only exist when the lantern
    // does. They used to rise off her chest whenever she owned a lit coal -
    // which since the belt went in means for most of the game, with the
    // thing stowed and both hands empty. A girl walking about on fire.
    if (st.equip === 'lamp' && st.ember > 0.05 && Math.random() < 0.4) {
      const side = Math.abs(Math.cos(S.face)) > 0.3 ? Math.sign(Math.cos(S.face)) : -1;
      spark(S.x + side * 10 + rand(-3, 3), S.y - 12, 1,
        { col: ['#ffb35e', '#ff8a3c'], sp0: 4, sp1: 20, l0: 0.6, l1: 1.4, s0: 2, s1: 4, kind: 'ember', lift: 28 });
    }
  }

  // THE FIRST STRETCH OF ROAD, and only that. How far she moved this frame is
  // what counts as walking, so holding a key against a wall teaches nothing.
  // It is over for good once the keeper has sent her to the first root.
  stepTeach(dt, Math.hypot(S.x - taughtX, S.y - taughtY), st.briefed || st.done > 0);
  taughtX = S.x; taughtY = S.y;

  // What she can reach, what the button would do about it, AND WHICH BUTTON.
  //
  // The prompt used to say only the what: "take the broom". A player who has
  // not been told which key that is has to try them. So it names the button in
  // the language of the device in hand, and it asks the key table for the
  // name, which means a player who rebinds it is taught the key they chose.
  // A phone says nothing: its ring carries the word already.
  st.prompt = '';
  st.cue = '';
  const ih = isTouch() ? '' : (pad.on ? padName('act') : keyLabel('interact'));
  const uh = isTouch() ? '' : (pad.on ? padName('act') : keyLabel('use'));
  const press = (v) => (ih ? `${ih} to ${v}` : v);
  const hold = (v) => (uh ? `hold ${uh} to ${v}` : `hold to ${v}`);
  const nearBroom = has(st, 'broom') && !broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74;
  const nearYoung = YOUNG.find((yt) => yt.grow >= 1 && Math.hypot(S.x - yt.x, S.y - yt.y) < 130);
  const nearFinal = finalUp() && Math.hypot(S.x - FINAL.x, S.y - FINAL.y) < 150;
  const atCapstan = !drained && Math.hypot(S.x - CAPSTAN.x, S.y - CAPSTAN.y) < CAPSTAN.r + 40;
  const boon = ROOTS.find((r) => r.mat === 'ash');
  const atBoon = boon && !st.woken[boon.id] && Math.hypot(S.x - boon.at.x, S.y - boon.at.y) < 320;
  const left = atBoon ? stonesOn(boon.patch) : 0;
  if (carried) { st.cue = 'throw'; st.prompt = press('throw it in the spring, north'); }
  else if (reachStone()) { st.cue = 'lift'; st.prompt = press('lift the stone'); }
  else if (atBoon && left) st.prompt = `${left} stone${left === 1 ? '' : 's'} still on the root`;
  else if (atBoon) { st.cue = 'sweep'; st.prompt = hold('sweep the grit off it'); }
  else if (Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 120) { st.cue = 'speak'; st.prompt = press('speak to her'); }
  else if (atCapstan) {
    st.cue = 'haul';
    st.prompt = !has(st, 'crank')
      ? 'the wheel has no handle. the keeper has it'
      : CAPSTAN.turns < 0.08
        ? 'walk round the wheel to raise the gate'
        : `the gate is coming up. ${(CAPSTAN.need - CAPSTAN.turns).toFixed(1)} turns to go`;
  }
  else if (nearBroom) { st.cue = 'take'; st.prompt = press('take the broom'); }
  else if (nearYoung || nearFinal) { st.cue = 'read'; st.prompt = press('read the mural'); }
  else if (onLeaf) st.prompt = 'jump';
  else if (st.equip === 'broom') { st.cue = 'sweep'; st.prompt = hold('sweep'); }
  else if (st.equip === 'lamp') { st.cue = 'hold'; st.prompt = hold('raise the lantern at thorn or snow'); }
  // And nothing else matters while the river is emptying.
  if (st.watching) st.prompt = 'she stands and watches the water go';

  for (const yt of YOUNG) {
    if (yt.grow < 1) yt.grow = Math.min(1, yt.grow + dt * 0.42);
    // GROWN, AND THE PANEL LIT — and then it WAITS. The beat used to play by
    // itself, wherever she happened to be standing, which is the story
    // happening at the player rather than something she goes and finds. She
    // walks up to it and presses, and the keeper remembers that piece.
    else if (yt.pending && !yt.rung) {
      yt.rung = true;
      st.watching = false;                  // there is something to go and see
      sfx.chime();
      toast = { t: 0, text: 'a mural has come up on the new tree' };
    }
  }

  // Her fire fills the lamp - but only a lamp she has been given.
  if (has(st, 'lamp') && Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 80 && st.ember < 0.6) {
    st.hasEmber = true; st.ember = 1;
    sfx.boon();
    toast = { t: 0, text: 'the lamp takes a coal from her fire' };
  }

  // Held still, but never for ever: if anything at all goes wrong upstream
  // of the mural she gets her legs back after fourteen seconds rather than
  // standing in a river for the rest of the game.
  if (st.watching) {
    st.watchT += dt;
    if (st.watchT > 14) st.watching = false;
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
      ['keeper', 'The roots next, child. Follow the lit one out and do for it what you did for my doorstep.']], null);
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
    else if (r.mat === 'thorn') {
      // ENOUGH, and then it takes by itself. Either she has cut her way in to
      // the root, or she has burned enough of the thicket off that the rest
      // of it goes up on its own; the root does not wake until the fire has
      // run all the way out to the margin.
      if (!blaze && (near || cleared(r.patch, MAT.thorn) > 0.36)) lightTheThicket(r);
      done = false;
    }
    // THE STONE FALL, IN TWO STAGES, and the second cannot start early
    // because the stones are physically in the way of the broom. Every stone
    // off the root's ground, and then the grit under them swept.
    else if (r.mat === 'ash') done = stonesOn(r.patch) === 0 && fraction(r) > 0.8;
    else done = fraction(r) > 0.8;
    if (done) wake(r);
  }

  // The ending used to fire HERE: walk within 340 of the tree with five roots
  // done and the whole climax played at you on the spot. It is read off the
  // sixth panel now, in its own time. See FINAL.

  stepStones(dt);
  if (blaze) stepBlaze(dt);
  stepFauna(dt, S, st);
  st.bloomK += (st.bloom - st.bloomK) * Math.min(1, dt * 0.6);
  st.warmth = clamp01(0.2 + (st.count / ROOTS.length) * 0.58 + st.bloomK * 0.22);

  // While the water goes, the shot leans off her and down the river toward
  // the root coming up out of it - she is not the thing to be looking at.
  const look = st.watching ? clamp01(st.watchT / 1.6) * 0.42 : 0;
  const cx = S.x + (ROOT_AT[0] - S.x) * look;
  const cy = S.y + (ROOT_AT[1] - S.y) * look;
  const tx = clamp(cx - view.w / 2, 0, Math.max(0, V.w - view.w));
  const ty = clamp(cy - view.h / 2, 0, Math.max(0, V.h - view.h));
  const f = 1 - Math.exp(-5 * dt);
  camera.x += (tx - camera.x) * f;
  camera.y += (ty - camera.y) * f;
}

/** The whole burden lets go at once. Used when she reaches a root under it. */
/**
 * THE LAST OF IT COMES OFF THE ROOT — and it comes off in the shape it was
 * laid in, which is the whole of this.
 *
 * It used to walk the patch RECTANGLE and set every cell of it to nothing.
 * Two things were wrong with that and both of them showed. The patch is laid
 * down as a lumpy blob with a soft margin, so zeroing the rectangle inside it
 * cut a PERFECT SQUARE out of a round drift and left the margin standing
 * round the outside of it like a picture frame. And for the leaves it went
 * to bare earth, in a valley carpeted everywhere else in a thin litter - so
 * the square was bare ground as well as square.
 *
 * Now it takes the same falloff `blob` used, so the middle goes completely
 * and the rim feathers away to nothing; and the leaves come off down to the
 * ordinary litter that lies over the whole valley, not down to the soil.
 */
function wither(p, m) {
  if (!p.w) return;
  const floor = m === MAT.leaves ? LITTER : 0;
  const gx = p.w * 0.45, gy = p.h * 0.45;
  const i0 = Math.max(0, ((p.x - gx) / CELL) | 0), i1 = Math.min(G.w - 1, ((p.x + p.w + gx) / CELL) | 0);
  const j0 = Math.max(0, ((p.y - gy) / CELL) | 0), j1 = Math.min(G.h - 1, ((p.y + p.h + gy) / CELL) | 0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== m) continue;
      const k = clamp01(thicket(i * CELL + 7, j * CELL + 7, p) * 1.2);
      if (k <= 0.02) continue;
      const want = Math.max(floor, G.dep[q] * (1 - k));
      if (want >= G.dep[q]) continue;
      if (G.dep[q] > 0.05 && Math.random() < 0.05 * k) {
        spark(i * CELL, j * CELL, 1, { col: MATS[m].col, sp0: 20, sp1: 90, l0: 0.8, l1: 1.8, s0: 3, s1: 7, lift: 40 });
      }
      G.dep[q] = want;
      G.base[q] = Math.min(G.base[q], want);
    }
  }
}

/**
 * THE THICKET TAKES.
 *
 * Cutting a corridor in to the root used to wake it and the whole mat simply
 * vanished on the same frame - no moment, no spectacle, and no reason that
 * burning a path through one side of a thing should make the other side
 * disappear. It ought to CATCH: she has been holding fire against it for
 * thirty seconds, and at some point a thicket that dry stops needing her.
 *
 * So the fire takes over. A front leaves the heart of it - the root, which is
 * where she is standing and where it has been burning longest - and runs
 * outward to the last clump on the margin, eating the thorn as it goes. It
 * takes about three seconds, and she can stand in it and watch.
 *
 * The consuming and the drawing both read this one object, so the ring of
 * flame on the screen is exactly the ring of thorn that is going.
 */
let blaze = null;
const BAND = 78;              // how wide the burning front is

function lightTheThicket(r) {
  const p = r.patch;
  let max = 0;
  for (const cx of [p.x, p.x + p.w]) {
    for (const cy of [p.y, p.y + p.h]) max = Math.max(max, Math.hypot(cx - r.at.x, cy - r.at.y));
  }
  blaze = { root: r, x: r.at.x, y: r.at.y, r: 0, max: max * 1.34, t: 0, hiss: 0 };
  toast = { t: 0, text: 'the thicket catches' };
  sfx.hiss();
}

function stepBlaze(dt) {
  const B = blaze;
  B.t += dt;
  B.r += dt * (B.max / 2.8);

  const p = B.root.patch, gx = p.w * 0.42, gy = p.h * 0.42;
  const i0 = Math.max(0, ((p.x - gx) / CELL) | 0), i1 = Math.min(G.w - 1, ((p.x + p.w + gx) / CELL) | 0);
  const j0 = Math.max(0, ((p.y - gy) / CELL) | 0), j1 = Math.min(G.h - 1, ((p.y + p.h + gy) / CELL) | 0);
  let live = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== MAT.thorn || G.dep[q] <= 0) continue;
      live++;
      const k = (B.r - Math.hypot(i * CELL + 7 - B.x, j * CELL + 7 - B.y)) / BAND;
      if (k <= 0) continue;
      G.dep[q] = Math.max(0, G.dep[q] - dt * (2.4 + Math.min(1, k) * 6));
      G.base[q] = 0;            // and it does not come back
    }
  }

  // The front itself, thrown up off the ring rather than out of a box.
  const n = Math.min(26, 4 + Math.round(B.r * 0.05));
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const d = B.r - rand(0, BAND * 0.8);
    if (d < 6) continue;
    const x = B.x + Math.cos(a) * d, y = B.y + Math.sin(a) * d;
    if (depAt(x, y).m !== MAT.thorn) continue;
    spark(x, y, 1, Math.random() < 0.34
      ? { col: ['#3a3040', '#4c4256', '#2b2233'], sp0: 4, sp1: 40, l0: 1.4, l1: 3, s0: 9, s1: 20, kind: 'dust', lift: 58 }
      : { col: ['#ffb35e', '#ff7a2e', '#ffd9a0', '#ff5e3d'], sp0: 20, sp1: 130, l0: 0.5, l1: 1.5, s0: 3, s1: 8, kind: 'ember', lift: 46 });
  }
  B.hiss -= dt;
  if (B.hiss <= 0) { B.hiss = 0.22 + Math.random() * 0.2; sfx.hiss(); }

  // It is over when there is nothing left standing, NOT when the radius runs
  // out. The margin is ragged, so the last clump goes a good half second
  // before a circle drawn round the whole patch would have finished - and
  // that half second was an empty ring of fire sitting on bare ground.
  if (!live || B.r > B.max + BAND * 2) {
    const r = B.root;
    blaze = null;
    wake(r);                    // and the root, out in the open at last
  }
}

/**
 * THE RING OF FIRE, on the ground, under everything that stands on it.
 *
 * Drawn as a ring of separate fires rather than as one stroked ellipse, and
 * only where there is still thorn underneath to be burning. An ellipse kept
 * its perfect shape long after the thicket under it had run out, so for the
 * last second of it there was a neat orange oval sitting on bare ground. Now
 * the front takes the shape of whatever is left, which on a ragged thicket
 * with clumps off on their own means the fire breaks up and runs out along
 * the spurs - which is exactly what it should look like.
 */
function drawBlaze(c) {
  const B = blaze;
  if (!B) return;
  const fl = 0.9 + Math.sin(st.t * 17) * 0.07 + Math.sin(st.t * 31) * 0.04;
  const N = 72;
  const lit = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const cs = Math.cos(a), sn = Math.sin(a);
    // Is anything along this spoke of the front still alight?
    let x = 0, y = 0, on = false;
    for (const k of [0.25, 0.55, 0.85]) {
      const d = B.r - BAND * k;
      if (d < 4) continue;
      const px = B.x + cs * d, py = B.y + sn * d;
      const g = depAt(px, py);
      if (g.m === MAT.thorn && g.d > 0.03) { x = px; y = py; on = true; break; }
    }
    if (on) lit.push([x, y, a, i]);
  }
  if (!lit.length) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [x, y] of lit) {
    const rr = BAND * 0.62 * fl;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(255,238,190,0.3)');
    g.addColorStop(0.35, 'rgba(255,166,60,0.22)');
    g.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
  }
  // Tongues standing up off the front, leaning the way the wind is.
  c.lineCap = 'round';
  for (const [x, y, , i] of lit) {
    if (i & 1) continue;
    const h = 15 + (Math.sin(st.t * 9 + i * 1.7) + 1) * 12;
    const j = i % 3;
    c.strokeStyle = `rgba(255,${158 + j * 42},${58 + j * 52},0.42)`;
    c.lineWidth = 5.5 - j * 1.4;
    c.beginPath();
    c.moveTo(x, y + 4);
    c.quadraticCurveTo(x + Math.sin(st.t * 6 + i) * 6, y - h * 0.6, x + Math.sin(st.t * 4 + i) * 10, y - h);
    c.stroke();
  }
  c.restore();
  glow(c, B.x, B.y, B.r + BAND, `rgba(255,150,60,${(0.05 + 0.1 * (lit.length / N)) * fl})`);
}

function wake(r) {
  st.woken[r.id] = true;
  rootDone(st);
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
  YOUNG.push({
    x: r.at.x + 86, y: r.at.y + 34, grow: 0, pending: true,
    mural: beat.mural, name: beat.name, lines: beat.lines, savi: beat.savi,
  });
  st.lastRoot = beat.id;
  sfx.chime(); sfx.boon();
  spark(r.at.x, r.at.y, 90, { col: ['#ffb35e', '#ffd9a0', '#ff8a3c'], sp0: 40, sp1: 320, l0: 1, l1: 2.4, s0: 3, s1: 8, kind: 'ember' });
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
// --- THE STONE FALL -------------------------------------------------------------
//
// Two dozen loose stones lying on the last root. One press picks one up; one
// more throws it. In she is slower and cannot jump or dash, because the
// weight has to be worth something or carrying is just walking.
//
// A stone in the spring is gone for good, with a splash you can see from the
// far side of the field. A stone that lands short is simply a stone lying
// somewhere else, and can be picked up and thrown again - missing costs the
// walk back and nothing else, which is the right price in a game like this.
//
// And a stone SITTING ON THE GRIT HOLDS IT DOWN: the broom cannot get under
// one. That is the whole of the two-stage task, with no gate and no rule to
// explain. The stones come off, and then the ground can be swept.

const STONES = [];
let carried = null;
const RIPPLES = [];

function sowStones() {
  const p = PLACES.boon.patch;
  for (let tr = 0; STONES.length < 18 && tr < 6000; tr++) {
    const x = rand(p.x + 34, p.x + p.w - 34), y = rand(p.y + 30, p.y + p.h - 26);
    if (inTarn(x, y, 80)) continue;
    // Not sitting on the root itself - she has to be able to see what she
    // came for, or there is nothing to aim the work at.
    if (Math.hypot(x - PLACES.boon.at.x, y - PLACES.boon.at.y) < 52) continue;
    let clash = false;
    for (const s of STONES) if (Math.hypot(x - s.x, y - s.y) < 76) { clash = true; break; }
    if (clash) continue;
    STONES.push({ x, y, r: rand(13, 20), seed: rand(0, 9), z: 0, vx: 0, vy: 0, vz: 0, fly: false, spin: false, held: false });
  }
}

/** How many are still lying on the root's ground, the carried one included. */
function stonesOn(p) {
  let n = carried ? 1 : 0;
  for (const s of STONES) {
    if (s.held) continue;
    if (s.x > p.x - 40 && s.x < p.x + p.w + 40 && s.y > p.y - 40 && s.y < p.y + p.h + 40) n++;
  }
  return n;
}

/** A stone sitting on the grit holds it down: the broom cannot get under it. */
function underStone(x, y) {
  for (const s of STONES) {
    if (s.held || s.fly) continue;
    if (Math.hypot(x - s.x, y - s.y) < s.r + 16) return true;
  }
  return false;
}

/** The one she could get her hands under from here. */
function reachStone() {
  let best = null, bd = 54;
  for (const s of STONES) {
    if (s.fly || s.held) continue;
    const d = Math.hypot(S.x - s.x, S.y + 4 - s.y) - s.r;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function takeStone(s) {
  carried = s;
  s.held = true;
  // Both hands. Whatever she was holding goes on her belt and comes back off
  // it the moment the stone leaves her.
  st.stowed = st.equip;
  st.equip = null;
  sfx.pickup();
  const g = groundFx(s.x, s.y);
  if (g) spark(s.x, s.y, 7, { col: g.col, sp0: 20, sp1: 90, l0: 0.4, l1: 1, s0: 3, s1: 7, lift: g.lift, kind: g.kind });
}

function hurlStone() {
  const s = carried;
  carried = null;
  s.held = false;
  st.equip = st.stowed; st.stowed = null;
  const a = S.face;
  // A big one does not go as far, which is the only reason to look at which
  // one you are picking up.
  const sp = throwSpeed(s.r);
  s.x = S.x + Math.cos(a) * 14;
  s.y = S.y + Math.sin(a) * 10;
  s.vx = Math.cos(a) * sp;
  s.vy = Math.sin(a) * sp;
  s.vz = THROW.VZ; s.z = THROW.Z0; s.fly = true; s.spin = true;
  sfx.swish(1.2);
}

function stepStones(dt) {
  for (let i = STONES.length - 1; i >= 0; i--) {
    const s = STONES[i];
    if (!s.fly) continue;
    s.vz -= THROW.G * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (s.z > 0) continue;
    s.z = 0; s.fly = false; s.spin = false;
    s.x = clamp(s.x, 40, V.w - 40); s.y = clamp(s.y, 40, V.h - 40);
    if (inTarn(s.x, s.y, 10)) {
      sfx.splash();
      spark(s.x, s.y, 30, {
        col: ['#bfe0e8', '#8fbcc8', '#dff0f4', '#ffffff'],
        sp0: 50, sp1: 260, l0: 0.5, l1: 1.5, s0: 3, s1: 9, kind: 'drop', lift: 110,
      });
      RIPPLES.push({ x: s.x, y: s.y, t: 0 });
      STONES.splice(i, 1);
      continue;
    }
    sfx.thud();
    const g = groundFx(s.x, s.y);
    if (g) {
      spark(s.x, s.y, 9, { col: g.col, sp0: 40, sp1: 150, l0: 0.5, l1: 1.3, s0: 3, s1: 8, lift: g.lift, kind: g.kind });
      if (depAt(s.x, s.y).m === MAT.leaves) pushLitter(s.x, s.y + 4, 48, 0, 0, 6);
    }
  }
  for (let i = RIPPLES.length - 1; i >= 0; i--) {
    RIPPLES[i].t += dt;
    if (RIPPLES[i].t > 1.6) RIPPLES.splice(i, 1);
  }
}

/** The stones in a band of y, so they sort against her like everything else. */
function drawStones(c, y0, y1) {
  for (const s of STONES) {
    if (s.held) continue;
    const sy = s.fly ? s.y + 200 : s.y;      // in the air, always over the ground
    if (sy < y0 || sy >= y1) continue;
    if (s.x < camera.x - 60 || s.x > camera.x + view.w + 60 || s.y < camera.y - 120 || s.y > camera.y + view.h + 60) continue;
    drawStone(c, s, st.t);
  }
}

/** The rings going out from where one went in. */
function drawRipples(c) {
  for (const r of RIPPLES) {
    const k = r.t / 1.6;
    c.strokeStyle = `rgba(226,242,248,${0.5 * (1 - k) * (1 - k)})`;
    c.lineWidth = 3 - k * 2;
    for (const o of [0, 0.34, 0.66]) {
      const u = k - o;
      if (u <= 0) continue;
      c.beginPath();
      c.ellipse(r.x, r.y, u * 130, u * 130 * 0.42, 0, 0, TAU);
      c.stroke();
    }
  }
}

/**
 * WHERE THE LONG GRASS GROWS: in the shade of a tree, and under the Banyan.
 *
 * Asking "is there a tree near this blade of grass?" of seven hundred trees
 * for every one of forty thousand candidate tufts is twenty-eight million
 * distance tests at boot. So the trees stamp a coarse mask once and the
 * grass reads it, which is two arithmetic ops a tuft.
 */
const TALLG = { s: 64, w: 0, h: 0, m: null };
function sowTallMask() {
  TALLG.w = Math.ceil(V.w / TALLG.s); TALLG.h = Math.ceil(V.h / TALLG.s);
  TALLG.m = new Uint8Array(TALLG.w * TALLG.h);
  const mark = (x, y, r) => {
    const i0 = Math.max(0, ((x - r) / TALLG.s) | 0), i1 = Math.min(TALLG.w - 1, ((x + r) / TALLG.s) | 0);
    const j0 = Math.max(0, ((y - r) / TALLG.s) | 0), j1 = Math.min(TALLG.h - 1, ((y + r) / TALLG.s) | 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = i * TALLG.s + TALLG.s / 2, cy = j * TALLG.s + TALLG.s / 2;
        if (Math.hypot(cx - x, cy - y) < r) TALLG.m[j * TALLG.w + i] = 1;
      }
    }
  };
  mark(TREE.x, TREE.y + 70, 470);                 // the whole skirt of the Banyan
  for (const o of SCENERY) if (!o.rock) mark(o.x, o.y - 12, 62 + o.s * 48);
}
const tallGrassAt = (x, y) => {
  if (!TALLG.m) return false;
  const i = (x / TALLG.s) | 0, j = (y / TALLG.s) | 0;
  if (i < 0 || j < 0 || i >= TALLG.w || j >= TALLG.h) return false;
  return !!TALLG.m[j * TALLG.w + i];
};

/** Scratch for litterAt, so drawing a thousand leaves allocates nothing. */
const FIELD = { dx: 0, dy: 0, sp: 0 };

const SCENERY = [];
function sowScenery() {
  // The avenue first, so it is always there and always in the same place.
  for (const t of AVENUE) SCENERY.push({ x: t.x, y: t.y, rock: false, s: t.s, seed: t.seed, dead: false, avenue: 1 });
  for (let i = 0; i < 760; i++) {
    const x = rand(60, V.w - 60), y = rand(60, V.h - 60);
    if (nearRiver(x, y, 90) || roadDist(x, y) < 72) continue;
    if (Math.hypot(x - TREE.x, y - TREE.y) < 500) continue;
    if (Math.abs(x - 2600) < 230 && y > 2300) continue;      // keep the avenue clear
    // NOTHING SCATTERED ON THE STONE FALL. The boon patch is TT.GRAVEL now,
    // and sowScenery turns every gravel tile into a ROCK - so the field she
    // is meant to clear was salted with two dozen grey lumps that look
    // exactly like the ones she can pick up and cannot be picked up at all.
    // Nobody can be expected to tell those apart, and trying to is the worst
    // kind of busywork.
    if (inSoft(x, y, PLACES.boon.patch, 90) > 0) continue;
    let onPatch = false;
    for (const r of ROOTS) if (inSoft(x, y, r.patch, 60) > 0) onPatch = true;
    if (onPatch && Math.random() < 0.72) continue;
    const t = classify(x, y);
    const rock = t === TT.ROCK || t === TT.GRAVEL || Math.random() < 0.16;
    SCENERY.push({ x, y, rock, s: rand(0.7, 1.45), seed: i, dead: t === TT.ASH || t === TT.SNOW });
  }
  SCENERY.sort((a, b) => a.y - b.y);
  // And the animals. They ask `classify` what each spot is before they stand
  // on it, so this has to happen after the valley is decided; and they keep
  // clear of where she wakes up, because a deer two paces from her starting
  // position is scenery rather than something she came across.
  // THE ANIMALS, BY REGION. One cluster per root - which does not appear at
  // all until that root is awake - and one round the Banyan, which is for the
  // ending only. What comes back, comes back where she has been working.
  initFauna(V, classify, [
    ...ROOTS.map((r) => ({ id: r.id, x: r.at.x, y: r.at.y, r: 620 })),
    { id: 'hub', hub: true, x: TREE.x, y: TREE.y + 220, r: 640 },
  ]);
  sowStones();
}

function render() {
  const s = view.dpr * view.scale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.fillStyle = '#14100e';
  ctx.fillRect(0, 0, view.w, view.h);
  if (cinemaOn()) { drawCinema(ctx, view); return; }
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  terrain.draw(ctx, camera.x, camera.y, view.w, view.h);
  drawLayer(ctx);
  drawRipples(ctx);
  drawBlaze(ctx);
  grass.draw(ctx, st.t, win());
  drawRootBed(ctx, st.t, drained);
  water.draw(ctx);

  drawShrine(ctx, SHRINE, st.t, st.swept ? 1 : 0);
  for (const r of ROOTS) drawRoot(ctx, TREE, r, !!st.woken[r.id], st.t, r === current());
  drawRootProgress(ctx);

  drawHollow(ctx);
  drawCurrent(ctx, st.t, drained, camera, view);
  drawSluice(ctx, st.t, drained);
  drawPlatforms(ctx, st.t, drained);
  drawCliffs(ctx, st.t, camera, view);

  S.broom = st.equip === 'broom';
  // The lamp is hers from the moment the keeper hands it over, and the coal in
  // it is however much heat is left.
  S.carry = carried ? carried.r : 0;
  S.lamp = st.equip === 'lamp';
  S.ember = st.hasEmber ? st.ember : 0;
  if (!broom.held) drawBroom(ctx, broom, st.t);
  for (const yt of YOUNG) drawYoungTree(ctx, yt, st.t, st.bloomK);

  drawGate(ctx, GATE, st.t, st.warmth);
  // SEE-THROUGH TREES. A tree whose base is below her feet draws over the top
  // of her, trunk and crown and all, so she vanishes under the avenue and under
  // the Banyan itself. Ashfall solved this by drawing crowns in a pass of their
  // own and dropping the alpha of any crown the player was standing inside.
  // Same idea, eased rather than switched: a hard swap strobes when she walks
  // along a row of trunks, and this valley has an avenue of eighteen of them.
  const below = [], above = [];
  for (const o of SCENERY) {
    if (o.x < camera.x - 160 || o.x > camera.x + view.w + 160 || o.y < camera.y - 240 || o.y > camera.y + view.h + 200) continue;
    const r = 44 + o.s * 26;
    const under = !o.rock && o.y >= S.y && Math.hypot(S.x - o.x, S.y - (o.y - 20)) < r;
    o.see = (o.see === undefined ? 1 : o.see) + ((under ? 0.34 : 1) - (o.see === undefined ? 1 : o.see)) * Math.min(1, dtSeen * 9);
    (o.y < S.y ? below : above).push(o);
  }
  for (const o of below) (o.rock ? drawRock : drawTree)(ctx, o, st.t, st.warmth, st.bloomK);
  drawFauna(ctx, st.t, camera, view, -1e9, S.y);
  drawStones(ctx, -1e9, S.y);

  drawBanyan(ctx, TREE, st.bloomK, st.t);
  if (finalUp()) drawMuralPanel(ctx, FINAL.x - 46, FINAL.y - 16, 92, FINAL.mural, 1);
  drawFire(ctx, FIRE, st.t, st.hasEmber ? 0.4 : 1);
  // She looks up at whoever is coming. Beyond about a screen she just sits.
  WOMAN.look = Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 260
    ? clamp((S.x - WOMAN.x) / 90, -1, 1) : 0;
  drawWoman(ctx, WOMAN, st.t);
  for (const h of SHELTERS) drawFire(ctx, { x: h.x, y: h.y }, st.t + h.x, 0.6);

  // And the light on the ground is the LANTERN'S light. Same bug, same fix:
  // a coal she owns but is not carrying does not light the valley.
  if (st.equip === 'lamp' && st.ember > 0.02) {
    glow(ctx, S.x, S.y - 10, 190 * (0.45 + st.ember * 0.55), `rgba(255,150,60,${0.22 * st.ember + 0.05})`);
  }
  // WHICH SIDE OF HER THE FIRE IS ON. Facing away from the camera she is
  // aiming UP the screen, and her own sprite stands in the first thirty
  // pixels of the cone - drawn over her, the fire rubbed her out. Facing away
  // it goes down first and she stands in front of it, which is also what is
  // actually happening.
  const behind = S.burn && Math.sin(S.face) < -0.25;
  if (behind) drawBreath(ctx, S, S.burn, st.t);
  drawSavi(ctx, S, st.t);
  if (S.burn && !behind) drawBreath(ctx, S, S.burn, st.t);
  drawFauna(ctx, st.t, camera, view, S.y, 1e9);
  drawStones(ctx, S.y, 1e9);
  for (const o of above) {
    ctx.globalAlpha = o.see === undefined ? 1 : o.see;
    (o.rock ? drawRock : drawTree)(ctx, o, st.t, st.warmth, st.bloomK);
  }
  ctx.globalAlpha = 1;
  grass.drawFront(ctx, st.t, win());
  drawParticles(ctx);
  // The Banyan's crown covers the shrine, the fire and the keeper, so it is
  // the one that matters most.
  const underTree = Math.hypot(S.x - TREE.x, S.y - (TREE.y - 120)) < 340;
  canopySee += ((underTree ? 0.4 : 1) - canopySee) * Math.min(1, dtSeen * 9);
  drawCanopy(ctx, TREE, st.bloomK, st.t, canopySee);
  // The birds go over the top of everything, canopy included, with their
  // shadows down on the ground - which is the only thing that says "high up".
  drawSkyFauna(ctx, st.t, camera, view);

  // Along the avenue the air is full of them.
  const onAvenue = Math.abs(S.x - 2600) < 420 && S.y > 2250;
  const n = (onAvenue ? 74 : 38) + Math.round(st.bloomK * 50);
  // What is coming down turns with the tree: dead gold at the start, new green
  // and blossom once it is back.
  const air = st.bloomK < 0.05 ? MATS[1].col
    : [mixHex(MATS[1].col[0], '#63b148', st.bloomK), mixHex(MATS[1].col[1], '#eef0d8', st.bloomK),
      mixHex(MATS[1].col[2], '#4d9a3a', st.bloomK), mixHex(MATS[1].col[3], '#d9607a', st.bloomK * 0.7)];
  drawFallingLeaves(ctx, st.t, camera, view, n, air);
  ctx.restore();

  const vig = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.32, view.w / 2, view.h / 2, view.w * 0.74);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  // The dark at the edges warms and greens as the valley comes back.
  const vg = Math.round(28 + st.bloomK * 26), vb = Math.round(48 - st.bloomK * 18);
  vig.addColorStop(1, `rgba(20,${vg},${vb},${0.52 - st.warmth * 0.3})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, view.w, view.h);
  drawWaypoint(ctx);
  drawThought(ctx);
  drawHud();
  drawBelt(ctx);
  drawMenu(ctx);
  if (st.talking) paintFace();
}

/** The boulders that make the neck, the reeds round the shore, the lily pads. */
function drawHollow(ctx) {
  // Reeds, standing where the water is shallow.
  for (let i = 0; i < 90; i++) {
    const side = i & 1 ? 1 : -1;
    const sAt = (i / 90) * COURSE_LEN;
    const [x, y] = atRiver(sAt, side * (widthAt(sAt) - 8 - (i % 5) * 4));
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
      const [x, y] = atRiver((i / 44) * COURSE_LEN, (((i * 37) % 120) - 60));
      const drift = Math.sin(st.t * 0.4 + i) * 3;
      ctx.fillStyle = i % 4 ? '#3d6b46' : '#4b7a4e';
      ctx.beginPath();
      ctx.ellipse(x + drift, y, 16 + vn(i, 5) * 10, 12 + vn(i, 7) * 7, i * 0.7, 0.5, TAU);
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

/**
 * AN ARROW AT THE EDGE OF THE SCREEN, pointing at whatever she has been sent to
 * do, whenever that is off screen. A game that tells you where to go has to
 * also show you, or the line at the top is just a reproach.
 */
function drawWaypoint(ctx) {
  const job = objective(st, ROOTS, WOMAN, TREE, S, GORGE, unreadMural());
  if (!job || st.talking || st.reading || st.credits) return;
  const sx = job.x - camera.x, sy = job.y - camera.y;
  const m = 54;
  if (sx > m && sx < view.w - m && sy > m && sy < view.h - m) return;   // she can see it
  const cx = view.w / 2, cy = view.h / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const rx = view.w / 2 - m, ry = view.h / 2 - m;
  const k = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a)));
  const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
  const pulse = 0.72 + 0.28 * Math.sin(st.t * 2.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = `rgba(255,190,110,${pulse})`;
  ctx.beginPath();
  ctx.moveTo(15, 0); ctx.lineTo(-9, 9); ctx.lineTo(-4, 0); ctx.lineTo(-9, -9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,24,12,0.8)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
  // How far, so the walk has a shape.
  const d = Math.round(Math.hypot(job.x - S.x, job.y - S.y) / 50);
  ctx.font = '600 11px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillStyle = `rgba(255,214,170,${pulse * 0.8})`;
  ctx.textAlign = 'center';
  ctx.fillText(`${d}`, x - Math.cos(a) * 22, y - Math.sin(a) * 22 + 4);
  ctx.textAlign = 'left';
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
}

function drawHud() {
  // TEXT THE SIZE OF TEXT. The world is drawn at about 1550 view units wide
  // whatever the screen is, so on an eight-hundred-pixel phone a thirteen
  // unit font is under seven real pixels - unreadable, and the reason the
  // whole thing felt like a desktop game squinted at. Everything written on
  // the screen scales with the same factor the buttons do.
  const F = isTouch() ? clamp(view.h / 400, 1, 1.55) : 1;
  const fnt = (px) => `600 ${Math.round(px * F)}px "Segoe UI", Roboto, system-ui, sans-serif`;
  const L = Math.round(22 * F);
  ctx.font = fnt(13);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(240,226,203,0.8)';
  ctx.fillText(`${st.count} of ${ROOTS.length} roots awake`, L, 30 * F);
  // WHAT SHE IS DOING, in one line, from one place - so these words and the
  // arrow at the edge of the screen can never disagree with each other.
  const job = objective(st, ROOTS, WOMAN, TREE, S, GORGE, unreadMural());
  if (job) {
    ctx.fillStyle = 'rgba(255,179,94,0.92)';
    const cur2 = ROOTS.find((r) => r.id === (stage(st) || {}).root);
    const near = cur2 && st.briefed && Math.hypot(S.x - cur2.at.x, S.y - cur2.at.y) < 460;
    // HOW FAR ALONG SHE IS, for every root that is a job of work.
    //
    // The stone fall was left out of this and it is the LONGEST of the five:
    // eleven stones to carry off and then a whole floor of grit to sweep,
    // with nothing on the screen saying whether she was a tenth of the way in
    // or nearly done. It is two jobs, so it counts two ways - the stones
    // while there are stones, because a number of stones is better than a
    // percentage of them, and then the sweeping.
    //
    // Not the water, which the capstan's own line already counts in turns,
    // and not the thorn, which does not end by degrees: she cuts her way in
    // and the rest of the thicket goes up at once.
    const done = (r) => Math.min(99, Math.round(clamp01(fraction(r) / 0.8) * 100));
    let pc = '';
    if (near && (cur2.mat === 'leaves' || cur2.mat === 'snow')) pc = `, ${done(cur2)}% uncovered`;
    else if (near && cur2.mat === 'ash') {
      const n = stonesOn(cur2.patch);
      pc = n ? `, ${n} stone${n === 1 ? '' : 's'} to shift` : `, ${done(cur2)}% swept`;
    }
    ctx.fillText(job.text + pc, L, 50 * F);
  }
  // This bar is the COAL burning down, and nothing else. The broom never runs
  // out - it is a broom.
  if (st.hasEmber) {
    ctx.fillStyle = 'rgba(240,226,203,0.55)';
    ctx.font = fnt(10);
    ctx.fillText('COAL', L, 66 * F);
    ctx.font = fnt(13);
    ctx.fillStyle = 'rgba(255,170,80,0.26)';
    ctx.fillRect(56 * F, 59 * F, 88 * F, 7 * F);
    ctx.fillStyle = `rgba(255,${(150 + st.ember * 70) | 0},${(60 + st.ember * 70) | 0},0.95)`;
    ctx.fillRect(56 * F, 59 * F, 88 * F * st.ember, 7 * F);
  }

  if (toast) {
    toast.t += 1 / 60;
    if (toast.t > 3.4) toast = null;
    else {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, (3.4 - toast.t) * 1.6);
      ctx.fillStyle = 'rgba(240,226,203,0.9)';
      ctx.fillText(toast.text, view.w / 2, 76 * F);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }
  // THE THREE THINGS NOBODY TOLD THEM, on the first stretch of road. Above the
  // prompt, in a band of its own, because it is the one line on the screen a
  // player who has just started has to read.
  const lesson = st.started && !cinemaOn() && !st.talking && !st.reading && !st.wheel
    ? teachText({ touch: isTouch(), pad: pad.on }) : null;
  if (lesson) {
    const y = view.h - (isTouch() ? 186 * F : 96);
    ctx.textAlign = 'center';
    // IT HAS TO FIT. At the touch text scale the longest of the three ran off
    // both ends of its own pill, so the size comes down until the whole thing
    // sits inside the screen with a margin either side.
    let px = 17;
    ctx.font = fnt(px);
    while (px > 11 && ctx.measureText(lesson.text).width + 44 * F > view.w - 40) {
      px -= 1;
      ctx.font = fnt(px);
    }
    const w = ctx.measureText(lesson.text).width + 44 * F;
    ctx.fillStyle = 'rgba(14,10,8,0.5)';
    ctx.beginPath();
    const h = 30 * F, x = view.w / 2 - w / 2, ty = y - h * 0.72, r = h / 2;
    ctx.moveTo(x + r, ty);
    ctx.arcTo(x + w, ty, x + w, ty + h, r);
    ctx.arcTo(x + w, ty + h, x, ty + h, r);
    ctx.arcTo(x, ty + h, x, ty, r);
    ctx.arcTo(x, ty, x + w, ty, r);
    ctx.fill();
    ctx.strokeStyle = lesson.got ? 'rgba(198,226,196,0.5)' : 'rgba(255,196,120,0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = lesson.got ? 'rgba(214,238,210,0.95)' : 'rgba(255,224,186,0.95)';
    ctx.fillText(lesson.text, view.w / 2, y);
    ctx.font = fnt(13);
    ctx.textAlign = 'left';
  }
  if (st.prompt) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,214,170,0.92)';
    ctx.font = fnt(isTouch() ? 14 : 13);
    ctx.fillText(st.prompt, view.w / 2, view.h - (isTouch() ? 132 * F : 54));
    ctx.font = fnt(13);
    ctx.textAlign = 'left';
  }


  layoutButtons();
  const ttouch = isTouch();

  /** One control: a ring, a label, and whatever it wants drawn inside it. */
  const button = (b, label, fill, edge, lit, inner) => {
    if (b.off) return;
    const k = b.on ? 1 : 0;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = 'rgba(16,12,9,0.34)';
    ctx.fill();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = fill(lit + k * 0.28);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2 + k * 1.4;
    ctx.stroke();
    if (inner) inner(b);
    if (label) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,240,222,0.95)';
      ctx.font = `600 ${Math.round(b.r * 0.3)}px "Segoe UI", Roboto, system-ui, sans-serif`;
      ctx.fillText(label, b.x, b.y + b.r * 0.11);
      ctx.textAlign = 'left';
    }
  };

  // ACTION. Its label says what the press would actually DO, which on a
  // phone is the only instruction there is room for.
  // It reads `st.cue`, not the words of the prompt: the prompt now begins
  // with the name of a key, so matching on its first word would label every
  // ring in the game E.
  const CUE = { take: 'TAKE', read: 'READ', speak: 'TALK', lift: 'LIFT', throw: 'THROW', haul: 'HAUL', sweep: 'SWEEP', hold: 'HOLD' };
  const label = CUE[st.cue] || (st.equip === 'lamp' ? 'HOLD' : st.equip === 'broom' ? 'SWEEP' : 'ACT');
  button(BTN.act, label, (a) => `rgba(255,179,94,${0.22 + a * 0.2})`, 'rgba(255,190,120,0.8)', holding ? 0.28 : 0);

  button(BTN.jump, 'JUMP', (a) => `rgba(198,226,196,${0.18 + a * 0.2})`,
    'rgba(214,238,210,0.72)', S.z > 0.5 ? 0.22 : 0);

  button(BTN.dash, 'DASH', (a) => `rgba(150,190,225,${(dashStock > 0 ? 0.18 : 0.06) + a * 0.18})`,
    dashStock > 0 ? 'rgba(180,215,245,0.72)' : 'rgba(180,215,245,0.26)', 0, (b) => {
      for (let i = 0; i < DASH_MAX; i++) {
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.22 + i * b.r * 0.44, b.y + b.r * 0.52, b.r * 0.1, 0, TAU);
        ctx.fillStyle = i < dashStock ? 'rgba(190,225,255,0.95)' : 'rgba(190,225,255,0.22)';
        ctx.fill();
      }
    });

  // PAUSE, on a phone only. Two bars, because that is what the symbol is.
  button(BTN.menu, null, (a) => `rgba(28,22,18,${0.42 + a * 0.2})`, 'rgba(240,226,203,0.5)', 0, (b) => {
    ctx.fillStyle = 'rgba(240,226,203,0.9)';
    const w = b.r * 0.17, h = b.r * 0.62;
    ctx.fillRect(b.x - w * 2.1, b.y - h / 2, w, h);
    ctx.fillRect(b.x + w * 1.1, b.y - h / 2, w, h);
  });

  // HER BELT, showing whatever is in her hands right now.
  button(BTN.belt, null, (a) => `rgba(28,22,18,${0.42 + a * 0.2})`, 'rgba(255,190,120,0.6)', 0, (b) => {
    drawToolIcon(ctx, st.equip, b.x, b.y + b.r * 0.07, b.r * 1.1, st.equip === 'lamp' ? st.ember : 1);
    if (!ttouch) {
      ctx.textAlign = 'center';
      ctx.font = '600 9px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(240,226,203,0.6)';
      ctx.fillText(pad.on ? padName('belt') : keyLabel('belt').toUpperCase(), b.x, b.y + b.r + 13);
      ctx.textAlign = 'left';
    }
  });

  // THE THUMBSTICK, WHICH YOU CAN SEE. There was one all along and nothing
  // was ever drawn for it, so on a phone the left half of the screen was an
  // invisible control you had to be told about. It appears under the thumb
  // that made it and follows it if the thumb travels past the rim.
  if (touch.on) {
    const dx = touch.x / (view.scale || 1) - touch.ox / (view.scale || 1);
    const dy = touch.y / (view.scale || 1) - touch.oy / (view.scale || 1);
    const d = Math.hypot(dx, dy);
    const k = d > 1 ? Math.min(1, d / STICK_MAX) : 0;
    const ox = touch.ox / (view.scale || 1), oy = touch.oy / (view.scale || 1);
    ctx.beginPath(); ctx.arc(ox, oy, STICK_MAX, 0, TAU);
    ctx.fillStyle = 'rgba(18,13,10,0.24)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,170,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : 0;
    ctx.beginPath();
    ctx.arc(ox + nx * k * STICK_MAX, oy + ny * k * STICK_MAX, STICK_MAX * 0.42, 0, TAU);
    ctx.fillStyle = 'rgba(255,214,170,0.34)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,196,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  }

  // The line of keys, for whoever has a keyboard. A phone has labelled
  // buttons and does not need to be told what a thumb is for.
  if (!ttouch) {
    ctx.textAlign = 'center';
    ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillStyle = `rgba(240,226,203,${st.t < 16 ? 0.5 : 0.26})`;
    ctx.fillText(pad.on
      ? `${padName('jump')} to jump · ${padName('dash')} to dash · ${padName('act')} to act`
        + ` · ${padName('belt')} for her belt · ${padName('menu')} to pause`
      : `${keyLabel('jump')} to jump · ${keyLabel('dash')} to dash · ${keyLabel('interact')} to interact`
        + ` · ${keyLabel('use')} to use · ${keyLabel('belt')} for her belt · escape to pause`,
    view.w / 2, view.h - 16);
    ctx.textAlign = 'left';
  }
}

/**
 * HER BELT, OPEN. A row of what she has, the one in her hands lifted and lit,
 * and a line under it saying what that one is for - because "empty hands" and
 * "the lantern" need no explaining but which of them clears thorn does.
 */
function drawBelt(ctx) {
  beltSlots = [];
  if (!st.wheel) return;
  const b = belt();
  const k = Math.min(1, st.wheel.t * 7);
  ctx.fillStyle = `rgba(12,9,7,${0.52 * k})`;
  ctx.fillRect(0, 0, view.w, view.h);

  const R = 42, gap = 22;
  const wide = b.length * R * 2 + (b.length - 1) * gap;
  const y = view.h / 2 + 6;
  for (let i = 0; i < b.length; i++) {
    const x = view.w / 2 - wide / 2 + R + i * (R * 2 + gap);
    const on = i === st.wheel.sel;
    const r = R * (0.82 + k * 0.18) * (on ? 1.1 : 0.94);
    beltSlots.push({ x, y, r, id: b[i].id });
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = on ? 'rgba(52,38,26,0.95)' : 'rgba(26,20,16,0.85)';
    ctx.fill();
    ctx.strokeStyle = on ? 'rgba(255,196,120,0.95)' : 'rgba(150,126,98,0.5)';
    ctx.lineWidth = on ? 2.6 : 1.6;
    ctx.stroke();
    drawToolIcon(ctx, b[i].id, x, y + 4, r * 1.25, b[i].id === 'lamp' ? Math.max(0.25, st.ember) : 1);
    if (b[i].id === st.equip) {                 // the one she is already holding
      ctx.fillStyle = 'rgba(255,196,120,0.9)';
      ctx.beginPath(); ctx.arc(x, y - r - 9, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = `600 ${on ? 13 : 12}px "Segoe UI", Roboto, system-ui, sans-serif`;
    ctx.fillStyle = on ? 'rgba(255,224,186,0.95)' : 'rgba(210,192,168,0.5)';
    ctx.fillText(b[i].name, x, y + r + 22);
    ctx.globalAlpha = 1;
  }
  const sel = b[st.wheel.sel];
  ctx.globalAlpha = k;
  ctx.textAlign = 'center';
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240,226,203,0.62)';
  ctx.fillText(sel ? sel.note : '', view.w / 2, y + R + 54);
  ctx.font = '600 11px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240,226,203,0.36)';
  ctx.fillText(pad.on
    ? `stick to choose · ${padName('act')} to take it · ${padName('belt')} to close`
    : `tap one, or ${keyLabels('left')} and ${keyLabels('right')} · ${keyLabel('interact')} to take it`
      + ` · ${keyLabel('belt')} to close`, view.w / 2, y + R + 76);
  ctx.textAlign = 'left';
}

// --- what she is told, and what she can ask ------------------------------------------------
//
// Two shapes through one panel. A RECITAL is a run of lines she listens to (the
// legend, over its mural), advanced with a tap. A CONVERSATION is one line of
// the keeper's and two or three things a child might say back, which is what
// makes her someone rather than a sign.

function say(lines, onDone, mural, thought) {
  st.talking = { lines: lines.slice(), i: 0, onDone, mural, thought };
  paintTalk();
}

/**
 * WHAT SAVI MAKES OF IT — a bubble over her head as she walks away.
 *
 * The legend used to be a thing that happened AT the player: a panel opens,
 * five people who are not in this valley say their lines, the panel shuts,
 * and the girl you are walking around has no opinion about any of it. She is
 * eleven and it is the first time anybody has told her this story. She ought
 * to have an opinion.
 *
 * Drawn in SCREEN space at her screen position rather than in the world, so
 * the words can be the size of words on a phone - in world units they would
 * be seven real pixels across.
 */
function think(text) {
  if (text) st.think = { text, t: 0 };
}
const THINK_FOR = 7.5;
// WHERE THE CROSS IS. A thought of hers sits over her head for seven and a
// half seconds and there was no way to put it down early - you read it in two
// and then waited, with the valley behind it. Laid out by the draw and read
// by the pointer, the way her belt's slots are.
let thinkX = null;

function drawThought(c) {
  if (!st.think) { thinkX = null; return; }
  st.think.t += dtSeen;
  if (st.think.t > THINK_FOR) { st.think = null; thinkX = null; return; }
  const F = isTouch() ? clamp(view.h / 400, 1, 1.55) : 1;
  const k = Math.min(1, st.think.t * 5) * clamp01((THINK_FOR - st.think.t) * 1.4);
  const size = Math.round(13 * F);
  const FNT = (it) => `${it ? 'italic ' : ''}600 ${size}px "Segoe UI", Roboto, system-ui, sans-serif`;
  c.font = FNT(false);
  // THE SANSKRIT WORDS ARE ITALIC HERE TOO. The dialogue panels are HTML and
  // get it for nothing; this is a canvas, so the <i> has to be read off the
  // string and turned into a font change. Each word carries its own face,
  // and the wrap measures it with that face - measure a word in the upright
  // font and draw it in the italic one and the line creeps wider than the
  // bubble somebody sized for it.
  const maxw = Math.min(view.w * 0.62, 360 * F);
  const toks = [];
  let ital = false;
  for (const part of st.think.text.split(/(<i>|<\/i>)/)) {
    if (part === '<i>') { ital = true; continue; }
    if (part === '</i>') { ital = false; continue; }
    for (const w of part.split(/\s+/)) if (w) toks.push({ w, i: ital });
  }
  c.font = FNT(false);
  const sp = c.measureText(' ').width;
  const rows = [[]];
  let cur = 0, wide = 0;
  for (const t of toks) {
    c.font = FNT(t.i);
    const ww = c.measureText(t.w).width;
    const row = rows[rows.length - 1];
    const adv = row.length ? sp + ww : ww;
    if (row.length && cur + adv > maxw) { rows.push([t]); cur = ww; }
    else { row.push(t); cur += adv; }
    wide = Math.max(wide, cur);
  }
  const lh = size * 1.32;
  const pad = 11 * F;
  const bw = wide + pad * 2;
  const bh = rows.length * lh + pad * 1.7;
  // Over her head, and shoved back on screen if she is stood at an edge.
  const bx = clamp(S.x - camera.x - bw / 2, 12, view.w - bw - 12);
  const by = clamp(S.y - camera.y - 52 * F - bh, 10, view.h - bh - 10);
  const tipx = clamp(S.x - camera.x, bx + 16, bx + bw - 16);
  c.save();
  c.globalAlpha = k;
  c.beginPath();
  roundRectPath(c, bx, by, bw, bh, 10 * F);
  c.moveTo(tipx - 7 * F, by + bh - 1);
  c.lineTo(tipx, by + bh + 11 * F);
  c.lineTo(tipx + 7 * F, by + bh - 1);
  c.closePath();
  c.fillStyle = 'rgba(24,18,14,0.86)';
  c.fill();
  c.strokeStyle = 'rgba(255,196,130,0.5)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = 'rgba(244,232,214,0.95)';
  c.textAlign = 'left';
  rows.forEach((row, i) => {
    let x = bx + pad;
    const y = by + pad + lh * (i + 0.78);
    for (const t of row) {
      c.font = FNT(t.i);
      c.fillText(t.w, x, y);
      x += c.measureText(t.w).width + sp;
    }
  });

  // PUT IT DOWN. A cross on the corner for a hand with a mouse or a thumb,
  // and for a pad the name of the one face button nothing else uses - there
  // is nothing on a controller to click a cross with.
  if (pad.on) {
    thinkX = null;
    c.textAlign = 'right';
    c.font = `600 ${Math.round(10 * F)}px "Segoe UI", Roboto, system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,196,130,0.7)';
    c.fillText(`${padName('dismiss')} to dismiss`, bx + bw - 2, by + bh + 13 * F);
  } else {
    const r = 9 * F, cx = bx + bw - r * 0.3, cy = by + r * 0.3;
    thinkX = { x: cx, y: cy, r: r * 1.9 };        // a generous skirt, as the buttons have
    c.beginPath(); c.arc(cx, cy, r, 0, TAU);
    c.fillStyle = 'rgba(24,18,14,0.95)';
    c.fill();
    c.strokeStyle = 'rgba(255,196,130,0.6)';
    c.lineWidth = 1.4;
    c.stroke();
    c.strokeStyle = 'rgba(244,232,214,0.9)';
    c.lineWidth = 1.7;
    const q = r * 0.42;
    c.beginPath();
    c.moveTo(cx - q, cy - q); c.lineTo(cx + q, cy + q);
    c.moveTo(cx + q, cy - q); c.lineTo(cx - q, cy + q);
    c.stroke();
  }
  c.restore();
}

/** Put her thought down, from whichever thing asked. */
function dropThought() {
  if (!st.think) return false;
  st.think = null;
  thinkX = null;
  sfx.click();
  return true;
}

function roundRectPath(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
}

function talkTo(node) {
  // What she has to add about the beat just told, which is the bit she has
  // been carrying about it for forty years with nobody to say it to.
  const last = ROOTS.find((r) => r.id === st.lastRoot);
  keeperFill(st, stage(st), last && last.keeper);
  st.talking = { keeper: node, who: 'The Old Keeper' };
  paintTalk();
}

function paintTalk() {
  const t = st.talking;
  if (!t) return;
  let body;
  if (t.keeper) {
    const n = KEEPER[t.keeper];
    st.asked[t.keeper] = true;
    // Some of her lines ARE the event: being sent to the tree, being told
    // she is the keeper now. One field on the node, set as she says it.
    if (n.mark) st[n.mark] = true;
    // She puts it in Savi's hands as she says the line. The tool arriving IS
    // the moment the task begins, which is the whole of "deliberate".
    // THE BRIEFING HAPPENS WHETHER OR NOT SHE NEEDS THE TOOL.
    //
    // This used to be `if (n.give && !has(st, n.give))`, and `brief(st)` -
    // the ONE call that sets `st.briefed` - lived inside it. Five stages want
    // five tools, but only three of them are new: the snow wants the lantern
    // she already has and the stone fall wants the broom she has had since
    // the first minute. So on the last two roots the whole block was skipped,
    // `st.briefed` stayed false, and `objective()` went on saying "go back to
    // the keeper" with the arrow pointing at her, for ever. She could be sent
    // to three roots and no further.
    if (n.give) {
      const fresh = !has(st, n.give);
      const s2 = brief(st);
      if (n.give === 'broom') broom.held = true;
      if (n.give === 'lamp') { st.hasEmber = true; st.ember = 1; }
      // Handed a thing, she is holding it. Nobody is sent to a belt on the
      // frame they are given their first tool.
      if (n.give !== 'crank') st.equip = n.give;
      sfx.pickup();
      toast = { t: 0, text: fresh ? `she gives you ${TOOLNAME[n.give] || n.give}` : `${TOOLNAME[n.give] || n.give}, again` };
      if (s2) st.prompt = '';
    }
    // A question asked is a question answered: it does not come round again,
    // in this conversation or any later one. Hubs and the lines that change
    // with the valley are marked `repeat`, so there is always somewhere to go.
    // A SPINE CHOICE IS NEVER TAKEN AWAY. Everything else retires once it has
    // been answered, which is what makes asking feel like finding something -
    // but the story itself used to retire with them, so asking "Who are you?"
    // first could eat "What is wrong with the tree?" for the rest of the game.
    const open = n.choices.filter((c) => c.spine || c.to === 'leave'
      || (KEEPER[c.to] && KEEPER[c.to].repeat) || !st.asked[c.to]);
    // ONE CHOICE MOVES, THE REST ONLY ASK. Five things to pick from is a
    // menu, and a menu is a thing you audit rather than a person you talk
    // to. So: at most two questions, then the line that gets on with it,
    // then the door - and the one that gets on with it LOOKS different, so
    // you never have to read all four to find out which is which.
    // THE WITCHER'S RULE, which is a good one and which I had backwards.
    // The line that moves the story is gold and it is FIRST; under it, at
    // most two questions, which only tell you more and retire once asked.
    //
    // AND NO DOOR. There is one person in this valley - a row saying "I
    // should go" on every panel is furniture. Following the spine IS the way
    // out: it ends at the line where she hands over the tool and Savi says
    // she will go. Escape and circle still shut the panel, so a mis-wired
    // chain can never trap anyone, but they are not rows on it.
    const spine = open.find((c) => c.spine) || open.find((c) => c.to === 'leave') || open[0];
    const asks = open.filter((c) => c !== spine && c.to !== 'leave').slice(0, 2);
    const list = [spine, ...asks].filter(Boolean);
    t.list = list;
    const cs = list.map((c, i) => `<button class="choice${c === spine ? ' spine' : ''}" data-i="${i}">${c.say}</button>`).join('');
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
      <div class="readnav">
        <button class="navb" id="sayback"${t.i === 0 ? ' disabled' : ''}>&lsaquo; back</button>
        <div class="more">${t.i + 1} / ${t.lines.length}</div>
        <button class="navb" id="sayfwd">${t.i === t.lines.length - 1 ? 'done' : 'next &rsaquo;'}</button>
      </div></div></div>`;
    t.face = who;
  }
  overlay.innerHTML = `<div class="panel">${body}</div>`;
  overlay.classList.add('on');
  // The portrait is kept, not just drawn. It used to be painted once into a
  // dead canvas, so the speaker was a still photograph with a voice; Hades
  // leans its portraits into the words and breathes them between the lines.
  const fc = overlay.querySelector('.face');
  t.faceCtx = fc ? fc.getContext('2d') : null;
  // Which face. A recital line carries its own mood as its third element; the
  // keeper's own conversation takes hers from how much of the tree has come
  // back, so she is weary at the start of the game and moved at the end of it.
  if (t.keeper) {
    // Her own conversation: her face follows the valley, not the legend.
    t.mood = keeperMood(st.count, ROOTS.length, st.ended);
  } else {
    const line = t.lines[t.i];
    t.mood = Array.isArray(line) ? line[2] || null : null;
    // A line of hers that does not ask for a face gets the one the valley has
    // earned - so she is weary while it is dying and moved once it is not.
    if (!t.mood && t.face === 'keeper') t.mood = keeperMood(st.count, ROOTS.length, st.ended);
  }
  t.muralCtx = t.mural ? document.getElementById('mural').getContext('2d') : null;
  // The same two buttons the re-read has, swallowing the press so a tap on
  // BACK is not also the tap that advances.
  for (const [id, d] of [['sayback', -1], ['sayfwd', 1]]) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); stepTalk(d); });
  }
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
  drawPortrait(t.faceCtx, t.face, 0, 0, 220, st.t, k, emph, t.mood);
  if (t.muralCtx) drawMural(t.muralCtx, t.mural, 460, 250, st.t);
}

function closeTalk() {
  const t = st.talking;
  st.talking = null;
  overlay.classList.remove('on');
  overlay.innerHTML = '';
  if (t && t.thought) think(t.thought);
  if (t && t.onDone) t.onDone();
  // She has been told she is the keeper. That is the end of the story, and
  // the titles go over the top of a valley that is still running underneath.
  if (st.blessed && !st.after && !st.credits) rollCredits();
}

/**
 * THE TITLES — and then the valley stays open.
 *
 * Not a scene change and not a screen you are returned from. The game keeps
 * running behind them, she stands still while they go past, and when they
 * are done she is left standing in the place she fixed with nothing asked of
 * her. That last part is the actual reward; the titles are just what plays
 * over it.
 */
function rollCredits() {
  st.credits = true;
  overlay.innerHTML = `<div class="credits"><div class="credroll">
      <h1>SAVI</h1>
      <div class="sub">The Keeper of the Banyan Tree</div>
      <div class="role">Made by</div><p class="name">Vinayak and Surya</p>
      <div class="role">Made for</div><p class="name">the Cozy Fall Game Jam, 2026</p>
      <div class="role">&nbsp;</div>
    </div><div class="credskip">tap, or press any key, to go back to the valley</div></div>`;
  overlay.classList.add('on', 'full');
  sfx.chime();
  const end = () => {
    if (!st.credits) return;
    st.credits = false;
    st.after = true;
    overlay.classList.remove('on', 'full');
    overlay.innerHTML = '';
    toast = { t: 0, text: 'the valley is yours to walk in' };
  };
  creditsEnd = end;
  const box = overlay.querySelector('.credits');
  if (box) box.addEventListener('pointerdown', (e) => { e.stopPropagation(); end(); });
  const roll = overlay.querySelector('.credroll');
  if (roll) roll.addEventListener('animationend', end);
}
let creditsEnd = null;

/** A tap anywhere: only a recital advances that way. A conversation waits. */
function advance() {
  if (st.reading) { stepReading(1); return; }
  stepTalk(1);
}

/** A step through a recital, forwards or back. Back stops at the first line. */
function stepTalk(d) {
  const t = st.talking;
  if (!t || t.keeper) return;
  if (d < 0) {
    if (t.i === 0) { sfx.click(); return; }
    t.i--; paintTalk(); sfx.ui(); return;
  }
  t.i++;
  if (t.i < t.lines.length) { paintTalk(); sfx.ui(); return; }
  closeTalk();
}

// DROP IS GONE. There used to be a Q key, a triangle and a DROP ring that
// stood the broom back against the shrine steps - the only way to have empty
// hands, and it left the broom two thousand units from wherever she happened
// to be standing. Her belt does the same job and keeps the broom.
let toast = null;

/** Standing at a young banyan and reading what is cut into it, full screen. */
function openReading(yt, onDone) {
  st.reading = { yt, i: 0, onDone };
  yt.pending = false;                       // read: it stops being an errand
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
          <div class="readnav">
            <button class="navb" id="readback"${r.i === 0 ? ' disabled' : ''}>&lsaquo; back</button>
            <div class="more">${r.i + 1} / ${r.yt.lines.length}</div>
            <button class="navb" id="readfwd">${r.i === r.yt.lines.length - 1 ? 'done' : 'next &rsaquo;'}</button>
          </div></div>
      </div>
    </div>`;
  overlay.classList.add('on', 'full');
  drawMural(document.getElementById('bigmural').getContext('2d'), r.yt.mural, 880, 470, st.t);
  drawPortrait(document.getElementById('bigface').getContext('2d'), who, 0, 0, 220, st.t, 1);
  // The two buttons. They have to swallow the press: the overlay itself
  // advances on any tap, so a tap on BACK would otherwise go back and then
  // immediately forward again and nothing would ever happen.
  for (const [id, d] of [['readback', -1], ['readfwd', 1]]) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); stepReading(d); });
  }
}
/**
 * A step through a reading, forwards or BACK.
 *
 * It only ever went forwards, one tap at a time, and a line missed was a
 * line gone - the legend is the whole reason the game exists and you could
 * lose a beat of it by tapping twice. Back stops at the first line rather
 * than closing the panel; forward off the end closes it, which is what a tap
 * has always done.
 */
function stepReading(d = 1) {
  const r = st.reading;
  if (!r) return;
  if (d < 0) {
    if (r.i === 0) { sfx.click(); return; }
    r.i--; paintReading(); sfx.ui(); return;
  }
  r.i++;
  if (r.i < r.yt.lines.length) { paintReading(); sfx.ui(); return; }
  think(r.yt.savi);
  st.reading = null;
  overlay.classList.remove('on', 'full');
  overlay.innerHTML = '';
  if (r.onDone) r.onDone();
}

const WHO = { keeper: 'The Old Keeper', savitri: 'Savitri', satyavan: 'Satyavan', yama: 'Yama, Lord of Death', narada: 'Narada' };

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

/**
 * THE OPENING. The projector is cinema.js: it letterboxes, cross-fades, wraps
 * the line along the foot and offers the skip. While it runs the world does not
 * step at all - but the music scheduler and the input edges DO have to be
 * serviced, or the film plays silent and every press is still held down when it
 * ends. That was learned the hard way in the game this engine came from.
 */
function playOpening(after) {
  // A PICTURE BOOK, not a film: it holds each page until she turns it. Three
  // held pictures that go by on a timer are three pictures somebody else
  // decided you had finished looking at.
  startCinema(openingFilm(), () => {
    // BHUPALI, which is what the title screen was already playing. The id is
    // 'bhupali'; 'Hearthfields' is only the piece's NAME, and themeById looks
    // up ids - so `themeById('hearthfields')` quietly returned null, and a
    // null ambient theme makes the scheduler fall through to the inherited
    // engine's generic track. The raga stopped the moment the opening film
    // ended and the whole game played on the wrong music.
    setAmbientTheme(themeById('bhupali'));
    setMusicIntensity(0.4);
    if (after) after();
  }, { manual: true });
}

function begin() {
  if (st.started) return;
  st.started = true;
  document.getElementById('title').classList.remove('on');
  if (!st.sawOpening) { st.sawOpening = true; playOpening(null); }
  // The tap that starts it is the gesture a phone needs: fullscreen, and with
  // it the landscape lock and the screen kept awake.
  if (isTouch() && !isFullscreen()) enterFullscreen().then(checkOrientation);
  checkOrientation();
  try {
    initAudio(); unlockAudio();
    loadSound();
    setMusicEnabled(true); setMusicActive(true); setMusicIntensity(0);
    setAmbientTheme(themeById('bhupali'));
  } catch (e) { /* silence is survivable */ }
}

function main() {
  loadKeys();                 // whatever this player bound last time
  initMenu({ isTouch, padOn: () => pad.on });
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
  // The painted art is twenty-three megabytes, so it is asked for in stages.
  // The keeper is the first face anyone sees, so she comes at boot; the rest
  // follow a few seconds in, once the valley is up and the frames are cheap.
  // Every draw falls back to the drawn art until a file lands, so nothing ever
  // waits on this and nothing is ever blank.
  preload(PORTRAITS.filter((n) => n.startsWith('keeper-')));
  terrain = createTerrain({ W: V.w, H: V.h, classify, roadDist });
  // THE TREES GO IN FIRST. The grass needs to know where they are - the long
  // stuff grows in their shade - and it used to be sown before a single tree
  // existed, so `tallAt` would have answered no everywhere.
  sowScenery();
  sowTallMask();
  grass = createGrass(terrain, {
    W: V.w, H: V.h, x0: 0, y0: 0, tallAt: tallGrassAt,
    blocked: (x, y) => nearRiver(x, y, 30) || inTarn(x, y, 24) || onSolid(x, y)
      || (x > COURT.x && x < COURT.x + COURT.w && y > COURT.y && y < COURT.y + COURT.h),
  });
  water = createWildsWater();
  water.setCalm(2.6);          // a lake this wide has too much shore to lap at
  resize();
  camera.x = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
  camera.y = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
  terrain.warm(camera.x, camera.y, view.w, view.h);
  addEventListener('resize', resize);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (cinemaOn()) { pressCinema(); e.preventDefault(); return; }
    // TAB IS THE BELT. It has to preventDefault whether the belt opens or not,
    // or the browser walks focus off the canvas and the next key goes nowhere.
    if (st.credits) { if (creditsEnd) creditsEnd(); e.preventDefault(); return; }
    // WHICH ACTION THAT KEY IS, asked once. Escape and Enter are not in the
    // table and never will be: they are how a player gets out of a thing.
    const a = actionFor(k);
    const ok = k === 'enter' || a === 'interact' || a === 'jump';   // "yes, that one"
    // THE MENU TAKES EVERY KEY while it is open. One that fell through would
    // walk her about behind a screen the player thinks has stopped the world -
    // and while a key is being REBOUND it has to take them before anything
    // else, or binding `jump` to the space bar would confirm the row instead.
    if (menuOn()) { menuKey(k, a); e.preventDefault(); return; }
    if (a === 'belt') {
      // It has to preventDefault whether the belt opens or not, or the browser
      // walks focus off the canvas with Tab and the next key goes nowhere.
      begin();
      if (st.wheel) closeBelt(false); else openBelt();
      e.preventDefault();
      return;
    }
    if (st.reading) {
      if (a === 'left') { stepReading(-1); e.preventDefault(); return; }
      if (a === 'right') { stepReading(1); e.preventDefault(); return; }
    }
    if (st.talking && !st.talking.keeper) {
      if (a === 'left') { stepTalk(-1); e.preventDefault(); return; }
      if (a === 'right') { stepTalk(1); e.preventDefault(); return; }
    }
    if (st.talking && st.talking.keeper && k === 'escape') { closeTalk(); e.preventDefault(); return; }
    if (st.wheel) {
      if (a === 'left') beltMove(-1);
      else if (a === 'right') beltMove(1);
      else if (k === 'escape' || k === 'q') closeBelt(false);
      else if (ok) closeBelt(true);
      e.preventDefault();
      return;
    }
    // ESCAPE IS THE PAUSE, and it is not in the key table: it is how a player
    // gets out of a thing, including out of a menu they have broken.
    if (k === 'escape') {
      if (!st.talking && !st.reading && !st.watching) { begin(); openMenu(); }
      e.preventDefault();
      return;
    }
    keys.add(k);
    if (st.talking && st.talking.keeper) {
      if (a === 'up') { moveSel(-1); e.preventDefault(); return; }
      if (a === 'down') { moveSel(1); e.preventDefault(); return; }
      if (ok) { pickSel(); e.preventDefault(); return; }
    }
    if (a === 'dash') { begin(); dashWant = true; e.preventDefault(); }
    if (ok) {
      begin();
      if (st.talking || st.reading) advance();
      else if (a === 'jump') jumpWant = BUFFER;
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // The stick lives on ONE pointer, and it is let go by the WINDOW - lifting a
  // finger over the HUD, off the edge of the screen, or into a dialogue never
  // reached a listener on the canvas, and she would keep walking on her own.
  const sc = () => view.scale || 1;

  /** A finger went down. The buttons get first refusal, then the stick. */
  cv.addEventListener('pointerdown', (e) => {
    if (cinemaOn()) { pressCinema(); return; }
    begin();
    if (isTouch() && !isFullscreen()) enterFullscreen().then(checkOrientation);
    const px = e.clientX / sc(), py = e.clientY / sc();
    if (menuOn()) { menuPointer(px, py); return; }
    // The cross on her thought sits over the world, so it is asked before the
    // buttons and before the steering.
    if (thinkX && Math.hypot(px - thinkX.x, py - thinkX.y) < thinkX.r) { dropThought(); return; }

    // The belt, open, owns the whole screen.
    if (st.wheel) {
      for (const b of beltSlots) {
        if (Math.hypot(px - b.x, py - b.y) < b.r) { equipTool(b.id); st.wheel = null; return; }
      }
      closeBelt(false);
      return;
    }
    if (st.talking || st.reading) { advance(); return; }

    const hit = hitButton(px, py);
    if (hit) {
      const b = BTN[hit];
      b.id = e.pointerId === undefined ? -2 : e.pointerId;
      b.on = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not every browser */ }
      if (hit === 'jump') jumpWant = BUFFER;
      else if (hit === 'dash') dashWant = true;
      else if (hit === 'belt') openBelt();
      else if (hit === 'menu') { b.on = false; b.id = -1; openMenu(); }
      return;                                   // 'act' is a HOLD; `holding` reads it
    }

    // A LEFT CLICK IS "USE THE THING IN YOUR HAND", and nothing else. It used
    // to start the movement stick, so a desktop player could drag her about by
    // the canvas - a leftover from the phone controls that nobody used, and
    // one that cannot survive the button meaning `use`. It goes in the held
    // set as a key like any other, because as far as the table is concerned
    // that is what it is.
    if (!isTouch()) {
      if (e.button === 0 || e.button === undefined) keys.add('mouse1');
      return;
    }
    // STEERING IS THE LEFT OF THE SCREEN on a phone. It used to be anywhere
    // that was not a button, so a thumb reaching for DASH and missing sent
    // her walking off a leaf.
    if (px > view.w * 0.62) return;
    if (touch.on) return;                        // a second finger does not steer
    touch.on = true; touch.id = e.pointerId === undefined ? -2 : e.pointerId;
    touch.ox = e.clientX; touch.oy = e.clientY; touch.x = e.clientX; touch.y = e.clientY;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not every browser */ }
  });

  cv.addEventListener('pointermove', (e) => {
    const id = e.pointerId === undefined ? -2 : e.pointerId;
    if (touch.on && id === touch.id) {
      touch.x = e.clientX; touch.y = e.clientY;
      // A DRAGGING STICK. Past the rim the origin comes along, so a thumb
      // that wandered while she walked does not end up pinned at full tilt
      // with no way back to a gentle push.
      const dx = touch.x - touch.ox, dy = touch.y - touch.oy;
      const d = Math.hypot(dx, dy), lim = STICK_MAX * sc();
      if (d > lim) { touch.ox += (dx / d) * (d - lim); touch.oy += (dy / d) * (d - lim); }
      return;
    }
    // A finger that slides well off its button lets go of it, the way a
    // button on any other screen does.
    for (const k of Object.keys(BTN)) {
      const b = BTN[k];
      if (b.id !== id) continue;
      if (Math.hypot(e.clientX / sc() - b.x, e.clientY / sc() - b.y) > b.r * 2) { b.id = -1; b.on = false; }
      return;
    }
  });

  /** And up. Whichever thing that finger belonged to, and nothing else. */
  const letGo = (e) => {
    const id = e && e.pointerId !== undefined ? e.pointerId : -2;
    if (!e || e.button === 0 || e.button === undefined) keys.delete('mouse1');
    if (touch.on && id === touch.id) { touch.on = false; touch.id = -1; return; }
    releaseButton(id);
  };
  addEventListener('pointerup', letGo);
  addEventListener('pointercancel', letGo);
  cv.addEventListener('lostpointercapture', letGo);
  // Tabbing away with a key or a finger down used to leave it down for good.
  const allOff = () => {
    keys.clear();
    touch.on = false; touch.id = -1;
    for (const k of Object.keys(BTN)) { BTN[k].id = -1; BTN[k].on = false; }
  };
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
    if (cinemaOn()) {
      // The world is still while a film plays, but the music and the input
      // edges are not - the scheduler lives at the foot of step() and the
      // press flags are cleared there too.
      updateCinema(dt);
      pollPad();
      setMusicActive(true);
      render();
      return;
    }
    // Nothing moves while the phone is being turned.
    if (st.started && !(rotateEl && rotateEl.classList.contains('on'))) step(dt);
    render();
  };
  requestAnimationFrame(frame);
}

main();
window.savi = {
  st, S, G, V, ROOTS, TREE, FIRE, WOMAN, CAPSTAN, SLUICE_GATE, PLATFORMS, COURSE_LEN, atRiver, riverAt, inWall, broom, YOUNG,
  STONES, inTarn, stonesOn, reachStone, takeStone, hurlStone, get carried() { return carried; },
  BTN, touch, keys, get holding() { return holding; }, layoutButtons, hitButton,
  get parts() { return P; },
  dep: (x, y) => depAt(x, y),
  get thinkX() { return thinkX; },
  LITTER,
  render, resize, begin, say, advance, fraction, gateOpen, gateLift,
  jump() { jumpWant = BUFFER; step(1 / 60); },
  opening() { playOpening(null); },
  isDeep, supported, leafAt, get onLeaf() { return onLeaf; },
  litterAt: (x, y) => litterAt(x, y, { dx: 0, dy: 0, sp: 0 }), breezeAt,
  get terrain() { return terrain; }, get drained() { return drained; }, get drain() { return drain; },
  face: drawPortrait, openReading,
  run(n = 60) { for (let i = 0; i < n; i++) step(1 / 60); },
  walk(x, y, n = 60) { forceMove = { x, y }; for (let i = 0; i < n; i++) step(1 / 60); forceMove = null; },
  dash() { dashWant = true; step(1 / 60); for (let i = 0; i < 20; i++) step(1 / 60); },
  hold(sec = 1) { keys.add('mouse1'); for (let i = 0; i < sec * 60; i++) step(1 / 60); keys.delete('mouse1'); step(1 / 60); },
  sweep(n = 1) { for (let i = 0; i < n; i++) { keys.add('mouse1'); step(1 / 60); keys.delete('mouse1'); for (let j = 0; j < 34; j++) step(1 / 60); } },
  talkTo, KEEPER,
  openMenu, closeMenu, menuOn, menuKey, menuPointer, drawMenu,
};
