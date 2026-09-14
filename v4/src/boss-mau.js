// ============================================================================
// MAU, THE NINE-LIVED — the Great Cat of nine legends, in a moonlit temple
// courtyard of cat statues. "Every cat has nine lives. I remember all of mine."
//
// NINE LIVES (signature): her health is nine lives (the cat heads across the
// top). Each time one is lost she flips, lands on her feet — and remembers a
// new life, with a new trick:
//   1 The Housecat         butt-wiggle pounce, claw swipes, knocking vases
//                          off the ledge, hairball goo, the hiss, and the
//                          beckoning paw of the lucky cat (coins!)
//   2 The Red Dot          she hunts a laser dot that hunts you
//   3 3 A.M. Zoomies       frantic dashes; and the grin that stays when the
//                          rest of the cat vanishes (listen for her bell)
//   4 Schrödinger's Box    three boxes, one cat, alive AND dead until you
//                          look inside (strike a box)
//   5 THE GREAT CAT OF RA  Mau of the Book of the Dead: the sun-knife, Apep
//                          the serpent, the persea tree, the sun barrage
//   6 Kot Bayun            the lullaby that puts you to sleep
//   7 Nekomata             the split tail: ghost fire and the dancing dead
//   8 Kasha & Freyja       the burning cart that comes with thunder; the two
//                          cats of Freyja's chariot
//   9 CAT SÌTH             the soul-stealing fairy cat, the house-sized Yule
//                          Cat at the wall, and the ghosts of her eight lives
//
// CATNIP (your counterplay): three pots of catnip grow in the courtyard.
// Strike one and it bursts into a cloud. If she wanders into it, she rolls
// about in bliss — wide open. The pots regrow.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, lerp, circleArc, circleOrientedRect } from './util.js';
import { sub, idle, expose, shot, lane, lob, inArena, turnToward, forward, spawnEnemyFn } from './boss-kit.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import { spawnPickup } from './spawn.js';
import { PV, say, leadAt, center, blastAt, hurt, strikeLane, cutLands, startLeap, stepLeap } from './boss-mau-kit.js';
import { LEGEND_MOVES, updateLegends } from './boss-mau-legends.js';
import { drawMau, drawCatBox, drawMauExtras, drawMauArena, GOLD, JADE, CATNIP, SOUL } from './boss-mau-art.js';

const PI = Math.PI;

const LIFE_NAMES = [
  null,
  'LIFE 1 · THE HOUSECAT',
  'LIFE 2 · THE RED DOT',
  'LIFE 3 · 3 A.M. ZOOMIES',
  "LIFE 4 · SCHRÖDINGER'S BOX",
  'LIFE 5 · THE GREAT CAT OF RA',
  'LIFE 6 · KOT BAYUN',
  'LIFE 7 · NEKOMATA',
  'LIFE 8 · KASHA & FREYJA',
  'LIFE 9 · CAT SÌTH',
];
const MOVES_BY_LIFE = {
  1: ['pounce', 'swipe', 'table', 'hairball', 'hiss', 'beckon'],
  2: ['laser'],
  3: ['zoomies', 'vanish'],
  4: ['box'],
  5: ['knife', 'apep', 'sundisk'],
  6: ['lullaby'],
  7: ['ghostfire', 'dead'],
  8: ['kasha', 'freyja'],
  9: ['soul', 'yulepaw', 'nine'],
};

/** Her guard: puffed-up fur takes half; hits while she sings count toward catching her. */
function catGuard(e) {
  if (e.action === 'lullaby' && e.sub === 'sing') e.songHits = (e.songHits || 0) + 1;
  return e.puffed > 0 ? 0.5 : 1;
}

function hitsPoint(x, y, r) {
  for (const pr of world.projectiles) {
    if (pr.friendly && !pr.cleared && dist(pr.x, pr.y, x, y) < (pr.r || 6) + r) return true;
  }
  for (const h of world.hitboxes) {
    let hit;
    if (h.shape === 'arc') hit = circleArc(x, y, r, h.x, h.y, h.angle, h.arc, h.radius);
    else if (h.shape === 'rect') hit = circleOrientedRect(x, y, r, h.x, h.y, h.angle, h.len, h.wid);
    else hit = dist(h.x, h.y, x, y) < (h.radius || 0) + r;
    if (hit) return true;
  }
  return false;
}

/** Clear a life's props (a life lost, or catnip). */
function clearProps(e) {
  e.dot = null;
  e.leap = null;
  e.z = 0;
  e.alpha = 1;
  e.wiggle = 0;
  e.lynx = [];
  e.ghosts = [];
  e.wisps = null;
  e.pillar = null;
  e.drowsy = 0;
  e.vases = [];
  if (e.yule > 0) e.yuleFade = true;
  for (const b of e.boxes) b.dead = true;
  e.boxes = [];
  e.hidden = false;
}

// --- the housecat's moves helpers --------------------------------------------------

function aimPounce(e, p, t) {
  e.aim = leadAt(e.x, e.y, p, 900, 0.4);
  const d = Math.min(460, dist(e.x, e.y, p.x, p.y) + 30);
  e.pounceTo = [e.x + Math.cos(e.aim) * d, e.y + Math.sin(e.aim) * d];
  lane(e, t, d, 2 * (e.r + 10), JADE);
  sfx.telegraph();
  sub(e, 'wind', t);
}

function swipeCue(e, p, i, t) {
  e.aim = angleTo(e.x, e.y, p.x, p.y) + (i % 2 ? 0.35 : -0.35);
  e.face = e.aim;
  spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.aim, arc: 1.5, r: 125, delay: t, color: '#f4f0ff', owner: e, follow: e });
  sub(e, 'cue', t);
}

function dashTo(e, p, t) {
  const b = arenaBounds();
  let tx, ty;
  if (e.left % 2 === 0) { tx = p.x + rand(-60, 60); ty = p.y + rand(-60, 60); }
  else {
    for (let k = 0; k < 10; k++) {
      tx = rand(b.l + 60, b.r - 60); ty = rand(b.t + 80, b.b - 60);
      if (dist(tx, ty, e.x, e.y) > 300) break;
    }
  }
  [tx, ty] = inArena(tx, ty, e.r + 10);
  e.aim = angleTo(e.x, e.y, tx, ty);
  e.face = e.aim;
  e.dashLen = dist(e.x, e.y, tx, ty);
  e.dashD = 0;
  lane(e, t, e.dashLen, 2 * (e.r + 8), JADE);
  sub(e, 'cue', t);
}

// --- Schrödinger's box ---------------------------------------------------------------

function hitBox(c) {
  const e = c.summoner;
  if (!e || e.dead || e.action !== 'box' || e.sub !== 'wait' || c.dead) return 0;
  if (c.real) {
    damageText(c.x, c.y - 40, 'OBSERVED: ALIVE!', { color: GOLD, size: 17 });
    popOut(e, c);
    e.exposed = 0;
    expose(e, 2.0);
  } else {
    damageText(c.x, c.y - 40, 'EMPTY… OR DEAD?', { color: SOUL, size: 15 });
    for (let k = 0; k < 10; k++) shot(e, (k / 10) * TAU, 190, { x: c.x, y: c.y, off: 16, shape: 'orb', r: 7, color: SOUL, dmg: 0.4, life: 4 });
    burst(c.x, c.y, { count: 18, color: '#b8864e', speed: 220, size: 4, life: 0.5, drag: 3, shape: 'shard' });
    c.dead = true;
    sfx.meow(0.6);
  }
  return 0;
}

function popOut(e, c) {
  e.x = c.x; e.y = c.y;
  e.hidden = false;
  e.invuln = false;
  for (const b of e.boxes) { if (!b.dead) burst(b.x, b.y, { count: 14, color: '#b8864e', speed: 200, size: 4, life: 0.5, drag: 3, shape: 'shard' }); b.dead = true; }
  e.boxes = [];
  sfx.meow(1.1);
}

// --- the fight --------------------------------------------------------------------------

export const MAU = {
  phases: [8, 7, 6, 5, 4, 3, 2, 1].map((n) => n / 9),
  phaseTime: 1.0,
  roarPitch: 1.4,
  opening: { beckon: 6, table: 5, hairball: 3 },

  /** An open courtyard: only the statues on the walls, and the catnip pots. */
  arena() { return []; },

  init(e) {
    const b = arenaBounds();
    const w = b.r - b.l, h = b.b - b.t;
    e.life = 1;
    e.form = 'cat';
    e.tails = 1;
    e.alpha = 1;
    e.tree = 0;
    e.pots = [
      { x: b.l + w * 0.18, y: b.t + h * 0.62, grow: 1 },
      { x: b.r - w * 0.18, y: b.t + h * 0.62, grow: 1 },
      { x: b.l + w * 0.5, y: b.b - 46, grow: 1 },
    ];
    e.clouds = [];
    e.puddles = [];
    e.fires = [];
    e.boxes = [];
    e.nipCd = 0;
    e.flickT = 1.6;
    e.jingleT = 0;
    e.face = PI / 2;
    e.guardFn = catGuard;
    clearProps(e);
    e.lifeName = LIFE_NAMES[1];
    e.lifeFlash = 2.4;
    sfx.meow(1);
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
    e.nipCd = Math.max(0, e.nipCd - dt);
    e.lifeFlash = Math.max(0, e.lifeFlash - dt);
    e.puffed = Math.max(0, (e.puffed || 0) - dt);
    if (e.action !== 'lullaby') e.blink = Math.max(0, (e.blink || 0) - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); PV.x = lerp(PV.x, vx, k); PV.y = lerp(PV.y, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    e.hug = dist(e.x, e.y, p.x, p.y) < e.r + 100 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);
    if (e.form === 'ra' && e.tree < 1) e.tree = Math.min(1, e.tree + dt * 0.5);

    // Catnip: strike a grown pot and it bursts; she can't resist the cloud.
    for (const pot of e.pots) {
      if (pot.grow < 1) { pot.grow = Math.min(1, pot.grow + dt / 16); continue; }
      if (hitsPoint(pot.x, pot.y, 18)) {
        pot.grow = 0;
        e.clouds.push({ x: pot.x, y: pot.y, r: 130, t: 4 });
        burst(pot.x, pot.y, { count: 20, color: CATNIP, speed: 180, size: 4, life: 0.6, drag: 3 });
        sfx.chime();
      }
    }
    for (const c of e.clouds) {
      c.t -= dt;
      if (e.nipCd <= 0 && !e.hidden && e.action !== 'phase' && e.action !== 'exposed' && dist(e.x, e.y, c.x, c.y) < c.r) {
        e.nipCd = 12;
        clearProps(e);
        damageText(e.x, e.y - e.r - 30, 'CATNIP!', { color: CATNIP, size: 20 });
        sfx.trill();
        sfx.purr(1.2);
        expose(e, 2.2);
      }
    }
    e.clouds = e.clouds.filter((c) => c.t > 0);
    // Hairball goo slows you; the Kasha's fire bites.
    for (const g of e.puddles) {
      g.t -= dt;
      if (dist(p.x, p.y, g.x, g.y) < g.r) { p.slowUntil = world.runTime + 0.15; p.slowMult = 0.55; }
    }
    e.puddles = e.puddles.filter((g) => g.t > 0);
    for (const f of e.fires) {
      f.t -= dt;
      if (dist(p.x, p.y, f.x, f.y) < f.r + p.r * 0.4) hurt(e, 0.3, f.x, f.y);
    }
    e.fires = e.fires.filter((f) => f.t > 0);
    updateLegends(e, dt, p);
    // You can hear her bell when you can't see her.
    if (e.alpha < 0.3 && (e.jingleT -= dt) <= 0) { e.jingleT = 0.5; sfx.jingle(); }
    if (!e.hidden && (e.z || 0) < 20 && (e.touchCd || 0) <= 0 && dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + 8) {
      if (hurt(e, 0.35, e.x, e.y)) e.touchCd = 0.6;
    }
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 5 * dt);
    const sp = e.speed * (e.life >= 5 ? 1.15 : 1);
    if (d > 290) forward(e, sp, dt, a);
    else if (d < 170) forward(e, -sp * 0.8, dt, a);
    forward(e, sp * 0.6, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.5) e.sign *= -1;
    [e.x, e.y] = inArena(e.x, e.y, e.r + 14);
    // Idle claws: a flick of two claw-shards at you.
    if ((e.flickT -= dt) <= 0) {
      e.flickT = e.life >= 5 ? 1.15 : 1.5;
      const la = leadAt(e.x, e.y, p, 270, 0.7);
      for (const k of [-0.14, 0.14]) shot(e, la + k, 270, { shape: 'shard', r: 6, color: JADE, dmg: 0.38, life: 4 });
      if (Math.random() < 0.25) sfx.meow(rand(0.9, 1.2));
    }
  },

  choose(e, p, d) {
    const pool = [];
    for (let life = 1; life <= e.life; life++) {
      for (const m of MOVES_BY_LIFE[life]) {
        let w = 2;
        if (life === e.life && life > 1) w *= 1.6;          // show off the newest trick
        if (life === 1 && e.life >= 5) w *= 0.6;
        if (m === 'hiss') w = e.hug > 0.5 ? 8 : 0.4;
        if (m === 'pounce') w *= d > 200 ? 1.5 : 0.8;
        if (m === 'sundisk' || m === 'nine') w = 3;
        if (m === 'dead' && world.enemies.filter((q) => q.summoner === e && !q.dead && q.type === 'wretch').length >= 2) w = 0;
        pool.push([m, w]);
      }
    }
    return pool;
  },

  // --- a life lost: she flips, lands on her feet, and remembers another life -------------
  onPhase(e, want) {
    clearProps(e);
    e.life = want;
    const big = want === 5 || want === 9;
    e.phaseT = e.t = big ? 2.6 : 1.0;
    e.marks = {};
    damageText(e.x, e.y - e.r - 34, big ? 'SHE REMEMBERS…' : 'LANDS ON HER FEET', { color: GOLD, size: 16 });
    if (big) sfx.yowl(); else sfx.meow(1.3);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.z = Math.sin(k * PI) * (e.life === 5 || e.life === 9 ? 110 : 70);
    if (k < 0.8) e.face += dt * 14;
    once('land', 0.95, () => { ring(e.x, e.y, { r0: 10, r1: 110, color: GOLD, life: 0.4, width: 5 }); shake(0.35); });
    if (e.life === 5) once('ra', 0.5, () => { e.form = 'ra'; burst(e.x, e.y, { count: 40, color: '#ffb347', speed: 320, size: 5, life: 0.7, drag: 2 }); sfx.roar(1.0); });
    if (e.life === 7) once('tails', 0.5, () => { e.tails = 2; burst(e.x, e.y, { count: 20, color: '#7fd8ff', speed: 200, size: 4, life: 0.6, drag: 2 }); });
    if (e.life === 9) once('sith', 0.5, () => { e.form = 'sith'; burst(e.x, e.y, { count: 40, color: '#c8b8ff', speed: 320, size: 5, life: 0.8, drag: 2 }); });
  },
  afterPhase(e) {
    e.z = 0;
    e.lifeName = LIFE_NAMES[e.life];
    e.lifeFlash = 2.4;
    for (const m of MOVES_BY_LIFE[e.life] || []) e.cool[m] = m === 'sundisk' || m === 'nine' ? 10 : 1.5;
  },

  moves: {
    // Butt-Wiggle Pounce: the wiggle is the tell, then the lane, then the
    // leap (two pounces from life 3, three from life 7).
    pounce: {
      cooldown: 3,
      start(e, p) { e.left = e.life >= 7 ? 3 : e.life >= 3 ? 2 : 1; aimPounce(e, p, 0.6); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          e.wiggle = 1;
          if (e.t <= 0) { e.wiggle = 0; startLeap(e, e.pounceTo[0], e.pounceTo[1], 0.32); sfx.trill(); sub(e, 'leap', 1); }
          return;
        }
        if (e.sub === 'leap') {
          if (stepLeap(e, dt)) {
            cutLands(e, e.aim, TAU, 72, 0.9);
            ring(e.x, e.y, { r0: 10, r1: 72, color: JADE, life: 0.3, width: 4 });
            e.left--;
            if (e.left > 0) aimPounce(e, p, 0.42);
            else { e.exposed = 0.45; sub(e, 'rest', 0.45); }
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // Claw Swipes: left, right, left — each arc shown first, each flinging
    // claw-shards.
    swipe: {
      cooldown: 3.5,
      start(e, p) { e.left = 3; e.i = 0; swipeCue(e, p, 0, 0.38); },
      update(e, dt, p) {
        if (e.t > 0) { forward(e, 50, dt, e.face); [e.x, e.y] = inArena(e.x, e.y, e.r + 10); return; }
        cutLands(e, e.aim, 1.5, 125, 0.6);
        for (const k of [-0.2, 0, 0.2]) shot(e, e.aim + k, 260, { shape: 'shard', r: 6, color: '#f4f0ff', dmg: 0.35, life: 3 });
        sfx.scratch();
        e.left--;
        e.i++;
        if (e.left > 0) swipeCue(e, p, e.i, 0.3); else idle(e, 0.35);
      },
    },

    // Knock It Off the Table: she hops up onto the ledge and, one by one,
    // pushes the vases off. Each falls where it's marked and shatters.
    table: {
      cooldown: 11,
      start(e, p) {
        const b = arenaBounds();
        startLeap(e, clamp(p.x, b.l + 300, b.r - 300), b.t + 40, 0.5);
        say(e, '…', GOLD);
        sub(e, 'hop', 0.5);
      },
      update(e, dt, p) {
        const b = arenaBounds();
        if (e.sub === 'hop') {
          if (stepLeap(e, dt)) {
            e.vases = [];
            for (let k = 0; k < 6; k++) e.vases.push({ x: e.x + (k - 2.5) * 90, falling: false, done: false });
            e.vaseI = 0;
            e.vaseT = 0.4;
            e.face = PI / 2;
            sub(e, 'push', 3.2);
          }
          return;
        }
        if (e.sub === 'push') {
          for (const v of e.vases) {
            if (!v.falling || v.done) continue;
            v.ft += dt;
            v.fy = lerp(b.t + 20, v.ty, clamp(v.ft / 0.7, 0, 1));
            if (v.ft >= 0.7) v.done = true;
          }
          if ((e.vaseT -= dt) <= 0 && e.vaseI < e.vases.length) {
            e.vaseT = e.life >= 5 ? 0.22 : 0.3;
            const v = e.vases[e.vaseI++];
            e.x = v.x;
            v.falling = true;
            v.ft = 0;
            v.ty = clamp(p.y + rand(-40, 40), b.t + 90, b.b - 40);
            blastAt(e, v.x, v.ty, 54, 0.7, 0.6, '#6fb8c8', {
              onDetonate: (h) => {
                for (let k = 0; k < 6; k++) shot(e, (k / 6) * TAU + rand(0, 1), 200, { x: h.x, y: h.y, off: 10, shape: 'shard', r: 6, color: '#9fd8e8', dmg: 0.35, life: 3 });
                sfx.block();
              },
            });
            sfx.meow(1.4);
          }
          if (e.vaseI >= e.vases.length && e.vases.every((v) => v.done)) {
            startLeap(e, e.x, b.t + 240, 0.45);
            sub(e, 'down', 1);
          }
          return;
        }
        if (stepLeap(e, dt)) { e.vases = []; idle(e, 0.35); }
      },
    },

    // Hairball: a hacking cough (the tell), then a lobbed hairball that
    // leaves a slow, sticky puddle (three from life 4).
    hairball: {
      cooldown: 7,
      start(e) { e.left = e.life >= 4 ? 3 : 1; sfx.catHiss(); say(e, '*hack*', '#c8b890'); sub(e, 'cough', 0.8); },
      update(e, dt, p) {
        if (e.sub === 'cough') {
          e.x += Math.sin(world.runTime * 60) * 0.8;
          if (e.t <= 0) sub(e, 'spit', 0);
          return;
        }
        if (e.t > 0) return;
        const [tx, ty] = inArena(p.x + PV.x * 0.6 + rand(-40, 40), p.y + PV.y * 0.6 + rand(-40, 40), 40);
        lob(e, tx, ty, { flight: 0.9, r: 56, dmg: 0.6, color: '#8a7a5a' });
        e.pending = e.pending || [];
        e.pending.push({ x: tx, y: ty, t: 0.9 });
        e.left--;
        e.t = e.left > 0 ? 0.35 : 1.0;
        if (e.left <= 0) sub(e, 'land', 1.0);
      },
    },

    // Hiss: too close — her fur puffs up (blows land for half), and a hiss
    // bursts out around her, flinging fur.
    hiss: {
      cooldown: 4,
      start(e) {
        e.puffed = 1.3;
        blastAt(e, e.x, e.y, 125, 0.4, 0.6, '#f4f0ff', { follow: e });
        sfx.catHiss();
        sub(e, 'arch', 0.4);
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const a0 = rand(0, TAU);
        for (let k = 0; k < 10; k++) shot(e, a0 + (k / 10) * TAU, 240, { shape: 'shard', r: 6, color: '#3a2a3a', dmg: 0.35, life: 2 });
        if (dist(e.x, e.y, p.x, p.y) < 160) {
          const a = angleTo(e.x, e.y, p.x, p.y);
          p.vx = (p.vx || 0) + Math.cos(a) * 520;
          p.vy = (p.vy || 0) + Math.sin(a) * 520;
        }
        idle(e, 0.4);
      },
    },

    // Beckoning Paw: the lucky cat raises her paw and draws you in, while
    // coins rain down (marked). Some coins stay — luck cuts both ways.
    beckon: {
      cooldown: 12,
      start(e) { e.coins = e.life >= 5 ? 14 : 10; e.coinT = 0.2; say(e, 'Come closer… for luck.', GOLD); sfx.chime(); sub(e, 'beckon', 2.4); },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        const d = dist(e.x, e.y, p.x, p.y);
        if (d > e.r + 60) {
          p.x += (e.x - p.x) / d * 120 * dt;
          p.y += (e.y - p.y) / d * 120 * dt;
        }
        if ((e.coinT -= dt) <= 0 && e.coins > 0) {
          e.coins--;
          e.coinT = 0.16;
          const a = rand(0, TAU), r = rand(0, 220);
          blastAt(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 34, 0.7, 0.45, GOLD, {
            onDetonate: (h) => {
              sfx.coin();
              if (Math.random() < 0.3) spawnPickup({ x: h.x, y: h.y, vx: rand(-40, 40), vy: rand(-40, 40), type: 'gold', value: 2 });
            },
          });
        }
        if (e.t <= 0) idle(e, 0.35);
      },
    },

    // Life 2. The Red Dot: a laser dot hunts you; she hunts the dot. Every
    // time it stops, she pounces on it.
    laser: {
      cooldown: 9,
      start(e) {
        e.dot = { x: e.x, y: e.y, pause: 0 };
        e.left = e.life >= 6 ? 5 : 4;
        say(e, '!!!', '#ff2a3c');
        sub(e, 'chase', 0.7);
      },
      update(e, dt, p) {
        const D = e.dot;
        if (!D) { idle(e, 0.3); return; }
        if (e.sub === 'chase') {
          const a = angleTo(D.x, D.y, p.x, p.y);
          const d = dist(D.x, D.y, p.x, p.y);
          const sp = Math.min(560, d / Math.max(dt, 0.001));
          D.x += Math.cos(a) * sp * dt;
          D.y += Math.sin(a) * sp * dt;
          e.face = angleTo(e.x, e.y, D.x, D.y);
          e.wiggle = 0.5;
          if (e.t <= 0) {
            D.pause = 0.45;
            blastAt(e, D.x, D.y, 64, 0.45 + 0.25, 0.8, '#ff2a3c');
            sub(e, 'fix', 0.45);
          }
          return;
        }
        if (e.sub === 'fix') {
          e.wiggle = 1;
          if (e.t <= 0) { e.wiggle = 0; D.pause = 0; startLeap(e, D.x, D.y, 0.25); sub(e, 'leap', 1); }
          return;
        }
        if (stepLeap(e, dt)) {
          e.left--;
          if (e.left > 0) sub(e, 'chase', 0.55);
          else { e.dot = null; e.exposed = 0.5; idle(e, 0.5); }
        }
      },
    },

    // Life 3. 3 A.M. Zoomies: six mad dashes (every other one at you), each
    // shown, each ending in a spray of fur.
    zoomies: {
      cooldown: 11,
      start(e, p) { e.left = 6; say(e, 'ZOOMIES', JADE); sfx.trill(); dashTo(e, p, e.life >= 7 ? 0.25 : 0.3); },
      update(e, dt, p) {
        if (e.sub === 'cue') { if (e.t <= 0) sub(e, 'dash', 2); return; }
        const step = 1000 * dt;
        e.x += Math.cos(e.aim) * step;
        e.y += Math.sin(e.aim) * step;
        e.dashD += step;
        if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + 6) hurt(e, 0.6, e.x, e.y);
        if (e.dashD >= e.dashLen || e.t <= 0) {
          for (let k = 0; k < 5; k++) shot(e, rand(0, TAU), 200, { shape: 'shard', r: 5, color: '#3a2a3a', dmg: 0.3, life: 2 });
          sfx.dash();
          e.left--;
          if (e.left > 0) dashTo(e, p, e.life >= 7 ? 0.25 : 0.3);
          else { say(e, '*pant*', GOLD); e.exposed = 0.8; idle(e, 0.8); }
        }
      },
    },

    // Life 3. The Grin: the cat fades away until only the grin is left —
    // listen for her bell — then she's behind you.
    vanish: {
      cooldown: 12,
      start(e) { say(e, 'Now you see me…', JADE); sub(e, 'fade', 0.6); },
      update(e, dt, p) {
        if (e.sub === 'fade') {
          e.alpha = clamp(1 - e.st / 0.6, 0.08, 1);
          if (e.t <= 0) sub(e, 'prowl', 1.3);
          return;
        }
        if (e.sub === 'prowl') {
          const behind = Math.hypot(PV.x, PV.y) > 40 ? Math.atan2(-PV.y, -PV.x) : angleTo(p.x, p.y, e.x, e.y);
          const [tx, ty] = inArena(p.x + Math.cos(behind) * 230, p.y + Math.sin(behind) * 230, e.r + 20);
          e.x = lerp(e.x, tx, 1 - Math.exp(-3 * dt));
          e.y = lerp(e.y, ty, 1 - Math.exp(-3 * dt));
          if (e.t <= 0) { e.alpha = 0.5; aimPounce(e, p, 0.45); }
          return;
        }
        if (e.sub === 'wind') {
          e.wiggle = 1;
          if (e.t <= 0) { e.wiggle = 0; e.alpha = 1; startLeap(e, e.pounceTo[0], e.pounceTo[1], 0.3); sfx.catHiss(); sub(e, 'leap', 1); }
          return;
        }
        if (stepLeap(e, dt)) { cutLands(e, e.aim, TAU, 72, 0.9); idle(e, 0.4); }
      },
    },

    // Life 4. Schrödinger's Box: three boxes, and she jumps into one. They
    // shuffle. Until you look — strike a box — she's alive and dead at once.
    // The right box purrs and jingles now and then; a wrong box lets a ghost
    // out. Take too long and she bursts out at you.
    box: {
      cooldown: 16,
      start(e, p) {
        const c = center();
        const y = clamp(p.y < c.y ? c.y + 60 : c.y - 60, arenaBounds().t + 120, arenaBounds().b - 80);
        e.boxes = [];
        for (let k = 0; k < 3; k++) {
          const bx = spawnEnemyFn('catbox', c.x + (k - 1) * 170, y, { instant: true, summoner: e, color: '#b8864e' });
          if (!bx) continue;
          bx.guardFn = hitBox;
          bx.real = k === 1;
          bx.wobble = 0;
          e.boxes.push(bx);
        }
        startLeap(e, c.x, y, 0.5);
        say(e, 'If I fits, I sits.', GOLD);
        sub(e, 'hop', 0.5);
      },
      update(e, dt, p) {
        if (e.sub === 'hop') {
          if (stepLeap(e, dt)) { e.hidden = true; e.invuln = true; sfx.thud(); e.swaps = e.life >= 7 ? 4 : 3; sub(e, 'shuffle', 0.2); }
          return;
        }
        if (e.sub === 'shuffle') {
          if (e.swap) {
            const k = clamp(e.st / e.swap.dur, 0, 1);
            const [A, B] = e.swap.pair;
            A.x = lerp(e.swap.ax, e.swap.bx, k);
            B.x = lerp(e.swap.bx, e.swap.ax, k);
            A.y = e.swap.y - Math.sin(k * PI) * 40;
            B.y = e.swap.y + Math.sin(k * PI) * 40;
            if (k < 1) return;
            A.y = B.y = e.swap.y;
            e.swap = null;
          }
          if (e.t > 0) return;
          if (e.swaps > 0) {
            e.swaps--;
            const live = e.boxes.filter((b) => !b.dead);
            const i = Math.floor(rand(0, live.length));
            const j = (i + 1 + Math.floor(rand(0, live.length - 1))) % live.length;
            e.swap = { pair: [live[i], live[j]], ax: live[i].x, bx: live[j].x, y: live[i].y, dur: e.life >= 7 ? 0.38 : 0.5 };
            sfx.swing(0.8);
            sub(e, 'shuffle', 0);
            return;
          }
          e.purrT = 1.0;
          sub(e, 'wait', 3.2);
          return;
        }
        if (e.sub === 'wait') {
          const real = e.boxes.find((b) => b.real && !b.dead);
          for (const b of e.boxes) b.wobble = Math.max(0, (b.wobble || 0) - dt * 2);
          if (real && (e.purrT -= dt) <= 0) { e.purrT = 1.0; real.wobble = 1; sfx.purr(0.3); sfx.jingle(); }
          if (real) { e.x = real.x; e.y = real.y; }
          if (e.t <= 0 && real) {
            popOut(e, real);
            aimPounce(e, p, 0.4);
            return;
          }
          if (!real) { e.hidden = false; e.invuln = false; idle(e, 0.3); }
          return;
        }
        if (e.sub === 'wind') {
          e.wiggle = 1;
          if (e.t <= 0) { e.wiggle = 0; startLeap(e, e.pounceTo[0], e.pounceTo[1], 0.3); sub(e, 'leap', 1); }
          return;
        }
        if (e.sub === 'leap' && stepLeap(e, dt)) { cutLands(e, e.aim, TAU, 72, 0.9); idle(e, 0.4); }
      },
    },

    ...LEGEND_MOVES,
  },

  draw(e, ctx) { drawMau(ctx, e, world.runTime); },

  drawExtras(e, ctx, t) {
    for (const b of e.boxes) if (!b.dead) drawCatBox(ctx, b, t);
    drawMauExtras(ctx, e, t);
    if (e.action === 'phase' && (e.life === 5 || e.life === 9)) {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      const b = arenaBounds();
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = e.life === 5 ? '#ffb347' : '#c8b8ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 44px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText(e.life === 5 ? 'THE GREAT CAT OF RA' : 'THE CAT SÌTH', (b.l + b.r) / 2, b.t + arena.h * 0.22);
      ctx.globalAlpha = 1;
    }
  },

  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'mau' && !q.dead) || null;
    drawMauArena(ctx, e, t);
  },
};

// Hairball puddles appear where the hairballs land (checked each tick by the
// move's owner through this small hook on the spec).
const baseTick = MAU.tick;
MAU.tick = function tick(e, dt, p) {
  baseTick(e, dt, p);
  if (e.pending) {
    for (const q of e.pending) {
      q.t -= dt;
      if (q.t <= 0) e.puddles.push({ x: q.x, y: q.y, r: 80, t: 5 });
    }
    e.pending = e.pending.filter((q) => q.t > 0);
  }
};
