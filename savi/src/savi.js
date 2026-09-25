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
import { themeById } from './music-regions.js';
import { ROOTS, CLIMAX, keeperLines } from './savi-story.js';
import {
  drawBanyan, drawCanopy, drawRoot, drawSavi, drawWoman, drawFire, drawMural, drawTree, drawRock, drawVeil, glow, clamp01,
} from './savi-art.js';

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
  talking: null, nearWoman: false,
};

let ctx = null, cv = null, terrain = null, grass = null, water = null, overlay = null;
const keys = new Set();
const touch = { on: false, ox: 0, oy: 0, x: 0, y: 0 };
let forceMove = null, pressAct = false, actT = 0;
let damHits = 0, damBroken = false, drain = 0;
const ring = { x: 0, y: 0, r: 46 };

const current = () => (st.step < ROOTS.length ? ROOTS[st.step] : null);
/** The window grass.js works in: what is on screen, and a margin. */
const win = () => ({ x: camera.x, y: camera.y, w: view.w, h: view.h });

// --- the one button ------------------------------------------------------------------------------

const ACT_COOL = 0.32;

function doAct() {
  if (actT > 0 || st.talking) return;
  const a = S.face, fx = Math.cos(a), fy = Math.sin(a);
  const hx = S.x + fx * 54, hy = S.y + fy * 54 + 6;
  const here = depAt(S.x, S.y + 6), there = depAt(hx, hy);
  const m = there.d > here.d ? there.m : (here.m || there.m);

  if (!damBroken && Math.hypot(hx - DAM.x, hy - DAM.y) < DAM.r + 50) {
    actT = ACT_COOL; S.act = 0.34; S.actA = a;
    damHits++;
    sfx.thud();
    water.splash(DAM.x, DAM.y, 160, 2.4);
    spark(DAM.x, DAM.y, 24, { col: ['#6f5836', '#4e3c24', '#8a6f45'], angle: a, arc: 2.2, sp0: 60, sp1: 280, l0: 0.4, l1: 0.9 });
    if (damHits >= 3) {
      damBroken = true;
      sfx.bossDown();
      water.splash(DAM.x, DAM.y, 340, 4);
      spark(DAM.x, DAM.y, 80, { col: ['#8fbcc8', '#c6e2ea', '#6f9aa8'], sp0: 120, sp1: 440, l0: 0.8, l1: 1.8, s0: 4, s1: 9, kind: 'drop' });
    }
    return;
  }

  if (!m || (here.d < 0.12 && there.d < 0.12)) {
    actT = 0.45; S.act = 0.28; S.actA = a;
    sfx.ui();
    if (water.wetAt(S.x, S.y + 6)) water.splash(S.x, S.y + 6, 100, 1.2);
    spark(S.x, S.y - 12, 8, { col: ['#e8d9bd'], sp0: 20, sp1: 60, l0: 0.5, l1: 1.2, s0: 2, s1: 3, lift: 34 });
    return;
  }

  const fire = (m === MAT.thorn || m === MAT.ash);
  if (fire && !(st.hasEmber && st.ember > 0.08)) {
    actT = 0.5;
    say(['This will not move for hands. It wants fire — and the old woman keeps a fire.'], null);
    return;
  }

  actT = ACT_COOL; S.act = 0.36; S.actA = a;
  const R = fire ? 112 : 124, ARC = fire ? 1.0 : 1.3;
  const took = carve(S.x, S.y + 6, a, R, ARC, fire ? 1.25 : 1.15, m);
  if (fire) st.ember = Math.max(0, st.ember - 0.05);

  if (m === MAT.leaves) {
    sfx.hiss();
    spark(S.x + fx * 42, S.y + fy * 42, 18 + ((took * 26) | 0), {
      col: MATS[1].col, angle: a, arc: ARC * 1.6, sp0: 110, sp1: 360, l0: 0.7, l1: 1.7, s0: 5, s1: 12, lift: 44, drag: 1.3,
    });
  } else if (m === MAT.snow) {
    sfx.clack(1.9);
    spark(S.x + fx * 42, S.y + fy * 42, 16 + ((took * 20) | 0), {
      col: ['#ffffff', '#e4ecf4', '#cfdae6'], angle: a, arc: ARC * 1.4, sp0: 80, sp1: 260, l0: 0.5, l1: 1.1, s0: 3, s1: 7, lift: 54,
    });
  } else {
    sfx.explode();
    spark(S.x + fx * 46, S.y + fy * 46, 22 + ((took * 24) | 0), {
      col: ['#ffb35e', '#ff7a2e', '#ffd9a0'], angle: a, arc: ARC * 1.3, sp0: 60, sp1: 240, l0: 0.5, l1: 1.3, s0: 3, s1: 7, kind: 'ember', drag: 1.1,
    });
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
      const t = Math.min(G.dep[q], 0.7 + (1 - d / r) * (1 - da / arc) * power);
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
  const m = Math.hypot(mx, my);
  return m > 1 ? { x: mx / m, y: my / m } : { x: mx, y: my };
}

function step(dt) {
  st.t += dt;
  world.runTime = st.t;
  if (actT > 0) actT -= dt;
  if (S.act > 0) S.act -= dt;
  if (pressAct) { pressAct = false; doAct(); }
  if (st.talking) { stepParticles(dt); return; }

  const mv = moveVector();
  const under = depAt(S.x, S.y + 6);
  const drag = under.m ? MATS[under.m].drag * Math.min(1, under.d) : 0;
  const wet = water.wetAt(S.x, S.y + 6) ? 0.34 : 0;
  const sp = 196 * (1 - Math.max(drag, wet)) * (S.act > 0 ? 0.3 : 1);
  S.vx = mv.x * sp; S.vy = mv.y * sp;

  let nx = S.x + S.vx * dt, ny = S.y + S.vy * dt;
  const ah = depAt(nx, ny + 6);
  if (ah.m === MAT.thorn && ah.d > 0.6) { nx = S.x; ny = S.y; }
  // The cold stands over every root the valley is not ready for.
  const cur = current();
  for (const r of ROOTS) {
    if (st.woken[r.id] || r === cur) continue;
    const d = Math.hypot(nx - r.at.x, ny - r.at.y);
    if (d < 300) {
      nx = S.x - (r.at.x - S.x) * ((300 - d) / 300) * 0.06;
      ny = S.y - (r.at.y - S.y) * ((300 - d) / 300) * 0.06;
      if (Math.random() < 0.25) spark(nx + rand(-34, 34), ny + rand(-34, 34), 1, { col: ['#a8c0d8'], sp0: 5, sp1: 25, l0: 0.6, l1: 1.3, s0: 3, s1: 6, lift: 18 });
    }
  }
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
        sfx.hiss();
        spark(S.x, S.y + 6, 3, { col: MATS[1].col, sp0: 20, sp1: 80, l0: 0.5, l1: 1.1, s0: 4, s1: 8, lift: 26 });
      } else if (under.d > 0.3 && under.m === MAT.snow) sfx.clack(1.7);
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
  } else if (Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 80) {
    st.hasEmber = true; st.ember = 1;
    sfx.boon();
    say(['You lift a coal out of her fire. It sits in your palm and does not burn you.'], null);
  }

  if (damBroken && drain < 1) {
    drain = Math.min(1, drain + dt / 7);
    if (Math.random() < 0.5) water.splash(DAM.x + rand(-40, 40), DAM.y + rand(-60, 60), 80, 1.3);
  }

  if (cur && !st.woken[cur.id]) {
    const done = cur.mat === 'water' ? drain >= 1 : fraction(cur) > 0.52;
    if (done) wake(cur);
  }

  if (st.count >= ROOTS.length && !st.ended && Math.hypot(S.x - TREE.x, S.y - TREE.y) < 340) {
    st.ended = true;
    setAmbientTheme(themeById('durga'));
    say(CLIMAX, () => { st.bloom = 1; }, 'bloom');
  }

  // The old woman speaks when she walks up, and not again until she walks away.
  const near = Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 96;
  if (near && !st.nearWoman) say(keeperLines(st.count, ROOTS.length), null);
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
  sfx.chime(); sfx.boon();
  spark(r.at.x, r.at.y, 90, { col: ['#ffb35e', '#ffd9a0', '#ff8a3c'], sp0: 40, sp1: 320, l0: 1, l1: 2.4, s0: 3, s1: 8, kind: 'ember' });
  say(r.lines, null, r.mural);
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

  for (const r of ROOTS) drawRoot(ctx, TREE, r, !!st.woken[r.id], st.t);

  if (!damBroken) {
    ctx.save();
    ctx.translate(DAM.x, DAM.y);
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.rotate((i * 0.83) % 1.6 - 0.8 + damHits * 0.14);
      ctx.fillStyle = i % 2 ? '#4b3a26' : '#3a2c1d';
      ctx.fillRect(-58, i * 9 - 42, 116, 11);
      ctx.restore();
    }
    ctx.restore();
  }

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
  for (const r of ROOTS) if (!st.woken[r.id] && r !== current()) drawVeil(ctx, r.at, st.t);

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
    ctx.fillStyle = 'rgba(255,179,94,0.85)';
    ctx.fillText(cur.hint, 22, 50);
  }
  if (st.hasEmber) {
    ctx.fillStyle = 'rgba(255,170,80,0.28)';
    ctx.fillRect(22, 60, 104, 7);
    ctx.fillStyle = `rgba(255,${(150 + st.ember * 70) | 0},${(60 + st.ember * 70) | 0},0.95)`;
    ctx.fillRect(22, 60, 104 * st.ember, 7);
  }

  ring.x = view.w - 86; ring.y = view.h - 86;
  ctx.beginPath(); ctx.arc(ring.x, ring.y, 40, 0, TAU);
  ctx.fillStyle = actT > 0 ? 'rgba(255,179,94,0.12)' : 'rgba(255,179,94,0.24)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,190,120,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,224,186,0.95)';
  ctx.fillText(st.hasEmber && st.ember > 0.08 ? 'BURN' : 'CLEAR', ring.x, ring.y + 4);
  ctx.fillStyle = `rgba(240,226,203,${st.t < 16 ? 0.5 : 0.26})`;
  ctx.fillText('space, or the ring — clear what is in the way', view.w / 2, view.h - 22);
  ctx.textAlign = 'left';
}

// --- what she is told ------------------------------------------------------------------------------

function say(lines, onDone, mural) {
  st.talking = { lines: lines.slice(), i: 0, onDone, mural };
  paintTalk();
}
function paintTalk() {
  const t = st.talking;
  if (!t) return;
  const m = t.mural ? '<canvas id="mural" width="460" height="250"></canvas>' : '';
  overlay.innerHTML = `<div class="panel">${m}<p>${t.lines[t.i]}</p><div class="more">tap to go on</div></div>`;
  overlay.classList.add('on');
  if (t.mural) drawMural(document.getElementById('mural').getContext('2d'), t.mural, 460, 250, st.t);
}
function advance() {
  const t = st.talking;
  if (!t) return;
  t.i++;
  if (t.i < t.lines.length) { paintTalk(); sfx.ui(); return; }
  st.talking = null;
  overlay.classList.remove('on');
  overlay.innerHTML = '';
  if (t.onDone) t.onDone();
}

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
}

function begin() {
  if (st.started) return;
  st.started = true;
  document.getElementById('title').classList.remove('on');
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
    if (k === ' ' || k === 'enter' || k === 'e') {
      begin();
      if (st.talking) advance(); else pressAct = true;
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  cv.addEventListener('pointerdown', (e) => {
    begin();
    if (st.talking) { advance(); return; }
    const sc = view.scale || 1;
    if (Math.hypot(e.clientX / sc - ring.x, e.clientY / sc - ring.y) < ring.r) { pressAct = true; return; }
    touch.on = true; touch.ox = e.clientX; touch.oy = e.clientY; touch.x = e.clientX; touch.y = e.clientY;
  });
  cv.addEventListener('pointermove', (e) => { if (touch.on) { touch.x = e.clientX; touch.y = e.clientY; } });
  const up = () => { touch.on = false; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  overlay.addEventListener('pointerdown', () => { begin(); advance(); });
  document.getElementById('title').addEventListener('pointerdown', begin);

  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) resize();
    if (st.started) step(dt);
    render();
  };
  requestAnimationFrame(frame);
}

main();
window.savi = {
  st, S, G, V, ROOTS, TREE, FIRE, WOMAN, DAM, render, resize, begin, say, advance, fraction,
  run(n = 60) { for (let i = 0; i < n; i++) step(1 / 60); },
  walk(x, y, n = 60) { forceMove = { x, y }; for (let i = 0; i < n; i++) step(1 / 60); forceMove = null; },
  press(n = 1) { for (let i = 0; i < n; i++) { pressAct = true; actT = 0; step(1 / 60); } },
};
