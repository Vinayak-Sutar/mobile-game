// Drawing a dungeon floor in the 3/4 view (world space: game.js has applied the camera).
//
// Walls are blocks: a dark cap and, where a floor lies south of them, a face.
// A HOLE shows what is under it - the floor below, dim and a little lower (the
// depth) - behind the lip of the floor above; with nothing under it, only
// dark. Over everything the dungeon is dark but for the light you carry, the
// torches, the lamps and the fire. Each dungeon has its own look (THEMES in
// dungeon-levels.js): catacomb stone, cistern green, forge iron and ember,
// shrine wood and red lacquer, crypt frost.

import { world, camera, view } from './state.js';
import { TAU, clamp } from './util.js';
import {
  dungeonState, T, spikeState, ventState, bladeAt, crusherState, solidTile, holeTile, BELTS, dungeonObjective,
} from './dungeon.js';
import { THEMES } from './dungeon-levels.js';

const OUT = '#120e14';

function hash(i, j) { let h = (i * 73856093) ^ (j * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const at = (F, i, j) => (i < 0 || j < 0 || j >= F.g.length || i >= F.g[0].length ? '#' : F.g[j][i]);
const rgb = (c, d = 0) => `rgb(${c[0] + d},${c[1] + d},${c[2] + d})`;
let TH = THEMES.catacomb;

// --- tiles ------------------------------------------------------------------------------------

function floorTile(ctx, x, y, i, j, dim = 0) {
  const h = hash(i, j);
  const v = Math.floor(h * 10) - dim - 5;
  const f = TH.floor;
  if (TH.torch === 'lantern') {
    // Wooden boards, and now and then a few blossom petals blown in.
    ctx.fillStyle = rgb(f, v); ctx.fillRect(x, y, T, T);
    ctx.fillStyle = 'rgba(60,34,16,0.35)';
    for (let k = 1; k < 4; k++) ctx.fillRect(x, y + k * 16, T, 1.5);
    ctx.fillRect(x + ((i * 23 + j * 7) % 3) * 21 + 8, y, 1.5, 16); ctx.fillRect(x + ((i * 13 + j * 5) % 3) * 21 + 4, y + 32, 1.5, 16);
    ctx.fillStyle = 'rgba(255,240,210,0.06)'; ctx.fillRect(x, y + 1, T, 3);
    if (h > 0.9 && !dim) { ctx.fillStyle = 'rgba(255,170,190,0.7)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x + 14 + k * 17, y + 20 + ((k * 13) % 26), 2.6, 1.6, k, 0, TAU); ctx.fill(); } }
    return;
  }
  ctx.fillStyle = rgb(f, v); ctx.fillRect(x, y, T, T);
  // Flagstones: two by two, the seams offset every other row.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  const off = j % 2 ? 16 : 0;
  ctx.fillRect(x, y + 31, T, 2);
  ctx.fillRect(x + ((32 + off) % 64), y, 2, 31);
  ctx.fillRect(x + ((off + 8) % 64), y + 33, 2, 31);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x + 2, y + 2, 28, 3);
  if (dim) return;
  if (h > 0.82) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + 10 + h * 20, y + 12); ctx.lineTo(x + 24 + h * 10, y + 30); ctx.lineTo(x + 20, y + 46); ctx.stroke();
  }
  if (h < 0.09) {
    if (TH.decal === 'bones') { ctx.fillStyle = 'rgba(220,210,190,0.55)'; ctx.fillRect(x + 20, y + 40, 14, 3); ctx.beginPath(); ctx.arc(x + 44, y + 22, 4, 0, TAU); ctx.fill(); }
    else if (TH.decal === 'moss') { ctx.fillStyle = 'rgba(90,150,90,0.35)'; ctx.beginPath(); ctx.ellipse(x + 30, y + 40, 18, 7, 0.3, 0, TAU); ctx.fill(); }
    else if (TH.decal === 'soot') { ctx.fillStyle = 'rgba(255,120,40,0.35)'; ctx.fillRect(x + 12, y + 44, 3, 3); ctx.fillRect(x + 40, y + 18, 2, 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 32, y + 30, 16, 8, 0, 0, TAU); ctx.fill(); }
    else if (TH.decal === 'frost') { ctx.strokeStyle = 'rgba(235,248,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * 1.05; ctx.moveTo(x + 32 - Math.cos(a) * 9, y + 32 - Math.sin(a) * 9); ctx.lineTo(x + 32 + Math.cos(a) * 9, y + 32 + Math.sin(a) * 9); } ctx.stroke(); }
  } else if (h > 0.62 && h < 0.66 && TH.decal === 'moss') {
    ctx.fillStyle = 'rgba(120,180,200,0.22)'; ctx.beginPath(); ctx.ellipse(x + 40, y + 48, 14, 5, 0, 0, TAU); ctx.fill();
  }
}

function wallTile(ctx, F, x, y, i, j) {
  const c = at(F, i, j);
  const below = at(F, i, j + 1);
  const faceH = solidTile(below) ? 0 : 24;
  if (c === 'o') {
    floorTile(ctx, x, y, i, j);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 38, y + 56, 22, 8, 0, 0, TAU); ctx.fill();
    if (TH.decal === 'frost') {
      // A rock half-buried in the ice.
      ctx.fillStyle = '#6a7486'; ctx.beginPath(); ctx.ellipse(x + 32, y + 34, 26, 22, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a96aa'; ctx.beginPath(); ctx.ellipse(x + 26, y + 26, 16, 12, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(240,250,255,0.7)'; ctx.beginPath(); ctx.ellipse(x + 26, y + 16, 12, 5, -0.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x + 32, y + 34, 26, 22, 0, 0, TAU); ctx.stroke();
      return;
    }
    const lac = TH.torch === 'lantern';
    ctx.fillStyle = lac ? '#8a1e1a' : rgb(TH.wall, 16); ctx.fillRect(x + 14, y - 20, 36, 70);
    ctx.fillStyle = lac ? '#b0302a' : rgb(TH.wall, 28); ctx.fillRect(x + 14, y - 20, 12, 70);
    ctx.fillStyle = lac ? '#2a1a14' : rgb(TH.wall, 0); ctx.fillRect(x + 10, y - 26, 44, 10); ctx.fillRect(x + 10, y + 44, 44, 8);
    return;
  }
  const hv = hash(i, j) * 8;
  ctx.fillStyle = rgb(TH.wall, Math.floor(hv));
  ctx.fillRect(x, y, T, T - faceH);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, T, 3);
  if (TH.decal === 'soot' && hash(i + 3, j) > 0.8) { ctx.strokeStyle = 'rgba(255,110,40,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + 24, y + 20); ctx.lineTo(x + 20, y + 32); ctx.stroke(); }
  if (faceH) {
    const fy = y + T - faceH;
    ctx.fillStyle = TH.face; ctx.fillRect(x, fy, T, faceH);
    if (TH.torch === 'lantern') {
      // A paper wall: white panes in a dark wooden grid.
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(x, fy, T, 2); ctx.fillRect(x, fy + faceH - 3, T, 3);
      for (let k = 0; k <= 4; k++) ctx.fillRect(x + k * 16 - 1, fy, 2, faceH);
      ctx.fillRect(x, fy + 11, T, 1.5);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, fy + 11, T, 2);
      for (let k = 0; k < 4; k++) ctx.fillRect(x + ((k * 16 + (j % 2) * 8) % 64), fy, 2, 11);
      for (let k = 0; k < 4; k++) ctx.fillRect(x + ((k * 16 + 8 + (j % 2) * 8) % 64), fy + 13, 2, 11);
      if (TH.decal === 'frost') { ctx.fillStyle = 'rgba(230,245,255,0.55)'; for (let k = 0; k < 5; k++) { const ix = x + 6 + k * 13; ctx.beginPath(); ctx.moveTo(ix, fy + faceH); ctx.lineTo(ix + 3, fy + faceH + 7 + (k % 2) * 4); ctx.lineTo(ix + 6, fy + faceH); ctx.fill(); } }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y + T - 3, T, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, fy, T, 2);
  }
}

/** A hole: what is below, dim and deep, behind the lip of the floor above. */
function holeTileDraw(ctx, D, F, x, y, i, j, time) {
  const k = D.floors.indexOf(F);
  let below = null;
  for (let q = k - 1; q >= 0; q--) {
    const G = D.floors[q];
    if (solidTile(at(G, i, j))) break;
    if (!holeTile(G, i, j)) { below = G; break; }
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
  ctx.fillStyle = '#050407'; ctx.fillRect(x, y, T, T);
  if (below) {
    ctx.save();
    ctx.translate(x + T / 2, y + T / 2 + 26); ctx.scale(0.78, 0.78); ctx.translate(-(x + T / 2), -(y + T / 2));
    if (at(below, i, j) === 'I') iceTile(ctx, x, y, i, j, 0, true); else floorTile(ctx, x, y, i, j, 30);
    ctx.restore();
    ctx.fillStyle = 'rgba(6,5,14,0.72)'; ctx.fillRect(x, y, T, T);
  }
  if (!holeTile(F, i, j - 1) && !solidTile(at(F, i, j - 1))) {
    ctx.fillStyle = TH.face; ctx.fillRect(x, y, T, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + 6, T, 2);
    for (let q = 0; q < 4; q++) ctx.fillRect(x + ((q * 16 + (j % 2) * 8) % 64), y, 2, 6);
    const g = ctx.createLinearGradient(0, y + 14, 0, y + 52);
    g.addColorStop(0, rgb(TH.wall, -8)); g.addColorStop(1, 'rgba(5,4,7,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y + 14, T, 38);
  }
  const hm = hash(i + 11, j + 5);
  if (hm > 0.55) {
    ctx.fillStyle = `rgba(110,120,170,${(0.035 + 0.025 * Math.sin(time * 0.7 + hm * 9)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x + 20 + hm * 30 + Math.sin(time * 0.35 + hm * 6) * 10, y + 30 + hm * 26, 26 + hm * 14, 6, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  if (!holeTile(F, i - 1, j)) ctx.fillRect(x, y, 6, T);
  if (!holeTile(F, i + 1, j)) ctx.fillRect(x + T - 6, y, 6, T);
  ctx.restore();
}

function iceTile(ctx, x, y, i, j, time, dim = false) {
  const h = hash(i, j);
  ctx.fillStyle = dim ? '#5a7488' : `rgb(${Math.floor(176 + h * 10)},${Math.floor(208 + h * 8)},${Math.floor(228 + h * 6)})`;
  ctx.fillRect(x, y, T, T);
  if (dim) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + 6 + h * 20, y + 10); ctx.lineTo(x + 30 + h * 20, y + 4); ctx.moveTo(x + 10, y + 42 + h * 10); ctx.lineTo(x + 40, y + 34 + h * 10); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,130,160,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 20 + h * 30, y + 20); ctx.lineTo(x + 34 + h * 10, y + 52); ctx.stroke();
  const glint = (time * 0.4 + h * 7) % 3;
  if (glint < 0.25) { ctx.fillStyle = `rgba(255,255,255,${(0.8 - glint * 3).toFixed(2)})`; ctx.beginPath(); ctx.arc(x + 18 + h * 30, y + 16 + h * 30, 3, 0, TAU); ctx.fill(); }
}

function waterTile(ctx, D, x, y, i, j, time) {
  // The channel bed, and water over it as deep as the level.
  ctx.fillStyle = '#2e3a3c'; ctx.fillRect(x, y, T, T);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y, T, 6);
  const lv = D.waterLevel;
  if (lv < 0.05) {
    ctx.fillStyle = 'rgba(70,110,120,0.35)'; ctx.beginPath(); ctx.ellipse(x + 24 + hash(i, j) * 16, y + 38, 14, 5, 0, 0, TAU); ctx.fill();
    return;
  }
  ctx.fillStyle = `rgba(40,110,140,${(0.35 + 0.5 * lv).toFixed(2)})`;
  ctx.fillRect(x, y + (1 - lv) * 20, T, T - (1 - lv) * 20);
  ctx.strokeStyle = `rgba(190,235,255,${(0.35 * lv).toFixed(2)})`; ctx.lineWidth = 1.5;
  for (let k = 0; k < 2; k++) {
    const yy = y + 18 + k * 24 + Math.sin(time * 1.6 + i * 0.9 + k) * 3;
    ctx.beginPath(); ctx.moveTo(x + 6, yy); ctx.quadraticCurveTo(x + 32, yy - 4 + Math.sin(time * 2 + j) * 2, x + 58, yy); ctx.stroke();
  }
}

function stairTile(ctx, x, y, up, out) {
  for (let k = 0; k < 6; k++) {
    const yy = y + k * (T / 6);
    const v = up ? 50 + k * 8 : 70 - k * 10;
    ctx.fillStyle = `rgb(${v},${v - 4},${v + 6})`;
    ctx.fillRect(x + 4, yy, T - 8, T / 6);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 4, yy + T / 6 - 2, T - 8, 2);
  }
  ctx.fillStyle = '#2e2834'; ctx.fillRect(x, y, 5, T); ctx.fillRect(x + T - 5, y, 5, T);
  if (out) {
    const g = ctx.createLinearGradient(0, y - 40, 0, y + T);
    g.addColorStop(0, 'rgba(255,240,200,0.35)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.fillRect(x + 6, y - 40, T - 12, T + 40);
  } else if (!up) {
    const g = ctx.createLinearGradient(0, y, 0, y + T);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = g; ctx.fillRect(x, y, T, T);
  }
}

function spikes(ctx, x, y, j) {
  const st = spikeState(j);
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 2; b++) {
      const cx = x + 12 + a * 20, cy = y + 18 + b * 26 + (a % 2) * 6;
      ctx.fillStyle = '#1e1a22'; ctx.beginPath(); ctx.ellipse(cx, cy, 5, 3, 0, 0, TAU); ctx.fill();
      if (st === 'down') continue;
      const hgt = st === 'warn' ? 4 : 18;
      ctx.fillStyle = st === 'warn' ? '#9a8a8a' : '#c8ccd4';
      ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx, cy - hgt); ctx.lineTo(cx + 4, cy); ctx.closePath(); ctx.fill();
      if (st === 'up') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - hgt); ctx.lineTo(cx + 4, cy); ctx.closePath(); ctx.fill(); }
    }
  }
  if (st === 'warn') { ctx.fillStyle = 'rgba(255,90,60,0.12)'; ctx.fillRect(x, y, T, T); }
}

function chest(ctx, x, y, open, key, keyCol = '#ffffff') {
  const cx = x + T / 2, cy = y + T / 2 + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx + 4, cy + 12, 20, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = key ? '#c8c0a8' : '#6a4a2c'; ctx.fillRect(cx - 18, cy - 8, 36, 20);
  ctx.fillStyle = key ? '#8a8270' : '#4a3220'; ctx.fillRect(cx - 18, cy - 8, 36, 4);
  if (open) {
    ctx.fillStyle = key ? '#a8a090' : '#5a3a22'; ctx.fillRect(cx - 18, cy - 24, 36, 14);
    ctx.fillStyle = '#140e0a'; ctx.fillRect(cx - 15, cy - 10, 30, 5);
  } else {
    ctx.fillStyle = key ? '#d8d0b8' : '#7a5836';
    ctx.beginPath(); ctx.moveTo(cx - 18, cy - 8); ctx.quadraticCurveTo(cx, cy - 22, cx + 18, cy - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8c050'; ctx.fillRect(cx - 3, cy - 6, 6, 7);
    if (key) { ctx.globalAlpha = 0.3; ctx.fillStyle = keyCol; ctx.beginPath(); ctx.arc(cx, cy - 6, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  }
}

/** A peg: raised, a block of its colour; sunk, a flat tile of it in the floor. */
function peg(ctx, x, y, red, up) {
  const base = red ? '#c8342c' : '#2c6ad0', top = red ? '#f0584a' : '#5a98f0', dark = red ? '#6a1a16' : '#18386a';
  if (!up) {
    ctx.fillStyle = dark; ctx.fillRect(x + 10, y + 10, T - 20, T - 20);
    ctx.globalAlpha = 0.6; ctx.strokeStyle = top; ctx.lineWidth = 2; ctx.strokeRect(x + 12, y + 12, T - 24, T - 24); ctx.globalAlpha = 1;
    return;
  }
  // A block standing up: its top, and its face toward you.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + 14, T - 12, T - 12);
  ctx.fillStyle = base; ctx.fillRect(x + 6, y + 22, T - 12, T - 26);
  ctx.fillStyle = top; ctx.fillRect(x + 6, y - 2, T - 12, 26);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(x + 6, y - 2, T - 12, T - 2);
  ctx.beginPath(); ctx.moveTo(x + 6, y + 24); ctx.lineTo(x + T - 6, y + 24); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 10, y + 2, 16, 4);
}

function drawTile(ctx, D, F, i, j, time) {
  const x = i * T, y = j * T, c = at(F, i, j);
  if (c === '1' || c === '2') { floorTile(ctx, x, y, i, j); peg(ctx, x, y, c === '1', solidTile(c)); return; }
  if (c === 'O') {
    floorTile(ctx, x, y, i, j);
    const red = D.color === 'red';
    ctx.fillStyle = '#3a3036'; ctx.fillRect(x + 18, y + 34, 28, 20); ctx.fillStyle = '#524650'; ctx.fillRect(x + 14, y + 30, 36, 8);
    const pulse = 0.8 + Math.sin(time * 4) * 0.2 + D.colorT * 0.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = red ? `rgba(255,80,60,${(0.35 * pulse).toFixed(2)})` : `rgba(80,150,255,${(0.35 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x + 32, y + 16, 26, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = red ? '#e8403a' : '#3a80e8'; ctx.beginPath(); ctx.arc(x + 32, y + 16, 15, 0, TAU); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x + 27, y + 10, 4, 0, TAU); ctx.fill();
    return;
  }
  if (c === 'H') {
    // A paper screen (shoji): a wooden lattice with paper panes, standing in a gap.
    floorTile(ctx, x, y, i, j);
    ctx.fillStyle = '#f2ead8'; ctx.fillRect(x + 4, y - 26, T - 8, T + 18);
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(x + 2, y - 28, T - 4, 4); ctx.fillRect(x + 2, y + T - 12, T - 4, 4);
    for (let k = 0; k <= 3; k++) ctx.fillRect(x + 4 + k * ((T - 10) / 3), y - 26, 2, T + 18);
    for (let k = 1; k <= 3; k++) ctx.fillRect(x + 4, y - 26 + k * 19, T - 8, 1.5);
    return;
  }
  if (c === 'I') { iceTile(ctx, x, y, i, j, time); return; }
  if (c === '~') { waterTile(ctx, D, x, y, i, j, time); return; }
  if (c === '*') {
    // Lava: a slow orange churn with a dark crust drifting on it.
    const h = hash(i, j);
    ctx.fillStyle = '#c83a0e'; ctx.fillRect(x, y, T, T);
    const glow = 0.5 + 0.5 * Math.sin(time * 1.3 + h * 6);
    ctx.fillStyle = `rgba(255,${160 + Math.floor(glow * 60)},60,${(0.55 + glow * 0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(x + 20 + Math.sin(time * 0.6 + h * 5) * 8, y + 22, 18, 10, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 46, y + 46 + Math.cos(time * 0.5 + h * 3) * 6, 14, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,14,6,0.55)';
    ctx.beginPath(); ctx.ellipse(x + 44 + Math.sin(time * 0.3 + h * 9) * 10, y + 16, 10, 5, 0.4, 0, TAU); ctx.fill();
    const up = at(F, i, j - 1);
    if (up !== '*' && !holeTile(F, i, j - 1) && !solidTile(up)) { ctx.fillStyle = TH.face; ctx.fillRect(x, y, T, 8); ctx.fillStyle = 'rgba(255,120,40,0.35)'; ctx.fillRect(x, y + 8, T, 3); }
    return;
  }
  if (c === '%') {
    if (D.water === 'high') {
      // A float, risen: planks on the water, bobbing.
      waterTile(ctx, D, x, y, i, j, time);
      const bob = Math.sin(time * 2 + i + j) * 1.5;
      ctx.fillStyle = '#7a5a34';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 4, y + 6 + k * 14 + bob, T - 8, 11);
      ctx.fillStyle = '#4a3420'; ctx.fillRect(x + 12, y + 4 + bob, 4, T - 8); ctx.fillRect(x + T - 16, y + 4 + bob, 4, T - 8);
    } else holeTileDraw(ctx, D, F, x, y, i, j, time);
    return;
  }
  if (solidTile(c) && c !== 'G' && c !== 'B') { wallTile(ctx, F, x, y, i, j); darts(ctx, F, x, y, j, c); return; }
  if (holeTile(F, i, j)) { holeTileDraw(ctx, D, F, x, y, i, j, time); return; }
  switch (c) {
    case 'S': case 'D': case 'U': stairTile(ctx, x, y, c !== 'D', c === 'U'); return;
    case '=': {
      holeTileDraw(ctx, D, F, x, y, i, j, time);
      const along = holeTile(F, i - 1, j) || at(F, i - 1, j) === '=' || at(F, i + 1, j) === '=' || holeTile(F, i + 1, j);
      ctx.fillStyle = '#6a4a2c';
      for (let k = 0; k < 5; k++) along ? ctx.fillRect(x + k * 13 + 1, y + 14, 11, 36) : ctx.fillRect(x + 14, y + k * 13 + 1, 36, 11);
      ctx.fillStyle = '#3a2818';
      if (along) { ctx.fillRect(x, y + 12, T, 3); ctx.fillRect(x, y + 49, T, 3); } else { ctx.fillRect(x + 12, y, 3, T); ctx.fillRect(x + 49, y, 3, T); }
      return;
    }
    default: break;
  }
  if (BELTS[c]) {
    // A belt: dark rollers, chevrons running the way it pulls.
    const [dx, dy] = BELTS[c];
    ctx.fillStyle = '#2a2628'; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = '#3a3438';
    if (dx) { ctx.fillRect(x, y + 4, T, 4); ctx.fillRect(x, y + T - 8, T, 4); } else { ctx.fillRect(x + 4, y, 4, T); ctx.fillRect(x + T - 8, y, 4, T); }
    const u = ((time * 2.3) % 1) * 21;
    ctx.strokeStyle = '#d8a040'; ctx.lineWidth = 3;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
    for (let k = -1; k < 4; k++) {
      const o = k * 21 + u;
      ctx.beginPath();
      if (dx) { const cx = dx > 0 ? x + o : x + T - o; ctx.moveTo(cx - dx * 6, y + 18); ctx.lineTo(cx, y + 32); ctx.lineTo(cx - dx * 6, y + 46); }
      else { const cy = dy > 0 ? y + o : y + T - o; ctx.moveTo(x + 18, cy - dy * 6); ctx.lineTo(x + 32, cy); ctx.lineTo(x + 46, cy - dy * 6); }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  floorTile(ctx, x, y, i, j);
  switch (c) {
    case '^': spikes(ctx, x, y, j); break;
    case 'Z': {
      // Hazard stripes round the crusher's footprint; its shadow grows before the slam.
      ctx.strokeStyle = 'rgba(230,180,60,0.6)'; ctx.lineWidth = 3;
      ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, T - 4, T - 4); ctx.rect(x + 8, y + 8, T - 16, T - 16); ctx.clip('evenodd');
      for (let k = -2; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x + k * 14, y); ctx.lineTo(x + k * 14 + T, y + T); ctx.stroke(); }
      ctx.restore();
      const st = crusherState(i, j);
      const k2 = st.k === 'warn' ? st.f : st.k === 'slam' ? 1 : st.k === 'rise' ? st.f : 0.1;
      const r = 26 * (0.45 + k2 * 0.55);
      ctx.fillStyle = `rgba(0,0,0,${(0.2 + 0.45 * k2).toFixed(2)})`;
      ctx.fillRect(x + 32 - r, y + 32 - r, r * 2, r * 2);
      break;
    }
    case 'V': {
      // A valve wheel on its post; it spins while it turns.
      const tn = D.turning && D.turning.i === i && D.turning.j === j && D.turning.k === D.cur ? D.turning.t : 0;
      const a = (D.water === 'high' ? 0 : 1) * 0.8 + tn * 9;
      ctx.fillStyle = '#3a3036'; ctx.fillRect(x + 28, y + 30, 8, 24);
      ctx.save(); ctx.translate(x + 32, y + 26); ctx.rotate(a);
      ctx.strokeStyle = '#1a1418'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.stroke();
      ctx.strokeStyle = D.water === 'high' ? '#5ab8d8' : '#c89a4a'; ctx.lineWidth = 4; ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k < 3; k++) { const b = k * TAU / 3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b) * 16, Math.sin(b) * 16); } ctx.stroke();
      ctx.fillStyle = '#e8d8a8'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.restore();
      break;
    }
    case 'h': {
      // A torn screen: its frame and scraps of paper.
      ctx.fillStyle = '#3a2418'; ctx.fillRect(x + 2, y - 28, 4, T + 20); ctx.fillRect(x + T - 6, y - 28, 4, T + 20); ctx.fillRect(x + 2, y - 28, T - 4, 4);
      ctx.fillStyle = 'rgba(240,232,214,0.8)'; ctx.fillRect(x + 8, y + 40, 10, 5); ctx.fillRect(x + 40, y + 50, 8, 4);
      break;
    }
    case 'P': {
      const pl = F.plates.find((q) => q.i === i && q.j === j);
      const pressed = pl && pl.cd > 0.6;
      ctx.fillStyle = pressed ? '#3a3440' : '#524a5a'; ctx.fillRect(x + 12, y + 12, 40, 40);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x + 12, y + 12, 40, 40);
      ctx.strokeStyle = 'rgba(200,180,140,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + 32, y + 32, 9, 0, TAU); ctx.stroke();
      break;
    }
    case 'F': {
      const v = F.vents.find((q) => q.i === i && q.j === j);
      const st = v ? ventState(v) : 'idle';
      ctx.fillStyle = '#1e1a22'; ctx.beginPath(); ctx.ellipse(x + 32, y + 34, 18, 10, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4a4452'; ctx.lineWidth = 2;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + 32 + k * 6, y + 26); ctx.lineTo(x + 32 + k * 6, y + 42); ctx.stroke(); }
      if (st !== 'idle') {
        ctx.fillStyle = st === 'warn' ? 'rgba(255,140,60,0.35)' : 'rgba(255,170,80,0.6)';
        ctx.beginPath(); ctx.ellipse(x + 32, y + 34, 18, 10, 0, 0, TAU); ctx.fill();
      }
      if (st === 'warn') {
        for (let k = 0; k < 3; k++) {
          const u = (time * 1.4 + k * 0.33) % 1;
          ctx.fillStyle = `rgba(90,86,96,${(0.5 * (1 - u)).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(x + 32 + Math.sin(time * 3 + k) * 6, y + 30 - u * 34, 6 + u * 8, 0, TAU); ctx.fill();
        }
      }
      break;
    }
    case 'C': {
      const s = F.crumble.get(j * 64 + i);
      const shakeX = s && s.state === 'shake' ? Math.sin(time * 60) * 2 : 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 8 + shakeX, y + 10); ctx.lineTo(x + 30 + shakeX, y + 28); ctx.lineTo(x + 54 + shakeX, y + 20);
      ctx.moveTo(x + 30 + shakeX, y + 28); ctx.lineTo(x + 26 + shakeX, y + 54); ctx.moveTo(x + 30, y + 28); ctx.lineTo(x + 50, y + 50);
      ctx.stroke();
      break;
    }
    case 'L': case 'l': {
      ctx.fillStyle = '#3a3440'; ctx.fillRect(x + 20, y + 36, 24, 12);
      ctx.strokeStyle = '#6a5a4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      const a = c === 'L' ? -0.6 : 0.6;
      ctx.beginPath(); ctx.moveTo(x + 32, y + 40); ctx.lineTo(x + 32 + Math.sin(a) * 26, y + 40 - Math.cos(a) * 26); ctx.stroke();
      ctx.fillStyle = c === 'L' ? '#c83a2a' : '#6ac86a'; ctx.beginPath(); ctx.arc(x + 32 + Math.sin(a) * 26, y + 40 - Math.cos(a) * 26, 5, 0, TAU); ctx.fill();
      ctx.lineCap = 'butt';
      break;
    }
    case 'g': case 'G': {
      ctx.fillStyle = '#2a2630'; ctx.fillRect(x, y - 30, T, 12);
      ctx.fillStyle = '#5a5662';
      const drop = c === 'G' ? 0 : 60;
      for (let k = 0; k < 6; k++) ctx.fillRect(x + 4 + k * 11, y - 18, 4, Math.max(4, T + 10 - drop));
      if (c === 'G') { ctx.fillRect(x, y + 10, T, 4); ctx.fillRect(x, y + 36, T, 4); }
      break;
    }
    case 'B': case 'b': {
      // The great door: a frame, a sigil in the key's colour, a keyhole; opened, a dark way through.
      const lac = TH.torch === 'lantern';
      ctx.fillStyle = lac ? '#5a1612' : '#2a2630'; ctx.fillRect(x - 10, y - 30, T + 20, T + 30);
      if (c === 'B') {
        ctx.fillStyle = lac ? '#8a2a1e' : '#4a3a2a'; ctx.fillRect(x - 4, y - 20, T / 2 + 2, T + 16); ctx.fillRect(x + T / 2 + 2, y - 20, T / 2 + 2, T + 16);
        ctx.fillStyle = '#2a1e14'; ctx.fillRect(x + T / 2 - 1, y - 20, 2, T + 16);
        ctx.fillStyle = D.keyInfo.color; ctx.beginPath(); ctx.arc(x + T / 2, y + 4, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1210'; ctx.fillRect(x + T / 2 - 5, y + 2, 3, 3); ctx.fillRect(x + T / 2 + 2, y + 2, 3, 3);
        ctx.fillStyle = '#e8c050'; ctx.fillRect(x + T / 2 - 2, y + 22, 4, 8);
      } else {
        ctx.fillStyle = '#0a080c'; ctx.fillRect(x - 2, y - 20, T + 4, T + 16);
      }
      break;
    }
    case 'X': case 'x': chest(ctx, x, y, c === 'x', false); break;
    case 'K': case 'k': chest(ctx, x, y, c === 'k', true, D.keyInfo.color); break;
    case 'A': {
      const fl = 0.8 + Math.sin(time * 9) * 0.1;
      ctx.fillStyle = '#2a2420'; ctx.fillRect(x + 28, y + 24, 8, 30);
      ctx.fillStyle = '#3a3230'; ctx.beginPath(); ctx.ellipse(x + 32, y + 24, 14, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.ellipse(x + 32, y + 14, 7, 12 * fl, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(x + 32, y + 17, 3.5, 6 * fl, 0, 0, TAU); ctx.fill();
      break;
    }
    default: break;
  }
}

/** The slits in a dart wall: dark slots on its cap, red as they arm. */
function darts(ctx, F, x, y, j, c) {
  if (c !== '>' && c !== '<') return;
  const pl = F.plates.find((q) => q.j === j);
  const armed = pl && pl.fireT >= 0;
  const ex = c === '>' ? x + T - 8 : x + 2;
  for (const off of [-14, 0, 14]) {
    ctx.fillStyle = armed ? '#ff5a3c' : '#0e0a10';
    ctx.fillRect(ex, y + T / 2 - 16 + off, 6, 4);
  }
  if (armed) { ctx.fillStyle = 'rgba(255,90,60,0.25)'; ctx.beginPath(); ctx.arc(ex + 3, y + T / 2 - 16, 16, 0, TAU); ctx.fill(); }
}

/** A torch, a paper lantern or an iron brazier on the wall. */
function wallLight(ctx, x, y, fl, kind) {
  if (kind === 'lantern') {
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 1, y - 16, 2, 6);
    ctx.fillStyle = `rgb(255,${120 + Math.floor(fl * 40)},70)`;
    ctx.beginPath(); ctx.ellipse(x, y, 9, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 7, y - 11, 14, 2); ctx.fillRect(x - 7, y + 9, 14, 2);
    ctx.strokeStyle = 'rgba(120,20,10,0.6)'; ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x - 8, y + k * 4); ctx.lineTo(x + 8, y + k * 4); ctx.stroke(); }
    return;
  }
  if (kind === 'brazier') {
    ctx.fillStyle = '#1e1a1a'; ctx.fillRect(x - 8, y + 2, 16, 8); ctx.fillRect(x - 2, y + 10, 4, 6);
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 8, 12 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd87a'; ctx.beginPath(); ctx.ellipse(x, y - 1, 4, 7 * fl, 0, 0, TAU); ctx.fill();
    return;
  }
  ctx.fillStyle = '#2a2420'; ctx.fillRect(x - 3, y, 6, 12); ctx.fillRect(x - 7, y + 10, 14, 3);
  ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 5, 9 * fl, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(x, y - 2, 2.5, 5 * fl, 0, 0, TAU); ctx.fill();
}

// --- below everyone -------------------------------------------------------------------------------

export function drawDungeonBelow(ctx, time) {
  const D = dungeonState();
  if (!D) return;
  TH = THEMES[D.theme] || THEMES.catacomb;
  const F = D.floors[D.cur];
  const i0 = Math.max(0, Math.floor(camera.x / T) - 1), i1 = Math.min(F.g[0].length - 1, Math.ceil((camera.x + view.w) / T) + 1);
  const j0 = Math.max(0, Math.floor(camera.y / T) - 1), j1 = Math.min(F.g.length - 1, Math.ceil((camera.y + view.h) / T) + 2);
  ctx.fillStyle = '#050407';
  ctx.fillRect(camera.x - 20, camera.y - 20, view.w + 40, view.h + 40);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) drawTile(ctx, D, F, i, j, time);
  // Moving platforms: stone slabs with a glowing rim.
  for (const pl of D.platforms) {
    if (pl.floor !== D.cur) continue;
    const x = pl.x, y = pl.y;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 30, y - 22, 64, 58);
    ctx.fillStyle = '#4a4240'; ctx.fillRect(x - 32, y - 30, 64, 56);
    ctx.fillStyle = '#6a605c'; ctx.fillRect(x - 32, y - 30, 64, 44);
    ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 2; ctx.strokeRect(x - 31, y - 29, 62, 42);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 3; k++) ctx.fillRect(x - 28 + k * 20, y - 26, 16, 36);
  }
  // Wall lights.
  const warm = TH.torch === 'lantern' ? '255,110,70' : TH.decal === 'frost' ? '170,210,255' : '255,150,70';
  for (const t of F.torches) {
    if (t.i < i0 || t.i > i1 || t.j < j0 || t.j > j1) continue;
    const x = t.i * T + T / 2, y = t.j * T + T - 30;
    const fl = 0.8 + Math.sin(time * 11 + t.ph) * 0.12 + Math.sin(time * 17 + t.ph) * 0.06;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 2, x, y, 90);
    g.addColorStop(0, `rgba(${warm},${(0.28 * fl).toFixed(2)})`); g.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 90, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    wallLight(ctx, x, y, fl, TH.torch);
  }
  // Pendulum shadows on the floor: where the blade will pass.
  for (const pd of D.pendulums) {
    if (pd.floor !== D.cur) continue;
    const b = bladeAt(pd);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 8, 26, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pd.x * T + T / 2 - pd.amp * T, b.y + 8); ctx.lineTo(pd.x * T + T / 2 + pd.amp * T, b.y + 8); ctx.stroke();
  }
  // Icicle shadows: faint while they hang, dark and growing as they creak.
  for (const [key, s] of F.icicles) {
    if (s.state === 'gone') continue;
    const i = key % 64, j = Math.floor(key / 64);
    const k = s.state === 'warn' ? 1 - s.t / 0.65 : 0;
    ctx.fillStyle = `rgba(20,40,70,${(0.18 + 0.4 * k).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(i * T + T / 2, j * T + T / 2 + 6, 14 + 12 * k, 6 + 4 * k, 0, 0, TAU); ctx.fill();
  }
  // The way out, once the boss has fallen.
  if (D.exitAt && D.exitAt.k === D.cur) {
    const { x, y } = D.exitAt;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(160,220,255,${(0.6 - k * 0.15).toFixed(2)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, 26 + k * 8 + Math.sin(time * 3 + k) * 3, 12 + k * 3, time * (k % 2 ? 1 : -1), 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,240,255,0.5)'; ctx.beginPath(); ctx.ellipse(x, y, 18, 8, 0, 0, TAU); ctx.fill();
  }
}

// --- over everyone ------------------------------------------------------------------------------

let lightC = null;

export function drawDungeonAbove(ctx, time) {
  const D = dungeonState();
  if (!D) return;
  TH = THEMES[D.theme] || THEMES.catacomb;
  const F = D.floors[D.cur];
  // Pendulum blades, hung from the dark above.
  for (const pd of D.pendulums) {
    if (pd.floor !== D.cur) continue;
    const b = bladeAt(pd);
    const ax = pd.x * T + T / 2, ay = pd.y * T - 170;
    const bx = b.x, by = b.y - 30;
    ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.save(); ctx.translate(bx, by); ctx.rotate(-b.a * 0.5);
    ctx.fillStyle = '#9aa0aa';
    ctx.beginPath(); ctx.moveTo(-30, -4); ctx.quadraticCurveTo(0, 26, 30, -4); ctx.quadraticCurveTo(0, 8, -30, -4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#d8dce4'; ctx.beginPath(); ctx.moveTo(-24, 2); ctx.quadraticCurveTo(0, 22, 24, 2); ctx.quadraticCurveTo(0, 16, -24, 2); ctx.fill();
    ctx.fillStyle = '#4a4452'; ctx.fillRect(-4, -12, 8, 12);
    ctx.restore();
  }
  // Crushers (iron blocks on pistons, high until they slam) and icicles overhead.
  const i0 = Math.max(0, Math.floor(camera.x / T) - 1), i1 = Math.min(F.g[0].length - 1, Math.ceil((camera.x + view.w) / T) + 1);
  const j0 = Math.max(0, Math.floor(camera.y / T) - 1), j1 = Math.min(F.g.length - 1, Math.ceil((camera.y + view.h) / T) + 3);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = F.g[j][i];
    if (c === 'Z') {
      const st = crusherState(i, j);
      const lift = st.k === 'up' ? 1 : st.k === 'warn' ? 1 - st.f * 0.15 : st.k === 'slam' ? 0 : 1 - st.f;
      const x = i * T + T / 2, y = j * T + 44 - lift * 96;
      ctx.fillStyle = '#2a2628'; ctx.fillRect(x - 5, y - 200, 10, 170);
      ctx.fillStyle = '#4a4448'; ctx.fillRect(x - 28, y - 40, 56, 40);
      ctx.fillStyle = '#6a6268'; ctx.fillRect(x - 28, y - 40, 56, 10);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(x - 28, y - 40, 56, 40);
      ctx.fillStyle = '#e0b040'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 26 + k * 14, y - 8, 8, 6);
      if (st.k === 'slam') { ctx.fillStyle = 'rgba(200,190,170,0.35)'; ctx.beginPath(); ctx.ellipse(x, j * T + 50, 40, 10, 0, 0, TAU); ctx.fill(); }
    } else if (c === 'Y') {
      const s = F.icicles.get(j * 64 + i);
      if (!s || s.state === 'gone') continue;
      const x = i * T + T / 2, y = j * T - 40;
      const shiver = s.state === 'warn' ? Math.sin(time * 70) * 1.5 : 0;
      for (const [dx, len] of [[-12, 30], [0, 44], [11, 26]]) {
        ctx.fillStyle = 'rgba(210,238,255,0.92)';
        ctx.beginPath(); ctx.moveTo(x + dx - 6 + shiver, y); ctx.lineTo(x + dx + shiver, y + len); ctx.lineTo(x + dx + 6 + shiver, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(90,130,170,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  // Fire from the vents.
  for (const v of F.vents) {
    if (ventState(v) !== 'burn') continue;
    const x = v.i * T + T / 2, y = v.j * T + 34;
    const fl = 0.85 + Math.sin(time * 20 + v.i) * 0.15;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - 30, 4, x, y - 30, 60);
    g.addColorStop(0, 'rgba(255,200,110,0.55)'); g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 30, 60, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.ellipse(x, y - 26, 14, 34 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd87a'; ctx.beginPath(); ctx.ellipse(x, y - 20, 7, 20 * fl, 0, 0, TAU); ctx.fill();
  }

  // The dark, and the light cut into it.
  const p = world.player;
  const m = ctx.getTransform();
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!lightC || lightC.width !== W || lightC.height !== H) { lightC = document.createElement('canvas'); lightC.width = W; lightC.height = H; }
  const L = lightC.getContext('2d');
  L.globalCompositeOperation = 'source-over';
  L.clearRect(0, 0, W, H);
  L.fillStyle = TH.decal === 'frost' ? `rgba(4,8,18,${TH.dark})` : `rgba(3,2,6,${TH.dark})`;
  L.fillRect(0, 0, W, H);
  L.globalCompositeOperation = 'destination-out';
  const light = (x, y, r, a = 1) => {
    const sx = m.a * x + m.e, sy = m.d * y + m.f, sr = r * m.a;
    if (sx < -sr || sy < -sr || sx > W + sr || sy > H + sr) return;
    const g = L.createRadialGradient(sx, sy, sr * 0.1, sx, sy, sr);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g; L.beginPath(); L.arc(sx, sy, sr, 0, TAU); L.fill();
  };
  if (p) light(p.x, p.y - 16, TH.light, 1);
  for (const t of F.torches) light(t.i * T + T / 2, t.j * T + T - 20, 200 + Math.sin(time * 9 + t.ph) * 8, 0.9);
  for (const l of F.lamps) light(l.i * T + T / 2, l.j * T + 20, 240, 1);
  for (const v of F.vents) if (ventState(v) !== 'idle') light(v.i * T + T / 2, v.j * T + 20, ventState(v) === 'burn' ? 150 : 70, 0.8);
  for (const pl of D.platforms) if (pl.floor === D.cur) light(pl.x, pl.y, 110, 0.6);
  if (D.exitAt && D.exitAt.k === D.cur) light(D.exitAt.x, D.exitAt.y, 220, 1);
  for (const e of world.enemies) if (!e.dead && e.dBoss && e.woke) light(e.x, e.y, 160, 0.5);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightC, 0, 0);
  if (D.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(D.fade, 0, 1).toFixed(2)})`; ctx.fillRect(0, 0, W, H); }
  if (D.burn) { ctx.fillStyle = `rgba(255,90,20,${(0.5 * (1 - D.burn.t / 0.35)).toFixed(2)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();

  drawDungeonHud(ctx, D, F, time);
}

/**
 * The dungeon's own HUD, top right under the pause button: a map of the
 * floor as far as you have seen it, what to do next, and the key when you
 * hold it.
 */
function drawDungeonHud(ctx, D, F, time) {
  const Wt = F.g[0].length, Ht = F.g.length;
  const s = Math.min(150 / Wt, 100 / Ht);
  const mw = Wt * s, mh = Ht * s;
  const x0 = camera.x + view.w - mw - 16, y0 = camera.y + 60;
  ctx.fillStyle = 'rgba(8,6,13,0.72)';
  ctx.fillRect(x0 - 5, y0 - 5, mw + 10, mh + 10);
  for (let j = 0; j < Ht; j++) {
    for (let i = 0; i < Wt; i++) {
      if (!F.seen[j * Wt + i]) continue;
      const c = F.g[j][i];
      let col;
      if (c === '1') col = D.color === 'red' ? '#c8342c' : '#5a2a28';
      else if (c === '2') col = D.color === 'blue' ? '#2c6ad0' : '#28345a';
      else if (c === '~') col = D.water === 'high' ? '#2a6a8a' : '#4a5a5c';
      else if (solidTile(c) && c !== 'B') continue;
      else if (holeTile(F, i, j)) col = 'rgba(30,30,60,0.9)';
      else if (c === '*') col = '#c84a1a';
      else if (c === 'I') col = '#a8d0e8';
      else col = 'rgba(170,160,150,0.55)';
      ctx.fillStyle = col;
      ctx.fillRect(x0 + i * s, y0 + j * s, Math.ceil(s), Math.ceil(s));
    }
  }
  const mark = (i, j, col, r = 2.2) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x0 + (i + 0.5) * s, y0 + (j + 0.5) * s, r, 0, TAU); ctx.fill(); };
  for (let j = 0; j < Ht; j++) {
    for (let i = 0; i < Wt; i++) {
      if (!F.seen[j * Wt + i]) continue;
      const c = F.g[j][i];
      if (c === 'S' || c === 'D') mark(i, j, '#e8e0cc', 2.4);
      else if (c === 'K') mark(i, j, D.keyInfo.color, 3);
      else if (c === 'B' || c === 'b') mark(i, j, D.key ? '#6ad86a' : '#d84a3a', 3);
      else if (c === 'A') mark(i, j, '#ffb35e', 2.4);
      else if (c === 'X') mark(i, j, '#e8c050', 1.8);
      else if (c === 'V' || c === 'O') mark(i, j, '#8ad8ff', 1.8);
      else if (c === 'U') mark(i, j, '#fff0c0', 2.4);
    }
  }
  const p = world.player;
  if (p) {
    const pulse = 2.4 + Math.sin(time * 6) * 0.6;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x0 + (p.x / T) * s, y0 + (p.y / T) * s, pulse, 0, TAU); ctx.fill();
  }
  // The floor's name and what to do.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText(F.name.toUpperCase(), x0 + mw, y0 + mh + 18);
  ctx.fillStyle = '#ffd89a';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText(dungeonObjective(), x0 + mw, y0 + mh + 34);
  if (D.theme === 'cistern') { ctx.fillStyle = '#8ad8ff'; ctx.fillText(D.water === 'high' ? 'Water: high' : 'Water: low', x0 + mw, y0 + mh + 50); }
  if (D.theme === 'shrine') { ctx.fillStyle = D.color === 'red' ? '#ff7a6a' : '#7aa8ff'; ctx.fillText(D.color === 'red' ? 'Red pegs raised' : 'Blue pegs raised', x0 + mw, y0 + mh + 50); }
  ctx.textAlign = 'left';

  // The key, when you have it.
  if (D.key) {
    const x = camera.x + view.w - 70, y = camera.y + view.h - 90;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 10, y - 16, 56, 30);
    ctx.fillStyle = D.keyInfo.color; ctx.beginPath(); ctx.arc(x + 4, y, 7, 0, TAU); ctx.fill();
    ctx.fillRect(x + 8, y - 2, 26, 4); ctx.fillRect(x + 26, y + 2, 4, 6); ctx.fillRect(x + 18, y + 2, 4, 5);
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(x + 4, y, 3, 0, TAU); ctx.fill();
  }
}
