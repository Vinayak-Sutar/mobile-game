// THE DROWNED COURSE — a river, and a long way up it.
//
// Two versions of this have been a LAKE, and a lake is the wrong shape. A lake
// has a rim, and a rim can be walked round, so the crossing is optional; and a
// lake is crossed in a straight line, so it is over in three jumps. Both of
// those complaints were made and both were right.
//
// This is a river. Two and a half thousand units from its mouth in the
// south-west up to the sluice pool in the north-east, walled the whole way by
// rock she cannot climb. One way in, one way on. You do not cross this, you go
// UP it, and going up it is a minute of jumping.
//
// The old one also drew the Great Root as a fat brown line lying across the
// water, which reads as a walkway and is not one - you could stand on the bank
// and see a road that went nowhere. It is sunk deep and blurred now, and it
// does not come up until the water goes.
//
// FIVE REACHES:
//
//   THE MOUTH    wade in off the valley floor. Four broad leaves, short hops,
//                up the middle. The jump, and nothing else.
//   THE NARROWS  the walls close and the leaves go to alternate sides, so she
//                zigzags. Two of them SWING across the current on a slow beat
//                and she waits for them to come to her side.
//   THE EDDY     the river opens into a bowl and three leaves turn round the
//                whirl. Step on, ride round, step off at the top. Then one gap
//                of a hundred and forty, which wants the dash.
//   THE RACE     narrow and quick. Two ferries running with the current: catch
//                one, ride it up, step across to the next.
//   THE POOL     the sluice, and the capstan that raises it.
//
// Platforms are authored in RIVER COORDINATES - s along the course, v across it
// - so they cannot land on the bank by accident and the whole chain moves when
// the river does. savi/tools/check-level.mjs walks it in world space and
// asserts every gap, every wait, and that the walls leave no way round.

const TAU = Math.PI * 2;

/** The course, from the mouth up to the pool. */
export const COURSE = [
  [3000, 2980], [3300, 2900], [3560, 2740], [3720, 2520], [3980, 2440],
  [4260, 2520], [4440, 2330], [4520, 2080], [4680, 1900], [4860, 1760],
  [4900, 1560], [4760, 1380], [4520, 1290],
];
export const WATER_W = 156;      // half-width of the water
export const WALL_W = 230;       // and the rock either side. Thick, because the
                                 // outside of a bend stretches and a thin band leaks.
const MOUTH = 150;               // wadeable this far in, so she can get wet first

// --- river coordinates ----------------------------------------------------------

const SEG = [];
let LEN = 0;
for (let i = 1; i < COURSE.length; i++) {
  const a = COURSE[i - 1], b = COURSE[i];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  SEG.push({ a, dx: dx / len, dy: dy / len, len, s0: LEN });
  LEN += len;
}
export const COURSE_LEN = LEN;

/** A point `s` along the course, `v` across it. */
export function atRiver(s, v = 0) {
  s = Math.max(0, Math.min(LEN, s));
  let g = SEG[SEG.length - 1];
  for (const q of SEG) if (s <= q.s0 + q.len) { g = q; break; }
  const k = s - g.s0;
  return [g.a[0] + g.dx * k - g.dy * v, g.a[1] + g.dy * k + g.dx * v];
}

/** Where a world point sits on the river: how far along, how far off centre. */
export function riverAt(x, y) {
  let bs = 0, bd = 1e9;
  for (const g of SEG) {
    const k = Math.max(0, Math.min(g.len, (x - g.a[0]) * g.dx + (y - g.a[1]) * g.dy));
    const d = Math.hypot(x - (g.a[0] + g.dx * k), y - (g.a[1] + g.dy * k));
    if (d < bd) { bd = d; bs = g.s0 + k; }
  }
  return { s: bs, d: bd };
}

/** How wide the water is along the course: the eddy and the pool bulge out. */
export function widthAt(s) {
  let w = WATER_W;
  w += Math.max(0, 1 - Math.abs(s - 1590) / 280) * 152;     // the eddy
  w += Math.max(0, 1 - Math.abs(s - LEN) / 340) * 140;      // the pool at the head
  w -= Math.max(0, 1 - Math.abs(s - 2300) / 210) * 44;      // the race narrows
  return w;
}

export const inWater = (x, y) => { const r = riverAt(x, y); return r.d < widthAt(r.s); };
/** Rock she cannot walk through. This is what makes it a river and not a lake. */
export function inWall(x, y) {
  const r = riverAt(x, y);
  const w = widthAt(r.s);
  return r.d >= w && r.d < w + WALL_W && r.s > 30 && r.s < LEN - 30;
}
/** Wadeable: the mouth, and a hand's width along each bank. */
export function inShallow(x, y) {
  const r = riverAt(x, y);
  return r.s < MOUTH || r.d > widthAt(r.s) - 28;
}

// --- the platforms ----------------------------------------------------------------
//
//   leaf   broad and still
//   swing  swings across the current, so she waits for her own side
//   ferry  runs along the current, so she rides it up the river
//   eddy   turns slowly round the whirl in the wide bowl
//   stone  solid rock, somewhere to stand and think

function P(s, v, r, kind, o = {}) {
  return {
    s0: s, v0: v, s, v, r, kind,
    amp: o.amp || 0, rate: o.rate || 0.5, phase: o.phase || 0,
    x: 0, y: 0, dx: 0, dy: 0, sink: 0, dip: 0, solid: kind === 'stone',
  };
}

export const PLATFORMS = [
  // THE MOUTH — four broad leaves up the middle, short hops.
  P(250, 0, 58, 'leaf'),
  P(408, -48, 58, 'leaf'),
  P(566, 42, 58, 'leaf'),
  P(724, -30, 58, 'leaf'),
  P(880, 0, 76, 'stone'),

  // THE NARROWS — alternate banks, and two that swing across to meet her.
  P(1036, -76, 52, 'leaf'),
  P(1180, 72, 52, 'swing', { amp: 80, rate: 0.95 }),
  P(1318, -72, 52, 'leaf'),
  P(1452, 68, 52, 'swing', { amp: 80, rate: 0.95, phase: Math.PI }),

  // THE EDDY — three leaves turning round the whirl in the wide bowl.
  //
  // They orbit LOCKED TOGETHER at the same rate, so the gap between one and the
  // next never changes in a way she can wait out: whatever it is, it is what it
  // is, all the way round. It used to swing between 85 and 133, and 133 is past
  // a jump - so a third of the way round the whirl the next leaf was simply out
  // of reach with nothing to do about it but fall in. A tighter orbit and
  // broader leaves keep every step of it a hop at every phase.
  P(1590, 0, 60, 'eddy', { amp: 100, rate: 0.7 }),
  P(1590, 0, 60, 'eddy', { amp: 100, rate: 0.7, phase: TAU / 3 }),
  P(1590, 0, 60, 'eddy', { amp: 100, rate: 0.7, phase: (TAU * 2) / 3 }),
  P(1830, 0, 80, 'stone'),

  // ...and out of the bowl, the one gap that wants the dash.
  P(2090, -44, 50, 'leaf'),

  // THE RACE — narrow and quick, two ferries running the current.
  P(2270, 54, 54, 'ferry', { amp: 118, rate: 0.85 }),
  P(2460, -50, 54, 'leaf'),
  P(2630, 48, 54, 'ferry', { amp: 114, rate: 0.85, phase: Math.PI }),
  P(2810, -40, 56, 'leaf'),

  // THE LAST BEND — the gorge turns back on itself under the pool, and the
  // water is quick here, so it is one more swing and two hops to the shelf.
  P(2950, 56, 54, 'swing', { amp: 80, rate: 0.95, phase: 1.1 }),
  P(3090, -46, 56, 'leaf'),
  P(3230, 34, 58, 'leaf'),
];

/** Every platform's world position, and how far it moved this frame. */
export function placePlatforms(t) {
  for (const p of PLATFORMS) {
    const k = Math.sin(t * p.rate + p.phase);
    if (p.kind === 'swing') p.v = p.v0 + p.amp * k;
    else if (p.kind === 'ferry') p.s = p.s0 + p.amp * k;
    else if (p.kind === 'eddy') {
      const a = t * p.rate + p.phase;
      p.s = p.s0 + Math.cos(a) * p.amp;
      p.v = Math.sin(a) * p.amp * 0.86;
    }
    const [x, y] = atRiver(p.s, p.v);
    p.dx = p.x ? x - p.x : 0;
    p.dy = p.y ? y - p.y : 0;
    p.x = x; p.y = y;
  }
}
placePlatforms(0);
for (const p of PLATFORMS) { p.dx = 0; p.dy = 0; }

/** Where the root comes up when the water goes. */
export const ROOT_AT = atRiver(COURSE_LEN - 170, 0);

/** The capstan on the shelf at the head, and the gate it lifts. */
const capAt = atRiver(COURSE_LEN - 40, 196);
export const CAPSTAN = { x: capAt[0], y: capAt[1], r: 54, turns: 0, need: 3, wound: 0 };
const gateAt = atRiver(COURSE_LEN, 0);
export const GATE = { x: gateAt[0], y: gateAt[1] - 30, w: 28, h: 100 };

/** Solid ground in the river: the stones, and the capstan's shelf. */
export function onSolid(x, y) {
  for (const p of PLATFORMS) {
    if (p.solid && Math.hypot(x - p.x, y - p.y) < p.r) return p;
  }
  if (Math.hypot(x - CAPSTAN.x, y - CAPSTAN.y) < 118) return CAPSTAN;
  return null;
}

/** The leaf she is over, allowing for how far it is riding down. */
export function leafAt(x, y) {
  for (const p of PLATFORMS) {
    if (p.solid || p.sink >= 1) continue;
    if (Math.hypot(x - p.x, y - (p.y + p.dip)) < p.r * 0.96) return p;
  }
  return null;
}

export function stepShallows(dt, t, standing) {
  placePlatforms(t);
  for (const p of PLATFORMS) {
    if (p.solid) continue;
    // The ferries and the eddy leaves barely sink — they have to carry her.
    const rate = p.kind === 'leaf' || p.kind === 'swing' ? 0.13 : 0.04;
    if (p === standing) p.sink = Math.min(1, p.sink + dt * rate);
    else p.sink = Math.max(0, p.sink - dt * 0.8);
    p.dip = p.sink * 6 + Math.sin(t * 1.2 + p.phase) * 0.9;
  }
}

// --- the capstan -------------------------------------------------------------------

let lastAngle = null;
export function windCapstan(x, y, moving) {
  const d = Math.hypot(x - CAPSTAN.x, y - CAPSTAN.y);
  if (d > CAPSTAN.r + 34 || d < 12 || !moving) { lastAngle = null; return false; }
  const a = Math.atan2(y - CAPSTAN.y, x - CAPSTAN.x);
  if (lastAngle === null) { lastAngle = a; return false; }
  let da = a - lastAngle;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  lastAngle = a;
  if (Math.abs(da) > 0.6) return false;
  const full = CAPSTAN.need * TAU;
  const before = CAPSTAN.wound;
  CAPSTAN.wound = Math.max(0, Math.min(full, CAPSTAN.wound + da));
  CAPSTAN.turns = CAPSTAN.wound / TAU;
  return before < full && CAPSTAN.wound >= full;
}
export const gateOpen = () => CAPSTAN.wound >= CAPSTAN.need * TAU;
export const gateLift = () => CAPSTAN.wound / (CAPSTAN.need * TAU);

// --- drawing -------------------------------------------------------------------------

/** Where she may walk into the gorge, and where the mark goes until she has. */
export const MOUTH_AT = atRiver(40, 0);
export const inGorge = (x, y) => { const r = riverAt(x, y); return r.d < widthAt(r.s) + WALL_W * 0.6; };

/**
 * THE CLIFFS, which are the whole reason this is a river and not a lake.
 *
 * inWall() has always stopped her walking in, but the ground there was painted
 * as flat rock - so it looked exactly like somewhere you could walk, and being
 * stopped read as the game being broken rather than as a drop. Nothing about it
 * said "cliff", so of course she kept trying to get in at the side.
 *
 * So the rim is drawn: a lit top edge where it catches the light from the upper
 * left, a dark face falling away below it, a shadow thrown out over the water,
 * and scree along the top. And the ONE GAP in it is the mouth, at the bottom,
 * with a worn path going down - so where to get in is a thing you can see
 * rather than a thing you have to be told.
 */
export function drawCliffs(ctx, t, cam, view) {
  const S0 = 130;                       // the mouth is left open this far in
  for (const side of [-1, 1]) {
    // The lip, as a polyline along the rim.
    const lip = [];
    for (let s2 = S0; s2 <= COURSE_LEN - 40; s2 += 30) lip.push(atRiver(s2, side * widthAt(s2)));
    if (lip.length < 2) continue;
    const out = [];
    for (let i = 0; i < lip.length; i++) {
      const s2 = S0 + i * 30;
      out.push(atRiver(s2, side * (widthAt(s2) + WALL_W)));
    }
    // Is any of it on screen? The whole gorge is long and mostly is not.
    let seen = false;
    for (const p of lip) {
      if (p[0] > cam.x - 240 && p[0] < cam.x + view.w + 240 && p[1] > cam.y - 240 && p[1] < cam.y + view.h + 240) { seen = true; break; }
    }
    if (!seen) continue;

    // The shadow the wall throws out over the water.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lip[0][0], lip[0][1]);
    for (const p of lip) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = 'rgba(6,14,22,0.42)';
    ctx.lineWidth = 34;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.translate(side * -10, -8);
    ctx.stroke();
    ctx.restore();

    // The face: from the lip out to the foot of the wall.
    ctx.beginPath();
    ctx.moveTo(lip[0][0], lip[0][1]);
    for (const p of lip) ctx.lineTo(p[0], p[1]);
    for (let i = out.length - 1; i >= 0; i--) ctx.lineTo(out[i][0], out[i][1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -200, 0, 200);
    g.addColorStop(0, '#3a3630');
    g.addColorStop(1, '#22201c');
    ctx.fillStyle = g;
    ctx.fill();
    // Its grain: cracks running down the face.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(12,10,8,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < lip.length; i += 2) {
      const a = lip[i], b = out[i];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[0] + (b[0] - a[0]) * (0.5 + ((i * 7) % 5) * 0.09), a[1] + (b[1] - a[1]) * (0.55 + ((i * 3) % 4) * 0.1));
      ctx.stroke();
    }
    ctx.restore();

    // The lit top edge, which is what makes it read as a DROP and not a stripe.
    ctx.beginPath();
    ctx.moveTo(lip[0][0], lip[0][1]);
    for (const p of lip) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = '#8b8377';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,206,186,0.55)';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Scree and boulders along the top, so the edge is not a drawn line.
    for (let i = 0; i < lip.length; i += 3) {
      const s2 = S0 + i * 30;
      const p = atRiver(s2, side * (widthAt(s2) + 22 + ((i * 11) % 5) * 9));
      if (p[0] < cam.x - 80 || p[0] > cam.x + view.w + 80) continue;
      const r = 9 + ((i * 13) % 7) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(p[0] + 4, p[1] + 5, r, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = i % 3 ? '#6e675c' : '#7d7568';
      ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * 0.72, i, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(222,214,196,0.28)';
      ctx.beginPath(); ctx.ellipse(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.42, r * 0.26, i, 0, TAU); ctx.fill();
    }
  }

  // THE MOUTH: the one way in, and it should look like one. A worn path going
  // down to the water between two posts, in the same grammar as the torana at
  // the valley gate.
  const m = atRiver(70, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(150,132,104,0.5)';
  ctx.lineWidth = 46;
  ctx.lineCap = 'round';
  ctx.setLineDash([26, 20]);
  ctx.beginPath();
  const back = atRiver(0, 0);
  ctx.moveTo(back[0] - 120, back[1] + 90);
  ctx.lineTo(m[0], m[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  for (const side of [-1, 1]) {
    const p = atRiver(60, side * (widthAt(60) + 30));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p[0] + 4, p[1] + 6, 13, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7b6a52';
    ctx.fillRect(p[0] - 7, p[1] - 54, 14, 56);
    ctx.fillStyle = '#96836a';
    ctx.fillRect(p[0] - 7, p[1] - 54, 5, 56);
    ctx.fillStyle = '#5f5340';
    for (let i = 0; i < 3; i++) ctx.fillRect(p[0] - 9, p[1] - 46 + i * 16, 18, 4);
  }
}

/** The current, as streaks running up the channel, so the river is going somewhere. */
export function drawCurrent(ctx, t, drained, cam, view) {
  if (drained) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(180,214,228,0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 110; i++) {
    const s = (i * 149 + t * 44) % COURSE_LEN;
    const w = widthAt(s);
    const v = (((i * 61) % 200) - 100) * (w / WATER_W) * 0.86;
    const [x, y] = atRiver(s, v);
    if (x < cam.x - 40 || x > cam.x + view.w + 40 || y < cam.y - 40 || y > cam.y + view.h + 40) continue;
    const [x2, y2] = atRiver(s + 26, v);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}

/** The Great Root, sunk deep. Dim and edgeless until the water goes. */
export function drawRootBed(ctx, t, drained) {
  ctx.save();
  if (!drained) {
    // It must NOT look like something she can walk on. It used to be a fat
    // brown line on the water, which reads as a road, and she would walk to the
    // bank, see it, and find it went nowhere.
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#1e2a2c';
    ctx.lineWidth = 56;
    ctx.filter = 'blur(7px)';
  } else {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#7a5533';
    ctx.lineWidth = 46;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let s = 40; s <= COURSE_LEN - 40; s += 60) {
    const [x, y] = atRiver(s, Math.sin(s * 0.004) * 42);
    if (s === 40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.filter = 'none';
  if (drained) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(255,196,130,0.6)';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();
}

function leafFace(ctx, p, t, drained) {
  const y = p.y + p.dip;
  ctx.fillStyle = `rgba(8,22,34,${0.26 + p.sink * 0.24})`;
  ctx.beginPath(); ctx.ellipse(p.x + 3, y + 6, p.r * 0.98, p.r * 0.5, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(p.x, y);
  ctx.rotate(Math.sin(t * 0.8 + p.phase) * 0.06);
  const g = ctx.createLinearGradient(-p.r, 0, p.r, 0);
  g.addColorStop(0, p.sink > 0.5 ? '#4a5c33' : '#a8761f');
  g.addColorStop(0.5, p.sink > 0.5 ? '#5d7340' : '#c9903a');
  g.addColorStop(1, '#8a5f22');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(58,40,16,0.6)';
  ctx.lineWidth = p.kind === 'leaf' ? 1.8 : 2.6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(86,60,22,0.5)';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-p.r * 0.82, 0); ctx.lineTo(p.r * 0.82, 0); ctx.stroke();
  ctx.lineWidth = 1.1;
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    const vx = i * p.r * 0.22;
    ctx.beginPath();
    ctx.moveTo(vx, 0); ctx.lineTo(vx + p.r * 0.12, -p.r * 0.46);
    ctx.moveTo(vx, 0); ctx.lineTo(vx + p.r * 0.12, p.r * 0.46);
    ctx.stroke();
  }
  ctx.fillStyle = drained ? 'rgba(60,52,36,0.5)' : 'rgba(10,24,38,0.5)';
  ctx.beginPath();
  ctx.moveTo(-p.r, 0); ctx.lineTo(-p.r * 0.5, -p.r * 0.15); ctx.lineTo(-p.r * 0.5, p.r * 0.15);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Every platform. Anything that moves is marked, so she knows before she waits. */
export function drawPlatforms(ctx, t, drained) {
  for (const p of PLATFORMS) {
    if (p.solid) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 9, p.r * 1.02, p.r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a6358';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.78, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7b7365';
      ctx.beginPath(); ctx.ellipse(p.x - 8, p.y - 10, p.r * 0.8, p.r * 0.58, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#55604a';
      ctx.beginPath(); ctx.ellipse(p.x - 18, p.y - 20, p.r * 0.44, p.r * 0.3, 0.3, 0, TAU); ctx.fill();
      continue;
    }
    if (!drained && p.kind !== 'leaf') {
      ctx.strokeStyle = p.kind === 'ferry' ? 'rgba(190,224,232,0.42)' : 'rgba(228,198,150,0.38)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const r = p.r * (1.2 + i * 0.2), ph = t * 0.7 + i * 1.1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + p.dip, r, r * 0.5, 0, ph, ph + 1.8);
        ctx.stroke();
      }
    }
    leafFace(ctx, p, t, drained);
    if (p.sink > 0.45) {
      ctx.strokeStyle = `rgba(190,224,232,${(p.sink - 0.45) * 0.8})`;
      ctx.lineWidth = 2;
      const k = 1 + (p.sink - 0.45) * 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.dip, p.r * k, p.r * 0.52 * k, 0, 0, TAU);
      ctx.stroke();
    }
  }
}

/** The sluice at the head, and the capstan that lifts it. */
export function drawSluice(ctx, t, drained) {
  const lift = gateLift();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(CAPSTAN.x + 7, CAPSTAN.y + 10, 126, 82, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a6358';
  ctx.beginPath(); ctx.ellipse(CAPSTAN.x, CAPSTAN.y, 120, 78, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7b7365';
  ctx.beginPath(); ctx.ellipse(CAPSTAN.x - 12, CAPSTAN.y - 14, 98, 60, 0, 0, TAU); ctx.fill();

  for (const sgn of [-1, 1]) {
    ctx.fillStyle = '#8a8172';
    ctx.fillRect(GATE.x - 12, GATE.y + sgn * 64 - 18, 60, 36);
    ctx.fillStyle = '#6d6558';
    ctx.fillRect(GATE.x - 12, GATE.y + sgn * 64 + 10, 60, 8);
  }
  const up = lift * (GATE.h - 14);
  ctx.fillStyle = '#3c3a32';
  ctx.fillRect(GATE.x - 4, GATE.y - GATE.h / 2 - up, GATE.w, GATE.h);
  ctx.strokeStyle = '#26241f'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = GATE.y - GATE.h / 2 - up + 14 + i * 22;
    ctx.beginPath(); ctx.moveTo(GATE.x - 4, yy); ctx.lineTo(GATE.x + GATE.w - 4, yy); ctx.stroke();
  }
  if (lift > 0.02) {
    ctx.strokeStyle = `rgba(178,214,226,${0.2 + lift * 0.5})`;
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 5; i++) {
      const yy = GATE.y + 28 - i * 14;
      ctx.beginPath();
      ctx.moveTo(GATE.x + GATE.w - 4, yy);
      ctx.quadraticCurveTo(GATE.x + 36, yy + Math.sin(t * 4 + i) * 4, GATE.x + 70 + lift * 30, yy + 10);
      ctx.stroke();
    }
  }

  // THE CHAIN FROM THE DRUM TO THE GATE, which is the whole of why this was
  // dull. You were being asked to walk in a circle here for something that
  // happens a hundred units away, with nothing at all joining the two - so
  // there was no reason to think the wheel had anything to do with the water.
  // Now the chain runs from the drum to the head of the gate in plain sight,
  // its links crawl along it as she turns, the slack comes out of it, and the
  // gate rises on the end of it. Nobody has to be told what the wheel is for.
  const C = CAPSTAN;
  {
    const gx = GATE.x + GATE.w / 2;
    const gy = GATE.y - GATE.h / 2 - lift * (GATE.h - 14);
    const sag = (1 - lift) * 30;
    const mx = (C.x + gx) / 2, my = (C.y + gy) / 2 + sag;
    ctx.strokeStyle = '#413b33';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(C.x, C.y - 12);
    ctx.quadraticCurveTo(mx, my, gx, gy);
    ctx.stroke();
    // The links, sliding along as she winds.
    const n = 16;
    for (let i = 0; i < n; i++) {
      const u = ((i + (C.wound * 0.6) % 1) / n);
      const ax = C.x + (mx - C.x) * u, ay = (C.y - 12) + (my - (C.y - 12)) * u;
      const bx = mx + (gx - mx) * u, by = my + (gy - my) * u;
      const x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
      ctx.fillStyle = i % 2 ? '#9a8e7c' : '#6a6154';
      ctx.beginPath(); ctx.ellipse(x, y, 4.6, 3.2, 0, 0, TAU); ctx.fill();
    }
  }

  if (!gateOpen()) {
    // THE RING SHE WALKS, AND WHICH WAY ROUND. A dashed circle is not an
    // instruction. An arrow going round one is.
    const spin = t * 1.1;
    ctx.strokeStyle = 'rgba(255,214,150,0.2)';
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.ellipse(C.x, C.y, C.r, C.r * 0.62, 0, 0, TAU); ctx.stroke();
    // Footprints lighting up in order round it, the way she would walk them.
    for (let i = 0; i < 10; i++) {
      const a2 = (i / 10) * TAU;
      const k = (Math.sin(spin - a2) + 1) / 2;
      ctx.fillStyle = `rgba(255,226,182,${0.1 + k * 0.5})`;
      ctx.save();
      ctx.translate(C.x + Math.cos(a2) * C.r, C.y + Math.sin(a2) * C.r * 0.62);
      ctx.rotate(a2 + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 7.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // And two arrows running the ring, so the direction is unmistakable.
    for (let h = 0; h < 2; h++) {
      const a2 = spin + h * Math.PI;
      ctx.save();
      ctx.translate(C.x + Math.cos(a2) * C.r, C.y + Math.sin(a2) * C.r * 0.62);
      ctx.rotate(Math.atan2(Math.cos(a2) * 0.62, -Math.sin(a2)));
      ctx.fillStyle = 'rgba(255,200,120,0.95)';
      ctx.beginPath();
      ctx.moveTo(13, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(50,30,12,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }
    // How far round she has got, drawn ON the ring she is walking rather than
    // on three little pips off to one side of it.
    ctx.strokeStyle = 'rgba(255,196,120,0.92)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(C.x, C.y, C.r, C.r * 0.62, 0, -Math.PI / 2, -Math.PI / 2 + TAU * lift);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(C.x + 5, C.y + 8, 30, 16, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(C.x, C.y);
  // A little creak of movement while it waits, so it looks willing rather than
  // like scenery.
  const idle = gateOpen() ? 0 : Math.sin(t * 1.5) * 0.035;
  for (const k of [0, 1]) {
    const b = C.wound + idle + k * Math.PI;
    const ex = Math.cos(b) * 48, ey = Math.sin(b) * 29;
    ctx.strokeStyle = '#7b6a52'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(ex, ey - 6); ctx.stroke();
    ctx.strokeStyle = '#96836a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(ex, ey - 8); ctx.stroke();
    // The grips at the ends, worn pale by however many hands came before hers.
    ctx.fillStyle = '#b3a189';
    ctx.beginPath(); ctx.ellipse(ex, ey - 8, 6.5, 5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4a4033'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(ex, ey - 8, 6.5, 5, 0, 0, TAU); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#5f5340';
  ctx.beginPath(); ctx.ellipse(0, 0, 17, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7b6a52';
  ctx.beginPath(); ctx.ellipse(0, -7, 17, 13, 0, 0, TAU); ctx.fill();
  // Rope coiled on the drum, and there is more of it the further she has wound.
  ctx.strokeStyle = '#8d8272';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3 + Math.round(lift * 5); i++) {
    ctx.beginPath();
    ctx.ellipse(0, -7 + i * 1.3, 15 - i * 0.6, 11 - i * 0.45, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4a4033'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, -7, 17, 13, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
