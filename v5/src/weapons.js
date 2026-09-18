// Four weapons, each defined as data: a light-attack combo chain plus a
// special on a cooldown. Order is menu order; the first is the default. `performStep` turns one step of that data into
// hitboxes, projectiles and feedback.

import { TAU } from './util.js';
import { spawnHitbox, spawnProjectile } from './spawn.js';
import { slash, shake, burst, ring } from './fx.js';
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
];

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
