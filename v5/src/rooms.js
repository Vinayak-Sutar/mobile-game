// Dungeon structure: procedurally laid out chambers, wave pacing, and the
// door choice that drives the run's reward loop.

import { offerSpells } from './spells.js';
import { world, arena, arenaBounds } from './state.js';
import { TAU, rand, randInt, pick, chance, clamp, dist, roundRect, polygon } from './util.js';
import { spawnEnemy, ENEMY_DEFS } from './enemies.js';
import { BOSS_INFO, BOSS_DEFS } from './bosses.js';
import { BOSS_POOL } from './boss-pool.js';
import { ring, burst, shake, flash } from './fx.js';
import { sfx } from './audio.js';
import { getFloorPattern, getRockPattern } from './texture.js';
import { getBiome, updateAmbient } from './biomes.js';

// A run fights EVERY guardian in the pool, in a fresh random order: two fights
// to warm up, then fight and guardian alternate (chambers 3, 5, 7, …), and the
// run is won when the last guardian falls. The Warden of Ash is one of them,
// not a fixed finale. A new boss joins BOSS_POOL (boss-pool.js) and the run
// grows by two chambers on its own: 10 guardians = 21 chambers.
export const FIRST_BOSS_DEPTH = 3;
export const BOSS_GAP = 2;
export const GUARDIAN_COUNT = BOSS_POOL.length;
export const FINAL_DEPTH = FIRST_BOSS_DEPTH + (GUARDIAN_COUNT - 1) * BOSS_GAP;

export function isBossDepth(depth) {
  return depth >= FIRST_BOSS_DEPTH && (depth - FIRST_BOSS_DEPTH) % BOSS_GAP === 0;
}

/** 0 for the first guardian, GUARDIAN_COUNT - 1 for the last. */
function guardianIndex(depth) { return Math.floor((depth - FIRST_BOSS_DEPTH) / BOSS_GAP); }

// The fight curve was measured over 8 chambers; a run of any length is
// stretched onto it, so its last chamber plays like the old chamber 8.
const EFF_MAX = 8;

/** An elite chamber near a point on the measured curve (never a boss room). */
function eliteAt(eff) {
  const d = Math.round(1 + (eff - 1) * (FINAL_DEPTH - 1) / (EFF_MAX - 1));
  return isBossDepth(d) ? d + 1 : d;
}
export const ELITE_DEPTHS = [eliteAt(3.5), eliteAt(6.5)];

/**
 * The combat difficulty curve was measured on an 8-chamber run (§6 of the
 * journal). Stretching it over the whole run keeps those numbers valid: the
 * last chamber plays like the old chamber 8, and the elites land near the old
 * elite depths.
 */
export function effDepth(depth) { return 1 + (depth - 1) * (EFF_MAX - 1) / Math.max(1, FINAL_DEPTH - 1); }

const SPAWNABLE = [
  'wretch', 'slinger', 'bomber', 'charger', 'splitter', 'brute', 'spitter',
  'adze', 'chinthe', 'vetala', 'sapper',
];

/** How many of a role a single wave may hold. */
const ROLE_CAP = { rusher: 4, shooter: 3, swarm: 4, bomber: 3, heavy: 2, shield: 2, support: 1, artillery: 2 };

/** Which boss guards a boss chamber this run. */
export function bossForDepth(depth) {
  const order = world.bossOrder && world.bossOrder.length ? world.bossOrder : BOSS_POOL;
  return order[guardianIndex(depth) % order.length];
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
    type: opts.training ? 'training' : isBoss ? 'boss' : isElite ? 'elite' : 'combat',
    training: !!opts.training,
    bossType,
    // Guardian slot 0 … GUARDIAN_COUNT - 1: drives their scaling.
    bossSlot: isBoss ? (opts.slot ?? Math.min(GUARDIAN_COUNT - 1, guardianIndex(depth))) : 0,
    bossTier: opts.tier,
    // The last guardian of the run: its door is the way out.
    final: isBoss && !world.trial && depth >= FINAL_DEPTH,
    obstacles: opts.training ? [] : isBoss ? (bossArena(bossType) || bossObstacles()) : makeObstacles(eff),
    waves: (isBoss || opts.training) ? [] : makeWaves(eff, loop, isElite),
    waveIndex: -1,
    waveDelay: 0.6,
    cleared: false,
    doors: [],
    doorsOpen: false,
    intro: isBoss ? 1.6 : 0,
    hue: (world.biome || getBiome()).floor.hue,
  };
  return room;
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

/** A boss spec may lay out its own arena (Vesper's crates). */
function bossArena(type) {
  const spec = BOSS_DEFS[type] && BOSS_DEFS[type].spec;
  return spec && spec.arena ? spec.arena() : null;
}

function bossSpec(room) {
  return room && room.bossType && BOSS_DEFS[room.bossType] ? BOSS_DEFS[room.bossType].spec : null;
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
      const def = ENEMY_DEFS[type];
      if (def.cost > budget) continue;
      // Roles are mixed on purpose: a shooter plus a rusher asks a different
      // question than two of either, and one shield or spirit is a twist while
      // three is a slog. Caps are per role and per type.
      const role = def.role || 'rusher';
      const inWave = (t) => (wave.find((s) => s.type === t) || { count: 0 }).count;
      const roleCount = wave.reduce(
        (n, s) => n + ((ENEMY_DEFS[s.type].role || 'rusher') === role ? s.count : 0), 0);
      if (roleCount >= (ROLE_CAP[role] ?? 4)) continue;
      if (inWave(type) >= (def.maxPerWave ?? 99)) continue;
      // The support spirits only make sense with someone to raise.
      if ((role === 'support' || role === 'shield') && wave.length === 0) continue;
      budget -= def.cost;
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
 * more boons each time. However many guardians there are, they climb the same
 * curve: tier 0 for the first up to tier 3 (×1.9 HP) for the last, whoever
 * they are — the Warden included.
 */
export function bossScaling(room) {
  const loop = room.loop || 0;
  const tier = room.bossTier ?? Math.min(3, (room.bossSlot || 0) * 3 / Math.max(1, GUARDIAN_COUNT - 1));
  return { scale: 1 + tier * 0.3 + loop * 0.8, dmgScale: 1 + tier * 0.1 + loop * 0.3, tier };
}

export function updateRoom(dt) {
  const room = world.room;
  if (!room) return;
  updateAmbient(dt, world.biome);
  // A boss arena with a life of its own (the Mire's water) runs every frame,
  // from the intro to after the guardian falls.
  const arenaSpec = bossSpec(room);
  if (arenaSpec && arenaSpec.arenaTick) arenaSpec.arenaTick(room, dt);

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

  // The Training Ground never clears and never opens a door: it is a room to
  // stand in, not one to get through.
  if (room.training) return;

  const alive = world.enemies.filter((e) => !e.dead).length;

  if (!room.cleared && room.type !== 'boss') {
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
      spawnEnemy(slot.type, pt.x, pt.y, {
        scale: enemyScale(room.eff, room.loop),
        elite: !!slot.elite && i === 0,
      });
    }
  }
}

function clearRoom(room) {
  room.cleared = true;
  if (room.type === 'boss' && room.bossType && !world.trial) world.beaten.push(room.bossType);
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
  spell: { color: '#8ef0ff', glyph: '✧', label: 'Spell' },
};

/** Is there any spell left to learn or level up? */
function spellsLeft(p) { return !!p && offerSpells(p, 1).length > 0; }

function makeDoors(room) {
  const b = arenaBounds();
  const y = b.t - 6;

  const p = world.player;

  if (room.type === 'boss') {
    if (room.final || world.trial) return [makeDoor((b.l + b.r) / 2, y, 'exit')];
    // A guardian always pays out a boon, plus health if you need it, else a spell.
    const second = p && p.hp / p.stats.maxHp < 0.85 ? 'heal' : spellsLeft(p) ? 'spell' : 'gold';
    return [
      makeDoor(b.l + (b.r - b.l) * 0.3, y, 'boon'),
      makeDoor(b.l + (b.r - b.l) * 0.7, y, second),
    ];
  }

  const hurt = p && p.hp / p.stats.maxHp < 0.45;

  let types = [rollReward(), rollReward()];
  if (hurt) types[0] = 'heal';
  if (types[0] === types[1] && types[0] !== 'boon') types[1] = 'boon';
  // Spells come from Spell doors: always on offer while you have none,
  // then about one chamber in three.
  if (spellsLeft(p) && (!p.spells.length || Math.random() < 0.33)) types[1] = 'spell';

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
  // A boss may paint its own arena over the floor (Vesper's sun-baked square).
  const spec = bossSpec(room);
  if (spec && spec.drawArena) spec.drawArena(ctx, room, time);
}

/**
 * Breakable cover: a wooden crate. Every projectile that hits it chips it
 * (projectiles.js); big hits (dynamite, High Noon) smash it at once.
 */
function drawCrate(ctx, o) {
  const k = clamp(o.hp / (o.maxHp || 1), 0, 1);
  if (o.stone) { drawPillar(ctx, o, k); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, o.x + 4, o.y + 8, o.w, o.h, 4);
  ctx.fill();
  ctx.fillStyle = world.runTime - (o.hitAt ?? -9) < 0.08 ? '#fff0d0' : '#8a5a32';
  roundRect(ctx, o.x, o.y, o.w, o.h, 4);
  ctx.fill();
  ctx.fillStyle = '#a8703e';
  roundRect(ctx, o.x + 4, o.y + 4, o.w - 8, o.h * 0.3, 3);
  ctx.fill();
  ctx.strokeStyle = '#3a2210';
  ctx.lineWidth = 3;
  roundRect(ctx, o.x, o.y, o.w, o.h, 4);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(o.x + 5, o.y + 5); ctx.lineTo(o.x + o.w - 5, o.y + o.h - 5);
  ctx.moveTo(o.x + o.w - 5, o.y + 5); ctx.lineTo(o.x + 5, o.y + o.h - 5);
  ctx.stroke();
  // Cracks as it takes hits.
  if (k < 0.7) {
    ctx.strokeStyle = '#1a0e06';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.2, o.y + o.h * 0.1); ctx.lineTo(o.x + o.w * 0.35, o.y + o.h * 0.45); ctx.lineTo(o.x + o.w * 0.25, o.y + o.h * 0.7);
    if (k < 0.4) { ctx.moveTo(o.x + o.w * 0.8, o.y + o.h * 0.2); ctx.lineTo(o.x + o.w * 0.6, o.y + o.h * 0.55); ctx.lineTo(o.x + o.w * 0.75, o.y + o.h * 0.9); }
    ctx.stroke();
  }
}

/** A cathedral pillar: fluted stone that cracks, then crumbles (Twin Wardens). */
function drawPillar(ctx, o, k) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(cx + 4, cy + 9, r, r * 0.9, 0, 0, TAU); ctx.fill();
  const hit = world.runTime - (o.hitAt ?? -9) < 0.08;
  ctx.fillStyle = hit ? '#ffffff' : '#8a8494';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b4aec0';
  ctx.beginPath(); ctx.arc(cx - 2, cy - 3, r * 0.82, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(40,36,52,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35); ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); ctx.stroke();
  }
  ctx.strokeStyle = '#2a2634';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  if (k < 0.66) {
    ctx.strokeStyle = '#1a1622';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.2); ctx.lineTo(cx - r * 0.1, cy + r * 0.1); ctx.lineTo(cx + r * 0.2, cy - r * 0.5);
    if (k < 0.33) { ctx.moveTo(cx - r * 0.1, cy + r * 0.1); ctx.lineTo(cx + r * 0.3, cy + r * 0.7); }
    ctx.stroke();
  }
}

export function drawObstacles(ctx) {
  const room = world.room;
  if (!room) return;
  for (const o of room.obstacles) {
    if (o.crate) { drawCrate(ctx, o); continue; }
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
