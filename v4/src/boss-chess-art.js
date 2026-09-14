// The Grandmaster — the drawing: the board (and the squares about to be
// struck), the King, his pieces, and the banners. boss-chess.js and
// boss-chess-board.js own the fight; this only reads their fields.

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp } from './util.js';

const PI = Math.PI;
export const IVORY = '#efe2c4';
export const EBONY = '#1c1418';
export const GOLDC = '#e8c060';
export const THREAT = '#ff4d5e';
export const ROYAL = '#7a3aa8';

/** Squares, the frame, file letters, and every lit or struck square. */
export function drawBoard(ctx, e, t) {
  const b = arenaBounds();
  ctx.fillStyle = '#140e0c';
  ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
  if (!e || !e.board) return;
  const B = e.board;
  const flip = e.flipped ? 1 : 0;
  const light = flip ? '#3a2a24' : '#d8c8a4';
  const dark = flip ? '#d8c8a4' : '#5a3e2c';
  for (let r = 0; r < B.rows; r++) {
    for (let c = 0; c < B.cols; c++) {
      ctx.fillStyle = (c + r) % 2 ? dark : light;
      ctx.fillRect(B.x0 + c * B.S, B.y0 + r * B.S, B.S, B.S);
    }
  }
  // A varnish sheen, so the board reads as wood rather than flat colour.
  const g = ctx.createLinearGradient(B.x0, B.y0, B.x0 + B.cols * B.S, B.y0 + B.rows * B.S);
  g.addColorStop(0, 'rgba(255,240,210,0.08)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(255,240,210,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(B.x0, B.y0, B.cols * B.S, B.rows * B.S);
  ctx.strokeStyle = GOLDC;
  ctx.lineWidth = 3;
  ctx.strokeRect(B.x0, B.y0, B.cols * B.S, B.rows * B.S);

  // Zugzwang: the square you've lingered on warms toward a strike.
  if (e.zug && e.zug.cell) {
    const [c, r] = e.zug.cell;
    ctx.fillStyle = `rgba(255,150,40,${clamp(e.zug.stay / e.zug.limit, 0, 1) * 0.55})`;
    ctx.fillRect(B.x0 + c * B.S, B.y0 + r * B.S, B.S, B.S);
  }

  // Squares under attack: they fill as the strike nears, then flash.
  const now = world.runTime;
  for (const s of e.strikes || []) {
    for (const cell of s.cells) {
      const x = B.x0 + cell.c * B.S, y = B.y0 + cell.r * B.S;
      if (now < cell.at) {
        const k = clamp(1 - (cell.at - now) / s.warn, 0, 1);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.14 + k * 0.42;
        ctx.fillRect(x + 2, y + 2, B.S - 4, B.S - 4);
        ctx.globalAlpha = 0.5 + k * 0.5;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, B.S - 8, B.S - 8);
      }
    }
  }
  for (const f of e.flashes || []) {
    ctx.globalAlpha = clamp(f.t / 0.25, 0, 1) * 0.7;
    ctx.fillStyle = f.color || '#ffffff';
    ctx.fillRect(B.x0 + f.c * B.S, B.y0 + f.r * B.S, B.S, B.S);
  }
  ctx.globalAlpha = 1;
}

/** A top-down chessman: a round base and the piece's silhouette on it. */
function pieceShape(ctx, type, s, fill, trim) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.35, s * 0.95, s * 0.45, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = trim;
  switch (type) {
    case 'pawn':
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.32, 0, TAU); ctx.fill();
      break;
    case 'rook':
      ctx.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
      ctx.fillStyle = fill;
      for (const x of [-0.3, 0.02]) ctx.fillRect(s * x, -s * 0.45, s * 0.28, s * 0.22);
      break;
    case 'bishop':
      ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.32, s * 0.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = fill;
      ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.3); ctx.lineTo(s * 0.15, 0); ctx.stroke();
      break;
    case 'knight':
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, s * 0.45); ctx.lineTo(-s * 0.3, -s * 0.2); ctx.lineTo(0, -s * 0.55);
      ctx.lineTo(s * 0.45, -s * 0.2); ctx.lineTo(s * 0.2, -s * 0.05); ctx.lineTo(s * 0.25, s * 0.45);
      ctx.closePath(); ctx.fill();
      break;
    case 'queen':
      for (let k = 0; k < 5; k++) {
        const a = -PI / 2 + (k - 2) * 0.45;
        ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45 + s * 0.1, s * 0.12, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.3, 0, TAU); ctx.fill();
      break;
    default: break;
  }
}

/** A piece, drawn by its own enemy def (so it keeps its health bar). */
export function drawChessman(e, ctx) {
  const t = world.runTime;
  const flip = e.flipped;
  const fill = e.flash > 0 ? '#ffffff' : flip ? IVORY : EBONY;
  const trim = flip ? EBONY : GOLDC;
  const lift = e.hop ? Math.sin(clamp(e.hop, 0, 1) * PI) * 26 : 0;
  ctx.save();
  ctx.translate(e.x, e.y - lift);
  if (e.spawnK !== undefined && e.spawnK < 1) ctx.scale(e.spawnK, e.spawnK);
  pieceShape(ctx, e.piece, e.r, fill, trim);
  if (e.piece === 'queen') {
    ctx.globalAlpha = 0.4 + Math.sin(t * 6) * 0.2;
    ctx.strokeStyle = GOLDC;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.15, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** The Grandmaster, the King: a robe, a crowned head with its cross, a sceptre. */
export function drawKing(ctx, e, t) {
  const r = e.r;
  const flip = e.flipped;
  const robe = e.flash > 0 ? '#ffffff' : flip ? IVORY : EBONY;
  const trim = flip ? EBONY : GOLDC;
  ctx.save();
  ctx.translate(e.x, e.y);
  // Royal aura while his pieces protect him.
  if (e.protectedK > 0) {
    ctx.globalAlpha = 0.25 + Math.sin(t * 5) * 0.1;
    ctx.strokeStyle = ROYAL;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.rotate(e.face || 0);
  // Cape.
  ctx.fillStyle = ROYAL;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.9);
  ctx.quadraticCurveTo(-r * 1.7, -r * 0.4, -r * 1.6, 0);
  ctx.quadraticCurveTo(-r * 1.7, r * 0.4, -r * 0.2, r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f0ff';
  for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(-r * 1.4 + (k % 2) * 6, (k - 2) * r * 0.3, 2.2, 0, TAU); ctx.fill(); }
  // Robe.
  ctx.fillStyle = robe;
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // Sceptre.
  ctx.strokeStyle = trim;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.7); ctx.lineTo(r * 1.4, r * 0.95); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = e.sceptreGlow > 0 ? '#ffffff' : '#c8304a';
  ctx.beginPath(); ctx.arc(r * 1.45, r * 0.97, r * 0.16, 0, TAU); ctx.fill();
  // Head and crown with its cross (tipped askew once the board flips).
  ctx.fillStyle = '#e8d8c8';
  ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 0.38, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(r * 0.1, 0);
  if (flip) ctx.rotate(0.35);
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.44, 0, TAU); ctx.lineWidth = r * 0.12; ctx.strokeStyle = trim; ctx.stroke();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.44, Math.sin(a) * r * 0.44, r * 0.09, 0, TAU); ctx.fill();
  }
  ctx.fillRect(-r * 0.05, -r * 0.22, r * 0.1, r * 0.44);
  ctx.fillRect(-r * 0.2, -r * 0.05, r * 0.4, r * 0.1);
  ctx.restore();
  ctx.restore();
}

/** The chess clock, the CHECK banner, and the phase banner. */
export function drawChessExtras(ctx, e, t) {
  const b = arenaBounds();
  // The clock: his time, and BLITZ when the tempo breaks.
  const cx = (b.l + b.r) / 2, cy = b.t + 16;
  ctx.fillStyle = 'rgba(10,6,10,0.75)';
  ctx.fillRect(cx - 70, cy - 12, 140, 24);
  ctx.strokeStyle = GOLDC;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 70, cy - 12, 140, 24);
  ctx.fillStyle = e.blitz > 0 ? THREAT : IVORY;
  ctx.font = '800 13px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const secs = Math.floor(e.clock || 0);
  ctx.fillText(e.blitz > 0 ? `BLITZ  ${secs}` : `♚  ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, cx, cy + 1);
  // CHECK: the banner, and the time left to get off an attacked square.
  if (e.checkUntil && world.runTime < e.checkUntil) {
    const left = e.checkUntil - world.runTime;
    ctx.globalAlpha = 0.75 + Math.sin(t * 16) * 0.25;
    ctx.fillStyle = THREAT;
    ctx.font = '900 40px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(e.checkLabel || 'CHECK!', cx, b.t + arena.h * 0.2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = IVORY;
    ctx.font = '700 14px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(`find a safe square · ${left.toFixed(1)}`, cx, b.t + arena.h * 0.2 + 30);
  }
  if (e.exposed > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (e.action === 'phase') {
    const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
    ctx.globalAlpha = Math.sin(k * PI);
    ctx.fillStyle = GOLDC;
    ctx.font = '900 46px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText('THE BOARD FLIPS', cx, b.t + arena.h * 0.3);
    ctx.globalAlpha = 1;
  }
}
