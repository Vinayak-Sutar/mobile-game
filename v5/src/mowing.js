// THE LAWN. One chamber of grass, and a machine to cut it with.
//
// A sandbox for one question: how does mowing feel? So it is deliberately
// the smallest world that can answer it - a single room, no enemies, no
// timer, nothing to lose - and almost all of it is machinery that already
// existed.
//
// The grass is grass.js, the same field the open world grows. It already
// knows how to be pushed flat by anything walking through it, to be cut by a
// swung blade, to throw clippings, to grow back after half a minute, and to
// have something hidden in it now and then. It sows itself wherever the
// terrain says TALL - so the lawn hands it a terrain that says TALL
// everywhere, and gets a field of nothing but long grass.
//
// The mower is a cutter of the same shape a sword swing makes: an oriented
// box. It is not carried, it is PUSHED - it has its own position and angle
// that chase the player rather than being pinned to them, so swinging it
// round a corner has weight and the machine feels like an object you are
// shoving rather than a hitbox stapled to your hands.

import { world, arena, arenaBounds, view } from './state.js';
import { createGrass, grassMovers } from './grass.js';
import { TT } from './terrain.js';
import { clamp, angleDiff, TAU } from './util.js';
import { sfx } from './audio.js';

/** The machine. Width is the swathe; depth is how much of it bites at once. */
export const MOWER = {
  wid: 96,          // the swathe it cuts
  deep: 30,         // how far ahead of its front edge it reaches
  ahead: 38,        // how far in front of you it rides
  chase: 9,         // how fast it catches up to where it should be
  turn: 7,          // and how fast it comes round
  drag: 0.82,       // pushing it is work
  minRoll: 0.12,    // below this it is idling, not cutting
};

let L = null;

/** Grass sows itself where the ground says TALL. Here, that is everywhere. */
const ALL_LAWN = { typeAt: () => TT.TALL, roadAt: () => 999 };

export function lawnState() { return L; }

/** Sow the whole room. Remembers the shape it sowed, so it can tell when the
 *  room has changed under it - see sowIfResized. */
function sow() {
  const b = arenaBounds();
  const pad = 8;
  const x0 = b.l + pad, y0 = b.t + pad;
  const W = (b.r - b.l) - pad * 2, H = (b.b - b.t) - pad * 2;
  return { grass: createGrass(ALL_LAWN, { x0, y0, W, H, blocked: () => false }), x0, y0, W, H };
}

/**
 * THE ROOM CHANGES SHAPE UNDER YOU.
 *
 * `arena` is worked out from the window, and the window is not settled when
 * the mode starts - going fullscreen on a phone, or turning it, resizes it
 * after the fact. Sow once at the start and a third of the lawn is bare
 * ground you can walk on and never mow. So the field checks the room it is
 * in and re-sows when it no longer fits. It costs a sort of a couple of
 * thousand tufts, which is nothing next to being wrong.
 */
function sowIfResized() {
  const b = arenaBounds();
  const pad = 8;
  const W = (b.r - b.l) - pad * 2, H = (b.b - b.t) - pad * 2;
  if (Math.abs(W - L.W) < 2 && Math.abs(H - L.H) < 2 && Math.abs(b.l + pad - L.x0) < 2) return;
  const f = sow();
  L.grass = f.grass; L.x0 = f.x0; L.y0 = f.y0; L.W = f.W; L.H = f.H;
}

export function startLawn() {
  const f = sow();
  L = {
    grass: f.grass, x0: f.x0, y0: f.y0, W: f.W, H: f.H,
    mower: { x: 0, y: 0, angle: -Math.PI / 2, roll: 0, wheel: 0 },
    best: 0,
    t: 0,
    rattle: 0,
  };
  const p = world.player;
  if (p) {
    L.mower.x = p.x;
    L.mower.y = p.y - MOWER.ahead;
    L.mower.angle = p.face;
  }
  return L;
}

export function endLawn() { L = null; }

export function updateLawn(dt) {
  if (!L) return;
  const p = world.player;
  if (!p) return;
  L.t += dt;
  sowIfResized();
  const m = L.mower;

  // Where it ought to be: out in front of you, facing the way you walk. It
  // eases there rather than snapping, which is the whole of why it feels
  // like a thing with mass.
  const dir = p.moveMag > 0.05 ? p.moveAngle : m.angle;
  const tx = p.x + Math.cos(dir) * MOWER.ahead;
  const ty = p.y + Math.sin(dir) * MOWER.ahead;
  const k = 1 - Math.pow(0.0001, dt * (MOWER.chase / 9));
  m.x += (tx - m.x) * k;
  m.y += (ty - m.y) * k;
  m.angle += clamp(angleDiff(dir, m.angle), -MOWER.turn * dt, MOWER.turn * dt);

  // How hard it is being pushed. The blades only bite when it is rolling.
  const roll = clamp(p.moveMag, 0, 1);
  m.roll += (roll - m.roll) * Math.min(1, dt * 9);
  m.wheel += m.roll * dt * 9;

  // Pushing a mower is work: it is the one cost in here.
  p.groundMult = Math.min(p.groundMult === undefined ? 1 : p.groundMult, MOWER.drag);

  // The cut. The box starts at the mower's back edge and reaches forward, so
  // what you have just driven over is what falls.
  const cutters = [];
  if (m.roll > MOWER.minRoll) {
    cutters.push({
      shape: 'rect',
      x: m.x - Math.cos(m.angle) * (MOWER.deep * 0.5),
      y: m.y - Math.sin(m.angle) * (MOWER.deep * 0.5),
      angle: m.angle,
      len: MOWER.deep,
      wid: MOWER.wid,
    });
    L.rattle -= dt;
    if (L.rattle <= 0) { L.rattle = 0.19; sfx.click(); }
  }

  L.grass.update(dt, world.runTime, { x: 0, y: 0, w: view.w, h: view.h }, grassMovers(), cutters);

  const cut = L.grass.mown ? L.grass.mown(world.runTime) : 0;
  if (cut > L.best) L.best = cut;
}

export function drawLawnBelow(ctx) {
  if (!L) return;
  // The floor of the room, so the grass has something to stand on.
  const b = arenaBounds();
  ctx.fillStyle = '#2f3a26';
  ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
  ctx.fillStyle = 'rgba(30,40,24,0.55)';
  for (let y = b.t; y < b.b; y += 46) ctx.fillRect(b.l, y, b.r - b.l, 23);
  L.grass.draw(ctx, world.runTime, { x: 0, y: 0, w: view.w, h: view.h });
}

/** The blades in front of whoever is standing in them, so nobody floats on top. */
export function drawLawnFront(ctx) {
  if (!L) return;
  const p = world.player;
  if (p && !p.dead) L.grass.drawFront(ctx, world.runTime, p);
}

/** The machine itself: a box on two wheels with a handle back to your hands. */
export function drawMower(ctx) {
  if (!L) return;
  const m = L.mower, p = world.player;
  const c = Math.cos(m.angle), s = Math.sin(m.angle);
  const px = -s, py = c;                       // across the machine
  const hw = MOWER.wid / 2;

  // The handle, from the back of the deck to whoever is pushing.
  if (p) {
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(m.x + px * side * hw * 0.55 - c * 6, m.y + py * side * hw * 0.55 - s * 6);
      ctx.lineTo(p.x + px * side * 9, p.y + py * side * 9 - 6);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.angle);
  // Its shadow on the lawn.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-MOWER.deep * 0.5 + 3, -hw + 3, MOWER.deep, MOWER.wid);
  // The deck.
  ctx.fillStyle = '#b8452e';
  ctx.fillRect(-MOWER.deep * 0.5, -hw, MOWER.deep, MOWER.wid);
  ctx.strokeStyle = '#1a1014';
  ctx.lineWidth = 2;
  ctx.strokeRect(-MOWER.deep * 0.5, -hw, MOWER.deep, MOWER.wid);
  // The blade, a bar that spins while it rolls.
  ctx.strokeStyle = 'rgba(232,232,240,0.85)';
  ctx.lineWidth = 3;
  const a = L.mower.wheel * 3;
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * hw * 0.7, Math.sin(a) * hw * 0.7);
  ctx.lineTo(-Math.cos(a) * hw * 0.7, -Math.sin(a) * hw * 0.7);
  ctx.stroke();
  // Two wheels, turning.
  ctx.fillStyle = '#26201c';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(MOWER.deep * 0.35, side * (hw - 6));
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(240,230,210,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(L.mower.wheel) * 5, Math.sin(L.mower.wheel) * 5);
    ctx.lineTo(-Math.cos(L.mower.wheel) * 5, -Math.sin(L.mower.wheel) * 5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** How much of it is cut, top left, because that is the whole satisfaction. */
export function drawLawnHud(ctx) {
  if (!L) return;
  const cut = L.grass.mown ? L.grass.mown(world.runTime) : 0;
  const pct = Math.round(cut * 100);
  // Under the health bar and the ability row, not through them.
  const Y = 92;
  ctx.textAlign = 'left';
  ctx.font = '800 15px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(`${pct}% MOWN`, 27, Y + 1);
  ctx.fillStyle = pct >= 100 ? '#9fe0a0' : 'rgba(255,240,210,0.95)';
  ctx.fillText(`${pct}% MOWN`, 26, Y);
  ctx.font = '700 10px system-ui';
  ctx.fillStyle = 'rgba(255,240,210,0.5)';
  ctx.fillText('it grows back after half a minute', 26, Y + 15);

  const w = 190;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(26, Y + 22, w, 7);
  ctx.fillStyle = pct >= 100 ? '#9fe0a0' : '#c8e08a';
  ctx.fillRect(26, Y + 22, w * cut, 7);
  ctx.textAlign = 'center';
}
