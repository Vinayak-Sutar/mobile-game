// Lairs: where the Wilds' guardians wait.
//
// Each LAIR in wilds-layout.js is a forecourt dressed for its boss, ending at
// a doorway in the lair's front, filled with a FOG GATE:
//   - the Drowned Vault (Gravemaw): a stairwell going down into the island;
//   - the Story-Tree (Kwaku Anansi): a vast hollow tree, hung with webs;
//   - Last Chance (Deadeye Vesper): a ghost town's street to a mine in the rock;
//   - the Sinkhole (Mawgrim): a rotten timber frame round a flooded shaft;
//   - the Peacock Court (Solenne): a white and gold palace front;
//   - the Echoing Amphitheatre (the Maestro): a stage, with rows of seats before it;
//   - the Nine Tombs (Mau): a stepped pyramid among obelisks and cat statues.
//
// Every front is the same shape underneath, so the fight's way in is always
// the same: two solid blocks either side of a doorway 120 wide and 80 deep,
// facing south. Walking into the doorway (the GATE) asks whether to go on.
//
// wilds-places.js builds a lair with the same kit as any place (floors,
// walls, props, guard groups); this file adds the front, the fog, and the
// few props only lairs have (obelisks, cat statues, benches, logs, webs).

import { TAU } from './util.js';

const FD = 150;                    // how deep a lair's front is
const DOOR = 60;                   // half the doorway's width
const STYLE = {
  vault: { fw: 150, h: 40 },
  sink: { fw: 170, h: 30 },
  tree: { fw: 230, h: 280 },
  town: { fw: 220, h: 130 },
  court: { fw: 240, h: 180 },
  stage: { fw: 250, h: 170 },
  pyramid: { fw: 250, h: 210 },
};

/**
 * Lay a lair out. P has gx, gy (the doorway), x, y (the forecourt's middle),
 * r and style; K is the place kit (ob, wall, building, prop, deco, floor,
 * tower, group).
 */
export function buildLair(P, K, rng) {
  const gx = P.gx, gy = P.gy, S = STYLE[P.style] || STYLE.vault, R = P.r;
  // The front: solid either side of the doorway, and behind it.
  K.ob(gx - S.fw, gy - FD, S.fw - DOOR, FD, 'lairwall', { force: true });
  K.ob(gx + DOOR, gy - FD, S.fw - DOOR, FD, 'lairwall', { force: true });
  K.ob(gx - DOOR, gy - FD, 2 * DOOR, FD - 80, 'lairwall', { force: true });
  P.gate = { x: gx - DOOR, y: gy - 80, w: 2 * DOOR, h: 80 };
  P.front = { x: gx - S.fw, y: gy - FD, w: 2 * S.fw, h: FD, H: S.h };

  switch (P.style) {
    case 'vault': {
      K.floor(gx - 240, gy - 170, 480, R + 320, 'pave');
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * (0.05 + (k / 6) * 0.9);
        K.prop(P.x + Math.cos(a) * R * 0.85, P.y + Math.sin(a) * R * 0.6 - 30, 28, 28, rng() < 0.4 ? 'block' : 'column');
      }
      K.prop(gx - 120, gy + 40, 44, 36, 'shellstatue'); K.prop(gx + 120, gy + 40, 44, 36, 'shellstatue');
      K.group(P.x, P.y + 40, 220, 3);
      break;
    }
    case 'sink': {
      K.floor(gx - 260, gy - 170, 520, R + 280, 'dirt');
      for (let k = 0; k < 16; k++) {
        const a = Math.PI * (0.02 + (k / 15) * 0.96);
        if (Math.abs(Math.cos(a)) < 0.2) continue;              // the way in
        K.ob(P.x + Math.cos(a) * R * 0.95 - 8, P.y + Math.sin(a) * R * 0.7 - 8, 16, 16, 'stake', { lean: (rng() - 0.5) * 0.5 });
      }
      K.deco(gx - 130, gy + 30, 'lantern'); K.deco(gx + 130, gy + 30, 'lantern');
      for (let k = 0; k < 4; k++) K.prop(P.x + (rng() - 0.5) * R * 1.2, P.y + (rng() - 0.3) * R * 0.8, 70, 22, 'log');
      K.group(P.x - 170, P.y, 200, 3);
      K.group(P.x + 170, P.y + 80, 200, 3);
      break;
    }
    case 'tree': {
      for (let k = 0; k < 12; k++) {
        const a = rng() * TAU, d = 140 + rng() * R * 0.8;
        K.deco(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d * 0.7, 'web');
      }
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (0.1 + rng() * 0.8), d = R * (0.5 + rng() * 0.4);
        K.prop(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d * 0.6, 80, 24, 'log');
      }
      K.group(P.x - 190, P.y - 30, 200, 3);
      K.group(P.x + 190, P.y + 60, 200, 3);
      break;
    }
    case 'town': {
      // A dusty street south from the mine, false-fronted buildings either side.
      K.floor(gx - 120, gy - 20, 240, R * 1.5, 'dirt');
      for (let k = 0; k < 3; k++) {
        const y = gy + 70 + k * 200;
        K.building(gx - 150 - 170, y, 170, 120, 'saloon');
        K.building(gx + 150, y, 170, 120, 'saloon');
      }
      K.prop(gx - 90, gy + 260, 30, 28, 'barrel'); K.prop(gx + 95, gy + 470, 30, 28, 'barrel');
      K.prop(gx + 70, gy + 150, 110, 60, 'wagon');
      const t = K.tower(gx + 360, gy + 20, 120, 100);
      K.group(gx, gy + 200, 200, 3);
      K.group(gx, gy + 520, 220, 3);
      if (t) K.group(t.x, t.y, 160, 1, { perches: [t], ranged: true });
      break;
    }
    case 'court': {
      K.floor(gx - 270, gy - 170, 540, R * 1.8, 'marble');
      for (let y = gy + 90; y < gy + R * 1.5; y += 115) { K.prop(gx - 180, y, 28, 28, 'column'); K.prop(gx + 180, y, 28, 28, 'column'); }
      K.wall(gx - 280, gy + 40, gx - 280, gy + R * 1.5, 'hedge', [], 26);
      K.wall(gx + 280, gy + 40, gx + 280, gy + R * 1.5, 'hedge', [], 26);
      K.prop(gx - 110, gy + 50, 40, 34, 'statue'); K.prop(gx + 110, gy + 50, 40, 34, 'statue');
      K.prop(gx, gy + R * 0.95, 90, 64, 'fountain');
      K.deco(gx - 70, gy + 20, 'brazier'); K.deco(gx + 70, gy + 20, 'brazier');
      K.group(gx - 90, gy + 200, 160, 3);
      K.group(gx + 90, gy + R * 1.25, 160, 3);
      break;
    }
    case 'stage': {
      // The stage's apron, and three curved rows of stone seats facing it,
      // with an aisle up the middle.
      K.floor(gx - 280, gy - 170, 560, 300, 'pave');
      for (const rr of [280, 390, 500]) {
        const n = Math.round((Math.PI * 0.8 * rr) / 75);
        for (let k = 0; k <= n; k++) {
          const a = Math.PI * (0.1 + (k / n) * 0.8);
          const x = gx + Math.cos(a) * rr, y = gy + Math.sin(a) * rr * 0.85;
          if (Math.abs(x - gx) < 90) continue;
          K.prop(x, y, 54, 16, 'bench');
        }
      }
      K.deco(gx - 200, gy + 25, 'brazier'); K.deco(gx + 200, gy + 25, 'brazier');
      K.group(gx, gy + 130, 200, 3);
      K.group(gx - 300, gy + 330, 160, 2);
      K.group(gx + 300, gy + 330, 160, 2);
      break;
    }
    case 'pyramid': {
      K.floor(gx - 150, gy - 20, 300, R * 1.5, 'pave');
      for (const y of [gy + 140, gy + 440]) { K.prop(gx - 210, y, 30, 30, 'obelisk'); K.prop(gx + 210, y, 30, 30, 'obelisk'); }
      K.prop(gx - 110, gy + 40, 36, 30, 'cat'); K.prop(gx + 110, gy + 40, 36, 30, 'cat');
      for (let k = 0; k < 7; k++) {
        const x = P.x + (rng() - 0.5) * R * 1.6, y = P.y + (rng() - 0.3) * R;
        if (Math.abs(x - gx) < 170) continue;
        K.prop(x, y, 40 + rng() * 20, 30, 'block');
      }
      K.group(gx - 250, gy + 290, 200, 3);
      K.group(gx + 250, gy + 290, 200, 3);
      K.group(gx, gy + 560, 180, 2);
      break;
    }
    default: break;
  }
}

// --- drawing -------------------------------------------------------------------------------

/** Is a point in the lair's doorway (and so at its fog)? */
export function inGate(P, x, y) {
  const g = P.gate;
  return g && x > g.x + 6 && x < g.x + g.w - 6 && y > g.y && y < g.y + g.h - 8;
}

/**
 * A lair's front and its fog (or, once its guardian has fallen, the open,
 * dark doorway). Drawn with the ground when you stand before it, over
 * everyone when you are behind it.
 */
export function drawLairFront(ctx, P, time) {
  const gx = P.gx, gy = P.gy, S = STYLE[P.style] || STYLE.vault;
  const fw = S.fw, y0 = gy - FD, top = y0 - S.h;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(gx - fw + 10, y0 + 12, fw * 2, FD);
  let door;                                     // the doorway's opening: [x, y, w, h, arched]
  switch (P.style) {
    case 'vault': door = frontLow(ctx, gx, gy, fw, top, '#56605a', '#6e7a72', 'shell'); break;
    case 'sink': door = frontLow(ctx, gx, gy, fw, top, '#4a3a28', '#5e4a32', 'plank'); break;
    case 'tree': door = frontTree(ctx, gx, gy, fw, top, time); break;
    case 'town': door = frontMine(ctx, gx, gy, fw, top); break;
    case 'court': door = frontCourt(ctx, gx, gy, fw, top); break;
    case 'stage': door = frontStage(ctx, gx, gy, fw, top, time); break;
    case 'pyramid': door = frontPyramid(ctx, gx, gy, fw, top); break;
    default: door = frontLow(ctx, gx, gy, fw, top, '#56605a', '#6e7a72', 'shell');
  }
  if (P.beaten) drawOpen(ctx, door, time);
  else drawFog(ctx, door, time, P.style === 'sink' || P.style === 'vault');
}

function doorPath(ctx, [x, y, w, h, arched]) {
  ctx.beginPath();
  if (arched) {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + w / 2);
    ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, TAU);
    ctx.lineTo(x + w, y + h);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
}

/** The fog: pale, slow and always moving, spilling a little onto the ground. */
function drawFog(ctx, door, time, low) {
  const [x, y, w, h] = door;
  const g = ctx.createRadialGradient(x + w / 2, y + h, 4, x + w / 2, y + h, w * 1.1);
  g.addColorStop(0, 'rgba(225,230,245,0.35)'); g.addColorStop(1, 'rgba(225,230,245,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w * 1.1, w * 0.4, 0, 0, TAU); ctx.fill();
  ctx.save();
  doorPath(ctx, door);
  ctx.clip();
  ctx.fillStyle = low ? 'rgba(190,196,214,0.75)' : 'rgba(205,210,228,0.8)';
  ctx.fillRect(x, y, w, h);
  for (let k = 0; k < 7; k++) {
    const ph = time * (0.35 + k * 0.07) + k * 1.9;
    const wx = x + w / 2 + Math.sin(ph) * w * 0.35;
    const wy = y + h * (0.15 + ((k * 0.17 + time * 0.05) % 1) * 0.85);
    ctx.fillStyle = `rgba(250,252,255,${(0.18 + 0.12 * Math.sin(ph * 1.7)).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(wx, wy, w * 0.42, h * 0.12, Math.sin(ph) * 0.3, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
  doorPath(ctx, door); ctx.stroke();
}

/** Beaten: the doorway stands open and dark, a last ember in it. */
function drawOpen(ctx, door, time) {
  const [x, y, w, h] = door;
  ctx.fillStyle = '#0e0b10';
  doorPath(ctx, door); ctx.fill();
  const k = 0.5 + Math.sin(time * 2) * 0.2;
  ctx.fillStyle = `rgba(255,140,70,${(0.25 * k).toFixed(2)})`;
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 10, w * 0.3, 8, 0, 0, TAU); ctx.fill();
}

/** A low frame round a stairwell going down: the Vault's stone, the Sinkhole's planks. */
function frontLow(ctx, gx, gy, fw, top, dark, light, trim) {
  const y0 = gy - FD;
  ctx.fillStyle = dark; ctx.fillRect(gx - fw, top, fw * 2, gy - top);
  ctx.fillStyle = light; ctx.fillRect(gx - fw, top, fw * 2, 12);
  // The stairwell: steps down, darker the deeper.
  for (let k = 0; k < 9; k++) {
    const yy = gy - 16 - k * 14;
    const v = 70 - k * 7;
    ctx.fillStyle = trim === 'plank' ? `rgb(${v * 0.6 | 0},${v * 0.75 | 0},${v * 0.55 | 0})` : `rgb(${v},${v + 4},${v + 2})`;
    ctx.fillRect(gx - DOOR, yy, DOOR * 2, 14);
  }
  if (trim === 'shell') {
    // A turtle's shell carved into the lintel.
    ctx.strokeStyle = 'rgba(30,40,36,0.6)'; ctx.lineWidth = 1.5;
    for (let k = -2; k <= 2; k++) {
      const hx = gx + k * 30, hy = top + 24;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; ctx.lineTo(hx + Math.cos(a) * 13, hy + Math.sin(a) * 10); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(90,140,90,0.45)';
    for (const [mx, my] of [[-fw + 20, 30], [fw - 30, 50], [-fw + 60, 100], [fw - 70, 120]]) { ctx.beginPath(); ctx.ellipse(gx + mx, top + my, 16, 8, 0, 0, TAU); ctx.fill(); }
  } else {
    // Rotten planks, and posts at the corners.
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for (let x = gx - fw + 16; x < gx + fw; x += 16) { ctx.beginPath(); ctx.moveTo(x, top + 12); ctx.lineTo(x, gy); ctx.stroke(); }
    ctx.fillStyle = '#3a2c1c';
    for (const x of [gx - fw, gx + fw - 12, gx - DOOR - 12, gx + DOOR]) ctx.fillRect(x, top - 30, 12, 30 + (gy - top));
    ctx.fillStyle = 'rgba(80,120,70,0.5)';
    ctx.fillRect(gx - DOOR, y0 + 4, DOOR * 2, 10);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(gx - fw, gy - 6, fw * 2, 6);
  return [gx - DOOR, y0 + 10, DOOR * 2, FD - 14, false];
}

function frontTree(ctx, gx, gy, fw, top, time) {
  // Roots flaring out at the foot, a trunk as wide as a house.
  ctx.fillStyle = '#3a2a1e';
  ctx.beginPath();
  ctx.moveTo(gx - fw - 30, gy);
  ctx.quadraticCurveTo(gx - fw + 40, gy - 50, gx - 150, gy - 150);
  ctx.lineTo(gx - 140, top + 70);
  ctx.lineTo(gx + 140, top + 70);
  ctx.lineTo(gx + 150, gy - 150);
  ctx.quadraticCurveTo(gx + fw - 40, gy - 50, gx + fw + 30, gy);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let k = -5; k <= 5; k++) {
    ctx.beginPath(); ctx.moveTo(gx + k * 26, top + 80); ctx.quadraticCurveTo(gx + k * 30 + 6, gy - 120, gx + k * 34, gy - 20); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,90,60,0.35)'; ctx.fillRect(gx - 140, top + 70, 30, gy - top - 120);
  // The crown, dark and heavy.
  for (const [dx, dy, rx, ry, c] of [[-120, 40, 200, 90, '#1a2a1e'], [110, 30, 210, 95, '#1c2c20'], [0, 0, 240, 100, '#22342a'], [0, -20, 150, 60, '#2a3e30']]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(gx + dx, top + dy, rx, ry, 0, 0, TAU); ctx.fill();
  }
  // Webs strung across the trunk.
  ctx.strokeStyle = 'rgba(235,235,245,0.4)'; ctx.lineWidth = 0.8;
  for (const [wx, wy] of [[gx - 95, gy - 190], [gx + 90, gy - 230], [gx + 20, top + 110]]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.sin(time * 0.6) * 0.03;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * 36, wy + Math.sin(a) * 28); ctx.stroke();
    }
    for (const r of [10, 20, 30]) { ctx.beginPath(); ctx.ellipse(wx, wy, r * 1.2, r * 0.9, 0, 0, TAU); ctx.stroke(); }
  }
  // The hollow's rim.
  ctx.fillStyle = '#241a12';
  doorPath(ctx, [gx - DOOR - 10, gy - 150, DOOR * 2 + 20, 150, true]); ctx.fill();
  return [gx - DOOR, gy - 140, DOOR * 2, 140, true];
}

function frontMine(ctx, gx, gy, fw, top) {
  // A face of the canyon's rock, in bands.
  ctx.fillStyle = '#7a5a3e';
  ctx.beginPath();
  ctx.moveTo(gx - fw - 20, gy);
  const n = 10;
  for (let k = 0; k <= n; k++) {
    const x = gx - fw - 20 + (k / n) * (fw * 2 + 40);
    ctx.lineTo(x, top + ((k * 37) % 5) * 9 + (k === 0 || k === n ? 60 : 0));
  }
  ctx.lineTo(gx + fw + 20, gy);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,24,0.5)'; ctx.lineWidth = 3;
  for (let y = top + 50; y < gy; y += 34) { ctx.beginPath(); ctx.moveTo(gx - fw, y); ctx.lineTo(gx + fw, y + 6); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,220,170,0.12)'; ctx.fillRect(gx - fw, top + 40, fw * 2, 16);
  // The timber frame, and a board over it.
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(gx - DOOR - 16, gy - 130, 16, 130); ctx.fillRect(gx + DOOR, gy - 130, 16, 130);
  ctx.fillRect(gx - DOOR - 26, gy - 146, DOOR * 2 + 52, 18);
  ctx.fillStyle = '#8a6a44'; ctx.fillRect(gx - 50, gy - 186, 100, 28);
  ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 2; ctx.strokeRect(gx - 50, gy - 186, 100, 28);
  ctx.fillStyle = '#2a1a10'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('LAST CHANCE', gx, gy - 168);
  // A lantern on the post.
  ctx.fillStyle = 'rgba(255,190,90,0.3)'; ctx.beginPath(); ctx.arc(gx + DOOR + 30, gy - 100, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffcc6a'; ctx.fillRect(gx + DOOR + 24, gy - 108, 12, 14);
  return [gx - DOOR, gy - 128, DOOR * 2, 128, false];
}

function frontCourt(ctx, gx, gy, fw, top) {
  // White marble, gold at the edges, a pediment over all.
  ctx.fillStyle = '#e6e0d4'; ctx.fillRect(gx - fw, top + 50, fw * 2, gy - top - 50);
  ctx.fillStyle = '#d0c8ba'; ctx.fillRect(gx - fw, gy - 20, fw * 2, 20);
  ctx.fillStyle = '#d4aa4a'; ctx.fillRect(gx - fw - 8, top + 42, fw * 2 + 16, 12);
  ctx.fillStyle = '#ece6da';
  ctx.beginPath(); ctx.moveTo(gx - fw - 8, top + 44); ctx.lineTo(gx, top - 10); ctx.lineTo(gx + fw + 8, top + 44); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d4aa4a'; ctx.lineWidth = 3; ctx.stroke();
  for (const k of [-0.82, -0.48, 0.48, 0.82]) {
    const x = gx + k * fw;
    ctx.fillStyle = '#f4f0e8'; ctx.fillRect(x - 12, top + 54, 24, gy - top - 74);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 4, top + 54, 8, gy - top - 74);
    ctx.fillStyle = '#d4aa4a'; ctx.fillRect(x - 15, top + 54, 30, 6);
  }
  // A peacock's fan over the doorway.
  const fx = gx, fy = gy - 138;
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI + (k / 12) * Math.PI;
    ctx.strokeStyle = k % 2 ? '#2a8a8a' : '#2a6ab0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * 78, fy + Math.sin(a) * 60); ctx.stroke();
    ctx.fillStyle = '#e8c050'; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 74, fy + Math.sin(a) * 57, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a3a6a'; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 74, fy + Math.sin(a) * 57, 2.2, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#d4aa4a'; ctx.lineWidth = 4;
  doorPath(ctx, [gx - DOOR - 4, gy - 136, DOOR * 2 + 8, 136, true]); ctx.stroke();
  return [gx - DOOR, gy - 132, DOOR * 2, 132, true];
}

function frontStage(ctx, gx, gy, fw, top, time) {
  // A stage house of dark stone; red curtains drawn back from the opening.
  ctx.fillStyle = '#3a3440'; ctx.fillRect(gx - fw, top + 20, fw * 2, gy - top - 20);
  ctx.fillStyle = '#4e4656'; ctx.fillRect(gx - fw, top + 20, fw * 2, 16);
  ctx.fillStyle = '#c8a048'; ctx.fillRect(gx - fw + 30, top + 50, fw * 2 - 60, 6);
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#8a1e2a';
    ctx.beginPath();
    ctx.moveTo(gx + s * (DOOR + 4), gy - 150);
    ctx.quadraticCurveTo(gx + s * (DOOR + 30), gy - 70, gx + s * (DOOR + 14), gy);
    ctx.lineTo(gx + s * (fw - 30), gy);
    ctx.lineTo(gx + s * (fw - 30), gy - 150);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    for (let k = 1; k < 5; k++) { const x = gx + s * (DOOR + 10 + k * ((fw - DOOR - 40) / 5)); ctx.beginPath(); ctx.moveTo(x, gy - 150); ctx.lineTo(x, gy); ctx.stroke(); }
  }
  // Two masks over the stage.
  for (const [s, c] of [[-1, '#e8e0cc'], [1, '#d8c8a8']]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(gx + s * 38, top + 90, 20, 24, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(gx + s * 38 - 10, top + 82, 6, 4); ctx.fillRect(gx + s * 38 + 4, top + 82, 6, 4);
    ctx.beginPath(); ctx.arc(gx + s * 38, top + 100 + (s > 0 ? 6 : 0), 7, s > 0 ? Math.PI : 0, s > 0 ? TAU : Math.PI); ctx.fill();
  }
  // Footlights.
  for (let x = gx - fw + 30; x <= gx + fw - 30; x += 40) {
    const k = 0.7 + Math.sin(time * 3 + x) * 0.2;
    ctx.fillStyle = `rgba(255,210,120,${(0.35 * k).toFixed(2)})`; ctx.beginPath(); ctx.arc(x, gy - 4, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd88a'; ctx.fillRect(x - 3, gy - 7, 6, 5);
  }
  return [gx - DOOR, gy - 146, DOOR * 2, 146, false];
}

function frontPyramid(ctx, gx, gy, fw, top) {
  // Five steps of sandstone, narrowing to the top.
  const steps = 5, sh = (gy - top) / steps;
  for (let k = 0; k < steps; k++) {
    const w = fw * (1 - k * 0.16), y = gy - (k + 1) * sh;
    ctx.fillStyle = k % 2 ? '#c8a870' : '#bc9c64'; ctx.fillRect(gx - w, y, w * 2, sh);
    ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.fillRect(gx - w, y, w * 2, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(gx + w * 0.6, y, w * 0.4, sh);
  }
  // A cat's head over the door, and marks cut round it.
  ctx.fillStyle = '#8a6a3e';
  const cy = gy - 172;
  ctx.beginPath(); ctx.arc(gx, cy, 20, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(gx - 18, cy - 8); ctx.lineTo(gx - 14, cy - 30); ctx.lineTo(gx - 4, cy - 16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(gx + 18, cy - 8); ctx.lineTo(gx + 14, cy - 30); ctx.lineTo(gx + 4, cy - 16); ctx.fill();
  ctx.fillStyle = '#5fe0a0'; ctx.fillRect(gx - 10, cy - 3, 6, 3); ctx.fillRect(gx + 4, cy - 3, 6, 3);
  ctx.fillStyle = 'rgba(90,60,30,0.5)';
  for (let k = 0; k < 8; k++) ctx.fillRect(gx - fw * 0.8 + k * fw * 0.2 + (k > 3 ? 30 : 0), gy - 110 + (k % 2) * 16, 8, 10);
  ctx.fillStyle = '#6a4e2a'; ctx.fillRect(gx - DOOR - 12, gy - 140, DOOR * 2 + 24, 14);
  return [gx - DOOR, gy - 126, DOOR * 2, 126, false];
}

// --- props and decoration only lairs have ---------------------------------------------------------

export function drawLairProp(ctx, o) {
  const x = o.x + o.w / 2, y = o.y + o.h;
  switch (o.style) {
    case 'obelisk':
      ctx.fillStyle = '#b09060'; ctx.fillRect(o.x, o.y + 4, o.w, o.h - 4);
      ctx.fillStyle = '#c8a870';
      ctx.beginPath(); ctx.moveTo(x - 10, o.y + 6); ctx.lineTo(x - 7, o.y - 96); ctx.lineTo(x, o.y - 110); ctx.lineTo(x + 7, o.y - 96); ctx.lineTo(x + 10, o.y + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(90,60,30,0.45)';
      for (let k = 0; k < 5; k++) ctx.fillRect(x - 3, o.y - 80 + k * 16, 6, 7);
      break;
    case 'cat':
    case 'shellstatue': {
      ctx.fillStyle = o.style === 'cat' ? '#a88a5a' : '#5e6a64';
      ctx.fillRect(o.x, o.y + 4, o.w, o.h - 4);
      ctx.fillStyle = o.style === 'cat' ? '#c8a870' : '#7a8a80';
      if (o.style === 'cat') {
        // Sitting, tall, ears up.
        ctx.beginPath(); ctx.ellipse(x, o.y - 14, 12, 20, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x, o.y - 40, 10, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 9, o.y - 44); ctx.lineTo(x - 7, o.y - 58); ctx.lineTo(x - 1, o.y - 48); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 9, o.y - 44); ctx.lineTo(x + 7, o.y - 58); ctx.lineTo(x + 1, o.y - 48); ctx.fill();
      } else {
        // A turtle in stone, its shell domed.
        ctx.beginPath(); ctx.ellipse(x, o.y - 8, o.w * 0.5, 16, 0, Math.PI, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + o.w * 0.5, o.y - 6, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,40,36,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 10, o.y - 20); ctx.lineTo(x + 10, o.y - 20); ctx.moveTo(x, o.y - 24); ctx.lineTo(x, o.y - 8); ctx.stroke();
      }
      break;
    }
    case 'bench':
      ctx.fillStyle = '#6e6874'; ctx.fillRect(o.x, o.y - 8, o.w, o.h + 8);
      ctx.fillStyle = '#8a8490'; ctx.fillRect(o.x, o.y - 8, o.w, 5);
      break;
    case 'log':
      ctx.fillStyle = '#4a3624'; ctx.fillRect(o.x, o.y - 10, o.w, o.h + 4);
      ctx.fillStyle = '#6a4e34'; ctx.fillRect(o.x, o.y - 10, o.w, 5);
      ctx.fillStyle = '#8a6a48'; ctx.beginPath(); ctx.ellipse(o.x + o.w, y - 10, 6, (o.h + 4) / 2, 0, 0, TAU); ctx.fill();
      break;
    default: break;
  }
  void y;
}

export function drawLairDeco(ctx, d, time) {
  if (d.style === 'web') {
    ctx.strokeStyle = 'rgba(235,235,245,0.4)'; ctx.lineWidth = 0.8;
    for (let k = 0; k < 8; k++) {
      const a = d.ph + (k / 8) * TAU;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + Math.cos(a) * 30, d.y + Math.sin(a) * 20); ctx.stroke();
    }
    for (const r of [8, 16, 24]) { ctx.beginPath(); ctx.ellipse(d.x, d.y, r * 1.2, r * 0.8, 0, 0, TAU); ctx.stroke(); }
  } else if (d.style === 'lantern') {
    const k = 0.75 + Math.sin(time * 2.3 + d.ph) * 0.2;
    ctx.fillStyle = '#2a2018'; ctx.fillRect(d.x - 2, d.y - 44, 4, 44);
    ctx.fillStyle = `rgba(170,230,140,${(0.28 * k).toFixed(2)})`; ctx.beginPath(); ctx.arc(d.x, d.y - 46, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8f08a'; ctx.fillRect(d.x - 5, d.y - 52, 10, 12);
  }
}
