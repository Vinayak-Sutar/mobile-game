// Dungeon structure: procedurally laid out chambers, wave pacing, and the
// door choice that drives the run's reward loop.

import { world, arena, arenaBounds } from './state.js';
import { TAU, rand, randInt, pick, chance, clamp, dist, roundRect, polygon } from './util.js';
import { spawnEnemy, ENEMY_DEFS } from './enemies.js';
import { ring, burst, shake, flash } from './fx.js';
import { sfx } from './audio.js';
import { getFloorPattern, getRockPattern } from './texture.js';
import { getBiome, updateAmbient } from './biomes.js';

export const BOSS_DEPTH = 8;

const SPAWNABLE = ['wretch', 'slinger', 'bomber', 'charger', 'splitter', 'brute', 'spitter'];

export function generateRoom(depth, loop = 0) {
  const isBoss = depth === BOSS_DEPTH;
  const isElite = !isBoss && depth > 2 && depth % 3 === 0;

  const room = {
    depth,
    loop,
    type: isBoss ? 'boss' : isElite ? 'elite' : 'combat',
    obstacles: isBoss ? bossObstacles() : makeObstacles(depth),
    waves: isBoss ? [] : makeWaves(depth, loop, isElite),
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

export function updateRoom(dt) {
  const room = world.room;
  if (!room) return;
  updateAmbient(dt, world.biome);

  if (room.intro > 0) {
    room.intro -= dt;
    if (room.intro <= 0) {
      const b = arenaBounds();
      // The boss gets its own curve rather than the depth ramp — at full
      // depth scaling it was a ~3300 HP damage sponge.
      const boss = spawnEnemy('warden', b.l + (b.r - b.l) / 2, b.t + 120, {
        scale: 1.45 + room.loop * 0.8,
        dmgScale: 1.05 + room.loop * 0.3,
      });
      boss.spawning = false;
      flash(0.4, '#ff3d5e');
      shake(0.8);
      ring(boss.x, boss.y, { r0: 10, r1: 320, color: '#ff3d5e', life: 0.7, width: 10 });
    }
    return;
  }

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
        scale: enemyScale(room.depth, room.loop),
        elite: !!slot.elite && i === 0,
      });
    }
  }
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
};

function makeDoors(room) {
  const b = arenaBounds();
  const y = b.t - 6;

  if (room.type === 'boss') {
    return [makeDoor((b.l + b.r) / 2, y, 'exit')];
  }

  const p = world.player;
  const hurt = p && p.hp / p.stats.maxHp < 0.45;

  let types = [rollReward(), rollReward()];
  if (hurt) types[0] = 'heal';
  if (types[0] === types[1] && types[0] !== 'boon') types[1] = 'boon';

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

export function drawObstacles(ctx) {
  const room = world.room;
  if (!room) return;
  for (const o of room.obstacles) {
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
  const k = 1 - room.intro / 1.6;
  ctx.globalAlpha = Math.min(1, k * 3) * (room.intro < 0.4 ? room.intro / 0.4 : 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3d5e';
  ctx.font = '900 46px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillText('THE WARDEN OF ASH', b.l + arena.w / 2, b.t + arena.h / 2 - 10);
  ctx.fillStyle = '#ffd9a0';
  ctx.font = '600 16px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.fillText('KEEPER OF THE LAST GATE', b.l + arena.w / 2, b.t + arena.h / 2 + 24);
  ctx.globalAlpha = 1;
}
