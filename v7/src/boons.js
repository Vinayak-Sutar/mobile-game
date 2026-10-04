// Boons are the run's progression layer: after most rooms the player picks
// one of three, and they stack. Each just mutates player.stats.

import { shuffle, chance } from './util.js';
import { healPlayer } from './combat.js';

export const GODS = {
  pyros:  { name: 'Pyros',  color: '#ff7a3d', glyph: '🔥', domain: 'Flame' },
  astra:  { name: 'Astra',  color: '#6fe3ff', glyph: '⚡', domain: 'Storm' },
  gaia:   { name: 'Gaia',   color: '#7dff9c', glyph: '🌿', domain: 'Life' },
  zephyr: { name: 'Zephyr', color: '#9fb8ff', glyph: '🌀', domain: 'Wind' },
  nyx:    { name: 'Nyx',    color: '#c07bff', glyph: '🌑', domain: 'Shadow' },
};

export const BOONS = [
  // --- Pyros: raw damage and fire ---
  {
    id: 'ember', god: 'pyros', name: 'Ember Strike', max: 6,
    desc: () => '+22% damage dealt.',
    apply: (s) => { s.damageMult += 0.22; },
  },
  {
    id: 'cinder', god: 'pyros', name: 'Cinder Trail', max: 4,
    desc: (lv) => `Your hits burn for ${9 + lv * 6} damage per second over 3s.`,
    apply: (s) => { s.burn += s.burn === 0 ? 9 : 6; },
  },
  {
    id: 'immolate', god: 'pyros', name: 'Immolation', max: 4, rare: true,
    desc: (lv) => `Slain foes explode for ${26 + lv * 14} damage.`,
    apply: (s) => { s.explodeOnKill += s.explodeOnKill === 0 ? 26 : 14; },
  },

  // --- Astra: speed and chaining ---
  {
    id: 'charged', god: 'astra', name: 'Charged Edge', max: 5,
    desc: () => '+18% attack speed.',
    apply: (s) => { s.attackSpeed += 0.18; },
  },
  {
    id: 'arcchain', god: 'astra', name: 'Arc Chain', max: 3, rare: true,
    desc: (lv) => `Hits arc to ${lv + 1} nearby foe${lv ? 's' : ''} for 55% damage.`,
    apply: (s) => { s.chain += 1; },
  },
  {
    id: 'staticdash', god: 'astra', name: 'Static Dash', max: 4,
    desc: (lv) => `Dashing shocks nearby foes for ${34 + lv * 20} damage.`,
    apply: (s) => { s.dashDamage += s.dashDamage === 0 ? 34 : 20; },
  },

  // --- Gaia: survivability ---
  {
    id: 'vigor', god: 'gaia', name: 'Verdant Vigor', max: 6,
    desc: () => '+18 max health, and heal that much now.',
    apply: (s) => { s.maxHp += 18; healPlayer(18, false); },
  },
  {
    id: 'bloodroot', god: 'gaia', name: 'Bloodroot', max: 4,
    desc: (lv) => `Heal for ${7 + lv * 4}% of damage you deal.`,
    apply: (s) => { s.lifesteal += s.lifesteal === 0 ? 0.07 : 0.04; },
  },
  {
    id: 'stoneskin', god: 'gaia', name: 'Stone Skin', max: 3, rare: true,
    desc: () => 'Take 18% less damage.',
    apply: (s) => { s.damageReduction = Math.min(0.65, s.damageReduction + 0.18); },
  },

  // --- Zephyr: mobility ---
  {
    id: 'swiftstep', god: 'zephyr', name: 'Swift Step', max: 5,
    desc: () => '+14% movement speed.',
    apply: (s) => { s.moveSpeed += 0.14; },
  },
  {
    id: 'secondwind', god: 'zephyr', name: 'Second Wind', max: 2, rare: true,
    desc: () => '+1 dash charge.',
    apply: (s) => { s.dashCharges += 1; },
  },
  {
    id: 'galeforce', god: 'zephyr', name: 'Gale Force', max: 4,
    desc: () => '+70% knockback and +8% damage.',
    apply: (s) => { s.knockbackMult += 0.7; s.damageMult += 0.08; },
  },
  {
    id: 'slipstream', god: 'zephyr', name: 'Slipstream', max: 3,
    desc: (lv) => `Struck foes are slowed by ${30 + lv * 10}% for 2s.`,
    apply: (s) => { s.slowOnHit = Math.min(0.7, s.slowOnHit + (s.slowOnHit === 0 ? 0.3 : 0.1)); },
  },

  // --- Nyx: crits and shadow ---
  {
    id: 'keeneye', god: 'nyx', name: 'Keen Eye', max: 5,
    desc: () => '+18% critical chance.',
    apply: (s) => { s.critChance = Math.min(0.95, s.critChance + 0.18); },
  },
  {
    id: 'deepcut', god: 'nyx', name: 'Deep Cut', max: 4, rare: true,
    desc: (lv) => `Critical hits deal ${(2 + (lv + 1) * 0.7).toFixed(1)}x damage.`,
    apply: (s) => { s.critMult += 0.7; },
  },
  {
    id: 'umbralbarb', god: 'nyx', name: 'Umbral Barb', max: 4,
    desc: (lv) => `Hits sometimes loose a seeking bolt for ${16 + lv * 10} damage.`,
    apply: (s) => { s.bolt += s.bolt === 0 ? 16 : 10; },
  },
  {
    id: 'retribution', god: 'nyx', name: 'Retribution', max: 3, rare: true,
    desc: (lv) => `Taking damage blasts foes around you for ${40 + lv * 25}.`,
    apply: (s) => { s.retribution += s.retribution === 0 ? 40 : 25; },
  },
];

export function boonById(id) {
  return BOONS.find((b) => b.id === id);
}

/** Pick `count` distinct boons the player can still take. */
export function offerBoons(player, count = 3) {
  const eligible = BOONS.filter((b) => (player.boons[b.id] || 0) < b.max);
  // Slightly favour boons the player already owns so builds converge instead
  // of ending up as a flat spread of one-offs.
  const weighted = [];
  for (const b of eligible) {
    const owned = player.boons[b.id] || 0;
    let w = b.rare ? 2 : 4;
    if (owned > 0) w += 2;
    for (let i = 0; i < w; i++) weighted.push(b);
  }
  const out = [];
  const pool = shuffle(weighted);
  for (const b of pool) {
    if (out.length >= count) break;
    if (!out.includes(b)) out.push(b);
  }
  return out;
}

export function applyBoon(player, boon) {
  const level = player.boons[boon.id] || 0;
  boon.apply(player.stats, level);
  player.boons[boon.id] = level + 1;
  player.boonOrder = player.boonOrder.filter((id) => id !== boon.id);
  player.boonOrder.push(boon.id);
}

export function describeBoon(player, boon) {
  return boon.desc(player.boons[boon.id] || 0);
}

export function isRareRoll() {
  return chance(0.2);
}
