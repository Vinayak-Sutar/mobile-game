// ============================================================================
// THE TWIN WARDENS — Solaris the Lancer & Grumm the Hammer.
// (Inspired by Ornstein & Smough.) Two bosses, one fight.
//
//   SOLARIS — fast, slim, a golden knight with a lightning lance. Thrusts,
//             sky-dives, lightning spears, called strikes.
//   GRUMM   — huge, slow, an iron hulk with a great hammer. Slams, quakes,
//             bull-charges that smash the cathedral's pillars, belly-slams,
//             boulders.
//
// They fight as a team: Solaris leads the combos and Grumm plays his part —
// Grumm THROWS Solaris like a spear, they PINCER you from both sides, Grumm's
// crater is electrified by Solaris's spear (CRATER STORM), and JUDGMENT (the
// barrage) rakes the floor with lightning while Grumm pounds it.
//
// FRIENDLY FIRE: their slams and strikes hurt each other. Lure Grumm's hammer
// onto Solaris, or Solaris's lightning onto Grumm.
//
// PHASE 2 depends on who falls first — the survivor absorbs the fallen twin's
// power (and much of their own health back):
//   kill Solaris first → THUNDER GRUMM: faster, a charged hammer, lightning
//                        clap, a storm charge, the fallen lance hurled, and
//                        TEMPEST (spinning lightning beams).
//   kill Grumm first   → TITAN SOLARIS: giant, earth in the lance — leaps
//                        that raise rings of rock spikes, an earth-splitting
//                        thrust, a spinning sweep, and SEISMIC JUDGMENT.
//
// Cheese-proofing: hugging slow Grumm → his Hammer Sweep and Quake (and
// Solaris punishing you from range); hugging Solaris → his Lance Sweep and a
// retreat; kiting → Sky Dive, Chain Arc, spears, boulders; pillar cover →
// Grumm's charge smashes pillars (they chip under fire too); pulling one
// away → the other closes in.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, lerp } from './util.js';
import { act, sub, idle, expose, shot, lane, inArena, turnToward, forward, spawnEnemyFn } from './boss-kit.js';
import { damagePlayer, dealDamage } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import { breakCrate } from './projectiles.js';

const PI = Math.PI;
const GOLD = '#ffd45e';
const STORM = '#c58bff';
const STORM_HOT = '#f0e0ff';
const IRON = '#5a5866';
const EARTH = '#c9a36b';
const RED = '#ff5e6e';

// --- shared helpers -----------------------------------------------------------------

const mate = (e) => (e.partner && !e.partner.dead ? e.partner : null);
const busy = (e) => !!e && !['idle', 'exposed'].includes(e.action);
const p2 = (e) => e.phase >= 2;
const tell = (e, t) => t * (p2(e) ? 0.8 : 1);

function say(e, text, color = '#ffe9c0') {
  damageText(e.x, e.y - e.r - 30 - (e.z || 0), text, { color, size: 16 });
}

/** Body contact while lunging or charging. */
function touch(e, mult) {
  const p = world.player;
  if (!p || p.dead || (e.touchCd || 0) > 0) return;
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) e.touchCd = 0.6;
  }
}

/** Lunge along e.aim; true when it has gone far enough, or hit a wall. */
function lunge(e, dt, speed, maxD) {
  const step = speed * dt;
  e.x += Math.cos(e.aim) * step;
  e.y += Math.sin(e.aim) * step;
  e.lungeD = (e.lungeD || 0) + step;
  const [cx, cy] = inArena(e.x, e.y, e.r + 4);
  const wall = cx !== e.x || cy !== e.y;
  e.x = cx; e.y = cy;
  return { done: e.lungeD >= maxD || wall, wall };
}

/** Their attacks hurt each other: lure one into the other's blast. */
function friendly(e, x, y, r, frac) {
  const m = mate(e);
  if (!m || m.invuln || (m.z || 0) > 30) return;
  if (dist(m.x, m.y, x, y) < r + m.r * 0.6) {
    dealDamage(m, m.maxHp * frac, { raw: true, noCrit: true, source: 'friendly' });
    if ((m.ffAt || -9) < world.runTime - 1) {
      m.ffAt = world.runTime;
      damageText(m.x, m.y - m.r - 26, 'FRIENDLY FIRE!', { color: '#9fffcf', size: 16 });
    }
  }
}

function boltFx(x, y) {
  for (let k = 0; k < 8; k++) {
    burst(x + rand(-7, 7), y - k * 24, { count: 2, color: STORM_HOT, speed: 60, size: 3.5, life: 0.22, drag: 6, shape: 'spark' });
  }
  ring(x, y, { r0: 4, r1: 40, color: STORM, life: 0.25, width: 4 });
}

/** A lightning strike on a marked spot. */
function strike(e, x, y, r, delay, mult = 0.55) {
  const [sx, sy] = inArena(x, y, 20);
  spawnHazard({
    kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color: STORM, source: e.type, owner: e, quiet: true,
    onDetonate: (h) => { boltFx(h.x, h.y); sfx.beam(); friendly(e, h.x, h.y, h.r, 0.03); },
  });
}

/** A hammer (or rock-spike) impact on a marked spot. */
function impact(e, x, y, r, delay, mult = 0.8, o = {}) {
  const [sx, sy] = inArena(x, y, 20);
  spawnHazard({
    kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color: o.color || EARTH, source: e.type, owner: e, quiet: !!o.quiet,
    onDetonate: (h) => {
      friendly(e, h.x, h.y, h.r, o.ff ?? 0.05);
      smashPillars(h.x, h.y, h.r * 0.8);
      if (o.spikes) burst(h.x, h.y, { count: 10, color: EARTH, speed: 260, size: 5, life: 0.5, drag: 3, shape: 'shard' });
      if (o.onHit) o.onHit(h);
    },
  });
}

/** A ground ring with two gaps either side of the player, from any point. */
function ringAt(e, x, y, o = {}) {
  const p = world.player;
  const pa = p ? angleTo(x, y, p.x, p.y) : 0;
  spawnHazard({
    kind: 'shockring', x, y, r0: 20, speed: o.speed || 260, width: o.width || 18, maxR: 1400,
    damage: Math.round(e.damage * (o.dmg || 0.55)), color: o.color || EARTH, source: e.type, owner: e,
    gaps: [{ a: pa + rand(0.5, 0.9), w: o.gapW || 0.85 }, { a: pa - rand(0.5, 0.9), w: o.gapW || 0.85 }],
    wait: o.wait || 0,
  });
}

function column(e, x, warn, width = 84, mult = 0.6) {
  const b = arenaBounds();
  spawnHazard({
    kind: 'beam', x: clamp(x, b.l + 10, b.r - 10), y: b.t, angle: PI / 2, len: b.b - b.t, width, warn, active: 0.22,
    damage: Math.round(e.damage * mult), color: STORM, owner: e, source: e.type,
  });
}

function smashPillars(x, y, r) {
  if (!world.room) return;
  for (const o of [...world.room.obstacles]) {
    if (!o.crate) continue;
    const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
    if (dist(x, y, cx, cy) < r) breakCrate(o);
  }
}

function leadAt(e, p, speed, k = 0.6) {
  const t = dist(e.x, e.y, p.x, p.y) / speed;
  return angleTo(e.x, e.y, p.x + (e.pvx || 0) * t * k, p.y + (e.pvy || 0) * t * k);
}

/** A jump along an arc: e.jump = { x0, y0, x1, y1, T, t, h }. True on landing. */
function jumpStep(e, dt) {
  const J = e.jump;
  J.t += dt;
  const k = clamp(J.t / J.T, 0, 1);
  e.x = lerp(J.x0, J.x1, k);
  e.y = lerp(J.y0, J.y1, k);
  e.z = Math.sin(k * PI) * J.h;
  e.invuln = e.z > 70;
  if (k >= 1) { e.z = 0; e.invuln = false; return true; }
  return false;
}

function trackPlayer(e, p, dt) {
  if (e.ppx !== undefined && dt > 0) {
    const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
    if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); e.pvx = lerp(e.pvx || 0, vx, k); e.pvy = lerp(e.pvy || 0, vy, k); }
  }
  e.ppx = p.x; e.ppy = p.y;
}

function startMove(e, p, spec, name) {
  act(e, name, 0);
  e.lastMove = name;
  const mv = spec.moves[name];
  if (mv.cooldown) e.cool[name] = mv.cooldown;
  mv.start(e, p);
}

/** Every frame for both: upkeep, and — if the partner has fallen — the absorption. */
function commonTick(e, dt, p) {
  e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
  if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
  trackPlayer(e, p, dt);
  const d = dist(e.x, e.y, p.x, p.y);
  e.hug = d < e.r + 90 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);
  e.far = d > 420 ? (e.far || 0) + dt : Math.max(0, (e.far || 0) - dt * 2);
  // The partner has fallen: the survivor absorbs their power (the kit's
  // phase change runs next frame — `phases` of 2 always trips it).
  if (e.phase === 1 && e.partner && e.partner.dead && !e.absorbing) {
    e.absorbing = true;
    e.fallenAt = { x: e.partner.x, y: e.partner.y };
    e.phases = [2];
  }
}

/** Between moves: while the partner is mid-attack, mostly wait your turn. */
function pace(e) {
  const m = mate(e);
  if (m && busy(m) && e.t < 0.05 && Math.random() < 0.6) e.t = 0.15;
}

// ============================================================================
// SOLARIS THE LANCER
// ============================================================================

export const SOLARIS = {
  phases: [],
  phaseTime: 3.6,
  roarPitch: 1.25,
  opening: { judgment: 18, toss: 7, pincer: 10, crater: 12, dive: 3, arc: 5, seismic: 99, titanleap: 99, earthsplit: 99, spin: 99 },

  /** A cathedral nave: four stone pillars (they crack, and Grumm smashes them). */
  arena() {
    const pillar = (fx, fy) => {
      const w = 62;
      return { x: arena.x + arena.w * fx - w / 2, y: arena.y + arena.h * fy - w / 2, w, h: w, crate: true, stone: true, hp: 30, maxHp: 30 };
    };
    return [pillar(0.22, 0.3), pillar(0.78, 0.3), pillar(0.22, 0.72), pillar(0.78, 0.72)];
  },

  init(e) {
    e.vis = 1;
    e.face = PI / 2;
    // Grumm steps out beside him.
    const g = spawnEnemyFn('grumm', e.x + 150, e.y + 10, { scale: e.scale, tier: e.tier });
    g.spawning = false;
    g.damage = Math.round(g.def.damageBase * (e.damage / e.def.damageBase));
    e.x -= 110;
    e.partner = g;
    g.partner = e;
    e.craters = [];
    g.craters = e.craters;
    say(e, 'Stand, trespasser.', GOLD);
  },

  tick(e, dt, p) {
    commonTick(e, dt, p);
    for (const c of e.craters) c.t -= dt;
    e.craters = e.craters.filter((c) => c.t > 0);
    if (e.partner) e.partner.craters = e.craters;
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 8 * dt);
    const sp = e.speed * (p2(e) ? 0.9 : 1);
    if (d < 170) forward(e, -sp, dt, a);
    else if (d > 280) forward(e, sp, dt, a);
    forward(e, sp * 0.6, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.5) e.sign *= -1;
    [e.x, e.y] = inArena(e.x, e.y, e.r + 10);
    e.face = a;
    pace(e);
  },

  choose(e, p, d) {
    const g = mate(e);
    const pool = [['thrust', 3], ['spear', 2], ['arc', 2], ['dive', 1.6]];
    if (d < 280) pool.push(['triple', 2]);
    if (e.hug > 0.4) pool.push(['sweep', 8], ['retreat', 3]);
    if (e.far > 1.2) pool.push(['dive', 4], ['arc', 3], ['spear', 2]);
    if (g && !p2(e)) {
      if (!busy(g)) pool.push(['toss', 1.6], ['pincer', 2], ['crater', 1.8], ['judgment', 3.5]);
    }
    if (p2(e)) pool.push(['titanleap', 3], ['earthsplit', 3], ['spin', e.hug > 0.3 ? 8 : 1.5], ['seismic', 4]);
    return pool;
  },

  // --- phase 2: TITAN SOLARIS (Grumm fell first) -------------------------------------
  onPhase(e) {
    e.phases = [];
    e.marks = {};
    say(e, 'Brother… your strength is mine.', GOLD);
  },
  phaseAnim(e, dt, p, k) {
    absorbFx(e, k, EARTH);
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.vis = lerp(1, 1.55, clamp((k - 0.3) / 0.5, 0, 1));
    e.r = 22 * e.vis;
    once('quake', 0.55, () => { shake(0.8); sfx.explode(); ringAt(e, e.x, e.y, { dmg: 0.01, speed: 400 }); });
    once('roar', 0.85, () => { sfx.roar(0.9); flash(0.25, EARTH); });
  },
  afterPhase(e) {
    e.hp = Math.min(e.maxHp, Math.max(0, e.hp) + e.maxHp * 0.55);
    e.speed *= 0.9;
    e.titan = true;
    Object.assign(e.cool, { titanleap: 1.5, earthsplit: 3, spin: 2, seismic: 9 });
  },

  moves: {
    // 1. Lance Thrust: the lane shows, he lunges the length of it.
    thrust: {
      cooldown: 1.6,
      start(e, p) {
        e.aim = leadAt(e, p, 1050, 0.5);
        e.face = e.aim;
        e.lungeD = 0;
        e.reach = p2(e) ? 480 : 420;
        lane(e, tell(e, 0.5), e.reach + 34, 2 * (e.r + 12), GOLD);
        sfx.telegraph();
        sub(e, 'wind', tell(e, 0.5));
      },
      update(e, dt) {
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') {
          touch(e, 0.7);
          if (lunge(e, dt, 1050, e.reach).done) { e.exposed = 0.4; sub(e, 'rest', 0.35); }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 2. Triple Thrust: three short lunges that chase you, each lane shown.
    triple: {
      cooldown: 4,
      start(e, p) { e.left = 3; nextThrust(e, p, tell(e, 0.42)); },
      update(e, dt, p) {
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') {
          touch(e, 0.6);
          if (lunge(e, dt, 1000, 250).done) {
            e.left--;
            if (e.left > 0) nextThrust(e, p, 0.3);
            else { e.exposed = 0.5; sub(e, 'rest', 0.45); }
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 3. Sky Dive: he leaps out of reach and comes down on a marked circle.
    dive: {
      cooldown: 6,
      start(e, p) {
        const [tx, ty] = inArena(p.x + (e.pvx || 0) * 0.5, p.y + (e.pvy || 0) * 0.5, 60);
        e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty, T: tell(e, 1.1), t: 0, h: 200 };
        strike(e, tx, ty, 84, e.jump.T, 0.8);
        sfx.dash();
        sub(e, 'air', 9);
      },
      update(e, dt) {
        if (e.sub === 'air') {
          if (jumpStep(e, dt)) {
            shake(0.35);
            if (p2(e)) ringAt(e, e.x, e.y, { color: STORM, speed: 300 });
            e.exposed = 0.6;
            sub(e, 'land', 0.55);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 4. Lightning Spear: a line to the wall, then a crackling spear down it
    //    that bursts into sparks where it hits.
    spear: {
      cooldown: 4,
      start(e, p) {
        e.aim = leadAt(e, p, 900, 0.7);
        e.face = e.aim;
        spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: e.aim, len: 1400, width: 34, delay: tell(e, 0.55), color: STORM, owner: e });
        sfx.telegraph();
        sub(e, 'aim', tell(e, 0.55));
      },
      update(e) {
        if (e.t > 0) return;
        const pr = shot(e, e.aim, 900, { shape: 'spear', r: 8, color: STORM_HOT, dmg: 0.65, life: 2, off: e.r + 20, extra: { crateDmg: 3 } });
        if (pr) {
          pr.onExpire = (q) => {
            for (let k = 0; k < 5; k++) shot(e, Math.atan2(-q.vy, -q.vx) + (k - 2) * 0.35, 240, { x: q.x, y: q.y, off: 6, shape: 'orb', r: 6, color: STORM, dmg: 0.35 });
            boltFx(q.x, q.y);
          };
        }
        sfx.beam();
        idle(e, 0.4);
      },
    },

    // 5. Chain Arc: he raises the lance and lightning falls on marked spots
    //    around you, one after another.
    arc: {
      cooldown: 5,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        const n = p2(e) ? 7 : 5;
        const a0 = rand(0, TAU);
        strike(e, p.x + (e.pvx || 0) * 0.5, p.y + (e.pvy || 0) * 0.5, 50, tell(e, 0.62));
        for (let k = 1; k < n; k++) {
          const a = a0 + (k / (n - 1)) * TAU;
          strike(e, p.x + Math.cos(a) * 95, p.y + Math.sin(a) * 95, 46, tell(e, 0.62) + k * 0.13);
        }
        sfx.telegraph();
        sub(e, 'raise', tell(e, 0.62) + n * 0.13);
      },
      update(e) { if (e.t <= 0) idle(e, 0.35); },
    },

    // 6. Lance Sweep: crowd him and he spins the lance round him.
    sweep: {
      cooldown: 3,
      start(e) {
        spawnHazard({ kind: 'blast', x: e.x, y: e.y, r: 118, delay: tell(e, 0.42), damage: Math.round(e.damage * 0.7), color: GOLD, source: e.type, owner: e, follow: e, quiet: true, onDetonate: (h) => friendly(e, h.x, h.y, h.r, 0.03) });
        sfx.telegraph();
        sub(e, 'spin', tell(e, 0.42));
      },
      update(e, dt, p) {
        e.face += dt * 18 * (e.t < 0.2 ? 1 : 0.2);
        if (e.t > 0) return;
        sfx.swing(1.3);
        startMove(e, p, SOLARIS, 'retreat');
      },
    },

    // 7. Retreat: a quick backstep out of reach.
    retreat: {
      cooldown: 2.5,
      start(e, p) {
        e.aim = angleTo(p.x, p.y, e.x, e.y) + rand(-0.5, 0.5);
        e.lungeD = 0;
        sfx.dash();
        sub(e, 'go', 0.4);
      },
      update(e, dt) {
        burst(e.x, e.y, { count: 1, color: GOLD, speed: 40, size: 3, life: 0.2, drag: 3 });
        if (lunge(e, dt, 700, 220).done || e.t <= 0) idle(e, 0.3);
      },
    },

    // --- combos (both alive) ---------------------------------------------------

    // 8. Spear Toss: he runs to Grumm, Grumm swings, and Solaris flies across
    //    the cathedral as a living spear (the lane shows the whole way).
    toss: {
      cooldown: 14,
      start(e) {
        const g = mate(e);
        if (!g) { idle(e, 0.2); return; }
        act(g, 'combo', 8);
        say(e, 'Now, brother!', GOLD);
        sub(e, 'join', 1.4);
      },
      update(e, dt, p) {
        const g = mate(e);
        if (!g) { e.z = 0; idle(e, 0.3); return; }
        if (e.sub === 'join') {
          const a = angleTo(e.x, e.y, g.x, g.y);
          const d = dist(e.x, e.y, g.x, g.y);
          g.face = angleTo(g.x, g.y, p.x, p.y);
          if (d > g.r + e.r + 6) forward(e, 520, dt, a);
          if (d <= g.r + e.r + 10 || e.t <= 0) {
            // Grumm winds up; the lane runs from him to the far wall.
            e.x = g.x + Math.cos(g.face + PI) * (g.r * 0.4); e.y = g.y + Math.sin(g.face + PI) * (g.r * 0.4);
            e.aim = g.face;
            g.pose = 'swing';
            spawnHazard({ kind: 'lane', x: g.x, y: g.y, angle: e.aim, len: 1400, width: 2 * (e.r + 14), delay: tell(e, 0.7), color: GOLD, owner: e });
            sfx.telegraph();
            sub(e, 'wind', tell(e, 0.7));
          }
          return;
        }
        if (e.sub === 'wind') {
          e.face = e.aim;
          if (e.t <= 0) { g.pose = null; e.lungeD = 0; sfx.swing(1.5); shake(0.3); sub(e, 'fly', 2); }
          return;
        }
        if (e.sub === 'fly') {
          touch(e, 0.9);
          e.z = 18;
          if (Math.random() < 0.6) burst(e.x, e.y, { count: 1, color: STORM, speed: 60, size: 4, life: 0.3, drag: 3, shape: 'spark' });
          const r = lunge(e, dt, 1300, 1400);
          if (r.done) {
            e.z = 0;
            // He hits the wall in a burst of lightning.
            strike(e, e.x, e.y, 90, 0.01, 0.6);
            ringAt(e, e.x, e.y, { color: STORM, speed: 280 });
            shake(0.5);
            idle(g, 0.6);
            expose(e, 1.2);
          }
        }
      },
    },

    // 9. Pincer: they flank you — Grumm charges from one side, Solaris thrusts
    //    from the other, on the same line. Step off the line.
    pincer: {
      cooldown: 12,
      start(e, p) {
        const g = mate(e);
        if (!g) { idle(e, 0.2); return; }
        act(g, 'combo', 8);
        const a = angleTo(g.x, g.y, p.x, p.y);
        const [tx, ty] = inArena(p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300, 40);
        e.pin = { tx, ty };
        say(e, 'Nowhere to run.', GOLD);
        sub(e, 'flank', 1.1);
      },
      update(e, dt, p) {
        const g = mate(e);
        if (!g) { idle(e, 0.3); return; }
        if (e.sub === 'flank') {
          const d = dist(e.x, e.y, e.pin.tx, e.pin.ty);
          if (d > 10) forward(e, Math.min(620, d / dt), dt, angleTo(e.x, e.y, e.pin.tx, e.pin.ty));
          if (d <= 12 || e.t <= 0) {
            // Both lanes, aimed at where you stand.
            g.aim = angleTo(g.x, g.y, p.x, p.y);
            g.face = g.aim;
            g.pose = 'charge';
            g.lungeD = 0;
            spawnHazard({ kind: 'lane', x: g.x, y: g.y, angle: g.aim, len: 700, width: 2 * (g.r + 10), delay: tell(e, 0.8), color: RED, owner: g, follow: g });
            e.aim = angleTo(e.x, e.y, p.x, p.y);
            e.face = e.aim;
            e.lungeD = 0;
            lane(e, tell(e, 0.95), 460, 2 * (e.r + 12), GOLD);
            sfx.telegraph();
            e.pinT = 0;
            sub(e, 'both', 3);
          }
          return;
        }
        if (e.sub === 'both') {
          e.pinT += dt;
          if (e.pinT > tell(e, 0.8) && !g.pinDone) {
            touchG(g, 0.9);
            if (lunge(g, dt, 620, 700).done) { g.pinDone = true; g.pose = null; }
            smashPillars(g.x, g.y, g.r + 6);
          }
          if (e.pinT > tell(e, 0.95) && !e.pinDone) {
            touch(e, 0.7);
            if (lunge(e, dt, 1050, 460).done) e.pinDone = true;
          }
          if ((e.pinDone && g.pinDone) || e.t <= 0) {
            e.pinDone = g.pinDone = false;
            g.pose = null;
            idle(g, 0.5);
            e.exposed = 0.6;
            sub(e, 'rest', 0.5);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 10. Crater Storm: Grumm's hammer leaves a crater near you; Solaris's
    //     spear strikes it, and lightning rings roll out of it.
    crater: {
      cooldown: 13,
      start(e, p) {
        const g = mate(e);
        if (!g) { idle(e, 0.2); return; }
        act(g, 'combo', 8);
        const [cx, cy] = inArena(p.x, p.y, 60);
        e.cr = { x: cx, y: cy };
        g.face = angleTo(g.x, g.y, cx, cy);
        g.pose = 'raise';
        impact(g, cx, cy, 100, tell(e, 0.85), 0.85, { onHit: (h) => { e.craters.push({ x: h.x, y: h.y, r: 70, t: 4 }); g.pose = null; } });
        sfx.telegraph();
        sub(e, 'wait', tell(e, 0.85) + 0.35);
      },
      update(e, dt) {
        const g = mate(e);
        if (e.sub === 'wait') {
          e.face = angleTo(e.x, e.y, e.cr.x, e.cr.y);
          if (e.t <= 0) {
            spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: e.face, len: dist(e.x, e.y, e.cr.x, e.cr.y), width: 26, delay: 0.4, color: STORM, owner: e });
            sub(e, 'throw', 0.4);
          }
          return;
        }
        if (e.sub === 'throw') {
          if (e.t > 0) return;
          boltFx(e.cr.x, e.cr.y);
          sfx.beam();
          shake(0.4);
          for (let k = 0; k < 3; k++) ringAt(e, e.cr.x, e.cr.y, { color: STORM, speed: 270, wait: k * 0.45, dmg: 0.5 });
          if (g) idle(g, 0.8);
          sub(e, 'rest', 0.9);
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 11. JUDGMENT (the barrage, both alive): Solaris rises out of reach and
    //     lightning columns rake the nave in waves — the safe strips move —
    //     while Grumm pounds the floor. Then both are spent.
    judgment: {
      cooldown: 32,
      start(e) {
        const g = mate(e);
        const b = arenaBounds();
        if (g) act(g, 'combo', 9);
        e.jg = { wave: 0, next: 0.9, x0: e.x, y0: e.y, pound: 1.2 };
        e.jump = { x0: e.x, y0: e.y, x1: (b.l + b.r) / 2, y1: b.t + 60, T: 0.8, t: 0, h: 240 };
        say(e, 'Judgment!', STORM_HOT);
        sfx.roar(1.3);
        sub(e, 'rise', 0.8);
      },
      update(e, dt, p) {
        const g = mate(e);
        const b = arenaBounds();
        if (e.sub === 'rise') {
          const J = e.jump;
          J.t += dt;
          const k = clamp(J.t / J.T, 0, 1);
          e.x = lerp(J.x0, J.x1, k); e.y = lerp(J.y0, J.y1, k);
          e.z = k * 240;
          e.invuln = true;
          if (k >= 1) sub(e, 'rain', 6.9);
          return;
        }
        if (e.sub === 'rain') {
          e.z = 240;
          e.invuln = true;
          const J = e.jg;
          J.next -= dt;
          if (J.next <= 0 && J.wave < 6) {
            // Seven strips across the nave; every other one strikes, and the
            // pattern flips each wave (the strips you stood in are next).
            const n = 7, w = (b.r - b.l) / n;
            for (let k = 0; k < n; k++) if ((k + J.wave) % 2 === 0) column(e, b.l + w * (k + 0.5), 0.75, w * 0.72, 0.6);
            J.wave++;
            // 1.1 s between waves: the strip you stand in is safe until its
            // warning ends, the one beside you is safe once its strike ends —
            // ~0.9 s to cross ~175 u, easy at walking pace (268 u/s).
            J.next = 1.1;
            sfx.telegraph();
          }
          if (g && (J.pound -= dt) <= 0) {
            J.pound = 2.0;
            g.pose = 'raise';
            impact(g, g.x + Math.cos(g.face) * 60, g.y + Math.sin(g.face) * 60, 70, 0.5, 0.6, { onHit: () => { g.pose = null; } });
            ringAt(g, g.x, g.y, { wait: 0.5, dmg: 0.45, gapW: 1.15 });
          }
          if (e.t <= 0) {
            // Down he comes (a marked landing), and they're both spent.
            const [tx, ty] = inArena(p.x + rand(-120, 120), p.y + rand(-80, 80), 60);
            e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty, T: 0.75, t: 0, h: 240 };
            strike(e, tx, ty, 80, 0.75, 0.6);
            sub(e, 'fall', 9);
          }
          return;
        }
        if (e.sub === 'fall') {
          const J = e.jump;
          J.t += dt;
          const k = clamp(J.t / J.T, 0, 1);
          e.x = lerp(J.x0, J.x1, k); e.y = lerp(J.y0, J.y1, k);
          e.z = (1 - k) * 240;
          if (k >= 1) {
            e.z = 0; e.invuln = false;
            shake(0.5);
            if (g) expose(g, 2.2);
            expose(e, 2.2);
          }
        }
      },
    },

    // --- phase 2: TITAN SOLARIS --------------------------------------------------

    // 12. Titan Leap: a huge leap onto you; where he lands, rings of rock
    //     spikes burst outward (each spike marked).
    titanleap: {
      cooldown: 6,
      start(e, p) {
        const [tx, ty] = inArena(p.x + (e.pvx || 0) * 0.4, p.y + (e.pvy || 0) * 0.4, 70);
        const T = 1.15;
        e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty, T, t: 0, h: 220 };
        impact(e, tx, ty, 110, T, 1.0, { quiet: false });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + 0.2;
          impact(e, tx + Math.cos(a) * 140, ty + Math.sin(a) * 140, 36, T + 0.3, 0.55, { spikes: true, quiet: true });
          impact(e, tx + Math.cos(a + 0.39) * 230, ty + Math.sin(a + 0.39) * 230, 36, T + 0.6, 0.55, { spikes: true, quiet: true });
        }
        say(e, 'Kneel!', EARTH);
        sfx.dash();
        sub(e, 'air', 9);
      },
      update(e, dt) {
        if (e.sub === 'air') { if (jumpStep(e, dt)) { shake(0.6); e.exposed = 0.8; sub(e, 'land', 0.9); } return; }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 13. Earthsplitter: he drives the lance into the floor and a line of rock
    //     spikes tears toward you.
    earthsplit: {
      cooldown: 5,
      start(e, p) {
        e.aim = leadAt(e, p, 700, 0.4);
        e.face = e.aim;
        const n = 12;
        for (let k = 1; k <= n; k++) {
          impact(e, e.x + Math.cos(e.aim) * k * 44, e.y + Math.sin(e.aim) * k * 44, 34, tell(e, 0.55) + k * 0.05, 0.6, { spikes: true, quiet: k % 3 !== 0 });
        }
        if (p2(e)) {
          for (const s of [-0.35, 0.35]) for (let k = 2; k <= 9; k++) {
            impact(e, e.x + Math.cos(e.aim + s) * k * 44, e.y + Math.sin(e.aim + s) * k * 44, 30, tell(e, 0.75) + k * 0.05, 0.5, { spikes: true, quiet: true });
          }
        }
        sfx.telegraph();
        sub(e, 'drive', tell(e, 0.55) + 0.7);
      },
      update(e) { if (e.t <= 0) idle(e, 0.35); },
    },

    // 14. Titan Spin: the lance sweeps round him, and the ground shakes out
    //     from where he stands.
    spin: {
      cooldown: 4,
      start(e) {
        spawnHazard({ kind: 'blast', x: e.x, y: e.y, r: 150, delay: tell(e, 0.55), damage: Math.round(e.damage * 0.8), color: EARTH, source: e.type, owner: e, follow: e });
        sfx.telegraph();
        sub(e, 'spin', tell(e, 0.55));
      },
      update(e, dt) {
        e.face += dt * 14;
        if (e.t > 0) return;
        ringAt(e, e.x, e.y, { speed: 300 });
        ringAt(e, e.x, e.y, { speed: 300, wait: 0.45 });
        shake(0.4);
        idle(e, 0.5);
      },
    },

    // 15. SEISMIC JUDGMENT (phase-2 barrage): he rises; lightning columns
    //     and lines of rock spikes rake the nave. Then he crashes down, spent.
    seismic: {
      cooldown: 30,
      start(e) {
        const b = arenaBounds();
        e.jg = { wave: 0, next: 0.8 };
        e.jump = { x0: e.x, y0: e.y, x1: (b.l + b.r) / 2, y1: b.t + 60, T: 0.8, t: 0, h: 240 };
        say(e, 'The earth judges you!', EARTH);
        sfx.roar(0.9);
        sub(e, 'rise', 0.8);
      },
      update(e, dt, p) {
        const b = arenaBounds();
        if (e.sub === 'rise') {
          const J = e.jump;
          J.t += dt;
          const k = clamp(J.t / J.T, 0, 1);
          e.x = lerp(J.x0, J.x1, k); e.y = lerp(J.y0, J.y1, k);
          e.z = k * 240;
          e.invuln = true;
          if (k >= 1) sub(e, 'rain', 6.9);
          return;
        }
        if (e.sub === 'rain') {
          e.z = 240;
          e.invuln = true;
          const J = e.jg;
          J.next -= dt;
          if (J.next <= 0 && J.wave < 6) {
            if (J.wave % 2 === 0) {
              const n = 7, w = (b.r - b.l) / n;
              for (let k = 0; k < n; k++) if ((k + J.wave / 2) % 2 === 0) column(e, b.l + w * (k + 0.5), 0.8, w * 0.72, 0.6);
            } else {
              // Rock spikes rip across the floor in two lines through you.
              for (const a of [rand(0, PI), rand(0, PI) + PI / 2]) {
                for (let k = -6; k <= 6; k++) impact(e, p.x + Math.cos(a) * k * 46, p.y + Math.sin(a) * k * 46, 30, 0.7 + (k + 6) * 0.04, 0.5, { spikes: true, quiet: k % 3 !== 0 });
              }
            }
            J.wave++;
            J.next = 1.1;
            sfx.telegraph();
          }
          if (e.t <= 0) {
            const [tx, ty] = inArena(p.x + rand(-120, 120), p.y + rand(-80, 80), 70);
            e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty, T: 0.75, t: 0, h: 240 };
            impact(e, tx, ty, 100, 0.75, 0.8);
            sub(e, 'fall', 9);
          }
          return;
        }
        if (e.sub === 'fall') {
          const J = e.jump;
          J.t += dt;
          const k = clamp(J.t / J.T, 0, 1);
          e.x = lerp(J.x0, J.x1, k); e.y = lerp(J.y0, J.y1, k);
          e.z = (1 - k) * 240;
          if (k >= 1) { e.z = 0; e.invuln = false; shake(0.6); expose(e, 2.2); }
        }
      },
    },
  },

  // --- drawing --------------------------------------------------------------------------

  /** A golden knight from above: cape, pauldrons, plumed helm, the lance. */
  draw(e, ctx) {
    const t = world.runTime;
    const s = e.vis || 1;
    const r = 22 * s;
    const z = e.z || 0;
    const a = e.face || 0;
    ctx.save();
    ctx.translate(e.x, e.y - z);
    ctx.scale(1 + z / 400, 1 + z / 400);
    ctx.rotate(a);
    // Cape
    ctx.fillStyle = e.titan ? '#8a4a2a' : '#b8243a';
    const sway = Math.sin(t * 6) * 4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.8); ctx.quadraticCurveTo(-r * 1.9, -r * 0.6 + sway, -r * 2.1, sway);
    ctx.quadraticCurveTo(-r * 1.9, r * 0.6 + sway, -r * 0.2, r * 0.8); ctx.closePath(); ctx.fill();
    // Lance (extended during a thrust).
    const thrusting = e.sub === 'go' || e.sub === 'fly';
    const ext = thrusting ? r * 0.8 : 0;
    ctx.fillStyle = e.titan ? '#8a7050' : '#e8c860';
    ctx.fillRect(r * 0.2, r * 0.45, r * 3 + ext, r * 0.18);
    ctx.fillStyle = e.titan ? EARTH : '#fff4c0';
    ctx.beginPath();
    ctx.moveTo(r * 3.2 + ext + r * 0.9, r * 0.54); ctx.lineTo(r * 3.2 + ext, r * 0.3); ctx.lineTo(r * 3.2 + ext, r * 0.78); ctx.closePath(); ctx.fill();
    if (!e.titan || Math.random() < 0.5) {
      ctx.strokeStyle = STORM_HOT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let x = r * 3.2 + ext + r * 0.9, y = r * 0.54;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rand(4, 9); y += rand(-6, 6); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // Body and pauldrons.
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : (e.titan ? '#b8904a' : '#d8a830');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a4a10';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = e.titan ? '#d8b070' : '#ffd45e';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(r * 0.1, sd * r * 0.72, r * 0.36, 0, TAU); ctx.fill(); }
    if (e.titan) {
      ctx.strokeStyle = '#ffb35e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.3); ctx.lineTo(-r * 0.1, r * 0.1); ctx.lineTo(r * 0.3, -r * 0.4); ctx.moveTo(-r * 0.1, r * 0.1); ctx.lineTo(0, r * 0.6); ctx.stroke();
    }
    // Helm with a plume.
    ctx.fillStyle = '#f0d070';
    ctx.beginPath(); ctx.arc(r * 0.25, 0, r * 0.48, 0, TAU); ctx.fill();
    ctx.strokeStyle = RED;
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.55, 0); ctx.quadraticCurveTo(0, Math.sin(t * 8) * 3, -r * 0.9, Math.sin(t * 8 + 1) * 5); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#1a1206';
    ctx.fillRect(r * 0.55, -r * 0.2, r * 0.12, r * 0.4);
    ctx.restore();
  },

  drawExtras(e, ctx, t) {
    wardenExtras(e, ctx, t, e.titan ? 'TITAN SOLARIS' : null, EARTH);
  },

  /** The cathedral nave: marble tiles, a crimson runner, stained-glass light. */
  drawArena(ctx, room, t) {
    const b = arenaBounds();
    const cx = (b.l + b.r) / 2;
    const boss = world.enemies.find((q) => (q.type === 'solaris' || q.type === 'grumm') && !q.dead);
    // Marble checker.
    const tile = 64;
    for (let y = b.t, row = 0; y < b.b; y += tile, row++) {
      for (let x = b.l, col = 0; x < b.r; x += tile, col++) {
        if ((row + col) % 2) continue;
        ctx.fillStyle = 'rgba(220,210,240,0.045)';
        ctx.fillRect(x, y, Math.min(tile, b.r - x), Math.min(tile, b.b - y));
      }
    }
    // The crimson runner down the nave.
    ctx.fillStyle = 'rgba(140,20,40,0.28)';
    ctx.fillRect(cx - 70, b.t, 140, b.b - b.t);
    ctx.strokeStyle = 'rgba(255,212,94,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 70, b.t, 140, b.b - b.t);
    // A sun sigil in the middle.
    ctx.save();
    ctx.translate(cx, (b.t + b.b) / 2);
    ctx.rotate(t * 0.1);
    ctx.strokeStyle = 'rgba(255,212,94,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 54, Math.sin(a) * 54); ctx.lineTo(Math.cos(a) * 74, Math.sin(a) * 74); ctx.stroke(); }
    ctx.restore();
    // Stained-glass light falling across the floor.
    const glass = ['255,90,110', '120,170,255', '255,212,94', '170,120,255'];
    for (let k = 0; k < 4; k++) {
      const x = b.l + arena.w * (0.14 + k * 0.24);
      ctx.fillStyle = `rgba(${glass[k]},${0.06 + Math.sin(t * 0.6 + k) * 0.015})`;
      ctx.beginPath();
      ctx.moveTo(x, b.t); ctx.lineTo(x + 60, b.t); ctx.lineTo(x + 150, b.b); ctx.lineTo(x + 60, b.b);
      ctx.closePath(); ctx.fill();
    }
    // Phase 2 tint: violet thunder or amber earth.
    if (boss && boss.phase >= 2) {
      ctx.fillStyle = boss.type === 'grumm' ? 'rgba(90,40,160,0.14)' : 'rgba(150,100,40,0.14)';
      ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
    }
    // Craters left by Grumm's hammer.
    for (const q of world.enemies) {
      if ((q.type !== 'solaris' && q.type !== 'grumm') || !q.craters) continue;
      for (const c of q.craters) {
        const k = clamp(c.t / 0.6, 0, 1);
        ctx.globalAlpha = 0.5 * k;
        ctx.fillStyle = '#1a140c';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = STORM;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + t;
          ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * c.r * 0.3, c.y + Math.sin(a) * c.r * 0.3); ctx.lineTo(c.x + Math.cos(a + 0.3) * c.r, c.y + Math.sin(a + 0.3) * c.r); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
  },
};

function nextThrust(e, p, t) {
  e.aim = leadAt(e, p, 1000, 0.5);
  e.face = e.aim;
  e.lungeD = 0;
  lane(e, t, 284, 2 * (e.r + 12), GOLD);
  sfx.telegraph();
  sub(e, 'wind', t);
}

// ============================================================================
// GRUMM THE HAMMER
// ============================================================================

function touchG(g, mult) { touch(g, mult); }

export const GRUMM = {
  phases: [],
  phaseTime: 3.6,
  roarPitch: 0.55,
  opening: { charge: 5, belly: 6, quake: 3, thunderclap: 99, stormcharge: 99, lancehurl: 99, tempest: 99 },

  init(e) {
    e.face = PI / 2;
    e.pose = null;
    e.craters = [];
  },

  tick(e, dt, p) { commonTick(e, dt, p); },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 3 * dt);
    const sp = e.speed * (p2(e) ? 1.45 : 1);
    if (d > 120) forward(e, sp, dt, e.face);
    [e.x, e.y] = inArena(e.x, e.y, e.r + 8);
    pace(e);
  },

  choose(e, p, d) {
    const pool = [['boulder', 1.6]];
    if (d < 200) pool.push(['slam', 3], ['triple', 1.8], ['quake', 1.6]);
    else pool.push(['charge', 2.4], ['belly', 2], ['boulder', 1.2]);
    if (e.hug > 0.5) pool.push(['sweep', 8], ['quake', 3]);
    if (e.far > 1.5) pool.push(['charge', 3], ['boulder', 2]);
    if (p2(e)) pool.push(['thunderclap', 3], ['stormcharge', 2.6], ['lancehurl', 2.4], ['tempest', 4]);
    return pool;
  },

  // --- phase 2: THUNDER GRUMM (Solaris fell first) ------------------------------------
  onPhase(e) {
    e.phases = [];
    e.marks = {};
    e.pose = null;
    say(e, 'BROTHERRR!', STORM_HOT);
  },
  phaseAnim(e, dt, p, k) {
    absorbFx(e, k, STORM);
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.pose = k > 0.4 && k < 0.8 ? 'raise' : null;
    once('bolt', 0.6, () => { boltFx(e.x, e.y); sfx.beam(); flash(0.3, STORM); e.charged = true; });
    once('slam', 0.82, () => { shake(0.8); sfx.roar(0.5); ringAt(e, e.x, e.y, { color: STORM, dmg: 0.01, speed: 420 }); });
  },
  afterPhase(e) {
    e.hp = Math.min(e.maxHp, Math.max(0, e.hp) + e.maxHp * 0.55);
    e.charged = true;
    Object.assign(e.cool, { thunderclap: 1.5, stormcharge: 3, lancehurl: 2.5, tempest: 9 });
  },

  moves: {
    // Played by Solaris's combos: Grumm holds still, facing, and Solaris
    // moves him through the combo (a safety timer returns him to idle).
    combo: {
      start() {},
      update(e) { if (e.t <= 0) { e.pose = null; idle(e, 0.3); } },
    },

    // 1. Hammer Slam: the hammer goes up (red) and comes down in front of him
    //    (as Thunder Grumm, a lightning ring rolls out of the impact too).
    slam: {
      cooldown: 2.2,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.pose = 'raise';
        const ix = e.x + Math.cos(e.face) * (e.r + 50), iy = e.y + Math.sin(e.face) * (e.r + 50);
        // Phase 1: the impact alone. Thunder Grumm's slam also rolls a ring out.
        impact(e, ix, iy, 110, tell(e, 0.8), 1.0, { onHit: (h) => { e.pose = 'down'; if (e.charged) ringAt(e, h.x, h.y, { color: STORM }); } });
        sfx.telegraph();
        sub(e, 'wind', tell(e, 0.8) + 0.05);
      },
      update(e) {
        if (e.sub === 'wind') { if (e.t <= 0) { shake(0.45); e.exposed = 0.7; sub(e, 'stuck', 0.75); } return; }
        if (e.t <= 0) { e.pose = null; idle(e, 0.4); }
      },
    },

    // 2. Triple Slam: three slams, stepping forward each time.
    triple: {
      cooldown: 6,
      start(e, p) { e.left = 3; tripleNext(e, p, tell(e, 0.62)); },
      update(e, dt, p) {
        if (e.sub === 'step') {
          forward(e, 90, dt, e.face);
          if (e.t > 0) return;
          e.left--;
          shake(0.35);
          if (e.left > 0) tripleNext(e, p, tell(e, 0.46));
          else { e.pose = null; e.exposed = 0.9; sub(e, 'done', 0.8); }
          return;
        }
        if (e.t <= 0) idle(e, 0.4);
      },
    },

    // 3. Belly Slam: he jumps onto you (a marked landing) and bounces twice
    //    more toward you. Then he's slow to get up.
    belly: {
      cooldown: 7,
      start(e, p) { e.bounces = 3; bellyNext(e, p, 1.0, 110); sfx.dash(); },
      update(e, dt, p) {
        if (e.sub === 'air') {
          if (jumpStep(e, dt)) {
            shake(0.5);
            e.bounces--;
            if (e.bounces > 0) bellyNext(e, p, 0.7, 82);
            else { expose(e, 1.2); }
          }
        }
      },
    },

    // 4. Bull Charge: a red lane, then he charges down it — smashing any pillar
    //    in the way. If he hits the wall he's stunned: punish him.
    charge: {
      cooldown: 7,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.aim;
        e.lungeD = 0;
        e.pose = 'charge';
        spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: e.aim, len: 760, width: 2 * (e.r + 10), delay: tell(e, 0.75), color: RED, owner: e, follow: e });
        sfx.telegraph();
        say(e, 'HRRAAH!', RED);
        sub(e, 'wind', tell(e, 0.75));
      },
      update(e, dt) {
        if (e.sub === 'wind') { if (e.t <= 0) { sub(e, 'go', 2); sfx.dash(); } return; }
        if (e.sub === 'go') {
          touch(e, 0.9);
          smashPillars(e.x, e.y, e.r + 6);
          if (e.charged && (e.trailT = (e.trailT || 0) - dt) <= 0) { e.trailT = 0.09; strike(e, e.x, e.y, 34, 0.6, 0.4); }
          if (Math.random() < 0.5) burst(e.x, e.y + e.r * 0.6, { count: 1, color: EARTH, speed: 80, size: 5, life: 0.4, drag: 3 });
          const r = lunge(e, dt, e.charged ? 760 : 620, 760);
          if (r.done) {
            e.pose = null;
            if (r.wall) { shake(0.6); sfx.explode(); damageText(e.x, e.y - e.r - 20, 'STUNNED', { color: '#ffe27a', size: 16 }); expose(e, 1.4); }
            else idle(e, 0.5);
          }
        }
      },
    },

    // 5. Boulder Toss: he tears a slab from the floor and lobs it; it bursts
    //    into rock shards where it lands.
    boulder: {
      cooldown: 4,
      start(e) { e.pose = 'raise'; sfx.telegraph(); sub(e, 'rip', tell(e, 0.6)); },
      update(e, dt, p) {
        if (e.t > 0) return;
        const [tx, ty] = inArena(p.x + (e.pvx || 0) * 0.6, p.y + (e.pvy || 0) * 0.6, 40);
        spawnHazard({
          kind: 'lob', x0: e.x, y0: e.y - e.r * 0.4, x1: tx, y1: ty, flight: 0.95, r: 72, damage: Math.round(e.damage * 0.8),
          color: EARTH, source: e.type, owner: e, height: 180, shellR: 16,
          shards: { n: 7, speed: 230, color: EARTH, r: 7 }, shardShape: 'rock', shardDamage: Math.round(e.damage * 0.35),
          onDetonate: (h) => { friendly(e, h.x, h.y, h.r, 0.04); smashPillars(h.x, h.y, h.r * 0.7); },
        });
        e.pose = null;
        sfx.swing(1.4);
        idle(e, 0.5);
      },
    },

    // 6. Quake: two stomps; two rings roll out (the gaps are either side of you).
    quake: {
      cooldown: 5,
      start(e) { e.pose = 'raise'; sfx.telegraph(); sub(e, 'lift', tell(e, 0.6)); },
      update(e) {
        if (e.t > 0) return;
        ringAt(e, e.x, e.y, { color: e.charged ? STORM : EARTH });
        ringAt(e, e.x, e.y, { color: e.charged ? STORM : EARTH, wait: 0.55 });
        shake(0.5);
        e.pose = 'down';
        e.exposed = 0.5;
        idle(e, 0.8);
      },
    },

    // 7. Hammer Sweep: crowd him and the hammer swings round in front.
    sweep: {
      cooldown: 3,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.pose = 'raise';
        spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.face, arc: 2.4, r: 170, delay: tell(e, 0.55), color: RED, owner: e });
        sfx.telegraph();
        sub(e, 'wind', tell(e, 0.55));
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const d = dist(e.x, e.y, p.x, p.y);
        if (d < 170 + p.r * 0.5 && Math.abs(angleDiff(e.face, angleTo(e.x, e.y, p.x, p.y))) < 1.2) {
          if (damagePlayer(Math.round(e.damage * 0.85), e.x, e.y, e.type)) { p.vx = (p.vx || 0) + Math.cos(e.face) * 320; p.vy = (p.vy || 0) + Math.sin(e.face) * 320; }
        }
        friendly(e, e.x + Math.cos(e.face) * 100, e.y + Math.sin(e.face) * 100, 110, 0.05);
        sfx.swing(1.6);
        shake(0.3);
        e.pose = null;
        idle(e, 0.45);
      },
    },

    // --- phase 2: THUNDER GRUMM ----------------------------------------------------

    // 8. Thunderclap: a slam that calls three lightning rings and strikes
    //    around you.
    thunderclap: {
      cooldown: 6,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.pose = 'raise';
        sfx.telegraph();
        sub(e, 'wind', tell(e, 0.7));
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        if (e.sub === 'wind') {
          boltFx(e.x, e.y);
          for (let k = 0; k < 3; k++) ringAt(e, e.x, e.y, { color: STORM, speed: 320, wait: k * 0.35, dmg: 0.5 });
          for (let k = 0; k < 6; k++) { const a = rand(0, TAU), r = rand(80, 200); strike(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 44, 0.6 + k * 0.1); }
          shake(0.6);
          e.pose = 'down';
          e.exposed = 0.6;
          sub(e, 'rest', 0.7);
          return;
        }
        e.pose = null;
        idle(e, 0.4);
      },
    },

    // 9. Storm Charge: the charge, and lightning falls along his trail behind him.
    stormcharge: {
      cooldown: 7,
      start(e, p) { GRUMM.moves.charge.start(e, p); },
      update(e, dt, p) { GRUMM.moves.charge.update(e, dt, p); },
    },

    // 10. Lance Hurl: he throws his fallen brother's lance — a line to the
    //     wall, then the spear, which bursts into a ring of sparks.
    lancehurl: {
      cooldown: 6,
      start(e, p) {
        e.aim = leadAt(e, p, 950, 0.7);
        e.face = e.aim;
        e.pose = 'raise';
        spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: e.aim, len: 1400, width: 36, delay: tell(e, 0.6), color: STORM, owner: e });
        say(e, 'FOR SOLARIS!', STORM_HOT);
        sfx.telegraph();
        sub(e, 'aim', tell(e, 0.6));
      },
      update(e) {
        if (e.t > 0) return;
        const pr = shot(e, e.aim, 950, { shape: 'spear', r: 9, color: STORM_HOT, dmg: 0.75, life: 2, off: e.r + 20, extra: { crateDmg: 99 } });
        if (pr) pr.onExpire = (q) => { for (let k = 0; k < 10; k++) shot(e, (k / 10) * TAU, 210, { x: q.x, y: q.y, off: 8, shape: 'orb', r: 6, color: STORM, dmg: 0.35 }); boltFx(q.x, q.y); };
        sfx.beam();
        e.pose = null;
        idle(e, 0.4);
      },
    },

    // 11. TEMPEST (phase-2 barrage): he plants the hammer and four lightning
    //     beams spin out from it — slowly — with strikes falling round the
    //     nave. Walk with the beams. Then he's spent.
    tempest: {
      cooldown: 30,
      start(e) {
        const b = arenaBounds();
        e.tp = { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, strikes: 0.8 };
        say(e, 'STORM!', STORM_HOT);
        sfx.roar(0.5);
        sub(e, 'walk', 1.2);
      },
      update(e, dt, p) {
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, e.tp.x, e.tp.y);
          if (d > 10) forward(e, Math.min(420, d / dt), dt, angleTo(e.x, e.y, e.tp.x, e.tp.y));
          if (d <= 10 || e.t <= 0) {
            e.pose = 'raise';
            const spin = Math.random() < 0.5 ? 0.75 : -0.75;
            const a0 = rand(0, TAU);
            for (let k = 0; k < 4; k++) {
              spawnHazard({ kind: 'beam', x: e.x, y: e.y, angle: a0 + (k / 4) * TAU, len: 1500, width: 26, warn: 1.0, active: 4.0, spin, damage: Math.round(e.damage * 0.7), color: STORM, owner: e, follow: e, source: e.type });
            }
            sfx.telegraph();
            sub(e, 'storm', 5.0);
          }
          return;
        }
        if ((e.tp.strikes -= dt) <= 0) {
          e.tp.strikes = 0.7;
          const a = rand(0, TAU), r = rand(120, 320);
          strike(e, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 48, 0.7, 0.5);
        }
        if (e.t <= 0) { e.pose = null; expose(e, 2.2); }
      },
    },
  },

  /** An iron hulk from above: plated bulk, a slit visor, the great hammer. */
  draw(e, ctx) {
    const t = world.runTime;
    const r = e.r;
    const z = e.z || 0;
    const a = e.face || 0;
    ctx.save();
    ctx.translate(e.x, e.y - z);
    ctx.scale(1 + z / 400, 1 + z / 400);
    ctx.rotate(a);
    // The hammer: at his side, raised overhead, or slammed down in front.
    const pose = e.pose;
    ctx.save();
    if (pose === 'raise') { ctx.translate(-r * 0.2, r * 0.2); ctx.rotate(-0.4); }
    else if (pose === 'down') { ctx.translate(r * 0.6, 0); }
    else if (pose === 'swing' || pose === 'charge') { ctx.translate(r * 0.2, r * 0.6); ctx.rotate(0.9); }
    else { ctx.translate(0, r * 0.85); ctx.rotate(0.35); }
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(0, -4, r * 1.5, 8);
    ctx.fillStyle = e.charged ? '#6a4a9a' : '#3a3844';
    ctx.fillRect(r * 1.3, -r * 0.5, r * 0.75, r * 1.0);
    ctx.strokeStyle = e.charged ? STORM : '#1a1822';
    ctx.lineWidth = 3;
    ctx.strokeRect(r * 1.3, -r * 0.5, r * 0.75, r * 1.0);
    if (e.charged) {
      ctx.strokeStyle = STORM_HOT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let x = r * 1.3, y = rand(-r * 0.5, r * 0.5);
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += r * 0.2; y = rand(-r * 0.6, r * 0.6); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
    // Body: iron plates.
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : IRON;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#22202a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#7a7888';
    ctx.lineWidth = 2;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + Math.abs(k) * 0.08), -0.9 + k * 0.25, -0.7 + k * 0.25); ctx.stroke(); }
    ctx.fillStyle = '#8a8898';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(-r * 0.1, sd * r * 0.7, r * 0.34, 0, TAU); ctx.fill(); }
    // Head with a slit visor; eyes glow.
    ctx.fillStyle = '#44424e';
    ctx.beginPath(); ctx.arc(r * 0.45, 0, r * 0.36, 0, TAU); ctx.fill();
    ctx.fillStyle = e.charged ? STORM : '#ff9a4d';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillRect(r * 0.62, -r * 0.18, r * 0.08, r * 0.36);
    ctx.shadowBlur = 0;
    ctx.restore();
    void t;
  },

  drawExtras(e, ctx, t) {
    wardenExtras(e, ctx, t, e.charged ? 'THUNDER GRUMM' : null, STORM);
  },
};

function tripleNext(e, p, t) {
  e.face = angleTo(e.x, e.y, p.x, p.y);
  e.pose = 'raise';
  const ix = e.x + Math.cos(e.face) * (e.r + 70), iy = e.y + Math.sin(e.face) * (e.r + 70);
  impact(e, ix, iy, 95, t, 0.8, { onHit: () => { e.pose = 'down'; } });
  sfx.telegraph();
  sub(e, 'step', t);
}

function bellyNext(e, p, T, r) {
  const [tx, ty] = inArena(p.x + (e.pvx || 0) * 0.3, p.y + (e.pvy || 0) * 0.3, e.r + 10);
  e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty, T: T * (p2(e) ? 0.85 : 1), t: 0, h: 150 };
  impact(e, tx, ty, r, e.jump.T, 0.9);
  sub(e, 'air', 9);
}

/** The phase change: the fallen twin's power streams into the survivor. */
function absorbFx(e, k, color) {
  e.invuln = true;
  const f = e.fallenAt;
  if (f && k < 0.75 && Math.random() < 0.8) {
    const q = Math.random();
    burst(lerp(f.x, e.x, q), lerp(f.y, e.y, q) - Math.sin(q * PI) * 60, { count: 2, color, speed: 60, size: 5, life: 0.4, drag: 2 });
  }
  if (Math.random() < 0.3) ring(e.x, e.y, { r0: e.r, r1: e.r * 2, color, life: 0.3, width: 3 });
}

/** Exposed ring and the phase-2 banner, for either twin. */
function wardenExtras(e, ctx, t, banner, color) {
  if (e.exposed > 0 && !(e.z > 20)) {
    ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (e.action === 'phase') {
    const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
    const b = arenaBounds();
    ctx.globalAlpha = Math.sin(k * PI);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 50px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(e.type === 'grumm' ? 'THUNDER GRUMM' : 'TITAN SOLARIS', (b.l + b.r) / 2, b.t + arena.h * 0.28);
    ctx.globalAlpha = 1;
  }
  void banner;
}
