// ============================================================================
// THE GRANDMASTER, KING OF THE LIVING BOARD — the whole arena is a chessboard.
// "Every move you make, I have already seen. Your move."
//
// THE PIECES obey the rules of chess, and every attack is shown as lit
// squares before it strikes:
//   Pawns march forward and strike diagonally; stand right in front of one
//   and it can't advance. A pawn that reaches the far rank becomes a Queen.
//   Rooks strike along ranks and files, bishops along diagonals (both stop at
//   the first piece in their way — hide behind a piece), knights leap in an L
//   and then threaten all eight squares around them (the fork), and the
//   Queen does all of it.
// CAPTURE his pieces: strike them down. While three or more stand guard, the
// King is PROTECTED (half damage).
// CHECK! (signature): every square his pieces attack lights up at once. Get to
// a square nobody attacks before the time runs out — or it's checkmate.
//
// King's moves: Opening, Pawn Storm, Rook's File, Bishop's Diagonal, Knight's
// Fork, the Queen's Sweep, CHECK, Castling, Royal Guard, Royal Decree, and
// SCHOLAR'S MATE (the phase-1 barrage).
// Phase 2 — THE BOARD FLIPS: colours invert and his pawns march the other
// way; Promotion, BLITZ (his pieces move in a flurry), ZUGZWANG (stand still
// and your own square strikes), and CHECKMATE IN THREE.
// ============================================================================

import { world } from './state.js';
import { TAU, clamp, rand, dist, lerp } from './util.js';
import { sub, idle, expose, shot } from './boss-kit.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import {
  ROOK_DIRS, BISHOP_DIRS, KING_DIRS, KNIGHT_JUMPS,
  makeBoard, cellCenter, cellOf, inBoard, livePieces, occupant, uniqCells,
  strikeTogether, strikeAlong, updateStrikes, spawnPiece, movePiece, updatePieces, rayCells, attackCells, freeCellNear,
} from './boss-chess-board.js';
import { drawBoard, drawKing, drawChessExtras, GOLDC, THREAT } from './boss-chess-art.js';

const PI = Math.PI;

const p2 = (e) => e.phase >= 2;
const warnT = (e) => (e.blitz > 0 ? 0.5 : p2(e) ? 0.7 : 0.85);
const stepT = (e) => (p2(e) ? 0.055 : 0.07);
const pcell = (e, p) => cellOf(e.board, p.x, p.y);
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const pick = (list) => list[Math.floor(rand(0, list.length))];

function say(e, text, color = GOLDC) {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

/** A piece of a type, taken from the board if one stands free, else summoned near (c, r). */
function piece(e, type, c, r) {
  const have = livePieces(e).find((q) => q.piece === type && !q.move);
  if (have && c === undefined) return have;
  const at = freeCellNear(e, c ?? 0, r ?? 0);
  return at ? spawnPiece(e, type, at[0], at[1]) : null;
}

/** Timed cells along a path starting after `delay`, one `step` apart. */
function timed(list, delay, step) {
  const t0 = world.runTime + delay;
  return list.map(([c, r], i) => ({ c, r, at: t0 + i * step }));
}

/** A sliding piece strikes down a line and travels it (stopping short of a blocker). */
function slideStrike(e, q, dir, dmg = 0.8) {
  const path = rayCells(e, q.c, q.r, dir[0], dir[1]);
  if (!path.length) return 0;
  const w = warnT(e), st = stepT(e);
  strikeAlong(e, path, w, st, { dmg, color: THREAT });
  const walk = path.filter(([c, r]) => !occupant(e, c, r));
  if (walk.length) movePiece(q, timed(walk, w, st));
  return w + path.length * st;
}

/** The direction from (c, r) whose line runs through the player (or null). */
function lineTo(from, to, dirs) {
  const dc = to[0] - from[0], dr = to[1] - from[1];
  for (const d of dirs) {
    if (d[0] === 0 && dc !== 0) continue;
    if (d[1] === 0 && dr !== 0) continue;
    const kc = d[0] ? dc / d[0] : null, kr = d[1] ? dr / d[1] : null;
    const k = kc ?? kr;
    if (k > 0 && (kc === null || kr === null || kc === kr) && Number.isInteger(k)) return d;
  }
  return null;
}

/** A free square `k` steps back from the player along -dir, for a slider to strike from. */
function lineStart(e, p, dir, kMin = 4, kMax = 7) {
  const [pc, pr] = pcell(e, p);
  for (let k = kMax; k >= kMin; k--) {
    const c = pc - dir[0] * k, r = pr - dir[1] * k;
    if (inBoard(e.board, c, r) && !occupant(e, c, r)) return [c, r];
  }
  for (let k = kMin - 1; k >= 2; k--) {
    const c = pc - dir[0] * k, r = pr - dir[1] * k;
    if (inBoard(e.board, c, r) && !occupant(e, c, r)) return [c, r];
  }
  return null;
}

/** CHECK: every attacked square strikes at once after `time` seconds. */
function declareCheck(e, time, label = 'CHECK!') {
  const B = e.board;
  const total = B.cols * B.rows;
  const sets = livePieces(e).filter((q) => !q.move).map((q) => attackCells(e, q)).sort((a, b) => a.length - b.length);
  let cells = [];
  for (const s of sets) {
    const next = uniqCells([...cells, ...s]);
    if (next.length > total * 0.72 && cells.length) break;     // always leave somewhere to stand
    cells = next;
  }
  cells = uniqCells([...cells, ...KING_DIRS.map(([dc, dr]) => [e.cell[0] + dc, e.cell[1] + dr]).filter(([c, r]) => inBoard(B, c, r))]);
  if (!cells.length) return;
  strikeTogether(e, cells, time, {
    dmg: 1.2, color: THREAT,
    onHit: () => { damageText(world.player.x, world.player.y - 40, 'CHECKMATE!', { color: THREAT, size: 20 }); shake(0.7); },
    onDone: (s) => { if (!s.hit && world.player) damageText(world.player.x, world.player.y - 40, 'ESCAPED', { color: '#7dff9c', size: 15 }); flash(0.2, THREAT); },
  });
  e.checkUntil = world.runTime + time;
  e.checkLabel = label;
  sfx.bell();
  say(e, label, THREAT);
}

/** Knight's fork: leap onto (or next to) you, then threaten the eight squares around. */
function forkJump(e, p) {
  const [pc, pr] = pcell(e, p);
  const land = occupant(e, pc, pr) ? freeCellNear(e, pc, pr) : [pc, pr];
  if (!land) return;
  const starts = KNIGHT_JUMPS.map(([dc, dr]) => [land[0] + dc, land[1] + dr]).filter(([c, r]) => inBoard(e.board, c, r) && !occupant(e, c, r));
  if (!starts.length) return;
  const from = pick(starts);
  const q = spawnPiece(e, 'knight', from[0], from[1]);
  if (!q) return;
  const w = warnT(e);
  strikeTogether(e, [land], w, { dmg: 0.8, color: THREAT });
  movePiece(q, [{ c: land[0], r: land[1], at: world.runTime + w }], true);
  const fork = KNIGHT_JUMPS.map(([dc, dr]) => [land[0] + dc, land[1] + dr]).filter(([c, r]) => inBoard(e.board, c, r));
  strikeTogether(e, fork, w + 0.5, { dmg: 0.6, color: '#ffb35e' });
}

/** Keep the board from filling up: the oldest pieces leave. */
function capPieces(e) {
  const cap = p2(e) ? 10 : 7;
  const live = livePieces(e);
  while (live.length > cap) {
    const q = live.shift();
    if (q.move) continue;
    q.dead = true;
    burst(q.x, q.y, { count: 10, color: GOLDC, speed: 150, size: 3, life: 0.4, drag: 4 });
  }
}

/** Royal guard: his eight squares strike (and nobody hugs a king for free). */
function guardStrike(e, w) {
  const cells = KING_DIRS.map(([dc, dr]) => [e.cell[0] + dc, e.cell[1] + dr]).filter(([c, r]) => inBoard(e.board, c, r));
  strikeTogether(e, cells, w, { dmg: 0.7, color: '#b48cff' });
}

export const GRANDMASTER = {
  phases: [0.5],
  phaseTime: 2.5,
  roarPitch: 0.8,
  opening: { check: 7, castle: 10, queen: 8, scholar: 16, promote: 99, blitz: 99, zugzwang: 99, mate3: 99 },

  /** The board is the whole arena; the pieces are the obstacles. */
  arena() { return []; },

  init(e) {
    e.board = makeBoard();
    e.pieces = [];
    e.strikes = [];
    e.flashes = [];
    e.flipped = false;
    e.pawnDir = 1;
    e.clock = 0;
    e.blitz = 0;
    e.zug = null;
    e.checkUntil = 0;
    e.cell = cellOf(e.board, e.x, e.y);
    [e.x, e.y] = cellCenter(e.board, e.cell[0], e.cell[1]);
    e.stepT = 1.0;
    e.face = PI / 2;
    e.guardFn = (self) => {
      const need = p2(self) ? 4 : 3;
      if (livePieces(self).length < need) return 1;
      const now = world.runTime;
      if ((self.protSay || -9) < now - 0.6) { self.protSay = now; damageText(self.x, self.y - self.r - 14, 'PROTECTED', { color: '#b48cff', size: 13 }); }
      return 0.5;
    };
    sfx.chessClock();
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    e.clock += dt;
    e.blitz = Math.max(0, e.blitz - dt);
    e.sceptreGlow = Math.max(0, (e.sceptreGlow || 0) - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    e.protectedK = livePieces(e).length >= (p2(e) ? 4 : 3) ? 1 : 0;
    updateStrikes(e, dt, p);
    updatePieces(e, dt);
    capPieces(e);

    // The King glides square to square.
    if (e.glide) {
      e.glide.t += dt;
      const k = clamp(e.glide.t / e.glide.dur, 0, 1);
      e.x = lerp(e.glide.x0, e.glide.x1, k);
      e.y = lerp(e.glide.y0, e.glide.y1, k);
      if (k >= 1) e.glide = null;
    }

    // Zugzwang: linger on one square and it strikes.
    if (e.zug) {
      if (world.runTime > e.zug.until) e.zug = null;
      else {
        const c = pcell(e, p);
        if (!e.zug.cell || e.zug.cell[0] !== c[0] || e.zug.cell[1] !== c[1]) { e.zug.cell = c; e.zug.stay = 0; }
        else {
          e.zug.stay += dt;
          if (e.zug.stay >= e.zug.limit) { strikeTogether(e, [c], 0.3, { dmg: 0.6, color: '#ff9a3d' }); e.zug.stay = -0.3; }
        }
      }
    }

    if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + 6 && e.touchCd <= 0) {
      if (world.player && !p.dead) { e.touchCd = 0.6; strikeTogether(e, [pcell(e, p)], 0.05, { dmg: 0.4, color: '#b48cff' }); }
    }
  },

  /** A king moves one square at a time, keeping a few squares between you. */
  idle(e, dt, p) {
    if (e.glide || (e.stepT -= dt) > 0) return;
    e.stepT = p2(e) ? 0.45 : 0.6;
    const pc = pcell(e, p);
    let best = null, bestS = -1e9;
    for (const [dc, dr] of KING_DIRS) {
      const c = e.cell[0] + dc, r = e.cell[1] + dr;
      if (!inBoard(e.board, c, r) || occupant(e, c, r)) continue;
      const s = -Math.abs(cheb([c, r], pc) - 5) + rand(0, 0.6);
      if (s > bestS) { bestS = s; best = [c, r]; }
    }
    if (!best) return;
    const [x1, y1] = cellCenter(e.board, best[0], best[1]);
    e.glide = { x0: e.x, y0: e.y, x1, y1, t: 0, dur: 0.22 };
    e.face = Math.atan2(y1 - e.y, x1 - e.x);
    e.cell = best;
    sfx.clack(0.8);
  },

  choose(e, p) {
    const live = livePieces(e);
    const pawns = live.filter((q) => q.piece === 'pawn').length;
    const near = cheb(e.cell, pcell(e, p)) <= 2;
    const pool = [
      ['opening', live.length < 3 ? 4 : 0.5],
      ['pawnstorm', pawns ? 2.4 : 0.8],
      ['rook', 2.2], ['bishop', 2.2], ['knight', 2.2], ['queen', 1.6],
      ['check', live.length >= 2 ? 2.8 : 0],
      ['castle', live.some((q) => q.piece === 'rook') ? 1.2 : 0],
      ['guard', near ? 8 : 0.3],
      ['decree', 1.8],
    ];
    if (!p2(e)) pool.push(['scholar', 3]);
    else pool.push(['promote', pawns ? 2 : 0.8], ['blitz', 2.4], ['zugzwang', e.zug ? 0 : 1.8], ['mate3', 3.2]);
    return pool;
  },

  // --- phase 2: THE BOARD FLIPS --------------------------------------------------------
  onPhase(e) {
    e.strikes = [];
    e.checkUntil = 0;
    e.zug = null;
    e.marks = {};
    say(e, 'Now we play for real.', GOLDC);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.face += dt * 3;
    once('flip', 0.5, () => {
      e.flipped = true;
      e.pawnDir = -1;
      flash(0.5, '#ffffff');
      shake(0.7);
      sfx.explode();
      for (const q of livePieces(e)) ring(q.x, q.y, { r0: 6, r1: 50, color: GOLDC, life: 0.4, width: 3 });
    });
  },
  afterPhase(e) {
    Object.assign(e.cool, { blitz: 3, zugzwang: 6, promote: 4, mate3: 12 });
  },

  moves: {
    // Opening Move: pawns take the rank in front of him, and a knight comes out.
    opening: {
      cooldown: 10,
      start(e, p) {
        const B = e.board;
        const rank = e.pawnDir > 0 ? 1 : B.rows - 2;
        const [pc] = pcell(e, p);
        for (const off of [-4, -2, 0, 2, 4]) {
          const c = clamp(pc + off, 0, B.cols - 1);
          if (!occupant(e, c, rank)) spawnPiece(e, 'pawn', c, rank);
        }
        piece(e, 'knight', e.cell[0] + 1, e.cell[1] + 1);
        say(e, 'Your move.');
        sub(e, 'set', 0.8);
      },
      update(e) { if (e.t <= 0) idle(e, 0.3); },
    },

    // Pawn Storm: three advances. Each pawn steps forward — unless you stand
    // right in front of it — and strikes the two squares diagonally ahead.
    pawnstorm: {
      cooldown: 7,
      start(e, p) {
        if (!livePieces(e).some((q) => q.piece === 'pawn')) GRANDMASTER.moves.opening.start(e, p);
        e.left = 3;
        sub(e, 'step', 0.3);
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const w = warnT(e);
        for (const q of livePieces(e)) {
          if (q.piece !== 'pawn' || q.move) continue;
          strikeTogether(e, attackCells(e, q), w, { dmg: 0.55, color: THREAT });
          const c = q.c, r = q.r + e.pawnDir;
          const blocked = !inBoard(e.board, c, r) || occupant(e, c, r) || (() => { const [a, b2] = pcell(e, p); return a === c && b2 === r; })();
          if (!blocked) movePiece(q, [{ c, r, at: world.runTime + w }]);
        }
        sfx.chessClock();
        e.left--;
        if (e.left > 0) e.t = w + 0.25; else idle(e, 0.4);
      },
    },

    // Rook's File: a rook sets down at the end of your rank or file, the line
    // lights, and it thunders down it (two rooks at once in phase 2).
    rook: {
      cooldown: 5,
      start(e, p) {
        const dirs = p2(e) ? [pick([[1, 0], [-1, 0]]), pick([[0, 1], [0, -1]])] : [pick(ROOK_DIRS)];
        let longest = 0;
        for (const dir of dirs) {
          const from = lineStart(e, p, dir, 4, 9);
          if (!from) continue;
          const q = spawnPiece(e, 'rook', from[0], from[1]);
          if (q) longest = Math.max(longest, slideStrike(e, q, dir, 0.8));
        }
        sub(e, 'wait', longest + 0.2);
      },
      update(e) { if (e.t <= 0) idle(e, 0.3); },
    },

    // Bishop's Diagonal: the same along a diagonal (a cross of two in phase 2).
    bishop: {
      cooldown: 5,
      start(e, p) {
        const dirs = p2(e) ? [pick([[1, 1], [-1, -1]]), pick([[1, -1], [-1, 1]])] : [pick(BISHOP_DIRS)];
        let longest = 0;
        for (const dir of dirs) {
          const from = lineStart(e, p, dir, 3, 6);
          if (!from) continue;
          const q = spawnPiece(e, 'bishop', from[0], from[1]);
          if (q) longest = Math.max(longest, slideStrike(e, q, dir, 0.8));
        }
        sub(e, 'wait', longest + 0.2);
      },
      update(e) { if (e.t <= 0) idle(e, 0.3); },
    },

    // Knight's Fork: knights leap onto your square in an L — then threaten
    // all eight squares around where they land.
    knight: {
      cooldown: 6,
      start(e, p) { e.left = p2(e) ? 3 : 2; forkJump(e, p); sub(e, 'next', 0.9); },
      update(e, dt, p) {
        if (e.t > 0) return;
        e.left--;
        if (e.left > 0) { forkJump(e, p); e.t = 0.9; } else idle(e, 0.4);
      },
    },

    // The Queen's Sweep: the queen strikes three lines through you — rank,
    // file or diagonal — moving into place before each.
    queen: {
      cooldown: 9,
      start(e, p) {
        const [pc, pr] = pcell(e, p);
        e.queen = piece(e, 'queen', pc > e.board.cols / 2 ? 0 : e.board.cols - 1, pr);
        e.left = 3;
        say(e, 'My Queen.', GOLDC);
        sub(e, 'place', 0.3);
      },
      update(e, dt, p) {
        const Q = e.queen;
        if (!Q || Q.dead) { idle(e, 0.3); return; }
        if (e.t > 0 || Q.move) return;
        if (e.sub === 'done') { idle(e, 0.3); return; }
        if (e.sub === 'place') {
          const dir = pick(KING_DIRS);
          const from = lineStart(e, p, dir, 3, 6);
          if (!from) { e.t = 0.2; return; }
          e.qdir = dir;
          movePiece(Q, [{ c: from[0], r: from[1], at: world.runTime + 0.3 }]);
          sub(e, 'strike', 0.35);
          return;
        }
        const end = slideStrike(e, Q, e.qdir, 0.9);
        e.left--;
        if (e.left > 0) sub(e, 'place', end + 0.15); else sub(e, 'done', end + 0.3);
      },
    },

    // CHECK!: every square his pieces attack lights up at once. Find a square
    // nobody attacks — behind a piece, off the lines, out of the knight's
    // reach — before the strike.
    check: {
      cooldown: 13,
      start(e) {
        declareCheck(e, p2(e) ? 1.5 : 1.8);
        sub(e, 'wait', (p2(e) ? 1.5 : 1.8) + 0.3);
      },
      update(e) { if (e.t <= 0) idle(e, 0.4); },
    },

    // Castling: the King and a rook swap squares in a flash, and the squares
    // around both strike.
    castle: {
      cooldown: 12,
      start(e) {
        const R = livePieces(e).find((q) => q.piece === 'rook' && !q.move);
        if (!R) { idle(e, 0.3); return; }
        const kc = e.cell, rc = [R.c, R.r];
        R.c = kc[0]; R.r = kc[1];
        [R.x, R.y] = cellCenter(e.board, kc[0], kc[1]);
        e.cell = rc;
        [e.x, e.y] = cellCenter(e.board, rc[0], rc[1]);
        e.glide = null;
        flash(0.2, GOLDC);
        sfx.clack(1.2);
        say(e, 'Castling.', GOLDC);
        const w = warnT(e);
        guardStrike(e, w);
        strikeTogether(e, KING_DIRS.map(([dc, dr]) => [kc[0] + dc, kc[1] + dr]).filter(([c, r]) => inBoard(e.board, c, r)), w, { dmg: 0.6, color: '#b48cff' });
        sub(e, 'wait', w + 0.3);
      },
      update(e) { if (e.t <= 0) idle(e, 0.3); },
    },

    // Royal Guard: too close to a king — his eight squares strike.
    guard: {
      cooldown: 3.5,
      start(e) { guardStrike(e, 0.55); e.sceptreGlow = 0.55; sub(e, 'wait', 0.8); },
      update(e) { if (e.t <= 0) idle(e, 0.3); },
    },

    // Royal Decree: the sceptre fires along the eight directions a king may
    // move — three volleys, turning between straight and diagonal.
    decree: {
      cooldown: 6,
      start(e) { e.left = 3; e.sceptreGlow = 0.5; sub(e, 'fire', 0.45); },
      update(e) {
        if (e.t > 0) return;
        const off = e.left % 2 ? 0 : PI / 8;
        for (let k = 0; k < 8; k++) {
          for (const sp of [230, 300]) shot(e, off + (k / 8) * TAU, sp, { shape: 'orb', r: 7, color: GOLDC, dmg: 0.4, life: 4 });
        }
        sfx.chessClock();
        e.left--;
        if (e.left > 0) { e.sceptreGlow = 0.4; e.t = 0.55; } else idle(e, 0.4);
      },
    },

    // SCHOLAR'S MATE (phase-1 barrage): bishop and queen come out together,
    // two lines through you, a knight's fork — then CHECK. Then he's spent.
    scholar: {
      cooldown: 26,
      start(e) { say(e, "Scholar's Mate.", GOLDC); e.step = 0; sub(e, 'go', 0.5); },
      update(e, dt, p) {
        if (e.t > 0) return;
        const s = e.step++;
        if (s === 0) { const d = pick(BISHOP_DIRS); const f = lineStart(e, p, d, 3, 6); const q = f && spawnPiece(e, 'bishop', f[0], f[1]); e.t = (q ? slideStrike(e, q, d) : 0) + 0.2; return; }
        if (s === 1) { const d = pick(ROOK_DIRS); const f = lineStart(e, p, d, 4, 8); const q = f && spawnPiece(e, 'queen', f[0], f[1]); e.t = (q ? slideStrike(e, q, d, 0.9) : 0) + 0.2; return; }
        if (s === 2) { forkJump(e, p); e.t = 1.3; return; }
        if (s === 3) { declareCheck(e, 1.6); e.t = 1.9; return; }
        expose(e, 2.2);
      },
    },

    // --- phase 2 ---------------------------------------------------------------------

    // Promotion: his pawns become knights, bishops, rooks and queens.
    promote: {
      cooldown: 14,
      start(e, p) {
        const pawns = livePieces(e).filter((q) => q.piece === 'pawn');
        if (!pawns.length) GRANDMASTER.moves.opening.start(e, p);
        sub(e, 'crown', 0.8);
      },
      update(e) {
        if (e.t > 0) return;
        for (const q of livePieces(e)) {
          if (q.piece !== 'pawn') continue;
          q.piece = pick(['knight', 'bishop', 'rook', 'queen']);
          damageText(q.x, q.y - 30, 'PROMOTION!', { color: GOLDC, size: 14 });
          ring(q.x, q.y, { r0: 6, r1: 50, color: GOLDC, life: 0.4, width: 3 });
        }
        sfx.chime();
        idle(e, 0.4);
      },
    },

    // BLITZ: the clock runs wild — his pieces take turns attacking, fast.
    blitz: {
      cooldown: 18,
      start(e, p) {
        if (livePieces(e).length < 3) { forkJump(e, p); const d = pick(ROOK_DIRS); const f = lineStart(e, p, d, 4, 8); if (f) spawnPiece(e, 'rook', f[0], f[1]); }
        e.blitz = 6;
        e.turn = 0;
        say(e, 'BLITZ!', THREAT);
        sfx.chessClock();
        sub(e, 'turns', 6);
        e.turnT = 0.2;
      },
      update(e, dt, p) {
        if ((e.turnT -= dt) <= 0) {
          e.turnT = 0.55;
          const live = livePieces(e).filter((q) => !q.move);
          if (live.length) {
            const q = live[e.turn++ % live.length];
            const pc = pcell(e, p);
            if (q.piece === 'knight') forkJump(e, p);
            else if (q.piece === 'pawn') strikeTogether(e, attackCells(e, q), warnT(e), { dmg: 0.55 });
            else {
              const dirs = q.piece === 'rook' ? ROOK_DIRS : q.piece === 'bishop' ? BISHOP_DIRS : KING_DIRS;
              const d = lineTo([q.c, q.r], pc, dirs) || pick(dirs);
              slideStrike(e, q, d, 0.75);
            }
            sfx.chessClock();
          }
        }
        if (e.t <= 0) idle(e, 0.4);
      },
    },

    // ZUGZWANG: for a while, you must keep moving — linger on one square and
    // it strikes. He fights on meanwhile.
    zugzwang: {
      cooldown: 20,
      start(e) { e.zug = { until: world.runTime + 8, cell: null, stay: 0, limit: 0.8 }; say(e, 'Zugzwang. Keep moving.', '#ff9a3d'); sfx.bell(); sub(e, 'wait', 0.4); },
      update(e) { if (e.t <= 0) idle(e, 0.2); },
    },

    // CHECKMATE IN THREE (phase-2 barrage): pieces take the board, and three
    // checks come, each faster — the pieces reposition between them. Then he
    // considers resigning.
    mate3: {
      cooldown: 30,
      start(e, p) {
        const B = e.board;
        const [pc, pr] = pcell(e, p);
        for (const [type, c, r] of [['rook', 0, clamp(pr + 2, 0, B.rows - 1)], ['rook', B.cols - 1, clamp(pr - 2, 0, B.rows - 1)], ['bishop', clamp(pc - 5, 0, B.cols - 1), 0], ['knight', clamp(pc + 4, 0, B.cols - 1), B.rows - 1]]) {
          const at = freeCellNear(e, c, r);
          if (at) spawnPiece(e, type, at[0], at[1]);
        }
        say(e, 'Mate in three.', THREAT);
        e.step = 0;
        sub(e, 'go', 0.8);
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const times = [1.5, 1.2, 1.0];
        const s = e.step++;
        if (s < 3) {
          // Reposition: knights leap an L toward you; sliders shift a few squares.
          if (s > 0) {
            const pc = pcell(e, p);
            for (const q of livePieces(e)) {
              if (q.move) continue;
              if (q.piece === 'knight') {
                const opts = KNIGHT_JUMPS.map(([dc, dr]) => [q.c + dc, q.r + dr]).filter(([c, r]) => inBoard(e.board, c, r) && !occupant(e, c, r));
                if (opts.length) { opts.sort((a, b) => cheb(a, pc) - cheb(b, pc)); movePiece(q, [{ c: opts[0][0], r: opts[0][1], at: world.runTime + 0.3 }], true); }
              } else if (q.piece !== 'pawn') {
                const dirs = q.piece === 'rook' ? ROOK_DIRS : q.piece === 'bishop' ? BISHOP_DIRS : KING_DIRS;
                const d = pick(dirs);
                const path = rayCells(e, q.c, q.r, d[0], d[1], 3).filter(([c, r]) => !occupant(e, c, r));
                if (path.length) movePiece(q, timed(path, 0.05, 0.06));
              }
            }
          }
          e.t = 0.45;
          e.pendingCheck = times[s];
          sub(e, 'check', 0.45);
          return;
        }
        expose(e, 2.6);
        say(e, '…I resign? Never.', GOLDC);
      },
    },
  },

  draw(e, ctx) { drawKing(ctx, e, world.runTime); },

  drawExtras(e, ctx, t) { drawChessExtras(ctx, e, t); },

  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'grandmaster' && !q.dead) || null;
    drawBoard(ctx, e, t);
  },
};

// Mate in three: a check declared once its pieces have settled.
const mate = GRANDMASTER.moves.mate3;
const mateUpdate = mate.update;
mate.update = function update(e, dt, p) {
  if (e.sub === 'check') {
    if (e.t > 0) return;
    declareCheck(e, e.pendingCheck, `CHECK ${e.step}/3`);
    sub(e, 'go', e.pendingCheck + 0.35);
    return;
  }
  mateUpdate(e, dt, p);
};
