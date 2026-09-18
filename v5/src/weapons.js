// Seven weapons, each defined as data: a light-attack combo chain plus a
// special on a cooldown. Order is menu order; the first is the default. `performStep` turns one step of that data into
// hitboxes, projectiles and feedback.

import { TAU, clamp, dist, angleTo } from './util.js';
import { arenaBounds } from './state.js';
import { spawnHitbox, spawnProjectile } from './spawn.js';
import { slash, shake, burst, ring, hitstop, damageText } from './fx.js';
import { nearestEnemy } from './combat.js';
import { sfx } from './audio.js';

export const WEAPONS = [
  {
    id: 'bow',
    name: 'Heart-Seeker',
    glyph: '➳',
    color: '#b98cff',
    tagline: 'Hold to charge a piercing shot. Fragile up close.',
    comboWindow: 0,
    charge: { time: 0.5, minDamage: 12, maxDamage: 40, minSpeed: 760, maxSpeed: 1180 },
    combo: [
      { kind: 'arrow', windup: 0.05, active: 0, recover: 0.2, damage: 12, knockback: 90, lunge: 0 },
    ],
    special: {
      kind: 'spread', windup: 0.12, recover: 0.3, damage: 15, cooldown: 1.92,
      count: 7, spread: 0.95, speed: 820, knockback: 110,
    },
    specialName: 'Arrow Volley',
  },
  {
    id: 'blade',
    name: 'Stygian Blade',
    glyph: '⚔',
    color: '#ff9a5a',
    tagline: 'Three-hit combo ending in a wide spin. Forgiving and fast.',
    comboWindow: 0.46,
    combo: [
      { kind: 'arc', windup: 0.055, active: 0.085, recover: 0.115, arc: 2.0, radius: 116, damage: 17, knockback: 180, lunge: 150 },
      { kind: 'arc', windup: 0.05, active: 0.085, recover: 0.125, arc: 2.2, radius: 120, damage: 19, knockback: 195, lunge: 140 },
      { kind: 'arc', windup: 0.10, active: 0.13, recover: 0.24, arc: TAU, radius: 142, damage: 32, knockback: 430, lunge: 60, spin: true },
    ],
    special: {
      kind: 'arc', windup: 0.15, active: 0.16, recover: 0.28, arc: TAU, radius: 176,
      damage: 44, knockback: 560, cooldown: 1.8, spin: true, lunge: 0,
    },
    specialName: 'Rending Spin',
  },
  {
    id: 'spear',
    name: 'Eternal Spear',
    glyph: '↑',
    color: '#7ad6ff',
    tagline: 'Long piercing thrusts. Great reach, punishes whiffs.',
    comboWindow: 0.5,
    combo: [
      { kind: 'rect', windup: 0.07, active: 0.09, recover: 0.14, len: 186, wid: 44, damage: 21, knockback: 210, lunge: 120 },
      { kind: 'rect', windup: 0.06, active: 0.09, recover: 0.15, len: 196, wid: 44, damage: 23, knockback: 220, lunge: 130 },
      { kind: 'rect', windup: 0.12, active: 0.14, recover: 0.26, len: 250, wid: 56, damage: 38, knockback: 400, lunge: 460 },
    ],
    special: {
      kind: 'boomerang', windup: 0.11, recover: 0.24, damage: 34, cooldown: 1.44,
      speed: 820, knockback: 240,
    },
    specialName: 'Hurled Spear',
  },
  {
    id: 'shield',
    name: 'Shield of Chaos',
    glyph: '◆',
    color: '#ffd45e',
    tagline: 'Bashes block incoming shots. Special ricochets off walls.',
    comboWindow: 0.5,
    combo: [
      { kind: 'arc', windup: 0.07, active: 0.11, recover: 0.14, arc: 1.7, radius: 96, damage: 20, knockback: 380, lunge: 120, block: true },
      { kind: 'arc', windup: 0.07, active: 0.12, recover: 0.16, arc: 1.8, radius: 100, damage: 23, knockback: 430, lunge: 130, block: true },
      { kind: 'arc', windup: 0.13, active: 0.15, recover: 0.28, arc: 2.4, radius: 128, damage: 36, knockback: 700, lunge: 260, block: true },
    ],
    special: {
      kind: 'bounce', windup: 0.12, recover: 0.26, damage: 30, cooldown: 2.1,
      speed: 700, bounces: 5, knockback: 260,
    },
    specialName: 'Bull Rush',
  },
  {
    // Slow and decisive. Tap for two crushing swings; hold to wind up a slam
    // whose size and stagger grow with the charge (the ring on the floor
    // shows its reach). The only weapon that rewards reading, not mashing.
    id: 'maul',
    name: 'Earthbreaker Maul',
    glyph: '\u2692',
    color: '#e0a060',
    tagline: 'Tap for two crushing swings. Hold to wind up a slam that shakes the room.',
    comboWindow: 0.55,
    heavy: { hold: 0.2, time: 1.1, minRadius: 90, maxRadius: 200, minDamage: 30, maxDamage: 100 },
    combo: [
      { kind: 'arc', windup: 0.16, active: 0.12, recover: 0.3, arc: 2.6, radius: 132, damage: 30, knockback: 460, lunge: 90, heavy: 1 },
      { kind: 'arc', windup: 0.2, active: 0.13, recover: 0.38, arc: 2.8, radius: 140, damage: 40, knockback: 640, lunge: 110, heavy: 1.4 },
    ],
    slam: { kind: 'slam', windup: 0.06, active: 0.1, recover: 0.42 },
    special: {
      kind: 'leap', windup: 0.1, active: 0.36, recover: 0.3, cooldown: 3.0,
      damage: 60, radius: 150, range: 280, knockback: 620,
    },
    specialName: 'Skyfall Leap',
  },
  {
    // Four shells of buckshot, brutal up close. The last shell always crits.
    // Empty, it reloads by itself - and dashing mid-reload finishes it at once.
    id: 'gun',
    name: "Deadeye's Blunderbuss",
    glyph: '\u2234',
    color: '#dfe6ff',
    tagline: 'Four shells of close-range buckshot. The last one crits. Dash to reload.',
    comboWindow: 0,
    gun: { shells: 4, reload: 1.0, idleReload: 1.4, lastCrit: true },
    combo: [
      { kind: 'shotgun', windup: 0.03, active: 0, recover: 0.24, damage: 7, pellets: 6, spread: 0.5, speed: 980, knockback: 150, lunge: 0 },
    ],
    special: {
      kind: 'fan', windup: 0.08, active: 0, recover: 0.1, cooldown: 2.4,
      damage: 7, pellets: 5, spread: 1.1, speed: 950, knockback: 130,
    },
    specialName: 'Fan the Hammer',
  },
  {
    // A lawman's two-barrel scattergun with a scope bolted on. Up close it
    // is buckshot; hold the special and the scope comes up - a line that
    // steadies as you hold it - and on release a rifle round goes through
    // everything along it. The longer you hold, the harder it hits.
    id: 'longarm',
    name: "Marshal's Longarm",
    glyph: '\u2316',
    color: '#9fe0a0',
    tagline: 'Two barrels of buckshot up close. Hold special to scope in and fire a rifle round through the room.',
    comboWindow: 0,
    gun: { shells: 2, reload: 0.9, idleReload: 1.2 },
    combo: [
      { kind: 'shotgun', windup: 0.04, active: 0, recover: 0.3, damage: 8, pellets: 7, spread: 0.42, speed: 1000, knockback: 170, lunge: 0 },
    ],
    rifle: { steady: 0.8, minPower: 0.35 },
    special: {
      kind: 'rifle', windup: 0.12, active: 0, recover: 0.32, cooldown: 3.2,
      damage: 150, speed: 2600, knockback: 520,
    },
    specialName: 'Deadeye Scope',
  },
];

/** One blast of buckshot: pellets that slow and scatter, a kick, a flash. */
export function fireShell(p, step, angle, spread, crit) {
  const color = p.weapon.color;
  for (let i = 0; i < step.pellets; i++) {
    const a = angle + (i / (step.pellets - 1) - 0.5) * spread + (Math.random() - 0.5) * 0.08;
    const sp = step.speed * (0.85 + Math.random() * 0.25);
    spawnProjectile({
      x: p.x + Math.cos(angle) * 26, y: p.y + Math.sin(angle) * 26,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 5, damage: step.damage, knockback: step.knockback,
      friendly: true, color: crit ? '#ffd45e' : color, shape: 'orb',
      life: 0.3, accel: -1800, minSpeed: 260, crit, quiet: true,
    });
  }
  // The kick throws you back a little; the muzzle flashes.
  p.vx -= Math.cos(angle) * 170;
  p.vy -= Math.sin(angle) * 170;
  const mx = p.x + Math.cos(angle) * 30, my = p.y + Math.sin(angle) * 30;
  burst(mx, my, { count: 10, color: '#fff3c0', speed: 320, size: 3.5, life: 0.16, dir: angle, spread: 0.6, drag: 6, shape: 'spark' });
  burst(mx, my, { count: 5, color: '#9a948e', speed: 90, size: 7, life: 0.5, dir: angle, spread: 0.8, drag: 3 });
  sfx.gunshot();
  shake(crit ? 0.2 : 0.12);
  if (crit) damageText(p.x, p.y - p.r - 24, 'LAST SHELL', { color: '#ffd45e', size: 14 });
}

/** A maul blow on the ground: a ring of force that staggers what it catches. */
export function groundSlam(p, x, y, r, damage, knockback, power = 1) {
  spawnHitbox({
    shape: 'circle', x, y, radius: r, damage, knockback, life: 0.08, friendly: true,
    onHit: (e) => { if (!e.boss) e.stunT = Math.max(e.stunT || 0, 0.3 + 0.6 * power); },
  });
  ring(x, y, { r0: 10, r1: r, color: '#e0a060', life: 0.32, width: 8 });
  ring(x, y, { r0: 6, r1: r * 0.6, color: '#fff0d0', life: 0.2, width: 4 });
  burst(x, y, { count: 18 + Math.round(18 * power), color: '#c9a878', speed: 260 + 200 * power, size: 5, life: 0.5, drag: 4, shape: 'shard' });
  burst(x, y, { count: 8, color: '#9a8f82', speed: 120, size: 9, life: 0.7, drag: 3 });
  shake(0.35 + 0.55 * power);
  hitstop(0.05 + 0.08 * power);
  sfx.explode();
  sfx.thud();
}

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

/**
 * Spawn the actual damage for one attack step.
 * `power` is 0..1 and only matters for charged shots.
 */
export function performStep(p, step, angle, power = 1) {
  const color = p.weapon.color;

  switch (step.kind) {
    case 'arc': {
      spawnHitbox({
        shape: 'arc', x: p.x, y: p.y, angle,
        arc: step.arc, radius: step.radius,
        damage: step.damage, knockback: step.knockback,
        life: step.active, friendly: true,
        follow: step.spin ? p : null,
        // A maul's swing: the world stops for it, and the room shakes.
        onHit: step.heavy ? () => { hitstop(0.045 * step.heavy); shake(0.14 * step.heavy); sfx.thud(); } : null,
      });
      slash(p.x, p.y, angle, Math.min(step.arc, TAU) * 0.92, step.radius, color,
        step.active + 0.12, step.spin ? 24 : 15);
      burst(p.x + Math.cos(angle) * step.radius * 0.6, p.y + Math.sin(angle) * step.radius * 0.6, {
        count: step.spin ? 14 : 5, color, speed: 260, size: 3.4, life: 0.26,
        dir: angle, spread: step.spin ? TAU : 1.6, drag: 6, shape: 'spark',
      });
      if (step.spin) ring(p.x, p.y, { r0: 20, r1: step.radius, color, life: 0.3, width: 5 });
      sfx.swing(step.spin ? 1.5 : 1);
      shake(step.spin ? 0.22 : 0.05);
      break;
    }

    case 'rect': {
      spawnHitbox({
        shape: 'rect', x: p.x, y: p.y, angle,
        len: step.len, wid: step.wid,
        damage: step.damage, knockback: step.knockback,
        life: step.active, friendly: true, follow: p,
      });
      // A thin, fast arc reads as a thrust when the sweep is narrow.
      slash(p.x, p.y, angle, 0.5, step.len * 0.82, color, step.active + 0.12, step.wid * 0.5);
      burst(p.x + Math.cos(angle) * step.len * 0.8, p.y + Math.sin(angle) * step.len * 0.8, {
        count: 8, color, speed: 320, size: 3.2, life: 0.26,
        dir: angle, spread: 0.7, drag: 6, shape: 'spark',
      });
      sfx.swing(1.1);
      shake(0.07);
      break;
    }

    case 'arrow': {
      const c = p.weapon.charge;
      const damage = c ? c.minDamage + (c.maxDamage - c.minDamage) * power : step.damage;
      const speed = c ? c.minSpeed + (c.maxSpeed - c.minSpeed) * power : 800;
      const shots = 1 + (p.stats.multishot | 0);
      for (let i = 0; i < shots; i++) {
        const off = shots === 1 ? 0 : (i - (shots - 1) / 2) * 0.16;
        const a = angle + off;
        spawnProjectile({
          x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          r: 6 + power * 4, damage, knockback: step.knockback + power * 160,
          friendly: true, color, shape: 'arrow', rot: a,
          pierce: (power > 0.85 ? 2 : power > 0.5 ? 1 : 0) + (p.stats.pierceBonus | 0),
          life: 1.6,
        });
      }
      burst(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, {
        count: 6 + power * 10, color, speed: 240, size: 3, life: 0.22,
        dir: angle, spread: 0.5, drag: 6, shape: 'spark',
      });
      sfx.arrow();
      shake(0.04 + power * 0.13);
      break;
    }

    case 'spread': {
      for (let i = 0; i < step.count; i++) {
        const a = angle + (i - (step.count - 1) / 2) * (step.spread / step.count) * 2;
        spawnProjectile({
          x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
          vx: Math.cos(a) * step.speed, vy: Math.sin(a) * step.speed,
          r: 7, damage: step.damage, knockback: step.knockback,
          friendly: true, color, shape: 'arrow', rot: a,
          pierce: 1 + (p.stats.pierceBonus | 0), life: 1.5,
        });
      }
      ring(p.x, p.y, { r0: 10, r1: 90, color, life: 0.26, width: 4 });
      sfx.arrow();
      shake(0.16);
      break;
    }

    case 'boomerang': {
      spawnProjectile({
        x: p.x + Math.cos(angle) * 24, y: p.y + Math.sin(angle) * 24,
        vx: Math.cos(angle) * step.speed, vy: Math.sin(angle) * step.speed,
        r: 15, damage: step.damage, knockback: step.knockback,
        friendly: true, color, shape: 'spear', rot: angle,
        pierce: 99, life: 1.5, boomerang: true, spin: 16, owner: p,
      });
      sfx.swing(1.3);
      shake(0.14);
      break;
    }

    case 'slam': {
      // The charged maul: a ring of force whose reach and weight follow the charge.
      const h = p.weapon.heavy;
      const r = h.minRadius + (h.maxRadius - h.minRadius) * power;
      const dmg = h.minDamage + (h.maxDamage - h.minDamage) * power;
      groundSlam(p, p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, r, dmg, 380 + 420 * power, power);
      if (power >= 0.99) damageText(p.x, p.y - p.r - 30, 'EARTHBREAKER', { color: color, size: 18 });
      break;
    }

    case 'leap': {
      // Skyfall Leap: up and over to the nearest foe in reach (or straight on).
      const t = nearestEnemy(p.x, p.y, step.range);
      let tx = t ? t.x : p.x + Math.cos(angle) * step.range * 0.8;
      let ty = t ? t.y : p.y + Math.sin(angle) * step.range * 0.8;
      if (t && dist(p.x, p.y, t.x, t.y) > 30) {
        // Land just short of it, not inside it.
        const a = angleTo(t.x, t.y, p.x, p.y);
        tx = t.x + Math.cos(a) * (t.r + p.r);
        ty = t.y + Math.sin(a) * (t.r + p.r);
      }
      const b = arenaBounds();
      tx = clamp(tx, b.l + p.r, b.r - p.r);
      ty = clamp(ty, b.t + p.r, b.b - p.r);
      p.leap = { x0: p.x, y0: p.y, x1: tx, y1: ty, t: 0, T: step.active, step };
      burst(p.x, p.y, { count: 12, color: '#c9a878', speed: 200, size: 4, life: 0.4, drag: 4 });
      sfx.dash();
      break;
    }

    case 'shotgun': {
      if ((p.ammo | 0) <= 0) break;
      const last = p.ammo === 1 && !!p.weapon.gun.lastCrit;
      p.ammo--;
      fireShell(p, step, angle, step.spread, last);
      break;
    }

    case 'rifle': {
      // One round, straight through everything on the line (and any shots
      // in its way). A steady aim crits.
      const full = power >= 0.999;
      spawnProjectile({
        x: p.x + Math.cos(angle) * 30, y: p.y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * step.speed, vy: Math.sin(angle) * step.speed,
        r: 7, damage: Math.round(step.damage * power), knockback: step.knockback * power,
        friendly: true, color: full ? '#ffffff' : color, shape: 'bullet', rot: angle,
        pierce: 99, life: 0.7, crit: full, trailEvery: 0.004,
      });
      // The tracer and the muzzle.
      for (let k = 1; k <= 14; k++) {
        const d = k * 60;
        burst(p.x + Math.cos(angle) * d, p.y + Math.sin(angle) * d, {
          count: 1, color: full ? '#ffffff' : color, speed: 20, size: 2.6, life: 0.25, drag: 4, shape: 'spark',
        });
      }
      const mx = p.x + Math.cos(angle) * 32, my = p.y + Math.sin(angle) * 32;
      burst(mx, my, { count: 14, color: '#fff3c0', speed: 380, size: 3.5, life: 0.18, dir: angle, spread: 0.4, drag: 6, shape: 'spark' });
      ring(mx, my, { r0: 4, r1: 34, color: '#ffffff', life: 0.18, width: 3 });
      p.vx -= Math.cos(angle) * 260;
      p.vy -= Math.sin(angle) * 260;
      sfx.gunshot();
      sfx.thud();
      shake(0.2 + power * 0.2);
      hitstop(0.03 + power * 0.04);
      if (full) damageText(p.x, p.y - p.r - 26, 'DEADEYE', { color: '#ffffff', size: 16 });
      break;
    }

    case 'fan': {
      // Every shell left (at least three), fanned wide, as fast as the hammer falls.
      p.fan = { left: Math.max(3, p.ammo | 0), t: 0, step };
      p.ammo = 0;
      p.reloadT = 0;
      break;
    }

    case 'bounce': {
      spawnProjectile({
        x: p.x + Math.cos(angle) * 24, y: p.y + Math.sin(angle) * 24,
        vx: Math.cos(angle) * step.speed, vy: Math.sin(angle) * step.speed,
        r: 17, damage: step.damage, knockback: step.knockback,
        friendly: true, color, shape: 'shield', rot: angle,
        pierce: 99, life: 3.4, bounces: step.bounces, spin: 14, owner: p,
        retarget: true,
      });
      sfx.block();
      shake(0.16);
      break;
    }
  }
}
