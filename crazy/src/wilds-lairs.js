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
//   - the Nine Tombs (Mau): a stepped pyramid among obelisks and cat statues;
//   - Kharn's Caldera: a black basalt arch cracked with lava, at the Peaks' top;
//   - the Serpent Temple (Nagaraja): a carved door behind a waterfall;
//   - the Frozen Chapel (the Weeping Bride): a snowbound chapel on the ice;
//   - the Highest Shrine (the Monkey King): a pagoda above the clouds;
//   - the Wardens' Gatehouse (the Twin Wardens): two towers over the Great
//     Bridge - a PASSAGE: beat them and the way onto the bridge is open;
//   - the Moon Keep (Ser Aldric): the citadel's keep;
//   - the Ashen Gate (the Warden of Ash): thirteen sockets over a sealed door,
//     one lit for every Remnant; it opens only when all thirteen burn.
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
  caldera: { fw: 240, h: 170 },
  falls: { fw: 230, h: 200 },
  chapel: { fw: 200, h: 200 },
  pagoda: { fw: 220, h: 210 },
  bridge: { fw: 170, h: 200 },
  keep: { fw: 250, h: 220 },
  ashen: { fw: 300, h: 250 },
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
  // A passage's back wall is its door: it goes when the guardian falls.
  K.ob(gx - DOOR, gy - FD, 2 * DOOR, FD - 80, 'lairwall', { force: true, ...(P.passage ? { opensWith: P.id } : {}) });
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
    case 'caldera': {
      K.floor(gx - 200, gy - 20, 400, R * 1.3, 'gravel');
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.05 + rng() * 0.9), d = 140 + rng() * R * 0.8;
        K.deco(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d * 0.6 - 60, 'lava');
      }
      for (let k = 0; k < 6; k++) {
        const x = P.x + (rng() - 0.5) * R * 1.7, y = P.y + (rng() - 0.4) * R;
        if (Math.abs(x - gx) < 150) continue;
        K.prop(x, y, 50 + rng() * 26, 36, 'basalt');
      }
      K.group(gx - 170, gy + 230, 200, 3);
      K.group(gx + 170, gy + 380, 200, 3);
      break;
    }
    case 'falls': {
      K.floor(gx - 130, gy - 20, 260, R * 1.3, 'pave');
      for (let y = gy + 120; y < gy + R * 1.2; y += 150) { K.prop(gx - 170, y, 30, 30, 'serpent'); K.prop(gx + 170, y, 30, 30, 'serpent'); }
      K.deco(gx - 90, gy + 30, 'brazier'); K.deco(gx + 90, gy + 30, 'brazier');
      K.group(gx, gy + 200, 200, 3);
      K.group(gx, gy + 470, 200, 3);
      break;
    }
    case 'chapel': {
      K.floor(gx - 240, gy - 40, 480, R * 1.5, 'ice');
      for (let y = gy + 110; y < gy + R * 1.2; y += 85) {
        for (const x of [gx - 250, gx - 180, gx + 180, gx + 250]) if (rng() < 0.75) K.prop(x, y, 18, 12, 'grave');
      }
      for (let k = 0; k < 6; k++) K.deco(gx + (rng() - 0.5) * 300, gy + 60 + rng() * 300, 'candle');
      K.group(gx - 150, gy + 250, 180, 3);
      K.group(gx + 150, gy + 420, 180, 3);
      break;
    }
    case 'pagoda': {
      K.floor(gx - 150, gy - 20, 300, R * 1.6, 'pave');
      for (const y of [gy + 90, gy + 280]) { K.prop(gx - 150, y, 26, 26, 'stonelantern'); K.prop(gx + 150, y, 26, 26, 'stonelantern'); }
      K.group(gx, gy + 260, 170, 2);
      break;
    }
    case 'bridge': {
      K.floor(gx - 170, gy, 340, R * 1.2, 'pave');
      K.deco(gx - 120, gy + 40, 'brazier'); K.deco(gx + 120, gy + 40, 'brazier');
      K.deco(gx - 190, gy + 10, 'banner'); K.deco(gx + 170, gy + 10, 'banner');
      for (let k = 0; k < 4; k++) K.prop(gx + (k < 2 ? -1 : 1) * (190 + rng() * 80), gy + 200 + rng() * 260, 44, 34, 'block');
      K.group(gx, gy + 240, 200, 3);
      K.group(gx, gy + 460, 220, 3);
      break;
    }
    case 'keep': {
      K.floor(gx - 150, gy - 20, 300, R * 1.9, 'pave');
      for (let y = gy + 120; y < gy + R * 1.7; y += 160) { K.prop(gx - 190, y, 40, 34, 'statue'); K.prop(gx + 190, y, 40, 34, 'statue'); }
      K.deco(gx - 110, gy + 20, 'brazier'); K.deco(gx + 110, gy + 20, 'brazier');
      K.deco(gx - 280, gy + 10, 'banner'); K.deco(gx + 260, gy + 10, 'banner');
      K.group(gx, gy + 250, 200, 3);
      K.group(gx, gy + 520, 200, 3);
      break;
    }
    case 'ashen': {
      // No guards: only the gate, its braziers, and the dais.
      K.floor(gx - 330, gy - 40, 660, 300, 'pave');
      for (const x of [gx - 250, gx - 130, gx + 130, gx + 250]) K.deco(x, gy + 40, 'brazier');
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
    case 'caldera': door = frontCaldera(ctx, gx, gy, fw, top, time); break;
    case 'falls': door = frontFalls(ctx, gx, gy, fw, top); break;
    case 'chapel': door = frontChapel(ctx, gx, gy, fw, top); break;
    case 'pagoda': door = frontPagoda(ctx, gx, gy, fw, top, time); break;
    case 'bridge': door = frontGatehouse(ctx, gx, gy, fw, top, time); break;
    case 'keep': door = frontKeep(ctx, gx, gy, fw, top); break;
    case 'ashen': door = frontAshen(ctx, gx, gy, fw, top, time, P.sockets || 0, P.needs || 13); break;
    default: door = frontLow(ctx, gx, gy, fw, top, '#56605a', '#6e7a72', 'shell');
  }
  if (P.beaten && P.passage) drawRaised(ctx, door);
  else if (P.beaten) drawOpen(ctx, door, time);
  else if (P.needs && (P.sockets || 0) < P.needs) drawSealed(ctx, door, time);
  else drawFog(ctx, door, time, P.style === 'sink' || P.style === 'vault');
  if (P.style === 'falls') drawWaterfall(ctx, gx, gy, top, time);
}

/** A passage opened: the portcullis drawn up, the way through clear. */
function drawRaised(ctx, [x, y, w]) {
  ctx.fillStyle = '#2a2622'; ctx.fillRect(x, y, w, 16);
  ctx.fillStyle = '#4a4440';
  for (let k = x + 8; k < x + w; k += 16) ctx.fillRect(k, y + 16, 4, 10);
}

/** The Ashen Gate while Remnants are still missing: shut, iron, an ember seam. */
function drawSealed(ctx, door, time) {
  const [x, y, w, h] = door;
  ctx.fillStyle = '#26221f'; doorPath(ctx, door); ctx.fill();
  ctx.fillStyle = '#3a3430';
  ctx.fillRect(x + 4, y + w / 2, w / 2 - 6, h - w / 2); ctx.fillRect(x + w / 2 + 2, y + w / 2, w / 2 - 6, h - w / 2);
  ctx.fillStyle = '#5a524c';
  for (let yy = y + w / 2 + 12; yy < y + h; yy += 22) for (const xx of [x + 14, x + w / 2 - 14, x + w / 2 + 14, x + w - 14]) { ctx.beginPath(); ctx.arc(xx, yy, 2.5, 0, TAU); ctx.fill(); }
  const k = 0.6 + Math.sin(time * 1.7) * 0.25;
  ctx.fillStyle = `rgba(255,110,50,${k.toFixed(2)})`; ctx.fillRect(x + w / 2 - 1.5, y + 8, 3, h - 8);
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

function frontCaldera(ctx, gx, gy, fw, top, time) {
  // Black basalt heaped into an arch, cracked through with lava.
  ctx.fillStyle = '#26221f';
  ctx.beginPath(); ctx.moveTo(gx - fw - 20, gy);
  for (let k = 0; k <= 12; k++) {
    const x = gx - fw - 20 + (k / 12) * (fw * 2 + 40);
    const hump = Math.sin((k / 12) * Math.PI);
    ctx.lineTo(x, top + 20 + (1 - hump) * 90 + ((k * 53) % 7) * 5);
  }
  ctx.lineTo(gx + fw + 20, gy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a3430';
  for (const [dx, dy, w, h] of [[-fw + 10, 60, 70, 40], [fw - 90, 80, 80, 36], [-60, 20, 50, 30], [40, 40, 60, 34]]) ctx.fillRect(gx + dx, top + dy, w, h);
  const k = 0.7 + Math.sin(time * 2.2) * 0.2;
  ctx.strokeStyle = `rgba(255,120,40,${k.toFixed(2)})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  for (const pts of [[[-fw + 30, gy - 30], [-fw + 70, gy - 90], [-120, gy - 110], [-90, top + 70]], [[fw - 30, gy - 20], [fw - 90, gy - 100], [110, gy - 130], [80, top + 60]]]) {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(gx + x, y) : ctx.moveTo(gx + x, y))); ctx.stroke();
  }
  // Heat from the door, and embers rising.
  const g = ctx.createRadialGradient(gx, gy - 40, 4, gx, gy - 40, 150);
  g.addColorStop(0, `rgba(255,120,40,${(0.35 * k).toFixed(2)})`); g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy - 40, 150, 0, TAU); ctx.fill();
  for (let e = 0; e < 8; e++) {
    const f = (time * 0.4 + e * 0.13) % 1;
    ctx.fillStyle = `rgba(255,170,80,${(0.8 * (1 - f)).toFixed(2)})`;
    ctx.fillRect(gx - 90 + e * 25 + Math.sin(time + e) * 8, gy - 60 - f * 220, 3, 3);
  }
  return [gx - DOOR, gy - 140, DOOR * 2, 140, true];
}

function frontFalls(ctx, gx, gy, fw, top) {
  // A cliff of wet green rock, a temple door carved in it, a serpent round the arch.
  ctx.fillStyle = '#3e4a44'; ctx.fillRect(gx - fw - 20, top, fw * 2 + 40, gy - top);
  ctx.fillStyle = '#4e5c54';
  for (let y = top + 20; y < gy; y += 40) ctx.fillRect(gx - fw - 20, y, fw * 2 + 40, 6);
  ctx.fillStyle = 'rgba(90,150,90,0.4)';
  for (const [dx, dy] of [[-fw, 30], [fw - 40, 60], [-fw + 40, 140], [fw - 70, 150]]) { ctx.beginPath(); ctx.ellipse(gx + dx, top + dy, 30, 12, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#5a6a60'; doorPath(ctx, [gx - DOOR - 16, gy - 156, DOOR * 2 + 32, 156, true]); ctx.fill();
  ctx.strokeStyle = '#4a8a5a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 30; k++) {
    const a = Math.PI + (k / 30) * Math.PI;
    const r = DOOR + 26 + Math.sin(k * 0.9) * 6;
    const x = gx + Math.cos(a) * r, y = gy - 90 + Math.sin(a) * r;
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, gy);
  }
  ctx.lineTo(gx + DOOR + 26, gy); ctx.stroke();
  ctx.fillStyle = '#4a8a5a'; ctx.beginPath(); ctx.ellipse(gx, gy - 90 - DOOR - 30, 16, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd45e'; ctx.fillRect(gx - 8, gy - 90 - DOOR - 33, 4, 3); ctx.fillRect(gx + 4, gy - 90 - DOOR - 33, 4, 3);
  return [gx - DOOR, gy - 140, DOOR * 2, 140, true];
}

/** The Serpent Temple's waterfall, falling in front of its door. */
function drawWaterfall(ctx, gx, gy, top, time) {
  const x0 = gx - DOOR - 30, w = DOOR * 2 + 60;
  ctx.fillStyle = 'rgba(150,200,230,0.28)'; ctx.fillRect(x0, top - 40, w, gy - top + 40);
  for (let k = 0; k < 16; k++) {
    const x = x0 + 4 + k * (w - 8) / 15;
    const off = (time * 260 + k * 47) % 60;
    ctx.strokeStyle = `rgba(230,245,255,${(0.25 + (k % 3) * 0.1).toFixed(2)})`; ctx.lineWidth = 2;
    for (let y = top - 40 + off; y < gy; y += 60) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(gy, y + 30)); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(240,250,255,0.5)';
  for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(x0 + 10 + k * (w - 20) / 6, gy - 2 + Math.sin(time * 5 + k) * 2, 14, 5, 0, 0, TAU); ctx.fill(); }
}

function frontChapel(ctx, gx, gy, fw, top) {
  // Pale stone under a steep slate roof, snow along it, a bell over the door.
  ctx.fillStyle = '#9aa4b0'; ctx.fillRect(gx - fw, top + 90, fw * 2, gy - top - 90);
  ctx.fillStyle = '#3a4050';
  ctx.beginPath(); ctx.moveTo(gx - fw - 16, top + 96); ctx.lineTo(gx, top); ctx.lineTo(gx + fw + 16, top + 96); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eef3fa';
  ctx.beginPath(); ctx.moveTo(gx - fw - 16, top + 96); ctx.lineTo(gx, top); ctx.lineTo(gx + fw + 16, top + 96); ctx.lineTo(gx + fw, top + 88); ctx.lineTo(gx, top + 12); ctx.lineTo(gx - fw, top + 88); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#dde6f0';
  for (let x = gx - fw; x < gx + fw; x += 18) { ctx.beginPath(); ctx.moveTo(x, top + 96); ctx.lineTo(x + 4, top + 110 + ((x * 7) % 9)); ctx.lineTo(x + 8, top + 96); ctx.fill(); }
  ctx.fillStyle = '#5a6070'; ctx.fillRect(gx - 14, top - 40, 28, 44);
  ctx.fillStyle = '#c8a860'; ctx.beginPath(); ctx.arc(gx, top - 20, 8, Math.PI, TAU); ctx.fill();
  // A rose window, and the pointed door.
  ctx.fillStyle = '#6a7ab0'; ctx.beginPath(); ctx.arc(gx, gy - 200, 22, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a4050'; ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.beginPath(); ctx.moveTo(gx, gy - 200); ctx.lineTo(gx + Math.cos(a) * 22, gy - 200 + Math.sin(a) * 22); ctx.stroke(); }
  ctx.fillStyle = '#7a8494';
  ctx.beginPath(); ctx.moveTo(gx - DOOR - 12, gy); ctx.lineTo(gx - DOOR - 12, gy - 110); ctx.lineTo(gx, gy - 160); ctx.lineTo(gx + DOOR + 12, gy - 110); ctx.lineTo(gx + DOOR + 12, gy); ctx.closePath(); ctx.fill();
  return [gx - DOOR, gy - 146, DOOR * 2, 146, true];
}

function frontPagoda(ctx, gx, gy, fw, top, time) {
  // Red pillars under two curling green roofs, gold at every edge.
  const roof = (y, w) => {
    ctx.fillStyle = '#2a5a48';
    ctx.beginPath(); ctx.moveTo(gx - w - 30, y + 10); ctx.quadraticCurveTo(gx - w, y + 30, gx - w + 20, y + 30);
    ctx.lineTo(gx + w - 20, y + 30); ctx.quadraticCurveTo(gx + w, y + 30, gx + w + 30, y + 10); ctx.lineTo(gx + w - 30, y - 18); ctx.lineTo(gx - w + 30, y - 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8c050'; ctx.lineWidth = 3; ctx.stroke();
  };
  ctx.fillStyle = '#8a2a24'; ctx.fillRect(gx - fw + 20, top + 110, fw * 2 - 40, gy - top - 110);
  ctx.fillStyle = '#b8382e';
  for (const k of [-0.8, -0.35, 0.35, 0.8]) ctx.fillRect(gx + k * fw - 10, top + 110, 20, gy - top - 110);
  roof(top + 100, fw);
  ctx.fillStyle = '#8a2a24'; ctx.fillRect(gx - fw * 0.6, top + 40, fw * 1.2, 60);
  roof(top + 36, fw * 0.7);
  ctx.fillStyle = '#e8c050'; ctx.beginPath(); ctx.moveTo(gx - 6, top + 18); ctx.lineTo(gx, top - 20); ctx.lineTo(gx + 6, top + 18); ctx.fill();
  // Cloud drifting past the foot.
  for (let k = 0; k < 4; k++) {
    const x = gx - fw + ((time * 18 + k * 140) % (fw * 2 + 80)) - 40;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x, gy - 6, 50, 12, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#e8c050'; ctx.lineWidth = 3;
  doorPath(ctx, [gx - DOOR - 4, gy - 136, DOOR * 2 + 8, 136, false]); ctx.stroke();
  return [gx - DOOR, gy - 132, DOOR * 2, 132, false];
}

function frontGatehouse(ctx, gx, gy, fw, top, time) {
  // Two square towers over the bridge's end, a sun and a hammer on their banners.
  for (const s of [-1, 1]) {
    const x = s < 0 ? gx - fw : gx + DOOR;
    ctx.fillStyle = '#7a746c'; ctx.fillRect(x, top, fw - DOOR, gy - top);
    ctx.fillStyle = '#948e84'; ctx.fillRect(x, top, fw - DOOR, 10);
    for (let k = 0; k < 4; k++) ctx.fillRect(x + k * ((fw - DOOR) / 4), top - 14, (fw - DOOR) / 8, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    for (let y = top + 22; y < gy; y += 18) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + fw - DOOR, y); ctx.stroke(); }
    const flap = Math.sin(time * 2.5 + s) * 3;
    ctx.fillStyle = s < 0 ? '#c89a2a' : '#6a6878';
    ctx.beginPath(); ctx.moveTo(x + 14, top + 30); ctx.lineTo(x + fw - DOOR - 14, top + 30); ctx.lineTo(x + fw - DOOR - 14 + flap, top + 120); ctx.lineTo(x + (fw - DOOR) / 2, top + 100); ctx.lineTo(x + 14 + flap, top + 120); ctx.closePath(); ctx.fill();
    ctx.fillStyle = s < 0 ? '#ffe08a' : '#2a2830';
    if (s < 0) { ctx.beginPath(); ctx.arc(x + (fw - DOOR) / 2, top + 64, 12, 0, TAU); ctx.fill(); }
    else { ctx.fillRect(x + (fw - DOOR) / 2 - 3, top + 52, 6, 30); ctx.fillRect(x + (fw - DOOR) / 2 - 12, top + 48, 24, 10); }
  }
  ctx.fillStyle = '#6a645c'; ctx.fillRect(gx - DOOR, top + 20, DOOR * 2, 44);
  ctx.fillStyle = '#948e84'; ctx.fillRect(gx - DOOR, top + 20, DOOR * 2, 8);
  return [gx - DOOR, top + 64, DOOR * 2, gy - top - 64, false];
}

function frontKeep(ctx, gx, gy, fw, top) {
  // The citadel's keep: tall blue-grey stone, arrow slits, a crescent on its banners.
  ctx.fillStyle = '#5e6678'; ctx.fillRect(gx - fw, top + 20, fw * 2, gy - top - 20);
  ctx.fillStyle = '#707a8e';
  for (let k = 0; k < 9; k++) ctx.fillRect(gx - fw + k * (fw * 2 / 9), top, fw * 2 / 18, 22);
  ctx.fillRect(gx - fw, top + 20, fw * 2, 8);
  ctx.fillStyle = '#1e2230';
  for (const dx of [-fw + 40, -fw + 100, fw - 50, fw - 110]) { ctx.fillRect(gx + dx, top + 60, 6, 26); ctx.fillRect(gx + dx, top + 120, 6, 26); }
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#2a3a6a'; ctx.fillRect(gx + s * 110 - 22, top + 40, 44, 110);
    ctx.fillStyle = '#e8f0ff'; ctx.beginPath(); ctx.arc(gx + s * 110, top + 80, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a3a6a'; ctx.beginPath(); ctx.arc(gx + s * 110 + 6, top + 76, 11, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#4a5264'; doorPath(ctx, [gx - DOOR - 14, gy - 160, DOOR * 2 + 28, 160, true]); ctx.fill();
  return [gx - DOOR, gy - 146, DOOR * 2, 146, true];
}

function frontAshen(ctx, gx, gy, fw, top, time, sockets, needs) {
  // Obsidian pillars and an iron arch; over it, an arc of sockets, lit one by one.
  ctx.fillStyle = '#1e1a1c'; ctx.fillRect(gx - fw, top + 60, fw * 2, gy - top - 60);
  ctx.fillStyle = '#2e2828';
  for (const s of [-1, 1]) ctx.fillRect(gx + s * (fw - 50) - 40, top + 20, 80, gy - top - 20);
  ctx.fillStyle = '#3e3634'; ctx.fillRect(gx - fw - 10, top + 50, fw * 2 + 20, 16);
  ctx.fillStyle = '#2a2424'; doorPath(ctx, [gx - DOOR - 30, gy - 200, DOOR * 2 + 60, 200, true]); ctx.fill();
  for (let k = 0; k < needs; k++) {
    const a = Math.PI * (1.08 + (k / (needs - 1)) * 0.84);
    const x = gx + Math.cos(a) * (fw - 60), y = top + 170 + Math.sin(a) * 120;
    const lit = k < sockets;
    ctx.fillStyle = '#0e0c0c'; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
    if (lit) {
      const fl = 0.8 + Math.sin(time * 4 + k) * 0.2;
      ctx.fillStyle = `rgba(255,120,50,${(0.3 * fl).toFixed(2)})`; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb35e'; ctx.beginPath(); ctx.arc(x, y, 7 * fl, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#5a4e48'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
  }
  return [gx - DOOR, gy - 160, DOOR * 2, 160, true];
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
    case 'basalt':
      ctx.fillStyle = '#26221f'; ctx.fillRect(o.x, o.y - 24, o.w, o.h + 24);
      ctx.fillStyle = '#3a3430'; ctx.fillRect(o.x, o.y - 24, o.w, 8);
      ctx.fillStyle = 'rgba(255,110,40,0.5)'; ctx.fillRect(o.x + o.w * 0.3, o.y - 10, 2, o.h);
      break;
    case 'serpent':
      ctx.fillStyle = '#4a5a50'; ctx.fillRect(o.x, o.y + 4, o.w, o.h - 4);
      ctx.strokeStyle = '#4a8a5a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 10, o.y + 2);
      ctx.quadraticCurveTo(x + 14, o.y - 12, x - 6, o.y - 24); ctx.quadraticCurveTo(x - 16, o.y - 36, x + 2, o.y - 50); ctx.stroke();
      ctx.fillStyle = '#4a8a5a'; ctx.beginPath(); ctx.ellipse(x + 4, o.y - 54, 8, 6, 0, 0, TAU); ctx.fill();
      break;
    case 'stonelantern':
      ctx.fillStyle = '#8a8690'; ctx.fillRect(x - 4, o.y - 30, 8, 34 + o.h - 4);
      ctx.fillRect(o.x - 2, o.y - 44, o.w + 4, 16);
      ctx.fillStyle = 'rgba(255,210,130,0.8)'; ctx.fillRect(x - 5, o.y - 40, 10, 8);
      ctx.fillStyle = '#6a6670'; ctx.beginPath(); ctx.moveTo(o.x - 6, o.y - 44); ctx.lineTo(x, o.y - 56); ctx.lineTo(o.x + o.w + 6, o.y - 44); ctx.fill();
      break;
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
  } else if (d.style === 'lava') {
    const k = 0.6 + Math.sin(time * 1.8 + d.ph) * 0.25;
    ctx.strokeStyle = `rgba(255,110,40,${k.toFixed(2)})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(d.x - 20, d.y); ctx.lineTo(d.x - 6, d.y - 5); ctx.lineTo(d.x + 5, d.y + 3); ctx.lineTo(d.x + 22, d.y - 2); ctx.stroke();
  } else if (d.style === 'candle') {
    const k = 0.8 + Math.sin(time * 9 + d.ph) * 0.2;
    ctx.fillStyle = '#e8e0cc'; ctx.fillRect(d.x - 2, d.y - 10, 4, 10);
    ctx.fillStyle = `rgba(255,200,110,${(0.35 * k).toFixed(2)})`; ctx.beginPath(); ctx.arc(d.x, d.y - 13, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd88a'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 13, 2, 4 * k, 0, 0, TAU); ctx.fill();
  } else if (d.style === 'lantern') {
    const k = 0.75 + Math.sin(time * 2.3 + d.ph) * 0.2;
    ctx.fillStyle = '#2a2018'; ctx.fillRect(d.x - 2, d.y - 44, 4, 44);
    ctx.fillStyle = `rgba(170,230,140,${(0.28 * k).toFixed(2)})`; ctx.beginPath(); ctx.arc(d.x, d.y - 46, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8f08a'; ctx.fillRect(d.x - 5, d.y - 52, 10, 12);
  }
}
