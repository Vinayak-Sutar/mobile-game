// Dust Gulch: Deadeye Vesper's arena, the square of a dead frontier town at
// the hour of her last duel.
//
// Packed dirt with old wagon ruts and sun-cracked mud, a worn circle in the
// middle where men have faced each other before. A boardwalk runs along the
// top under the saloon, bank, sheriff's office and hotel signs; a split-rail
// fence closes the bottom; barrels, a water trough, a hitching rail, saguaro
// and a cattle skull fill the corners.
//
// It lives: a hot wind blows streaks of dust and grains of sand across the
// square, tumbleweeds roll on it and bounce off the crates and walls (and
// off anyone they hit), dust devils spin up and wander across now and then,
// and vultures circle overhead - only their shadows touch the ground. The
// props cast shadows from the sun: short at midday, long and red at Sundown,
// and at High Noon the shadows vanish beneath everything and the wind dies,
// so the whole square holds its breath.
//
// Dust here never leaves trails (the owner's rule for this arena): a dash
// throws up a puff at its start and end, and every puff simply settles away.
// Purely cosmetic.

import { world, arenaBounds } from './state.js';
import { TAU, rand, dist, resolveCircleRect } from './util.js';

const st = {
  key: '', room: null,
  floor: null, puff: null,
  props: [], weeds: [], devils: [], streaks: [], grains: [], puffs: [], birds: [],
  wind: 0, devilT: 6, wasDashing: false,
};

// --- setup -------------------------------------------------------------------

function ensure(room) {
  const b = arenaBounds();
  const key = `${b.l}|${b.t}|${b.r}|${b.b}`;
  if (st.key === key && st.room === room && st.floor) return;
  st.key = key;
  st.room = room;
  st.floor = makeFloor(b);
  st.puff = st.puff || makePuff();
  st.props = makeProps(b);
  st.weeds = [];
  for (let k = 0; k < 3; k++) st.weeds.push(newWeed(b, rand(b.l, b.r)));
  st.devils = [];
  st.devilT = rand(5, 9);
  st.streaks = [];
  for (let k = 0; k < 12; k++) st.streaks.push({ x: rand(b.l, b.r), y: rand(b.t, b.b), len: rand(60, 160), a: rand(0.04, 0.09) });
  st.grains = [];
  for (let k = 0; k < 60; k++) st.grains.push({ x: rand(b.l, b.r), y: rand(b.t, b.b), v: rand(0.7, 1.3), ph: rand(0, TAU) });
  st.puffs = [];
  st.birds = [];
  for (let k = 0; k < 2; k++) st.birds.push({ cx: rand(b.l + 200, b.r - 200), cy: rand(b.t + 120, b.b - 120), r: rand(120, 200), a: rand(0, TAU), sp: rand(0.25, 0.4) * (k ? -1 : 1), s: rand(0.9, 1.2) });
}

function makeFloor(b) {
  const W = Math.ceil(b.r - b.l), H = Math.ceil(b.b - b.t);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Packed dirt, dark enough that brass bullets stay easy to see.
  g.fillStyle = '#5b3f27';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 140; k++) {
    const v = rand(-10, 14);
    g.fillStyle = `rgba(${112 + v},${80 + v},${50 + v},${rand(0.12, 0.3)})`;
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(20, 90), rand(10, 40), rand(0, TAU), 0, TAU);
    g.fill();
  }
  // The duelling circle, worn pale by boots.
  const grd = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 170);
  grd.addColorStop(0, 'rgba(160,122,80,0.35)');
  grd.addColorStop(1, 'rgba(160,122,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // Sun-cracked mud.
  g.strokeStyle = 'rgba(40,26,14,0.5)';
  g.lineWidth = 1.2;
  for (let p = 0; p < 5; p++) {
    const px = rand(80, W - 80), py = rand(60, H - 60);
    for (let k = 0; k < 14; k++) {
      let x = px + rand(-50, 50), y = py + rand(-30, 30), a = rand(0, TAU);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 3; s++) { a += rand(-0.9, 0.9); x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); }
      g.stroke();
    }
  }
  // Wagon ruts across the square.
  g.strokeStyle = 'rgba(36,22,12,0.35)';
  g.lineWidth = 8;
  for (const off of [-26, 26]) {
    g.beginPath();
    g.moveTo(0, H * 0.72 + off);
    g.quadraticCurveTo(W / 2, H * 0.3 + off, W, H * 0.8 + off);
    g.stroke();
  }
  // Pebbles, dry grass, spent brass.
  for (let k = 0; k < 70; k++) {
    const x = rand(0, W), y = rand(0, H), r = rand(1.5, 3.5);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + 1, y + 1, r, 0, TAU); g.fill();
    g.fillStyle = '#8f7355'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.strokeStyle = '#9a8446';
  g.lineWidth = 1.4;
  for (let k = 0; k < 40; k++) {
    const x = rand(0, W), y = rand(0, H);
    for (let s = 0; s < 5; s++) {
      const a = -Math.PI / 2 + rand(-0.8, 0.8);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * rand(5, 10), y + Math.sin(a) * rand(5, 10)); g.stroke();
    }
  }
  for (let k = 0; k < 18; k++) {
    g.save();
    g.translate(rand(0, W), rand(0, H));
    g.rotate(rand(0, TAU));
    g.fillStyle = '#c9a040';
    g.fillRect(-3, -1.2, 6, 2.4);
    g.restore();
  }
  // A horseshoe.
  g.strokeStyle = '#6a6a6a';
  g.lineWidth = 3;
  g.beginPath(); g.arc(W * 0.62, H * 0.58, 7, 0.4, Math.PI * 2 - 0.4 + Math.PI); g.stroke();

  // The boardwalk under the storefronts, along the top.
  g.fillStyle = '#6e4a2c';
  g.fillRect(0, 0, W, 24);
  g.strokeStyle = 'rgba(30,16,6,0.55)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 24); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 24, W, 5);
  // Their signs, hung over the walk.
  const signs = ['SALOON', 'BANK', 'SHERIFF', 'HOTEL', 'GENERAL STORE'];
  g.font = '800 11px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  signs.forEach((name, i) => {
    const x = W * (0.18 + i * 0.17);
    const w = g.measureText(name).width + 16;
    g.fillStyle = '#3a2414';
    g.fillRect(x - w / 2, 4, w, 16);
    g.strokeStyle = '#c9a040';
    g.strokeRect(x - w / 2 + 1.5, 5.5, w - 3, 13);
    g.fillStyle = '#f0d9a0';
    g.fillText(name, x, 12.5);
  });
  // A split-rail fence along the bottom.
  g.strokeStyle = '#7a5434';
  g.lineWidth = 4;
  for (const y of [H - 12, H - 5]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#5a3a20';
  for (let x = 10; x < W; x += 70) g.fillRect(x - 3, H - 18, 6, 18);
  return c;
}

/** Props that stand up off the ground and so cast shadows. */
function makeProps(b) {
  const props = [];
  const add = (kind, x, y, extra = {}) => props.push({ kind, x, y, ...extra });
  const W = b.r - b.l;
  // Porch posts (clear of the bell's post in the top-left corner).
  for (let x = b.l + 130; x < b.r - 40; x += W / 6) add('post', x, b.t + 26, { h: 30 });
  add('trough', b.l + W * 0.33, b.t + 40, { h: 10 });
  add('rail', b.l + W * 0.66, b.t + 40, { h: 14 });
  add('barrel', b.l + 22, b.t + 60, { h: 18 });
  add('barrel', b.l + 44, b.t + 72, { h: 18 });
  add('barrel', b.r - 26, b.t + 64, { h: 18 });
  add('cactus', b.l + 34, b.b - 44, { h: 46 });
  add('cactus', b.r - 38, b.b - 52, { h: 52 });
  add('skull', b.r - 90, b.b - 34, { h: 3 });
  add('wheel', b.l + 90, b.b - 34, { h: 6 });
  return props;
}

function makePuff() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(196,160,112,0.9)');
  grd.addColorStop(0.6, 'rgba(176,140,96,0.4)');
  grd.addColorStop(1, 'rgba(160,126,86,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function newWeed(b, x) {
  return { x, y: rand(b.t + 50, b.b - 40), vx: rand(30, 60), vy: rand(-8, 8), r: rand(10, 15), rot: 0, z: 0, vz: 0 };
}

function puff(x, y, vx, vy, r, life = 0.8, a = 0.5) {
  if (st.puffs.length > 120) st.puffs.shift();
  st.puffs.push({ x, y, vx, vy, r, t: 0, life, a });
}

/** A kick of dust: soft puffs that settle and are gone. Never a trail. */
export function gulchDust(x, y, n = 8, speed = 90) {
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU);
    puff(x + rand(-6, 6), y + rand(-6, 6), Math.cos(a) * speed * rand(0.4, 1), Math.sin(a) * speed * rand(0.4, 1), rand(8, 16), rand(0.5, 0.9), 0.45);
  }
}

// --- per frame -----------------------------------------------------------------

function vesperOf() { return world.enemies.find((q) => q.type === 'vesper' && !q.dead) || null; }

function tick(room, dt) {
  ensure(room);
  const b = arenaBounds();
  const e = vesperOf();
  const noon = e ? e.noon : 0;
  const dusk = e ? e.dusk : 0;
  // A hot wind, gustier at Sundown - and dead still at High Noon.
  const target = (1 - noon) * (1 + dusk * 0.6) * (0.8 + Math.sin(world.runTime * 0.4) * 0.3);
  st.wind += (target - st.wind) * Math.min(1, dt * 1.5);
  const wx = 70 * st.wind, wy = 8 * st.wind;

  // Dash: a puff where it starts and where it ends - no trail between.
  const p = world.player;
  if (p && !p.dead) {
    if (p.dashing && !st.wasDashing) gulchDust(p.x, p.y + p.r * 0.4, 7, 80);
    if (!p.dashing && st.wasDashing) gulchDust(p.x, p.y + p.r * 0.4, 5, 60);
    st.wasDashing = !!p.dashing;
  }

  // Tumbleweeds: blown by the wind, hopping, bouncing off what they hit.
  for (let i = 0; i < st.weeds.length; i++) {
    const w = st.weeds[i];
    w.vx += (wx - w.vx) * dt * 0.9;
    w.vy += (wy + Math.sin(world.runTime * 0.7 + i) * 10 - w.vy) * dt * 0.6;
    w.vz -= 420 * dt;
    w.z = Math.max(0, w.z + w.vz * dt);
    if (w.z === 0 && Math.abs(w.vx) > 25 && Math.random() < dt * 1.5) w.vz = rand(80, 150);
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.rot += (w.vx / w.r) * dt;
    for (const o of room.obstacles) {
      const before = w.x;
      if (resolveCircleRect(w, o)) { w.vx = -w.vx * 0.5 + (w.x > before ? 20 : -20); w.vz = 120; }
    }
    for (const q of [p, ...world.enemies]) {
      if (!q || q.dead || q.hidden) continue;
      const d = dist(q.x, q.y, w.x, w.y);
      if (d < q.r + w.r && d > 0.1) {
        w.vx += (w.x - q.x) / d * 160;
        w.vy += (w.y - q.y) / d * 160;
        w.vz = Math.max(w.vz, 110);
      }
    }
    if (w.y < b.t + 40) { w.y = b.t + 40; w.vy = Math.abs(w.vy); }
    if (w.y > b.b - 24) { w.y = b.b - 24; w.vy = -Math.abs(w.vy); }
    if (w.x > b.r + 40 || w.x < b.l - 60) st.weeds[i] = newWeed(b, b.l - 40);
  }

  // Dust devils now and then (never at High Noon).
  st.devilT -= dt;
  if (st.devilT <= 0 && noon < 0.1) {
    st.devilT = rand(10, 18);
    st.devils.push({ x: b.l - 20, y: rand(b.t + 80, b.b - 80), t: 0, life: rand(5, 7), a: rand(-0.3, 0.3), spin: 0 });
  }
  for (let i = st.devils.length - 1; i >= 0; i--) {
    const d = st.devils[i];
    d.t += dt;
    d.a += rand(-0.6, 0.6) * dt;
    d.x += (Math.cos(d.a) * 90 + wx * 0.4) * dt;
    d.y += Math.sin(d.a) * 90 * dt;
    d.spin += dt * 9;
    // It drags tumbleweeds round into it.
    for (const w of st.weeds) {
      const dd = dist(d.x, d.y, w.x, w.y);
      if (dd < 90 && dd > 1) {
        w.vx += (-(w.y - d.y) / dd * 140 - (w.x - d.x) / dd * 60) * dt;
        w.vy += ((w.x - d.x) / dd * 140 - (w.y - d.y) / dd * 60) * dt;
      }
    }
    if (d.t >= d.life || noon > 0.3) st.devils.splice(i, 1);
  }

  for (const s of st.streaks) {
    s.x += wx * 2.2 * dt;
    s.y += wy * dt;
    if (s.x > b.r + 20) { s.x = b.l - s.len; s.y = rand(b.t, b.b); }
  }
  for (const g of st.grains) {
    g.x += wx * 1.6 * g.v * dt;
    g.y += (wy + Math.sin(world.runTime * 3 + g.ph) * 12) * dt;
    if (g.x > b.r) { g.x = b.l; g.y = rand(b.t, b.b); }
  }
  for (let i = st.puffs.length - 1; i >= 0; i--) {
    const f = st.puffs[i];
    f.t += dt;
    const drag = Math.exp(-3 * dt);
    f.vx = f.vx * drag + wx * dt;
    f.vy = f.vy * drag + wy * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.t >= f.life) st.puffs.splice(i, 1);
  }
  for (const bd of st.birds) bd.a += bd.sp * dt;
}

// --- drawing -------------------------------------------------------------------

/** Where the shadows fall: short at midday, long at Sundown, none at noon. */
function sunShadow(e) {
  const dusk = e ? e.dusk : 0, noon = e ? e.noon : 0;
  const len = (0.35 + dusk * 1.3) * (1 - noon * 0.95);
  // Midday sun a little to the right; the setting sun low at the top right.
  const a = Math.PI * (0.62 + dusk * 0.12);
  return { dx: Math.cos(a) * len, dy: Math.sin(a) * len, red: dusk };
}

function drawProp(ctx, pr, sh) {
  // Shadow first, stretched away from the sun.
  const sx = sh.dx * pr.h, sy = sh.dy * pr.h;
  ctx.fillStyle = `rgba(${20 + sh.red * 40},8,12,0.35)`;
  const r = pr.kind === 'cactus' ? 10 : pr.kind === 'barrel' ? 11 : pr.kind === 'post' ? 4 : 8;
  if (Math.abs(sx) + Math.abs(sy) > 1) {
    ctx.beginPath();
    ctx.moveTo(pr.x - r * 0.8, pr.y);
    ctx.lineTo(pr.x + r * 0.8, pr.y);
    ctx.lineTo(pr.x + sx + r * 0.5, pr.y + sy);
    ctx.lineTo(pr.x + sx - r * 0.5, pr.y + sy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(pr.x, pr.y, r, r * 0.6, 0, 0, TAU); ctx.fill();

  switch (pr.kind) {
    case 'post':
      ctx.fillStyle = '#4a2e18'; ctx.fillRect(pr.x - 3, pr.y - 6, 6, 8);
      break;
    case 'barrel':
      ctx.fillStyle = '#7a4e2c'; ctx.beginPath(); ctx.arc(pr.x, pr.y - 4, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pr.x, pr.y - 4, 11, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(pr.x, pr.y - 4, 6, 0, TAU); ctx.stroke();
      break;
    case 'trough':
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(pr.x - 30, pr.y - 8, 60, 16);
      ctx.fillStyle = '#3e6a78'; ctx.fillRect(pr.x - 26, pr.y - 5, 52, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(pr.x - 20, pr.y - 4, 18, 2);
      break;
    case 'rail':
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pr.x - 34, pr.y); ctx.lineTo(pr.x + 34, pr.y); ctx.stroke();
      ctx.fillStyle = '#4a2e18'; ctx.fillRect(pr.x - 36, pr.y - 4, 5, 8); ctx.fillRect(pr.x + 31, pr.y - 4, 5, 8);
      break;
    case 'cactus':
      ctx.fillStyle = '#4f7a3a'; ctx.beginPath(); ctx.arc(pr.x, pr.y - 6, 11, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(pr.x - 15, pr.y - 12, 6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(pr.x + 14, pr.y - 2, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2f5222'; ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.beginPath(); ctx.moveTo(pr.x, pr.y - 6); ctx.lineTo(pr.x + Math.cos(a) * 10, pr.y - 6 + Math.sin(a) * 10); ctx.stroke();
      }
      break;
    case 'skull':
      ctx.fillStyle = '#e8dcc4'; ctx.beginPath(); ctx.ellipse(pr.x, pr.y, 8, 10, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e8dcc4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pr.x - 6, pr.y - 7); ctx.quadraticCurveTo(pr.x - 18, pr.y - 12, pr.x - 20, pr.y - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pr.x + 6, pr.y - 7); ctx.quadraticCurveTo(pr.x + 18, pr.y - 12, pr.x + 20, pr.y - 22); ctx.stroke();
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath(); ctx.arc(pr.x - 3, pr.y - 2, 2, 0, TAU); ctx.arc(pr.x + 3, pr.y - 2, 2, 0, TAU); ctx.fill();
      break;
    case 'wheel':
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 16, 0, TAU); ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.3;
        ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(pr.x + Math.cos(a) * 16, pr.y + Math.sin(a) * 16); ctx.stroke();
      }
      break;
    default: break;
  }
}

function drawWeed(ctx, w) {
  // Shadow on the ground, the weed itself lifted by its hop.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(w.x, w.y + w.r * 0.6, w.r * 0.9, w.r * 0.35, 0, 0, TAU); ctx.fill();
  const y = w.y - w.z * 0.5;
  ctx.strokeStyle = '#a07c48';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 0; k < 9; k++) {
    const a = w.rot + k * 0.9;
    ctx.moveTo(w.x + Math.cos(a) * w.r, y + Math.sin(a) * w.r);
    ctx.lineTo(w.x + Math.cos(a + 2.5) * w.r, y + Math.sin(a + 2.5) * w.r);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,90,50,0.8)';
  ctx.beginPath(); ctx.arc(w.x, y, w.r * 0.8, 0, TAU); ctx.stroke();
}

/** The whole square, under everything; Vesper's own tells draw on top. */
export function drawGulch(ctx, room, time) {
  ensure(room);
  const b = arenaBounds();
  const e = vesperOf();
  const aw = b.r - b.l, ah = b.b - b.t;
  ctx.save();
  ctx.beginPath(); ctx.rect(b.l, b.t, aw, ah); ctx.clip();

  ctx.drawImage(st.floor, b.l, b.t);

  // Vultures circling overhead: only their shadows reach the ground.
  for (const bd of st.birds) {
    const x = bd.cx + Math.cos(bd.a) * bd.r, y = bd.cy + Math.sin(bd.a) * bd.r * 0.7;
    const heading = bd.a + (bd.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
    const flap = Math.sin(time * 3 + bd.cx) * 0.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.scale(bd.s, bd.s);
    ctx.fillStyle = 'rgba(20,10,6,0.2)';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(0, -20 - flap * 10, -6, -30);
    ctx.quadraticCurveTo(-2, -8, -10, 0);
    ctx.quadraticCurveTo(-2, 8, -6, 30);
    ctx.quadraticCurveTo(0, 20 + flap * 10, 10, 0);
    ctx.fill();
    ctx.restore();
  }

  // Wind: streaks of blown dust and grains of sand.
  for (const s of st.streaks) {
    ctx.globalAlpha = s.a * st.wind;
    ctx.strokeStyle = '#e0c8a0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y + 4); ctx.stroke();
  }
  ctx.globalAlpha = 0.5 * Math.min(1, st.wind + 0.2);
  ctx.fillStyle = '#e8d4b0';
  for (const g of st.grains) ctx.fillRect(g.x, g.y, 1.6, 1.6);
  ctx.globalAlpha = 1;

  const sh = sunShadow(e);
  for (const pr of st.props) drawProp(ctx, pr, sh);
  for (const w of st.weeds) drawWeed(ctx, w);

  // Dust devils: a spinning column of grit.
  for (const d of st.devils) {
    const k = Math.min(1, d.t / 0.8) * Math.min(1, (d.life - d.t) / 0.8);
    ctx.globalAlpha = 0.18 * k;
    ctx.drawImage(st.puff, d.x - 50, d.y - 50, 100, 100);
    ctx.globalAlpha = 0.6 * k;
    ctx.fillStyle = '#e0c8a0';
    for (let j = 0; j < 26; j++) {
      const a = d.spin + j * 0.7;
      const rr = 8 + (j % 9) * 5;
      ctx.fillRect(d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr * 0.6 - j * 1.2, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  // Puffs of dust settling.
  for (const f of st.puffs) {
    const k = f.t / f.life;
    const r = f.r * (1 + k * 1.4);
    ctx.globalAlpha = f.a * (1 - k);
    ctx.drawImage(st.puff, f.x - r, f.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export const GULCH_ARENA = { tick, draw: drawGulch };
