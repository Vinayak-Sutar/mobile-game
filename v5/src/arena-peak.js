// The Broken Peak: Kharn's arena, a volcanic summit buried in ash.
//
// The floor is a layer of ash over black rock, held as a depth grid. Anything
// that walks it leaves footprints (crisp prints on top, a dent in the grid
// beneath) and the ash slowly drifts back over them as more falls. A dash
// ploughs a furrow. Kharn's slams blow craters with raised rims, send a ring
// of dust rolling out and crack the rock open: the cracks glow molten, then
// cool from orange to grey. Where the ash is swept away, glowing veins in the
// rock show through - and when he enrages, they burn brighter.
//
// Ash falls the whole fight, with embers in it, drifting on a wind that his
// roars blow outward.
//
// Like the water engine: a small image, one pixel per cell, lit by the slope
// of the ash and scaled up smoothly. Purely cosmetic.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist } from './util.js';

const CELL = 8;

const st = {
  key: '', room: null,
  w: 0, h: 0, x0: 0, y0: 0,
  ash: null, grain: null,
  canvas: null, cx: null, img: null,
  rock: null, veins: null, rim: null, puff: null,
  prints: [], trails: [], cracks: [], puffs: [], shocks: [], flakes: [],
  walkers: new WeakMap(),
  wind: { x: 16, y: 5 }, gustX: 0, gustY: 0,
  heat: 0, frame: 0, boss: null, bossRef: null,
};

// --- setup -------------------------------------------------------------------

function ensure(room) {
  const b = arenaBounds();
  const key = `${b.l}|${b.t}|${b.r}|${b.b}|${room.obstacles.length}`;
  if (st.key === key && st.room === room && st.ash) return;
  st.key = key;
  st.room = room;

  const w = Math.ceil((b.r - b.l) / CELL) + 2;
  const h = Math.ceil((b.b - b.t) / CELL) + 2;
  st.w = w; st.h = h;
  st.x0 = b.l - CELL / 2;
  st.y0 = b.t - CELL / 2;
  st.ash = new Float32Array(w * h);
  st.grain = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const wx = st.x0 + x * CELL, wy = st.y0 + y * CELL;
      const edge = Math.min(wx - b.l, b.r - wx, wy - b.t, b.b - wy);
      // Drifts heaped against the walls and the pillars.
      let drift = clamp(1 - edge / 90, 0, 1) * 0.3;
      for (const o of room.obstacles) {
        const dx = Math.max(o.x - wx, 0, wx - (o.x + o.w));
        const dy = Math.max(o.y - wy, 0, wy - (o.y + o.h));
        const d = Math.hypot(dx, dy);
        if (d < 40) drift = Math.max(drift, (1 - d / 40) * 0.35);
      }
      const n = Math.sin(wx * 0.021 + Math.sin(wy * 0.017) * 2.2) * Math.cos(wy * 0.019 - wx * 0.008);
      st.ash[i] = clamp(0.62 + n * 0.16 + drift, 0.3, 1.25);
      st.grain[i] = rand(-1, 1);
    }
  }
  st.canvas = document.createElement('canvas');
  st.canvas.width = w;
  st.canvas.height = h;
  st.cx = st.canvas.getContext('2d');
  st.img = st.cx.createImageData(w, h);

  st.rock = makeRock(b);
  st.veins = makeVeins(b);
  st.rim = makeRim(b);
  st.puff = st.puff || makePuffSprite();
  st.prints = [];
  st.trails = [];
  st.cracks = [];
  st.puffs = [];
  st.shocks = [];
  st.walkers = new WeakMap();
  st.flakes = [];
  for (let k = 0; k < 90; k++) st.flakes.push(newFlake(b, true));
  st.heat = 0;
  st.boss = null;
  st.bossRef = null;
}

function makeRock(b) {
  const W = Math.ceil(b.r - b.l), H = Math.ceil(b.b - b.t);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#211b19';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 120; k++) {
    const v = rand(-8, 10);
    g.fillStyle = `rgba(${48 + v},${40 + v},${37 + v},0.5)`;
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(20, 70), rand(12, 40), rand(0, TAU), 0, TAU);
    g.fill();
  }
  // Old, cold fractures in the basalt.
  g.strokeStyle = 'rgba(8,5,4,0.7)';
  g.lineWidth = 1.5;
  for (let k = 0; k < 26; k++) {
    let x = rand(0, W), y = rand(0, H), a = rand(0, TAU);
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { a += rand(-0.6, 0.6); x += Math.cos(a) * 18; y += Math.sin(a) * 18; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}

/** Glowing veins in the rock: hidden under the ash until it is swept away. */
function makeVeins(b) {
  const W = Math.ceil(b.r - b.l), H = Math.ceil(b.b - b.t);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    let x = rand(0, W), y = rand(0, H), a = rand(0, TAU);
    const pts = [[x, y]];
    for (let s = 0; s < 12; s++) { a += rand(-0.5, 0.5); x += Math.cos(a) * 24; y += Math.sin(a) * 24; pts.push([x, y]); }
    for (const [lw, col] of [[10, 'rgba(255,80,20,0.18)'], [4, 'rgba(255,120,40,0.5)'], [1.5, 'rgba(255,210,120,0.8)']]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    }
  }
  return c;
}

/** The summit's edge: jagged ash-capped rocks and charred stumps. */
function makeRim(b) {
  const pad = 30;
  const c = document.createElement('canvas');
  c.width = Math.ceil(b.r - b.l + pad * 2);
  c.height = Math.ceil(b.b - b.t + pad * 2);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const rock = (x, y, s) => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(x + 3, y + 4, s, s * 0.7, 0, 0, TAU); g.fill();
    g.fillStyle = '#2c2522';
    g.beginPath();
    const n = 6 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, r = s * rand(0.7, 1.1);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.8;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    // Ash settled on its top.
    g.fillStyle = 'rgba(190,182,172,0.8)';
    g.beginPath(); g.ellipse(x - s * 0.15, y - s * 0.3, s * 0.6, s * 0.3, -0.2, 0, TAU); g.fill();
  };
  for (let x = 10; x < W - 10; x += rand(22, 44)) { rock(x, pad - 6 + rand(-6, 4), rand(8, 16)); rock(x, H - pad + 6 + rand(-4, 6), rand(8, 16)); }
  for (let y = 10; y < H - 10; y += rand(22, 44)) { rock(pad - 6 + rand(-6, 4), y, rand(8, 16)); rock(W - pad + 6 + rand(-4, 6), y, rand(8, 16)); }
  // Charred stumps in the corners.
  for (const [x, y] of [[pad + 18, pad + 18], [W - pad - 18, pad + 18], [pad + 18, H - pad - 18], [W - pad - 18, H - pad - 18]]) {
    g.fillStyle = '#151010';
    g.beginPath(); g.arc(x, y, 13, 0, TAU); g.fill();
    g.strokeStyle = '#3a2a22';
    g.lineWidth = 2;
    for (let r = 4; r < 13; r += 3) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
    g.strokeStyle = '#151010';
    g.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      const a = rand(0, TAU);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); g.stroke();
    }
  }
  return { canvas: c, pad };
}

function makePuffSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(196,188,178,0.9)');
  grd.addColorStop(0.6, 'rgba(170,162,152,0.4)');
  grd.addColorStop(1, 'rgba(160,152,142,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function newFlake(b, anywhere) {
  const ember = Math.random() < 0.12;
  return {
    x: rand(b.l - 60, b.r), y: rand(b.t - 30, b.b),
    z: anywhere ? rand(0, 160) : rand(90, 170),
    vx: rand(-6, 6), vy: rand(-4, 4), fall: rand(24, 44),
    s: ember ? rand(1.2, 2) : rand(1.2, 2.6), ember, ph: rand(0, TAU),
  };
}

// --- shaping the ash ---------------------------------------------------------

/** Remove ash in a disc; returns how much was taken. */
function take(x, y, r, depth) {
  if (!st.ash) return 0;
  const cx = (x - st.x0) / CELL, cy = (y - st.y0) / CELL, cr = Math.max(1.2, r / CELL);
  let got = 0;
  for (let yy = Math.max(1, Math.floor(cy - cr)); yy <= Math.min(st.h - 2, Math.ceil(cy + cr)); yy++) {
    for (let xx = Math.max(1, Math.floor(cx - cr)); xx <= Math.min(st.w - 2, Math.ceil(cx + cr)); xx++) {
      const d = Math.hypot(xx - cx, yy - cy);
      if (d > cr) continue;
      const i = yy * st.w + xx;
      const want = depth * (1 - (d / cr) * (d / cr));
      const t = Math.min(st.ash[i], want);
      st.ash[i] -= t;
      got += t;
    }
  }
  return got;
}

/** Spread `amount` of ash over a ring between radii r0 and r1. */
function heapRing(x, y, r0, r1, amount) {
  if (!st.ash || amount <= 0) return;
  const cx = (x - st.x0) / CELL, cy = (y - st.y0) / CELL;
  const a0 = r0 / CELL, a1 = Math.max(a0 + 1, r1 / CELL);
  const cells = [];
  let wsum = 0;
  for (let yy = Math.max(1, Math.floor(cy - a1)); yy <= Math.min(st.h - 2, Math.ceil(cy + a1)); yy++) {
    for (let xx = Math.max(1, Math.floor(cx - a1)); xx <= Math.min(st.w - 2, Math.ceil(cx + a1)); xx++) {
      const d = Math.hypot(xx - cx, yy - cy);
      if (d < a0 || d > a1) continue;
      const wgt = Math.sin(Math.PI * (d - a0) / (a1 - a0));
      cells.push([yy * st.w + xx, wgt]);
      wsum += wgt;
    }
  }
  if (!wsum) return;
  for (const [i, wgt] of cells) st.ash[i] = Math.min(1.6, st.ash[i] + amount * wgt / wsum);
}

function heapAt(x, y, r, amount) {
  heapRing(x, y, 0, r, amount);
}

function addPuff(x, y, vx, vy, r, life, alpha = 0.55) {
  if (st.puffs.length > 180) st.puffs.shift();
  st.puffs.push({ x, y, vx, vy, r, t: 0, life, alpha });
}

/** Dust thrown up: `n` soft puffs around a point. */
export function peakDust(x, y, n, spread, speed = 80) {
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU), d = rand(0, spread);
    addPuff(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * rand(0.3, 1) * speed, Math.sin(a) * rand(0.3, 1) * speed, rand(10, 22), rand(0.7, 1.3));
  }
}

/** A crack in the rock, glowing molten and cooling. */
export function peakCrack(x, y, angle, len, heat = 1) {
  const lines = [];
  const grow = (sx, sy, a, L, depth) => {
    const pts = [[sx, sy]];
    let px = sx, py = sy, dir = a, run = 0;
    while (run < L) {
      const s = rand(9, 15);
      dir += rand(-0.4, 0.4);
      px += Math.cos(dir) * s; py += Math.sin(dir) * s; run += s;
      pts.push([px, py]);
      if (depth < 2 && Math.random() < 0.18) grow(px, py, dir + rand(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1), L * 0.4, depth + 1);
    }
    lines.push(pts);
  };
  grow(x, y, angle, len, 0);
  // The ash parts along it.
  for (const pts of lines) for (let k = 0; k < pts.length; k += 2) take(pts[k][0], pts[k][1], 7, 0.5);
  if (st.cracks.length > 40) st.cracks.shift();
  st.cracks.push({ lines, t: 0, heat, life: 80 });
}

/**
 * A slam: a crater with a raised rim, cracks radiating from it, a ring of
 * dust rolling out and a shock ring across the ash.
 */
export function peakSlam(x, y, r, opts = {}) {
  const got = take(x, y, r * 0.75, 0.95);
  heapRing(x, y, r * 0.75, r * 1.25, got);
  const n = opts.cracks ?? 6;
  const off = rand(0, TAU);
  for (let k = 0; k < n; k++) peakCrack(x, y, off + (k / n) * TAU + rand(-0.25, 0.25), r * rand(0.7, 1.2), opts.heat ?? 1);
  // The dust torus: a ring of puffs racing outward.
  const m = Math.round(18 + r * 0.12);
  for (let k = 0; k < m; k++) {
    const a = (k / m) * TAU + rand(-0.1, 0.1);
    const sp = rand(200, 320) * (r / 120);
    addPuff(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, Math.cos(a) * sp, Math.sin(a) * sp, rand(16, 28), rand(0.9, 1.4), 0.6);
  }
  if (st.shocks.length > 8) st.shocks.shift();
  st.shocks.push({ x, y, R: r * 1.9, t: 0, life: 0.55 });
  peakGust(x, y, r * 2);
}

/** A fist or a thrown rock: a small crater, a short crack, a puff. */
export function peakPound(x, y, angle = rand(0, TAU)) {
  const got = take(x, y, 20, 0.8);
  heapRing(x, y, 18, 34, got);
  peakCrack(x, y, angle + rand(-0.6, 0.6), rand(34, 60), 0.8);
  peakDust(x, y, 7, 14, 120);
  st.shocks.push({ x, y, R: 60, t: 0, life: 0.3 });
}

/** A furrow: the ash shoved aside down both flanks (a charge, a dash). */
export function peakPlough(x, y, angle, width) {
  const got = take(x, y, width * 0.6, 0.6);
  const nx = -Math.sin(angle), ny = Math.cos(angle);
  heapAt(x + nx * width * 0.85, y + ny * width * 0.85, width * 0.4, got * 0.5);
  heapAt(x - nx * width * 0.85, y - ny * width * 0.85, width * 0.4, got * 0.5);
  if (Math.random() < 0.5) {
    const s = Math.random() < 0.5 ? 1 : -1;
    addPuff(x + nx * width * 0.7 * s, y + ny * width * 0.7 * s, nx * s * rand(40, 90), ny * s * rand(40, 90), rand(8, 16), rand(0.5, 0.9), 0.45);
  }
}

/** Wind blown outward from a point (a roar, a slam): flakes and dust flee it. */
export function peakGust(x, y, radius, strength = 1) {
  for (const f of st.flakes) {
    const d = dist(x, y, f.x, f.y);
    if (d > radius || d < 1) continue;
    const k = (1 - d / radius) * 260 * strength;
    f.vx += (f.x - x) / d * k;
    f.vy += (f.y - y) / d * k;
  }
  for (const pf of st.puffs) {
    const d = dist(x, y, pf.x, pf.y);
    if (d > radius || d < 1) continue;
    const k = (1 - d / radius) * 180 * strength;
    pf.vx += (pf.x - x) / d * k;
    pf.vy += (pf.y - y) / d * k;
  }
}

/** A wide shove in front (the thunder clap): the ash is swept off in a cone. */
export function peakCone(x, y, angle, arc, r) {
  for (let k = 0; k < 7; k++) {
    const a = angle + ((k / 6) - 0.5) * arc;
    const px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55;
    const got = take(px, py, r * 0.25, 0.5);
    heapAt(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, r * 0.2, got);
    addPuff(px, py, Math.cos(a) * rand(220, 320), Math.sin(a) * rand(220, 320), rand(14, 24), rand(0.7, 1.1), 0.55);
  }
}

// --- footprints ----------------------------------------------------------------

function stamp(x, y, angle, kind, size) {
  if (st.prints.length > 260) st.prints.shift();
  st.prints.push({ x, y, a: angle, kind, size, t: 0, life: kind === 'foot' || kind === 'knuckle' ? 55 : 35 });
  take(x, y, size * 1.2, 0.35);
}

function walk(e, isPlayer) {
  if (e.dead || e.hidden || e.spawning || (e.z || 0) > 2) return;
  let w = st.walkers.get(e);
  if (!w) { w = { px: e.x, py: e.y, d: 0, side: 1 }; st.walkers.set(e, w); return; }
  const dx = e.x - w.px, dy = e.y - w.py;
  const step = Math.hypot(dx, dy);
  w.px = e.x; w.py = e.y;
  if (step < 0.3 || step > 200) return;
  const a = Math.atan2(dy, dx);
  if (isPlayer && e.dashing) {
    peakPlough(e.x, e.y, a, 16);
    return;
  }
  const gor = e.type === 'gorilla';
  if (!gor) {
    // A drag trail, not footprints: our figures have no feet to print. A
    // shallow furrow in the ash, with a soft mark on top of it.
    w.d += step;
    if (w.d < 7) return;
    w.d = 0;
    const width = isPlayer ? e.r * 0.85 : e.r * 0.75;
    const got = take(e.x, e.y, width * 0.55, 0.14);
    const nx = -Math.sin(a), ny = Math.cos(a);
    heapAt(e.x + nx * width * 0.7, e.y + ny * width * 0.7, width * 0.3, got * 0.5);
    heapAt(e.x - nx * width * 0.7, e.y - ny * width * 0.7, width * 0.3, got * 0.5);
    if (w.lx !== undefined && dist(w.lx, w.ly, e.x, e.y) < 40) {
      if (st.trails.length > 700) st.trails.shift();
      st.trails.push({ x1: w.lx, y1: w.ly, x2: e.x, y2: e.y + e.r * 0.35, w: width, t: 0, life: 32 });
    }
    w.lx = e.x; w.ly = e.y + e.r * 0.35;
    return;
  }
  const stride = 58;
  w.d += step;
  if (w.d < stride) return;
  w.d = 0;
  w.side = -w.side;
  const nx = -Math.sin(a), ny = Math.cos(a);
  if (gor) {
    // Knuckle-walking: a fist on one side, a broad foot behind on the other.
    const s = w.side;
    stamp(e.x + Math.cos(a) * e.r * 0.5 + nx * e.r * 0.6 * s, e.y + Math.sin(a) * e.r * 0.5 + ny * e.r * 0.6 * s, a, 'knuckle', 7);
    stamp(e.x - Math.cos(a) * e.r * 0.4 - nx * e.r * 0.45 * s, e.y - Math.sin(a) * e.r * 0.4 - ny * e.r * 0.45 * s, a, 'foot', 12);
    peakDust(e.x, e.y, 3, e.r * 0.6, 50);
  }
}

// --- per frame ---------------------------------------------------------------------

function tick(room, dt) {
  ensure(room);
  const b = arenaBounds();
  st.frame++;

  const p = world.player;
  if (p && !p.dead) walk(p, true);
  for (const e of world.enemies) walk(e, false);

  // Kharn's fury heats the mountain.
  const boss = world.enemies.find((e) => e.boss);
  const hot = boss && boss.enraged ? 1 : 0;
  st.heat += (hot - st.heat) * Math.min(1, dt * 1.5);
  if (boss && !boss.dead) st.boss = { x: boss.x, y: boss.y, alive: true };
  else if (st.boss && st.boss.alive) {
    // The fall of the Silverback: the summit exhales.
    st.boss.alive = false;
    peakSlam(st.boss.x, st.boss.y, 150, { cracks: 10, heat: 1.4 });
  }

  // The ash settles: ridges slump a little, and fresh ash keeps falling.
  if (st.frame % 3 === 0) {
    const { w, h, ash } = st;
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const avg = (ash[i - 1] + ash[i + 1] + ash[i - w] + ash[i + w]) * 0.25;
        let v = ash[i] + (avg - ash[i]) * 0.02;
        if (v < 0.55) v += 0.0009;
        ash[i] = v;
      }
    }
  }

  // Wind, wandering; flakes ride it and settle.
  const t = world.runTime;
  st.wind.x = 16 + Math.sin(t * 0.13) * 14;
  st.wind.y = 5 + Math.sin(t * 0.21 + 1) * 9;
  for (let i = 0; i < st.flakes.length; i++) {
    const f = st.flakes[i];
    f.vx *= Math.exp(-1.2 * dt);
    f.vy *= Math.exp(-1.2 * dt);
    f.x += (st.wind.x + f.vx + Math.sin(t * 2 + f.ph) * 6) * dt;
    f.y += (st.wind.y + f.vy) * dt;
    f.z -= f.fall * dt;
    if (f.z <= 0 || f.x > b.r + 40 || f.y > b.b + 40 || f.x < b.l - 80 || f.y < b.t - 60) {
      if (!f.ember && f.z <= 0) heapAt(f.x, f.y, 6, 0.02);
      st.flakes[i] = newFlake(b, false);
      if (st.flakes[i].ember && st.heat > 0.5) st.flakes[i].s += 0.6;
    }
  }
  // More embers in the air when he burns.
  if (st.heat > 0.3 && Math.random() < dt * 8 * st.heat) {
    const f = newFlake(b, true);
    f.ember = true;
    st.flakes[(Math.random() * st.flakes.length) | 0] = f;
  }

  for (let i = st.puffs.length - 1; i >= 0; i--) {
    const pf = st.puffs[i];
    pf.t += dt;
    const drag = Math.exp(-2.6 * dt);
    pf.vx = pf.vx * drag + st.wind.x * dt * 0.8;
    pf.vy = pf.vy * drag + st.wind.y * dt * 0.8;
    pf.x += pf.vx * dt;
    pf.y += pf.vy * dt;
    if (pf.t >= pf.life) st.puffs.splice(i, 1);
  }
  for (let i = st.shocks.length - 1; i >= 0; i--) {
    st.shocks[i].t += dt;
    if (st.shocks[i].t >= st.shocks[i].life) st.shocks.splice(i, 1);
  }
  for (let i = st.trails.length - 1; i >= 0; i--) {
    st.trails[i].t += dt;
    if (st.trails[i].t >= st.trails[i].life) st.trails.splice(i, 1);
  }
  for (let i = st.prints.length - 1; i >= 0; i--) {
    st.prints[i].t += dt;
    if (st.prints[i].t >= st.prints[i].life) st.prints.splice(i, 1);
  }
  for (let i = st.cracks.length - 1; i >= 0; i--) {
    st.cracks[i].t += dt;
    if (st.cracks[i].t >= st.cracks[i].life) st.cracks.splice(i, 1);
  }
}

// --- drawing -----------------------------------------------------------------------

function paint() {
  const { w, h, ash, grain } = st;
  const d = st.img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      const a = ash[i];
      let l = 0;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        l = (ash[i - 1] - ash[i + 1] + ash[i - w] - ash[i + w]) * 2.4;
        if (l > 1) l = 1; else if (l < -1) l = -1;
      }
      const base = 128 + Math.min(a, 1.3) * 44 + grain[i] * 6;
      let r = base + 8, g = base + 2, bl = base - 6;
      if (l > 0) { r += l * 60; g += l * 58; bl += l * 54; } else { const k = 1 + l * 0.55; r *= k; g *= k; bl *= k; }
      // Thin ash turns see-through: the rock (and its veins) show beneath.
      const cov = a <= 0.06 ? 0 : a >= 0.5 ? 1 : (a - 0.06) / 0.44;
      d[p] = r; d[p + 1] = g; d[p + 2] = bl; d[p + 3] = cov * cov * (3 - 2 * cov) * 246;
    }
  }
  st.cx.putImageData(st.img, 0, 0);
}

function drawPrint(ctx, pr) {
  const fade = pr.t < pr.life * 0.6 ? 1 : 1 - (pr.t - pr.life * 0.6) / (pr.life * 0.4);
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(pr.a);
  ctx.globalAlpha = 0.8 * fade;
  const hole = 'rgba(38,31,28,0.85)', lip = 'rgba(226,218,206,0.45)';
  const blob = (x, y, rx, ry) => {
    ctx.fillStyle = lip;
    ctx.beginPath(); ctx.ellipse(x - 0.8, y - 0.8, rx + 1.2, ry + 1.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = hole;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  };
  if (pr.kind === 'boot') {
    blob(2, 0, pr.size * 1.1, pr.size * 0.65);
    blob(-pr.size * 1.2, 0, pr.size * 0.55, pr.size * 0.5);
  } else if (pr.kind === 'knuckle') {
    for (let k = 0; k < 4; k++) blob(0, (k - 1.5) * pr.size * 0.75, pr.size * 0.55, pr.size * 0.34);
  } else if (pr.kind === 'foot') {
    blob(0, 0, pr.size * 1.1, pr.size * 0.7);
    blob(pr.size * 0.4, pr.size * 0.95, pr.size * 0.35, pr.size * 0.28);     // the thumb-toe
    for (let k = 0; k < 3; k++) blob(pr.size * 1.1, (k - 1) * pr.size * 0.45, pr.size * 0.22, pr.size * 0.2);
  } else {
    blob(0, 0, pr.size * 0.7, pr.size * 0.6);
    for (let k = 0; k < 3; k++) blob(pr.size * 0.95, (k - 1) * pr.size * 0.5, pr.size * 0.25, pr.size * 0.22);
  }
  ctx.restore();
}

function drawCracks(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const c of st.cracks) {
    const grow = Math.min(1, c.t / 0.18);
    const cool = 6 + st.heat * 4;
    const h = Math.max(0, 1 - c.t / cool) * c.heat;
    const fade = c.t > c.life - 10 ? (c.life - c.t) / 10 : 1;
    const trace = (lw, style, comp) => {
      ctx.globalCompositeOperation = comp;
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      for (const pts of c.lines) {
        const n = Math.max(2, Math.ceil(pts.length * grow));
        ctx.beginPath();
        for (let k = 0; k < n; k++) (k ? ctx.lineTo(pts[k][0], pts[k][1]) : ctx.moveTo(pts[k][0], pts[k][1]));
        ctx.stroke();
      }
    };
    ctx.globalAlpha = 0.9 * fade;
    trace(3.2, '#0c0806', 'source-over');
    if (h > 0.01) {
      ctx.globalAlpha = Math.min(1, h) * fade;
      trace(9, 'rgba(255,90,20,0.35)', 'lighter');
      trace(2.4, h > 0.6 ? '#fff0b0' : '#ff8a3d', 'lighter');
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function draw(ctx, room, time) {
  ensure(room);
  const b = arenaBounds();
  const aw = b.r - b.l, ah = b.b - b.t;

  paint();
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.l, b.t, aw, ah);
  ctx.clip();

  ctx.drawImage(st.rock, b.l, b.t);
  // The veins glow through wherever the ash has gone; hotter when he rages.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45 + st.heat * 0.5 + Math.sin(time * 2.2) * 0.08 * (1 + st.heat);
  ctx.drawImage(st.veins, b.l, b.t);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(st.canvas, 0.5, 0.5, st.w - 1, st.h - 1, st.x0 + CELL / 2, st.y0 + CELL / 2, (st.w - 1) * CELL, (st.h - 1) * CELL);

  // Drag trails: a soft dark groove with a pale lip, fading as ash covers it.
  ctx.lineCap = 'round';
  for (const tr of st.trails) {
    const fade = tr.t < tr.life * 0.5 ? 1 : 1 - (tr.t - tr.life * 0.5) / (tr.life * 0.5);
    ctx.globalAlpha = 0.22 * fade;
    ctx.strokeStyle = '#e2d8cc';
    ctx.lineWidth = tr.w + 3;
    ctx.beginPath(); ctx.moveTo(tr.x1 - 0.8, tr.y1 - 0.8); ctx.lineTo(tr.x2 - 0.8, tr.y2 - 0.8); ctx.stroke();
    ctx.globalAlpha = 0.34 * fade;
    ctx.strokeStyle = '#2a2320';
    ctx.lineWidth = tr.w;
    ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const pr of st.prints) drawPrint(ctx, pr);
  drawCracks(ctx);

  // Shock rings racing across the ash.
  for (const s of st.shocks) {
    const k = s.t / s.life;
    const r = s.R * (1 - (1 - k) * (1 - k));
    ctx.globalAlpha = (1 - k) * 0.6;
    ctx.strokeStyle = '#d8cfc2';
    ctx.lineWidth = 10 * (1 - k) + 2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.86, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Dust clouds.
  for (const pf of st.puffs) {
    const k = pf.t / pf.life;
    const r = pf.r * (1 + k * 1.6);
    ctx.globalAlpha = pf.alpha * (1 - k) * (k < 0.1 ? k / 0.1 : 1);
    ctx.drawImage(st.puff, pf.x - r, pf.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  // A red glow from the fire below, strongest along the far edge.
  const glow = ctx.createLinearGradient(0, b.t, 0, b.t + ah * 0.45);
  glow.addColorStop(0, `rgba(255,90,30,${0.1 + st.heat * 0.12})`);
  glow.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(b.l, b.t, aw, ah);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  ctx.drawImage(st.rim.canvas, b.l - st.rim.pad, b.t - st.rim.pad);

  // Falling ash, and embers in it.
  for (const f of st.flakes) {
    const y = f.y - f.z * 0.35;
    if (f.ember) {
      const fl = 0.55 + Math.sin(time * 9 + f.ph) * 0.45;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fl * 0.35;
      ctx.fillStyle = '#ff7a2a';
      ctx.beginPath(); ctx.arc(f.x, y, f.s * 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = fl;
      ctx.fillStyle = '#ffd08a';
      ctx.beginPath(); ctx.arc(f.x, y, f.s, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#cfc8be';
      ctx.fillRect(f.x, y, f.s, f.s);
    }
  }
  ctx.globalAlpha = 1;
}

/** Hooks for the gorilla's spec: `drawArena` and `arenaTick`. */
export const PEAK_ARENA = { draw, tick };
