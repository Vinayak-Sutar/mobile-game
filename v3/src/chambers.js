// Chamber templates: named, hand-authored layouts (in arena fractions, so they
// fit any screen shape) instead of only random rectangles. Each lists its
// obstacles, traps and surfaces; rooms.js picks one by depth and builds it.
//
// Also: the special chambers behind new door types (trial, shrine, fountain,
// treasure, gauntlet), and a reachability check so a layout can never wall
// the player off from the doors.
//
// To add a layout: one entry in CHAMBERS. Coordinates are fractions of the
// arena: x/w of its width, y/h of its height.

import { arena, arenaBounds } from './state.js';
import { rand, pick, shuffle } from './util.js';

// Pillar size in arena fractions (reads square on a phone's arena).
const PW = 0.055, PH = 0.13;
const pillar = (x, y, w = PW, h = PH) => ({ x, y, w, h });

export const CHAMBERS = [
  {
    id: 'pillared', name: 'Pillared Hall', minDepth: 1,
    obstacles: [pillar(0.22, 0.28), pillar(0.73, 0.28), pillar(0.22, 0.66), pillar(0.73, 0.66)],
    traps: [
      { kind: 'urn', x: 0.1, y: 0.2 }, { kind: 'urn', x: 0.9, y: 0.82 },
      { kind: 'spikes', x: 0.5, y: 0.34 },
    ],
  },
  {
    id: 'pylons', name: 'Hall of Pylons', minDepth: 2,
    obstacles: [pillar(0.47, 0.2, 0.06, 0.1)],
    traps: [
      { kind: 'pylon', x: 0.25, y: 0.35 }, { kind: 'pylon', x: 0.75, y: 0.35 },
      { kind: 'pylon', x: 0.3, y: 0.8 }, { kind: 'pylon', x: 0.7, y: 0.8 },
      { kind: 'urn', x: 0.06, y: 0.5 },
    ],
    surfaces: [{ type: 'water', x: 0.25, y: 0.55, r: 70 }, { type: 'water', x: 0.75, y: 0.55, r: 70 }],
  },
  {
    id: 'bridge', name: 'Bridge over the Chasm', minDepth: 2,
    obstacles: [],
    traps: [
      { kind: 'chasm', x: 0.05, y: 0.42, w: 0.34, h: 0.14 },
      { kind: 'chasm', x: 0.61, y: 0.42, w: 0.34, h: 0.14 },
      { kind: 'turret', wall: 'left', y: 0.49, angle: 0 },
      { kind: 'barrel', x: 0.14, y: 0.25 }, { kind: 'barrel', x: 0.86, y: 0.72 },
    ],
  },
  {
    id: 'flooded', name: 'Flooded Vault', minDepth: 3,
    obstacles: [pillar(0.2, 0.2), pillar(0.76, 0.2), pillar(0.2, 0.72), pillar(0.76, 0.72)],
    traps: [
      { kind: 'channel', x: 0.06, y: 0.45, w: 0.88, h: 0.1 },
      { kind: 'pylon', x: 0.5, y: 0.3 },
    ],
  },
  {
    id: 'furnace', name: 'Furnace Corridor', minDepth: 4,
    obstacles: [pillar(0.47, 0.44, 0.06, 0.12)],
    traps: [
      { kind: 'vent', wall: 'top', x: 0.25, angle: Math.PI / 2, len: 170 },
      { kind: 'vent', wall: 'top', x: 0.75, angle: Math.PI / 2, len: 170 },
      { kind: 'vent', wall: 'bottom', x: 0.5, angle: -Math.PI / 2, len: 170 },
      { kind: 'barrel', x: 0.12, y: 0.5 }, { kind: 'barrel', x: 0.88, y: 0.5, oil: true },
      { kind: 'barrel', x: 0.35, y: 0.75, oil: true },
    ],
  },
  {
    id: 'garden', name: 'Poison Garden', minDepth: 4,
    obstacles: [pillar(0.3, 0.3), pillar(0.66, 0.6)],
    traps: [
      { kind: 'toxicVent', x: 0.18, y: 0.5 }, { kind: 'toxicVent', x: 0.82, y: 0.35 }, { kind: 'toxicVent', x: 0.5, y: 0.25 },
      { kind: 'channel', x: 0.47, y: 0.55, w: 0.06, h: 0.4 },
      { kind: 'urn', x: 0.08, y: 0.85 }, { kind: 'urn', x: 0.92, y: 0.85 },
    ],
  },
  {
    id: 'crossroads', name: 'Crossroads', minDepth: 5,
    obstacles: [
      pillar(0.08, 0.12, 0.2, 0.26), pillar(0.72, 0.12, 0.2, 0.26),
      pillar(0.08, 0.64, 0.2, 0.26), pillar(0.72, 0.64, 0.2, 0.26),
    ],
    traps: [
      { kind: 'turret', wall: 'left', y: 0.5, angle: 0 },
      { kind: 'turret', wall: 'right', y: 0.44, angle: Math.PI },
      { kind: 'spikes', x: 0.5, y: 0.5 },
    ],
  },
  {
    id: 'gauntlet', name: 'The Grinder', minDepth: 7,
    obstacles: [],
    traps: [
      { kind: 'saw', x: 0.12, y: 0.33, x2: 0.88, y2: 0.33 },
      { kind: 'saw', x: 0.88, y: 0.62, x2: 0.12, y2: 0.62, speed: 180 },
      { kind: 'spikes', x: 0.3, y: 0.48 }, { kind: 'spikes', x: 0.7, y: 0.48 },
    ],
  },
  {
    id: 'windswept', name: 'Windswept Ledge', minDepth: 7,
    obstacles: [pillar(0.2, 0.3)],
    traps: [
      { kind: 'wind', x: 0.36, y: 0.08, w: 0.3, h: 0.84, angle: 0, force: 95 },
      { kind: 'chasm', x: 0.86, y: 0.22, w: 0.1, h: 0.56 },
      { kind: 'barrel', x: 0.55, y: 0.2 },
    ],
  },
];

/** Pick a template for a combat chamber, or null for a classic random room. */
export function pickChamber(depth) {
  if (depth <= 1) return null;
  const pool = CHAMBERS.filter((c) => c.minDepth <= depth);
  if (!pool.length || Math.random() < 0.25) return null;
  return pick(pool);
}

export function chamberById(id) { return CHAMBERS.find((c) => c.id === id) || null; }

/** Turn a template's fractional coordinates into world units. */
export function realise(tpl) {
  const b = arenaBounds();
  const X = (f) => b.l + arena.w * f;
  const Y = (f) => b.t + arena.h * f;
  const obstacles = (tpl.obstacles || []).map((o) => ({ x: X(o.x), y: Y(o.y), w: arena.w * o.w, h: arena.h * o.h }));
  const traps = (tpl.traps || []).map((t) => {
    const r = { ...t };
    if (t.kind === 'turret') {
      r.x = t.wall === 'right' ? b.r - 10 : b.l + 10;
      r.y = Y(t.y);
      r.len = arena.w - 20;
    } else if (t.kind === 'vent') {
      r.x = X(t.x);
      r.y = t.wall === 'bottom' ? b.b - 10 : b.t + 10;
    } else if (t.kind === 'saw') {
      r.x = X(t.x); r.y = Y(t.y); r.x2 = X(t.x2); r.y2 = Y(t.y2);
    } else if (t.w !== undefined) {
      r.x = X(t.x); r.y = Y(t.y); r.w = arena.w * t.w; r.h = arena.h * t.h;
    } else {
      r.x = X(t.x); r.y = Y(t.y);
    }
    return r;
  });
  const surfaces = (tpl.surfaces || []).map((s) => ({ ...s, x: X(s.x), y: Y(s.y) }));
  return { obstacles, traps, surfaces };
}

/**
 * Can the player walk from the start to every door? A coarse grid flood-fill
 * treating obstacles and pits as walls. Layouts that fail lose their pits.
 */
export function pathClear(obstacles, traps, start, targets) {
  const b = arenaBounds();
  const cell = 20;
  const cols = Math.ceil((b.r - b.l) / cell), rows = Math.ceil((b.b - b.t) / cell);
  const blocked = new Uint8Array(cols * rows);
  const pad = 14;
  const walls = [...obstacles, ...traps.filter((t) => t.kind === 'chasm')];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = b.l + (cx + 0.5) * cell, y = b.t + (cy + 0.5) * cell;
      if (walls.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad)) {
        blocked[cy * cols + cx] = 1;
      }
    }
  }
  const idx = (x, y) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - b.l) / cell)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((y - b.t) / cell)));
    return cy * cols + cx;
  };
  const seen = new Uint8Array(cols * rows);
  const q = [idx(start.x, start.y)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    const cx = i % cols, cy = (i / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen[j] || blocked[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return targets.every((t) => seen[idx(t.x, t.y)]);
}

// --- special chambers ------------------------------------------------------------

export const SPECIAL_ROOMS = {
  trial:    { label: 'Trial',    color: '#ff9a4d', glyph: '⏱', desc: 'Clear it against the clock for a rare boon.' },
  shrine:   { label: 'Shrine',   color: '#c07bff', glyph: '☥', desc: 'Accept a curse for a rare boon.' },
  fountain: { label: 'Fountain', color: '#7dff9c', glyph: '⛲', desc: 'Rest: heal and refill Focus.' },
  treasure: { label: 'Treasure', color: '#ffc861', glyph: '⚱', desc: 'Urns full of loot.' },
  gauntlet: { label: 'Gauntlet', color: '#e6e0f2', glyph: '⚙', desc: 'Survive the traps to the gold.' },
};

/** Which special door (if any) to offer next to a normal one. */
export function rollSpecial(depth, last) {
  if (depth < 2 || Math.random() > 0.32) return null;
  const pool = shuffle(Object.keys(SPECIAL_ROOMS).filter((k) => k !== last));
  return pool[0] || null;
}

/** Layouts for the no-fight special rooms. */
export function specialLayout(kind) {
  switch (kind) {
    case 'fountain':
      return { obstacles: [pillar(0.2, 0.3), pillar(0.75, 0.3)], traps: [{ kind: 'urn', x: 0.1, y: 0.7 }], fountain: { x: 0.5, y: 0.42 } };
    case 'treasure': {
      const traps = [];
      for (let k = 0; k < 8; k++) traps.push({ kind: 'urn', x: 0.15 + (k % 4) * 0.23, y: k < 4 ? 0.3 : 0.62, loot: k % 3 === 0 ? 'focus' : 'gold' });
      traps.push({ kind: 'barrel', x: 0.5, y: 0.46 });
      return { obstacles: [], traps };
    }
    case 'gauntlet':
      return {
        obstacles: [],
        traps: [
          { kind: 'saw', x: 0.1, y: 0.28, x2: 0.9, y2: 0.28, speed: 200 },
          { kind: 'saw', x: 0.9, y: 0.5, x2: 0.1, y2: 0.5, speed: 170 },
          { kind: 'vent', wall: 'bottom', x: 0.2, angle: -Math.PI / 2, len: 150 },
          { kind: 'vent', wall: 'bottom', x: 0.8, angle: -Math.PI / 2, len: 150 },
          { kind: 'spikes', x: 0.35, y: 0.62 }, { kind: 'spikes', x: 0.65, y: 0.62 },
          { kind: 'spikes', x: 0.5, y: 0.4 },
        ],
      };
    case 'shrine':
      return { obstacles: [pillar(0.3, 0.3), pillar(0.64, 0.3)], traps: [], altar: { x: 0.5, y: 0.4 } };
    default:
      return { obstacles: [], traps: [] };
  }
}

export const CURSES = [
  { id: 'haste', name: 'Pact of Haste', desc: 'Enemies are Hasted (+30% speed) for the next 3 chambers.' },
  { id: 'glass', name: 'Pact of Glass', desc: 'You take +25% damage for the next 3 chambers.' },
  { id: 'embers', name: 'Pact of Embers', desc: 'Every enemy spawns Fire-touched for the next 3 chambers.' },
];

export function randomCurse() { return pick(CURSES); }

