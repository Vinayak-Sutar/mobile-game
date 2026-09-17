// Every point of damage in the game flows through here, so boons, crits,
// status effects and feedback all live in one place.

import { world } from './state.js';
import { fx, burst, ring, shake, hitstop, damageText, flash } from './fx.js';
import { sfx } from './audio.js';
import { spawnProjectile, spawnPickup } from './spawn.js';
import { TAU, rand, randInt, dist, dist2, angleTo, chance, clamp } from './util.js';

// A boss left open after its big pattern takes extra damage. The window is
// the reward for dodging everything that came before it.
export const EXPOSED_MULT = 1.35;

export function nearestEnemy(x, y, maxDist = Infinity, exclude = null) {
  let best = null, bestD = maxDist * maxDist;
  for (const e of world.enemies) {
    // `noTarget`: boss parts that shouldn't pull auto-aim (armoured coils).
    if (e.dead || e === exclude || e.spawning || e.hidden || e.noTarget) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function enemiesInRadius(x, y, radius, exclude = null) {
  const out = [];
  for (const e of world.enemies) {
    if (e.dead || e === exclude || e.spawning || e.invuln) continue;
    if (dist(x, y, e.x, e.y) <= radius + e.r) out.push(e);
  }
  return out;
}

/**
 * Damage an enemy.
 * opts: { crit, noCrit, raw, knockback, dir, source, chained, silent }
 */
export function dealDamage(e, amount, opts = {}) {
  if (!e || e.dead || e.hp <= 0 || e.spawning || e.invuln) return 0;
  // A boss part (a body segment, a second head) passes its hits to the boss,
  // scaled by `proxyMult` (a number or a function of the part). Damage over
  // time and chained blasts don't count, and one sweep or spell that catches
  // several parts at once counts once.
  // A boss stance that can turn a hit away (Aldric's guard): returns a
  // damage multiplier, 0 = blocked. Damage over time and blasts go through.
  if (e.guardFn && !opts.chained) {
    const k = e.guardFn(e, opts, amount);
    if (k <= 0) return 0;
    amount *= k;
  }
  if (e.proxyOf) {
    const b = e.proxyOf;
    if (b.dead || opts.chained) return 0;
    const key = opts.source === 'projectile' ? null : (opts.source || 'hit');
    if (key && b.proxyTick === world.runTime && b.proxyKey === key) return 0;
    b.proxyTick = world.runTime;
    b.proxyKey = key;
    const mult = typeof e.proxyMult === 'function' ? e.proxyMult(e) : (e.proxyMult ?? 1);
    e.flash = 0.1;
    if (mult <= 0) return 0;
    const dealt = dealDamage(b, amount * mult, { ...opts, knockback: 0, at: e });
    if (dealt > 0 && e.onProxyHit) e.onProxyHit(e, dealt);
    return dealt;
  }
  const p = world.player;
  const st = p ? p.stats : null;

  let dmg = amount;
  let crit = !!opts.crit;

  if (!opts.raw && st) {
    dmg *= st.damageMult;
    if (!opts.noCrit && !crit && Math.random() < st.critChance) crit = true;
    if (crit) dmg *= st.critMult;
  }
  const exposed = e.exposed > 0;
  if (exposed) dmg *= EXPOSED_MULT;
  if (e.vulnerable) dmg *= e.vulnerable;     // e.g. an Oathbroken knight takes more
  dmg = Math.max(1, Math.round(dmg));

  e.hp -= dmg;
  // A boss that must not die from one big hit (Aldric kneels at low health first).
  if (e.hpFloor !== undefined && e.hp < e.hpFloor) e.hp = e.hpFloor;
  e.flash = Math.max(e.flash || 0, crit ? 0.18 : 0.11);
  e.hitAt = world.runTime;

  // Knockback, scaled by the enemy's mass and any wind boon.
  const kb = (opts.knockback ?? 0) * (st ? st.knockbackMult : 1);
  if (kb > 0) {
    const a = opts.dir ?? (p ? angleTo(p.x, p.y, e.x, e.y) : 0);
    const resist = e.mass || 1;
    e.vx = (e.vx || 0) + Math.cos(a) * (kb / resist);
    e.vy = (e.vy || 0) + Math.sin(a) * (kb / resist);
  }

  if (!opts.silent) {
    const dir = opts.dir ?? rand(0, TAU);
    const at = opts.at || e;       // a hit on a boss part shows where it landed
    burst(at.x, at.y, {
      count: crit ? 14 : 7,
      color: crit ? '#fff0b0' : '#ffd9d9',
      speed: crit ? 340 : 210, size: crit ? 4 : 3,
      life: 0.3, dir, spread: 1.5, shape: 'spark', drag: 5,
    });
    damageText(at.x, at.y - (at.r || e.r), String(dmg), {
      color: crit ? '#ffd45e' : exposed ? '#ffe9a8' : '#ffffff', crit, size: exposed ? 20 : 17,
    });
    if (crit) {
      sfx.crit();
      ring(e.x, e.y, { r0: 4, r1: 58, color: '#ffd45e', life: 0.28, width: 3 });
      shake(0.22);
      hitstop(0.06);
    } else {
      sfx.hit(0.8);
      shake(0.08);
      hitstop(0.022);
    }
  }

  // --- boon side effects (never recurse) ---
  if (st && !opts.chained) {
    if (st.lifesteal > 0 && p && p.hp > 0) healPlayer(dmg * st.lifesteal, false);

    if (st.burn > 0) {
      e.burn = { dps: st.burn, time: 3 };
    }
    if (st.slowOnHit > 0) {
      e.slow = { mult: 1 - st.slowOnHit, time: 2 };
    }
    if (st.chain > 0) {
      let src = e;
      for (let i = 0; i < st.chain; i++) {
        const t = nearestEnemyExcluding(src.x, src.y, 260, [e, src]);
        if (!t) break;
        lightningArc(src.x, src.y, t.x, t.y);
        dealDamage(t, dmg * 0.55, { chained: true, raw: true, silent: false, noCrit: true, knockback: 40 });
        src = t;
      }
    }
    if (st.bolt > 0 && chance(0.4)) {
      const a = rand(0, TAU);
      spawnProjectile({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 20, vy: Math.sin(a) * 20,
        r: 8, damage: st.bolt, friendly: true, homing: 7,
        color: '#c07bff', shape: 'shard', life: 1.6, pierce: 0, knockback: 60,
      });
    }
  }

  if (e.hp <= 0) killEnemy(e, opts);
  return dmg;
}

function nearestEnemyExcluding(x, y, maxDist, excludes) {
  let best = null, bestD = maxDist * maxDist;
  for (const e of world.enemies) {
    if (e.dead || e.spawning || excludes.includes(e)) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function lightningArc(x1, y1, x2, y2) {
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    burst(x1 + (x2 - x1) * t + rand(-9, 9), y1 + (y2 - y1) * t + rand(-9, 9), {
      count: 2, color: '#8ef0ff', speed: 70, size: 3, life: 0.18, drag: 6, shape: 'spark',
    });
  }
  sfx.shoot();
}

export function killEnemy(e, opts = {}) {
  if (e.dead) return;
  e.dead = true;
  world.kills++;

  const p = world.player;
  const st = p ? p.stats : null;

  burst(e.x, e.y, {
    count: e.boss ? 60 : 16,
    color: e.color || '#ff6b6b',
    speed: e.boss ? 520 : 260,
    size: e.boss ? 7 : 4.5,
    life: e.boss ? 1.0 : 0.55, drag: 3.2, shape: 'shard',
  });
  burst(e.x, e.y, {
    count: e.boss ? 26 : 8, color: '#ffffff', speed: 300, size: 3, life: 0.3, drag: 5, shape: 'spark',
  });
  ring(e.x, e.y, {
    r0: e.r * 0.6, r1: e.r * (e.boss ? 8 : 3.4),
    color: e.color || '#ff6b6b', life: e.boss ? 0.7 : 0.36, width: e.boss ? 8 : 4,
  });
  shake(e.boss ? 0.9 : 0.16);
  hitstop(e.boss ? 0.3 : 0.05);

  if (e.boss) { sfx.bossDown(); flash(0.5, '#ffd9a0'); }
  else sfx.hit(1.2);

  // Gold drop, scattered so collecting it pulls the player around the arena.
  const coins = e.boss ? 22 : (e.elite ? 7 : randInt(1, 3));
  for (let i = 0; i < coins; i++) {
    const a = rand(0, TAU), s = rand(50, 190);
    spawnPickup({
      x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      type: 'gold', value: e.boss ? 6 : (e.elite ? 4 : 2),
    });
  }
  if (chance(e.boss ? 1 : 0.14)) {
    spawnPickup({ x: e.x, y: e.y, vx: rand(-60, 60), vy: rand(-60, 60), type: 'heal', value: 16, r: 13 });
  }

  if (st && st.explodeOnKill > 0) {
    explode(e.x, e.y, 96, st.explodeOnKill, e, '#ff9a4d');
  }

  // A body for the Vetala to ride (enemies-folk.js). Bosses, boss parts,
  // summons and the already-risen leave nothing behind.
  if (!e.boss && !e.risen && !e.isSpawn && !e.summoner && !e.def.boss && !e.def.fixed && !e.def.invisible) {
    world.corpses.push({
      type: e.type, x: e.x, y: e.y, r: e.r, face: e.face || 0,
      scale: e.scale || 1, color: e.color, t: 0, claim: null,
    });
    if (world.corpses.length > 8) world.corpses.shift();
  }

  if (e.onDeath) e.onDeath(e);
}

export function explode(x, y, radius, damage, exclude, color = '#ff9a4d', hitsPlayer = false, source = 'explosion') {
  ring(x, y, { r0: 8, r1: radius, color, life: 0.34, width: 7 });
  ring(x, y, { r0: 4, r1: radius * 0.6, color: '#fff3d0', life: 0.2, width: 4 });
  burst(x, y, { count: 22, color, speed: 420, size: 5.5, life: 0.5, drag: 4, shape: 'shard' });
  burst(x, y, { count: 12, color: '#ffffff', speed: 260, size: 3, life: 0.3, drag: 5, shape: 'spark' });
  shake(0.4);
  sfx.explode();

  for (const e of enemiesInRadius(x, y, radius, exclude)) {
    dealDamage(e, damage, {
      raw: true, silent: false, knockback: 260,
      dir: angleTo(x, y, e.x, e.y), chained: true, noCrit: true,
    });
  }
  if (hitsPlayer) {
    const p = world.player;
    if (p && dist(x, y, p.x, p.y) < radius + p.r) damagePlayer(damage, x, y, source);
  }
}

export function healPlayer(amount, showText = true) {
  const p = world.player;
  if (!p || p.hp <= 0) return;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  const gained = p.hp - before;
  if (gained > 0 && showText) {
    damageText(p.x, p.y - p.r - 6, `+${Math.round(gained)}`, { color: '#7dff9c', size: 18 });
    burst(p.x, p.y, { count: 12, color: '#7dff9c', speed: 130, size: 4, life: 0.5, drag: 3 });
    sfx.heal();
  }
  p.healFrac = (p.healFrac || 0) + gained;
}

// The Aegis spell (spells.js) registers here, so combat never imports spells.
let aegisHook = null;
export function setAegisHook(fn) { aegisHook = fn; }

export function damagePlayer(amount, sx = null, sy = null, source = 'unknown') {
  const p = world.player;
  if (!p || p.hp <= 0) return false;
  if (p.invuln > 0 || p.dashing) return false;
  if (aegisHook && aegisHook(p)) return false;       // the shield took it

  const st = p.stats;
  let dmg = Math.max(1, Math.round(amount * (1 - st.damageReduction)));

  // Retribution boon: taking a hit detonates a shockwave around the player.
  if (st.retribution > 0) {
    explode(p.x, p.y, 150, st.retribution, null, '#ff5e8a');
  }

  p.hp -= dmg;
  p.invuln = 0.8;
  // Kept permanently, not just for tuning: a roguelike death screen should be
  // able to say what actually killed you.
  world.damageLog[source] = (world.damageLog[source] || 0) + dmg;
  p.lastHitBy = source;
  p.hurtFlash = 0.35;

  if (sx !== null) {
    const a = angleTo(sx, sy, p.x, p.y);
    p.vx += Math.cos(a) * 260;
    p.vy += Math.sin(a) * 260;
  }

  damageText(p.x, p.y - p.r - 6, `-${dmg}`, { color: '#ff5e6e', size: 20 });
  burst(p.x, p.y, { count: 16, color: '#ff5e6e', speed: 300, size: 4, life: 0.45, drag: 4, shape: 'spark' });
  ring(p.x, p.y, { r0: 6, r1: 70, color: '#ff5e6e', life: 0.3, width: 5 });
  flash(0.34, '#ff2d4a');
  shake(0.55);
  hitstop(0.1);
  fx.vignette = 1;
  sfx.hurt();

  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    burst(p.x, p.y, { count: 46, color: '#ff5e6e', speed: 420, size: 6, life: 0.9, drag: 3, shape: 'shard' });
    shake(1);
    hitstop(0.4);
    sfx.death();
  }
  return true;
}

// Burn / slow ticking, run once per frame over all enemies.
export function updateStatuses(dt) {
  for (const e of world.enemies) {
    if (e.dead) continue;
    if (e.burn && e.burn.time > 0) {
      e.burn.time -= dt;
      e.burnTick = (e.burnTick || 0) + dt;
      if (e.burnTick >= 0.4) {
        e.burnTick = 0;
        dealDamage(e, e.burn.dps * 0.4, { raw: true, chained: true, noCrit: true, silent: true });
        burst(e.x, e.y - e.r * 0.3, {
          count: 3, color: '#ff8a3d', speed: 46, size: 3.5, life: 0.42,
          dir: -Math.PI / 2, spread: 1.1, drag: 1.6, gravity: -60,
        });
      }
      if (e.burn.time <= 0) e.burn = null;
    }
    if (e.slow && e.slow.time > 0) {
      e.slow.time -= dt;
      if (e.slow.time <= 0) e.slow = null;
    }
  }
}
