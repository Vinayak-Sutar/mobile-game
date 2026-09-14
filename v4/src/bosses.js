// The creature bosses: a shared boss brain plus four movesets.
//
// Design rules every boss here follows — they are what "hard but fair" means
// in this game, so keep them when adding a boss:
//
//  1. Nothing hurts without a tell. Every attack has a pose (boss-rigs.js), a
//     sound, and usually a floor marker (hazards.js) before it can land.
//  2. Dense bullet patterns ("barrages") are rare. Each boss has exactly one,
//     on a long cooldown, and it opens the fight on cooldown too, so a fight
//     starts with readable melee moves before the screen fills up.
//  3. Every barrage has a way through: a rotating corridor, a lattice with
//     lanes wider than the player's hurtbox, a safe flank, or cover behind the
//     arena's pillars. Bullets are slower than the player (268 u/s).
//  4. Every barrage ends in an EXPOSED window: the boss stops, visibly spent,
//     and takes +35% damage (combat.js). That's the punish.
//  5. Phase changes and death wipe the screen of bullets.
//  6. A hard cap on enemy bullets keeps the screen legible and the frame rate
//     up on a phone.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, circleArc, lerp, resolveCircleRect } from './util.js';
import { spawnProjectile } from './spawn.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { player, strafe, collideWorld, contactDamage } from './ai.js';
import { spawnHazard, clearHazards } from './hazards.js';

import {
  PI, act, bindBossSpawner, bossInit, bounceWorld, chooseMove,
  clearBullets, clearHostiles, countBullets, expose, fanShot, forward,
  idle, inArena, lane, lob, minionCount, ringShot,
  runBoss, shockwave, shot, spawnEnemyFn, sub, tm,
  turnToward,
} from './boss-kit.js';
export { bindBossSpawner, clearBullets, clearHostiles } from './boss-kit.js';
import { VESPER } from './boss-vesper.js';
import { NAGA } from './boss-naga.js';
import { SOLARIS, GRUMM } from './boss-wardens.js';
import { ALDRIC } from './boss-aldric.js';
import { BRIDE } from './boss-bride.js';
import { MONKEY } from './boss-monkey.js';
import { MAESTRO, drawMusician } from './boss-maestro.js';
import { MAU } from './boss-mau.js';
import { GRANDMASTER } from './boss-chess.js';
import { drawChessman } from './boss-chess-art.js';

// ============================================================================
// TURTLE — Gravemaw the Shellback. Slow, heavy, and the first lesson: read the
// shell. Stomps send shockwaves, the shell becomes a ricocheting pinball, and
// its barrage is rings of slow bubbles with a drifting corridor through them.
// ============================================================================

const SHELL = '#9fe8c0', BUBBLE = '#7fd8ff';

const TURTLE = {
  phases: [0.5],
  opening: { tide: 7 },
  roarPitch: 0.8,
  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    turnToward(e, angleTo(e.x, e.y, p.x, p.y), 2.2 * dt);
    if (d > 200) forward(e, e.speed * (e.phase >= 2 ? 1.25 : 1), dt);
  },
  choose(e, p, d) {
    const pool = [['tide', 4]];
    if (d < 170) pool.push(['bite', 3], ['stomp', 2], ['spin', 0.8]);
    else if (d < 340) pool.push(['stomp', 2], ['spin', 2], ['mortar', 2], ['bite', 0.4]);
    else pool.push(['spin', 2], ['mortar', 3]);
    return pool;
  },
  afterPhase(e) { shockwave(e, { color: SHELL }); },
  moves: {
    // Snapping beak: short range, telegraphed by a cone on the floor.
    bite: {
      start(e) {
        sub(e, 'wind', e.phase >= 2 ? 0.42 : 0.5);
        sfx.telegraph();
        e.cone = spawnHazard({
          kind: 'cone', x: e.x, y: e.y, angle: e.face, arc: 1.3, r: 150, delay: e.t,
          color: SHELL, owner: e, follow: e, source: e.type,
        });
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.st < e.clipTime * 0.5) turnToward(e, angleTo(e.x, e.y, p.x, p.y), 4 * dt);
          if (e.cone) e.cone.angle = e.face;
          if (e.t <= 0) {
            sub(e, 'snap', 0.3);
            sfx.swing(1.2);
            if (circleArc(p.x, p.y, p.r * 0.6, e.x, e.y, e.face, 1.3, 150)) {
              damagePlayer(e.damage, e.x, e.y, e.type);
            }
            burst(e.x + Math.cos(e.face) * e.r * 1.3, e.y + Math.sin(e.face) * e.r * 1.3, {
              count: 8, color: SHELL, speed: 200, size: 3.5, life: 0.3, dir: e.face, spread: 1.2, drag: 5,
            });
          }
        } else if (e.sub === 'snap') {
          if (e.st < 0.12) forward(e, 380, dt);
          if (e.t <= 0) idle(e, 0.45);
        }
      },
    },

    // Rears up and stomps: close blast, then one or two shockwave rings.
    stomp: {
      start(e) {
        sub(e, 'wind', e.phase >= 2 ? 0.72 : 0.85);
        sfx.telegraph();
        e.rings = e.phase >= 2 ? 2 : 1;
        spawnHazard({
          kind: 'blast', x: e.x, y: e.y, r: 125, delay: e.t, damage: Math.round(e.damage * 1.1),
          color: SHELL, owner: e, follow: e, source: e.type,
        });
      },
      update(e) {
        if (e.sub === 'wind') {
          if (e.t <= 0) {
            sub(e, 'slam', 0.5);
            shockwave(e, { color: SHELL });
            e.rings--;
            shake(0.6);
          }
        } else if (e.rings > 0 && e.st >= 0.45) {
          sub(e, 'slam', 0.5);
          shockwave(e, { color: SHELL, spread: [1.0, 1.4] });
          e.rings--;
          sfx.thud();
          shake(0.4);
        } else if (e.t <= 0 && e.rings <= 0) {
          idle(e, 0.6);
        }
      },
    },

    // Shell Spin: tucks in, spins up along a marked lane, then ricochets off
    // the walls, puffing bubbles at each bounce. Ends dizzy — the punish.
    spin: {
      start(e, p) {
        sub(e, 'wind', e.phase >= 2 ? 0.75 : 0.9);
        sfx.whirr();
        e.bounces = e.phase >= 2 ? 6 : 4;
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        lane(e, e.t, 700, e.r * 2, SHELL);
      },
      update(e, dt, p) {
        e.spinA = (e.spinA || 0) + dt * (e.sub === 'wind' ? 3 + e.st * 16 : 24);
        if (e.sub === 'wind') {
          if (e.st < e.clipTime * 0.75) e.aim = angleTo(e.x, e.y, p.x, p.y);
          if (e.t <= 0) {
            const sp = (e.phase >= 2 ? 600 : 520) * tm(e);
            e.mx = Math.cos(e.aim) * sp;
            e.my = Math.sin(e.aim) * sp;
            sub(e, 'go', 4.5);
            sfx.dash();
          }
          return;
        }
        e.x += e.mx * dt;
        e.y += e.my * dt;
        contactDamage(e, dt, e.damage, 0.8);
        if (Math.random() < dt * 30) {
          burst(e.x, e.y, { count: 1, color: SHELL, speed: 60, size: 4, life: 0.3, drag: 3 });
        }
        if (bounceWorld(e)) {
          e.bounces--;
          shake(0.25);
          sfx.thud();
          burst(e.x, e.y, { count: 10, color: '#ffffff', speed: 260, size: 3, life: 0.3, drag: 5, shape: 'spark' });
          ringShot(e, e.phase >= 2 ? 8 : 6, 165 * tm(e), rand(0, TAU), {
            shape: 'bubble', r: 10, color: BUBBLE, dmg: 0.4, off: e.r,
          });
          if (e.bounces <= 0) expose(e, 2.0);
        }
        if (e.action === 'spin' && e.t <= 0) expose(e, 1.6);
      },
    },

    // Barnacle Barrage: volleys of lobbed shells onto marked spots around you.
    mortar: {
      start(e) {
        sub(e, 'wind', 0.6);
        sfx.telegraph();
        e.volleys = e.phase >= 2 ? 4 : 3;
      },
      update(e, dt, p) {
        turnToward(e, angleTo(e.x, e.y, p.x, p.y), 2 * dt);
        forward(e, 25, dt);
        if (e.t > 0) return;
        if (e.volleys <= 0) { idle(e, 0.8); return; }
        e.volleys--;
        sub(e, 'fire', 0.55);
        const n = e.phase >= 2 ? 5 : 4;
        for (let k = 0; k < n; k++) {
          let tx = p.x, ty = p.y;
          if (k > 0) {
            const a = rand(0, TAU), r = rand(70, 230);
            tx += Math.cos(a) * r;
            ty += Math.sin(a) * r;
          }
          [tx, ty] = inArena(tx, ty, 30);
          lob(e, tx, ty, {
            color: SHELL, dmg: 0.65,
            shards: e.phase >= 2 ? { n: 4, speed: 140, color: BUBBLE, r: 7 } : null,
            shardShape: 'bubble', shardDamage: Math.round(e.damage * 0.35),
          });
        }
        sfx.shoot();
      },
    },

    // BARRAGE — Tidal Rings: rings of slow bubbles with a corridor that
    // drifts a little each wave. Follow the corridor or thread between.
    tide: {
      cooldown: 14,
      start(e, p) {
        sub(e, 'wind', 0.8);
        sfx.chime();
        e.waves = e.phase >= 2 ? 8 : 6;
        e.gapDir = Math.random() < 0.5 ? 1 : -1;
        e.gapA = angleTo(e.x, e.y, p.x, p.y) + 0.35 * e.gapDir;
        e.waveK = 0;
        e.baseOff = rand(0, TAU);
      },
      update(e, dt) {
        e.spinA = (e.spinA || 0) + dt * 1.4;
        if (e.sub === 'wind') {
          if (Math.random() < dt * 40) {
            const a = rand(0, TAU);
            burst(e.x + Math.cos(a) * 110, e.y + Math.sin(a) * 110, {
              count: 1, color: BUBBLE, speed: 260, size: 3.5, life: 0.4, dir: a + PI, spread: 0.2, drag: 1,
            });
          }
          if (e.t <= 0) sub(e, 'fire', 0);
          return;
        }
        if (e.t > 0) return;
        if (e.waves <= 0) { expose(e, 2.2); return; }
        e.waves--;
        e.waveK++;
        e.t = 0.42;
        const n = e.phase >= 2 ? 24 : 20;
        const off = e.baseOff + (e.waveK % 2) * (TAU / n / 2);
        ringShot(e, n, 150 * tm(e), off, {
          shape: 'bubble', r: 11, color: BUBBLE, dmg: 0.42, life: 6, gapA: e.gapA, gapW: 0.62,
        });
        e.gapA += 0.22 * e.gapDir;
        ring(e.x, e.y, { r0: e.r, r1: e.r * 1.6, color: BUBBLE, life: 0.25, width: 4 });
        sfx.shoot();
      },
    },
  },
};

// ============================================================================
// CROCODILE — Mawgrim, the Mire King. An ambusher: snaps and tail sweeps up
// close, death rolls that leave a wake of mud, and a dive beneath the floor
// that surfaces under you. Its barrage is a sweeping spray of mud — deadly
// in front, safe on the flank, which is exactly where you punish it from.
// ============================================================================

const MIRE = '#d8ff7a', MUD = '#a8d65a', MUD2 = '#c9ef7a';

function crocSnapWind(e, t) {
  sub(e, 'wind', t);
  sfx.telegraph();
  e.cone = spawnHazard({
    kind: 'cone', x: e.x, y: e.y, angle: e.face, arc: 1.0, r: 215, delay: t,
    color: MIRE, owner: e, follow: e, source: e.type,
  });
}

function crocRollWind(e, p, t) {
  sub(e, 'wind', t);
  sfx.telegraph();
  e.aim = angleTo(e.x, e.y, p.x, p.y);
  e.face = e.aim;
  lane(e, t, 900, e.r * 1.8, MIRE);
}

const CROC = {
  phases: [0.55],
  opening: { spray: 8, submerge: 3, hatch: 3 },
  roarPitch: 1.2,
  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    turnToward(e, angleTo(e.x, e.y, p.x, p.y), 3 * dt);
    if (d > 190) forward(e, e.speed * (e.phase >= 2 ? 1.15 : 1), dt);
    else strafe(e, p.x, p.y, 50, dt, e.sign);
    if (Math.random() < dt * 0.3) e.sign *= -1;
  },
  choose(e, p, d) {
    const pool = [['spray', 4]];
    if (d < 220) pool.push(['snap', 3], ['tail', 2.5], ['submerge', 0.8], ['roll', 0.4]);
    else if (d < 400) pool.push(['snap', 1.2], ['roll', 2], ['submerge', 2]);
    else pool.push(['roll', 2.5], ['submerge', 2]);
    if (e.phase >= 2 && minionCount(e) < 2) pool.push(['hatch', 2]);
    return pool;
  },
  afterPhase(e) { ringShot(e, 20, 190 * tm(e), rand(0, TAU), { shape: 'mud', r: 8, color: MUD, dmg: 0.4 }); },
  moves: {
    // Jaw Snap: a long cone, then a lunge. Twice in a row once it's angry.
    snap: {
      start(e) {
        e.snaps = e.phase >= 2 ? 2 : 1;
        crocSnapWind(e, e.phase >= 2 ? 0.52 : 0.6);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          // Tracks only for the first 40%: measured, a later lock left less
          // time than walking out of the cone takes (0.22 s vs ~0.28 s).
          if (e.st < e.clipTime * 0.4) turnToward(e, angleTo(e.x, e.y, p.x, p.y), 5 * dt);
          if (e.cone) e.cone.angle = e.face;
          if (e.t <= 0) {
            sub(e, 'bite', 0.16);
            e.snapX = e.x; e.snapY = e.y; e.snapA = e.face; e.snapHit = false;
            sfx.swing(1.3);
          }
        } else if (e.sub === 'bite') {
          forward(e, 820, dt);
          if (!e.snapHit && e.st >= 0.1) {
            e.snapHit = true;
            if (circleArc(p.x, p.y, p.r * 0.6, e.snapX, e.snapY, e.snapA, 1.0, 215)) {
              damagePlayer(Math.round(e.damage * 1.1), e.x, e.y, e.type);
            }
            sfx.hit(1.2);
            burst(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, {
              count: 10, color: '#ffffff', speed: 240, size: 3, life: 0.25, dir: e.face, spread: 1.4, drag: 5, shape: 'spark',
            });
          }
          if (e.t <= 0) {
            e.snaps--;
            if (e.snaps > 0) crocSnapWind(e, 0.46);
            else sub(e, 'rec', 0.55);
          }
        } else if (e.t <= 0) {
          idle(e, 0.4);
        }
      },
    },

    // Tail Sweep: a full spin; the marked ring around it is the reach.
    tail: {
      start(e) {
        sub(e, 'wind', e.phase >= 2 ? 0.5 : 0.6);
        sfx.telegraph();
        spawnHazard({
          kind: 'blast', x: e.x, y: e.y, r: 190, delay: e.t, damage: Math.round(e.damage * 0.9),
          color: MIRE, owner: e, follow: e, source: e.type, quiet: true,
          shards: e.phase >= 2 ? { n: 12, speed: 190, color: MUD, r: 8 } : null,
          shardShape: 'mud', shardDamage: Math.round(e.damage * 0.4),
        });
      },
      update(e, dt) {
        if (e.sub === 'wind') {
          if (e.t <= 0) { sub(e, 'spin', 0.45); e.spinA = 0; sfx.swing(1.5); shake(0.4); }
        } else {
          e.spinA = Math.min(TAU, (e.spinA || 0) + dt * TAU / 0.35);
          if (e.t <= 0) { e.spinA = 0; idle(e, 0.55); }
        }
      },
    },

    // Death Roll: down a marked lane, leaving mud globs that hang for a beat
    // and then shoot out sideways. Ends stunned against the wall.
    roll: {
      start(e, p) {
        e.rolls = e.phase >= 2 ? 2 : 1;
        crocRollWind(e, p, 0.8);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.st < e.clipTime * 0.7) { e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; }
          if (e.t <= 0) { sub(e, 'go', 1.5); e.dropD = 0; e.rollA = 0; sfx.dash(); sfx.splash(); }
          return;
        }
        const sp = 640 * tm(e);
        forward(e, sp, dt, e.aim);
        e.rollA += dt * 22;
        e.dropD += sp * dt;
        while (e.dropD >= 36) {
          e.dropD -= 36;
          for (const s of [-1, 1]) {
            shot(e, e.aim + s * PI / 2, 1, {
              off: e.r * 0.5, shape: 'mud', r: 8, color: MUD, dmg: 0.4,
              extra: { delay: 0.5, launchSpeed: 115 * tm(e) },
            });
          }
        }
        contactDamage(e, dt, Math.round(e.damage * 1.1), 0.8);
        if (collideWorld(e) || e.t <= 0) {
          shake(0.6);
          sfx.thud();
          burst(e.x, e.y, { count: 18, color: MUD, speed: 300, size: 4, life: 0.4, drag: 4, shape: 'shard' });
          e.rolls--;
          if (e.rolls > 0) crocRollWind(e, p, 0.45);
          else expose(e, 1.6);
        }
      },
    },

    // Ambush: sinks, glides under the floor toward you (a visible ripple),
    // marks the spot, and erupts with a ring of mud. Stuck afterwards.
    submerge: {
      start(e) {
        sub(e, 'sink', 0.6);
        sfx.splash();
        ring(e.x, e.y, { r0: e.r, r1: e.r * 2.4, color: MIRE, life: 0.5, width: 4 });
      },
      update(e, dt, p) {
        if (e.sub === 'sink') {
          if (e.t <= 0) {
            sub(e, 'under', e.phase >= 2 ? 1.6 : 2.0);
            e.hidden = true;
            e.invuln = true;
            sfx.splash();
          }
        } else if (e.sub === 'under') {
          const d = dist(e.x, e.y, p.x, p.y);
          if (d > 24) {
            turnToward(e, angleTo(e.x, e.y, p.x, p.y), 6 * dt);
            forward(e, 300 * tm(e), dt);
          }
          if (Math.random() < dt * 20) {
            burst(e.x + rand(-14, 14), e.y + rand(-14, 14), {
              count: 1, color: MIRE, speed: 20, size: 3, life: 0.5, gravity: -30, drag: 1,
            });
          }
          if (e.t <= 0 || d < 24) {
            sub(e, 'mark', 0.7);
            spawnHazard({
              kind: 'blast', x: e.x, y: e.y, r: 115, delay: 0.7, damage: Math.round(e.damage * 1.15),
              color: MIRE, owner: e, source: e.type,
            });
            sfx.telegraph();
          }
        } else if (e.sub === 'mark') {
          if (e.t <= 0) {
            e.hidden = false;
            e.invuln = false;
            e.face = angleTo(e.x, e.y, p.x, p.y);
            sub(e, 'rise', 0.5);
            sfx.splash();
            shake(0.5);
            ringShot(e, e.phase >= 2 ? 24 : 18, 200 * tm(e), rand(0, TAU), {
              shape: 'mud', r: 8, color: MUD, dmg: 0.4,
            });
          }
        } else if (e.t <= 0) {
          expose(e, 1.8);
        }
      },
    },

    // BARRAGE — Mire Spray: a stream of mud swept back and forth across a
    // wide arc in front of it, with slower globs layered in. Behind and beside
    // it is safe, and that's where the exposed window gets punished from.
    spray: {
      cooldown: 13,
      start(e, p) {
        sub(e, 'wind', 0.7);
        sfx.roar(1.4);
        e.sprayC = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.sprayC;
        e.sprayT = 0;
        e.shotT = 0;
        e.shotK = 0;
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.st < e.clipTime * 0.6) { e.sprayC = angleTo(e.x, e.y, p.x, p.y); e.face = e.sprayC; }
          if (e.t <= 0) sub(e, 'fire', e.phase >= 2 ? 3.3 : 2.6);
          return;
        }
        const period = e.phase >= 2 ? 1.1 : 1.3;
        e.sprayT += dt;
        const a = e.sprayC + 1.05 * Math.sin((TAU * e.sprayT) / period);
        e.face = a;
        e.shotT -= dt;
        while (e.shotT <= 0) {
          e.shotT += 0.05;
          e.shotK++;
          const mx = e.x + Math.cos(a) * e.r * 1.3, my = e.y + Math.sin(a) * e.r * 1.3;
          shot(e, a, 235 * tm(e), { x: mx, y: my, off: 0, shape: 'mud', r: 8, color: MUD, dmg: 0.4 });
          if (e.shotK % 3 === 0) {
            shot(e, a + rand(-0.05, 0.05), 140 * tm(e), { x: mx, y: my, off: 0, shape: 'mud', r: 11, color: MUD2, dmg: 0.4 });
          }
        }
        if (e.t <= 0) expose(e, 1.8);
      },
    },

    // Hatchlings: three small biters (phase 2 only, at most a few at once).
    hatch: {
      cooldown: 15,
      start(e) { sub(e, 'call', 0.6); sfx.roar(1.6); },
      update(e) {
        if (e.t > 0 || !spawnEnemyFn) return;
        for (let k = 0; k < 3; k++) {
          const a = e.face + PI + (k - 1) * 0.9;
          const [x, y] = inArena(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, 30);
          spawnEnemyFn('wretch', x, y, { scale: e.scale * 0.55, summoner: e, color: '#9acd32' });
        }
        idle(e, 0.5);
      },
    },
  },
};

// ============================================================================
// GORILLA — Kharn, the Ashen Silverback. Pure aggression: leaps that land
// where you're standing, boulders that burst into shrapnel, a knuckle rush
// that cracks the floor behind it, and at 30% it enrages. Its barrage is a
// ground-pound drum solo — alternating rings that form a lattice to weave.
// ============================================================================

const DUST = '#ffb35e', ROCKC = '#c9b8a0', ROCKB = '#d9c7a8';

function gorillaRage(e) { return e.enraged ? 1.25 : 1; }

function gorillaCrouch(e, t) { sub(e, 'crouch', t); sfx.telegraph(); }

function gorillaTakeoff(e, p) {
  e.leaps--;
  e.air = e.enraged ? 0.88 : 1.0;
  sub(e, 'air', e.air);
  e.invuln = true;
  e.lx0 = e.x; e.ly0 = e.y;
  [e.lx1, e.ly1] = inArena(p.x, p.y, e.r);
  e.mark = spawnHazard({
    kind: 'blast', x: e.lx1, y: e.ly1, r: 130, delay: e.air, damage: Math.round(e.damage * 1.1),
    color: DUST, owner: e, source: e.type,
    shards: { n: e.phase >= 2 ? 16 : 12, speed: 230 * tm(e), color: ROCKC, r: 8 },
    shardShape: 'rock', shardDamage: Math.round(e.damage * 0.4),
  });
  sfx.dash();
}

function gorillaThrow(e, p) {
  const a = angleTo(e.x, e.y, p.x, p.y);
  e.face = a;
  const sp = 420;
  const d = dist(e.x, e.y, p.x, p.y);
  spawnProjectile({
    x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r: 20, damage: Math.round(e.damage * 0.9), color: '#8c8070', shape: 'rock',
    life: d / sp + 0.25, srcType: e.type, spin: 6, trailEvery: 0.05, knockback: 0,
    // Bursts past where you stood — or on the first wall it meets.
    onExpire: (pr) => {
      countBullets();
      const n = e.phase >= 3 ? 14 : e.phase >= 2 ? 12 : 10;
      const off = rand(0, TAU);
      for (let k = 0; k < n; k++) {
        shot(e, off + (k / n) * TAU, 210 * tm(e), {
          x: pr.x, y: pr.y, off: 6, shape: 'rock', r: 7, color: ROCKC, dmg: 0.4, extra: { spin: 8 },
        });
      }
      burst(pr.x, pr.y, { count: 16, color: ROCKC, speed: 260, size: 4.5, life: 0.4, drag: 4, shape: 'shard' });
      shake(0.3);
      sfx.thud();
    },
  });
  sfx.swing(1.5);
}

function gorillaPound(e) {
  e.pounds--;
  e.poundK++;
  sub(e, e.poundK % 2 ? 'L' : 'R', e.phase >= 3 ? 0.3 : 0.34);
  const n = e.phase >= 3 ? 16 : 14;
  const off = e.poundOff + (e.poundK % 2) * (TAU / n / 2) + e.poundK * 0.05;
  ringShot(e, n, 185 * tm(e), off, { r: 8, color: ROCKB, dmg: 0.42, life: 5 });
  const side = e.poundK % 2 ? -1 : 1;
  const fx = e.x + Math.cos(e.face + side * 0.6) * e.r * 1.1;
  const fy = e.y + Math.sin(e.face + side * 0.6) * e.r * 1.1;
  ring(fx, fy, { r0: 6, r1: 60, color: DUST, life: 0.25, width: 5 });
  burst(fx, fy, { count: 6, color: ROCKC, speed: 200, size: 4, life: 0.3, drag: 4, shape: 'shard' });
  shake(0.25);
  sfx.thud();
}

const GORILLA = {
  phases: [0.6, 0.3],
  opening: { pound: 9 },
  roarPitch: 0.7,
  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    turnToward(e, angleTo(e.x, e.y, p.x, p.y), 3.5 * dt);
    if (d > 210) forward(e, e.speed * gorillaRage(e), dt);
    else strafe(e, p.x, p.y, 70, dt, e.sign);
    if (Math.random() < dt * 0.4) e.sign *= -1;
    if (e.enraged && Math.random() < dt * 6) {
      burst(e.x + rand(-10, 10), e.y - e.r * 0.5, { count: 1, color: '#ff6b5e', speed: 25, size: 4, life: 0.6, gravity: -40, drag: 1 });
    }
  },
  choose(e, p, d) {
    const pool = [['pound', 4]];
    if (d < 190) pool.push(['clap', 3], ['leap', 1], ['boulder', 0.4]);
    else if (d < 420) pool.push(['leap', 2], ['rush', 2], ['boulder', 2]);
    else pool.push(['leap', 2], ['boulder', 2.5], ['rush', 1.5]);
    return pool;
  },
  onPhase(e, phase) { if (phase >= 3) e.enraged = true; },
  afterPhase(e) {
    shockwave(e, { color: DUST });
    shockwave(e, { color: DUST, wait: 0.4, spread: [1.0, 1.5] });
  },
  moves: {
    // Leap Slam: the landing marker follows you for 40% of the flight, then
    // locks, leaving ~0.55 s to walk out of it (measured: a half-flight lock
    // left 0.45 s against the 0.57 s it takes to leave the circle).
    leap: {
      start(e) {
        e.leaps = e.phase >= 3 ? 3 : e.phase >= 2 ? 2 : 1;
        gorillaCrouch(e, 0.45);
      },
      update(e, dt, p) {
        if (e.sub === 'crouch') {
          turnToward(e, angleTo(e.x, e.y, p.x, p.y), 6 * dt);
          if (e.t <= 0) gorillaTakeoff(e, p);
        } else if (e.sub === 'air') {
          const k = clamp(e.st / e.air, 0, 1);
          if (e.st < e.air * 0.4 && e.mark) {
            [e.lx1, e.ly1] = inArena(p.x, p.y, e.r);
            e.mark.x = e.lx1;
            e.mark.y = e.ly1;
          }
          const s = k * k * (3 - 2 * k);
          e.x = lerp(e.lx0, e.lx1, s);
          e.y = lerp(e.ly0, e.ly1, s);
          e.z = Math.sin(k * PI) * 150;
          e.face = angleTo(e.lx0, e.ly0, e.lx1, e.ly1);
          if (e.st >= e.air) {
            e.z = 0;
            e.invuln = false;
            e.mark = null;
            sub(e, 'land', 0.5);
            shake(0.7);
          }
        } else if (e.t <= 0) {
          if (e.leaps > 0) gorillaCrouch(e, 0.32);
          else idle(e, 0.7);
        }
      },
    },

    // Boulder Hurl: lifts a rock overhead, throws it; it bursts into shrapnel.
    boulder: {
      start(e) {
        e.throws = e.phase >= 3 ? 3 : e.phase >= 2 ? 2 : 1;
        sub(e, 'lift', 0.7);
        sfx.telegraph();
      },
      update(e, dt, p) {
        turnToward(e, angleTo(e.x, e.y, p.x, p.y), 4 * dt);
        if (e.sub === 'lift') {
          if (e.t <= 0) { gorillaThrow(e, p); e.throws--; sub(e, 'throw', 0.4); }
        } else if (e.t <= 0) {
          if (e.throws > 0) { sub(e, 'lift', 0.5); sfx.telegraph(); }
          else idle(e, 0.6);
        }
      },
    },

    // Knuckle Rush: charges down a lane; the floor cracks and erupts behind it.
    rush: {
      start(e, p) {
        sub(e, 'wind', e.enraged ? 0.5 : 0.6);
        sfx.roar(0.9);
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.aim;
        lane(e, e.t, 900, e.r * 2, DUST);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.st < e.clipTime * 0.7) { e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; }
          if (e.t <= 0) { sub(e, 'go', 1.3); e.crackD = 0; sfx.dash(); }
          return;
        }
        const sp = 700 * gorillaRage(e);
        forward(e, sp, dt, e.aim);
        e.crackD += sp * dt;
        if (e.crackD >= 52) {
          e.crackD -= 52;
          spawnHazard({
            kind: 'blast', x: e.x - Math.cos(e.aim) * e.r, y: e.y - Math.sin(e.aim) * e.r, r: 42, delay: 0.55,
            damage: Math.round(e.damage * 0.55), color: DUST, owner: e, source: e.type, quiet: true,
          });
        }
        if (Math.random() < dt * 30) {
          burst(e.x, e.y + e.r * 0.5, { count: 1, color: ROCKC, speed: 80, size: 4, life: 0.4, drag: 3 });
        }
        contactDamage(e, dt, Math.round(e.damage * 1.1), 0.8);
        if (collideWorld(e) || e.t <= 0) {
          shake(0.7);
          sfx.thud();
          burst(e.x, e.y, { count: 20, color: ROCKC, speed: 320, size: 4.5, life: 0.45, drag: 4, shape: 'shard' });
          expose(e, 1.5);
        }
      },
    },

    // Thunder Clap: a wide cone in front; later phases add a fan of rocks.
    clap: {
      start(e) {
        sub(e, 'wind', e.enraged ? 0.45 : 0.55);
        sfx.telegraph();
        e.cone = spawnHazard({
          kind: 'cone', x: e.x, y: e.y, angle: e.face, arc: 1.8, r: 180, delay: e.t,
          color: DUST, owner: e, follow: e, source: e.type,
        });
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.st < e.clipTime * 0.5) turnToward(e, angleTo(e.x, e.y, p.x, p.y), 5 * dt);
          if (e.cone) e.cone.angle = e.face;
          if (e.t <= 0) {
            sub(e, 'clap', 0.35);
            if (circleArc(p.x, p.y, p.r * 0.6, e.x, e.y, e.face, 1.8, 180)) {
              damagePlayer(Math.round(e.damage * 1.05), e.x, e.y, e.type);
            }
            shake(0.5);
            sfx.explode();
            ring(e.x + Math.cos(e.face) * e.r * 1.4, e.y + Math.sin(e.face) * e.r * 1.4, {
              r0: 6, r1: 90, color: '#ffffff', life: 0.25, width: 5,
            });
            if (e.phase >= 2) fanShot(e, 5, 0.9, e.face, 300 * tm(e), { r: 8, color: ROCKB, dmg: 0.45 });
          }
        } else if (e.t <= 0) {
          idle(e, 0.5);
        }
      },
    },

    // BARRAGE — Ground Pound: a chest-beat, then alternating fist slams, each
    // a full ring of rocks offset half a gap from the last. The rings form a
    // lattice: weave diagonally, or hide behind a pillar. Ends exhausted.
    pound: {
      cooldown: 14,
      start(e) {
        sub(e, 'wind', 0.9);
        sfx.roar(0.8);
        e.pounds = [10, 12, 14][e.phase - 1];
        e.poundK = 0;
        e.poundOff = rand(0, TAU);
      },
      update(e) {
        if (e.t > 0) return;
        if (e.sub !== 'wind' && e.pounds <= 0) { expose(e, 2.3); return; }
        gorillaPound(e);
      },
    },
  },
};

// ============================================================================
// PEACOCK — Solenne, the Hundred-Eyed. The bullet-hell boss: graceful, keeps
// its distance, and fills the air. Darts and swoops between patterns; its
// signature Display fans the tail and spins counter-rotating spirals; in
// later phases it sweeps beams and conjures watching eyes.
// ============================================================================

const TEAL = '#2fd6a0', GOLD = '#ffd45e', PFEATHER = '#1fb58a', SKY = '#9fe8ff';

function moveDir(e, a, speed, dt) {
  e.x += Math.cos(a) * speed * dt;
  e.y += Math.sin(a) * speed * dt;
}

function swoopWind(e, p, t) {
  const a = angleTo(e.x, e.y, p.x, p.y);
  let [tx, ty] = inArena(p.x + Math.cos(a) * 220, p.y + Math.sin(a) * 220, 60);
  if (dist(e.x, e.y, tx, ty) < 200) {
    // Too short to be a swoop: cross the arena instead.
    const b = arenaBounds();
    [tx, ty] = inArena(b.l + b.r - e.x, b.t + b.b - e.y, 60);
  }
  e.sx1 = tx; e.sy1 = ty;
  e.aim = angleTo(e.x, e.y, tx, ty);
  e.face = e.aim;
  sub(e, 'wind', t);
  sfx.telegraph();
  spawnHazard({
    kind: 'lane', x: e.x, y: e.y, angle: e.aim, len: dist(e.x, e.y, tx, ty) + e.r, width: e.r * 2,
    delay: t, color: SKY, owner: e,
  });
}

const PEACOCK = {
  phases: [0.66, 0.33],
  opening: { display: 6, beams: 4, eyes: 3 },
  roarPitch: 1.6,
  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    turnToward(e, angleTo(e.x, e.y, p.x, p.y), 6 * dt);
    if (d < 240) moveDir(e, angleTo(p.x, p.y, e.x, e.y), e.speed, dt);
    else if (d > 380) moveDir(e, angleTo(e.x, e.y, p.x, p.y), e.speed * 0.8, dt);
    strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
    if (Math.random() < dt * 0.5) e.sign *= -1;
  },
  choose(e, p, d) {
    const pool = [['display', 4], ['darts', 2.5], ['swoop', d < 180 ? 3 : 1.6]];
    if (e.phase >= 2) pool.push(['beams', 3]);
    if (e.phase >= 3 && minionCount(e) < 2) pool.push(['eyes', 2]);
    return pool;
  },
  afterPhase(e, p) {
    ringShot(e, 22, 190 * tm(e), rand(0, TAU), {
      shape: 'feather', r: 6, color: PFEATHER, dmg: 0.4,
      gapA: angleTo(e.x, e.y, p.x, p.y) + rand(-1, 1), gapW: 0.9, extra: { eye: GOLD },
    });
  },
  moves: {
    // Feather Darts: aimed fans of fast feathers — sparse, so keep moving.
    darts: {
      start(e) {
        e.volleys = e.phase >= 2 ? 4 : 3;
        sub(e, 'wind', 0.45);
        sfx.chime();
      },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.t > 0) return;
        if (e.volleys <= 0) { idle(e, 0.45); return; }
        e.volleys--;
        sub(e, 'throw', 0.28);
        const n = e.phase >= 2 ? 7 : 5;
        const spread = e.phase >= 2 ? 0.7 : 0.55;
        fanShot(e, n, spread, e.face, 390 * tm(e), {
          shape: 'feather', r: 7, color: PFEATHER, dmg: 0.5, extra: { eye: GOLD },
        });
        sfx.arrow();
      },
    },

    // Gilded Swoop: dives along a marked lane, dropping feather mines that
    // hang for a moment and then fire out to both sides.
    swoop: {
      start(e, p) {
        e.swoops = e.phase >= 2 ? 2 : 1;
        swoopWind(e, p, 0.6);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.t <= 0) { sub(e, 'go', 1.4); e.dropD = 0; sfx.dash(); }
        } else if (e.sub === 'go') {
          const sp = 820;
          const remaining = dist(e.x, e.y, e.sx1, e.sy1);
          const step = Math.min(remaining, sp * dt);
          forward(e, step / Math.max(dt, 1e-6), dt, e.aim);
          e.dropD += step;
          while (e.dropD >= 44) {
            e.dropD -= 44;
            for (const s of [-1, 1]) {
              shot(e, e.aim + s * PI / 2, 1, {
                off: 6, shape: 'feather', r: 6, color: PFEATHER, dmg: 0.45,
                extra: { delay: 0.55, launchSpeed: 185 * tm(e), eye: GOLD },
              });
            }
          }
          contactDamage(e, dt, Math.round(e.damage * 0.9), 0.8);
          if (remaining <= sp * dt + 1 || e.t <= 0) {
            e.swoops--;
            if (e.swoops > 0) swoopWind(e, p, 0.45);
            else sub(e, 'rec', 0.5);
          }
        } else if (e.t <= 0) {
          idle(e, 0.3);
        }
      },
    },

    // BARRAGE — Hundred-Eyed Display: glides to the centre, fans its tail and
    // spins two counter-rotating spirals (teal one way, gold the other).
    // Phase 2 adds rippling aimed shots from the tail's eyes; phase 3 adds
    // gapped rings. Ends preening, exposed.
    display: {
      cooldown: 13,
      start(e) {
        const b = arenaBounds();
        e.cx = (b.l + b.r) / 2;
        e.cy = (b.t + b.b) / 2;
        sub(e, 'move', 0.8);
      },
      update(e, dt, p) {
        if (e.sub === 'move') {
          const d = dist(e.x, e.y, e.cx, e.cy);
          if (d > 8) moveDir(e, angleTo(e.x, e.y, e.cx, e.cy), Math.min(420, d / dt), dt);
          e.face = angleTo(e.x, e.y, p.x, p.y);
          if (e.t <= 0 || d < 10) { sub(e, 'wind', 0.9); sfx.chime(); }
          return;
        }
        turnToward(e, angleTo(e.x, e.y, p.x, p.y), 2 * dt);
        if (e.sub === 'wind') {
          if (Math.random() < dt * 40) {
            const a = rand(0, TAU);
            burst(e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120, {
              count: 1, color: Math.random() < 0.5 ? TEAL : GOLD, speed: 280, size: 3.5, life: 0.4, dir: a + PI, spread: 0.2, drag: 1,
            });
          }
          if (e.t <= 0) {
            sub(e, 'fire', [3.2, 3.6, 4.0][e.phase - 1]);
            e.rosA = rand(0, TAU);
            e.rosT = 0;
            e.eyeT = 0.6;
            e.burstT = 1.0;
            sfx.beam();
          }
          return;
        }
        const arms = e.phase >= 2 ? 4 : 3;
        const every = e.phase >= 3 ? 0.2 : 0.16;
        e.rosT -= dt;
        while (e.rosT <= 0) {
          e.rosT += every;
          e.rosA += 0.21;
          for (let k = 0; k < arms; k++) {
            shot(e, e.rosA + (k / arms) * TAU, 145 * tm(e), { r: 8, color: TEAL, dmg: 0.4, life: 6 });
            shot(e, -e.rosA + (k / arms) * TAU + 0.5, 145 * tm(e), { r: 8, color: GOLD, dmg: 0.4, life: 6 });
          }
        }
        if (e.phase >= 2) {
          e.eyeT -= dt;
          if (e.eyeT <= 0) {
            e.eyeT = 0.6;
            // Five eyes on the fan fire in a ripple, each re-aiming as it goes.
            for (let k = 0; k < 5; k++) {
              const a = e.face + PI + (k - 2) * 0.55;
              shot(e, a, 1, {
                x: e.x + Math.cos(a) * 70, y: e.y + Math.sin(a) * 70, off: 0,
                r: 7, color: SKY, dmg: 0.4,
                extra: { delay: 0.1 + k * 0.07, launchSpeed: 250 * tm(e), launchAtPlayer: true },
              });
            }
          }
        }
        if (e.phase >= 3) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burstT = 1.1;
            ringShot(e, 16, 175 * tm(e), rand(0, TAU), {
              shape: 'feather', r: 6, color: PFEATHER, dmg: 0.4, gapA: rand(0, TAU), gapW: 0.9, extra: { eye: GOLD },
            });
          }
        }
        if (e.t <= 0) expose(e, 2.2);
      },
    },

    // Prism Gaze: two (then three) warning lines, then beams that sweep the
    // way the chevrons point. Circle with them, or dash through one.
    beams: {
      cooldown: 12,
      start(e, p) {
        sub(e, 'wind', 1.0);
        sfx.chime();
        const n = e.phase >= 3 ? 3 : 2;
        const pa = angleTo(e.x, e.y, p.x, p.y);
        const dir = Math.random() < 0.5 ? 1 : -1;
        const spin = dir * (e.phase >= 3 ? 0.62 : 0.5);
        const base = n === 2
          ? [pa + 0.6, pa - 0.6]
          : [pa + 0.7, pa + 0.7 + TAU / 3, pa + 0.7 + (2 * TAU) / 3];
        for (const a of base) {
          spawnHazard({
            kind: 'beam', x: e.x, y: e.y, angle: a, len: 1500, width: 24, warn: 1.0, active: 2.6, spin,
            damage: Math.round(e.damage * 0.8), color: GOLD, owner: e, follow: e, source: e.type,
          });
        }
      },
      update(e, dt, p) {
        turnToward(e, angleTo(e.x, e.y, p.x, p.y), 2 * dt);
        if (e.sub === 'wind') {
          if (e.t <= 0) { sub(e, 'fire', 2.6); e.burstT = 1.2; }
          return;
        }
        if (e.phase >= 3) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burstT = 1.2;
            ringShot(e, 12, 120 * tm(e), rand(0, TAU), { r: 8, color: TEAL, dmg: 0.4 });
          }
        }
        if (e.t <= 0) expose(e, 1.4);
      },
    },

    // Watching Eyes: three floating eyes that each spin a slow spiral for a
    // few seconds. Shoot them down or wait them out.
    eyes: {
      cooldown: 16,
      start(e) { sub(e, 'call', 0.7); sfx.chime(); },
      update(e, dt, p) {
        if (e.t > 0 || !spawnEnemyFn) return;
        const b = arenaBounds();
        for (let k = 0; k < 3; k++) {
          let x = 0, y = 0;
          for (let tries = 0; tries < 12; tries++) {
            x = b.l + (b.r - b.l) * ((k + 0.5) / 3) + rand(-60, 60);
            y = rand(b.t + 60, b.b - 60);
            if (dist(x, y, p.x, p.y) > 200) break;
          }
          spawnEnemyFn('eyeorb', x, y, { scale: e.scale * 0.8, summoner: e, tier: e.tier, dmgScale: 1 });
        }
        idle(e, 0.4);
      },
    },
  },
};

// --- exposed / hidden visuals -------------------------------------------------------

/** Drawn over any boss: the exposed halo, plus each boss's own tells. */
export function drawBossExtras(e, ctx) {
  const t = world.runTime;
  // Specs with their own props (aim lines, lassos, coins) draw them here.
  const spec = e.def && e.def.spec;
  if (spec && spec.drawExtras) spec.drawExtras(e, ctx, t);
  if (spec && spec.draw) return;
  if (e.hidden) {
    // A submerged crocodile: a dark shape under the floor and a V of ripples.
    const a = e.face || 0;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(a);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(-10, 0, e.r * 1.6, e.r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = MIRE;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 1.6 + k / 3) % 1;
      ctx.globalAlpha = 0.6 * (1 - ph);
      ctx.beginPath();
      ctx.moveTo(e.r * 0.8, 0);
      ctx.lineTo(e.r * 0.8 - 30 - ph * 60, -12 - ph * 34);
      ctx.moveTo(e.r * 0.8, 0);
      ctx.lineTo(e.r * 0.8 - 30 - ph * 60, 12 + ph * 34);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  if (e.exposed > 0) {
    // Gold dashed halo turning around the boss, and the word itself pulsing.
    const pulse = 0.6 + Math.sin(t * 12) * 0.25;
    ctx.save();
    ctx.translate(e.x, e.y - (e.z || 0));
    ctx.rotate(t * 1.8);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.35, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Dizzy stars orbiting overhead.
    for (let k = 0; k < 3; k++) {
      const a = t * 4 + (k / 3) * TAU;
      const sx = e.x + Math.cos(a) * e.r * 0.7;
      const sy = e.y - e.r * 1.05 + Math.sin(a) * e.r * 0.22;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffe27a';
      star(ctx, sx, sy, 5);
    }
    ctx.globalAlpha = 1;
  }

  if (e.type === 'gorilla' && e.enraged) {
    // Enraged: eyes burn red.
    const hx = e.x + Math.cos(e.face) * 30 * (e.r / 48);
    const hy = e.y - (e.z || 0) + Math.sin(e.face) * 30 * (e.r / 48);
    ctx.globalAlpha = 0.35 + Math.sin(t * 10) * 0.15;
    ctx.fillStyle = '#ff3d3d';
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.4 : r;
    const a = (i / 8) * TAU - PI / 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// --- definitions ------------------------------------------------------------------

function bossDef(spec, stats) {
  return {
    cost: 999, minDepth: 99, boss: true, spec, ...stats,
    init(e) { bossInit(e, spec); },
    update(e, dt) { runBoss(e, dt, spec); },
    // A spec may draw its boss itself; otherwise this stands in for a missing rig.
    draw: spec.draw || function draw(e, ctx) {
      ctx.fillStyle = e.tint;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
    },
  };
}

export const BOSS_DEFS = {
  // The Twin Wardens: the room spawns Solaris, who brings Grumm (boss-wardens.js).
  solaris: bossDef(SOLARIS, {
    r: 22, hp: 780, speed: 190, mass: 16, color: '#ffd45e', damageBase: 16,
    title: 'Solaris the Lancer', subtitle: 'The Twin Wardens',
  }),
  grumm: bossDef(GRUMM, {
    r: 40, hp: 1050, speed: 78, mass: 60, color: '#9a98aa', damageBase: 19,
    title: 'Grumm the Hammer', subtitle: 'The Twin Wardens',
  }),
  naga: bossDef(NAGA, {
    r: 26, hp: 1500, speed: 150, mass: 40, color: '#2f8f6a', damageBase: 17,
    title: 'Nagaraja', subtitle: 'The Coil Beneath',
  }),
  // Nagaraja's parts: body segments and the second head. Placed and drawn by
  // her (fixed + invisible); hits on them pass to her (proxyOf, boss-naga.js).
  nagaseg: {
    r: 16, hp: 999999, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#2f8f6a',
    fixed: true, invisible: true,
    init(e) { e.noPush = true; e.noTarget = true; },
    update() {}, draw() {},
  },
  nagahead: {
    r: 22, hp: 999999, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#2f8f6a',
    fixed: true, invisible: true,
    init(e) { e.noPush = true; },
    update() {}, draw() {},
  },
  grandmaster: bossDef(GRANDMASTER, {
    r: 24, hp: 1600, speed: 120, mass: 40, color: '#e8c060', damageBase: 19,
    title: 'The Grandmaster', subtitle: 'King of the Living Board',
  }),
  // His chessmen: moved by him square by square (boss-chess-board.js); capture them.
  chessman: {
    r: 20, hp: 80, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#e8c060',
    fixed: true,
    init(e) { e.noPush = true; },
    update() {},
    draw: drawChessman,
  },
  mau: bossDef(MAU, {
    r: 24, hp: 1800, speed: 190, mass: 20, color: '#5fe0a0', damageBase: 19,
    title: 'Mau, the Nine-Lived', subtitle: 'The Great Cat of Nine Legends',
  }),
  // Schrödinger's boxes: placed and drawn by Mau (boss-mau.js); strike one to look inside.
  catbox: {
    r: 30, hp: 999999, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#b8864e',
    fixed: true, invisible: true,
    init(e) { e.noPush = true; },
    update() {}, draw() {},
  },
  maestro: bossDef(MAESTRO, {
    r: 22, hp: 1400, speed: 150, mass: 20, color: '#b48cff', damageBase: 20,
    title: 'The Maestro', subtitle: 'Conductor of the Last Symphony',
  }),
  // His orchestra: spectral musicians who play on his beat (boss-maestro.js).
  musician: {
    r: 18, hp: 90, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#b48cff',
    fixed: true,
    init(e) { e.noPush = true; },
    update() {},
    draw: drawMusician,
  },
  monkey: bossDef(MONKEY, {
    r: 24, hp: 1300, speed: 185, mass: 24, color: '#e0a84a', damageBase: 18,
    title: 'Echo of the Monkey King', subtitle: 'Sage of the Cloud Summit',
  }),
  // His clones: placed and drawn by him (boss-monkey.js); a hit pops one.
  monkeyclone: {
    r: 24, hp: 999999, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#ffc861',
    fixed: true, invisible: true,
    init(e) { e.noPush = true; },
    update() {}, draw() {},
  },
  bride: bossDef(BRIDE, {
    r: 22, hp: 1250, speed: 150, mass: 30, color: '#dfeaff', damageBase: 18,
    title: 'The Weeping Bride', subtitle: 'Lady of the Hollow Mirror',
  }),
  // Her mirror images: placed and drawn by her (boss-bride.js); a hit shatters one.
  bridecopy: {
    r: 22, hp: 999999, speed: 0, mass: 999, cost: 999, minDepth: 99, color: '#dfeaff',
    fixed: true, invisible: true,
    init(e) { e.noPush = true; },
    update() {}, draw() {},
  },
  aldric: bossDef(ALDRIC, {
    r: 22, hp: 1300, speed: 150, mass: 24, color: '#c8ccd8', damageBase: 17,
    title: 'Ser Aldric the Oathbound', subtitle: 'The Last Knight of the Moon',
  }),
  vesper: bossDef(VESPER, {
    r: 26, hp: 1400, speed: 160, mass: 20, color: '#ffb35e', damageBase: 17,
    title: 'Deadeye Vesper', subtitle: 'The Last Bullet',
  }),
  turtle: bossDef(TURTLE, {
    r: 50, hp: 1250, speed: 62, mass: 30, color: '#4fae7c', damageBase: 18,
    title: 'Gravemaw the Shellback', subtitle: 'Ancient of the Drowned Vault',
  }),
  croc: bossDef(CROC, {
    r: 42, hp: 1100, speed: 118, mass: 22, color: '#6f9e3a', damageBase: 20,
    title: 'Mawgrim, the Mire King', subtitle: 'He Who Waits Beneath',
  }),
  gorilla: bossDef(GORILLA, {
    r: 48, hp: 1200, speed: 138, mass: 26, color: '#9d93b8', damageBase: 22,
    title: 'Kharn, the Ashen Silverback', subtitle: 'Fury of the Broken Peak',
  }),
  peacock: bossDef(PEACOCK, {
    r: 36, hp: 1000, speed: 190, mass: 14, color: '#3a8cff', damageBase: 18,
    title: 'Solenne, the Hundred-Eyed', subtitle: 'Vanity of the Gilded Deep',
  }),

  // The peacock's watching eyes: stationary turrets that spin a slow spiral
  // for a few seconds, then pop. Killable; not spawned by normal waves.
  eyeorb: {
    r: 15, hp: 55, speed: 0, mass: 99, cost: 999, minDepth: 99, color: GOLD, damageBase: 7,
    init(e) {
      e.noPush = true;
      e.life = 7.5;
      e.cd = 0.9;
      e.spinA = rand(0, TAU);
      e.dir = Math.random() < 0.5 ? 1 : -1;
    },
    update(e, dt) {
      e.life -= dt;
      e.cd -= dt;
      e.spinA += dt * 0.9 * e.dir;
      if (e.cd <= 0) {
        e.cd = 0.32;
        countBullets();
        for (let k = 0; k < 2; k++) {
          shot(e, e.spinA + k * PI, 125 * tm(e), { r: 7, color: GOLD, dmg: 1, off: e.r });
        }
      }
      if (e.life <= 0) {
        e.dead = true;
        burst(e.x, e.y, { count: 12, color: GOLD, speed: 200, size: 3.5, life: 0.4, drag: 4 });
      }
    },
    draw(e, ctx) {
      const p = world.player;
      const look = p ? angleTo(e.x, e.y, p.x, p.y) : 0;
      const blink = e.life < 1.5 && Math.sin(e.life * 20) < 0 ? 0.5 : 1;
      ctx.save();
      ctx.translate(e.x, e.y + Math.sin(world.runTime * 3 + e.seed) * 3);
      ctx.globalAlpha = 0.25 * blink;
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 1.7, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#0b0712';
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r + 2, e.r * 0.8 + 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#f4f0ff';
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r, e.r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2446c8';
      ctx.beginPath();
      ctx.arc(Math.cos(look) * e.r * 0.35, Math.sin(look) * e.r * 0.3, e.r * 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0b0712';
      ctx.beginPath();
      ctx.arc(Math.cos(look) * e.r * 0.42, Math.sin(look) * e.r * 0.36, e.r * 0.22, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },
};

// The guardian pool lives in boss-pool.js (a new boss is added there).
export { BOSS_POOL } from './boss-pool.js';

export const BOSS_INFO = {
  turtle: { title: BOSS_DEFS.turtle.title, subtitle: BOSS_DEFS.turtle.subtitle, color: '#6fdca0', animal: 'Turtle' },
  croc: { title: BOSS_DEFS.croc.title, subtitle: BOSS_DEFS.croc.subtitle, color: '#b5e05a', animal: 'Crocodile' },
  gorilla: { title: BOSS_DEFS.gorilla.title, subtitle: BOSS_DEFS.gorilla.subtitle, color: '#c9bff0', animal: 'Gorilla' },
  peacock: { title: BOSS_DEFS.peacock.title, subtitle: BOSS_DEFS.peacock.subtitle, color: '#6fb8ff', animal: 'Peacock' },
  vesper: { title: BOSS_DEFS.vesper.title, subtitle: BOSS_DEFS.vesper.subtitle, color: '#ffb35e', animal: 'Gunslinger' },
  naga: { title: BOSS_DEFS.naga.title, subtitle: BOSS_DEFS.naga.subtitle, color: '#6fd8a4', animal: 'Serpent' },
  solaris: { title: 'The Twin Wardens', subtitle: 'Solaris the Lancer & Grumm the Hammer', color: '#ffd45e', animal: 'Duo' },
  grandmaster: { title: BOSS_DEFS.grandmaster.title, subtitle: BOSS_DEFS.grandmaster.subtitle, color: '#e8c060', animal: 'Chess' },
  mau: { title: BOSS_DEFS.mau.title, subtitle: BOSS_DEFS.mau.subtitle, color: '#5fe0a0', animal: 'Cat' },
  maestro: { title: BOSS_DEFS.maestro.title, subtitle: BOSS_DEFS.maestro.subtitle, color: '#c8a8ff', animal: 'Conductor' },
  monkey: { title: BOSS_DEFS.monkey.title, subtitle: BOSS_DEFS.monkey.subtitle, color: '#ffc861', animal: 'Trickster' },
  bride: { title: BOSS_DEFS.bride.title, subtitle: BOSS_DEFS.bride.subtitle, color: '#dfeaff', animal: 'Ghost' },
  aldric: { title: BOSS_DEFS.aldric.title, subtitle: BOSS_DEFS.aldric.subtitle, color: '#e8f0ff', animal: 'Knight' },
  grumm: { title: BOSS_DEFS.grumm.title, subtitle: 'The Twin Wardens', color: '#9a98aa', animal: 'Duo' },
  warden: { title: 'The Warden of Ash', subtitle: 'Keeper of the Last Gate', color: '#ff3d5e', animal: 'Warden' },
};
