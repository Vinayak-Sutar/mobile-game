// ============================================================================
// DEADEYE VESPER, THE LAST BULLET — a gunslinger ghost who never left the
// square where she lost her last duel. Theatrical, cool, deadly precise.
//
// The fight is a rhythm you learn by counting: her revolver holds SIX shots
// (the pips around her). Every shot spends one; when the cylinder is empty she
// must RELOAD, and a reload is your punish window. Phase 2 ("Sundown", at half
// health) she tosses her hat, draws a second gun (twelve shots), the sky turns
// to dusk and three new moves appear.
//
// EVERY move is gunplay (the owner's rule for her): revolvers, a sawed-off,
// a Winchester, a flare gun, trick shots and gunsmoke.
//
// Cheese-proofing (each strategy has an answer):
//   hugging her        → Pistol Whip (then a point-blank shot), the Coach Gun,
//                        a Quick-Draw Roll away; a burst of damage in idle
//                        makes her roll out.
//   kiting at range    → the Winchester (rifle rounds that punch through
//                        crates), Ricochets, Coin trick-shots, Flare Gun.
//   hiding behind cover→ crates BREAK; Ricochets and coins shoot around them,
//                        flares land on them, rifle rounds go through them.
//   circling on autopilot → she LEADS her aimed shots; High Noon's line turns
//                        faster than you can circle, so dash on the bell.
//
// Moves: Quick Draw, Fan the Hammer, Ricochet, Flare Gun, Quick-Draw Roll,
// Winchester, Coach Gun, Pistol Whip, Coin Shot, High Noon (signature),
// Deadeye (phase-1 barrage), Reload (forced) — and in phase 2: Gunsmoke
// (hidden shots from all around), Dance (shots at your feet), Sundown (the
// twin-gun barrage). Every move keeps the fairness rules in boss-kit.js.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, lerp, circleRect } from './util.js';
import { act, sub, idle, expose, shot, turnToward, forward, inArena } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import { breakCrate } from './projectiles.js';
import { WESTERN_THEME } from './music-western.js';
import { GULCH_ARENA, drawGulch, gulchDust } from './arena-gulch.js';

const PI = Math.PI;
const BRASS = '#ffd27a';
const GOLD = '#ffb35e';
const DUSK = '#ff5e6e';
const SMOKE = '#d8d0c8';
const WHITE_HOT = '#fff3c0';
const RICO_SPEED = 400;
const RIFLE_SPEED = 780;   // the planner and the shot must use the same speed

// --- small helpers ------------------------------------------------------------

const p2 = (e) => e.phase >= 2;
/** Phase 2 winds up a little faster (never below readable). */
const tell = (e, t) => t * (p2(e) ? 0.82 : 1);

function say(e, text, color = '#ffe9c0') {
  damageText(e.x, e.y - e.r - 34, text, { color, size: 16 });
}

/** A revolver shot. Spends a bullet from the cylinder unless `free`. */
function fire(e, a, speed, o = {}) {
  if (!o.free) e.ammo = Math.max(0, e.ammo - 1);
  const x = o.x ?? e.x, y = o.y ?? e.y;
  const pr = shot(e, a, speed, {
    x, y, off: o.off ?? e.r + 8, shape: o.shape || 'bullet', r: o.r || 5,
    color: o.color || BRASS, dmg: o.dmg ?? 0.5, life: o.life || 3, extra: o.extra,
  });
  const mx = x + Math.cos(a) * ((o.off ?? e.r + 8) + 4), my = y + Math.sin(a) * ((o.off ?? e.r + 8) + 4);
  burst(mx, my, { count: 6, color: WHITE_HOT, speed: 260, size: 3, life: 0.14, dir: a, spread: 0.5, drag: 6, shape: 'spark' });
  burst(mx, my, { count: 2, color: SMOKE, speed: 40, size: 6, life: 0.5, drag: 2 });
  if (!o.quiet) sfx.gunshot();
  e.recoil = 0.12;
  return pr;
}

/** How far a straight line goes before a wall (or, if asked, cover). */
function rayLen(x, y, a, max = 1400, cover = true) {
  const b = arenaBounds();
  const obs = cover && world.room ? world.room.obstacles : [];
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let d = 0; d < max; d += 8) {
    const px = x + ca * d, py = y + sa * d;
    if (px < b.l || px > b.r || py < b.t || py > b.b) return d;
    if (d > 30 && obs.some((o) => px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h)) return d;
  }
  return max;
}

function losBlocked(x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  return rayLen(x1, y1, angleTo(x1, y1, x2, y2), d) < d - 12;
}

function freeAt(x, y, pad = 30) {
  const b = arenaBounds();
  if (x < b.l + pad || x > b.r - pad || y < b.t + pad || y > b.b - pad) return false;
  return !(world.room && world.room.obstacles.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad));
}

/**
 * Where a ricochet goes: the same wall and pillar physics as projectiles.js,
 * stepped at the same rate, so the drawn path is the path.
 */
function simulate(x, y, a, speed, r, bounces, life) {
  const b = arenaBounds();
  let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
  const pts = [{ x, y }];
  const dt = 1 / 60;
  for (let t = 0; t < life; t += dt) {
    x += vx * dt;
    y += vy * dt;
    let hit = false;
    if (x < b.l + r) { x = b.l + r; vx = Math.abs(vx); hit = true; }
    if (x > b.r - r) { x = b.r - r; vx = -Math.abs(vx); hit = true; }
    if (y < b.t + r) { y = b.t + r; vy = Math.abs(vy); hit = true; }
    if (y > b.b - r) { y = b.b - r; vy = -Math.abs(vy); hit = true; }
    if (world.room) {
      for (const o of world.room.obstacles) {
        if (!circleRect(x, y, r, o)) continue;
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        const dx = (x - cx) / (o.w / 2 + r), dy = (y - cy) / (o.h / 2 + r);
        if (Math.abs(dx) > Math.abs(dy)) { vx = Math.sign(dx) * Math.abs(vx); x = cx + Math.sign(dx) * (o.w / 2 + r + 1); }
        else { vy = Math.sign(dy) * Math.abs(vy); y = cy + Math.sign(dy) * (o.h / 2 + r + 1); }
        hit = true;
        break;
      }
    }
    if (hit) {
      pts.push({ x, y, bounce: true });
      if (bounces-- <= 0) return pts;
    }
  }
  pts.push({ x, y });
  return pts;
}

/** Shortest distance from a point to a polyline, skipping its first segment. */
function pathMiss(pts, px, py, skipFirst = true) {
  let best = Infinity;
  for (let i = skipFirst ? 1 : 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const L = vx * vx + vy * vy || 1;
    const k = clamp(((px - a.x) * vx + (py - a.y) * vy) / L, 0, 1);
    best = Math.min(best, dist(px, py, a.x + vx * k, a.y + vy * k));
  }
  return best;
}

/** Pick a bank shot whose bounces pass through the player. */
function planRicochet(e, p, bounces, mirror = 0) {
  let bestA = angleTo(e.x, e.y, p.x, p.y) + PI / 2, bestMiss = Infinity, bestPts = null;
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * TAU;
    const sx = e.x + Math.cos(a) * (e.r + 8), sy = e.y + Math.sin(a) * (e.r + 8);
    const pts = simulate(sx, sy, a, RICO_SPEED, 5, bounces, 4);
    if (pts.length < 3) continue;
    if (pathMiss([pts[0], pts[1]], p.x, p.y, false) < 110) continue;   // a bank shot, not a straight one
    let miss = pathMiss(pts, p.x, p.y);
    if (mirror && Math.abs(angleDiff(a, mirror)) < 0.8) miss += 200;  // the second path comes from elsewhere
    if (miss < bestMiss) { bestMiss = miss; bestA = a; bestPts = pts; }
  }
  if (!bestPts) {
    const sx = e.x + Math.cos(bestA) * (e.r + 8), sy = e.y + Math.sin(bestA) * (e.r + 8);
    bestPts = simulate(sx, sy, bestA, RICO_SPEED, 5, bounces, 4);
  }
  return { a: bestA, pts: bestPts };
}

/**
 * A deadeye leads her target: aim where the player will be when the bullet
 * arrives (`k` of a full lead). The locked sight line shows exactly where the
 * shot goes, so changing direction or dashing still beats it — only running
 * in a straight line on autopilot doesn't.
 */
function leadAngle(e, p, fromX, fromY, speed, k = 0.9, extra = 0) {
  const t = dist(fromX, fromY, p.x, p.y) / speed + extra;
  return angleTo(fromX, fromY, p.x + (e.pvx || 0) * t * k, p.y + (e.pvy || 0) * t * k);
}

function addLine(e, o) {
  const l = { x: e.x, y: e.y, a: 0, t: 1, T: 1, color: BRASS, w: 1.5, locked: false, cover: true, ...o };
  e.lines.push(l);
  return l;
}

/** Dynamite and High Noon smash the crates they reach. */
function smashCrates(x, y, r) {
  if (!world.room) return;
  for (const o of [...world.room.obstacles]) {
    if (!o.crate) continue;
    const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
    if (dist(x, y, cx, cy) < r) { o.hp -= 4; o.hitAt = world.runTime; if (o.hp <= 0) breakCrate(o); }
  }
}

function startMove(e, p, name) {
  act(e, name, 0);
  e.lastMove = name;
  const mv = VESPER.moves[name];
  if (mv.cooldown) e.cool[name] = mv.cooldown;
  mv.start(e, p);
}

function reload(e) {
  e.reloadPending = true;
  sfx.click();
  say(e, ['Reload.', 'Hold still.', 'Six for six.', 'Click.'][(Math.random() * 4) | 0]);
  expose(e, p2(e) ? 0.8 : 1.1);
}

function crate(fx, fy) {
  const w = 58;
  return { x: arena.x + arena.w * fx - w / 2, y: arena.y + arena.h * fy - w / 2, w, h: w, crate: true, hp: 6, maxHp: 6 };
}

// --- the moveset --------------------------------------------------------------------

export const VESPER = {
  // Her own music: "The Last Bullet", a spaghetti western (music-western.js).
  music: WESTERN_THEME,
  // Dust Gulch: the frontier town square, alive with wind (arena-gulch.js).
  arenaTick: GULCH_ARENA.tick,
  phases: [0.5],
  phaseTime: 3.4,
  roarPitch: 1.3,
  opening: { highnoon: 7, deadeye: 15, rifle: 4, fan: 2, coin: 3, roulette: 99, dance: 99, sundown: 99 },

  /** A sun-bleached square: four crates for cover (they break). */
  arena() {
    return [crate(0.2, 0.34), crate(0.8, 0.34), crate(0.3, 0.74), crate(0.7, 0.74)];
  },

  init(e) {
    e.ammoMax = 6;
    e.ammo = 6;
    e.guns = 1;
    e.hat = true;
    e.lines = [];
    e.paths = [];
    e.coins = [];
    e.tracers = [];
    e.rifle = false;
    e.smoke = null;
    e.dusk = 0;
    e.noon = 0;
    e.noonTarget = 0;
    e.hug = 0;
    e.far = 0;
    e.cover = 0;
    e.hpPrev = e.hp;
    e.dmgRecent = 0;
    e.bellSwing = 0;
    e.recoil = 0;
    e.face = PI / 2;
    say(e, 'Six shots, partner.');
  },

  // Every frame: telegraph upkeep, reading the player, the reactive roll.
  tick(e, dt, p) {
    e.recoil = Math.max(0, e.recoil - dt);
    e.bellSwing *= Math.exp(-2.2 * dt);
    e.noon = lerp(e.noon, e.noonTarget, 1 - Math.exp(-5 * dt));
    if (p2(e) && e.action !== 'phase') e.dusk = lerp(e.dusk, 1, 1 - Math.exp(-2 * dt));
    for (const l of e.lines) l.t -= dt;
    e.lines = e.lines.filter((l) => l.t > 0);
    for (const tr of e.tracers) tr.t -= dt;
    e.tracers = e.tracers.filter((tr) => tr.t > 0);
    if (e.pathT > 0) { e.pathT -= dt; if (e.pathT <= 0) e.paths = []; }
    if (e.smoke) { e.smoke.t -= dt; if (e.smoke.t <= 0) e.smoke = null; }
    if (e.hatFly) { e.hatFly.t += dt; if (e.hatFly.t > 2.5) e.hatFly = null; }
    for (const c of e.coins) {
      c.t += dt;
      if (c.t < c.flight) { const k = c.t / c.flight; c.x = lerp(c.x0, c.tx, k); c.y = lerp(c.y0, c.ty, k) - Math.sin(k * PI) * 60; }
      else { c.x = c.tx; c.y = c.ty; }
    }
    if (e.reloadPending && e.action !== 'exposed') { e.ammo = e.ammoMax; e.reloadPending = false; sfx.click(); }

    // The player's running velocity (smoothed; dashes ignored), for leading shots.
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) {
        const k = 1 - Math.exp(-8 * dt);
        e.pvx = lerp(e.pvx || 0, vx, k);
        e.pvy = lerp(e.pvy || 0, vy, k);
      }
    }
    e.ppx = p.x; e.ppy = p.y;

    // Read the player: hugging, kiting far away, or hiding behind cover.
    const d = dist(e.x, e.y, p.x, p.y);
    e.hug = d < 110 ? e.hug + dt : Math.max(0, e.hug - dt * 2);
    e.far = d > 390 ? e.far + dt : Math.max(0, e.far - dt * 2);
    e.cover = !e.hidden && losBlocked(e.x, e.y, p.x, p.y) ? e.cover + dt : Math.max(0, e.cover - dt * 2);

    // A burst of damage while she's between moves: she rolls out of it.
    const lost = Math.max(0, (e.hpPrev ?? e.hp) - e.hp);
    e.hpPrev = e.hp;
    e.dmgRecent = e.dmgRecent * Math.exp(-dt) + lost;
    if (e.action === 'idle' && e.dmgRecent > e.maxHp * 0.045 && (e.cool.roll || 0) <= 0 && !e.hidden) {
      e.dmgRecent = 0;
      startMove(e, p, 'roll');
    }
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 7 * dt);
    const sp = e.speed * (p2(e) ? 1.15 : 1);
    // Hold a duelling distance, circling like a gunfighter.
    if (d < 190) forward(e, -sp, dt, a);
    else if (d > 330) forward(e, sp, dt, a);
    forward(e, sp * 0.55, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.4) e.sign *= -1;
    [e.x, e.y] = inArena(e.x, e.y, e.r + 12);
    e.face = a;
  },

  choose(e, p, d) {
    if (e.ammo <= 0) return [['reload', 1]];
    const pool = [['quickdraw', 3.5], ['ricochet', 2], ['coin', 1.6], ['flare', 1.4], ['highnoon', 4], ['rifle', 1.2]];
    if (e.ammo >= 3) pool.push(['fan', 2.6]);
    if (d < 210) pool.push(['coach', 3.4], ['roll', 1.5]);
    if (e.hug > 0.4 && d < 100) pool.push(['whip', 10]);
    if (e.far > 1.3) pool.push(['rifle', 7], ['ricochet', 2], ['coin', 2]);
    if (e.cover > 0.8) pool.push(['flare', 5], ['coin', 4], ['ricochet', 3], ['rifle', 3]);
    if (!p2(e)) pool.push(['deadeye', 4]);
    else pool.push(['sundown', 4.5], ['roulette', 2.6], ['dance', 2.4]);
    return pool;
  },

  // --- phase 2: Sundown -----------------------------------------------------------
  onPhase(e) {
    e.lines = []; e.paths = []; e.coins = []; e.tracers = [];
    e.rifle = false; e.smoke = null; e.hidden = false;
    e.noonTarget = 0;
    e.phaseMarks = {};
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.phaseMarks[key]) { e.phaseMarks[key] = true; fn(); } };
    e.face = angleTo(e.x, e.y, p.x, p.y);
    if (k < 0.15) { e.x -= Math.cos(e.face) * 30 * dt; e.y -= Math.sin(e.face) * 30 * dt; }
    once('hat', 0.15, () => {
      e.hat = false;
      e.hatFly = { x: e.x, y: e.y, t: 0, spin: rand(-8, 8) };
      burst(e.x, e.y, { count: 10, color: '#e8e8f0', speed: 160, size: 3, life: 0.5, drag: 3 });
      sfx.dash();
    });
    e.dusk = clamp((k - 0.15) / 0.5, 0, 1);
    once('bell1', 0.35, () => { sfx.bell(); e.bellSwing = 1; });
    once('bell2', 0.6, () => { sfx.bell(); e.bellSwing = 1; });
    once('gun', 0.72, () => {
      e.guns = 2;
      burst(e.x, e.y, { count: 16, color: BRASS, speed: 260, size: 3, life: 0.4, drag: 5, shape: 'spark' });
      sfx.click();
    });
    once('line', 0.86, () => say(e, 'Sundown.', DUSK));
  },
  afterPhase(e) {
    e.ammoMax = 12;
    e.ammo = 12;
    e.cool.sundown = 6;
    e.cool.roulette = 3;
    e.cool.dance = 1.5;
    e.cool.highnoon = 9;
    // Fresh cover drops in for the second act, so the square is never bare.
    if (world.room) {
      const crates = world.room.obstacles.filter((o) => o.crate).length;
      const spots = [[0.5, 0.3], [0.15, 0.62], [0.85, 0.62], [0.5, 0.82]];
      for (const [fx, fy] of spots) {
        if (world.room.obstacles.filter((o) => o.crate).length >= Math.max(3, crates + 2)) break;
        const c = crate(fx, fy);
        const pl = world.player;
        if (pl && circleRect(pl.x, pl.y, pl.r + 20, c)) continue;
        if (circleRect(e.x, e.y, e.r + 20, c)) continue;
        if (world.room.obstacles.some((o) => circleRect(c.x + c.w / 2, c.y + c.h / 2, 60, o))) continue;
        world.room.obstacles.push(c);
        burst(c.x + c.w / 2, c.y + c.h / 2, { count: 16, color: '#c9a36b', speed: 200, size: 4, life: 0.5, drag: 4 });
      }
    }
  },

  moves: {
    // 1. Quick Draw: a tracking sight line that LOCKS, a glint, one fast shot.
    //    Phase 2: a second shot from the off-hand right after.
    quickdraw: {
      cooldown: 0.7,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.qd = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5 });
        e.shots2 = p2(e) ? 2 : 1;            // a double tap; a triple at dusk
        sub(e, 'aim', tell(e, 0.52));
      },
      update(e, dt, p) {
        const l = e.qd;
        l.x = e.x; l.y = e.y;
        if (e.t > 0.18) { turnToward(e, leadAngle(e, p, e.x, e.y, 700, 0.9, e.t), 5 * dt); e.aim = e.face; }
        else if (!l.locked) { l.locked = true; l.w = 2.5; l.color = WHITE_HOT; }
        l.a = e.aim;
        if (e.t <= 0) {
          fire(e, e.aim, 700, { dmg: 0.6 });
          l.t = 0;
          if (e.shots2 > 0 && e.ammo > 0) {
            e.shots2--;
            e.aim = leadAngle(e, p, e.x, e.y, 700);
            e.qd = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5 });
            sub(e, 'aim', 0.32);
          } else idle(e, 0.28);
        }
      },
    },

    // 2. Fan the Hammer: the whole cylinder in a sweeping fan (phase 2: both
    //    guns sweep across each other in an X). Empties her gun → a reload.
    fan: {
      cooldown: 7,
      start(e, p) {
        e.aim = leadAngle(e, p, e.x, e.y, 320, 0.5, 0.62);
        e.fanN = e.ammo;
        e.fanK = 0;
        spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.aim, arc: 1.25, r: 520, delay: tell(e, 0.52), color: GOLD, owner: e });
        sfx.telegraph();
        sub(e, 'wind', tell(e, 0.52));
      },
      update(e, dt) {
        if (e.sub === 'wind') {
          if (e.t <= 0) sub(e, 'fan', 0);
          return;
        }
        if (e.t > 0) return;
        const arc = 1.25;
        const perGun = e.guns > 1 ? Math.ceil(e.fanN / 2) : e.fanN;
        const k = e.fanK;
        const f = perGun > 1 ? k / (perGun - 1) : 0.5;
        fire(e, e.aim - arc / 2 + arc * f, 360, { dmg: 0.5, quiet: k % 2 === 1 });
        if (e.guns > 1 && e.ammo > 0) fire(e, e.aim + arc / 2 - arc * f, 360, { dmg: 0.5, quiet: true });
        e.fanK++;
        e.t = 0.08;
        if (e.fanK >= perGun || e.ammo <= 0) { e.ammo = 0; idle(e, 0.3); }
      },
    },

    // 3. Ricochet: a bank shot off the walls and crates. The whole path,
    //    bounces and all, is drawn before she fires. Phase 2: two paths.
    ricochet: {
      cooldown: 6,
      start(e, p) {
        const bounces = p2(e) ? 3 : 2;
        // Fired from exactly where it was planned, so the drawn path is the path.
        e.rico = [{ ...planRicochet(e, p, bounces), x0: e.x, y0: e.y }];
        if (p2(e) && e.ammo >= 2) e.rico.push({ ...planRicochet(e, p, bounces, e.rico[0].a), x0: e.x, y0: e.y });
        e.paths = e.rico.map((r) => r.pts);
        e.pathT = 9;
        e.face = e.rico[0].a;
        sfx.telegraph();
        sub(e, 'aim', tell(e, 0.85));
      },
      update(e) {
        if (e.t > 0) return;
        const bounces = p2(e) ? 3 : 2;
        for (const r of e.rico) fire(e, r.a, RICO_SPEED, { x: r.x0, y: r.y0, dmg: 0.6, life: 4, extra: { bounces } });
        e.pathT = 0.35;
        idle(e, 0.4);
      },
    },

    // 4. Flare Gun: a flare fired high, landing where you're heading — the
    //    landing is marked. It bursts in a blast that smashes crates: her
    //    answer to cover. Phase 2: two flares (one on you, one ahead of you),
    //    each bursting into shrapnel.
    flare: {
      cooldown: 6,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        sfx.telegraph();
        sub(e, 'raise', tell(e, 0.42));
      },
      update(e, dt, p) {
        if (Math.random() < dt * 40) {
          burst(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r - 10, { count: 1, color: '#ff5e3d', speed: 90, size: 2.5, life: 0.25, drag: 3, shape: 'spark' });
        }
        if (e.t > 0) return;
        const vx = e.pvx || 0, vy = e.pvy || 0;
        const targets = p2(e) ? [[p.x, p.y], [p.x + vx * 1.1, p.y + vy * 1.1]] : [[p.x + vx * 0.7, p.y + vy * 0.7]];
        for (const [tx0, ty0] of targets) {
          const [tx, ty] = inArena(tx0, ty0, 40);
          spawnHazard({
            kind: 'lob', x0: e.x, y0: e.y - e.r * 0.3, x1: tx, y1: ty, flight: 0.9,
            r: 86, damage: Math.round(e.damage * 0.8), color: '#ff5e3d', source: e.type, owner: e,
            height: 230, shellR: 7,
            shards: p2(e) ? { n: 8, speed: 210, color: BRASS, r: 6 } : null, shardShape: 'orb',
            shardDamage: Math.round(e.damage * 0.35),
            onDetonate: (h) => smashCrates(h.x, h.y, h.r),
          });
        }
        // The flare pistol: a pop and a red streak straight up.
        burst(e.x, e.y - e.r, { count: 10, color: '#ff5e3d', speed: 320, size: 3, life: 0.35, dir: -PI / 2, spread: 0.3, drag: 3, shape: 'spark' });
        sfx.gunshot();
        idle(e, 0.3);
      },
    },

    // 5. Quick-Draw Roll: a dodge-roll sideways (untouchable while rolling),
    //    then a snap shot on landing. Also her answer to a burst of damage.
    roll: {
      cooldown: 4,
      start(e, p) {
        const a = angleTo(e.x, e.y, p.x, p.y);
        let side = e.sign;
        const test = (s) => freeAt(e.x + Math.cos(a + s * PI / 2) * 200, e.y + Math.sin(a + s * PI / 2) * 200, 30);
        if (!test(side)) side = -side;
        e.rollA = a + side * PI / 2 + (dist(e.x, e.y, p.x, p.y) < 160 ? -side * 0.5 : 0);
        e.rollShots = p2(e) ? 3 : 2;
        gulchDust(e.x, e.y + e.r * 0.6, 9, 110);
        sub(e, 'tuck', 0.16);
      },
      update(e, dt, p) {
        if (e.sub === 'tuck') { if (e.t <= 0) { sub(e, 'roll', 0.32); e.invuln = true; sfx.dash(); } return; }
        if (e.sub === 'roll') {
          forward(e, 640, dt, e.rollA);
          [e.x, e.y] = inArena(e.x, e.y, e.r + 12);
          if (e.t <= 0) {
            e.invuln = false;
            gulchDust(e.x, e.y + e.r * 0.6, 7, 80);
            if (e.ammo > 0) {
              e.aim = angleTo(e.x, e.y, p.x, p.y);
              e.qd = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5 });
              sub(e, 'snap', 0.34);
            } else idle(e, 0.3);
          }
          return;
        }
        // snap: a short line that locks, then the shot.
        const l = e.qd;
        l.x = e.x; l.y = e.y;
        if (e.t > 0.14) { turnToward(e, leadAngle(e, p, e.x, e.y, 680, 0.8, e.t), 5 * dt); e.aim = e.face; } else { l.locked = true; l.color = WHITE_HOT; l.w = 2.5; }
        l.a = e.aim;
        if (e.t <= 0) {
          fire(e, e.aim, 680, { dmg: 0.6 });
          l.t = 0;
          e.rollShots--;
          if (e.rollShots > 0 && e.ammo > 0) {
            e.aim = angleTo(e.x, e.y, p.x, p.y);
            e.qd = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5 });
            sub(e, 'snap', 0.3);
          } else idle(e, 0.4);
        }
      },
    },

    // 6. Winchester: keep your distance and she shoulders a long rifle.
    //    Lever-action: three rounds (four at dusk), each with its own
    //    tracking line that locks, then a heavy round that punches straight
    //    THROUGH crates. The lines ignore cover, as the rounds do.
    rifle: {
      cooldown: 8,
      start(e, p) {
        e.rifle = true;
        e.rifleShots = p2(e) ? 4 : 3;
        say(e, 'Too far, partner.');
        sfx.click();
        e.aim = leadAngle(e, p, e.x, e.y, RIFLE_SPEED, 0.9, 0.6);
        e.rl = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5, color: DUSK, cover: false, alpha: 0.6 });
        sub(e, 'aim', tell(e, 0.62));
      },
      update(e, dt, p) {
        const l = e.rl;
        l.x = e.x; l.y = e.y;
        if (e.sub === 'aim') {
          if (e.t > 0.16) { turnToward(e, leadAngle(e, p, e.x, e.y, RIFLE_SPEED, 0.9, e.t), 4.5 * dt); e.aim = e.face; }
          else if (!l.locked) { l.locked = true; l.color = WHITE_HOT; l.w = 2.5; }
          l.a = e.aim;
          if (e.t > 0) return;
          fire(e, e.aim, RIFLE_SPEED, { dmg: 0.75, r: 6, free: true, color: WHITE_HOT, life: 1.8, off: e.r + 22, extra: { pierceCover: true } });
          shake(0.22);
          l.t = 0;
          e.rifleShots--;
          if (e.rifleShots > 0) { sub(e, 'lever', p2(e) ? 0.14 : 0.2); sfx.click(); }
          else { e.rifle = false; idle(e, 0.34); }
          return;
        }
        if (e.sub === 'lever' && e.t <= 0) {
          e.aim = leadAngle(e, p, e.x, e.y, RIFLE_SPEED, 0.9, 0.42);
          e.rl = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5, color: DUSK, cover: false, alpha: 0.6 });
          sub(e, 'aim', tell(e, 0.42));
        }
      },
    },

    // 7. Coach Gun: a sawed-off. A locked cone on the floor, then a wall of
    //    pellets at close range. Her answer to being crowded.
    coach: {
      cooldown: 4,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.aim;
        spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.aim, arc: 1.0, r: 280, delay: tell(e, 0.42), color: DUSK, owner: e });
        sfx.telegraph();
        sub(e, 'brace', tell(e, 0.42));
      },
      update(e) {
        if (e.t > 0) return;
        for (let k = 0; k < 11; k++) {
          fire(e, e.aim - 0.5 + (k / 10) * 1.0 + rand(-0.03, 0.03), 500, { dmg: 0.4, life: 0.56, r: 5, free: true, quiet: k > 0, color: '#ffe0b0' });
        }
        sfx.explode();
        shake(0.3);
        forward(e, -60, 1, e.aim);        // the kick of it shoves her back
        [e.x, e.y] = inArena(e.x, e.y, e.r + 12);
        idle(e, 0.4);
      },
    },

    // 8. Pistol Whip: crowd her and she clubs you away with the gun butt,
    //    then shoots you while you're still reeling (the line shows first).
    //    Phase 2: two shots.
    whip: {
      cooldown: 2.4,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        sub(e, 'wind', 0.26);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.t > 0) return;
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < e.r + p.r + 38 && Math.abs(angleDiff(e.face, angleTo(e.x, e.y, p.x, p.y))) < 1.3) {
            if (damagePlayer(Math.round(e.damage * 0.55), e.x, e.y, e.type)) {
              p.vx = (p.vx || 0) + Math.cos(e.face) * 300;
              p.vy = (p.vy || 0) + Math.sin(e.face) * 300;
            }
          }
          burst(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, { count: 12, color: BRASS, speed: 240, size: 3, life: 0.3, drag: 4, shape: 'spark' });
          sfx.hit(1);
          e.whipShots = p2(e) ? 2 : 1;
          if (e.ammo > 0) {
            e.aim = leadAngle(e, p, e.x, e.y, 700, 0.6, 0.3);
            e.qd = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5 });
            sub(e, 'snap', 0.3);
          } else idle(e, 0.3);
          return;
        }
        const l = e.qd;
        l.x = e.x; l.y = e.y;
        if (e.t > 0.14) { turnToward(e, leadAngle(e, p, e.x, e.y, 700, 0.6, e.t), 5 * dt); e.aim = e.face; }
        else { l.locked = true; l.color = WHITE_HOT; l.w = 2.5; }
        l.a = e.aim;
        if (e.t <= 0) {
          fire(e, e.aim, 700, { dmg: 0.55 });
          l.t = 0;
          e.whipShots--;
          if (e.whipShots > 0 && e.ammo > 0) {
            e.aim = leadAngle(e, p, e.x, e.y, 700, 0.6, 0.26);
            e.qd = addLine(e, { a: e.aim, t: 9, T: 9, w: 1.5 });
            sub(e, 'snap', 0.26);
          } else idle(e, 0.3);
        }
      },
    },

    // 9. Coin Toss: a coin flips into the air beside you; she shoots it and
    //    the bullet ricochets off the coin at you, around any cover. The line
    //    from the coin is drawn first. Phase 2: three coins, chained.
    coin: {
      cooldown: 8,
      start(e, p) {
        e.coins = [];
        const n = p2(e) ? 3 : 2;
        const base = angleTo(p.x, p.y, e.x, e.y) + (Math.random() < 0.5 ? 1 : -1) * rand(1.3, 1.9);
        for (let k = 0; k < n; k++) {
          let placed = null;
          for (let tries = 0; tries < 14 && !placed; tries++) {
            const a = base + k * 1.9 + rand(-0.4, 0.4);
            const r = rand(170, 240);
            const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            if (freeAt(x, y, 30)) placed = { x, y };
          }
          if (!placed) { const [x, y] = inArena(p.x + rand(-160, 160), p.y + rand(-140, 140), 40); placed = { x, y }; }
          e.coins.push({ x0: e.x, y0: e.y, x: e.x, y: e.y, tx: placed.x, ty: placed.y, t: -k * 0.08, flight: 0.45 });
        }
        sfx.click();
        sub(e, 'flip', 0.75);
      },
      update(e, dt, p) {
        if (e.sub === 'flip') {
          if (e.t <= 0) {
            // She shoots the first coin; each coin passes it to the next.
            e.coinK = 0;
            e.coinFrom = { x: e.x, y: e.y };
            e.ammo = Math.max(0, e.ammo - 1);
            sfx.gunshot();
            sub(e, 'chain', 0);
          }
          return;
        }
        if (e.sub === 'chain') {
          if (e.t > 0) return;
          const c = e.coins[e.coinK];
          if (!c) { idle(e, 0.3); return; }
          e.tracers.push({ x1: e.coinFrom.x, y1: e.coinFrom.y, x2: c.x, y2: c.y, t: 0.2 });
          burst(c.x, c.y, { count: 8, color: BRASS, speed: 220, size: 3, life: 0.25, drag: 5, shape: 'spark' });
          sfx.click();
          e.coinFrom = { x: c.x, y: c.y };
          c.spent = true;
          e.coinK++;
          if (e.coinK < e.coins.length) { e.t = 0.14; return; }
          // The last coin aims at you: the line is locked, then the shot.
          e.coinA = leadAngle(e, p, c.x, c.y, 640, 0.7, 0.42);
          e.coinLine = addLine(e, { x: c.x, y: c.y, a: e.coinA, t: 0.42, T: 0.42, w: 2, color: WHITE_HOT, locked: true });
          sub(e, 'last', 0.42);
          return;
        }
        if (e.sub === 'last' && e.t <= 0) {
          const c = e.coinFrom;
          fire(e, e.coinA, 640, { x: c.x, y: c.y, off: 6, dmg: 0.6, free: true });
          e.coins = [];
          idle(e, 0.34);
        }
      },
    },

    // 10. HIGH NOON (signature): the square goes dark, the bell tolls, and her
    //     sight line hunts you — it turns slower than you can run. On the third
    //     bell she fires one huge shot. Dash through it on the bell, or put a
    //     crate between you (it shatters). Phase 2: a second gun on a fourth bell.
    highnoon: {
      cooldown: 22,
      start(e, p) {
        e.cool.highnoon = p2(e) ? 11 : 16;
        e.noonTarget = 1;
        e.tolls = 0;
        e.hnShots = p2(e) ? 2 : 1;
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.hnLine = addLine(e, { a: e.aim, t: 99, T: 99, w: 3, color: '#ff9a4d', alpha: 0.75 });
        say(e, 'High noon.', GOLD);
        toll(e);
        sub(e, 'toll', 0.9);
      },
      update(e, dt, p) {
        const l = e.hnLine;
        if (e.sub === 'toll') {
          const lockIn = e.tolls >= 2 && e.t < 0.3;
          // Faster than you can circle her: dash on the third bell, or get behind a crate.
          if (!lockIn) turnToward(e, angleTo(e.x, e.y, p.x, p.y), (p2(e) ? 2.4 : 1.9) * dt);
          else if (!l.locked) { l.locked = true; l.color = WHITE_HOT; l.w = 4; sfx.click(); }
          e.aim = e.face;
          l.x = e.x; l.y = e.y; l.a = e.aim;
          if (e.t > 0) return;
          if (e.tolls < 2) { toll(e); sub(e, 'toll', 0.9); return; }
          // The last bell: BANG.
          toll(e);
          fire(e, e.aim, 950, { dmg: 1.7, r: 8, color: WHITE_HOT, life: 1.6, extra: { crateDmg: 99 } });
          shake(0.45);
          flash(0.18, WHITE_HOT);
          e.hnShots--;
          l.t = 0;
          if (e.hnShots > 0 && e.ammo > 0) {
            e.tolls = 2;               // one more bell: the second gun
            e.aim = angleTo(e.x, e.y, p.x, p.y);
            e.hnLine = addLine(e, { a: e.aim, t: 99, T: 99, w: 3, color: DUSK, alpha: 0.75 });
            sub(e, 'toll', 0.85);
            return;
          }
          e.noonTarget = 0;
          say(e, 'Too slow.');
          expose(e, 1.2);
        }
      },
    },

    // 11. Deadeye (phase-1 barrage): she vaults up to the bell and rains five
    //     fanned volleys down on the square. Wide lanes between the bullets,
    //     crates for cover. She drops down (a marked landing) and reloads.
    deadeye: {
      cooldown: 30,
      start(e) {
        const b = arenaBounds();
        e.jump = { x0: e.x, y0: e.y, x1: (b.l + b.r) / 2, y1: b.t + 46 };
        e.volley = 0;
        say(e, 'Stay down.');
        sfx.telegraph();
        sub(e, 'leap', 0.6);
      },
      update(e, dt, p) {
        if (e.sub === 'leap' || e.sub === 'drop') {
          const J = e.jump, k = clamp(1 - e.t / (e.sub === 'leap' ? 0.6 : 0.7), 0, 1);
          e.x = lerp(J.x0, J.x1, k); e.y = lerp(J.y0, J.y1, k);
          e.z = Math.sin(k * PI) * 70;
          if (e.t > 0) return;
          e.z = 0;
          if (e.sub === 'drop') {
            shake(0.3);
            e.reloadPending = true;
            expose(e, 1.8);
            return;
          }
          e.face = PI / 2;
          sub(e, 'glint', 0.45);
          return;
        }
        if (e.sub === 'glint') {
          if (e.t > 0) return;
          const n = 8, spread = 1.75;
          const shift = (e.volley % 2 ? 0.5 : 0) * (spread / (n - 1));
          for (let k = 0; k < n; k++) {
            fire(e, PI / 2 - spread / 2 + (k / (n - 1)) * spread + shift, 235, { dmg: 0.5, free: true, quiet: k > 0, shape: 'orb', r: 7, life: 4 });
          }
          e.volley++;
          if (e.volley >= 6) {
            // Drop back down — the landing spot is marked.
            let tx = p.x, ty = p.y;
            for (let i = 0; i < 12; i++) {
              const x = rand(arena.x + 120, arena.x + arena.w - 120), y = rand(arena.y + arena.h * 0.35, arena.y + arena.h - 90);
              if (freeAt(x, y, 40) && dist(x, y, p.x, p.y) > 150) { tx = x; ty = y; break; }
            }
            e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty };
            spawnHazard({ kind: 'blast', x: tx, y: ty, r: 72, delay: 0.7, damage: Math.round(e.damage * 0.5), color: GOLD, source: e.type, owner: e });
            sub(e, 'drop', 0.7);
          } else sub(e, 'glint', 0.55);
        }
      },
    },

    // 12. Reload: forced when the cylinder is empty. Your window.
    reload: {
      start(e) { reload(e); },
      update() {},
    },

    // --- phase 2 ------------------------------------------------------------------

    // 13. Gunsmoke: she empties both guns into the dirt and vanishes in the
    //     smoke. Eight shots come from eight places around you, each one's
    //     line drawn first. She steps out of the last one's smoke, and has to
    //     reload.
    roulette: {
      cooldown: 14,
      start(e) {
        say(e, 'Gunsmoke.');
        e.face = PI / 2;
        sub(e, 'bomb', 0.5);
      },
      update(e, dt, p) {
        const R = e.rou;
        if (e.sub === 'bomb') {
          if (e.t > 0) return;
          // Both guns into the dirt: a burst of gunfire and a wall of smoke.
          for (let k = 0; k < 6; k++) {
            const a = rand(0, TAU);
            burst(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, { count: 4, color: WHITE_HOT, speed: 220, size: 3, life: 0.2, drag: 5, shape: 'spark' });
          }
          e.smoke = { x: e.x, y: e.y, t: 5 };
          burst(e.x, e.y, { count: 30, color: SMOKE, speed: 240, size: 9, life: 0.9, drag: 3 });
          sfx.gunshot();
          sfx.explode();
          e.hidden = true;
          e.invuln = true;
          e.rou = { k: 0, n: 8, next: 0.25, base: rand(0, TAU), pending: [] };
          sub(e, 'shots', 99);
          return;
        }
        R.next -= dt;
        if (R.k < R.n && R.next <= 0) {
          let pt = null;
          for (let tries = 0; tries < 10 && !pt; tries++) {
            const a = R.base + R.k * 2.35 + rand(-0.3, 0.3);
            const [x, y] = inArena(p.x + Math.cos(a) * 330, p.y + Math.sin(a) * 330, 44);
            if (freeAt(x, y, 20) && dist(x, y, p.x, p.y) > 200) pt = { x, y };
          }
          if (!pt) { const [x, y] = inArena(p.x + 300, p.y, 44); pt = { x, y }; }
          const a = leadAngle(e, p, pt.x, pt.y, 600, 0.55, 0.62);
          const line = addLine(e, { x: pt.x, y: pt.y, a, t: 0.62, T: 0.62, w: 2, color: DUSK, locked: true });
          R.pending.push({ ...pt, a, t: 0.62, line });
          burst(pt.x, pt.y, { count: 8, color: SMOKE, speed: 90, size: 6, life: 0.5, drag: 3 });
          R.k++;
          R.next = 0.34;
        }
        for (const s of R.pending) {
          s.t -= dt;
          if (s.t <= 0 && !s.done) {
            s.done = true;
            fire(e, s.a, 600, { x: s.x, y: s.y, off: 8, dmg: 0.6, free: true });
            R.last = s;
          }
        }
        if (R.k >= R.n && R.pending.every((s) => s.done)) {
          // Out of the smoke, where the last shot came from.
          e.x = R.last.x; e.y = R.last.y;
          e.hidden = false;
          e.invuln = false;
          e.smoke = { x: e.x, y: e.y, t: 1.2 };
          burst(e.x, e.y, { count: 20, color: SMOKE, speed: 200, size: 8, life: 0.7, drag: 3 });
          e.rou = null;
          e.ammo = Math.min(e.ammo, 0);
          reload(e);
        }
      },
    },

    // 14. Dance: "Dance, partner." Three lines of shots at your feet, each a
    //     ripple of marked impacts crossing where you stand. Step off the line
    //     before the ripple reaches you. Empties both guns.
    dance: {
      cooldown: 11,
      start(e) {
        say(e, 'Dance, partner.', DUSK);
        e.danceK = 0;
        sub(e, 'line', 0.3);
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        if (e.danceK >= 4) { e.ammo = 0; idle(e, 0.34); return; }
        const a = rand(0, PI);
        const n = 7, gap = 46;
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * gap;
          const [x, y] = inArena(p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, 24);
          spawnHazard({
            kind: 'blast', x, y, r: 30, delay: 0.5 + k * 0.065, damage: Math.round(e.damage * 0.45),
            color: GOLD, source: e.type, owner: e, quiet: true,
            onDetonate: k % 2 ? null : () => sfx.gunshot(),
          });
        }
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.recoil = 0.12;
        e.danceK++;
        e.t = 0.85;
      },
    },

    // 15. SUNDOWN (phase-2 barrage): in the middle of the square she spins
    //     both guns — two spirals turning one way, two the other. The gaps
    //     between them drift; walk with them. Then a long reload.
    sundown: {
      cooldown: 28,
      start(e) {
        const b = arenaBounds();
        e.center = { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
        say(e, 'Last light.', DUSK);
        sub(e, 'walk', 1.2);
      },
      update(e, dt) {
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, e.center.x, e.center.y);
          if (d > 8) forward(e, Math.min(320, d / dt), dt, angleTo(e.x, e.y, e.center.x, e.center.y));
          if (d <= 8 || e.t <= 0) {
            toll(e);
            sfx.telegraph();
            ring(e.x, e.y, { r0: 10, r1: 160, color: DUSK, life: 0.6, width: 5 });
            e.spinA = rand(0, TAU);
            e.spinT = 0;
            sub(e, 'twirl', 0.8);
          }
          return;
        }
        if (e.sub === 'twirl') { if (e.t <= 0) sub(e, 'spin', 4.0); return; }
        e.spinT += dt;
        e.face = e.spinA + e.spinT * 1.15;
        // Spirals turn at 1.15 rad/s, a volley every 0.16 s: between two
        // bullets of one arm there is ~40 u of space at mid range, wider
        // than the player's hurtbox, so an arm can be slipped through.
        if ((e.volleyT = (e.volleyT || 0) - dt) <= 0) {
          e.volleyT = 0.16;
          const w = 1.15 * e.spinT;
          for (const [base, dir, color] of [[e.spinA, 1, BRASS], [e.spinA + PI, 1, BRASS], [e.spinA + PI / 2, -1, DUSK], [e.spinA - PI / 2, -1, DUSK]]) {
            fire(e, base + dir * w, 200, { dmg: 0.45, free: true, quiet: true, shape: 'orb', r: 7, color, life: 6 });
          }
          if (Math.random() < 0.3) sfx.gunshot();
        }
        if (e.t <= 0) {
          e.reloadPending = true;
          say(e, 'Reload.');
          expose(e, 2.0);
        }
      },
    },
  },

  // --- drawing ------------------------------------------------------------------------

  /** The gunslinger, from above: hat, poncho, scarf, one gun (two at dusk). */
  draw(e, ctx) {
    const t = world.runTime;
    const a = e.face || 0;
    const z = e.z || 0;
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y - z);
    const scale = 1 + z / 320;
    ctx.scale(scale, scale);

    // Scarf, streaming behind her.
    const mv = Math.hypot(e.mvx || 0, e.mvy || 0);
    const back = mv > 30 ? Math.atan2(-(e.mvy || 0), -(e.mvx || 0)) : a + PI;
    ctx.strokeStyle = DUSK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let k = 1; k <= 4; k++) {
      const d = k * 9;
      const wob = Math.sin(t * 9 - k * 1.2) * k * 2.2;
      ctx.lineTo(Math.cos(back) * d + Math.cos(back + PI / 2) * wob, Math.sin(back) * d + Math.sin(back + PI / 2) * wob);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.rotate(a);
    // Poncho: a diamond with a zigzag band.
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#b8543a';
    ctx.beginPath();
    ctx.moveTo(r * 1.0, 0); ctx.lineTo(0, -r * 1.3); ctx.lineTo(-r * 1.1, 0); ctx.lineTo(0, r * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e8a15a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      const y = k * r * 0.28;
      ctx.lineTo(-r * 0.25 + (k % 2 ? 6 : -6), y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, 0); ctx.lineTo(0, -r * 1.3); ctx.lineTo(-r * 1.1, 0); ctx.lineTo(0, r * 1.3);
    ctx.closePath();
    ctx.stroke();

    // Guns: the right hand always; the left at dusk.
    const kick = e.recoil * 50;
    const gun = (side) => {
      ctx.save();
      ctx.translate(r * 0.7 - kick, side * r * 0.42);
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(-6, -3, 8, 6);                   // grip
      ctx.fillStyle = BRASS;
      ctx.beginPath(); ctx.arc(4, 0, 4.2, 0, TAU); ctx.fill();   // cylinder
      ctx.fillStyle = '#4a4a56';
      ctx.fillRect(6, -2, 16, 4);                   // barrel
      ctx.restore();
    };
    if (e.rifle) {
      // The Winchester, shouldered: a long barrel with a brass receiver.
      ctx.save();
      ctx.translate(r * 0.3 - kick, r * 0.2);
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(-14, -3.5, 16, 7);               // stock
      ctx.fillStyle = BRASS;
      ctx.fillRect(2, -4, 9, 8);                    // receiver
      ctx.fillStyle = '#4a4a56';
      ctx.fillRect(11, -2, 34, 4);                  // barrel
      ctx.restore();
    } else {
      gun(1);
      if (e.guns > 1) gun(-1);
    }

    // Head: the wide hat — or, after Sundown, silver hair and burning eyes.
    if (e.hat) {
      ctx.fillStyle = '#3a2618';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.82, r * 0.76, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,122,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = BRASS;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#5a3a24';
      ctx.beginPath(); ctx.arc(-1, 0, r * 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(-4, -4, r * 0.22, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = '#e8e8f0';
      ctx.lineWidth = 3;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(-2, k * 3);
        ctx.quadraticCurveTo(-r * 0.6, k * 5 + Math.sin(t * 7 + k) * 3, -r * 1.1, k * 7 + Math.sin(t * 6 + k) * 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#e8e8f0';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = DUSK;
      ctx.shadowColor = DUSK;
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(r * 0.3, -4, 2.6, 0, TAU); ctx.arc(r * 0.3, 4, 2.6, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  },

  /** Telegraphs and props: sight lines, ricochet paths, coins, gunsmoke, the cylinder. */
  drawExtras(e, ctx, t) {
    // Smoke first: she hides in it.
    if (e.smoke) {
      const k = clamp(e.smoke.t / 1.2, 0, 1);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + t * 0.4;
        const rr = 34 + Math.sin(t * 2 + i) * 8;
        ctx.globalAlpha = 0.28 * k;
        ctx.fillStyle = SMOKE;
        ctx.beginPath(); ctx.arc(e.smoke.x + Math.cos(a) * 30, e.smoke.y + Math.sin(a) * 22, rr, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Sight lines (they stop at cover, as the bullet will).
    for (const l of e.lines) {
      const len = rayLen(l.x, l.y, l.a, 1400, l.cover);
      const alpha = l.locked ? 0.95 : (l.alpha || 0.45) + Math.sin(t * 20) * 0.1;
      ctx.globalAlpha = alpha * clamp(l.t / 0.08, 0, 1);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.w;
      if (l.dash) ctx.setLineDash(l.dash);
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + Math.cos(l.a) * len, l.y + Math.sin(l.a) * len);
      ctx.stroke();
      ctx.setLineDash([]);
      if (l.locked) {
        ctx.fillStyle = WHITE_HOT;
        ctx.beginPath(); ctx.arc(l.x + Math.cos(l.a) * 26, l.y + Math.sin(l.a) * 26, 4 + Math.sin(t * 40) * 1.5, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Ricochet paths: dotted, with a mark at every bounce.
    for (const pts of e.paths) {
      ctx.globalAlpha = 0.55 + Math.sin(t * 12) * 0.15;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const pt of pts) {
        if (!pt.bounce) continue;
        ctx.beginPath();
        ctx.moveTo(pt.x - 7, pt.y - 7); ctx.lineTo(pt.x + 7, pt.y + 7);
        ctx.moveTo(pt.x + 7, pt.y - 7); ctx.lineTo(pt.x - 7, pt.y + 7);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Coins spinning in the air, and the tracers between them.
    for (const c of e.coins) {
      if (c.spent) continue;
      const w = Math.abs(Math.cos(t * 16 + c.tx)) * 7 + 1.5;
      ctx.fillStyle = BRASS;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, w, 7, 0, 0, TAU); ctx.fill();
      if (Math.sin(t * 16 + c.tx) > 0.8) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(c.x - 2, c.y - 2, 2, 0, TAU); ctx.fill();
      }
    }
    for (const tr of e.tracers) {
      ctx.globalAlpha = tr.t / 0.2;
      ctx.strokeStyle = WHITE_HOT;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (e.hidden) return;

    // The cylinder: one pip per bullet left, in an arc over her head.
    const n = e.ammoMax || 6;
    const reloading = e.reloadPending;
    for (let i = 0; i < n; i++) {
      const aa = -PI / 2 + (i - (n - 1) / 2) * (n > 6 ? 0.2 : 0.3);
      const px = e.x + Math.cos(aa) * (e.r + 16), py = e.y - (e.z || 0) + Math.sin(aa) * (e.r + 16);
      const full = i < e.ammo;
      ctx.fillStyle = full ? BRASS : 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill();
      if (!full) {
        ctx.strokeStyle = reloading ? `rgba(255,210,122,${0.4 + Math.sin(t * 14 + i) * 0.4})` : 'rgba(255,210,122,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Exposed: a gold ring, so the punish window is unmissable.
    if (e.exposed > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Phase change: the hat sails away, and the word.
    if (e.hatFly) {
      const h = e.hatFly;
      const k = h.t;
      ctx.save();
      ctx.translate(h.x + k * 60, h.y - k * 260 + k * k * 40);
      ctx.rotate(k * h.spin);
      ctx.globalAlpha = clamp(1 - k / 2.5, 0, 1);
      ctx.fillStyle = '#2e1e12';
      ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = BRASS;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.52, 0, TAU); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (e.action === 'phase') {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      const b = arenaBounds();
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = DUSK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 54px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText('SUNDOWN', (b.l + b.r) / 2, b.t + arena.h * 0.28);
      ctx.globalAlpha = 1;
    }
  },

  /** Under everything: the sun-bleached square, the bell, dusk and the High Noon dark. */
  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'vesper' && !q.dead);
    const dusk = e ? e.dusk : 0;
    const noon = e ? e.noon : 0;
    const b = arenaBounds();

    // Dust Gulch: the town square, its props, wind, tumbleweeds and dust.
    drawGulch(ctx, room, t);

    // Dusk: the light goes red, and a sun sinks behind the rooftops.
    if (dusk > 0.01) {
      ctx.fillStyle = `rgba(140,30,60,${0.2 * dusk})`;
      ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
      const sx = b.l + arena.w * 0.82, sy = b.t + 30 - dusk * 20;
      const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
      g.addColorStop(0, `rgba(255,150,90,${0.9 * dusk})`);
      g.addColorStop(0.4, `rgba(255,90,80,${0.5 * dusk})`);
      g.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, 90, 0, TAU); ctx.fill();
    }

    // High Noon: the floor goes dark so only the two of you stand out.
    if (noon > 0.01) {
      ctx.fillStyle = `rgba(10,5,2,${0.45 * noon})`;
      ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
    }

    // The bell, on a post at the corner of the saloon (clear of the boss bar).
    const [bx, by] = bellPos();
    const swing = Math.sin(t * 9) * 0.35 * (e ? e.bellSwing : 0);
    ctx.strokeStyle = '#3a2618';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx - 34, by); ctx.lineTo(bx + 34, by); ctx.moveTo(bx - 30, by); ctx.lineTo(bx - 30, by + 40); ctx.stroke();
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(swing);
    ctx.fillStyle = '#c9a040';
    ctx.beginPath();
    ctx.moveTo(-8, 2); ctx.lineTo(8, 2); ctx.lineTo(15, 26); ctx.lineTo(-15, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a6a20';
    ctx.beginPath(); ctx.arc(0, 28, 4, 0, TAU); ctx.fill();
    ctx.restore();
  },
};

function bellPos() {
  const b = arenaBounds();
  return [b.l + 64, b.t + 6];
}

/** The bell tolls: a sound, a swing, and a ring of light over the square. */
function toll(e) {
  sfx.bell();
  e.bellSwing = 1;
  e.tolls = (e.tolls || 0) + 1;
  const [bx, by] = bellPos();
  ring(bx, by + 18, { r0: 10, r1: 120, color: GOLD, life: 0.6, width: 4 });
  shake(0.12);
}

