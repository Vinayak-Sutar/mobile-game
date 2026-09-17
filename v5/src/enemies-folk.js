// Folk enemies: lesser creatures from world folklore, added in Version 5 to
// fill the holes in the roster. The old roster was rushers, shooters and one
// heavy; these three ask different questions of the player.
//
//   Chinthe (Myanmar)           shield   guards its front, open from behind
//   Adze    (Ewe: Ghana, Togo)  swarm    fireflies, solid only while feeding
//   Vetala  (India)             support  rides the corpses of your kills
//
// The fairness rules still hold: nothing hurts the player without a telegraph
// first, and every defence has an opening that can be found on purpose.

import { world } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff } from './util.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import {
  player, stepToward, stepAway, strafe, contactDamage, telegraphRing, collideWorld,
} from './ai.js';
import { spawnProjectile } from './spawn.js';

const STONE = '#e9d39a';
const EMBER = '#ffe27a';
const SPIRIT = '#9df0c8';
const RISEN = '#8fd6c0';

// Bodies left by the player's kills, for the Vetala to ride. They are written
// by killEnemy (combat.js) and live on `world`, so a new run starts clean.
const CORPSE_LIFE = 14;

export function updateCorpses(dt) {
  for (let i = world.corpses.length - 1; i >= 0; i--) {
    const c = world.corpses[i];
    c.t += dt;
    // A claim dies with the spirit that made it.
    if (c.claim && (c.claim.dead || c.claim.hp <= 0)) c.claim = null;
    if (c.t >= CORPSE_LIFE) world.corpses.splice(i, 1);
  }
}

export function drawCorpses(ctx) {
  for (const c of world.corpses) {
    const fade = clamp(1 - c.t / CORPSE_LIFE, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.14 + fade * 0.2;
    ctx.fillStyle = c.color || '#6a5f7a';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + c.r * 0.4, c.r * 0.92, c.r * 0.46, c.face || 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.1 + fade * 0.12;
    ctx.strokeStyle = '#1a1422';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/** The nearest body no other spirit has claimed. */
function freeCorpse(e, maxDist = 900) {
  let best = null;
  let bestD = maxDist;
  for (const c of world.corpses) {
    if (c.claim && c.claim !== e) continue;
    if (c.type === 'vetala') continue;          // it will not raise its own kind
    const d = dist(e.x, e.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** A contact bite that reports whether it actually landed. */
function bite(e, dt, amount, cooldown) {
  const p = player();
  if (!p || p.dead) return false;
  e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
  if (e.touchCd > 0) return false;
  if (dist(e.x, e.y, p.x, p.y) > e.r + p.r) return false;
  if (!damagePlayer(amount, e.x, e.y, e.type)) return false;
  e.touchCd = cooldown;
  return true;
}

/** Turn toward an angle at a limited rate, so the player can get around it. */
function turnTo(e, target, rate, dt) {
  const d = angleDiff(e.face || 0, target);
  e.face = (e.face || 0) + clamp(d, -rate * dt, rate * dt);
}

// The enemy factory is handed in, the way bosses.js takes it, so this module
// never has to import enemies.js back.
let spawnEnemyFn = null;
export function bindFolkSpawner(fn) { spawnEnemyFn = fn; }

// --- the Chinthe -----------------------------------------------------------
// A temple lion, carved to guard a doorway. It walks its shield into you and
// nothing much gets through the front of it; it turns slowly, so the answer is
// to go around. Its shield bash leaves the guard down afterwards.

function chintheGuard(e, opts) {
  if (e.state === 'open' || (e.stunT || 0) > 0) return 1;
  // Fire, blasts and anything with no direction of its own go straight through.
  if (opts.dir === undefined) return 1;
  const from = opts.dir + Math.PI;
  if (Math.abs(angleDiff(e.face || 0, from)) > 1.15) return 1;
  const sx = e.x + Math.cos(e.face) * e.r;
  const sy = e.y + Math.sin(e.face) * e.r;
  burst(sx, sy, { count: 6, color: '#fff3d0', speed: 230, size: 3, life: 0.2, drag: 6, shape: 'spark' });
  if ((e.blockSay || -9) < world.runTime - 0.55) {
    e.blockSay = world.runTime;
    damageText(e.x, e.y - e.r - 14, 'GUARDED', { color: STONE, size: 13 });
  }
  sfx.block();
  return 0.12;                                   // a sliver, so it is never a wall
}

export const CHINTHE = {
  r: 24, hp: 135, speed: 96, mass: 3, cost: 5, minDepth: 2.5, color: STONE,
  role: 'shield', damageBase: 14, maxPerWave: 2,
  init(e) {
    e.guardFn = chintheGuard;
    e.cd = rand(0.5, 1.5);
    e.face = rand(0, TAU);
  },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    const toPlayer = angleTo(e.x, e.y, p.x, p.y);

    if (e.state === 'wind') {
      e.t -= dt;
      turnTo(e, toPlayer, 0.9, dt);
      e.aim = e.face;
      if (Math.random() < dt * 40) telegraphRing(e, 1 - e.t / 0.55, 96, '#ffd45e');
      if (e.t <= 0) { e.state = 'bash'; e.t = 0.34; sfx.dash(); }
    } else if (e.state === 'bash') {
      e.t -= dt;
      e.x += Math.cos(e.aim) * 520 * dt;
      e.y += Math.sin(e.aim) * 520 * dt;
      contactDamage(e, dt, e.damage, 0.8);
      if (collideWorld(e) || e.t <= 0) {
        e.state = 'open'; e.t = 1.15;
        burst(e.x, e.y, { count: 14, color: STONE, speed: 280, size: 4, life: 0.4, drag: 4, shape: 'shard' });
        ring(e.x, e.y, { r0: 6, r1: 62, color: '#ffd45e', life: 0.3, width: 4 });
        shake(0.22);
        sfx.thud();
      }
    } else if (e.state === 'open') {
      // Guard down and off balance: the punish window.
      e.t -= dt;
      e.exposed = Math.max(e.exposed || 0, e.t);
      stepToward(e, p.x, p.y, 18, dt);
      if (Math.random() < dt * 6) {
        burst(e.x, e.y - e.r, { count: 1, color: '#ffd45e', speed: 26, size: 3, life: 0.5, gravity: -40, drag: 1 });
      }
      if (e.t <= 0) { e.state = 'chase'; e.exposed = 0; e.cd = 1.2; }
    } else {
      // Walking the shield forward. Deliberately slow to turn: circling it is
      // the whole counter, and it can only bash what it is facing.
      e.state = 'chase';
      turnTo(e, toPlayer, 2.0, dt);
      const facing = Math.abs(angleDiff(e.face, toPlayer));
      const walk = facing < 1.0 ? e.speed : e.speed * 0.45;
      e.x += Math.cos(e.face) * walk * dt;
      e.y += Math.sin(e.face) * walk * dt;
      contactDamage(e, dt, Math.round(e.damage * 0.5), 1.0);
      if (d < 175 && e.cd <= 0 && facing < 0.6) {
        e.state = 'wind'; e.t = 0.55; e.aim = e.face;
        sfx.telegraph();
      }
    }
  },
  draw(e, ctx) {
    const open = e.state === 'open';
    const wind = e.state === 'wind' ? 1 - e.t / 0.55 : 0;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.face || 0);

    ctx.fillStyle = e.tint;
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.25, 0, e.r * 0.92, e.r * 0.78, 0, 0, TAU);
    ctx.fill();

    // Carved mane.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5);
      ctx.lineTo(Math.cos(a) * e.r * 1.02, Math.sin(a) * e.r * 1.02);
      ctx.lineTo(Math.cos(a + 0.18) * e.r * 0.55, Math.sin(a + 0.18) * e.r * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    // The shield plate it hides behind: bright while it holds, dull when open.
    const rad = e.r * (1.06 + wind * 0.1);
    ctx.strokeStyle = open ? 'rgba(92,78,58,0.9)' : 'rgba(255,224,150,' + (0.85 + wind * 0.15) + ')';
    ctx.lineWidth = open ? 4 : 7 + wind * 3;
    ctx.beginPath();
    ctx.arc(0, 0, rad, -1.15, 1.15);
    ctx.stroke();
    if (!open) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, rad - 4, -1.05, 1.05);
      ctx.stroke();
    }

    ctx.fillStyle = open ? 'rgba(255,255,255,0.3)' : '#fff2b0';
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.arc(e.r * 0.42, i * e.r * 0.28, 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// --- the Adze --------------------------------------------------------------
// In Ewe folklore the adze flies as a firefly and can slip through any door;
// caught, it takes a body. Here it is a cloud of sparks you cannot hit, and it
// has to become solid to feed - which is the only moment you can kill it.

const SWARM_PATIENCE = 4.2;

export const ADZE = {
  r: 13, hp: 38, speed: 200, mass: 0.7, cost: 3, minDepth: 2, color: EMBER,
  role: 'swarm', damageBase: 7, maxPerWave: 4,
  init(e) {
    e.noPush = true;
    e.swarmT = 0;
    e.cd = rand(0.3, 1.2);
    e.motes = [];
    for (let i = 0; i < 7; i++) {
      e.motes.push({ a: rand(0, TAU), rr: rand(0.5, 1.5), sp: rand(1.4, 3.2) * (Math.random() < 0.5 ? -1 : 1) });
    }
  },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    for (const m of e.motes) m.a += m.sp * dt;

    if (e.state === 'gather') {
      // Already solid: this is the tell, and it can be punished before it bites.
      e.t -= dt;
      e.spread = Math.max(0, e.t / 0.45);
      stepToward(e, p.x, p.y, e.speed * 0.35, dt);
      if (Math.random() < dt * 30) telegraphRing(e, 1 - e.t / 0.45, 40, EMBER);
      if (e.t <= 0) { e.state = 'feed'; e.t = 2.0; sfx.hiss(); }
    } else if (e.state === 'feed') {
      e.t -= dt;
      e.spread = 0;
      stepToward(e, p.x, p.y, e.speed * 0.6, dt);
      if (bite(e, dt, e.damage, 0.7)) {
        // It feeds on blood: every bite mends it a little.
        e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.12));
        burst(e.x, e.y, { count: 6, color: '#ff8fa3', speed: 150, size: 3, life: 0.3, drag: 5 });
      }
      if (e.t <= 0 || d > 260) {
        e.state = 'chase'; e.cd = rand(1.9, 2.8); e.swarmT = 0;
        burst(e.x, e.y, { count: 10, color: EMBER, speed: 200, size: 3, life: 0.5, drag: 3, shape: 'spark' });
        sfx.buzz(0.4);
      }
    } else {
      // Swarm: sparks on the wind. Untouchable, and it cannot hurt you either.
      e.state = 'chase';
      e.swarmT += dt;
      e.spread = 1;
      const wob = Math.sin(world.runTime * 5 + e.seed) * 0.6;
      const a = angleTo(e.x, e.y, p.x, p.y) + wob;
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
      e.face = a;
      if (Math.random() < dt * 8) {
        burst(e.x + rand(-10, 10), e.y + rand(-10, 10), {
          count: 1, color: EMBER, speed: 12, size: 2.4, life: 0.4, drag: 2,
        });
      }
      // It must land to feed, so it cannot hover out of reach forever.
      if (e.cd <= 0 && (d < 95 || e.swarmT > SWARM_PATIENCE)) {
        e.state = 'gather'; e.t = 0.45;
        sfx.buzz(0.5);
        ring(e.x, e.y, { r0: 34, r1: 8, color: EMBER, life: 0.3, width: 3 });
      }
    }

    // Only the swarm is untouchable, and a stun always brings it down.
    const swarming = e.state === 'chase' && (e.stunT || 0) <= 0;
    e.invuln = swarming;
    e.noTarget = swarming;
  },
  draw(e, ctx) {
    const spread = e.spread ?? 1;
    const solid = 1 - spread;
    ctx.save();
    ctx.translate(e.x, e.y);

    if (solid > 0.05) {
      // The body it wears while it feeds.
      ctx.fillStyle = '#2a1f2e';
      ctx.globalAlpha = solid;
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r * 0.95, e.r * 0.78, e.face || 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#ff8fa3';
      ctx.beginPath();
      ctx.ellipse(-e.r * 0.3, 0, e.r * 0.42, e.r * 0.36, e.face || 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Fireflies: wide apart in swarm form, folded in as it gathers.
    for (const m of e.motes) {
      const rr = e.r * (0.35 + m.rr * spread * 1.5);
      const x = Math.cos(m.a) * rr;
      const y = Math.sin(m.a) * rr * 0.8;
      const tw = 0.55 + Math.sin(world.runTime * 9 + m.a * 3) * 0.45;
      ctx.globalAlpha = tw * (0.35 + spread * 0.65);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : EMBER;
      ctx.beginPath();
      ctx.arc(x, y, 2.6 + tw, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

// --- the Vetala ------------------------------------------------------------
// The spirit that hangs in the trees of the cremation ground and animates the
// dead. It keeps its distance, blinks away when crowded, and raises the
// enemies you have already killed - unless you interrupt the rite.

const RIDE_TIME = 1.3;

function raise(e, c) {
  if (!spawnEnemyFn) return;
  const risen = spawnEnemyFn(c.type, c.x, c.y, { scale: c.scale, instant: true });
  if (!risen) return;
  // Weaker than it was in life, and it leaves no body of its own.
  risen.risen = true;
  risen.maxHp = Math.max(8, Math.round(risen.maxHp * 0.55));
  risen.hp = risen.maxHp;
  risen.damage = Math.max(1, Math.round(risen.damage * 0.85));
  risen.color = RISEN;
  risen.tint = RISEN;
  const i = world.corpses.indexOf(c);
  if (i >= 0) world.corpses.splice(i, 1);
  ring(c.x, c.y, { r0: 4, r1: 74, color: SPIRIT, life: 0.4, width: 4 });
  burst(c.x, c.y, { count: 18, color: SPIRIT, speed: 240, size: 4, life: 0.6, drag: 3, shape: 'shard' });
  damageText(c.x, c.y - 26, 'RISEN', { color: SPIRIT, size: 15 });
  sfx.spawn();
}

export const VETALA = {
  r: 18, hp: 78, speed: 132, mass: 1.3, cost: 5, minDepth: 3, color: SPIRIT,
  role: 'support', damageBase: 9, maxPerWave: 1,
  init(e) {
    e.cd = rand(0.8, 1.8);
    e.blinkCd = 2.0;
    e.sign = Math.random() < 0.5 ? 1 : -1;
    e.body = null;
  },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    e.blinkCd = Math.max(0, e.blinkCd - dt);
    e.bob = Math.sin(world.runTime * 2.4 + e.seed) * 3;

    if (e.state === 'toBody') {
      const c = e.body;
      if (!c || world.corpses.indexOf(c) < 0) { e.state = 'chase'; e.body = null; break_(e); return; }
      stepToward(e, c.x, c.y, e.speed * 1.15, dt);
      if (dist(e.x, e.y, c.x, c.y) < 34) {
        e.state = 'ride'; e.t = RIDE_TIME; e.rideHp = e.hp;
        sfx.rattle();
      }
      return;
    }

    if (e.state === 'ride') {
      const c = e.body;
      if (!c || world.corpses.indexOf(c) < 0) { e.state = 'chase'; e.body = null; return; }
      e.t -= dt;
      // Standing still over the body, and open while it works.
      e.exposed = Math.max(e.exposed || 0, e.t);
      if (Math.random() < dt * 40) {
        burst(c.x + rand(-14, 14), c.y + rand(-14, 14), {
          count: 1, color: SPIRIT, speed: 30, size: 3, life: 0.6, gravity: -70, drag: 1,
        });
      }
      // Struck mid-rite: the spirit is thrown off the body.
      if (e.hp < (e.rideHp || e.hp) - 0.5) {
        c.claim = null;
        e.body = null;
        e.exposed = 0;
        e.state = 'stun'; e.t = 0.9; e.cd = 2.4;
        damageText(e.x, e.y - e.r - 16, 'INTERRUPTED', { color: '#ffd45e', size: 14 });
        burst(e.x, e.y, { count: 12, color: SPIRIT, speed: 260, size: 3.4, life: 0.4, drag: 4, shape: 'spark' });
        sfx.hiss();
        return;
      }
      if (e.t <= 0) {
        raise(e, c);
        e.body = null;
        e.exposed = 0;
        e.state = 'chase';
        e.cd = rand(3.4, 4.6);
      }
      return;
    }

    if (e.state === 'stun') {
      e.t -= dt;
      stepAway(e, p.x, p.y, 40, dt);
      if (e.t <= 0) e.state = 'chase';
      return;
    }

    if (e.state === 'blink') {
      e.t -= dt;
      if (e.t <= 0) {
        const a = angleTo(p.x, p.y, e.x, e.y) + rand(-0.9, 0.9);
        const away = rand(250, 320);
        e.x = p.x + Math.cos(a) * away;
        e.y = p.y + Math.sin(a) * away;
        collideWorld(e);
        e.state = 'chase';
        e.blinkCd = 4.0;
        ring(e.x, e.y, { r0: 40, r1: 6, color: SPIRIT, life: 0.3, width: 3 });
        burst(e.x, e.y, { count: 14, color: SPIRIT, speed: 220, size: 3.4, life: 0.4, drag: 4 });
        sfx.whirr();
      }
      return;
    }

    if (e.state === 'aim') {
      e.t -= dt;
      e.face = angleTo(e.x, e.y, p.x, p.y);
      if (Math.random() < dt * 30) telegraphRing(e, 1 - e.t / 0.55, 44, SPIRIT);
      if (e.t <= 0) {
        const a = e.face;
        spawnProjectile({
          x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18,
          vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
          r: 8, damage: e.damage, color: SPIRIT, shape: 'shard', life: 3.2,
          homing: 1.5, srcType: 'vetala',
        });
        sfx.shoot();
        e.state = 'chase';
        e.cd = rand(1.8, 2.6);
      }
      return;
    }

    // Drifting: hold the back of the room, look for a body to ride.
    e.state = 'chase';
    e.face = angleTo(e.x, e.y, p.x, p.y);
    if (d < 250) stepAway(e, p.x, p.y, e.speed * 0.9, dt);
    else if (d > 380) stepToward(e, p.x, p.y, e.speed * 0.7, dt);
    strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
    if (Math.random() < dt * 0.35) e.sign *= -1;

    if (d < 130 && e.blinkCd <= 0) {
      e.state = 'blink'; e.t = 0.28;
      sfx.whirr();
      return;
    }
    if (e.cd <= 0) {
      const c = freeCorpse(e);
      if (c) {
        c.claim = e;
        e.body = c;
        e.state = 'toBody';
      } else if (d < 460) {
        e.state = 'aim'; e.t = 0.55;
        sfx.telegraph();
      } else {
        e.cd = 0.5;
      }
    }
  },
  draw(e, ctx) {
    const riding = e.state === 'ride';
    const blinking = e.state === 'blink';
    const y = e.y + (e.bob || 0);
    ctx.save();

    // The tether to the body it is calling up.
    if ((riding || e.state === 'toBody') && e.body) {
      ctx.strokeStyle = 'rgba(157,240,200,0.5)';
      ctx.lineWidth = riding ? 3 : 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, y);
      ctx.lineTo(e.body.x, e.body.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = blinking ? 0.35 : 0.9;
    // A hanging shroud: wide at the shoulders, frayed at the hem.
    ctx.fillStyle = e.tint;
    ctx.beginPath();
    ctx.moveTo(e.x, y - e.r);
    ctx.quadraticCurveTo(e.x + e.r, y - e.r * 0.2, e.x + e.r * 0.75, y + e.r * 0.9);
    for (let i = 0; i < 4; i++) {
      const fx = e.x + e.r * (0.75 - i * 0.5);
      const wob = Math.sin(world.runTime * 4 + i + e.seed) * 3;
      ctx.lineTo(fx, y + e.r * (i % 2 ? 0.55 : 1.0) + wob);
    }
    ctx.quadraticCurveTo(e.x - e.r, y - e.r * 0.2, e.x, y - e.r);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = riding ? '#ffffff' : '#0d2a22';
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.arc(e.x + i * e.r * 0.3, y - e.r * 0.3, 2.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

/** Clears a broken errand so the spirit does not hold a claim it forgot. */
function break_(e) {
  for (const c of world.corpses) if (c.claim === e) c.claim = null;
}

export const FOLK_DEFS = { chinthe: CHINTHE, adze: ADZE, vetala: VETALA };
