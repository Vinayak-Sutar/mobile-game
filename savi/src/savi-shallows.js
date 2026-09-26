// THE DROWNED HOLLOW — a crossing in three acts.
//
// The old one was a striped rectangle. The basin was cut into vertical bands,
// alternating wadeable and deep, which meant you could walk north or south
// along a stripe for ever and the "islands" were not islands at all. It had no
// shape, so it had no route, so nothing about crossing it read as a journey.
//
// This is a place. A flooded bowl two thousand units across, with a wadeable
// shelf all the way round its rim and deep water lying in the middle of it, and
// standing out of the deep: two sandbars and a stone hummock, in a line that
// BENDS. The route runs from the south-west shore north-east to the first
// sandbar, south-east to the second, then north-east again to the hummock. It
// bends because a straight line across a lake is a corridor, and because
// bending it means you can stand on a sandbar and look back over the water you
// have already crossed.
//
// Three acts, each asking for one thing:
//
//   ONE   two still leaves, three hops of about ninety. Jump, nothing else.
//   TWO   a gap of a hundred and forty, which a jump cannot make and a jump
//         with a dash out of it can. You find that out standing safely on a
//         sandbar, which is the right place to find it out.
//   THREE the ferry. One great leaf on the current, travelling three hundred
//         and fifty units on a seven-and-a-half second breath. At its near end
//         it touches the sandbar and you step on; at its far end it touches the
//         hummock and you step off. In between it is out of jumping reach of
//         both, so riding it is the way over and waiting for it is the beat.
//
// And on the hummock, THE CAPSTAN. The hollow is held in by a sluice gate, and
// the gate comes up by walking the capstan bar round three times. Not a button
// pressed four times: a circle walked, with the gate climbing the whole way and
// the water finding its way under it as soon as there is any gap at all.
//
// THE NUMBERS ARE NOT NEGOTIABLE. Measured in the running game from a standing
// start: a jump carries her 116, and a jump with a dash out of it 181. So every
// gap here is either UNDER 95 - a jump, with twenty per cent in hand - or
// BETWEEN 130 AND 150 - a dash, with thirty in hand. Nothing is allowed to sit
// between those two bands, because a gap that only just works is worse than one
// that plainly does not: it fails about one try in four and the player blames
// themselves for it. savi/tools/check-level.mjs asserts every one of these
// without opening a browser, and it runs in the commit hook.

const TAU = Math.PI * 2;

/** The bowl. Its wandering edge is pondK() in savi.js; this is the ellipse. */
export const POOL = { x: 4050, y: 2200, rx: 1150, ry: 780 };

/**
 * Where the shelf ends and it is over her head. Anything in the bowl further
 * out than this is wadeable, so there is a shallow rim right round the lake she
 * can paddle along, and the deep is a lens lying in the middle of it.
 */
export const SHELF = 0.78;

/** Ground standing out of the deep. She can walk on these. */
export const ISLES = [
  { x: 3700, y: 2150, rx: 100, ry: 78, kind: 'sand' },    // act one's landfall
  { x: 4120, y: 2620, rx: 90, ry: 70, kind: 'sand' },     // act two's landfall
  { x: 4555, y: 2180, rx: 135, ry: 135, kind: 'stone' },  // the sluice hummock
];
export const SLUICE = ISLES[2];

/** The capstan on the hummock, and the gate it raises. */
export const CAPSTAN = { x: 4551, y: 2176, r: 52, turns: 0, need: 3, wound: 0 };
export const GATE = { x: 4676, y: 2180, w: 26, h: 96 };

/** Where the Great Root lies, under all of it. */
export const ROOT_LINE = [[2980, 2540], [3500, 2430], [4050, 2330], [4460, 2230]];

/** A floating leaf. `ax`/`ay` is how far the current carries it, and which way. */
function leaf(x, y, r, o) {
  o = o || {};
  return {
    x, y, x0: x, y0: y, r,
    ax: o.ax || 0, ay: o.ay || 0, rate: o.rate || 0.3, phase: o.phase || 0,
    ferry: !!o.ferry, sink: 0, dip: 0, dx: 0, dy: 0,
  };
}

export const LEAVES = [
  // ONE — north-east off the shore. Three hops of 87, and nothing else. The
  // shelf comes further in along this leg than the ellipse suggests, so there
  // is room for two leaves here and not three; the check script found the first
  // one sitting on the edge of the shallows where she could walk onto it.
  leaf(3359, 2370, 44), leaf(3506, 2275, 44),
  // TWO — south-east off the sandbar. The first gap wants the dash; then a hop.
  leaf(3888, 2360, 42), leaf(3991, 2475, 42),
  // THREE — the ferry, north-east to the hummock. 346 of travel, 7.5s a breath,
  // so the wait is never more than about four seconds and the ride is the same.
  leaf(4343, 2415, 46, { ax: 127.5, ay: -117, rate: TAU / 7.5, ferry: true }),
];
export const FERRY = LEAVES[LEAVES.length - 1];

// --- what you can stand on ----------------------------------------------------

export function onIsle(x, y) {
  for (const i of ISLES) {
    const dx = (x - i.x) / i.rx, dy = (y - i.y) / i.ry;
    if (dx * dx + dy * dy < 1) return i;
  }
  return null;
}

/** The leaf she is over, allowing for how far it is riding down. */
export function leafAt(x, y) {
  for (const L of LEAVES) {
    if (L.sink >= 1) continue;
    if (Math.hypot(x - L.x, y - (L.y + L.dip)) < L.r * 0.9) return L;
  }
  return null;
}

/**
 * The leaves, every frame. `standing` is the one she is on, or null. Each keeps
 * how far it moved this frame, so she rides the ones that move.
 */
export function stepShallows(dt, t, standing) {
  for (const L of LEAVES) {
    if (L.ax || L.ay) {
      const k = Math.sin(t * L.rate + L.phase);
      const nx = L.x0 + L.ax * k, ny = L.y0 + L.ay * k;
      L.dx = nx - L.x; L.dy = ny - L.y;
      L.x = nx; L.y = ny;
    } else { L.dx = 0; L.dy = 0; }
    // Her weight rides it down, and it comes back up the moment she steps off.
    // The ferry barely sinks at all: it has to carry her for four seconds.
    if (L === standing) L.sink = Math.min(1, L.sink + dt * (L.ferry ? 0.05 : 0.15));
    else L.sink = Math.max(0, L.sink - dt * 0.8);
    L.dip = L.sink * 6 + Math.sin(t * 1.2 + L.phase) * 0.9;
  }
}

// --- the capstan ------------------------------------------------------------------
//
// She opens the gate by pushing the bar round, which is something a child can
// plainly do and which gives back something the whole way: the bar turns under
// her hands, the gate climbs, the water starts to find its way beneath it.
// Three turns. It holds wherever she leaves it, so stopping costs nothing, and
// walking round the other way unwinds it, because that is what a capstan does.

let lastAngle = null;

/** Call every frame with where she is. True on the turn that opens the gate. */
export function windCapstan(x, y, moving) {
  const d = Math.hypot(x - CAPSTAN.x, y - CAPSTAN.y);
  if (d > CAPSTAN.r + 34 || d < 12 || !moving) { lastAngle = null; return false; }
  const a = Math.atan2(y - CAPSTAN.y, x - CAPSTAN.x);
  if (lastAngle === null) { lastAngle = a; return false; }
  let da = a - lastAngle;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  lastAngle = a;
  if (Math.abs(da) > 0.6) return false;             // she jumped across, not pushed
  const full = CAPSTAN.need * TAU;
  const before = CAPSTAN.wound;
  CAPSTAN.wound = Math.max(0, Math.min(full, CAPSTAN.wound + da));
  CAPSTAN.turns = CAPSTAN.wound / TAU;
  return before < full && CAPSTAN.wound >= full;
}
export const gateOpen = () => CAPSTAN.wound >= CAPSTAN.need * TAU;
/** 0..1, how far up the gate has come. */
export const gateLift = () => CAPSTAN.wound / (CAPSTAN.need * TAU);

// --- drawing ---------------------------------------------------------------------

/** Under the water: the deep lens reads darker, and the root lies along it. */
export function drawDeep(ctx, t, drained) {
  if (!drained) {
    const g = ctx.createRadialGradient(POOL.x, POOL.y, POOL.rx * 0.2, POOL.x, POOL.y, POOL.rx * SHELF);
    g.addColorStop(0, 'rgba(6,20,34,0.5)');
    g.addColorStop(0.74, 'rgba(8,24,38,0.38)');
    g.addColorStop(1, 'rgba(10,28,42,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(POOL.x, POOL.y, POOL.rx * SHELF, POOL.ry * SHELF, 0, 0, TAU);
    ctx.fill();
  }
  // The Great Root, the whole length of the hollow. It is under every jump she
  // makes, and when the water goes it is the thing that comes up out of it.
  ctx.save();
  ctx.globalAlpha = drained ? 0.95 : 0.3;
  ctx.strokeStyle = drained ? '#7a5533' : '#2b3838';
  ctx.lineWidth = drained ? 44 : 36;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ROOT_LINE[0][0], ROOT_LINE[0][1]);
  for (let i = 1; i < ROOT_LINE.length; i++) {
    const p = ROOT_LINE[i - 1], q = ROOT_LINE[i];
    ctx.quadraticCurveTo(p[0] + (q[0] - p[0]) * 0.5, p[1] + (q[1] - p[1]) * 0.5 + 26, q[0], q[1]);
  }
  ctx.stroke();
  if (drained) {
    ctx.strokeStyle = 'rgba(255,196,130,0.45)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  ctx.restore();
}

/** The sandbars and the hummock. */
export function drawIsles(ctx, t) {
  for (const i of ISLES) {
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath(); ctx.ellipse(i.x + 7, i.y + 10, i.rx * 1.02, i.ry * 0.86, 0, 0, TAU); ctx.fill();
    if (i.kind === 'stone') {
      ctx.fillStyle = '#6a6358';
      ctx.beginPath(); ctx.ellipse(i.x, i.y, i.rx, i.ry * 0.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7b7365';
      ctx.beginPath(); ctx.ellipse(i.x - 14, i.y - 18, i.rx * 0.82, i.ry * 0.68, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#55604a';
      ctx.beginPath(); ctx.ellipse(i.x - 30, i.y - 34, i.rx * 0.5, i.ry * 0.36, 0.3, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#9c8a63';
      ctx.beginPath(); ctx.ellipse(i.x, i.y, i.rx, i.ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b09b70';
      ctx.beginPath(); ctx.ellipse(i.x - 10, i.y - 12, i.rx * 0.78, i.ry * 0.7, 0, 0, TAU); ctx.fill();
      // Reeds round the edge, so a sandbar is somewhere to stand and not a disc.
      ctx.strokeStyle = '#5f6b3e'; ctx.lineWidth = 1.8;
      for (let k = 0; k < 26; k++) {
        const a = (k / 26) * TAU;
        const rx = i.x + Math.cos(a) * i.rx * 0.94, ry = i.y + Math.sin(a) * i.ry * 0.94;
        const h = 16 + ((k * 7) % 5) * 7;
        const lean = Math.sin(t * 0.9 + k) * 4;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(rx + lean * 0.5, ry - h * 0.6, rx + lean, ry - h);
        ctx.stroke();
      }
    }
  }
}

/** The sluice: two cut stones, the gate between them, and the capstan beside it. */
export function drawSluice(ctx, t, drained) {
  const lift = gateLift();
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#8a8172';
    ctx.fillRect(GATE.x - 10, GATE.y + s * 62 - 18, 56, 36);
    ctx.fillStyle = '#6d6558';
    ctx.fillRect(GATE.x - 10, GATE.y + s * 62 + 10, 56, 8);
  }
  const up = lift * (GATE.h - 14);
  ctx.fillStyle = '#3c3a32';
  ctx.fillRect(GATE.x - 4, GATE.y - GATE.h / 2 - up, GATE.w, GATE.h);
  ctx.strokeStyle = '#26241f'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = GATE.y - GATE.h / 2 - up + 14 + i * 22;
    ctx.beginPath(); ctx.moveTo(GATE.x - 4, yy); ctx.lineTo(GATE.x + GATE.w - 4, yy); ctx.stroke();
  }
  // Water finding its way under it the moment there is any gap at all.
  if (lift > 0.02 && !drained) {
    ctx.strokeStyle = `rgba(178,214,226,${0.2 + lift * 0.5})`;
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) {
      const yy = GATE.y + 26 - i * 15;
      ctx.beginPath();
      ctx.moveTo(GATE.x + GATE.w - 4, yy);
      ctx.quadraticCurveTo(GATE.x + 34, yy + Math.sin(t * 4 + i) * 4, GATE.x + 62 + lift * 30, yy + 10);
      ctx.stroke();
    }
  }
  if (drained) {
    ctx.strokeStyle = 'rgba(178,214,226,0.65)'; ctx.lineWidth = 3.4;
    for (let i = 0; i < 6; i++) {
      const yy = GATE.y - 34 + i * 14;
      ctx.beginPath();
      ctx.moveTo(GATE.x + 8, yy);
      ctx.quadraticCurveTo(GATE.x + 44, yy + Math.sin(t * 3 + i) * 6, GATE.x + 90, yy + 8);
      ctx.stroke();
    }
  }

  // THE CAPSTAN: a drum with a bar across it, and the bar turns as she pushes.
  const C = CAPSTAN;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(C.x + 5, C.y + 8, 30, 16, 0, 0, TAU); ctx.fill();
  if (!gateOpen()) {                          // the ring she walks
    ctx.strokeStyle = 'rgba(255,214,150,0.17)';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 11]);
    ctx.beginPath(); ctx.ellipse(C.x, C.y, C.r, C.r * 0.62, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.translate(C.x, C.y);
  for (const k of [0, 1]) {
    const b = C.wound + k * Math.PI;
    ctx.strokeStyle = '#7b6a52'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(Math.cos(b) * 46, Math.sin(b) * 28 - 6);
    ctx.stroke();
    ctx.strokeStyle = '#96836a'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(Math.cos(b) * 46, Math.sin(b) * 28 - 8);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#5f5340';
  ctx.beginPath(); ctx.ellipse(0, 0, 17, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7b6a52';
  ctx.beginPath(); ctx.ellipse(0, -7, 17, 13, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a4033'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, -7, 17, 13, 0, 0, TAU); ctx.stroke();
  ctx.restore();

  if (!gateOpen()) {                          // how far round she has got
    for (let i = 0; i < C.need; i++) {
      const part = Math.max(0, Math.min(1, C.turns - i));
      ctx.fillStyle = part >= 1 ? 'rgba(255,196,120,0.95)' : `rgba(255,196,120,${0.18 + part * 0.6})`;
      ctx.beginPath(); ctx.arc(C.x - 18 + i * 18, C.y - 44, 4.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,28,16,0.7)'; ctx.lineWidth = 1.3; ctx.stroke();
    }
  }
}

/** The floating leaves, over the water and under her. */
export function drawLeaves(ctx, t, drained) {
  for (const L of LEAVES) {
    const y = L.y + L.dip;
    ctx.fillStyle = `rgba(8,22,34,${0.28 + L.sink * 0.24})`;
    ctx.beginPath();
    ctx.ellipse(L.x + 3, y + 6, L.r * 0.98, L.r * 0.5, 0, 0, TAU);
    ctx.fill();
    const tilt = Math.sin(t * 0.8 + L.phase) * 0.06 + (L.ax ? 0.08 : 0);
    ctx.save();
    ctx.translate(L.x, y);
    ctx.rotate(tilt);
    const g = ctx.createLinearGradient(-L.r, 0, L.r, 0);
    g.addColorStop(0, L.sink > 0.5 ? '#4a5c33' : '#a8761f');
    g.addColorStop(0.5, L.sink > 0.5 ? '#5d7340' : '#c9903a');
    g.addColorStop(1, '#8a5f22');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, L.r, L.r * 0.62, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(58,40,16,0.6)';
    ctx.lineWidth = L.ferry ? 2.6 : 1.6;
    ctx.stroke();
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
    ctx.fillStyle = drained ? 'rgba(60,52,36,0.5)' : 'rgba(10,24,38,0.5)';
    ctx.beginPath();
    ctx.moveTo(-L.r, 0);
    ctx.lineTo(-L.r * 0.5, -L.r * 0.15);
    ctx.lineTo(-L.r * 0.5, L.r * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The ferry is marked with a curl of current, so it reads as the thing that
    // moves before she has stood and watched it move.
    if (L.ferry && !drained) {
      ctx.strokeStyle = 'rgba(190,224,232,0.38)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const r = L.r * (1.25 + i * 0.22), ph = t * 0.6 + i * 1.1;
        ctx.beginPath();
        ctx.ellipse(L.x, y, r, r * 0.5, 0, ph, ph + 1.9);
        ctx.stroke();
      }
    }
    if (L.sink > 0.45) {
      ctx.strokeStyle = `rgba(190,224,232,${(L.sink - 0.45) * 0.8})`;
      ctx.lineWidth = 2;
      const k = 1 + (L.sink - 0.45) * 0.5;
      ctx.beginPath();
      ctx.ellipse(L.x, y, L.r * k, L.r * 0.52 * k, 0, 0, TAU);
      ctx.stroke();
    }
  }
}
