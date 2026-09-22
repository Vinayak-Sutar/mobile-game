// Dungeons: places to go down into, and clear - the demo, the Sunken Catacomb.
//
// What the research said players love (journal §16.51), and how it is built:
//   - A CRITICAL PATH with LOCKS, side LOOPS that hold the KEYS, and SHORTCUTS
//     that open when you come round a loop the other way (Zelda, as Game
//     Maker's Toolkit's Boss Keys maps it). Here: the Bone Key sits on an
//     island past a retracting bridge; the boss door wants it; a lever in the
//     depths opens an iron gate back to the entrance.
//   - Catacombs as Elden Ring builds them: traps, ambushes, a lever before the
//     boss, a lamp (a checkpoint) near the door, a boss at the end.
//   - FLOORS, as A Link to the Past stacks them: stairs take you to the floor
//     above or below, and a HOLE drops you to whatever is under it at the same
//     spot - so a fall is not only a punishment but another way on. Through
//     the holes you can see the floor below, dim, far down.
//   - Traps with a TELL, always: spikes that peek before they strike, wall
//     slits that glow before they fire, vents that smoke before they burn,
//     cracked tiles that shake before they fall, blades whose swing you can
//     time.
//
// A dungeon is a stack of FLOORS, each a grid of 64-unit tiles, built by the
// small painting helpers below. Tiles (one character each):
//   #  wall             .  floor            (space) a hole / the abyss
//   o  pillar (solid)   ^  floor spikes     P  pressure plate
//   > < v  dart slits in a wall, firing east / west / south
//   F  fire vent        C  cracked tile (crumbles)   R  retracted bridge (a hole until a lever)
//   =  bridge planks    L  lever            G  iron gate (shut until a lever)
//   K  the key's chest  X  a chest of Cinders          B  the boss door (locked)
//   A  a lamp (checkpoint)   U  the way out   S  stairs up   D  stairs down
// Enemy marks (they stand on floor): s archer, b boneling, d draugr,
// p spearman, n necromancer, c crossbowman, w goblin, M the boss.
//
// Everything that moves lives in this module; dungeon-draw.js draws it.

import { world, arena, camera, view } from './state.js';
import { TAU, clamp, rand, dist } from './util.js';
import { spawnEnemy } from './enemies.js';
import { damagePlayer, dealDamage } from './combat.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnProjectile } from './spawn.js';

export const T = 64;                       // a tile
const SOLID = new Set(['#', 'o', '>', '<', 'v', 'G', 'B']);
const HOLE = new Set([' ', 'R']);          // (a fallen cracked tile counts too)
const MOBS = { s: 'slinger', b: 'boneling', d: 'draugr', p: 'spearman', n: 'necro', c: 'crossbow', w: 'wretch', M: 'captain' };

// --- building the floors ------------------------------------------------------------------

function grid(w, h) { return Array.from({ length: h }, () => Array(w).fill('#')); }
function rect(g, x0, y0, x1, y1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch; }
function path(g, pts, ch = '.') {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) g[ay + Math.sign(by - ay) * k][ax + Math.sign(bx - ax) * k] = ch;
  }
}

/** The Sunken Catacomb: three floors, the Ossuary below, the halls above. */
function catacomb() {
  // --- B1, the Ossuary: under the chasm; where a fall from the walkway lands.
  const b1 = grid(34, 24);
  rect(b1, 1, 1, 31, 9, '.');
  for (const x of [6, 12, 18, 24]) { b1[3][x] = 'o'; b1[7][x] = 'o'; }
  for (const [x, y, m] of [[8, 5, 'b'], [10, 6, 'b'], [15, 5, 'b'], [20, 5, 'd'], [27, 6, 'd'], [22, 2, 'n']]) b1[y][x] = m;
  b1[2][30] = 'X';
  rect(b1, 12, 10, 14, 17, '.');
  rect(b1, 11, 18, 15, 21, '.');
  b1[19][13] = 'S';

  // --- F1, the entry: spikes, the chasm walkway, the darts, the stair up.
  const f1 = grid(34, 24);
  rect(f1, 1, 17, 8, 22, '.');                         // the entry hall
  f1[18][2] = 'A'; f1[22][4] = 'U';
  f1[19][9] = 'G';                                     // the gate (shortcut, opened from the other side)
  rect(f1, 10, 18, 14, 21, '.');
  f1[20][11] = 'L'; f1[19][13] = 'D';
  rect(f1, 3, 9, 5, 16, '.');                          // the spike corridor
  rect(f1, 3, 10, 5, 15, '^');
  rect(f1, 1, 1, 31, 8, ' ');                          // the chasm hall...
  path(f1, [[4, 9], [4, 7], [9, 7], [9, 4], [18, 4], [18, 6], [24, 6], [24, 3], [29, 3]]);   // ...and its walkway
  f1[4][12] = ' ';                                     // a gap: dash across it
  for (const [x, y] of [[7, 7], [8, 7], [21, 6], [22, 6]]) f1[y][x] = 'C';
  rect(f1, 28, 2, 30, 4, '.');                         // the far landing
  rect(f1, 14, 7, 15, 7, '.'); f1[7][14] = 's';        // archers on islands
  rect(f1, 20, 1, 21, 2, '.'); f1[1][21] = 's';
  rect(f1, 28, 5, 30, 11, '.');                        // the dart corridor
  for (const y of [6, 8, 10]) f1[y][27] = '>';
  f1[6][29] = 'P'; f1[8][28] = 'P'; f1[10][30] = 'P';
  rect(f1, 25, 12, 31, 16, '.');                       // the landing before the stair
  f1[13][26] = 'p'; f1[13][30] = 'p';
  f1[15][31] = 'S';

  // --- F2, the halls above: the pendulums, the bridge and the key, the fire, the boss.
  const f2 = grid(34, 24);
  rect(f2, 24, 12, 31, 16, '.');                       // arriving
  f2[15][31] = 'D'; f2[13][25] = 'A';
  rect(f2, 26, 6, 28, 11, '.');                        // the pendulum corridor (blades below)
  rect(f2, 20, 1, 31, 5, '.');                         // the hub
  f2[2][30] = 'c'; f2[4][22] = 'd';
  rect(f2, 1, 1, 18, 8, ' ');                          // the bridge chasm, over the one below
  rect(f2, 17, 2, 19, 4, '.');                         // the near ledge, and its lever
  f2[2][18] = 'L';
  path(f2, [[9, 3], [16, 3]], 'R');                    // the bridge, drawn in when the lever is pulled
  rect(f2, 5, 2, 8, 4, '.');                           // the key's island
  f2[3][6] = 'K'; f2[2][7] = 'b'; f2[4][7] = 'b';
  rect(f2, 12, 13, 23, 15, '.');                       // the fire corridor to the boss
  for (let y = 13; y <= 15; y++) for (let x = 13; x <= 22; x++) if ((x + y) % 2 === 0) f2[y][x] = 'F';
  f2[14][11] = 'B';                                    // the boss door
  rect(f2, 2, 10, 10, 20, '.');                        // the arena
  f2[15][6] = 'M';

  return {
    id: 'catacomb', name: 'The Sunken Catacomb',
    floors: [
      { id: 'b1', name: 'The Ossuary', depth: -1, g: b1 },
      { id: 'f1', name: 'The Catacomb Gate', depth: 0, g: f1 },
      { id: 'f2', name: 'The Upper Halls', depth: 1, g: f2 },
    ],
    start: { floor: 1, x: 4, y: 20 },
    // Blades that swing across the pendulum corridor (tile units).
    pendulums: [
      { floor: 2, x: 27, y: 10.5, amp: 1.55, period: 2.1, ph: 0 },
      { floor: 2, x: 27, y: 8.5, amp: 1.55, period: 2.1, ph: 1.05 },
      { floor: 2, x: 27, y: 6.5, amp: 1.55, period: 1.7, ph: 0.4 },
    ],
    boss: { title: 'The Catacomb Warden', type: 'captain' },
  };
}

// --- the live dungeon ----------------------------------------------------------------------

let D = null;
export const dungeonState = () => D;

/** Where a floor tile is, as a character (walls out of bounds). */
function at(F, i, j) { return i < 0 || j < 0 || j >= F.g.length || i >= F.g[0].length ? '#' : F.g[j][i]; }
const tileOf = (v) => Math.floor(v / T);
export const tileAt = (F, x, y) => at(F, tileOf(x), tileOf(y));

function isHole(F, i, j) {
  const c = at(F, i, j);
  if (HOLE.has(c)) return true;
  if (c === 'C') { const s = F.crumble.get(j * 64 + i); return !!s && s.state === 'gone'; }
  return false;
}
function isSolid(c) { return SOLID.has(c); }
/** Where you can stand: not a wall, not a hole. */
function standable(F, i, j) { return !isSolid(at(F, i, j)) && !isHole(F, i, j); }

/** Walls as rectangles (runs along each row) for the collision loops. */
function rebuild(F) {
  const rects = [], mobRects = [];
  const W = F.g[0].length;
  for (let j = 0; j < F.g.length; j++) {
    for (const [test, out] of [[(i) => isSolid(at(F, i, j)), rects], [(i) => isSolid(at(F, i, j)) || isHole(F, i, j) || 'SDU'.includes(at(F, i, j)), mobRects]]) {
      let run = -1;
      for (let i = 0; i <= W; i++) {
        const on = i < W && test(i);
        if (on && run < 0) run = i;
        if (!on && run >= 0) { out.push({ x: run * T, y: j * T, w: (i - run) * T, h: T, kind: 'dwall' }); run = -1; }
      }
    }
  }
  F.solid = rects;
  F.mobSolid = mobRects;
}

function buildFloor(src) {
  const F = { ...src, g: src.g.map((r) => r.slice()), crumble: new Map(), enemies: [], spawns: [], plates: [], vents: [], torches: [], lamps: [] };
  const H = F.g.length, W = F.g[0].length;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = F.g[j][i];
      if (MOBS[c]) { F.spawns.push({ type: MOBS[c], i, j, boss: c === 'M' }); F.g[j][i] = '.'; }
      if (c === 'C') F.crumble.set(j * 64 + i, { state: 'ok', t: 0 });
      if (c === 'P') F.plates.push({ i, j, cd: 0, fireT: -1 });
      if (c === 'F') F.vents.push({ i, j, ph: ((i + j) % 4) * 0.75 });
      if (c === 'A') F.lamps.push({ i, j });
      // Torches on the walls that look out over a floor, every few tiles.
      if (c === '#' && j + 1 < H && '.^PFCAXKL='.includes(F.g[j + 1][i]) && (i * 7 + j * 3) % 5 === 0) F.torches.push({ i, j, ph: (i * 1.7 + j) % TAU });
    }
  }
  rebuild(F);
  return F;
}

/** Enter the demo dungeon. from: 'demo' (the title) or { x, y } in the Wilds. */
export function enterDungeon(from) {
  const src = catacomb();
  D = {
    ...src,
    floors: src.floors.map(buildFloor),
    cur: src.start.floor,
    from,
    key: false, bossDead: false, bossAwake: false,
    checkpoint: { ...src.start },
    safe: null, fall: null, fade: 0, stairCd: 0, coyote: 0, said: {},
    exitAt: null, t: 0,
  };
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
    const e = spawnEnemy(s.type, s.i * T + T / 2, s.j * T + T / 2, { instant: true, scale: s.boss ? 1.5 : 1.2 });
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
  for (const F of D.floors) { for (const s of F.crumble.values()) { s.state = 'ok'; s.t = 0; } rebuild(F); }
  world.room.obstacles = D.floors[here].solid;
  world.room.enemyObstacles = D.floors[here].mobSolid;
}

/** The floor below k at x, y where you would land: [floor index, true] or [null, false] for the abyss. */
function landingBelow(k, x, y) {
  for (let q = k - 1; q >= 0; q--) {
    const F = D.floors[q];
    const i = tileOf(x), j = tileOf(y);
    if (isSolid(at(F, i, j))) return [null, false];
    if (!isHole(F, i, j)) return [q, true];
  }
  return [null, false];
}

// --- per frame ----------------------------------------------------------------------------------

/**
 * The dungeon's upkeep. Returns an action for game.js when one is needed:
 * { toast }, { exit: 'cleared' | 'left' }, { died }.
 */
export function updateDungeon(dt) {
  const p = world.player;
  if (!D || !p) return null;
  let act = null;
  D.t += dt;
  const F = D.floors[D.cur];
  if (D.toast) { act = { toast: D.toast }; D.toast = null; }
  D.fade = Math.max(0, D.fade - dt * 2.2);
  D.stairCd = Math.max(0, D.stairCd - dt);

  // The camera, following you.
  const tx = clamp(p.x + Math.cos(p.aimAngle) * 50 - view.w / 2, 0, Math.max(0, arena.w - view.w));
  const ty = clamp(p.y + Math.sin(p.aimAngle) * 50 - view.h / 2, 0, Math.max(0, arena.h - view.h));
  const f = 1 - Math.exp(-7 * dt);
  camera.x += (tx - camera.x) * f; camera.y += (ty - camera.y) * f;

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
        act = { toast: ['THE DARK BELOW', 'You climb back up, bruised'] };
      }
    }
    return act;
  }
  const fi = tileOf(p.x), fj = tileOf(p.y + p.r * 0.35);
  const under = at(F, fi, fj);
  if (!p.dashing && !p.ghost && isHole(F, fi, fj) && !p.dead) {
    D.coyote += dt;
    if (D.coyote > 0.08) {
      D.fall = { t: 0, x: p.x, y: p.y };
      D.coyote = 0;
      sfx.whirr();
      return act;
    }
  } else {
    D.coyote = 0;
    if (!p.dashing && '.AXKL='.includes(under) && standable(F, fi, fj)) D.safe = { k: D.cur, x: fi * T + T / 2, y: fj * T + T / 2 };
  }

  // --- stairs, and the way out ------------------------------------------------------
  if (D.stairCd <= 0 && (under === 'S' || under === 'D')) {
    const q = D.cur + (under === 'S' ? 1 : -1);
    const G = D.floors[q];
    if (G) {
      // Out onto the floor next to the matching stair.
      let nx = fi, ny = fj;
      for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) if (standable(G, fi + dx, fj + dy) && !'SDU'.includes(at(G, fi + dx, fj + dy))) { nx = fi + dx; ny = fj + dy; break; }
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
        rebuild(F); world.room.obstacles = F.solid; world.room.enemyObstacles = F.mobSolid;
        act = { toast: ['A LEVER', gates ? 'Somewhere, an iron gate grinds open' : bridge ? 'A bridge runs out across the dark' : 'Something moved'] };
      }
      if ((c === 'X' || c === 'K') && near(i, j, 42)) {
        F.g[j][i] = c === 'X' ? 'x' : 'k';
        sfx.coin(); ring(i * T + T / 2, j * T + T / 2, { r0: 6, r1: 60, color: '#ffd45e', life: 0.4, width: 4 });
        if (c === 'K') { D.key = true; act = { toast: ['THE BONE KEY', 'It will open the great door'] }; sfx.boon(); }
        else { const n = 120; world.gold += n; act = { toast: ['A CHEST', `${n} ${world.overworld === false && D.from === 'demo' ? 'gold' : 'Cinders'}`] }; }
      }
      if (c === 'B' && near(i, j, 58)) {
        if (D.key && !D.bossDead) {
          F.g[j][i] = 'b';
          rebuild(F); world.room.obstacles = F.solid; world.room.enemyObstacles = F.mobSolid;
          sfx.door(); shake(0.3);
          act = { toast: ['THE GREAT DOOR', 'The Bone Key turns'] };
        } else if (!D.said.door) { D.said.door = true; act = { toast: ['A GREAT DOOR', 'Locked. A key of bone would open it.'] }; }
      } else if (c === 'B' && D.said.door && !near(i, j, 120)) D.said.door = false;
      if (c === 'A' && near(i, j, 50)) {
        if (!D.atLamp) {
          D.atLamp = true;
          D.checkpoint = { floor: D.cur, x: i, y: j + 1 };
          p.hp = p.stats.maxHp; p.lives = Math.max(p.lives, 3);
          resetFoes();
          sfx.heal();
          ring(i * T + T / 2, j * T + T / 2, { r0: 8, r1: 90, color: '#ffb35e', life: 0.5, width: 5 });
          act = { toast: ['A LAMP', 'You rest. Your lives return; so do the dead.'] };
        }
      }
    }
  }
  if (D.atLamp && !F.lamps.some((l) => near(l.i, l.j, 90))) D.atLamp = false;

  // --- the bridge running out ------------------------------------------------------
  if (F.bridgeQ && F.bridgeQ.length) {
    F.bridgeT -= dt;
    if (F.bridgeT <= 0) {
      const [x, y] = F.bridgeQ.shift();
      F.g[y][x] = '=';
      F.bridgeT = 0.09;
      sfx.thud();
      burst(x * T + T / 2, y * T + T / 2, { count: 4, color: '#8a6a44', speed: 60, size: 3, life: 0.3, drag: 4 });
      rebuild(F); world.room.obstacles = F.solid; world.room.enemyObstacles = F.mobSolid;
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
        rebuild(F); world.room.enemyObstacles = F.mobSolid;
      }
    } else if (s.state === 'gone') {
      s.t -= dt;
      if (s.t <= 0 && !(fi === i && fj === j)) { s.state = 'ok'; rebuild(F); world.room.enemyObstacles = F.mobSolid; }
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
  // Spikes: down, then a warning (the tips peek), then up. The rows go in a wave.
  for (let j = Math.max(0, fj - 12); j <= Math.min(F.g.length - 1, fj + 12); j++) {
    for (let i = Math.max(0, fi - 20); i <= Math.min(F.g[0].length - 1, fi + 20); i++) {
      if (F.g[j][i] !== '^') continue;
      if (spikeState(j) === 'up') hurt(i * T + T / 2, j * T + T / 2, 30, 12, 'spikes');
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

  // --- the dead, waking; the boss ------------------------------------------------------
  for (const e of world.enemies) {
    if (e.dead || e.woke) continue;
    if (dist(e.x, e.y, p.x, p.y) < (e.dBoss ? 330 : 380) || e.hp < e.maxHp) {
      e.woke = true;
      if (e.dBoss && !D.bossAwake) {
        D.bossAwake = true;
        // The door behind you shuts.
        for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) if (F.g[y][x] === 'b') F.g[y][x] = 'B';
        rebuild(F); world.room.obstacles = F.solid; world.room.enemyObstacles = F.mobSolid;
        sfx.door(); shake(0.3);
      }
    }
  }
  if (D.bossAwake && !D.bossDead) {
    const boss = world.enemies.find((e) => e.dBoss);
    if (!boss || boss.dead) {
      D.bossDead = true;
      for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) if (F.g[y][x] === 'B') F.g[y][x] = 'b';
      rebuild(F); world.room.obstacles = F.solid; world.room.enemyObstacles = F.mobSolid;
      const bs = F.spawns.find((s) => s.boss);
      D.exitAt = { x: bs.i * T + T / 2, y: (bs.j - 3) * T + T / 2, k: D.cur };
      world.gold += 400;
      act = { toast: ['THE CATACOMB IS CLEARED', `${D.boss.title} falls · 400 ${D.from === 'demo' ? 'gold' : 'Cinders'} · the way out opens`], cleared: true };
    }
  }
  return act;
}

export function spikeState(j) {
  const u = ((D ? D.t : 0) + j * 0.32) % 2.4;
  return u < 1.3 ? 'down' : u < 1.72 ? 'warn' : 'up';
}
export function ventState(v) {
  const u = ((D ? D.t : 0) + v.ph) % 3.0;
  return u < 1.6 ? 'idle' : u < 2.1 ? 'warn' : 'burn';
}
export function bladeAt(pd) {
  const a = Math.sin(((D ? D.t : 0) / pd.period) * TAU + pd.ph * TAU);
  return { x: pd.x * T + T / 2 + a * pd.amp * T, y: pd.y * T, a };
}

/** Fallen with no life to spare: back at the last lamp, lives returned, the dead with you. */
export function dungeonWake() {
  const p = world.player;
  const c = D.checkpoint;
  D.fall = null; p.fallK = 0;
  switchTo(c.floor, c.x * T + T / 2, c.y * T + T / 2);
  resetFoes();
  p.dead = false; p.hp = p.stats.maxHp; p.lives = 3; p.invuln = 2;
  D.fade = 1;
  if (!D.bossDead) {
    D.bossAwake = false;
    // The great door stands open again for another try (the key is kept).
    for (const F of D.floors) for (let y = 0; y < F.g.length; y++) for (let x = 0; x < F.g[0].length; x++) if (F.g[y][x] === 'B' && D.key && F.id === 'f2') F.g[y][x] = 'b';
    for (const F of D.floors) rebuild(F);
    world.room.obstacles = D.floors[D.cur].solid; world.room.enemyObstacles = D.floors[D.cur].mobSolid;
  }
}

void rand;
