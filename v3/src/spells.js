// Spells: a loadout of three, paid for with Focus (earned by fighting,
// parrying and breaking bullets). Tap CAST to cast the selected spell; hold it
// and time slows while a wheel of your three spells opens — drag or push the
// stick toward one and release to cast it.
//
// Every elemental spell also IMBUES your weapon for a few seconds, so your
// attacks carry that element (cast Downpour, then imbue Storm, and every swing
// electrocutes the soaked). All effects go through dealDamage / elementArea, so
// every reaction in elements.js works with spells for free.
//
// To add a spell: one entry in SPELLS with `cast(p, aim)` (and optionally a
// zone type handled in updateSpells). The loadout screen and the Proving
// Grounds list SPELLS automatically.

import { world, arenaBounds, view } from './state.js';
import { TAU, clamp, dist, angleTo, angleDiff, rand } from './util.js';
import { input } from './input.js';
import { dealDamage, nearestEnemy, enemiesInRadius, setAegisHook } from './combat.js';
import { elementArea, ELEMENTS } from './elements.js';
import { spawnSurface } from './surfaces.js';
import { spawnProjectile } from './spawn.js';
import { burst, ring, damageText, shake } from './fx.js';
import { sfx } from './audio.js';
import { breakBullet } from './projectiles.js';

const TAP = 0.18;          // CAST held longer than this opens the wheel
const GLOBAL_CD = 0.3;     // between casts
const PLACE_RANGE = 380;   // how far a placed spell can land
const IMBUE_TIME = 4;

export const spellState = {
  wheel: false,            // the wheel is open (the game runs at 20% speed)
  wheelPick: -1,
};

const col = (el) => (ELEMENTS[el] ? ELEMENTS[el].color : '#ffffff');

// --- the spells -------------------------------------------------------------------

export const SPELLS = [
  {
    id: 'aegis', name: 'Aegis', element: 'arcane', cost: 2, glyph: '◎', aim: 'self',
    desc: 'A shield that absorbs the next 2 hits, then bursts outward, knocking foes back and destroying nearby bullets.',
    cast(p) {
      p.aegis = { hits: 2 + (p.stats.aegisBonus || 0), t: 9 };
      ring(p.x, p.y, { r0: 10, r1: 44, color: '#8ef0ff', life: 0.35, width: 5 });
      sfx.chime();
    },
  },
  {
    id: 'breath', name: "Dragon's Breath", element: 'fire', cost: 1, glyph: '♨', aim: 'cone',
    desc: 'Channel a cone of fire for a second: burns foes, ignites oil and gas, and burns light bullets out of the air.',
    cast(p) { p.channel = { id: 'breath', t: 1.0, tick: 0 }; sfx.whirr(); },
  },
  {
    id: 'rime', name: 'Rime', element: 'frost', cost: 1, glyph: '❄', aim: 'cone',
    desc: 'A blast of frost in a cone. Chills (three chills freeze), freezes the wet, and turns puddles to ice.',
    cast(p, aim) {
      coneHit(p, aim, 210, 1.15, 16, 'frost');
      coneSurface(p, aim, 210, 'frost');
      coneFx(p, aim, 210, 1.15, '#9fe2ff', 'shard');
      sfx.block();
    },
  },
  {
    id: 'gale', name: 'Gale', element: 'wind', cost: 1, glyph: '༄', aim: 'cone',
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
    id: 'storm', name: 'Stormcall', element: 'storm', cost: 1, glyph: 'ϟ', aim: 'target',
    desc: 'Lightning strikes the nearest foe and chains 3 times — far more among the wet. Electrifies puddles.',
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
    id: 'downpour', name: 'Downpour', element: 'water', cost: 1, glyph: '☔', aim: 'place',
    desc: 'Rain over an area for 5 s: everything inside is Wet, fires go out, poison washes away. Set up storm and frost combos.',
    cast(p, aim, target) {
      addZone({ type: 'rain', x: target.x, y: target.y, r: 130, t: 5, tick: 0 });
      spawnSurface('water', target.x, target.y, 110, 'player', 8);
      elementArea('water', target.x, target.y, 130);
      sfx.splash();
    },
  },
  {
    id: 'sigil', name: 'Sigil of Stillness', element: 'arcane', cost: 2, glyph: '⌬', aim: 'place',
    desc: 'A glyph on the floor for 7 s: foes inside are slowed by half, and enemy bullets crossing it crawl at a quarter speed.',
    cast(p, aim, target) {
      addZone({ type: 'sigil', x: target.x, y: target.y, r: 135, t: 7, tick: 0 });
      ring(target.x, target.y, { r0: 10, r1: 135, color: '#8ef0ff', life: 0.5, width: 5 });
      sfx.chime();
    },
  },
  {
    id: 'bulwark', name: 'Earthen Bulwark', element: 'earth', cost: 1, glyph: '▥', aim: 'cone',
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
    id: 'bloom', name: 'Toxic Bloom', element: 'toxic', cost: 1, glyph: '✿', aim: 'place',
    desc: 'Plant a spore pod that bursts into a poison cloud for 6 s. Fire turns the cloud into a gas blast.',
    cast(p, aim, target) {
      addZone({ type: 'pod', x: target.x, y: target.y, r: 18, t: 0.5, tick: 0 });
      sfx.shoot();
    },
  },
  {
    id: 'singularity', name: 'Singularity', element: 'gravity', cost: 2, glyph: '◉', aim: 'place',
    desc: 'A black hole for 2.5 s: pulls foes and enemy bullets in (bullets are swallowed), then implodes. Drag foes into fire, poison or electrified water.',
    cast(p, aim, target) {
      addZone({ type: 'singularity', x: target.x, y: target.y, r: 240, t: 2.5, tick: 0 });
      sfx.whirr();
    },
  },
];

export function spellById(id) { return SPELLS.find((s) => s.id === id) || null; }

// --- casting --------------------------------------------------------------------

/** Called from updatePlayer. Handles tap/hold/wheel, casting and upkeep. */
export function updateSpells(p, dt, realDt) {
  if (!p || !p.spells || !p.spells.length) { spellState.wheel = false; return; }
  p.spellCd = Math.max(0, (p.spellCd || 0) - dt);
  if (p.imbue) { p.imbue.t -= dt; if (p.imbue.t <= 0) p.imbue = null; }
  if (p.aegis) { p.aegis.t -= dt; if (p.aegis.t <= 0) p.aegis = null; }
  if (p.silenced > 0) p.silenced -= dt;

  // Direct picks (keyboard 1-4, mouse wheel).
  if (input.spellPick !== null && input.spellPick < p.spells.length) p.spellIdx = input.spellPick;
  if (input.spellCycle) p.spellIdx = (p.spellIdx + input.spellCycle + p.spells.length) % p.spells.length;

  // CAST: tap = cast the selected spell; hold = wheel (real time, not slowed).
  if (input.castPressed) { p.castHeld = 0; p.castArmed = true; }
  if (p.castArmed && input.cast) {
    p.castHeld += realDt;
    if (p.castHeld >= TAP) spellState.wheel = true;
    if (spellState.wheel) spellState.wheelPick = wheelSlot(p);
  }
  if (p.castArmed && !input.cast) {
    p.castArmed = false;
    if (spellState.wheel) {
      spellState.wheel = false;
      const pick = spellState.wheelPick;
      spellState.wheelPick = -1;
      if (pick >= 0) { p.spellIdx = pick; tryCast(p); }
    } else {
      tryCast(p);
    }
  }

  // Channelled spells (Dragon's Breath).
  if (p.channel) updateChannel(p, dt);
}

/** Which wheel slot the cast stick/drag points at, or -1 near the centre. */
function wheelSlot(p) {
  const v = input.castVec;
  const m = Math.hypot(v.x, v.y);
  if (m < 0.35) return -1;
  const a = Math.atan2(v.y, v.x);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < p.spells.length; i++) {
    const d = Math.abs(angleDiff(slotAngle(i, p.spells.length), a));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function slotAngle(i, n) { return -Math.PI / 2 + (i / n) * TAU; }

export function tryCast(p, idOverride = null) {
  const spell = spellById(idOverride || p.spells[p.spellIdx]);
  if (!spell || p.dead) return false;
  if (p.silenced > 0) { damageText(p.x, p.y - p.r - 18, 'SILENCED', { color: '#c07bff', size: 15 }); return false; }
  if (p.spellCd > 0 || p.channel || p.dashing) return false;
  if ((p.focus || 0) < spell.cost) {
    damageText(p.x, p.y - p.r - 18, 'NO FOCUS', { color: '#8ef0ff', size: 14 });
    p.focusFlash = 0.4;
    sfx.ui();
    return false;
  }
  p.focus -= spell.cost;
  p.spellCd = GLOBAL_CD;
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

function updateChannel(p, dt) {
  const c = p.channel;
  c.t -= dt;
  c.tick -= dt;
  const aim = p.aimAngle;
  p.face = aim;
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
  if (c.t <= 0 || p.dead) p.channel = null;
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

// --- lasting spell zones (rain, sigil, pod, singularity, bulwark walls) ---------------

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
    }
  }
  ctx.globalAlpha = 1;
}

/** Aegis bubble, imbue glow and the Dragon's Breath cone, around the player. */
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
  if (p.channel) {
    const aim = p.aimAngle;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ff7a3d';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, 190, aim - 0.5, aim + 0.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** The spell wheel: three wedges around the CAST button (touch) or the player. */
export function drawSpellWheel(ctx, p) {
  if (!spellState.wheel || !p || !p.spells) return;
  // Centred on screen for every input: the drag *direction* picks a slot, so
  // the wheel needn't sit under the thumb (where it covered the buttons).
  const cx = view.w / 2, cy = view.h * 0.47;
  const R = 92, n = p.spells.length;
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#08060d';
  ctx.beginPath(); ctx.arc(cx, cy, R + 34, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#8ef0ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 10px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(input.touchMode ? 'DRAG · RELEASE TO CAST' : 'POINT · RELEASE TO CAST', cx, cy + 4);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const s = spellById(p.spells[i]);
    if (!s) continue;
    const a = slotAngle(i, n);
    const sx = cx + Math.cos(a) * R * 0.66, sy = cy + Math.sin(a) * R * 0.66;
    const picked = spellState.wheelPick === i;
    const afford = (p.focus || 0) >= s.cost;
    ctx.globalAlpha = picked ? 1 : 0.75;
    ctx.fillStyle = picked ? col(s.element) : 'rgba(20,14,34,0.95)';
    ctx.beginPath(); ctx.arc(sx, sy, picked ? 34 : 29, 0, TAU); ctx.fill();
    ctx.strokeStyle = col(s.element);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = picked ? '#0b0712' : col(s.element);
    ctx.font = '900 22px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(s.glyph, sx, sy - 3);
    ctx.font = '800 9px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillStyle = afford ? (picked ? '#0b0712' : '#ffffff') : '#ff7a7a';
    ctx.fillText(`${s.name.split(' ').pop().toUpperCase()} · ${s.cost}`, sx, sy + 16);
  }
  ctx.globalAlpha = 1;
}

setAegisHook(aegisAbsorb);
