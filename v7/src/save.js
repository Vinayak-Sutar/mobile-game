// Persistent meta progression — the between-runs layer that turns a losing
// run into progress instead of a dead end.

// This version keeps its own save, under the one key name.js owns. It does
// NOT seed from an older version: the campaign's save is a different shape
// (owned boons, a loadout, level progress), and inheriting a chamber run's
// darkness and upgrades would start a new player somewhere meaningless.
import { SAVE_KEY } from './name.js';

const KEY = SAVE_KEY;

const DEFAULTS = {
  darkness: 0,
  upgrades: { vitality: 0, might: 0, alacrity: 0, fortune: 0 },
  best: { depth: 0, kills: 0, gold: 0 },
  runs: 0,
  wins: 0,
  muted: false,
  musicOn: true,
  musicVolume: 0.7,
  musicLead: {},
  outfit: null,
  // ONE answer to "has the player done this". See the note above `progress`.
  progress: { missions: {}, flags: {}, met: {} },
  biome: 'ember',
  moveSpeed: 0.85,       // walking speed multiplier (settings); 1 was the old default
  tutorialSeen: false,   // the tutorial is offered once, before the first run
  showFps: false,        // frames per second and frame cost, in the corner
  mapNoFog: false,       // The Wilds' map shows everything, not just where you have been
};

/**
 * Fold the four old flag stores into `progress`, then drop them.
 *
 * Only v7's own early saves can have these - this folder does not seed from
 * another version - so the window is small, but a player who opened the game
 * yesterday should not lose a dungeon clear to a refactor. The lair kills are
 * NOT migrated here: they live in the journey save, and wilds-world.js folds
 * them in when it restores (see restoreWorld).
 */
function migrate(parsed) {
  const p = prog();
  for (const id of Object.keys(parsed.dungeonsCleared || {})) {
    if (parsed.dungeonsCleared[id] && !p.missions[id]) {
      p.missions[id] = { done: true, clears: 1, deaths: 0 };
    }
  }
  for (const [npc, st] of Object.entries(parsed.talks || {})) {
    if (st && st.met) p.met[npc] = true;
    for (const k of Object.keys((st && st.taken) || {})) p.flags[k] = true;
  }
  delete save.dungeonsCleared;
  delete save.talks;
}

/**
 * PROGRESS: the one answer to "has the player done this thing".
 *
 * There used to be four, and they disagreed. `save.dungeonsCleared` was
 * account-scoped and leaked across journeys; `save.talks` was account-scoped
 * but wiped by hand when a new journey started; `worldSnapshot().lairs` and
 * `.claimed` were journey-scoped. Two localStorage keys, two versioning
 * rules, no stated reason for the split. Unifying it after a mission table
 * had been written would have meant migrating live saves, so it happens now.
 *
 *   missions  id -> { done, clears, deaths }. Dungeons AND lair bosses: in
 *             this game both are missions, so both live here.
 *   flags     ONE namespace, not one per character. A choice's `needs` can
 *             now read a flag any other character set, which the old
 *             per-NPC map made impossible.
 *   met       npc id -> true.
 *
 * All of it is account-scoped: a campaign is one continuous thing, and
 * starting a new journey into the Wilds no longer makes the world forget
 * your name. World state - lamps, fog, which reliquaries you opened - stays
 * in worldSnapshot() where it belongs, because that genuinely does reset.
 */
function prog() {
  if (!save.progress) save.progress = { missions: {}, flags: {}, met: {} };
  const p = save.progress;
  if (!p.missions) p.missions = {};
  if (!p.flags) p.flags = {};
  if (!p.met) p.met = {};
  return p;
}

/** Has this mission ever been completed? */
export function missionDone(id) { return !!(prog().missions[id] || {}).done; }

/** Every mission completed at least once. */
export function missionsDone() {
  return Object.keys(prog().missions).filter((id) => prog().missions[id].done);
}

/** Record a clear, a death, or anything else about a mission. */
export function markMission(id, patch = { done: true }) {
  const m = prog().missions[id] || { done: false, clears: 0, deaths: 0 };
  prog().missions[id] = { ...m, ...patch };
  writeSave();
}

/** One clear: sets done, counts the clear. Replays count - that is the loop. */
export function clearMission(id) {
  const m = prog().missions[id] || { done: false, clears: 0, deaths: 0 };
  markMission(id, { done: true, clears: (m.clears || 0) + 1 });
}

export function flag(name) { return !!prog().flags[name]; }
export function setFlag(name, on = true) { prog().flags[name] = !!on; writeSave(); }

export function hasMet(npcId) { return !!prog().met[npcId]; }
export function markMet(npcId) { prog().met[npcId] = true; writeSave(); }

/** What dialogue.js reads: who you have met, and every flag ever set. */
export function talkState() { return prog(); }

export const UPGRADES = [
  {
    id: 'vitality', name: 'Vitality', max: 5,
    desc: (lv) => `+${(lv + 1) * 10} max health`,
    cost: (lv) => 30 + lv * 25,
  },
  {
    id: 'might', name: 'Might', max: 5,
    desc: (lv) => `+${(lv + 1) * 6}% damage`,
    cost: (lv) => 35 + lv * 30,
  },
  {
    id: 'alacrity', name: 'Alacrity', max: 2,
    desc: (lv) => `+${lv + 1} dash charge${lv ? 's' : ''}`,
    cost: (lv) => 120 + lv * 150,
  },
  {
    id: 'fortune', name: 'Fortune', max: 3,
    desc: (lv) => `+${(lv + 1) * 20}% gold gained`,
    cost: (lv) => 60 + lv * 60,
  },
];

export let save = structuredClone(DEFAULTS);

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      save = {
        ...structuredClone(DEFAULTS),
        ...parsed,
        upgrades: { ...DEFAULTS.upgrades, ...(parsed.upgrades || {}) },
        best: { ...DEFAULTS.best, ...(parsed.best || {}) },
        progress: { ...structuredClone(DEFAULTS.progress), ...(parsed.progress || {}) },
      };
      migrate(parsed);
    }
  } catch {
    // Corrupt or unavailable storage (private mode) — fall back to defaults.
    save = structuredClone(DEFAULTS);
  }
  return save;
}

export function writeSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Nothing we can do; the run still plays fine without persistence.
  }
}

export function upgradeCost(u) {
  return u.cost(save.upgrades[u.id] || 0);
}

export function canAfford(u) {
  const lv = save.upgrades[u.id] || 0;
  return lv < u.max && save.darkness >= upgradeCost(u);
}

export function buyUpgrade(u) {
  if (!canAfford(u)) return false;
  save.darkness -= upgradeCost(u);
  save.upgrades[u.id] = (save.upgrades[u.id] || 0) + 1;
  writeSave();
  return true;
}

export function metaBonuses() {
  return { ...save.upgrades };
}

export function goldMultiplier() {
  return 1 + (save.upgrades.fortune || 0) * 0.2;
}

export function bankRun({ gold, depth, kills, won }) {
  save.darkness += Math.round(gold * goldMultiplier());
  save.runs += 1;
  if (won) save.wins += 1;
  save.best.depth = Math.max(save.best.depth, depth);
  save.best.kills = Math.max(save.best.kills, kills);
  save.best.gold = Math.max(save.best.gold, gold);
  writeSave();
}

export function resetSave() {
  save = structuredClone(DEFAULTS);
  writeSave();
}
