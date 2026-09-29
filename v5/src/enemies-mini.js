// Mini-bosses: named foes that hold the Wilds' places in their champions' stead.
//
// Each is built on the boss kit (boss-kit.js) - a brain that picks among a few
// moves, a second phase at half health, punish windows - but is not a "boss"
// to the rest of the game: no arena, no gate, no music change of its own. It
// fights in its place's duel ring, under a bar of its own at the top of the
// screen, and guards the reliquary.
//
// On Cloud Summit, the Japanese mountain:
//   Kyubi, the Nine-Tailed   a fox spirit. Fans of foxfire that follow you;
//                            illusions of herself (the real one has a shadow);
//                            a dash that ends in a sweep of her tails.
//   Sasaki, the Wandering Blade  a ronin master. The draw (a locked line, then
//                            a dash through it - twice, later), a three-cut
//                            combo, a flying crescent; later a counter stance -
//                            strike him while he glows and he answers.
// Elsewhere:
//   the Oni Warlord          (the Broken Peaks) an iron club: a slam down a
//                            line, a spinning sweep, a charge; berserk at half.
//   the Bone Captain         (the Hollow Moors) sword and shield - front
//                            guarded - a three-cut combo, a shield rush, and
//                            skeletons raised from the ground.
//   the Alpha                (the Webwood) a great wolf: chains of pounces,
//                            and a howl that brings the pack.
//   the Bandit Queen         (the Dust Gulch) a crossbow fan behind five
//                            locking lines, a smoke bomb and knives from
//                            elsewhere, a knife dash.
//   the Bog Hag              (the Blackwater Mire) lobs of bog-poison, kappa
//                            called up, a great leap onto its shadow.
//   the Hierophant           (the Gilded Deep) a halo of light burst outward,
//                            a lance of light down a warning line, zealots
//                            called to ward her, a blink away.

import { world } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, polygon, circleOrientedRect } from './util.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, damageText, slash } from './fx.js';
import { spawnProjectile } from './spawn.js';
import { sfx } from './audio.js';
import { stepToward, stepAway, strafe } from './ai.js';
import { spawnHazard } from './hazards.js';
import {
  sub, idle, expose, bossInit, runBoss, fanShot, ringShot, shot, shockwave, lob, minionCount, spawnEnemyFn,
} from './boss-kit.js';
import { foxfire } from './enemies-yokai.js';

function blob(ctx, e, sides) {
  ctx.save();
  ctx.translate(e.x, e.y - (e.z || 0));
  ctx.rotate(e.face || 0);
  ctx.fillStyle = e.tint;
  polygon(ctx, 0, 0, e.r, sides, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  polygon(ctx, 0, 0, e.r * 0.45, sides, 0.3);
  ctx.fill();
  ctx.restore();
}

// --- small helpers ---------------------------------------------------------------------------------

const k2 = (e) => (e.phase >= 2 ? 0.8 : 1);                       // later, everything comes quicker
function arcHit(e, p, radius, arc, mult = 1, a = e.aim) {
  if (!p || p.dead) return false;
  if (dist(e.x, e.y, p.x, p.y) > radius + p.r) return false;
  if (arc < TAU && Math.abs(angleDiff(a, angleTo(e.x, e.y, p.x, p.y))) > arc / 2) return false;
  return damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type);
}
function lineHit(e, p, len, wid, mult = 1, a = e.aim) {
  if (!p || p.dead) return false;
  const cx = e.x + Math.cos(a) * len / 2, cy = e.y + Math.sin(a) * len / 2;
  if (!circleOrientedRect(p.x, p.y, p.r, cx, cy, a, len, wid)) return false;
  return damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type);
}
/** Keep between near and far of the player, circling. */
function hold(e, dt, p, near, far, k = 1) {
  const d = dist(e.x, e.y, p.x, p.y);
  if (d > far) stepToward(e, p.x, p.y, e.speed * k, dt);
  else if (d < near) stepAway(e, p.x, p.y, e.speed * 0.8 * k, dt);
  strafe(e, p.x, p.y, e.speed * 0.45 * k, dt, e.sign);
  if (Math.random() < dt * 0.35) e.sign *= -1;
  e.face = angleTo(e.x, e.y, p.x, p.y);
}
function dashStep(e, dt, speed) {
  e.x += Math.cos(e.aim) * speed * dt;
  e.y += Math.sin(e.aim) * speed * dt;
}
function summon(e, type, n, rad, p) {
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU);
    const m = spawnEnemyFn(type, p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, { summoner: e, scale: (e.scale || 1) * 0.8 });
    if (m) m.leash = e.leash;
  }
}

/** A mini-boss's definition from its numbers and its moveset (a boss-kit spec). */
function mini(base, S) {
  return {
    ...base, mini: true, role: 'mini', cost: 999, minDepth: 99, maxPerWave: 1, spec: S,
    init(e) { bossInit(e, S); e.boss = false; e.mini = true; },
    update(e, dt) { runBoss(e, dt, S); },
    under: S.under,
    draw: (e, ctx) => blob(ctx, e, base.sides || 7),
  };
}

// --- Kyubi, the Nine-Tailed ------------------------------------------------------------------------
// A trickster and a caster: she never charges you. Foxfire (kitsunebi) orbits
// her - her ammunition, which you can see - and she looses it one flame at a
// time; she sets the ground itself alight in patterns that leave a way
// through; she hides among copies of herself (only the real one casts, and
// only she has a shadow); her tails fan flames that curve in; she blinks away,
// leaving a flame where she stood. Later, a spiral of foxfire.

const FOX = '#9fd8ff';
function flameMine(e, x, y, delay = 0.75, r = 60) {
  spawnHazard({ kind: 'blast', x, y, r, delay, damage: Math.round(e.damage * 0.8), color: FOX, source: e.type, owner: e, quiet: true });
}
const KYUBI = mini({ r: 28, hp: 600, speed: 118, mass: 5, color: '#ff9a3a', damageBase: 14, title: 'Kyubi, the Nine-Tailed', sides: 9 }, {
  phases: [0.5],
  phaseTime: 1.6,
  opening: { court: 5, field: 1.5 },
  init(e) { e.orbs = 5; e.orbT = 0; e.fieldPat = 0; },
  tick(e, dt) {
    // The orbiting flames come back, one at a time.
    const max = e.phase >= 2 ? 7 : 5;
    if (e.orbs < max && e.action !== 'procession') { e.orbT += dt; if (e.orbT > 0.6) { e.orbT = 0; e.orbs++; } }
    e.orbA = (e.orbA || 0) + dt * 2.2;
  },
  onPhase(e) { e.orbs = 7; },
  idle(e, dt, p) { hold(e, dt, p, 220, 330, 0.8); },
  choose: (e, p, d) => [
    ['procession', e.orbs >= 3 ? 3 : 0], ['field', 2.5], ['court', minionCount(e) < 1 ? 1.6 : 0],
    ['fan', 2], ['blink', d < 180 ? 3.5 : 0.3], ['spiral', e.phase >= 2 ? 2 : 0],
  ],
  moves: {
    procession: {
      cooldown: 1.4,
      start(e) { sub(e, 'raise', 0.4 * k2(e)); sfx.telegraph(); },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.sub === 'raise' && e.t <= 0) { sub(e, 'loose', 0); e.gap = 0; }
        if (e.sub === 'loose') {
          e.gap -= dt;
          if (e.gap <= 0 && e.orbs > 0) {
            // One flame leaves its orbit and goes for you, bending as it flies.
            const a = e.orbA + e.orbs * (TAU / 7);
            const ox = e.x + Math.cos(a) * 30, oy = e.y + Math.sin(a) * 18 - 30;
            const aim = angleTo(ox, oy, p.x, p.y) + (e.orbs % 2 ? 0.35 : -0.35);
            spawnProjectile({ x: ox, y: oy, vx: Math.cos(aim) * 250, vy: Math.sin(aim) * 250, r: 9, damage: Math.round(e.damage * 0.55), color: FOX, shape: 'orb', life: 3.2, homing: 1.3, srcType: e.type, quiet: true });
            e.orbs--; e.gap = 0.17; sfx.shoot();
          }
          if (e.orbs <= 0) idle(e, 0.6);
        }
      },
    },
    field: {
      cooldown: 4,
      start(e, p) {
        sub(e, 'cast', 1.1);
        // Patterns that always leave a way through: a ring round you, then a cross on you.
        const pat = (e.fieldPat = (e.fieldPat + 1) % 2);
        const delay = e.phase >= 2 ? 0.85 : 1.05;
        if (pat === 0) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + rand(0, 0.5); flameMine(e, p.x + Math.cos(a) * 125, p.y + Math.sin(a) * 125, delay, 58); }
        else { flameMine(e, p.x, p.y, delay, 62); for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; flameMine(e, p.x + Math.cos(a) * 150, p.y + Math.sin(a) * 150, delay + 0.35, 58); } }
        if (e.phase >= 2) for (let k = 0; k < 3; k++) { const a = rand(0, TAU); flameMine(e, p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, delay + 0.6, 58); }
      },
      update(e, dt, p) { e.face = angleTo(e.x, e.y, p.x, p.y); if (e.t <= 0) idle(e, 0.5); },
    },
    court: {
      cooldown: 10,
      start(e) { sub(e, 'vanish', 0.45); e.invuln = true; sfx.whirr(); burst(e.x, e.y, { count: 22, color: '#f6b0c8', speed: 220, size: 4, life: 0.6, drag: 3 }); },
      update(e, dt, p) {
        if (e.sub === 'vanish' && e.t <= 0) {
          // A court of copies round you; she is one of them, the only one that casts.
          const n = e.phase >= 2 ? 4 : 3;
          const a0 = rand(0, TAU), me = Math.floor(rand(0, n + 1));
          for (let k = 0; k <= n; k++) {
            const a = a0 + (k / (n + 1)) * TAU, x = p.x + Math.cos(a) * 230, y = p.y + Math.sin(a) * 230;
            if (k === me) { e.x = x; e.y = y; continue; }
            const c = spawnEnemyFn('foxclone', x, y, { instant: true, summoner: e });
            if (c) {
              c.r = e.r; c.leash = e.leash; c.look = 'kyubi'; c.life = 6; c.orbs = 3;
              // A copy struck bursts into a ring of foxfire.
              c.onDeath = (q) => { burst(q.x, q.y, { count: 14, color: '#fff0e0', speed: 180, size: 3, life: 0.4, drag: 4 }); for (let j = 0; j < 6; j++) foxfire({ x: q.x, y: q.y, damage: e.damage, type: e.type }, (j / 6) * TAU, { speed: 150, homing: 0, dmg: 0.5 }); };
            }
          }
          e.invuln = false; e.courtHp = e.hp; e.castT = 0.6;
          sub(e, 'court', 5);
        } else if (e.sub === 'court') {
          e.face = angleTo(e.x, e.y, p.x, p.y);
          e.castT -= dt;
          if (e.castT <= 0) { e.castT = 1.1; foxfire(e, e.face, { speed: 170, dmg: 0.6, homing: 0.6 }); sfx.shoot(); }
          // Found out: the copies fade, and she is open.
          if (e.hp < e.courtHp - 0.5) {
            for (const q of world.enemies) if (q.summoner === e && q.type === 'foxclone' && !q.dead) { q.onDeath = null; q.dead = true; burst(q.x, q.y, { count: 8, color: '#fff0e0', speed: 120, size: 3, life: 0.3, drag: 4 }); }
            damageText(e.x, e.y - 70, 'FOUND YOU', { color: '#ffd45e', size: 15 });
            expose(e, 1.3);
            return;
          }
          if (e.t <= 0) idle(e, 0.3);
        }
      },
    },
    fan: {
      cooldown: 3.2,
      start(e, p) { sub(e, 'spread', 0.6 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        e.face = e.aim;
        if (e.sub === 'spread' && e.t <= 0) {
          // One flame from each tail, curving in toward the middle.
          for (let k = 0; k < 9; k++) {
            const off = (k / 8 - 0.5) * 2.4, a = e.aim + off;
            spawnProjectile({ x: e.x, y: e.y - 20, vx: Math.cos(a) * 185, vy: Math.sin(a) * 185, r: 8, damage: Math.round(e.damage * 0.55), color: FOX, shape: 'orb', life: 3.4, turn: -off * 0.55, srcType: e.type, quiet: true });
          }
          sfx.shoot();
          sub(e, 'rest', 0.6);
        } else if (e.sub === 'rest' && e.t <= 0) idle(e, 0.5);
        void p;
      },
    },
    blink: {
      cooldown: 3,
      start(e) { sub(e, 'fade', 0.25); },
      update(e, dt, p) {
        if (e.sub === 'fade' && e.t <= 0) {
          flameMine(e, e.x, e.y, 0.7, 70);
          burst(e.x, e.y, { count: 16, color: '#f6b0c8', speed: 180, size: 3, life: 0.5, drag: 3 });
          const a = angleTo(p.x, p.y, e.x, e.y) + rand(-0.9, 0.9);
          e.x = p.x + Math.cos(a) * 290; e.y = p.y + Math.sin(a) * 290;
          if (e.leash) { const d = dist(e.x, e.y, e.leash.x, e.leash.y); if (d > e.leash.r - e.r) { e.x = e.leash.x + (e.x - e.leash.x) * (e.leash.r - e.r) / d; e.y = e.leash.y + (e.y - e.leash.y) * (e.leash.r - e.r) / d; } }
          burst(e.x, e.y, { count: 16, color: '#f6b0c8', speed: 180, size: 3, life: 0.5, drag: 3 });
          idle(e, 0.4);
        }
      },
    },
    spiral: {
      cooldown: 5.5,
      start(e) { sub(e, 'spin', 1.8); e.spinA = rand(0, TAU); e.gap = 0; sfx.telegraph(); },
      update(e, dt) {
        e.spinA += dt * 2.6; e.aim = e.spinA;
        e.gap -= dt;
        if (e.gap <= 0) { e.gap = 0.1; for (let k = 0; k < 3; k++) shot(e, e.spinA + (k / 3) * TAU, 190, { color: FOX, dmg: 0.4, r: 8 }); }
        if (e.t <= 0) idle(e, 0.7);
      },
    },
  },
});

// --- Sasaki, the Wandering Blade --------------------------------------------------------------------
// A duelist after Sasaki Kojiro and his long sword. He never runs at you: his
// draw is a cut down a locked line with his body arriving on the far side;
// his Swallow Return sends one crescent straight and one that curls round
// and comes back; he stands with his eyes shut and the air splits in lines
// across you, one after another; his counter stance punishes a careless
// blow; up close, three cuts. Later, a storm of petals.

const IAI = 400;
const SAKURA = '#f6b0c8', STEEL = '#dff0ff';
function crescent(e, a, o = {}) {
  return spawnProjectile({
    x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, vx: Math.cos(a) * (o.speed || 360), vy: Math.sin(a) * (o.speed || 360),
    r: o.r || 12, damage: Math.round(e.damage * (o.dmg || 0.75)), color: o.color || STEEL, shape: 'shard', life: o.life || 2.4,
    turn: o.turn || 0, srcType: e.type, quiet: true,
  });
}
const SASAKI = mini({ r: 22, hp: 540, speed: 150, mass: 4, color: '#c84a4a', damageBase: 16, title: 'Sasaki, the Wandering Blade', sides: 5 }, {
  phases: [0.5],
  opening: { counter: 5, cuts: 3 },
  idle(e, dt, p) { hold(e, dt, p, 150, 240); },
  choose: (e, p, d) => [
    ['flash', 3], ['swallow', d > 150 ? 2.6 : 1], ['cuts', 2], ['counter', e.phase >= 2 ? 1.8 : 1.1],
    ['combo', d < 150 ? 3.5 : 0], ['storm', e.phase >= 2 ? 1.6 : 0],
  ],
  moves: {
    flash: {
      cooldown: 3,
      start(e, p) { e.draws = e.phase >= 2 ? 3 : 1; sub(e, 'stance', 0.8 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'stance') {
          if (e.t > 0.25) e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          if (e.t <= 0) {
            // The cut: the line is struck at once, and he is at its far end.
            e.x0 = e.x; e.y0 = e.y;
            let x1 = e.x + Math.cos(e.aim) * IAI, y1 = e.y + Math.sin(e.aim) * IAI;
            if (e.leash) { const d = dist(x1, y1, e.leash.x, e.leash.y); if (d > e.leash.r - e.r) { x1 = e.leash.x + (x1 - e.leash.x) * (e.leash.r - e.r) / d; y1 = e.leash.y + (y1 - e.leash.y) * (e.leash.r - e.r) / d; } }
            const len = Math.hypot(x1 - e.x, y1 - e.y);
            lineHit(e, p, len, 30, 1.2);
            e.cut = { x0: e.x, y0: e.y, x1, y1, t: 0.3 };
            for (let k = 0; k < 8; k++) burst(e.x + (x1 - e.x) * k / 8, e.y + (y1 - e.y) * k / 8, { count: 2, color: k % 2 ? SAKURA : STEEL, speed: 90, size: 3, life: 0.4, drag: 3 });
            e.x = x1; e.y = y1;
            slash(e.x, e.y, e.aim + Math.PI, 1.6, 60, STEEL, 0.2, 10);
            sfx.swing(1.4); shake(0.2);
            e.draws--;
            sub(e, 'after', 0.25);
          }
        } else if (e.sub === 'after') {
          if (e.t <= 0) { if (e.draws > 0) { e.aim = angleTo(e.x, e.y, p.x, p.y); sub(e, 'stance', 0.45); } else sub(e, 'sheathe', 0.7); }
        } else if (e.t <= 0) expose(e, 1.0);
      },
    },
    swallow: {
      cooldown: 3.6,
      start(e, p) { sub(e, 'wind', 0.55 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
          if (e.t <= 0) {
            // Tsubame Gaeshi: one crescent straight, one that curls round and returns.
            crescent(e, e.aim, { speed: 400 });
            crescent(e, e.aim + 0.9, { speed: 300, turn: -2.3, life: 2.8, color: SAKURA });
            if (e.phase >= 2) crescent(e, e.aim - 0.9, { speed: 300, turn: 2.3, life: 2.8, color: SAKURA });
            slash(e.x, e.y, e.aim, 2.4, 50, STEEL, 0.2, 12);
            sfx.swing(1.1);
            sub(e, 'rest', 0.5);
          }
        } else if (e.t <= 0) idle(e, 0.5);
      },
    },
    cuts: {
      cooldown: 5,
      start(e, p) {
        // Eyes shut; the air splits in lines across where you are.
        const n = e.phase >= 2 ? 5 : 3;
        let a = rand(0, TAU);
        for (let k = 0; k < n; k++) {
          a += Math.PI / n + rand(0.2, 0.5);
          const q = world.player;
          spawnHazard({
            kind: 'beam', x: q.x - Math.cos(a) * 320, y: q.y - Math.sin(a) * 320, angle: a, len: 640, width: 30,
            warn: 0.7 + k * 0.38, active: 0.1, damage: Math.round(e.damage * 0.9), color: STEEL, owner: e, source: e.type,
            track: k === 0 ? null : (h) => { const pl = world.player; if (pl && h.t < h.warn - 0.45) { h.x = pl.x - Math.cos(h.angle) * 320; h.y = pl.y - Math.sin(h.angle) * 320; } },
          });
        }
        sub(e, 'focus', 0.7 + n * 0.38 + 0.2);
        void p;
      },
      update(e, dt, p) { e.face = angleTo(e.x, e.y, p.x, p.y); if (e.t <= 0) idle(e, 0.5); },
    },
    counter: {
      cooldown: 7,
      start(e) {
        sub(e, 'guard', 1.2);
        damageText(e.x, e.y - 70, 'COUNTER STANCE', { color: '#bfe0ff', size: 14 });
        e.guardFn = (self) => {
          if (self.sub !== 'guard') return 1;
          self.guardFn = null;
          sub(self, 'counter', 0.14);
          sfx.block();
          return 0;
        };
      },
      update(e, dt, p) {
        if (e.sub === 'guard') { e.face = angleTo(e.x, e.y, p.x, p.y); if (e.t <= 0) { e.guardFn = null; idle(e, 0.4); } }
        else if (e.sub === 'counter' && e.t <= 0) {
          // Behind you in a blink, and the answer.
          const a = (p.face ?? p.aimAngle ?? 0) + Math.PI;
          e.x = p.x + Math.cos(a) * 60; e.y = p.y + Math.sin(a) * 60;
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          slash(e.x, e.y, e.aim, 2.6, 90, STEEL, 0.22, 14);
          arcHit(e, p, 110, 2.6, 1.3);
          shake(0.3);
          idle(e, 0.7);
        }
      },
    },
    combo: {
      cooldown: 2.4,
      start(e, p) { e.cuts = 3; sub(e, 'wind', 0.3 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
          stepToward(e, p.x, p.y, 50, dt);
          if (e.t <= 0) {
            sub(e, 'cut', 0.16); e.cutSide = -(e.cutSide || 1);
            slash(e.x, e.y, e.aim + e.cutSide * 0.2, 2.2, 95, STEEL, 0.16, 12);
            arcHit(e, p, 100, 2.2, 0.8); sfx.swing(0.9);
          }
        } else if (e.t <= 0) { e.cuts--; if (e.cuts > 0) sub(e, 'wind', 0.2 * k2(e)); else idle(e, 0.6); }
      },
    },
    storm: {
      cooldown: 6,
      start(e) { sub(e, 'spin', 0.9); sfx.telegraph(); },
      update(e, dt, p) {
        e.aim = (e.aim || 0) + dt * 14;
        if (Math.random() < dt * 40) burst(e.x + rand(-40, 40), e.y + rand(-40, 20), { count: 1, color: SAKURA, speed: 60, size: 3, life: 0.6, drag: 1 });
        if (e.t <= 0) {
          shockwave(e, { speed: 250, dmg: 0.6, color: SAKURA });
          shockwave(e, { speed: 250, dmg: 0.6, color: SAKURA, wait: 0.55 });
          idle(e, 0.8);
        }
        void p;
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'flash' && e.sub === 'stance') {
      const locked = e.t <= 0.25;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.aim);
      ctx.fillStyle = locked ? 'rgba(220,240,255,0.55)' : 'rgba(220,240,255,0.16)'; ctx.fillRect(0, -15, IAI, 30);
      ctx.restore();
    }
    if (e.cut && e.cut.t > 0) {
      e.cut.t -= 1 / 60;
      const k = e.cut.t / 0.3;
      ctx.strokeStyle = `rgba(240,248,255,${(0.9 * k).toFixed(2)})`; ctx.lineWidth = 2 + 6 * k;
      ctx.beginPath(); ctx.moveTo(e.cut.x0, e.cut.y0 - 20); ctx.lineTo(e.cut.x1, e.cut.y1 - 20); ctx.stroke();
    }
    if (e.action === 'counter' && e.sub === 'guard') {
      ctx.strokeStyle = 'rgba(190,224,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14 + Math.sin(world.runTime * 12) * 2, 0, TAU); ctx.stroke();
    }
  },
});

// --- the Oni Warlord ---------------------------------------------------------------------------------

const ONI = mini({ r: 32, hp: 700, speed: 95, mass: 9, color: '#d84a3a', damageBase: 18, title: 'The Oni Warlord', sides: 6 }, {
  phases: [0.5],
  idle(e, dt, p) { hold(e, dt, p, 90, 140, e.phase >= 2 ? 1.35 : 1); },
  choose: (e, p, d) => [['smash', 3], ['sweep', d < 190 ? 3 : 0], ['boulder', d > 200 ? 3 : 0.5], ['quake', 1.6]],
  onPhase(e) { damageText(e.x, e.y - 80, 'BERSERK', { color: '#ff6a4a', size: 18 }); },
  moves: {
    smash: {
      cooldown: 2.4,
      start(e, p) { sub(e, 'raise', 0.8 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'raise') {
          if (e.t > 0.25) e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          if (e.t <= 0) {
            lineHit(e, p, 250, 70, 1.1);
            for (let k = 1; k <= 6; k++) burst(e.x + Math.cos(e.aim) * k * 40, e.y + Math.sin(e.aim) * k * 40, { count: 3, color: '#8a6a4a', speed: 160, size: 5, life: 0.4, drag: 4, shape: 'shard' });
            shake(0.5); sfx.explode();
            if (e.phase >= 2) shockwave(e, { speed: 260, dmg: 0.5, color: '#ff6a4a' });
            sub(e, 'stuck', 0.7);
          }
        } else if (e.t <= 0) { if (e.phase < 2) expose(e, 0.7); else idle(e, 0.3); }
      },
    },
    sweep: {
      cooldown: 3,
      start(e) { sub(e, 'wind', 0.6 * k2(e)); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'wind' && e.t <= 0) {
          ring(e.x, e.y, { r0: 10, r1: 145, color: '#ff9a4d', life: 0.3, width: 9 });
          arcHit(e, p, 145, TAU, 0.9);
          sfx.swing(1.4);
          sub(e, 'spin', 0.5);
        } else if (e.sub === 'spin' && e.t <= 0) idle(e, 0.5);
      },
    },
    boulder: {
      cooldown: 4,
      start(e, p) { sub(e, 'lift', 0.8 * k2(e)); e.tx = p.x; e.ty = p.y; sfx.telegraph(); },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.sub === 'lift' && e.t <= 0) {
          // A boulder torn up and thrown where you are; it bursts into rubble.
          lob(e, p.x, p.y, { r: 78, dmg: 1, color: '#8a6a4a', flight: 1.0, shards: { n: e.phase >= 2 ? 8 : 6, speed: 230, color: '#8a6a4a' }, shardShape: 'rock' });
          sfx.swing(1.4);
          sub(e, 'throw', 0.5);
        } else if (e.sub === 'throw' && e.t <= 0) idle(e, 0.5);
      },
    },
    quake: {
      cooldown: 6,
      start(e) { sub(e, 'raise', 0.7 * k2(e)); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'raise' && e.t <= 0) {
          // A stomp: a ring through the ground, and rocks shaken down round you.
          shockwave(e, { speed: 240, dmg: 0.6, color: '#c89a6a' });
          for (let k = 0; k < (e.phase >= 2 ? 6 : 4); k++) { const a = rand(0, TAU), r = rand(40, 200); lob(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, { r: 46, dmg: 0.6, color: '#8a6a4a', flight: 0.9 + k * 0.12 }); }
          shake(0.6); sfx.explode();
          sub(e, 'stomp', 0.6);
        } else if (e.sub === 'stomp' && e.t <= 0) { if (e.phase < 2) expose(e, 0.7); else idle(e, 0.4); }
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'smash' && e.sub === 'raise') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.aim);
      ctx.fillStyle = `rgba(255,120,80,${(0.12 + 0.3 * (e.t <= 0.25 ? 1 : 0)).toFixed(2)})`; ctx.fillRect(0, -35, 250, 70);
      ctx.restore();
    }
    if (e.action === 'sweep' && e.sub === 'wind') {
      ctx.strokeStyle = 'rgba(255,154,77,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 145, 0, TAU); ctx.stroke();
    }

  },
});

// --- the Bone Captain ---------------------------------------------------------------------------------

function captainGuard(e, opts) {
  if ((e.action !== 'idle' && e.action !== 'wall') || opts.dir === undefined) return 1;
  if (Math.abs(angleDiff(e.face || 0, opts.dir + Math.PI)) > 1.1) return 1;
  if ((e.blockSay || -9) < world.runTime - 0.6) { e.blockSay = world.runTime; damageText(e.x, e.y - 60, 'GUARDED', { color: '#e8e0cc', size: 13 }); }
  sfx.block();
  return e.action === 'wall' ? 0 : 0.15;
}
const CAPTAIN = mini({ r: 24, hp: 540, speed: 115, mass: 6, color: '#d8d0bc', damageBase: 14, title: 'The Bone Captain', sides: 6 }, {
  phases: [0.5],
  opening: { raise: 3 },
  init(e) { e.guardFn = captainGuard; },
  idle(e, dt, p) { hold(e, dt, p, 90, 150); },
  choose: (e, p, d) => [['combo', d < 170 ? 4 : 0], ['javelin', d > 150 ? 3 : 0.5], ['raise', minionCount(e) < 3 ? 1.5 : 0], ['wall', minionCount(e) > 0 ? 1.4 : 0.3]],
  moves: {
    combo: {
      cooldown: 2.2,
      start(e, p) { e.cuts = 3; sub(e, 'wind', 0.32 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; stepToward(e, p.x, p.y, 50, dt);
          if (e.t <= 0) { sub(e, 'cut', 0.16); e.cutSide = -(e.cutSide || 1); slash(e.x, e.y, e.aim + e.cutSide * 0.2, 2, 90, '#e8e0cc', 0.16, 12); arcHit(e, p, 95, 2, 0.8); sfx.swing(0.8); }
        } else if (e.t <= 0) { e.cuts--; if (e.cuts > 0) sub(e, 'wind', 0.22 * k2(e)); else expose(e, 0.6); }
      },
    },
    javelin: {
      cooldown: 3.4,
      start(e, p) { sub(e, 'aim', 0.65 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'aim') {
          if (e.t > 0.2) e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          if (e.t <= 0) {
            spawnProjectile({ x: e.x, y: e.y, vx: Math.cos(e.aim) * 720, vy: Math.sin(e.aim) * 720, r: 9, damage: Math.round(e.damage * 1.1), color: '#e8e0cc', shape: 'spear', life: 1.6, srcType: e.type });
            if (e.phase >= 2) for (const s2 of [-0.25, 0.25]) spawnProjectile({ x: e.x, y: e.y, vx: Math.cos(e.aim + s2) * 640, vy: Math.sin(e.aim + s2) * 640, r: 8, damage: Math.round(e.damage * 0.8), color: '#e8e0cc', shape: 'spear', life: 1.6, srcType: e.type });
            sfx.swing(1.2);
            sub(e, 'throw', 0.5);
          }
        } else if (e.t <= 0) idle(e, 0.5);
      },
    },
    wall: {
      cooldown: 8,
      start(e) { sub(e, 'wall', 2.4); damageText(e.x, e.y - 70, 'SHIELD WALL', { color: '#e8e0cc', size: 14 }); sfx.block(); },
      update(e, dt, p) {
        // Behind his shield, walking you down while his dead come round your sides.
        e.face = angleTo(e.x, e.y, p.x, p.y);
        stepToward(e, p.x, p.y, 55, dt);
        if (e.t <= 0) idle(e, 0.4);
      },
    },
    raise: {
      cooldown: 8,
      start(e) { sub(e, 'rite', 1.0); sfx.rattle(); },
      update(e, dt, p) {
        if (e.t <= 0) { summon(e, 'boneling', e.phase >= 2 ? 4 : 3, 130, p); idle(e, 0.5); }
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'javelin' && e.sub === 'aim') {
      const locked = e.t <= 0.2;
      ctx.strokeStyle = locked ? 'rgba(232,224,204,0.9)' : 'rgba(232,224,204,0.35)'; ctx.lineWidth = locked ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 600, e.y + Math.sin(e.aim) * 600); ctx.stroke();
    }
  },
});

// --- the Alpha -----------------------------------------------------------------------------------------

const ALPHA = mini({ r: 26, hp: 520, speed: 200, mass: 5, color: '#5a5a66', damageBase: 13, title: 'The Alpha', sides: 3 }, {
  phases: [0.5],
  opening: { howl: 2 },
  idle(e, dt, p) { hold(e, dt, p, 170, 230, 1.1); },
  choose: (e, p, d) => [['pounce', 4], ['howl', minionCount(e) < 2 ? 1.5 : 0]],
  moves: {
    pounce: {
      cooldown: 2.2,
      start(e, p) { e.leaps = e.phase >= 2 ? 4 : 3; sub(e, 'crouch', 0.3 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'crouch') { e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; if (e.t <= 0) { sub(e, 'leap', 0.24); e.hit = false; sfx.swing(0.8); } }
        else if (e.sub === 'leap') {
          dashStep(e, dt, 620);
          if (!e.hit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 4) e.hit = damagePlayer(e.damage, e.x, e.y, e.type);
          if (e.t <= 0) { e.leaps--; if (e.leaps > 0) sub(e, 'crouch', 0.24 * k2(e)); else expose(e, 0.8); }
        }
      },
    },
    howl: {
      cooldown: 9,
      start(e) { sub(e, 'howl', 0.9); e.exposed = 0.9; sfx.roar(); },
      update(e, dt, p) {
        if (e.t <= 0) {
          ring(e.x, e.y, { r0: 10, r1: 200, color: '#c8c8d8', life: 0.4, width: 4 });
          summon(e, 'wolf', e.phase >= 2 ? 3 : 2, 320, p);
          e.exposed = 0; idle(e, 0.4);
        }
      },
    },
  },
});

// --- the Bandit Queen -----------------------------------------------------------------------------------

const QUEEN = mini({ r: 22, hp: 480, speed: 145, mass: 4, color: '#c84a4a', damageBase: 13, title: 'The Bandit Queen', sides: 5 }, {
  phases: [0.5],
  idle(e, dt, p) { hold(e, dt, p, 260, 360); },
  choose: (e, p, d) => [['fan', 3], ['smoke', 1.5], ['kegs', d < 320 ? 2.5 : 1]],
  moves: {
    fan: {
      cooldown: 2.8,
      start(e, p) { sub(e, 'aim', 0.85 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'aim') {
          if (e.t > 0.25) e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          if (e.t <= 0) { fanShot(e, e.phase >= 2 ? 7 : 5, 0.9, e.aim, 640, { shape: 'arrow', r: 7, dmg: 0.6, color: '#ffb070' }); sfx.arrow(); sub(e, 'reload', 0.7); }
        } else if (e.t <= 0) idle(e, 0.5);
      },
    },
    smoke: {
      cooldown: 6,
      start(e) { sub(e, 'bomb', 0.25); burst(e.x, e.y, { count: 26, color: '#6a6a74', speed: 150, size: 7, life: 0.7, drag: 3 }); sfx.whirr(); },
      update(e, dt, p) {
        if (e.sub === 'bomb' && e.t <= 0) {
          e.hidden = true; e.invuln = true;
          const a = rand(0, TAU);
          e.tx = p.x + Math.cos(a) * 260; e.ty = p.y + Math.sin(a) * 260;
          sub(e, 'gone', 0.7);
        } else if (e.sub === 'gone' && e.t <= 0) {
          e.x = e.tx; e.y = e.ty; e.hidden = false; e.invuln = false;
          burst(e.x, e.y, { count: 14, color: '#8a8a94', speed: 140, size: 4, life: 0.4, drag: 4 });
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          fanShot(e, 3, 0.5, e.aim, 440, { shape: 'shard', r: 6, dmg: 0.5, color: '#c8ccd8' });
          sfx.swing(0.7);
          idle(e, 0.6);
        }
      },
    },
    kegs: {
      cooldown: 4.5,
      start(e) { sub(e, 'wind', 0.45 * k2(e)); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'wind' && e.t <= 0) {
          // Powder kegs round you on short fuses. Strike one and it flies back at her.
          const n = e.phase >= 2 ? 4 : 3;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * TAU + rand(0, 1), r = k === 0 ? 30 : rand(90, 150);
            spawnHazard({
              kind: 'charge', x0: e.x, y0: e.y - e.r * 0.4, x1: p.x + Math.cos(a) * r, y1: p.y + Math.sin(a) * r,
              flight: 0.8, fuse: 1.1, r: 74, height: 150, shellR: 8, damage: e.damage, color: '#ff6a3c', source: e.type, owner: e,
            });
          }
          sfx.swing(0.8);
          sub(e, 'rest', 0.5);
        } else if (e.sub === 'rest' && e.t <= 0) idle(e, 0.5);
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'fan' && e.sub === 'aim') {
      const n = e.phase >= 2 ? 7 : 5, locked = e.t <= 0.25;
      ctx.strokeStyle = locked ? 'rgba(255,90,60,0.85)' : 'rgba(255,90,60,0.28)'; ctx.lineWidth = locked ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const a = e.aim + (k / (n - 1) - 0.5) * 0.9;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 520, e.y + Math.sin(a) * 520); ctx.stroke();
      }
    }
    if (e.action === 'smoke' && e.sub === 'gone') {
      const k = 1 - e.t / 0.7;
      ctx.strokeStyle = `rgba(200,200,215,${(0.25 + 0.5 * k).toFixed(2)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.tx, e.ty + 8, 22, 9, 0, 0, TAU); ctx.stroke();
    }
  },
});

// --- the Bog Hag ---------------------------------------------------------------------------------------

const HAG = mini({ r: 24, hp: 560, speed: 85, mass: 5, color: '#6a8a4a', damageBase: 14, title: 'The Bog Hag', sides: 7 }, {
  phases: [0.5],
  opening: { frogs: 3 },
  idle(e, dt, p) { hold(e, dt, p, 200, 300); },
  choose: (e, p, d) => [['globs', 3], ['frogs', minionCount(e) < 2 ? 1.5 : 0], ['leap', d < 380 ? 2 : 0.6]],
  moves: {
    globs: {
      cooldown: 2.6,
      start(e) { sub(e, 'wind', 0.5 * k2(e)); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'wind' && e.t <= 0) {
          const n = e.phase >= 2 ? 5 : 3;
          for (let k = 0; k < n; k++) {
            const a = rand(0, TAU), r = k === 0 ? 0 : rand(60, 150);
            lob(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, { r: 54, dmg: 0.7, color: '#8ac04a', flight: 0.9 + k * 0.08 });
          }
          sub(e, 'rest', 0.6);
        } else if (e.sub === 'rest' && e.t <= 0) idle(e, 0.5);
      },
    },
    frogs: {
      cooldown: 9,
      start(e) { sub(e, 'call', 0.8); sfx.hiss(); },
      update(e, dt, p) { if (e.t <= 0) { summon(e, 'kappa', 2, 200, p); idle(e, 0.4); } },
    },
    leap: {
      cooldown: 5,
      start(e, p) { sub(e, 'crouch', 0.4 * k2(e)); e.tx = p.x; e.ty = p.y; sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'crouch') { e.tx = p.x; e.ty = p.y; if (e.t <= 0) { sub(e, 'air', 0.55); e.x0 = e.x; e.y0 = e.y; e.invuln = true; sfx.dash(); } }
        else if (e.sub === 'air') {
          const k = clamp(1 - e.t / 0.55, 0, 1);
          e.x = e.x0 + (e.tx - e.x0) * k; e.y = e.y0 + (e.ty - e.y0) * k; e.z = Math.sin(k * Math.PI) * 140;
          if (e.t <= 0) {
            e.z = 0; e.invuln = false;
            ring(e.x, e.y, { r0: 10, r1: 105, color: '#8ac04a', life: 0.35, width: 7 });
            burst(e.x, e.y, { count: 18, color: '#4a6a3a', speed: 240, size: 5, life: 0.45, drag: 4 });
            shake(0.35); sfx.splash();
            arcHit(e, p, 105, TAU, 1);
            expose(e, 0.8);
          }
        }
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'leap') {
      const locked = e.sub === 'air';
      ctx.fillStyle = locked ? 'rgba(30,50,20,0.45)' : 'rgba(30,50,20,0.2)';
      ctx.beginPath(); ctx.ellipse(e.tx, e.ty + 8, 105, 42, 0, 0, TAU); ctx.fill();
    }
  },
});

// --- the Hierophant ----------------------------------------------------------------------------------------

const HIEROPHANT = mini({ r: 24, hp: 560, speed: 95, mass: 5, color: '#e8c050', damageBase: 14, title: 'The Hierophant', sides: 8 }, {
  phases: [0.5],
  opening: { wardens: 3 },
  idle(e, dt, p) { hold(e, dt, p, 240, 340); },
  choose: (e, p, d) => [['halo', 3], ['lance', 2.5], ['wardens', minionCount(e) < 2 ? 1.2 : 0], ['blink', d < 190 ? 3 : 0]],
  moves: {
    halo: {
      cooldown: 2.8,
      start(e) { sub(e, 'gather', 0.7 * k2(e)); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'gather' && e.t <= 0) {
          e.haloOff = (e.haloOff || 0) + 0.26;
          ringShot(e, 12, 190, e.haloOff, { color: '#ffe08a', dmg: 0.45 });
          if (e.phase >= 2) ringShot(e, 12, 150, e.haloOff + 0.26, { color: '#ffe08a', dmg: 0.45 });
          sfx.shoot();
          sub(e, 'rest', 0.5);
        } else if (e.sub === 'rest' && e.t <= 0) idle(e, 0.5);
        void p;
      },
    },
    lance: {
      cooldown: 3.4,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        spawnHazard({
          kind: 'beam', x: e.x, y: e.y, angle: e.aim, len: 620, width: 34, warn: 0.9 * k2(e), active: 0.3,
          damage: Math.round(e.damage * 1.1), color: '#ffe08a', owner: e, source: e.type,
          track: (h) => { const q = world.player; if (q && h.t < h.warn - 0.28) h.angle = angleTo(e.x, e.y, q.x, q.y); h.x = e.x; h.y = e.y; e.aim = h.angle; },
        });
        sub(e, 'cast', 1.3 * k2(e));
      },
      update(e, dt, p) { e.face = e.aim; if (e.t <= 0) idle(e, 0.5); void p; },
    },
    wardens: {
      cooldown: 10,
      start(e) { sub(e, 'call', 0.8); sfx.boon(); },
      update(e, dt, p) { if (e.t <= 0) { summon(e, 'zealot', 2, 180, p); idle(e, 0.4); } },
    },
    blink: {
      cooldown: 4.5,
      start(e) { sub(e, 'fade', 0.3); },
      update(e, dt, p) {
        if (e.sub === 'fade' && e.t <= 0) {
          burst(e.x, e.y, { count: 16, color: '#fff0c0', speed: 180, size: 4, life: 0.4, drag: 4, shape: 'spark' });
          const a = angleTo(p.x, p.y, e.x, e.y) + rand(-0.8, 0.8);
          e.x = p.x + Math.cos(a) * 330; e.y = p.y + Math.sin(a) * 330;
          if (e.leash) { const d = dist(e.x, e.y, e.leash.x, e.leash.y); if (d > e.leash.r - e.r) { e.x = e.leash.x + (e.x - e.leash.x) * (e.leash.r - e.r) / d; e.y = e.leash.y + (e.y - e.leash.y) * (e.leash.r - e.r) / d; } }
          burst(e.x, e.y, { count: 16, color: '#fff0c0', speed: 180, size: 4, life: 0.4, drag: 4, shape: 'spark' });
          idle(e, 0.5);
        }
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'halo' && e.sub === 'gather') {
      const k = 1 - e.t / 0.7;
      for (let i = 0; i < 12; i++) {
        const a = (e.haloOff || 0) + 0.26 + (i / 12) * TAU + world.runTime * 2;
        ctx.fillStyle = `rgba(255,224,138,${(0.3 + 0.6 * k).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * (60 - 30 * k), e.y + Math.sin(a) * (60 - 30 * k) * 0.6 - 30, 4, 0, TAU); ctx.fill();
      }
    }
  },
});

export const MINI_DEFS = {
  kyubi: KYUBI, sasaki: SASAKI, oni: ONI, captain: CAPTAIN, alpha: ALPHA, queen: QUEEN, hag: HAG, hierophant: HIEROPHANT,
};

export const MINI_NAMES = Object.fromEntries(Object.entries(MINI_DEFS).map(([k, d]) => [k, d.title]));

/** The mini-boss in a fight near you, for the bar at the top of the screen. */
export function miniInFight() {
  const p = world.player;
  if (!p) return null;
  let best = null, bd = 760;
  for (const e of world.enemies) {
    if (!e.mini || e.dead || e.spawning || (e.asleep && e.asleep(e))) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

