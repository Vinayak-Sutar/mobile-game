// Posture ("poise"). Every enemy has a stagger bar that fills from parries,
// ripostes, heavy hits and elemental reactions, and drains after two quiet
// seconds. When it fills, a regular enemy is stunned; a boss becomes EXPOSED
// (its own `onPoiseBreak` hook, set in bosses.js / enemies.js).
//
// Kept in its own module so combat.js and parry.js can both use it without
// importing each other.

import { world } from './state.js';
import { burst, ring, damageText, shake, hitstop } from './fx.js';
import { sfx } from './audio.js';
import { haptic } from './haptics.js';

export const POISE = {
  drainDelay: 2.0,     // seconds without poise damage before it drains
  drainRate: 0.28,     // fraction of the bar per second once draining
  stun: 1.5,           // regular enemy stun on break
};

/** Set up an enemy's bar from its size (called by spawnEnemy). */
export function initPoise(e) {
  if (e.poiseMax) return;
  if (e.boss) e.poiseMax = 130 + (e.tier || 0) * 20;
  else e.poiseMax = Math.round((30 + e.r * 1.6) * (e.elite ? 1.6 : 1));
  e.poise = 0;
  e.poiseAt = -99;
}

/** Add posture damage. Returns true if this broke the enemy's guard. */
export function addPoise(e, amount) {
  if (!e || e.dead || e.spawning || amount <= 0 || !e.poiseMax) return false;
  if (e.invuln || e.hidden) return false;
  // A broken enemy's bar stays empty until it recovers.
  if ((e.stunT || 0) > 0 || (e.exposed || 0) > 0) return false;
  e.poise = Math.min(e.poiseMax, (e.poise || 0) + amount);
  e.poiseAt = world.runTime;
  if (e.poise < e.poiseMax) return false;

  e.poise = 0;
  damageText(e.x, e.y - e.r - 20, 'BROKEN', { color: '#ffe27a', size: 18 });
  ring(e.x, e.y, { r0: e.r, r1: e.r * 3, color: '#ffe27a', life: 0.45, width: 6 });
  burst(e.x, e.y, { count: 18, color: '#ffe27a', speed: 300, size: 4, life: 0.5, drag: 4, shape: 'spark' });
  shake(e.boss ? 0.6 : 0.3);
  hitstop(e.boss ? 0.14 : 0.08);
  sfx.exposed();
  haptic(e.boss ? [40, 30, 60] : 35);
  if (e.onPoiseBreak) e.onPoiseBreak(e);
  else e.stunT = POISE.stun;
  return true;
}

/** Drain bars that haven't been hit recently. Called once per tick. */
export function updatePoise(dt) {
  for (const e of world.enemies) {
    if (!e.poise) continue;
    if (world.runTime - (e.poiseAt || 0) < POISE.drainDelay) continue;
    e.poise = Math.max(0, e.poise - e.poiseMax * POISE.drainRate * dt);
  }
}
