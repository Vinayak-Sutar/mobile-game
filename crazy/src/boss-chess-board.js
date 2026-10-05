// The Grandmaster — the board: squares, timed square strikes, and the pieces
// with their real chess moves. boss-chess.js conducts the fight with these.
//
// A strike is a set of squares that each light up `warn` seconds before
// their own moment, then strike whoever stands on them. Every attack in the
// fight — a rook's line, a knight's fork, CHECK — is made of strikes, so the
// whole fight reads the same way: lit squares are about to hurt.

import { world, arenaBounds } from './state.js';
import { clamp, lerp } from './util.js';
import { spawnEnemyFn } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { damageText } from './fx.js';
import { sfx } from './audio.js';
import { THREAT, GOLDC } from './boss-chess-art.js';

export const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const KING_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
export const KNIGHT_JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

/** Eight ranks tall, as many files as fit across the arena. */
export function makeBoard() {
  const b = arenaBounds();
  const w = b.r - b.l, h = b.b - b.t;
  const S = Math.floor(h / 8);
  const cols = Math.floor(w / S);
  return { S, cols, rows: 8, x0: b.l + (w - cols * S) / 2, y0: b.t + (h - 8 * S) / 2 };
}

export const cellCenter = (B, c, r) => [B.x0 + (c + 0.5) * B.S, B.y0 + (r + 0.5) * B.S];
export const inBoard = (B, c, r) => c >= 0 && r >= 0 && c < B.cols && r < B.rows;

export function cellOf(B, x, y) {
  return [clamp(Math.floor((x - B.x0) / B.S), 0, B.cols - 1), clamp(Math.floor((y - B.y0) / B.S), 0, B.rows - 1)];
}

export function playerOn(B, p, c, r) {
  const pad = p.r * 0.3;
  const x0 = B.x0 + c * B.S, y0 = B.y0 + r * B.S;
  return p.x > x0 - pad && p.x < x0 + B.S + pad && p.y > y0 - pad && p.y < y0 + B.S + pad;
}

export function livePieces(e) { return e.pieces.filter((q) => !q.dead); }

/** Who stands on a square: a piece, the King, or nobody. */
export function occupant(e, c, r) {
  if (e.cell && e.cell[0] === c && e.cell[1] === r) return e;
  return livePieces(e).find((q) => q.c === c && q.r === r) || null;
}

export function uniqCells(list) {
  const seen = new Set();
  const out = [];
  for (const [c, r] of list) {
    const k = c * 100 + r;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([c, r]);
  }
  return out;
}

// --- strikes ------------------------------------------------------------------------

/** Squares that strike at their own times ({ c, r, at } in run time). */
export function addStrike(e, cells, o = {}) {
  const s = { cells, warn: o.warn ?? 0.8, dmg: o.dmg ?? 0.7, color: o.color || THREAT, hit: false, onHit: o.onHit || null, onDone: o.onDone || null };
  e.strikes.push(s);
  return s;
}

/** Cells all striking together, `delay` seconds from now. */
export function strikeTogether(e, list, delay, o = {}) {
  const at = world.runTime + delay;
  return addStrike(e, list.map(([c, r]) => ({ c, r, at })), { warn: delay, ...o });
}

/** Cells striking one after another along a path, `step` seconds apart. */
export function strikeAlong(e, list, delay, step, o = {}) {
  const t0 = world.runTime + delay;
  return addStrike(e, list.map(([c, r], i) => ({ c, r, at: t0 + i * step })), { warn: delay, ...o });
}

export function updateStrikes(e, dt, p) {
  const now = world.runTime;
  for (const f of e.flashes) f.t -= dt;
  e.flashes = e.flashes.filter((f) => f.t > 0);
  for (const s of e.strikes) {
    let left = false;
    for (const cell of s.cells) {
      if (cell.done) continue;
      if (now < cell.at) { left = true; continue; }
      cell.done = true;
      e.flashes.push({ c: cell.c, r: cell.r, t: 0.25, color: s.color });
      if (!s.hit && p && !p.dead && playerOn(e.board, p, cell.c, cell.r)) {
        const [x, y] = cellCenter(e.board, cell.c, cell.r);
        if (damagePlayer(Math.round(e.damage * s.dmg), x, y, e.type)) {
          s.hit = true;
          if (s.onHit) s.onHit(s);
        }
      }
    }
    if (!left) { s.finished = true; if (s.onDone) s.onDone(s); }
  }
  e.strikes = e.strikes.filter((s) => !s.finished);
}

// --- pieces ---------------------------------------------------------------------------

export function spawnPiece(e, type, c, r) {
  const B = e.board;
  if (!inBoard(B, c, r) || occupant(e, c, r)) return null;
  const [x, y] = cellCenter(B, c, r);
  const q = spawnEnemyFn('chessman', x, y, { instant: true, summoner: e, scale: (e.scale || 1) * 0.8 });
  if (!q) return null;
  q.piece = type;
  q.c = c;
  q.r = r;
  q.spawnK = 0;
  q.flipped = e.flipped;
  q.move = null;
  q.onDeath = (self) => damageText(self.x, self.y - 30, 'CAPTURED', { color: GOLDC, size: 14 });
  e.pieces.push(q);
  sfx.clack();
  return q;
}

/** Move a piece through timed cells ({ c, r, at }); a knight hops. */
export function movePiece(q, cells, hop = false) {
  const lead = cells.length > 1 ? cells[1].at - cells[0].at : 0.2;
  q.move = { from: [q.x, q.y], fromAt: cells[0].at - (hop ? 0.35 : lead), cells, hop };
  // Its destination is taken now, so two pieces never head for one square.
  const last = cells[cells.length - 1];
  q.dest = [last.c, last.r];
}

export function updatePieces(e, dt) {
  const B = e.board;
  const now = world.runTime;
  for (const q of livePieces(e)) {
    q.flipped = e.flipped;
    if (q.spawnK < 1) q.spawnK = Math.min(1, q.spawnK + dt * 4);
    const M = q.move;
    if (!M) continue;
    let px = M.from[0], py = M.from[1], pat = M.fromAt;
    let moving = false;
    for (const cell of M.cells) {
      const [cx, cy] = cellCenter(B, cell.c, cell.r);
      if (now < cell.at) {
        const k = clamp((now - pat) / Math.max(0.01, cell.at - pat), 0, 1);
        q.x = lerp(px, cx, k);
        q.y = lerp(py, cy, k);
        if (M.hop) q.hop = k;
        moving = true;
        break;
      }
      px = cx; py = cy; pat = cell.at;
    }
    if (moving) continue;
    const last = M.cells[M.cells.length - 1];
    [q.x, q.y] = cellCenter(B, last.c, last.r);
    q.c = last.c;
    q.r = last.r;
    q.hop = 0;
    q.move = null;
    q.dest = null;
    sfx.clack(0.9);
    // A pawn that reaches the far rank becomes a queen.
    if (q.piece === 'pawn' && q.r === (e.pawnDir > 0 ? B.rows - 1 : 0)) {
      q.piece = 'queen';
      damageText(q.x, q.y - 34, 'PROMOTION!', { color: GOLDC, size: 16 });
      sfx.chime();
    }
  }
  e.pieces = e.pieces.filter((q) => !q.dead);
}

/** Squares a piece could reach along one direction, stopping at the first piece. */
export function rayCells(e, c, r, dc, dr, max = 99) {
  const out = [];
  let x = c + dc, y = r + dr, n = 0;
  while (inBoard(e.board, x, y) && n < max) {
    out.push([x, y]);
    if (occupant(e, x, y)) break;
    x += dc; y += dr; n++;
  }
  return out;
}

/** Every square a piece attacks, by the rules of chess. */
export function attackCells(e, q) {
  const B = e.board;
  switch (q.piece) {
    case 'pawn': return [[q.c - 1, q.r + e.pawnDir], [q.c + 1, q.r + e.pawnDir]].filter(([c, r]) => inBoard(B, c, r));
    case 'rook': return ROOK_DIRS.flatMap(([dc, dr]) => rayCells(e, q.c, q.r, dc, dr));
    case 'bishop': return BISHOP_DIRS.flatMap(([dc, dr]) => rayCells(e, q.c, q.r, dc, dr));
    case 'queen': return KING_DIRS.flatMap(([dc, dr]) => rayCells(e, q.c, q.r, dc, dr));
    case 'knight': return KNIGHT_JUMPS.map(([dc, dr]) => [q.c + dc, q.r + dr]).filter(([c, r]) => inBoard(B, c, r));
    default: return [];
  }
}

/** A free square near (c, r), searching outward. */
export function freeCellNear(e, c, r) {
  const B = e.board;
  for (let d = 0; d < 6; d++) {
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        const x = c + dc, y = r + dr;
        if (inBoard(B, x, y) && !occupant(e, x, y) && !livePieces(e).some((q) => q.dest && q.dest[0] === x && q.dest[1] === y)) return [x, y];
      }
    }
  }
  return null;
}
