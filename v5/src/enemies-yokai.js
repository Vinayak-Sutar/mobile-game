// Yokai and warriors of Cloud Summit: the Japan-inspired land's own enemies.
//
//   Ronin     a masterless swordsman. Crouches with his hand on the hilt - a
//             thin line reaches for you and locks - then the draw: a dash
//             through you. Sheathing after, he is open.            step off the line
//   Kitsune   a fox spirit in a white robe. Throws slow foxfire that follows
//             you; hurt, she leaves a copy of herself and slips away. The copy
//             casts no shadow.                                     look for the shadow
//   Ninja     vanishes in smoke; a faint ring of smoke on the ground shows
//             where he will step out - behind you - to throw three stars.
//                                                                  watch the ring, turn
//   Fox copy  the illusions the kitsune (and Kyubi) leave: harmless, one hit
//             to pop, no shadow.
//
// Kappa and tengu, from the same stories, already live on the mountain.

import { world } from './state.js';
import { TAU, rand, dist, angleTo, polygon, circleOrientedRect } from './util.js';
import { damagePlayer } from './combat.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';
import { player, stepToward, stepAway, strafe } from './ai.js';
import { spawnProjectile } from './spawn.js';

let spawnEnemyFn = null;
export function bindYokaiSpawner(fn) { spawnEnemyFn = fn; }

function blob(ctx, e, sides, k = 1) {
  ctx.save();
  ctx.translate(e.x, e.y - (e.z || 0));
  ctx.rotate(e.face || 0);
  ctx.fillStyle = e.tint;
  polygon(ctx, 0, 0, e.r * k, sides, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  polygon(ctx, 0, 0, e.r * k * 0.45, sides, 0.3);
  ctx.fill();
  ctx.restore();
}

/** Foxfire: a slow ball of blue-white flame that bends toward you. */
export function foxfire(e, a, o = {}) {
  return spawnProjectile({
    x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16,
    vx: Math.cos(a) * (o.speed || 190), vy: Math.sin(a) * (o.speed || 190),
    r: o.r || 9, damage: Math.round(e.damage * (o.dmg || 0.8)), color: '#9fd8ff', shape: 'orb',
    life: o.life || 3.6, homing: o.homing ?? 1.1, srcType: e.type, quiet: true,
  });
}

// --- the Ronin -----------------------------------------------------------------------------------

const DRAW_T = 0.75, LOCK = 0.22, DASH = 270;

const RONIN = {
  r: 16, hp: 74, speed: 132, mass: 1.2, cost: 5, minDepth: 3, color: '#8a8a9a',
  role: 'rusher', damageBase: 15, maxPerWave: 2,
  init(e) { e.cd = rand(0.8, 1.6); e.sign = Math.random() < 0.5 ? 1 : -1; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'stance') {
      e.t -= dt;
      if (e.t > LOCK) e.aim = angleTo(e.x, e.y, p.x, p.y);
      e.face = e.aim;
      if (e.t <= 0) { e.state = 'draw'; e.t = 0.16; e.hit = false; e.x0 = e.x; e.y0 = e.y; sfx.swing(1.2); }
      return;
    }
    if (e.state === 'draw') {
      e.t -= dt;
      e.x += Math.cos(e.aim) * (DASH / 0.16) * dt;
      e.y += Math.sin(e.aim) * (DASH / 0.16) * dt;
      const mx = (e.x0 + e.x) / 2, my = (e.y0 + e.y) / 2, len = Math.hypot(e.x - e.x0, e.y - e.y0) + e.r * 2;
      if (!e.hit && circleOrientedRect(p.x, p.y, p.r, mx, my, e.aim, len, 22)) { e.hit = true; damagePlayer(e.damage, e.x0, e.y0, 'ronin'); }
      if (e.t <= 0) { e.state = 'sheathe'; e.t = 0.8; e.exposed = 0.8; burst(e.x, e.y, { count: 8, color: '#e8f0ff', speed: 160, size: 3, life: 0.3, drag: 5, shape: 'spark' }); }
      return;
    }
    if (e.state === 'sheathe') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = rand(1.2, 1.8); e.exposed = 0; } return; }
    e.state = 'chase';
    if (d > 230) stepToward(e, p.x, p.y, e.speed, dt);
    else if (d < 150) stepAway(e, p.x, p.y, e.speed * 0.6, dt);
    strafe(e, p.x, p.y, e.speed * 0.4, dt, e.sign);
    if (e.cd <= 0 && d < 260) { e.state = 'stance'; e.t = DRAW_T; e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); }
  },
  under(e, ctx) {
    if (e.state !== 'stance') return;
    const locked = e.t <= LOCK;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.aim);
    ctx.fillStyle = locked ? 'rgba(230,240,255,0.5)' : 'rgba(230,240,255,0.16)';
    ctx.fillRect(0, -11, DASH + e.r, 22);
    ctx.restore();
  },
  draw(e, ctx) { blob(ctx, e, 5); },
};

// --- the Kitsune ---------------------------------------------------------------------------------

const KITSUNE = {
  r: 15, hp: 50, speed: 138, mass: 0.9, cost: 4, minDepth: 3, color: '#f0e8d8',
  role: 'shooter', damageBase: 9, maxPerWave: 2,
  init(e) { e.cd = rand(1, 2); e.sign = Math.random() < 0.5 ? 1 : -1; e.tricked = false; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    // Hurt badly the first time: a copy stays where she stood, and she slips away.
    if (!e.tricked && e.hp < e.maxHp * 0.6) {
      e.tricked = true;
      const c = spawnEnemyFn('foxclone', e.x, e.y, { instant: true, summoner: e });
      if (c) { c.r = e.r; c.leash = e.leash; c.look = 'kitsune'; }
      const a = rand(0, TAU);
      e.x += Math.cos(a) * 160; e.y += Math.sin(a) * 160;
      burst(e.x, e.y, { count: 12, color: '#fff0e0', speed: 150, size: 3, life: 0.4, drag: 4 });
      sfx.whirr();
    }
    if (e.state === 'wind') {
      e.t -= dt;
      e.face = angleTo(e.x, e.y, p.x, p.y);
      if (e.t <= 0) {
        foxfire(e, e.face);
        sfx.shoot();
        e.state = 'chase'; e.cd = rand(2.0, 2.8);
      }
      return;
    }
    e.state = 'chase';
    if (d < 220) stepAway(e, p.x, p.y, e.speed, dt);
    else if (d > 340) stepToward(e, p.x, p.y, e.speed * 0.8, dt);
    strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
    if (Math.random() < dt * 0.4) e.sign *= -1;
    if (e.cd <= 0 && d < 480) { e.state = 'wind'; e.t = 0.5; sfx.telegraph(); }
  },
  draw(e, ctx) { blob(ctx, e, 6); },
};

// --- the Fox copy (an illusion) --------------------------------------------------------------------

const FOXCLONE = {
  r: 15, hp: 1, speed: 120, mass: 0.5, cost: 0, minDepth: 99, color: '#f0e8d8',
  role: 'swarm', damageBase: 0, noShadow: true, noBar: true,
  init(e) { e.life = 7; e.sign = Math.random() < 0.5 ? 1 : -1; e.onDeath = (s) => { burst(s.x, s.y, { count: 14, color: '#fff0e0', speed: 180, size: 3, life: 0.4, drag: 4 }); }; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    e.life -= dt;
    if (e.life <= 0) { e.hp = 0; e.dead = true; burst(e.x, e.y, { count: 10, color: '#fff0e0', speed: 120, size: 3, life: 0.4, drag: 4 }); return; }
    const d = dist(e.x, e.y, p.x, p.y);
    if (d > 240) stepToward(e, p.x, p.y, e.speed, dt);
    else if (d < 170) stepAway(e, p.x, p.y, e.speed, dt);
    strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
    e.face = angleTo(e.x, e.y, p.x, p.y);
    // It mimes her casting, and nothing comes of it.
    e.state = Math.sin(world.runTime * 1.3 + (e.seed || 0)) > 0.7 ? 'wind' : 'chase';
  },
  draw(e, ctx) { ctx.globalAlpha = 0.85; blob(ctx, e, 6); ctx.globalAlpha = 1; },
};

// --- the Ninja ----------------------------------------------------------------------------------

const NINJA = {
  r: 14, hp: 46, speed: 176, mass: 0.8, cost: 4, minDepth: 3, color: '#3a3a44',
  role: 'rusher', damageBase: 8, maxPerWave: 2,
  init(e) { e.cd = rand(1, 2); e.sign = Math.random() < 0.5 ? 1 : -1; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'smoke') {
      e.t -= dt;
      if (e.t <= 0) {
        // Gone - to a spot behind you, marked by a faint ring of smoke.
        e.hidden = true; e.invuln = true;
        const behind = (p.face ?? p.aimAngle ?? 0) + Math.PI + rand(-0.5, 0.5);
        e.tx = p.x + Math.cos(behind) * 120; e.ty = p.y + Math.sin(behind) * 120;
        e.state = 'gone'; e.t = 0.65;
      }
      return;
    }
    if (e.state === 'gone') {
      e.t -= dt;
      if (e.t <= 0) {
        e.x = e.tx; e.y = e.ty; e.hidden = false; e.invuln = false;
        burst(e.x, e.y, { count: 14, color: '#8a8a94', speed: 140, size: 4, life: 0.4, drag: 4 });
        e.state = 'throw'; e.t = 0.28; e.aim = angleTo(e.x, e.y, p.x, p.y);
      }
      return;
    }
    if (e.state === 'throw') {
      e.t -= dt;
      e.face = e.aim;
      if (e.t <= 0) {
        for (let k = -1; k <= 1; k++) {
          const a = e.aim + k * 0.22;
          spawnProjectile({ x: e.x, y: e.y, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, r: 6, damage: e.damage, color: '#c8ccd8', shape: 'shard', life: 1.4, srcType: 'ninja', spin: 20 });
        }
        sfx.swing(0.6);
        e.state = 'recover'; e.t = 0.6; e.cd = rand(2.4, 3.2);
      }
      return;
    }
    if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) e.state = 'chase'; return; }
    e.state = 'chase';
    if (d > 200) stepToward(e, p.x, p.y, e.speed, dt);
    else if (d < 120) stepAway(e, p.x, p.y, e.speed * 0.6, dt);
    strafe(e, p.x, p.y, e.speed * 0.6, dt, e.sign);
    if (e.cd <= 0 && d < 380) {
      e.state = 'smoke'; e.t = 0.3;
      burst(e.x, e.y, { count: 20, color: '#6a6a74', speed: 120, size: 6, life: 0.6, drag: 3 });
      sfx.whirr();
    }
  },
  under(e, ctx) {
    if (e.state !== 'gone') return;
    const k = 1 - e.t / 0.65;
    ctx.strokeStyle = `rgba(200,200,215,${(0.25 + 0.45 * k).toFixed(2)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(e.tx, e.ty + 8, 18 + 10 * (1 - k), 8 + 4 * (1 - k), 0, 0, TAU); ctx.stroke();
  },
  draw(e, ctx) { blob(ctx, e, 4, 0.95); },
};

export const YOKAI_DEFS = { ronin: RONIN, kitsune: KITSUNE, foxclone: FOXCLONE, ninja: NINJA };
export const YOKAI_NAMES = { ronin: 'a Ronin', kitsune: "a Kitsune's foxfire", foxclone: 'an illusion', ninja: 'a Ninja' };

