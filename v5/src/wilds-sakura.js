// Cloud Summit, as a Japanese mountain in blossom.
//
// The owner asked for a Japan-inspired land - red shrine gates, red lanterns,
// cherry blossom, petals on the air - and chose Cloud Summit for it: it already
// has the Monkey King's pagoda at the top, tengu on its slopes and a road that
// switchbacks up four tiers. Here:
//   - TORII: the roads up the mountain pass through tunnels of vermilion gates
//     (the thousand gates of Fushimi Inari), eight at a time with a stretch of
//     open road between; a great gate stands where each road first enters the
//     land. Their pillars are solid; the beams are drawn over everyone, so you
//     walk under them. Every other gate in a tunnel has a red paper lantern
//     (chochin) hanging from it.
//   - TORO: stone lanterns, lit, in pairs along the open stretches.
//   - SAKURA: cherry trees, their crowns in clusters of pink, a carpet of
//     fallen petals under each, petals shaken from them on the wind - and
//     petals kicked up where you walk.
//   - The land's own buildings (wilds-places.js) turn Japanese there: houses
//     of dark timber and white plaster under curved tiled roofs, and a
//     vermilion shrine with a gate before it.
// The snow stays on the very top, a crown like Fuji's.

import { TAU } from './util.js';

const TUNNEL = 8, SPACING = 74, GAP = 440;     // gates in a tunnel, how far apart, the open stretch after
const HALF = 46, H = 66;                        // an ordinary gate: half its width, its height
const BIG_HALF = 78, BIG_H = 100;               // the great gate at the land's edge

/**
 * Lay the gates and lanterns along the Summit's roads. ctx: { roads (polylines),
 * regionAt, raised (with .near), waterAt, inChasm, places, roadDist(x, y) }.
 * Returns { gates, obs } - obs are the solid pillars and lantern bases.
 */
export function planShrine(ctx) {
  const gates = [], obs = [];
  const ok = (x, y, pad) => {
    if (ctx.waterAt(x, y) || ctx.inChasm(x, y)) return false;
    const b = ctx.raised.near(x - pad, y - pad, x + pad, y + pad);
    for (const r of [...b.faces, ...b.stairs, ...b.rims]) {
      if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return false;
    }
    if (ctx.places.some((P) => Math.hypot(x - P.x, y - P.y) < P.r + 30)) return false;
    return true;
  };
  // Only near the Summit is it worth asking which land a point is in.
  const R = ctx.summit;
  const summit = (x, y) => Math.abs(x - R.x) < R.r * 1.6 && Math.abs(y - R.y) < R.r * 1.6 && ctx.regionAt(x, y).id === 'summit';
  const tryGate = (x, y, ux, uy, big, lantern) => {
    const half = big ? BIG_HALF : HALF;
    const px = -uy, py = ux;
    const A = [x + px * half, y + py * half], B = [x - px * half, y - py * half];
    for (const [qx, qy] of [A, B]) {
      if (!ok(qx, qy, 26)) return false;
      if (ctx.roadDist(qx, qy) < half - 6) return false;       // another road runs by: it would stand in it
    }
    if (!ok(x, y, 20)) return false;
    if (gates.some((g) => Math.hypot(g.x - x, g.y - y) < SPACING * 0.8)) return false;
    const g = { x, y, ux, uy, half, h: big ? BIG_H : H, big, lantern, ph: (x * 0.013 + y * 0.007) % TAU };
    gates.push(g);
    const w = big ? 12 : 9;
    for (const [qx, qy] of [A, B]) obs.push({ x: qx - w / 2, y: qy - w / 2, w, h: w, kind: 'torii', gate: g, big });
    return true;
  };
  // Along a road that runs across the screen a gate would be seen edge-on, as
  // two bare poles: there the road is lined with red paper lanterns instead.
  const tryPosts = (x, y, ux, uy) => {
    const px = -uy, py = ux;
    for (const s of [1, -1]) {
      const qx = x + px * 52 * s, qy = y + py * 52 * s;
      if (!ok(qx, qy, 16) || ctx.roadDist(qx, qy) < 44) continue;
      obs.push({ x: qx - 4, y: qy - 4, w: 8, h: 8, kind: 'chochin', ph: (qx * 0.7 + qy) % TAU });
    }
  };
  const tryLanterns = (x, y, ux, uy) => {
    const px = -uy, py = ux;
    for (const s of [1, -1]) {
      const qx = x + px * 66 * s, qy = y + py * 66 * s;
      if (!ok(qx, qy, 24) || ctx.roadDist(qx, qy) < 50) continue;
      obs.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, kind: 'toro', ph: (qx + qy) % TAU });
    }
  };

  // Gates the places ask for (a shrine's own gate), stood where they are.
  for (const q of ctx.extra || []) {
    const half = q.big ? BIG_HALF : HALF;
    const g = { x: q.x, y: q.y, ux: q.ux, uy: q.uy, half, h: q.big ? BIG_H : H, big: !!q.big, lantern: true, ph: 0 };
    gates.push(g);
    const w = q.big ? 12 : 9;
    for (const s of [1, -1]) obs.push({ x: q.x - q.uy * half * s - w / 2, y: q.y + q.ux * half * s - w / 2, w, h: w, kind: 'torii', gate: g, big: !!q.big });
  }

  // Gates the places ask for (a shrine's own gate), stood where they are.
  for (const q of ctx.extra || []) {
    const half = q.big ? BIG_HALF : HALF;
    const g = { x: q.x, y: q.y, ux: q.ux, uy: q.uy, half, h: q.big ? BIG_H : H, big: !!q.big, lantern: true, ph: 0 };
    gates.push(g);
    const w = q.big ? 12 : 9;
    for (const s of [1, -1]) obs.push({ x: q.x - q.uy * half * s - w / 2, y: q.y + q.ux * half * s - w / 2, w, h: w, kind: 'torii', gate: g, big: !!q.big });
  }

  for (const road of ctx.roads) {
    let inside = false, n = 0, gapLeft = 0, since = 0;
    for (let i = 1; i < road.length; i++) {
      const [ax, ay] = road[i - 1], [bx, by] = road[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let d = 0; d < len; d += 12) {
        const x = ax + ux * d, y = ay + uy * d;
        // Keep clear of the bends: a gate there would stand across the next leg.
        if (d < 70 || len - d < 70) { since += 12; continue; }
        if (!inside && !summit(x, y)) { since += 12; continue; }
        const here = summit(x, y);
        if (here && !inside) {
          inside = true;
          if (Math.abs(uy) >= 0.7 && tryGate(x, y, ux, uy, true, true)) { since = 0; n = 0; gapLeft = GAP * 0.6; continue; }
        }
        if (!here) { inside = false; since += 12; continue; }
        since += 12;
        if (gapLeft > 0) {
          gapLeft -= 12;
          if (Math.abs(gapLeft - GAP / 2) < 6) tryLanterns(x, y, ux, uy);
          continue;
        }
        if (Math.abs(uy) < 0.7) {
          // Across the screen: lantern posts every so often, no gates.
          if (since >= 150) { tryPosts(x, y, ux, uy); since = 0; }
          continue;
        }
        if (since >= SPACING && tryGate(x, y, ux, uy, false, n % 2 === 0)) {
          since = 0; n++;
          if (n >= TUNNEL) { n = 0; gapLeft = GAP; }
        }
      }
    }
  }
  return { gates, obs };
}

// --- drawing -------------------------------------------------------------------------------------

const VERMILION = '#d8402a', VERM_DARK = '#9a2a1c', BLACK = '#1e1614';

/** A gate's pillar (drawn with the ground). */
export function drawToriiPillar(ctx, o) {
  const x = o.x + o.w / 2, y = o.y + o.h / 2 + 3;
  const g = o.gate, h = g.h, w = o.big ? 10 : 7;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 2, w, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = VERMILION; ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = VERM_DARK; ctx.fillRect(x + w * 0.1, y - h, w * 0.4, h);
  ctx.fillStyle = BLACK; ctx.fillRect(x - w / 2 - 1, y - 7, w + 2, 7);           // the black foot (kamaki)
}

/** A gate's beams, over everyone: the lower tie (nuki), the black top (kasagi), a lantern. */
export function drawToriiBeams(ctx, g, time) {
  const px = -g.uy, py = g.ux;
  const at = (s, lift) => [g.x + px * s, g.y + py * s - lift];
  const over = g.half * 0.34;
  // The tie beam, a little past each pillar.
  const [n1x, n1y] = at(g.half + over * 0.4, g.h * 0.7), [n2x, n2y] = at(-g.half - over * 0.4, g.h * 0.7);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = VERM_DARK; ctx.lineWidth = g.big ? 7 : 5;
  ctx.beginPath(); ctx.moveTo(n1x, n1y + 1); ctx.lineTo(n2x, n2y + 1); ctx.stroke();
  ctx.strokeStyle = VERMILION; ctx.lineWidth = g.big ? 5 : 3.6;
  ctx.beginPath(); ctx.moveTo(n1x, n1y); ctx.lineTo(n2x, n2y); ctx.stroke();
  // The centre strut, and on a great gate its name plaque.
  const [c1x, c1y] = at(0, g.h * 0.7), [c2x, c2y] = at(0, g.h);
  ctx.strokeStyle = VERMILION; ctx.lineWidth = g.big ? 5 : 3;
  ctx.beginPath(); ctx.moveTo(c1x, c1y); ctx.lineTo(c2x, c2y); ctx.stroke();
  if (g.big) {
    ctx.fillStyle = BLACK; ctx.fillRect(c1x - 6, (c1y + c2y) / 2 - 8, 12, 16);
    ctx.fillStyle = '#e8c050'; ctx.fillRect(c1x - 1, (c1y + c2y) / 2 - 5, 2, 10);
  }
  // The top beams: vermilion under black, the ends sweeping up.
  const lift = g.big ? 7 : 5;
  const [k1x, k1y] = at(g.half + over, g.h + lift), [k2x, k2y] = at(-g.half - over, g.h + lift);
  const [m1x, m1y] = at(g.half * 0.5, g.h), [m2x, m2y] = at(-g.half * 0.5, g.h);
  const beam = (w, color, dy) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(k1x, k1y + dy); ctx.quadraticCurveTo(m1x, m1y + dy + 1, (m1x + m2x) / 2, (m1y + m2y) / 2 + dy + 1);
    ctx.quadraticCurveTo(m2x, m2y + dy + 1, k2x, k2y + dy); ctx.stroke();
  };
  beam(g.big ? 7 : 5, VERMILION, 5);
  beam(g.big ? 7 : 5, BLACK, 0);
  ctx.lineCap = 'butt';
  // A red paper lantern hanging from the tie beam.
  if (g.lantern) {
    const [lx, ly] = at(0, g.h * 0.7 - 16);
    const sway = Math.sin(time * 1.6 + g.ph) * 1.5;
    lanternGlow(ctx, lx + sway, ly, time + g.ph, 26);
    ctx.strokeStyle = BLACK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c1x, c1y); ctx.lineTo(lx + sway, ly - 7); ctx.stroke();
    chochin(ctx, lx + sway, ly, g.big ? 1.3 : 1);
  }
}

/** A red paper lantern: ribbed, with black caps. */
function chochin(ctx, x, y, k = 1) {
  ctx.fillStyle = '#d83a2a'; ctx.beginPath(); ctx.ellipse(x, y, 5 * k, 7 * k, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(80,10,10,0.45)'; ctx.lineWidth = 0.7;
  for (let d = -4; d <= 4; d += 2.6) { ctx.beginPath(); ctx.moveTo(x - 4.6 * k, y + d * k); ctx.lineTo(x + 4.6 * k, y + d * k); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,220,150,0.45)'; ctx.beginPath(); ctx.ellipse(x - 1.4 * k, y, 1.6 * k, 4 * k, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = BLACK; ctx.fillRect(x - 3 * k, y - 8 * k, 6 * k, 2 * k); ctx.fillRect(x - 3 * k, y + 6 * k, 6 * k, 2 * k);
}

function lanternGlow(ctx, x, y, t, r) {
  const k = 0.8 + Math.sin(t * 2.3) * 0.12 + Math.sin(t * 5.1) * 0.06;
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
  gr.addColorStop(0, `rgba(255,120,70,${(0.32 * k).toFixed(2)})`); gr.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** A stone lantern (toro): a pedestal, a lit fire box, a wide roof, a jewel on top. */
export function drawToro(ctx, o, time) {
  const x = o.x + o.w / 2, y = o.y + o.h / 2 + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 1, 11, 4, 0, 0, TAU); ctx.fill();
  lanternGlow(ctx, x, y - 26, time + (o.ph || 0), 40);
  ctx.fillStyle = '#8a8690'; ctx.fillRect(x - 8, y - 4, 16, 4);                  // base
  ctx.fillStyle = '#9a96a0'; ctx.fillRect(x - 3, y - 18, 6, 14);                  // post
  ctx.fillStyle = '#8a8690'; ctx.fillRect(x - 7, y - 21, 14, 3);                  // platform
  ctx.fillStyle = '#6a6670'; ctx.fillRect(x - 5, y - 31, 10, 10);                 // fire box
  const k = 0.75 + Math.sin(time * 3 + (o.ph || 0)) * 0.2;
  ctx.fillStyle = `rgba(255,200,110,${k.toFixed(2)})`; ctx.fillRect(x - 3, y - 29, 6, 6);
  ctx.fillStyle = '#7a7680';
  ctx.beginPath(); ctx.moveTo(x - 11, y - 31); ctx.quadraticCurveTo(x, y - 40, x + 11, y - 31); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - 38, 2.4, 0, TAU); ctx.fill();
}

/** A red paper lantern on a post: along a road (an obstacle) or in a place (a deco). */
export function drawChochinPost(ctx, d, time) {
  lanternGlow(ctx, d.x, d.y - 30, time + (d.ph || 0), 30);
  ctx.fillStyle = '#3a2a1c'; ctx.fillRect(d.x - 1.5, d.y - 40, 3, 40); ctx.fillRect(d.x - 1.5, d.y - 40, 9, 2.5);
  chochin(ctx, d.x + 6, d.y - 30, 1);
}

// --- cherry trees and their petals ------------------------------------------------------------

/** A cherry tree: a dark crooked trunk and a crown of pink clusters. */
export function drawSakura(ctx, t, sway, time) {
  const x = t.x, y = t.y - 8;
  // Trunk and two limbs.
  ctx.strokeStyle = '#3a2620'; ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x - 4, y - 14, x + sway * 0.5, y - t.r * 0.7); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x - 1, y - 12); ctx.quadraticCurveTo(x - t.r * 0.4, y - 20, x - t.r * 0.6 + sway, y - t.r * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 1, y - 16); ctx.quadraticCurveTo(x + t.r * 0.35, y - 24, x + t.r * 0.55 + sway, y - t.r * 0.95); ctx.stroke();
  ctx.lineCap = 'butt';
  // The crown: overlapping clusters, darker below, pale on top, a few near-white.
  const cy = y - t.r * 0.95;
  const blobs = t.blobs || (t.blobs = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * TAU + t.sway, d = t.r * (0.35 + ((i * 37) % 10) / 22);
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.6, r: t.r * (0.36 + ((i * 53) % 10) / 40) };
  }));
  const layer = (col, off, k) => {
    ctx.fillStyle = col;
    for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b.dx * k + sway, cy + b.dy * k + off, b.r * k, 0, TAU); ctx.fill(); }
  };
  layer('#c8708e', 6, 1);
  layer('#e897b0', 0, 0.92);
  layer('#f6bfd0', -5, 0.7);
  ctx.fillStyle = 'rgba(255,240,246,0.85)';
  for (let k = 0; k < 7; k++) {
    const b = blobs[k];
    ctx.beginPath(); ctx.arc(x + b.dx * 0.8 + sway - 3, cy + b.dy * 0.8 - 8, 2.2, 0, TAU); ctx.fill();
  }
  void time;
}

/** A fallen-petal carpet under a tree (a ground decal). */
export function drawPetalBed(ctx, d) {
  for (let k = 0; k < 6; k++) {
    const a = d.ph + k * 1.7, r = 4 + (k * 5) % 13;
    ctx.fillStyle = k % 3 ? 'rgba(246,176,204,0.8)' : 'rgba(255,230,238,0.85)';
    ctx.beginPath(); ctx.ellipse(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r * 0.5, 2.2, 1.3, a, 0, TAU); ctx.fill();
  }
}

/** A petal on the air: new, from the wind or a tree or your feet. */
export function newPetal(x, y, opts = {}) {
  return {
    x, y, t: 0, kind: 'sakura',
    life: opts.life ?? 3 + Math.random() * 3,
    vx: opts.vx ?? 18 + Math.random() * 26, vy: opts.vy ?? 12 + Math.random() * 16,
    rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 5, flip: 2 + Math.random() * 4,
    s: 1.8 + Math.random() * 1.6, c: Math.random() < 0.7 ? '#f6b0c8' : '#fff0f4', fall: opts.fall ?? 0,
  };
}

/** A petal, turning over and over as it falls. */
export function drawPetal(ctx, l, a) {
  ctx.globalAlpha = a * 0.9;
  ctx.save();
  ctx.translate(l.x, l.y);
  ctx.rotate(l.rot);
  ctx.scale(1, 0.25 + Math.abs(Math.cos(l.t * l.flip)) * 0.75);
  ctx.fillStyle = l.c;
  ctx.beginPath(); ctx.ellipse(0, 0, l.s * 1.4, l.s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(200,90,130,0.45)';
  ctx.beginPath(); ctx.arc(l.s * 1.1, 0, l.s * 0.35, 0, TAU); ctx.fill();
  ctx.restore();
}

/** A petal's motion: the wind, a flutter from side to side, a slow fall. */
export function stepPetal(l, dt) {
  l.vx += Math.sin(l.t * 2.4 + l.flip) * 14 * dt;
  if (l.fall) l.vy = Math.min(l.vy + 40 * dt, 30);
  l.rot += l.spin * dt;
}
