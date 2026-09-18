// The Wilds: an open-world prototype. A small region of Ashfall you walk
// around in instead of room by room, to feel how the game plays open.
//
// What it tries, from research on 2D open worlds (A Link to the Past, Tunic,
// Hollow Knight, Breath of the Wild):
//   - REGIONS with their own look and feel: the Ashen Meadow at the centre,
//     the Whispering Woods, the Old Quarry, Mirror Lake, the Broken Road and
//     Silverback Ridge.
//   - LANDMARKS you can see and head for (the watchtower, the shrine flames,
//     the boss gates' portals) - Breath of the Wild's "triangle" of
//     something always catching your eye.
//   - TRAVERSAL that asks for your skills: gaps of water you must DASH across,
//     one-way LEDGES you can drop down but not climb (so the world folds
//     back into shortcuts), BRAMBLES you cut through, and a GATE that only
//     a lever on the far side of the map opens (lock and key).
//   - REWARDS for curiosity: chests, heart fragments (four make a heart),
//     lore stones, a hidden grove behind brambles, a vault behind the gate,
//     and a trail of lanterns that leads off the road to a secret.
//   - SHRINES that heal you and become where you wake if you fall; a
//     WATCHTOWER whose view reveals the map; a MINIMAP that fills in only
//     where you have been (fog of war).
//   - CAMPS of enemies that sleep until you come close, and give up a chest
//     when cleared; wanderers on the roads.
//   - BOSS GATES: stand in one to be pulled into that guardian's arena, and
//     come back out to the Wilds when it falls.
//
// The combat is the same game: every weapon, spell, grenade and enemy works
// here unchanged. The world is one big "room" whose bounds are the whole
// region, seen through a camera that follows you.

import { world, arena, camera, view, gfx } from './state.js';
import { TAU, clamp, rand, dist, roundRect } from './util.js';
import { burst, ring, damageText, shake } from './fx.js';
import { sfx } from './audio.js';
import { spawnPickup } from './spawn.js';
import { createTerrain, TT, TERRAIN_RGB, fbm, vnoise } from './terrain.js';
import { createGrass, grassMovers } from './grass.js';

export const OW = { W: 3600, H: 2400 };
const FOG = 100;                         // fog-of-war cell size

const ZONES = [
  { id: 'meadow', name: 'Ashen Meadow', x: 1300, y: 1250, r: 900, col: '58,72,54' },
  { id: 'woods', name: 'Whispering Woods', x: 2850, y: 500, r: 1000, col: '30,54,40' },
  { id: 'quarry', name: 'The Old Quarry', x: 3000, y: 1850, r: 900, col: '78,64,52' },
  { id: 'lake', name: 'Mirror Lake', x: 1400, y: 2150, r: 800, col: '44,60,66' },
  { id: 'ruins', name: 'The Broken Road', x: 350, y: 1200, r: 800, col: '62,58,58' },
  { id: 'ridge', name: 'Silverback Ridge', x: 1300, y: 300, r: 800, col: '60,58,66' },
];

let spawnFn = null;
export function bindOverworldSpawner(fn) { spawnFn = fn; }

let ow = null;                           // the region's live state

// --- building the region ----------------------------------------------------------

function wall(list, x, y, w, h, kind, extra = {}) {
  list.push({ x, y, w, h, kind, ...extra });
}

function build() {
  const obstacles = [];
  const pois = [];
  const decals = [];
  const trees = [];
  const roads = [
    [[1300, 1300], [1700, 1100], [2200, 900], [2700, 650]],          // to the woods
    [[1300, 1300], [1900, 1450], [2500, 1600], [2950, 1750]],        // to the quarry
    [[1300, 1300], [900, 1250], [500, 1200], [300, 1200]],           // the broken road west
    [[1300, 1300], [1250, 900], [1300, 500], [1300, 250]],           // up to the ridge
    [[1300, 1300], [1350, 1650], [1400, 1930]],                      // down to the lake
  ];
  const near = (x, y, pts, d) => pts.some(([px, py]) => dist(x, y, px, py) < d);
  const onRoad = (x, y) => roads.some((r) => r.some(([px, py], i) => {
    if (i === 0) return false;
    const [ax, ay] = r[i - 1];
    const t = clamp(((x - ax) * (px - ax) + (y - ay) * (py - ay)) / ((px - ax) ** 2 + (py - ay) ** 2), 0, 1);
    return dist(x, y, ax + (px - ax) * t, ay + (py - ay) * t) < 70;
  }));

  // Mirror Lake: deep water all round, and one channel you must dash across.
  wall(obstacles, 900, 1950, 450, 430, 'water', { low: true });
  wall(obstacles, 1450, 1950, 450, 430, 'water', { low: true });
  wall(obstacles, 1350, 2260, 100, 120, 'water', { low: true });
  wall(obstacles, 1350, 1950, 100, 90, 'gap', { low: true, gap: true });    // the dash

  // The Old Quarry: a long rock shelf you can drop off, not climb - with one
  // ramp at the far east, so the drop becomes a shortcut back.
  wall(obstacles, 2380, 1330, 1060, 26, 'ledge', { ledge: true, low: true });
  wall(obstacles, 2360, 1240, 22, 116, 'cliff');
  for (let k = 0; k < 7; k++) wall(obstacles, 2500 + k * 150 + rand(-20, 20), 1480 + rand(-60, 380), rand(40, 70), rand(40, 70), 'rock');

  // The Broken Road: ruined walls, and the vault behind a portcullis.
  wall(obstacles, 80, 1000, 300, 26, 'ruin');
  wall(obstacles, 80, 1400, 300, 26, 'ruin');
  wall(obstacles, 80, 1000, 26, 426, 'ruin');
  wall(obstacles, 354, 1000, 26, 150, 'ruin');
  wall(obstacles, 354, 1276, 26, 150, 'ruin');
  wall(obstacles, 354, 1150, 26, 126, 'gate', { id: 'vault' });
  for (let k = 0; k < 6; k++) wall(obstacles, 480 + rand(0, 300), 700 + k * 150 + rand(-30, 30), rand(60, 140), 24, 'ruin');

  // Silverback Ridge: a rock rim across the top, broken by the path, and
  // boulders standing out of the snowfield.
  wall(obstacles, 600, 120, 560, 30, 'cliff');
  wall(obstacles, 1440, 120, 600, 30, 'cliff');
  for (const [bx, by] of [[760, 300], [980, 520], [1560, 330], [1760, 520], [1920, 260]]) {
    wall(obstacles, bx + rand(-30, 30), by + rand(-30, 30), rand(50, 80), rand(40, 64), 'rock');
  }

  // The hidden grove in the far north-east woods, walled by trees, entered
  // only through a bramble thicket.
  const grove = { x: 3380, y: 230 };
  wall(obstacles, 3150, 150, 26, 60, 'bramble', { hp: 5, id: 'bramble' });
  wall(obstacles, 3150, 90, 26, 60, 'tree-wall');
  wall(obstacles, 3150, 210, 26, 200, 'tree-wall');
  wall(obstacles, 3150, 400, 450, 26, 'tree-wall');

  // The ground itself (terrain.js): which kind of land lies where.
  const segDist = (x, y) => {
    let best = 1e9;
    for (const r of roads) {
      for (let i = 1; i < r.length; i++) {
        const [ax, ay] = r[i - 1], [px, py] = r[i];
        const t = clamp(((x - ax) * (px - ax) + (y - ay) * (py - ay)) / ((px - ax) ** 2 + (py - ay) ** 2), 0, 1);
        best = Math.min(best, dist(x, y, ax + (px - ax) * t, ay + (py - ay) * t));
      }
    }
    return best;
  };
  const waters = obstacles.filter((o) => o.kind === 'water' || o.kind === 'gap');
  const classify = (x, y) => {
    for (const o of waters) {
      const dx = Math.max(o.x - x, 0, x - o.x - o.w), dy = Math.max(o.y - y, 0, y - o.y - o.h);
      if (dx * dx + dy * dy < 75 * 75) return TT.SAND;                   // shores
    }
    // Zone borders wander, so regions bleed into each other.
    const z = zoneAt(x + (vnoise(x * 0.004, y * 0.004) - 0.5) * 500, y + (vnoise(x * 0.004 + 9, y * 0.004 + 4) - 0.5) * 500);
    const m = fbm(x * 0.004, y * 0.004);
    switch (z.id) {
      case 'ridge': return y < 640 + (m - 0.5) * 300 ? TT.SNOW : m > 0.56 ? TT.ROCK : TT.GRASS;
      case 'woods': return m > 0.64 ? TT.GRASS : TT.MOSS;
      case 'quarry': return m > 0.55 ? TT.ROCK : m < 0.33 ? TT.SAND : TT.GRAVEL;
      case 'ruins': return x < 780 && y > 880 && y < 1520 ? TT.PAVE : m > 0.52 ? TT.DIRT : TT.GRASS;
      case 'lake': return m > 0.6 ? TT.TALL : TT.GRASS;
      default:
        if (dist(x, y, 1300, 1300) < 170) return TT.GRASS;
        return fbm(x * 0.0035 + 21, y * 0.0035 + 5) > 0.55 ? TT.TALL : TT.GRASS;
    }
  };
  for (const o of obstacles) if (o.kind === 'rock' || o.kind === 'ruin' || o.kind === 'cliff' || o.kind === 'tree-wall') o.shadow = true;
  const terrain = createTerrain({ W: OW.W, H: OW.H, classify, roadDist: segDist, obstacles });

  // Trees: thick in the woods, a scatter at the meadow's edges.
  let guard = 0;
  while (trees.length < 150 && guard++ < 3000) {
    const x = rand(60, OW.W - 60), y = rand(60, OW.H - 60);
    const z = zoneAt(x, y);
    const want = z.id === 'woods' ? 1 : z.id === 'meadow' ? 0.12 : z.id === 'ridge' ? 0.18 : 0.05;
    if (Math.random() > want) continue;
    if (onRoad(x, y) || near(x, y, trees.map((t) => [t.x, t.y]), 95)) continue;
    if (obstacles.some((o) => x > o.x - 60 && x < o.x + o.w + 60 && y > o.y - 60 && y < o.y + o.h + 60)) continue;
    if (dist(x, y, 1300, 1300) < 220 || dist(x, y, grove.x, grove.y) < 170) continue;
    const ground = terrain.typeAt(x, y);
    if (ground === TT.SAND || ground === TT.PAVE) continue;
    const r = rand(34, 54);
    wall(obstacles, x - 12, y - 8, 24, 20, 'trunk');
    // On the snow and the high ground they are pines.
    const pine = ground === TT.SNOW || (z.id === 'ridge' && y < 900);
    trees.push({ x, y, r, sway: rand(0, TAU), shade: rand(-8, 8), pine, o: obstacles[obstacles.length - 1] });
  }

  // Wildflowers in the grass, in little clusters.
  for (let k = 0; k < 90; k++) {
    const cx = rand(0, OW.W), cy = rand(0, OW.H);
    const ground = terrain.typeAt(cx, cy);
    if (ground !== TT.GRASS && ground !== TT.TALL) continue;
    const c = ['230,140,60', '220,90,120', '240,230,180', '170,150,240'][(Math.random() * 4) | 0];
    for (let f = 0; f < 5; f++) decals.push({ t: 'flower', x: cx + rand(-26, 26), y: cy + rand(-16, 16), c, ph: rand(0, TAU) });
  }

  // Rocks get a shape: an irregular outline inside their box.
  for (const o of obstacles) {
    if (o.kind !== 'rock') continue;
    o.poly = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      o.poly.push([Math.cos(a) * (o.w / 2) * rand(0.86, 1.06), Math.sin(a) * (o.h / 2) * rand(0.86, 1.06)]);
    }
    o.snowy = terrain.typeAt(o.x + o.w / 2, o.y + o.h / 2) === TT.SNOW;
  }

  // Points of interest.
  const poi = (kind, x, y, extra = {}) => pois.push({ kind, x, y, seen: false, done: false, ...extra });
  poi('shrine', 1300, 1300, { name: 'Meadow Shrine', lit: false });
  poi('shrine', 3250, 2150, { name: 'Quarry Shrine', lit: false });
  poi('tower', 900, 380);
  poi('chest', grove.x, grove.y, { secret: true, reward: 'heart' });
  poi('heart', grove.x + 60, grove.y + 40);
  poi('chest', 1400, 2200, { reward: 'gold' });
  poi('heart', 1400, 2120);
  poi('chest', 220, 1210, { secret: true, reward: 'ember' });
  poi('heart', 220, 1300);
  poi('heart', 2250, 1150, { hidden: true });
  poi('lever', 3470, 2280, { opens: 'vault' });
  poi('lore', 600, 1500, { text: 'Here the road ran to the sea, before the ash came down.' });
  poi('lore', 2320, 1270, { text: 'The quarrymen cut too deep. The kobolds say the mountain cut back.' });
  poi('lore', 1150, 560, { text: 'Kharn keeps the high ground. Nothing climbs to him and comes down unchanged.' });
  poi('gate', 2050, 2230, { boss: 'croc', name: "Mire's Edge" });
  poi('gate', 1300, 175, { boss: 'gorilla', name: "Silverback's Summit" });
  poi('camp', 2600, 780, { foes: ['wretch', 'wretch', 'slinger', 'kappa'], cleared: false });
  poi('camp', 3000, 1950, { foes: ['sapper', 'sapper', 'chinthe'], cleared: false });
  poi('camp', 1650, 420, { foes: ['draugr', 'preta', 'wretch'], cleared: false });
  poi('wander', 1800, 1250, { foe: 'duende' });
  poi('wander', 700, 1150, { foe: 'adze' });
  poi('wander', 2100, 600, { foe: 'charger' });

  // A trail of lanterns, off the woods road, towards the bramble thicket.
  const lanterns = [];
  for (let k = 0; k < 7; k++) lanterns.push({ x: 2750 + k * 60, y: 600 - k * 55 + Math.sin(k) * 14, ph: rand(0, TAU) });

  // Nothing grows on a landmark or on the lantern trail.
  const clear = pois.map((q) => [q.x, q.y]).concat(lanterns.map((l) => [l.x, l.y]));
  for (let i = trees.length - 1; i >= 0; i--) {
    if (!near(trees[i].x, trees[i].y, clear, 120)) continue;
    obstacles.splice(obstacles.indexOf(trees[i].o), 1);
    trees.splice(i, 1);
  }

  // The grass field, sown clear of walls, landmarks and the lantern trail.
  const grass = createGrass(terrain, {
    W: OW.W, H: OW.H,
    blocked: (x, y) => near(x, y, clear, 50)
      || obstacles.some((o) => x > o.x - 6 && x < o.x + o.w + 6 && y > o.y - 6 && y < o.y + o.h + 6),
  });

  const fogW = Math.ceil(OW.W / FOG), fogH = Math.ceil(OW.H / FOG);
  return {
    obstacles, pois, decals, trees, roads, lanterns, terrain, grass,
    prints: [], stepT: 0, lastX: 0, lastY: 0, printX: 0, printY: 0,
    grade: [255, 230, 170, 0.04], printSprite: null, printEpoch: -1,
    fog: new Uint8Array(fogW * fogH), fogW, fogH,
    zone: null, respawn: { x: 1300, y: 1380 }, hearts: 0, secrets: 0,
    gateT: 0, returnFrom: null, beaten: {}, leaves: [],
  };
}

function zoneAt(x, y) {
  let best = ZONES[0], bestK = Infinity;
  for (const z of ZONES) {
    const k = dist(x, y, z.x, z.y) / z.r;
    if (k < bestK) { bestK = k; best = z; }
  }
  return best;
}

// --- entering and leaving ---------------------------------------------------------------

/** Set the arena to the whole region (after a resize too). */
export function applyOverworldBounds() {
  arena.x = 0; arena.y = 0; arena.w = OW.W; arena.h = OW.H;
}

/** A fresh region, or the same one coming back from a boss. Returns the room. */
export function enterOverworld(fresh) {
  if (fresh || !ow) ow = build();
  applyOverworldBounds();
  const room = { type: 'overworld', training: true, overworld: true, obstacles: ow.obstacles, waves: [], doors: [], doorsOpen: false, intro: 0 };
  // Camps and wanderers come back each time (bar the cleared camps).
  for (const q of ow.pois) { q.spawned = false; }
  return room;
}

export function overworldRespawn() { return ow ? ow.respawn : { x: 1300, y: 1380 }; }

/** Back from a boss gate: where to stand, and whether it fell. */
export function overworldReturn(bossType, won) {
  if (!ow) return null;
  const gate = ow.pois.find((q) => q.kind === 'gate' && q.boss === bossType);
  if (won && gate) { gate.done = true; ow.beaten[bossType] = true; }
  return gate ? { x: gate.x, y: gate.y + 90 } : ow.respawn;
}

// --- per frame ----------------------------------------------------------------------

function reveal(x, y, r) {
  const { fog, fogW, fogH } = ow;
  const cx = Math.floor(x / FOG), cy = Math.floor(y / FOG), cr = Math.ceil(r / FOG);
  for (let j = Math.max(0, cy - cr); j <= Math.min(fogH - 1, cy + cr); j++) {
    for (let i = Math.max(0, cx - cr); i <= Math.min(fogW - 1, cx + cr); i++) {
      if (dist(i * FOG + FOG / 2, j * FOG + FOG / 2, x, y) <= r) fog[j * fogW + i] = 1;
    }
  }
}

function spawnGroup(q) {
  q.foes.forEach((type, i) => {
    const a = (i / q.foes.length) * TAU;
    const e = spawnFn(type, q.x + Math.cos(a) * 90, q.y + Math.sin(a) * 90, { instant: true, scale: 1.25 });
    sleepy(e, q);
    q.members = q.members || [];
    q.members.push(e);
  });
}

/** Camp enemies doze until you come close (or hit one), and give up far away. */
function sleepy(e, home) {
  e.home = home;
  e.asleep = (self) => {
    const p = world.player;
    if (!p) return true;
    const d = dist(self.x, self.y, p.x, p.y);
    if (self.hitAt && world.runTime - self.hitAt < 3) self.awake = true;
    if (d < 430) self.awake = true;
    if (d > 1100) self.awake = false;
    return !self.awake;
  };
}

function reward(q, p) {
  const r = q.reward || 'gold';
  const n = r === 'gold' ? 12 : 6;
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU);
    // Gold scattered as pickups, the way kills drop it.
    spawnPickup({ x: q.x, y: q.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, type: 'gold', value: 5 });
  }
  if (r === 'heart') grantHeart(p, q.x, q.y);
  if (r === 'ember') {
    p.stats.damageMult *= 1.08;
    damageText(q.x, q.y - 40, 'EMBER OF MIGHT: +8% DAMAGE', { color: '#ffb35e', size: 15 });
  }
}

function grantHeart(p, x, y) {
  ow.hearts++;
  sfx.boon();
  if (ow.hearts % 4 === 0) {
    p.stats.maxHp += 20;
    p.hp = p.stats.maxHp;
    damageText(x, y - 50, 'A WHOLE HEART: +20 MAX HEALTH', { color: '#ff7a8a', size: 17 });
  } else {
    damageText(x, y - 50, `HEART FRAGMENT ${ow.hearts % 4} / 4`, { color: '#ff9aa8', size: 15 });
  }
}

/**
 * The region's upkeep. Returns an action for game.js when one is needed:
 * { boss: type } when a gate claims you, { toast: [title, sub] } to show.
 */
export function updateOverworld(dt) {
  if (!ow || !world.player) return null;
  const p = world.player;
  let action = null;

  // The camera leads a little where you are going and aiming.
  const lead = 60;
  const tx = clamp(p.x + Math.cos(p.aimAngle) * lead - view.w / 2, 0, Math.max(0, OW.W - view.w));
  const ty = clamp(p.y + Math.sin(p.aimAngle) * lead - view.h / 2, 0, Math.max(0, OW.H - view.h));
  const f = 1 - Math.exp(-6 * dt);
  camera.x += (tx - camera.x) * f;
  camera.y += (ty - camera.y) * f;

  reveal(p.x, p.y, 420);

  // The grass: wind, and everyone walking through it; your blows cut it.
  ow.grass.update(dt, world.runTime, { x: camera.x, y: camera.y, w: view.w, h: view.h },
    grassMovers(), world.hitboxes.filter((h) => h.friendly));
  groundFeel(p, dt);

  // Entering a region: its name, once each time you cross into it.
  const z = zoneAt(p.x, p.y);
  if (z !== ow.zone) {
    ow.zone = z;
    action = { toast: [z.name.toUpperCase(), 'The Wilds'] };
  }

  for (const q of ow.pois) {
    const d = dist(p.x, p.y, q.x, q.y);
    if (d < 520 && !q.hidden) q.seen = true;
    switch (q.kind) {
      case 'shrine':
        if (d < 60) {
          if (!q.near) {
            q.near = true;
            p.hp = p.stats.maxHp;
            ow.respawn = { x: q.x, y: q.y + 80 };
            if (!q.lit) { q.lit = true; action = { toast: ['SHRINE KINDLED', `${q.name}: you will wake here`] }; }
            ring(q.x, q.y, { r0: 10, r1: 110, color: '#ffb35e', life: 0.6, width: 5 });
            sfx.heal();
          }
        } else q.near = false;
        break;
      case 'tower':
        if (d < 60 && !q.done) {
          q.done = true;
          // The view from the top: every landmark, and the land around.
          for (const o of ow.pois) if (!o.hidden) o.seen = true;
          reveal(q.x, q.y, 1400);
          action = { toast: ['THE WATCHTOWER', 'The whole region lies below you'] };
          sfx.bell();
        }
        break;
      case 'chest':
        if (d < 50 && !q.done && (!q.lockedBy || q.unlocked)) {
          q.done = true;
          reward(q, p);
          if (q.secret) { ow.secrets++; action = { toast: ['A SECRET', 'Curiosity pays'] }; }
          burst(q.x, q.y, { count: 20, color: '#ffd45e', speed: 220, size: 4, life: 0.5, drag: 4, shape: 'spark' });
          sfx.coin();
        }
        break;
      case 'heart':
        if (d < 34 && !q.done) { q.done = true; grantHeart(p, q.x, q.y); }
        if (q.hidden && d < 200) q.hidden = false;
        break;
      case 'lore':
        if (d < 60) {
          if (!q.near) { q.near = true; action = { toast: ['A WORN STONE', q.text] }; sfx.chime(); }
        } else q.near = false;
        break;
      case 'lever':
        if (d < 44 && !q.done) {
          q.done = true;
          const gateWall = ow.obstacles.find((o) => o.id === q.opens);
          if (gateWall) ow.obstacles.splice(ow.obstacles.indexOf(gateWall), 1);
          shake(0.4);
          sfx.thud();
          action = { toast: ['CLUNK', 'Somewhere far off, iron grinds open'] };
        }
        break;
      case 'camp':
        if (!q.cleared && !q.spawned && d < 900) { q.spawned = true; q.members = []; spawnGroup(q); }
        if (q.spawned && !q.cleared && q.members.length && q.members.every((e) => e.dead)) {
          q.cleared = true;
          ow.pois.push({ kind: 'chest', x: q.x, y: q.y, seen: true, done: false, reward: 'gold' });
          action = { toast: ['CAMP CLEARED', 'They left their spoils by the fire'] };
        }
        break;
      case 'wander':
        if (!q.spawned && d < 900) {
          q.spawned = true;
          const e = spawnFn(q.foe, q.x, q.y, { instant: true, scale: 1.2 });
          sleepy(e, q);
        }
        break;
      case 'gate':
        if (q.done) break;
        if (d < 56) {
          ow.gateT += dt;
          if (ow.gateT > 1.2) { ow.gateT = 0; return { boss: q.boss, name: q.name }; }
        }
        break;
      default: break;
    }
  }
  if (!ow.pois.some((q) => q.kind === 'gate' && !q.done && dist(p.x, p.y, q.x, q.y) < 56)) ow.gateT = 0;

  // Brambles: cut by your blows.
  for (const h of world.hitboxes) {
    if (!h.friendly) continue;
    for (const o of ow.obstacles) {
      if (o.kind !== 'bramble' || o.hitBy === h) continue;
      if (dist(h.x, h.y, o.x + o.w / 2, o.y + o.h / 2) > (h.radius || h.len || 80) + 30) continue;
      o.hitBy = h;
      o.hp--;
      burst(o.x + o.w / 2, o.y + o.h / 2, { count: 8, color: '#6a8a3a', speed: 160, size: 3, life: 0.35, drag: 4, shape: 'shard' });
      sfx.hit(0.6);
      if (o.hp <= 0) {
        ow.obstacles.splice(ow.obstacles.indexOf(o), 1);
        action = { toast: ['THE THICKET GIVES', 'A path through the trees'] };
        break;
      }
    }
  }

  // Weather: snow falling on the ridge, leaves in the woods and the meadow,
  // dust in the quarry.
  const here = ow.terrain.typeAt(camera.x + view.w / 2, camera.y + view.h / 2);
  const snowing = here === TT.SNOW;
  if (Math.random() < dt * (snowing ? 70 : 20)) {
    const x = camera.x + rand(-40, view.w + 40), y = camera.y + rand(-60, view.h);
    const zz = zoneAt(x, y);
    if (snowing) ow.leaves.push({ x, y, t: 0, life: rand(3, 6), vx: rand(-8, 22), vy: rand(24, 48), rot: 0, snow: true, s: rand(1, 2.4) });
    else if (zz.id === 'woods' || zz.id === 'meadow' || zz.id === 'quarry') ow.leaves.push({ x, y, t: 0, life: rand(3, 5), vx: rand(20, 45), vy: rand(10, 25), rot: rand(0, TAU), c: zz.id === 'quarry' ? '#9a8a70' : zz.id === 'woods' ? '#8aa040' : '#c8a060' });
  }
  for (let i = ow.leaves.length - 1; i >= 0; i--) {
    const l = ow.leaves[i];
    l.t += dt; l.x += (l.vx + Math.sin(l.t * 2) * 12) * dt; l.y += l.vy * dt; l.rot += dt * 2;
    if (l.t > l.life) ow.leaves.splice(i, 1);
  }
  if (ow.leaves.length > 160) ow.leaves.splice(0, ow.leaves.length - 160);

  // Each land has its own light: cold on the snow, green-dim in the woods,
  // warm dust over the quarry. Eased, so crossing a border is a slow turn.
  const want = GRADE[here] || GRADE[TT.GRASS];
  const f2 = Math.min(1, dt * 1.2);
  for (let k = 0; k < 4; k++) ow.grade[k] += (want[k] - ow.grade[k]) * f2;
  return action;
}

const GRADE = {
  [TT.GRASS]: [255, 228, 168, 0.05], [TT.TALL]: [255, 224, 150, 0.06], [TT.MOSS]: [20, 70, 50, 0.13],
  [TT.DIRT]: [160, 140, 170, 0.06], [TT.PAVE]: [150, 140, 175, 0.08], [TT.ROCK]: [255, 190, 130, 0.06],
  [TT.GRAVEL]: [255, 186, 120, 0.08], [TT.SAND]: [255, 214, 150, 0.06], [TT.SNOW]: [185, 210, 255, 0.12],
};
const STEP_DUST = {
  [TT.SNOW]: '#eef3fa', [TT.SAND]: '#cdb68c', [TT.GRAVEL]: '#a2927a', [TT.ROCK]: '#9a948c', [TT.DIRT]: '#9a8266',
};

/** How the ground answers your feet: dust, powder, prints in the snow. */
function groundFeel(p, dt) {
  const moved = Math.hypot(p.x - ow.lastX, p.y - ow.lastY);
  ow.lastX = p.x; ow.lastY = p.y;
  if (p.dead || moved > 200) return;                     // a respawn, not a step
  const ground = ow.terrain.typeAt(p.x, p.y + p.r * 0.6);
  const dust = STEP_DUST[ground];
  if (moved > 0.5) {
    ow.stepT -= dt;
    if (ow.stepT <= 0 && dust) {
      ow.stepT = 0.26;
      burst(p.x, p.y + p.r * 0.7, { count: 2, color: dust, speed: 40, size: 3, life: 0.45, drag: 3, gravity: -10 });
    }
    if (p.dashing && dust && Math.random() < 0.7) {
      burst(p.x, p.y + p.r * 0.6, { count: 2, color: dust, speed: 90, size: 3.5, life: 0.5, drag: 3, gravity: -14 });
    }
  }
  // Soft prints through the snow, slowly filling back in.
  if (ground === TT.SNOW && Math.hypot(p.x - ow.printX, p.y - ow.printY) > 13) {
    ow.printX = p.x; ow.printY = p.y;
    ow.prints.push({ x: p.x, y: p.y + p.r * 0.6, t: world.runTime, big: p.dashing });
    if (ow.prints.length > 220) ow.prints.shift();
  }
}

function printSprite() {
  if (ow.printSprite && ow.printEpoch === gfx.epoch) return ow.printSprite;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(24, 24, 2, 24, 24, 24);
  gr.addColorStop(0, 'rgba(120,140,178,0.55)');
  gr.addColorStop(0.6, 'rgba(150,168,200,0.25)');
  gr.addColorStop(1, 'rgba(170,186,214,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 48, 48);
  ow.printSprite = c;
  ow.printEpoch = gfx.epoch;
  return c;
}

// --- drawing (world space; game.js has already applied the camera) ------------------------

const inView = (x, y, pad = 80) => x > camera.x - pad && x < camera.x + view.w + pad && y > camera.y - pad && y < camera.y + view.h + pad;

export function drawOverworldBelow(ctx, time) {
  if (!ow) return;
  const cx = camera.x, cy = camera.y, vw = view.w, vh = view.h;

  // The painted ground (terrain.js), baked in chunks as they come into view.
  ow.terrain.draw(ctx, cx, cy, vw, vh);

  // Prints in the snow, filling back in over twelve seconds.
  if (ow.prints.length) {
    const spr = printSprite();
    for (const pr of ow.prints) {
      const age = time - pr.t;
      if (age > 12 || !inView(pr.x, pr.y, 30)) continue;
      ctx.globalAlpha = Math.min(1, 1.3 - age / 12) * 0.9;
      const s2 = pr.big ? 30 : 22;
      ctx.drawImage(spr, pr.x - s2 / 2, pr.y - s2 * 0.3, s2, s2 * 0.6);
    }
    ctx.globalAlpha = 1;
  }

  // Water, ledges, cliffs, rocks, ruins, gates, brambles.
  for (const o of ow.obstacles) {
    if (!inView(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h))) continue;
    drawObstacle(ctx, o, time);
  }

  // Wildflowers, nodding in the wind.
  for (const d of ow.decals) {
    if (!inView(d.x, d.y, 20)) continue;
    const nod = Math.sin(time * 1.8 + d.ph + d.x * 0.004) * 1.5;
    ctx.strokeStyle = '#4e6a3a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(d.x, d.y + 5); ctx.lineTo(d.x + nod, d.y); ctx.stroke();
    ctx.fillStyle = `rgba(${d.c},0.95)`;
    ctx.beginPath(); ctx.arc(d.x + nod, d.y, 2.3, 0, TAU); ctx.fill();
  }

  // The grass field.
  ow.grass.draw(ctx, time, { x: cx, y: cy, w: vw, h: vh });

  // Lanterns leading off the road.
  for (const l of ow.lanterns) {
    if (!inView(l.x, l.y)) continue;
    const fl = 0.75 + Math.sin(time * 7 + l.ph) * 0.2;
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(l.x - 2, l.y - 14, 4, 16);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 * fl; ctx.fillStyle = '#ffb35e';
    ctx.beginPath(); ctx.arc(l.x, l.y - 16, 22, 0, TAU); ctx.fill();
    ctx.globalAlpha = fl; ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(l.x, l.y - 16, 3.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // Points of interest on the ground.
  for (const q of ow.pois) {
    if (q.hidden || !inView(q.x, q.y, 120)) continue;
    drawPoi(ctx, q, time);
  }

  // Tree trunks and their shadows (the canopies are drawn over everyone).
  for (const t of ow.trees) {
    if (!inView(t.x, t.y, 90)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(t.x + 10, t.y + 8, t.r * 0.9, t.r * 0.45, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(t.x - 7, t.y - 10, 14, 18);
  }
}

function drawObstacle(ctx, o, time) {
  switch (o.kind) {
    case 'water':
    case 'gap': {
      ctx.fillStyle = o.kind === 'gap' ? '#1c3a4c' : '#16303e';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(160,210,230,0.18)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < Math.floor(o.h / 18); k++) {
        const y = o.y + 10 + k * 18;
        const off = ((time * 20 + k * 37) % 60);
        ctx.beginPath(); ctx.moveTo(o.x + off, y); ctx.lineTo(Math.min(o.x + o.w, o.x + off + 30), y); ctx.stroke();
      }
      if (o.kind === 'gap') {
        // The crossing: pale stones on either bank, and chalk chevrons.
        ctx.fillStyle = '#8a8a80';
        ctx.fillRect(o.x + 10, o.y - 8, o.w - 20, 8);
        ctx.fillRect(o.x + 10, o.y + o.h, o.w - 20, 8);
        ctx.fillStyle = 'rgba(230,240,255,0.5)';
        ctx.font = '900 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('» DASH »', o.x + o.w / 2, o.y + o.h / 2 + 5);
      }
      break;
    }
    case 'ledge': {
      // A drop: the lit lip on top, the dark face below.
      ctx.fillStyle = '#2a221c'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#8a7a64'; ctx.fillRect(o.x, o.y, o.w, 5);
      ctx.fillStyle = 'rgba(230,220,200,0.35)';
      for (let x = o.x + 30; x < o.x + o.w; x += 120) {
        ctx.beginPath(); ctx.moveTo(x - 6, o.y + 9); ctx.lineTo(x + 6, o.y + 9); ctx.lineTo(x, o.y + 18); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'cliff':
      ctx.fillStyle = '#2e2a2a'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#6a625a'; ctx.fillRect(o.x, o.y, o.w, 6);
      break;
    case 'rock': {
      // A boulder: its outline, a lit upper face, and a cap of snow up high.
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const shape = (dx, dy, k) => {
        ctx.beginPath();
        o.poly.forEach(([px, py], i) => (i ? ctx.lineTo(cx + dx + px * k, cy + dy + py * k) : ctx.moveTo(cx + dx + px * k, cy + dy + py * k)));
        ctx.closePath();
      };
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; shape(7, 9, 1); ctx.fill();
      ctx.fillStyle = o.snowy ? '#5e5e68' : '#645c52'; shape(0, 0, 1); ctx.fill();
      ctx.fillStyle = o.snowy ? '#7c7c88' : '#857c6e'; shape(-o.w * 0.08, -o.h * 0.12, 0.72); ctx.fill();
      ctx.fillStyle = o.snowy ? '#9a9aa6' : '#a0978a'; shape(-o.w * 0.14, -o.h * 0.2, 0.36); ctx.fill();
      if (o.snowy) { ctx.fillStyle = 'rgba(236,242,250,0.95)'; shape(-o.w * 0.06, -o.h * 0.24, 0.55); ctx.fill(); }
      break;
    }
    case 'ruin':
      ctx.fillStyle = '#5a5452'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      for (let x = o.x + 22; x < o.x + o.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); ctx.stroke(); }
      for (let y = o.y + 22; y < o.y + o.h; y += 22) { ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke(); }
      ctx.fillStyle = '#7a7470'; ctx.fillRect(o.x, o.y, o.w, 4);
      break;
    case 'gate':
      ctx.strokeStyle = '#5a5e66'; ctx.lineWidth = 4;
      for (let y = o.y + 8; y < o.y + o.h; y += 16) { ctx.beginPath(); ctx.moveTo(o.x - 4, y); ctx.lineTo(o.x + o.w + 4, y); ctx.stroke(); }
      ctx.strokeStyle = '#3a3e46';
      ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x + o.w / 2, o.y + o.h); ctx.stroke();
      break;
    case 'bramble':
      ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 2;
      for (let k = 0; k < 12; k++) {
        const y = o.y + (k / 12) * o.h;
        ctx.beginPath(); ctx.moveTo(o.x - 8, y); ctx.quadraticCurveTo(o.x + o.w / 2, y + 12, o.x + o.w + 8, y + 3); ctx.stroke();
      }
      ctx.fillStyle = '#8a2a3a';
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(o.x + ((k * 11) % o.w), o.y + ((k * 13) % o.h), 1.5, 0, TAU); ctx.fill(); }
      break;
    case 'tree-wall':
      ctx.fillStyle = '#1a2a1e'; ctx.fillRect(o.x, o.y, o.w, o.h);
      break;
    default: break;
  }
}

function drawPoi(ctx, q, time) {
  const glow = (r, c, a) => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a; ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  };
  switch (q.kind) {
    case 'shrine': {
      ctx.fillStyle = '#5a5452'; roundRect(ctx, q.x - 26, q.y - 12, 52, 26, 5); ctx.fill();
      ctx.fillStyle = '#7a7470'; roundRect(ctx, q.x - 18, q.y - 20, 36, 14, 4); ctx.fill();
      const fl = 0.8 + Math.sin(time * 9) * 0.2;
      glow(q.lit ? 70 : 34, '#ff9a3d', q.lit ? 0.22 * fl : 0.08);
      ctx.fillStyle = q.lit ? '#ffd27a' : '#6a5a4a';
      ctx.beginPath(); ctx.ellipse(q.x, q.y - 26, 5, 9 * (q.lit ? fl : 0.5), 0, 0, TAU); ctx.fill();
      break;
    }
    case 'tower':
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(q.x - 22, q.y - 14, 52, 44);
      ctx.fillStyle = '#5a4030'; ctx.fillRect(q.x - 26, q.y - 26, 52, 52);
      ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.moveTo(q.x - 30, q.y - 26); ctx.lineTo(q.x, q.y - 50); ctx.lineTo(q.x + 30, q.y - 26); ctx.closePath(); ctx.fill();
      if (!q.done) glow(40 + Math.sin(time * 3) * 6, '#ffe08a', 0.12);
      break;
    case 'chest':
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(q.x - 14, q.y - 4, 32, 16);
      ctx.fillStyle = q.done ? '#5a4030' : '#8a5a2a'; ctx.fillRect(q.x - 16, q.y - 10, 32, 20);
      ctx.fillStyle = '#c9a23a'; ctx.fillRect(q.x - 16, q.y - 2, 32, 3); ctx.fillRect(q.x - 2, q.y - 6, 4, 8);
      if (!q.done) glow(26 + Math.sin(time * 4) * 3, '#ffd45e', 0.12);
      break;
    case 'heart':
      if (q.done) break;
      glow(18, '#ff5e7a', 0.2 + Math.sin(time * 5) * 0.1);
      ctx.fillStyle = '#ff7a8a';
      ctx.beginPath(); ctx.arc(q.x - 4, q.y - 3 + Math.sin(time * 3) * 2, 5, 0, TAU); ctx.arc(q.x + 4, q.y - 3 + Math.sin(time * 3) * 2, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(q.x - 9, q.y - 1); ctx.lineTo(q.x, q.y + 9); ctx.lineTo(q.x + 9, q.y - 1); ctx.closePath(); ctx.fill();
      break;
    case 'lore':
      ctx.fillStyle = '#4a4648'; roundRect(ctx, q.x - 12, q.y - 30, 24, 36, 8); ctx.fill();
      glow(10, '#9fe8ff', 0.3 + Math.sin(time * 2) * 0.15);
      break;
    case 'lever':
      ctx.fillStyle = '#4a4648'; ctx.fillRect(q.x - 10, q.y - 4, 20, 10);
      ctx.strokeStyle = '#a0a4ac'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + (q.done ? 12 : -12), q.y - 18); ctx.stroke();
      break;
    case 'camp': {
      if (q.cleared) { ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(q.x, q.y, 12, 0, TAU); ctx.fill(); break; }
      const fl = 0.7 + Math.sin(time * 11) * 0.2 + Math.sin(time * 17) * 0.1;
      glow(60 * fl, '#ff7a2a', 0.18);
      ctx.fillStyle = '#3a2a1c'; ctx.fillRect(q.x - 12, q.y - 2, 24, 5);
      ctx.fillStyle = '#ffae5a'; ctx.beginPath(); ctx.ellipse(q.x, q.y - 6, 6, 10 * fl, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'gate': {
      // A stone arch with a portal turning in it; still and grey once conquered.
      ctx.strokeStyle = '#6a6462'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(q.x, q.y, 50, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = '#5a5452';
      ctx.fillRect(q.x - 58, q.y - 18, 14, 36); ctx.fillRect(q.x + 44, q.y - 18, 14, 36);
      if (!q.done) {
        const c = q.boss === 'croc' ? '#b5e05a' : '#ffb35e';
        glow(48, c, 0.18);
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.arc(q.x, q.y, 14 + k * 10, time * (2 + k) , time * (2 + k) + 4); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Standing in it: a ring filling as the gate takes hold of you.
        if (ow.gateT > 0 && dist(world.player.x, world.player.y, q.x, q.y) < 56) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(q.x, q.y, 56, -Math.PI / 2, -Math.PI / 2 + (ow.gateT / 1.2) * TAU); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '800 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(q.done ? `${q.name} — conquered` : q.name, q.x, q.y + 44);
      break;
    }
    default: break;
  }
}

/** Over everyone: tree canopies (see-through when you are under one) and leaves. */
export function drawOverworldAbove(ctx, time) {
  if (!ow) return;
  const p = world.player;
  // Tall grass in front of whoever stands in it: waist-deep.
  if (p && !p.dead) ow.grass.drawFront(ctx, time, p);
  for (const e of world.enemies) {
    if (!e.dead && !e.z && inView(e.x, e.y, 20)) ow.grass.drawFront(ctx, time, e);
  }
  for (const t of ow.trees) {
    if (!inView(t.x, t.y, 90)) continue;
    const under = p && dist(p.x, p.y, t.x, t.y - 10) < t.r;
    const sway = Math.sin(time * 0.9 + t.sway) * 2;
    ctx.globalAlpha = under ? 0.35 : 1;
    if (t.pine) { drawPine(ctx, t, sway); continue; }
    const base = 40 + t.shade;
    ctx.fillStyle = `rgb(${base - 14},${base + 26},${base - 6})`;
    ctx.beginPath(); ctx.arc(t.x + sway, t.y - 16, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgb(${base - 4},${base + 42},${base + 4})`;
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.25 + sway, t.y - 22 - t.r * 0.2, t.r * 0.65, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(160,200,120,0.18)`;
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.35 + sway, t.y - 28 - t.r * 0.3, t.r * 0.3, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const l of ow.leaves) {
    ctx.globalAlpha = Math.min(1, (l.life - l.t)) * 0.8;
    if (l.snow) {
      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath(); ctx.arc(l.x, l.y, l.s, 0, TAU); ctx.fill();
      continue;
    }
    ctx.fillStyle = l.c;
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot);
    ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // The land's light over everything (not the HUD).
  const [gr, gg, gb, ga] = ow.grade;
  ctx.fillStyle = `rgba(${gr | 0},${gg | 0},${gb | 0},${ga.toFixed(3)})`;
  ctx.fillRect(camera.x - 20, camera.y - 20, view.w + 40, view.h + 40);
}

/** A snow pine: three tiers of dark needles, each with snow on its shoulders. */
function drawPine(ctx, t, sway) {
  for (let k = 0; k < 3; k++) {
    const w = t.r * (0.95 - k * 0.24), base = t.y - 4 - k * t.r * 0.42, top = base - t.r * 0.85;
    const x = t.x + sway * (0.5 + k * 0.3);
    ctx.fillStyle = k === 0 ? '#1f3530' : k === 1 ? '#264038' : '#2d4a40';
    ctx.beginPath(); ctx.moveTo(x - w, base); ctx.lineTo(x + w, base); ctx.lineTo(x, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(234,240,248,0.92)';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55, base - t.r * 0.3); ctx.lineTo(x, top);
    ctx.lineTo(x + w * 0.3, base - t.r * 0.42); ctx.lineTo(x + w * 0.05, base - t.r * 0.33);
    ctx.closePath(); ctx.fill();
  }
}

/** The minimap: what you've seen of the region, its landmarks, and you. */
export function drawOverworldMap(ctx) {
  if (!ow || !world.player) return;
  const mw = 190, mh = Math.round(mw * OW.H / OW.W);
  const x = view.w - mw - 18, y = 64;
  const s = mw / OW.W;
  ctx.fillStyle = 'rgba(8,6,13,0.72)';
  roundRect(ctx, x - 4, y - 4, mw + 8, mh + 8, 8); ctx.fill();
  // Revealed land, tinted by region.
  for (let j = 0; j < ow.fogH; j++) {
    for (let i = 0; i < ow.fogW; i++) {
      if (!ow.fog[j * ow.fogW + i]) continue;
      ctx.fillStyle = `rgb(${TERRAIN_RGB[ow.terrain.typeAt(i * FOG + FOG / 2, j * FOG + FOG / 2)]})`;
      ctx.fillRect(x + i * FOG * s, y + j * FOG * s, FOG * s + 0.6, FOG * s + 0.6);
    }
  }
  // Water and ledges you've seen.
  for (const o of ow.obstacles) {
    if (o.kind !== 'water' && o.kind !== 'gap' && o.kind !== 'ledge') continue;
    const fi = Math.floor((o.x + o.w / 2) / FOG) + Math.floor((o.y + o.h / 2) / FOG) * ow.fogW;
    if (!ow.fog[fi]) continue;
    ctx.fillStyle = o.kind === 'ledge' ? '#8a7a64' : '#2a5a70';
    ctx.fillRect(x + o.x * s, y + o.y * s, Math.max(1.5, o.w * s), Math.max(1.5, o.h * s));
  }
  // Landmarks.
  const icon = { shrine: '#ffb35e', tower: '#ffe08a', chest: '#ffd45e', gate: '#ff6b6b', camp: '#ff8a4a', lore: '#9fe8ff', heart: '#ff7a8a', lever: '#c0c4cc' };
  for (const q of ow.pois) {
    if (!q.seen || q.hidden || !icon[q.kind] || (q.done && (q.kind === 'chest' || q.kind === 'heart'))) continue;
    if (q.kind === 'camp' && q.cleared) continue;
    ctx.fillStyle = icon[q.kind];
    const px = x + q.x * s, py = y + q.y * s;
    if (q.kind === 'gate') { ctx.fillRect(px - 3, py - 3, 6, 6); }
    else { ctx.beginPath(); ctx.arc(px, py, q.kind === 'shrine' || q.kind === 'tower' ? 3 : 2.2, 0, TAU); ctx.fill(); }
  }
  // You, pointing where you face.
  const p = world.player;
  const px = x + p.x * s, py = y + p.y * s;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(p.aimAngle) * 5, py + Math.sin(p.aimAngle) * 5);
  ctx.lineTo(px + Math.cos(p.aimAngle + 2.4) * 4, py + Math.sin(p.aimAngle + 2.4) * 4);
  ctx.lineTo(px + Math.cos(p.aimAngle - 2.4) * 4, py + Math.sin(p.aimAngle - 2.4) * 4);
  ctx.closePath(); ctx.fill();
  // The view rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + camera.x * s, y + camera.y * s, view.w * s, view.h * s);
  // Hearts found.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '700 10px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`hearts ${ow.hearts % 4}/4 · secrets ${ow.secrets}`, x, y + mh + 14);
}
