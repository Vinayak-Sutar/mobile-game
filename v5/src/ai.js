// Movement and contact helpers shared by regular enemies (enemies.js) and
// bosses (bosses.js). Kept separate so neither of those modules has to import
// the other.

import { world, arenaBounds } from './state.js';
import { dist, angleTo, normalize, resolveCircleRect } from './util.js';
import { damagePlayer } from './combat.js';
import { ring } from './fx.js';

export function player() { return world.player; }

export function stepToward(e, tx, ty, speed, dt) {
  const [nx, ny] = normalize(tx - e.x, ty - e.y);
  e.x += nx * speed * dt;
  e.y += ny * speed * dt;
  if (nx || ny) e.face = Math.atan2(ny, nx);
}

export function stepAway(e, tx, ty, speed, dt) {
  stepToward(e, e.x * 2 - tx, e.y * 2 - ty, speed, dt);
}

export function strafe(e, tx, ty, speed, dt, sign) {
  const a = angleTo(e.x, e.y, tx, ty) + (Math.PI / 2) * sign;
  e.x += Math.cos(a) * speed * dt;
  e.y += Math.sin(a) * speed * dt;
}

/** Clamp to the arena and push out of obstacles. True if anything was hit. */
export function collideWorld(e) {
  const b = arenaBounds();
  let bumped = false;
  if (e.x < b.l + e.r) { e.x = b.l + e.r; bumped = true; }
  if (e.x > b.r - e.r) { e.x = b.r - e.r; bumped = true; }
  if (e.y < b.t + e.r) { e.y = b.t + e.r; bumped = true; }
  if (e.y > b.b - e.r) { e.y = b.b - e.r; bumped = true; }
  if (world.room) {
    for (const o of world.room.obstacles) {
      if (o.ledge && e.y < o.y + o.h / 2) continue;      // The Wilds: they drop down too
      if (resolveCircleRect(e, o)) bumped = true;
    }
  }
  // The Wilds' encounter sites hold their enemies to their ground.
  const L = e.leash;
  if (L) {
    const dx = e.x - L.x, dy = e.y - L.y, d = Math.hypot(dx, dy);
    if (d > L.r - e.r && d > 0) {
      const k = (L.r - e.r) / d;
      e.x = L.x + dx * k; e.y = L.y + dy * k;
      bumped = true;
    }
  }
  return bumped;
}

export function contactDamage(e, dt, amount, cooldown = 0.7) {
  const p = player();
  if (!p || p.dead) return;
  e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
  if (e.touchCd > 0) return;
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r) {
    if (damagePlayer(amount, e.x, e.y, e.type)) e.touchCd = cooldown;
  }
}

export function telegraphRing(e, progress, radius, color) {
  ring(e.x, e.y, { r0: radius * progress, r1: radius * progress + 1, color, life: 0.06, width: 3 });
}
