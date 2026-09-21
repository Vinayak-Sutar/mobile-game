// Drawing The Wilds (world space: game.js has already applied the camera).
//
// Only what is in view is touched: the painted ground comes in chunks
// (terrain.js), the hand-placed walls and water through the spatial hash, and
// the trees, boulders and small things from the few sectors on screen.
//
// Each region grows its own kind of tree: broad crowns in the Heartland and
// by the lake, dark heavy ones in the Webwood, snow pines on the Moors and
// the Summit, bare dead ones in the Mire and on the Peaks' ash, tall cypress
// in the palace gardens, and cactus in the Gulch.

import { world, camera, view, gfx } from './state.js';
import { TAU, dist } from './util.js';
import { wildsState, sectorsIn, sectorAt } from './wilds-world.js';

const inView = (x, y, pad = 80) => x > camera.x - pad && x < camera.x + view.w + pad && y > camera.y - pad && y < camera.y + view.h + pad;

let printSpr = null, printEpoch = -1;
function printSprite() {
  if (printSpr && printEpoch === gfx.epoch) return printSpr;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(24, 24, 2, 24, 24, 24);
  gr.addColorStop(0, 'rgba(60,64,80,0.55)');
  gr.addColorStop(0.6, 'rgba(80,86,104,0.25)');
  gr.addColorStop(1, 'rgba(90,96,114,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 48, 48);
  printSpr = c;
  printEpoch = gfx.epoch;
  return c;
}

export function drawOverworldBelow(ctx, time) {
  const W = wildsState();
  if (!W) return;
  const cx = camera.x, cy = camera.y, vw = view.w, vh = view.h;

  // The painted ground, and the live water's light over it.
  W.terrain.draw(ctx, cx, cy, vw, vh);
  W.water.draw(ctx);

  // Prints in the snow, the ash and the mud, filling back in.
  if (W.prints.length) {
    const spr = printSprite();
    for (const pr of W.prints) {
      const age = time - pr.t;
      if (age > 12 || !inView(pr.x, pr.y, 30)) continue;
      ctx.globalAlpha = Math.min(1, 1.3 - age / 12) * (pr.dark ? 0.6 : 0.9);
      const s2 = pr.big ? 30 : 22;
      ctx.drawImage(spr, pr.x - s2 / 2, pr.y - s2 * 0.3, s2, s2 * 0.6);
    }
    ctx.globalAlpha = 1;
  }

  // The hand-placed things that need more than paint: the bridges' railings -
  // and the boulders and cactus grown in the sectors.
  const x0 = cx - 120, y0 = cy - 120, x1 = cx + vw + 120, y1 = cy + vh + 120;
  for (const o of W.hash.query(x0, y0, x1, y1)) drawObstacle(ctx, o, time);

  const secs = sectorsIn(x0, y0, x1, y1);
  for (const S of secs) {
    for (const d of S.decals) if (inView(d.x, d.y, 24)) drawDecal(ctx, d, time);
  }
  for (const S of secs) for (const g of S.grass) g.draw(ctx, time, { x: cx, y: cy, w: vw, h: vh });

  // Tree trunks and their shadows (the crowns are drawn over everyone).
  for (const S of secs) {
    for (const t of S.trees) {
      if (!inView(t.x, t.y, 90)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(t.x + 10, t.y + 8, t.r * 0.9, t.r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = t.kind === 'dead' ? '#4a4038' : t.kind === 'dark' ? '#241a14' : '#3a2a1c';
      ctx.fillRect(t.x - 7, t.y - 10, 14, 18);
    }
  }
}

function drawObstacle(ctx, o, time) {
  switch (o.kind) {
    case 'rail':
      // Timber railings along a bridge, posts every forty units.
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(o.x + 5, o.y + 6, o.w, o.h);
      ctx.fillStyle = '#3a2c20'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#6a5038';
      if (o.h >= o.w) for (let y = o.y; y < o.y + o.h; y += 40) ctx.fillRect(o.x - 2, y, o.w + 4, 8);
      else for (let x = o.x; x < o.x + o.w; x += 40) ctx.fillRect(x, o.y - 2, 8, o.h + 4);
      break;
    case 'rock': {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const shape = (dx, dy, k) => {
        ctx.beginPath();
        o.poly.forEach(([px, py], i) => (i ? ctx.lineTo(cx + dx + px * k, cy + dy + py * k) : ctx.moveTo(cx + dx + px * k, cy + dy + py * k)));
        ctx.closePath();
      };
      const base = o.ashy ? ['#3e3a3a', '#54504e', '#6a6664'] : o.snowy ? ['#5e5e68', '#7c7c88', '#9a9aa6'] : ['#645c52', '#857c6e', '#a0978a'];
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; shape(7, 9, 1); ctx.fill();
      ctx.fillStyle = base[0]; shape(0, 0, 1); ctx.fill();
      ctx.fillStyle = base[1]; shape(-o.w * 0.08, -o.h * 0.12, 0.72); ctx.fill();
      ctx.fillStyle = base[2]; shape(-o.w * 0.14, -o.h * 0.2, 0.36); ctx.fill();
      if (o.snowy) { ctx.fillStyle = 'rgba(236,242,250,0.95)'; shape(-o.w * 0.06, -o.h * 0.24, 0.55); ctx.fill(); }
      if (o.ashy && Math.sin(time * 3 + o.x) > 0.6) {
        ctx.fillStyle = 'rgba(255,120,50,0.6)';
        ctx.beginPath(); ctx.arc(cx + o.w * 0.2, cy + o.h * 0.1, 2, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'cactus': {
      const x = o.x + o.w / 2, y = o.y + o.h;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x + 8, y, 14, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4c7a3a';
      ctx.fillRect(x - 5, y - o.h2, 10, o.h2);
      if (o.arms) { ctx.fillRect(x - 15, y - o.h2 * 0.7, 6, 14); ctx.fillRect(x - 15, y - o.h2 * 0.7 + 8, 12, 5); ctx.fillRect(x + 9, y - o.h2 * 0.55, 6, 12); ctx.fillRect(x + 4, y - o.h2 * 0.55 + 7, 10, 5); }
      ctx.fillStyle = '#6a9a50'; ctx.fillRect(x - 2, y - o.h2, 3, o.h2);
      break;
    }
    default: break;
  }
}

function drawDecal(ctx, d, time) {
  switch (d.t) {
    case 'flowers':
      for (let k = 0; k < 5; k++) {
        const fx = d.x + Math.cos(d.ph + k * 2.1) * 14, fy = d.y + Math.sin(d.ph + k * 1.3) * 8;
        const nod = Math.sin(time * 1.8 + d.ph + k) * 1.5;
        ctx.strokeStyle = '#4e6a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx, fy + 5); ctx.lineTo(fx + nod, fy); ctx.stroke();
        ctx.fillStyle = `rgba(${d.c},0.95)`;
        ctx.beginPath(); ctx.arc(fx + nod, fy, 2.3, 0, TAU); ctx.fill();
      }
      break;
    case 'reeds':
      ctx.strokeStyle = '#6a7a44'; ctx.lineWidth = 1.6;
      for (let k = 0; k < 6; k++) {
        const bx = d.x + (k - 3) * 4, sway = Math.sin(time * 1.4 + d.ph + k) * 2;
        ctx.beginPath(); ctx.moveTo(bx, d.y); ctx.lineTo(bx + sway, d.y - 18 - (k % 3) * 4); ctx.stroke();
      }
      ctx.fillStyle = '#5a3a24';
      ctx.fillRect(d.x - 1 + Math.sin(time * 1.4 + d.ph) * 2, d.y - 24, 3, 7);
      break;
    case 'stump':
      ctx.fillStyle = '#3a3028'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 9, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 3, 8, 4, 0, 0, TAU); ctx.fill();
      break;
    case 'web':
      ctx.strokeStyle = 'rgba(230,230,240,0.35)'; ctx.lineWidth = 0.8;
      for (let k = 0; k < 6; k++) {
        const a = d.ph + (k / 6) * TAU;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + Math.cos(a) * 16, d.y + Math.sin(a) * 11); ctx.stroke();
      }
      for (const r of [5, 10, 15]) { ctx.beginPath(); ctx.ellipse(d.x, d.y, r, r * 0.7, 0, 0, TAU); ctx.stroke(); }
      break;
    case 'shrooms':
      for (let k = 0; k < 3; k++) {
        const mx = d.x + k * 7 - 7, my = d.y + (k % 2) * 3;
        ctx.fillStyle = '#d8ccb4'; ctx.fillRect(mx - 1, my - 5, 2, 5);
        ctx.fillStyle = k === 1 ? '#b85a4a' : '#a8905a';
        ctx.beginPath(); ctx.ellipse(mx, my - 5, 4, 2.5, 0, Math.PI, TAU); ctx.fill();
      }
      break;
    case 'skull':
      ctx.fillStyle = '#d8d0bc';
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 6, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3028'; ctx.fillRect(d.x - 3.5, d.y - 1.5, 2, 2); ctx.fillRect(d.x + 1.5, d.y - 1.5, 2, 2);
      break;
    case 'pebbles':
      ctx.fillStyle = 'rgba(40,34,30,0.35)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(d.x + Math.cos(d.ph + k * 1.7) * 8, d.y + Math.sin(d.ph + k) * 4, 2.2, 0, TAU); ctx.fill(); }
      break;
    case 'ember': {
      const glow = 0.5 + Math.sin(time * 4 + d.ph) * 0.3;
      ctx.fillStyle = `rgba(255,${110 + glow * 60},50,${glow})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 2.2, 0, TAU); ctx.fill();
      break;
    }
    case 'fissure': {
      // A crack in the ash with lava glowing in it, brightening and dimming.
      const glow = 0.55 + Math.sin(time * 2 + d.ph) * 0.25;
      const ex = d.x + Math.cos(d.a) * d.len, ey = d.y + Math.sin(d.a) * d.len * 0.6;
      const mx = (d.x + ex) / 2 + Math.sin(d.ph) * 6, my = (d.y + ey) / 2 + Math.cos(d.ph) * 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,90,30,${(glow * 0.35).toFixed(2)})`; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.strokeStyle = `rgba(255,${150 + glow * 60 | 0},70,${glow.toFixed(2)})`; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    }
    case 'shell':
      ctx.fillStyle = `rgba(${d.c},0.95)`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 4.5, 3.5, d.ph, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,110,90,0.6)'; ctx.lineWidth = 0.8;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(d.x + Math.cos(d.ph) * 3, d.y + Math.sin(d.ph) * 3); ctx.lineTo(d.x - Math.cos(d.ph + k * 0.6) * 4, d.y - Math.sin(d.ph + k * 0.6) * 3); ctx.stroke(); }
      break;
    case 'grave':
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(d.x - 6, d.y - 1, 16, 5);
      ctx.fillStyle = '#6a6870';
      ctx.beginPath(); ctx.moveTo(d.x - 6, d.y); ctx.lineTo(d.x - 6, d.y - 14); ctx.arc(d.x, d.y - 14, 6, Math.PI, TAU); ctx.lineTo(d.x + 6, d.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a8890'; ctx.fillRect(d.x - 1, d.y - 16, 2, 8); ctx.fillRect(d.x - 3.5, d.y - 13, 7, 2);
      break;
    default: break;
  }
}

/** Over everyone: tree crowns (see-through when you are under one), weather, the land's light. */
export function drawOverworldAbove(ctx, time) {
  const W = wildsState();
  if (!W) return;
  const p = world.player;

  // Tall grass in front of whoever stands in it: waist-deep.
  const front = (e) => { const S = sectorAt(e.x, e.y); if (S) for (const g of S.grass) g.drawFront(ctx, time, e); };
  if (p && !p.dead) front(p);
  for (const e of world.enemies) if (!e.dead && !e.z && inView(e.x, e.y, 20)) front(e);

  const secs = sectorsIn(camera.x - 120, camera.y - 120, camera.x + view.w + 120, camera.y + view.h + 120);
  for (const S of secs) {
    for (const t of S.trees) {
      if (!inView(t.x, t.y, 100)) continue;
      const under = p && dist(p.x, p.y, t.x, t.y - 10) < t.r;
      ctx.globalAlpha = under ? 0.35 : 1;
      const sway = Math.sin(time * 0.9 + t.sway) * 2;
      switch (t.kind) {
        case 'pine': drawPine(ctx, t, sway); break;
        case 'dead': drawDead(ctx, t, sway); break;
        case 'cypress': drawCypress(ctx, t, sway); break;
        case 'palm': drawPalm(ctx, t, sway, time); break;
        case 'blossom': drawBroad(ctx, t, sway, [214, 120, 160], 1, [246, 176, 204]); break;
        case 'dark': drawBroad(ctx, t, sway, [18, 34, 26], 0.9); break;
        default: drawBroad(ctx, t, sway, null, 1);
      }
    }
  }
  ctx.globalAlpha = 1;

  // Weather.
  for (const l of W.leaves) {
    const a = Math.min(1, (l.life - l.t), l.t * 2);
    switch (l.kind) {
      case 'snow': case 'motes':
        ctx.globalAlpha = a * (l.kind === 'motes' ? 0.7 : 0.85);
        ctx.fillStyle = l.kind === 'motes' ? '#d8ffb0' : '#f4f8ff';
        ctx.beginPath(); ctx.arc(l.x, l.y, l.s, 0, TAU); ctx.fill();
        break;
      case 'ash':
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = l.ember ? '#ff8a3a' : '#8a8484';
        ctx.fillRect(l.x, l.y, l.s * 1.4, l.s);
        break;
      case 'dust':
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = '#d8c090';
        ctx.fillRect(l.x, l.y, l.s * 6, l.s);
        break;
      case 'mist': case 'cloud': {
        ctx.globalAlpha = a * (l.kind === 'cloud' ? 0.14 : 0.1);
        ctx.fillStyle = l.kind === 'cloud' ? '#ffffff' : '#c8d8d0';
        ctx.beginPath(); ctx.ellipse(l.x, l.y, l.s, l.s * 0.45, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'wind':
        ctx.globalAlpha = a * 0.18;
        ctx.strokeStyle = '#e8e4f4'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + l.s, l.y + Math.sin(l.t * 3) * 2); ctx.stroke();
        break;
      default:
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = l.c;
        ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot);
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // The land's light over everything (not the HUD).
  const [gr, gg, gb, ga] = W.grade;
  ctx.fillStyle = `rgba(${gr | 0},${gg | 0},${gb | 0},${ga.toFixed(3)})`;
  ctx.fillRect(camera.x - 20, camera.y - 20, view.w + 40, view.h + 40);
}

function drawBroad(ctx, t, sway, tint, k, top = null) {
  const base = 40 + t.shade;
  const [r, g, b] = tint || [base - 14, base + 26, base - 6];
  ctx.fillStyle = `rgb(${r * k | 0},${g * k | 0},${b * k | 0})`;
  ctx.beginPath(); ctx.arc(t.x + sway, t.y - 16, t.r, 0, TAU); ctx.fill();
  ctx.fillStyle = top ? `rgb(${top[0]},${top[1]},${top[2]})` : tint ? `rgb(${r + 10},${g + 16},${b + 10})` : `rgb(${base - 4},${base + 42},${base + 4})`;
  ctx.beginPath(); ctx.arc(t.x - t.r * 0.25 + sway, t.y - 22 - t.r * 0.2, t.r * 0.65, 0, TAU); ctx.fill();
  ctx.fillStyle = tint ? 'rgba(120,160,120,0.12)' : 'rgba(160,200,120,0.18)';
  ctx.beginPath(); ctx.arc(t.x - t.r * 0.35 + sway, t.y - 28 - t.r * 0.3, t.r * 0.3, 0, TAU); ctx.fill();
}

/** A snow pine: three tiers of dark needles, snow on their shoulders when it lies. */
function drawPine(ctx, t, sway) {
  for (let k = 0; k < 3; k++) {
    const w = t.r * (0.95 - k * 0.24), base = t.y - 4 - k * t.r * 0.42, top = base - t.r * 0.85;
    const x = t.x + sway * (0.5 + k * 0.3);
    ctx.fillStyle = k === 0 ? '#1f3530' : k === 1 ? '#264038' : '#2d4a40';
    ctx.beginPath(); ctx.moveTo(x - w, base); ctx.lineTo(x + w, base); ctx.lineTo(x, top); ctx.closePath(); ctx.fill();
    if (!t.snowy) continue;
    ctx.fillStyle = 'rgba(234,240,248,0.92)';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55, base - t.r * 0.3); ctx.lineTo(x, top);
    ctx.lineTo(x + w * 0.3, base - t.r * 0.42); ctx.lineTo(x + w * 0.05, base - t.r * 0.33);
    ctx.closePath(); ctx.fill();
  }
}

/** A dead tree: a bare trunk and crooked branches. */
function drawDead(ctx, t, sway) {
  const x = t.x, y = t.y - 8, h = t.r * 1.5;
  ctx.strokeStyle = '#3e3630'; ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sway, y - h); ctx.stroke();
  ctx.lineWidth = 3.5;
  for (let k = 0; k < 4; k++) {
    const by = y - h * (0.45 + k * 0.14), side = k % 2 ? 1 : -1;
    const len = t.r * (0.7 - k * 0.1);
    ctx.beginPath(); ctx.moveTo(x + sway * 0.6, by);
    ctx.lineTo(x + side * len + sway, by - len * 0.5); ctx.lineTo(x + side * len * 1.3 + sway, by - len * 0.9); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** A palm: a leaning, curving trunk and a crown of fronds that stir in the wind. */
function drawPalm(ctx, t, sway, time) {
  const lean = (t.shade / 8) * 0.35;
  const h = t.r * 1.9;
  const tx = t.x + lean * h + sway * 1.5, ty = t.y - h;
  ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(t.x, t.y - 4); ctx.quadraticCurveTo(t.x + lean * h * 0.2, t.y - h * 0.6, tx, ty); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,44,28,0.5)'; ctx.lineWidth = 7;
  for (let k = 1; k < 6; k++) {
    const f = k / 6, bx = t.x + (tx - t.x) * f, by = t.y - 4 + (ty - t.y + 4) * f;
    ctx.beginPath(); ctx.moveTo(bx - 3.5, by); ctx.lineTo(bx + 3.5, by); ctx.stroke();
  }
  ctx.lineWidth = 5;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + t.sway + Math.sin(time * 1.3 + k) * 0.08;
    const len = t.r * (0.9 + (k % 2) * 0.25);
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.55 + len * 0.25;
    ctx.strokeStyle = k % 2 ? '#3f7a3a' : '#4f8e44';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo((tx + ex) / 2, ty - len * 0.25, ex, ey); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** A garden cypress: a tall dark flame of a tree. */
function drawCypress(ctx, t, sway) {
  const x = t.x + sway * 0.6, y = t.y - 6, h = t.r * 2.2, w = t.r * 0.42;
  ctx.fillStyle = '#1e3a2c';
  ctx.beginPath(); ctx.ellipse(x, y - h / 2, w, h / 2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2c5038';
  ctx.beginPath(); ctx.ellipse(x - w * 0.3, y - h * 0.55, w * 0.5, h * 0.38, 0, 0, TAU); ctx.fill();
}
