// Spells (Version 3). Every spell is always yours: four are equipped at a
// time, and the Spellbook (the book button, B, or the pause menu) swaps them
// at any moment of a run. Each spell has its own cooldown, with no shared
// mana, so a slot is simply ready or recharging (a sweep on its button).
// Swapping never resets a cooldown: it belongs to the spell, not the slot.
//
// Casting, Avowed-style: touch = the four spell buttons; keyboard = 1-4;
// controller = hold R1 and press a face button.
//
// Every elemental spell also IMBUES your weapon for a few seconds, so your
// attacks carry that element (cast Downpour, then imbue Storm, and every swing
// electrocutes the soaked). All effects go through dealDamage / elementArea, so
// every reaction in elements.js works with spells for free.
//
// To add a spell: one entry in SPELLS
//   { id, name, short, element, cd, glyph, aim: 'self'|'cone'|'target'|'place', desc, cast(p, aim, target) }
//   (`short` is the label on the phone's spell button)
// plus, for lasting effects, a zone type in updateSpellZones / drawSpellZones,
// or a channel case in updateChannel. The loadout screen and the Spellbook list
// SPELLS automatically.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, dist, angleTo, angleDiff, rand } from './util.js';
import { input } from './input.js';
import { dealDamage, nearestEnemy, enemiesInRadius, setAegisHook, healPlayer } from './combat.js';
import { elementArea, ELEMENTS } from './elements.js';
import { spawnSurface } from './surfaces.js';
import { spawnProjectile } from './spawn.js';
import { burst, ring, damageText, shake } from './fx.js';
import { sfx } from './audio.js';
import { breakBullet } from './projectiles.js';

export const SPELL_SLOTS = 4;
const GLOBAL_CD = 0.3;     // between any two casts
const PLACE_RANGE = 380;   // how far a placed spell can land
const IMBUE_TIME = 4;
const MAX_CDR = 0.6;       // cooldown reduction from boons is capped

export const spellColor = (s) => (s && ELEMENTS[s.element] ? ELEMENTS[s.element].color : '#ffffff');
const col = (el) => (ELEMENTS[el] ? ELEMENTS[el].color : '#ffffff');

// --- the spells -------------------------------------------------------------------

export const SPELLS = [
  {
    id: 'fireball', name: 'Fireball', short: 'FIREBALL', element: 'fire', cd: 8, glyph: '☄', aim: 'cone',
    desc: 'Hurl a ball of fire that bursts on impact in a wide blast and leaves lingering flames. Ignites oil and gas.',
    cast(p, aim) {
      spawnProjectile({
        x: p.x + Math.cos(aim) * 22, y: p.y + Math.sin(aim) * 22,
        vx: Math.cos(aim) * 560, vy: Math.sin(aim) * 560,
        r: 12, damage: 14, friendly: true, color: '#ff7a3d', shape: 'orb', life: 0.75,
        knockback: 80, element: 'fire', trailEvery: 0.015,
        onExpire: (pr) => fireballBurst(pr.x, pr.y),
      });
      sfx.shoot();
    },
  },
  {
    id: 'missiles', name: 'Minor Missiles', short: 'MISSILES', element: 'arcane', cd: 7, glyph: '✦', aim: 'self',
    desc: 'Five arcane missiles fan out and seek your foes, spreading across different targets when they can.',
    cast(p, aim) {
      const foes = world.enemies
        .filter((e) => !e.dead && !e.spawning && !e.hidden && dist(p.x, p.y, e.x, e.y) < 560)
        .sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
      for (let k = 0; k < 5; k++) {
        const a = aim + (k - 2) * 0.5;
        spawnProjectile({
          x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
          vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
          r: 6, damage: 11, friendly: true, color: '#c9b8ff', shape: 'orb', life: 2.2,
          homing: 7, knockback: 60, element: 'arcane', trailEvery: 0.02,
          target: foes.length ? foes[k % foes.length] : null,
        });
      }
      sfx.chime();
    },
  },
  {
    id: 'storm', name: 'Stormcall', short: 'STORM', element: 'storm', cd: 7, glyph: 'ϟ', aim: 'target',
    desc: 'Lightning strikes the nearest foe and chains 3 times, far more among the wet. Electrifies puddles.',
    cast(p, aim, target) {
      const first = target && target.enemy ? target.enemy : nearestEnemy(p.x, p.y, 460);
      if (!first) {
        const t = target || aheadPoint(p, aim, 200);
        bolt(t.x, t.y);
        elementArea('storm', t.x, t.y, 60, { surfaceOnly: true });
        return;
      }
      const hit = new Set();
      let cur = first, jumps = 3;
      let prev = null;
      while (cur && jumps >= 0) {
        hit.add(cur);
        if (prev) arcFx(prev.x, prev.y, cur.x, cur.y); else bolt(cur.x, cur.y);
        const wasWet = !!(cur.status && cur.status.wet && cur.status.wet.t > 0);
        dealDamage(cur, prev ? 14 : 22, { element: 'storm', source: 'spell', knockback: 60 });
        elementArea('storm', cur.x, cur.y, 40, { surfaceOnly: true });
        if (wasWet) jumps += 1;     // the wet carry it further
        prev = cur;
        cur = nextChain(cur, hit, 230);
        jumps--;
      }
      sfx.beam();
    },
  },
  {
    id: 'rime', name: 'Rime', short: 'RIME', element: 'frost', cd: 6, glyph: '❄', aim: 'cone',
    desc: 'A blast of frost in a cone. Chills (three chills freeze), freezes the wet, and turns puddles to ice.',
    cast(p, aim) {
      coneHit(p, aim, 210, 1.15, 16, 'frost');
      coneSurface(p, aim, 210, 'frost');
      coneFx(p, aim, 210, 1.15, '#9fe2ff', 'shard');
      sfx.block();
    },
  },
  {
    id: 'gale', name: 'Gale', short: 'GALE', element: 'wind', cd: 6, glyph: '༄', aim: 'cone',
    desc: 'A blast of wind: hurls foes back (into walls, for damage), interrupts attacks, blows enemy bullets away, spreads fire and scatters clouds.',
    cast(p, aim) {
      const arc = 1.35, r = 240;
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.hidden) continue;
        if (!inCone(p, aim, arc, r, e)) continue;
        const a = angleTo(p.x, p.y, e.x, e.y);
        dealDamage(e, 8, { element: 'wind', knockback: 950, dir: a, source: 'spell' });
        e.galeT = 0.55;
        if (!e.boss && e.state && e.state !== 'chase') { e.state = 'chase'; e.stunT = Math.max(e.stunT || 0, 0.3); }
      }
      // Bullets in the cone are blown back out as your own.
      for (const pr of world.projectiles) {
        if (pr.friendly || pr.cleared) continue;
        if (!inCone(p, aim, arc, r, pr)) continue;
        const a = angleTo(p.x, p.y, pr.x, pr.y);
        const sp = Math.max(300, Math.hypot(pr.vx, pr.vy));
        pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
        pr.friendly = true; pr.color = '#9fffcf'; pr.hits = null; pr.delay = 0; pr.homing = 0; pr.onExpire = null;
        pr.life = Math.max(pr.life, 1.2);
      }
      coneSurface(p, aim, r, 'wind');
      coneFx(p, aim, r, arc, '#9fffcf', 'spark');
      shake(0.25);
      sfx.dash();
    },
  },
  {
    id: 'breath', name: "Dragon's Breath", short: 'BREATH', element: 'fire', cd: 9, glyph: '♨', aim: 'cone',
    desc: 'Channel a cone of fire for a second: burns foes, ignites oil and gas, and burns light bullets out of the air.',
    cast(p) { p.channel = { id: 'breath', t: 1.0, tick: 0 }; sfx.whirr(); },
  },
  {
    id: 'siphon', name: 'Corrosive Siphon', short: 'SIPHON', element: 'toxic', cd: 12, glyph: '⚕', aim: 'self',
    desc: 'Channel a poison beam into the nearest foe for 1.6 s. It poisons them and heals you for half the damage dealt.',
    cast(p) { p.channel = { id: 'siphon', t: 1.6, tick: 0, target: null, healed: 0 }; sfx.whirr(); },
  },
  {
    id: 'downpour', name: 'Downpour', short: 'RAIN', element: 'water', cd: 12, glyph: '☔', aim: 'place',
    desc: 'Rain over an area for 5 s: everything inside is Wet, fires go out, poison washes away. Set up storm and frost combos.',
    cast(p, aim, target) {
      addZone({ type: 'rain', x: target.x, y: target.y, r: 130, t: 5, tick: 0 });
      spawnSurface('water', target.x, target.y, 110, 'player', 8);
      elementArea('water', target.x, target.y, 130);
      sfx.splash();
    },
  },
  {
    id: 'bloom', name: 'Toxic Bloom', short: 'BLOOM', element: 'toxic', cd: 9, glyph: '✿', aim: 'place',
    desc: 'Plant a spore pod that bursts into a poison cloud for 6 s. Fire turns the cloud into a gas blast.',
    cast(p, aim, target) {
      addZone({ type: 'pod', x: target.x, y: target.y, r: 18, t: 0.5, tick: 0 });
      sfx.shoot();
    },
  },
  {
    id: 'bulwark', name: 'Earthen Bulwark', short: 'WALL', element: 'earth', cd: 10, glyph: '▥', aim: 'cone',
    desc: 'Raise a stone wall in front of you for 5 s. It blocks bullets and bodies, then shatters outward into rock shards.',
    cast(p, aim) {
      const d = 78;
      const cx = p.x + Math.cos(aim) * d, cy = p.y + Math.sin(aim) * d;
      const vertical = Math.abs(Math.cos(aim)) > Math.abs(Math.sin(aim));
      const w = vertical ? 28 : 160, h = vertical ? 160 : 28;
      const b = arenaBounds();
      const o = {
        x: clamp(cx - w / 2, b.l + 4, b.r - 4 - w), y: clamp(cy - h / 2, b.t + 4, b.b - 4 - h),
        w, h, temp: 5, bulwark: true,
      };
      if (world.room) world.room.obstacles.push(o);
      elementArea('earth', cx, cy, 80, { surfaceOnly: true });
      burst(cx, cy, { count: 24, color: '#c9a36b', speed: 260, size: 5, life: 0.5, drag: 4, shape: 'shard' });
      shake(0.3);
      sfx.thud();
    },
  },
  {
    id: 'aegis', name: 'Aegis', short: 'AEGIS', element: 'arcane', cd: 16, glyph: '◎', aim: 'self',
    desc: 'A shield that absorbs the next 2 hits, then bursts outward, knocking foes back and destroying nearby bullets.',
    cast(p) {
      p.aegis = { hits: 2 + (p.stats.aegisBonus || 0), t: 9 };
      ring(p.x, p.y, { r0: 10, r1: 44, color: '#8ef0ff', life: 0.35, width: 5 });
      sfx.chime();
    },
  },
  {
    id: 'sigil', name: 'Sigil of Stillness', short: 'SIGIL', element: 'arcane', cd: 16, glyph: '⌬', aim: 'place',
    desc: 'A glyph on the floor for 7 s: foes inside are slowed by half, and enemy bullets crossing it crawl at a quarter speed.',
    cast(p, aim, target) {
      addZone({ type: 'sigil', x: target.x, y: target.y, r: 135, t: 7, tick: 0 });
      ring(target.x, target.y, { r0: 10, r1: 135, color: '#8ef0ff', life: 0.5, width: 5 });
      sfx.chime();
    },
  },
  {
    id: 'singularity', name: 'Singularity', short: 'VOID', element: 'gravity', cd: 18, glyph: '◉', aim: 'place',
    desc: 'A black hole for 2.5 s: pulls foes and enemy bullets in (bullets are swallowed), then implodes. Drag foes into fire, poison or electrified water.',
    cast(p, aim, target) {
      addZone({ type: 'singularity', x: target.x, y: target.y, r: 240, t: 2.5, tick: 0 });
      sfx.whirr();
    },
  },
  {
    id: 'meteor', name: 'Meteor Shower', short: 'METEOR', element: 'fire', cd: 24, glyph: '✹', aim: 'place',
    desc: 'Call down seven meteors over an area. Each impact is marked on the floor first, hits hard and leaves flames.',
    cast(p, aim, target) {
      addZone({ type: 'meteor', x: target.x, y: target.y, r: 150, t: 99, tick: 0.2, left: 7, falling: [] });
      ring(target.x, target.y, { r0: 150, r1: 140, color: '#ff9a4d', life: 0.4, width: 4 });
      sfx.telegraph();
    },
  },
];

export function spellById(id) { return SPELLS.find((s) => s.id === id) || null; }

// --- cooldowns and slots --------------------------------------------------------

/** A spell's full cooldown for this player (boons shorten it). */
export function spellCooldown(p, s) {
  return s.cd * (1 - Math.min(MAX_CDR, (p && p.stats && p.stats.spellCdr) || 0));
}

/** Seconds until the spell is ready again (0 = ready). */
export function cooldownLeft(p, id) {
  return (p && p.spellCds && p.spellCds[id]) || 0;
}

/** 1 when ready, rising from 0 while it recharges (for sweeps). */
export function cooldownFrac(p, id) {
  const s = spellById(id);
  const left = cooldownLeft(p, id);
  if (!s || left <= 0) return 1;
  return clamp(1 - left / spellCooldown(p, s), 0, 1);
}

/** Take `secs` off every running cooldown (Arcane Flow, urns, fountains). */
export function shaveCooldowns(p, secs) {
  if (!p || !p.spellCds) return;
  for (const id of Object.keys(p.spellCds)) p.spellCds[id] = Math.max(0, p.spellCds[id] - secs);
}

/** Put a spell in a slot; if it's already in another slot, the two swap. */
export function equipSpell(p, slot, id) {
  if (!p || !spellById(id) || slot < 0 || slot >= SPELL_SLOTS) return;
  const spells = p.spells.slice();
  while (spells.length < SPELL_SLOTS) spells.push(null);
  const at = spells.indexOf(id);
  if (at >= 0) spells[at] = spells[slot];
  spells[slot] = id;
  p.spells = spells;
}

// --- casting --------------------------------------------------------------------

/** Called from updatePlayer: cooldowns, casting from input, upkeep. */
export function updateSpells(p, dt) {
  if (!p) return;
  if (!p.spellCds) p.spellCds = {};
  for (const id of Object.keys(p.spellCds)) {
    p.spellCds[id] = Math.max(0, p.spellCds[id] - dt);
  }
  p.spellGcd = Math.max(0, (p.spellGcd || 0) - dt);
  if (p.spellDenied) { p.spellDenied.t -= dt; if (p.spellDenied.t <= 0) p.spellDenied = null; }
  if (p.imbue) { p.imbue.t -= dt; if (p.imbue.t <= 0) p.imbue = null; }
  if (p.aegis) { p.aegis.t -= dt; if (p.aegis.t <= 0) p.aegis = null; }
  if (p.silenced > 0) p.silenced -= dt;

  if (input.spellCast !== null && input.spellCast !== undefined) {
    const id = p.spells[input.spellCast];
    if (id) tryCast(p, id);
  }

  if (p.channel) updateChannel(p, dt);
}

/** Cast a spell by id (or the first equipped). False if it can't go off. */
export function tryCast(p, id = null) {
  const spell = spellById(id || (p && p.spells.find(Boolean)));
  if (!spell || !p || p.dead) return false;
  if (!p.spellCds) p.spellCds = {};
  if (p.silenced > 0) { damageText(p.x, p.y - p.r - 18, 'SILENCED', { color: '#c07bff', size: 15 }); return false; }
  if (p.channel || p.dashing || p.spellGcd > 0) return false;
  if (cooldownLeft(p, spell.id) > 0) {
    p.spellDenied = { id: spell.id, t: 0.3 };
    sfx.ui();
    return false;
  }
  p.spellCds[spell.id] = spellCooldown(p, spell);
  p.spellGcd = GLOBAL_CD;
  p.attack = null;
  p.charging = false;
  const aim = p.aimAngle;
  const target = spell.aim === 'place' ? placeTarget(p, aim) : spell.aim === 'target' ? targetEnemy(p) : null;
  p.face = aim;
  spell.cast(p, aim, target);
  p.casts = (p.casts || 0) + 1;
  // Elemental spells imbue the weapon.
  if (spell.element && spell.element !== 'arcane' && spell.element !== 'gravity') {
    p.imbue = { el: spell.element, t: IMBUE_TIME + (p.stats.imbueTime || 0) };
  }
  ring(p.x, p.y, { r0: 6, r1: 34, color: col(spell.element), life: 0.22, width: 3 });
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

function coneHit(p, aim, r, arc, damage, el) {
  for (const e of world.enemies) {
    if (e.dead || e.spawning || e.hidden) continue;
    if (!inCone(p, aim, arc, r, e)) continue;
    dealDamage(e, damage, { element: el, source: 'spell', knockback: 120, dir: angleTo(p.x, p.y, e.x, e.y) });
  }
}

/** The element touches the floor along the cone's centre line. */
function coneSurface(p, aim, r, el) {
  for (const k of [0.35, 0.65, 0.92]) {
    elementArea(el, p.x + Math.cos(aim) * r * k, p.y + Math.sin(aim) * r * k, r * 0.28, { surfaceOnly: true, dir: aim });
  }
}

function coneFx(p, aim, r, arc, color, shape) {
  for (let i = 0; i < 26; i++) {
    const a = aim + rand(-arc / 2, arc / 2);
    burst(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, {
      count: 1, color, speed: r * rand(1.4, 2.4), size: 4, life: 0.35, dir: a, spread: 0.1, drag: 3, shape,
    });
  }
}

/** Fireball impact: a wide fire blast (heavy, so it shatters the frozen) and flames. */
function fireballBurst(x, y) {
  elementArea('fire', x, y, 105, { damage: 30, knockback: 220, heavy: true, source: 'spell' });
  spawnSurface('fire', x, y, 85, 'player', 5);
  ring(x, y, { r0: 8, r1: 105, color: '#ff9a4d', life: 0.32, width: 7 });
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
      coneHit(p, aim, 190, 1.0, 6, 'fire');
      // Burn light bullets out of the air.
      for (const pr of world.projectiles) {
        if (pr.friendly || pr.cleared || pr.heavy) continue;
        if (inCone(p, aim, 1.0, 190, pr)) breakBullet(pr, null);
      }
      coneSurface(p, aim, 190, 'fire');
    }
  } else if (c.id === 'siphon') {
    const t = c.target;
    if (!t || t.dead || t.hidden || dist(p.x, p.y, t.x, t.y) > 360) c.target = nearestEnemy(p.x, p.y, 320);
    if (c.target) p.face = angleTo(p.x, p.y, c.target.x, c.target.y);
    if (c.tick <= 0 && c.target) {
      c.tick = 0.2;
      const dealt = dealDamage(c.target, 5, { element: 'toxic', source: 'spell', dir: angleTo(p.x, p.y, c.target.x, c.target.y) });
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
    if (e.dead || e.spawning || e.hidden || hit.has(e)) continue;
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

// --- lasting spell zones (rain, sigil, pod, singularity, meteors, bulwark walls) ----

function addZone(z) { world.spellZones.push(z); }

/**
 * Upkeep for lasting spells. Runs before projectiles each tick so the sigil
 * can slow bullets this frame.
 */
export function updateSpellZones(dt) {
  for (const pr of world.projectiles) pr.inSigil = false;
  for (let i = world.spellZones.length - 1; i >= 0; i--) {
    const z = world.spellZones[i];
    z.t -= dt;
    z.tick -= dt;
    switch (z.type) {
      case 'rain':
        if (z.tick <= 0) { z.tick = 0.5; elementArea('water', z.x, z.y, z.r); }
        for (let k = 0; k < 3; k++) {
          const a = rand(0, TAU), d = Math.sqrt(Math.random()) * z.r;
          burst(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d - 30, { count: 1, color: '#9fd0ff', speed: 420, size: 2, life: 0.08, dir: Math.PI / 2 + 0.2, spread: 0.05, drag: 0, shape: 'spark' });
        }
        break;
      case 'sigil':
        for (const e of world.enemies) {
          if (e.dead || e.boss) continue;
          if (dist(e.x, e.y, z.x, z.y) < z.r + e.r * 0.5) e.slow = { mult: 0.5, time: 0.15 };
        }
        for (const e of world.enemies) {
          if (e.dead || !e.boss) continue;
          if (dist(e.x, e.y, z.x, z.y) < z.r) e.slow = { mult: 0.75, time: 0.15 };
        }
        for (const pr of world.projectiles) {
          if (!pr.friendly && dist(pr.x, pr.y, z.x, z.y) < z.r) pr.inSigil = true;
        }
        break;
      case 'pod':
        if (z.t <= 0) {
          spawnSurface('toxic', z.x, z.y, 115, 'player', 6);
          elementArea('toxic', z.x, z.y, 110, { damage: 6 });
          burst(z.x, z.y, { count: 20, color: '#9be34a', speed: 200, size: 5, life: 0.6, drag: 3 });
          sfx.splash();
        }
        break;
      case 'singularity': {
        for (const e of world.enemies) {
          if (e.dead || e.spawning || e.hidden) continue;
          const d = dist(e.x, e.y, z.x, z.y);
          if (d > z.r || d < 6) continue;
          const a = angleTo(e.x, e.y, z.x, z.y);
          const pull = (e.boss ? 0.2 : 1) * (260 * (1 - d / z.r) + 70) / Math.max(1, Math.sqrt(e.mass || 1));
          e.x += Math.cos(a) * pull * dt;
          e.y += Math.sin(a) * pull * dt;
        }
        for (const pr of world.projectiles) {
          if (pr.friendly || pr.cleared) continue;
          const d = dist(pr.x, pr.y, z.x, z.y);
          if (d > z.r) continue;
          if (d < 24) { breakBullet(pr, world.player); continue; }
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
          // Implode.
          for (const e of enemiesInRadius(z.x, z.y, 95)) {
            dealDamage(e, 30, { element: 'gravity', source: 'spell', knockback: 300, heavy: true, dir: angleTo(z.x, z.y, e.x, e.y) });
          }
          ring(z.x, z.y, { r0: z.r, r1: 8, color: '#7a5cff', life: 0.3, width: 8 });
          ring(z.x, z.y, { r0: 8, r1: 110, color: '#c7b8ff', life: 0.35, width: 5 });
          shake(0.45);
          sfx.explode();
        }
        break;
      }
      case 'meteor': {
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
            elementArea('fire', m.x, m.y, 62, { damage: 26, knockback: 200, heavy: true, source: 'spell' });
            spawnSurface('fire', m.x, m.y, 50, 'player', 3);
            ring(m.x, m.y, { r0: 6, r1: 70, color: '#ffb35e', life: 0.3, width: 6 });
            burst(m.x, m.y, { count: 18, color: '#ff9a4d', speed: 320, size: 5, life: 0.4, drag: 4, shape: 'shard' });
            shake(0.28);
            sfx.explode();
          }
        }
        z.falling = z.falling.filter((m) => !m.done);
        if (z.left <= 0 && !z.falling.length) z.t = 0;
        break;
      }
      default: break;
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
          friendly: true, shape: 'rock', color: '#c9a36b', life: 0.5, knockback: 140, spin: 8, element: 'earth',
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

/** The Aegis bubble absorbs a hit. Returns true if it did. */
export function aegisAbsorb(p) {
  if (!p.aegis || p.aegis.hits <= 0) return false;
  p.aegis.hits--;
  p.invuln = Math.max(p.invuln, 0.35);
  ring(p.x, p.y, { r0: 30, r1: 50, color: '#8ef0ff', life: 0.25, width: 5 });
  sfx.block();
  if (p.aegis.hits <= 0) {
    // Burst: knockback, a little damage, and nearby bullets destroyed.
    for (const e of enemiesInRadius(p.x, p.y, 160)) {
      dealDamage(e, 20, { element: 'arcane', source: 'spell', knockback: 600, dir: angleTo(p.x, p.y, e.x, e.y) });
    }
    for (const pr of world.projectiles) {
      if (!pr.friendly && !pr.cleared && dist(pr.x, pr.y, p.x, p.y) < 170) breakBullet(pr, null);
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
    if (z.type === 'rain') {
      ctx.globalAlpha = 0.12 * fade;
      ctx.fillStyle = '#4aa8ff';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = '#9fd0ff';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (z.type === 'sigil') {
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
    } else if (z.type === 'pod') {
      ctx.fillStyle = '#9be34a';
      ctx.beginPath(); ctx.arc(z.x, z.y, 10 + Math.sin(time * 30) * 2, 0, TAU); ctx.fill();
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

/** Aegis bubble, imbue glow and channelled spells, around the player. */
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
  if (p.imbue) {
    const c = col(p.imbue.el);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5, time * 4, time * 4 + TAU * clamp(p.imbue.t / IMBUE_TIME, 0, 1)); ctx.stroke();
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
