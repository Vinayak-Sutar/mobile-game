// Grenades.
//
// Two ways to throw, off one button:
//   tap   — lands on the nearest enemy inside range, no aiming required
//   hold  — a reticle appears and you place the throw yourself
//
// The hold path is the same gesture on every input: drag from the button on
// touch, move the mouse on desktop, push the right stick on a pad. In all
// three the landing point is clamped to `range`, so a grenade is a
// short-ranged repositioning tool rather than a sniping one.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, dist, angleTo, rand, normalize } from './util.js';
import { input } from './input.js';
import { explode, nearestEnemy } from './combat.js';
import { burst, ring, shake } from './fx.js';
import { sfx } from './audio.js';

export const GRENADE = {
  maxCharges: 2,
  recharge: 6.0,
  damage: 60,
  radius: 115,
  range: 300,        // max throw distance from the player
  travel: 0.45,      // time in the air
  fuse: 0.30,        // time on the ground before it goes off
  arc: 58,           // visual apex height
  holdThreshold: 0.16,
  deadzone: 0.18,
};

// --- aiming ----------------------------------------------------------------

/** Resolve where a held throw is currently pointed, in world coordinates. */
function resolveAim(p) {
  // Mouse gives an absolute point; clamp it into range.
  if (input.grenadeAbs) {
    const d = dist(p.x, p.y, input.grenadeAbs.x, input.grenadeAbs.y);
    if (d <= GRENADE.range) return { x: input.grenadeAbs.x, y: input.grenadeAbs.y };
    const a = angleTo(p.x, p.y, input.grenadeAbs.x, input.grenadeAbs.y);
    return { x: p.x + Math.cos(a) * GRENADE.range, y: p.y + Math.sin(a) * GRENADE.range };
  }

  // Stick or drag gives a direction plus how far it's pushed.
  const m = Math.hypot(input.grenadeVec.x, input.grenadeVec.y);
  if (m > GRENADE.deadzone) {
    const [nx, ny] = normalize(input.grenadeVec.x, input.grenadeVec.y);
    const reach = clamp((m - GRENADE.deadzone) / (1 - GRENADE.deadzone), 0, 1) * GRENADE.range;
    return { x: p.x + nx * reach, y: p.y + ny * reach };
  }

  // Nothing pushed yet: preview the tap target so the two paths agree.
  return autoTarget(p);
}

/**
 * Where a tap would land: the nearest enemy in range, else straight ahead.
 *
 * The returned `target` matters as much as the coordinates. A tapped throw
 * follows that enemy while it is in the air, because the 0.75s of flight and
 * fuse is long enough for anything to walk clear — and lead prediction can't
 * save it either, since a wretch lunges at 560 u/s from a standstill.
 *
 * That gives the two throws distinct jobs: tap is a guaranteed hit on one
 * enemy, hold is a fixed point that can catch a whole group.
 */
function autoTarget(p) {
  const t = nearestEnemy(p.x, p.y, GRENADE.range);
  if (t) return { x: t.x, y: t.y, target: t };
  return {
    x: p.x + Math.cos(p.aimAngle) * GRENADE.range * 0.62,
    y: p.y + Math.sin(p.aimAngle) * GRENADE.range * 0.62,
    target: null,
  };
}

function clampToArena(pt) {
  const b = arenaBounds();
  return {
    x: clamp(pt.x, b.l + 12, b.r - 12),
    y: clamp(pt.y, b.t + 12, b.b - 12),
    target: pt.target || null,
  };
}

export function updateGrenade(p, dt) {
  if (p.dead) { p.grenadeAiming = false; return; }

  // Recharge one at a time, like dashes.
  if (p.grenadeStock < GRENADE.maxCharges) {
    p.grenadeTimer -= dt;
    if (p.grenadeTimer <= 0) {
      p.grenadeStock++;
      p.grenadeTimer = GRENADE.recharge;
      sfx.ui();
    }
  }

  if (input.grenadePressed && p.grenadeStock > 0) {
    p.grenadeHeld = 0;
    p.grenadeAiming = false;
    p.grenadeArmed = true;
  }

  if (p.grenadeArmed && input.grenade) {
    p.grenadeHeld += dt;
    // Past the threshold this becomes a placed throw, and the reticle shows.
    if (p.grenadeHeld >= GRENADE.holdThreshold) p.grenadeAiming = true;
    if (p.grenadeAiming) p.grenadeTarget = clampToArena(resolveAim(p));
  }

  if (p.grenadeArmed && !input.grenade) {
    // Released. A short press is a tap even if the aim vector moved.
    // A placed throw is fixed; a tap follows whatever it locked on to.
    const target = p.grenadeAiming
      ? { ...clampToArena(p.grenadeTarget || autoTarget(p)), target: null }
      : clampToArena(autoTarget(p));
    throwGrenade(p, target.x, target.y, target.target);
    p.grenadeArmed = false;
    p.grenadeAiming = false;
    p.grenadeHeld = 0;
  }
}

// --- throwing --------------------------------------------------------------

export function throwGrenade(p, tx, ty, track = null) {
  if (p.grenadeStock <= 0) return null;
  const wasFull = p.grenadeStock === GRENADE.maxCharges;
  p.grenadeStock--;
  if (wasFull) p.grenadeTimer = GRENADE.recharge;

  const g = {
    x: p.x, y: p.y,
    sx: p.x, sy: p.y,
    tx, ty,
    t: 0,
    travel: GRENADE.travel,
    fuse: GRENADE.fuse,
    landed: false,
    rot: rand(0, TAU),
    track,
    // Boons scale the blast, since explode() deals raw damage.
    damage: GRENADE.damage * p.stats.damageMult,
    dead: false,
  };
  world.grenades.push(g);

  sfx.swing(0.9);
  burst(p.x, p.y, {
    count: 6, color: '#ffd45e', speed: 150, size: 3, life: 0.25, drag: 5,
    dir: angleTo(p.x, p.y, tx, ty), spread: 1.0,
  });
  return g;
}

export function updateGrenades(dt) {
  for (let i = world.grenades.length - 1; i >= 0; i--) {
    const g = world.grenades[i];
    g.t += dt;
    g.rot += dt * 9;

    if (!g.landed) {
      // Follow the locked-on enemy, still clamped to how far we could throw.
      if (g.track && !g.track.dead) {
        const d = dist(g.sx, g.sy, g.track.x, g.track.y);
        if (d <= GRENADE.range) {
          g.tx = g.track.x;
          g.ty = g.track.y;
        } else {
          const a = angleTo(g.sx, g.sy, g.track.x, g.track.y);
          g.tx = g.sx + Math.cos(a) * GRENADE.range;
          g.ty = g.sy + Math.sin(a) * GRENADE.range;
        }
      }
      const k = clamp(g.t / g.travel, 0, 1);
      g.x = g.sx + (g.tx - g.sx) * k;
      g.y = g.sy + (g.ty - g.sy) * k;
      g.height = Math.sin(k * Math.PI) * GRENADE.arc;
      if (k >= 1) {
        g.landed = true;
        g.height = 0;
        g.t = 0;
        sfx.block();
        burst(g.x, g.y, { count: 5, color: '#ffd45e', speed: 90, size: 2.5, life: 0.22, drag: 6 });
      }
    } else {
      g.fuse -= dt;
      // Blink faster as it counts down.
      if (g.fuse <= 0) {
        explode(g.x, g.y, GRENADE.radius, g.damage, null, '#ffd45e', false);
        ring(g.x, g.y, { r0: 10, r1: GRENADE.radius * 1.15, color: '#fff3d0', life: 0.28, width: 5 });
        shake(0.5);
        world.grenades.splice(i, 1);
        continue;
      }
    }
  }
}

// --- rendering -------------------------------------------------------------

/** Reticle, range ring and blast preview, drawn under the entities. */
export function drawGrenadeAim(ctx, p, time) {
  if (!p || p.dead || !p.grenadeAiming || !p.grenadeTarget) return;
  const t = p.grenadeTarget;

  // How far you may throw.
  ctx.strokeStyle = 'rgba(255,212,94,0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 9]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, GRENADE.range, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // Flight path.
  ctx.strokeStyle = 'rgba(255,212,94,0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(t.x, t.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Blast radius, so the throw is a decision and not a guess.
  const pulse = 0.55 + Math.sin(time * 7) * 0.2;
  ctx.fillStyle = `rgba(255,212,94,${0.10 * pulse})`;
  ctx.beginPath();
  ctx.arc(t.x, t.y, GRENADE.radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,212,94,${0.75 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(t.x, t.y, GRENADE.radius, 0, TAU);
  ctx.stroke();

  // Crosshair.
  ctx.strokeStyle = '#ffd45e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    ctx.moveTo(t.x + dx * 9, t.y + dy * 9);
    ctx.lineTo(t.x + dx * 19, t.y + dy * 19);
  }
  ctx.stroke();
}

export function drawGrenades(ctx, time) {
  for (const g of world.grenades) {
    const h = g.height || 0;

    // Ground shadow doubles as the landing marker while it's in the air.
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 4, 7 - h * 0.03, 3.4 - h * 0.014, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (!g.landed) {
      // Target marker so you can see where it will come down.
      ctx.strokeStyle = 'rgba(255,212,94,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.tx, g.ty, 14, 0, TAU);
      ctx.stroke();
    } else {
      // Warning ring collapsing inward as the fuse burns down.
      const k = 1 - clamp(g.fuse / GRENADE.fuse, 0, 1);
      ctx.strokeStyle = `rgba(255,120,60,${0.35 + k * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GRENADE.radius * (1 - k * 0.25), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,120,60,${0.08 + k * 0.10})`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GRENADE.radius * (1 - k * 0.25), 0, TAU);
      ctx.fill();
    }

    const blink = g.landed && Math.sin(g.t * 40) > 0;
    ctx.save();
    ctx.translate(g.x, g.y - h);
    ctx.rotate(g.rot);
    ctx.fillStyle = blink ? '#ffffff' : '#3a2f1a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = blink ? '#ffffff' : '#ffd45e';
    ctx.fillRect(-2, -8.5, 4, 4);
    ctx.restore();
  }
}
