// Kwaku Anansi — shared helpers for the fight (boss-anansi.js) and its tales
// (boss-anansi-tales.js).

import { world, arenaBounds } from './state.js';
import { clamp, dist, angleTo, lerp, circleArc, circleOrientedRect } from './util.js';
import { inArena } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';

export const PV = { x: 0, y: 0 };   // your smoothed velocity, for leading attacks

export function say(e, text, color = '#ffd45e') {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

/** A chapter of the story begins: its name over the canopy, and the drum. */
export function chapter(e, name) {
  e.chapter = name;
  e.chapterT = 2.4;
  sfx.talkingDrum(true);
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

export function hurt(e, mult, sx, sy) {
  if ((e.contactCd || 0) > 0) return false;
  if (damagePlayer(Math.round(e.damage * mult), sx, sy, e.type)) { e.contactCd = 0.5; return true; }
  return false;
}

export function touchPoint(e, x, y, r, mult) {
  const p = world.player;
  return !!p && !p.dead && dist(x, y, p.x, p.y) < r + p.r * 0.5 && hurt(e, mult, x, y);
}

export function strikeLane(e, x, y, a, len, halfW, mult, kb = 240) {
  const p = world.player;
  if (!p || p.dead) return false;
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - x, dy = p.y - y;
  const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
  if (along < -12 || along > len || across > halfW + p.r * 0.5) return false;
  if (!damagePlayer(Math.round(e.damage * mult), x, y, e.type)) return false;
  p.vx = (p.vx || 0) + c * kb;
  p.vy = (p.vy || 0) + s * kb;
  return true;
}

/** Does a melee swing overlap this point? */
export function swingHits(x, y, r) {
  for (const h of world.hitboxes) {
    let hit;
    if (h.shape === 'arc') hit = circleArc(x, y, r, h.x, h.y, h.angle, h.arc, h.radius);
    else if (h.shape === 'rect') hit = circleOrientedRect(x, y, r, h.x, h.y, h.angle, h.len, h.wid);
    else hit = dist(h.x, h.y, x, y) < (h.radius || 0) + r;
    if (hit) return true;
  }
  return false;
}

/** Does anything of yours (a bullet or a swing) hit this point? */
export function playerHits(x, y, r) {
  for (const pr of world.projectiles) {
    if (pr.friendly && !pr.cleared && dist(pr.x, pr.y, x, y) < (pr.r || 6) + r) return true;
  }
  return swingHits(x, y, r);
}

/** Leap to (tx, ty) over `dur` seconds (a spider's jump). */
export function startLeap(e, tx, ty, dur) {
  const [x, y] = inArena(tx, ty, e.r + 14);
  e.leap = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, dur };
  e.face = angleTo(e.x, e.y, x, y);
}

export function stepLeap(e, dt) {
  const L = e.leap;
  if (!L) return true;
  L.t += dt;
  const k = clamp(L.t / L.dur, 0, 1);
  e.x = lerp(L.x0, L.x1, k);
  e.y = lerp(L.y0, L.y1, k);
  e.legPhase = (e.legPhase || 0) + dt * 30;
  if (k >= 1) { e.leap = null; return true; }
  return false;
}

/** Does the segment (x0, y0)-(x1, y1) pass within r of (cx, cy)? */
export function segmentNear(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const k = clamp(((cx - x0) * dx + (cy - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(cx - (x0 + dx * k), cy - (y0 + dy * k)) < r;
}
