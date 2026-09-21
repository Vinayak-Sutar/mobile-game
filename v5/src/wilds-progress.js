// The Wilds' souls-like progression: Cinders, levels, and what dying costs.
//
// CINDERS are the currency - "the last warmth of fallen things". Enemies shed
// them (they are the Wilds' use of the gold pickups), and you spend them at
// an Ashlamp to level up. You carry them: fall with no life to spare and they
// stay where you fell, as your SMOULDER. Walk back and touch it to take them
// all back; fall again before you do and they are gone.
//
// LEVELS are bought one at a time, each dearer than the last, in four
// attributes (the owner's list: health, damage, dashes, spell slots):
//
//   Vigor       +12 max health a level
//   Might       +5% damage a level
//   Grace       dashes recharge 3% faster a level; +1 dash at 3, 7 and 12
//   Attunement  spells recharge 3% faster a level; a spell slot at 2, 5 and 9
//               (you start with one)
//
// The Wilds keep their own progression: the Mirror of Night's upgrades (bought
// with Darkness in the chamber runs) do not apply out here.

import { world } from './state.js';
import { START_LIVES } from './player.js';
import { GRENADE } from './grenade.js';

export const ATTRS = [
  { id: 'vigor', name: 'Vigor', max: 25, what: '+12 max health' },
  { id: 'might', name: 'Might', max: 25, what: '+5% damage' },
  { id: 'grace', name: 'Grace', max: 12, what: 'faster dash recharge; +1 dash at levels 3, 7 and 12' },
  { id: 'attune', name: 'Attunement', max: 10, what: 'faster spell recharge; a spell slot at levels 2, 5 and 9' },
];

const DASH_AT = [3, 7, 12];
const SLOT_AT = [2, 5, 9];

/** The journey's levels, and a fresh set for a new one. */
export const journey = { levels: { vigor: 0, might: 0, grace: 0, attune: 0 }, smoulder: null };

export function resetJourney() {
  journey.levels = { vigor: 0, might: 0, grace: 0, attune: 0 };
  journey.smoulder = null;
}

/** Your level: one for every level bought. */
export function totalLevel() {
  const L = journey.levels;
  return 1 + L.vigor + L.might + L.grace + L.attune;
}

/** What the next level costs, rising with every one you have. */
export function levelCost() {
  return Math.round(60 + 14 * Math.pow(totalLevel(), 1.4));
}

export const spellSlotsFor = (attune) => 1 + SLOT_AT.filter((n) => attune >= n).length;

/**
 * Put the levels onto a freshly made player's stats (createPlayer with no
 * Mirror bonuses). Called whenever the player is made or a level is bought.
 */
export function applyLevels(p, base) {
  const L = journey.levels;
  const s = p.stats;
  s.maxHp = base.maxHp + L.vigor * 12;
  s.damageMult = base.damageMult * (1 + L.might * 0.05);
  s.dashCharges = base.dashCharges + DASH_AT.filter((n) => L.grace >= n).length;
  s.dashRate = 1 + L.grace * 0.03;
  s.spellCdMult = 1 / (1 + L.attune * 0.03);
  p.spellSlots = spellSlotsFor(L.attune);
  // Spells beyond your slots are still known (their levels are kept); they
  // just are not equipped until Attunement opens a slot.
  if (p.spells.length > p.spellSlots) p.spells = p.spells.slice(0, p.spellSlots);
  p.dashStock = Math.min(p.dashStock, s.dashCharges);
}

/** Buy a level in an attribute. Returns false if it is maxed or unaffordable. */
export function buyLevel(id, p, base) {
  const a = ATTRS.find((q) => q.id === id);
  if (!a || journey.levels[id] >= a.max) return false;
  const cost = levelCost();
  if (world.gold < cost) return false;
  world.gold -= cost;
  journey.levels[id]++;
  const frac = p.hp / p.stats.maxHp;
  applyLevels(p, base);
  p.hp = Math.max(1, Math.round(p.stats.maxHp * frac));
  if (id === 'grace') p.dashStock = p.stats.dashCharges;
  return true;
}

/**
 * Fallen with no life to spare: your Cinders stay where you fell. Any older
 * smoulder is lost.
 */
export function dropSmoulder(x, y) {
  journey.smoulder = world.gold > 0 ? { x, y, amount: world.gold } : null;
  world.gold = 0;
}

/** Touching your smoulder gives it all back. Returns the amount, or 0. */
export function takeSmoulder(p) {
  const s = journey.smoulder;
  if (!s || Math.hypot(p.x - s.x, p.y - s.y) > 44) return 0;
  world.gold += s.amount;
  journey.smoulder = null;
  return s.amount;
}

/** A rest at an Ashlamp: everything back. */
export function restore(p) {
  p.hp = p.stats.maxHp;
  p.lives = START_LIVES;
  p.dashStock = p.stats.dashCharges;
  if (p.spellCds) for (const k of Object.keys(p.spellCds)) p.spellCds[k] = 0;
  p.grenadeStock = GRENADE.maxCharges;
}
