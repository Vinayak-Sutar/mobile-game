// Dungeons: places to go down into, and clear. The dungeons themselves are
// built in dungeon-levels.js; this runs whichever one you are in.
//
// What the research said players love (journal §16.51), and how it is built:
//   - A CRITICAL PATH with LOCKS, side LOOPS that hold the KEYS, and SHORTCUTS
//     that open when you come round a loop the other way (Zelda, as Game
//     Maker's Toolkit's Boss Keys maps it).
//   - Catacombs as Elden Ring builds them: traps, ambushes, a lamp (a
//     checkpoint) near the great door, a boss at the end.
//   - FLOORS, as A Link to the Past stacks them: stairs take you to the floor
//     above or below, and a HOLE drops you to whatever is under it at the same
//     spot - so a fall is not only a punishment but another way on.
//   - Traps with a TELL, always: spikes that peek, slits that glow, vents that
//     smoke, cracked tiles that shake, blades whose swing you can time,
//     crushers whose shadow grows, icicles that creak.
//   - Each dungeon is built round ONE mechanic, taught, tested and twisted
//     (dungeon-levels.js): the water level, lava and platforms, red and blue
//     pegs, ice.
//
// A dungeon is a stack of FLOORS, each a grid of 64-unit tiles (the legend is
// in dungeon-levels.js). Some tiles depend on the dungeon's state, which is
// shared by every floor: the water (high or low) and the peg colour (red or
// blue). Everything that moves lives here; dungeon-draw.js draws it.

import { world, arena, camera, view } from './state.js';
import { TAU, clamp, dist, circleArc, circleOrientedRect } from './util.js';
import { spawnEnemy } from './enemies.js';
import { damagePlayer, dealDamage } from './combat.js';
import { burst, ring, shake } from './fx.js';
import { sfx } from './audio.js';
import { spawnProjectile } from './spawn.js';
import { DUNGEON_DEFS } from './dungeon-levels.js';

export const T = 64;                       // a tile
const SOLID = new Set(['#', 'o', '>', '<', 'v', 'G', 'B', 'O', 'H']);
const MOBS = {
  s: 'slinger', b: 'boneling', d: 'draugr', p: 'spearman', n: 'necro', c: 'crossbow', w: 'wretch',
  q: 'kappa', e: 'preta', i: 'brute', m: 'bomber', r: 'ronin', j: 'ninja', f: 'kitsune', t: 'tengu',
  h: 'jiangshi', u: 'wolf', a: 'banshee', z: 'zealot',
};
export const BELTS = { '→': [1, 0], '←': [-1, 0], '↑': [0, -1], '↓': [0, 1] };
const BELT_SPEED = 150;
const SLIDE_SPEED = 400;

// --- the live dungeon ----------------------------------------------------------------------

let D = null;
export const dungeonState = () => D;

/** Where a floor tile is, as a character (walls out of bounds). */
function at(F, i, j) { return i < 0 || j < 0 || j >= F.g.length || i >= F.g[0].length ? '#' : F.g[j][i]; }
const tileOf = (v) => Math.floor(v / T);
export const tileAt = (F, x, y) => at(F, tileOf(x), tileOf(y));

/** Is this tile a wall right now (pegs, water and screens depend on the dungeon's state)? */
export function solidTile(c) {
  if (SOLID.has(c)) return true;
  if (c === '1') return !!D && D.color === 'red';
  if (c === '2') return !!D && D.color === 'blue';
  if (c === '~') return !!D && D.water === 'high';
  return false;
}
/** Is this tile a hole (a way down, or the abyss)? Lava is not a hole: it burns. */
export function holeTile(F, i, j) {
  const c = at(F, i, j);
  if (c === ' ' || c === 'R') return true;
  if (c === '%') return !D || D.water !== 'high';
  if (c === 'C') { const s = F.crumble.get(j * 64 + i); return !!s && s.state === 'gone'; }
  return false;
}
const isLava = (c) => c === '*';
/** Where you can stand: not a wall, not a hole, not lava. */
function standable(F, i, j) { const c = at(F, i, j); return !solidTile(c) && !holeTile(F, i, j) && !isLava(c); }

/** Walls as rectangles (runs along each row) for the collision loops. */
function rebuild(F) {
  const rects = [], mobRects = [];
  const W = F.g[0].length;
  const wall = (i, j) => solidTile(at(F, i, j));
  const noGo = (i, j) => { const c = at(F, i, j); return wall(i, j) || holeTile(F, i, j) || isLava(c) || 'SDU'.includes(c); };
  for (let j = 0; j < F.g.length; j++) {
    for (const [test, out] of [[wall, rects], [noGo, mobRects]]) {
      let run = -1;
      for (let i = 0; i <= W; i++) {
        const on = i < W && test(i, j);
        if (on && run < 0) run = i;
        if (!on && run >= 0) { out.push({ x: run * T, y: j * T, w: (i - run) * T, h: T, kind: 'dwall' }); run = -1; }
      }
    }
  }
  F.solid = rects;
  F.mobSolid = mobRects;
}
/** The dungeon's state changed (water, pegs, a screen): every floor's walls anew. */
function rebuildAll() {
  for (const F of D.floors) rebuild(F);
  const F = D.floors[D.cur];
  world.room.obstacles = F.solid;
  world.room.enemyObstacles = F.mobSolid;
}

const FLOORISH = '.^PFCAXKL=I~VYZ%h←→↑↓';

function buildFloor(src) {
  const F = { ...src, g: src.g.map((r) => r.slice()), crumble: new Map(), enemies: [], spawns: [], plates: [], vents: [], torches: [], lamps: [], icicles: new Map(), seen: null };
  const H = F.g.length, W = F.g[0].length;
  F.seen = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = F.g[j][i];
      if (MOBS[c] || c === 'M') { F.spawns.push({ type: MOBS[c], i, j, boss: c === 'M' }); F.g[j][i] = '.'; }
      if (c === 'C') F.crumble.set(j * 64 + i, { state: 'ok', t: 0 });
      if (c === 'P') F.plates.push({ i, j, cd: 0, fireT: -1 });
      if (c === 'F') F.vents.push({ i, j, ph: ((i + j) % 4) * 0.75 });
      if (c === 'A') F.lamps.push({ i, j });
      if (c === 'Y') F.icicles.set(j * 64 + i, { state: 'hang', t: 0 });
      // Torches (or lanterns, or braziers) on the walls that look out over a floor.
      if (c === '#' && j + 1 < H && FLOORISH.includes(F.g[j + 1][i]) && (i * 7 + j * 3) % 5 === 0) F.torches.push({ i, j, ph: (i * 1.7 + j) % TAU });
    }
  }
  rebuild(F);
  return F;
}

/**
 * Enter a dungeon. id: which one (dungeon-levels.js). from: 'demo' (the
 * title) or { x, y } in the Wilds.
 */
export function enterDungeon(from, id = 'catacomb') {
  const src = (DUNGEON_DEFS[id] || DUNGEON_DEFS.catacomb)();
  D = {
    ...src,
    keyInfo: src.key,
    pendulums: src.pendulums || [],
    platforms: (src.platforms || []).map((pl) => ({ ...pl, x: pl.path[0][0] * T + T / 2, y: pl.path[0][1] * T + T / 2, dx: 0, dy: 0 })),
    floors: null,
    water: src.water || 'high', waterLevel: src.water === 'low' ? 0 : 1,
    color: src.color || 'red', colorT: 0,
    cur: src.start.floor,
    from,
    key: false, bossDead: false, bossAwake: false,
    checkpoint: { ...src.start },
    safe: null, fall: null, burn: null, slide: null, fade: 0, stairCd: 0, coyote: 0, said: {},
    valveCd: 0, orbCd: 0, turning: null,
    exitAt: null, t: 0,
  };
  D.floors = src.floors.map(buildFloor);
  for (let k = 0; k < D.floors.length; k++) spawnFloor(k);
  switchTo(D.cur, D.start.x * T + T / 2, D.start.y * T + T / 2, true);
  return D;
}

export function leaveDungeon() { D = null; }

/** A floor's enemies, freshly placed (asleep until you come near). */
function spawnFloor(k) {
  const F = D.floors[k];
  const keep = world.enemies;
  world.enemies = [];
  for (const s of F.spawns) {
    if (s.boss && D.bossDead) continue;
    const type = s.boss ? D.boss.type : s.type;
    const e = spawnEnemy(type, s.i * T + T / 2, s.j * T + T / 2, { instant: true, scale: s.boss ? (D.boss.scale || 1.5) : 1.2 });
    if (!e) continue;
    e.home = { x: e.x, y: e.y };
    e.woke = false;
    e.asleep = (q) => !q.woke;
    if (s.boss) { e.champion = D.boss.title; e.dBoss = true; }
  }
  F.enemies = world.enemies;
  world.enemies = keep;
}

/** Make floor k the one you are on, standing at x, y. */
function switchTo(k, x, y, first = false) {
  if (!first) D.floors[D.cur].enemies = world.enemies;
  D.cur = k;
  const F = D.floors[k];
  world.enemies = F.enemies;
  world.projectiles = [];
  world.hazards = [];
  arena.x = 0; arena.y = 0; arena.w = F.g[0].length * T; arena.h = F.g.length * T;
  world.room = { obstacles: F.solid, enemyObstacles: F.mobSolid, dungeon: true };
  const p = world.player;
  p.x = x; p.y = y; p.vx = p.vy = 0;
  D.safe = { k, x, y };
  D.slide = null;
  camera.x = clamp(p.x - view.w / 2, 0, Math.max(0, arena.w - view.w));
  camera.y = clamp(p.y - view.h / 2, 0, Math.max(0, arena.h - view.h));
  D.toast = [F.name.toUpperCase(), F.depth < 0 ? `Below · ${D.name}` : F.depth > 0 ? `Above · ${D.name}` : D.name];
}

/** Everything on every floor back as it was (a rest, or waking from a fall). */
function resetFoes() {
  const here = D.cur;
  D.floors[here].enemies = world.enemies;
  for (let k = 0; k < D.floors.length; k++) spawnFloor(k);
  world.enemies = D.floors[here].enemies;
  for (const F of D.floors) {
    for (const s of F.crumble.values()) { s.state = 'ok'; s.t = 0; }
    for (const s of F.icicles.values()) { s.state = 'hang'; s.t = 0; }
  }
  rebuildAll();
}

/** The floor below k at x, y where you would land: [floor index, true] or [null, false] for the abyss. */
function landingBelow(k, x, y) {
  for (let q = k - 1; q >= 0; q--) {
    const F = D.floors[q];
    const i = tileOf(x), j = tileOf(y);
    if (solidTile(at(F, i, j)) || isLava(at(F, i, j))) return [null, false];
    if (!holeTile(F, i, j)) return [q, true];
  }
  return [null, false];
}

/** The nearest tile to (i, j) you could stand on that passes `ok`, within r tiles. */
function nearestStand(F, i, j, ok = () => true, r = 6) {
  let best = null, bd = Infinity;
  for (let y = j - r; y <= j + r; y++) for (let x = i - r; x <= i + r; x++) {
    if (!standable(F, x, y) || !ok(at(F, x, y))) continue;
    const d = (x - i) ** 2 + (y - j) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

// --- the mechanics ---------------------------------------------------------------------------

/** Did one of your swings or shots touch this point? (Switch orbs, paper screens.) */
function struck(x, y, r) {
  for (const h of world.hitboxes) {
    if (!h.friendly || h.dead) continue;
    let hit;
    if (h.shape === 'arc') hit = circleArc(x, y, r, h.x, h.y, h.angle, h.arc, h.radius);
    else if (h.shape === 'rect') hit = circleOrientedRect(x, y, r, h.x, h.y, h.angle, h.len, h.wid);
    else hit = dist(h.x, h.y, x, y) < (h.radius || 0) + r;
    if (hit) return true;
  }
  for (const pr of world.projectiles) if (pr.friendly && !pr.cleared && dist(pr.x, pr.y, x, y) < (pr.r || 6) + r) { pr.life = 0; return true; }
  return false;
}

/** Turn the water: flood the channels (and raise the floats), or drain them. */
function turnWater(act) {
  D.water = D.water === 'high' ? 'low' : 'high';
  D.valveCd = 1.2;
  sfx.splash(); shake(0.25);
  rebuildAll();
  const p = world.player;
  const F = D.floors[D.cur];
  if (D.water === 'high') {
    // You are lifted out of a channel onto its bank.
    const i = tileOf(p.x), j = tileOf(p.y + p.r * 0.35);
    if (at(F, i, j) === '~') {
      const to = nearestStand(F, i, j, (c) => c !== '~');
      if (to) { p.x = to[0] * T + T / 2; p.y = to[1] * T + T / 2; burst(p.x, p.y, { count: 12, color: '#8ad8e8', speed: 140, size: 4, life: 0.5, drag: 3 }); }
    }
    // Anything wading in a channel drowns, or near enough.
    for (const e of world.enemies) {
      if (e.dead || e.dBoss) continue;
      const ei = tileOf(e.x), ej = tileOf(e.y);
      if (at(F, ei, ej) !== '~') continue;
      const to = nearestStand(F, ei, ej, (c) => c !== '~');
      if (to) { e.x = to[0] * T + T / 2; e.y = to[1] * T + T / 2; }
      if (e.type !== 'kappa') dealDamage(e, e.maxHp * 0.5, { raw: true, source: 'drowned' });
      burst(e.x, e.y, { count: 14, color: '#6ab8d8', speed: 160, size: 4, life: 0.5, drag: 3 });
    }
  }
  act.toast = D.water === 'high'
    ? ['THE WATER RISES', 'Channels flood; the floats rise into bridges']
    : ['THE WATER DRAINS', 'Channels are paths again; the floats sink'];
}

/** Strike a switch orb: every red peg and every blue peg change places. */
function flipPegs(act) {
  D.color = D.color === 'red' ? 'blue' : 'red';
  D.orbCd = 0.5;
  D.colorT = 1;
  sfx.chime(); shake(0.15);
  rebuildAll();
  // Anyone a peg rises under is shoved off it.
  const p = world.player;
  const F = D.floors[D.cur];
  const i = tileOf(p.x), j = tileOf(p.y + p.r * 0.35);
  if (solidTile(at(F, i, j))) { const to = nearestStand(F, i, j); if (to) { p.x = to[0] * T + T / 2; p.y = to[1] * T + T / 2; } }
  for (const e of world.enemies) {
    if (e.dead) continue;
    const ei = tileOf(e.x), ej = tileOf(e.y);
    if (solidTile(at(F, ei, ej))) { const to = nearestStand(F, ei, ej); if (to) { e.x = to[0] * T + T / 2; e.y = to[1] * T + T / 2; } }
  }
  if (!D.said.pegs) { D.said.pegs = true; act.toast = ['THE PEGS CHANGE PLACES', D.color === 'blue' ? 'Red sinks, blue rises' : 'Blue sinks, red rises']; }
}

/** Where a moving platform is now: back and forth along its path, pausing at each end. */
function platformPos(pl, t) {
  const pts = pl.path;
  let len = 0;
  const segs = [];
  for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); segs.push(l); len += l; }
  const travel = len / pl.speed;
  const cycle = 2 * (travel + pl.wait);
  let u = t % cycle;
  let d;
  if (u < pl.wait) d = 0;
  else if (u < pl.wait + travel) d = (u - pl.wait) * pl.speed;
  else if (u < 2 * pl.wait + travel) d = len;
  else d = len - (u - 2 * pl.wait - travel) * pl.speed;
  for (let k = 0; k < segs.length; k++) {
    if (d <= segs[k] || k === segs.length - 1) {
      const f = segs[k] ? clamp(d / segs[k], 0, 1) : 0;
      return { x: (pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f) * T + T / 2, y: (pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f) * T + T / 2 };
    }
    d -= segs[k];
  }
  return { x: pts[0][0] * T + T / 2, y: pts[0][1] * T + T / 2 };
}
/** Is (x, y) on a platform on this floor? */
function onPlatform(x, y) {
  for (const pl of D.platforms) if (pl.floor === D.cur && Math.abs(x - pl.x) < 36 && Math.abs(y - pl.y) < 36) return pl;
  return null;
}

// --- per frame ----------------------------------------------------------------------------------

/**
 * The dungeon's upkeep. Returns an action for game.js when one is needed:
 * { toast }, { exit: 'cleared' | 'left' }, { cleared }.
 */
export function updateDungeon(dt) {
  const p = world.player;
  if (!D || !p) return null;
  let act = null;
  const A = () => (act = act || {});
  D.t += dt;
  const F = D.floors[D.cur];
  if (D.toast) { A().toast = D.toast; D.toast = null; }
  D.fade = Math.max(0, D.fade - dt * 2.2);
  D.stairCd = Math.max(0, D.stairCd - dt);
  D.valveCd = Math.max(0, D.valveCd - dt);
  D.orbCd = Math.max(0, D.orbCd - dt);
  D.colorT = Math.max(0, D.colorT - dt * 3);
  D.waterLevel += clamp((D.water === 'high' ? 1 : 0) - D.waterLevel, -dt * 1.6, dt * 1.6);

  // The camera, following you.
  const tx = clamp(p.x + Math.cos(p.aimAngle) * 50 - view.w / 2, 0, Math.max(0, arena.w - view.w));
  const ty = clamp(p.y + Math.sin(p.aimAngle) * 50 - view.h / 2, 0, Math.max(0, arena.h - view.h));
  const f = 1 - Math.exp(-7 * dt);
  camera.x += (tx - camera.x) * f; camera.y += (ty - camera.y) * f;

  // The platforms move, carrying whoever stands on them.
  for (const pl of D.platforms) {
    const riding = pl.floor === D.cur && !p.dashing && Math.abs(p.x - pl.x) < 36 && Math.abs(p.y + p.r * 0.35 - pl.y) < 36;
    const q = platformPos(pl, D.t);
    pl.dx = q.x - pl.x; pl.dy = q.y - pl.y;
    pl.x = q.x; pl.y = q.y;
    if (riding && !D.fall && !D.burn) { p.x += pl.dx; p.y += pl.dy; }
  }

  // --- falling -----------------------------------------------------------------
  if (D.fall) {
    const fl = D.fall;
    fl.t += dt;
    p.fallK = clamp(fl.t / 0.5, 0, 1);
    p.vx = p.vy = 0;
    p.x = fl.x; p.y = fl.y;
    p.heldUntil = world.runTime + 0.1;
    if (fl.t >= 0.5) {
      p.fallK = 0;
      D.fall = null;
      const [q, ok] = landingBelow(D.cur, fl.x, fl.y);
      if (ok) {
        // Down through the hole to the floor below: a hard landing, but alive.
        switchTo(q, fl.x, fl.y);
        D.fade = 0.6;
        shake(0.35); sfx.thud();
        burst(p.x, p.y + 10, { count: 14, color: '#6a6470', speed: 160, size: 4, life: 0.5, drag: 4 });
        damagePlayer(Math.round(p.stats.maxHp * 0.05), p.x, p.y - 10, 'fall');
        p.invuln = Math.max(p.invuln || 0, 0.8);
        p.hop = null;
        for (const e of world.enemies) if (dist(e.x, e.y, p.x, p.y) < 420) e.woke = true;
      } else {
        // Into the dark: hurt, and back where you last stood firm.
        const s = D.safe;
        if (s.k !== D.cur) switchTo(s.k, s.x, s.y); else { p.x = s.x; p.y = s.y; }
        D.fade = 0.8;
        damagePlayer(Math.round(p.stats.maxHp * 0.15), p.x, p.y, 'pit');
        p.invuln = Math.max(p.invuln || 0, 1.2);
        A().toast = ['THE DARK BELOW', 'You climb back up, bruised'];
      }
    }
    return act;
  }
  // Into the lava: a flash of fire, and back where you last stood firm.
  if (D.burn) {
    D.burn.t += dt;
    p.vx = p.vy = 0;
    p.heldUntil = world.runTime + 0.1;
    if (D.burn.t >= 0.35) {
      D.burn = null;
      const s = D.safe;
      if (s.k !== D.cur) switchTo(s.k, s.x, s.y); else { p.x = s.x; p.y = s.y; }
      D.fade = 0.5;
      damagePlayer(Math.round(p.stats.maxHp * 0.14), p.x, p.y, 'lava');
      p.invuln = Math.max(p.invuln || 0, 1.2);
    }
    return act;
  }
  const fi = tileOf(p.x), fj = tileOf(p.y + p.r * 0.35);
  const under = at(F, fi, fj);
  revealAround(F, p.x, p.y);
  const riding = onPlatform(p.x, p.y + p.r * 0.35);
  if (!p.dashing && !p.ghost && !p.dead && !riding && isLava(under)) {
    D.burn = { t: 0 };
    D.slide = null;
    sfx.hiss();
    burst(p.x, p.y, { count: 22, color: '#ff8a3a', speed: 220, size: 5, life: 0.6, drag: 3, gravity: -120 });
    return act;
  }
  if (!p.dashing && !p.ghost && !riding && holeTile(F, fi, fj) && !p.dead) {
    D.coyote += dt;
    if (D.coyote > 0.08) {
      D.fall = { t: 0, x: p.x, y: p.y };
      D.coyote = 0;
      D.slide = null;
      sfx.whirr();
      return act;
    }
  } else {
    D.coyote = 0;
    if (!p.dashing && !riding && '.AXKL=hVY'.includes(under) && standable(F, fi, fj)) D.safe = { k: D.cur, x: fi * T + T / 2, y: fj * T + T / 2 };
  }

  // --- ice: once moving on it, you slide until something stops you ----------------
  updateIce(F, p, dt);

  // --- belts carry you (and anyone else) along ------------------------------------
  const belt = BELTS[under];
  if (belt && !p.dashing && !D.slide && !riding) { p.x += belt[0] * BELT_SPEED * dt; p.y += belt[1] * BELT_SPEED * dt; }
  for (const e of world.enemies) {
    if (e.dead || e.dBoss) continue;
    const b = BELTS[at(F, tileOf(e.x), tileOf(e.y))];
    if (b) { e.x += b[0] * BELT_SPEED * 0.8 * dt; e.y += b[1] * BELT_SPEED * 0.8 * dt; }
  }

  // --- stairs, and the way out ------------------------------------------------------
  if (D.stairCd <= 0 && (under === 'S' || under === 'D')) {
    const q = D.cur + (under === 'S' ? 1 : -1);
    const G = D.floors[q];
    if (G) {
      // Out onto the floor next to the matching stair.
      let nx = fi, ny = fj;
      for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) if (standable(G, fi + dx, fj + dy) && !'SDU'.includes(at(G, fi + dx, fj + dy)) && at(G, fi + dx, fj + dy) !== 'I') { nx = fi + dx; ny = fj + dy; break; }
      switchTo(q, nx * T + T / 2, ny * T + T / 2);
      D.fade = 1;
      D.stairCd = 0.6;
      sfx.door();
      return act;
    }
  }
  if (under === 'U' && D.stairCd <= 0) return { exit: D.bossDead ? 'cleared' : 'left' };
  if (D.exitAt && dist(p.x, p.y, D.exitAt.x, D.exitAt.y) < 34) return { exit: 'cleared' };

  // --- things you touch -------------------------------------------------------------
  const near = (i, j, r) => dist(p.x, p.y, i * T + T / 2, j * T + T / 2) < r;
  for (let j = fj - 1; j <= fj + 1; j++) {
    for (let i = fi - 1; i <= fi + 1; i++) {
      const c = at(F, i, j);
      if (c === 'L' && near(i, j, 46)) {
        // A lever: every gate on this floor opens, every drawn bridge runs out.
        F.g[j][i] = 'l';
        sfx.click(); shake(0.2);
        let gates = 0, bridge = 0;
        for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) {
          if (F.g[y][x] === 'G') { F.g[y][x] = 'g'; gates++; }
          if (F.g[y][x] === 'R') { F.bridgeQ = F.bridgeQ || []; F.bridgeQ.push([x, y]); bridge++; }
        }
        F.bridgeQ?.sort((a, b) => dist(a[0], a[1], i, j) - dist(b[0], b[1], i, j));
        F.bridgeT = 0;
        rebuildAll();
        A().toast = ['A LEVER', gates ? 'Somewhere, an iron gate grinds open' : bridge ? 'A bridge runs out across the dark' : 'Something moved'];
      }
      if (c === 'V' && near(i, j, 50) && D.valveCd <= 0 && !D.atValve) {
        // A valve wheel: stand at it and it turns.
        D.atValve = true;
        D.turning = { i, j, t: 0.8, k: D.cur };
        turnWater(A());
      }
      if ((c === 'X' || c === 'K') && near(i, j, 42)) {
        F.g[j][i] = c === 'X' ? 'x' : 'k';
        sfx.coin(); ring(i * T + T / 2, j * T + T / 2, { r0: 6, r1: 60, color: '#ffd45e', life: 0.4, width: 4 });
        if (c === 'K') { D.key = true; A().toast = [D.keyInfo.name.toUpperCase(), 'It will open the great door']; sfx.boon(); }
        else { const n = 120; world.gold += n; A().toast = ['A CHEST', `${n} ${D.from === 'demo' ? 'gold' : 'Cinders'}`]; }
      }
      if (c === 'B' && near(i, j, 58)) {
        // (Once the guardian is awake the door stays shut behind you: the key will not open it mid-fight.)
        if (D.bossAwake && !D.bossDead) { /* sealed */ } else if (D.key && !D.bossDead) {
          F.g[j][i] = 'b';
          rebuildAll();
          sfx.door(); shake(0.3);
          A().toast = ['THE GREAT DOOR', `The ${D.keyInfo.short} turns in the lock`];
        } else if (!D.said.door) { D.said.door = true; A().toast = ['A GREAT DOOR', `Locked. It wants ${D.keyInfo.name}.`]; }
      } else if (c === 'B' && D.said.door && !near(i, j, 120)) D.said.door = false;
      if (c === 'A' && near(i, j, 50)) {
        if (!D.atLamp) {
          D.atLamp = true;
          D.checkpoint = { floor: D.cur, x: i, y: j + 1 };
          p.hp = p.stats.maxHp; p.lives = Math.max(p.lives, 3);
          resetFoes();
          sfx.heal();
          ring(i * T + T / 2, j * T + T / 2, { r0: 8, r1: 90, color: '#ffb35e', life: 0.5, width: 5 });
          A().toast = ['A LAMP', 'You rest. Your lives return; so do the dead.'];
        }
      }
    }
  }
  if (D.atLamp && !F.lamps.some((l) => near(l.i, l.j, 90))) D.atLamp = false;
  if (D.atValve && !nearAny(F, 'V', p, 90)) D.atValve = false;
  if (D.turning) { D.turning.t -= dt; if (D.turning.t <= 0) D.turning = null; }

  // --- orbs and screens: struck by your swings and shots ---------------------------
  for (let j = Math.max(0, fj - 8); j <= Math.min(F.g.length - 1, fj + 8); j++) {
    for (let i = Math.max(0, fi - 12); i <= Math.min(F.g[0].length - 1, fi + 12); i++) {
      const c = F.g[j][i];
      if (c === 'O' && D.orbCd <= 0 && struck(i * T + T / 2, j * T + T / 2 - 10, 26)) {
        flipPegs(A());
        ring(i * T + T / 2, j * T + T / 2 - 14, { r0: 8, r1: 70, color: D.color === 'red' ? '#ff5a4a' : '#5aa8ff', life: 0.35, width: 4 });
      }
      if (c === 'H' && struck(i * T + T / 2, j * T + T / 2, 30)) {
        F.g[j][i] = 'h';
        rebuildAll();
        sfx.clack();
        burst(i * T + T / 2, j * T + T / 2 - 20, { count: 18, color: '#f0e8d6', speed: 180, size: 5, life: 0.7, drag: 3, gravity: 200 });
        A().toast = ['A PAPER SCREEN', 'Torn open - something behind it'];
      }
    }
  }

  // --- the bridge running out ------------------------------------------------------
  if (F.bridgeQ && F.bridgeQ.length) {
    F.bridgeT -= dt;
    if (F.bridgeT <= 0) {
      const [x, y] = F.bridgeQ.shift();
      F.g[y][x] = '=';
      F.bridgeT = 0.09;
      sfx.thud();
      burst(x * T + T / 2, y * T + T / 2, { count: 4, color: '#8a6a44', speed: 60, size: 3, life: 0.3, drag: 4 });
      rebuildAll();
    }
  }

  // --- cracked tiles --------------------------------------------------------------
  for (const [key, s] of F.crumble) {
    const i = key % 64, j = Math.floor(key / 64);
    if (s.state === 'ok' && fi === i && fj === j && !p.dashing) { s.state = 'shake'; s.t = 0.5; sfx.rattle(); }
    else if (s.state === 'shake') {
      s.t -= dt;
      if (s.t <= 0) {
        s.state = 'gone'; s.t = 5;
        burst(i * T + T / 2, j * T + T / 2, { count: 12, color: '#5a5460', speed: 120, size: 4, life: 0.6, drag: 2, gravity: 260 });
        rebuildAll();
      }
    } else if (s.state === 'gone') {
      s.t -= dt;
      if (s.t <= 0 && !(fi === i && fj === j)) { s.state = 'ok'; rebuildAll(); }
    }
  }

  // --- traps ----------------------------------------------------------------------
  const hurt = (x, y, r, amount, src) => {
    if (dist(p.x, p.y + p.r * 0.3, x, y) < r + p.r * 0.5) damagePlayer(amount, x, y - 20, src);
    for (const e of world.enemies) {
      if (e.dead || e.z) continue;
      if (dist(e.x, e.y, x, y) < r + e.r * 0.5 && (e.trapCd || 0) <= D.t) { e.trapCd = D.t + 0.6; dealDamage(e, amount * 0.8, { raw: true, source: 'trap' }); }
    }
  };
  // Spikes and crushers, near you.
  for (let j = Math.max(0, fj - 12); j <= Math.min(F.g.length - 1, fj + 12); j++) {
    for (let i = Math.max(0, fi - 20); i <= Math.min(F.g[0].length - 1, fi + 20); i++) {
      const c = F.g[j][i];
      if (c === '^' && spikeState(j) === 'up') hurt(i * T + T / 2, j * T + T / 2, 30, 12, 'spikes');
      if (c === 'Z') {
        const st = crusherState(i, j);
        if (st.k === 'slam') {
          hurt(i * T + T / 2, j * T + T / 2, 30, 20, 'crusher');
          { const key = j * 64 + i; if (F.lastSlam?.get(key) !== st.n) { (F.lastSlam = F.lastSlam || new Map()).set(key, st.n); if (Math.abs(i - fi) < 8 && Math.abs(j - fj) < 6) { shake(0.12); sfx.thud(); } } }
        }
      }
    }
  }
  // Plates: step on one and the slits in the wall on that row glow, then fire.
  for (const pl of F.plates) {
    pl.cd = Math.max(0, pl.cd - dt);
    if (pl.fireT >= 0) {
      pl.fireT -= dt;
      if (pl.fireT < 0) {
        for (let i = 0; i < F.g[0].length; i++) {
          const c = F.g[pl.j][i];
          if (c !== '>' && c !== '<') continue;
          const dir = c === '>' ? 1 : -1;
          for (const off of [-14, 0, 14]) {
            spawnProjectile({ x: i * T + T / 2 + dir * 36, y: pl.j * T + T / 2 + off, vx: dir * 560, vy: 0, r: 6, damage: 11, color: '#c8b890', shape: 'arrow', life: 1.8, srcType: 'darts' });
          }
        }
        sfx.arrow();
      }
    } else if (pl.cd <= 0 && fi === pl.i && fj === pl.j) {
      pl.fireT = 0.35; pl.cd = 1.4;
      sfx.click();
    }
  }
  // Vents: quiet, then smoke and a glow, then a column of fire.
  for (const v of F.vents) if (ventState(v) === 'burn') hurt(v.i * T + T / 2, v.j * T + T / 2, 30, 13, 'fire');
  // Pendulums.
  for (const pd of D.pendulums) {
    if (pd.floor !== D.cur) continue;
    const b = bladeAt(pd);
    hurt(b.x, b.y, 24, 16, 'blade');
  }
  // Icicles: they creak when you pass under, then fall; they grow back.
  for (const [key, s] of F.icicles) {
    const i = key % 64, j = Math.floor(key / 64);
    const x = i * T + T / 2, y = j * T + T / 2;
    if (s.state === 'hang' && dist(p.x, p.y, x, y) < 80) { s.state = 'warn'; s.t = 0.65; sfx.rattle(); }
    else if (s.state === 'warn') {
      s.t -= dt;
      if (s.t <= 0) {
        s.state = 'gone'; s.t = 6;
        hurt(x, y, 34, 14, 'icicle');
        burst(x, y, { count: 16, color: '#d8f0ff', speed: 170, size: 4, life: 0.5, drag: 3 });
        sfx.clack();
      }
    } else if (s.state === 'gone') { s.t -= dt; if (s.t <= 0) s.state = 'hang'; }
  }

  // --- the dead, waking; the boss ------------------------------------------------------
  for (const e of world.enemies) {
    if (e.dead || e.woke) continue;
    if (dist(e.x, e.y, p.x, p.y) < (e.dBoss ? 330 : 380) || e.hp < e.maxHp) {
      e.woke = true;
      if (e.dBoss && !D.bossAwake) {
        D.bossAwake = true;
        // The door behind you shuts.
        for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) if (F.g[y][x] === 'b') F.g[y][x] = 'B';
        rebuildAll();
        sfx.door(); shake(0.3);
      }
    }
  }
  if (D.bossAwake && !D.bossDead) {
    const boss = world.enemies.find((e) => e.dBoss);
    if (!boss || boss.dead) {
      D.bossDead = true;
      for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) if (F.g[y][x] === 'B') F.g[y][x] = 'b';
      rebuildAll();
      const bs = F.spawns.find((s) => s.boss);
      // The way out opens where the boss stood (or a step off, if that is not floor).
      const spot = nearestStand(F, bs.i, bs.j - 2) || [bs.i, bs.j];
      D.exitAt = { x: spot[0] * T + T / 2, y: spot[1] * T + T / 2, k: D.cur };
      const n = D.reward || 400;
      world.gold += n;
      A().toast = [`${D.name.toUpperCase()} IS CLEARED`, `${D.boss.title} falls · ${n} ${D.from === 'demo' ? 'gold' : 'Cinders'} · the way out opens`];
      A().cleared = true;
    }
  }
  return act;
}

function nearAny(F, ch, p, r) {
  const fi = tileOf(p.x), fj = tileOf(p.y);
  for (let j = fj - 2; j <= fj + 2; j++) for (let i = fi - 2; i <= fi + 2; i++) if (at(F, i, j) === ch && dist(p.x, p.y, i * T + T / 2, j * T + T / 2) < r) return true;
  return false;
}

/**
 * Ice, as the old puzzle games have it: moving onto ice sets you sliding in
 * that direction (along the grid), and you cannot steer until something
 * stops you - a wall, a rock, the far edge of the ice. A dash breaks the
 * slide. Sliding off an edge drops you.
 */
function updateIce(F, p, dt) {
  const i = tileOf(p.x), j = tileOf(p.y + p.r * 0.35);
  if (p.dashing || p.dead || p.ghost) { D.slide = null; return; }
  if (!D.slide) {
    if (at(F, i, j) !== 'I' || p.moveMag < 0.2) return;
    const a = p.moveAngle;
    const dx = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? Math.sign(Math.cos(a)) : 0;
    const dy = dx ? 0 : Math.sign(Math.sin(a));
    // Pushing into a wall you already stand against starts nothing.
    if (solidTile(at(F, i + dx, j + dy))) return;
    D.slide = { dx, dy };
    if (!D.said.ice) { D.said.ice = true; D.toast = ['ICE', 'Once you slide, only a rock or a wall will stop you']; }
  }
  const s = D.slide;
  p.heldUntil = world.runTime + 0.05;          // no walking while sliding
  // Keep to the middle of the lane.
  const cx = i * T + T / 2, cy = j * T + T / 2 - p.r * 0.35;
  if (s.dx) p.y += (cy - p.y) * Math.min(1, dt * 12);
  else p.x += (cx - p.x) * Math.min(1, dt * 12);
  const nx = p.x + s.dx * SLIDE_SPEED * dt, ny = p.y + s.dy * SLIDE_SPEED * dt;
  // What is ahead: past the middle of this tile, the next one decides.
  const ahead = at(F, i + s.dx, j + s.dy);
  const past = s.dx ? (nx - cx) * s.dx >= 0 : (ny + p.r * 0.35 - (j * T + T / 2)) * s.dy >= 0;
  if (past && solidTile(ahead)) {
    // Stopped by a wall or a rock: at the middle of this tile.
    if (s.dx) p.x = cx; else p.y = cy;
    D.slide = null;
    sfx.thud();
    return;
  }
  p.x = nx; p.y = ny;
  const ni = tileOf(p.x), nj = tileOf(p.y + p.r * 0.35);
  if ((ni !== i || nj !== j) && at(F, ni, nj) !== 'I') {
    // Onto something that is not ice: a step, and you stand.
    D.slide = null;
  }
}

export function spikeState(j) {
  const u = ((D ? D.t : 0) + j * 0.32) % 2.4;
  return u < 1.3 ? 'down' : u < 1.72 ? 'warn' : 'up';
}
export function ventState(v) {
  const u = ((D ? D.t : 0) + v.ph) % 3.0;
  return u < 1.6 ? 'idle' : u < 2.1 ? 'warn' : 'burn';
}
/** A crusher's beat: up, then its shadow grows (the tell), then the slam, then it rises. */
export function crusherState(i, j) {
  const period = 2.8;
  const t = (D ? D.t : 0) + i * 0.47 + j * 0.13;
  const u = t % period, n = Math.floor(t / period);
  if (u < 1.55) return { k: 'up', f: 0, n };
  if (u < 2.15) return { k: 'warn', f: (u - 1.55) / 0.6, n };
  if (u < 2.35) return { k: 'slam', f: 1, n };
  return { k: 'rise', f: 1 - (u - 2.35) / 0.45, n };
}
export function bladeAt(pd) {
  const a = Math.sin(((D ? D.t : 0) / pd.period) * TAU + pd.ph * TAU);
  return { x: pd.x * T + T / 2 + a * pd.amp * T, y: pd.y * T, a };
}
export function icicleState(F, i, j) { return F.icicles.get(j * 64 + i) || null; }

/** Fallen with no life to spare: back at the last lamp, lives returned, the dead with you. */
export function dungeonWake() {
  const p = world.player;
  const c = D.checkpoint;
  D.fall = null; D.burn = null; D.slide = null; p.fallK = 0;
  switchTo(c.floor, c.x * T + T / 2, c.y * T + T / 2);
  resetFoes();
  p.dead = false; p.hp = p.stats.maxHp; p.lives = 3; p.invuln = 2;
  D.fade = 1;
  if (!D.bossDead) {
    D.bossAwake = false;
    // The great door stands open again for another try (the key is kept).
    if (D.key) for (const F of D.floors) for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) if (F.g[y][x] === 'B') F.g[y][x] = 'b';
    rebuildAll();
  }
}

/** Reveal the map round you (the dungeon map shows only where you have been near). */
export function revealAround(F, x, y) {
  const i0 = tileOf(x), j0 = tileOf(y), W = F.g[0].length, H = F.g.length;
  for (let j = Math.max(0, j0 - 4); j <= Math.min(H - 1, j0 + 4); j++) for (let i = Math.max(0, i0 - 5); i <= Math.min(W - 1, i0 + 5); i++) F.seen[j * W + i] = 1;
}

/** What to do next, for the HUD. */
export function dungeonObjective() {
  if (!D) return '';
  if (D.bossDead) return 'Step into the light - the way out';
  if (D.bossAwake) return `Defeat ${D.boss.title}`;
  if (!D.key) return `Find ${D.keyInfo.name}`;
  return 'Open the great door';
}
