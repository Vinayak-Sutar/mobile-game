// GROUND, INSTEAD OF A TILED SHEET.
//
// A chamber used to be one repeating texture stretched over the whole arena,
// four rounded rectangles, and a rotating sigil in the middle. Four biomes
// meant four recolours of the same flat sheet. You could not tell chamber 3
// from chamber 30, and nothing in the room looked like a place.
//
// So a chamber is now composed, the way a corner of an open world is:
//
//   soil        the ground under everything
//   patches     three to six organic areas of a second and third material,
//               with wobbly edges - grass over dirt, moss over stone
//   detail      pebbles, cracks, twigs, fallen petals, scattered by hand
//   tufts       grass blades, thick inside the grass, thinning at its edge
//   verge       undergrowth crowding the arena's border, so the boundary is
//               a thicket you would not walk into rather than a drawn line
//
// All five are BAKED ONCE into an offscreen canvas and blitted each frame, so
// a chamber costs one drawImage no matter how much is in it. Only the props -
// bushes, boulders, stumps - are drawn live, because they need to sit in the
// depth sort with the player and cast moving shadows.
//
// SEEDED BY DEPTH, deliberately. Resume a journey at chamber 17 and it is the
// same chamber 17 you left; walk back through a loop and the place is where
// you remember it. A random layout every visit would make the world feel like
// a screensaver.
//
// The biome is now a PALETTE rather than a place. It tints soil, grass and
// stone, and the chamber plan decides what is actually growing there.

import { arena, world } from './state.js';
import { TAU, clamp } from './util.js';
import { mulberry } from './terrain.js';
import { drawTreeOf, drawTreeBase, drawDecor } from './wilds-draw.js';

// --- chamber plans ----------------------------------------------------------
//
// What kind of place this chamber is. A plan is only a recipe: proportions of
// ground, how much grows, and how the props are laid out. The fight is not
// changed by any of it - obstacle count and the clear centre are still decided
// by rooms.js, so a plan cannot quietly alter difficulty.

export const PLANS = [
  {
    id: 'meadow', name: 'open grass',
    base: 'grass', ground: { dirt: 0.22, stone: 0.05 },
    tufts: 1.0, detail: 0.7, verge: 'grass',
    props: ['bush', 'bush', 'bush', 'rock'], layout: 'scatter',
    trees: ['blossom', 'dark'], treeN: 5,
    decals: ['flowers', 'flowers', 'pebbles'], decalN: 14,
  },
  {
    id: 'sakura', name: 'a sakura grove',
    base: 'grass', ground: { dirt: 0.1, stone: 0.03 },
    tufts: 0.9, detail: 0.5, verge: 'grass',
    props: ['bush', 'stump', 'rock'], layout: 'scatter',
    trees: ['sakura', 'sakura', 'blossom'], treeN: 9,
    decals: ['petalbed', 'petalbed', 'flowers'], decalN: 12,
    air: 'sakura',
  },
  {
    id: 'pinewood', name: 'a stand of pines',
    base: 'grass', ground: { dirt: 0.3, stone: 0.08 },
    tufts: 0.6, detail: 0.9, verge: 'grass',
    props: ['stump', 'rock', 'bush'], layout: 'clusters',
    trees: ['pine', 'pine', 'cypress'], treeN: 11, snowy: false,
    decals: ['shrooms', 'pebbles', 'stump'], decalN: 12,
  },
  {
    id: 'rocks', name: 'broken stone',
    base: 'stone', ground: { dirt: 0.3, grass: 0.26 },
    tufts: 0.4, detail: 1.0, verge: 'rock',
    props: ['rock', 'rock', 'rock', 'bush'], layout: 'clusters',
    trees: ['dead', 'cypress'], treeN: 4,
    decals: ['pebbles', 'pebbles', 'fissure', 'stone'], decalN: 18,
  },
  {
    id: 'ruins', name: 'old walls',
    base: 'stone', ground: { dirt: 0.34, grass: 0.3 },
    tufts: 0.7, detail: 1.0, verge: 'rock',
    props: ['rock', 'stump', 'bush'], layout: 'ring',
    trees: ['dark', 'dead'], treeN: 5,
    decals: ['pebbles', 'web', 'stone', 'flowers'], decalN: 16,
    air: 'dust',
  },
  {
    id: 'road', name: 'an old road',
    base: 'grass', ground: { dirt: 0.14, stone: 0.06 },
    tufts: 0.9, detail: 0.7, verge: 'grass',
    props: ['bush', 'rock', 'bush'], layout: 'flanks',
    trees: ['cypress', 'cypress', 'dark'], treeN: 8,
    decals: ['flowers', 'pebbles'], decalN: 12,
    road: true,
  },
  {
    id: 'marsh', name: 'wet ground',
    base: 'grass', ground: { dirt: 0.4, stone: 0.03 },
    tufts: 1.1, detail: 0.5, verge: 'reed',
    props: ['reeds', 'bush', 'reeds'], layout: 'scatter',
    trees: ['dead', 'palm'], treeN: 5,
    decals: ['reeds', 'reeds', 'shrooms', 'shell'], decalN: 16,
    pools: true, air: 'mist',
  },
  {
    id: 'graves', name: 'a burial ground',
    base: 'grass', ground: { dirt: 0.38, stone: 0.12 },
    tufts: 0.6, detail: 0.9, verge: 'grass',
    props: ['rock', 'stump', 'bush'], layout: 'ring',
    trees: ['dead', 'dead', 'cypress'], treeN: 7,
    decals: ['grave', 'grave', 'skull', 'web'], decalN: 14,
    air: 'mist',
  },
  {
    id: 'burnt', name: 'burnt over',
    base: 'dirt', ground: { stone: 0.16, grass: 0.12 },
    tufts: 0.3, detail: 1.1, verge: 'rock',
    props: ['stump', 'rock', 'stump'], layout: 'clusters',
    trees: ['dead', 'dead'], treeN: 8,
    decals: ['ember', 'ember', 'fissure', 'skull'], decalN: 16,
    ash: true, air: 'ash',
  },
  {
    id: 'dunes', name: 'dry country',
    base: 'dirt', ground: { stone: 0.22, grass: 0.06 },
    tufts: 0.25, detail: 0.8, verge: 'rock',
    props: ['rock', 'rock', 'bush'], layout: 'scatter',
    trees: ['palm', 'dead'], treeN: 4,
    decals: ['pebbles', 'skull', 'shell', 'fissure'], decalN: 16,
    air: 'dust',
  },
];

/**
 * Which plan a chamber is, from its position in the rotation.
 *
 * Walked through the list rather than drawn at random, so consecutive chambers
 * are never the same place twice and a run shows you all of them. The offset
 * per loop keeps a second lap from repeating the first in the same order.
 *
 * `index` counts only the chambers that USE a plan. Guardians paint their own
 * arenas over the ground, so counting them would have spent two of the seven
 * plans on rooms where they are never visible - `rocks` and `marsh` landed on
 * chambers 3 and 6, which are both guardians, and could not be seen at all.
 */
export function planFor(index, loop = 0) {
  const i = (((index + loop * 3) % PLANS.length) + PLANS.length) % PLANS.length;
  return PLANS[i];
}

// --- palette ----------------------------------------------------------------

/** Ground colours, tinted by the biome but still reading as earth. */
function palette(biome) {
  const h = biome.floor.hue;
  // Grass keeps its own hue and barely leans towards the biome's. At 0.3 it
  // bent far enough that Emberfall grew brown grass and Frostwake blue.
  const gh = 96 + (h - 96) * 0.16;
  return {
    soil:    `hsl(${h}, 18%, 17%)`,
    soilHi:  `hsl(${h}, 20%, 21%)`,
    dirt:    `hsl(${(h + 14) % 360}, 15%, 25%)`,
    stone:   `hsl(${h}, 10%, 29%)`,
    stoneHi: `hsl(${h}, 9%, 37%)`,
    grass:   `hsl(${gh}, 30%, 26%)`,
    grassHi: `hsl(${gh}, 36%, 33%)`,
    blade:   `hsl(${gh}, 42%, 42%)`,
    bladeHi: `hsl(${gh}, 50%, 52%)`,
    water:   `hsl(${(h + 150) % 360}, 34%, 26%)`,
  };
}

// --- shapes -----------------------------------------------------------------

/**
 * A closed wobbly blob, drawn with curves.
 *
 * The first version joined the points with lineTo and every patch of ground
 * came out as an angular slab - paper cut-outs, not earth. Ground has no
 * straight edges in it anywhere, so the points are now smoothed through their
 * midpoints, which costs nothing and is the whole difference.
 */
function blob(ctx, x, y, r, rng, wobble = 0.34, points = 11) {
  const px = [];
  const py = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const rr = r * (1 - wobble + rng() * wobble * 2);
    px.push(x + Math.cos(a) * rr);
    py.push(y + Math.sin(a) * rr * 0.72);          // flattened: seen from above
  }
  ctx.beginPath();
  ctx.moveTo((px[0] + px[points - 1]) / 2, (py[0] + py[points - 1]) / 2);
  for (let i = 0; i < points; i++) {
    const n = (i + 1) % points;
    ctx.quadraticCurveTo(px[i], py[i], (px[i] + px[n]) / 2, (py[i] + py[n]) / 2);
  }
  ctx.closePath();
}

/** A clump of grass blades. The one shape that sells "this is ground". */
function tuft(ctx, x, y, h, rng, colour) {
  const n = 3 + ((rng() * 3) | 0);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const ox = x + (rng() - 0.5) * h * 0.9;
    const lean = (rng() - 0.5) * h * 0.75;
    const hh = h * (0.6 + rng() * 0.7);
    ctx.moveTo(ox, y);
    ctx.quadraticCurveTo(ox + lean * 0.3, y - hh * 0.6, ox + lean, y - hh);
  }
  ctx.stroke();
}

// --- the bake ---------------------------------------------------------------

let cache = null;   // { key, canvas }

function bakeGround(w, h, biome, plan, seed) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  const g = cv.getContext('2d');
  const rng = mulberry(seed);
  const P = palette(biome);
  const area = w * h;

  // 1. the ground this chamber IS, with a slow mottle so it is never flat.
  const baseCol = plan.base === 'stone' ? P.stone : plan.base === 'dirt' ? P.dirt : P.grass;
  const baseHi = plan.base === 'stone' ? P.stoneHi : plan.base === 'dirt' ? P.soilHi : P.grassHi;
  g.fillStyle = baseCol;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.45;
  g.fillStyle = baseHi;
  for (let i = 0; i < 26; i++) {
    blob(g, rng() * w, rng() * h, 60 + rng() * 150, rng, 0.45);
    g.fill();
  }
  g.globalAlpha = 1;

  // 2. patches. Grass is laid as several overlapping blobs rather than one
  //    big shape, which is what gives it a ragged, grown edge.
  const patch = (colour, coverage, spread) => {
    if (coverage <= 0) return;
    g.fillStyle = colour;
    const n = Math.round(coverage * 22);
    for (let i = 0; i < n; i++) {
      const cx = rng() * w;
      const cy = rng() * h;
      const r = spread * (0.5 + rng());
      blob(g, cx, cy, r, rng, 0.4);
      g.fill();
      // A couple of satellites, so a patch frays instead of stopping dead.
      for (let k = 0; k < 2; k++) {
        blob(g, cx + (rng() - 0.5) * r * 2.4, cy + (rng() - 0.5) * r * 1.8,
          r * (0.25 + rng() * 0.3), rng, 0.5);
        g.fill();
      }
    }
  };
  patch(P.dirt, plan.ground.dirt || 0, Math.sqrt(area) * 0.075);
  patch(P.stone, plan.ground.stone || 0, Math.sqrt(area) * 0.055);
  patch(P.grass, plan.ground.grass || 0, Math.sqrt(area) * 0.09);

  // A lighter crown on the grass, offset upward: grass catches the light on
  // its top edge, and that one offset is most of what makes it read as grass.
  g.globalAlpha = 0.5;
  g.fillStyle = P.grassHi;
  const grassiness = plan.base === 'grass' ? 1 : (plan.ground.grass || 0);
  const crowns = Math.round(grassiness * 20);
  for (let i = 0; i < crowns; i++) {
    blob(g, rng() * w, rng() * h - 3, Math.sqrt(area) * 0.055 * (0.5 + rng()), rng, 0.45);
    g.fill();
  }
  g.globalAlpha = 1;

  // 3. a road, if the plan has one: a worn dirt band with soft edges.
  if (plan.road) {
    const y0 = h * (0.3 + rng() * 0.4);
    g.strokeStyle = P.dirt;
    g.lineCap = 'round';
    for (const [width, alpha] of [[h * 0.22, 1], [h * 0.15, 1]]) {
      g.globalAlpha = alpha;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(-20, y0 + (rng() - 0.5) * 40);
      g.bezierCurveTo(w * 0.3, y0 - h * 0.12, w * 0.7, y0 + h * 0.12, w + 20, y0 + (rng() - 0.5) * 40);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // 4. pools, if the plan is wet. Dark water with a pale rim.
  if (plan.pools) {
    for (let i = 0; i < 3; i++) {
      const px = w * (0.15 + rng() * 0.7);
      const py = h * (0.15 + rng() * 0.7);
      const pr = Math.sqrt(area) * (0.035 + rng() * 0.03);
      g.fillStyle = P.water;
      blob(g, px, py, pr, rng, 0.3);
      g.fill();
      g.strokeStyle = P.grassHi;
      g.globalAlpha = 0.5;
      g.lineWidth = 2;
      blob(g, px, py, pr * 1.06, rng, 0.3);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  // 5. detail: pebbles, cracks, twigs. Small, many, and the thing that stops
  //    the middle distance reading as empty paint.
  const bits = Math.round(area / 2600 * plan.detail);
  for (let i = 0; i < bits; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rng();
    if (r < 0.5) {
      g.fillStyle = P.stoneHi;
      g.globalAlpha = 0.2 + rng() * 0.3;
      g.beginPath();
      g.ellipse(x, y, 1.2 + rng() * 2.6, 1 + rng() * 1.8, rng() * TAU, 0, TAU);
      g.fill();
    } else if (r < 0.78) {
      g.strokeStyle = P.soil;
      g.globalAlpha = 0.5;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rng() - 0.5) * 22, y + (rng() - 0.5) * 12);
      g.stroke();
    } else {
      g.fillStyle = plan.ash ? '#3a3a40' : P.blade;
      g.globalAlpha = 0.25 + rng() * 0.3;
      g.beginPath();
      g.ellipse(x, y, 1 + rng() * 2, 0.8 + rng(), rng() * TAU, 0, TAU);
      g.fill();
    }
  }
  g.globalAlpha = 1;

  // 6. tufts. Density follows the grass, so they cluster where grass is and
  //    thin out over dirt and stone - sampling the baked pixels would be
  //    exact but costs a readback, and a second noise field is close enough
  //    to look deliberate.
  const tufts = Math.round(area / 1700 * plan.tufts);
  const trng = mulberry(seed + 977);
  for (let i = 0; i < tufts; i++) {
    const x = trng() * w;
    const y = trng() * h;
    // Thin them near the middle: the player starts there and it must stay readable.
    const dx = (x - w / 2) / (w / 2);
    const dy = (y - h / 2) / (h / 2);
    if (dx * dx + dy * dy < 0.1 && trng() < 0.7) continue;
    g.globalAlpha = 0.55 + trng() * 0.4;
    tuft(g, x, y, 4 + trng() * 6, trng, trng() < 0.3 ? P.bladeHi : P.blade);
  }
  g.globalAlpha = 1;

  // 7. the verge. Undergrowth crowds the border so the arena ends in a
  //    thicket rather than at a stroked rectangle. The wall band that used to
  //    draw that rectangle is gone.
  const edge = Math.min(w, h) * 0.10;
  const vrng = mulberry(seed + 4231);
  const vergeColour = plan.verge === 'rock' ? P.stone : plan.verge === 'reed' ? P.grass : P.grass;
  g.fillStyle = vergeColour;
  const along = (len, place) => {
    const step = 16;
    for (let d = -step; d < len + step; d += step * (0.5 + vrng())) {
      const depth = edge * (0.45 + vrng() * 0.9);
      const [bx, by] = place(d);
      blob(g, bx, by, depth, vrng, 0.42, 8);
      g.fill();
    }
  };
  along(w, (d) => [d, 0]);
  along(w, (d) => [d, h]);
  along(h, (d) => [0, d]);
  along(h, (d) => [w, d]);

  // Darkened right at the border, so the eye reads depth rather than a cut.
  const vg = g.createLinearGradient(0, 0, 0, edge * 1.6);
  vg.addColorStop(0, 'rgba(0,0,0,0.55)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, edge * 1.6);

  // And blades along the verge, so the thicket has texture too.
  const vt = Math.round((w + h) / 9);
  for (let i = 0; i < vt; i++) {
    const side = (vrng() * 4) | 0;
    const t = vrng();
    const inset = vrng() * edge;
    const x = side === 0 || side === 1 ? t * w : (side === 2 ? inset : w - inset);
    const y = side === 0 ? inset : side === 1 ? h - inset : t * h;
    g.globalAlpha = 0.5 + vrng() * 0.4;
    tuft(g, x, y, 8 + vrng() * 11, vrng, vrng() < 0.35 ? P.bladeHi : P.blade);
  }
  g.globalAlpha = 1;

  return cv;
}

/**
 * Draw the chamber's ground. One drawImage in the common case.
 *
 * Rebaked when the chamber, the biome or the arena size changes - the last of
 * those matters because a phone's arena changes shape when the URL bar
 * collapses or the thing is rotated.
 */
export function drawChamberGround(ctx, room, biome) {
  const w = arena.w;
  const h = arena.h;
  if (w < 2 || h < 2) return;
  const depth = room ? room.depth : 1;
  const loop = room ? room.loop || 0 : 0;
  const plan = (room && room.plan) || planFor(depth, loop);
  const key = `${plan.id}|${biome.id}|${depth}|${loop}|${Math.round(w)}x${Math.round(h)}`;

  if (!cache || cache.key !== key) {
    try {
      cache = { key, canvas: bakeGround(w, h, biome, plan, depth * 7919 + loop * 104729 + 13) };
    } catch {
      cache = null;                       // no canvas: fall back to a flat fill
    }
  }
  if (cache) ctx.drawImage(cache.canvas, arena.x, arena.y);
  else {
    ctx.fillStyle = palette(biome).soil;
    ctx.fillRect(arena.x, arena.y, w, h);
  }
}

/** Thrown away when the arena resizes, so the next frame rebakes. */
export function clearGroundCache() { cache = null; }

// --- props ------------------------------------------------------------------
//
// What the obstacle rectangles look like. The rectangle is still the collision
// shape - gameplay is untouched - but it is now wearing a bush.

/**
 * Give each obstacle a kind, from the plan's list.
 *
 * Seeded by the chamber so the same rock is the same rock on a resume.
 */
export function dressObstacles(room) {
  const plan = room.plan || planFor(room.depth, room.loop || 0);
  const rng = mulberry(room.depth * 31 + (room.loop || 0) * 17 + 5);
  for (const o of room.obstacles) {
    if (o.crate) continue;                       // Vesper's arena brings its own
    o.kind = plan.props[(rng() * plan.props.length) | 0];
    o.seed = (rng() * 1e6) | 0;
  }
}

/**
 * Furnish a chamber from the open world's own vocabulary.
 *
 * The Wilds has seven kinds of tree and twenty kinds of ground decoration -
 * sakura, pines, graves, mushrooms, embers, fissures, petal beds - and the
 * chambers were drawing none of them. They were blobs, tufts and four props,
 * which is why every chamber looked like every other chamber.
 *
 * Trees stay out of the middle and off the fighting floor: they ring the
 * verge, where they frame the room without standing in a fight. They are
 * decoration only - collision is still the obstacle rectangles, so nothing
 * here can change how a room plays.
 */
export function furnish(room) {
  const plan = room.plan || planFor(room.depth, room.loop || 0);
  const rng = mulberry(room.depth * 2017 + (room.loop || 0) * 613 + 71);
  const b = { l: arena.x, t: arena.y, r: arena.x + arena.w, b: arena.y + arena.h };
  const cx = (b.l + b.r) / 2;
  const cy = (b.t + b.b) / 2;
  const open = Math.min(arena.w, arena.h) * 0.34;      // the floor a fight needs

  room.trees = [];
  for (let i = 0; i < (plan.treeN || 0); i++) {
    // Pushed to the edges: pick a point, then shove it outward until it is
    // clear of the open floor. A tree in the middle of an arena is an
    // obstacle you cannot walk round and did not agree to.
    let x = b.l + rng() * arena.w;
    let y = b.t + rng() * arena.h;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    if (d < open) {
      x = cx + (dx / d) * open * (1 + rng() * 0.5);
      y = cy + (dy / d) * open * (1 + rng() * 0.5);
    }
    room.trees.push({
      x: Math.max(b.l + 8, Math.min(b.r - 8, x)),
      y: Math.max(b.t + 20, Math.min(b.b - 6, y)),
      r: 24 + rng() * 26,
      kind: plan.trees[(rng() * plan.trees.length) | 0],
      sway: rng() * TAU,
      snowy: !!plan.snowy,
    });
  }
  // Drawn back to front, or a near tree sits behind a far one.
  room.trees.sort((p1, p2) => p1.y - p2.y);

  room.decor = [];
  for (let i = 0; i < (plan.decalN || 0); i++) {
    room.decor.push({
      t: plan.decals[(rng() * plan.decals.length) | 0],
      x: b.l + 20 + rng() * (arena.w - 40),
      y: b.t + 24 + rng() * (arena.h - 48),
      ph: rng() * TAU,
    });
  }
}

/** Ground decoration and tree trunks: under everything, including the player. */
export function drawChamberDecor(ctx, room, time) {
  if (!room) return;
  for (const d of room.decor || []) {
    try { drawDecor(ctx, d, time); } catch { /* one bad decal must not take the frame */ }
  }
  for (const t of room.trees || []) {
    try { drawTreeBase(ctx, t); } catch { /* same */ }
  }
}

/** Trees: over everything, so a canopy passes across the player as it does in the Wilds. */
export function drawChamberTrees(ctx, room, time) {
  if (!room || !room.trees) return;
  const p = world.player;
  for (const t of room.trees) {
    // Fade a canopy you are standing under, or it hides you.
    const under = p && Math.hypot(p.x - t.x, p.y - (t.y - 10)) < t.r;
    ctx.globalAlpha = under ? 0.4 : 1;
    try { drawTreeOf(ctx, t, time); } catch { /* same */ }
  }
  ctx.globalAlpha = 1;
}

/** One prop, drawn where its rectangle is. */
export function drawProp(ctx, o, biome, time) {
  const P = palette(biome);
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const r = Math.max(o.w, o.h) / 2;
  const rng = mulberry(o.seed || 1);

  // A cast shadow, always, because it is what puts a thing ON the ground
  // rather than painted over it.
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(cx + 5, cy + o.h * 0.34, o.w * 0.52, o.h * 0.26, 0, 0, TAU);
  ctx.fill();

  if (o.kind === 'rock') {
    // Two or three stones leaning together, lit from above-left.
    const n = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const sx = cx + (rng() - 0.5) * o.w * 0.5;
      const sy = cy + (rng() - 0.5) * o.h * 0.4;
      const sr = r * (0.45 + rng() * 0.4);
      ctx.fillStyle = P.stone;
      blob(ctx, sx, sy, sr, rng, 0.22, 9);
      ctx.fill();
      ctx.fillStyle = P.stoneHi;
      blob(ctx, sx - sr * 0.12, sy - sr * 0.22, sr * 0.62, rng, 0.24, 8);
      ctx.fill();
    }
    return;
  }

  if (o.kind === 'stump') {
    ctx.fillStyle = `hsl(${(biome.floor.hue + 24) % 360}, 24%, 14%)`;
    blob(ctx, cx, cy, r * 0.82, rng, 0.16, 10);
    ctx.fill();
    // The cut face, and rings on it.
    ctx.fillStyle = `hsl(${(biome.floor.hue + 30) % 360}, 26%, 26%)`;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.2, r * 0.62, r * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsl(${(biome.floor.hue + 30) % 360}, 22%, 18%)`;
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.2, r * 0.62 * (i / 3.6), r * 0.42 * (i / 3.6), 0, 0, TAU);
      ctx.stroke();
    }
    return;
  }

  if (o.kind === 'reeds') {
    ctx.fillStyle = P.water;
    ctx.beginPath();
    ctx.ellipse(cx, cy + o.h * 0.2, o.w * 0.5, o.h * 0.22, 0, 0, TAU);
    ctx.fill();
    const sway = Math.sin(time * 1.1 + (o.seed || 0)) * 3;
    for (let i = 0; i < 16; i++) {
      const x = cx + (rng() - 0.5) * o.w * 0.9;
      const y = cy + (rng() - 0.5) * o.h * 0.5 + o.h * 0.2;
      ctx.globalAlpha = 0.75 + rng() * 0.25;
      tuft(ctx, x + sway * (y - cy) / o.h, y, r * (0.7 + rng() * 0.7), rng, rng() < 0.4 ? P.bladeHi : P.blade);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // bush: layered blobs, dark underneath, lit on top, with a little sway.
  const sway = Math.sin(time * 0.8 + (o.seed || 0) * 0.01) * 1.6;
  const leaf = `hsl(${96 + (biome.floor.hue - 96) * 0.3}, 30%, 14%)`;
  const leafHi = `hsl(${96 + (biome.floor.hue - 96) * 0.3}, 38%, 24%)`;
  const leafTop = `hsl(${96 + (biome.floor.hue - 96) * 0.3}, 44%, 33%)`;
  for (const [tone, scale, lift] of [[leaf, 1, 0], [leafHi, 0.78, r * 0.2], [leafTop, 0.48, r * 0.36]]) {
    ctx.fillStyle = tone;
    const n = 3 + ((rng() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const bx = cx + (rng() - 0.5) * o.w * 0.62 + sway * (lift / Math.max(1, r));
      const by = cy + (rng() - 0.5) * o.h * 0.42 - lift;
      blob(ctx, bx, by, r * scale * (0.42 + rng() * 0.3), rng, 0.3, 9);
      ctx.fill();
    }
  }
}
