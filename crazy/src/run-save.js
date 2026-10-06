// A JOURNEY YOU CAN PUT DOWN.
//
// Named `run` throughout rather than `journey`, because The Wilds already owns
// that word in this codebase (wilds-save.js, wilds-progress.js) and game.js
// imports both. Two different things called journey in one file is how bugs
// get written.
//
// Three acts of twelve chambers is thirty minutes. Nobody gives a browser game
// thirty uninterrupted minutes, and they should not have to: the whole reason
// the run was split into acts is that you can stop. That promise is only real
// if stopping costs nothing - so this file is what makes "Stop Here" honest.
//
// WHAT IS SAVED, AND WHEN
//
// At chamber boundaries, and nowhere else. advanceRoom() is the one moment the
// world is quiet: no bullets in flight, no half-dead enemies, no boss mid-move.
// Close the tab in the middle of a fight and you come back to the START of
// that chamber, which is what the browser roguelikes that keep their players
// do. It also means live combat is never serialised, which is the thing that
// turns a save system into a bug farm.
//
// THE BUILD IS REPLAYED, NOT COPIED
//
// A build is stored as the id-to-level maps the game already keeps, and put
// back by running applyBoon and learnSpell again - never by writing numbers
// into player.stats. Copying stats would freeze today's balance into every old
// save: retune a boon next month and anyone mid-journey keeps the old one
// forever, silently. Replaying costs a few milliseconds once per resume and is
// correct by construction.
//
// ENTRY AND NOW
//
// Two builds are kept. `now` is what you hold; `entry` is what you walked into
// the current act with. Death puts you back to `entry` at the start of the act
// rather than ending the journey - a loss costs a session, never an evening -
// and that is the whole reason the second one exists.

import { WEAPONS } from './weapons.js';
import { applyBoon, boonById } from './boons.js';
import { learnSpell } from './spells.js';
import { save, writeSave } from './save.js';
import { actStartDepth } from './acts.js';

/** Bumped only when the shape below changes incompatibly. */
export const RUN_VERSION = 1;

/**
 * Everything about a player that is theirs rather than the room's.
 *
 * hp and lives are copied because they are state, not something derived from
 * a rule that might be retuned. Everything else is a recipe.
 */
export function captureBuild(p) {
  if (!p) return null;
  return {
    weapon: p.weapon ? p.weapon.id : null,
    boons: { ...p.boons },
    boonOrder: [...p.boonOrder],
    spellLv: { ...(p.spellLv || {}) },
    spells: [...(p.spells || [])],
    hp: Math.max(1, Math.round(p.hp)),
    lives: p.lives,
  };
}

/** The weapon a build was taken with, or the first one if it has gone. */
export function weaponOf(build) {
  return (build && WEAPONS.find((w) => w.id === build.weapon)) || WEAPONS[0];
}

/**
 * Put a build back onto a freshly made player.
 *
 * Order matters: boons in the order they were taken, because some of them read
 * the stat they are about to change ("+9 the first time, +6 after"). Taking
 * them in a different order would give a different player.
 */
export function applyBuild(p, build) {
  if (!p || !build) return p;

  for (const id of build.boonOrder) {
    const b = boonById(id);
    if (!b) continue;                                  // a boon that has since been removed
    const level = build.boons[id] || 0;
    for (let i = 0; i < level; i++) applyBoon(p, b);
  }

  // Spells are replayed into their slots, then levelled to where they were.
  for (const id of build.spells) {
    if (!id) continue;
    learnSpell(p, id);
    const want = (build.spellLv || {})[id] || 1;
    for (let i = 1; i < want; i++) learnSpell(p, id);
  }
  // Spells known but not equipped keep their level too.
  for (const [id, lv] of Object.entries(build.spellLv || {})) {
    if (build.spells.includes(id)) continue;
    if (!p.spellLv) p.spellLv = {};
    p.spellLv[id] = Math.max(p.spellLv[id] || 0, lv);
  }

  // After the replay, because applyBoon raises maxHp and heals as it goes.
  p.hp = Math.min(p.stats.maxHp, Math.max(1, build.hp));
  if (Number.isFinite(build.lives)) p.lives = build.lives;
  return p;
}

/** Is there a journey waiting? */
export const hasRun = () => !!(save.run && save.run.v === RUN_VERSION && save.run.act);

/** The journey in progress, or null. */
export const currentRun = () => (hasRun() ? save.run : null);

/**
 * Write the journey down. Called at chamber boundaries only.
 *
 * `entry` is carried forward untouched unless the caller replaces it, so an
 * ordinary chamber save cannot quietly move the point a death returns you to.
 */
export function saveRun(world, { entry } = {}) {
  const p = world.player;
  if (!p) return;
  const prev = save.run || {};
  save.run = {
    v: RUN_VERSION,
    act: world.act || 1,
    depth: world.depth || 1,
    biome: world.biome ? world.biome.id : null,
    bosses: [...(world.bossOrder || [])],
    loop: world.loop || 0,
    gold: world.gold || 0,
    kills: world.kills || 0,
    runTime: world.runTime || 0,
    now: captureBuild(p),
    entry: entry || prev.entry || captureBuild(p),
  };
  writeSave();
}

/** An act has been cleared: what you hold becomes what you fall back to. */
export function bankAct(world, nextAct) {
  const p = world.player;
  if (!p) return;
  world.act = nextAct;
  world.depth = actStartDepth(nextAct) - 1;   // advanceRoom takes it to the first
  saveRun(world, { entry: captureBuild(p) });
}

/** The journey is over - won, abandoned, or given up on. */
export function clearRun() {
  save.run = null;
  writeSave();
}

/** One line for the title screen. */
export function runLabel() {
  const r = currentRun();
  if (!r) return null;
  const boons = (r.now && r.now.boonOrder.length) || 0;
  return `Act ${r.act} · chamber ${r.depth} · ${boons} boon${boons === 1 ? '' : 's'}`;
}
