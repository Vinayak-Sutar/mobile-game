// ============================================================================
// ECHO OF THE MONKEY KING — a trickster sage on a summit above a sea of cloud.
// "Seventy-two shapes, and every one of them is laughing at you."
//
// THE SUMMIT: the fight is on a round mountaintop. Step off the edge into the
// cloud sea and you fall (a chunk of health, and you're back on the rock).
// His staff strikes knock you back — mind where you stand.
//
// SEVENTY-TWO TRANSFORMATIONS (signature): every so often he vanishes in a
// puff of smoke and comes back as a guardian you've already beaten this run,
// using one of its moves (a shell spin, a leap, a quickdraw, a final oath…),
// then turns back. In a trial, any guardian will do.
//
// Moves: Extending Staff, Staff Combo, Staff Spin (deflects shots — get
// close), Cloud Somersault, Clone Army (the real one's staff glows; pop a
// clone and its strike never comes), Pillar Slam, Stone Monkey (crack the
// stone before it bursts), Cudgel Throw (it comes back), Cloud Dive.
// Phase 2 (THE GREAT SAGE AWAKENS, at half health): the summit crumbles
// smaller, transformations come in pairs, and HEAVEN-SPLITTING STAFF — a giant
// staff sweeping the whole summit.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, randInt, pick, dist, angleTo, angleDiff, lerp } from './util.js';
import { sub, idle, expose, shot, lane, lob, shockwave, turnToward, forward, spawnEnemyFn } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';

const PI = Math.PI;
const GOLD = '#ffc861';
const PALEGOLD = '#e8d8a8';
const RED = '#ff5e6e';
const CLOUD = '#f0e8ff';
const FUR = '#c8904a';

const POKE_LEN = 560;
const CLONE_LEN = 320;
const PILLAR_LEN = 760;
const HEAVEN_LEN = 900;
const p2 = (e) => e.phase >= 2;
const PV = { x: 0, y: 0 };   // your smoothed velocity, for leading attacks

function say(e, text, color = GOLD) {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

function leadAt(x, y, p, speed, k = 0.5) {
  const t = dist(x, y, p.x, p.y) / speed;
  return angleTo(x, y, p.x + PV.x * t * k, p.y + PV.y * t * k);
}

function center() {
  const b = arenaBounds();
  return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
}

// --- the summit ----------------------------------------------------------------------

/** How far out a point is on the summit ellipse (1 = the edge), shrunk by m. */
function platK(e, x, y, m = 0) {
  const c = center();
  return Math.hypot((x - c.x) / Math.max(20, e.rx - m), (y - c.y) / Math.max(20, e.ry - m));
}

function clampPlat(e, x, y, m = 0) {
  const k = platK(e, x, y, m);
  if (k <= 1) return [x, y];
  const c = center();
  return [c.x + (x - c.x) / k, c.y + (y - c.y) / k];
}

function fall(e, p) {
  const c = center();
  const k = platK(e, p.x, p.y) || 1;
  burst(p.x, p.y, { count: 20, color: CLOUD, speed: 160, size: 5, life: 0.6, drag: 3 });
  p.x = c.x + (p.x - c.x) / k * 0.72;
  p.y = c.y + (p.y - c.y) / k * 0.72;
  p.vx = p.vy = 0;
  damagePlayer(Math.round(p.stats.maxHp * 0.12), null, null, 'the cloud sea');
  damageText(p.x, p.y - p.r - 22, 'FELL!', { color: CLOUD, size: 16 });
  ring(p.x, p.y, { r0: 40, r1: 6, color: CLOUD, life: 0.35, width: 4 });
  sfx.splash();
  e.fallT = 0;
}

// --- strikes ---------------------------------------------------------------------------

function blastAt(e, x, y, r, delay, mult, color, extra = {}) {
  const [sx, sy] = clampPlat(e, x, y, 10);
  return spawnHazard({ kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color: color || GOLD, source: e.type, owner: e, quiet: true, ...extra });
}

function touchR(e, mult, extra = 10) {
  const p = world.player;
  if (!p || p.dead || e.hidden || (e.touchCd || 0) > 0) return;
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + extra) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) e.touchCd = 0.6;
  }
}

function inLane(p, x, y, a, len, halfW) {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - x, dy = p.y - y;
  const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
  return along > -12 && along < len && across < halfW + p.r * 0.5;
}

/** A staff strike down a line: the hit, the knockback, and the flash of the staff. */
function strikeLane(e, x, y, a, len, halfW, mult, kb) {
  const p = world.player;
  if (p && !p.dead && inLane(p, x, y, a, len, halfW)) {
    if (damagePlayer(Math.round(e.damage * mult), x, y, e.type)) {
      p.vx = (p.vx || 0) + Math.cos(a) * kb;
      p.vy = (p.vy || 0) + Math.sin(a) * kb;
    }
  }
  e.staffFx.push({ x, y, a, len, t: 0.2 });
  burst(x + Math.cos(a) * len, y + Math.sin(a) * len, { count: 8, color: GOLD, speed: 180, size: 3.5, life: 0.3, drag: 5, shape: 'spark' });
  sfx.swing(1.3);
}

function cutLands(e, arc, r, mult) {
  const p = world.player;
  if (!p || p.dead) return;
  const d = dist(e.x, e.y, p.x, p.y);
  if (d < r + p.r * 0.5 && Math.abs(angleDiff(e.face, angleTo(e.x, e.y, p.x, p.y))) < arc / 2 + 0.1) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) {
      p.vx = (p.vx || 0) + Math.cos(e.face) * 260;
      p.vy = (p.vy || 0) + Math.sin(e.face) * 260;
    }
  }
  for (let k = 0; k < 9; k++) {
    const a = e.face - arc / 2 + (k / 8) * arc;
    burst(e.x + Math.cos(a) * r * 0.8, e.y + Math.sin(a) * r * 0.8, { count: 1, color: GOLD, speed: 90, size: 3.5, life: 0.25, dir: a + PI / 2, spread: 0.2, drag: 4, shape: 'spark' });
  }
  sfx.swing(1.2);
}

function smoke(x, y) {
  burst(x, y, { count: 26, color: '#e8e0f0', speed: 200, size: 6, life: 0.6, drag: 3 });
  ring(x, y, { r0: 10, r1: 80, color: CLOUD, life: 0.4, width: 5 });
}

/** His guard: a spinning staff turns shots away; stone skin cracks instead. */
function monkeyGuard(e, opts) {
  const now = world.runTime;
  if (e.spinning && opts && (opts.source === 'projectile' || opts.source === 'spell')) {
    if ((e.guardSay || -9) < now - 0.5) { e.guardSay = now; damageText(e.x, e.y - e.r - 14, 'DEFLECTED', { color: GOLD, size: 13 }); }
    sfx.block();
    return 0;
  }
  if (e.stone) {
    e.cracks++;
    if ((e.guardSay || -9) < now - 0.25) { e.guardSay = now; damageText(e.x, e.y - e.r - 14, `CRACK ${e.cracks}/${e.crackMax}`, { color: '#d8d0c0', size: 13 }); }
    burst(e.x, e.y, { count: 4, color: '#b8b0a0', speed: 160, size: 3.5, life: 0.35, drag: 4, shape: 'shard' });
    if (e.cracks >= e.crackMax) shatterStone(e);
    return 0.15;
  }
  return 1;
}

function shatterStone(e) {
  e.stone = false;
  damageText(e.x, e.y - e.r - 26, 'STONE SHATTERED', { color: '#ffe27a', size: 17 });
  burst(e.x, e.y, { count: 30, color: '#b8b0a0', speed: 320, size: 5, life: 0.6, drag: 3, shape: 'shard' });
  shake(0.5);
  sfx.explode();
  expose(e, 2.0);
}

// --- the clone army ----------------------------------------------------------------

function popClone(c) {
  if (c.dead) return 0;
  c.dead = true;
  if (c.laneH) c.laneH.dead = true;
  smoke(c.x, c.y);
  damageText(c.x, c.y - 30, 'JUST A HAIR', { color: PALEGOLD, size: 13 });
  sfx.block();
  return 0;
}

function spawnArmy(e, p) {
  const n = p2(e) ? 6 : 4;
  const R = 250;
  const base = rand(0, TAU);
  const realSlot = randInt(0, n);
  const gap = p2(e) ? 0.22 : 0.28;
  e.pokes = [];
  smoke(e.x, e.y);
  for (let k = 0; k <= n; k++) {
    const a = base + (k / (n + 1)) * TAU;
    const [x, y] = clampPlat(e, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 40);
    let src = e;
    if (k === realSlot) {
      e.x = x; e.y = y;
    } else {
      src = spawnEnemyFn('monkeyclone', x, y, { instant: true, summoner: e, color: GOLD });
      if (!src) continue;
      src.guardFn = popClone;
      e.clones.push(src);
    }
    const aim = angleTo(x, y, p.x, p.y);
    src.face = aim;
    const delay = 0.6 + k * gap;
    const h = spawnHazard({ kind: 'lane', x, y, angle: aim, len: CLONE_LEN, width: 36, delay, color: k === realSlot ? GOLD : PALEGOLD, owner: e, follow: src });
    if (src !== e) src.laneH = h;
    e.pokes.push({ src, a: aim, at: delay, done: false });
    smoke(x, y);
  }
  e.armyEnd = 0.6 + n * gap + 0.3;
}

function popAll(e) {
  for (const c of e.clones) if (!c.dead) { c.dead = true; smoke(c.x, c.y); }
  e.clones = [];
}

// --- seventy-two transformations -----------------------------------------------------

// Each form is his own quick take on a guardian's signature move.
const FORMS = {
  turtle: {
    name: 'Turtle', color: '#6fdca0',
    start(e, p) {
      const a = angleTo(e.x, e.y, p.x, p.y);
      e.mx = Math.cos(a) * 420; e.my = Math.sin(a) * 420;
      sub(e, 'f-shell', p2(e) ? 3.2 : 2.8);
    },
    update(e, dt) {
      e.x += e.mx * dt; e.y += e.my * dt;
      if (platK(e, e.x, e.y, e.r) > 1) {
        const c = center();
        [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 2);
        const nx = (e.x - c.x) / ((e.rx - e.r) ** 2), ny = (e.y - c.y) / ((e.ry - e.r) ** 2);
        const m = Math.hypot(nx, ny) || 1;
        const dot = e.mx * (nx / m) + e.my * (ny / m);
        if (dot > 0) { e.mx -= 2 * dot * (nx / m); e.my -= 2 * dot * (ny / m); }
        shake(0.15);
        sfx.thud();
      }
      e.spinA += dt * 14;
      touchR(e, 0.8, 30);
      return e.t <= 0;
    },
  },
  croc: {
    name: 'Crocodile', color: '#b5e05a',
    start(e) { e.hidden = true; e.invuln = true; e.snaps = p2(e) ? 4 : 3; e.snapT = 0.3; sub(e, 'f-sink', 4); },
    update(e, dt, p) {
      if ((e.snapT -= dt) <= 0 && e.snaps > 0) {
        e.snaps--;
        e.snapT = 0.75;
        blastAt(e, p.x + PV.x * 0.25, p.y + PV.y * 0.25, 70, 0.62, 0.9, '#b5e05a', {
          onDetonate: (h) => { e.x = h.x; e.y = h.y; burst(h.x, h.y, { count: 12, color: '#b5e05a', speed: 220, size: 4, life: 0.4, drag: 4 }); sfx.thud(); },
        });
        sfx.hiss();
      }
      return (e.snaps <= 0 && e.snapT <= 0) || e.t <= 0;
    },
  },
  gorilla: {
    name: 'Gorilla', color: '#c9bff0',
    start(e, p) { e.leaps = p2(e) ? 2 : 1; gorillaLeap(e, p); },
    update(e, dt, p) {
      if (e.sub === 'f-up') {
        if (e.t <= 0) {
          e.x = e.land.x; e.y = e.land.y;
          e.hidden = false; e.invuln = false;
          shockwave(e, { speed: 300, dmg: 0.7, color: '#c9bff0' });
          shake(0.6);
          sfx.thud();
          e.leaps--;
          if (e.leaps > 0) gorillaLeap(e, p);
          else sub(e, 'f-land', 0.5);
        }
        return false;
      }
      return e.t <= 0;
    },
  },
  peacock: {
    name: 'Peacock', color: '#6fb8ff',
    start(e) { e.fanA = rand(0, TAU); e.fanT = 0; sub(e, 'f-fan', p2(e) ? 3 : 2.6); },
    update(e, dt) {
      e.fanA += dt * 1.3;
      e.face += dt * 2;
      if ((e.fanT -= dt) <= 0) {
        e.fanT = 0.16;
        for (let k = 0; k < 5; k++) shot(e, e.fanA + (k / 5) * TAU, 190, { shape: 'feather', r: 7, color: '#6fb8ff', dmg: 0.4, life: 5 });
      }
      return e.t <= 0;
    },
  },
  vesper: {
    name: 'Gunslinger', color: '#ffb35e',
    start(e, p) { e.shots = p2(e) ? 4 : 3; vesperAim(e, p, 0.5); },
    update(e, dt, p) {
      if (e.t > 0) return false;
      shot(e, e.aim, 760, { shape: 'bullet', r: 6, color: '#ffe0a0', dmg: 0.7, life: 2 });
      sfx.gunshot();
      e.shots--;
      if (e.shots > 0) { vesperAim(e, p, 0.34); return false; }
      return true;
    },
  },
  naga: {
    name: 'Serpent', color: '#6fd8a4',
    start(e, p) {
      const n = p2(e) ? 6 : 5;
      for (let k = 0; k < n; k++) {
        const a = rand(0, TAU), r = k === 0 ? 0 : rand(70, 190);
        const [x, y] = clampPlat(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 20);
        lob(e, x, y, { flight: 0.8 + k * 0.08, r: 52, dmg: 0.6, color: '#6fd8a4', shards: { n: 6, speed: 150, color: '#6fd8a4', r: 6 } });
      }
      sfx.hiss();
      sub(e, 'f-spit', 1.5);
    },
    update(e) { return e.t <= 0; },
  },
  solaris: {
    name: 'Lancer', color: '#ffd45e',
    start(e, p) {
      e.aim = angleTo(e.x, e.y, p.x, p.y);
      e.face = e.aim;
      lane(e, 0.6, 900, 44, '#ffd45e');
      sfx.telegraph();
      sub(e, 'f-aim', 0.6);
    },
    update(e) {
      if (e.sub === 'f-aim') {
        if (e.t <= 0) {
          strikeLane(e, e.x, e.y, e.aim, 900, 22, 1.0, 200);
          const b = arenaBounds();
          const ex = clamp(e.x + Math.cos(e.aim) * 900, b.l + 10, b.r - 10);
          const ey = clamp(e.y + Math.sin(e.aim) * 900, b.t + 10, b.b - 10);
          for (let k = 0; k < 10; k++) shot(e, (k / 10) * TAU, 220, { x: ex, y: ey, off: 0, color: '#ffe98a', dmg: 0.35, life: 3 });
          flash(0.15, '#ffe98a');
          sfx.beam();
          sub(e, 'f-after', 0.4);
        }
        return false;
      }
      return e.t <= 0;
    },
  },
  aldric: {
    name: 'Knight', color: '#e8f0ff',
    start(e) {
      spawnHazard({ kind: 'blast', x: e.x, y: e.y, r: 220, delay: 1.7, damage: Math.round(e.damage * 1.6), color: '#e8f0ff', source: e.type, owner: e, follow: e });
      say(e, 'A borrowed oath!', '#e8f0ff');
      sub(e, 'f-oath', 1.7);
    },
    update(e) {
      if (e.sub === 'f-oath') {
        if (e.t <= 0) { shake(0.6); e.exposed = 0.9; sub(e, 'f-spent', 0.9); }
        return false;
      }
      return e.t <= 0;
    },
  },
  bride: {
    name: 'Ghost', color: '#dfeaff',
    start(e) { e.hands = p2(e) ? 7 : 5; e.handT = 0.2; sub(e, 'f-hands', 4); },
    update(e, dt, p) {
      if ((e.handT -= dt) <= 0 && e.hands > 0) {
        e.hands--;
        e.handT = 0.3;
        blastAt(e, p.x + PV.x * 0.3, p.y + PV.y * 0.3, 56, 0.7, 0.7, '#9fd8ff');
        sfx.hiss();
      }
      return (e.hands <= 0 && e.handT <= 0) || e.t <= 0;
    },
  },
  warden: {
    name: 'Warden', color: '#ff3d5e',
    start(e) { e.novas = 3; e.novaT = 0.5; sub(e, 'f-nova', 4); },
    update(e, dt) {
      if ((e.novaT -= dt) <= 0 && e.novas > 0) {
        e.novas--;
        e.novaT = 0.7;
        shockwave(e, { speed: 260, dmg: 0.6, color: '#ff6b8a' });
        const off = rand(0, TAU);
        for (let k = 0; k < 12; k++) shot(e, off + (k / 12) * TAU, 170, { color: '#ff6b8a', dmg: 0.35, life: 4 });
        sfx.explode();
      }
      return (e.novas <= 0 && e.novaT <= 0) || e.t <= 0;
    },
  },
};

function gorillaLeap(e, p) {
  const [x, y] = clampPlat(e, p.x, p.y, 30);
  e.land = { x, y };
  blastAt(e, x, y, 110, 0.9, 1.1, '#c9bff0');
  e.hidden = true;
  e.invuln = true;
  sub(e, 'f-up', 0.9);
}

function vesperAim(e, p, t) {
  e.aim = leadAt(e.x, e.y, p, 760, 0.6);
  e.face = e.aim;
  lane(e, t, 700, 20, '#ffb35e');
  sfx.click();
  sub(e, 'f-draw', t);
}

/** The guardians beaten this run (or, in a trial, any of them). */
function formPool() {
  const beaten = (world.beaten || []).filter((t) => FORMS[t]);
  return beaten.length ? beaten : Object.keys(FORMS);
}

function nextForm(e) {
  const f = FORMS[e.formQueue[0]];
  say(e, `${f.name.toUpperCase()} FORM!`, f.color);
  smoke(e.x, e.y);
  sfx.chime();
  sub(e, 'poof', 0.6);
}

function endForm(e) {
  smoke(e.x, e.y);
  e.form = null;
  e.hidden = false;
  e.invuln = false;
  [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 8);
  sub(e, 'unpoof', 0.35);
}

// --- the moveset --------------------------------------------------------------------

export const MONKEY = {
  phases: [0.5],
  phaseTime: 3.0,
  roarPitch: 1.3,
  opening: { transform: 8, stone: 12, clones: 6, pillar: 4, heaven: 99 },

  /** A summit in the clouds: no pillars, only the edge. */
  arena() { return []; },

  init(e) {
    e.rx = arena.w * 0.44;
    e.ry = arena.h * 0.43;
    e.rx0 = e.rx; e.ry0 = e.ry;
    e.clones = [];
    e.staffFx = [];
    e.spinA = 0;
    e.giant = 0;
    e.fallT = 0;
    e.flickT = 1.4;
    e.hop = 0;
    e.cracks = 0;
    e.crackMax = 10;
    e.face = PI / 2;
    e.guardFn = monkeyGuard;
    [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 20);
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); PV.x = lerp(PV.x, vx, k); PV.y = lerp(PV.y, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    const d = dist(e.x, e.y, p.x, p.y);
    e.hug = d < e.r + 100 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);
    e.far = d > 360 ? (e.far || 0) + dt : Math.max(0, (e.far || 0) - dt * 2);
    for (const f of e.staffFx) f.t -= dt;
    e.staffFx = e.staffFx.filter((f) => f.t > 0);
    e.clones = e.clones.filter((c) => !c.dead);
    if (!e.hidden && e.action !== 'phase') touchR(e, 0.4);
    if (!e.hidden) [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 6);

    // The edge: off the rock for a moment (not mid-dash) and you fall.
    if (e.action !== 'phase' && !p.dead) {
      if (platK(e, p.x, p.y) > 1 && !p.dashing) {
        e.fallT += dt;
        if (e.fallT > 0.1) fall(e, p);
      } else e.fallT = 0;
    }
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 5 * dt);
    const sp = e.speed * (p2(e) ? 1.2 : 1);
    if (d > 300) forward(e, sp, dt, a);
    else if (d < 190) forward(e, -sp * 0.8, dt, a);
    forward(e, sp * 0.65, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.5) e.sign *= -1;
    [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 8);
    e.hop += dt * 9;
    // A flick of the staff: two sparks, never a quiet moment.
    if ((e.flickT -= dt) <= 0) {
      e.flickT = p2(e) ? 0.85 : 1.05;
      const la = leadAt(e.x, e.y, p, 270, 0.85);
      for (const k of [-0.16, 0, 0.16]) shot(e, la + k, 270, { shape: 'orb', r: 6, color: GOLD, dmg: 0.38, life: 4 });
      sfx.swing(1.6);
    }
  },

  choose(e, p, d) {
    const pool = [
      ['poke', 2.6],
      ['combo', e.hug > 0.5 ? 7 : d < 230 ? 4 : 0.8],
      ['spin', e.far > 1 ? 3 : 1.8],
      ['somersault', e.far > 0.8 || d > 320 ? 3.2 : 1],
      ['clones', 2.2],
      ['pillar', 2],
      ['stone', 1.4],
      ['boomerang', 2],
      ['dive', d > 300 ? 2.8 : 1.6],
      ['transform', 4],
    ];
    if (p2(e)) pool.push(['heaven', 3.5]);
    return pool;
  },

  // --- phase 2: THE GREAT SAGE AWAKENS -------------------------------------------------
  onPhase(e) {
    e.marks = {};
    e.spinning = false;
    e.stone = false;
    e.giant = 0;
    e.cudgel = null;
    popAll(e);
    say(e, 'Enough games. Now I get serious!', GOLD);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.face += dt * (k < 0.5 ? 8 : 2);
    e.aura = k;
    // The summit crumbles to a smaller rock.
    const s = clamp((k - 0.35) / 0.5, 0, 1);
    e.rx = lerp(e.rx0, arena.w * 0.36, s);
    e.ry = lerp(e.ry0, arena.h * 0.35, s);
    if (s > 0 && s < 1 && Math.random() < dt * 30) {
      const c = center();
      const a = rand(0, TAU);
      burst(c.x + Math.cos(a) * e.rx, c.y + Math.sin(a) * e.ry, { count: 3, color: '#6a6078', speed: 90, size: 5, life: 0.8, gravity: 200, drag: 1, shape: 'shard' });
    }
    [p.x, p.y] = clampPlat(e, p.x, p.y, p.r + 10);
    if (Math.random() < dt * 20) burst(e.x + rand(-24, 24), e.y + rand(-24, 24), { count: 2, color: GOLD, speed: 180, size: 4, life: 0.5, gravity: -80, drag: 2 });
    once('roar', 0.3, () => { ring(e.x, e.y, { r0: 10, r1: 320, color: GOLD, life: 0.7, width: 10 }); shake(0.8); flash(0.3, GOLD); });
    once('crumble', 0.4, () => { sfx.explode(); shake(0.6); });
  },
  afterPhase(e) {
    Object.assign(e.cool, { heaven: 8, transform: 3 });
  },

  moves: {
    // 1. Extending Staff: a thin lane — then the staff shoots out the whole
    //    length of it (twice in phase 2).
    poke: {
      cooldown: 2.6,
      start(e, p) { e.left = p2(e) ? 2 : 1; aimPoke(e, p, 0.4); },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.t <= 0) {
            strikeLane(e, e.x, e.y, e.aim, POKE_LEN, 20, 0.9, 300);
            e.left--;
            if (e.left > 0) aimPoke(e, p, 0.3);
            else sub(e, 'rest', 0.35);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 2. Staff Combo: a sweep left, a sweep right, then the staff comes down.
    combo: {
      cooldown: 4,
      start(e, p) { e.step = 0; comboStep(e, p); },
      update(e, dt, p) {
        if (e.t > 0) {
          if (e.sub === 'cut') { forward(e, 60, dt, e.face); [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 6); }
          return;
        }
        if (e.step < 2) { cutLands(e, 2.0, 140, 0.6); e.step++; comboStep(e, p); return; }
        if (e.step === 2) { shake(0.4); sfx.thud(); e.exposed = 0.5; e.step = 3; sub(e, 'rest', 0.5); return; }
        idle(e, 0.3);
      },
    },

    // 3. Staff Spin: the staff becomes a wheel — shots bounce off it — and he
    //    comes for you, throwing sparks. Then he's dizzy.
    spin: {
      cooldown: 7,
      start(e) { e.spinning = true; e.ringT = 0.3; say(e, 'Go on, shoot me!'); sub(e, 'spin', p2(e) ? 2.8 : 2.4); },
      update(e, dt, p) {
        if (e.sub === 'spin') {
          turnToward(e, angleTo(e.x, e.y, p.x, p.y), 3 * dt);
          forward(e, p2(e) ? 240 : 210, dt, e.face);
          [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 6);
          e.spinA += dt * 18;
          touchR(e, 0.6, 44);
          for (const pr of world.projectiles) {
            if (pr.friendly && !pr.cleared && dist(pr.x, pr.y, e.x, e.y) < 92) {
              pr.cleared = true;
              burst(pr.x, pr.y, { count: 4, color: GOLD, speed: 200, size: 3, life: 0.25, drag: 5, shape: 'spark' });
            }
          }
          if ((e.ringT -= dt) <= 0) {
            e.ringT = 0.42;
            const off = rand(0, TAU);
            for (let k = 0; k < 8; k++) shot(e, off + (k / 8) * TAU, 200, { shape: 'orb', r: 6, color: GOLD, dmg: 0.35, life: 3 });
          }
          if (e.t <= 0) { e.spinning = false; e.exposed = 0.9; say(e, 'Dizzy…', PALEGOLD); sub(e, 'dizzy', 0.9); }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 4. Cloud Somersault: a lane across the summit, and he tumbles down it
    //    on a cloud — which bursts behind him. Twice in phase 2.
    somersault: {
      cooldown: 6,
      start(e, p) { e.left = p2(e) ? 2 : 1; aimSault(e, p, p2(e) ? 0.44 : 0.5); },
      update(e, dt, p) {
        if (e.sub === 'wind') { if (e.t <= 0) { e.lungeD = 0; e.puffAt = 0; sub(e, 'go', 2); sfx.dash(); } return; }
        if (e.sub === 'go') {
          const step = 1100 * dt;
          e.x += Math.cos(e.aim) * step;
          e.y += Math.sin(e.aim) * step;
          e.lungeD += step;
          e.spinA += dt * 20;
          touchR(e, 0.8, 30);
          if (e.lungeD - e.puffAt >= 64) { e.puffAt = e.lungeD; blastAt(e, e.x, e.y, 46, 0.55, 0.5, CLOUD); }
          if (e.lungeD >= e.saultLen || platK(e, e.x, e.y, e.r) > 1) {
            [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 6);
            e.left--;
            if (e.left > 0) aimSault(e, p, 0.34);
            else sub(e, 'rest', 0.4);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 5. Clone Army: he plucks hairs and blows — copies of him ring you, and
    //    one after another they strike. Only his staff glows gold. Pop a
    //    clone and its strike never comes.
    clones: {
      cooldown: 12,
      start(e) { say(e, 'One of me is too few!'); sfx.chime(); sub(e, 'pluck', 0.6); },
      update(e, dt, p) {
        if (e.sub === 'pluck') {
          if (Math.random() < dt * 30) burst(e.x, e.y, { count: 1, color: FUR, speed: 140, size: 2.5, life: 0.5, drag: 2 });
          if (e.t <= 0) { spawnArmy(e, p); sub(e, 'army', 9); }
          return;
        }
        if (e.sub === 'army') {
          for (const q of e.pokes) {
            if (q.done || e.st < q.at) continue;
            q.done = true;
            if (!q.src.dead) strikeLane(e, q.src.x, q.src.y, q.a, CLONE_LEN, 18, 0.7, 240);
          }
          if (e.st > e.armyEnd) { popAll(e); sub(e, 'rest', 0.35); }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 6. Pillar Slam: the staff grows as tall as a pillar (the wide red lane),
    //    comes down, and splits the rock — shards fly out to both sides.
    pillar: {
      cooldown: 8,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.aim;
        const T = p2(e) ? 0.75 : 0.9;
        lane(e, T, PILLAR_LEN, 96, RED);
        say(e, 'Grow!', RED);
        sfx.telegraph();
        sub(e, 'grow', T);
      },
      update(e) {
        if (e.sub === 'grow') {
          e.giant = clamp(e.st / (e.clipTime || 1), 0, 1);
          if (e.t <= 0) {
            strikeLane(e, e.x, e.y, e.aim, PILLAR_LEN, 48, 1.3, 420);
            shake(0.7);
            sfx.explode();
            const c = Math.cos(e.aim), s = Math.sin(e.aim);
            for (let i = 1; i <= 5; i++) {
              const px = e.x + c * i * 140, py = e.y + s * i * 140;
              for (const sd of [-1, 1]) for (const j of [-0.25, 0.25]) {
                shot(e, e.aim + sd * PI / 2 + j, 180, { x: px, y: py, off: 0, shape: 'rock', r: 7, color: '#b8a07a', dmg: 0.4, life: 3 });
              }
            }
            e.exposed = 1.0;
            sub(e, 'stuck', 1.0);
          }
          return;
        }
        e.giant = clamp(e.t, 0, 1);
        if (e.t <= 0) { e.giant = 0; idle(e, 0.3); }
      },
    },

    // 7. Stone Monkey: he turns to stone — blows barely hurt, but every one
    //    cracks him. Crack him enough and the stone shatters (he's wide
    //    open); leave him and he pounds the ground, then bursts out.
    stone: {
      cooldown: 16,
      start(e) {
        e.stone = true;
        e.cracks = 0;
        e.crackMax = p2(e) ? 12 : 10;
        e.poundT = 0.9;
        say(e, 'Skin of stone!', '#d8d0c0');
        ring(e.x, e.y, { r0: 8, r1: 90, color: '#b8b0a0', life: 0.4, width: 6 });
        sfx.thud();
        sub(e, 'stone', 4.5);
      },
      update(e, dt, p) {
        if (e.sub === 'stone') {
          if (!e.stone) return;
          turnToward(e, angleTo(e.x, e.y, p.x, p.y), 2 * dt);
          forward(e, 95, dt, e.face);
          [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 6);
          touchR(e, 0.7, 36);
          if ((e.poundT -= dt) <= 0) {
            e.poundT = p2(e) ? 1.0 : 1.2;
            shockwave(e, { speed: 260, dmg: 0.6, color: '#b8b0a0' });
            shake(0.3);
            sfx.thud();
          }
          if (e.t <= 0) {
            e.stone = false;
            const off = rand(0, TAU);
            for (let k = 0; k < 12; k++) shot(e, off + (k / 12) * TAU, 230, { shape: 'rock', r: 8, color: '#b8b0a0', dmg: 0.45, life: 3 });
            burst(e.x, e.y, { count: 24, color: '#b8b0a0', speed: 300, size: 5, life: 0.5, drag: 3, shape: 'shard' });
            say(e, 'Ha! Too slow!');
            sfx.explode();
            idle(e, 0.4);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 8. Cudgel Throw: the staff flies out spinning down its lane… and comes
    //    back to his hand.
    boomerang: {
      cooldown: 6,
      start(e, p) {
        e.aim = leadAt(e.x, e.y, p, 760, 0.4);
        e.face = e.aim;
        lane(e, 0.5, 600, 44, GOLD);
        sfx.telegraph();
        sub(e, 'wind', 0.5);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.t <= 0) { e.cudgel = { x: e.x, y: e.y, a: e.aim, d: 0, back: false, spin: 0, hit: false }; sfx.whirr(); sub(e, 'thrown', 3); }
          return;
        }
        const C = e.cudgel;
        if (!C) { idle(e, 0.3); return; }
        C.spin += dt * 20;
        const sp = 760;
        if (!C.back) {
          C.x += Math.cos(C.a) * sp * dt;
          C.y += Math.sin(C.a) * sp * dt;
          C.d += sp * dt;
          if (C.d >= 600) { C.back = true; C.hit = false; }
        } else {
          const a = angleTo(C.x, C.y, e.x, e.y);
          C.x += Math.cos(a) * sp * dt;
          C.y += Math.sin(a) * sp * dt;
          if (dist(C.x, C.y, e.x, e.y) < 30) { e.cudgel = null; idle(e, 0.3); return; }
        }
        if (!C.hit && p && !p.dead && dist(C.x, C.y, p.x, p.y) < 38 + p.r * 0.5) {
          if (damagePlayer(Math.round(e.damage * 0.8), C.x, C.y, e.type)) C.hit = true;
        }
        forward(e, 80, dt, e.face + (PI / 2) * e.sign);
        [e.x, e.y] = clampPlat(e, e.x, e.y, e.r + 6);
        if (e.t <= 0) { e.cudgel = null; idle(e, 0.3); }
      },
    },

    // 9. Cloud Dive: up into the clouds — his shadow marks where he lands —
    //    two dives (three in phase 2), the last with a shockwave.
    dive: {
      cooldown: 7,
      start(e) { e.left = p2(e) ? 3 : 2; jumpUp(e, 0.45); },
      update(e, dt, p) {
        if (e.sub === 'up') {
          if (e.t <= 0) {
            const [x, y] = clampPlat(e, p.x + PV.x * 0.3, p.y + PV.y * 0.3, 30);
            e.land = { x, y };
            const T = p2(e) ? 0.7 : 0.8;
            blastAt(e, x, y, 95, T, 1.0, GOLD);
            sub(e, 'fall', T);
          }
          return;
        }
        if (e.sub === 'fall') {
          if (e.t <= 0) {
            e.x = e.land.x; e.y = e.land.y;
            e.hidden = false; e.invuln = false;
            smoke(e.x, e.y);
            shake(0.5);
            e.left--;
            if (e.left <= 0) { shockwave(e, { speed: 280, dmg: 0.6, color: GOLD }); e.exposed = 0.7; sub(e, 'rest', 0.7); }
            else jumpUp(e, 0.25);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 10. SEVENTY-TWO TRANSFORMATIONS: a puff of smoke, and he's a guardian
    //     you've beaten, for one of its moves (two back to back in phase 2).
    transform: {
      cooldown: 18,
      start(e) {
        e.cool.transform = p2(e) ? 11 : 18;
        const pool = formPool();
        e.formQueue = p2(e) ? [pick(pool), pick(pool)] : [pick(pool)];
        nextForm(e);
      },
      update(e, dt, p) {
        if (e.sub === 'poof') {
          if (e.t <= 0) { e.form = e.formQueue.shift(); FORMS[e.form].start(e, p); }
          return;
        }
        if (e.sub === 'unpoof') {
          if (e.t <= 0) { if (e.formQueue.length) nextForm(e); else idle(e, 0.4); }
          return;
        }
        if (!e.form || FORMS[e.form].update(e, dt, p)) endForm(e);
      },
    },

    // 11. HEAVEN-SPLITTING STAFF (phase 2 barrage): in the middle of the
    //     summit his staff grows across the whole sky and sweeps round — both
    //     ends — while rings of sparks roll out. Then he's spent.
    heaven: {
      cooldown: 30,
      start(e, p) {
        const c = center();
        e.hv = { x: c.x, y: c.y, a: angleTo(c.x, c.y, p.x, p.y) + PI / 2, ringT: 1.2, hitT: 0 };
        say(e, 'Staff, split the heavens!', GOLD);
        sub(e, 'walk', 1.0);
      },
      update(e, dt, p) {
        const H = e.hv;
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, H.x, H.y);
          if (d > 8) forward(e, Math.min(460, d / dt), dt, angleTo(e.x, e.y, H.x, H.y));
          if (d <= 8 || e.t <= 0) { e.face = H.a; sfx.roar(1.2); sub(e, 'warn', 1.0); }
          return;
        }
        if (e.sub === 'warn') {
          e.giant = clamp(e.st / 1.0, 0, 1);
          if (e.t <= 0) sub(e, 'sweep', 5.5);
          return;
        }
        H.a += (0.85 + e.st * 0.04) * dt;
        e.face = H.a;
        e.giant = 1;
        H.hitT -= dt;
        if (H.hitT <= 0) {
          for (const s of [0, PI]) {
            if (inLane(p, e.x, e.y, H.a + s, HEAVEN_LEN, 16) && damagePlayer(Math.round(e.damage * 0.9), e.x, e.y, e.type)) { H.hitT = 0.6; break; }
          }
        }
        if ((H.ringT -= dt) <= 0) {
          H.ringT = 1.1;
          const gap = angleTo(e.x, e.y, p.x, p.y) + rand(-0.4, 0.4);
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * TAU;
            if (Math.abs(angleDiff(gap, a)) < 0.45) continue;
            shot(e, a, 150, { shape: 'orb', r: 6, color: PALEGOLD, dmg: 0.35, life: 6 });
          }
        }
        if (e.t <= 0) { e.giant = 0; expose(e, 2.0); }
      },
    },
  },

  // --- drawing ------------------------------------------------------------------------

  draw(e, ctx) {
    const t = world.runTime;
    for (const c of e.clones) {
      if (c.dead) continue;
      drawMonkey(ctx, c.x, c.y, c.face || 0, e.r, t, { glow: false, alpha: 0.95, flash: 0 });
    }
    drawMonkey(ctx, e.x, e.y - Math.abs(Math.sin(e.hop || 0)) * 3, e.face || 0, e.r, t, {
      glow: true, alpha: 1, flash: e.flash, stone: e.stone, cracks: e.cracks, crackMax: e.crackMax,
      spinning: e.spinning || e.action === 'somersault' && e.sub === 'go', spinA: e.spinA,
      // A faint glow even in phase 1: the real sage stands out from his clones.
      aura: e.phase >= 2 ? 1 : Math.max(0.4, e.aura || 0), form: e.form ? FORMS[e.form] : null, unarmed: !!e.cudgel,
      shell: e.form === 'turtle',
    });
  },

  drawExtras(e, ctx, t) {
    // Where he'll land from a dive or a leap.
    if (e.hidden && e.land && (e.sub === 'fall' || e.sub === 'f-up')) {
      const k = clamp(e.st / (e.clipTime || 1), 0, 1);
      ctx.globalAlpha = 0.25 + k * 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(e.land.x, e.land.y, 14 + k * 16, 7 + k * 8, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Staff strikes: the flash of a staff shooting out.
    for (const f of e.staffFx) {
      ctx.globalAlpha = clamp(f.t / 0.2, 0, 1);
      staffLine(ctx, f.x, f.y, f.a, f.len, 7, true);
      ctx.globalAlpha = 1;
    }
    // The giant staff (Pillar Slam, Heaven-Splitting Staff).
    if (e.giant > 0) {
      if (e.action === 'heaven') {
        for (const s of [0, PI]) staffLine(ctx, e.x, e.y, e.face + s, HEAVEN_LEN * e.giant, 16, e.sub === 'sweep');
      } else if (e.action === 'pillar') {
        staffLine(ctx, e.x, e.y, e.aim, PILLAR_LEN * e.giant, 22, e.sub === 'stuck');
      }
    }
    // The thrown cudgel.
    if (e.cudgel) {
      const C = e.cudgel;
      ctx.save();
      ctx.translate(C.x, C.y);
      ctx.rotate(C.spin);
      staffLine(ctx, -38, 0, 0, 76, 7, true);
      ctx.restore();
    }
    // A transformed form's mark over his head.
    if (e.form && !e.hidden) formIcon(ctx, e.form, e.x, e.y - e.r - 20, FORMS[e.form].color);
    if (e.exposed > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.action === 'phase') {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      const b = arenaBounds();
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = GOLD;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 44px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText('THE GREAT SAGE AWAKENS', (b.l + b.r) / 2, b.t + arena.h * 0.2);
      ctx.globalAlpha = 1;
    }
  },

  /** A mountaintop above a dusk sea of cloud. */
  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'monkey' && !q.dead);
    const b = arenaBounds();
    const w = b.r - b.l, h = b.b - b.t;
    const c = center();
    const rx = e ? e.rx : w * 0.44, ry = e ? e.ry : h * 0.43;
    // The cloud sea.
    const sky = ctx.createLinearGradient(0, b.t, 0, b.b);
    sky.addColorStop(0, '#2a2150');
    sky.addColorStop(1, '#5a3a6a');
    ctx.fillStyle = sky;
    ctx.fillRect(b.l, b.t, w, h);
    for (let k = 0; k < 18; k++) {
      const x = b.l + ((k * 151 + t * (14 + (k % 5) * 4)) % (w + 200)) - 100;
      const y = b.t + ((k * 89) % h);
      ctx.fillStyle = 'rgba(255,220,240,0.09)';
      for (const [ox, oy, rr] of [[0, 0, 34], [30, 6, 26], [-28, 8, 24]]) {
        ctx.beginPath(); ctx.arc(x + ox, y + oy, rr, 0, TAU); ctx.fill();
      }
    }
    // The summit rock.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 16, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3c3550';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#463e5c';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx * 0.8, ry * 0.8, 0, 0, TAU); ctx.fill();
    // A gold circle of marks carved in it.
    ctx.strokeStyle = 'rgba(255,212,94,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx * 0.5, ry * 0.5, 0, 0, TAU); ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + t * 0.05;
      ctx.fillStyle = 'rgba(255,212,94,0.22)';
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * rx * 0.5, c.y + Math.sin(a) * ry * 0.5, 5, 0, TAU); ctx.fill();
    }
    // Cloud froth along the edge, and the edge itself.
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU;
      ctx.fillStyle = 'rgba(240,235,255,0.2)';
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * rx, c.y + Math.sin(a) * ry, 13 + 4 * Math.sin(t * 2 + k), 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,240,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU); ctx.stroke();
    // Too close to the edge: it flushes red where you stand.
    const p = world.player;
    if (e && p) {
      const k = platK(e, p.x, p.y);
      if (k > 0.86) {
        const a = Math.atan2((p.y - c.y) / ry, (p.x - c.x) / rx);
        ctx.strokeStyle = `rgba(255,94,110,${clamp((k - 0.86) / 0.14, 0, 1) * (0.7 + Math.sin(t * 14) * 0.3)})`;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, a - 0.35, a + 0.35); ctx.stroke();
      }
    }
  },
};

function aimPoke(e, p, t) {
  e.aim = leadAt(e.x, e.y, p, 1400, 0.3);
  e.face = e.aim;
  lane(e, t, POKE_LEN, 40, GOLD);
  sfx.telegraph();
  sub(e, 'wind', t);
}

function comboStep(e, p) {
  const T = p2(e) ? 0.32 : 0.38;
  e.face = angleTo(e.x, e.y, p.x, p.y) + (e.step === 0 ? -0.3 : e.step === 1 ? 0.3 : 0);
  if (e.step < 2) {
    spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.face, arc: 2.0, r: 140, delay: T, color: GOLD, owner: e, follow: e });
    sub(e, 'cut', T);
  } else {
    const S = p2(e) ? 0.4 : 0.46;
    blastAt(e, e.x + Math.cos(e.face) * 85, e.y + Math.sin(e.face) * 85, 80, S, 1.0, RED);
    sub(e, 'slam', S);
  }
  sfx.telegraph();
}

function aimSault(e, p, t) {
  e.aim = angleTo(e.x, e.y, p.x, p.y);
  e.face = e.aim;
  e.saultLen = Math.min(720, dist(e.x, e.y, p.x, p.y) + 220);
  lane(e, t, e.saultLen, 2 * (e.r + 10), CLOUD);
  sfx.telegraph();
  sub(e, 'wind', t);
}

function jumpUp(e, t) {
  e.hidden = true;
  e.invuln = true;
  smoke(e.x, e.y);
  sfx.dash();
  sub(e, 'up', t);
}

// --- art --------------------------------------------------------------------------

/** A bamboo staff with bronze caps, from (x, y) along angle a. */
function staffLine(ctx, x, y, a, len, width, glow) {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  ctx.lineCap = 'round';
  if (glow) { ctx.shadowColor = GOLD; ctx.shadowBlur = 12; }
  ctx.strokeStyle = '#6f9a3a';
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#c89a3a';
  const cap = Math.min(18, len * 0.12);
  for (const [sx, sy, dx, dy] of [[x, y, Math.cos(a), Math.sin(a)], [ex, ey, -Math.cos(a), -Math.sin(a)]]) {
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx * cap, sy + dy * cap); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/**
 * The sage from above: a curling tail, a cream travelling robe with a red
 * rope sash, bronze-gold fur, round ears, a crown of three leaves, and the
 * bamboo staff held across him (a blur when it spins).
 */
function drawMonkey(ctx, x, y, face, r, t, o) {
  ctx.save();
  ctx.globalAlpha = o.alpha;
  if (o.aura > 0) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, r * 2.8);
    g.addColorStop(0, `rgba(255,200,97,${0.35 * o.aura})`);
    g.addColorStop(1, 'rgba(255,200,97,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.8, 0, TAU); ctx.fill();
  }
  ctx.translate(x, y);
  ctx.rotate(face);
  const stone = o.stone;
  const fur = o.flash > 0 ? '#ffffff' : stone ? '#8a8478' : FUR;
  // Tail.
  ctx.strokeStyle = fur;
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = 'round';
  const sw = Math.sin(t * 3) * r * 0.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.bezierCurveTo(-r * 1.4, sw, -r * 1.7, -sw, -r * 2.1, sw * 0.6);
  ctx.quadraticCurveTo(-r * 2.4, sw * 0.6 + r * 0.3, -r * 2.2, sw * 0.6 + r * 0.45);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Shell (turtle form) under the robe.
  if (o.shell) {
    ctx.fillStyle = '#4fae7c';
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 1.15, r * 1.1, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2f6e4c';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Robe.
  ctx.fillStyle = o.flash > 0 ? '#ffffff' : stone ? '#9a9488' : '#e9e2cf';
  ctx.strokeStyle = '#2a2230';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.85, r * 0.95, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // A sky-blue collar and the red rope sash.
  ctx.strokeStyle = stone ? '#7a7468' : '#4a7ab8';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath(); ctx.ellipse(r * 0.15, 0, r * 0.55, r * 0.7, 0, -PI / 2, PI / 2); ctx.stroke();
  ctx.strokeStyle = stone ? '#6a6458' : '#d8423a';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.85); ctx.lineTo(r * 0.1, r * 0.85); ctx.stroke();
  ctx.fillStyle = stone ? '#6a6458' : '#d8423a';
  ctx.beginPath(); ctx.arc(-r * 0.1, 0, r * 0.14, 0, TAU); ctx.fill();
  // The staff, held across (or spinning).
  if (!o.unarmed) {
    ctx.save();
    if (o.spinning) {
      ctx.rotate(o.spinA - face);
      ctx.globalAlpha = o.alpha * 0.35;
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, TAU); ctx.fill();
      ctx.globalAlpha = o.alpha;
      staffLine(ctx, 0, -r * 1.8, PI / 2, r * 3.6, r * 0.2, o.glow);
    } else {
      staffLine(ctx, r * 0.5, -r * 1.7, PI / 2, r * 3.4, r * 0.2, o.glow);
    }
    ctx.restore();
  }
  // Hands on the staff.
  ctx.fillStyle = fur;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(r * 0.5, sd * r * 0.62, r * 0.17, 0, TAU); ctx.fill(); }
  // Head: fur, ears, a lighter face, dark eyes.
  ctx.fillStyle = fur;
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.arc(r * 0.2, sd * r * 0.5, r * 0.17, 0, TAU); ctx.fill();
    ctx.fillStyle = stone ? '#9a9488' : '#e8a8a0';
    ctx.beginPath(); ctx.arc(r * 0.2, sd * r * 0.5, r * 0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = fur;
  }
  ctx.beginPath(); ctx.arc(r * 0.28, 0, r * 0.48, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2a2230';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = stone ? '#aaa498' : '#f0d2a0';
  ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.24, r * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a1420';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(r * 0.6, sd * r * 0.12, r * 0.06, 0, TAU); ctx.fill(); }
  // A crown of three leaves.
  ctx.fillStyle = stone ? '#7a7468' : '#5fb85a';
  for (const k of [-1, 0, 1]) {
    ctx.beginPath(); ctx.ellipse(r * 0.02, k * r * 0.2, r * 0.16, r * 0.07, k * 0.5, 0, TAU); ctx.fill();
  }
  // Stone cracks.
  if (stone && o.crackMax) {
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 1.5;
    const n = Math.min(o.cracks, o.crackMax);
    for (let k = 0; k < n; k++) {
      const a = k * 2.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
      ctx.lineTo(Math.cos(a + 0.3) * r * 0.6, Math.sin(a + 0.3) * r * 0.6);
      ctx.lineTo(Math.cos(a - 0.1) * r * 0.9, Math.sin(a - 0.1) * r * 0.9);
      ctx.stroke();
    }
  }
  // A borrowed form's outline.
  if (o.form) {
    ctx.strokeStyle = o.form.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = o.alpha * (0.6 + Math.sin(t * 10) * 0.3);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** A small mark of the borrowed form, over his head. */
function formIcon(ctx, type, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  switch (type) {
    case 'turtle': ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, 0, TAU); ctx.fill(); break;
    case 'croc': ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(12, 0); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill(); break;
    case 'gorilla': for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 6, 0, 5, 0, TAU); ctx.fill(); } break;
    case 'peacock': for (const a of [-0.6, 0, 0.6]) { ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(Math.sin(a) * 12, 6 - Math.cos(a) * 14); ctx.stroke(); } break;
    case 'vesper': ctx.beginPath(); ctx.ellipse(0, 3, 12, 3.5, 0, 0, TAU); ctx.fill(); ctx.fillRect(-5, -6, 10, 8); break;
    case 'naga': ctx.beginPath(); ctx.moveTo(-10, 4); ctx.bezierCurveTo(-4, -8, 4, 12, 10, -4); ctx.stroke(); break;
    case 'solaris': ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(8, -6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(12, -9); ctx.lineTo(5, -7); ctx.lineTo(9, -2); ctx.closePath(); ctx.fill(); break;
    case 'aldric': ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a1a22'; ctx.fillRect(-1.5, -5, 3, 10); break;
    case 'bride': ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(10, 4, 0, 9); ctx.quadraticCurveTo(-10, 4, 0, -9); ctx.fill(); break;
    case 'warden': for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 3, 4); ctx.lineTo(sd * 10, -9); ctx.lineTo(sd * 9, 5); ctx.closePath(); ctx.fill(); } break;
    default: break;
  }
  ctx.restore();
}
