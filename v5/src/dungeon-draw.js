// Drawing a dungeon floor in the 3/4 view (world space: game.js has applied the camera).
//
// Walls are blocks: a dark cap and, where a floor lies south of them, a
// brick face. A HOLE shows what is under it - the floor below, dim and a
// little lower (the depth) - behind the lip of the floor above; with nothing
// under it, only dark. Over everything the dungeon is dark but for the light
// you carry, the torches, the lamps and the fire.

import { world, camera, view } from './state.js';
import { TAU, clamp } from './util.js';
import { dungeonState, T, spikeState, ventState, bladeAt } from './dungeon.js';

const OUT = '#120e14';

function hash(i, j) { let h = (i * 73856093) ^ (j * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const at = (F, i, j) => (i < 0 || j < 0 || j >= F.g.length || i >= F.g[0].length ? '#' : F.g[j][i]);
const solid = (c) => '#o><vGB'.includes(c);
function hole(F, i, j) {
  const c = at(F, i, j);
  if (c === ' ' || c === 'R') return true;
  if (c === 'C') { const s = F.crumble.get(j * 64 + i); return !!s && s.state === 'gone'; }
  return false;
}

// --- tiles ------------------------------------------------------------------------------------

function floorTile(ctx, x, y, i, j, dim = 0) {
  const h = hash(i, j);
  const v = 58 + Math.floor(h * 10) - dim;
  ctx.fillStyle = `rgb(${v - 4},${v - 7},${v + 2})`;
  ctx.fillRect(x, y, T, T);
  // Flagstones: two by two, the seams offset every other row.
  ctx.fillStyle = `rgba(0,0,0,${0.35})`;
  const off = j % 2 ? 16 : 0;
  ctx.fillRect(x, y + 31, T, 2);
  ctx.fillRect(x + ((32 + off) % 64), y, 2, 31);
  ctx.fillRect(x + ((off + 8) % 64), y + 33, 2, 31);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x + 2, y + 2, 28, 3);
  if (h > 0.82 && !dim) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + 10 + h * 20, y + 12); ctx.lineTo(x + 24 + h * 10, y + 30); ctx.lineTo(x + 20, y + 46); ctx.stroke();
  }
  if (h < 0.09 && !dim) {
    // Bones in the dust.
    ctx.fillStyle = 'rgba(220,210,190,0.55)';
    ctx.fillRect(x + 20, y + 40, 14, 3); ctx.beginPath(); ctx.arc(x + 44, y + 22, 4, 0, TAU); ctx.fill();
  } else if (h > 0.62 && h < 0.66 && !dim) {
    ctx.fillStyle = 'rgba(90,120,80,0.3)'; ctx.beginPath(); ctx.ellipse(x + 40, y + 48, 12, 5, 0, 0, TAU); ctx.fill();
  }
}

function wallTile(ctx, F, x, y, i, j) {
  const c = at(F, i, j);
  const faceH = solid(at(F, i, j + 1)) ? 0 : 24;
  if (c === 'o') {
    // A pillar: floor round it, a round column.
    floorTile(ctx, x, y, i, j);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 38, y + 56, 22, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a4452'; ctx.fillRect(x + 14, y - 20, 36, 70);
    ctx.fillStyle = '#5a5462'; ctx.fillRect(x + 14, y - 20, 12, 70);
    ctx.fillStyle = '#36303e'; ctx.fillRect(x + 10, y - 26, 44, 10); ctx.fillRect(x + 10, y + 44, 44, 8);
    return;
  }
  const hv = hash(i, j) * 8;
  ctx.fillStyle = `rgb(${38 + hv},${34 + hv},${44 + hv})`;
  ctx.fillRect(x, y, T, T - faceH);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, T, 3);
  if (faceH) {
    const fy = y + T - faceH;
    ctx.fillStyle = '#4a4352'; ctx.fillRect(x, fy, T, faceH);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, fy + 11, T, 2);
    for (let k = 0; k < 4; k++) ctx.fillRect(x + ((k * 16 + (j % 2) * 8) % 64), fy, 2, 11);
    for (let k = 0; k < 4; k++) ctx.fillRect(x + ((k * 16 + 8 + (j % 2) * 8) % 64), fy + 13, 2, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y + T - 3, T, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, fy, T, 2);
  }
}

/** A hole: what is below, dim and deep, behind the lip of the floor above. */
function holeTile(ctx, D, F, x, y, i, j, time) {
  const k = D.floors.indexOf(F);
  let below = null;
  for (let q = k - 1; q >= 0; q--) {
    const G = D.floors[q];
    if (solid(at(G, i, j))) break;
    if (!hole(G, i, j)) { below = G; break; }
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
  ctx.fillStyle = '#050407'; ctx.fillRect(x, y, T, T);
  if (below) {
    // The floor far below: smaller (it is further away), dim, in a blue murk.
    ctx.save();
    ctx.translate(x + T / 2, y + T / 2 + 26); ctx.scale(0.78, 0.78); ctx.translate(-(x + T / 2), -(y + T / 2));
    floorTile(ctx, x, y, i, j, 30);
    ctx.restore();
    ctx.fillStyle = 'rgba(6,5,14,0.72)'; ctx.fillRect(x, y, T, T);
  }
  // The lip: the side of the floor above, falling away into the dark.
  if (!hole(F, i, j - 1) && !solid(at(F, i, j - 1))) {
    // A ledge: the stone of the floor above, cut away, going down into the dark.
    ctx.fillStyle = '#4a4352'; ctx.fillRect(x, y, T, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + 6, T, 2);
    for (let k = 0; k < 4; k++) ctx.fillRect(x + ((k * 16 + (j % 2) * 8) % 64), y, 2, 6);
    const g = ctx.createLinearGradient(0, y + 14, 0, y + 52);
    g.addColorStop(0, '#2a2530'); g.addColorStop(1, 'rgba(5,4,7,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y + 14, T, 38);
  }
  // Mist far down, drifting (on some tiles, so it does not tile).
  const hm = hash(i + 11, j + 5);
  if (hm > 0.55) {
    ctx.fillStyle = `rgba(110,120,170,${(0.035 + 0.025 * Math.sin(time * 0.7 + hm * 9)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x + 20 + hm * 30 + Math.sin(time * 0.35 + hm * 6) * 10, y + 30 + hm * 26, 26 + hm * 14, 6, 0, 0, TAU); ctx.fill();
  }
  // Soft dark along the sides where floor meets the hole.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  if (!hole(F, i - 1, j)) ctx.fillRect(x, y, 6, T);
  if (!hole(F, i + 1, j)) ctx.fillRect(x + T - 6, y, 6, T);
  ctx.restore();
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

function chest(ctx, x, y, open, key) {
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
    if (key) { ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.beginPath(); ctx.arc(cx, cy - 6, 24, 0, TAU); ctx.fill(); }
  }
}

function drawTile(ctx, D, F, i, j, time) {
  const x = i * T, y = j * T, c = at(F, i, j);
  if (solid(c) && c !== 'G' && c !== 'B') { wallTile(ctx, F, x, y, i, j); darts(ctx, D, F, x, y, i, j, c); return; }
  if (hole(F, i, j)) { holeTile(ctx, D, F, x, y, i, j, time); return; }
  switch (c) {
    case 'S': case 'D': case 'U': stairTile(ctx, x, y, c !== 'D', c === 'U'); return;
    case '=': {
      holeTile(ctx, D, F, x, y, i, j, time);
      const along = hole(F, i - 1, j) || at(F, i - 1, j) === '=' || at(F, i + 1, j) === '=' || hole(F, i + 1, j);
      ctx.fillStyle = '#6a4a2c';
      for (let k = 0; k < 5; k++) along ? ctx.fillRect(x + k * 13 + 1, y + 14, 11, 36) : ctx.fillRect(x + 14, y + k * 13 + 1, 36, 11);
      ctx.fillStyle = '#3a2818';
      if (along) { ctx.fillRect(x, y + 12, T, 3); ctx.fillRect(x, y + 49, T, 3); } else { ctx.fillRect(x + 12, y, 3, T); ctx.fillRect(x + 49, y, 3, T); }
      return;
    }
    default: break;
  }
  floorTile(ctx, x, y, i, j);
  switch (c) {
    case '^': spikes(ctx, x, y, j); break;
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
      // An iron portcullis: shut, or drawn up.
      ctx.fillStyle = '#2a2630'; ctx.fillRect(x, y - 30, T, 12);
      ctx.fillStyle = '#5a5662';
      const drop = c === 'G' ? 0 : 60;
      for (let k = 0; k < 6; k++) ctx.fillRect(x + 4 + k * 11, y - 18, 4, Math.max(4, T + 10 - drop));
      if (c === 'G') { ctx.fillRect(x, y + 10, T, 4); ctx.fillRect(x, y + 36, T, 4); }
      break;
    }
    case 'B': case 'b': {
      // The great door: a stone frame, a skull, a keyhole; opened, a dark way through.
      ctx.fillStyle = '#2a2630'; ctx.fillRect(x - 10, y - 30, T + 20, T + 30);
      if (c === 'B') {
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x - 4, y - 20, T / 2 + 2, T + 16); ctx.fillRect(x + T / 2 + 2, y - 20, T / 2 + 2, T + 16);
        ctx.fillStyle = '#2a1e14'; ctx.fillRect(x + T / 2 - 1, y - 20, 2, T + 16);
        ctx.fillStyle = '#d8d0bc'; ctx.beginPath(); ctx.arc(x + T / 2, y + 4, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1210'; ctx.fillRect(x + T / 2 - 5, y + 2, 3, 3); ctx.fillRect(x + T / 2 + 2, y + 2, 3, 3);
        ctx.fillStyle = '#e8c050'; ctx.fillRect(x + T / 2 - 2, y + 22, 4, 8);
      } else {
        ctx.fillStyle = '#0a080c'; ctx.fillRect(x - 2, y - 20, T + 4, T + 16);
      }
      break;
    }
    case 'X': case 'x': chest(ctx, x, y, c === 'x', false); break;
    case 'K': case 'k': chest(ctx, x, y, c === 'k', true); break;
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
function darts(ctx, D, F, x, y, i, j, c) {
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

// --- below everyone -------------------------------------------------------------------------------

export function drawDungeonBelow(ctx, time) {
  const D = dungeonState();
  if (!D) return;
  const F = D.floors[D.cur];
  const i0 = Math.max(0, Math.floor(camera.x / T) - 1), i1 = Math.min(F.g[0].length - 1, Math.ceil((camera.x + view.w) / T) + 1);
  const j0 = Math.max(0, Math.floor(camera.y / T) - 1), j1 = Math.min(F.g.length - 1, Math.ceil((camera.y + view.h) / T) + 1);
  ctx.fillStyle = '#050407';
  ctx.fillRect(camera.x - 20, camera.y - 20, view.w + 40, view.h + 40);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) drawTile(ctx, D, F, i, j, time);
  // Torches on the walls.
  for (const t of F.torches) {
    if (t.i < i0 || t.i > i1 || t.j < j0 || t.j > j1) continue;
    const x = t.i * T + T / 2, y = t.j * T + T - 30;
    const fl = 0.8 + Math.sin(time * 11 + t.ph) * 0.12 + Math.sin(time * 17 + t.ph) * 0.06;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 2, x, y, 90);
    g.addColorStop(0, `rgba(255,150,70,${(0.28 * fl).toFixed(2)})`); g.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 90, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a2420'; ctx.fillRect(x - 3, y, 6, 12); ctx.fillRect(x - 7, y + 10, 14, 3);
    ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 5, 9 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(x, y - 2, 2.5, 5 * fl, 0, 0, TAU); ctx.fill();
  }
  // The pendulums' shadows on the floor: where the blade will pass.
  for (const pd of D.pendulums) {
    if (pd.floor !== D.cur) continue;
    const b = bladeAt(pd);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 8, 26, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pd.x * T + T / 2 - pd.amp * T, b.y + 8); ctx.lineTo(pd.x * T + T / 2 + pd.amp * T, b.y + 8); ctx.stroke();
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
  L.fillStyle = 'rgba(3,2,6,0.72)';
  L.fillRect(0, 0, W, H);
  L.globalCompositeOperation = 'destination-out';
  const light = (x, y, r, a = 1) => {
    const sx = m.a * x + m.e, sy = m.d * y + m.f, sr = r * m.a;
    if (sx < -sr || sy < -sr || sx > W + sr || sy > H + sr) return;
    const g = L.createRadialGradient(sx, sy, sr * 0.1, sx, sy, sr);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g; L.beginPath(); L.arc(sx, sy, sr, 0, TAU); L.fill();
  };
  if (p) light(p.x, p.y - 16, 340, 1);
  for (const t of F.torches) light(t.i * T + T / 2, t.j * T + T - 20, 200 + Math.sin(time * 9 + t.ph) * 8, 0.9);
  for (const l of F.lamps) light(l.i * T + T / 2, l.j * T + 20, 240, 1);
  for (const v of F.vents) if (ventState(v) !== 'idle') light(v.i * T + T / 2, v.j * T + 20, ventState(v) === 'burn' ? 150 : 70, 0.8);
  if (D.exitAt && D.exitAt.k === D.cur) light(D.exitAt.x, D.exitAt.y, 220, 1);
  for (const e of world.enemies) if (!e.dead && e.dBoss && e.woke) light(e.x, e.y, 160, 0.5);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightC, 0, 0);
  // A fade between floors.
  if (D.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(D.fade, 0, 1).toFixed(2)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();

  // The Bone Key, when you have it.
  if (D.key) {
    const x = camera.x + view.w - 70, y = camera.y + view.h - 90;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 10, y - 16, 56, 30);
    ctx.fillStyle = '#e8e0cc'; ctx.beginPath(); ctx.arc(x + 4, y, 7, 0, TAU); ctx.fill();
    ctx.fillRect(x + 8, y - 2, 26, 4); ctx.fillRect(x + 26, y + 2, 4, 6); ctx.fillRect(x + 18, y + 2, 4, 5);
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(x + 4, y, 3, 0, TAU); ctx.fill();
  }
}
