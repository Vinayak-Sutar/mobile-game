// Shared mutable world state. Every system reads and writes this object.

export const world = {
  player: null,
  enemies: [],
  projectiles: [],
  hitboxes: [],
  grenades: [],
  pickups: [],
  hazards: [],      // telegraphed ground attacks (hazards.js)
  surfaces: [],     // puddles, ice, fire, clouds, oil, mud (surfaces.js)
  room: null,
  depth: 1,
  loop: 0,          // how many times the run has looped past the boss
  biome: null,      // terrain/palette chosen at run start
  bossOrder: [],    // the four creature bosses, shuffled per run
  trial: null,      // boss type when playing a Boss Trial, else null
  gold: 0,
  kills: 0,
  runTime: 0,
  damageLog: {},
  timeScale: 1,
  paused: false,
};

// Logical render resolution. The canvas is scaled to fill the viewport, so
// world units stay stable across devices and only the aspect ratio changes.
export const view = {
  w: 1280, h: 720,   // world units
  cw: 0, ch: 0,      // css pixels
  scale: 1,
  dpr: 1,
};

// The playable floor, inset from the view so the HUD has breathing room.
export const arena = { x: 0, y: 0, w: 0, h: 0 };

export function arenaBounds() {
  return { l: arena.x, t: arena.y, r: arena.x + arena.w, b: arena.y + arena.h };
}

export function resetWorld() {
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.hitboxes.length = 0;
  world.grenades.length = 0;
  world.pickups.length = 0;
  world.hazards.length = 0;
  world.surfaces.length = 0;
  world.room = null;
  world.depth = 1;
  world.loop = 0;
  world.bossOrder = [];
  world.trial = null;
  world.gold = 0;
  world.kills = 0;
  world.runTime = 0;
  world.damageLog = {};
  world.timeScale = 1;
}

export function clearEntities() {
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.hitboxes.length = 0;
  world.grenades.length = 0;
  world.pickups.length = 0;
  world.hazards.length = 0;
  world.surfaces.length = 0;
}
