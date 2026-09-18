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

import { world, arena, camera, view } from './state.js';
import { TAU, clamp, rand, dist, roundRect } from './util.js';
import { burst, ring, damageText, shake } from './fx.js';
import { sfx } from './audio.js';
import { spawnPickup } from './spawn.js';

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

  // Silverback Ridge: a rock rim across the top, broken by the path.
  wall(obstacles, 600, 120, 560, 30, 'cliff');
  wall(obstacles, 1440, 120, 600, 30, 'cliff');

  // The hidden grove in the far north-east woods, walled by trees, entered
  // only through a bramble thicket.
  const grove = { x: 3380, y: 230 };
  wall(obstacles, 3150, 150, 26, 60, 'bramble', { hp: 5, id: 'bramble' });
  wall(obstacles, 3150, 90, 26, 60, 'tree-wall');
  wall(obstacles, 3150, 210, 26, 200, 'tree-wall');
  wall(obstacles, 3150, 400, 450, 26, 'tree-wall');

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
    const r = rand(34, 54);
    wall(obstacles, x - 12, y - 8, 24, 20, 'trunk');
    trees.push({ x, y, r, sway: rand(0, TAU), shade: rand(-8, 8), o: obstacles[obstacles.length - 1] });
  }

  // Ground decals: patches of ash and moss, grass tufts, flowers, stones.
  for (let k = 0; k < 520; k++) {
    const x = rand(0, OW.W), y = rand(0, OW.H);
    const z = zoneAt(x, y);
    const roll = Math.random();
    if (roll < 0.35) decals.push({ t: 'patch', x, y, rx: rand(30, 90), ry: rand(15, 45), rot: rand(0, TAU), c: z.id === 'quarry' ? '120,100,80' : z.id === 'woods' ? '40,80,48' : '110,110,100' });
    else if (roll < 0.8) decals.push({ t: 'grass', x, y, c: z.id === 'woods' ? '70,120,70' : z.id === 'quarry' ? '140,120,80' : '110,130,90' });
    else if (roll < 0.9) decals.push({ t: 'flower', x, y, c: ['230,140,60', '220,90,120', '240,230,180'][(Math.random() * 3) | 0] });
    else decals.push({ t: 'stone', x, y, r: rand(3, 7) });
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

  const fogW = Math.ceil(OW.W / FOG), fogH = Math.ceil(OW.H / FOG);
  return {
    obstacles, pois, decals, trees, roads, lanterns,
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

  // Leaves drifting in the woods, dust in the quarry.
  if (Math.random() < dt * 20) {
    const x = camera.x + rand(-40, view.w + 40), y = camera.y + rand(-40, view.h);
    const zz = zoneAt(x, y);
    if (zz.id === 'woods' || zz.id === 'meadow' || zz.id === 'quarry') ow.leaves.push({ x, y, t: 0, life: rand(3, 5), vx: rand(20, 45), vy: rand(10, 25), rot: rand(0, TAU), c: zz.id === 'quarry' ? '#9a8a70' : zz.id === 'woods' ? '#8aa040' : '#c8a060' });
  }
  for (let i = ow.leaves.length - 1; i >= 0; i--) {
    const l = ow.leaves[i];
    l.t += dt; l.x += (l.vx + Math.sin(l.t * 2) * 12) * dt; l.y += l.vy * dt; l.rot += dt * 2;
    if (l.t > l.life) ow.leaves.splice(i, 1);
  }
  if (ow.leaves.length > 60) ow.leaves.splice(0, ow.leaves.length - 60);
  return action;
}

// --- drawing (world space; game.js has already applied the camera) ------------------------

const inView = (x, y, pad = 80) => x > camera.x - pad && x < camera.x + view.w + pad && y > camera.y - pad && y < camera.y + view.h + pad;

export function drawOverworldBelow(ctx, time) {
  if (!ow) return;
  const cx = camera.x, cy = camera.y, vw = view.w, vh = view.h;

  // The land: each region's colour, blending where they meet.
  ctx.fillStyle = '#2c3230';
  ctx.fillRect(cx, cy, vw, vh);
  for (const z of ZONES) {
    if (z.x + z.r < cx || z.x - z.r > cx + vw || z.y + z.r < cy || z.y - z.r > cy + vh) continue;
    const g = ctx.createRadialGradient(z.x, z.y, z.r * 0.2, z.x, z.y, z.r);
    g.addColorStop(0, `rgba(${z.col},1)`);
    g.addColorStop(1, `rgba(${z.col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx, cy, vw, vh);
  }

  // Patches, grass, flowers, stones.
  for (const d of ow.decals) {
    if (!inView(d.x, d.y)) continue;
    if (d.t === 'patch') {
      ctx.fillStyle = `rgba(${d.c},0.18)`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, d.rot, 0, TAU); ctx.fill();
    } else if (d.t === 'grass') {
      ctx.strokeStyle = `rgba(${d.c},0.55)`;
      ctx.lineWidth = 1.4;
      const sway = Math.sin(time * 1.6 + d.x * 0.01) * 2;
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) { ctx.moveTo(d.x + k * 3, d.y); ctx.lineTo(d.x + k * 4 + sway, d.y - 8); }
      ctx.stroke();
    } else if (d.t === 'flower') {
      ctx.fillStyle = `rgba(${d.c},0.85)`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 2.2, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(d.x + 1, d.y + 1, d.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a665e';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
  }

  // Roads: packed earth, lighter down the middle.
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, c] of [[48, 'rgba(70,58,44,0.5)'], [26, 'rgba(110,94,70,0.35)']]) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    for (const r of ow.roads) {
      ctx.beginPath();
      r.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  // Water, ledges, cliffs, rocks, ruins, gates, brambles.
  for (const o of ow.obstacles) {
    if (!inView(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h))) continue;
    drawObstacle(ctx, o, time);
  }

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
    case 'rock':
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(ctx, o.x + 5, o.y + 7, o.w, o.h, 12); ctx.fill();
      ctx.fillStyle = '#6a6258'; roundRect(ctx, o.x, o.y, o.w, o.h, 12); ctx.fill();
      ctx.fillStyle = '#8a8276'; roundRect(ctx, o.x + 4, o.y + 3, o.w - 12, o.h * 0.4, 8); ctx.fill();
      break;
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
  for (const t of ow.trees) {
    if (!inView(t.x, t.y, 90)) continue;
    const under = p && dist(p.x, p.y, t.x, t.y - 10) < t.r;
    const sway = Math.sin(time * 0.9 + t.sway) * 2;
    ctx.globalAlpha = under ? 0.35 : 1;
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
    ctx.fillStyle = l.c;
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot);
    ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
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
      const z = zoneAt(i * FOG + FOG / 2, j * FOG + FOG / 2);
      ctx.fillStyle = `rgba(${z.col},0.95)`;
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
