// Places: the Wilds' big designed fights.
//
// Each of the thirty PLACES in wilds-layout.js is a location built from a
// template - a fort, a village, a temple, a quarry, a war camp, a graveyard,
// a canyon pass, a ruined keep, a hedge garden - about 1500 to 2200 units
// across. A template lays down:
//   - WALLS (timber palisades, stone, hedges, iron fences), with gates;
//   - BUILDINGS (halls, houses, huts, tents, crypts) you walk round, whose
//     roofs fade when you are behind them;
//   - PROPS to fight round (crates, barrels, wagons, wells, statues, columns,
//     graves, stone blocks, a fountain) and decoration (campfires, banners);
//   - HEIGHT: watchtowers, a bell tower, temple and quarry terraces, canyon
//     ledges - plateaus like the world's own, with stairs - where the archers
//     stand;
//   - a FLOOR (paving, dirt, gravel, marble walks) painted into the ground;
//   - enemy GROUPS holding posts all through it, and a CHAMPION at its heart
//     beside the reliquary.
//
// Nothing about a place locks you in: its groups keep to their posts, you
// come and go as you like, and only the champion's duel ring closes.
//
// Places are planned before the world's ground is built (their towers and
// terraces are part of the raised ground). Each authored spot is moved, if it
// must be, to the nearest open ground: dry, clear of the world's cliffs and
// stairs, of lamps and of other places. Walls, buildings and towers never go
// across a road.

import { TAU } from './util.js';
import { mulberry } from './terrain.js';
import { WILDS, START, LAMPS, PLACES, LAIRS } from './wilds-layout.js';
import { buildLair, drawLairProp, drawLairDeco } from './wilds-lairs.js';

const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

// --- planning ----------------------------------------------------------------------------

/**
 * ctx: { waterAt(x, y), inChasm(x, y), plateaus (the world's own, as
 * [x, y, w, h, faceH, stairs]), roadSegs, regionAt(x, y) }.
 * Returns the places, each with obs (walls, buildings, props), plateaus,
 * floors, deco, groups, champ and relic.
 */
export function planPlaces(ctx) {
  // The world's own cliff faces and stairs: a place must not straddle them.
  const hard = [];
  for (const [x, y, w, h, fh] of ctx.plateaus) hard.push({ x: x - 40, y: y + h - 40, w: w + 80, h: fh + 80 });
  const roadNear = (x, y, pad) => ctx.roadSegs.some((g) => {
    const dx = g.bx - g.ax, dy = g.by - g.ay;
    const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (y - g.ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - (g.ax + dx * t), y - (g.ay + dy * t)) < pad;
  });
  const placed = [];

  const fits = (x, y, r) => {
    if (x < r + 300 || y < r + 300 || x > WILDS.W - r - 300 || y > WILDS.H - r - 300) return false;
    if (Math.hypot(x - START.x, y - START.y) < r + 700) return false;
    if (LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < r + 200)) return false;
    if (placed.some((q) => Math.hypot(x - q.x, y - q.y) < r + q.r + 250)) return false;
    if (hard.some((f) => f.x < x + r && f.x + f.w > x - r && f.y < y + r && f.y + f.h > y - r)) return false;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      for (const f of [1, 0.66, 0.33]) {
        const px = x + Math.cos(a) * r * f, py = y + Math.sin(a) * r * f;
        if (ctx.waterAt(px, py) || ctx.inChasm(px, py)) return false;
      }
    }
    return !ctx.waterAt(x, y);
  };

  // The lairs first, exactly where they are drawn: the places keep clear of them.
  for (const Lr of LAIRS) {
    const cy = Lr.y + Math.round(Lr.r * 0.55);
    const lair = {
      ...Lr, kind: 'lair', gx: Lr.x, gy: Lr.y, x: Lr.x, y: cy, moved: 0, beaten: false,
      region: ctx.regionAt(Lr.x, cy), obs: [], plateaus: [], floors: [], deco: [], groups: [], champ: null, relic: null,
    };
    build(lair, mulberry((WILDS.SEED ^ hashStr(Lr.id)) | 0), roadNear);
    placed.push(lair);
  }

  for (const P of PLACES) {
    // The authored spot, or the nearest spot that fits, spiralling out.
    let spot = null;
    for (let d = 0; d <= 3600 && !spot; d += 150) {
      const n = d === 0 ? 1 : Math.max(8, Math.round((TAU * d) / 300));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
        if (fits(x, y, P.r)) { spot = { x, y }; break; }
      }
    }
    if (!spot) continue;                       // nowhere near fits: leave it out
    const place = {
      ...P, x: Math.round(spot.x), y: Math.round(spot.y), moved: Math.round(Math.hypot(spot.x - P.x, spot.y - P.y)),
      region: ctx.regionAt(spot.x, spot.y), obs: [], plateaus: [], floors: [], deco: [], groups: [], champ: null, relic: null,
    };
    build(place, mulberry((WILDS.SEED ^ hashStr(P.id)) | 0), roadNear);
    placed.push(place);
  }
  return placed;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h;
}

// --- the builders -----------------------------------------------------------------------------

/**
 * The tools a template builds with, all writing into P: ob (any obstacle),
 * wall, building, prop, deco, floor, tower (raised ground with stairs; returns
 * where archers stand on it) and group (a post of enemies). Nothing but the
 * lairs' fronts may go across a road.
 */
export function makeKit(P, rng, roadNear) {
  const clearOfRoad = (x, y, w, h, pad = 60) => {
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]]) if (roadNear(px, py, pad + 20)) return false;
    // Along the long sides too, for long walls.
    const n = Math.ceil(Math.max(w, h) / 60);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      if (w >= h ? roadNear(x + w * f, y + h / 2, pad) : roadNear(x + w / 2, y + h * f, pad)) return false;
    }
    return true;
  };
  const ob = (x, y, w, h, kind, extra = {}) => {
    if (!extra.force && !clearOfRoad(x, y, w, h)) return null;
    const o = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), kind, place: P.id, ...extra };
    P.obs.push(o);
    return o;
  };
  const wall = (x0, y0, x1, y1, style, gaps = [], thick = 24) => {
    // An axis-aligned wall from (x0, y0) to (x1, y1) in 100-unit panels,
    // leaving out any panel whose middle falls in a gap [a, b] (along it).
    const horiz = Math.abs(y1 - y0) < Math.abs(x1 - x0);
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
    const n = Math.max(1, Math.round(len / 100));
    const step = len / n;
    for (let k = 0; k < n; k++) {
      const a = k * step, mid = a + step / 2;
      if (gaps.some(([g0, g1]) => mid > g0 && mid < g1)) continue;
      if (horiz) ob(Math.min(x0, x1) + a, y0 - thick / 2, step + 1, thick, 'wall', { style });
      else ob(x0 - thick / 2, Math.min(y0, y1) + a, thick, step + 1, 'wall', { style });
    }
  };
  const building = (x, y, w, h, style) => ob(x, y, w, h, 'building', { style, tint: rng() });
  const prop = (x, y, w, h, style) => ob(x - w / 2, y - h / 2, w, h, 'prop', { style, seed: rng() });
  const deco = (x, y, style) => P.deco.push({ x, y, style, ph: rng() * TAU });
  const floor = (x, y, w, h, style) => P.floors.push({ x, y, w, h, style });
  // A raised platform with stairs up its south face; returns where archers stand on it.
  const tower = (x, y, w, h, faceH = 46, stairW = 70) => {
    if (!clearOfRoad(x - 40, y - 40, w + 80, h + faceH + 80, 40)) return null;
    P.plateaus.push([Math.round(x), Math.round(y), w, h, faceH, [[Math.round(x + w / 2 - stairW / 2), stairW]]]);
    return { x: x + w / 2, y: y + h / 2 };
  };
  const group = (x, y, r, n, extra = {}) => P.groups.push({ x, y, r, n, ...extra });
  return { ob, wall, building, prop, deco, floor, tower, group };
}

function build(P, rng, roadNear) {
  const cx = P.x, cy = P.y;
  const K = makeKit(P, rng, roadNear);
  const { ob, wall, building, prop, deco, floor, tower, group } = K;

  const style = P.region.id;
  const hut = style === 'mire' || style === 'isle' || style === 'webwood' ? 'hut' : 'house';

  switch (P.kind) {
    case 'fort': {
      const S = 620;
      floor(cx - S, cy - S, 2 * S, 2 * S, 'dirt');
      wall(cx - S, cy - S, cx + S, cy - S, 'timber', [[S - 90, S + 90]]);
      wall(cx - S, cy + S, cx + S, cy + S, 'timber', [[S - 100, S + 100]]);
      wall(cx - S, cy - S, cx - S, cy + S, 'timber', [[S + 150, S + 260]]);
      wall(cx + S, cy - S, cx + S, cy + S, 'timber', [[S - 300, S - 190]]);
      const perches = [];
      for (const [tx, ty] of [[cx - S + 30, cy - S + 30], [cx + S - 170, cy - S + 30], [cx - S + 30, cy + S - 210], [cx + S - 170, cy + S - 210]]) {
        const t = tower(tx, ty, 140, 130);
        if (t) perches.push(t);
      }
      building(cx - 150, cy - S + 110, 300, 130, 'hall');
      for (const [bx, by] of [[cx - S + 220, cy - 170], [cx + S - 330, cy - 170], [cx - S + 220, cy + 170], [cx + S - 330, cy + 170]]) building(bx, by, 110, 80, 'tent');
      for (let k = 0; k < 8; k++) {
        const a = rng() * TAU, d = 150 + rng() * 300;
        prop(cx + Math.cos(a) * d, cy + 120 + Math.sin(a) * d * 0.5, rng() < 0.5 ? 34 : 28, rng() < 0.5 ? 30 : 28, rng() < 0.6 ? 'crate' : 'barrel');
      }
      deco(cx, cy + 40, 'fire');
      deco(cx - S + 100, cy + S - 30, 'banner'); deco(cx + S - 100, cy + S - 30, 'banner');
      group(cx, cy + S - 140, 280, 3);
      group(cx - 330, cy + 60, 260, 3);
      group(cx + 330, cy + 60, 260, 3);
      group(cx, cy - S + 330, 260, 3);
      if (perches.length) group(cx, cy, S, perches.length, { perches, ranged: true });
      P.champ = { x: cx, y: cy - 120 };
      P.relic = { x: cx, y: cy - 30 };
      break;
    }
    case 'village': {
      const R = P.r * 0.82;
      floor(cx - R, cy - 45, 2 * R, 90, 'pave');
      floor(cx - 45, cy - R, 90, 2 * R, 'pave');
      floor(cx - 170, cy - 170, 340, 340, 'pave');
      const lanes = [{ x: cx - R, y: cy - 70, w: 2 * R, h: 140 }, { x: cx - 70, y: cy - R, w: 140, h: 2 * R }, { x: cx - 200, y: cy - 200, w: 400, h: 400 }];
      const houses = [];
      for (const [qx, qy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        let built = 0;
        for (let k = 0; k < 14 && built < 3; k++) {
          const w = 150 + rng() * 70, h = 100 + rng() * 40;
          const x = cx + qx * (230 + rng() * (R - 450)) - w / 2, y = cy + qy * (200 + rng() * (R - 420)) - h / 2;
          const box = { x: x - 40, y: y - 60, w: w + 80, h: h + 110 };
          if (lanes.some((L) => L.x < box.x + box.w && L.x + L.w > box.x && L.y < box.y + box.h && L.y + L.h > box.y)) continue;
          if (houses.some((q) => q.x < box.x + box.w && q.x + q.w > box.x && q.y < box.y + box.h && q.y + q.h > box.y)) continue;
          if (building(x, y, w, h, hut)) { houses.push(box); built++; }
          if (rng() < 0.5) wall(x - 30, y + h + 40, x + w + 30, y + h + 40, 'fence', [], 12);
        }
      }
      prop(cx, cy, 40, 36, 'well');
      const t = tower(cx + 240, cy - 420, 150, 140);
      for (let k = 0; k < 6; k++) prop(cx + (rng() - 0.5) * R * 1.4, cy + (rng() - 0.5) * R * 1.4, 30, 28, rng() < 0.5 ? 'barrel' : 'crate');
      deco(cx - 120, cy + 120, 'fire');
      group(cx + R - 150, cy, 240, 3);
      group(cx - R + 150, cy, 240, 3);
      group(cx, cy + R - 150, 240, 3);
      group(cx, cy - R + 150, 240, 3);
      if (t) group(t.x, t.y, 180, 2, { perches: [t, { x: t.x + 30, y: t.y + 10 }], ranged: true });
      P.champ = { x: cx, y: cy + 80 };
      P.relic = { x: cx + 60, y: cy - 40 };
      break;
    }
    case 'temple': {
      // A stepped platform at the head of a colonnaded avenue.
      tower(cx - 420, cy - 360, 840, 520, 50, 170);
      const top = tower(cx - 220, cy - 300, 440, 250, 46, 120);
      floor(cx - 420, cy - 360, 840, 520, 'marble');
      floor(cx - 140, cy + 160, 280, 640, 'pave');
      for (let y = cy + 260; y < cy + 760; y += 110) { prop(cx - 190, y, 28, 28, 'column'); prop(cx + 190, y, 28, 28, 'column'); }
      prop(cx - 330, cy + 230, 40, 34, 'statue'); prop(cx + 330, cy + 230, 40, 34, 'statue');
      for (let k = -1; k <= 1; k += 2) { prop(cx + k * 330, cy - 250, 28, 28, 'column'); prop(cx + k * 330, cy - 60, 28, 28, 'column'); }
      deco(cx - 120, cy - 60, 'brazier'); deco(cx + 120, cy - 60, 'brazier');
      group(cx, cy + 600, 260, 3);
      group(cx - 290, cy - 130, 200, 2);
      group(cx + 290, cy - 130, 200, 2);
      if (top) group(top.x, top.y, 220, 2, { perches: [{ x: top.x - 130, y: top.y - 50 }, { x: top.x + 130, y: top.y - 50 }], ranged: true });
      P.champ = { x: cx, y: cy - 150 };
      P.relic = { x: cx, y: cy - 230 };
      break;
    }
    case 'quarry': {
      // Terraces stepping up to the north, rubble and cut blocks on each.
      tower(cx - 700, cy - 500, 1400, 700, 52, 150);
      tower(cx - 450, cy - 470, 900, 400, 50, 150);
      const top = tower(cx - 220, cy - 450, 440, 230, 46, 120);
      floor(cx - 780, cy - 520, 1560, 1250, 'gravel');
      for (let k = 0; k < 14; k++) {
        const x = cx + (rng() - 0.5) * 1300, y = cy - 420 + rng() * 950;
        prop(x, y, 46 + rng() * 20, 36 + rng() * 14, 'block');
      }
      prop(cx + 520, cy + 320, 70, 50, 'wagon');
      group(cx, cy + 480, 280, 3);
      group(cx - 420, cy + 60, 240, 3);
      group(cx + 420, cy + 60, 240, 3);
      group(cx, cy - 200, 260, 3, { ranged: true, perches: [{ x: cx - 300, y: cy - 280 }, { x: cx + 300, y: cy - 280 }, { x: cx, y: cy - 150 }] });
      P.champ = top ? { x: top.x, y: top.y } : { x: cx, y: cy - 330 };
      P.relic = { x: P.champ.x + 110, y: P.champ.y - 20 };
      break;
    }
    case 'camp': {
      const R = P.r * 0.8;
      floor(cx - R, cy - R, 2 * R, 2 * R, 'dirt');
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + rng() * 0.3, d = R * (0.55 + rng() * 0.15);
        building(cx + Math.cos(a) * d - 60, cy + Math.sin(a) * d - 45, 120, 86, 'tent');
      }
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + 0.5;
        deco(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3, 'fire');
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.8;
        const x0 = cx + Math.cos(a) * R * 0.95, y0 = cy + Math.sin(a) * R * 0.95;
        for (let j = -2; j <= 2; j++) ob(x0 + Math.cos(a + Math.PI / 2) * j * 40 - 8, y0 + Math.sin(a + Math.PI / 2) * j * 40 - 8, 16, 16, 'stake', { lean: (rng() - 0.5) * 0.4 });
      }
      prop(cx - R * 0.3, cy + R * 0.55, 110, 60, 'wagon');
      prop(cx + R * 0.4, cy - R * 0.5, 110, 60, 'wagon');
      const t = tower(cx - 70, cy - R - 60, 140, 120);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + 0.5;
        group(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3, 240, 3);
      }
      if (t) group(t.x, t.y, 160, 1, { perches: [t], ranged: true });
      P.champ = { x: cx, y: cy };
      P.relic = { x: cx + 70, y: cy + 40 };
      break;
    }
    case 'graveyard': {
      const S = 560;
      wall(cx - S, cy - S, cx + S, cy - S, 'iron', [[S - 80, S + 80]], 12);
      wall(cx - S, cy + S, cx + S, cy + S, 'iron', [[S - 90, S + 90]], 12);
      wall(cx - S, cy - S, cx - S, cy + S, 'iron', [[S - 60, S + 60]], 12);
      wall(cx + S, cy - S, cx + S, cy + S, 'iron', [[S + 100, S + 200]], 12);
      floor(cx - 60, cy - S, 120, 2 * S, 'dirt');
      for (let y = cy - 380; y < cy + S - 40; y += 95) {
        for (let x = cx - S + 60; x < cx + S - 40; x += 72) {
          if (Math.abs(x - cx) < 100 || rng() < 0.18) continue;
          prop(x, y, 18, 12, 'grave');
        }
      }
      building(cx - 140, cy - S + 40, 280, 150, 'crypt');
      deco(cx - 200, cy - 300, 'brazier'); deco(cx + 200, cy - 300, 'brazier');
      group(cx - 300, cy - 100, 240, 3);
      group(cx + 300, cy - 100, 240, 3);
      group(cx - 300, cy + 280, 240, 3);
      group(cx + 300, cy + 280, 240, 3);
      P.champ = { x: cx, y: cy - 270 };
      P.relic = { x: cx, y: cy - 330 };
      break;
    }
    case 'pass': {
      // A corridor between two long ledges, archers along them.
      const west = tower(cx - 560, cy - 820, 300, 1500, 56, 100);
      const east = tower(cx + 260, cy - 820, 300, 1500, 56, 100);
      floor(cx - 260, cy - 820, 520, 1560, 'gravel');
      for (let k = 0; k < 8; k++) prop(cx + (rng() - 0.5) * 380, cy - 700 + rng() * 1350, 44 + rng() * 26, 36 + rng() * 16, 'block');
      group(cx, cy + 480, 260, 3);
      group(cx, cy - 60, 260, 3);
      const perches = [];
      if (west) perches.push({ x: west.x, y: cy - 420 }, { x: west.x, y: cy + 180 });
      if (east) perches.push({ x: east.x, y: cy - 420 }, { x: east.x, y: cy + 180 });
      if (perches.length) group(cx, cy, 700, perches.length, { perches, ranged: true });
      P.champ = { x: cx, y: cy - 620 };
      P.relic = { x: cx, y: cy - 700 };
      break;
    }
    case 'keep': {
      const S = 580;
      floor(cx - S, cy - S, 2 * S, 2 * S, 'pave');
      // A broken curtain wall: half its panels have fallen.
      const broken = () => { const g = []; for (let a = 0; a < 2 * S; a += 100) if (rng() < 0.4) g.push([a, a + 100]); return g; };
      wall(cx - S, cy - S, cx + S, cy - S, 'stone', broken());
      wall(cx - S, cy + S, cx + S, cy + S, 'stone', [[S - 110, S + 110], ...broken()]);
      wall(cx - S, cy - S, cx - S, cy + S, 'stone', broken());
      wall(cx + S, cy - S, cx + S, cy + S, 'stone', broken());
      // The inner keep: three rooms, each with a doorway, the great hall in the middle.
      const kx0 = cx - 330, ky0 = cy - 420, kx1 = cx + 330, ky1 = cy + 80;
      wall(kx0, ky0, kx1, ky0, 'stone');
      wall(kx0, ky1, kx1, ky1, 'stone', [[280, 380], [60, 140], [520, 600]]);
      wall(kx0, ky0, kx0, ky1, 'stone', [[200, 290]]);
      wall(kx1, ky0, kx1, ky1, 'stone', [[200, 290]]);
      wall(cx - 110, ky0, cx - 110, ky1, 'stone', [[180, 280]]);
      wall(cx + 110, ky0, cx + 110, ky1, 'stone', [[180, 280]]);
      const t = tower(cx + S - 200, cy + S - 220, 150, 140);
      for (let k = 0; k < 6; k++) prop(cx + (rng() - 0.5) * 900, cy + 250 + rng() * 250, 30, 28, rng() < 0.5 ? 'crate' : 'block');
      deco(cx, cy - 330, 'banner');
      group(cx, cy + 380, 260, 3);
      group(cx - 220, cy - 170, 140, 2);
      group(cx + 220, cy - 170, 140, 2);
      if (t) group(t.x, t.y, 160, 1, { perches: [t], ranged: true });
      P.champ = { x: cx, y: cy - 200 };
      P.relic = { x: cx, y: cy - 300 };
      break;
    }
    case 'lair': buildLair(P, K, rng); break;
    case 'garden': {
      const S = 620;
      floor(cx - S, cy - 50, 2 * S, 100, 'marble');
      floor(cx - 50, cy - S, 100, 2 * S, 'marble');
      floor(cx - 150, cy - 150, 300, 300, 'marble');
      wall(cx - S, cy - S, cx + S, cy - S, 'hedge', [[S - 70, S + 70]], 30);
      wall(cx - S, cy + S, cx + S, cy + S, 'hedge', [[S - 70, S + 70]], 30);
      wall(cx - S, cy - S, cx - S, cy + S, 'hedge', [[S - 70, S + 70]], 30);
      wall(cx + S, cy - S, cx + S, cy + S, 'hedge', [[S - 70, S + 70]], 30);
      // A parterre: L-shaped hedges in each quarter.
      for (const [qx, qy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x0 = cx + qx * 200, x1 = cx + qx * 470, y0 = cy + qy * 200, y1 = cy + qy * 470;
        wall(Math.min(x0, x1), y1, Math.max(x0, x1), y1, 'hedge', [], 26);
        wall(x1, Math.min(y0, y1), x1, Math.max(y0, y1), 'hedge', [], 26);
      }
      prop(cx, cy, 90, 64, 'fountain');
      const pav = tower(cx - 130, cy - S + 60, 260, 150, 44, 110);
      group(cx + 330, cy + 330, 200, 3);
      group(cx - 330, cy + 330, 200, 3);
      group(cx + 330, cy - 330, 200, 2);
      group(cx - 330, cy - 330, 200, 2);
      if (pav) group(pav.x, pav.y, 160, 2, { perches: [{ x: pav.x - 70, y: pav.y }, { x: pav.x + 70, y: pav.y }], ranged: true });
      P.champ = { x: cx, y: cy + 110 };
      P.relic = { x: cx, y: cy - 90 };
      break;
    }
    default: break;
  }
}

// --- the ground inside a place ----------------------------------------------------------------

/** A lookup: which place floor (if any) lies under a point. */
export function floorLookup(places) {
  const B = 1024, cells = new Map();
  for (const P of places) {
    for (const f of P.floors) {
      for (let j = Math.floor(f.y / B); j <= Math.floor((f.y + f.h) / B); j++) {
        for (let i = Math.floor(f.x / B); i <= Math.floor((f.x + f.w) / B); i++) {
          const k = j * 128 + i;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(f);
        }
      }
    }
  }
  return (x, y) => {
    const list = cells.get(Math.floor(y / B) * 128 + Math.floor(x / B));
    if (!list) return null;
    for (const f of list) if (inR(f, x, y)) return f.style;
    return null;
  };
}

// --- drawing -------------------------------------------------------------------------------------

const WALL_H = { timber: 38, stone: 30, hedge: 26, iron: 22, fence: 16 };

/** A place's wall panel, building base or prop (below everyone). */
export function drawPlaceObstacle(ctx, o, time) {
  switch (o.kind) {
    case 'wall': {
      const H = WALL_H[o.style] || 26;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(o.x + 6, o.y + 6, o.w, o.h);
      if (o.style === 'timber') {
        // Upright logs, sharpened, with a lashing across them.
        ctx.fillStyle = '#5a3e26'; ctx.fillRect(o.x, o.y - H, o.w, o.h + H);
        ctx.fillStyle = '#7a5636';
        const along = o.w >= o.h;
        const n = Math.max(1, Math.round((along ? o.w : o.h) / 14));
        for (let k = 0; k < n; k++) {
          if (along) {
            const x = o.x + (k + 0.5) * (o.w / n);
            ctx.fillRect(x - 4, o.y - H, 3, o.h + H);
            ctx.beginPath(); ctx.moveTo(x - 6, o.y - H); ctx.lineTo(x, o.y - H - 8); ctx.lineTo(x + 6, o.y - H); ctx.fill();
          } else {
            const y = o.y + (k + 0.5) * (o.h / n);
            ctx.fillRect(o.x, y - H - 2, o.w, 3);
          }
        }
        ctx.fillStyle = '#3a2818'; ctx.fillRect(o.x, o.y - H * 0.55, o.w, 3);
      } else if (o.style === 'stone') {
        ctx.fillStyle = '#5e5854'; ctx.fillRect(o.x, o.y - H, o.w, o.h + H);
        ctx.fillStyle = '#7e7874'; ctx.fillRect(o.x, o.y - H, o.w, 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
        for (let y = o.y - H + 12; y < o.y + o.h; y += 12) { ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke(); }
      } else if (o.style === 'hedge') {
        ctx.fillStyle = '#2c4a2a'; ctx.fillRect(o.x, o.y - H, o.w, o.h + H);
        ctx.fillStyle = '#3e6a38'; ctx.fillRect(o.x + 2, o.y - H, o.w - 4, 8);
        ctx.fillStyle = 'rgba(160,210,120,0.18)';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(o.x + ((k * 37 + o.x) % Math.max(1, o.w)), o.y - H + 10 + ((k * 13) % Math.max(1, o.h + H - 12)), 5, 0, TAU); ctx.fill(); }
      } else if (o.style === 'iron') {
        ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 2.5;
        const along = o.w >= o.h;
        ctx.beginPath(); ctx.moveTo(o.x, o.y - H); ctx.lineTo(along ? o.x + o.w : o.x, along ? o.y - H : o.y + o.h - H); ctx.stroke();
        for (let k = 0; k <= (along ? o.w : o.h); k += 12) {
          const x = along ? o.x + k : o.x + o.w / 2, y = along ? o.y + o.h / 2 : o.y + k;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - H); ctx.stroke();
        }
      } else {
        // A plain fence: two rails on posts.
        ctx.fillStyle = '#6a5038';
        ctx.fillRect(o.x, o.y - H, o.w, 4); ctx.fillRect(o.x, o.y - H * 0.5, o.w, 4);
        for (let x = o.x; x <= o.x + o.w; x += 30) ctx.fillRect(x, o.y - H - 2, 5, H + 6);
      }
      break;
    }
    case 'building': {
      // The base and the front wall, with its door; the roof comes later, over everyone.
      const wallH = o.style === 'tent' ? 22 : 34;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(o.x + 8, o.y + 8, o.w, o.h);
      const col = o.style === 'crypt' ? '#6a6670' : o.style === 'tent' ? '#8a7858' : o.style === 'hut' || o.style === 'saloon' ? '#6a5038' : '#8a7a68';
      ctx.fillStyle = col; ctx.fillRect(o.x, o.y + o.h - wallH, o.w, wallH);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(o.x, o.y + o.h - wallH, o.w, 4);
      if (o.style !== 'tent') { ctx.fillStyle = '#3a2a1c'; ctx.fillRect(o.x + o.w / 2 - 11, o.y + o.h - 26, 22, 26); }
      else { ctx.fillStyle = '#3a2e20'; ctx.beginPath(); ctx.moveTo(o.x + o.w / 2 - 14, o.y + o.h); ctx.lineTo(o.x + o.w / 2, o.y + o.h - 22); ctx.lineTo(o.x + o.w / 2 + 14, o.y + o.h); ctx.fill(); }
      break;
    }
    case 'prop': drawProp(ctx, o, time); break;
    default: break;
  }
}

function drawProp(ctx, o, time) {
  const x = o.x + o.w / 2, y = o.y + o.h;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 6, y, o.w * 0.6, 6, 0, 0, TAU); ctx.fill();
  switch (o.style) {
    case 'crate':
      ctx.fillStyle = '#8a6a44'; ctx.fillRect(o.x, o.y - 14, o.w, o.h + 14);
      ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 2; ctx.strokeRect(o.x + 2, o.y - 12, o.w - 4, o.h + 10);
      ctx.beginPath(); ctx.moveTo(o.x + 2, o.y - 12); ctx.lineTo(o.x + o.w - 2, o.y + o.h - 2); ctx.stroke();
      break;
    case 'barrel':
      ctx.fillStyle = '#6a4a2c'; ctx.beginPath(); ctx.ellipse(x, o.y + o.h / 2 - 8, o.w / 2, o.h / 2 + 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(o.x, o.y - 4, o.w, 3); ctx.fillRect(o.x, o.y + o.h - 8, o.w, 3);
      break;
    case 'wagon':
      ctx.fillStyle = '#6a4a2c'; ctx.fillRect(o.x, o.y - 16, o.w, o.h);
      ctx.fillStyle = '#4a3220'; ctx.fillRect(o.x, o.y - 16, o.w, 6);
      ctx.fillStyle = '#2a2018';
      for (const wx of [o.x + 16, o.x + o.w - 16]) { ctx.beginPath(); ctx.arc(wx, y - 6, 12, 0, TAU); ctx.fill(); }
      break;
    case 'well':
      ctx.fillStyle = '#6a6670'; ctx.beginPath(); ctx.ellipse(x, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a2a34'; ctx.beginPath(); ctx.ellipse(x, o.y + o.h / 2, o.w / 2 - 7, o.h / 2 - 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a3e26'; ctx.fillRect(o.x - 2, o.y - 30, 5, 34); ctx.fillRect(o.x + o.w - 3, o.y - 30, 5, 34); ctx.fillRect(o.x - 4, o.y - 34, o.w + 8, 6);
      break;
    case 'statue':
      ctx.fillStyle = '#6a6670'; ctx.fillRect(o.x, o.y + 4, o.w, o.h - 4);
      ctx.fillStyle = '#8a8690';
      ctx.fillRect(x - 8, o.y - 44, 16, 48);
      ctx.beginPath(); ctx.arc(x, o.y - 52, 9, 0, TAU); ctx.fill();
      break;
    case 'column':
      ctx.fillStyle = '#8a8690'; ctx.fillRect(o.x + 4, o.y - 60, o.w - 8, o.h + 60);
      ctx.fillStyle = '#a8a4ae'; ctx.fillRect(o.x, o.y - 66, o.w, 8); ctx.fillRect(o.x + 4, o.y - 60, 4, o.h + 60);
      break;
    case 'grave':
      ctx.fillStyle = '#6a6870';
      ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x, y - 18); ctx.arc(x, y - 18, o.w / 2, Math.PI, TAU); ctx.lineTo(o.x + o.w, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a8890'; ctx.fillRect(x - 1, y - 22, 2, 9); ctx.fillRect(x - 4, y - 19, 8, 2);
      break;
    case 'block':
      ctx.fillStyle = '#6a6460'; ctx.fillRect(o.x, o.y - 18, o.w, o.h + 18);
      ctx.fillStyle = '#8a8480'; ctx.fillRect(o.x, o.y - 18, o.w, 7);
      break;
    case 'fountain': {
      ctx.fillStyle = '#b8b0a4'; ctx.beginPath(); ctx.ellipse(x, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a6a80'; ctx.beginPath(); ctx.ellipse(x, o.y + o.h / 2, o.w / 2 - 8, o.h / 2 - 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8c0b4'; ctx.fillRect(x - 5, o.y - 20, 10, 36);
      const k = (time * 2) % 1;
      ctx.strokeStyle = `rgba(200,236,250,${(0.7 * (1 - k)).toFixed(2)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, o.y + o.h / 2, 8 + k * 26, (8 + k * 26) * 0.6, 0, 0, TAU); ctx.stroke();
      break;
    }
    default: drawLairProp(ctx, o); break;
  }
}

/** Decorations that do not block: campfires, braziers, banners. */
export function drawPlaceDeco(ctx, d, time) {
  if (d.style === 'fire' || d.style === 'brazier') {
    const fl = 0.8 + Math.sin(time * 11 + d.ph) * 0.15 + Math.sin(time * 17 + d.ph) * 0.08;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(d.x, d.y - 10, 2, d.x, d.y - 10, 80);
    g.addColorStop(0, `rgba(255,150,60,${(0.3 * fl).toFixed(2)})`); g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y - 10, 80, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (d.style === 'brazier') { ctx.fillStyle = '#3a3230'; ctx.fillRect(d.x - 8, d.y - 16, 16, 16); }
    else { ctx.fillStyle = '#3a2a1c'; ctx.fillRect(d.x - 14, d.y - 2, 28, 5); ctx.fillRect(d.x - 3, d.y - 6, 6, 10); }
    ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 16, 6, 11 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 13, 3, 6 * fl, 0, 0, TAU); ctx.fill();
  } else if (d.style === 'banner') {
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(d.x - 2, d.y - 70, 4, 70);
    const flap = Math.sin(time * 3 + d.ph) * 4;
    ctx.fillStyle = '#8a2a24';
    ctx.beginPath(); ctx.moveTo(d.x + 2, d.y - 68); ctx.lineTo(d.x + 34 + flap, d.y - 60); ctx.lineTo(d.x + 2, d.y - 44); ctx.closePath(); ctx.fill();
  } else {
    drawLairDeco(ctx, d, time);
  }
}

/**
 * Roofs, over everyone: a building's roof fades to a ghost when you are
 * behind or under it, so you never lose yourself.
 */
export function drawRoof(ctx, o, p) {
  const rise = o.style === 'tent' ? 30 : 46;
  const x = o.x - 8, y = o.y - rise, w = o.w + 16, h = o.h - (o.style === 'tent' ? 16 : 26) + rise;
  const hidden = p && p.x > x - 10 && p.x < x + w + 10 && p.y - 40 < y + h && p.y + 20 > y;
  ctx.globalAlpha = hidden ? 0.28 : 1;
  const t = o.tint || 0;
  if (o.style === 'tent') {
    ctx.fillStyle = `rgb(${160 + t * 30 | 0},${138 + t * 20 | 0},${100})`;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w / 2, y + h); ctx.closePath(); ctx.fill();
  } else {
    const base = o.style === 'crypt' ? [86, 84, 94] : o.style === 'hut' ? [110, 90, 54] : o.style === 'hall' ? [96, 60, 40] : o.style === 'saloon' ? [90, 76, 62] : [128, 64, 48];
    const [r, g, b] = base.map((v) => v + t * 18);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(x, y + 10, w, h - 10);
    ctx.fillStyle = `rgb(${r * 1.2 | 0},${g * 1.2 | 0},${b * 1.2 | 0})`;
    ctx.fillRect(x, y + 10, w, (h - 10) * 0.45);
    ctx.fillStyle = `rgb(${r * 0.7 | 0},${g * 0.7 | 0},${b * 0.7 | 0})`;
    ctx.fillRect(x, y + 10 + (h - 10) * 0.45 - 3, w, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let k = x + 14; k < x + w; k += 14) { ctx.beginPath(); ctx.moveTo(k, y + 12); ctx.lineTo(k, y + h); ctx.stroke(); }
    if (o.style === 'crypt') {
      ctx.fillStyle = '#a8a4ae'; ctx.fillRect(x + w / 2 - 3, y - 6, 6, 22); ctx.fillRect(x + w / 2 - 10, y, 20, 5);
    }
    if (o.style === 'saloon') {
      // A tall, flat false front over the street, grey with age.
      ctx.fillStyle = `rgb(${120 + t * 20 | 0},${104 + t * 14 | 0},${84})`;
      ctx.fillRect(x + 6, y + h - 34, w - 12, 34);
      ctx.fillRect(x + 20, y + h - 52, w - 40, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let k = x + 12; k < x + w - 8; k += 10) ctx.fillRect(k, y + h - 34, 1, 34);
    }
  }
  ctx.globalAlpha = 1;
}
