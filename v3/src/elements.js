// Elements, statuses, reactions — the systemic heart of Version 3.
//
// Every element hitting something is resolved against that target's current
// statuses and aura through ONE data table (ELEMENT_RULES). The first rule that
// matches fires a reaction; if none matches, the element applies its base
// status. So a new interaction is one line in the table plus (optionally) one
// reaction function.
//
// Three kinds of outcome, all logical:
//   combos   — Wet + Storm = Electrocute, Wet + Frost = Freeze, Frozen + a heavy
//              hit = Shatter, Burning + Frost = Melt, Poisoned + Fire = Detonate…
//   cancels  — Water douses Fire (an Ember Imp loses its fire aura: Extinguished),
//              Earth grounds Storm, Wind disperses toxic clouds, Water dilutes
//              poison, Fire into Wet is wasted as Steam.
//   absorbs  — an element aura drinks its own element (a fire imp heals from fire).
//
// Friendly-fire rule: reactions and surfaces the player creates never hurt the
// player; enemy-made ones do. Experimenting should be fun, not self-punishing.
//
// Enemy buffs that need the right answer also live here: Warded (a shield
// broken by Storm or a parry), Armored (broken by heavy hits, Shatter or
// Superconduct), Regenerating (stopped by Toxic), Hasted (removed by Frost).

import { world } from './state.js';
import { TAU, dist, rand, angleTo } from './util.js';
import { burst, ring, damageText, shake, hitstop } from './fx.js';
import { sfx } from './audio.js';
import { addPoise } from './poise.js';
import { save, writeSave } from './save.js';
import { spawnSurface, elementOnArea, updateSurfaces, SURFACE_TYPES } from './surfaces.js';

export const ELEMENTS = {
  fire:    { name: 'Fire',    color: '#ff7a3d' },
  frost:   { name: 'Frost',   color: '#9fe2ff' },
  water:   { name: 'Water',   color: '#4aa8ff' },
  storm:   { name: 'Storm',   color: '#c58bff' },
  wind:    { name: 'Wind',    color: '#9fffcf' },
  earth:   { name: 'Earth',   color: '#c9a36b' },
  toxic:   { name: 'Toxic',   color: '#9be34a' },
  gravity: { name: 'Gravity', color: '#7a5cff' },
  arcane:  { name: 'Arcane',  color: '#8ef0ff' },
};

// Codex entries. `hint` is shown (as a riddle) until the reaction is found.
export const REACTIONS = {
  electrocute:  { name: 'Electrocute',  color: '#c58bff', hint: 'Lightning loves the soaked.', desc: 'Storm on a Wet foe: chains to every wet foe nearby, stuns them, ×1.5 damage.' },
  freeze:       { name: 'Freeze',       color: '#9fe2ff', hint: 'Cold finds the drenched.',     desc: 'Frost on a Wet foe freezes it solid at once.' },
  shatter:      { name: 'Shatter',      color: '#e6f8ff', hint: 'Strike hard what is frozen.',  desc: 'A heavy hit on a Frozen foe: ×2.5 damage.' },
  melt:         { name: 'Melt',         color: '#ffb35e', hint: 'Fire and ice, meeting.',       desc: 'Fire on a chilled/frozen foe, or frost on a burning one: ×2 damage.' },
  steam:        { name: 'Steam',        color: '#e8eef5', hint: 'Fire wasted on water.',        desc: 'Fire on a Wet foe boils away — a steam cloud where enemies can\'t aim.' },
  detonate:     { name: 'Detonate',     color: '#ffd45e', hint: 'Flame meets poison.',          desc: 'Fire on a Poisoned foe (or a toxic cloud) explodes.' },
  overload:     { name: 'Overload',     color: '#ff9ad8', hint: 'Storm and flame collide.',     desc: 'Storm on a Burning foe: a knockback blast.' },
  superconduct: { name: 'Superconduct', color: '#b8b0ff', hint: 'Lightning through the cold.',  desc: 'Storm on a chilled foe (or frost on a shocked one): Brittle, +30% damage taken.' },
  firestorm:    { name: 'Firestorm',    color: '#ff7a3d', hint: 'Wind feeds the flame.',        desc: 'Wind on a Burning foe spreads the fire to everything nearby.' },
  spread:       { name: 'Spread',       color: '#9be34a', hint: 'Wind carries poison.',         desc: 'Wind on a Poisoned foe spreads the poison.' },
  bog:          { name: 'Bog',          color: '#a0784a', hint: 'Earth drinks the water.',      desc: 'Earth on a Wet foe (or a puddle) makes clinging mud.' },
  extinguish:   { name: 'Extinguish',   color: '#4aa8ff', hint: 'Douse what burns.',            desc: 'Water puts out Burning — and strips a fire aura, leaving the foe weak (+25% damage).' },
  ground:       { name: 'Ground',       color: '#c9a36b', hint: 'Earth drains the storm.',      desc: 'Earth on a Shocked foe or storm aura: grounded, immune to storm for a while.' },
  dilute:       { name: 'Dilute',       color: '#4aa8ff', hint: 'Water thins poison.',          desc: 'Water ends Poison.' },
  disperse:     { name: 'Disperse',     color: '#9fffcf', hint: 'Wind clears the air.',         desc: 'Wind blows away toxic clouds and steam — and strips a toxic aura.' },
  absorb:       { name: 'Absorbed',     color: '#ffffff', hint: 'Like feeds like.',             desc: 'An element aura drinks its own element and heals. Match elements against auras.' },
  grounded:     { name: 'Grounded',     color: '#c9a36b', hint: 'Storm on the grounded.',       desc: 'A grounded foe shrugs off storm.' },
  electrify:    { name: 'Electrified Water', color: '#c58bff', hint: 'Lightning in a puddle.',  desc: 'Storm on a puddle electrifies it; everyone standing in it is shocked.' },
  inferno:      { name: 'Inferno',      color: '#ff5e3d', hint: 'Fire on the slick.',           desc: 'Fire on an oil slick: an explosion and a spreading blaze.' },
  gasBlast:     { name: 'Gas Blast',    color: '#ffd45e', hint: 'A spark in the cloud.',        desc: 'Fire on a toxic cloud blows it up.' },
};

/**
 * The rules matrix: element × (status or aura) → reaction. Order matters: the
 * first match wins. `has` = any of these statuses; `aura` = the target's aura.
 */
export const ELEMENT_RULES = [
  // Physical heavy hits.
  { el: 'physical', has: ['frozen'], heavy: true, reaction: 'shatter' },
  { el: 'any', has: ['frozen'], heavy: true, reaction: 'shatter' },
  // Fire
  { el: 'fire', aura: 'fire', reaction: 'absorb' },
  { el: 'fire', aura: 'frost', reaction: 'melt' },
  { el: 'fire', has: ['frozen', 'chilled'], reaction: 'melt' },
  { el: 'fire', has: ['wet'], reaction: 'steam' },
  { el: 'fire', aura: 'water', reaction: 'steam' },
  { el: 'fire', has: ['poisoned'], reaction: 'detonate' },
  { el: 'fire', aura: 'toxic', reaction: 'detonate' },
  { el: 'fire', has: ['shocked'], reaction: 'overload' },
  // Frost
  { el: 'frost', aura: 'frost', reaction: 'absorb' },
  { el: 'frost', aura: 'fire', reaction: 'melt' },
  { el: 'frost', has: ['burning'], reaction: 'melt' },
  { el: 'frost', has: ['wet'], reaction: 'freeze' },
  { el: 'frost', aura: 'water', reaction: 'freeze' },
  { el: 'frost', has: ['shocked'], reaction: 'superconduct' },
  // Water
  { el: 'water', aura: 'water', reaction: 'absorb' },
  { el: 'water', aura: 'fire', reaction: 'extinguish' },
  { el: 'water', has: ['burning'], reaction: 'extinguish' },
  { el: 'water', has: ['poisoned'], reaction: 'dilute' },
  // Storm
  { el: 'storm', aura: 'storm', reaction: 'absorb' },
  { el: 'storm', has: ['grounded'], reaction: 'grounded' },
  { el: 'storm', aura: 'earth', reaction: 'grounded' },
  { el: 'storm', has: ['wet'], reaction: 'electrocute' },
  { el: 'storm', aura: 'water', reaction: 'electrocute' },
  { el: 'storm', has: ['frozen', 'chilled'], reaction: 'superconduct' },
  { el: 'storm', has: ['burning'], reaction: 'overload' },
  // Wind
  { el: 'wind', aura: 'toxic', reaction: 'disperse' },
  { el: 'wind', has: ['burning'], reaction: 'firestorm' },
  { el: 'wind', aura: 'fire', reaction: 'firestorm' },
  { el: 'wind', has: ['poisoned'], reaction: 'spread' },
  // Earth
  { el: 'earth', aura: 'storm', reaction: 'ground' },
  { el: 'earth', has: ['shocked'], reaction: 'ground' },
  { el: 'earth', has: ['wet'], reaction: 'bog' },
  // Toxic
  { el: 'toxic', aura: 'toxic', reaction: 'absorb' },
  { el: 'toxic', has: ['burning'], reaction: 'detonate' },
  { el: 'toxic', aura: 'fire', reaction: 'detonate' },
];

// --- wiring ---------------------------------------------------------------------

let api = null;
/** combat.js hands over dealDamage/damagePlayer, so this module needn't import it. */
export function bindCombat(fns) { api = fns; }

let discoverHook = null;
export function setDiscoverHook(fn) { discoverHook = fn; }

/** First time a reaction happens: a banner, a codex entry, a small reward. */
export function discover(key) {
  if (!REACTIONS[key]) return;
  if (!save.codex) save.codex = { reactions: {} };
  if (!save.codex.reactions) save.codex.reactions = {};
  if (save.codex.reactions[key]) return;
  save.codex.reactions[key] = Date.now();
  save.darkness = (save.darkness || 0) + 5;
  writeSave();
  if (discoverHook) discoverHook(key, REACTIONS[key]);
}

// --- statuses -------------------------------------------------------------------

export function hasStatus(ent, s) {
  const st = ent && ent.status;
  return !!(st && st[s] && st[s].t > 0);
}

/** Apply a status directly, with no reaction check (boons, surfaces, debug). */
export function applyStatus(ent, s, t, extra = {}) { return setStatus(ent, s, t, extra); }

function setStatus(ent, s, t, extra = {}) {
  if (!ent.status) ent.status = {};
  const cur = ent.status[s];
  ent.status[s] = { ...(cur || {}), ...extra, t: Math.max(t, cur ? cur.t : 0) };
  return ent.status[s];
}

function clearStatus(ent, ...names) {
  if (!ent.status) return;
  for (const n of names) delete ent.status[n];
}

/** Extra damage the target takes from its statuses and buffs. */
export function damageTakenMult(e) {
  let m = 1;
  if (hasStatus(e, 'brittle')) m *= 1.3;
  if (hasStatus(e, 'extinguished')) m *= 1.25;
  return m;
}

// --- hitting an enemy with an element -----------------------------------------------

/**
 * Resolve an element (or a heavy physical hit) landing on an enemy.
 * ctx: { heavy, damage (the hit's base damage), owner: 'player'|'enemy', dir }
 * Returns { mult } for the triggering hit (0 = absorbed, no damage).
 */
export function hitElement(e, el, ctx = {}) {
  if (!e || e.dead) return { mult: 1 };
  const rule = matchRule(e, el, ctx);
  if (rule) return react(rule.reaction, e, el, ctx);
  applyBase(e, el, ctx);
  return { mult: 1 };
}

function matchRule(e, el, ctx) {
  for (const r of ELEMENT_RULES) {
    if (r.el !== el && !(r.el === 'any' && el !== 'physical')) continue;
    if (r.heavy && !ctx.heavy) continue;
    if (r.aura && e.aura !== r.aura) continue;
    if (r.has && !r.has.some((s) => hasStatus(e, s))) continue;
    return r;
  }
  return null;
}

/** Base status an element leaves when no reaction happens. */
function applyBase(e, el, ctx) {
  switch (el) {
    case 'fire':
      setStatus(e, 'burning', 3, { dps: Math.max(5, (ctx.damage || 10) * 0.25) });
      break;
    case 'frost': {
      const cur = e.status && e.status.chilled && e.status.chilled.t > 0 ? e.status.chilled.stacks || 0 : 0;
      const stacks = cur + 1;
      if (stacks >= 3) {
        clearStatus(e, 'chilled');
        freezeTarget(e, 2.2);
      } else {
        setStatus(e, 'chilled', 4, { stacks });
      }
      if (hasStatus(e, 'hasted')) { clearStatus(e, 'hasted'); popup(e, 'HASTE LOST', '#9fe2ff'); }
      break;
    }
    case 'water':
      setStatus(e, 'wet', 6);
      break;
    case 'storm':
      if (!hasStatus(e, 'shocked') && !e.boss) e.stunT = Math.max(e.stunT || 0, 0.25);
      setStatus(e, 'shocked', 1.6);
      // A ward pops on storm.
      if (e.ward > 0) breakWard(e);
      break;
    case 'toxic':
      setStatus(e, 'poisoned', 5, { dps: Math.max(4, (ctx.damage || 10) * 0.2) });
      break;
    case 'earth':
      addPoise(e, 12);
      break;
    default:
      break;
  }
}

function freezeTarget(e, t) {
  if (e.boss) {
    // Bosses don't freeze solid: a hard slow and a posture hit instead.
    addPoise(e, 38);
    e.slow = { mult: 0.45, time: 2 };
    setStatus(e, 'chilled', 2, { stacks: 2 });
    popup(e, 'FROSTBITE', '#9fe2ff');
    return;
  }
  setStatus(e, 'frozen', t);
  e.stunT = Math.max(e.stunT || 0, t);
}

function popup(e, text, color, size = 17) {
  damageText(e.x, e.y - e.r - 26, text, { color, size });
}

/** Reaction outcomes. Each returns { mult } for the triggering hit. */
function react(key, e, el, ctx) {
  const info = REACTIONS[key];
  const dmg = ctx.damage || 10;
  if (info && key !== 'grounded') popup(e, info.name.toUpperCase(), info.color, key === 'absorb' ? 15 : 19);
  discover(key);
  switch (key) {
    case 'absorb': {
      e.hp = Math.min(e.maxHp, e.hp + dmg * 0.5);
      burst(e.x, e.y, { count: 10, color: ELEMENTS[el] ? ELEMENTS[el].color : '#fff', speed: 120, size: 3, life: 0.4, drag: 4 });
      return { mult: 0 };
    }
    case 'melt': {
      clearStatus(e, 'frozen', 'chilled', 'burning');
      if (e.stunT && !e.boss) e.stunT = Math.min(e.stunT, 0.3);
      if (e.aura === 'fire' || e.aura === 'frost') loseAura(e);
      burst(e.x, e.y, { count: 16, color: '#ffb35e', speed: 260, size: 4, life: 0.4, drag: 4 });
      return { mult: 2 };
    }
    case 'steam': {
      clearStatus(e, 'wet');
      spawnSurface('steam', e.x, e.y, 70, ctx.owner || 'player', 4);
      return { mult: 1 };
    }
    case 'detonate': {
      clearStatus(e, 'poisoned', 'burning');
      if (e.aura === 'toxic' || e.aura === 'fire') loseAura(e);
      blast(e.x, e.y, 115, 24 + dmg * 0.8, '#ffd45e', ctx.owner, e);
      return { mult: 1.2 };
    }
    case 'overload': {
      clearStatus(e, 'burning', 'shocked');
      blast(e.x, e.y, 100, 16 + dmg * 0.4, '#ff9ad8', ctx.owner, e, 520);
      return { mult: 1.2 };
    }
    case 'freeze': {
      clearStatus(e, 'wet');
      if (e.aura === 'water') loseAura(e);
      freezeTarget(e, 2.6);
      ring(e.x, e.y, { r0: e.r, r1: e.r * 2.4, color: '#9fe2ff', life: 0.35, width: 5 });
      return { mult: 1 };
    }
    case 'shatter': {
      clearStatus(e, 'frozen');
      if (!e.boss) e.stunT = 0;
      addPoise(e, 40);
      burst(e.x, e.y, { count: 22, color: '#e6f8ff', speed: 380, size: 4.5, life: 0.45, drag: 4, shape: 'shard' });
      shake(0.35);
      hitstop(0.06);
      if (e.armor) breakArmor(e);
      return { mult: 2.5 };
    }
    case 'superconduct': {
      clearStatus(e, 'shocked', 'chilled');
      setStatus(e, 'brittle', 6);
      if (e.armor) breakArmor(e);
      return { mult: 1.1 };
    }
    case 'extinguish': {
      clearStatus(e, 'burning');
      if (e.aura === 'fire') {
        loseAura(e);
        setStatus(e, 'extinguished', 8);
        e.damage = Math.round(e.damage * 0.7);
      }
      burst(e.x, e.y - e.r * 0.4, { count: 12, color: '#d8e6ff', speed: 90, size: 5, life: 0.7, gravity: -60, drag: 2 });
      return { mult: 1 };
    }
    case 'dilute': {
      clearStatus(e, 'poisoned');
      return { mult: 1 };
    }
    case 'grounded': {
      popup(e, 'GROUNDED', '#c9a36b', 14);
      return { mult: 0.5 };
    }
    case 'ground': {
      clearStatus(e, 'shocked');
      if (e.aura === 'storm') loseAura(e);
      setStatus(e, 'grounded', 3);
      return { mult: 1 };
    }
    case 'electrocute': {
      clearStatus(e, 'wet');
      if (e.aura === 'water') loseAura(e);
      const hits = [e];
      for (const o of world.enemies) {
        if (o === e || o.dead || o.spawning || o.hidden) continue;
        if (!hasStatus(o, 'wet') && o.aura !== 'water') continue;
        if (dist(o.x, o.y, e.x, e.y) > 240) continue;
        hits.push(o);
      }
      for (const o of hits) {
        if (!o.boss) o.stunT = Math.max(o.stunT || 0, 0.8);
        addPoise(o, 22);
        if (o !== e) {
          clearStatus(o, 'wet');
          arc(e.x, e.y, o.x, o.y);
          if (api) api.dealDamage(o, dmg * 0.7, { raw: true, chained: true, noCrit: true, knockback: 60 });
        }
      }
      elementOnArea('storm', e.x, e.y, 30, ctx.owner || 'player');
      sfx.beam();
      return { mult: 1.5 };
    }
    case 'firestorm': {
      clearStatus(e, 'burning');
      for (const o of world.enemies) {
        if (o.dead || o.spawning || o.hidden) continue;
        if (dist(o.x, o.y, e.x, e.y) > 170) continue;
        setStatus(o, 'burning', 4, { dps: Math.max(8, dmg * 0.3) });
      }
      const d = ctx.dir ?? rand(0, TAU);
      for (let k = 0; k < 3; k++) {
        spawnSurface('fire', e.x + Math.cos(d) * 60 * (k + 1), e.y + Math.sin(d) * 60 * (k + 1), 50, ctx.owner || 'player', 4);
      }
      ring(e.x, e.y, { r0: 10, r1: 170, color: '#ff7a3d', life: 0.4, width: 6 });
      return { mult: 1.2 };
    }
    case 'spread': {
      for (const o of world.enemies) {
        if (o === e || o.dead || o.spawning) continue;
        if (dist(o.x, o.y, e.x, e.y) > 150) continue;
        setStatus(o, 'poisoned', 5, { dps: Math.max(4, dmg * 0.2) });
      }
      spawnSurface('toxic', e.x, e.y, 70, ctx.owner || 'player', 4);
      return { mult: 1 };
    }
    case 'disperse': {
      loseAura(e);
      return { mult: 1 };
    }
    case 'bog': {
      clearStatus(e, 'wet');
      spawnSurface('mud', e.x, e.y, 80, ctx.owner || 'player', 8);
      return { mult: 1 };
    }
    default:
      return { mult: 1 };
  }
}

function loseAura(e) {
  if (!e.aura) return;
  popup(e, `${ELEMENTS[e.aura] ? ELEMENTS[e.aura].name.toUpperCase() : ''} AURA LOST`, '#ffffff', 13);
  e.aura = null;
}

/** An elemental explosion from a reaction. Friendly-fire rule applies. */
function blast(x, y, r, damage, color, owner = 'player', exclude = null, knock = 260) {
  ring(x, y, { r0: 8, r1: r, color, life: 0.34, width: 7 });
  burst(x, y, { count: 22, color, speed: 380, size: 5, life: 0.45, drag: 4, shape: 'shard' });
  shake(0.35);
  sfx.explode();
  if (!api) return;
  for (const o of world.enemies) {
    if (o.dead || o.spawning || o.hidden || o === exclude) continue;
    if (dist(o.x, o.y, x, y) > r + o.r) continue;
    api.dealDamage(o, damage, { raw: true, chained: true, noCrit: true, knockback: knock, dir: angleTo(x, y, o.x, o.y), poise: damage * 0.6 });
  }
  const p = world.player;
  if (owner === 'enemy' && p && !p.dead && dist(p.x, p.y, x, y) < r + p.r * 0.6) {
    api.damagePlayer(damage, x, y, 'explosion');
  }
}

function arc(x1, y1, x2, y2) {
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    burst(x1 + (x2 - x1) * t + rand(-10, 10), y1 + (y2 - y1) * t + rand(-10, 10), {
      count: 2, color: '#e9d8ff', speed: 80, size: 3, life: 0.2, drag: 6, shape: 'spark',
    });
  }
}

// --- enemy buffs --------------------------------------------------------------------

/** Warded: a shield that eats damage until broken (Storm or a parry pop it). */
export function absorbWard(e, dmg) {
  if (!(e.ward > 0)) return dmg;
  const eaten = Math.min(e.ward, dmg);
  e.ward -= eaten;
  if (e.ward <= 0) breakWard(e);
  return dmg - eaten;
}

export function breakWard(e) {
  e.ward = 0;
  popup(e, 'WARD BROKEN', '#8ef0ff');
  ring(e.x, e.y, { r0: e.r, r1: e.r * 2.2, color: '#8ef0ff', life: 0.35, width: 4 });
  sfx.block();
}

/** Armored: heavy hits, Shatter and Superconduct break it; until then −60%. */
export function armorMult(e, heavy) {
  if (!e.armor) return 1;
  if (heavy) { breakArmor(e); return 1; }
  return 0.4;
}

export function breakArmor(e) {
  if (!e.armor) return;
  e.armor = false;
  popup(e, 'ARMOR BROKEN', '#c9a36b');
  burst(e.x, e.y, { count: 16, color: '#c9a36b', speed: 300, size: 4, life: 0.4, drag: 4, shape: 'shard' });
  sfx.thud();
}

// --- the player ---------------------------------------------------------------------

/**
 * An enemy element (or an enemy-made surface) touching the player. Only a
 * handful of reactions apply to the player, and none of them are cruel:
 * statuses are short and clearly shown.
 */
export function elementOnPlayer(el, ctx = {}) {
  const p = world.player;
  if (!p || p.dead) return;
  if (!p.status) p.status = {};
  switch (el) {
    case 'fire':
      if (hasStatus(p, 'wet')) { clearStatus(p, 'wet'); return; }
      if (hasStatus(p, 'chilled')) { clearStatus(p, 'chilled'); return; }   // thaw
      setStatus(p, 'burning', 2.5, { dps: 4 });
      break;
    case 'frost': {
      if (hasStatus(p, 'burning')) { clearStatus(p, 'burning'); return; }
      const cur = hasStatus(p, 'chilled') ? p.status.chilled.stacks || 0 : 0;
      setStatus(p, 'chilled', 3, { stacks: Math.min(3, cur + 1) });
      break;
    }
    case 'water':
      if (hasStatus(p, 'burning')) clearStatus(p, 'burning');
      if (hasStatus(p, 'poisoned')) clearStatus(p, 'poisoned');
      setStatus(p, 'wet', 5);
      break;
    case 'storm':
      if (hasStatus(p, 'wet') && api) {
        clearStatus(p, 'wet');
        damageText(p.x, p.y - p.r - 20, 'ELECTROCUTED', { color: '#c58bff', size: 16 });
        api.damagePlayer(8, null, null, ctx.source || 'storm', { dot: true });
      }
      setStatus(p, 'shocked', 0.6);
      break;
    case 'toxic':
      if (hasStatus(p, 'burning') && api) {
        clearStatus(p, 'burning');
        api.damagePlayer(10, null, null, ctx.source || 'explosion', { dot: true });
      }
      setStatus(p, 'poisoned', 4, { dps: 3 });
      break;
    default: break;
  }
}

/** Player movement multiplier from statuses (chill slows, mud clings). */
export function playerSpeedMult(p) {
  let m = 1;
  if (hasStatus(p, 'chilled')) m *= 1 - 0.15 * (p.status.chilled.stacks || 1);
  if (p.inMud) m *= 0.6;
  return m;
}

// --- area elements (spells, grenades, reactions on the floor) -----------------------

/**
 * Apply an element to a whole area: every enemy inside is hit by it (with
 * reactions) and the floor surfaces transform. Returns the enemies hit.
 * opts: { damage, owner, dir, heavy, surfaceOnly }
 */
export function elementArea(el, x, y, r, opts = {}) {
  const owner = opts.owner || 'player';
  const events = elementOnArea(el, x, y, r, owner, opts.dir || 0);
  for (const ev of events) resolveAreaEvent(ev);
  const hit = [];
  if (opts.surfaceOnly) return hit;
  for (const e of world.enemies) {
    if (e.dead || e.spawning || e.hidden) continue;
    if (dist(e.x, e.y, x, y) > r + e.r) continue;
    hit.push(e);
  }
  for (const e of hit) {
    if (opts.damage && api) {
      api.dealDamage(e, opts.damage, { element: el, knockback: opts.knockback || 0, dir: angleTo(x, y, e.x, e.y), heavy: opts.heavy, source: opts.source || 'spell' });
    } else {
      hitElement(e, el, { damage: 10, owner, dir: opts.dir });
    }
  }
  const p = world.player;
  if (owner === 'enemy' && p && !p.dead && dist(p.x, p.y, x, y) < r + p.r * 0.6) elementOnPlayer(el, { source: opts.source });
  return hit;
}

function resolveAreaEvent(ev) {
  switch (ev.name) {
    case 'electrify': discover('electrify'); break;
    case 'inferno':
      discover('inferno');
      blast(ev.x, ev.y, ev.r * 1.1, 34, '#ff5e3d', ev.owner);
      damageText(ev.x, ev.y - 20, 'INFERNO', { color: '#ff5e3d', size: 20 });
      break;
    case 'gasBlast':
      discover('gasBlast');
      blast(ev.x, ev.y, ev.r * 1.15, 30, '#ffd45e', ev.owner);
      damageText(ev.x, ev.y - 20, 'GAS BLAST', { color: '#ffd45e', size: 20 });
      break;
    case 'disperse': discover('disperse'); break;
    case 'dilute': discover('dilute'); break;
    case 'bogArea': discover('bog'); break;
    case 'boil': discover('steam'); break;
    default: break;
  }
}

// --- per-tick upkeep ----------------------------------------------------------------

const SURFACE_TICK = 0.5;

export function updateElements(dt) {
  updateSurfaces(dt);

  // Enemy statuses.
  for (const e of world.enemies) {
    if (e.dead || !e.status) continue;
    const st = e.status;
    for (const k of Object.keys(st)) {
      st[k].t -= dt;
      if (st[k].t <= 0) delete st[k];
    }
    if (st.burning || st.poisoned) {
      e.dotT = (e.dotT || 0) + dt;
      if (e.dotT >= 0.4) {
        e.dotT = 0;
        const dps = (st.burning ? st.burning.dps : 0) + (st.poisoned ? st.poisoned.dps : 0);
        if (api && dps > 0) api.dealDamage(e, dps * 0.4, { raw: true, chained: true, noCrit: true, silent: true });
        if (st.burning) burst(e.x, e.y - e.r * 0.3, { count: 2, color: '#ff8a3d', speed: 40, size: 3.5, life: 0.4, dir: -Math.PI / 2, spread: 1, gravity: -60, drag: 1.5 });
        if (st.poisoned) burst(e.x, e.y - e.r * 0.3, { count: 1, color: '#9be34a', speed: 20, size: 3.5, life: 0.6, gravity: -30, drag: 1 });
      }
    }
    if (st.chilled && !e.boss) e.slow = { mult: 1 - 0.18 * (st.chilled.stacks || 1), time: 0.2 };
    if (st.wet && Math.random() < dt * 4) burst(e.x + rand(-e.r, e.r) * 0.6, e.y, { count: 1, color: '#7fc4ff', speed: 30, size: 2.4, life: 0.4, dir: Math.PI / 2, spread: 0.3, gravity: 200, drag: 1 });
    // Regenerating enemies heal unless poisoned.
    if (e.regen && !st.poisoned && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
  }

  // Player statuses (damage over time goes through damagePlayer as a dot).
  const p = world.player;
  if (p && !p.dead && p.status) {
    const st = p.status;
    for (const k of Object.keys(st)) {
      st[k].t -= dt;
      if (st[k].t <= 0) delete st[k];
    }
    if (st.burning || st.poisoned) {
      p.dotT = (p.dotT || 0) + dt;
      if (p.dotT >= 0.5) {
        p.dotT = 0;
        const dps = (st.burning ? st.burning.dps : 0) + (st.poisoned ? st.poisoned.dps : 0);
        if (api && dps > 0) api.damagePlayer(Math.max(1, Math.round(dps * 0.5)), null, null, st.burning ? 'burning' : 'poison', { dot: true });
      }
    }
  }

  // Surfaces affect whoever stands in them, every half second.
  if (p) p.inMud = false;
  for (const s of world.surfaces) {
    s.tickT = (s.tickT || 0) - dt;
    const ticking = s.tickT <= 0;
    if (ticking) s.tickT = SURFACE_TICK;
    const def = SURFACE_TYPES[s.type];
    for (const e of world.enemies) {
      if (e.dead || e.spawning || e.hidden || (e.z || 0) > 0) continue;
      if (dist(e.x, e.y, s.x, s.y) > s.r) continue;
      if (s.type === 'mud' || s.type === 'oil') e.slow = { mult: s.type === 'mud' ? 0.5 : 0.7, time: 0.2 };
      if (!ticking) continue;
      if (s.type === 'electrified') {
        hitElement(e, 'storm', { damage: 10, owner: s.owner });
        if (api) api.dealDamage(e, 6, { raw: true, chained: true, noCrit: true, silent: true });
      } else if (def.element) {
        hitElement(e, def.element, { damage: 10, owner: s.owner });
      }
    }
    // The player's own surfaces never affect the player (friendly-fire rule).
    if (!p || p.dead || s.owner !== 'enemy') continue;
    if (dist(p.x, p.y, s.x, s.y) > s.r) continue;
    if (s.type === 'mud') p.inMud = true;
    if (!ticking) continue;
    if (s.type === 'electrified') {
      elementOnPlayer('storm', { source: 'electrified water' });
      if (api) api.damagePlayer(5, null, null, 'electrified water', { dot: true });
    } else if (def.element) {
      elementOnPlayer(def.element, { source: def.label });
    }
  }
}

// --- drawing --------------------------------------------------------------------

const STATUS_ICON = {
  burning: '#ff7a3d', wet: '#4aa8ff', chilled: '#9fe2ff', frozen: '#e6f8ff', shocked: '#c58bff',
  poisoned: '#9be34a', brittle: '#b8b0ff', grounded: '#c9a36b', extinguished: '#7f8fa8', hasted: '#fff27a',
};

/** Aura rings, frozen shells and a row of status pips over an enemy. */
export function drawEnemyElements(ctx, e, time) {
  if (e.aura && ELEMENTS[e.aura]) {
    const c = ELEMENTS[e.aura].color;
    ctx.globalAlpha = 0.28 + Math.sin(time * 5 + e.seed) * 0.1;
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 7, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (e.ward > 0) {
    ctx.globalAlpha = 0.35 + Math.sin(time * 8) * 0.1;
    ctx.fillStyle = '#8ef0ff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (e.armor) {
    ctx.strokeStyle = '#c9a36b';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!e.status) return;
  if (hasStatus(e, 'frozen')) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#d8f4ff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const keys = Object.keys(e.status).filter((k) => STATUS_ICON[k] && e.status[k].t > 0);
  if (!keys.length) return;
  const y = e.y - e.r - (e.boss ? 20 : 18);
  let x = e.x - (keys.length - 1) * 5;
  for (const k of keys) {
    ctx.fillStyle = '#0b0712';
    ctx.beginPath();
    ctx.arc(x, y, 4.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = STATUS_ICON[k];
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, TAU);
    ctx.fill();
    x += 10;
  }
}

/** Status pips over the player too (enemy-applied only). */
export function drawPlayerElements(ctx, p) {
  if (!p || !p.status) return;
  const keys = Object.keys(p.status).filter((k) => STATUS_ICON[k] && p.status[k].t > 0);
  if (!keys.length) return;
  const y = p.y - p.r - 16;
  let x = p.x - (keys.length - 1) * 5;
  for (const k of keys) {
    ctx.fillStyle = '#0b0712';
    ctx.beginPath();
    ctx.arc(x, y, 4.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = STATUS_ICON[k];
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, TAU);
    ctx.fill();
    x += 10;
  }
}
