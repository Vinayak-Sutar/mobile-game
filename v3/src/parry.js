// Parry.
//
// Press parry and, for a short window, anything that would hit you *directly*
// is answered instead: projectiles fly back at their shooter, and a melee or
// contact attacker is shoved away with a chunk of posture damage and leaves
// you a Riposte (your next hit is a big crit). Ground attacks — blasts,
// shockwaves, beams, lobbed shells — can't be parried; you dash through those.
// Enemies flash white before a parryable hit and show a red ⚠ before an
// unparryable one (fx.js `parryCue`).
//
// A whiffed parry leaves a short recovery and a cooldown, so mashing it is
// worse than timing it. A successful one resets almost instantly, so a flurry
// of shots can be parried one by one.

import { TAU, angleTo, clamp } from './util.js';
import { burst, ring, damageText, hitstop, shake } from './fx.js';
import { sfx } from './audio.js';
import { haptic } from './haptics.js';
import { addPoise } from './poise.js';
import { spawnHitbox, spawnProjectile } from './spawn.js';

export const PARRY = {
  window: 0.18,        // default perfect window (weapons can change it)
  recover: 0.22,       // whiff: can't attack or parry again for this long
  cooldown: 0.55,      // from the press, if it whiffs
  grace: 0.08,         // after a success the window stays open this long, for simultaneous hits
  chainCooldown: 0.1,  // after a success, time before the next press counts
  riposteTime: 1.2,
};

// Weapon parry styles live in weapons.js as `parry: {...}`; these are defaults.
const DEFAULT_STYLE = { window: PARRY.window, riposteMult: 2, reflectMult: 2, counter: null };

export function parryStyle(p) {
  const st = { ...DEFAULT_STYLE, ...((p && p.weapon && p.weapon.parry) || {}) };
  const s = p && p.stats;
  if (s) {
    if (s.parryWindow) st.window *= 1 + s.parryWindow;          // Still Mind
    if (s.riposteBonus) st.riposteMult += s.riposteBonus;       // Killing Riposte
  }
  return st;
}

let parryHook = null;
/** game.js registers extra effects for a perfect parry (boons that need combat). */
export function setParryHook(fn) { parryHook = fn; }

export function canParry(p) {
  if (!p || p.dead || p.dashing || p.parry || p.parryCd > 0) return false;
  // Committed swings can't be cancelled into a parry; recovery can (like dash).
  return !p.attack || p.attack.phase === 'recover';
}

export function startParry(p) {
  const st = parryStyle(p);
  p.attack = null;
  p.charging = false;
  p.charge = 0;
  p.chargeReady = false;
  p.parry = { phase: 'window', t: st.window, success: false };
  p.parryCd = PARRY.cooldown;
  sfx.swing(0.45);
}

export function updateParry(p, dt) {
  p.parryCd = Math.max(0, (p.parryCd || 0) - dt);
  p.riposteT = Math.max(0, (p.riposteT || 0) - dt);
  if (!p.parry) return;
  p.parry.t -= dt;
  if (p.parry.t > 0) return;
  if (p.parry.phase === 'window' && !p.parry.success) {
    p.parry.phase = 'recover';
    p.parry.t = PARRY.recover;
  } else {
    p.parry = null;
  }
}

export function isParrying(p) {
  return !!(p && !p.dead && p.parry && p.parry.phase === 'window');
}

/** While recovering from a whiffed parry the player can't act. */
export function parryRecovering(p) {
  return !!(p && p.parry && p.parry.phase === 'recover');
}

/**
 * A hit arrived inside the window. kind: 'melee' (attacker is the enemy) or
 * 'projectile' (the caller reflects the shot itself; see projectiles.js).
 */
export function perfectParry(p, attacker, sx, sy, kind) {
  const st = parryStyle(p);
  p.parry.success = true;
  p.parry.t = Math.max(p.parry.t, PARRY.grace);
  p.parryCd = PARRY.chainCooldown;
  p.focus = Math.min(p.focusMax || 3, (p.focus || 0) + 1);
  p.riposteT = PARRY.riposteTime;
  p.riposteMult = st.riposteMult;
  p.parries = (p.parries || 0) + 1;

  const a = angleTo(p.x, p.y, sx, sy);
  const cx = p.x + Math.cos(a) * p.r, cy = p.y + Math.sin(a) * p.r;
  ring(p.x, p.y, { r0: p.r, r1: 74, color: '#ffe27a', life: 0.26, width: 5 });
  burst(cx, cy, { count: 16, color: '#fff3c0', speed: 340, size: 3.5, life: 0.3, dir: a, spread: 1.6, drag: 5, shape: 'spark' });
  damageText(p.x, p.y - p.r - 16, 'PARRY', { color: '#ffe27a', size: 17 });
  sfx.parry();
  haptic(28);
  hitstop(0.07);
  shake(0.18);

  if (kind === 'melee' && attacker && !attacker.dead) {
    addPoise(attacker, attacker.boss ? 34 : attacker.poiseMax * 0.6);
    const m = Math.max(1, attacker.mass || 1);
    // A shove, but a short one: the riposte has to be able to reach.
    attacker.vx = (attacker.vx || 0) + Math.cos(a) * 240 / m;
    attacker.vy = (attacker.vy || 0) + Math.sin(a) * 240 / m;
    if (!attacker.boss) attacker.stunT = Math.max(attacker.stunT || 0, 0.55);
  }

  if (parryHook) parryHook(p, attacker, kind);

  // Weapon counters: the spear thrusts back, the bow fires back.
  const target = attacker && !attacker.dead ? attacker : null;
  const ta = target ? angleTo(p.x, p.y, target.x, target.y) : a;
  if (st.counter === 'thrust') {
    spawnHitbox({
      shape: 'rect', x: p.x, y: p.y, angle: ta, len: 210, wid: 52, damage: 30, knockback: 380,
      life: 0.12, heavy: true,
    });
    burst(p.x, p.y, { count: 10, color: p.weapon.color, speed: 520, size: 3, life: 0.2, dir: ta, spread: 0.3, drag: 3, shape: 'spark' });
  } else if (st.counter === 'shot' && kind === 'melee') {
    spawnProjectile({
      x: p.x + Math.cos(ta) * 18, y: p.y + Math.sin(ta) * 18,
      vx: Math.cos(ta) * 1150, vy: Math.sin(ta) * 1150,
      r: 6, damage: 26, friendly: true, pierce: 1, shape: 'arrow', color: p.weapon.color,
      life: 1.2, knockback: 160, breaker: true,
    });
  }
}

/** The reflected shot's new heading: at the nearest enemy, else straight back. */
export function reflectAngle(pr, p, nearest) {
  const t = nearest(pr.x, pr.y, 900);
  if (t) return angleTo(pr.x, pr.y, t.x, t.y);
  return Math.atan2(-pr.vy, -pr.vx);
}

/** Ring drawn around the player while the parry window is open. */
export function drawParry(ctx, p, time) {
  if (!p || !p.parry) return;
  if (p.parry.phase === 'window') {
    const st = parryStyle(p);
    const k = clamp(p.parry.t / st.window, 0, 1);
    ctx.globalAlpha = 0.5 + k * 0.4;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 10 + (1 - k) * 6, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 10, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (Math.sin(time * 40) > 0) {
    // Whiff recovery: a dull flicker, so a missed parry is readable.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#9a90b5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 8, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
