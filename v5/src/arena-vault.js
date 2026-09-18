// The Drowned Vault: Gravemaw's arena, a sunken treasure vault under clear
// blue water.
//
// Built on the water engine (water-engine.js), like the Mire, but the water
// here is clear: a carved vault floor lies underneath - slabs, a great shell
// mosaic, scattered gold - and the ripples bend it (refraction). Light nets
// (caustics) crawl across the shallows and gather where waves focus them,
// shafts of light slant down through the water, fish dart away from anything
// that comes near, weed sways along the walls, and bubbles rise everywhere:
// from vents in the floor and, most of all, off the old turtle's shell.
//
// Gravemaw's moves play on it: his stomps send real waves across the room,
// his mortar shells splash down, and his Shell Spin churns the water into a
// **whirlpool** that follows him and drags the bubbles and fish round.
//
// Purely cosmetic: nothing here changes how the fight plays.

import { world } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff } from './util.js';
import { createWaterArena } from './water-engine.js';

// --- the floor beneath -----------------------------------------------------

function makeVaultFloor(b) {
  const W = Math.ceil(b.r - b.l), H = Math.ceil(b.b - b.t);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Stone slabs, each a slightly different shade, with dark seams.
  g.fillStyle = '#35565a';
  g.fillRect(0, 0, W, H);
  const S = 84;
  for (let y = -S / 2; y < H; y += S) {
    const off = (Math.floor(y / S) % 2) * S * 0.5;
    for (let x = -S; x < W; x += S) {
      const v = rand(-10, 10);
      g.fillStyle = `rgb(${52 + v},${84 + v},${86 + v})`;
      g.fillRect(x + off + 2, y + 2, S - 4, S - 4);
      if (Math.random() < 0.25) {
        // A crack across the slab.
        g.strokeStyle = 'rgba(15,30,32,0.6)';
        g.lineWidth = 1.5;
        g.beginPath();
        let cx = x + off + rand(10, S - 10), cy = y + rand(10, S - 10);
        g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += rand(-16, 16); cy += rand(-16, 16); g.lineTo(cx, cy); }
        g.stroke();
      }
    }
  }

  // The great shell mosaic in the middle: rings of tile and a nautilus spiral.
  const mx = W / 2, my = H / 2;
  for (let r = 150; r > 20; r -= 14) {
    g.strokeStyle = r % 28 === 10 ? 'rgba(212,178,92,0.55)' : 'rgba(96,170,160,0.5)';
    g.lineWidth = 6;
    g.setLineDash([9, 4]);
    g.beginPath();
    g.arc(mx, my, r, 0, TAU);
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(232,200,120,0.75)';
  g.lineWidth = 5;
  g.beginPath();
  for (let k = 0; k <= 160; k++) {
    const a = k * 0.1;
    const r = 6 * Math.exp(0.16 * a);
    const px = mx + Math.cos(a) * r, py = my + Math.sin(a) * r;
    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    if (r > 140) break;
  }
  g.stroke();

  // Algae and drifted sand.
  for (let k = 0; k < 26; k++) {
    const x = rand(0, W), y = rand(0, H);
    const near = Math.min(x, W - x, y, H - y) < 120;
    g.fillStyle = near ? 'rgba(214,196,140,0.18)' : 'rgba(60,120,70,0.2)';
    g.beginPath();
    g.ellipse(x, y, rand(20, 60), rand(10, 30), rand(0, TAU), 0, TAU);
    g.fill();
  }

  // Scattered treasure: coins, a few gems, broken amphorae.
  for (let k = 0; k < 46; k++) {
    const x = rand(10, W - 10), y = rand(10, H - 10);
    g.fillStyle = '#c9a23a';
    g.beginPath();
    g.ellipse(x, y, 4, 3, rand(0, TAU), 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,240,170,0.8)';
    g.fillRect(x - 1, y - 1.5, 1.5, 1.2);
  }
  for (let k = 0; k < 7; k++) {
    g.fillStyle = ['#3fd6c8', '#d04a7a', '#7a6cff'][k % 3];
    g.beginPath();
    g.arc(rand(10, W - 10), rand(10, H - 10), 3, 0, TAU);
    g.fill();
  }
  for (let k = 0; k < 4; k++) {
    const x = rand(60, W - 60), y = rand(60, H - 60), a = rand(0, TAU);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = '#8a5a3a';
    g.beginPath();
    g.ellipse(0, 0, 18, 11, 0, 0.4, TAU - 0.4);
    g.fill();
    g.fillStyle = '#6a4028';
    g.fillRect(16, -4, 10, 8);
    g.restore();
  }
  return c;
}

/** The vault walls: a carved stone lip with barnacles and fallen columns. */
function makeVaultRim(b) {
  const pad = 22;
  const c = document.createElement('canvas');
  c.width = Math.ceil(b.r - b.l + pad * 2);
  c.height = Math.ceil(b.b - b.t + pad * 2);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;

  g.strokeStyle = 'rgba(120,190,185,0.35)';
  g.lineWidth = 3;
  g.strokeRect(pad - 3, pad - 3, W - pad * 2 + 6, H - pad * 2 + 6);

  // Barnacle clusters where the water meets the stone.
  const cluster = (x, y) => {
    for (let k = 0; k < 6; k++) {
      const bx = x + rand(-10, 10), by = y + rand(-10, 10), r = rand(2, 4.5);
      g.fillStyle = '#c8d6cc';
      g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
      g.fillStyle = '#3a4a48';
      g.beginPath(); g.arc(bx, by, r * 0.4, 0, TAU); g.fill();
    }
  };
  for (let x = 30; x < W - 30; x += rand(60, 120)) { cluster(x, pad); cluster(x, H - pad); }
  for (let y = 30; y < H - 30; y += rand(60, 120)) { cluster(pad, y); cluster(W - pad, y); }

  // Toppled columns breaking the surface in the corners, ringed with foam.
  for (const [x, y] of [[pad + 26, pad + 26], [W - pad - 26, pad + 26], [pad + 26, H - pad - 26], [W - pad - 26, H - pad - 26]]) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.arc(x + 4, y + 5, 21, 0, TAU); g.fill();
    g.fillStyle = '#9fb0a8';
    g.beginPath(); g.arc(x, y, 20, 0, TAU); g.fill();
    g.strokeStyle = '#7a8c86';
    g.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      g.beginPath(); g.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.lineTo(x + Math.cos(a) * 19, y + Math.sin(a) * 19); g.stroke();
    }
    g.strokeStyle = 'rgba(230,250,255,0.5)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 25, 0, TAU); g.stroke();
  }
  return { canvas: c, pad };
}

// --- the water itself -------------------------------------------------------

/** Clear blue water: see-through in the shallows, with crawling caustics. */
function shadeVault(d, p, t, l, lap, x, y, time, solid) {
  let r = 6 + t * 18, g = 40 + t * 44, b = 66 + t * 42;
  let a = 170 - t * 75;
  if (solid) { d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255; return; }

  // Caustics: a crawling net of light, brightest in the shallows, plus the
  // light the waves themselves focus (where the surface curves in).
  const c1 = Math.sin(x * 0.9 + time * 1.4 + Math.sin(y * 0.6 + time) * 1.8);
  const c2 = Math.sin(y * 0.8 - time * 1.1 + Math.sin(x * 0.5 - time * 0.7) * 1.6);
  let caus = 1 - Math.abs(c1 + c2) * 0.5;
  caus = caus * caus * caus * caus * (0.22 + t * 0.5) + Math.max(0, -lap) * 0.9;
  r += caus * 48; g += caus * 82; b += caus * 84; a += caus * 28;

  if (l > 0) {
    r += l * 66; g += l * 116; b += l * 146; a += l * 55;
    if (l > 0.6) { const s = (l - 0.6) * 170; r += s; g += s; b += s; a += s * 0.4; }
  } else {
    const k = 1 + l * 0.45;
    r *= k; g *= k; b *= k; a -= l * 30;
  }
  d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a;
}

// --- the life in it ------------------------------------------------------------

function buildLife(sim, b) {
  const s = sim.state;
  s.bubbles = [];
  s.vents = [];
  for (let k = 0; k < 4; k++) s.vents.push({ x: rand(b.l + 60, b.r - 60), y: rand(b.t + 60, b.b - 60), t: rand(0, 1) });
  s.fish = [];
  for (let k = 0; k < 6; k++) {
    s.fish.push({ x: rand(b.l, b.r), y: rand(b.t, b.b), a: rand(0, TAU), sp: rand(40, 70), size: rand(7, 12), ph: rand(0, TAU) });
  }
  s.weed = [];
  const along = (x, y, lean) => s.weed.push({ x, y, lean, len: rand(26, 50), ph: rand(0, TAU) });
  for (let x = b.l + 20; x < b.r - 20; x += rand(40, 80)) { along(x, b.t + 4, Math.PI / 2); along(x, b.b - 4, -Math.PI / 2); }
  for (let y = b.t + 20; y < b.b - 20; y += rand(40, 80)) { along(b.l + 4, y, 0); along(b.r - 4, y, Math.PI); }
  s.rays = [];
  for (let k = 0; k < 4; k++) s.rays.push({ u: rand(0, 1), w: rand(60, 120), sp: rand(0.006, 0.014) * (Math.random() < 0.5 ? -1 : 1) });
  s.motes = [];
  for (let k = 0; k < 34; k++) s.motes.push({ x: rand(b.l, b.r), y: rand(b.t, b.b), ph: rand(0, TAU) });
}

function addBubble(s, x, y, big = false) {
  if (s.bubbles.length > 140) s.bubbles.shift();
  s.bubbles.push({ x, y, r: big ? rand(4, 7) : rand(2, 4), t: 0, life: rand(0.9, 1.8), vx: rand(-12, 12), vy: rand(-12, 12), ph: rand(0, TAU) });
}

function tickLife(sim, room, dt, api) {
  const s = sim.state;
  if (!s.bubbles) return;
  const p = world.player;

  // Vents in the floor breathe out strings of bubbles.
  for (const v of s.vents) {
    v.t -= dt;
    if (v.t <= 0) { v.t = rand(0.25, 0.8); addBubble(s, v.x + rand(-6, 6), v.y + rand(-6, 6)); }
  }
  // The old turtle is never without a trail of them; more when he spins or
  // gathers the tide.
  const turtle = world.enemies.find((e) => e.type === 'turtle' && !e.dead && !e.spawning);
  if (turtle) {
    const busy = turtle.action === 'spin' || turtle.action === 'tide';
    s.shellT = (s.shellT || 0) - dt;
    if (s.shellT <= 0) {
      s.shellT = busy ? 0.04 : 0.22;
      const a = rand(0, TAU);
      addBubble(s, turtle.x + Math.cos(a) * turtle.r * 0.9, turtle.y + Math.sin(a) * turtle.r * 0.9, busy && Math.random() < 0.3);
    }
  }
  // Dashing through the water tears a line of bubbles.
  if (p && p.dashing && Math.random() < dt * 40) addBubble(s, p.x + rand(-6, 6), p.y + rand(-6, 6));

  for (let i = s.bubbles.length - 1; i >= 0; i--) {
    const bu = s.bubbles[i];
    bu.t += dt;
    const sw = api.swirlAt(bu.x, bu.y);
    bu.x += (bu.vx + sw.vx + Math.sin(bu.t * 7 + bu.ph) * 10) * dt;
    bu.y += (bu.vy + sw.vy) * dt;
    if (bu.t >= bu.life) {
      // It breaks the surface: a tiny push and a ring.
      api.disturb(bu.x, bu.y, 8, 0.35 + bu.r * 0.05);
      if (bu.r > 3.5 || Math.random() < 0.3) api.addRipple(bu.x, bu.y, 1, 10 + bu.r * 3, 0.45, 0.4);
      s.bubbles.splice(i, 1);
    }
  }

  // Fish: wander, and dart away from anything big that comes near.
  const b = { l: sim.x0, t: sim.y0, r: sim.x0 + sim.w * 10, bb: sim.y0 + sim.h * 10 };
  for (const f of s.fish) {
    let flee = null;
    for (const e of [p, ...world.enemies]) {
      if (!e || e.dead || e.hidden) continue;
      if (dist(e.x, e.y, f.x, f.y) < 90 + e.r) { flee = e; break; }
    }
    if (flee) {
      const away = angleTo(flee.x, flee.y, f.x, f.y);
      f.a += clamp(angleDiff(f.a, away), -8 * dt, 8 * dt);
      f.boost = 3;
    } else {
      f.a += (Math.random() - 0.5) * 2 * dt;
    }
    f.boost = Math.max(1, (f.boost || 1) - dt * 2);
    const sw = api.swirlAt(f.x, f.y);
    f.x += (Math.cos(f.a) * f.sp * f.boost + sw.vx) * dt;
    f.y += (Math.sin(f.a) * f.sp * f.boost + sw.vy) * dt;
    if (f.x < b.l + 20 || f.x > b.r - 20) f.a = Math.PI - f.a;
    if (f.y < b.t + 20 || f.y > b.bb - 20) f.a = -f.a;
    f.x = clamp(f.x, b.l + 20, b.r - 20);
    f.y = clamp(f.y, b.t + 20, b.bb - 20);
    f.ph += dt * (6 + f.boost * 6);
  }
  for (const r of s.rays) r.u = (r.u + r.sp * dt + 1) % 1;
}

/** Under the surface: weed along the walls and fish. The water tints them. */
function drawUnder(ctx, sim, time) {
  const s = sim.state;
  if (!s.fish) return;
  ctx.lineCap = 'round';
  for (const wd of s.weed) {
    const sway = Math.sin(time * 1.3 + wd.ph) * 0.35;
    ctx.strokeStyle = '#2f7a4e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wd.x, wd.y);
    const a1 = wd.lean + sway * 0.5, a2 = wd.lean + sway;
    const mx = wd.x + Math.cos(a1) * wd.len * 0.5, my = wd.y + Math.sin(a1) * wd.len * 0.5;
    ctx.quadraticCurveTo(mx, my, mx + Math.cos(a2) * wd.len * 0.5, my + Math.sin(a2) * wd.len * 0.5);
    ctx.stroke();
  }
  for (const f of s.fish) {
    const tail = Math.sin(f.ph) * 0.5;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.fillStyle = 'rgba(10,26,34,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, f.size, f.size * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-f.size * 0.8, 0);
    ctx.lineTo(-f.size * 1.6, -f.size * 0.5 + tail * 4);
    ctx.lineTo(-f.size * 1.6, f.size * 0.5 + tail * 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** On the surface: the bubbles, each a little glassy dome. */
function drawBubbles(ctx, sim) {
  const s = sim.state;
  if (!s.bubbles) return;
  for (const bu of s.bubbles) {
    const k = bu.t / bu.life;
    const r = bu.r * (0.6 + k * 0.6);
    ctx.globalAlpha = 0.55 * (k < 0.15 ? k / 0.15 : 1);
    ctx.strokeStyle = '#e6fbff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bu.x, bu.y, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bu.x - r * 0.35, bu.y - r * 0.35, Math.max(0.8, r * 0.3), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Shafts of light slanting down from above, with motes drifting in them. */
function drawRays(ctx, sim, time, b) {
  const s = sim.state;
  if (!s.rays) return;
  const aw = b.r - b.l, ah = b.b - b.t;
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.l, b.t, aw, ah);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (const r of s.rays) {
    const x = b.l - 200 + r.u * (aw + 400);
    const pulse = 0.6 + Math.sin(time * 0.7 + r.w) * 0.4;
    const grd = ctx.createLinearGradient(x, b.t, x + 160, b.b);
    grd.addColorStop(0, `rgba(170,230,255,${0.07 * pulse})`);
    grd.addColorStop(1, 'rgba(170,230,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x, b.t);
    ctx.lineTo(x + r.w, b.t);
    ctx.lineTo(x + r.w + 200, b.b);
    ctx.lineTo(x + 200, b.b);
    ctx.closePath();
    ctx.fill();
  }
  for (const m of s.motes) {
    ctx.globalAlpha = 0.25 + Math.sin(time * 1.7 + m.ph) * 0.2;
    ctx.fillStyle = '#d8f8ff';
    ctx.fillRect(m.x + Math.sin(time * 0.4 + m.ph) * 8, m.y + Math.cos(time * 0.3 + m.ph) * 6, 1.6, 1.6);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

const VAULT = createWaterArena({
  shade: shadeVault,
  floor: makeVaultFloor,
  refract: 7,
  deco: makeVaultRim,
  swell: 0.05,
  drip: { min: 0.5, max: 1.2, amt: -0.35 },
  sheen: '190,235,255',
  rippleColor: '#e6fbff',
  onBuild: buildLife,
  onTick: tickLife,
  onDrawFloor: drawUnder,
  onDrawWater: drawBubbles,
  onDrawOver: drawRays,
});

/** Hooks for the turtle's spec: `drawArena` and `arenaTick`. */
export const VAULT_ARENA = { draw: VAULT.draw, tick: VAULT.tick };
export const vaultSplash = VAULT.splash;
export const vaultRing = VAULT.ring;
export const vaultWake = VAULT.wake;
export const vaultVortex = VAULT.vortex;

/** A burst of bubbles, as from a splash or a shell striking the floor. */
export function vaultBubbles(x, y, n, spread) {
  const s = VAULT.sim.state;
  if (!s.bubbles) return;
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU), d = rand(0, spread);
    addBubble(s, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.random() < 0.4);
  }
}
