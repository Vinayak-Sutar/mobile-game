// Dungeon structure: procedurally laid out chambers, wave pacing, and the
// door choice that drives the run's reward loop.

import { world, arena, arenaBounds } from './state.js';
import { TAU, rand, randInt, pick, chance, clamp, dist, roundRect, polygon } from './util.js';
import { spawnEnemy, ENEMY_DEFS } from './enemies.js';
import { CREATURE_BOSSES, BOSS_INFO } from './bosses.js';
import { pickChamber, chamberById, realise, pathClear, SPECIAL_ROOMS, rollSpecial, specialLayout } from './chambers.js';
import { buildTraps } from './traps.js';
import { spawnSurface } from './surfaces.js';
import { applyStatus } from './elements.js';
import { spawnPickup } from './spawn.js';
import { ring, burst, shake, flash } from './fx.js';
import { sfx } from './audio.js';
import { getFloorPattern, getRockPattern } from './texture.js';
import { getBiome, updateAmbient } from './biomes.js';

// A run is 15 chambers: two fights, then a guardian, five times over.
// Chambers 3, 6, 9 and 12 hold the four creature bosses in a per-run shuffled
// order; chamber 15 is always the Warden of Ash.
export const FINAL_DEPTH = 15;
export const BOSS_EVERY = 3;
export const ELITE_DEPTHS = [5, 11];

export function isBossDepth(depth) { return depth % BOSS_EVERY === 0; }

/**
 * The combat difficulty curve was measured on an 8-chamber run (§6 of the
 * journal). Stretching it over 15 chambers keeps those numbers valid: chamber
 * 14 plays like the old chamber 7.5, and the elite chambers 5 and 11 land on
 * the old elite depths 3 and 6 exactly.
 */
export function effDepth(depth) { return 1 + (depth - 1) * 0.5; }

const SPAWNABLE = ['wretch', 'slinger', 'bomber', 'charger', 'splitter', 'brute', 'spitter'];

/** Which boss guards a boss chamber this run. */
export function bossForDepth(depth) {
  if (depth >= FINAL_DEPTH) return 'warden';
  const order = world.bossOrder && world.bossOrder.length ? world.bossOrder : CREATURE_BOSSES;
  return order[(depth / BOSS_EVERY - 1) % order.length];
}

export function generateRoom(depth, loop = 0, opts = {}) {
  const isBoss = !!opts.bossType || isBossDepth(depth);
  const isElite = !isBoss && ELITE_DEPTHS.includes(depth);
  const eff = effDepth(depth);
  const bossType = isBoss ? (opts.bossType || bossForDepth(depth)) : null;

  const room = {
    depth,
    eff,
    loop,
    type: isBoss ? 'boss' : isElite ? 'elite' : 'combat',
    bossType,
    // Boss slot 0-3 for the creatures, 4 for the Warden: drives their scaling.
    bossSlot: isBoss ? (opts.slot ?? Math.min(4, Math.round(depth / BOSS_EVERY) - 1)) : 0,
    final: bossType === 'warden',
    obstacles: isBoss ? bossObstacles() : makeObstacles(eff),
    waves: isBoss ? [] : makeWaves(eff, loop, isElite),
    waveIndex: -1,
    waveDelay: 0.6,
    cleared: false,
    doors: [],
    doorsOpen: false,
    intro: isBoss ? 1.6 : 0,
    hue: (world.biome || getBiome()).floor.hue,
    traps: [],
    pendingSurfaces: [],
  };

  // Version 3: hand-authored layouts with traps, and special chambers.
  if (!isBoss) {
    if (opts.special) buildSpecial(room, opts.special);
    else {
      const tpl = opts.template ? chamberById(opts.template) : pickChamber(depth);
      if (tpl) applyTemplate(room, tpl);
    }
  }
  return room;
}

function doorPoints() {
  const b = arenaBounds();
  return [
    { x: b.l + (b.r - b.l) * 0.3, y: b.t + 24 },
    { x: b.l + (b.r - b.l) * 0.7, y: b.t + 24 },
  ];
}

function startPoint() { return { x: arena.x + arena.w / 2, y: arena.y + arena.h * 0.72 }; }

function applyTemplate(room, tpl) {
  const r = realise(tpl);
  let traps = r.traps;
  // Never wall the player off from the doors: drop the pits if they would.
  if (!pathClear(r.obstacles, traps, startPoint(), doorPoints())) traps = traps.filter((t) => t.kind !== 'chasm');
  room.obstacles = r.obstacles;
  room.traps = buildTraps(traps);
  room.pendingSurfaces = r.surfaces;
  room.template = tpl.name;
}

function buildSpecial(room, kind) {
  room.special = kind;
  if (kind === 'trial') {
    room.trialT = 32 + room.eff * 3;
    room.trialMax = room.trialT;
    return;                      // a normal fight, against the clock
  }
  const lay = specialLayout(kind);
  const r = realise(lay);
  room.obstacles = r.obstacles;
  room.traps = buildTraps(r.traps);
  const b = arenaBounds();
  if (lay.fountain) room.traps.push(...buildTraps([{ kind: 'fountain', x: b.l + arena.w * lay.fountain.x, y: b.t + arena.h * lay.fountain.y }]));
  if (lay.altar) room.traps.push(...buildTraps([{ kind: 'altar', x: b.l + arena.w * lay.altar.x, y: b.t + arena.h * lay.altar.y }]));
  room.waves = [];
  room.type = 'special';
  room.template = SPECIAL_ROOMS[kind].label;
}

function makeObstacles(depth) {
  const out = [];
  const count = randInt(depth < 2 ? 0 : 1, depth < 4 ? 2 : 4);
  const cx = arena.x + arena.w / 2;
  const cy = arena.y + arena.h / 2;

  let guard = 0;
  while (out.length < count && guard++ < 60) {
    const w = rand(46, 130);
    const h = rand(46, 130);
    const x = rand(arena.x + 80, arena.x + arena.w - 80 - w);
    const y = rand(arena.y + 80, arena.y + arena.h - 80 - h);
    const rect = { x, y, w, h };

    // Keep the centre clear — that's where the player starts.
    if (dist(x + w / 2, y + h / 2, cx, cy) < 170) continue;
    if (out.some((o) => overlaps(o, rect, 60))) continue;
    out.push(rect);
  }
  return out;
}

function bossObstacles() {
  // Four corner blocks: cover to break line of sight, without cramping.
  const m = 116, s = 62;
  const b = arenaBounds();
  return [
    { x: b.l + m, y: b.t + m, w: s, h: s },
    { x: b.r - m - s, y: b.t + m, w: s, h: s },
    { x: b.l + m, y: b.b - m - s, w: s, h: s },
    { x: b.r - m - s, y: b.b - m - s, w: s, h: s },
  ];
}

function overlaps(a, b, pad = 0) {
  return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
           a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
}

function makeWaves(depth, loop, isElite) {
  const pool = SPAWNABLE.filter((t) => ENEMY_DEFS[t].minDepth <= depth + loop * 3);
  const waveCount = depth <= 2 ? 1 : depth <= 5 ? 2 : 3;
  const waves = [];

  for (let w = 0; w < waveCount; w++) {
    let budget = Math.round((4 + depth * 2.8 + loop * 8) * (0.75 + w * 0.35));
    const wave = [];
    let guard = 0;
    while (budget > 1 && guard++ < 40) {
      const type = pick(pool);
      const cost = ENEMY_DEFS[type].cost;
      if (cost > budget) continue;
      budget -= cost;
      const found = wave.find((s) => s.type === type);
      if (found) found.count++;
      else wave.push({ type, count: 1 });
    }
    if (wave.length === 0) wave.push({ type: 'wretch', count: 3 });
    if (isElite && w === waveCount - 1) wave[0].elite = true;
    waves.push(wave);
  }
  return waves;
}

export function startRoom(room) {
  world.room = room;
  const p = world.player;
  if (p) {
    p.x = arena.x + arena.w / 2;
    p.y = arena.y + arena.h * 0.72;
    p.vx = p.vy = 0;
    p.invuln = Math.max(p.invuln, 0.8);
  }
  for (const sf of room.pendingSurfaces || []) spawnSurface(sf.type, sf.x, sf.y, sf.r, 'enemy', sf.life || 9999);
  room.pendingSurfaces = [];
  if (room.special === 'gauntlet') {
    // The prize waits at the top, by the doors.
    const b = arenaBounds();
    for (let k = 0; k < 14; k++) spawnPickup({ x: b.l + arena.w * rand(0.3, 0.7), y: b.t + 40, vx: 0, vy: 0, type: 'gold', value: 3, life: 60 });
  }
  if (room.type === 'boss') sfx.bossRoar();
  else sfx.door();
}

function spawnPoint(minFromPlayer = 250) {
  const p = world.player;
  const b = arenaBounds();
  for (let i = 0; i < 60; i++) {
    const x = rand(b.l + 50, b.r - 50);
    const y = rand(b.t + 50, b.b - 50);
    if (p && dist(x, y, p.x, p.y) < minFromPlayer) continue;
    if (world.room.obstacles.some((o) => pointInRect(x, y, o, 34))) continue;
    // Keep spawns off pits and away from traps.
    if ((world.room.traps || []).some((t) => (t.w !== undefined ? pointInRect(x, y, t, 30) : dist(x, y, t.x, t.y) < 55))) continue;
    return { x, y };
  }
  return { x: b.l + rand(60, b.r - b.l - 60), y: b.t + 60 };
}

function pointInRect(x, y, r, pad = 0) {
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

function enemyScale(depth, loop) {
  return 1 + (depth - 1) * 0.19 + loop * 0.75;
}

/**
 * Bosses get their own curve rather than the depth ramp — at full depth
 * scaling the old Warden was a ~3300 HP damage sponge. Each later creature
 * slot is tougher and hits a little harder, because the player arrives with
 * three more boons each time.
 */
export function bossScaling(room) {
  const loop = room.loop || 0;
  if (room.bossType === 'warden') {
    return { scale: 1.9 + loop * 0.8, dmgScale: 1.1 + loop * 0.3, tier: 4 };
  }
  const slot = Math.min(3, room.bossSlot || 0);
  return { scale: 1 + slot * 0.3 + loop * 0.8, dmgScale: 1 + slot * 0.1 + loop * 0.3, tier: slot };
}

export function updateRoom(dt) {
  const room = world.room;
  if (!room) return;
  updateAmbient(dt, world.biome);

  if (room.intro > 0) {
    room.intro -= dt;
    if (room.intro <= 0) {
      const b = arenaBounds();
      const boss = spawnEnemy(room.bossType, b.l + (b.r - b.l) / 2, b.t + 120, bossScaling(room));
      boss.spawning = false;
      const color = (BOSS_INFO[room.bossType] || {}).color || boss.color;
      flash(0.4, color);
      shake(0.8);
      ring(boss.x, boss.y, { r0: 10, r1: 320, color, life: 0.7, width: 10 });
    }
    return;
  }

  const alive = world.enemies.filter((e) => !e.dead).length;

  // Trial: the clock runs while the fight does.
  if (room.special === 'trial' && !room.cleared && room.trialT > 0) room.trialT -= dt;

  if (room.type === 'special') {
    if (!room.cleared && room.special !== 'shrine') clearRoom(room);
  } else if (!room.cleared && room.type !== 'boss') {
    if (alive === 0) {
      room.waveDelay -= dt;
      if (room.waveDelay <= 0) {
        room.waveIndex++;
        if (room.waveIndex >= room.waves.length) {
          clearRoom(room);
        } else {
          spawnWave(room, room.waves[room.waveIndex]);
          room.waveDelay = 0.9;
        }
      }
    }
  } else if (!room.cleared && room.type === 'boss') {
    if (alive === 0) clearRoom(room);
  }

  if (room.doorsOpen) {
    const p = world.player;
    for (const d of room.doors) {
      if (!d.taken && p && !p.dead && dist(p.x, p.y, d.x, d.y) < 46) {
        d.taken = true;
        room.chosen = d;
      }
      // Idle shimmer so open doors keep drawing the eye.
      if (Math.random() < dt * 6) {
        burst(d.x + rand(-16, 16), d.y + 20, {
          count: 1, color: d.color, speed: 26, size: 3, life: 0.7, gravity: -46, drag: 1,
        });
      }
    }
  }
}

function spawnWave(room, wave) {
  for (const slot of wave) {
    for (let i = 0; i < slot.count; i++) {
      const pt = spawnPoint(slot.type === 'spitter' ? 300 : 250);
      const e = spawnEnemy(slot.type, pt.x, pt.y, {
        scale: enemyScale(room.eff, room.loop),
        elite: !!slot.elite && i === 0,
      });
      applyCurses(e);
    }
  }
}

/** Shrine pacts: hasted enemies, or fire-touched ones. */
function applyCurses(e) {
  for (const c of world.curses || []) {
    if (c.id === 'haste') { applyStatus(e, 'hasted', 999); e.speed *= 1.3; }
    if (c.id === 'embers' && !e.boss) e.aura = 'fire';
  }
}

/** Open the doors (used by the shrine after its choice). */
export function openRoom(room) {
  if (!room.cleared) clearRoom(room);
}

function clearRoom(room) {
  room.cleared = true;
  room.doorsOpen = true;
  room.doors = makeDoors(room);
  sfx.door();
  flash(0.14, '#ffd9a0');
  for (const d of room.doors) {
    ring(d.x, d.y, { r0: 4, r1: 70, color: d.color, life: 0.5, width: 4 });
  }
}

const REWARD_STYLES = {
  boon: { color: '#c07bff', glyph: '✦', label: 'Boon' },
  heal: { color: '#7dff9c', glyph: '✚', label: 'Health' },
  gold: { color: '#ffc861', glyph: '◈', label: 'Gold' },
  ...Object.fromEntries(Object.entries(SPECIAL_ROOMS).map(([k, v]) => [k, { color: v.color, glyph: v.glyph, label: v.label }])),
};

function makeDoors(room) {
  const b = arenaBounds();
  const y = b.t - 6;

  const p = world.player;

  if (room.type === 'boss') {
    if (room.final || world.trial) return [makeDoor((b.l + b.r) / 2, y, 'exit')];
    // A guardian always pays out a boon, plus health if you need it.
    const second = p && p.hp / p.stats.maxHp < 0.85 ? 'heal' : 'gold';
    return [
      makeDoor(b.l + (b.r - b.l) * 0.3, y, 'boon'),
      makeDoor(b.l + (b.r - b.l) * 0.7, y, second),
    ];
  }

  const hurt = p && p.hp / p.stats.maxHp < 0.45;

  let types = [rollReward(), rollReward()];
  if (hurt) types[0] = 'heal';
  if (types[0] === types[1] && types[0] !== 'boon') types[1] = 'boon';

  // A trial beaten in time pays two boon doors with rare-weighted offers.
  if (room.special === 'trial' && room.trialT > 0) {
    types = ['boon', 'boon'];
    world.nextBoonRare = true;
  } else if (!isBossDepth(room.depth + 1) && room.depth + 1 < FINAL_DEPTH && !world.trial) {
    // Sometimes the second door leads somewhere special instead.
    const sp = rollSpecial(room.depth, world.lastSpecial);
    if (sp) types[1] = sp;
  }

  return [
    makeDoor(b.l + (b.r - b.l) * 0.3, y, types[0]),
    makeDoor(b.l + (b.r - b.l) * 0.7, y, types[1]),
  ];
}

function rollReward() {
  const r = Math.random();
  if (r < 0.6) return 'boon';
  if (r < 0.8) return 'heal';
  return 'gold';
}

function makeDoor(x, y, reward) {
  const style = REWARD_STYLES[reward] || { color: '#ffd9a0', glyph: '↟', label: 'Onward' };
  return { x, y, reward, taken: false, color: style.color, glyph: style.glyph, label: style.label };
}

// --- rendering -------------------------------------------------------------

export function drawFloor(ctx, time) {
  const b = arenaBounds();
  const room = world.room;
  const biome = world.biome || getBiome();
  const hue = biome.floor.hue;

  // Procedural tile for this biome, generated once per depth band and cached.
  const pat = getFloorPattern(ctx, biome, room ? room.depth : 1);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(b.l, b.t, arena.w, arena.h);
  } else {
    ctx.fillStyle = `hsl(${hue},22%,9%)`;
    ctx.fillRect(b.l, b.t, arena.w, arena.h);
  }

  // Vignette the floor edges so the arena reads as a lit room, not a sheet.
  const vg = ctx.createRadialGradient(
    b.l + arena.w / 2, b.t + arena.h / 2, Math.min(arena.w, arena.h) * 0.25,
    b.l + arena.w / 2, b.t + arena.h / 2, Math.max(arena.w, arena.h) * 0.62,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(b.l, b.t, arena.w, arena.h);

  // A wash of the biome's own colour, so the room reads as one place.
  ctx.fillStyle = biome.fog;
  ctx.fillRect(b.l, b.t, arena.w, arena.h);

  // Centre sigil
  const cx = b.l + arena.w / 2, cy = b.t + arena.h / 2;
  ctx.strokeStyle = biome.accent + '18';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, TAU);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.08);
  polygon(ctx, 0, 0, 76, 6, 0);
  ctx.stroke();
  ctx.restore();

  // Wall band
  ctx.strokeStyle = biome.wallTint;
  ctx.lineWidth = 4;
  ctx.strokeRect(b.l - 2, b.t - 2, arena.w + 4, arena.h + 4);
  ctx.strokeStyle = biome.accent + '20';
  ctx.lineWidth = 16;
  ctx.strokeRect(b.l - 10, b.t - 10, arena.w + 20, arena.h + 20);
}

/** An Earthen Bulwark: raw raised stone that cracks as it runs out. */
function drawBulwark(ctx, o) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, o.x + 3, o.y + 6, o.w, o.h, 5);
  ctx.fill();
  ctx.fillStyle = '#7a5d3a';
  roundRect(ctx, o.x, o.y, o.w, o.h, 5);
  ctx.fill();
  ctx.fillStyle = '#c9a36b';
  roundRect(ctx, o.x + 3, o.y + 3, o.w - 6, Math.min(o.h, o.w) * 0.35, 3);
  ctx.fill();
  if (o.temp < 1.2) {
    ctx.strokeStyle = 'rgba(20,10,0,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.2, o.y + o.h * 0.1);
    ctx.lineTo(o.x + o.w * 0.55, o.y + o.h * 0.5);
    ctx.lineTo(o.x + o.w * 0.35, o.y + o.h * 0.9);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c9a36b';
  ctx.lineWidth = 2;
  roundRect(ctx, o.x, o.y, o.w, o.h, 5);
  ctx.stroke();
}

export function drawObstacles(ctx) {
  const room = world.room;
  if (!room) return;
  for (const o of room.obstacles) {
    if (o.bulwark) { drawBulwark(ctx, o); continue; }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, o.x + 4, o.y + 8, o.w, o.h, 8);
    ctx.fill();
    const biome = world.biome || getBiome();
    const rad = biome.rockCap.radius;
    const rock = getRockPattern(ctx, biome);
    ctx.fillStyle = rock || `hsl(${biome.floor.hue},18%,22%)`;
    roundRect(ctx, o.x, o.y, o.w, o.h, rad);
    ctx.fill();
    // Lit top face, so pillars read as solid volumes from above. Its colour
    // and corner radius are what separate an ice shard from a mossy boulder.
    ctx.fillStyle = biome.rockCap.color;
    roundRect(ctx, o.x + 5, o.y + 5, o.w - 10, o.h * 0.34, Math.max(2, rad - 2));
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, o.x, o.y, o.w, o.h, rad);
    ctx.stroke();
  }
}

export function drawDoors(ctx, time) {
  const room = world.room;
  if (!room || !room.doorsOpen) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const d of room.doors) {
    const pulse = 0.6 + Math.sin(time * 3 + d.x) * 0.25;

    ctx.globalAlpha = 0.2 * pulse;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y + 14, 54, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Archway
    ctx.fillStyle = '#0d0916';
    roundRect(ctx, d.x - 30, d.y - 18, 60, 62, 10);
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3;
    roundRect(ctx, d.x - 30, d.y - 18, 60, 62, 10);
    ctx.stroke();

    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.fillStyle = d.color;
    roundRect(ctx, d.x - 24, d.y - 12, 48, 50, 8);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#0d0916';
    ctx.font = '900 26px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(d.glyph, d.x, d.y + 14);

    ctx.fillStyle = d.color;
    ctx.font = '700 12px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(d.label.toUpperCase(), d.x, d.y + 58);
  }
}

export function drawRoomIntro(ctx, room, time) {
  if (!room || room.intro <= 0) return;
  const b = arenaBounds();
  const info = BOSS_INFO[room.bossType] || BOSS_INFO.warden;
  const k = 1 - room.intro / 1.6;
  ctx.globalAlpha = Math.min(1, k * 3) * (room.intro < 0.4 ? room.intro / 0.4 : 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = info.color;
  // Long names shrink to fit a phone-width arena.
  let size = 46;
  ctx.font = `900 ${size}px "Segoe UI", Roboto, system-ui, sans-serif`;
  const title = info.title.toUpperCase();
  while (size > 26 && ctx.measureText(title).width > arena.w - 60) {
    size -= 2;
    ctx.font = `900 ${size}px "Segoe UI", Roboto, system-ui, sans-serif`;
  }
  ctx.fillText(title, b.l + arena.w / 2, b.t + arena.h / 2 - 10);
  ctx.fillStyle = '#ffd9a0';
  ctx.font = '600 16px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillText(info.subtitle.toUpperCase(), b.l + arena.w / 2, b.t + arena.h / 2 + 24);
  ctx.globalAlpha = 1;
}
