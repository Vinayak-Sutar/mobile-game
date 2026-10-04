// The Peacock Court: Solenne's arena, a moonlit palace courtyard after the
// Mor Chowk (the Peacock Courtyard) of Udaipur's City Palace and the Mughal
// charbagh garden.
//
// A floor of dark marble with pietra-dura inlay (thin gold borders, an
// eight-pointed star in every slab); two water channels crossing it in a
// charbagh, meeting at an octagonal fountain with a stone lotus; along the
// top, a colonnade of cusped arches with jali screens and peacock mosaics
// between them; domed chhatris in the corners; diya oil lamps along the
// walls.
//
// It is kept dark and quiet on purpose: Solenne fills the air with teal and
// gold, and nothing here may compete with a bullet.
//
// It lives: the lamps flicker and lean away from anything that rushes past;
// marigold and rose petals drift down and are thrown about by her wingbeats;
// light runs along the channels and lotus flowers float in them; the fountain
// plays, and surges when she spreads her tail; the great star at the centre
// lights up under her Display; moonlight falls through the jali in a lattice
// of shadow; and when she calls her watching eyes, the eyes of the mosaic
// peacocks open too.
//
// Purely cosmetic.

import { world, arenaBounds, gfx } from './state.js';
import { TAU, clamp, rand, dist } from './util.js';

const st = {
  key: '', room: null,
  floor: null, rim: null, jali: null,
  lamps: [], petals: [], drops: [], lotus: [], glow: 0, surge: 0, eyes: 0,
};

const CH = 20;          // channel width

// --- setup ------------------------------------------------------------------------

function ensure(room) {
  const b = arenaBounds();
  const key = `${b.l}|${b.t}|${b.r}|${b.b}|${gfx.epoch}`;
  if (st.key === key && st.room === room && st.floor) return;
  st.key = key;
  st.room = room;
  st.floor = makeFloor(b);
  st.rim = makeRim(b);
  st.jali = makeJaliShadow(b);
  st.lamps = [];
  const W = b.r - b.l, H = b.b - b.t;
  for (let k = 1; k < 8; k++) st.lamps.push({ x: b.l + (W * k) / 8, y: b.b - 10, ph: rand(0, TAU), lean: 0, dim: 0 });
  for (let k = 1; k < 4; k++) {
    st.lamps.push({ x: b.l + 10, y: b.t + (H * k) / 4, ph: rand(0, TAU), lean: 0, dim: 0 });
    st.lamps.push({ x: b.r - 10, y: b.t + (H * k) / 4, ph: rand(0, TAU), lean: 0, dim: 0 });
  }
  st.petals = [];
  for (let k = 0; k < 34; k++) st.petals.push(newPetal(b, true));
  st.drops = [];
  st.lotus = [];
  const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
  for (let k = 0; k < 4; k++) {
    const horiz = k < 2;
    st.lotus.push({ horiz, u: rand(0.1, 0.9), v: rand(12, 22) * (Math.random() < 0.5 ? -1 : 1), cx, cy });
  }
}

function makeFloor(b) {
  const W = Math.ceil(b.r - b.l), H = Math.ceil(b.b - b.t);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2, cy = H / 2;

  // Night marble, faintly veined.
  g.fillStyle = '#2a2433';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(160,150,190,0.06)';
  g.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    let x = rand(0, W), y = rand(0, H), a = rand(0, TAU);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { a += rand(-0.5, 0.5); x += Math.cos(a) * 20; y += Math.sin(a) * 20; g.lineTo(x, y); }
    g.stroke();
  }

  // Pietra-dura slabs: thin gold borders, an eight-pointed star in each.
  const S = 96;
  for (let y = 0; y < H; y += S) {
    for (let x = 0; x < W; x += S) {
      g.strokeStyle = 'rgba(150,122,70,0.22)';
      g.lineWidth = 1.5;
      g.strokeRect(x + 3, y + 3, S - 6, S - 6);
      star(g, x + S / 2, y + S / 2, 9, 4, 'rgba(120,70,80,0.3)');
    }
  }

  // The charbagh: two channels crossing, lined in pale stone.
  const chan = (x, y, w, h) => {
    g.fillStyle = '#6e6272'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
    g.fillStyle = '#132438'; g.fillRect(x, y, w, h);
  };
  chan(0, cy - CH / 2, W, CH);
  chan(cx - CH / 2, 0, CH, H);

  // The octagonal fountain, with a stone lotus.
  octagon(g, cx, cy, 78, '#6e6272');
  octagon(g, cx, cy, 70, '#132438');
  g.fillStyle = '#8a7e8e';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 12, 6, a, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#b8a8b4';
  g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();

  // The great star of the court, inlaid around the fountain.
  g.strokeStyle = 'rgba(150,122,70,0.28)';
  g.lineWidth = 2;
  for (let r = 110; r <= 170; r += 30) {
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * TAU - Math.PI / 2;
      const rr = k % 2 ? r * 0.8 : r;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  }

  // A border of small lotus inlays along the walls.
  for (let x = 30; x < W - 20; x += 44) { lotusInlay(g, x, 14); lotusInlay(g, x, H - 14); }
  for (let y = 44; y < H - 30; y += 44) { lotusInlay(g, 14, y); lotusInlay(g, W - 14, y); }
  return c;
}

function star(g, x, y, r, points, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let k = 0; k <= points * 2; k++) {
    const a = (k / (points * 2)) * TAU - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.fill();
}

function octagon(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (k) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  g.fill();
}

function lotusInlay(g, x, y) {
  g.fillStyle = 'rgba(140,90,100,0.28)';
  for (let k = -1; k <= 1; k++) {
    g.beginPath();
    g.ellipse(x + k * 4, y, 2.6, 6, k * 0.5, 0, TAU);
    g.fill();
  }
}

/** The colonnade along the top, domed chhatris in the corners. */
function makeRim(b) {
  const pad = 18;
  const W = Math.ceil(b.r - b.l + pad * 2), H = Math.ceil(b.b - b.t + pad * 2);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Cusped arches with jali screens, and peacock mosaics between them.
  const n = Math.max(5, Math.round((W - 140) / 150));
  const span = (W - 140) / n;
  for (let i = 0; i < n; i++) {
    const x = 70 + span * i + span / 2;
    archWithJali(g, x, pad + 2, 44, 30);
    if (i < n - 1) peacockPanel(g, x + span / 2, pad + 14);
  }

  // Chhatris: small domed pavilions, seen from above.
  for (const [x, y] of [[pad + 26, pad + 26], [W - pad - 26, pad + 26], [pad + 26, H - pad - 26], [W - pad - 26, H - pad - 26]]) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.arc(x + 5, y + 6, 28, 0, TAU); g.fill();
    g.fillStyle = '#8a6e56';
    g.beginPath(); g.arc(x, y, 28, 0, TAU); g.fill();
    g.fillStyle = '#b8977a';
    g.beginPath(); g.arc(x, y, 21, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(80,58,44,0.6)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 21, y + Math.sin(a) * 21); g.stroke();
    }
    g.fillStyle = '#d8b870';
    g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
  }
  return { canvas: c, pad };
}

function archWithJali(g, x, y, w, h) {
  // The cusped (scalloped) arch: a pointed crown of small lobes.
  g.fillStyle = '#8a6e56';
  g.fillRect(x - w / 2 - 6, y, w + 12, h + 6);
  g.fillStyle = '#1a1422';
  g.beginPath();
  g.moveTo(x - w / 2, y + h + 6);
  g.lineTo(x - w / 2, y + h * 0.55);
  const lobes = 5;
  for (let k = 0; k <= lobes; k++) {
    const a = Math.PI + (k / lobes) * Math.PI;
    const lx = x + Math.cos(a) * w * 0.5, ly = y + h * 0.55 + Math.sin(a) * h * 0.45;
    g.quadraticCurveTo(lx, ly - 5, lx, ly);
  }
  g.lineTo(x + w / 2, y + h + 6);
  g.closePath();
  g.fill();
  // The jali: a lattice of small diamonds.
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(184,151,122,0.55)';
  g.lineWidth = 1;
  for (let d = -w; d < w * 2; d += 7) {
    g.beginPath(); g.moveTo(x - w / 2 + d, y); g.lineTo(x - w / 2 + d - h, y + h + 6); g.stroke();
    g.beginPath(); g.moveTo(x - w / 2 + d, y); g.lineTo(x - w / 2 + d + h, y + h + 6); g.stroke();
  }
  g.restore();
}

/** A peacock in glass mosaic: muted, so it never reads as a bullet. */
function peacockPanel(g, x, y) {
  g.fillStyle = '#3a2e3e';
  g.fillRect(x - 26, y - 12, 52, 30);
  // The fanned tail, a half-circle of feathers.
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    g.strokeStyle = k % 2 ? '#2f5a52' : '#3e6f7a';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + Math.cos(a) * 20, y + 12 + Math.sin(a) * 20); g.stroke();
    g.fillStyle = '#7a6436';
    g.beginPath(); g.arc(x + Math.cos(a) * 20, y + 12 + Math.sin(a) * 20, 2.2, 0, TAU); g.fill();
  }
  g.fillStyle = '#2c4a6a';
  g.beginPath(); g.ellipse(x, y + 10, 4, 7, 0, 0, TAU); g.fill();
}

/** Moonlight through the jali: a lattice of light on the floor below the arches. */
function makeJaliShadow(b) {
  const W = Math.ceil(b.r - b.l), H = 110;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(190,200,255,0.12)');
  grd.addColorStop(1, 'rgba(190,200,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,1)';
  g.lineWidth = 2;
  for (let d = -H; d < W + H; d += 12) {
    g.beginPath(); g.moveTo(d, 0); g.lineTo(d + H * 0.6, H); g.stroke();
    g.beginPath(); g.moveTo(d, 0); g.lineTo(d - H * 0.6, H); g.stroke();
  }
  return c;
}

function newPetal(b, anywhere) {
  const marigold = Math.random() < 0.6;
  return {
    x: rand(b.l, b.r), y: anywhere ? rand(b.t, b.b) : b.t - 10,
    z: anywhere ? rand(0, 120) : rand(90, 140), vx: rand(-8, 8), vy: rand(6, 14),
    rot: rand(0, TAU), spin: rand(-2, 2), color: marigold ? '#e0902a' : '#c8506a', land: 0,
  };
}

// --- per frame -----------------------------------------------------------------------

function peacockOf() { return world.enemies.find((q) => q.type === 'peacock' && !q.dead) || null; }

function tick(room, dt) {
  ensure(room);
  const b = arenaBounds();
  const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
  const e = peacockOf();
  const p = world.player;
  const display = !!e && e.action === 'display' && e.sub === 'fire';
  st.glow += ((display ? 1 : 0) - st.glow) * Math.min(1, dt * 3);
  st.surge += ((display ? 1 : 0) - st.surge) * Math.min(1, dt * 2);
  const eyesOut = world.enemies.some((q) => q.type === 'eyeorb' && !q.dead);
  st.eyes += ((eyesOut ? 1 : 0) - st.eyes) * Math.min(1, dt * 2.5);

  // Lamps lean away from anything rushing past, and gutter for a moment.
  const movers = [];
  if (p && !p.dead) movers.push(p);
  if (e) movers.push(e);
  for (const L of st.lamps) {
    let lean = 0;
    for (const m of movers) {
      const sp = Math.hypot(m.mvx || 0, m.mvy || 0) || (m.dashing ? 900 : 0);
      const d = dist(m.x, m.y, L.x, L.y);
      if (d < 120 && sp > 200) {
        lean += (L.x - m.x) / Math.max(d, 1) * 0.6;
        L.dim = Math.min(1, L.dim + dt * 4);
      }
    }
    L.lean += (clamp(lean, -0.9, 0.9) - L.lean) * Math.min(1, dt * 6);
    L.dim = Math.max(0, L.dim - dt * 1.2);
  }

  // Petals drift down, settle, fade - and her wings throw them about.
  for (let i = 0; i < st.petals.length; i++) {
    const q = st.petals[i];
    if (e) {
      const d = dist(e.x, e.y, q.x, q.y);
      const push = (e.sub === 'go' || display) ? 240 : 60;
      if (d < 150 && d > 1) {
        q.vx += (q.x - e.x) / d * push * dt * 6 * (1 - d / 150) - (q.y - e.y) / d * push * dt * 2;
        q.vy += (q.y - e.y) / d * push * dt * 6 * (1 - d / 150) + (q.x - e.x) / d * push * dt * 2;
        if (q.z <= 0) q.z = 6;
      }
    }
    if (p && !p.dead && dist(p.x, p.y, q.x, q.y) < p.r + 4 && q.z <= 0) {
      q.vx += (q.x - p.x) * 3; q.vy += (q.y - p.y) * 3;
    }
    q.vx *= Math.exp(-1.5 * dt);
    q.vy *= Math.exp(-1.5 * dt);
    q.x += (q.vx + Math.sin(world.runTime + q.rot) * 6) * dt;
    q.y += q.vy * dt;
    if (q.z > 0) { q.z -= 22 * dt; q.rot += q.spin * dt; } else { q.land += dt; }
    if (q.land > 10 || q.x < b.l - 20 || q.x > b.r + 20 || q.y > b.b + 20) st.petals[i] = newPetal(b, false);
  }

  // The fountain plays, and surges when she spreads her tail.
  const rate = 30 + st.surge * 90;
  const n = Math.floor(rate * dt + Math.random());
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU), sp = rand(20, 50) * (1 + st.surge);
    st.drops.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, z: 0, vz: rand(60, 110) * (1 + st.surge * 0.8), t: 0 });
  }
  for (let i = st.drops.length - 1; i >= 0; i--) {
    const d = st.drops[i];
    d.t += dt;
    d.vz -= 260 * dt;
    d.z += d.vz * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.z < 0 || st.drops.length > 260) st.drops.splice(i, 1);
  }
  for (const L of st.lotus) L.u = (L.u + (L.v / (L.horiz ? b.r - b.l : b.b - b.t)) * dt + 1) % 1;
}

// --- drawing -----------------------------------------------------------------------

function drawCourt(ctx, room, time) {
  ensure(room);
  const b = arenaBounds();
  const aw = b.r - b.l, ah = b.b - b.t;
  const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(b.l, b.t, aw, ah); ctx.clip();
  ctx.drawImage(st.floor, b.l, b.t);

  // Light running along the channels.
  ctx.strokeStyle = 'rgba(170,200,255,0.18)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 10; k++) {
    const u = ((time * 0.05 + k / 10) % 1);
    ctx.beginPath(); ctx.moveTo(b.l + u * aw, cy - 3); ctx.lineTo(b.l + u * aw + 26, cy - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 3, b.t + ((u + 0.37) % 1) * ah); ctx.lineTo(cx + 3, b.t + ((u + 0.37) % 1) * ah + 22); ctx.stroke();
  }
  // Lotus flowers floating down them.
  for (const L of st.lotus) {
    const x = L.horiz ? b.l + L.u * aw : cx;
    const y = L.horiz ? cy : b.t + L.u * ah;
    ctx.fillStyle = '#2f5a3a';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d88aa0';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + time * 0.2;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 3.4, 1.8, a, 0, TAU); ctx.fill();
    }
  }

  // Moonlight through the jali, under the colonnade.
  ctx.drawImage(st.jali, b.l, b.t + 24);

  // Under her Display, the great star lights up and turns, petal by petal.
  if (st.glow > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + time * 0.6;
      const pulse = 0.5 + 0.5 * Math.sin(time * 4 - k);
      ctx.globalAlpha = 0.1 * st.glow * pulse;
      ctx.fillStyle = '#fff0d8';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
      ctx.lineTo(cx + Math.cos(a + 0.22) * 170, cy + Math.sin(a + 0.22) * 170);
      ctx.lineTo(cx + Math.cos(a - 0.22) * 170, cy + Math.sin(a - 0.22) * 170);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // The fountain's water.
  ctx.fillStyle = 'rgba(200,225,255,0.55)';
  for (const d of st.drops) ctx.fillRect(d.x - 1, d.y - d.z * 0.5 - 1, 2, 2);
  for (let k = 0; k < 2; k++) {
    const r = ((time * 30 + k * 30) % 60) + 12;
    ctx.globalAlpha = 0.3 * (1 - r / 72);
    ctx.strokeStyle = '#c8dcff';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Petals, on the ground and falling.
  for (const q of st.petals) {
    const fade = q.land > 7 ? 1 - (q.land - 7) / 3 : 1;
    ctx.globalAlpha = 0.8 * fade;
    ctx.fillStyle = q.color;
    ctx.save();
    ctx.translate(q.x, q.y - q.z * 0.4);
    ctx.rotate(q.rot);
    ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // The colonnade and chhatris.
  ctx.drawImage(st.rim.canvas, b.l - st.rim.pad, b.t - st.rim.pad);

  // When she calls her watching eyes, the mosaic peacocks' eyes open too.
  if (st.eyes > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * st.eyes * (0.7 + Math.sin(time * 3) * 0.3);
    ctx.fillStyle = '#ffd98a';
    const W = aw + st.rim.pad * 2;
    const n = Math.max(5, Math.round((W - 140) / 150));
    const span = (W - 140) / n;
    for (let i = 0; i < n - 1; i++) {
      const x = b.l - st.rim.pad + 70 + span * i + span;
      const y = b.t + 26;                 // the tail's centre on the panel
      for (let k = 0; k < 9; k++) {
        const a = Math.PI + (k / 8) * Math.PI;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 2.6, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Diyas: a clay lamp, a flame that flickers, leans and gutters.
  for (const L of st.lamps) {
    const fl = 0.8 + Math.sin(time * 11 + L.ph) * 0.12 + Math.sin(time * 17 + L.ph * 2) * 0.08;
    const bright = fl * (1 - L.dim * 0.6);
    ctx.fillStyle = '#6a3a22';
    ctx.beginPath(); ctx.ellipse(L.x, L.y, 6, 3.5, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 * bright;
    ctx.fillStyle = '#ff9a3d';
    ctx.beginPath(); ctx.arc(L.x, L.y - 4, 26, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9 * bright;
    ctx.fillStyle = '#ffae5a';           // orange, never her gold
    ctx.beginPath();
    ctx.ellipse(L.x + L.lean * 5, L.y - 6, 2.2, 4.5 * bright, L.lean * 0.6, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

export const PALACE_ARENA = { tick, draw: drawCourt };
