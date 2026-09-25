// Savi — a valley, a dying Banyan, and five Great Roots choked by the season.
//
// Built for the Cozy Fall Game Jam (theme: roots). No combat, no fail state,
// no timers. Everything the player does is walking, and the ground answers:
//
//   LEAVES  scatter wide and drift slowly back
//   SNOW    does not scatter - it PACKS, and the trench stays
//   THORN   ignores feet entirely, and shrinks from the ember she carries
//   ASH     is dead ground: it wants warmth, not force
//   WATER   is a live surface - a wave equation she wades through
//
// That is one depth grid with four presets, plus one pond. Free a root and the
// tree remembers one beat of the legend of Savitri, which is why it was
// planted. Free all five and the spring comes back.

import { clamp, rand } from './util.js';
import {
  audio, sfx, initAudio, unlockAudio, setAmbientTheme, setMusicIntensity, setMusicActive, setMusicEnabled,
} from './audio.js';
import { themeById } from './music-regions.js';
import { ROOTS, CLIMAX, keeperLines } from './savi-story.js';
import {
  drawFloor, drawBanyan, drawCanopy, drawRoot, rootPath, drawSavi, drawWoman, drawFire, drawMural, glow, mixHex, clamp01, mix,
} from './savi-art.js';

const TAU = Math.PI * 2;

// --- the valley ------------------------------------------------------------------------

const V = { w: 3000, h: 1900 };
const TREE = { x: 1500, y: 620 };
const WOMAN = { x: 1392, y: 800 };
const FIRE = { x: 1470, y: 820 };
const START = { x: 1500, y: 1740 };
// Sheltered spots on the cold road north, where a carried ember can recover.
const SHELTERS = [{ x: 1350, y: 520, r: 90 }, { x: 1620, y: 380, r: 90 }];
// The drift that buries the road home at the very start: the whole tutorial.
const OPENING_DRIFT = { x: 1270, y: 1180, w: 470, h: 430 };
const POND = { x: 1820, y: 1020, w: 740, h: 520 };
const DAM = { x: 2520, y: 1230, w: 90, h: 120 };

ROOTS.forEach((r, i) => { r.seed = i * 3 + 1; r.bend = 70 + i * 26; });

// --- the ground: one depth grid, four materials ------------------------------------------

const CELL = 12;
const LITTER = 0.18;             // the thin litter that lies over the whole valley
const MAT = { none: 0, leaves: 1, snow: 2, thorn: 3, ash: 4 };
const MATS = [
  null,
  { heal: 0.035, pack: 0, drag: 0.55, col: ['#c97f31', '#e0a444', '#a85e2a', '#d99138'] },
  { heal: 0.00, pack: 1, drag: 0.62, col: ['#e6ecf2', '#d4dce6', '#f2f6fa', '#c8d2de'] },
  { heal: 0.30, pack: 0, drag: 0.30, col: ['#2a2130', '#1d1725', '#33283a', '#241c2c'] },
  { heal: 0.05, pack: 0, drag: 0.22, col: ['#57534e', '#454140', '#635d58', '#4c4846'] },
];

const G = {
  w: Math.ceil(V.w / CELL), h: Math.ceil(V.h / CELL),
  mat: null, dep: null, base: null, orig: null, img: null, cv: null, cx: null,
};

function buildGround() {
  const n = G.w * G.h;
  G.mat = new Uint8Array(n);
  G.dep = new Float32Array(n);
  G.base = new Float32Array(n);
  G.orig = new Float32Array(n);
  const put = (rect, m, amount, soft = 90) => {
    const i0 = Math.max(0, Math.floor((rect.x - soft) / CELL)), i1 = Math.min(G.w - 1, Math.ceil((rect.x + rect.w + soft) / CELL));
    const j0 = Math.max(0, Math.floor((rect.y - soft) / CELL)), j1 = Math.min(G.h - 1, Math.ceil((rect.y + rect.h + soft) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL + CELL / 2, y = j * CELL + CELL / 2;
        // 1 well inside, falling off over `soft` at the edge, so drifts have shores.
        const dx = Math.min(x - rect.x, rect.x + rect.w - x), dy = Math.min(y - rect.y, rect.y + rect.h - y);
        const e = Math.min(dx, dy);
        if (e < -soft) continue;
        let k = e >= 0 ? 1 : 1 + e / soft;
        k *= 0.72 + 0.28 * noise(x * 0.008, y * 0.008);
        const q = j * G.w + i;
        const d = amount * clamp01(k);
        if (d <= G.base[q]) continue;
        G.base[q] = d; G.dep[q] = d; G.orig[q] = d; G.mat[q] = m;
      }
    }
  };
  // Autumn litter over most of the valley floor, deep where it matters.
  put({ x: 0, y: 0, w: V.w, h: V.h }, MAT.leaves, LITTER + 0.04, 0);
  put(OPENING_DRIFT, MAT.leaves, 1.0);
  for (const r of ROOTS) {
    if (r.mat === 'water') continue;
    put(r.patch, MAT[r.mat], 1.0, r.mat === 'thorn' ? 40 : 90);
  }
  G.cv = document.createElement('canvas');
  G.cv.width = G.w; G.cv.height = G.h;
  G.cx = G.cv.getContext('2d');
  G.img = G.cx.createImageData(G.w, G.h);
}

const noise = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const depAt = (x, y) => {
  const i = (x / CELL) | 0, j = (y / CELL) | 0;
  if (i < 0 || j < 0 || i >= G.w || j >= G.h) return { m: 0, d: 0 };
  const q = j * G.w + i;
  return { m: G.mat[q], d: G.dep[q] };
};

/** Walking through it. Leaves fly, snow packs, thorn does not care. */
function tread(x, y, r, vx, vy, dt) {
  const sp = Math.hypot(vx, vy);
  if (sp < 6) return;
  const i0 = Math.max(0, ((x - r) / CELL) | 0), i1 = Math.min(G.w - 1, ((x + r) / CELL) | 0);
  const j0 = Math.max(0, ((y - r) / CELL) | 0), j1 = Math.min(G.h - 1, ((y + r) / CELL) | 0);
  const ux = vx / sp, uy = vy / sp;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      const m = G.mat[q];
      if (!m || m === MAT.thorn || m === MAT.ash) continue;   // these two want warmth, not feet
      const cx = i * CELL + 6, cy = j * CELL + 6;
      const d = Math.hypot(cx - x, cy - y);
      if (d > r) continue;
      const k = (1 - d / r) * Math.min(1, sp / 150);
      const take = Math.min(G.dep[q], k * dt * (m === MAT.snow ? 3.0 : 5.0));
      if (take <= 0) continue;
      G.dep[q] -= take;
      if (m === MAT.snow) {
        // Packed, not moved: the trench stays and the ground remembers.
        G.base[q] = Math.min(G.base[q], G.dep[q] + 0.02);
      } else {
        // Thrown forward and out to the sides - but only some of it lands
        // again. The rest goes on the wind, or a swept drift is not swept at
        // all: every flake taken would come straight back on the next pass.
        G.base[q] = Math.max(LITTER, Math.min(G.base[q], G.dep[q] + 0.14));
        push(i + Math.round(ux * 3), j + Math.round(uy * 3), take * 0.3, m);
        push(i - Math.round(uy * 3), j + Math.round(ux * 3), take * 0.15, m);
        push(i + Math.round(uy * 3), j - Math.round(ux * 3), take * 0.15, m);
      }
    }
  }
}

function push(i, j, amt, m) {
  if (i < 0 || j < 0 || i >= G.w || j >= G.h) return;
  const q = j * G.w + i;
  if (G.mat[q] && G.mat[q] !== m) return;
  G.mat[q] = m;
  G.dep[q] = Math.min(1.45, G.dep[q] + amt);
}

/** Warmth: what the ember does to thorn and to dead ground. */
function warm(x, y, r, dt) {
  const i0 = Math.max(0, ((x - r) / CELL) | 0), i1 = Math.min(G.w - 1, ((x + r) / CELL) | 0);
  const j0 = Math.max(0, ((y - r) / CELL) | 0), j1 = Math.min(G.h - 1, ((y + r) / CELL) | 0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      const m = G.mat[q];
      if (m !== MAT.thorn && m !== MAT.ash) continue;
      const d = Math.hypot(i * CELL + 6 - x, j * CELL + 6 - y);
      if (d > r) continue;
      G.dep[q] = Math.max(0, G.dep[q] - (1 - d / r) * dt * (m === MAT.thorn ? 2.6 : 1.4));
      // Burned back for good: it creeps in again a little, never all the way.
      G.base[q] = Math.min(G.base[q], G.dep[q] + 0.06);
    }
  }
}

/** It settles back, each material at its own rate. Snow never does. */
let healRow = 0;
function settleGround(dt) {
  const rows = 40;
  for (let k = 0; k < rows; k++) {
    const j = (healRow + k) % G.h;
    for (let i = 0; i < G.w; i++) {
      const q = j * G.w + i;
      const m = G.mat[q];
      if (!m) continue;
      const h = MATS[m].heal;
      if (h) G.dep[q] += (G.base[q] - G.dep[q]) * Math.min(1, h * dt * (G.h / rows));
    }
  }
  healRow = (healRow + rows) % G.h;
}

/** How much of a root's patch has been freed, 0..1. */
function cleared(patch, m) {
  const i0 = Math.max(0, (patch.x / CELL) | 0), i1 = Math.min(G.w - 1, ((patch.x + patch.w) / CELL) | 0);
  const j0 = Math.max(0, (patch.y / CELL) | 0), j1 = Math.min(G.h - 1, ((patch.y + patch.h) / CELL) | 0);
  let total = 0, open = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = j * G.w + i;
      if (G.mat[q] !== m || G.orig[q] < 0.45) continue;
      total++;
      if (G.dep[q] < 0.22) open++;
    }
  }
  return total ? open / total : 1;
}

let groundFrame = 0;
function drawGround(ctx) {
  const d = G.img.data;
  if (groundFrame++ & 1) { ctx.drawImage(G.cv, 0, 0, V.w, V.h); return; }
  for (let j = 0, q = 0, p = 0; j < G.h; j++) {
    for (let i = 0; i < G.w; i++, q++, p += 4) {
      const m = G.mat[q], dep = G.dep[q];
      if (!m || dep < 0.05) { d[p + 3] = 0; continue; }
      const c = MATS[m].col[(i * 7 + j * 3) & 3];
      const lit = 0.78 + noise(i * 0.7, j * 0.7) * 0.34 + Math.min(0.24, dep * 0.2);
      d[p] = Math.min(255, parseInt(c.slice(1, 3), 16) * lit);
      d[p + 1] = Math.min(255, parseInt(c.slice(3, 5), 16) * lit);
      d[p + 2] = Math.min(255, parseInt(c.slice(5, 7), 16) * lit);
      d[p + 3] = Math.min(255, 70 + dep * 210);
    }
  }
  G.cx.putImageData(G.img, 0, 0);
  ctx.drawImage(G.cv, 0, 0, V.w, V.h);
}

// --- the pond ----------------------------------------------------------------------------

const WCELL = 10;
const W = {
  w: Math.ceil(POND.w / WCELL), h: Math.ceil(POND.h / WCELL),
  hgt: null, vel: null, cv: null, cx: null, img: null,
  level: 1, drain: 0, shoves: 0, lastShove: -9,
};

function buildWater() {
  const n = W.w * W.h;
  W.hgt = new Float32Array(n);
  W.vel = new Float32Array(n);
  W.cv = document.createElement('canvas');
  W.cv.width = W.w; W.cv.height = W.h;
  W.cx = W.cv.getContext('2d');
  W.img = W.cx.createImageData(W.w, W.h);
}

const inPond = (x, y) => W.level > 0.05 && x > POND.x && x < POND.x + POND.w * W.level && y > POND.y && y < POND.y + POND.h;

/** A push on the surface: her feet, a shove at the dam, a call. */
function ripple(x, y, r, force) {
  const i0 = Math.max(1, ((x - POND.x - r) / WCELL) | 0), i1 = Math.min(W.w - 2, ((x - POND.x + r) / WCELL) | 0);
  const j0 = Math.max(1, ((y - POND.y - r) / WCELL) | 0), j1 = Math.min(W.h - 2, ((y - POND.y + r) / WCELL) | 0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = POND.x + i * WCELL - x, dy = POND.y + j * WCELL - y;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      W.vel[j * W.w + i] += force * (1 - d / r);
    }
  }
}

function stepWater(dt) {
  if (W.level <= 0.05) return;
  const { w, h, hgt, vel } = W;
  const steps = 2;
  for (let s = 0; s < steps; s++) {
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const q = j * w + i;
        const avg = (hgt[q - 1] + hgt[q + 1] + hgt[q - w] + hgt[q + w]) * 0.25;
        vel[q] = (vel[q] + (avg - hgt[q]) * 0.28) * 0.986;
      }
    }
    for (let q = 0; q < hgt.length; q++) hgt[q] += vel[q];
  }
  // A slow swell, so it is never dead still.
  if (Math.random() < 0.06) ripple(POND.x + rand(40, POND.w - 40), POND.y + rand(40, POND.h - 40), 40, 0.5);
}

function drawWater(ctx, time) {
  if (W.level <= 0.05) return;
  const d = W.img.data;
  for (let j = 0, q = 0, p = 0; j < W.h; j++) {
    for (let i = 0; i < W.w; i++, q++, p += 4) {
      if (i / W.w > W.level) { d[p + 3] = 0; continue; }
      const gx = (W.hgt[q + 1] || 0) - (W.hgt[q - 1] || 0);
      const gy = (W.hgt[q + W.w] || 0) - (W.hgt[q - W.w] || 0);
      const l = clamp((gx + gy) * 9, -1, 1);
      d[p] = 46 + l * 90;
      d[p + 1] = 86 + l * 96;
      d[p + 2] = 104 + l * 92;
      d[p + 3] = 168;
    }
  }
  W.cx.putImageData(W.img, 0, 0);
  ctx.drawImage(W.cv, POND.x, POND.y, POND.w, POND.h);
  // Its shore.
  ctx.strokeStyle = 'rgba(120,102,74,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(POND.x, POND.y, POND.w * W.level, POND.h);
}

// --- Savi, and the state of the valley -----------------------------------------------------

const S = {
  x: START.x, y: START.y, vx: 0, vy: 0, face: -Math.PI / 2, phase: 0, speed: 0, r: 11,
};
const st = {
  t: 0, woken: {}, count: 0, ember: 0, hasEmber: false, bloom: 0, bloomK: 0, warmth: 0,
  ended: false, started: false, lastKeeper: -9,
};

let ctx = null, cv = null, view = { w: 1280, h: 720, s: 1 }, cam = { x: 0, y: 0 };
const keys = new Set();
const touch = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
let overlay = null, talk = null;

// --- input ------------------------------------------------------------------------------

let forceMove = null;            // the console driving her, for testing
function moveVector() {
  if (forceMove) return forceMove;
  let mx = 0, my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (touch.on) {
    const dx = touch.x - touch.ox, dy = touch.y - touch.oy;
    const d = Math.hypot(dx, dy);
    if (d > 8) { mx += dx / Math.max(d, 50); my += dy / Math.max(d, 50); }
  }
  const m = Math.hypot(mx, my);
  return m > 1 ? { x: mx / m, y: my / m } : { x: mx, y: my };
}

// --- the loop ----------------------------------------------------------------------------

function step(dt) {
  st.t += dt;
  if (talk) return;                       // the valley holds still while she listens

  const mv = moveVector();
  const under = depAt(S.x, S.y);
  const drag = under.m ? MATS[under.m].drag * Math.min(1, under.d) : 0;
  const wading = inPond(S.x, S.y) ? 0.38 : 0;
  const sp = 168 * (1 - Math.max(drag, wading));
  S.vx = mv.x * sp; S.vy = mv.y * sp;

  // Thorn is a wall until the ember has burned it back.
  const nx = S.x + S.vx * dt, ny = S.y + S.vy * dt;
  const ahead = depAt(nx, ny);
  const blocked = ahead.m === MAT.thorn && ahead.d > 0.4;
  if (!blocked) { S.x = nx; S.y = ny; }
  S.x = clamp(S.x, 26, V.w - 26);
  S.y = clamp(S.y, 26, V.h - 26);

  S.speed = Math.hypot(S.vx, S.vy);
  if (S.speed > 12) {
    S.face = Math.atan2(S.vy, S.vx);
    S.phase += dt * (6 + S.speed * 0.03);
    tread(S.x, S.y + 4, 40, S.vx, S.vy, dt);
    if (inPond(S.x, S.y)) ripple(S.x, S.y, 34, -0.6 * dt * 60);
    // Footsteps, at a walking rhythm.
    if (Math.floor(S.phase / Math.PI) !== S.lastStep) {
      S.lastStep = Math.floor(S.phase / Math.PI);
      if (under.d > 0.3 && under.m === MAT.leaves) sfx.hiss();
      else if (inPond(S.x, S.y)) sfx.splash();
      else if (under.d > 0.3 && under.m === MAT.snow) sfx.clack(1.7);
    }
  }

  settleGround(dt);
  stepWater(dt);

  // The ember she carries from the Old Woman's fire.
  if (st.hasEmber) {
    const sheltered = SHELTERS.some((h) => Math.hypot(S.x - h.x, S.y - h.y) < h.r)
      || Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 140;
    st.ember = clamp(st.ember + (sheltered ? dt * 0.34 : -dt * 0.035), 0, 1);
    if (st.ember > 0.05) warm(S.x, S.y, 70 + st.ember * 58, dt);
  }
  if (!st.hasEmber && Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 70) {
    st.hasEmber = true; st.ember = 1;
    sfx.boon();
    say(['You take a coal from her fire. It is warm through your whole hand.'], null);
  }

  // The dam at the pond's mouth: three shoves and the hollow empties.
  if (W.level > 0.05 && W.shoves < 3 && S.speed > 60
      && S.x > DAM.x - 40 && S.x < DAM.x + DAM.w + 40 && S.y > DAM.y - 40 && S.y < DAM.y + DAM.h + 40
      && st.t - W.lastShove > 0.8) {
    W.lastShove = st.t;
    W.shoves++;
    ripple(DAM.x, DAM.y + 60, 220, 3.2);
    sfx.thud();
    if (W.shoves >= 3) { sfx.explode(); W.drain = 1; }
  }
  if (W.drain > 0 && W.level > 0) {
    W.level = Math.max(0, W.level - dt / 6);
    ripple(POND.x + POND.w * W.level, POND.y + POND.h / 2, 160, 1.4);
  }

  // Have any roots woken?
  for (const r of ROOTS) {
    if (st.woken[r.id]) continue;
    const done = r.mat === 'water' ? W.level <= 0.05 : cleared(r.patch, MAT[r.mat]) > 0.55;
    if (done) wake(r);
  }

  // All five, and she is standing under the tree.
  if (st.count >= ROOTS.length && !st.ended && Math.hypot(S.x - TREE.x, S.y - TREE.y) < 260) {
    st.ended = true;
    setAmbientTheme(themeById('durga'));
    say(CLIMAX, () => { st.bloom = 1; }, 'bloom');
  }

  // The Old Woman.
  if (!talk && Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 74 && st.t - (st.lastKeeper || -9) > 2.5) {
    st.lastKeeper = st.t;
    say(keeperLines(st.count, ROOTS.length), null);
  }

  st.bloomK += (st.bloom - st.bloomK) * Math.min(1, dt * 0.5);
  st.warmth = clamp01(0.18 + (st.count / ROOTS.length) * 0.6 + st.bloomK * 0.22);

  // The camera, a step behind her.
  const tx = clamp(S.x - view.w / 2, 0, V.w - view.w);
  const ty = clamp(S.y - view.h / 2, 0, V.h - view.h);
  const f = 1 - Math.exp(-5 * dt);
  cam.x += (tx - cam.x) * f;
  cam.y += (ty - cam.y) * f;
}

function wake(r) {
  st.woken[r.id] = true;
  st.count++;
  sfx.chime();
  sfx.boon();
  setTimeout(() => say(r.lines, null, r.mural), 700);
}

// --- drawing ------------------------------------------------------------------------------

function render() {
  const s = view.s;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.fillStyle = '#1a1712';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

  drawFloor(ctx, V, st.warmth, st.t);
  drawWater(ctx, st.t);
  drawGround(ctx);

  for (const r of ROOTS) drawRoot(ctx, TREE, r, !!st.woken[r.id], st.t);

  // The dam, while it still holds.
  if (W.level > 0.05 && W.shoves < 3) {
    ctx.fillStyle = mixHex('#4a3a28', '#2e2418', W.shoves / 3);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(DAM.x + 45, DAM.y + 12 + i * 16);
      ctx.rotate((i * 0.7) % 1.2 - 0.6 + W.shoves * 0.12);
      ctx.fillRect(-46, -5, 92, 9);
      ctx.restore();
    }
  }

  drawBanyan(ctx, TREE, st.bloomK, st.t);
  drawFire(ctx, FIRE, st.t, st.hasEmber ? 0.35 : 1);
  drawWoman(ctx, WOMAN, st.t);
  for (const h of SHELTERS) {
    ctx.strokeStyle = 'rgba(255,190,120,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.5, 0, 0, TAU); ctx.stroke();
    drawFire(ctx, { x: h.x, y: h.y }, st.t + h.x, 0.55);
  }

  if (st.hasEmber && st.ember > 0.02) {
    glow(ctx, S.x, S.y - 8, 150 * (0.4 + st.ember * 0.6), `rgba(255,150,60,${0.26 * st.ember + 0.06})`);
  }
  drawSavi(ctx, S, st.t);
  drawCanopy(ctx, TREE, st.bloomK, st.t);

  // Leaves on the wind, thicker as the tree comes back.
  const n = 40 + Math.round(st.bloomK * 50);
  for (let i = 0; i < n; i++) {
    const sp = 0.4 + ((i * 37) % 13) / 13;
    const x = ((i * 613 + st.t * 28 * sp) % (view.w + 200)) + cam.x - 100;
    const y = ((i * 971 + st.t * 18 * sp) % (view.h + 200)) + cam.y - 100;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = MATS[1].col[i & 3];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(st.t * sp + i);
    ctx.fillRect(-3, -2, 6, 4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // The cold closing in at the edges, lifting as the valley wakes.
  ctx.restore();
  const vig = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.3, view.w / 2, view.h / 2, view.w * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(24,30,46,${0.5 - st.warmth * 0.32})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, view.w, view.h);

  drawHud();
}

function drawHud() {
  ctx.textAlign = 'left';
  ctx.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240,226,203,0.75)';
  ctx.fillText(`${st.count} of ${ROOTS.length} roots awake`, 20, 28);
  if (st.hasEmber) {
    ctx.fillStyle = 'rgba(255,170,80,0.3)';
    ctx.fillRect(20, 38, 90, 6);
    ctx.fillStyle = `rgba(255,${160 + st.ember * 60},${70 + st.ember * 60},0.95)`;
    ctx.fillRect(20, 38, 90 * st.ember, 6);
  }
  if (st.t < 9 && !st.count) {
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(240,226,203,${clamp01(2 - Math.abs(st.t - 4) / 2) * 0.6})`;
    ctx.fillText('walk', view.w / 2, view.h - 42);
  }
  ctx.textAlign = 'left';
}

// --- what she is told ----------------------------------------------------------------------

function say(lines, onDone, mural) {
  talk = { lines: lines.slice(), i: 0, onDone, mural };
  paintTalk();
}

function paintTalk() {
  if (!talk) return;
  const m = talk.mural ? '<canvas id="mural" width="440" height="240"></canvas>' : '';
  overlay.innerHTML = `<div class="panel">${m}<p>${talk.lines[talk.i]}</p><div class="more">tap to go on</div></div>`;
  overlay.classList.add('on');
  if (talk.mural) {
    const c = document.getElementById('mural');
    drawMural(c.getContext('2d'), talk.mural, 440, 240, st.t);
  }
}

function advance() {
  if (!talk) return;
  talk.i++;
  if (talk.i < talk.lines.length) { paintTalk(); sfx.ui(); return; }
  const done = talk.onDone;
  talk = null;
  overlay.classList.remove('on');
  overlay.innerHTML = '';
  if (done) done();
}

// --- boot -------------------------------------------------------------------------------

// Some browsers resize without ever firing the event (a phone's collapsing URL
// bar, an embedded pane), so the size is compared every frame instead.
let lastW = -1, lastH = -1;
function resize() {
  const W2 = window.innerWidth, H2 = window.innerHeight;
  if (W2 < 2 || H2 < 2) return;
  lastW = W2; lastH = H2;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.h = 720;
  view.w = Math.round(720 * (W2 / H2));
  view.s = (H2 / 720) * dpr;
  cv.width = Math.round(W2 * dpr);
  cv.height = Math.round(H2 * dpr);
  cv.style.width = W2 + 'px';
  cv.style.height = H2 + 'px';
}

function begin() {
  if (st.started) return;
  st.started = true;
  document.getElementById('title').classList.remove('on');
  try {
    initAudio();
    unlockAudio();
    setMusicEnabled(true);
    setMusicActive(true);
    setMusicIntensity(0);
    setAmbientTheme(themeById('bhupali'));
  } catch (e) { /* no sound is survivable */ }
}

function main() {
  cv = document.getElementById('game');
  ctx = cv.getContext('2d');
  overlay = document.getElementById('overlay');
  buildGround();
  buildWater();
  resize();
  window.addEventListener('resize', resize);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ' || k === 'enter') { begin(); advance(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  const pt = (e) => {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  };
  cv.addEventListener('pointerdown', (e) => {
    begin();
    if (talk) { advance(); return; }
    const p = pt(e);
    touch.on = true; touch.ox = p.x; touch.oy = p.y; touch.x = p.x; touch.y = p.y;
  });
  cv.addEventListener('pointermove', (e) => { if (touch.on) { const p = pt(e); touch.x = p.x; touch.y = p.y; } });
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
// Drive it by hand from the console: the preview pane freezes rAF when hidden.
window.savi = {
  st, S, G, W, V, ROOTS, POND, DAM, TREE, FIRE, WOMAN, wake, say, advance, render, resize, begin, cleared, MAT,
  run(n = 60, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
  walk(x, y, n = 60) { forceMove = { x, y }; for (let i = 0; i < n; i++) step(1 / 60); forceMove = null; },
};
