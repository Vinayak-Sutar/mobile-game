// The Wilds' fights: every enemy out there belongs to a UNIT with ground of
// its own, and never leaves it.
//
//   group     a post inside one of the thirty PLACES (wilds-places.js): a gate
//             guard, a yard, archers on a tower or a ledge. It keeps to its
//             post and dozes until you come near it or hit one of it.
//   champion  the named elite at a place's heart, beside the reliquary. The
//             one thing that locks you in: step into its ring and the ring
//             closes until one of you falls. Beat it and the reliquary opens -
//             a spell the first time, Cinders always.
//   site      the smaller fights between places: a palisade, a ring of
//             standing stones (two waves), ruins, a thorn ring, a yard under a
//             cliff with archers above, a bridge ambush. Nothing seals; a chest
//             of Cinders when it is cleared.
//   patrol    two or three walking a stretch of road and back, until they see you.
//
// No unit chases you across the map: each one's enemies are LEASHED to its
// ground (ai.js collideWorld). You come and go as you please - retreat, pull a
// few to you, use the walls and the heights.
//
// Resting at an Ashlamp (or falling with no life left) brings every unit back,
// souls-style; a reliquary you have claimed stays claimed.

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
// The heavy hitters a champion is made from, best first.
const CHAMPION_KINDS = ['brute', 'draugr', 'charger', 'kappa', 'chinthe', 'vetala', 'adze', 'preta', 'duende', 'sapper', 'wretch'];
const TITLES = ['the Warlord', 'the Butcher', 'the Iron Hand', 'the Bone Keeper', 'the Ash Chief', 'the Pale Warden',
  'the Thorn Queen', 'the Red Hound', 'the Old Wolf', 'the Grave Lord', 'the Tide Witch', 'the Stone Jaw'];

const SPAWN_AT = 1500;      // grow a unit's enemies when you come this near
const DROP_AT = 2700;       // and let them go past this (unless you are duelling)
const WAKE_PAD = 260;       // they wake when you come this far inside their ground
const CHAMP_R = 300;        // the champion's duel ring

// --- planning ----------------------------------------------------------------------------------

/** One unit. */
function unit(fields, rng, region, count) {
  const foes = REGION_FOES[region.id] || REGION_FOES.heartland;
  const u = {
    members: null, sealed: false, cleared: false, opened: false, claimed: false,
    wave: 0, relT: 0, seen: false, awake: false, obs: [], tier: region.tier, region: region.id,
    scale: 1 + region.tier * 0.35, ...fields,
  };
  if (!u.waves) {
    const list = [];
    for (let k = 0; k < count; k++) {
      // Posts on a tower or ledge are archers; everywhere else, anything local.
      const pool = u.perches ? foes.filter((t) => RANGED.has(t)) : foes;
      list.push((pool.length ? pool : foes)[Math.floor(rng() * (pool.length ? pool.length : foes.length))]);
    }
    u.waves = [list];
  }
  u.elite = u.elite ?? (region.tier >= 1 && rng() < 0.2 + region.tier * 0.1);
  return u;
}

/** The units that hold the places: their posts and their champions. */
export function unitsFromPlaces(places, ctx) {
  const units = [];
  for (const P of places) {
    const rng = mulberry((WILDS.SEED ^ P.x * 31 ^ P.y * 17) | 0);
    const region = P.region;
    P.groups.forEach((g, i) => {
      units.push(unit({
        id: `${P.id}:g${i}`, kind: 'group', place: P.id, x: g.x, y: g.y, r: g.r + 60,
        perches: g.perches || null,
      }, rng, region, g.n + (region.tier >= 2 ? 1 : 0)));
    });
    if (P.champ) {
      const foes = REGION_FOES[region.id] || REGION_FOES.heartland;
      const type = CHAMPION_KINDS.find((t) => foes.includes(t)) || foes[0];
      const title = TITLES[Math.floor(rng() * TITLES.length)];
      units.push(unit({
        id: `${P.id}:champ`, kind: 'champion', place: P.id, x: P.champ.x, y: P.champ.y, r: CHAMP_R,
        relic: P.relic, reward: 'spell', name: `${title[0].toUpperCase()}${title.slice(1)} of ${P.name}`,
        waves: [[type]], elite: true, scale: 1.7 + region.tier * 0.5,
      }, rng, region, 1));
    }
  }
  void ctx;
  return units;
}

/**
 * The smaller fights between places, and the road patrols. ctx: { classify,
 * query, stairsNear, regionAt, roadSegs, places }.
 */
export function planSites(ctx) {
  const rng = mulberry(WILDS.SEED ^ 0x51735);
  const sites = [];
  const BAD = new Set([TT.WATER, TT.SHALLOW, TT.CHASM]);
  const HARD = new Set(['face', 'rim', 'chasm', 'rail', 'water', 'wall', 'building']);
  const roadDist = (x, y) => {
    let best = 1e9;
    for (const g of ctx.roadSegs) {
      const dx = g.bx - g.ax, dy = g.by - g.ay;
      const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (y - g.ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - (g.ax + dx * t), y - (g.ay + dy * t)));
    }
    return best;
  };

  const ok = (x, y, r, spacing) => {
    if (x < r + 200 || y < r + 200 || x > WILDS.W - r - 200 || y > WILDS.H - r - 200) return false;
    if (Math.hypot(x - START.x, y - START.y) < 1400) return false;
    if (LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < r + 650)) return false;
    if (ctx.places.some((P) => Math.hypot(x - P.x, y - P.y) < P.r + r + 400)) return false;
    if (sites.some((s) => Math.hypot(x - s.x, y - s.y) < spacing)) return false;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      for (const f of [1, 0.55]) if (BAD.has(ctx.classify(x + Math.cos(a) * r * f, y + Math.sin(a) * r * f))) return false;
    }
    if (BAD.has(ctx.classify(x, y))) return false;
    if (roadDist(x, y) < r + 90) return false;
    for (const o of ctx.query(x - r, y - r, x + r, y + r)) if (HARD.has(o.kind)) return false;
    if (ctx.stairsNear(x - r, y - r, x + r, y + r).length) return false;
    return true;
  };

  const make = (kind, x, y, r, extra = {}) => {
    const region = ctx.regionAt(x, y);
    const count = 3 + region.tier + Math.floor(rng() * 2);
    const s = unit({ id: `s${sites.length}`, kind: 'site', form: kind, x, y, r, reward: 'cinders', ...extra }, rng, region, count);
    if (kind === 'circle') {
      const foes = REGION_FOES[region.id] || REGION_FOES.heartland;
      s.waves.push(Array.from({ length: Math.max(2, count - 1) }, () => foes[Math.floor(rng() * foes.length)]));
    }
    if (extra.perch) {
      // An outpost: its archers stand on the heights, the rest in the yard.
      s.perches = [{ x: extra.perch.x - 60, y: extra.perch.y }, { x: extra.perch.x + 60, y: extra.perch.y + 20 }];
      s.mixed = true;
    }
    s.obs = buildForm(s, rng);
    sites.push(s);
    return s;
  };

  // The hand-placed outposts and ambushes, where no place stands on them.
  for (const o of OUTPOSTS) if (!ctx.places.some((P) => Math.hypot(o.x - P.x, o.y - P.y) < P.r + o.r)) make('outpost', o.x, o.y, o.r, { perch: o.perch });
  for (const a of AMBUSHES) if (!ctx.places.some((P) => Math.hypot(a.x - P.x, a.y - P.y) < P.r + a.r)) make('ambush', a.x, a.y, a.r);

  const pickKind = (regionId) => {
    const r = rng();
    if (regionId === 'mire' || regionId === 'moors' || regionId === 'citadel') return r < 0.5 ? 'circle' : r < 0.75 ? 'palisade' : 'ruins';
    if (regionId === 'webwood' || regionId === 'gorge' || regionId === 'lake') return r < 0.45 ? 'thorns' : r < 0.75 ? 'palisade' : 'circle';
    if (regionId === 'gulch' || regionId === 'sands' || regionId === 'peaks') return r < 0.45 ? 'ruins' : r < 0.8 ? 'palisade' : 'circle';
    return r < 0.35 ? 'palisade' : r < 0.6 ? 'circle' : r < 0.8 ? 'ruins' : 'thorns';
  };
  // A handful along the roads, fewer now the places carry the weight.
  let side = 1;
  for (const seg of ctx.roadSegs) {
    const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
    const nx = -(seg.by - seg.ay) / (len || 1), ny = (seg.bx - seg.ax) / (len || 1);
    for (let d = 1500; d < len - 600; d += 4600) {
      const t = d / len;
      const off = 520 + rng() * 360;
      side = -side;
      const x = seg.ax + (seg.bx - seg.ax) * t + nx * off * side;
      const y = seg.ay + (seg.by - seg.ay) * t + ny * off * side;
      const r = 300 + rng() * 90;
      if (ok(x, y, r, 2400)) make(pickKind(ctx.regionAt(x, y).id), x, y, r);
    }
  }
  // Road patrols: walking a stretch of road and back.
  for (const seg of ctx.roadSegs) {
    const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
    if (len < 1800) continue;
    for (let d = 900; d < len - 900; d += 5200) {
      const t0 = Math.max(0, (d - 600) / len), t1 = Math.min(1, (d + 600) / len);
      const a = { x: seg.ax + (seg.bx - seg.ax) * t0, y: seg.ay + (seg.by - seg.ay) * t0 };
      const b = { x: seg.ax + (seg.bx - seg.ax) * t1, y: seg.ay + (seg.by - seg.ay) * t1 };
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (Math.hypot(cx - START.x, cy - START.y) < 2000) continue;
      if (LAMPS.some((l) => Math.hypot(cx - l.x, cy - l.y) < 1100)) continue;
      if (ctx.places.some((P) => Math.hypot(cx - P.x, cy - P.y) < P.r + 900)) continue;
      if (sites.some((s) => Math.hypot(cx - s.x, cy - s.y) < 1500)) continue;
      if (BAD.has(ctx.classify(cx, cy))) continue;
      const region = ctx.regionAt(cx, cy);
      const foes = (REGION_FOES[region.id] || REGION_FOES.heartland).filter((q) => !RANGED.has(q));
      const s = unit({
        id: `p${sites.length}`, kind: 'patrol', x: cx, y: cy, r: 900, path: [a, b], leg: 1, reward: null,
        waves: [Array.from({ length: 2 + Math.floor(rng() * 2) }, () => foes[Math.floor(rng() * foes.length)])],
      }, rng, region, 0);
      sites.push(s);
    }
  }

  // And a scatter across the open land, well apart.
  for (let y = 2000; y < WILDS.H - 2000; y += 5200) {
    for (let x = 2000; x < WILDS.W - 2000; x += 5200) {
      const px = x + (rng() - 0.5) * 2400, py = y + (rng() - 0.5) * 2400;
      const r = 300 + rng() * 90;
      if (ok(px, py, r, 3000)) make(pickKind(ctx.regionAt(px, py).id), px, py, r);
    }
  }
  return sites;
}

/** The walls of a small site, by its form. */
function buildForm(s, rng) {
  const obs = [];
  const add = (x, y, w, h, kind, extra = {}) => obs.push({ x: x - w / 2, y: y - h / 2, w, h, kind, site: s.id, ...extra });
  switch (s.form) {
    case 'palisade': {
      s.gate = Math.atan2(WILDS.H / 2 - s.y, WILDS.W / 2 - s.x);
      const n = Math.round((TAU * s.r) / 44);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        if (Math.abs(Math.atan2(Math.sin(a - s.gate), Math.cos(a - s.gate))) < 0.36) continue;
        add(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 16, 16, 'stake', { lean: (rng() - 0.5) * 0.3 });
      }
      break;
    }
    case 'circle':
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        add(s.x + Math.cos(a) * s.r * 0.94, s.y + Math.sin(a) * s.r * 0.94, 26, 20, 'stone', { tall: 34 + rng() * 14 });
      }
      break;
    case 'ruins':
      for (let k = 0; k < 5; k++) {
        const a = rng() * TAU, d = (0.25 + rng() * 0.45) * s.r, long = 70 + rng() * 60;
        if (rng() < 0.5) add(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, long, 20, 'ruinwall', { shadow: true });
        else add(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 20, long, 'ruinwall', { shadow: true });
      }
      for (let k = 0; k < 10; k++) {
        if (rng() < 0.35) continue;
        const a = (k / 10) * TAU;
        add(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 22, 22, 'ruinwall', { shadow: true, column: true });
      }
      break;
    case 'thorns': {
      const g0 = rng() * TAU, gaps = [g0, g0 + Math.PI, g0 + Math.PI / 2];
      const n = Math.round((TAU * s.r) / 52);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.3)) continue;
        add(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 38, 24, 'thorn');
      }
      break;
    }
    case 'outpost':
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const a = Math.PI / 2 + k * 0.2;
        add(s.x + Math.cos(a) * s.r * 0.85, s.y + Math.sin(a) * s.r * 0.85, 16, 16, 'stake', { lean: 0 });
      }
      break;
    default: break;
  }
  return obs;
}

// --- the fight ------------------------------------------------------------------------------------

function spawnWave(s, spawn) {
  const list = s.waves[s.wave];
  const last = s.wave === s.waves.length - 1;
  let perched = 0;
  list.forEach((type, i) => {
    let x, y, leash;
    const perch = s.perches && (!s.mixed || RANGED.has(type)) ? s.perches[perched % s.perches.length] : null;
    if (perch) {
      perched++;
      x = perch.x + ((perched - 1) % 3 - 1) * 26; y = perch.y + Math.floor((perched - 1) / 3) * 26;
      // Archers hold their spot on the height.
      leash = { x: perch.x, y: perch.y, r: 110 };
    } else if (s.kind === 'patrol') {
      x = s.path[0].x + i * 30; y = s.path[0].y + (i % 2) * 30;
      leash = { x: s.x, y: s.y, r: s.r };
    } else {
      const a = (i / list.length) * TAU + s.wave * 0.7, d = s.kind === 'champion' ? 0 : s.r * (0.25 + (i % 2) * 0.22);
      x = s.x + Math.cos(a) * d; y = s.y + Math.sin(a) * d;
      leash = { x: s.x, y: s.y, r: s.r - 12 };
    }
    const champ = s.kind === 'champion';
    const e = spawn(type, x, y, { instant: true, scale: s.scale, elite: champ || (s.elite && last && i === 0) });
    if (!e) return;
    e.leash = leash;
    e.site = s.id;
    e.asleep = () => !s.awake;
    if (champ) {
      e.champion = s.name;
      e.r *= 1.15;
      e.damage = Math.round(e.damage * 1.25);
    }
    s.members.push(e);
  });
}

function removeMembers(s) {
  if (!s.members) return;
  const gone = new Set(s.members);
  world.enemies = world.enemies.filter((e) => !gone.has(e));
  s.members = null;
}

/** Every unit back as it was (after a rest, or waking from a fall). */
export function resetSites(sites) {
  for (const s of sites) {
    removeMembers(s);
    s.sealed = false; s.cleared = false; s.opened = false; s.wave = 0; s.relT = 0; s.awake = false; s.leg = 1;
  }
}

/** A patrol walks its stretch of road while it has not seen you. */
function walkPatrol(s, dt) {
  const to = s.path[s.leg];
  let there = true;
  for (const e of s.members) {
    if (e.dead) continue;
    const d = Math.hypot(to.x - e.x, to.y - e.y);
    if (d > 30) {
      there = false;
      const v = Math.min(d, 70 * dt);
      e.x += ((to.x - e.x) / d) * v; e.y += ((to.y - e.y) / d) * v;
      e.face = Math.atan2(to.y - e.y, to.x - e.x);
    }
  }
  if (there) s.leg = 1 - s.leg;
}

/**
 * The units' upkeep, each frame. Returns an action for game.js, or null:
 * { duel } | { wave } | { clear } | { champion } | { reliquary }.
 */
export function updateSites(sites, p, dt, spawn) {
  let action = null;
  for (const s of sites) {
    const d = dist(p.x, p.y, s.x, s.y);
    if (d < 1200) s.seen = true;
    if (!s.cleared && !s.members && d < SPAWN_AT && spawn) { s.members = []; s.wave = 0; spawnWave(s, spawn); }
    if (s.members && !s.sealed && d > DROP_AT) removeMembers(s);

    if (s.members) {
      const alive = s.members.filter((e) => !e.dead);
      const hit = alive.some((e) => e.hitAt && world.runTime - e.hitAt < 3);
      if (s.kind === 'patrol') {
        const near = alive.some((e) => Math.hypot(p.x - e.x, p.y - e.y) < 460);
        s.awake = near || hit;
        if (!s.awake) walkPatrol(s, dt);
      } else {
        s.awake = s.sealed || d < s.r + WAKE_PAD || hit;
      }
      // The champion's ring: step in and it closes until one of you falls.
      if (s.kind === 'champion' && !s.sealed && !p.ghost && !p.dead && d < s.r * 0.8 && alive.length) {
        s.sealed = true;
        s.awake = true;
        action = { duel: s };
      }
      if (!alive.length) {
        if (s.wave < s.waves.length - 1) {
          s.wave++;
          spawnWave(s, spawn);
          action = { wave: s };
        } else {
          s.cleared = true;
          s.sealed = false;
          s.members = null;
          s.relT = 0;
          if (s.kind === 'champion') action = { champion: s };
          else if (s.reward) action = { clear: s };
        }
      }
    }

    if (s.sealed && !p.ghost && d > s.r - p.r && d > 0) {
      const k = (s.r - p.r) / d;
      p.x = s.x + (p.x - s.x) * k;
      p.y = s.y + (p.y - s.y) * k;
    }

    // A reliquary (a champion's) or a chest (a site's): stand on it a moment.
    if (s.cleared && s.reward && !s.opened) {
      const at = relicAt(s);
      if (dist(p.x, p.y, at.x, at.y) < 34) {
        s.relT += dt;
        if (s.relT >= 1) { s.opened = true; action = { reliquary: s }; }
      } else s.relT = 0;
    }
  }
  return action;
}

/** Where a unit's reward stands. */
export function relicAt(s) {
  return s.relic || (s.perches && s.form === 'outpost' ? s.perches[0] : { x: s.x, y: s.y });
}

/** Feedback for the big moments (game.js calls it with the action). */
export function siteFx(action) {
  const s = action.duel || action.clear || action.wave || action.reliquary || action.champion;
  if (!s) return;
  if (action.duel) { ring(s.x, s.y, { r0: s.r * 0.9, r1: s.r, color: '#ff6a3a', life: 0.6, width: 6 }); shake(0.25); sfx.door(); }
  if (action.clear || action.champion) { ring(s.x, s.y, { r0: 20, r1: s.r, color: '#ffd45e', life: 0.8, width: 6 }); sfx.boon(); }
  if (action.reliquary) {
    const at = relicAt(s);
    burst(at.x, at.y, { count: 26, color: '#ffe08a', speed: 220, size: 4, life: 0.7, drag: 3 });
    sfx.boon();
  }
}
