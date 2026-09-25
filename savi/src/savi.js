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
import { themeById } from './music-regions.js';
import { ROOTS, CLIMAX } from './savi-story.js';
import { KEEPER, keeperStart, keeperFill } from './savi-keeper.js';
import {
  drawBanyan, drawCanopy, drawRoot, drawSavi, drawWoman, drawFire, drawMural, drawTree, drawRock, drawVeil,
  drawYoungTree, drawBroom, glow, clamp01,
} from './savi-art.js';
import { drawPortrait } from './savi-faces.js';

// --- the valley ---------------------------------------------------------------------------

const V = { w: 5200, h: 3400 };
const TREE = { x: 2600, y: 1560 };
const WOMAN = { x: 2456, y: 1790 };
const FIRE = { x: 2556, y: 1812 };
const START = { x: 2600, y: 3120 };

// Each root reaches out to its own trouble, and each is a different material.
const PLACES = {
  choice: { at: { x: 1160, y: 2340 }, patch: { x: 880, y: 2060, w: 620, h: 540 }, mat: 'leaves' },
  fall: { at: { x: 4020, y: 2190 }, patch: { x: 3540, y: 1860, w: 900, h: 660 }, mat: 'water' },
  pursuit: { at: { x: 760, y: 1120 }, patch: { x: 500, y: 880, w: 620, h: 520 }, mat: 'thorn' },
  steps: { at: { x: 4180, y: 760 }, patch: { x: 3840, y: 520, w: 720, h: 520 }, mat: 'snow' },
  boon: { at: { x: 2600, y: 420 }, patch: { x: 2250, y: 220, w: 700, h: 440 }, mat: 'ash' },
};
ROOTS.forEach((r, i) => Object.assign(r, PLACES[r.id], { seed: i * 5 + 3, order: i }));

// The pond, as a blob rather than a box: an ellipse pushed about by noise.
const POND = { x: 4010, y: 2190, rx: 470, ry: 330 };
// What holds it in. Break this and it runs out east, off the drowned root.
const DAM = { x: 4470, y: 2240, r: 120 };

const ROAD = [[2600, 3340], [2600, 2900], [2560, 2500], [2600, 2100], [2600, 1820]];
const SPURS = [
  [[2420, 2000], [2000, 2180], [1500, 2300], [1160, 2340]],
  [[2820, 1900], [3300, 2050], [3700, 2150], [4020, 2190]],
  [[2380, 1480], [1800, 1320], [1200, 1180], [760, 1120]],
  [[2820, 1420], [3400, 1120], [3900, 880], [4180, 760]],
  [[2600, 1320], [2600, 960], [2600, 600], [2600, 420]],
];
const SHELTERS = [{ x: 2600, y: 1080, r: 110 }, { x: 2600, y: 700, r: 110 }];
// The broom is a THING, left on the road out to the first root. She picks it
// up, and she can put it down again anywhere she likes.
const broom = { x: 2492, y: 3010, held: false };
/** Young banyans, one per freed root, each with its beat carved into it. */
const YOUNG = [];

// --- what the ground is made of --------------------------------------------------------------

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
  const k = pondK(x, y);
  if (k < 0.86) return TT.WATER;
  if (k < 1.0) return TT.SHALLOW;
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
  put({ x: 2280, y: 2380, w: 660, h: 560 }, MAT.leaves, 1.0, 200);   // the drift over the road home
  for (const r of ROOTS) if (r.mat !== 'water') put(r.patch, MAT[r.mat], 1.0, r.mat === 'thorn' ? 90 : 190);
  G.cv = document.createElement('canvas');
  G.cv.width = G.w; G.cv.height = G.h;
  G.cx = G.cv.getContext('2d');
  G.img = G.cx.createImageData(G.w, G.h);
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
function fraction(r) {
  const p = r.patch, m = MAT[r.mat];
  const i0 = Math.max(0, (p.x / CELL) | 0), i1 = Math.min(G.w - 1, ((p.x + p.w) / CELL) | 0);
  const j0 = Math.max(0, (p.y / CELL) | 0), j1 = Math.min(G.h - 1, ((p.y + p.h) / CELL) | 0);
  let t = 0, o = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== m || G.orig[q] < 0.5) continue;
      t++;
      if (G.dep[q] < 0.22) o++;
    }
  }
  return t ? o / t : 1;
}

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
    else { c.beginPath(); c.ellipse(0, 0, p.s * 0.6, p.s * 0.36, 0, 0, TAU); c.fill(); }
    c.restore();
  }
  c.globalAlpha = 1;
}

// --- Savi -------------------------------------------------------------------------------------

const S = {
  x: START.x, y: START.y, r: 12, vx: 0, vy: 0, face: -Math.PI / 2,
  phase: 0, speed: 0, act: 0, actA: 0, dead: false, lastStep: 0, dashing: false,
};
const st = {
  t: 0, woken: {}, count: 0, step: 0, ember: 0, hasEmber: false,
  bloom: 0, bloomK: 0, warmth: 0, ended: false, started: false,
  talking: null, nearWoman: false, lastBeat: '', asked: {}, told: 0, prompt: '',
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
const pad = { on: false, mx: 0, my: 0, held: false, pressed: false, dropHeld: false, dropPressed: false };
function pollPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of list) if (g && g.connected) { gp = g; break; }
  pad.on = !!gp;
  if (!gp) { pad.mx = 0; pad.my = 0; pad.held = false; pad.pressed = false; return; }
  const dead = (v) => (Math.abs(v) < 0.24 ? 0 : (v - Math.sign(v) * 0.24) / 0.76);
  let mx = dead(gp.axes[0] || 0), my = dead(gp.axes[1] || 0);
  const b = gp.buttons;
  const down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.4));
  if (down(12)) my = -1;
  if (down(13)) my = 1;
  if (down(14)) mx = -1;
  if (down(15)) mx = 1;
  pad.mx = mx; pad.my = my;
  const act = down(0) || down(2) || down(5) || down(7);
  pad.dropPressed = down(1) && !pad.dropHeld;
  pad.dropHeld = down(1);
  pad.pressed = act && !pad.held;
  pad.held = act;
}
let forceMove = null, holding = false, wasHolding = false, tapDone = false, actT = 0;
let damBroken = false, drain = 0;
const ring = { x: 0, y: 0, r: 46 };
const drop = { x: 0, y: 0, r: 34, on: false };

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

const SWEEP_RATE = 4.2;            // depth a second at the middle of the sweep
let sweepT = 0;                    // where she is in the stroke
let damPull = 0;

/** Held down: whatever is in front of her, for as long as she keeps at it. */
function actHold(dt) {
  if (st.talking || st.reading) { sweepT = 0; S.act = 0; return; }
  // A press near something to take or to read is that, not a sweep.
  if (tapDone) return;
  const near = Math.hypot(S.x - DAM.x, S.y - DAM.y) < DAM.r + 70;

  // The dam: a long pull, not three shoves.
  if (!damBroken && near) {
    S.act = 1; S.sweep = Math.sin(st.t * 9) * 0.5;
    damPull += dt;
    S.x -= Math.cos(S.face) * 26 * dt;                 // she leans back into it
    S.y -= Math.sin(S.face) * 26 * dt;
    if (Math.random() < dt * 22) {
      water.splash(DAM.x + rand(-40, 40), DAM.y + rand(-60, 60), 90, 1.1);
      spark(DAM.x + rand(-50, 50), DAM.y + rand(-60, 60), 1, { col: ['#6f5836', '#8a6f45'], sp0: 20, sp1: 90, l0: 0.3, l1: 0.7 });
    }
    if (damPull > 2.4) {
      damBroken = true;
      sfx.bossDown();
      water.splash(DAM.x, DAM.y, 360, 4.2);
      spark(DAM.x, DAM.y, 90, { col: ['#8fbcc8', '#c6e2ea', '#6f9aa8'], sp0: 120, sp1: 460, l0: 0.8, l1: 1.9, s0: 4, s1: 9, kind: 'drop' });
      rumble(0.7, 0.5, 260);
    }
    return;
  }
  damPull = 0;

  const a = S.face, fx = Math.cos(a), fy = Math.sin(a);
  const here = depAt(S.x, S.y + 6), there = depAt(S.x + fx * 54, S.y + fy * 54 + 6);
  const m = there.d > here.d ? there.m : (here.m || there.m);
  if (!m || (here.d < 0.1 && there.d < 0.1)) { sweepT = 0; S.act = 0; return; }

  const fire = (m === MAT.thorn || m === MAT.ash);
  if (fire && !(st.hasEmber && st.ember > 0.02)) {
    if (actT <= 0) {
      actT = 1.2;
      say([['keeper', 'This will not move for a broom. The old woman keeps a fire — take a coal from it and hold it out.']], null);
    }
    return;
  }
  if (!fire && !broom.held) {
    if (actT <= 0) {
      actT = 1.2;
      say([['keeper', 'Her hands are too small for this. The broom — where did she leave the broom?']], null);
    }
    return;
  }

  S.act = 1;
  if (fire) {
    // The coal held steady. No stroke - a held hand, and the thorn draws back.
    S.sweep = Math.sin(st.t * 3) * 0.12;
    st.ember = Math.max(0, st.ember - dt * 0.085);
    carve(S.x + fx * 34, S.y + fy * 34 + 6, a, 124, 1.0, dt * 3.0, m);
    if (Math.random() < dt * 34) {
      spark(S.x + fx * 52 + rand(-26, 26), S.y + fy * 52 + rand(-26, 26), 1,
        { col: ['#ffb35e', '#ff7a2e', '#ffd9a0'], sp0: 10, sp1: 70, l0: 0.5, l1: 1.3, s0: 3, s1: 6, kind: 'ember', lift: 30 });
    }
    if (Math.random() < dt * 4) sfx.hiss();
    return;
  }

  // The stroke: the broom swings across her, and the cone swings with it.
  sweepT += dt * 4.4;
  S.sweep = Math.sin(sweepT);
  const swing = a + S.sweep * 0.72;
  const took = carve(S.x + Math.cos(swing) * 40, S.y + Math.sin(swing) * 40 + 6, swing, 116, 1.15, dt * SWEEP_RATE, m);
  // A puff at the broom head, thrown the way the stroke is going.
  const bx = S.x + Math.cos(swing) * 64, by = S.y + Math.sin(swing) * 64 + 6;
  if (took > 0.001 && Math.random() < dt * 48) {
    const out = swing + Math.sign(Math.cos(sweepT)) * 0.9;
    spark(bx, by, 2, m === MAT.snow
      ? { col: ['#ffffff', '#e4ecf4', '#cfdae6'], angle: out, arc: 0.9, sp0: 90, sp1: 230, l0: 0.4, l1: 1, s0: 3, s1: 6, lift: 44 }
      : { col: MATS[1].col, angle: out, arc: 1.0, sp0: 120, sp1: 320, l0: 0.7, l1: 1.6, s0: 5, s1: 11, lift: 40, drag: 1.3 });
  }
  // One rustle per stroke, at the end of the swing.
  const half = Math.floor(sweepT / Math.PI);
  if (half !== S.lastSweep) {
    S.lastSweep = half;
    if (took > 0.0005 && (half & 1)) { m === MAT.snow ? sfx.clack(1.6) : sfx.hiss(); rumble(0.16, 0.1, 60); }
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
      G.base[q] = Math.min(G.base[q], Math.max(m === MAT.leaves ? LITTER : 0, G.dep[q] + 0.05));
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
  if (pad.pressed) { begin(); if (st.talking) advance(); }
  if (pad.dropPressed) dropBroom();
  holding = keys.has(' ') || keys.has('e') || touch.ring || pad.held;
  if (actT > 0) actT -= dt;
  if (S.act > 0) S.act -= dt;
  // The press that TAKES or READS happens on the way down, before any sweeping.
  if (holding && !wasHolding) {
    tapDone = false;
    if (!broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74) {
      broom.held = true; tapDone = true; sfx.pickup();
    } else {
      const yt = YOUNG.find((q) => q.grow >= 1 && Math.hypot(S.x - q.x, S.y - q.y) < 130);
      if (yt) { openReading(yt); tapDone = true; }
    }
  }
  if (!holding) tapDone = false;
  wasHolding = holding;
  if (holding) actHold(dt); else { S.act = 0; sweepT = 0; damPull = 0; }

  // The keeper. Tracked BEFORE the early return below, or the flag never gets
  // set while she is talking and the conversation reopens the instant it ends.
  const nearW = Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 110;
  if (nearW && !st.nearWoman && !st.talking && !st.reading) talkTo(keeperStart(st.count, ROOTS.length));
  st.nearWoman = nearW;

  if (st.talking || st.reading) { stepParticles(dt); return; }

  const mv = moveVector();
  const under = depAt(S.x, S.y + 6);
  const drag = under.m ? MATS[under.m].drag * Math.min(1, under.d) : 0;
  const wet = water.wetAt(S.x, S.y + 6) ? 0.34 : 0;
  const sp = 196 * (1 - Math.max(drag, wet)) * (S.act > 0 ? 0.42 : 1);
  S.vx = mv.x * sp; S.vy = mv.y * sp;

  let nx = S.x + S.vx * dt, ny = S.y + S.vy * dt;
  const ah = depAt(nx, ny + 6);
  if (ah.m === MAT.thorn && ah.d > 0.6) { nx = S.x; ny = S.y; }
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

  S.speed = Math.hypot(S.vx, S.vy);
  if (S.speed > 14) {
    S.face = Math.atan2(S.vy, S.vx);
    S.phase += dt * (6 + S.speed * 0.024);
    const k = Math.floor(S.phase / Math.PI);
    if (k !== S.lastStep) {
      S.lastStep = k;
      if (water.wetAt(S.x, S.y + 6)) {
        sfx.splash();
        spark(S.x, S.y + 6, 5, { col: ['#bfe0e8'], sp0: 30, sp1: 120, l0: 0.3, l1: 0.7, s0: 2, s1: 5, kind: 'drop', lift: 44 });
      } else if (under.d > 0.3 && under.m === MAT.leaves) {
        // No sound for this. The leaves move, and that is the whole of it - a
        // tick on every footfall through a valley knee-deep in them was a
        // metronome, not an atmosphere. The broom still rustles.
        spark(S.x, S.y + 6, 3, { col: MATS[1].col, sp0: 20, sp1: 80, l0: 0.5, l1: 1.1, s0: 4, s1: 8, lift: 26 });
      } else if (under.d > 0.5 && under.m === MAT.snow && (k & 1)) sfx.clack(1.4);
    }
  }

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
  if (nearBroom) st.prompt = 'take the broom';
  else if (nearYoung) st.prompt = `read ${nearYoung.name}`;
  else if (broom.held) st.prompt = 'hold to sweep · Q to put the broom down';

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

  if (damBroken && drain < 1) {
    drain = Math.min(1, drain + dt / 7);
    if (Math.random() < 0.5) water.splash(DAM.x + rand(-40, 40), DAM.y + rand(-60, 60), 80, 1.3);
  }

  // Any root she frees wakes, whichever it is and whenever she gets to it.
  // Work is never wasted and nothing has to be done in an order.
  for (const r of ROOTS) {
    if (st.woken[r.id]) continue;
    const done = r.mat === 'water' ? drain >= 1 : fraction(r) > 0.52;
    if (done) wake(r);
  }

  if (st.count >= ROOTS.length && !st.ended && Math.hypot(S.x - TREE.x, S.y - TREE.y) < 340) {
    st.ended = true;
    setAmbientTheme(themeById('durga'));
    say(CLIMAX, () => { st.bloom = 1; }, 'bloom');
  }

  // The old woman speaks when she walks up, and not again until she walks away.
  const near = Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 110;
  if (near && !st.nearWoman && !st.talking) {
    talkTo(keeperStart(st.count, ROOTS.length, st.metKeeper));
    st.metKeeper = true;
  }
  st.nearWoman = near;

  st.bloomK += (st.bloom - st.bloomK) * Math.min(1, dt * 0.6);
  st.warmth = clamp01(0.2 + (st.count / ROOTS.length) * 0.58 + st.bloomK * 0.22);

  const tx = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
  const ty = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
  const f = 1 - Math.exp(-5 * dt);
  camera.x += (tx - camera.x) * f;
  camera.y += (ty - camera.y) * f;
}

function wake(r) {
  st.woken[r.id] = true;
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
  const d = G.img.data;
  for (let j = 0, q = 0, p = 0; j < G.h; j++) {
    for (let i = 0; i < G.w; i++, q++, p += 4) {
      const m = G.mat[q], dep = G.dep[q];
      if (!m || dep < 0.06) { d[p + 3] = 0; continue; }
      const col = MATS[m].col[(i * 5 + j * 3) & 3];
      const lit = 0.8 + vn(i * 0.7, j * 0.9) * 0.36;
      d[p] = Math.min(255, parseInt(col.slice(1, 3), 16) * lit);
      d[p + 1] = Math.min(255, parseInt(col.slice(3, 5), 16) * lit);
      d[p + 2] = Math.min(255, parseInt(col.slice(5, 7), 16) * lit);
      d[p + 3] = Math.min(250, 40 + dep * 215);
    }
  }
  G.cx.putImageData(G.img, 0, 0);
  c.drawImage(G.cv, 0, 0, V.w, V.h);

  // Loose leaves over the mass, so it reads as leaves and not as paint.
  const i0 = Math.max(0, (camera.x / CELL) | 0), i1 = Math.min(G.w - 1, ((camera.x + view.w) / CELL) | 0);
  const j0 = Math.max(0, (camera.y / CELL) | 0), j1 = Math.min(G.h - 1, ((camera.y + view.h) / CELL) | 0);
  for (let j = j0; j <= j1; j += 2) {
    for (let i = i0; i <= i1; i += 2) {
      const q = j * G.w + i, m = G.mat[q];
      if (!m || G.dep[q] < 0.3) continue;
      const h = vn(i * 3.1, j * 7.7);
      c.save();
      c.translate(i * CELL + h * CELL, j * CELL + vn(i * 5.3, j * 2.9) * CELL);
      c.rotate(h * TAU);
      c.globalAlpha = Math.min(1, G.dep[q]);
      if (m === MAT.thorn) {
        c.strokeStyle = '#120d18'; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(-7, 4); c.lineTo(0, -9); c.lineTo(7, 3); c.stroke();
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

const SCENERY = [];
function sowScenery() {
  for (let i = 0; i < 760; i++) {
    const x = rand(60, V.w - 60), y = rand(60, V.h - 60);
    if (pondK(x, y) < 1.15 || roadDist(x, y) < 72) continue;
    if (Math.hypot(x - TREE.x, y - TREE.y) < 500) continue;
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
  water.draw(ctx);

  for (const r of ROOTS) drawRoot(ctx, TREE, r, !!st.woken[r.id], st.t, r === current());

  if (!damBroken) {
    ctx.save();
    ctx.translate(DAM.x, DAM.y);
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.rotate((i * 0.83) % 1.6 - 0.8 + damPull * 0.3);
      ctx.fillStyle = i % 2 ? '#4b3a26' : '#3a2c1d';
      ctx.fillRect(-58, i * 9 - 42, 116, 11);
      ctx.restore();
    }
    ctx.restore();
  }

  S.broom = broom.held;
  if (!broom.held) drawBroom(ctx, broom, st.t);
  for (const yt of YOUNG) drawYoungTree(ctx, yt, st.t);

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

  const n = 46 + Math.round(st.bloomK * 60);
  for (let i = 0; i < n; i++) {
    const sp = 0.4 + ((i * 37) % 13) / 13;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = MATS[1].col[i & 3];
    ctx.save();
    ctx.translate(((i * 613 + st.t * 30 * sp) % (view.w + 260)) + camera.x - 130,
      ((i * 971 + st.t * 21 * sp) % (view.h + 260)) + camera.y - 130);
    ctx.rotate(st.t * sp + i);
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  const vig = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.32, view.w / 2, view.h / 2, view.w * 0.74);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(20,28,48,${0.52 - st.warmth * 0.3})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, view.w, view.h);
  drawHud();
}

function drawHud() {
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(240,226,203,0.8)';
  ctx.fillText(`${st.count} of ${ROOTS.length} roots awake`, 22, 30);
  const cur = current();
  if (cur && !st.ended) {
    ctx.fillStyle = 'rgba(255,179,94,0.92)';
    ctx.fillText(`the tree is reaching — ${cur.hint}`, 22, 50);
  }
  if (st.hasEmber) {
    ctx.fillStyle = 'rgba(255,170,80,0.28)';
    ctx.fillRect(22, 60, 104, 7);
    ctx.fillStyle = `rgba(255,${(150 + st.ember * 70) | 0},${(60 + st.ember * 70) | 0},0.95)`;
    ctx.fillRect(22, 60, 104 * st.ember, 7);
  }

  if (st.prompt) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,214,170,0.92)';
    ctx.fillText(st.prompt, view.w / 2, view.h - 54);
    ctx.textAlign = 'left';
  }
  if (broom.held) {
    ctx.fillStyle = 'rgba(200,160,90,0.9)';
    ctx.fillText('broom', 22, 82);
  }

  // Putting it down, for a thumb and for a pad.
  drop.on = broom.held;
  if (drop.on) {
    drop.x = view.w - 86; drop.y = view.h - 176;
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

  ring.x = view.w - 86; ring.y = view.h - 86;
  ctx.beginPath(); ctx.arc(ring.x, ring.y, 40, 0, TAU);
  ctx.fillStyle = holding ? 'rgba(255,179,94,0.45)' : 'rgba(255,179,94,0.24)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,190,120,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,224,186,0.95)';
  const label = st.prompt.startsWith('take') ? 'TAKE'
    : st.prompt.startsWith('read') ? 'READ'
      : st.hasEmber && st.ember > 0.08 ? 'HOLD' : 'SWEEP';
  ctx.fillText(label, ring.x, ring.y + 4);
  ctx.fillStyle = `rgba(240,226,203,${st.t < 16 ? 0.5 : 0.26})`;
  ctx.fillText(pad.on ? 'left stick to walk · HOLD cross or R2 to sweep' : 'HOLD space, or the ring — and keep holding', view.w / 2, view.h - 22);
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
  if (t.mural) drawMural(document.getElementById('mural').getContext('2d'), t.mural, 460, 250, st.t);
  const fc = overlay.querySelector('.face');
  if (fc) drawPortrait(fc.getContext('2d'), t.face, 0, 0, 220, st.t, 1);
  if (t.keeper) {
    overlay.querySelectorAll('.choice').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        sfx.ui();
        const to = st.talking.list[+b.dataset.i].to;
        if (to === 'leave') closeTalk();
        else { st.talking.keeper = to; paintTalk(); }
      });
    });
  }
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

/** Put it down where she stands. She can always pick it up again. */
function dropBroom() {
  if (!broom.held) return;
  broom.held = false;
  broom.x = S.x + Math.cos(S.face) * 26;
  broom.y = S.y + 10;
  sfx.ui();
}

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
  initFullscreen({ onChange: checkOrientation });
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', checkOrientation);
  }
  // Whatever a browser does or does not report, the prompt can never be what is
  // left holding the game.
  setInterval(checkOrientation, 500);

  world.player = S;                 // grass.js and wilds-water.js both follow her
  world.overworld = true;
  world.enemies.length = 0;
  gfx.epoch = 0;

  buildGround();
  terrain = createTerrain({ W: V.w, H: V.h, classify, roadDist });
  grass = createGrass(terrain, { W: V.w, H: V.h, x0: 0, y0: 0, blocked: (x, y) => pondK(x, y) < 1.05 });
  water = createWildsWater();
  sowScenery();
  resize();
  camera.x = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
  camera.y = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
  terrain.warm(camera.x, camera.y, view.w, view.h);
  addEventListener('resize', resize);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === 'q') dropBroom();
    if (k === ' ' || k === 'enter' || k === 'e') {
      begin();
      if (st.talking) advance();
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
    if (st.talking) { advance(); return; }
    const sc = view.scale || 1;
    if (drop.on && Math.hypot(e.clientX / sc - drop.x, e.clientY / sc - drop.y) < drop.r) { dropBroom(); return; }
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
  st, S, G, V, ROOTS, TREE, FIRE, WOMAN, DAM, broom, YOUNG, render, resize, begin, say, advance, fraction,
  face: drawPortrait, openReading,
  run(n = 60) { for (let i = 0; i < n; i++) step(1 / 60); },
  walk(x, y, n = 60) { forceMove = { x, y }; for (let i = 0; i < n; i++) step(1 / 60); forceMove = null; },
  hold(sec = 1) { keys.add(' '); for (let i = 0; i < sec * 60; i++) step(1 / 60); keys.delete(' '); step(1 / 60); },
  talkTo, KEEPER,
};
