// Spells (Version 4). A run starts with none: spells come from Spell doors
// (pick 1 of 3). Up to four are equipped, shown as a row at the bottom of the
// screen; taking a spell you already know levels it up (max 3). With four
// equipped, a new one asks which to replace.
//
// Each spell has an element that does ONE clear thing, and no two elements
// combine (there are no reactions):
//   fire      → burns: damage over time          (e.burn, ticked in combat.js)
//   ice       → slows                             (e.slow)
//   lightning → a short stun (bosses are immune)  (e.stunT)
//   wind      → knockback;  earth → a wall;  poison → drains health to you
//   arcane / void → no status, just what the spell does
//
// Each spell has its own cooldown (doubled after the first phone test, at
// the owner's request: spells are strong, so they should be rarer). Casting: touch = the four buttons in the
// bottom row; keyboard = 1-4; controller = hold R1 and press ✕ ○ □ △.
//
// To add a spell: one entry in SPELLS
//   { id, name, short, element, cd, glyph, aim: 'self'|'cone'|'target'|'place',
//     desc, up (what a level adds), cast(p, aim, target, lv) }
// plus, for lasting effects, a zone type in updateSpellZones / drawSpellZones,
// or a channel case in updateChannel. Spell doors offer SPELLS automatically.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, dist, angleTo, angleDiff, rand } from './util.js';
import { input } from './input.js';
import { dealDamage, nearestEnemy, enemiesInRadius, healPlayer, setAegisHook } from './combat.js';
import { spawnProjectile } from './spawn.js';
import { burst, ring, damageText, shake } from './fx.js';
import { sfx } from './audio.js';

export const SPELL_SLOTS = 4;
export const SPELL_MAX_LEVEL = 3;
const GLOBAL_CD = 0.3;     // between any two casts
const PLACE_RANGE = 380;   // how far a placed spell can land

export const ELEMENT_INFO = {
  fire:      { name: 'Fire',      color: '#ff7a3d', effect: 'burns' },
  ice:       { name: 'Ice',       color: '#9fe2ff', effect: 'slows' },
  lightning: { name: 'Lightning', color: '#c58bff', effect: 'stuns' },
  wind:      { name: 'Wind',      color: '#9fffcf', effect: 'knocks back' },
  earth:     { name: 'Earth',     color: '#c9a36b', effect: 'blocks' },
  poison:    { name: 'Poison',    color: '#9be34a', effect: 'drains' },
  arcane:    { name: 'Arcane',    color: '#c9b8ff', effect: '' },
  void:      { name: 'Void',      color: '#7a5cff', effect: 'pulls' },
};

export const spellColor = (s) => (s && ELEMENT_INFO[s.element] ? ELEMENT_INFO[s.element].color : '#ffffff');

/** Damage multiplier for a spell's level: +30% per level after the first. */
const power = (lv) => 1 + 0.3 * ((lv || 1) - 1);

// --- the simple statuses ------------------------------------------------------------

/** Fire: damage over time (the strongest burn wins). */
export function burn(e, dps, time = 3) {
  if (!e || e.dead) return;
  e.burn = { dps: Math.max(dps, e.burn ? e.burn.dps : 0), time: Math.max(time, e.burn ? e.burn.time : 0) };
}

/** Ice: slowed to `mult` of normal speed. Bosses are slowed far less. */
export function chill(e, mult = 0.5, time = 2.5) {
  if (!e || e.dead) return;
  const m = e.boss ? Math.max(mult, 0.8) : mult;
  e.slow = { mult: Math.min(m, e.slow ? e.slow.mult : 1), time: Math.max(time, e.slow ? e.slow.time : 0) };
}

/** Lightning: a short stun that cancels the wind-up. Bosses are immune. */
export function stun(e, time = 0.35) {
  if (!e || e.dead || e.boss) return;
  e.stunT = Math.max(e.stunT || 0, time);
}

// --- the spells -------------------------------------------------------------------

export const SPELLS = [
  {
    id: 'fireball', name: 'Fireball', short: 'FIREBALL', element: 'fire', cd: 16, glyph: '☄', aim: 'cone',
    desc: 'Hurl a ball of fire that bursts on the first foe or wall it hits, burning everything in the blast.',
    up: '+30% damage, bigger blast',
    cast(p, aim, target, lv) {
      spawnProjectile({
        x: p.x + Math.cos(aim) * 22, y: p.y + Math.sin(aim) * 22,
        vx: Math.cos(aim) * 560, vy: Math.sin(aim) * 560,
        r: 12, damage: 12 * power(lv), friendly: true, color: '#ff7a3d', shape: 'orb', life: 0.75,
        knockback: 80, trailEvery: 0.015,
        onExpire: (pr) => fireballBurst(pr.x, pr.y, lv),
      });
      sfx.shoot();
    },
  },
  {
    id: 'breath', name: "Dragon's Breath", short: 'BREATH', element: 'fire', cd: 18, glyph: '♨', aim: 'cone',
    desc: 'Channel a cone of fire for a second. Everything caught burns, and small bullets burn away.',
    up: '+30% damage, a longer channel',
    cast(p, aim, target, lv) { p.channel = { id: 'breath', t: 1.0 + 0.2 * (lv - 1), tick: 0, lv }; sfx.whirr(); },
  },
  {
    id: 'meteor', name: 'Meteor Shower', short: 'METEOR', element: 'fire', cd: 48, glyph: '✹', aim: 'place',
    desc: 'Call down meteors over an area. Each impact is marked on the floor first, hits hard and burns.',
    up: '+2 meteors, +30% damage',
    cast(p, aim, target, lv) {
      addZone({ type: 'meteor', x: target.x, y: target.y, r: 150, t: 99, tick: 0.2, left: 7 + 2 * (lv - 1), lv, falling: [] });
      ring(target.x, target.y, { r0: 150, r1: 140, color: '#ff9a4d', life: 0.4, width: 4 });
      sfx.telegraph();
    },
  },
  {
    id: 'nova', name: 'Frost Nova', short: 'NOVA', element: 'ice', cd: 18, glyph: '❄', aim: 'self',
    desc: 'A ring of frost bursts out from you, pushing foes back and slowing them to half speed.',
    up: '+30% damage, a wider ring, a longer slow',
    cast(p, aim, target, lv) {
      const r = 150 + 20 * (lv - 1);
      for (const e of enemiesInRadius(p.x, p.y, r)) {
        dealDamage(e, 18 * power(lv), { knockback: 280, dir: angleTo(p.x, p.y, e.x, e.y), source: 'spell' });
        chill(e, 0.5, 2.5 + 0.5 * (lv - 1));
      }
      ring(p.x, p.y, { r0: 10, r1: r, color: '#9fe2ff', life: 0.4, width: 8 });
      burst(p.x, p.y, { count: 30, color: '#d8f4ff', speed: r * 2.2, size: 4, life: 0.35, drag: 3, shape: 'shard' });
      shake(0.25);
      sfx.block();
    },
  },
  {
    id: 'shards', name: 'Ice Shards', short: 'SHARDS', element: 'ice', cd: 12, glyph: '✧', aim: 'cone',
    desc: 'Fire a spread of ice shards that pierce through foes, slowing each one they hit.',
    up: '+2 shards, +30% damage',
    cast(p, aim, target, lv) {
      const n = 5 + 2 * (lv - 1);
      for (let k = 0; k < n; k++) {
        const a = aim + (k - (n - 1) / 2) * 0.13;
        spawnProjectile({
          x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18,
          vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
          r: 6, damage: 9 * power(lv), friendly: true, color: '#bff0ff', shape: 'shard', life: 0.55,
          pierce: 2, knockback: 40, onHitEnemy: (e) => chill(e, 0.55, 2),
        });
      }
      sfx.shoot();
    },
  },
  {
    id: 'lightning', name: 'Chain Lightning', short: 'CHAIN', element: 'lightning', cd: 14, glyph: 'ϟ', aim: 'target',
    desc: 'Lightning strikes the nearest foe and leaps between enemies, stunning each for a moment.',
    up: '+1 leap, +30% damage',
    cast(p, aim, target, lv) {
      const first = target && target.enemy ? target.enemy : nearestEnemy(p.x, p.y, 460);
      if (!first) { const t = aheadPoint(p, aim, 200); bolt(t.x, t.y); sfx.beam(); return; }
      const hit = new Set();
      let cur = first, prev = null, jumps = 3 + (lv - 1);
      while (cur && jumps >= 0) {
        hit.add(cur);
        if (prev) arcFx(prev.x, prev.y, cur.x, cur.y); else bolt(cur.x, cur.y);
        dealDamage(cur, (prev ? 14 : 22) * power(lv), { source: 'spell', knockback: 60 });
        stun(cur, 0.4);
        prev = cur;
        cur = nextChain(cur, hit, 230);
        jumps--;
      }
      sfx.beam();
    },
  },
  {
    id: 'missiles', name: 'Minor Missiles', short: 'MISSILES', element: 'arcane', cd: 14, glyph: '✦', aim: 'self',
    desc: 'Arcane missiles fan out and seek your foes, spreading across different targets when they can.',
    up: '+1 missile, +30% damage',
    cast(p, aim, target, lv) {
      const foes = world.enemies
        .filter((e) => !e.dead && !e.spawning && !e.hidden && !e.noTarget && dist(p.x, p.y, e.x, e.y) < 560)
        .sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
      const n = 5 + (lv - 1);
      for (let k = 0; k < n; k++) {
        const a = aim + (k - (n - 1) / 2) * 0.5;
        spawnProjectile({
          x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
          vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
          r: 6, damage: 11 * power(lv), friendly: true, color: '#c9b8ff', shape: 'orb', life: 2.2,
          homing: 7, knockback: 60, trailEvery: 0.02,
          target: foes.length ? foes[k % foes.length] : null,
        });
      }
      sfx.chime();
    },
  },
  {
    id: 'gale', name: 'Gale', short: 'GALE', element: 'wind', cd: 12, glyph: '༄', aim: 'cone',
    desc: 'A blast of wind hurls foes back (slamming them into walls), interrupts their attacks and blows enemy bullets away.',
    up: '+30% damage, a wider blast',
    cast(p, aim, target, lv) {
      const arc = 1.35 + 0.15 * (lv - 1), r = 240;
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.hidden) continue;
        if (!inCone(p, aim, arc, r, e)) continue;
        const a = angleTo(p.x, p.y, e.x, e.y);
        dealDamage(e, 8 * power(lv), { knockback: 950, dir: a, source: 'spell' });
        e.galeT = 0.55;
        if (!e.boss && e.state && e.state !== 'chase') { e.state = 'chase'; e.stunT = Math.max(e.stunT || 0, 0.3); }
      }
      // Bullets in the cone are blown back out as your own.
      for (const pr of world.projectiles) {
        if (pr.friendly || pr.life <= 0) continue;
        if (!inCone(p, aim, arc, r, pr)) continue;
        const a = angleTo(p.x, p.y, pr.x, pr.y);
        const sp = Math.max(300, Math.hypot(pr.vx, pr.vy));
        pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
        pr.friendly = true; pr.color = '#9fffcf'; pr.hits = null; pr.delay = 0; pr.homing = 0; pr.onExpire = null;
        pr.life = Math.max(pr.life, 1.2);
      }
      coneFx(p, aim, r, arc, '#9fffcf', 'spark');
      shake(0.25);
      sfx.dash();
    },
  },
  {
    id: 'siphon', name: 'Corrosive Siphon', short: 'SIPHON', element: 'poison', cd: 24, glyph: '⚕', aim: 'self',
    desc: 'Channel a draining beam into the nearest foe for 1.6 s. It heals you for half the damage it deals.',
    up: '+30% damage and healing',
    cast(p, aim, target, lv) { p.channel = { id: 'siphon', t: 1.6, tick: 0, target: null, healed: 0, lv }; sfx.whirr(); },
  },
  {
    id: 'aegis', name: 'Aegis', short: 'AEGIS', element: 'arcane', cd: 32, glyph: '◎', aim: 'self',
    desc: 'A shield that absorbs the next 2 hits, then bursts outward, knocking foes back and destroying nearby bullets.',
    up: '+1 hit absorbed (level 3), a stronger burst',
    cast(p, aim, target, lv) {
      p.aegis = { hits: 2 + (lv >= 3 ? 1 : 0), t: 9, lv };
      ring(p.x, p.y, { r0: 10, r1: 44, color: '#8ef0ff', life: 0.35, width: 5 });
      sfx.chime();
    },
  },
  {
    id: 'sigil', name: 'Sigil of Stillness', short: 'SIGIL', element: 'arcane', cd: 32, glyph: '⌬', aim: 'place',
    desc: 'A glyph on the floor for 7 s: foes inside move at half speed, and enemy bullets crossing it crawl at a quarter.',
    up: 'Lasts 2 s longer, a bigger glyph',
    cast(p, aim, target, lv) {
      const r = 135 + 15 * (lv - 1);
      addZone({ type: 'sigil', x: target.x, y: target.y, r, t: 7 + 2 * (lv - 1), tick: 0 });
      ring(target.x, target.y, { r0: 10, r1: r, color: '#8ef0ff', life: 0.5, width: 5 });
      sfx.chime();
    },
  },
  {
    id: 'singularity', name: 'Singularity', short: 'VOID', element: 'void', cd: 36, glyph: '◉', aim: 'place',
    desc: 'A black hole for 2.5 s: pulls foes and enemy bullets in (bullets are swallowed), then implodes.',
    up: '+30% implosion damage, a stronger pull',
    cast(p, aim, target, lv) {
      addZone({ type: 'singularity', x: target.x, y: target.y, r: 240, t: 2.5, tick: 0, lv });
      sfx.whirr();
    },
  },
  {
    id: 'bulwark', name: 'Earthen Bulwark', short: 'WALL', element: 'earth', cd: 20, glyph: '▥', aim: 'cone',
    desc: 'Raise a stone wall in front of you for 5 s. It blocks bullets and bodies, then shatters outward into rock shards.',
    up: 'A longer wall that stands 2 s longer',
    cast(p, aim, target, lv) {
      const d = 78, len = 160 + 30 * (lv - 1);
      const cx = p.x + Math.cos(aim) * d, cy = p.y + Math.sin(aim) * d;
      const vertical = Math.abs(Math.cos(aim)) > Math.abs(Math.sin(aim));
      const w = vertical ? 28 : len, h = vertical ? len : 28;
      const b = arenaBounds();
      const o = {
        x: clamp(cx - w / 2, b.l + 4, b.r - 4 - w), y: clamp(cy - h / 2, b.t + 4, b.b - 4 - h),
        w, h, temp: 5 + 2 * (lv - 1), bulwark: true,
      };
      if (world.room) world.room.obstacles.push(o);
      burst(cx, cy, { count: 24, color: '#c9a36b', speed: 260, size: 5, life: 0.5, drag: 4, shape: 'shard' });
      shake(0.3);
      sfx.thud();
    },
  },
];

export function spellById(id) { return SPELLS.find((s) => s.id === id) || null; }

// --- cooldowns, levels, slots --------------------------------------------------------

export function spellLevel(p, id) { return (p && p.spellLv && p.spellLv[id]) || 0; }

/** A spell's full cooldown at the player's level for it (−12% per level). */
export function spellCooldown(p, s) {
  const lv = Math.max(1, spellLevel(p, s.id));
  return s.cd * (1 - 0.12 * (lv - 1)) * (1 - Math.min(0.5, (p && p.stats && p.stats.spellCdr) || 0));
}

/** Seconds until the spell is ready again (0 = ready). */
export function cooldownLeft(p, id) { return (p && p.spellCds && p.spellCds[id]) || 0; }

/** 1 when ready, rising from 0 while it recharges (for the sweep). */
export function cooldownFrac(p, id) {
  const s = spellById(id);
  const left = cooldownLeft(p, id);
  if (!s || left <= 0) return 1;
  return clamp(1 - left / spellCooldown(p, s), 0, 1);
}

/**
 * Three spells for a Spell door: ones you know that can still level up, and
 * ones you don't, mixed. Never an offer of nothing.
 */
export function offerSpells(p, count = 3) {
  const pool = SPELLS.filter((s) => spellLevel(p, s.id) < SPELL_MAX_LEVEL);
  const known = pool.filter((s) => p.spells.includes(s.id));
  const fresh = pool.filter((s) => !p.spells.includes(s.id));
  const shuffled = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const out = [];
  // At least one new spell while there is room or choice; an upgrade when you have spells.
  const f = shuffled(fresh), k = shuffled(known);
  if (f.length) out.push(f.shift());
  if (k.length && out.length < count) out.push(k.shift());
  for (const s of shuffled([...f, ...k])) { if (out.length >= count) break; if (!out.includes(s)) out.push(s); }
  return out;
}

/**
 * Take a spell from a Spell door. Known → level up. New with a free slot →
 * equip. New with four equipped → returns 'full' (the caller asks which slot).
 */
export function learnSpell(p, id, replaceSlot = -1) {
  if (!p.spellLv) p.spellLv = {};
  if (p.spells.includes(id)) {
    p.spellLv[id] = Math.min(SPELL_MAX_LEVEL, spellLevel(p, id) + 1);
    return 'levelled';
  }
  const free = p.spells.length < SPELL_SLOTS;
  if (!free && replaceSlot < 0) return 'full';
  p.spellLv[id] = Math.max(1, spellLevel(p, id));    // a spell you dropped keeps its level
  if (free) p.spells.push(id);
  else p.spells[replaceSlot] = id;
  return 'learned';
}

// --- casting --------------------------------------------------------------------

/** Called from updatePlayer: cooldowns, casting from input, channels. */
export function updateSpells(p, dt) {
  if (!p) return;
  if (!p.spellCds) p.spellCds = {};
  for (const id of Object.keys(p.spellCds)) p.spellCds[id] = Math.max(0, p.spellCds[id] - dt);
  p.spellGcd = Math.max(0, (p.spellGcd || 0) - dt);
  if (p.spellDenied) { p.spellDenied.t -= dt; if (p.spellDenied.t <= 0) p.spellDenied = null; }
  if (p.aegis) { p.aegis.t -= dt; if (p.aegis.t <= 0) p.aegis = null; }

  if (input.spellCast !== null && input.spellCast !== undefined) {
    const id = p.spells[input.spellCast];
    if (id) tryCast(p, id);
  }
  if (p.channel) updateChannel(p, dt);
}

/** Cast a spell by id. False if it can't go off right now. */
export function tryCast(p, id) {
  const spell = spellById(id);
  if (!spell || !p || p.dead) return false;
  if (!p.spellCds) p.spellCds = {};
  if (p.channel || p.dashing || p.spellGcd > 0) return false;
  if (cooldownLeft(p, spell.id) > 0) {
    p.spellDenied = { id: spell.id, t: 0.3 };
    sfx.ui();
    return false;
  }
  const lv = Math.max(1, spellLevel(p, spell.id));
  p.spellCds[spell.id] = spellCooldown(p, spell);
  p.spellGcd = GLOBAL_CD;
  p.attack = null;
  p.charging = false;
  const aim = p.aimAngle;
  const target = spell.aim === 'place' ? placeTarget(p, aim) : spell.aim === 'target' ? targetEnemy(p) : null;
  p.face = aim;
  spell.cast(p, aim, target, lv);
  p.casts = (p.casts || 0) + 1;
  ring(p.x, p.y, { r0: 6, r1: 34, color: spellColor(spell), life: 0.22, width: 3 });
  return true;
}

/** Where a placed spell lands: the mouse, else the nearest foe, else ahead. */
function placeTarget(p, aim) {
  const b = arenaBounds();
  let x, y;
  if (!input.touchMode && !input.padMode && input.grenadeAbs) {
    x = input.grenadeAbs.x; y = input.grenadeAbs.y;
    const d = dist(p.x, p.y, x, y);
    if (d > PLACE_RANGE) { const a = angleTo(p.x, p.y, x, y); x = p.x + Math.cos(a) * PLACE_RANGE; y = p.y + Math.sin(a) * PLACE_RANGE; }
  } else {
    const t = nearestEnemy(p.x, p.y, PLACE_RANGE);
    if (t) { x = t.x; y = t.y; } else { x = p.x + Math.cos(aim) * 200; y = p.y + Math.sin(aim) * 200; }
  }
  return { x: clamp(x, b.l + 20, b.r - 20), y: clamp(y, b.t + 20, b.b - 20) };
}

function targetEnemy(p) {
  const e = nearestEnemy(p.x, p.y, 460);
  return e ? { x: e.x, y: e.y, enemy: e } : null;
}

function aheadPoint(p, aim, d) { return { x: p.x + Math.cos(aim) * d, y: p.y + Math.sin(aim) * d }; }

// --- shapes and effects -------------------------------------------------------------

function inCone(p, aim, arc, r, o) {
  const d = dist(p.x, p.y, o.x, o.y);
  if (d > r + (o.r || 0)) return false;
  if (d < 1) return true;
  return Math.abs(angleDiff(aim, angleTo(p.x, p.y, o.x, o.y))) < arc / 2 + Math.asin(Math.min(1, (o.r || 0) / Math.max(d, 1)));
}

function coneFx(p, aim, r, arc, color, shape) {
  for (let i = 0; i < 26; i++) {
    const a = aim + rand(-arc / 2, arc / 2);
    burst(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, {
      count: 1, color, speed: r * rand(1.4, 2.4), size: 4, life: 0.35, dir: a, spread: 0.1, drag: 3, shape,
    });
  }
}

/** Remove an enemy bullet (swallowed, burnt away): it simply fizzles out. */
function eatBullet(pr) {
  pr.onExpire = null;
  pr.life = 0;
}

function fireballBurst(x, y, lv) {
  const r = 105 + 15 * (lv - 1);
  for (const e of enemiesInRadius(x, y, r)) {
    dealDamage(e, 30 * power(lv), { knockback: 220, dir: angleTo(x, y, e.x, e.y), source: 'spell' });
    burn(e, 8 * power(lv), 3);
  }
  ring(x, y, { r0: 8, r1: r, color: '#ff9a4d', life: 0.32, width: 7 });
  burst(x, y, { count: 24, color: '#ffb35e', speed: 380, size: 5, life: 0.45, drag: 4 });
  shake(0.3);
  sfx.explode();
}

/** Channelled spells: Dragon's Breath (a fire cone) and Corrosive Siphon (a draining beam). */
function updateChannel(p, dt) {
  const c = p.channel;
  c.t -= dt;
  c.tick -= dt;
  const aim = p.aimAngle;
  p.face = aim;
  if (c.id === 'breath') {
    if (Math.random() < dt * 60) {
      const a = aim + rand(-0.5, 0.5);
      burst(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, {
        count: 1, color: Math.random() < 0.5 ? '#ffb35e' : '#ff5e3d', speed: rand(260, 420), size: 5,
        life: 0.45, dir: a, spread: 0.15, drag: 2.5,
      });
    }
    if (c.tick <= 0) {
      c.tick = 0.1;
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.hidden || !inCone(p, aim, 1.0, 190, e)) continue;
        dealDamage(e, 6 * power(c.lv), { knockback: 60, dir: angleTo(p.x, p.y, e.x, e.y), source: 'spell' });
        burn(e, 6 * power(c.lv), 2.5);
      }
      for (const pr of world.projectiles) {
        if (pr.friendly || pr.life <= 0 || pr.r >= 14) continue;
        if (inCone(p, aim, 1.0, 190, pr)) eatBullet(pr);
      }
    }
  } else if (c.id === 'siphon') {
    const t = c.target;
    if (!t || t.dead || t.hidden || dist(p.x, p.y, t.x, t.y) > 360) c.target = nearestEnemy(p.x, p.y, 320);
    if (c.target) p.face = angleTo(p.x, p.y, c.target.x, c.target.y);
    if (c.tick <= 0 && c.target) {
      c.tick = 0.2;
      const dealt = dealDamage(c.target, 5 * power(c.lv), { source: 'spell', dir: angleTo(p.x, p.y, c.target.x, c.target.y) });
      if (dealt > 0) { healPlayer(dealt * 0.5, false); c.healed += dealt * 0.5; }
      burst(c.target.x, c.target.y, { count: 3, color: '#9be34a', speed: 120, size: 3, life: 0.3, drag: 3 });
    }
  }
  if (c.t <= 0 || p.dead) {
    if (c.id === 'siphon' && c.healed >= 1) damageText(p.x, p.y - p.r - 6, `+${Math.round(c.healed)}`, { color: '#7dff9c', size: 17 });
    p.channel = null;
  }
}

function nextChain(from, hit, range) {
  let best = null, bestD = range;
  for (const e of world.enemies) {
    if (e.dead || e.spawning || e.hidden || e.noTarget || hit.has(e)) continue;
    const d = dist(from.x, from.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function bolt(x, y) {
  for (let k = 0; k < 7; k++) {
    burst(x + rand(-8, 8), y - k * 26, { count: 2, color: '#e9d8ff', speed: 60, size: 3.5, life: 0.2, drag: 6, shape: 'spark' });
  }
  ring(x, y, { r0: 4, r1: 46, color: '#c58bff', life: 0.25, width: 4 });
}

function arcFx(x1, y1, x2, y2) {
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    burst(x1 + (x2 - x1) * t + rand(-9, 9), y1 + (y2 - y1) * t + rand(-9, 9), {
      count: 2, color: '#e9d8ff', speed: 70, size: 3, life: 0.22, drag: 6, shape: 'spark',
    });
  }
}

// --- lasting spell zones (sigil, singularity, meteors, bulwark walls) ------------------

function addZone(z) { world.spellZones.push(z); }

/** Upkeep for lasting spells. Runs before projectiles so the sigil slows bullets this frame. */
export function updateSpellZones(dt) {
  for (const pr of world.projectiles) pr.inSigil = false;
  for (let i = world.spellZones.length - 1; i >= 0; i--) {
    const z = world.spellZones[i];
    z.t -= dt;
    z.tick -= dt;
    if (z.type === 'sigil') {
      for (const e of world.enemies) {
        if (e.dead) continue;
        if (dist(e.x, e.y, z.x, z.y) < z.r + e.r * 0.5) e.slow = { mult: e.boss ? 0.75 : 0.5, time: 0.15 };
      }
      for (const pr of world.projectiles) {
        if (!pr.friendly && dist(pr.x, pr.y, z.x, z.y) < z.r) pr.inSigil = true;
      }
    } else if (z.type === 'singularity') {
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.hidden) continue;
        const d = dist(e.x, e.y, z.x, z.y);
        if (d > z.r || d < 6) continue;
        const a = angleTo(e.x, e.y, z.x, z.y);
        const pull = (e.boss ? 0.2 : 1) * (1 + 0.15 * (z.lv - 1)) * (260 * (1 - d / z.r) + 70) / Math.max(1, Math.sqrt(e.mass || 1));
        e.x += Math.cos(a) * pull * dt;
        e.y += Math.sin(a) * pull * dt;
      }
      for (const pr of world.projectiles) {
        if (pr.friendly || pr.life <= 0) continue;
        const d = dist(pr.x, pr.y, z.x, z.y);
        if (d > z.r) continue;
        if (d < 24) { eatBullet(pr); continue; }
        const a = angleTo(pr.x, pr.y, z.x, z.y);
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.vx = pr.vx * 0.9 + Math.cos(a) * sp * 0.1 + Math.cos(a) * 500 * dt;
        pr.vy = pr.vy * 0.9 + Math.sin(a) * sp * 0.1 + Math.sin(a) * 500 * dt;
      }
      if (Math.random() < dt * 30) {
        const a = rand(0, TAU);
        burst(z.x + Math.cos(a) * z.r * 0.8, z.y + Math.sin(a) * z.r * 0.8, { count: 1, color: '#7a5cff', speed: 260, size: 3, life: 0.4, dir: a + Math.PI, spread: 0.1, drag: 0.5 });
      }
      if (z.t <= 0) {
        for (const e of enemiesInRadius(z.x, z.y, 95)) {
          dealDamage(e, 30 * power(z.lv), { source: 'spell', knockback: 300, dir: angleTo(z.x, z.y, e.x, e.y) });
        }
        ring(z.x, z.y, { r0: z.r, r1: 8, color: '#7a5cff', life: 0.3, width: 8 });
        ring(z.x, z.y, { r0: 8, r1: 110, color: '#c7b8ff', life: 0.35, width: 5 });
        shake(0.45);
        sfx.explode();
      }
    } else if (z.type === 'meteor') {
      // A meteor every 0.35 s, each marked on the floor 0.7 s before it lands.
      if (z.left > 0 && z.tick <= 0) {
        z.tick = 0.35;
        z.left--;
        z.falling.push({ ...meteorSpot(z), t: 0.7 });
      }
      for (const m of z.falling) {
        m.t -= dt;
        if (m.t <= 0 && !m.done) {
          m.done = true;
          for (const e of enemiesInRadius(m.x, m.y, 62)) {
            dealDamage(e, 26 * power(z.lv), { knockback: 200, dir: angleTo(m.x, m.y, e.x, e.y), source: 'spell' });
            burn(e, 6 * power(z.lv), 2.5);
          }
          ring(m.x, m.y, { r0: 6, r1: 70, color: '#ffb35e', life: 0.3, width: 6 });
          burst(m.x, m.y, { count: 18, color: '#ff9a4d', speed: 320, size: 5, life: 0.4, drag: 4, shape: 'shard' });
          shake(0.28);
          sfx.explode();
        }
      }
      z.falling = z.falling.filter((m) => !m.done);
      if (z.left <= 0 && !z.falling.length) z.t = 0;
    }
    if (z.t <= 0) world.spellZones.splice(i, 1);
  }

  // Bulwark walls crumble after a while, into shards flying outward.
  if (world.room) {
    const obs = world.room.obstacles;
    for (let i = obs.length - 1; i >= 0; i--) {
      const o = obs[i];
      if (!o.temp) continue;
      o.temp -= dt;
      if (o.temp > 0) continue;
      obs.splice(i, 1);
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        spawnProjectile({
          x: cx, y: cy, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 7, damage: 12,
          friendly: true, shape: 'rock', color: '#c9a36b', life: 0.5, knockback: 140, spin: 8,
        });
      }
      burst(cx, cy, { count: 20, color: '#c9a36b', speed: 280, size: 5, life: 0.5, drag: 4, shape: 'shard' });
      sfx.thud();
    }
  }
}

/** Meteors favour foes inside the area, else anywhere in it. */
function meteorSpot(z) {
  const foes = world.enemies.filter((e) => !e.dead && !e.spawning && !e.hidden && dist(e.x, e.y, z.x, z.y) < z.r + 20);
  const b = arenaBounds();
  let x, y;
  if (foes.length && Math.random() < 0.65) {
    const e = foes[(Math.random() * foes.length) | 0];
    x = e.x + rand(-26, 26); y = e.y + rand(-26, 26);
  } else {
    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * z.r;
    x = z.x + Math.cos(a) * d; y = z.y + Math.sin(a) * d;
  }
  return { x: clamp(x, b.l + 10, b.r - 10), y: clamp(y, b.t + 10, b.b - 10) };
}

/** The Aegis bubble absorbs a hit (called by damagePlayer). True if it did. */
export function aegisAbsorb(p) {
  if (!p.aegis || p.aegis.hits <= 0) return false;
  p.aegis.hits--;
  p.invuln = Math.max(p.invuln, 0.35);
  ring(p.x, p.y, { r0: 30, r1: 50, color: '#8ef0ff', life: 0.25, width: 5 });
  sfx.block();
  if (p.aegis.hits <= 0) {
    // Burst: knockback, a little damage, and nearby bullets destroyed.
    for (const e of enemiesInRadius(p.x, p.y, 160)) {
      dealDamage(e, 20 * power(p.aegis.lv), { source: 'spell', knockback: 600, dir: angleTo(p.x, p.y, e.x, e.y) });
    }
    for (const pr of world.projectiles) {
      if (!pr.friendly && dist(pr.x, pr.y, p.x, p.y) < 170) eatBullet(pr);
    }
    ring(p.x, p.y, { r0: 20, r1: 170, color: '#8ef0ff', life: 0.4, width: 7 });
    shake(0.35);
    damageText(p.x, p.y - p.r - 18, 'AEGIS BURST', { color: '#8ef0ff', size: 15 });
    p.aegis = null;
  }
  return true;
}

// --- drawing ----------------------------------------------------------------------

export function drawSpellZones(ctx, time) {
  for (const z of world.spellZones) {
    const fade = clamp(z.t / 0.4, 0, 1);
    if (z.type === 'sigil') {
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(time * 0.5);
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = '#8ef0ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, z.r * 0.72, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.moveTo(Math.cos(a) * z.r * 0.72, Math.sin(a) * z.r * 0.72);
        ctx.lineTo(Math.cos(a + TAU / 3) * z.r * 0.72, Math.sin(a + TAU / 3) * z.r * 0.72);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.08 * fade;
      ctx.fillStyle = '#8ef0ff';
      ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (z.type === 'singularity') {
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, 60);
      g.addColorStop(0, 'rgba(10,0,20,0.95)');
      g.addColorStop(0.5, 'rgba(60,30,140,0.6)');
      g.addColorStop(1, 'rgba(122,92,255,0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(z.x, z.y, 60, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7a5cff';
      ctx.globalAlpha = 0.35 * fade;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.6 + 0.4 * ((time * 1.5) % 1)), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (z.type === 'meteor') {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#ff9a4d';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      for (const m of z.falling) {
        const k = clamp(1 - m.t / 0.7, 0, 1);
        // The landing mark closes in; the meteor drops from above.
        ctx.globalAlpha = 0.25 + k * 0.5;
        ctx.strokeStyle = '#ff5e3d';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m.x, m.y, 62 * (1 - k * 0.6), 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ff5e3d';
        ctx.beginPath(); ctx.arc(m.x, m.y, 62, 0, TAU); ctx.fill();
        const my = m.y - (1 - k) * 420;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffb35e';
        ctx.beginPath(); ctx.arc(m.x + (1 - k) * 90, my, 11, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff2b0';
        ctx.beginPath(); ctx.arc(m.x + (1 - k) * 90, my, 5, 0, TAU); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Aegis bubble and channelled spells, around the player. */
export function drawPlayerSpells(ctx, p, time) {
  if (!p || p.dead) return;
  if (p.aegis) {
    ctx.globalAlpha = 0.18 + Math.sin(time * 6) * 0.05;
    ctx.fillStyle = '#8ef0ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 16, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#8ef0ff';
    ctx.lineWidth = 2 + p.aegis.hits;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 16, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (p.channel && p.channel.id === 'breath') {
    const aim = p.aimAngle;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ff7a3d';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, 190, aim - 0.5, aim + 0.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (p.channel && p.channel.id === 'siphon' && p.channel.target && !p.channel.target.dead) {
    const t = p.channel.target;
    const a = angleTo(p.x, p.y, t.x, t.y), len = dist(p.x, p.y, t.x, t.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    for (const [w, c, amp] of [[6, 'rgba(155,227,74,0.35)', 7], [2.5, '#d6ff9a', 4]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const x = (k / 16) * len;
        const y = Math.sin(k * 1.3 + time * 22) * amp * Math.sin((k / 16) * Math.PI);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

setAegisHook(aegisAbsorb);
