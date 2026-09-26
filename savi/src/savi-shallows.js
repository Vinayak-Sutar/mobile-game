// THE DROWNED HOLLOW — the level for the second root, and the only place in
// this valley where the ground is not safe.
//
// A wide flooded bowl. The near third of it is ankle-deep and she can wade it;
// the rest is DEEP, and deep water is a wall - she will not put a foot in it.
// Two long sandbars stand out of it like the ribs of something, and between
// them three deep channels run north to south across her way. Fallen leaves as
// broad as cartwheels float on those channels, and that is the crossing:
//
//   ONE    still leaves, well inside a jump. This is JUMP, and nothing else.
//   TWO    a leaf near the bank, and then 145 of open water off the far side of
//          it - further than a jump goes. She has to DASH out of the air.
//   THREE  one leaf adrift on the current, sliding east and west. When it is
//          near she can step on; when it is far she cannot. So she WAITS, rides
//          it over, and steps off. Nothing here is hard; it only asks her to
//          stand still for a moment, which is the whole tone of the game.
//
// Out in the middle of the bowl is a stone hummock the old people built a
// sluice into, and the sluice is jammed shut with driftwood. Haul that free and
// the hollow empties down it, and the Great Root under all this water breathes
// for the first time in two years.
//
// Three rules keep it cozy:
//   - a leaf SINKS while she stands on it and floats back the moment she steps
//     off, so she keeps moving and nothing ever chases her;
//   - going in the water costs nothing at all. She comes up on the last dry
//     ground she stood on, and the leaves are all still there;
//   - once the hollow drains the whole bowl is walkable, for good.

const TAU = Math.PI * 2;

/** The bowl. Its wandering edge is pondK() in savi.js; this is the ellipse. */
export const POOL = { x: 4150, y: 2210, rx: 1000, ry: 560 };
/** The hummock out in the middle of it, with the sluice built into its far side. */
export const ISLE = { x: 4520, y: 2210, r: 140 };
/** The jam in the sluice gate. Four good hauls. */
export const JAM = { x: 4600, y: 2240, r: 70, hauls: 0, need: 4 };

/**
 * The x bands of the bowl she can WADE: the near shore, and the two sandbars.
 * Everything else inside the bowl is over her head.
 */
// None of these widths are free. Two numbers govern the whole level:
//
//   a jump carries her 116, and a jump with a dash out of it carries her 181
//   - the dash only replaces her walking speed for its 0.16s, so it is worth
//   65 on top, not the 91 it is worth from standing. Measured, not assumed.
//
// So EVERY channel has to be wider than 197, or she crosses it without ever
// touching a leaf and the leaves are scenery. And every gap between one leaf
// and the next has to be under 106, except the one that teaches the dash. The
// first cut of this level got both wrong - 149-wide channels she could simply
// dash, and a moat round the hummock 9 units too narrow to keep her off it.
const BARS = [[0, 3400], [3640, 3750], [4020, 4120]];
/** And the three channels those bands leave between them, for the drawing. */
export const CHANNELS = [[3400, 3640], [3750, 4020], [4120, 4380]];

/** True where the bowl is deep — before the wading test, which savi.js owns. */
export function deepBand(x, y) {
  if (onIsle(x, y)) return false;
  for (const b of BARS) if (x >= b[0] && x <= b[1]) return false;
  return true;
}
export const onIsle = (x, y) => Math.hypot(x - ISLE.x, y - ISLE.y) < ISLE.r;

/** A floating leaf. `ax`/`ay` is how far the current carries it, `rate` how fast. */
function leaf(x, y, r, o) {
  o = o || {};
  return {
    x, y, x0: x, y0: y, r,
    ax: o.ax || 0, ay: o.ay || 0, rate: o.rate || 0.34, phase: o.phase || 0,
    sink: 0, dip: 0, dx: 0, dy: 0,
  };
}

export const LEAVES = [
  // One, across 240 of water: two hops of 78. Nothing but the jump.
  leaf(3520, 2210, 42), leaf(3520, 2430, 42),
  // Two, across 270: 74 onto the leaf, then 124 off the far side of it, which
  // is further than a jump goes. She is standing still and safe when she finds
  // that out, which is the right place to find it out.
  leaf(3860, 2210, 40), leaf(3860, 2010, 40),
  // Three, across 260: one leaf on the current, swinging 110 each way on a five
  // second breath - never more than five seconds of waiting, which is about as
  // long as anyone will wait before they think the game is broken. When it is in
  // against the near bank she can step on; by the time it is out in the middle
  // both banks are 200 off, further than she can throw herself. So she waits for
  // it, rides it over, and steps off at the other end.
  leaf(4250, 2210, 40, { ax: 110, rate: 1.2 }),
];

/** The leaf she is over, if one is still up. */
export function leafAt(x, y) {
  for (const L of LEAVES) {
    if (L.sink >= 1) continue;
    if (Math.hypot(x - L.x, y - (L.y + L.dip)) < L.r * 0.9) return L;
  }
  return null;
}

/**
 * The leaves, every frame. `standing` is the one she is on, or null. Each leaf
 * carries how far it moved this frame in `dy`, so she rides the drifting ones.
 */
export function stepShallows(dt, t, standing) {
  for (const L of LEAVES) {
    if (L.ax || L.ay) {
      const k = Math.sin(t * L.rate + L.phase);
      const nx = L.x0 + L.ax * k, ny = L.y0 + L.ay * k;
      L.dx = nx - L.x; L.dy = ny - L.y;
      L.x = nx; L.y = ny;
    } else { L.dx = 0; L.dy = 0; }
    // Her weight rides it down; off it, it comes straight back up. Six seconds
    // of standing is plenty to ride the drifting one across and still hurry.
    if (L === standing) L.sink = Math.min(1, L.sink + dt * 0.17);
    else L.sink = Math.max(0, L.sink - dt * 0.8);
    L.dip = L.sink * 6 + Math.sin(t * 1.3 + L.phase) * 0.9;
  }
}

/** One haul on the jam. True on the haul that frees it. */
export function haul() {
  JAM.hauls = Math.min(JAM.need, JAM.hauls + 1);
  return JAM.hauls >= JAM.need;
}
export const jamClear = () => JAM.hauls >= JAM.need;

// --- drawing -------------------------------------------------------------------

/** Under the water: the channels read deeper, and a suggestion of the bottom. */
export function drawDeep(ctx, t, drained) {
  if (drained) return;
  for (const c of CHANNELS) {
    const g = ctx.createLinearGradient(c[0], 0, c[1], 0);
    g.addColorStop(0, 'rgba(10,26,40,0)');
    g.addColorStop(0.22, 'rgba(8,22,36,0.46)');
    g.addColorStop(0.78, 'rgba(8,22,36,0.46)');
    g.addColorStop(1, 'rgba(10,26,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c[0], POOL.y - POOL.ry, c[1] - c[0], POOL.ry * 2);
  }
  // The deep moat right round the hummock, so it reads as an island.
  const g2 = ctx.createRadialGradient(ISLE.x, ISLE.y, ISLE.r, ISLE.x, ISLE.y, ISLE.r + 260);
  g2.addColorStop(0, 'rgba(8,22,36,0.5)');
  g2.addColorStop(1, 'rgba(8,22,36,0)');
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(ISLE.x, ISLE.y, ISLE.r + 260, 0, TAU); ctx.fill();
}

/** The hummock and its sluice, and the jam still in the gate. */
export function drawSluice(ctx, t, drained) {
  const I = ISLE;
  // The hummock: stone, above the water.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(I.x + 8, I.y + 14, I.r * 1.02, I.r * 0.72, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a6358';
  ctx.beginPath(); ctx.ellipse(I.x, I.y, I.r, I.r * 0.86, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7b7365';
  ctx.beginPath(); ctx.ellipse(I.x - 12, I.y - 16, I.r * 0.86, I.r * 0.68, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#55604a';
  ctx.beginPath(); ctx.ellipse(I.x - 24, I.y - 30, I.r * 0.6, I.r * 0.44, 0.3, 0, TAU); ctx.fill();

  // The sluice: two cut stones and a gate between them, on the far side.
  const sx = JAM.x, sy = JAM.y;
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#8a8172';
    ctx.fillRect(sx - 8, sy + s * 54 - 16, 52, 32);
    ctx.fillStyle = '#6d6558';
    ctx.fillRect(sx - 8, sy + s * 54 + 8, 52, 8);
  }
  // The gate itself, and the water lying still against it.
  ctx.fillStyle = drained ? '#4a4438' : '#3c3a32';
  ctx.fillRect(sx - 4, sy - 40, 12, 80);
  if (!drained) {
    ctx.fillStyle = 'rgba(150,196,210,0.3)';
    ctx.fillRect(sx - 30, sy - 40, 26, 80);
  } else {
    // Running out, now that it can.
    ctx.strokeStyle = 'rgba(178,214,226,0.65)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const y = sy - 30 + i * 15;
      ctx.beginPath();
      ctx.moveTo(sx + 8, y);
      ctx.quadraticCurveTo(sx + 40, y + Math.sin(t * 3 + i) * 5, sx + 78, y + 8);
      ctx.stroke();
    }
  }

  // The jam: driftwood wedged across the gate, going as she hauls.
  const left = 1 - JAM.hauls / JAM.need;
  if (left > 0) {
    for (let i = 0; i < 13; i++) {
      if (i / 13 > left) continue;
      ctx.save();
      ctx.translate(sx - 14 + Math.cos(i * 1.37) * 12, sy + Math.sin(i * 1.37) * 34);
      ctx.rotate((i * 0.83) % 1.6 - 0.8);
      ctx.fillStyle = i % 2 ? '#5a4529' : '#42311f';
      ctx.beginPath(); ctx.ellipse(0, 0, 54 - (i % 3) * 10, 5.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6d5432';
      ctx.beginPath(); ctx.ellipse(-52 + (i % 3) * 10, 0, 4, 5, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // Weed caught in it.
    ctx.strokeStyle = 'rgba(70,96,54,0.7)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 7; i++) {
      if (i / 7 > left) continue;
      const y = sy - 30 + i * 10;
      ctx.beginPath();
      ctx.moveTo(sx - 20, y);
      ctx.quadraticCurveTo(sx - 46, y + 8, sx - 62, y + Math.sin(t + i) * 5);
      ctx.stroke();
    }
  }
}

/** The floating leaves. Drawn over the water, under her. */
export function drawLeaves(ctx, t, drained) {
  for (const L of LEAVES) {
    const y = L.y + L.dip;
    ctx.fillStyle = `rgba(8,22,34,${0.28 + L.sink * 0.24})`;
    ctx.beginPath();
    ctx.ellipse(L.x + 3, y + 6, L.r * 0.98, L.r * 0.5, 0, 0, TAU);
    ctx.fill();
    const tilt = Math.sin(t * 0.8 + L.phase) * 0.06 + (L.ax || L.ay ? 0.1 : 0);
    ctx.save();
    ctx.translate(L.x, y);
    ctx.rotate(tilt);
    const g = ctx.createLinearGradient(-L.r, 0, L.r, 0);
    g.addColorStop(0, L.sink > 0.5 ? '#4a5c33' : '#a8761f');
    g.addColorStop(0.5, L.sink > 0.5 ? '#5d7340' : '#c9903a');
    g.addColorStop(1, '#8a5f22');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, L.r, L.r * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,40,16,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Midrib and veins.
    ctx.strokeStyle = 'rgba(86,60,22,0.5)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-L.r * 0.82, 0); ctx.lineTo(L.r * 0.82, 0); ctx.stroke();
    ctx.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      const vx = i * L.r * 0.22;
      ctx.beginPath();
      ctx.moveTo(vx, 0); ctx.lineTo(vx + L.r * 0.12, -L.r * 0.46);
      ctx.moveTo(vx, 0); ctx.lineTo(vx + L.r * 0.12, L.r * 0.46);
      ctx.stroke();
    }
    // A notch at the stem end, so it is a leaf and not a plate.
    ctx.fillStyle = drained ? 'rgba(60,52,36,0.5)' : 'rgba(10,24,38,0.5)';
    ctx.beginPath();
    ctx.moveTo(-L.r, 0);
    ctx.lineTo(-L.r * 0.5, -L.r * 0.15);
    ctx.lineTo(-L.r * 0.5, L.r * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Riding low: the water closing in over its rim.
    if (L.sink > 0.4) {
      ctx.strokeStyle = `rgba(190,224,232,${(L.sink - 0.4) * 0.8})`;
      ctx.lineWidth = 2;
      const k = 1 + (L.sink - 0.4) * 0.5;
      ctx.beginPath();
      ctx.ellipse(L.x, y, L.r * k, L.r * 0.52 * k, 0, 0, TAU);
      ctx.stroke();
    }
  }
}
