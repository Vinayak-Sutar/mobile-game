// Mau, the cat of nine lives — shared helpers for the fight (boss-mau.js) and
// its legends (boss-mau-legends.js).

import { world, arenaBounds } from './state.js';
import { clamp, dist, angleTo, angleDiff, lerp } from './util.js';
import { inArena } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { burst, damageText } from './fx.js';
import { spawnHazard } from './hazards.js';

export const PV = { x: 0, y: 0 };   // your smoothed velocity, for leading pounces

export function say(e, text, color = '#ffc861') {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

export function leadAt(x, y, p, speed, k = 0.5) {
  const t = dist(x, y, p.x, p.y) / speed;
  return angleTo(x, y, p.x + PV.x * t * k, p.y + PV.y * t * k);
}

export function center() {
  const b = arenaBounds();
  return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
}

export function blastAt(e, x, y, r, delay, mult, color, extra = {}) {
  const [sx, sy] = inArena(x, y, 20);
  return spawnHazard({ kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color, source: e.type, owner: e, quiet: true, ...extra });
}

/** Damage from something that keeps touching (a wheel, a lynx, a wisp). */
export function hurt(e, mult, sx, sy) {
  if ((e.contactCd || 0) > 0) return false;
  if (damagePlayer(Math.round(e.damage * mult), sx, sy, e.type)) { e.contactCd = 0.5; return true; }
  return false;
}

export function touchPoint(e, x, y, r, mult) {
  const p = world.player;
  if (!p || p.dead) return false;
  return dist(x, y, p.x, p.y) < r + p.r * 0.5 && hurt(e, mult, x, y);
}

export function inLane(p, x, y, a, len, halfW) {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - x, dy = p.y - y;
  const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
  return along > -12 && along < len && across < halfW + p.r * 0.5;
}

/** A strike down a line: the hit and its knockback. True if it landed. */
export function strikeLane(e, x, y, a, len, halfW, mult, kb = 240) {
  const p = world.player;
  if (!p || p.dead || !inLane(p, x, y, a, len, halfW)) return false;
  if (!damagePlayer(Math.round(e.damage * mult), x, y, e.type)) return false;
  p.vx = (p.vx || 0) + Math.cos(a) * kb;
  p.vy = (p.vy || 0) + Math.sin(a) * kb;
  return true;
}

/** A claw swipe: an arc in front of her lands on whoever's in it. */
export function cutLands(e, a, arc, r, mult) {
  const p = world.player;
  if (p && !p.dead && dist(e.x, e.y, p.x, p.y) < r + p.r * 0.5 && Math.abs(angleDiff(a, angleTo(e.x, e.y, p.x, p.y))) < arc / 2 + 0.1) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) {
      p.vx = (p.vx || 0) + Math.cos(a) * 240;
      p.vy = (p.vy || 0) + Math.sin(a) * 240;
    }
  }
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * 0.28;
    burst(e.x + Math.cos(a + off) * r * 0.7, e.y + Math.sin(a + off) * r * 0.7, { count: 3, color: '#f4f0ff', speed: 120, size: 3, life: 0.25, dir: a + off, spread: 0.3, drag: 5, shape: 'spark' });
  }
}

/** Start a leap: she arcs through the air to (tx, ty) over `dur` seconds. */
export function startLeap(e, tx, ty, dur) {
  const [x, y] = inArena(tx, ty, e.r + 12);
  e.leap = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, dur, h: 60 + dist(e.x, e.y, x, y) * 0.12 };
  e.face = angleTo(e.x, e.y, x, y);
}

/** Advance a leap. True once she's landed (on her feet, of course). */
export function stepLeap(e, dt) {
  const L = e.leap;
  if (!L) return true;
  L.t += dt;
  const k = clamp(L.t / L.dur, 0, 1);
  e.x = lerp(L.x0, L.x1, k);
  e.y = lerp(L.y0, L.y1, k);
  e.z = Math.sin(k * Math.PI) * L.h;
  if (k >= 1) { e.z = 0; e.leap = null; return true; }
  return false;
}
