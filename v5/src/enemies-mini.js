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
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { stepToward, stepAway, strafe } from './ai.js';
import { spawnHazard } from './hazards.js';
import {
  sub, idle, expose, bossInit, runBoss, fanShot, ringShot, shockwave, lob, minionCount, spawnEnemyFn,
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

const KYUBI = mini({ r: 26, hp: 560, speed: 150, mass: 5, color: '#ff9a3a', damageBase: 14, title: 'Kyubi, the Nine-Tailed', sides: 9 }, {
  phases: [0.5],
  opening: { illusion: 4 },
  idle(e, dt, p) { hold(e, dt, p, 200, 320); },
  choose: (e, p, d) => [['foxfire', 3], ['illusion', minionCount(e) < 2 ? 2 : 0], ['sweep', d < 300 ? 3 : 1]],
  moves: {
    foxfire: {
      cooldown: 2.2,
      start(e, p) { sub(e, 'wind', 0.55 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
          if (e.t <= 0) {
            const n = e.phase >= 2 ? 7 : 5;
            for (let k = 0; k < n; k++) foxfire(e, e.aim + (k / (n - 1) - 0.5) * 1.3, { dmg: 0.55, homing: 0.9 });
            sfx.shoot();
            sub(e, 'rest', 0.5);
          }
        } else if (e.t <= 0) idle(e, 0.7);
      },
    },
    illusion: {
      cooldown: 8,
      start(e) { sub(e, 'wind', 0.6); sfx.whirr(); },
      update(e, dt, p) {
        if (e.t > 0) return;
        // Copies of her round you, and she is one of them.
        const n = e.phase >= 2 ? 3 : 2;
        const spots = [];
        for (let k = 0; k <= n; k++) { const a = rand(0, TAU) + (k / (n + 1)) * TAU; spots.push([p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240]); }
        burst(e.x, e.y, { count: 18, color: '#ffd8a0', speed: 200, size: 4, life: 0.5, drag: 4 });
        [e.x, e.y] = spots[0];
        for (const [x, y] of spots.slice(1)) {
          const c = spawnEnemyFn('foxclone', x, y, { instant: true, summoner: e });
          if (c) { c.r = e.r; c.leash = e.leash; c.look = 'kyubi'; c.life = 8; }
        }
        idle(e, 0.6);
      },
    },
    sweep: {
      cooldown: 3.2,
      start(e, p) { sub(e, 'crouch', 0.45 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'crouch') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
          if (e.t <= 0) { sub(e, 'dash', 0.3); sfx.dash(); }
        } else if (e.sub === 'dash') {
          dashStep(e, dt, 720);
          if (e.t <= 0) {
            ring(e.x, e.y, { r0: 10, r1: 115, color: '#ff9a3a', life: 0.3, width: 8 });
            arcHit(e, p, 115, TAU, 1);
            sub(e, 'recover', 0.55);
          }
        } else if (e.t <= 0) { if (e.phase < 2) expose(e, 0.8); else idle(e, 0.4); }
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'sweep' && e.sub === 'crouch') {
      ctx.fillStyle = 'rgba(255,154,58,0.18)';
      ctx.beginPath(); ctx.arc(e.x + Math.cos(e.aim) * 216, e.y + Math.sin(e.aim) * 216, 115, 0, TAU); ctx.fill();
    }
  },
});

// --- Sasaki, the Wandering Blade -------------------------------------------------------------------

const IAI = 380;
const SASAKI = mini({ r: 22, hp: 520, speed: 150, mass: 4, color: '#8ab0e8', damageBase: 16, title: 'Sasaki, the Wandering Blade', sides: 5 }, {
  phases: [0.5],
  opening: { parry: 6 },
  idle(e, dt, p) { hold(e, dt, p, 150, 240); },
  choose: (e, p, d) => [['iaido', 3], ['combo', d < 180 ? 4 : 0], ['wave', d > 180 ? 2 : 0.5], ['parry', e.phase >= 2 ? 1.5 : 0]],
  moves: {
    iaido: {
      cooldown: 3,
      start(e, p) { e.draws = e.phase >= 2 ? 2 : 1; sub(e, 'stance', 0.8 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'stance') {
          if (e.t > 0.24) e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          if (e.t <= 0) { sub(e, 'dash', 0.16); e.hit = false; e.x0 = e.x; e.y0 = e.y; sfx.swing(1.3); }
        } else if (e.sub === 'dash') {
          dashStep(e, dt, IAI / 0.16);
          const mx = (e.x0 + e.x) / 2, my = (e.y0 + e.y) / 2, len = Math.hypot(e.x - e.x0, e.y - e.y0) + e.r * 2;
          if (!e.hit && circleOrientedRect(p.x, p.y, p.r, mx, my, e.aim, len, 26)) { e.hit = true; damagePlayer(Math.round(e.damage * 1.2), e.x0, e.y0, e.type); }
          if (e.t <= 0) {
            burst(e.x, e.y, { count: 10, color: '#e8f0ff', speed: 200, size: 3, life: 0.3, drag: 5, shape: 'spark' });
            e.draws--;
            if (e.draws > 0) { sub(e, 'stance', 0.45); } else sub(e, 'sheathe', 0.7);
          }
        } else if (e.t <= 0) expose(e, 0.9);
      },
    },
    combo: {
      cooldown: 2.4,
      start(e, p) { e.cuts = 3; sub(e, 'wind', 0.3 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
          stepToward(e, p.x, p.y, 60, dt);
          if (e.t <= 0) { sub(e, 'cut', 0.16); arcHit(e, p, 100, 2.2, 0.8); sfx.swing(0.9); e.cutSide = -(e.cutSide || 1); }
        } else if (e.sub === 'cut') {
          if (e.t <= 0) { e.cuts--; if (e.cuts > 0) sub(e, 'wind', 0.2 * k2(e)); else idle(e, 0.6); }
        }
      },
    },
    wave: {
      cooldown: 3.8,
      start(e, p) { sub(e, 'wind', 0.5 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); },
      update(e, dt, p) {
        e.face = e.aim;
        if (e.sub === 'wind' && e.t <= 0) {
          fanShot(e, e.phase >= 2 ? 3 : 1, 0.55, e.aim, 360, { shape: 'shard', r: 12, dmg: 0.75, color: '#cfe4ff' });
          sfx.swing(1.1);
          sub(e, 'rest', 0.4);
        } else if (e.sub === 'rest' && e.t <= 0) idle(e, 0.5);
        void p;
      },
    },
    parry: {
      cooldown: 7,
      start(e) {
        sub(e, 'guard', 1.1);
        damageText(e.x, e.y - 60, 'COUNTER STANCE', { color: '#bfe0ff', size: 14 });
        e.guardFn = (self) => {
          // Struck while he glows: the blow is turned, and he answers.
          if (self.sub !== 'guard') return 1;
          self.guardFn = null;
          sub(self, 'counter', 0.12);
          sfx.block();
          return 0;
        };
      },
      update(e, dt, p) {
        if (e.sub === 'guard') { e.face = angleTo(e.x, e.y, p.x, p.y); if (e.t <= 0) { e.guardFn = null; idle(e, 0.4); } }
        else if (e.sub === 'counter' && e.t <= 0) {
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          ring(e.x, e.y, { r0: 10, r1: 160, color: '#bfe0ff', life: 0.25, width: 6 });
          arcHit(e, p, 160, TAU, 1.3);
          idle(e, 0.6);
        }
      },
    },
  },
  under(e, ctx) {
    if (e.action === 'iaido' && e.sub === 'stance') {
      const locked = e.t <= 0.24;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.aim);
      ctx.fillStyle = locked ? 'rgba(200,225,255,0.55)' : 'rgba(200,225,255,0.18)'; ctx.fillRect(0, -13, IAI + e.r, 26);
      ctx.restore();
    }
    if (e.action === 'parry' && e.sub === 'guard') {
      ctx.strokeStyle = 'rgba(190,224,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14 + Math.sin(world.runTime * 12) * 2, 0, TAU); ctx.stroke();
    }
  },
});

// --- the Oni Warlord ---------------------------------------------------------------------------------

const ONI = mini({ r: 32, hp: 700, speed: 95, mass: 9, color: '#d84a3a', damageBase: 18, title: 'The Oni Warlord', sides: 6 }, {
  phases: [0.5],
  idle(e, dt, p) { hold(e, dt, p, 90, 140, e.phase >= 2 ? 1.35 : 1); },
  choose: (e, p, d) => [['smash', 3], ['sweep', d < 190 ? 3 : 0], ['charge', d > 220 ? 2.5 : 0.3]],
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
    charge: {
      cooldown: 5,
      start(e, p) { sub(e, 'aim', 0.6 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'aim') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
          if (e.t <= 0) { sub(e, 'rush', 0.9); sfx.dash(); e.hit = false; }
        } else if (e.sub === 'rush') {
          dashStep(e, dt, 560);
          if (!e.hit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6) { e.hit = damagePlayer(e.damage, e.x, e.y, e.type); }
          if (e.t <= 0) expose(e, 0.9);
        }
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
    if (e.action === 'charge' && e.sub === 'aim') {
      ctx.strokeStyle = 'rgba(255,120,80,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 500, e.y + Math.sin(e.aim) * 500); ctx.stroke();
    }
  },
});

// --- the Bone Captain ---------------------------------------------------------------------------------

function captainGuard(e, opts) {
  if (e.action !== 'idle' || opts.dir === undefined) return 1;
  if (Math.abs(angleDiff(e.face || 0, opts.dir + Math.PI)) > 1.1) return 1;
  if ((e.blockSay || -9) < world.runTime - 0.6) { e.blockSay = world.runTime; damageText(e.x, e.y - 60, 'GUARDED', { color: '#e8e0cc', size: 13 }); }
  sfx.block();
  return 0.15;
}
const CAPTAIN = mini({ r: 24, hp: 540, speed: 115, mass: 6, color: '#d8d0bc', damageBase: 14, title: 'The Bone Captain', sides: 6 }, {
  phases: [0.5],
  opening: { raise: 3 },
  init(e) { e.guardFn = captainGuard; },
  idle(e, dt, p) { hold(e, dt, p, 90, 150); },
  choose: (e, p, d) => [['combo', d < 170 ? 4 : 0], ['rush', d > 150 ? 2.5 : 0.5], ['raise', minionCount(e) < 3 ? 1.5 : 0]],
  moves: {
    combo: {
      cooldown: 2.2,
      start(e, p) { e.cuts = 3; sub(e, 'wind', 0.32 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; stepToward(e, p.x, p.y, 50, dt);
          if (e.t <= 0) { sub(e, 'cut', 0.16); arcHit(e, p, 95, 2, 0.8); sfx.swing(0.8); e.cutSide = -(e.cutSide || 1); }
        } else if (e.t <= 0) { e.cuts--; if (e.cuts > 0) sub(e, 'wind', 0.22 * k2(e)); else expose(e, 0.6); }
      },
    },
    rush: {
      cooldown: 3.8,
      start(e, p) { sub(e, 'aim', 0.5 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'aim') { e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; if (e.t <= 0) { sub(e, 'go', 0.5); e.hit = false; sfx.dash(); } }
        else if (e.sub === 'go') {
          dashStep(e, dt, 540);
          if (!e.hit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 8) e.hit = damagePlayer(e.damage, e.x, e.y, e.type);
          if (e.t <= 0) idle(e, 0.6);
        }
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
    if (e.action === 'rush' && e.sub === 'aim') {
      ctx.strokeStyle = 'rgba(232,224,204,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 300, e.y + Math.sin(e.aim) * 300); ctx.stroke();
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
  choose: (e, p, d) => [['fan', 3], ['smoke', 1.5], ['knives', d < 260 ? 3 : 0.5]],
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
    knives: {
      cooldown: 3,
      start(e, p) { e.dashes = 2; sub(e, 'wind', 0.35 * k2(e)); e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); },
      update(e, dt, p) {
        if (e.sub === 'wind') { e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; if (e.t <= 0) { sub(e, 'dash', 0.22); e.hit = false; sfx.swing(0.8); } }
        else if (e.sub === 'dash') {
          dashStep(e, dt, 640);
          if (!e.hit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6) e.hit = damagePlayer(e.damage, e.x, e.y, e.type);
          if (e.t <= 0) { e.dashes--; if (e.dashes > 0) sub(e, 'wind', 0.25); else expose(e, 0.7); }
        }
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

