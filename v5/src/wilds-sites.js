// Encounter sites: the Wilds' fights, each in a place of its own.
//
// The old camps' enemies woke when you came near and chased you across the
// map, and there was no telling where their ground ended. Here every fight
// has a VISIBLE BOUNDARY - a palisade, a ring of standing stones, broken
// walls, a thorn ring, a yard under a cliff - and its enemies are LEASHED to
// it: they never leave, and when you walk away they stay home. Step inside
// and most sites SEAL (a barricade drops across the gate, fire runs between
// the stones, the thorns close) until the last of them falls. Then a
// RELIQUARY lights at the heart of the place: stand on it and it opens - a
// spell the first time, Cinders every time.
//
// Resting at an Ashlamp (or falling with no life left) brings every site's
// enemies back, souls-style; a reliquary you have claimed stays claimed.
//
// Kinds (each built from obstacles in the spatial hash, so they block you,
// the enemies and shots like any wall):
//   palisade  a ring of sharpened stakes with one gate
//   circle    standing stones and braziers; fire between the stones; two waves
//             (a frozen ring on the Moors and at the Citadel, a mud wallow in the Mire)
//   ruins     broken walls to fight round, against chargers and bombers
//   thorns    a ring of thorn clumps with two gaps, ambushers in the grass
//   outpost   a yard under a cliff with archers on the top (hand-placed)
//   ambush    at the far end of a bridge (hand-placed)
//
// Sites are placed once, from the seed: hand-placed outposts and ambushes
// first, then along every road at intervals, then a scatter across the open
// land - each only where the whole disc is dry, open ground, clear of cliffs,
// stairs, lamps and other sites.

import { world } from './state.js';
import { TAU, dist } from './util.js';
import { ring, burst, shake } from './fx.js';
import { sfx } from './audio.js';
import { TT, mulberry } from './terrain.js';
import { WILDS, START, LAMPS, OUTPOSTS, AMBUSHES } from './wilds-layout.js';

// Which enemies live where.
export const REGION_FOES = {
  heartland: ['wretch', 'slinger', 'charger', 'bomber'],
  webwood: ['adze', 'chinthe', 'splitter', 'spitter'],
  lake: ['kappa', 'wretch', 'slinger'],
  gulch: ['sapper', 'charger', 'slinger', 'bomber'],
  mire: ['kappa', 'preta', 'spitter', 'splitter'],
  gilded: ['chinthe', 'duende', 'slinger', 'charger'],
  echo: ['draugr', 'vetala', 'slinger'],
  sands: ['sapper', 'preta', 'brute', 'bomber'],
  isle: ['kappa', 'duende', 'wretch', 'slinger'],
  peaks: ['brute', 'bomber', 'charger', 'sapper'],
  gorge: ['adze', 'spitter', 'vetala', 'kappa'],
  moors: ['draugr', 'vetala', 'preta', 'wretch'],
  summit: ['duende', 'chinthe', 'brute', 'slinger'],
  bridge: ['brute', 'charger', 'draugr'],
  citadel: ['draugr', 'vetala', 'brute', 'chinthe'],
};
const RANGED = new Set(['slinger', 'spitter', 'bomber']);

const SPAWN_AT = 1400;      // grow a site's enemies when you come this near
const DROP_AT = 2600;       // and let them go past this (unless sealed)
const WAKE_PAD = 220;       // they wake when you are this far inside their edge

// --- placing them ------------------------------------------------------------------------

/**
 * Plan every site. ctx: { classify(x, y) -> TT, query(x0, y0, x1, y1) -> the
 * hash's obstacles there, stairsNear(x0, y0, x1, y1) -> stairs, regionAt,
 * roadSegs }. Returns the sites; their obstacles are on each as `obs`.
 */
export function planSites(ctx) {
  const rng = mulberry(WILDS.SEED ^ 0x51735);
  const sites = [];
  const BAD = new Set([TT.WATER, TT.SHALLOW, TT.CHASM]);
  const HARD = new Set(['face', 'rim', 'chasm', 'rail', 'water']);

  // Is the whole disc dry, open ground, clear of walls and stairs, and far
  // enough from lamps, the start and the other sites?
  const ok = (x, y, r, spacing = 1500, allowFaces = false) => {
    if (x < r + 200 || y < r + 200 || x > WILDS.W - r - 200 || y > WILDS.H - r - 200) return false;
    if (Math.hypot(x - START.x, y - START.y) < 1400) return false;
    if (LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < r + 650)) return false;
    if (sites.some((s) => Math.hypot(x - s.x, y - s.y) < spacing)) return false;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      for (const f of [1, 0.55]) if (BAD.has(ctx.classify(x + Math.cos(a) * r * f, y + Math.sin(a) * r * f))) return false;
    }
    if (BAD.has(ctx.classify(x, y))) return false;
    // No road may run through a site: its walls would block it.
    for (const g of ctx.roadSegs) {
      const dx = g.bx - g.ax, dy = g.by - g.ay;
      const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (y - g.ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - (g.ax + dx * t), y - (g.ay + dy * t)) < r + 90) return false;
    }
    if (!allowFaces) {
      for (const o of ctx.query(x - r, y - r, x + r, y + r)) if (HARD.has(o.kind)) return false;
      if (ctx.stairsNear(x - r, y - r, x + r, y + r).length) return false;
    }
    return true;
  };

  const make = (kind, x, y, r, extra = {}) => {
    const region = ctx.regionAt(x, y);
    const s = {
      id: `s${sites.length}`, kind, x, y, r, region: region.id, tier: region.tier, ...extra,
      members: null, sealed: false, cleared: false, opened: false, claimed: false,
      wave: 0, relT: 0, seen: false, awake: false, obs: [],
    };
    // What fights here, fixed by the seed: one or two waves, an elite from tier 1.
    const foes = REGION_FOES[region.id] || REGION_FOES.heartland;
    const count = 3 + region.tier + Math.floor(rng() * 2);
    const waves = kind === 'circle' ? 2 : 1;
    s.waves = [];
    for (let w = 0; w < waves; w++) {
      const list = [];
      const n = w ? Math.max(2, count - 1) : count;
      for (let k = 0; k < n; k++) list.push(foes[Math.floor(rng() * foes.length)]);
      s.waves.push(list);
    }
    s.elite = region.tier >= 1 && rng() < 0.35 + region.tier * 0.1;
    s.scale = 1 + region.tier * 0.35;
    s.obs = buildKind(s, rng);
    sites.push(s);
    return s;
  };

  // 1. The hand-placed ones.
  for (const o of OUTPOSTS) make('outpost', o.x, o.y, o.r, { perch: o.perch });
  for (const a of AMBUSHES) make('ambush', a.x, a.y, a.r);

  // 2. Along the roads: every ~2300 units, set off to one side or the other.
  const pickKind = (regionId) => {
    const r = rng();
    if (regionId === 'mire' || regionId === 'moors' || regionId === 'citadel') return r < 0.5 ? 'circle' : r < 0.75 ? 'palisade' : 'ruins';
    if (regionId === 'webwood' || regionId === 'gorge' || regionId === 'lake') return r < 0.45 ? 'thorns' : r < 0.75 ? 'palisade' : 'circle';
    if (regionId === 'gulch' || regionId === 'sands' || regionId === 'peaks') return r < 0.45 ? 'ruins' : r < 0.8 ? 'palisade' : 'circle';
    return r < 0.35 ? 'palisade' : r < 0.6 ? 'circle' : r < 0.8 ? 'ruins' : 'thorns';
  };
  let side = 1;
  for (const seg of ctx.roadSegs) {
    const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
    const nx = -(seg.by - seg.ay) / (len || 1), ny = (seg.bx - seg.ax) / (len || 1);
    for (let d = 900; d < len - 400; d += 2300) {
      const t = d / len;
      const off = 480 + rng() * 360;
      side = -side;
      const x = seg.ax + (seg.bx - seg.ax) * t + nx * off * side;
      const y = seg.ay + (seg.by - seg.ay) * t + ny * off * side;
      const r = 300 + rng() * 90;
      if (!ok(x, y, r)) continue;
      make(pickKind(ctx.regionAt(x, y).id), x, y, r);
    }
  }

  // 3. A scatter across the open land, so the wilds away from the roads have fights too.
  for (let y = 1800; y < WILDS.H - 1800; y += 2600) {
    for (let x = 1800; x < WILDS.W - 1800; x += 2600) {
      const px = x + (rng() - 0.5) * 1400, py = y + (rng() - 0.5) * 1400;
      const r = 300 + rng() * 90;
      if (!ok(px, py, r, 2000)) continue;
      make(pickKind(ctx.regionAt(px, py).id), px, py, r);
    }
  }
  return sites;
}

/** The obstacles that make a site's boundary, by kind. */
function buildKind(s, rng) {
  const obs = [];
  const add = (x, y, w, h, kind, extra = {}) => obs.push({ x: x - w / 2, y: y - h / 2, w, h, kind, site: s.id, ...extra });
  switch (s.kind) {
    case 'palisade': {
      // Stakes all round, and a gate on the side facing the world's middle
      // (the way you are most likely to come from).
      s.gate = Math.atan2(WILDS.H / 2 - s.y, WILDS.W / 2 - s.x);
      const n = Math.round((TAU * s.r) / 44);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const off = Math.abs(Math.atan2(Math.sin(a - s.gate), Math.cos(a - s.gate)));
        if (off < 0.3) continue;
        add(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 16, 16, 'stake', { lean: (rng() - 0.5) * 0.3 });
      }
      break;
    }
    case 'circle': {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        add(s.x + Math.cos(a) * s.r * 0.94, s.y + Math.sin(a) * s.r * 0.94, 26, 20, 'stone', { tall: 34 + rng() * 14 });
      }
      break;
    }
    case 'ruins': {
      for (let k = 0; k < 5; k++) {
        const a = rng() * TAU, d = (0.25 + rng() * 0.45) * s.r;
        const long = 70 + rng() * 60;
        if (rng() < 0.5) add(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, long, 20, 'ruinwall', { shadow: true });
        else add(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 20, long, 'ruinwall', { shadow: true });
      }
      // Broken columns round the edge.
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        if (rng() < 0.35) continue;
        add(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 22, 22, 'ruinwall', { shadow: true, column: true });
      }
      break;
    }
    case 'thorns': {
      const gaps = [rng() * TAU];
      gaps.push(gaps[0] + Math.PI);
      const n = Math.round((TAU * s.r) / 52);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.28)) continue;
        add(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 38, 24, 'thorn');
      }
      break;
    }
    case 'outpost': {
      // A short arc of stakes along the front of the yard; the cliff is the back.
      for (let k = -4; k <= 4; k++) {
        const a = Math.PI / 2 + k * 0.2;
        if (k === 0) continue;
        add(s.x + Math.cos(a) * s.r * 0.85, s.y + Math.sin(a) * s.r * 0.85, 16, 16, 'stake', { lean: 0 });
      }
      break;
    }
    default: break;
  }
  return obs;
}

// --- the fight ----------------------------------------------------------------------------

function spawnWave(s, spawn) {
  const list = s.waves[s.wave];
  const last = s.wave === s.waves.length - 1;
  list.forEach((type, i) => {
    let x, y;
    if (s.perch && RANGED.has(type)) {
      x = s.perch.x + (i % 3 - 1) * 70; y = s.perch.y + (i % 2) * 30;
    } else {
      const a = (i / list.length) * TAU + s.wave * 0.7, d = s.r * (0.3 + (i % 2) * 0.22);
      x = s.x + Math.cos(a) * d; y = s.y + Math.sin(a) * d;
    }
    const e = spawn(type, x, y, { instant: true, scale: s.scale, elite: s.elite && last && i === 0 });
    if (!e) return;
    // Held to their ground: they never leave it, and doze until you come near.
    e.leash = { x: s.x, y: s.y, r: s.r - 12 };
    e.site = s.id;
    e.asleep = () => !s.awake;
    s.members.push(e);
  });
}

function removeMembers(s) {
  if (!s.members) return;
  const gone = new Set(s.members);
  world.enemies = world.enemies.filter((e) => !gone.has(e));
  s.members = null;
}

/** Every site back as it was (after a rest, or waking from a fall). */
export function resetSites(sites) {
  for (const s of sites) {
    removeMembers(s);
    s.sealed = false; s.cleared = false; s.opened = false; s.wave = 0; s.relT = 0; s.awake = false;
  }
}

/**
 * The sites' upkeep, each frame. Returns an action for game.js, or null:
 * { seal: site } | { wave: site } | { clear: site } | { reliquary: site }.
 */
export function updateSites(sites, p, dt, spawn) {
  let action = null;
  for (const s of sites) {
    const d = dist(p.x, p.y, s.x, s.y);
    if (d < 1100) s.seen = true;
    if (!s.cleared && !s.members && d < SPAWN_AT && spawn) { s.members = []; s.wave = 0; spawnWave(s, spawn); }
    if (s.members && !s.sealed && d > DROP_AT) removeMembers(s);

    if (s.members) {
      const hit = s.members.some((e) => e.hitAt && world.runTime - e.hitAt < 3);
      s.awake = s.sealed || d < s.r + WAKE_PAD || hit;
      // Step inside and it closes behind you.
      if (!s.sealed && !p.ghost && !p.dead && d < s.r * 0.78) {
        s.sealed = true;
        s.awake = true;
        action = { seal: s };
      }
      if (s.members.every((e) => e.dead)) {
        if (s.wave < s.waves.length - 1) {
          s.wave++;
          spawnWave(s, spawn);
          action = { wave: s };
        } else {
          s.cleared = true;
          s.sealed = false;
          s.members = null;
          s.relT = 0;
          action = { clear: s };
        }
      }
    }

    // While sealed you cannot leave (a ghost can).
    if (s.sealed && !p.ghost && d > s.r - p.r && d > 0) {
      const k = (s.r - p.r) / d;
      p.x = s.x + (p.x - s.x) * k;
      p.y = s.y + (p.y - s.y) * k;
    }

    // The reliquary: stand on it a moment and it opens.
    if (s.cleared && !s.opened) {
      const rx = s.perch ? s.perch.x : s.x, ry = s.perch ? s.perch.y : s.y;
      if (dist(p.x, p.y, rx, ry) < 34) {
        s.relT += dt;
        if (s.relT >= 1) { s.opened = true; action = { reliquary: s }; }
      } else s.relT = 0;
    }
  }
  return action;
}

/** Feedback for a site's big moments (game.js calls it with the action). */
export function siteFx(action) {
  const s = action.seal || action.clear || action.wave || action.reliquary;
  if (!s) return;
  if (action.seal) { ring(s.x, s.y, { r0: s.r * 0.9, r1: s.r, color: '#ff6a3a', life: 0.6, width: 6 }); shake(0.2); sfx.door(); }
  if (action.clear) { ring(s.x, s.y, { r0: 20, r1: s.r, color: '#ffd45e', life: 0.8, width: 6 }); sfx.boon(); }
  if (action.reliquary) {
    const rx = s.perch ? s.perch.x : s.x, ry = s.perch ? s.perch.y : s.y;
    burst(rx, ry, { count: 26, color: '#ffe08a', speed: 220, size: 4, life: 0.7, drag: 3 });
    sfx.boon();
  }
}

/** Enemies held to their ground (ai.js collideWorld calls this). */
export function holdToLeash(e) {
  const L = e.leash;
  if (!L) return;
  const dx = e.x - L.x, dy = e.y - L.y, d = Math.hypot(dx, dy);
  if (d > L.r - e.r && d > 0) {
    const k = (L.r - e.r) / d;
    e.x = L.x + dx * k;
    e.y = L.y + dy * k;
  }
}
