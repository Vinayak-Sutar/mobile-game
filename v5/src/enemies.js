// Enemy roster. Every type is a small state machine with an explicit,
// readable telegraph before anything that can hurt the player — that
// readability is what makes a dodge-and-punish loop feel fair.

import { world } from './state.js';
import { TAU, clamp, rand, dist, angleTo, polygon, lerp } from './util.js';
import { spawnProjectile } from './spawn.js';
import { damagePlayer, explode, dealDamage } from './combat.js';
import { burst, ring, shake, flash as screenFlash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { createEnemyAnimator, updateEnemyAnim, drawEnemyRig } from './enemy-rigs.js';
import {
  player, stepToward, stepAway, strafe, collideWorld, contactDamage, telegraphRing,
} from './ai.js';
import { BOSS_DEFS, bindBossSpawner, clearHostiles, clearBullets, drawBossExtras } from './bosses.js';
import { FOLK_DEFS, bindFolkSpawner, updateCorpses } from './enemies-folk.js';
import { TRAINING_DEFS } from './training.js';
import { FOLK_DEFS2, tickHidden } from './enemies-folk2.js';

const SPAWN_TIME = 0.75;

// --- shared behaviour helpers ---------------------------------------------
// Movement helpers live in ai.js so the bosses can share them.

function separate(e, dt) {
  for (const o of world.enemies) {
    if (o === e || o.dead || o.spawning || o.noPush) continue;
    const d = dist(e.x, e.y, o.x, o.y);
    const min = e.r + o.r;
    if (d > 0.01 && d < min) {
      const push = ((min - d) / min) * 220 * dt;
      const a = angleTo(o.x, o.y, e.x, e.y);
      e.x += Math.cos(a) * push;
      e.y += Math.sin(a) * push;
    }
  }
}

// --- enemy definitions -----------------------------------------------------

export const ENEMY_DEFS = {
  wretch: {
    r: 15, hp: 30, speed: 175, mass: 1, cost: 2, minDepth: 1, color: '#ff5e6e',
    role: 'rusher',
    update(e, dt) {
      const p = player();
      if (!p) return;
      const d = dist(e.x, e.y, p.x, p.y);
      e.cd = Math.max(0, e.cd - dt);

      if (e.state === 'chase') {
        stepToward(e, p.x, p.y, e.speed, dt);
        if (d < 145 && e.cd <= 0) { e.state = 'windup'; e.t = 0.34; e.aim = angleTo(e.x, e.y, p.x, p.y); }
      } else if (e.state === 'windup') {
        e.t -= dt;
        e.aim = lerp(e.aim, angleTo(e.x, e.y, p.x, p.y), 1 - Math.pow(0.001, dt));
        stepAway(e, p.x, p.y, 40, dt);
        if (e.t <= 0) {
          e.state = 'lunge'; e.t = 0.26;
          sfx.swing(0.7);
          burst(e.x, e.y, { count: 6, color: e.color, speed: 130, size: 3, life: 0.24, drag: 5 });
        }
      } else if (e.state === 'lunge') {
        e.t -= dt;
        e.x += Math.cos(e.aim) * 560 * dt;
        e.y += Math.sin(e.aim) * 560 * dt;
        contactDamage(e, dt, e.damage, 0.6);
        if (e.t <= 0) { e.state = 'chase'; e.cd = 0.85; }
      }
    },
    draw(e, ctx) {
      const wind = e.state === 'windup' ? 1 - e.t / 0.34 : 0;
      const s = 1 + wind * 0.28;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.face || 0);
      ctx.fillStyle = e.tint;
      polygon(ctx, 0, 0, e.r * s, 4, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      polygon(ctx, 0, 0, e.r * s * 0.5, 4, 0);
      ctx.fill();
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath();
      ctx.arc(e.r * s * 0.34, 0, 2.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  },

  slinger: {
    r: 15, hp: 42, speed: 140, mass: 1.1, cost: 3, minDepth: 2, color: '#5ee0c8',
    role: 'shooter',
    init(e) { e.sign = Math.random() < 0.5 ? 1 : -1; e.cd = rand(0.6, 1.6); },
    update(e, dt) {
      const p = player();
      if (!p) return;
      const d = dist(e.x, e.y, p.x, p.y);
      e.cd -= dt;
      e.face = angleTo(e.x, e.y, p.x, p.y);

      // Hold a shooting band: back off when crowded, close when too far.
      if (d < 230) stepAway(e, p.x, p.y, e.speed, dt);
      else if (d > 330) stepToward(e, p.x, p.y, e.speed * 0.9, dt);
      strafe(e, p.x, p.y, e.speed * 0.55, dt, e.sign);
      if (Math.random() < dt * 0.4) e.sign *= -1;

      if (e.state === 'chase' && e.cd <= 0 && d < 460) { e.state = 'aim'; e.t = 0.42; }
      else if (e.state === 'aim') {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'fire'; e.t = 0; e.shots = 3; }
      } else if (e.state === 'fire') {
        e.t -= dt;
        if (e.t <= 0) {
          const a = e.face + rand(-0.07, 0.07);
          spawnProjectile({
            x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18,
            vx: Math.cos(a) * 310, vy: Math.sin(a) * 310,
            r: 8, damage: e.damage, color: e.color, shape: 'orb', life: 3, srcType: 'slinger',
          });
          sfx.shoot();
          burst(e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, {
            count: 4, color: e.color, speed: 140, size: 2.6, life: 0.2, dir: a, spread: 0.7, drag: 6,
          });
          e.shots--;
          e.t = 0.13;
          if (e.shots <= 0) { e.state = 'chase'; e.cd = rand(1.9, 2.6); }
        }
      }
    },
    draw(e, ctx) {
      const charging = e.state === 'aim' ? 1 - e.t / 0.42 : 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.face || 0);
      ctx.fillStyle = e.tint;
      ctx.beginPath();
      ctx.moveTo(e.r * 1.35, 0);
      ctx.lineTo(-e.r * 0.85, -e.r * 0.95);
      ctx.lineTo(-e.r * 0.4, 0);
      ctx.lineTo(-e.r * 0.85, e.r * 0.95);
      ctx.closePath();
      ctx.fill();
      if (charging > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = charging;
        ctx.beginPath();
        ctx.arc(e.r * 1.2, 0, 2 + charging * 5, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
  },

  brute: {
    r: 27, hp: 140, speed: 88, mass: 3, cost: 6, minDepth: 3, color: '#a97bff',
    role: 'heavy', maxPerWave: 2,
    update(e, dt) {
      const p = player();
      if (!p) return;
      const d = dist(e.x, e.y, p.x, p.y);
      e.cd = Math.max(0, e.cd - dt);

      if (e.state === 'chase') {
        stepToward(e, p.x, p.y, e.speed, dt);
        if (d < 140 && e.cd <= 0) { e.state = 'wind'; e.t = 0.78; sfx.telegraph(); }
      } else if (e.state === 'wind') {
        e.t -= dt;
        stepToward(e, p.x, p.y, 22, dt);
        const k = 1 - e.t / 0.78;
        if (Math.random() < dt * 30) telegraphRing(e, k, 124, '#ff9a4d');
        if (e.t <= 0) {
          e.state = 'recover'; e.t = 0.85;
          ring(e.x, e.y, { r0: 10, r1: 128, color: '#ff9a4d', life: 0.32, width: 9 });
          burst(e.x, e.y, { count: 20, color: '#ff9a4d', speed: 380, size: 5, life: 0.5, drag: 4, shape: 'shard' });
          shake(0.45);
          sfx.explode();
          if (dist(e.x, e.y, p.x, p.y) < 128 + p.r) damagePlayer(e.damage, e.x, e.y, 'brute');
        }
      } else if (e.state === 'recover') {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'chase'; e.cd = 1.1; }
      }
    },
    draw(e, ctx) {
      const wind = e.state === 'wind' ? 1 - e.t / 0.78 : 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate((e.face || 0) + wind * 0.5);
      const s = 1 + wind * 0.16;
      ctx.fillStyle = e.tint;
      polygon(ctx, 0, 0, e.r * s, 6, 0);
      ctx.fill();
      ctx.strokeStyle = wind > 0 ? `rgba(255,154,77,${0.4 + wind * 0.6})` : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 4;
      polygon(ctx, 0, 0, e.r * s, 6, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      polygon(ctx, 0, 0, e.r * s * 0.45, 6, 0.4);
      ctx.fill();
      ctx.restore();
    },
  },

  charger: {
    r: 20, hp: 78, speed: 105, mass: 1.6, cost: 5, minDepth: 3, color: '#ff9a4d',
    role: 'rusher',
    update(e, dt) {
      const p = player();
      if (!p) return;
      const d = dist(e.x, e.y, p.x, p.y);
      e.cd = Math.max(0, e.cd - dt);

      if (e.state === 'chase') {
        stepToward(e, p.x, p.y, e.speed, dt);
        if (d < 520 && d > 90 && e.cd <= 0) { e.state = 'aim'; e.t = 0.62; sfx.telegraph(); }
      } else if (e.state === 'aim') {
        e.t -= dt;
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.aim;
        // Draw the charge lane as a stream of sparks so it is unmissable.
        if (Math.random() < dt * 60) {
          const t = Math.random();
          burst(e.x + Math.cos(e.aim) * 640 * t, e.y + Math.sin(e.aim) * 640 * t, {
            count: 1, color: '#ff9a4d', speed: 10, size: 3, life: 0.16, drag: 1,
          });
        }
        if (e.t <= 0) { e.state = 'charge'; e.t = 1.5; sfx.dash(); }
      } else if (e.state === 'charge') {
        e.t -= dt;
        e.x += Math.cos(e.aim) * 690 * dt;
        e.y += Math.sin(e.aim) * 690 * dt;
        burst(e.x, e.y, { count: 1, color: '#ff9a4d', speed: 30, size: 4, life: 0.22, drag: 3 });
        contactDamage(e, dt, e.damage, 0.8);
        if (collideWorld(e) || e.t <= 0) {
          e.state = 'stun'; e.t = 1.05;
          burst(e.x, e.y, { count: 16, color: '#ffd45e', speed: 300, size: 4, life: 0.4, drag: 4, shape: 'spark' });
          ring(e.x, e.y, { r0: 6, r1: 70, color: '#ffd45e', life: 0.3, width: 4 });
          shake(0.3);
          sfx.hit(1);
        }
      } else if (e.state === 'stun') {
        e.t -= dt;
        if (Math.random() < dt * 8) {
          burst(e.x, e.y - e.r, { count: 1, color: '#ffd45e', speed: 30, size: 3, life: 0.5, gravity: -40, drag: 1 });
        }
        if (e.t <= 0) { e.state = 'chase'; e.cd = 0.9; }
      }
    },
    draw(e, ctx) {
      const stunned = e.state === 'stun';
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate((e.face || 0) + (stunned ? Math.sin(world.runTime * 22) * 0.2 : 0));
      ctx.fillStyle = e.tint;
      ctx.beginPath();
      ctx.moveTo(e.r * 1.5, 0);
      ctx.lineTo(-e.r, -e.r);
      ctx.lineTo(-e.r * 0.55, 0);
      ctx.lineTo(-e.r, e.r);
      ctx.closePath();
      ctx.fill();
      if (e.state === 'aim') {
        ctx.globalAlpha = 0.5 + Math.sin(world.runTime * 30) * 0.3;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.r * 0.9, 0, 4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
  },

  bomber: {
    r: 16, hp: 26, speed: 155, mass: 0.8, cost: 3, minDepth: 2, color: '#ff4d9d',
    role: 'bomber', maxPerWave: 3,
    init(e) {
      e.onDeath = (self) => {
        if (!self.detonated) explode(self.x, self.y, 100, self.damage, self, '#ff4d9d', true, 'bomber');
      };
    },
    update(e, dt) {
      const p = player();
      if (!p) return;
      const d = dist(e.x, e.y, p.x, p.y);
      if (e.state === 'chase') {
        stepToward(e, p.x, p.y, e.speed, dt);
        if (d < 78) { e.state = 'fuse'; e.t = 0.82; sfx.telegraph(); }
      } else if (e.state === 'fuse') {
        e.t -= dt;
        stepToward(e, p.x, p.y, e.speed * 0.5, dt);
        if (e.t <= 0) {
          e.detonated = true;
          explode(e.x, e.y, 100, e.damage, e, '#ff4d9d', true, 'bomber');
          e.hp = 0; e.dead = true;
        }
      }
    },
    draw(e, ctx) {
      const fuse = e.state === 'fuse' ? 1 - e.t / 0.82 : 0;
      const blink = fuse > 0 ? (Math.sin(world.runTime * (12 + fuse * 46)) > 0 ? 1 : 0.32) : 1;
      const bob = Math.sin(world.runTime * 4 + e.seed) * 3;
      ctx.save();
      ctx.translate(e.x, e.y + bob);
      ctx.fillStyle = e.tint;
      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * (1 + fuse * 0.3), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.38 * (1 + fuse), 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  },

  splitter: {
    r: 23, hp: 68, speed: 118, mass: 1.8, cost: 4, minDepth: 3, color: '#7dff9c',
    role: 'swarm',
    init(e) {
      e.onDeath = (self) => {
        if (self.isSpawn) return;
        for (let i = 0; i < 2; i++) {
          const a = rand(0, TAU);
          const c = spawnEnemy('splitter', self.x + Math.cos(a) * 26, self.y + Math.sin(a) * 26, {
            scale: self.scale, instant: true,
          });
          c.isSpawn = true;
          c.r = 12;
          c.maxHp = Math.max(10, Math.round(self.maxHp * 0.22));
          c.hp = c.maxHp;
          c.speed = self.speed * 1.35;
          c.damage = self.damage * 0.45;
          c.vx = Math.cos(a) * 220;
          c.vy = Math.sin(a) * 220;
        }
      };
    },
    update(e, dt) {
      const p = player();
      if (!p) return;
      stepToward(e, p.x, p.y, e.speed, dt);
      contactDamage(e, dt, e.damage, 1.05);
    },
    draw(e, ctx) {
      const wob = Math.sin(world.runTime * 6 + e.seed) * 0.12;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = e.tint;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const rr = e.r * (1 + Math.sin(a * 3 + world.runTime * 5 + e.seed) * 0.13 + wob);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  },

  spitter: {
    r: 21, hp: 60, speed: 0, mass: 6, cost: 4, minDepth: 4, color: '#ff7ad6',
    role: 'shooter', maxPerWave: 2,
    init(e) { e.noPush = true; e.cd = rand(0.8, 2.0); e.phase = 0; },
    update(e, dt) {
      e.cd -= dt;
      e.spin = (e.spin || 0) + dt * 0.7;
      if (e.state === 'chase' && e.cd <= 0) { e.state = 'wind'; e.t = 0.5; sfx.telegraph(); }
      else if (e.state === 'wind') {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'chase';
          e.cd = 2.4;
          e.phase += 0.35;
          const n = 9;
          for (let i = 0; i < n; i++) {
            const a = e.phase + (i / n) * TAU;
            spawnProjectile({
              x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20,
              vx: Math.cos(a) * 215, vy: Math.sin(a) * 215,
              r: 8, damage: e.damage, color: e.color, shape: 'orb', life: 4, srcType: 'spitter',
            });
          }
          ring(e.x, e.y, { r0: 8, r1: 64, color: e.color, life: 0.28, width: 4 });
          sfx.shoot();
        }
      }
    },
    draw(e, ctx) {
      const wind = e.state === 'wind' ? 1 - e.t / 0.5 : 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.spin || 0);
      ctx.fillStyle = e.tint;
      polygon(ctx, 0, 0, e.r * (1 + wind * 0.22), 5, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.35 + wind * 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.32, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  },

  // --- boss ---------------------------------------------------------------
  warden: {
    r: 46, hp: 1250, speed: 92, mass: 12, cost: 999, minDepth: 99, color: '#ff3d5e',
    boss: true,
    init(e) {
      e.noPush = true;
      e.phase = 1;
      e.phases = [0.62, 0.3];
      e.action = 'idle';
      e.t = 1.2;
      e.title = 'The Warden of Ash';
      // A boss's death wipes its bullets: the win should land on a clean screen.
      e.onDeath = (self) => clearHostiles(self);
    },
    update(e, dt) {
      const p = player();
      if (!p) return;
      const frac = e.hp / e.maxHp;

      // Phase transitions: brief invulnerable roar, then a cleansing shockwave.
      const wantPhase = frac <= 0.3 ? 3 : frac <= 0.62 ? 2 : 1;
      if (wantPhase > e.phase && e.action !== 'phase') {
        e.phase = wantPhase;
        e.action = 'phase';
        e.t = 1.5;
        e.invuln = true;
        e.exposed = 0;
        clearBullets();
        sfx.bossRoar();
        screenFlash(0.4, '#ff9a4d');
        shake(0.9);
        return;
      }
      if (e.exposed > 0) e.exposed = Math.max(0, e.exposed - dt);

      e.t -= dt;

      switch (e.action) {
        case 'phase': {
          if (Math.random() < dt * 40) {
            burst(e.x, e.y, { count: 2, color: '#ff9a4d', speed: 420, size: 5, life: 0.6, drag: 2, shape: 'shard' });
          }
          if (e.t <= 0) {
            e.invuln = false;
            explode(e.x, e.y, 300, 18, e, '#ff9a4d', true, 'warden');
            e.action = 'idle'; e.t = 0.5;
          }
          break;
        }
        case 'idle': {
          stepToward(e, p.x, p.y, e.speed, dt);
          if (e.t <= 0) chooseWardenAction(e, p);
          break;
        }
        case 'slam': {
          const total = e.phase >= 3 ? 0.62 : 0.8;
          stepToward(e, p.x, p.y, 26, dt);
          if (Math.random() < dt * 40) telegraphRing(e, 1 - e.t / total, 215, '#ff9a4d');
          if (e.t <= 0) {
            ring(e.x, e.y, { r0: 14, r1: 220, color: '#ff9a4d', life: 0.4, width: 12 });
            burst(e.x, e.y, { count: 34, color: '#ff9a4d', speed: 520, size: 6, life: 0.6, drag: 4, shape: 'shard' });
            shake(0.75);
            sfx.explode();
            if (dist(e.x, e.y, p.x, p.y) < 220 + p.r) damagePlayer(e.damage * 1.15, e.x, e.y, 'warden');
            e.action = 'idle'; e.t = e.phase >= 3 ? 0.4 : 0.75;
          }
          break;
        }
        case 'volley': {
          if (e.t <= 0) {
            const n = 12 + e.phase * 2;
            e.volleyPhase = (e.volleyPhase || 0) + 0.26;
            for (let i = 0; i < n; i++) {
              const a = e.volleyPhase + (i / n) * TAU;
              spawnProjectile({
                x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
                vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                r: 9, damage: e.damage * 0.5, color: '#ff6b8a', shape: 'orb', life: 4, srcType: 'warden',
              });
            }
            ring(e.x, e.y, { r0: 10, r1: 110, color: '#ff6b8a', life: 0.3, width: 5 });
            sfx.shoot();
            e.volleys--;
            e.t = 0.38;
            if (e.volleys <= 0) { e.action = 'idle'; e.t = 0.7; }
          }
          break;
        }
        case 'aim': {
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          if (Math.random() < dt * 70) {
            const t = Math.random();
            burst(e.x + Math.cos(e.aim) * 800 * t, e.y + Math.sin(e.aim) * 800 * t, {
              count: 1, color: '#ff3d5e', speed: 12, size: 4, life: 0.2, drag: 1,
            });
          }
          if (e.t <= 0) { e.action = 'charge'; e.t = 1.4; sfx.dash(); }
          break;
        }
        case 'charge': {
          e.x += Math.cos(e.aim) * 880 * dt;
          e.y += Math.sin(e.aim) * 880 * dt;
          burst(e.x, e.y, { count: 2, color: '#ff3d5e', speed: 60, size: 6, life: 0.3, drag: 3 });
          contactDamage(e, dt, e.damage * 1.2, 0.9);
          if (collideWorld(e) || e.t <= 0) {
            shake(0.6);
            sfx.explode();
            burst(e.x, e.y, { count: 24, color: '#ffd45e', speed: 400, size: 5, life: 0.5, drag: 4, shape: 'spark' });
            e.chargesLeft = (e.chargesLeft || 0) - 1;
            if (e.chargesLeft > 0) { e.action = 'aim'; e.t = 0.4; }
            else { e.action = 'stun'; e.t = 1.15; e.exposed = 1.15; }
          }
          break;
        }
        case 'stun': {
          if (Math.random() < dt * 10) {
            burst(e.x, e.y - e.r, { count: 1, color: '#ffd45e', speed: 40, size: 4, life: 0.6, gravity: -40, drag: 1 });
          }
          if (e.t <= 0) { e.action = 'idle'; e.t = 0.3; }
          break;
        }
        case 'summon': {
          if (e.t <= 0) {
            const type = e.phase >= 3 ? 'bomber' : 'wretch';
            const n = e.phase >= 2 ? 4 : 3;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU + rand(-0.3, 0.3);
              spawnEnemy(type, e.x + Math.cos(a) * 130, e.y + Math.sin(a) * 130, { scale: e.scale * 0.8 });
            }
            sfx.spawn();
            e.action = 'idle'; e.t = 0.8;
          }
          break;
        }
        case 'spiral': {
          e.spiralT = (e.spiralT || 0) - dt;
          if (e.spiralT <= 0) {
            e.spiralT = 0.075;
            e.spiralA = (e.spiralA || 0) + 0.42;
            for (let k = 0; k < 2; k++) {
              const a = e.spiralA + k * Math.PI;
              spawnProjectile({
                x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
                vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
                r: 8, damage: e.damage * 0.42, color: '#c07bff', shape: 'orb', life: 4.5, srcType: 'warden',
              });
            }
          }
          stepToward(e, p.x, p.y, 40, dt);
          // The spiral is the Warden's densest pattern; it ends winded.
          if (e.t <= 0) { e.action = 'stun'; e.t = 1.0; e.exposed = 1.0; }
          break;
        }
      }
    },
    draw(e, ctx) {
      const winding = e.action === 'slam' || e.action === 'aim';
      const s = 1 + (winding ? 0.1 : 0) + Math.sin(world.runTime * 2.2) * 0.02;
      ctx.save();
      ctx.translate(e.x, e.y);

      // Outer aura
      ctx.globalAlpha = 0.18 + (e.invuln ? 0.3 : 0);
      ctx.fillStyle = '#ff3d5e';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 1.6 * s, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.rotate((e.face || 0) + Math.PI / 2);
      ctx.fillStyle = e.tint;
      polygon(ctx, 0, 0, e.r * s, 7, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,180,0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = 'rgba(10,4,14,0.72)';
      polygon(ctx, 0, 0, e.r * s * 0.62, 7, 0.45);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ffe27a';
      for (const off of [-0.34, 0.34]) {
        ctx.beginPath();
        ctx.arc(Math.cos(-Math.PI / 2 + off) * e.r * 0.42, Math.sin(-Math.PI / 2 + off) * e.r * 0.42, 4.6, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  },
};

// The four creature bosses and their minions live in bosses.js, and the
// folk enemies (Chinthe, Adze, Vetala) in enemies-folk.js.
Object.assign(ENEMY_DEFS, BOSS_DEFS, FOLK_DEFS, FOLK_DEFS2, TRAINING_DEFS);

function chooseWardenAction(e, p) {
  const d = dist(e.x, e.y, p.x, p.y);
  const pool = [];
  if (d < 260) pool.push('slam', 'slam');
  if (d > 200) pool.push('aim');
  pool.push('volley');
  if (world.enemies.length < 7) pool.push('summon');
  if (e.phase >= 3) pool.push('spiral', 'slam');
  if (e.phase >= 2) pool.push('volley');

  const action = pool[(Math.random() * pool.length) | 0];
  e.action = action;
  switch (action) {
    case 'slam': e.t = e.phase >= 3 ? 0.62 : 0.8; sfx.telegraph(); break;
    case 'volley': e.volleys = e.phase >= 2 ? 3 : 2; e.t = 0.25; break;
    case 'aim': e.t = 0.7; e.chargesLeft = e.phase >= 3 ? 2 : 1; sfx.telegraph(); break;
    case 'summon': e.t = 0.5; break;
    case 'spiral': e.t = 2.4; break;
  }
}

// --- lifecycle -------------------------------------------------------------

export function spawnEnemy(type, x, y, opts = {}) {
  const def = ENEMY_DEFS[type];
  const scale = opts.scale ?? 1;
  const dmgScale = opts.dmgScale ?? Math.min(2.0, 0.9 + scale * 0.26);

  const e = {
    type, def,
    x, y,
    vx: 0, vy: 0,
    r: def.r,
    mass: def.mass,
    speed: def.speed,
    color: def.color,
    tint: def.color,
    maxHp: Math.round(def.hp * scale),
    hp: 0,
    damage: Math.round((def.damageBase ?? defaultDamage(type)) * dmgScale),
    state: 'chase',
    t: 0, cd: 0, aim: 0, face: rand(0, TAU),
    flash: 0,
    seed: rand(0, 100),
    scale,
    boss: !!def.boss,
    elite: !!opts.elite,
    dead: false,
    spawning: !opts.instant,
    spawnT: opts.instant ? SPAWN_TIME : 0,
  };
  e.hp = e.maxHp;

  if (e.elite) {
    e.r *= 1.22;
    e.maxHp = Math.round(e.maxHp * 1.9);
    e.hp = e.maxHp;
    e.damage = Math.round(e.damage * 1.15);
    e.speed *= 1.08;
    e.mass *= 1.6;
  }

  // Boss summons: recoloured to match their master, and tied to it so they
  // vanish when it dies.
  if (opts.color) { e.color = opts.color; e.tint = opts.color; }
  e.summoner = opts.summoner || null;
  if (opts.tier !== undefined) e.tier = opts.tier;

  e.anim = createEnemyAnimator(type);

  if (def.init) def.init(e);
  world.enemies.push(e);
  if (!e.spawning && !def.invisible) sfx.spawn();
  return e;
}

// Bosses summon minions and the Vetala raises the dead; hand both the
// factory rather than importing it back.
bindBossSpawner(spawnEnemy);
bindFolkSpawner(spawnEnemy);

function defaultDamage(type) {
  return {
    wretch: 8, slinger: 8, brute: 15, charger: 13, bomber: 15, splitter: 8, spitter: 8, warden: 22,
  }[type] ?? 10;
}

export function updateEnemies(dt) {
  updateCorpses(dt);
  tickHidden();
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.dead) { world.enemies.splice(i, 1); continue; }

    e.flash = Math.max(0, e.flash - dt);

    // Spawn telegraph: a growing portal so nothing appears on top of you.
    if (e.spawning) {
      e.spawnT += dt;
      const k = e.spawnT / SPAWN_TIME;
      if (Math.random() < dt * 30) {
        ring(e.x, e.y, { r0: e.r * 1.7 * (1 - k), r1: e.r * 1.7 * (1 - k) + 1, color: e.color, life: 0.1, width: 2 });
      }
      if (e.spawnT >= SPAWN_TIME) {
        e.spawning = false;
        burst(e.x, e.y, { count: 14, color: e.color, speed: 220, size: 4, life: 0.4, drag: 4 });
        ring(e.x, e.y, { r0: 2, r1: e.r * 2.6, color: e.color, life: 0.3, width: 4 });
        sfx.spawn();
      }
      continue;
    }

    // Parts placed by their boss each frame (coils) don't move themselves.
    if (e.def.fixed) continue;

    // Knockback velocity decays exponentially; AI movement is applied on top.
    const decay = Math.exp(-7 * dt);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= decay;
    e.vy *= decay;

    // Remember where it was, so we can derive real velocity below. AI moves
    // enemies by writing x/y directly, so this is the only honest source.
    const prevX = e.x, prevY = e.y;

    const slowMul = e.slow ? e.slow.mult : 1;
    const savedSpeed = e.speed;
    e.speed *= slowMul;
    if ((e.stunT || 0) > 0 && !e.boss) {
      // Stunned (Chain Lightning, Gale): whatever it was winding up is cancelled.
      e.stunT -= dt;
      if (e.state !== 'chase') { e.state = 'chase'; e.t = 0; e.cd = Math.max(e.cd || 0, 0.4); }
    } else if (e.asleep && e.asleep(e)) {
      // Dozing by a campfire in The Wilds (overworld.js): nothing until woken.
    } else {
      e.def.update(e, dt);
    }
    e.speed = savedSpeed;

    separate(e, dt);
    // Airborne (a leaping gorilla) sails over pillars; walls still apply on landing.
    if (!e.z) {
      const bumped = collideWorld(e);
      // Hurled by Gale into a wall or pillar: a slam.
      if (e.galeT > 0) {
        e.galeT -= dt;
        if (bumped && Math.hypot(e.vx || 0, e.vy || 0) > 220) {
          e.galeT = 0;
          dealDamage(e, 22, { source: 'spell' });
          damageText(e.x, e.y - e.r - 20, 'SLAM', { color: '#9fffcf', size: 17 });
          shake(0.25);
        }
      }
    }

    if (dt > 0) {
      e.mvx = (e.x - prevX) / dt;
      e.mvy = (e.y - prevY) / dt;
    }

    updateEnemyAnim(e, dt);
  }
}

export function drawEnemies(ctx) {
  for (const e of world.enemies) {
    // Boss parts drawn by their boss (Nagaraja's coils) draw nothing themselves.
    if (e.def.invisible) continue;
    if (e.spawning) {
      const k = e.spawnT / SPAWN_TIME;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.8 * (1 - k) + e.r * 0.3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.18 * k;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * k, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }

    // Submerged or otherwise hidden: only the boss's own tell is drawn.
    if (e.hidden) { drawBossExtras(e, ctx); continue; }

    // Ground shadow keeps enemies readable against the floor. Airborne
    // things (a leaping gorilla) leave it on the ground, shrinking as they rise.
    const z = e.z || 0;
    const shadowK = 1 / (1 + z / 160);
    ctx.globalAlpha = 0.3 + (z > 0 ? 0.15 : 0);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.72, e.r * 0.85 * shadowK, e.r * 0.34 * shadowK, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Burning glows orange, slowed goes icy.
    e.tint = e.flash > 0 ? '#ffffff' : e.burn ? '#ff8a3d' : e.slow && e.slow.mult < 0.9 ? '#9fd8ff' : e.color;
    if (!drawEnemyRig(e, ctx)) e.def.draw(e, ctx);
    if (e.boss || e.def.extras) drawBossExtras(e, ctx);

    // Stunned: little stars circling the head.
    if (!e.boss && (e.stunT || 0) > 0) {
      for (let k = 0; k < 3; k++) {
        const a = world.runTime * 5 + (k / 3) * TAU;
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * e.r * 0.8, e.y - e.r - 4 + Math.sin(a) * 4, 2.6, 0, TAU);
        ctx.fill();
      }
    }
    if (e.elite && !e.boss) {
      ctx.strokeStyle = 'rgba(255,200,97,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 6, 0, TAU);
      ctx.stroke();
    }

    // Health bar for anything meaningfully tanky.
    if (!e.boss && !e.def.noBar && e.hp < e.maxHp && e.maxHp > 45) {
      const w = e.r * 2.2, h = 4;
      const x = e.x - w / 2, y = e.y - e.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = e.elite ? '#ffc861' : '#ff5e6e';
      ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), h);
    }
  }
}

export function bossInRoom() {
  return world.enemies.find((e) => e.boss && !e.dead) || null;
}
