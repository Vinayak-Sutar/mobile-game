// The Mire: Mawgrim's arena, a flooded hall of black swamp water.
//
// The surface is a live height field (the classic 2D wave equation on a
// coarse grid). Anything that moves through the water disturbs it - the
// player's steps and dashes, every enemy's wake, and the crocodile's dives,
// rolls and eruptions - and the ripples spread, fade, and bounce off the
// walls and the pillars. It is painted into a small image, one pixel per
// cell, lit by the slope of the surface, and scaled up smoothly over the
// floor, which keeps it cheap enough for a phone.
//
// Purely cosmetic: nothing here changes how the fight plays. The crocodile's
// telegraphs (the dark shape, the V of ripples, the marked eruption circle)
// are drawn by the boss as before; the water only makes them feel physical.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, resolveCircleRect } from './util.js';

const CELL = 10;          // world units per simulation cell
const C2 = 0.24;          // wave stiffness; stable below 0.5
const DAMP = 0.984;       // per-step energy loss: ripples die in ~2-3 s
const LIGHT = 1.4;        // how strongly slopes catch the light

const sim = {
  key: '', room: null,
  w: 0, h: 0, x0: 0, y0: 0,
  hgt: null, vel: null, solid: null, tone: null,
  canvas: null, cx: null, img: null,
  deco: null, mist: null,
  pads: [], ripples: [], flies: [], mists: [],
  lastP: null, dripT: 0, boss: null,
};

// --- setup ---------------------------------------------------------------

function ensure(room) {
  const b = arenaBounds();
  const key = `${b.l}|${b.t}|${b.r}|${b.b}|${room.obstacles.length}`;
  if (sim.key === key && sim.room === room && sim.hgt) return;
  sim.key = key;
  sim.room = room;

  const w = Math.ceil((b.r - b.l) / CELL) + 2;
  const h = Math.ceil((b.b - b.t) / CELL) + 2;
  sim.w = w; sim.h = h;
  sim.x0 = b.l - CELL / 2;
  sim.y0 = b.t - CELL / 2;
  sim.hgt = new Float32Array(w * h);
  sim.vel = new Float32Array(w * h);
  sim.solid = new Uint8Array(w * h);
  sim.tone = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const wx = sim.x0 + x * CELL, wy = sim.y0 + y * CELL;
      // Pillars are rock: the surface is pinned there, so ripples reflect.
      for (const o of room.obstacles) {
        if (wx > o.x - 3 && wx < o.x + o.w + 3 && wy > o.y - 3 && wy < o.y + o.h + 3) sim.solid[i] = 1;
      }
      // Shallow near the walls, murky patches out in the middle.
      const edge = Math.min(wx - b.l, b.r - wx, wy - b.t, b.b - wy);
      const shallow = clamp(1 - edge / 130, 0, 1);
      const murk = 0.5 + 0.5 * Math.sin(wx * 0.013 + Math.sin(wy * 0.021) * 2) * Math.cos(wy * 0.017 + wx * 0.007);
      sim.tone[i] = clamp(shallow * 0.75 + murk * 0.3, 0, 1);
    }
  }

  sim.canvas = document.createElement('canvas');
  sim.canvas.width = w;
  sim.canvas.height = h;
  sim.cx = sim.canvas.getContext('2d');
  sim.img = sim.cx.createImageData(w, h);

  // Lily pads, drifting where the water pushes them.
  sim.pads = [];
  for (let k = 0; k < 11; k++) {
    const pad = {
      x: rand(b.l + 40, b.r - 40), y: rand(b.t + 40, b.b - 40),
      r: rand(11, 19), rot: rand(0, TAU), spin: 0, vx: 0, vy: 0,
      flower: Math.random() < 0.35 ? (Math.random() < 0.5 ? '#ffd0e6' : '#fff6e0') : null,
    };
    for (const o of room.obstacles) resolveCircleRect(pad, o);
    sim.pads.push(pad);
  }
  sim.flies = [];
  for (let k = 0; k < 14; k++) {
    sim.flies.push({ x: rand(b.l, b.r), y: rand(b.t, b.b), a: rand(0, TAU), ph: rand(0, TAU) });
  }
  sim.mists = [];
  for (let k = 0; k < 5; k++) {
    sim.mists.push({ x: rand(b.l, b.r), y: rand(b.t, b.b), s: rand(260, 420), v: rand(6, 16) * (Math.random() < 0.5 ? -1 : 1) });
  }
  sim.ripples = [];
  sim.deco = makeDeco(b);
  sim.mist = sim.mist || makeMistSprite();
  sim.lastP = null;
  sim.boss = null;
}

/** Reeds, cattails and mangrove roots around the edges, drawn once. */
function makeDeco(b) {
  const pad = 26;
  const c = document.createElement('canvas');
  c.width = Math.ceil(b.r - b.l + pad * 2);
  c.height = Math.ceil(b.b - b.t + pad * 2);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;

  // Mangrove roots arching out of the corners.
  g.lineCap = 'round';
  const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    for (let k = 0; k < 6; k++) {
      const len = 60 + Math.random() * 90;
      const a = Math.atan2(sy, sx) + (Math.random() - 0.5) * 1.3;
      const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      g.strokeStyle = k % 2 ? '#1b140f' : '#2a2016';
      g.lineWidth = 5 + Math.random() * 6;
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(a + 0.5) * len * 0.6, cy + Math.sin(a + 0.5) * len * 0.6, ex, ey);
      g.stroke();
    }
  }

  // Reed tufts along every wall, leaning into the water.
  const tuft = (x, y, lean) => {
    const n = 4 + ((Math.random() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const a = lean + (Math.random() - 0.5) * 1.2;
      const len = 14 + Math.random() * 22;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      g.strokeStyle = Math.random() < 0.5 ? '#2f4a1f' : '#3e5e27';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a - 0.3) * len * 0.5, y + Math.sin(a - 0.3) * len * 0.5, ex, ey);
      g.stroke();
      if (Math.random() < 0.18) {
        g.fillStyle = '#5a3a22';
        g.beginPath();
        g.ellipse(ex, ey, 2.4, 5, a + Math.PI / 2, 0, TAU);
        g.fill();
      }
    }
  };
  for (let x = 20; x < W - 20; x += 26 + Math.random() * 30) {
    tuft(x, pad - 2, Math.PI / 2);
    tuft(x, H - pad + 2, -Math.PI / 2);
  }
  for (let y = 20; y < H - 20; y += 26 + Math.random() * 30) {
    tuft(pad - 2, y, 0);
    tuft(W - pad + 2, y, Math.PI);
  }
  return { canvas: c, pad };
}

function makeMistSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(210,235,220,1)');
  grd.addColorStop(1, 'rgba(210,235,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// --- disturbing the water --------------------------------------------------
// `amt` is an impulse on the surface: negative presses it down (a step, a
// dive), positive throws it up (an eruption).

function disturb(x, y, r, amt) {
  if (!sim.hgt) return;
  const cx = (x - sim.x0) / CELL, cy = (y - sim.y0) / CELL;
  const cr = Math.max(1.3, r / CELL);
  const xa = Math.max(1, Math.floor(cx - cr)), xb = Math.min(sim.w - 2, Math.ceil(cx + cr));
  const ya = Math.max(1, Math.floor(cy - cr)), yb = Math.min(sim.h - 2, Math.ceil(cy + cr));
  for (let yy = ya; yy <= yb; yy++) {
    for (let xx = xa; xx <= xb; xx++) {
      const d = Math.hypot(xx - cx, yy - cy);
      if (d > cr) continue;
      const i = yy * sim.w + xx;
      if (sim.solid[i]) continue;
      sim.vel[i] += amt * (0.5 + 0.5 * Math.cos(Math.PI * d / cr));
    }
  }
}

function addRipple(x, y, r0, r1, life, alpha = 0.5) {
  if (sim.ripples.length > 48) sim.ripples.shift();
  sim.ripples.push({ x, y, r0, r1, t: 0, life, alpha });
}

/** A splash: a push on the surface, plus crisp rings spreading out. */
export function mireSplash(x, y, r, amt, rings = 2) {
  disturb(x, y, r, amt);
  for (let k = 0; k < rings; k++) {
    addRipple(x, y, r * 0.4, r * (2.2 + k * 1.1), 0.9 + k * 0.35, 0.55 - k * 0.1);
  }
}

/** A ring of disturbance (a tail sweep, a shockwave through the water). */
export function mireRing(x, y, radius, amt) {
  const n = Math.max(12, Math.round(radius / 12));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    disturb(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 16, amt);
  }
  addRipple(x, y, radius * 0.8, radius * 1.5, 0.8, 0.45);
}

/** A bow wave: water heaped up ahead of something moving, sucked in behind. */
export function mireWake(x, y, angle, len, amt) {
  disturb(x + Math.cos(angle) * len, y + Math.sin(angle) * len, len * 0.6, amt);
  disturb(x - Math.cos(angle) * len * 0.8, y - Math.sin(angle) * len * 0.8, len * 0.7, -amt * 0.7);
}

/** Bubbles breaking the surface around a point (something rising beneath). */
export function mireBubble(x, y, spread, amt = 0.6) {
  const a = rand(0, TAU), d = rand(0, spread);
  const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
  disturb(bx, by, 10, amt);
  addRipple(bx, by, 2, 22, 0.45, 0.6);
}

// --- per frame -------------------------------------------------------------

function step() {
  const { w, h, hgt, vel, solid } = sim;
  for (let y = 1; y < h - 1; y++) {
    let i = y * w + 1;
    for (let x = 1; x < w - 1; x++, i++) {
      if (solid[i]) { vel[i] = 0; hgt[i] = 0; continue; }
      const lap = hgt[i - 1] + hgt[i + 1] + hgt[i - w] + hgt[i + w] - 4 * hgt[i];
      vel[i] = (vel[i] + lap * C2) * DAMP;
    }
  }
  for (let i = 0; i < hgt.length; i++) hgt[i] += vel[i];
}

function heightAt(x, y) {
  const cx = Math.round((x - sim.x0) / CELL), cy = Math.round((y - sim.y0) / CELL);
  if (cx < 1 || cy < 1 || cx > sim.w - 2 || cy > sim.h - 2) return { h: 0, gx: 0, gy: 0 };
  const i = cy * sim.w + cx, w = sim.w, H = sim.hgt;
  return { h: H[i], gx: H[i + 1] - H[i - 1], gy: H[i + w] - H[i - w] };
}

function tick(room, dt) {
  ensure(room);
  const b = arenaBounds();
  const p = world.player;

  // The player wades: every step presses the water, a dash ploughs it.
  if (p && !p.dead) {
    if (sim.lastP) {
      const sp = dist(p.x, p.y, sim.lastP.x, sim.lastP.y) / Math.max(dt, 1e-4);
      if (sp > 25) {
        disturb(p.x, p.y, p.r * 0.9, -Math.min(sp, 1400) * 0.0007);
        sim.stepT = (sim.stepT || 0) - dt;
        if (sim.stepT <= 0) {
          addRipple(p.x, p.y + p.r * 0.4, p.r * 0.5, p.r * 2.4, 0.7, p.dashing ? 0.5 : 0.3);
          sim.stepT = p.dashing ? 0.04 : 0.24;
        }
      }
    }
    sim.lastP = { x: p.x, y: p.y };
  }

  // Everything else that walks the water leaves a wake too.
  for (const e of world.enemies) {
    if (e.dead || e.spawning || e.hidden || (e.z || 0) > 4) continue;
    const sp = Math.hypot(e.mvx || 0, e.mvy || 0);
    if (sp > 20) disturb(e.x, e.y, e.r * 0.85, -Math.min(sp, 900) * 0.0006 * clamp(e.r / 16, 0.6, 3));
  }

  // The guardian's last breath: a great upheaval where it fell.
  const boss = world.enemies.find((e) => e.boss);
  if (boss && !boss.dead) sim.boss = { x: boss.x, y: boss.y, alive: true };
  else if (sim.boss && sim.boss.alive) {
    sim.boss.alive = false;
    mireSplash(sim.boss.x, sim.boss.y, 90, 5, 4);
  }

  // A swamp is never still: drips from the roots, a fish rising.
  sim.dripT -= dt;
  if (sim.dripT <= 0) {
    sim.dripT = rand(0.18, 0.5);
    const x = rand(b.l + 20, b.r - 20), y = rand(b.t + 20, b.b - 20);
    disturb(x, y, 10, -0.5);
    addRipple(x, y, 1, rand(18, 34), 0.9, 0.35);
  }

  step();

  // Lily pads ride the surface: they slide off crests and get shoved aside.
  for (const pad of sim.pads) {
    const s = heightAt(pad.x, pad.y);
    pad.vx += -s.gx * 14 * dt * 60;
    pad.vy += -s.gy * 14 * dt * 60;
    pad.spin += s.gx * 0.5 * dt * 60;
    for (const e of [p, ...world.enemies]) {
      if (!e || e.dead || e.hidden) continue;
      const d = dist(e.x, e.y, pad.x, pad.y);
      if (d < e.r + pad.r && d > 0.01) {
        const k = (e.r + pad.r - d) / d;
        pad.vx += (pad.x - e.x) * k * 6;
        pad.vy += (pad.y - e.y) * k * 6;
        pad.spin += (Math.random() - 0.5) * 2;
      }
    }
    const f = Math.exp(-1.6 * dt);
    pad.vx *= f; pad.vy *= f; pad.spin *= Math.exp(-2 * dt);
    pad.x = clamp(pad.x + pad.vx * dt, b.l + pad.r, b.r - pad.r);
    pad.y = clamp(pad.y + pad.vy * dt, b.t + pad.r, b.b - pad.r);
    pad.rot += pad.spin * dt;
    for (const o of room.obstacles) resolveCircleRect(pad, o);
    pad.bob = s.h;
  }

  for (let i = sim.ripples.length - 1; i >= 0; i--) {
    const r = sim.ripples[i];
    r.t += dt;
    if (r.t >= r.life) sim.ripples.splice(i, 1);
  }
  for (const f of sim.flies) {
    f.a += (Math.random() - 0.5) * 3 * dt;
    f.x += Math.cos(f.a) * 18 * dt;
    f.y += Math.sin(f.a) * 18 * dt;
    if (f.x < b.l || f.x > b.r || f.y < b.t || f.y > b.b) f.a += Math.PI;
  }
  for (const m of sim.mists) {
    m.x += m.v * dt;
    if (m.x < b.l - m.s) m.x = b.r + m.s * 0.5;
    if (m.x > b.r + m.s) m.x = b.l - m.s * 0.5;
  }
}

// --- drawing ---------------------------------------------------------------

function paint(time) {
  const { w, h, hgt, tone, solid } = sim;
  const d = sim.img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      const t = tone[i];
      let r = 10 + t * 24, g = 27 + t * 34, bl = 28 + t * 18;
      if (solid[i]) { d[p] = r * 0.5; d[p + 1] = g * 0.5; d[p + 2] = bl * 0.5; d[p + 3] = 255; continue; }
      let l = 0;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        l = (hgt[i - 1] - hgt[i + 1] + hgt[i - w] - hgt[i + w]) * LIGHT;
      }
      // A slow swell so the water never looks painted on.
      l += Math.sin(x * 0.55 + time * 0.9) * Math.sin(y * 0.7 - time * 0.6) * 0.07;
      if (l > 1.3) l = 1.3; else if (l < -1.3) l = -1.3;
      if (l > 0) {
        r += l * 80; g += l * 118; bl += l * 104;
        if (l > 0.65) { const s = (l - 0.65) * 150; r += s; g += s; bl += s; }
      } else {
        const k = 1 + l * 0.5;
        r *= k; g *= k; bl *= k;
      }
      d[p] = r; d[p + 1] = g; d[p + 2] = bl; d[p + 3] = 255;
    }
  }
  sim.cx.putImageData(sim.img, 0, 0);
}

function draw(ctx, room, time) {
  ensure(room);
  const b = arenaBounds();
  const aw = b.r - b.l, ah = b.b - b.t;

  paint(time);
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.l, b.t, aw, ah);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sim.canvas, 0.5, 0.5, sim.w - 1, sim.h - 1, sim.x0 + CELL / 2, sim.y0 + CELL / 2, (sim.w - 1) * CELL, (sim.h - 1) * CELL);

  // A sheen of moonlight sliding slowly across the surface.
  const sx = b.l + ((time * 40) % (aw + 600)) - 300;
  const sheen = ctx.createLinearGradient(sx - 220, b.t, sx + 220, b.b);
  sheen.addColorStop(0, 'rgba(180,230,220,0)');
  sheen.addColorStop(0.5, 'rgba(180,230,220,0.06)');
  sheen.addColorStop(1, 'rgba(180,230,220,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(b.l, b.t, aw, ah);

  // Crisp ripple rings on top of the soft simulated ones.
  ctx.lineWidth = 1.6;
  for (const r of sim.ripples) {
    const k = r.t / r.life;
    const rr = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
    ctx.globalAlpha = r.alpha * (1 - k);
    ctx.strokeStyle = '#d8f5e8';
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, rr, rr * 0.82, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Lily pads, bobbing with the water beneath them.
  for (const pad of sim.pads) {
    const s = 1 + clamp(pad.bob || 0, -2, 2) * 0.04;
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(pad.rot);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, pad.r, pad.r * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3f6e2c';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, pad.r, 0.3, TAU - 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5d8f3c';
    ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const a = 0.6 + k * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * pad.r * 0.85, Math.sin(a) * pad.r * 0.85);
      ctx.stroke();
    }
    if (pad.flower) {
      ctx.fillStyle = pad.flower;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 4, Math.sin(a) * 4, 4, 2.2, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd45e';
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Wading rings at everyone's feet: they stand in the water, not on it.
  const wade = (e) => {
    const wob = Math.sin(time * 5 + e.x * 0.05) * 1.5;
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#d8f5e8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.5, e.r * 1.05 + wob, e.r * 0.48 + wob * 0.4, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  const p = world.player;
  if (p && !p.dead) wade(p);
  for (const e of world.enemies) {
    if (!e.dead && !e.spawning && !e.hidden && !((e.z || 0) > 4)) wade(e);
  }

  // Floor mist, drifting.
  for (const m of sim.mists) {
    ctx.globalAlpha = 0.07;
    ctx.drawImage(sim.mist, m.x - m.s / 2, m.y - m.s * 0.3, m.s, m.s * 0.6);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Reeds and roots at the edges, over the waterline.
  ctx.drawImage(sim.deco.canvas, b.l - sim.deco.pad, b.t - sim.deco.pad);

  // Fireflies.
  for (const f of sim.flies) {
    const glow = 0.4 + 0.6 * Math.max(0, Math.sin(time * 2.2 + f.ph));
    ctx.globalAlpha = glow * 0.25;
    ctx.fillStyle = '#e8ff9a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = glow;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Hooks for a boss spec: `drawArena` and `arenaTick`. */
export const MIRE_ARENA = { draw, tick };
