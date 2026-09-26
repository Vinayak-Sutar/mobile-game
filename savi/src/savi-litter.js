// LEAVES ON THE GROUND, AND LEAVES IN THE AIR.
//
// The litter was glittering. Not shimmering artistically - flickering, because
// of two bugs, and no amount of prettier leaf art would have fixed either:
//
//   1. The loose leaves over the depth grid were drawn from every OTHER cell,
//      starting at `(camera.x / CELL) | 0`. Every 14 pixels of camera movement
//      that start index changed parity, so the entire set of leaves on screen
//      swapped for the other half of the cells. Walking flipped every leaf in
//      the valley on and off, several times a second.
//
//   2. The leaves in the air were positioned at `(f(t) % view.w) + camera.x`,
//      which glues them to the SCREEN rather than the world. They slid about
//      with the camera instead of passing by her, and popped every time the
//      modulo wrapped.
//
// So: nothing here is random per frame, and nothing here is positioned
// relative to the camera. A leaf at rest holds perfectly still until something
// moves it. That is the whole of the fix; the rest of this file is making the
// movement good.
//
// HOW OTHER GAMES DO THIS
//
// Nobody simulates a field of fallen leaves as individual rigid bodies. The
// techniques that actually ship are:
//
//   - A DEFORMATION / FLOW MAP. Rise of the Tomb Raider's snow, Uncharted 4's
//     sand, Ghost of Tsushima's fields: a texture around the player records
//     where a body has passed, and the ground layer reads it and displaces.
//     It is cheap, it leaves a trail that persists, and every blade or leaf
//     stays exactly where the map says - no per-object state, no jitter.
//     That is what the field below is, kept on the CPU.
//
//   - FOOTSTEP BURSTS. A few particles kicked on the footfall itself (an
//     animation event, in an engine that has them), tumbling with drag, then
//     gone. Small counts, event-driven. Never a continuous emitter.
//
//   - COHERENT WIND, NOT PER-LEAF NOISE. Foliage shaders sway on
//     `sin(t * f + dot(worldPos, windDir) * k)` - one wave crossing the ground,
//     so the whole surface breathes together. Per-leaf random phase is exactly
//     what reads as "glitter", which is the thing being complained about.
//
//   - MOTION IS INTERMITTENT. Real leaves on the ground do not drift. They sit
//     still, get shoved, skitter a few inches, catch on something and stop.
//     Rest is the default state and movement is the event.
//
//   - FLAT-PLATE TUMBLE for the ones in the air. A leaf is a plate: it turns
//     edge-on and flat again as it falls, so its silhouette narrows to a line
//     and opens out. Rotating a solid ellipse at a constant rate reads as a
//     spinning coin; oscillating its WIDTH reads as a leaf.
//
// All five are here.

const TAU = Math.PI * 2;

// --- the deformation field ------------------------------------------------------
//
// One cell every 22 units, holding how far the leaves in it have been shoved
// and how far they have been turned. Coarse on purpose: it is sampled
// bilinearly, so a body passing through pushes a smooth swathe rather than a
// staircase, and a whole valley of it is a few hundred kilobytes.

const FCELL = 22;
/** How far a leaf can be shoved. Past this it is not a nudge, it is a sweep. */
const MAXD = 13;
/** Displacement up to here just stays. Leaves that have been moved have moved. */
const HOLD = 3.6;

const F = { w: 0, h: 0, dx: null, dy: null, sp: null };

export function initLitter(W, H) {
  F.w = Math.ceil(W / FCELL) + 1;
  F.h = Math.ceil(H / FCELL) + 1;
  F.dx = new Float32Array(F.w * F.h);
  F.dy = new Float32Array(F.w * F.h);
  F.sp = new Float32Array(F.w * F.h);
}

/**
 * Something moved through the leaves at (x, y).
 *
 * `dirx, diry` is the way it was going - leaves are thrown out of the way at
 * right angles to it and dragged a little in its wake, which is what a body
 * walking through deep litter actually does. Pass 0,0 for a plain radial
 * shove: a landing, or a dash setting off.
 *
 * `power` must be scaled by dt at the call site if it is a continuous push.
 */
export function pushLitter(x, y, r, dirx, diry, power) {
  if (!F.dx) return;
  const i0 = Math.max(0, ((x - r) / FCELL) | 0), i1 = Math.min(F.w - 1, ((x + r) / FCELL) | 0);
  const j0 = Math.max(0, ((y - r) / FCELL) | 0), j1 = Math.min(F.h - 1, ((y + r) / FCELL) | 0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cx = i * FCELL, cy = j * FCELL;
      const ox = cx - x, oy = cy - y;
      const d = Math.hypot(ox, oy);
      if (d > r) continue;
      const f = 1 - d / r;
      const push = power * f * f;
      const nx = d > 0.01 ? ox / d : 0, ny = d > 0.01 ? oy / d : 0;
      const q = j * F.w + i;
      // Out of the way, plus a little dragged along behind.
      F.dx[q] += nx * push + dirx * push * 0.3;
      F.dy[q] += ny * push + diry * push * 0.3;
      // And turned, by the side of her that went past them.
      F.sp[q] += (nx * diry - ny * dirx) * push * 0.05;
      const m = Math.hypot(F.dx[q], F.dy[q]);
      if (m > MAXD) { F.dx[q] *= MAXD / m; F.dy[q] *= MAXD / m; }
      if (F.sp[q] > 1.2) F.sp[q] = 1.2;
      if (F.sp[q] < -1.2) F.sp[q] = -1.2;
    }
  }
}

// The field relaxes a row-band at a time, the same way the depth grid heals, so
// the cost is fixed however big the valley is.
let row = 0;
export function settleLitter(dt) {
  if (!F.dx) return;
  const band = 40;
  const k = Math.min(1, 2.2 * dt * (F.h / band));
  for (let n = 0; n < band; n++) {
    const j = (row + n) % F.h;
    for (let i = 0; i < F.w; i++) {
      const q = j * F.w + i;
      const m = Math.hypot(F.dx[q], F.dy[q]);
      if (m < 0.01) continue;
      // Only the big shove settles. What is left is a path through the leaves,
      // and it stays - that is the part worth having.
      if (m > HOLD) {
        const want = HOLD + (m - HOLD) * (1 - k);
        F.dx[q] *= want / m; F.dy[q] *= want / m;
      }
    }
  }
  row = (row + band) % F.h;
}

/** What the field says at this point, bilinear. Writes into `out`. */
export function litterAt(x, y, out) {
  if (!F.dx) { out.dx = 0; out.dy = 0; out.sp = 0; return out; }
  const gx = x / FCELL, gy = y / FCELL;
  let i = gx | 0, j = gy | 0;
  if (i < 0 || j < 0 || i >= F.w - 1 || j >= F.h - 1) { out.dx = 0; out.dy = 0; out.sp = 0; return out; }
  const fx = gx - i, fy = gy - j;
  const a = j * F.w + i, b = a + 1, c = a + F.w, d = c + 1;
  const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
  out.dx = F.dx[a] * w0 + F.dx[b] * w1 + F.dx[c] * w2 + F.dx[d] * w3;
  out.dy = F.dy[a] * w0 + F.dy[b] * w1 + F.dy[c] * w2 + F.dy[d] * w3;
  out.sp = F.sp[a] * w0 + F.sp[b] * w1 + F.sp[c] * w2 + F.sp[d] * w3;
  return out;
}

// --- the breeze -----------------------------------------------------------------
//
// One wave crossing the ground, not a thousand little wobbles. The phase comes
// from the leaf's own position along the wind, so the stir arrives at one side
// of a drift before the other and travels over it. Amplitude is deliberately
// tiny: at rest this should be almost subliminal, the difference between a
// still photograph and a held shot.

const WIND = { x: 0.82, y: 0.58 };
export function breezeAt(t, x, y) {
  const phase = t * 1.15 - (x * WIND.x + y * WIND.y) * 0.004;
  // Gusts: a slow envelope, so the ground is still for a while and then stirs.
  const gust = 0.55 + 0.45 * Math.sin(t * 0.21 + x * 0.0004);
  return Math.sin(phase) * 0.07 * gust;
}

// --- leaves in the air ------------------------------------------------------------

/**
 * A leaf seen flat-on and edge-on as it tumbles. `k` is the tumble phase; at
 * the crossings the leaf is edge-on and almost a line, which is the thing that
 * makes a flat object read as a flat object.
 */
export function drawLeafSprite(ctx, s, k) {
  const edge = Math.abs(Math.sin(k));
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * (0.12 + 0.46 * edge), 0, 0, TAU);
  ctx.fill();
  if (edge > 0.35) {                       // the midrib, when there is a face to see
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = '#6b3f16';
    ctx.stroke();
    ctx.globalAlpha /= 0.5;
  }
}

/**
 * The leaves coming down, in WORLD space. Each one has a fixed drift, and is
 * wrapped into a tile bigger than the view, so the wrap always happens off the
 * edge of the screen and never in front of her. Walking now carries her PAST
 * them instead of dragging them along with her.
 */
export function drawFallingLeaves(ctx, t, camera, view, n, cols) {
  const spanX = view.w + 340, spanY = view.h + 340;
  const x0 = camera.x - 170, y0 = camera.y - 170;
  for (let i = 0; i < n; i++) {
    const sp = 0.4 + ((i * 37) % 13) / 13;
    // Where it would be if the valley went on forever.
    const px = i * 613.7 + t * 26 * sp;
    const py = i * 971.3 + t * 19 * sp;
    // Tumbling, and swaying across its own fall as it turns.
    const k = t * (1.7 + sp) + i;
    const sway = Math.sin(k * 0.55) * 13;
    const x = x0 + (((px + sway - x0) % spanX) + spanX) % spanX;
    const y = y0 + (((py - y0) % spanY) + spanY) % spanY;
    ctx.globalAlpha = 0.5 + 0.22 * Math.abs(Math.sin(k));
    ctx.fillStyle = cols[i & 3];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(19 * sp, 26 * sp) + Math.sin(k * 0.55) * 0.7);
    drawLeafSprite(ctx, 5.2, k);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
