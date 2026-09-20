// The demo's places, as data.
//
// The Ember Meadow is hand-authored rather than generated: it borrows Version
// 5's vocabulary - obstacle rectangles with a `kind`, the `raised` plateau
// description, a terrain `classify` function fed to createTerrain - but it is
// a small, deliberate area instead of a 3600x2400 region with a quest in it.
//
// Nothing here draws. It returns plain data; terrain3d, props3d and game3d turn
// it into a scene.

import { createTerrain, TT, fbm, vnoise } from '../../v5/src/terrain.js';
import { rand, dist, clamp } from '../../v5/src/util.js';
import { createHeights } from './heights.js';

const wall = (list, x, y, w, h, kind, extra = {}) => { list.push({ x, y, w, h, kind, ...extra }); };

/** The open area: a meadow under a rock ridge, with a pond and a ruined road. */
export function buildMeadow() {
  const W = 1600, H = 1200;
  const obstacles = [];
  const trees = [];
  const raised = { tops: [], faces: [], stairs: [], rims: [] };

  // --- the ridge across the north, with one staircase up it -------------------
  // Same shape as v5's plateaus: a top rectangle, a cliff face along its south
  // side split around the stairs, and sheer sides.
  const top = { x: 380, y: 90, w: 780, h: 300 };
  const faceH = 56;
  const stair = { x: 690, y: top.y + top.h - 8, w: 88, h: faceH + 8 };
  raised.tops.push(top);
  raised.stairs.push(stair);
  for (const seg of [[top.x, stair.x - top.x], [stair.x + stair.w, top.x + top.w - stair.x - stair.w]]) {
    if (seg[1] <= 0) continue;
    const f = { x: seg[0], y: top.y + top.h, w: seg[1], h: faceH };
    raised.faces.push(f);
    wall(obstacles, f.x, f.y, f.w, f.h, 'face', { ledge: true, low: true });
  }
  for (const rx of [top.x - 14, top.x + top.w]) {
    const r = { x: rx, y: 0, w: 14, h: top.y + top.h + faceH, vertical: true };
    raised.rims.push(r);
    wall(obstacles, r.x, r.y, r.w, r.h, 'rim');
  }

  // --- the pond in the south-east, with one channel to dash across ------------
  wall(obstacles, 980, 800, 300, 300, 'water', { low: true });
  wall(obstacles, 1380, 800, 190, 300, 'water', { low: true });
  wall(obstacles, 1280, 950, 100, 150, 'water', { low: true });
  wall(obstacles, 1280, 800, 100, 150, 'gap', { low: true, gap: true });

  // --- the ruined road west: broken walls to fight around ---------------------
  for (let k = 0; k < 5; k++) {
    wall(obstacles, 90 + rand(0, 90), 480 + k * 130 + rand(-20, 20), rand(70, 150), 26, 'ruin', { shadow: true });
  }

  // --- boulders ---------------------------------------------------------------
  const rockSpots = [[300, 700], [520, 900], [760, 620], [880, 980], [1180, 520], [640, 1080], [420, 430], [1000, 300]];
  for (const [bx, by] of rockSpots) {
    const w = rand(46, 84), h = rand(40, 70);
    const o = { x: bx - w / 2, y: by - h / 2, w, h, kind: 'rock', shadow: true, poly: [] };
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      o.poly.push([Math.cos(a) * (w / 2) * rand(0.86, 1.06), Math.sin(a) * (h / 2) * rand(0.86, 1.06)]);
    }
    obstacles.push(o);
  }

  // The player starts on the meadow's south road, looking north at the ridge.
  const spawn = { x: 800, y: 1000 };

  // --- the ground: which land lies where -------------------------------------
  const roads = [[[800, 1130], [790, 860], [760, 600], [742, 420]], [[80, 560], [420, 620], [742, 420]]];
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
  const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const classify = (x, y) => {
    if (raised.stairs.some((r) => inRect(r, x, y))) return TT.PAVE;
    if (raised.faces.some((r) => inRect(r, x, y)) || raised.rims.some((r) => inRect(r, x, y))) return TT.ROCK;
    for (const o of waters) {
      const dx = Math.max(o.x - x, 0, x - o.x - o.w), dy = Math.max(o.y - y, 0, y - o.y - o.h);
      if (dx * dx + dy * dy < 70 * 70) return TT.SAND;               // the shore
    }
    const m = fbm(x * 0.005, y * 0.005);
    // The ridge: snow on the crest, rock below it.
    if (y < top.y + top.h + faceH) return y < 240 + (m - 0.5) * 180 ? TT.SNOW : m > 0.55 ? TT.GRAVEL : TT.ROCK;
    if (x < 320 && y > 430 && y < 1150) return m > 0.45 ? TT.PAVE : TT.DIRT;     // the old road
    if (x > 980 && y > 700) return m > 0.62 ? TT.TALL : TT.GRASS;                 // the pond's meadow
    if (fbm(x * 0.006 + 11, y * 0.006 + 3) > 0.58) return TT.TALL;                // tall-grass patches
    return m > 0.72 ? TT.MOSS : TT.GRASS;
  };
  const terrain = createTerrain({ W, H, classify, roadDist: segDist, obstacles, raised });
  const heights = createHeights(raised, {
    top: 52,
    relief: (x, y) => {
      const t = terrain.typeAt(x, y);
      const rough = t === TT.ROCK || t === TT.GRAVEL ? 16 : t === TT.SNOW ? 10 : t === TT.SAND ? 4 : 7;
      return (fbm(x * 0.005, y * 0.005) - 0.5) * rough;
    },
  });

  // --- trees: a copse in the north-east, pines on the ridge -------------------
  let guard = 0;
  while (trees.length < 54 && guard++ < 900) {
    const x = rand(60, W - 60), y = rand(60, H - 60);
    const t = terrain.typeAt(x, y);
    if (t === TT.SAND || t === TT.PAVE) continue;
    if (segDist(x, y) < 60) continue;
    const copse = dist(x, y, 1320, 330) < 280;
    const onRidge = y < top.y + top.h;
    const want = copse ? 0.95 : onRidge ? 0.25 : 0.12;
    if (Math.random() > want) continue;
    if (dist(x, y, spawn.x, spawn.y) < 150) continue;
    if (trees.some((tr) => dist(tr.x, tr.y, x, y) < 70)) continue;
    if (obstacles.some((o) => x > o.x - 40 && x < o.x + o.w + 40 && y > o.y - 40 && y < o.y + o.h + 40)) continue;
    const r = rand(30, 52);
    wall(obstacles, x - 11, y - 8, 22, 18, 'trunk');
    trees.push({ x, y, r, sway: rand(0, Math.PI * 2), shade: rand(-8, 8), pine: onRidge || vnoise(x * 0.01, y * 0.01) > 0.62 });
  }

  return {
    name: 'The Ember Meadow', W, H, obstacles, raised, trees, terrain, heights, spawn, roads,
    // The simulation's "room": the sim only ever reads `obstacles` from it, and
    // the flags that stop v5's room logic from running (there is none here).
    room: {
      type: 'area', training: true, overworld: false, obstacles,
      waves: [], doors: [], doorsOpen: false, intro: 0, cleared: true,
    },
  };
}
