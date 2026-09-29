// Shared mutable world state. Every system reads and writes this object.

export const world = {
  // EVERY PLAYER, not one. `players[0]` is player one and, on a networked
  // game, the one this device is driving; `players[1]` is the second pad or
  // the peer. `world.player` below is an alias for players[0], so the 157
  // places that already say `world.player` keep working and only the ones
  // whose MEANING is wrong ("the nearest player", "the player who was hit")
  // have to be touched.
  players: [],
  enemies: [],
  projectiles: [],
  spellZones: [],      // lasting spells (sigil, singularity, meteors)
  hitboxes: [],
  grenades: [],
  pickups: [],
  hazards: [],      // telegraphed ground attacks (hazards.js)
  corpses: [],      // bodies left by kills, for the Vetala (enemies-folk.js)
  training: false,  // the Training Ground, not a run
  tutorial: false,  // the tutorial chamber (tutorial.js)
  overworld: false, // The Wilds, the open world (wilds-world.js)
  owBoss: null,     // a guardian fought from one of The Wilds' gates
  dungeon: false,   // inside a dungeon (dungeon.js)
  room: null,
  depth: 1,
  loop: 0,          // how many times the run has looped past the boss
  biome: null,      // terrain/palette chosen at run start
  bossOrder: [],    // every guardian, shuffled per run (boss-pool.js)
  beaten: [],       // guardians beaten so far this run (the Monkey King borrows them)
  trial: null,      // boss type when playing a Boss Trial, else null
  gold: 0,
  kills: 0,
  runTime: 0,
  damageLog: {},
  timeScale: 1,
  paused: false,
};

/**
 * PLAYER ONE, BY ITS OLD NAME.
 *
 * It is a real property with a getter AND a setter, so both halves of the
 * existing code keep working unchanged: the seven `world.player = createPlayer(…)`
 * writes in game.js, and every read everywhere else. Nothing has to be
 * rewritten to add a second player - only the places that meant something
 * other than "player one" all along.
 */
Object.defineProperty(world, 'player', {
  get() { return world.players[0] || null; },
  set(p) { world.players[0] = p; },
  enumerable: true,
  configurable: true,
});

/** Everyone still standing. Empty between runs. */
export function livePlayers() {
  return world.players.filter((p) => p && !p.dead);
}

/**
 * Whichever player is closest to a point - what an enemy means when it says
 * "the player". Falls back to player one so a caller never gets null while
 * anyone is alive.
 */
export function nearestPlayer(x, y) {
  const live = livePlayers();
  if (live.length < 2) return live[0] || world.players[0] || null;
  let best = null, bestD = Infinity;
  for (const p of live) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Bumped when the browser throws the GPU's canvases away (a phone does this to
// a backgrounded app). Every cached drawing keys on it, so they all rebuild.
export const gfx = { epoch: 0 };

// Player-facing tuning from the settings (game.js copies it from the save).
// speed: the player's walking speed, as a multiple of the base.
export const tuning = { speed: 0.85 };

// Logical render resolution. The canvas is scaled to fill the viewport, so
// world units stay stable across devices and only the aspect ratio changes.
export const view = {
  w: 1280, h: 720,   // world units
  cw: 0, ch: 0,      // css pixels
  scale: 1,
  dpr: 1,
};

// The top-left of the view in world units. Always 0,0 in the chambers (the
// whole room is on screen); The Wilds scroll it after the player.
export const camera = { x: 0, y: 0 };

// The playable floor, inset from the view so the HUD has breathing room.
export const arena = { x: 0, y: 0, w: 0, h: 0 };

export function arenaBounds() {
  return { l: arena.x, t: arena.y, r: arena.x + arena.w, b: arena.y + arena.h };
}

export function resetWorld() {
  world.dungeon = false;
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.spellZones.length = 0;
  world.hitboxes.length = 0;
  world.grenades.length = 0;
  world.pickups.length = 0;
  world.hazards.length = 0;
  world.corpses.length = 0;
  world.room = null;
  world.depth = 1;
  world.loop = 0;
  world.bossOrder = [];
  world.beaten = [];
  world.trial = null;
  world.training = false;
  world.tutorial = false;
  world.overworld = false;
  world.owBoss = null;
  camera.x = 0;
  camera.y = 0;
  world.gold = 0;
  world.kills = 0;
  world.runTime = 0;
  world.damageLog = {};
  world.timeScale = 1;
}

export function clearEntities() {
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.spellZones.length = 0;
  world.hitboxes.length = 0;
  world.grenades.length = 0;
  world.pickups.length = 0;
  world.hazards.length = 0;
  world.corpses.length = 0;
}
