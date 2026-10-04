// ============================================================================
// SER ALDRIC THE OATHBOUND — a knight who still keeps his oath, in a moonlit
// ring of standing stones. "Draw, and let us see which oath is stronger."
//
// THE BOW (signature): he walks out and bows before the duel.
//   Don't strike him while he bows → HONOR: pure swordplay, no tricks.
//   Strike him mid-bow → OATHBROKEN: black flames and dirty tricks (thrown
//     sand that blinds, daggers, ghostly squires), but he takes +25% damage.
//   In an honorable duel grenades are dishonorable: two warnings, then he's
//     Oathbroken too.
//
// GUARD: his sword up crosswise, he turns every blow from the front. Each one
// strains his guard — enough and it BREAKS (he's wide open). Hammer it three
// times in a row and he counter-thrusts. Get behind him and it's no guard.
//
// Every move is a knight's move: thrust, overhead chop, the three-cut sweep,
// the feint, the pommel strike, dashing stabs, FINAL OATH (a charged cleave
// all around him that nearly kills — dash out, or through it on the stroke).
//
// Phase 2 at half health:
//   Honor → OATH OF THE MOON: a silver blade, moonlight crescents, the
//           five-cut Moonfall combo, and FULL MOON (the barrage).
//   Broken → THE OATH BREAKS: black flame, burning dashes, and INFERNO.
//
// The end: an honorable Aldric KNEELS at low health. Step into the light to
// SPARE him (his blessing: +1 life, full health) — or strike him to EXECUTE
// him (gold, and +15% damage for the rest of the run). An Oathbroken knight
// never kneels.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, lerp } from './util.js';
import { act, sub, idle, expose, shot, lane, inArena, turnToward, forward, spawnEnemyFn } from './boss-kit.js';
import { damagePlayer, killEnemy } from './combat.js';
import { spawnPickup } from './spawn.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';

const PI = Math.PI;
const STEEL = '#c8ccd8';
const MOON = '#e8f0ff';
const HONOR = '#4a7ad8';
const BLACK = '#2a1a2e';
const HELL = '#b04aff';
const RED = '#ff5e6e';
const GOLD = '#ffd45e';

const p2 = (e) => e.phase >= 2;
const broken = (e) => e.oath === 'broken';
const tell = (e, t) => t * (p2(e) ? 0.85 : 1);

function say(e, text, color = '#e8ecff') {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

function leadAt(e, p, speed, k = 0.5) {
  const t = dist(e.x, e.y, p.x, p.y) / speed;
  return angleTo(e.x, e.y, p.x + (e.pvx || 0) * t * k, p.y + (e.pvy || 0) * t * k);
}

function touch(e, mult) {
  const p = world.player;
  if (!p || p.dead || (e.touchCd || 0) > 0) return;
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + 16) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) e.touchCd = 0.5;
  }
}

function lunge(e, dt, speed, maxD) {
  const step = speed * dt;
  e.x += Math.cos(e.aim) * step;
  e.y += Math.sin(e.aim) * step;
  e.lungeD = (e.lungeD || 0) + step;
  const [cx, cy] = inArena(e.x, e.y, e.r + 4);
  const wall = cx !== e.x || cy !== e.y;
  e.x = cx; e.y = cy;
  return e.lungeD >= maxD || wall;
}

/** A sword arc in front: telegraph cone, then the cut lands on whoever's in it. */
function cutCone(e, arc, r, delay, mult, color) {
  return spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.face, arc, r, delay, color: color || (broken(e) ? HELL : MOON), owner: e, follow: e });
}

function cutLands(e, arc, r, mult, kb = 240) {
  const p = world.player;
  if (!p || p.dead) return;
  const d = dist(e.x, e.y, p.x, p.y);
  if (d < r + p.r * 0.5 && Math.abs(angleDiff(e.face, angleTo(e.x, e.y, p.x, p.y))) < arc / 2 + 0.1) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) {
      p.vx = (p.vx || 0) + Math.cos(e.face) * kb; p.vy = (p.vy || 0) + Math.sin(e.face) * kb;
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = e.face - arc / 2 + (k / 9) * arc;
    burst(e.x + Math.cos(a) * r * 0.8, e.y + Math.sin(a) * r * 0.8, { count: 1, color: broken(e) ? HELL : MOON, speed: 90, size: 3.5, life: 0.25, dir: a + PI / 2, spread: 0.2, drag: 4, shape: 'spark' });
  }
  sfx.swing(1.2);
}

function blastAt(e, x, y, r, delay, mult, color) {
  const [sx, sy] = inArena(x, y, 20);
  return spawnHazard({ kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color: color || (broken(e) ? HELL : MOON), source: e.type, owner: e, quiet: true });
}

function startMove(e, p, name) {
  act(e, name, 0);
  e.lastMove = name;
  const mv = ALDRIC.moves[name];
  if (mv.cooldown) e.cool[name] = mv.cooldown;
  mv.start(e, p);
}

/** He breaks his oath: black flame, dirty tricks, and he takes more damage. */
function breakOath(e, why) {
  if (broken(e)) return;
  e.oath = 'broken';
  e.vulnerable = 1.25;
  e.hpFloor = undefined;             // an Oathbroken knight never kneels
  say(e, why || 'You dishonor us both!', HELL);
  flash(0.3, HELL);
  shake(0.5);
  sfx.roar(0.8);
  burst(e.x, e.y, { count: 30, color: HELL, speed: 300, size: 5, life: 0.6, drag: 3 });
  Object.assign(e.cool, { sand: 2, daggers: 3, squires: 4 });
}

/** The guard: frontal hits are turned away; the strain can break it. */
function guardFn(e, opts, amount) {
  if (e.action === 'kneel') {
    if (e.st > 0.8) e.struck = true;
    return 0;
  }
  if (e.action !== 'guard' || e.sub !== 'hold') return 1;
  if (opts.dir === undefined) return 1;
  const from = opts.dir + PI;
  if (Math.abs(angleDiff(e.face, from)) > 1.25) return 1;           // from behind: no guard
  e.strain += amount;
  const now = world.runTime;
  e.blockLog = (e.blockLog || []).filter((t) => now - t < 1.3);
  e.blockLog.push(now);
  burst(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, { count: 6, color: '#ffffff', speed: 220, size: 3, life: 0.2, drag: 6, shape: 'spark' });
  if ((e.blockSay || -9) < now - 0.5) { e.blockSay = now; damageText(e.x, e.y - e.r - 14, 'GUARDED', { color: STEEL, size: 13 }); }
  sfx.block();
  return 0;
}

// --- the moveset --------------------------------------------------------------------

export const ALDRIC = {
  phases: [0.5],
  phaseTime: 3.2,
  roarPitch: 0.9,
  opening: { finaloath: 22, guard: 4, lunges: 3, crescent: 99, moonfall: 99, fullmoon: 99, blackflame: 99, inferno: 99, sand: 99, daggers: 99, squires: 99 },

  /** A ring of standing stones, and nothing else: a duel. */
  arena() { return []; },

  init(e) {
    e.oath = null;
    e.hpFloor = 1;              // he kneels before he dies (honor only)
    e.strain = 0;
    e.fires = [];
    e.blind = 0;
    e.moon = 0;
    e.nades = 0;
    e.seenNades = new WeakSet();
    e.face = PI / 2;
    e.guardFn = guardFn;
    act(e, 'bow', 0);
    ALDRIC.moves.bow.start(e, world.player);
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    e.blind = Math.max(0, e.blind - dt);
    if (p2(e) && e.action !== 'phase') e.moon = lerp(e.moon, 1, 1 - Math.exp(-2 * dt));
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); e.pvx = lerp(e.pvx || 0, vx, k); e.pvy = lerp(e.pvy || 0, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    // Struck mid-bow: checked here, before the brain's phase check, so even a
    // burst that takes him past half health can't leave the oath unresolved.
    if (e.action === 'bow' && e.sub === 'bow' && e.hp < e.bowHp - 0.5) {
      breakOath(e, 'You strike a bowing man?!');
      idle(e, 0.6);
    }
    const d = dist(e.x, e.y, p.x, p.y);
    e.hug = d < e.r + 80 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);
    e.far = d > 400 ? (e.far || 0) + dt : Math.max(0, (e.far || 0) - dt * 2);

    // Black fire (his burning trail): a small bite every half second.
    for (const f of e.fires) {
      f.t -= dt; f.tick -= dt;
      if (f.tick <= 0 && dist(p.x, p.y, f.x, f.y) < f.r + p.r * 0.5) { f.tick = 0.5; damagePlayer(Math.max(2, Math.round(e.damage * 0.25)), null, null, 'black flame'); }
    }
    e.fires = e.fires.filter((f) => f.t > 0);

    // Honor watches your grenades.
    if (e.oath === 'honor') {
      for (const g of world.grenades) {
        if (e.seenNades.has(g)) continue;
        e.seenNades.add(g);
        e.nades++;
        if (e.nades === 1) say(e, 'A coward’s tool…', '#ffb35e');
        else if (e.nades === 2) say(e, 'Once more, and our oath is void.', RED);
        else breakOath(e, 'So be it. No more honor!');
      }
    }

    // The honorable end: at low health he kneels (the hp floor kept him alive).
    if (e.oath === 'honor' && !e.kneeled && e.phase >= 2 && e.hp <= e.maxHp * 0.12 && e.action !== 'phase') {
      startMove(e, p, 'kneel');
    }
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 5 * dt);
    const sp = e.speed * (p2(e) ? 1.2 : 1);
    // A duellist's circling: close to striking range, step round.
    if (d > 190) forward(e, sp, dt, a);
    else if (d < 110) forward(e, -sp * 0.7, dt, a);
    forward(e, sp * 0.5, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.4) e.sign *= -1;
    [e.x, e.y] = inArena(e.x, e.y, e.r + 12);
  },

  choose(e, p, d) {
    const pool = [['thrust', 3], ['chop', 2.2], ['sweep3', 2.4], ['feint', 1.4], ['guard', 2.2], ['finaloath', 3]];
    if (e.hug > 0.4) pool.push(['pommel', 8]);
    if (e.far > 1.2 || d > 330) pool.push(['lunges', 5]);
    if (broken(e)) pool.push(['sand', 2], ['daggers', 2.4], ['squires', 1.6]);
    if (p2(e) && !broken(e)) pool.push(['crescent', 2.6], ['moonfall', 2.6], ['fullmoon', 3.6]);
    if (p2(e) && broken(e)) pool.push(['blackflame', 3], ['inferno', 3.6]);
    return pool;
  },

  // --- phase 2 ----------------------------------------------------------------------
  onPhase(e) {
    if (!e.oath) breakOath(e, 'You strike a bowing man?!');
    e.marks = {};
    say(e, broken(e) ? 'Let it all burn.' : 'By the moon, I am still sworn.', broken(e) ? HELL : MOON);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.face += dt * (k < 0.5 ? 6 : 1);
    e.moon = clamp(k * 1.2, 0, 1);
    if (Math.random() < dt * 20) burst(e.x + rand(-20, 20), e.y + rand(-20, 20), { count: 2, color: broken(e) ? HELL : MOON, speed: 160, size: 4, life: 0.5, gravity: -80, drag: 2 });
    once('raise', 0.55, () => { ring(e.x, e.y, { r0: 10, r1: 220, color: broken(e) ? HELL : MOON, life: 0.6, width: 8 }); shake(0.6); sfx.chime(); });
  },
  afterPhase(e) {
    if (broken(e)) Object.assign(e.cool, { blackflame: 2, inferno: 8 });
    else Object.assign(e.cool, { crescent: 2, moonfall: 3, fullmoon: 8 });
  },

  moves: {
    // THE BOW: walk out, bow, and see what you do.
    bow: {
      start(e) {
        e.bowHp = e.hp;
        sub(e, 'walk', 1.1);
      },
      update(e, dt, p) {
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, p.x, p.y);
          e.face = angleTo(e.x, e.y, p.x, p.y);
          if (d > 280) forward(e, e.speed * 0.6, dt, e.face);
          if (e.t <= 0) {
            say(e, 'Ser Aldric bows.', MOON);
            damageText(p.x, p.y - p.r - 30, 'Hold your blade to duel with honor', { color: MOON, size: 13 });
            sfx.chime();
            e.bowHp = e.hp;
            sub(e, 'bow', 2.4);
          }
          return;
        }
        if (e.t <= 0) {
          e.oath = 'honor';
          say(e, 'A worthy foe. En garde!', MOON);
          ring(e.x, e.y, { r0: 10, r1: 120, color: MOON, life: 0.5, width: 5 });
          idle(e, 0.6);
        }
      },
    },

    // 1. Thrust: the lane shows; a long, straight lunge.
    thrust: {
      cooldown: 1.4,
      start(e, p) {
        e.aim = leadAt(e, p, 1000, 0.5);
        e.face = e.aim;
        e.lungeD = 0;
        lane(e, tell(e, 0.45), 360, 2 * (e.r + 18), broken(e) ? HELL : MOON);
        sfx.telegraph();
        sub(e, 'wind', tell(e, 0.45));
      },
      update(e, dt) {
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') { touch(e, 0.7); if (lunge(e, dt, 1000, 330)) { e.exposed = 0.45; sub(e, 'rest', 0.35); } return; }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 2. Overhead Chop: the sword goes high (red), and comes down hard in
    //    front of him. Step aside.
    chop: {
      cooldown: 2.5,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        const ix = e.x + Math.cos(e.face) * 90, iy = e.y + Math.sin(e.face) * 90;
        e.chopH = blastAt(e, ix, iy, 88, tell(e, 0.68), 1.0, RED);
        sfx.telegraph();
        sub(e, 'raise', tell(e, 0.68));
      },
      update(e) {
        if (e.sub === 'raise') { if (e.t <= 0) { shake(0.4); sfx.thud(); e.exposed = 0.55; sub(e, 'stuck', 0.55); } return; }
        if (e.t <= 0) idle(e, 0.35);
      },
    },

    // 3. The Three Cuts: left, right, then a thrust — each arc shown first.
    sweep3: {
      cooldown: 4,
      start(e, p) {
        e.cut = 0;
        e.face = angleTo(e.x, e.y, p.x, p.y) - 0.35;
        cutCone(e, 1.9, 150, tell(e, 0.42), 0.6);
        sfx.telegraph();
        sub(e, 'cut', tell(e, 0.42));
      },
      update(e, dt, p) {
        if (e.sub === 'cut') {
          if (e.t > 0) return;
          cutLands(e, 1.9, 150, 0.6);
          forward(e, 30, 1, e.face);
          e.cut++;
          if (e.cut === 1) { e.face = angleTo(e.x, e.y, p.x, p.y) + 0.35; cutCone(e, 1.9, 150, tell(e, 0.36), 0.6); sub(e, 'cut', tell(e, 0.36)); return; }
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.face = e.aim;
          e.lungeD = 0;
          lane(e, tell(e, 0.36), 300, 2 * (e.r + 18), broken(e) ? HELL : MOON);
          sub(e, 'wind', tell(e, 0.36));
          return;
        }
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') { touch(e, 0.7); if (lunge(e, dt, 1000, 270)) { e.exposed = 0.6; sub(e, 'rest', 0.5); } return; }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 4. Feint: the chop's red tell — then he pulls it, and thrusts instead
    //    (the thrust has its own lane). Panic-dashing at the first tell gets
    //    punished; watching doesn't.
    feint: {
      cooldown: 6,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.fake = blastAt(e, e.x + Math.cos(e.face) * 90, e.y + Math.sin(e.face) * 90, 88, 5, 0, RED);
        sfx.telegraph();
        sub(e, 'raise', tell(e, 0.5));
      },
      update(e, dt, p) {
        if (e.sub === 'raise') {
          if (e.t > 0) return;
          if (e.fake) e.fake.dead = true;
          damageText(e.x, e.y - e.r - 18, 'Feint!', { color: '#ffe27a', size: 15 });
          e.aim = leadAt(e, p, 1000, 0.4);
          e.face = e.aim;
          e.lungeD = 0;
          lane(e, 0.36, 320, 2 * (e.r + 18), broken(e) ? HELL : MOON);
          sub(e, 'wind', 0.36);
          return;
        }
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') { touch(e, 0.8); if (lunge(e, dt, 1050, 300)) { e.exposed = 0.5; sub(e, 'rest', 0.4); } return; }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 5. GUARD: the sword crosswise. Frontal blows are turned away and strain
    //    the guard (the bar over him); enough strain BREAKS it. Three blocked
    //    in quick succession → a counter-thrust. Circle behind him.
    guard: {
      cooldown: 6,
      start(e) {
        e.strain = 0;
        e.blockLog = [];
        e.guardMax = e.maxHp * 0.08;
        say(e, 'Come, then.', STEEL);
        sub(e, 'hold', p2(e) ? 2.8 : 3.4);
      },
      update(e, dt, p) {
        if (e.sub === 'hold') {
          turnToward(e, angleTo(e.x, e.y, p.x, p.y), 2.4 * dt);
          forward(e, 40, dt, e.face);
          [e.x, e.y] = inArena(e.x, e.y, e.r + 12);
          if (e.strain >= e.guardMax) {
            damageText(e.x, e.y - e.r - 20, 'GUARD BROKEN', { color: '#ffe27a', size: 17 });
            burst(e.x, e.y, { count: 20, color: STEEL, speed: 300, size: 4, life: 0.45, drag: 4, shape: 'shard' });
            sfx.explode();
            expose(e, 2.2);
            return;
          }
          if (e.blockLog.length >= 3) {
            // The counter: a quick glint, then a thrust straight at you.
            e.blockLog = [];
            e.aim = angleTo(e.x, e.y, p.x, p.y);
            e.face = e.aim;
            e.lungeD = 0;
            lane(e, 0.3, 240, 2 * (e.r + 18), '#ffffff');
            sub(e, 'counter', 0.3);
            return;
          }
          if (e.t <= 0) idle(e, 0.35);
          return;
        }
        if (e.sub === 'counter') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') { touch(e, 0.8); if (lunge(e, dt, 1100, 220)) { sub(e, 'hold', 1.0); } }
      },
    },

    // 6. Pommel Strike: too close for a sword — so he clubs you back with the
    //    pommel, then thrusts.
    pommel: {
      cooldown: 3,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        cutCone(e, 1.6, 90, tell(e, 0.3), 0.5, '#ffffff');
        sub(e, 'wind', tell(e, 0.3));
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.t > 0) return;
          cutLands(e, 1.6, 90, 0.45, 360);
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          e.lungeD = 0;
          lane(e, 0.34, 300, 2 * (e.r + 18), broken(e) ? HELL : MOON);
          sub(e, 'wind2', 0.34);
          return;
        }
        if (e.sub === 'wind2') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') { touch(e, 0.65); if (lunge(e, dt, 1000, 280)) sub(e, 'rest', 0.4); return; }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 7. Dashing Stabs: keep your distance and he closes it — three stabs in
    //    a row, each lane shown.
    lunges: {
      cooldown: 6,
      start(e, p) { e.left = 3; stabNext(e, p, tell(e, 0.45)); },
      update(e, dt, p) {
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') {
          touch(e, 0.6);
          if (broken(e) && p2(e) && (e.trailT = (e.trailT || 0) - dt) <= 0) { e.trailT = 0.06; e.fires.push({ x: e.x, y: e.y, r: 30, t: 3, tick: 0 }); }
          if (lunge(e, dt, 950, 300)) {
            e.left--;
            if (e.left > 0) stabNext(e, p, 0.32);
            else { e.exposed = 0.6; sub(e, 'rest', 0.5); }
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 8. FINAL OATH (signature): he raises his blade and moonlight (or black
    //    flame) gathers — the circle round him fills — then one cleave, all
    //    the way round. It nearly kills. Get out of the circle, or dash
    //    through the stroke. Then he's spent.
    finaloath: {
      cooldown: 24,
      start(e) {
        e.cool.finaloath = p2(e) ? 18 : 24;
        const T = tell(e, 2.2);
        spawnHazard({ kind: 'blast', x: e.x, y: e.y, r: 255, delay: T, damage: Math.round(e.damage * 2.2), color: broken(e) ? HELL : MOON, source: e.type, owner: e, follow: e });
        say(e, broken(e) ? 'Burn with me!' : 'My final oath!', broken(e) ? HELL : MOON);
        sfx.chime();
        sub(e, 'charge', T);
      },
      update(e, dt) {
        if (e.sub === 'charge') {
          if (Math.random() < dt * 30) {
            const a = rand(0, TAU);
            burst(e.x + Math.cos(a) * 240, e.y + Math.sin(a) * 240, { count: 1, color: broken(e) ? HELL : MOON, speed: 260, size: 3, life: 0.6, dir: a + PI, spread: 0.1, drag: 0.5 });
          }
          if (e.t <= 0) {
            ring(e.x, e.y, { r0: 20, r1: 260, color: broken(e) ? HELL : MOON, life: 0.4, width: 10 });
            shake(0.7);
            sfx.explode();
            expose(e, 2.4);
          }
        }
      },
    },

    // KNEEL (honor only): at low health he kneels. Step into the light to
    // spare him; strike him to execute him.
    kneel: {
      start(e, p) {
        e.kneeled = true;
        e.struck = false;
        e.exposed = 0;
        e.burn = null; e.slow = null; e.stunT = 0;
        e.kneelHp = e.hp;
        const a = angleTo(e.x, e.y, p.x, p.y);
        const [sx, sy] = inArena(e.x + Math.cos(a + 0.6) * 230, e.y + Math.sin(a + 0.6) * 230, 60);
        e.spare = { x: sx, y: sy, r: 48, held: 0 };
        say(e, 'I yield. Finish it — or show mercy.', MOON);
        damageText(p.x, p.y - p.r - 30, 'Strike to execute · step into the light to spare', { color: '#ffe27a', size: 13 });
        sfx.chime();
        sub(e, 'kneel', 999);
      },
      update(e, dt, p) {
        // A direct hit (guardFn) or a blast that got through, after the grace.
        if (e.st > 0.8 && (e.struck || e.hp < e.kneelHp - 0.5)) { execute(e, p); return; }
        if (e.st <= 0.8) e.kneelHp = e.hp;
        const S = e.spare;
        if (dist(p.x, p.y, S.x, S.y) < S.r) {
          S.held += dt;
          if (S.held >= 1.0) spare(e, p);
        } else S.held = Math.max(0, S.held - dt);
      },
    },

    // --- Oathbroken tricks --------------------------------------------------------

    // Sand in the eyes: a quick throw (a cone), and if it catches you the
    // world goes dark around you for a moment.
    sand: {
      cooldown: 7,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        cutCone(e, 1.3, 220, tell(e, 0.4), 0.2, '#c9a36b');
        sub(e, 'throw', tell(e, 0.4));
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const d = dist(e.x, e.y, p.x, p.y);
        if (d < 220 + p.r * 0.5 && Math.abs(angleDiff(e.face, angleTo(e.x, e.y, p.x, p.y))) < 0.75) {
          e.blind = 2.2;
          damagePlayer(Math.round(e.damage * 0.2), e.x, e.y, e.type);
          damageText(p.x, p.y - p.r - 18, 'BLINDED', { color: '#c9a36b', size: 15 });
        }
        burst(e.x, e.y, { count: 26, color: '#c9a36b', speed: 320, size: 3, life: 0.4, dir: e.face, spread: 0.7, drag: 3 });
        sfx.swing(0.8);
        idle(e, 0.35);
      },
    },

    // Daggers: a glint, then three thrown knives in a fan.
    daggers: {
      cooldown: 4,
      start(e) { sub(e, 'wind', tell(e, 0.4)); sfx.click && sfx.click(); },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.t > 0) return;
        const a = leadAt(e, p, 520, 0.5);
        for (const k of [-0.22, 0, 0.22]) shot(e, a + k, 520, { shape: 'arrow', r: 6, color: '#d8c8e8', dmg: 0.45, life: 2 });
        sfx.shoot();
        idle(e, 0.3);
      },
    },

    // Ghostly Squires: he calls two spectral squires to fight at his side.
    squires: {
      cooldown: 12,
      start(e) { say(e, 'To me!', HELL); sfx.telegraph(); sub(e, 'call', 0.7); },
      update(e) {
        if (e.t > 0) return;
        let alive = 0;
        for (const m of world.enemies) if (m.summoner === e && !m.dead) alive++;
        for (let k = 0; k < Math.min(2, 3 - alive); k++) {
          const a = rand(0, TAU);
          const [x, y] = inArena(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, 40);
          spawnEnemyFn('wretch', x, y, { summoner: e, color: '#b8a8e8', scale: (e.scale || 1) * 0.7 });
        }
        idle(e, 0.4);
      },
    },

    // --- phase 2: OATH OF THE MOON (honor) -------------------------------------------

    // Crescent Slash: three waves of moonlight cut through the air.
    crescent: {
      cooldown: 5,
      start(e) { e.left = 3; sub(e, 'wind', tell(e, 0.42)); sfx.chime(); },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.t > 0) return;
        const a = leadAt(e, p, 260, 0.5) + (e.left === 2 ? 0.3 : e.left === 1 ? -0.3 : 0);
        for (let k = 0; k < 7; k++) shot(e, a + (k - 3) * 0.08, 260, { shape: 'orb', r: 7, color: MOON, dmg: 0.45, life: 3.5 });
        sfx.swing(1.3);
        e.left--;
        if (e.left > 0) e.t = 0.42; else idle(e, 0.4);
      },
    },

    // Moonfall: the long combo — sweep, sweep, thrust, spin, overhead. Learn it.
    moonfall: {
      cooldown: 9,
      start(e, p) { e.step = 0; moonStep(e, p); },
      update(e, dt, p) {
        if (e.sub === 'rest') { if (e.t <= 0) idle(e, 0.3); return; }
        if (e.sub === 'go') { touch(e, 0.7); if (lunge(e, dt, 1000, 260)) { e.step++; moonStep(e, p); } return; }
        if (e.t > 0) return;
        const s = e.step;
        if (s === 0 || s === 1) cutLands(e, 1.9, 150, 0.55);
        if (s === 2) { sub(e, 'go', 1); sfx.dash(); return; }
        if (s === 3) cutLands(e, TAU, 120, 0.6);
        if (s === 4) { shake(0.4); sfx.thud(); }
        e.step++;
        moonStep(e, p);
      },
    },

    // FULL MOON (phase-2 barrage, honor): he plants his sword under a full
    // moon; slow crescents of moonlight turn around him in three arms, and
    // rings of moons roll out with a gap. Then he kneels to his blade, spent.
    fullmoon: {
      cooldown: 30,
      start(e) {
        const b = arenaBounds();
        e.fm = { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, a: rand(0, TAU), v: 0, ringT: 1.0 };
        say(e, 'Under the full moon!', MOON);
        sub(e, 'walk', 1.2);
      },
      update(e, dt, p) {
        const F = e.fm;
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, F.x, F.y);
          if (d > 10) forward(e, Math.min(360, d / dt), dt, angleTo(e.x, e.y, F.x, F.y));
          if (d <= 10 || e.t <= 0) { sfx.chime(); ring(e.x, e.y, { r0: 10, r1: 200, color: MOON, life: 0.6, width: 6 }); sub(e, 'moon', 4.6); }
          return;
        }
        F.a += 0.95 * dt;
        if ((F.v -= dt) <= 0) {
          F.v = 0.15;
          for (let k = 0; k < 3; k++) shot(e, F.a + (k / 3) * TAU, 175, { shape: 'orb', r: 7, color: MOON, dmg: 0.4, life: 6 });
        }
        if ((F.ringT -= dt) <= 0) {
          F.ringT = 1.3;
          const gap = angleTo(e.x, e.y, p.x, p.y) + rand(-0.5, 0.5);
          for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; if (Math.abs(angleDiff(gap, a)) < 0.5) continue; shot(e, a, 140, { shape: 'orb', r: 6, color: '#b8c8ff', dmg: 0.35, life: 7 }); }
        }
        if (e.t <= 0) expose(e, 2.4);
      },
    },

    // --- phase 2: THE OATH BREAKS (broken) --------------------------------------------

    // Black Flame: three burning dashes; each leaves fire behind him.
    blackflame: {
      cooldown: 6,
      start(e, p) { e.left = 3; stabNext(e, p, tell(e, 0.42)); },
      update(e, dt, p) {
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') {
          touch(e, 0.7);
          if ((e.trailT = (e.trailT || 0) - dt) <= 0) { e.trailT = 0.05; e.fires.push({ x: e.x, y: e.y, r: 32, t: 3.2, tick: 0 }); }
          if (lunge(e, dt, 1000, 320)) {
            e.left--;
            if (e.left > 0) stabNext(e, p, 0.34);
            else { e.exposed = 0.6; sub(e, 'rest', 0.5); }
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // INFERNO (phase-2 barrage, broken): black-flame pillars burst out of the
    // ground in widening rings (each marked), and dark embers spiral out.
    inferno: {
      cooldown: 30,
      start(e) {
        e.inf = { wave: 0, next: 0.4, a: rand(0, TAU), v: 0 };
        say(e, 'Burn!', HELL);
        sfx.roar(0.7);
        sub(e, 'burn', 5.0);
      },
      update(e, dt) {
        const I = e.inf;
        I.a += 1.1 * dt;
        if ((I.v -= dt) <= 0) {
          I.v = 0.17;
          for (const off of [0, PI]) shot(e, I.a + off, 185, { shape: 'orb', r: 7, color: HELL, dmg: 0.4, life: 6 });
        }
        if ((I.next -= dt) <= 0 && I.wave < 5) {
          const r = 110 + I.wave * 85;
          const n = 6 + I.wave * 2;
          const off = I.wave % 2 ? PI / n : 0;
          for (let k = 0; k < n; k++) blastAt(e, e.x + Math.cos(off + (k / n) * TAU) * r, e.y + Math.sin(off + (k / n) * TAU) * r, 42, 0.75, 0.55, HELL);
          I.wave++;
          I.next = 0.9;
          sfx.telegraph();
        }
        if (e.t <= 0) expose(e, 2.4);
      },
    },
  },

  // --- drawing ------------------------------------------------------------------------

  /** A knight from above: cape, plate, tabard, plumed helm, the longsword. */
  draw(e, ctx) {
    const t = world.runTime;
    const r = e.r;
    const a = e.face || 0;
    const brk = broken(e);
    const pose = e.action === 'bow' && e.sub === 'bow' ? 'bow'
      : e.action === 'kneel' ? 'kneel'
      : e.action === 'guard' && e.sub === 'hold' ? 'guard'
      : (e.action === 'chop' || e.action === 'feint' || e.action === 'finaloath') && (e.sub === 'raise' || e.sub === 'charge') ? 'raise'
      : null;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(a);
    if (pose === 'kneel') ctx.scale(0.85, 0.85);
    // Cape.
    ctx.fillStyle = brk ? '#1a1020' : '#24408a';
    const sway = Math.sin(t * 5) * 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.85); ctx.quadraticCurveTo(-r * 1.8, -r * 0.5 + sway, -r * 1.9, sway);
    ctx.quadraticCurveTo(-r * 1.8, r * 0.5 + sway, -r * 0.2, r * 0.85); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = brk ? '#5a2a3a' : GOLD;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // His house on the cape: a white star (honor), or a burnt hole (broken).
    if (brk) {
      ctx.fillStyle = HELL;
      ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.2;
      ctx.beginPath(); ctx.arc(-r * 1.15, sway * 0.5, r * 0.28, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      star(ctx, -r * 1.15, sway * 0.5, r * 0.34, '#ffffff');
    }
    // The sword.
    ctx.save();
    if (pose === 'guard') { ctx.translate(r * 0.7, -r * 0.9); ctx.rotate(PI / 2); }
    else if (pose === 'bow' || pose === 'kneel') { ctx.translate(r * 1.0, r * 0.2); ctx.rotate(0.1); }
    else if (pose === 'raise') { ctx.translate(-r * 0.3, r * 0.5); ctx.rotate(-0.5); }
    else { ctx.translate(r * 0.3, r * 0.55); }
    const glow = e.moon > 0.1 && !brk;
    if (glow) { ctx.shadowColor = MOON; ctx.shadowBlur = 12 * e.moon; }
    ctx.fillStyle = brk ? '#3a2a44' : MOON;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(r * 2.7, -2); ctx.lineTo(r * 2.95, 0); ctx.lineTo(r * 2.7, 2); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = GOLD;
    ctx.fillRect(-2, -8, 4, 16);                 // crossguard
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(-r * 0.45, -2.5, r * 0.45, 5); // grip
    if (brk && Math.random() < 0.6) burst(e.x + Math.cos(a) * r * 1.5, e.y + Math.sin(a) * r * 1.5, { count: 1, color: HELL, speed: 30, size: 4, life: 0.4, gravity: -60, drag: 1 });
    ctx.restore();
    // Plate and tabard.
    const plate = e.flash > 0 ? '#ffffff' : (brk ? '#4a4050' : STEEL);
    ctx.fillStyle = plate;
    ctx.strokeStyle = '#1c1c26';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // Tabard over the chest.
    ctx.fillStyle = brk ? '#2a1a2e' : HONOR;
    ctx.beginPath(); ctx.ellipse(r * 0.18, 0, r * 0.55, r * 0.5, 0, -PI / 2, PI / 2); ctx.closePath(); ctx.fill();
    // Pauldrons.
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : (brk ? '#5a4a60' : '#e4e8f2');
    ctx.lineWidth = 2;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(-r * 0.05, sd * r * 0.74, r * 0.4, r * 0.32, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = brk ? '#2a1a2e' : GOLD;
      ctx.beginPath(); ctx.ellipse(-r * 0.05, sd * r * 0.74, r * 0.24, r * 0.18, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#1c1c26';
    }
    // Helm: a great helm with a cross visor.
    const hx = pose === 'bow' ? r * 0.6 : r * 0.22;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : (brk ? '#3a3040' : '#dfe3ee');
    ctx.beginPath(); ctx.arc(hx, 0, r * 0.47, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = brk ? RED : '#14141c';
    if (brk) { ctx.shadowColor = RED; ctx.shadowBlur = 8; }
    ctx.fillRect(hx + r * 0.22, -r * 0.3, r * 0.1, r * 0.6);
    ctx.fillRect(hx + r * 0.05, -r * 0.05, r * 0.38, r * 0.1);
    ctx.shadowBlur = 0;
    if (!brk) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.quadraticCurveTo(-r * 0.4, Math.sin(t * 7) * 3, -r * 1.1, Math.sin(t * 7 + 1) * 5); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();
  },

  /** The guard bar, the spare sigil, the blinding dark, and the phase banner. */
  drawExtras(e, ctx, t) {
    // The guard's strain, over him.
    if (e.action === 'guard' && e.sub === 'hold' && e.guardMax) {
      const k = clamp(e.strain / e.guardMax, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - 34, e.y - e.r - 20, 68, 6);
      ctx.fillStyle = k > 0.7 ? '#ffe27a' : STEEL;
      ctx.fillRect(e.x - 34, e.y - e.r - 20, 68 * k, 6);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, e.face - 1.25, e.face + 1.25); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // The mercy sigil while he kneels.
    if (e.spare && e.action === 'kneel') {
      const S = e.spare;
      const k = clamp(S.held / 1.0, 0, 1);
      const g = ctx.createRadialGradient(S.x, S.y, 4, S.x, S.y, S.r + 20);
      g.addColorStop(0, `rgba(232,240,255,${0.45 + Math.sin(t * 4) * 0.1})`);
      g.addColorStop(1, 'rgba(232,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(S.x, S.y, S.r + 20, 0, TAU); ctx.fill();
      ctx.strokeStyle = MOON;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(S.x, S.y, S.r, 0, TAU); ctx.stroke();
      if (k > 0) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(S.x, S.y, S.r + 6, -PI / 2, -PI / 2 + k * TAU); ctx.stroke(); }
      ctx.fillStyle = MOON;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 12px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText('SPARE', S.x, S.y);
      // And the other choice, over him (live once the grace is over).
      ctx.globalAlpha = e.st > 0.8 ? 0.7 + Math.sin(t * 6) * 0.3 : 0.35;
      ctx.fillStyle = RED;
      ctx.fillText('STRIKE TO EXECUTE', e.x, e.y - e.r - 22);
      ctx.globalAlpha = 1;
    }
    if (e.exposed > 0 && e.action !== 'kneel') {
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Sand in your eyes: darkness everywhere but right around you.
    const p = world.player;
    if (e.blind > 0 && p) {
      const b = arenaBounds();
      const k = clamp(e.blind / 0.5, 0, 1);
      const g = ctx.createRadialGradient(p.x, p.y, 70, p.x, p.y, 230);
      g.addColorStop(0, 'rgba(20,14,8,0)');
      g.addColorStop(1, `rgba(20,14,8,${0.85 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(b.l - 40, b.t - 40, b.r - b.l + 80, b.b - b.t + 80);
    }
    if (e.action === 'phase') {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      const b = arenaBounds();
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = broken(e) ? HELL : MOON;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 48px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText(broken(e) ? 'THE OATH BREAKS' : 'OATH OF THE MOON', (b.l + b.r) / 2, b.t + arena.h * 0.28);
      ctx.globalAlpha = 1;
    }
  },

  /** A moonlit duelling ring of standing stones, fireflies, and his black fire. */
  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'aldric' && !q.dead);
    const b = arenaBounds();
    const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
    const moon = e ? e.moon : 0;
    const brk = e && broken(e);
    // Night grass.
    ctx.fillStyle = 'rgba(40,80,60,0.12)';
    ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
    // A pool of moonlight in the middle (blood-red if the oath is broken).
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, arena.h * 0.55);
    const c = brk && moon > 0.3 ? '255,80,110' : '200,220,255';
    g.addColorStop(0, `rgba(${c},${0.12 + moon * 0.12})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, arena.h * 0.55, 0, TAU); ctx.fill();
    // The duelling ring, marked on the ground.
    ctx.strokeStyle = 'rgba(220,230,255,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, arena.w * 0.36, arena.h * 0.4, 0, 0, TAU); ctx.stroke();
    // Standing stones around the edge.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      const x = cx + Math.cos(a) * arena.w * 0.47, y = cy + Math.sin(a) * arena.h * 0.46;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x + 3, y + 6, 13, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a6878';
      ctx.fillRect(x - 10, y - 16, 20, 26);
      ctx.fillStyle = '#8a8898';
      ctx.fillRect(x - 10, y - 16, 20, 7);
    }
    // Fireflies.
    for (let k = 0; k < 10; k++) {
      const x = b.l + ((k * 173 + t * (12 + k)) % (b.r - b.l));
      const y = b.t + ((k * 97 + Math.sin(t * 0.7 + k) * 40 + (b.b - b.t)) % (b.b - b.t));
      ctx.globalAlpha = 0.35 + Math.sin(t * 3 + k) * 0.3;
      ctx.fillStyle = '#e8ffa0';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Black fire from his burning dashes.
    if (e) {
      for (const f of e.fires) {
        const k = clamp(f.t / 0.5, 0, 1);
        ctx.globalAlpha = 0.5 * k;
        ctx.fillStyle = BLACK;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        ctx.fillStyle = HELL;
        for (let i = 0; i < 3; i++) {
          const fx = f.x + Math.sin(t * 5 + i * 2 + f.x) * f.r * 0.5;
          ctx.beginPath(); ctx.moveTo(fx - 5, f.y + 4); ctx.lineTo(fx, f.y - 10 - Math.sin(t * 9 + i) * 4); ctx.lineTo(fx + 5, f.y + 4); ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  },
};

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.38 : r;
    const a = (i / 8) * TAU;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function stabNext(e, p, t) {
  e.aim = leadAt(e, p, 950, 0.5);
  e.face = e.aim;
  e.lungeD = 0;
  lane(e, t, 330, 2 * (e.r + 18), broken(e) ? HELL : MOON);
  sfx.telegraph();
  sub(e, 'wind', t);
}

/** Moonfall: the five cuts, each with its telegraph. */
function moonStep(e, p) {
  const s = e.step;
  if (s >= 5) { e.exposed = 0.8; sub(e, 'rest', 0.8); return; }
  e.face = angleTo(e.x, e.y, p.x, p.y) + (s === 0 ? -0.35 : s === 1 ? 0.35 : 0);
  if (s === 0 || s === 1) { cutCone(e, 1.9, 150, 0.4, 0.55); sub(e, 'cut', 0.4); }
  else if (s === 2) { e.aim = e.face; e.lungeD = 0; lane(e, 0.38, 290, 2 * (e.r + 18), MOON); sub(e, 'cut', 0.38); }
  else if (s === 3) { spawnHazard({ kind: 'blast', x: e.x, y: e.y, r: 120, delay: 0.45, damage: 0, color: MOON, source: e.type, owner: e, follow: e, quiet: true }); sub(e, 'cut', 0.45); }
  else if (s === 4) { const ix = e.x + Math.cos(e.face) * 90, iy = e.y + Math.sin(e.face) * 90; blastAt(e, ix, iy, 90, 0.55, 0.9, RED); sub(e, 'cut', 0.55); }
  sfx.telegraph();
}

/** Mercy: his blessing, and he leaves the ring. */
function spare(e, p) {
  p.lives = (p.lives || 0) + 1;
  p.hp = p.stats.maxHp;
  say(e, 'Go with honor, friend.', MOON);
  damageText(p.x, p.y - p.r - 26, 'SPARED — +1 LIFE', { color: MOON, size: 17 });
  ring(e.x, e.y, { r0: 10, r1: 160, color: MOON, life: 0.8, width: 6 });
  burst(e.x, e.y, { count: 40, color: MOON, speed: 220, size: 4, life: 0.9, gravity: -80, drag: 2 });
  sfx.boon();
  e.hpFloor = undefined;
  e.spared = true;
  killEnemy(e, {});
}

/** Execution: gold, and a darker edge for the rest of the run. */
function execute(e, p) {
  e.hpFloor = undefined;
  p.stats.damageMult *= 1.15;
  for (let k = 0; k < 14; k++) spawnPickup({ x: e.x, y: e.y, vx: rand(-220, 220), vy: rand(-220, 220), type: 'gold', value: 6 });
  damageText(p.x, p.y - p.r - 26, "OATHBREAKER'S EDGE — +15% DAMAGE", { color: RED, size: 15 });
  burst(e.x, e.y, { count: 30, color: RED, speed: 300, size: 4, life: 0.6, drag: 3 });
  flash(0.25, RED);
  shake(0.6);
  killEnemy(e, {});
}
